# koa-omnibus

It does exactly everything you want a server to do.

Read the source, or clone: `npm install koa && npm run demo`

## What do you mean? I want to try it.

```
const omnibus = require('koa-omnibus')
omnibus.createApplication().listen()
// or: application.use(omnibus())
```

## Defaults not good enough? Okay...

```
omnibus({
	limits: Object { age:Number, max:Number, next:Number, rpm:Number },
	limitRate: limits:Object => middleware:AsyncFunction, // rate limit
	limitTime: limits:Object => middleware:AsyncFunction, // time limit
	stateError: (context, error) => error, // context.state.error = error
	stateHeaders: (context, header:String) => Object { [header]: unique:String },
	stateLogger: (context, fields) => log, // fields will include tracking headers
	redactedError: context => error, // holy crap you can do whatever you want
	redactedRequest: context => _.omit(context.request, ['header']), // or here
	redactedResponse: context => _.omit(context.response, ['header']), // or here
})
```
