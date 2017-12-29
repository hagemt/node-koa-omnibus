# koa-omnibus

[![Travis CI badge](https://travis-ci.org/hagemt/node-koa-omnibus.svg?branch=master)](https://travis-ci.org/hagemt/node-koa-omnibus)
[![Greenkeeper badge](https://badges.greenkeeper.io/hagemt/node-koa-omnibus.svg)](https://account.greenkeeper.io/account/hagemt)

I wouldn't use this in production until it's more battle-tested. (at least v1)

It does exactly everything you want an API server to do, and nothing more.

Put this at the front of your `koa@^2` middleware chain and get hacking.

## What do you mean? I want to try before I buy.

Clone, then: `npm install && npm install koa && npm run demo` or:

Slap this in `node server.js | bunyan` after `npm install koa koa-omnibus`:

```
const omnibus = require('koa-omnibus')
omnibus.createApplication().listen()
// or: application.use(omnibus())
```

## Defaults not good enough? Okay...

All dependencies are included only for defaults; you can override anything you want.

```
omnibus({

	// simple constants: (all Numbers are in milliseconds)
	headers: { timing:String, tracking:String }, // defaults: 'X-Response-Time' and 'X-Request-ID'
	limits: Object { age:Number, max:Number, next:Number, rpm:Number }, // 60000/1000000/60000/1000
	namespace: String, // default: 'omnibus' (if set false-y, context.state decorated directly)

	// middleware factories (unary):
	limitRate: options:Object => middleware:AsyncFunction, // 429 Too Many Requests
	limitTime: options:Object => middleware:AsyncFunction, // 408 Request Timeout

	// redaction transforms (binary):
	redactedError: (options, context) => error, // do whatever transform(s) you want here
	redactedRequest: (options, context) => _.omit(context.request, ['header']), // " here
	redactedResponse: (options, context) => _.omit(context.response, ['header']), // " here

	// object factories (ternary):
	targetError: (options, context, error) => error, // not redacted (default: Boom)
	targetHeaders: (options, context, string) => Object { [string]: "$(uuidgen -t)" },
	targetLogger: (options, context, object) => log, // will include tracking headers
	targetObject: (options, context, object) => object, // context[namespace || 'state']

})
```

## Oh, yeah. One more thing:

This doesn't include any of these modules, but you can `.use` them, as you wish:

* https://www.npmjs.com/package/koa-bodyparser
* https://www.npmjs.com/package/koa-compress
* https://www.npmjs.com/package/koa-etag
* https://www.npmjs.com/package/koa-favicon
* https://www.npmjs.com/package/koa-helmet
* https://www.npmjs.com/package/koa-logger
* https://www.npmjs.com/package/koa-mount
* https://www.npmjs.com/package/koa-ratelimit
* https://www.npmjs.com/package/koa-rewrite
* https://www.npmjs.com/package/koa-session
* https://www.npmjs.com/package/koa-static
* https://www.npmjs.com/package/@koa/cors

## But seriously, what is this, and how does it work?

You want your server to do a few things for you:

* If the user (tracks $max IPs for $age) has made Too Many Requests ($rpm) throw 429.
* If the middleware chain has been executing for too long ($next) 408 Request Timeout.
* It would be nice if my REST API actually produced error bodies for JSON consumers.
* It would be nice if my logging actually worked how I want it to. (see Bunyan)
* It would be nice if my logs included what I want, and none of what I don't.
* It would be nice if the defaults made sense, and nothing got in my way.
* It would be nice if I could later customize everything how I like it.

Sweet. So, how's it work? See `defaults.js`. Swish.
