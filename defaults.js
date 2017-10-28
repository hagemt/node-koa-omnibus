/* eslint-env node */
const Boom = require('boom')
const Bunyan = require('bunyan')
const LRU = require('lru-cache')
const UUID = require('uuid')
const _ = require('lodash')

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
		const omnibus = context.state.omnibus // Object
		const headers = Object.assign(omnibus.tracking, {
			'X-RateLimit-Limit': `${rpm} request(s) per minute`,
			'X-RateLimit-Remaining': `${remaining} request(s)`,
			'X-RateLimit-Reset': new Date(reset).toISOString(),
		})
		if (rpm < count) {
			headers['Retry-After'] = Math.ceil((reset - Date.now()) / 1000).toFixed(0)
			const message = `Exceeded rate limit: ${headers['X-RateLimit-Limit']}`
			throw Boom.tooManyRequests(message, { headers }) // see inspectBoom
		}
	}
}

const timeBoundedAsyncFunction = (ms, fn) => new Promise((fulfill, reject) => {
	// conforms to https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/408:
	const message = `Exceeded time limit: ${ms} millisecond(s)` // see inspectBoom
	const error = Boom.clientTimeout(message, { headers: { Connection: 'close' } })
	const timeout = setTimeout(reject, ms, error)
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

const getLogger = _.once(() => {
	return Bunyan.createLogger({
		level: process.env.LOG_LEVEL || 'debug',
		name: process.env.LOG_NAME || 'omnibus',
		serializers: Bunyan.stdSerializers,
	})
})

const createBoom = (context, error) => {
	if (error) return Boom.boomify(error, context)
	return Boom.create(context.status) // default
}

const renderBoom = (context, options) => {
	const getState = (key) => {
		if (!options.namespace) return context.state[key]
		return context.state[options.namespace][key]
	}
	const setHeaders = (headers) => {
		for (const [key, value] of Object.entries(headers)) {
			context.set(key, value)
		}
	}
	const error = getState('error')
	if (error && error.isBoom) {
		context.status = error.output.statusCode
		setHeaders(Object(error.output.headers))
		context.body = Object(error.output.payload)
		setHeaders(Object(_.get(error.data, 'headers')))
	}
	setHeaders(Object(getState('tracking')))
	return error
}

const namespacedObject = (target, ...args) => {
	const source = Object.assign({}, ...args) // holds options, etc.
	if (!source.options.namespace) return Object.assign(target, source)
	Object.assign(target, { [source.options.namespace]: source })
	return source
}

const trackingObject = (context, header) => {
	return { [header]: context.get(header) || UUID.v1() }
}

const defaults = {
	headers: Object.freeze({ timing: 'X-Response-Time', tracking: 'X-Request-ID' }),
	limits: Object.freeze({ age: 60000, max: 1000 * 1000, next: 60000, rpm: 1000 }),
	namespace: 'omnibus', // if set to false-y value, will assign directly to context.state
	limitRate: ({ namespace, limits }) => rateLimitByIP(Object.assign({ namespace }, limits)),
	limitTime: ({ limits }) => (context, next) => timeBoundedAsyncFunction(limits.next, next),
	redactedError: (options, context) => renderBoom(context, options), // no details on 500, etc.
	redactedRequest: (options, context) => _.omit(context.request, ['header']), // no Authorization
	redactedResponse: (options, context) => _.omit(context.response, ['header']), // no Set-Cookie
	stateError: (options, context, error) => createBoom(context, error), // [namespace].error Object
	stateHeaders: (options, context, string) => trackingObject(context, string), // tracking headers
	stateLogger: (options, context, object) => getLogger().child(object), // log w/ tracking headers
	stateObject: (options, context, object) => namespacedObject(context.state, { options }, object),
}

module.exports = defaults
