/* eslint-env node */
const KoaApplication = require('koa')

const defaults = require('./defaults.js')

const createOptions = (...args) => {
	//const options = _.defaultsDeep({}, defaults, ...args) // < this doesn't work
	const options = Object.assign({}, defaults, ...args) // however, this works fine:
	options.headers = Object.freeze(Object.assign({}, defaults.headers, options.headers))
	options.limits = Object.freeze(Object.assign({}, defaults.limits, options.limits))
	options.namespace = options.namespace || 'state' // not default namespace
	return Object.freeze(options) // XXX: should Options be a class?
}

const createMiddleware = (options) => {
	const { tracking, timing } = options.headers
	const limitRate = options.limitRate(options)
	const limitTime = options.limitTime(options)
	return async function omnibus (context, next) {
		const headers = options.targetHeaders(options, context, tracking) // Object
		const log = options.targetLogger(options, context, { tracking: headers })
		const source = { log, timing: {}, tracking: headers } // wrapped into:
		const target = options.targetObject(options, context, source)
		const hrtime = target.timing.start = process.hrtime()
		try {
			await limitRate(context, next)
			await limitTime(context, next)
			target.error = null // no throw
		} catch (error) {
			target.error = options.targetError(options, context, error)
		} finally {
			const [s, ns] = process.hrtime(hrtime) // since start
			const ms = Number((s * 1e3) + (ns / 1e6)).toFixed(6)
			headers[timing] = `${ms} millisecond(s)` // tracking
			const err = options.redactedError(options, context)
			const req = options.redactedRequest(options, context)
			const res = options.redactedResponse(options, context)
			if (!err) log.trace({ req, res }, 'request') // softer
			else log.debug({ err, req, res }, 'request') // louder
		}
	}
}

const omnibus = (...args) => {
	const options = createOptions(...args)
	return createMiddleware(options)
}

const createApplication = (...args) => {
	const application = new KoaApplication()
	application.use(omnibus(...args))
	return application
}

module.exports = Object.assign(omnibus, {
	createApplication,
	default: omnibus,
})
