/* eslint-env node */
const HTTP = require('http')
const URL = require('url')

const omnibus = require('.')

const { getLogger } = require('./log.js')

/* istanbul ignore next */
if (!module.parent) {
	const hostname = process.env.BIND || 'localhost'
	const port = process.env.PORT || 8080 // default
	const application = omnibus.createApplication({
		// allow each client (track 600) 60 req/min (<6s RTT)
		limits: { age: 60000, max: 600, next: 6000, rpm: 60 },
		//limitRate: () => async function noop () {}, // no RL
	})
	const log = getLogger({ component: 'demo' })
	application.use(async function throw500 () {
		throw new Error('demo') // not exposed
	})
	HTTP.createServer(application.callback())
		.listen(port, hostname, () => {
			const serverURL = URL.format({ hostname, port, protocol: 'http:' })
			log.info(`curl -s ${serverURL} -v | jq`) // tests single round-trip
		})
}
