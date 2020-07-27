const _ = require('lodash')

const defaults = require('../defaults.js')

const getParentLogger = _.once(() => defaults.targetLogger(null, null, null))

const getChildLogger = _.memoize((component = 'demo') => {
	const parentLogger = getParentLogger()
	const childLogger = parentLogger.child({
		module: component,
	})
	return Object.assign(childLogger, {
		getLogger: getChildLogger,
		log: childLogger.info,
	})
})

module.exports = getChildLogger()
