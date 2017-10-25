/* eslint-env mocha, node */
const HTTP = require('http')

const supertest = require('supertest')

const omnibus = require('.') // index.js

describe('omnibus', () => {

	const test = {}

	before(() => {
		const application = omnibus.createApplication()
		const server = HTTP.createServer() // supertest'd
		server.on('request', application.callback())
		Object.assign(test, { server })
	})

	it('is a middleware factory of epic win', () => {
		return supertest(test.server).get('/').expect(404)
	})

	after(() => {
		test.server.close()
		delete test.server
	})

})
