/* eslint-env mocha, node */
const assert = require('assert')
const HTTP = require('http')

const Boom = require('boom') // errors
const supertest = require('supertest')

const omnibus = require('.')

describe('omnibus', () => {

	const test = {}

	const validUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
	const validMS = /^1\.[0-9]{6} millisecond\(s\)$/

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
				.expect('x-request-id', validUUID)
				.expect('x-response-time', validMS)
				.expect(204, '') // actually No Content
		})

		after(() => {
			test.server.close()
			delete test.server
		})

	})

	describe('errors', () => {

		// 500 Internal Server Error, then 429 Too Many Requests
		const options = { limits: { rpm: 1 } } // see above/below

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
			const message = `Not Found: Exceeded rate limit: ${options.limits.rpm} request(s) per minute`
			const body = Boom.tooManyRequests(message).output.payload
			return supertest(test.server)
				.get('/')
				.expect('retry-after', '60')
				.expect(429, body)
		})

		after(() => {
			test.server.close()
			delete test.server
		})

	})

})
