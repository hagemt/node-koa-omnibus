const assert = require('assert')
const HTTP = require('http')

const Boom = require('@hapi/boom')
const Router = require('koa-router')
const supertest = require('supertest') // eslint-disable-line node/no-unpublished-require

const omnibus = require('.')

const harness = (app, server = harness.server) => {
	return supertest(server.on('request', app.callback()))
}

describe('omnibus', function () {
	const test = {}

	const validRequestUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
	const validResponseTime = /^[0-9]\.[0-9]{6} millisecond\(s\)$/
	const validDateString = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/

	describe('usage', function () {
		before(function () {
			const application = omnibus.createApplication(/* options */)
			// same as: `(new (require('koa'))()).use(omnibus(options))`
			application.use((context) => {
				context.status = 204
			})
			test.server = HTTP.createServer(application.callback())
		})

		it('exists', function () {
			assert(typeof omnibus === 'function', 'omnibus is not a Function')
		})

		it('works', function () {
			return supertest(test.server)
				.get('/')
				.expect('x-request-id', validRequestUUID)
				.expect('x-response-time', validResponseTime)
				.expect(204, '') // body of No Content
		})

		after(function () {
			test.server.close()
			delete test.server
		})
	})

	describe('errors', function () {
		const options = { limits: { rpm: 1 }, namespace: false }
		// 500 Internal Server Error, then 429 Too Many Requests

		before(function () {
			const application = omnibus.createApplication(options)
			application.use(async () => {
				throw new Error('test')
			})
			test.server = HTTP.createServer(application.callback())
		})

		it('returns the proper (clean) JSON payload (500s)', function () {
			const body = Boom.internal().output.payload
			return supertest(test.server).get('/').expect(500, body)
		})

		it('features a simple in-memory rate limiter (429s)', function () {
			const header = `${options.limits.rpm} request(s) per minute`
			const message = `Exceeded rate limit [${header}]` // Error:
			const body = Boom.tooManyRequests(message).output.payload
			return supertest(test.server)
				.get('/')
				.expect('x-ratelimit-limit', header)
				.expect('x-ratelimit-remaining', '0 request(s)')
				.expect('x-ratelimit-reset', validDateString)
				.expect('retry-after', '60')
				.expect(429, body)
		})

		after(function () {
			test.server.close()
			delete test.server
		})
	})

	describe('harness', function () {
		beforeEach(function () {
			harness.server = HTTP.createServer()
		})

		it('throws 404 for missing endpoints (by default)', function () {
			const hookUsed = (app) => {
				const use = app.use
				app.use = (...args) => {
					//console.debug('use called:', args)
					return use.apply(app, args)
				}
				return app
			}
			const throw404 = async ({ request, response }) => {
				if (!response.body) {
					const message = `${request.method} ${request.url}`
					throw Boom.notFound(message)
				}
			}
			const app = omnibus.createApplication({
				after: [throw404],
				hooks: [hookUsed],
			})
			const body = Boom.notFound('GET /').output.payload
			return harness(app).get('/').expect(404, body)
		})

		it('is compatible with koa-router Routers', function () {
			const api = new Router()

			api.get('/', async ({ response }) => {
				response.body = 'OK'
			})

			const test = async (context, next) => {
				//console.debug('before omnibus:', context)
				await next()
			}
			const check = async (context, next) => {
				//console.debug('after omnibus:', context)
				await next()
			}

			const app = omnibus.createApplication({
				after: [check],
				before: [test],
				routers: [api],
			})
			return harness(app).get('/').expect(200, 'OK')
		})

		afterEach(function () {
			harness.server.close()
		})
	})
})
