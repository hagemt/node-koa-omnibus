/* eslint-env node */
const HTTP = require('http')
const URL = require('url')

const Boom = require('boom')
const omnibus = require('.')

/* istanbul ignore next */
if (!module.parent) {
	const hostname = process.env.BIND || 'localhost'
	const port = process.env.PORT || 8080 // on hostname
	const application = omnibus.createApplication({
		// allow each client (track 600) 60 req/min (<6s RTT)
		limits: { age: 60000, max: 600, next: 6000, rpm: 60 },
		//limitRate: () => async function noop () {}, // no RL
	})
	application.use(async function badRequest (context) {
		context.status = 204 // No Content
		const url = URL.parse(context.url)
		throw Boom.badRequest(url.pathname)
	})
	HTTP.createServer(application.callback()).listen(port, hostname, () => {
		const serverURL = URL.format({ hostname, port, protocol: 'http:' })
		// eslint-disable-next-line no-console
		console.log(`listening: ${serverURL}`)
	})
}
