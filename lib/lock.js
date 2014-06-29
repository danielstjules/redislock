var Promise = require('bluebird');
var uuid    = require('node-uuid');

/**
 * The constructor for a Lock object. Accepts both a redis client, as well as
 * an options object with the following properties: timeout, retries and delay.
 * Any options not supplied are subject to the current defaults.
 *
 * @constructor
 *
 * @param {RedisClient} client  The node_redis client to use
 * @param {object}      options
 */
function Lock(client, options) {
  var key;
  this.id = uuid.v1();
  this._client = client;

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
  delay: 100,
};

/**
 * An object mapping UUIDs to the locks currently held by this module.
 *
 * @private
 */
Lock._acquiredLocks = {};

/**
 * Attempts to acquire a lock, given a key, and an optional callback function.
 * The callback is invoked with an error on failure, and returns a promise
 * if no callback is supplied.
 *
 * @param {string}   key  The redis key to use for the lock
 * @param {function} [fn] Optional callback to invoke
 *
 * @returns {Promise} A promise with the saved tag on success
 */
Lock.prototype.acquire = function(key, fn) {
  var lock = this;
  Lock._activeLocks[lock.id] = lock;
};

/**
 * Attempts to release the lock, and accepts an optional callback function.
 * The callback is invoked with an error on failure, and returns a promise
 * if no callback is supplied.
 *
 * @param {string}   key  The redis key to use for the lock
 * @param {function} [fn] Optional callback to invoke
 *
 * @returns {Promise} A promise with the saved tag on success
 */
Lock.prototype.release = function(fn) {
  var lock = this;
  delete Lock._activeLocks[lock.id];
};

module.exports = Lock;
