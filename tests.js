/* eslint-env mocha, node */
const assert = require('assert')
const HTTP = require('http')

const Boom = require('boom') // errors
const supertest = require('supertest')

const omnibus = require('.')

describe('omnibus', () => {

	const test = {}

	const validRequestUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
	const validResponseTime = /^[0-9]\.[0-9]{6} millisecond\(s\)$/
	const validDateString = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/

	describe('usage', () => {

		before(() => {
			const application = omnibus.createApplication(/* options */)
			// same as: `(new (require('koa'))()).use(omnibus(options))`
			application.use((context) => { context.status = 204 })
			test.server = HTTP.createServer(application.callback())
		})

		it('works', () => {
			assert(typeof omnibus === 'function', 'omnibus is not a Function')
			return supertest(test.server)
				.get('/')
				.expect('x-request-id', validRequestUUID)
				.expect('x-response-time', validResponseTime)
				.expect(204, '') // body of No Content
		})

		after(() => {
			test.server.close()
			delete test.server
		})

	})

	describe('errors', () => {

		// 500 Internal Server Error, then 429 Too Many Requests
		const options = { limits: { rpm: 1 }, namespace: false }

		before(() => {
			const application = omnibus.createApplication(options)
			application.use(async () => { throw new Error('test') })
			test.server = HTTP.createServer(application.callback())
		})

		it('returns the proper (clean) JSON payload (500s)', () => {
			const body = Boom.internal().output.payload
			return supertest(test.server)
				.get('/')
				.expect(500, body)
		})

		it('features a simple in-memory rate limiter (429s)', () => {
			const header = `${options.limits.rpm} request(s) per minute`
			const message = `Not Found: Exceeded rate limit [${header}]`
			const body = Boom.tooManyRequests(message).output.payload
			return supertest(test.server)
				.get('/')
				.expect('x-ratelimit-limit', header)
				.expect('x-ratelimit-remaining', '0 request(s)')
				.expect('x-ratelimit-reset', validDateString)
				.expect('retry-after', '60')
				.expect(429, body)
		})

		after(() => {
			test.server.close()
			delete test.server
		})

	})

})
