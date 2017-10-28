/* eslint-env node */
const KoaApplication = require('koa')

const defaults = require('./defaults.js')

const createOptions = (...args) => {
	//const options = _.defaultsDeep({}, defaults, ...args) // broken
	const options = Object.assign({}, defaults, ...args) // works fine:
	options.headers = Object.assign({}, defaults.headers, options.headers)
	options.limits = Object.assign({}, defaults.limits, options.limits)
	return options // XXX: could turn this into a class, if necessary
}

const createMiddleware = (options) => {
	const { tracking, timing } = options.headers
	const limitRate = options.limitRate(options)
	const limitTime = options.limitTime(options)
	return async function omnibus (context, next) {
		const error = options.stateError(options, context) // default: 404 Not Found
		const headers = options.stateHeaders(options, context, tracking) // Object
		const log = options.stateLogger(options, context, { tracking: headers })
		const source = { error, log, timing: {}, tracking: headers }
		const target = options.stateObject(options, context, source)
		const hrtime = target.timing.start = process.hrtime()
		try {
			await limitRate(context, next)
			await limitTime(context, next)
			target.error = null // reset
		} catch (error) {
			target.error = options.stateError(options, context, error)
		} finally {
			const [s, ns] = process.hrtime(hrtime) // since start
			const ms = Number((s * 1e3) + (ns / 1e6)).toFixed(6)
			headers[timing] = `${ms} millisecond(s)`
			const err = options.redactedError(options, context)
			const req = options.redactedRequest(options, context)
			const res = options.redactedResponse(options, context)
			log.trace({ err, req, res }, 'handled')
		}
	}
}

const omnibus = (...args) => {
	const options = createOptions(...args)
	return createMiddleware(options)
}

const createApplication = (options) => {
	const application = new KoaApplication()
	application.use(omnibus(options))
	return application
}

module.exports = Object.assign(omnibus, {
	createApplication,
	createMiddleware,
	default: omnibus,
})
