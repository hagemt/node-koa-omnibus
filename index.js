const Application = require('koa')

const defaults = require('./defaults.js')

const debug = require('debug')('koa-omnibus')

const createOptions = (...args) => {
	//const options = _.defaultsDeep({}, defaults, ...args) // < this doesn't work
	const options = Object.assign({}, defaults, ...args) // < however, this works fine
	options.headers = Object.freeze(Object.assign({}, defaults.headers, options.headers))
	options.limits = Object.freeze(Object.assign({}, defaults.limits, options.limits))
	options.namespace = options.namespace || 'state' // whenever namespace is false-y
	return Object.freeze(options) // XXX: should Options be a class?
}

const createMiddleware = (options) => {
	const { timing, tracing } = options.headers
	const limitRate = options.limitRate(options)
	const limitTime = options.limitTime(options)
	return async function omnibus(context, next) {
		const tracer = options.targetTracer(options, context, tracing)
		const log = options.targetLogger(options, context, { tracing: tracer })
		const source = { log, timing: {}, tracing: tracer } // wrapped into:
		const target = options.targetObject(options, context, source)
		const start = (target.timing.start = process.hrtime())
		try {
			await limitRate(context, next)
			await limitTime(context, next)
			target.error = null // no throw
		} catch (error) {
			target.error = options.targetError(options, context, error)
		} finally {
			const [s, ns] = process.hrtime(start)
			const ms = Number(s * 1e3 + ns / 1e6).toFixed(6)
			tracer[timing] = `${ms} millisecond(s)` // header

			const err = options.redactedError(options, context)
			const req = options.redactedRequest(options, context)
			const res = options.redactedResponse(options, context)

			if (!err) log.trace({ req, res }, 'request')
			else log.debug({ err, req, res }, 'request')
		}
	}
}

const omnibus = (...args) => {
	const options = createOptions(...args)
	debug('create with options: %j', options)
	return createMiddleware(options)
}

const createApplication = (options = createOptions()) => {
	let application = new Application()
	for (const key of ['before', 'hooks']) {
		const all = Array.isArray(options[key]) ? options[key] : []
		for (const one of all) {
			switch (key) {
				case 'hooks':
					application = one(application)
					break
				default:
					application.use(one)
			}
		}
	}
	application.use(omnibus(options))
	for (const key of ['after', 'routers']) {
		const all = Array.isArray(options[key]) ? options[key] : []
		for (const one of all) {
			switch (key) {
				case 'routers':
					application.use(one.allowedMethods())
					application.use(one.routes())
					break
				default:
					application.use(one)
			}
		}
	}
	return application
}

module.exports = Object.assign(omnibus, {
	createApplication,
	default: omnibus,
})
