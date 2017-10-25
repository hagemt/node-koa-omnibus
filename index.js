/* eslint-env node */
const Boom = require('boom')
const Bunyan = require('bunyan')
const KoaApplication = require('koa')
const LRU = require('lru-cache')
const UUID = require('uuid')
const _ = require('lodash')

const boundedExecutor = ms => fn => new Promise((fulfill, reject) => {
	const timeout = setTimeout(reject, ms, Boom.tooManyRequests())
	const onFulfilled = (result) => {
		clearTimeout(timeout)
		fulfill(result)
	}
	const onRejected = (reason) => {
		clearTimeout(timeout)
		reject(reason)
	}
	fn().then(onFulfilled, onRejected)
})

const rateLimitByIP = ({ age, max, rpm }) => {
	const cache = new LRU({ max, maxAge: age })
	const touch = ({ ip: key }) => {
		if (!cache.has(key)) {
			const reset = Date.now() + age
			cache.set(key, { count: 0, reset })
		}
		const value = cache.get(key)
		value.count += 1
		return value
	}
	return async function throw429 (context) {
		const { count, reset } = touch(context)
		const remaining = Math.max(0, rpm - count)
		Object.assign(context.state.tracking, {
			'X-RateLimit-Limit': `${rpm} request(s) per minute`,
			'X-RateLimit-Remaining': `${remaining} request(s)`,
			'X-RateLimit-Reset': new Date(reset).toISOString(),
		})
		if (rpm < count) {
			const seconds = (reset - Date.now()) / 1000
			const header = Math.ceil(seconds).toFixed(0)
			context.state.tracking['Retry-After'] = header
			throw Boom.tooManyRequests() // put headers here?
		}
	}
}

const omnibus = (options) => {
	const limitRate = options.limitRate(options.limits)
	const limitTime = options.limitTime(options.limits)
	return async function omnibus (context, next) {
		const tracking = options.stateHeaders(context, 'X-Tracking-ID')
		const log = options.stateLogger(context, { tracking })
		Object.assign(context.state, { log, tracking })
		const hrtime = process.hrtime() // into state?
		try {
			await limitRate(context)
			await limitTime(next)
		} catch (error) {
			context.state.error = options.stateError(context, error)
		} finally {
			const [s, ns] = process.hrtime(hrtime) // precise:
			const ms = Number((s * 1e3) + (ns / 1e6)).toFixed(6)
			tracking['X-Response-Time'] = `${ms} millisecond(s)`
			const err = options.redactedError(context)
			const req = options.redactedRequest(context)
			const res = options.redactedResponse(context)
			log.trace({ err, req, res }, 'handled')
		}
	}
}

const getLogger = _.once(() => {
	return Bunyan.createLogger({
		level: process.env.LOG_LEVEL || 'debug',
		name: process.env.LOG_NAME || 'omnibus',
		serializers: Bunyan.stdSerializers,
		streams: [{ stream: process.stdout }],
	})
})

const inspectBoom = (context, error) => {
	const setHeaders = (headers) => {
		for (const [key, value] of Object.entries(headers)) {
			context.set(key, value)
		}
	}
	if (error && error.isBoom) {
		context.status = error.output.statusCode
		setHeaders(Object(error.output.headers))
		context.body = error.output.payload
	}
	setHeaders(Object(context.state.tracking))
	return error
}

const trackingObject = (context, header) => {
	return { [header]: context.get(header) || UUID.v1() }
}

const defaults = Object.freeze({
	limits: Object.freeze({ age: 60000, max: 1000000, next: 60000, rpm: 1000 }),
	limitRate: limits => rateLimitByIP(limits), // using near fixed-size cache (LRU)
	limitTime: limits => boundedExecutor(limits.next), // using setTimeout and async
	stateError: (context, error) => Boom.boomify(error, context), // = state.error
	stateHeaders: (context, header) => trackingObject(context, header), // tracking
	stateLogger: (context, fields) => getLogger().child(fields), // log w/ tracking
	redactedError: context => inspectBoom(context, context.state.error),
	redactedRequest: context => _.omit(context.request, ['header']),
	redactedResponse: context => _.omit(context.response, ['header']),
})

const createApplication = (...args) => {
	const options = Object.assign({}, defaults, ...args)
	const application = new KoaApplication()
	application.use(omnibus(options))
	return application
}

module.exports = Object.assign(omnibus, {
	createApplication,
	default: omnibus,
})

if (!module.parent) {
	const URL = require('url')
	const hostname = process.env.BIND || 'localhost'
	const port = process.env.PORT || 8080 // on hostname
	const log = getLogger().child({ component: 'demo' })
	const application = omnibus.createApplication({
		// allow each client (track 600) 60 req/min (<6s RTT)
		limits: { age: 60000, max: 600, next: 6000, rpm: 60 }
	})
	application.use(async function throw400 (context) {
		context.status = 200 // before:
		const url = URL.parse(context.url)
		throw Boom.badRequest(url.pathname)
	})
	const server = require('http').createServer()
	server.on('request', application.callback())
	server.listen(port, hostname, () => {
		const url = URL.format({ hostname, port, protocol: 'http:' })
		log.info({ url }, 'listening')
	})
}
