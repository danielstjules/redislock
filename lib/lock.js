var Promise = require('bluebird');
var uuid    = require('node-uuid');
var errors  = require('./errors');

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
 */
function Lock(client, options) {
  var key;
  this.id = uuid.v1();
  this._storeClient(client);

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
 * An object holding tuples of redis clients and their promisified form.
 * Helps avoid having to invoke bluebird when a lock re-uses a client.
 *
 * @private
 */
Lock._promisifiedClients = {};

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
  var client = this._client;
  this.key = key;

  return client.setAsync(key, this.id, 'PX', this.timeout, 'nx').then(function(res) {
    if (!res) {
      var error = new LockAcquisitionError('Could not acquire lock on ' + key);
      return Promise.reject(error);
    }

    Lock._activeLocks[lock.id] = lock;
  }).nodeify(fn);
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
  var client = this._client;

  return client.watchAsync(this.key).then(function() {
    return client.getAsync(this.key);
  }).then(function(val) {
    if (val !== lock.id) {
      var error = new LockReleaseError('Lock on ' + key + ' has expired ');
      return Promise.reject(error);
    }

    var multi = client.multi();
    multi.del(key);
    multi.exec(function(err, res) {
      if (err) return Promise.reject(err);

      // The key has either expired or been deleted
      Promise.resolve();
    });
  }).nodeify(fn);
};

/**
 * Invokes bluebird.promisifyAll on a client if it does not match a previously
 * used redis client. Stores the result for use by the lock.
 *
 * @private
 *
 * @param {RedisClient} client The node_redis client to store
 */
Lock.prototype._storeClient = function(client) {
  // Ensure that RedisClient.connection_id exists
  if (!client.connection_id) {
    client.connection_id = uuid.v1();
  }

  var id = client.connection_id;

  if (id in Lock._promisifiedClients) {
    this._client = Lock._promisifiedClients[id];
  } else {
    var promisifiedClient = Promise.promisifyAll(client);
    Lock._promisifiedClients[id] = promisifiedClient;
    this._client = promisifiedClient;
  }
};

module.exports = Lock;
