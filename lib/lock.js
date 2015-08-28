var Promise     = require('bluebird');
var uuid        = require('node-uuid');
var Shavaluator = require('redis-evalsha');
var errors      = require('./errors');
var scripts     = require('./scripts');

var LockAcquisitionError = errors.LockAcquisitionError;
var LockReleaseError     = errors.LockReleaseError;
var LockExtendError      = errors.LockExtendError;

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
  this._setupLuaScripts(client);

  // Set properties based on defaults
  for (key in Lock._defaults) {
    this[key] = Lock._defaults[key];
  }

  // Iterate over supplied options
  if (options && typeof options === 'object') {
    for (key in Lock._defaults) {
      if (key in options) this[key] = options[key];
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
  delay: 50
};

/**
 * An object holding redis clients used by the different locks. Helps avoid
 * having to invoke bluebird when a lock re-uses a client.
 *
 * @private
 */
Lock._promisifiedClients = {};

/**
 * An object holding instances of Shavaluator for running a lua script.
 *
 * @private
 */
Lock._shavaluators = {};

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
  var client = this._client;

  return new Promise(function(resolve, reject) {
    if (lock._locked) {
      return reject(new LockAcquisitionError('Lock already held'));
    }

    resolve(lock._attemptLock(key, lock.retries));
  }).then(function(res) {
    lock._locked = true;
    lock._key = key;
    Lock._acquiredLocks[lock._id] = lock;
  }).catch(function(err) {
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
 * @param {function} [fn] Optional callback to invoke
 *
 * @returns {Promise}
 */
Lock.prototype.release = function(fn) {
  var lock   = this;
  var key    = this._key;
  var shaval = this._shavaluator;

  return new Promise(function(resolve, reject) {
    if (!lock._locked) {
      return reject(new LockReleaseError('Lock has not been acquired'));
    }

    resolve(shaval.execAsync('delifequal', [key], [lock._id]));
  }).then(function(res) {
    lock._locked = false;
    lock._key = null;
    delete Lock._acquiredLocks[lock._id];

    // The key had already expired
    if (!res) {
      throw new LockReleaseError('Lock on "' + key + '" had expired');
    }
  }).catch(function(err) {
    // Wrap redis and shaval errors
    if (!(err instanceof LockReleaseError)) {
      err = new LockReleaseError(err.message);
    }

    throw err;
  }).nodeify(fn);
};

/**
 * Attempts to extend the timeout of a lock, and accepts an optional callback function.
 * The callback is invoked with an error on failure, and returns a promise
 * if no callback is supplied. If invoked in the context of a promise, it may
 * throw a LockExtendError.
 *
 * @param {int}      time The time in ms to extend this lock
 * @param {function} [fn] Optional callback to invoke
 *
 * @returns {Promise}
 */
Lock.prototype.extend = function(time, fn) {
  var lock   = this;
  var key    = this._key;
  var shaval = this._shavaluator;

  return new Promise(function(resolve, reject) {
    if (!time || time !== parseInt(time, 10)) {
      return reject(new LockExtendError('Int time is required to extend lock'));
    } else if (!lock._locked) {
      return reject(new LockExtendError('Lock has not been acquired'));
    }

    resolve(shaval.execAsync('pexpireifequal', [key], [lock._id, time]));
  }).then(function(res) {
    if (res) return;

    // The key had already expired
    lock._locked = false;
    lock._key = null;
    delete Lock._acquiredLocks[lock._id];

    throw new LockExtendError('Lock on "' + key + '" had expired');
  }).catch(function(err) {
    // Wrap redis and shaval errors
    if (!(err instanceof LockExtendError)) {
      err = new LockExtendError(err.message);
    }

    throw err;
  }).nodeify(fn);
};

/**
 * Invokes bluebird.promisify on a client's required commands if it does not
 * match a previously used redis client and does not have the necessary async
 * methods. Stores the result for use by the lock.
 *
 * @private
 *
 * @param {RedisClient} client The node_redis client to store
 */
Lock.prototype._setupClient = function(client) {
  // Ensure that RedisClient.connection_id exists
  if (!client.connection_id) {
    client.connection_id = uuid.v1();
  }

  // Set and return if the lock has already been used
  var id = client.connection_id;
  if (id in Lock._promisifiedClients) {
    this._client = Lock._promisifiedClients[id];
    return;
  }

  // Invoke promisify on required methods
  ['get', 'set', 'watch'].forEach(function(method) {
    var asyncMethod = method + 'Async';
    if (!client[asyncMethod]) {
      client[asyncMethod] = Promise.promisify(client[method]);
    }
  });

  Lock._promisifiedClients[id] = client;
  this._client = client;
};

/**
 * Attempts to find a previously created Shavaluator associated with the given
 * redis client, and if found, stores it as a property. Otherwise it creates
 * a new Shavaluator, invokes Bluebird's promisifyAll, and adds the required
 * lua script for 'delifequal' and 'pexpireifequal'.
 *
 * @param {RedisClient} client The node_redis client to use
 *
 * @returns {Shavaluator} The instance to use for running lua scripts
 */
Lock.prototype._setupLuaScripts = function(client) {
  var id = client.connection_id;

  if (!Lock._shavaluators[id]) {
    Lock._shavaluators[id] = new Shavaluator(client);
    Promise.promisifyAll(Lock._shavaluators[id]);
    Lock._shavaluators[id].add('delifequal', scripts.delifequal);
    Lock._shavaluators[id].add('pexpireifequal', scripts.pexpireifequal);
  }

  this._shavaluator = Lock._shavaluators[id];
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

  return client.setAsync(key, this._id, 'PX', ttl, 'NX').then(function(res) {
    if (!res && !retries) {
      throw new LockAcquisitionError('Could not acquire lock on "' + key + '"');
    } else if (res) {
      return;
    }

    // Try the lock again after the configured delay
    return Promise.delay(lock.delay).then(function() {
      return lock._attemptLock(key, retries - 1);
    });
  });
};

module.exports = Lock;
