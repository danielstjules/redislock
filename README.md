redislock
===========

Node locking using redis. Compatible with redis >= 2.2.0.

## Installation

Using npm, you can install pattern-emitter with `npm install redislock`.
You can also require it as a dependency in your `package.json` file:

```
"dependencies": {
    "redislock": "*"
}
```

## Overview

```
var client = require('redis').createClient();
var lock   = require('redislock').createLock(client, {
  timeout: 10000,
  retries: 3,
  delay: 100
});

lock.acquire('app:feature:lock', function(err) {
  // if (err) ... Failed to acquire the lock

  lock.release(function(err) {
    // if (err) ... Failed to release
  });
});
```

Supports promises with bluebird out of the box:

```
var client    = require('redis').createClient();
var redislock = require('redislock');
var lock      = redislock.createLock(client);

var LockAcquisitionError = redislock.LockAcquisitionError;
var LockReleaseError     = redislock.LockReleaseError;

lock.acquire('app:feature:lock').then(function() {
  // Lock has been acquired
  return lock.release();
}).then(function() {
 // Lock has been released
}).catch(LockAcquisitionError, function(err) {
  // The lock could not be acquired
}).catch(LockReleaseError, function(err) {
  // The lock could not be released
});
```

And an example with co:

```
var co        = require('co');
var client    = require('redis').createClient();
var redislock = require('redislock');
var lock      = redislock.createLock(client);

var LockAcquisitionError = redislock.LockAcquisitionError;
var LockReleaseError     = redislock.LockReleaseError;

co(function *(){
  try {
    yield lock.acquire('app:feature:lock');

    yield lock.release();
  } catch(e) {
    if (e instanceof LockAcquisitionError) {
      // Failed to acquire the lock
    } else if (e instanceof LockReleaseError) {
      // Failed to release
    } else {
      // Other exceptions
    }
  }
})();
```
