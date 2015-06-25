![redislock](http://danielstjules.com/github/redislock-logo.png)

Node distributed locking using redis with lua scripts. Compatible with
redis >= 2.6.12. A better alternative to locking strategies based on SETNX or
WATCH/MULTI. Refer to [Implementation](#implementation) and
[Alternatives](#alternatives) for details.

[![Build Status](https://travis-ci.org/danielstjules/redislock.png)](https://travis-ci.org/danielstjules/redislock)

* [Installation](#installation)
* [Overview](#overview)
* [Implementation](#implementation)
* [Alternatives](#alternatives)
* [API](#api)
    * [redislock.createLock(client, \[options\])](#redislockcreatelockclient-options)
    * [redislock.setDefaults(options)](#redislocksetdefaultsoptions)
    * [redislock.getAcquiredLocks()](#redislockgetacquiredlocks)
    * [redislock.LockAcquisitionError](#redislocklockacquisitionerror)
    * [redislock.LockReleaseError](#redislocklockreleaseerror)
    * [redislock.LockExtendError](#redislocklockextenderror)
* [Class: Lock](#class-lock)
    * [lock.acquire(key, \[fn\])](#lockacquirekey-fn)
    * [lock.release(\[fn\])](#lockreleasefn)
    * [lock.extend(key, \[fn\])](#lockextendtime-fn)
* [Tests](#tests)

## Installation

Using npm, you can install redislock with `npm install --save redislock`.
You can also require it as a dependency in your `package.json` file:

```
"dependencies": {
    "redislock": "*"
}
```

## Overview

redislock offers both atomic acquire and release operations, avoiding race
conditions among clients, as well as the need for lock-specific redis
connections. Lock creation requires a node_redis client, and accepts an
object specifying the following three options:

 * timeout: Time in milliseconds before which a lock expires (default: 10000 ms)
 * retries: Maximum number of retries in acquiring a lock if the first attempt failed (default: 0)
 * delay:   Time in milliseconds to wait between each attempt (default: 50 ms)

``` javascript
var client = require('redis').createClient();
var lock   = require('redislock').createLock(client, {
  timeout: 20000,
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

Supports promises, thanks to bluebird, out of the box:

``` javascript
var client = require('redis').createClient();
var lock   = require('redislock').createLock(client);

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
var co     = require('co');
var client = require('redis').createClient();
var lock   = require('redislock').createLock(client);

co(function *(){
  try {
    yield lock.acquire('app:feature:lock');
  } catch (e) {
    // Failed to acquire the lock
  }

  try {
    yield lock.release();
  } catch (e) {
    // Failed to release
  }
})();
```

## Implementation

Locking is performed using the following redis command:

```
SET key uuid PX timeout NX
```

If the SET returns OK, the lock has been acquired on the given key, and an
expiration has been set. Then, releasing a lock uses the following redis script:

``` lua
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
```

This ensures that the key is deleted only if it is currently holding the lock,
by passing its UUID as an argument. Extending a lock is done with a similar
lua script:

``` lua
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
```

## Alternatives

Some alternative locking implementations do not use a random identifier, but
instead simply invoke `SETNX`, assigning a timestamp. This has the problem of
requiring synchronization of clocks between all instances to maintain timeout
accuracy. Furthermore, freeing a lock with such an implementation may risk
deleting a key set by a different lock.

Another technique used is to `WATCH` the key for changes when freeing,
achieving a CAS-like operation, as described below:

```
WATCH key  # Begin watching the key for changes
GET key    # Retrieve its value, return an error if not equal to the lock's UUID
MULTI      # Start transaction
DEL key    # Delete the key
EXEC       # Execute the transaction, which will fail if the key had expired
```

However, this has the issue of requiring that you use a 1:1 mapping of redis
clients to locks to ensure that a competing `MULTI` is not invoked, and that
the release is unaffected by other watched keys.

In addition to the above, most locking libraries aren't compatible with promises
by default, and due to their API, require "promisifying" individual locks.
`redislock` avoids this issue by taking advantage of bluebird's `nodeify`
function to offer an API that easily supports both callbacks and promises.

## API

The module exports three functions for lock creation and management, as well
as two errors for simplified error handling when using promises.

#### redislock.createLock(client, [options])

Creates and returns a new Lock instance, configured for use with the supplied
redis client, as well as options, if provided. The options object may contain
following three keys, as outlined at the start of the documentation: timeout,
retries and delay.

``` javascript
var lock = redislock.createLock(client, {
  timeout: 10000,
  retries: 3,
  delay: 100
})
```

#### redislock.setDefaults(options)

Sets the default options to be used by any new lock created by redislock.
Only available options are modified, and all other keys are ignored.

``` javascript
redislock.setDefaults({
  timeout: 200000,
  retries: 1,
  delay: 50
});
```

#### redislock.getAcquiredLocks()

Returns an array of currently active/acquired locks.

``` javascript
// Create 3 locks, but only acquire 2
redislock.createLock(client);

redislock.createLock(client).acquire('app:lock1', function(err) {
  redislock.createLock(client).acquire('app:lock2', function(err) {
    var locks = redislock.getAcquiredLocks(); // [lock, lock]
  });
});
```

#### redislock.LockAcquisitionError

The constructor for a LockAcquisitionError. Thrown or returned when a lock
could not be acquired.

#### redislock.LockReleaseError

The constructor for a LockReleaseError. Thrown or returned when a lock
could not be released.

#### redislock.LockExtendError

The constructor for a LockExtendError. Thrown or returned when a lock
could not be extended.

## Class: Lock

The lock class exposed by redislock. Each instance is assigned a UUID v1 string
as an id, and is configured to work with the given redis client. The default
options from which is inherits may be changed by using redislock.setDefaults.

#### lock.acquire[key, [fn]]

Attempts to acquire a lock, given a key, and an optional callback function.
If the initial lock fails, additional attempts will be made for the
configured number of retries, and padded by the delay. The callback is
invoked with an error on failure, and returns a promise if no callback is
supplied. If invoked in the context of a promise, it may throw a
LockAcquisitionError.

``` javascript
var lock = redislock.createLock(client);
lock.acquire('example:lock', function(err) {
  if (err) return console.log(err.message); // 'Lock already held'
});
```

#### lock.release([fn])

Attempts to release the lock, and accepts an optional callback function.
The callback is invoked with an error on failure, and returns a promise
if no callback is supplied. If invoked in the context of a promise, it may
throw a LockReleaseError.

``` javascript
var lock = redislock.createLock(client);
lock.acquire('app:lock', function(err) {
  if (err) return;

  setTimeout(function() {
    lock.release(function(err) {
      if (err) return console.log(err.message); // 'Lock on app:lock has expired'
    });
  }, 20000)
});
```

#### lock.extend(time, [fn])

Attempts to extend the timeout of a lock, and accepts an optional callback
function. The callback is invoked with an error on failure, and returns a
promise if no callback is supplied. If invoked in the context of a promise,
it may throw a LockExtendError.

``` javascript
var lock = redislock.createLock(client);
lock.acquire('app:lock', function(err) {
  if (err) return;

  setTimeout(function() {
    lock.extend(20000, function(err) {
      if (err) return console.log(err.message); // 'Lock on app:lock has expired'
    });
  }, 20000)
});
```

## Tests

Unit and functional tests are available in the base spec directory, and can
be ran using `npm test`. Additional integration tests, which require an active
redis-server configured on the default port and host, can be ran using
`mocha spec/integration/`. Both tests suites are ran as part of the Travis CI
build thanks to their support for services such as redis.
