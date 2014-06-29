redislock
===========

Node locking using redis. Compatible with redis >= 2.6.12.

## Installation

Using npm, you can install pattern-emitter with `npm install redislock`.
You can also require it as a dependency in your `package.json` file:

```
"dependencies": {
    "redislock": "*"
}
```

## Overview

Lock creation requires a new redis client, and accepts an object specifying
the following three options:

 * timeout: Time in milliseconds before which a lock expires (default: 10000 ms)
 * retries: Maximum number of attempts to make in acquiring a lock (default: 0)
 * delay:   Time in milliseconds to wait between each attempt (default: 100 ms)

``` javascript
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

``` javascript
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

``` javascript
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

## Implementation

Locking is performed using the following redis command:

```
SET key uuid PX timeout NX
```

If the SET returns OK, the lock has been acquired on the given key, and an
expiration has been set. Then, releasing a lock uses the following sequence:
```
WATCH key  # Begin watching the key for changes
GET key    # Retrieve its value, return an error if not equal to the lock's UUID
MULTI      # Start transaction
DEL key    # Delete the key
EXEC       # Execute the transaction, which will fail if the key has changed
```

This ensures that the key is deleted only if it is currently holding the
lock, as identified by the UUID.
