const Promise = require('bluebird');
const uuid = require('uuid');
const errors = require('./errors');
const scripts = require('./scripts');
const defaults = require('lodash.defaults');
const each = require('lodash.foreach');

const { LockAcquisitionError, LockReleaseError, LockExtendError } = errors;

// helper for using both ifaces
function promiseOrFunction(promise, fn) {
  if (typeof fn === 'function') {
    return promise.asCallback(fn);
  }

  // wrap promise so that we have bluebird 3 actions here
  return promise;
}

/**
 * @class Lock
 */
class Lock {

  /**
   * The constructor for a Lock object. Accepts both a redis client, as well as
   * an options object with the following properties: timeout, retries and delay.
   * Any options not supplied are subject to the current defaults.
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
  constructor(client, options) {
    this._id = uuid.v1();
    this._locked = false;
    this._key = null;

    this._setupClient(client);

    // Set properties based on defaults
    defaults(this, Lock._defaults);

    // Iterate over supplied options
    if (options && typeof options === 'object') {
      each(Lock._defaults, (value, key) => {
        if (key in options) {
          this[key] = options[key];
        }
      });
    }
  }

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
  acquire(key, fn) {
    const lock = this;

    if (lock._locked) {
      return promiseOrFunction(Promise.reject(new LockAcquisitionError('Lock already held')), fn);
    }

    const promise = lock._attemptLock(key, lock.retries)
      .then(() => {
        lock._locked = true;
        lock._key = key;
        Lock._acquiredLocks.add(lock);
        return null;
      })
      .catch((err) => {
        // Wrap redis errors
        if (!(err instanceof LockAcquisitionError)) {
          throw new LockAcquisitionError(err.message);
        }

        throw err;
      });

    return promiseOrFunction(promise, fn);
  }

  /**
   * Attempts to extend the lock, and accepts optional callback function
   * @param  {Number}   expire in `timeout` seconds
   * @param  {Function} fn
   * @return {Promise}
   */
  extend(_timeout, fn) {
    const lock = this;
    const key = this._key;
    const client = this._client;
    const time = _timeout || this.timeout;

    if (!time || time !== parseInt(time, 10)) {
      return promiseOrFunction(
        Promise.reject(new LockExtendError('Int time is required to extend lock')),
        fn
      );
    }

    if (!lock._locked) {
      return promiseOrFunction(
        Promise.reject(new LockExtendError('Lock has not been acquired')),
        fn
      );
    }

    const promise = client
      .pexpireifequal(key, lock._id, time)
      .then((res) => {
        if (res) {
          return;
        }

        lock._locked = false;
        lock._key = null;
        Lock._acquiredLocks.delete(lock);

        throw new LockExtendError(`Lock on "${key}" had expired`);
      })
      .catch((err) => {
        if (!(err instanceof LockExtendError)) {
          throw new LockExtendError(err.message);
        }

        throw err;
      });

    return promiseOrFunction(promise, fn);
  }

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
  release(fn) {
    const lock = this;
    const key = this._key;
    const client = this._client;

    if (!lock._locked) {
      return promiseOrFunction(
        Promise.reject(new LockReleaseError('Lock has not been acquired')),
        fn
      );
    }

    const promise = client
      .delifequal(key, lock._id)
      .then((res) => {
        lock._locked = false;
        lock._key = null;
        Lock._acquiredLocks.delete(lock);

        if (!res) {
          throw new LockReleaseError(`Lock on "${key}" had expired`);
        }

        return null;
      })
      .catch((err) => {
        // Wrap redis errors
        if (!(err instanceof LockReleaseError)) {
          throw new LockReleaseError(err.message);
        }

        throw err;
      });

    return promiseOrFunction(promise, fn);
  }

  /**
   * @private
   *
   * @param {RedisClient} client The ioredis client to store
   */
  _setupClient(client) {
    if (!client.delifequal) {
      client.defineCommand('delifequal', {
        lua: scripts.delifequal,
        numberOfKeys: 1,
      });
    }

    if (!client.pexpireifequal) {
      client.defineCommand('pexpireifequal', {
        lua: scripts.pexpireifequal,
        numberOfKeys: 1,
      });
    }

    this._client = client;
  }

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
  _attemptLock(key, retries) {
    const lock = this;
    const client = this._client;
    const ttl = this.timeout;

    return client
      .set(key, this._id, 'PX', ttl, 'NX')
      .then((res) => {
        if (!res && !retries) {
          throw new LockAcquisitionError(`Could not acquire lock on "${key}"`);
        } else if (res) {
          return null;
        }

        // Try the lock again after the configured delay
        return Promise
          .delay(lock.delay)
          .then(() => lock._attemptLock(key, retries - 1));
      });
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
Lock._acquiredLocks = new Set();

module.exports = Lock;
