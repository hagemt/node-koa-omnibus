const Boom = require('@hapi/boom')
const LRU = require('lru-cache')
const UUID = require('uuid')

// note: pino is a "soft" dependency
// https://github.com/pinojs/pino#readme
//const pino = require('pino') // see rootLogger

// FIXME: lodash is useful, but it is also troublesome to deal with vulns
const { get, omit, once } = require('lodash')
const debug = require('debug')('koa-omnibus')

const rateLimitByIP = ({ age, max, namespace, rpm }) => {
	// TODO: document how easy it is to replace this with Redis rate limiters
	const cache = new LRU({ max, maxAge: age })
	const touch = ({ ip: key }) => {
		debug('tracing bucket: %s', key)
		if (!cache.has(key)) {
			const reset = Date.now() + age
			cache.set(key, { count: 0, reset })
		}
		const value = cache.get(key)
		value.count += 1
		return value
	}
	const tracingHeaders = (context, headers) => {
		const target = get(context, namespace, {})
		const tracing = get(target, 'tracing', {})
		return Object.assign(tracing, headers)
	}
	const middleware = async function throw429(context) {
		const { count, reset } = touch(context)
		const remaining = Math.max(0, rpm - count)
		const headers = tracingHeaders(context, {
			'X-RateLimit-Limit': `${rpm} request(s) per minute`,
			'X-RateLimit-Remaining': `${remaining} request(s)`,
			'X-RateLimit-Reset': new Date(reset).toISOString(),
		})
		if (rpm < count) {
			headers['Retry-After'] = Math.ceil((reset - Date.now()) / 1000).toFixed(0)
			const message = `Exceeded rate limit [${headers['X-RateLimit-Limit']}]`
			throw Boom.tooManyRequests(message) // data w/ headers is redundant
		}
	}
	return Object.assign(middleware, { cache, touch })
}

const timeBoundedAsyncFunction = ({ next: ms }) => {
	// conforms to https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/408
	const message = `Exceeded time limit [${ms} millisecond(s)]`
	const error = Boom.clientTimeout(message)
	error.output.headers.Connection = 'close'
	// TODO: https://github.com/pinojs/pino-debug
	const middleware = async function throw408(_, fn) {
		return new Promise((fulfill, reject) => {
			debug('timeout set: %dms', ms) // do this after?
			const timeout = setTimeout(reject, ms, error)
			fn()
				.then((result) => {
					debug('timeout end: %dms', ms)
					clearTimeout(timeout)
					fulfill(result)
				})
				.catch((reason) => {
					debug('timeout hit: %dms', ms)
					clearTimeout(timeout)
					reject(reason)
				})
		})
	}
	// TODO: expose settings somehow, or make dynamic based upon context?
	return middleware
}

/* istanbul ignore next */
const rootLogger = once(() => {
	const pino = require('pino')
	const logger = pino({
		level: process.env.LOG_LEVEL || 'debug',
		name: process.env.LOG_NAME || 'omnibus',
		serializers: pino.stdSerializers, // Object
	})
	if (process.env.NODE_ENV === 'development') {
		return require('pino-caller')(logger)
	}
	return logger // no pino-caller in prod
})

// TODO: consider using memoize to obtain same child log as bound:
const getChildLogger = (bindings) => rootLogger().child(bindings)
const childLogger = (_, bindings) => getChildLogger(bindings)

const createBoom = (context, error) => {
	if (error) return Boom.boomify(error, { context })
	return new Boom.Boom(`${context.method} ${context.url}`, {
		statusCode: context.status || 404,
	})
}

const renderBoom = (context, namespace) => {
	const object = get(context, namespace, {})
	const setHeaders = (parent, keyspace) => {
		const child = get(parent, keyspace, {})
		for (const [key, value] of Object.entries(child)) {
			debug('rendered header: %s=%s', key, value)
			context.set(key, value)
		}
	}
	const error = get(object, 'error')
	if (error && error.isBoom) {
		const { data, output } = error
		context.status = output.statusCode
		setHeaders(output, 'headers')
		context.body = output.payload
		setHeaders(data, 'headers')
		const summary = output.payload.error
		debug('rendered Boom: %s', summary)
	}
	setHeaders(object, 'tracing')
	return error
}

const tracingObject = (context, key) => {
	const value = context.get(key) || UUID.v1()
	debug('tracing header: %s=%s', key, value)
	return { [key]: value } // more added later
}

const namespacedObject = (context, namespace, ...args) => {
	const error = createBoom(context) // default: 404 Not Found
	context[namespace] = Object(context[namespace]) // decorated:
	return Object.assign(context[namespace], { error }, ...args)
}

const defaults = {
	headers: Object.freeze({ timing: 'X-Response-Time', tracing: 'X-Request-ID' }),
	limitRate: ({ limits, namespace }) => rateLimitByIP(Object.assign({ namespace }, limits)),
	limitTime: ({ limits }) => timeBoundedAsyncFunction(limits), // < middleware functions ^
	limits: Object.freeze({ age: 60000, max: 1000 * 1000, next: 60000, rpm: 1000 }),
	namespace: 'omnibus', // if set to false-y value, will write directly to context.state
	redactedError: ({ namespace }, context) => renderBoom(context, namespace), // wraps 500s, etc.
	redactedRequest: (_, context) => omit(context.request, ['header']), // no Authorization
	redactedResponse: (_, context) => omit(context.response, ['header']), // no Set-Cookie
	targetError: (_, context, error) => createBoom(context, error), // target: [namespace].error
	targetLogger: (_, context, bindings = {}) => childLogger(context, bindings), // [namespace].log
	targetObject: ({ namespace }, context, source) => namespacedObject(context, namespace, source),
	targetTracer: (_, context, key) => tracingObject(context, key), // [namespace].tracing
}

module.exports = defaults
