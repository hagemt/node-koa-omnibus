/* eslint-env node */
const Boom = require('boom')
const Bunyan = require('bunyan')
const LRU = require('lru-cache')
const UUID = require('uuid')
const _ = require('lodash')

const debug = require('debug')('koa-omnibus')

const rateLimitByIP = ({ age, max, namespace, rpm }) => {
	const cache = new LRU({ max, maxAge: age })
	const touch = ({ ip: key }) => {
		debug('tracking bucket: %s', key)
		if (!cache.has(key)) {
			const reset = Date.now() + age
			cache.set(key, { count: 0, reset })
		}
		const value = cache.get(key)
		value.count += 1
		return value
	}
	const trackingHeaders = (context, headers) => {
		const target = _.get(context, namespace, {})
		const tracking = _.get(target, 'tracking', {})
		return Object.assign(tracking, headers)
	}
	const middleware = async function throw429 (context) {
		const { count, reset } = touch(context)
		const remaining = Math.max(0, rpm - count)
		const headers = trackingHeaders(context, {
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

const timeBoundedAsyncFunction = (ms, fn) => new Promise((fulfill, reject) => {
	// conforms to https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/408:
	const message = `Exceeded time limit [${ms} millisecond(s)]` // see renderBoom
	const error = Boom.clientTimeout(message, { headers: { Connection: 'close' } })
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

const getLogger = _.once(() => {
	return Bunyan.createLogger({
		level: process.env.LOG_LEVEL || 'debug',
		name: process.env.LOG_NAME || 'omnibus',
		serializers: Bunyan.stdSerializers,
	})
})

const createBoom = (context, error) => {
	if (error) return Boom.boomify(error, { context })
	return Boom.create(context.status) // < 400 throws
}

const renderBoom = (context, namespace) => {
	const object = _.get(context, namespace, {})
	const setHeaders = (parent, keyspace) => {
		const child = _.get(parent, keyspace, {})
		for (const [key, value] of Object.entries(child)) {
			debug('rendered header: %s=%s', key, value)
			context.set(key, value)
		}
	}
	const error = _.get(object, 'error')
	if (error && error.isBoom) {
		const { data, output } = error
		context.status = output.statusCode
		setHeaders(output, 'headers')
		context.body = output.payload
		setHeaders(data, 'headers')
		const summary = output.payload.error
		debug('rendered Boom: %s', summary)
	}
	setHeaders(object, 'tracking')
	return error
}

const trackingObject = (context, key) => {
	const value = context.get(key) || UUID.v1()
	debug('tracking header: %s=%s', key, value)
	return { [key]: value } // more added later
}

const namespacedObject = (context, namespace, ...args) => {
	const error = createBoom(context) // default: 404 Not Found
	context[namespace] = Object(context[namespace]) // decorated:
	return Object.assign(context[namespace], { error }, ...args)
}

const defaults = {
	headers: Object.freeze({ timing: 'X-Response-Time', tracking: 'X-Request-ID' }),
	limits: Object.freeze({ age: 60000, max: 1000 * 1000, next: 60000, rpm: 1000 }),
	namespace: 'omnibus', // if set to false-y value, will write directly to context.state
	limitRate: ({ namespace, limits }) => rateLimitByIP(Object.assign({ namespace }, limits)),
	limitTime: ({ limits }) => (context, next) => timeBoundedAsyncFunction(limits.next, next),
	redactedError: ({ namespace }, context) => renderBoom(context, namespace), // wraps 500s, etc.
	redactedRequest: (options, context) => _.omit(context.request, ['header']), // no Authorization
	redactedResponse: (options, context) => _.omit(context.response, ['header']), // no Set-Cookie
	targetError: (options, context, error) => createBoom(context, error), // [namespace].error Object
	targetHeaders: (options, context, string) => trackingObject(context, string), // tracking headers
	targetLogger: (options, context, object) => getLogger().child(object), // log w/ tracking headers
	targetObject: ({ namespace }, context, source) => namespacedObject(context, namespace, source),
}

module.exports = defaults
