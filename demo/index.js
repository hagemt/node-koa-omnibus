const URL = require('url')

const logging = require('./log.js')
const omnibus = require('..')

/* istanbul ignore next */
if (!module.parent) {
	const hostname = process.env.BIND || 'localhost'
	const port = process.env.PORT || 8080 // default

	console.debug('Will throw Errors to demonstrate trace...')
	const app = omnibus.createApplication({
		// allow each client (track 600) 60 req/min (<6s RTT)
		limits: { age: 60000, max: 600, next: 6000, rpm: 60 },
		//limitRate: () => async function noop () {}, // no RL
	})

	const log = logging.getLogger('demo')
	app.use(async function throw500 () {
		throw new Error('message') // stack not exposed in response
	})

	app.listen(port, hostname, () => {
		const serverURL = URL.format({ hostname, port, protocol: 'http:' })
		log.info(`curl -v ${serverURL} | jq .`) // tests single round-trip
	})
}
