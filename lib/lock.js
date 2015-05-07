'use strict';

var Promise     = require('bluebird');
var uuid        = require('node-uuid');
var errors      = require('./errors');
var scripts     = require('./scripts');

var LockAcquisitionError = errors.LockAcquisitionError;
var LockReleaseError     = errors.LockReleaseError;

/**
 * The constructor for a Lock object. Accepts both a redis client, as well as
 * an options object with the following properties: timeout, retries and delay.
 * Any options not supplied are subject to the current defaults.
 *
 * @constructor
 *
 * @param {RedisClient} client  The node_redis client to use
 * @param {object}      options
 *
 * @property {int} timeout Time in milliseconds before which a lock expires
 *                         (default: 10000 ms)
 * @property {int} retries Maximum number of retries in acquiring a lock if the
 *                         first attempt failed (default: 0)
 * @property {int} delay   Time in milliseconds to wait between each attempt
 *                         (default: 50 ms)
 */
function Lock(client, options) {
  var key;
  this._id = uuid.v1();
  this._locked = false;
  this._key = null;

  this._setupClient(client);

  // Set properties based on defaults
  for (key in Lock._defaults) {
    this[key] = Lock._defaults[key];
  }

  // Iterate over supplied options
  if (options && typeof options === 'object') {
    for (key in Lock._defaults) {
      if (key in options) {
        this[key] = options[key];
      }
    }
  }
}

/**
 * An object containing the default options used by each module instance.
 * Should not modified directly, but instead using setDefaults.
 *
 * @private
 */
Lock._defaults = {
  timeout: 10000,
  retries: 0,
  delay: 50,
};

/**
 * An object mapping UUIDs to the locks currently held by this module.
 *
 * @private
 */
Lock._acquiredLocks = {};

/**
 * Attempts to acquire a lock, given a key, and an optional callback function.
 * If the initial lock fails, additional attempts will be made for the
 * configured number of retries, and padded by the delay. The callback is
 * invoked with an error on failure, and returns a promise if no callback is
 * supplied. If invoked in the context of a promise, it may throw a
 * LockAcquisitionError.
 *
 * @param {string}   key  The redis key to use for the lock
 * @param {function} [fn] Optional callback to invoke
 *
 * @returns {Promise}
 */
Lock.prototype.acquire = function(key, fn) {
  var lock = this;

  if (lock._locked) {
    return Promise.reject(new LockAcquisitionError('Lock already held')).nodeify(fn);
  }

  return lock._attemptLock(key, lock.retries)
    .then(function () {
      lock._locked = true;
      lock._key = key;
      Lock._acquiredLocks[lock._id] = lock;
    })
    .catch(function(err) {
      // Wrap redis errors
      if (!(err instanceof LockAcquisitionError)) {
        err = new LockAcquisitionError(err.message);
      }

      throw err;
    }).nodeify(fn);

};

/**
 * Attempts to release the lock, and accepts an optional callback function.
 * The callback is invoked with an error on failure, and returns a promise
 * if no callback is supplied. If invoked in the context of a promise, it may
 * throw a LockReleaseError.
 *
 * @param {string}   key  The redis key to use for the lock
 * @param {function} [fn] Optional callback to invoke
 *
 * @returns {Promise}
 */
Lock.prototype.release = function(fn) {
  var lock   = this;
  var key    = this._key;
  var client = this._client;

  if (!lock._locked) {
    return Promise.reject(new LockReleaseError('Lock has not been acquired')).nodeify(fn);
  }

  return client.delifequal(key, lock._id)
    .then(function (res) {
      lock._locked = false;
      lock._key = null;
      delete Lock._acquiredLocks[lock._id];

      // The key had already expired
      if (!res) {
        return Promise.reject(new LockReleaseError('Lock on "' + key + '" had expired'));
      }

      return;
    })
    .catch(function (err) {
      // Wrap redis errors
      if (!(err instanceof LockReleaseError)) {
        err = new LockReleaseError(err.message);
      }

      return Promise.reject(err);
    }).nodeify(fn);

};

/**
 * Loads lua scripts and assigns conncetion id if it wasn't previously defined
 *
 * @private
 *
 * @param {RedisClient} client The ioredis client to store
 */
Lock.prototype._setupClient = function (client) {
  // Ensure that RedisClient.connection_id exists
  if (!client.connection_id) {
    client.connection_id = uuid.v1();
  }

  if (!client.delifequal) {
    client.defineCommand('delifequal', {
      lua: scripts.delifequal,
      numberOfKeys: 1
    });
  }

  this._client = client;
};

/**
 * Attempts to acquire the lock, and retries upon failure if the number of
 * remaining retries is greater than zero. Each attempt is padded by the
 * lock's configured retry delay.
 *
 * @param {string} key     The redis key to use for the lock
 * @param {int}    retries Number of remaining retries
 *
 * @returns {Promise}
 */
Lock.prototype._attemptLock = function(key, retries) {
  var lock   = this;
  var client = this._client;
  var ttl    = this.timeout;

  return client.set(key, this._id, 'PX', ttl, 'NX')
    .then(function (res) {
      if (!res && !retries) {
        return Promise.reject(new LockAcquisitionError('Could not acquire lock on "' + key + '"'));
      } else if (res) {
        return;
      }

      // Try the lock again after the configured delay
      return Promise.delay(lock.delay).then(function () {
        return lock._attemptLock(key, retries - 1);
      });
    });
};

module.exports = Lock;
