# Feature Guide

This middleware makes Koa batteries-included. Batteries are also removable.

Quick start:

```
const omnibus = require('koa-omnibus')
const app = omnibus.createApplication()
app.listen(process.env.PORT || 8080)
```

There are a number of `options` supported by `omnibus`. (see below)

## Functions: omnibus(...) vs. omnibus.createApplication(...)

Former: returns Koa middleware; latter: bootstraps Koa w/ that middleware.

* The primary difference is in the accepted parameters.
* When in doubt, use `createApplication` for new projects.
* If integrating into an existing project, consider this:

```
const app = ...
app.use(omnibus(...))
... // rather than the quick start
```

Note: You must call `createApplication` if you want to use some features.

* auto-loading middleware around `omnibus`
* special `hooks` or `routers` (see below)

## Options

Goal: ship with sane defaults, but allow gradual opt-around over time.

> Definition of "opt-around" is: "pick custom or not, as your needs grow"

Supported by `omnibus` (and forwarded through `createApplication`, too):

## Simple options

* namespace: String (if absent or false-y, default to using: context.state)

		This middleware is designed to keep out of your way. Want to make sure?

		Providing a namespace will white-label everything omnibus adds to Koa.

		e.g. namespace: 'omnibus' means everything goes in: context.omnibus

* limits: Object // Numbers: age, max, next, rpm
* headers: Object // Strings: timing, tracking

		age: expiry on the (by default) IP-based rate-limit (in milliseconds)
		max: upper bound on IP count in the LRU cache (default implementation)

		next: middleware after omnibus is interrupted w/ 408s at $next ms
		rpm: more than $rpm requests per minute will result in 429s

		default age and next limits: one minute (60 * 1000ms)
		default RPM is 1000/min, and default max is 1MM IPs

		timing: response header name (default: X-Response-Time)
		tracking: response header name (default: X-Request-ID)

### Control options

* limitRate: Function // (options) => middleware run before `next`
* limitTime: Function // (options) => middleware run after `next`

		Defaults use limits w/ an internal `lru-cache` for IPs. (see above)

### Logging options

By default, req / res are logged at trace (and err at debug level)

* redactError: Function // err => err, before it reaches the logger
* redactRequest: Function // req => req, before it reaches the logger
* redactResponse: Function // res => res, before it reaches the logger
* targetLogger: Function // create child logger(s) for target namespace

		The logger is `pino` powered but compatible e.g. w/ `bunyan` APIs, too.

### Advanced options

* targetError: Function // default: use @hapi/boom for HTTP context Errors
* targetObject: Function // default: build namespaced object for Koa context
* targetTracer: Function // default: build object included in logging context

		Functions are always passed options, Koa context, and then any other args.

Supported by `createApplication` only:

* hooks: Array // of Functions, app => app' (before omnibus is use'd)
* routers: Array // of koa-router compatible router middleware

		Also: `before` and `after` Arrays of middleware(s) to surround the omnibus.

## Questions

If any of this doc is confusing, please open an issue (question) before PRs.

## Future Work

Add incomplete feature ideas here:

* include `http-shutdown` for graceful SIGTERM handling?
* support `limitRate` variant via Redis HLL and/or GCRA?

Lastly, it may or may not be a dumb idea to throw 404 Not Found by default.
