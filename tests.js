/* eslint-env mocha, node */
const assert = require('assert')

const omnibus = require('.')

describe('omnibus', () => {
	it('is a middleware factory of epic win', () => {
		assert(omnibus)
	})
})
