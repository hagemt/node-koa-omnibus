/* eslint-env node */
const defaults = require('./defaults.js')

const getLogger = (...args) => {
	const log = defaults.targetLogger(null, null, Object.assign({}, ...args))
	return Object.assign(log, { getLogger, log: (...args) => log.info(...args) })
}

module.exports = getLogger()
