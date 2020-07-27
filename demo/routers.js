const HTTP = require('http')
const Router = require('koa-router')

const logging = require('./log.js')
const omnibus = require('..')

const withRouters = () => {
	const api = new Router()

	api.get('/', async ({ response }) => {
		response.body = 'OK'
	})

	return omnibus.createApplication({
		routers: [api],
	})
}

if (!module.parent) {
	const app = withRouters()
	const log = logging.getLogger()

	const server = HTTP.createServer()
	server.on('request', app.callback())

	server.once('listening', () => {
		const address = server.address()
		log.info(address, 'listening')
	})
	server.listen(process.env.PORT || 8080)
}
