var Promise     = require('bluebird');
var uuid        = require('node-uuid');
var Shavaluator = require('redis-evalsha');
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
 */
function Lock(client, options) {
  var key;
  this.id = uuid.v1();
  this.locked = false;
  this.key = null;

  this._setupClient(client);
  this._setupShavaluator(client);

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

  if (this.locked) {
    Promise.reject(new LockAcquisitionError('Lock already held'));
  }

  return client.setAsync(key, this.id, 'PX', this.timeout, 'nx').then(function(res) {
    if (!res) {
      var error = new LockAcquisitionError('Could not acquire lock on ' + key);
      return Promise.reject(error);
    }

    lock.locked = true;
    lock.key = key;

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
  var exec = this._shavaluator.execAsync;
  var key  = this.key;

  if (!this.locked) {
    Promise.reject(new LockReleaseError('Lock has not been acquired'));
  }

  return exec('delifequal', [key], [this.id]).then(function(res) {
    lock.locked = false;
    lock.key = null;

    // The key had already expired
    if (!res) {
      var error = new LockReleaseError('Lock on ' + key + ' has expired ');
      return Promise.reject(error);
    }

    return Promise.resolve();
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
 * lua script.
 *
 * @param {RedisClient} client The node_redis client to use
 *
 * @returns {Shavaluator} The instance to use for running lua scripts
 */
Lock.prototype._setupShavaluator = function(client) {
  var id = client.connection_id;

  if (!Lock._shavaluators[id]) {
    Lock._shavaluators[id] = new Shavaluator(client);
    Promise.promisifyAll(Lock._shavaluators[id]);
    Lock._shavaluators[id].add('delifequal', scripts.delifequal);
  }

  this._shavaluator = Lock._shavaluators[id];
};

module.exports = Lock;
