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

Defaults can be for a given instance of the module:

```
// Require and set module defaults
var client    = require('redis').createClient();
var redislock = require('redislock')(client, {
  timeout: 10000,
  retries: 3,
  delay: 100
});

redislock.acquire(key, function(err, release) {
  // if (err) ... Failed to acquire the lock

  release(function(err) {
    // if (err) ... Failed to release
  });
});
```

Options can also be specified on a per mutex basis:

```
var client    = require('redis').createClient();
var redislock = require('redislock')(client);

// Specify options for use with a given lock
var options = {
  timeout: 10000,
  retries: 3,
  delay: 100
}

redislock.acquire(key, options, function(err, release) {
  // if (err) ... Failed to acquire the lock

  release(function(err) {
    // if (err) ... Failed to release
  });
});
```
