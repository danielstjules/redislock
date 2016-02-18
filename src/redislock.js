/**
 * redislock exposes a total of three functions: createLock, setDefaults,
 * and getActiveLocks.
 */

const Lock = require('./lock');
const errors = require('./errors');

/**
 * Returns a new Lock instance, configured for use with the supplied redis
 * client, as well as options, if provided.
 *
 * @param {RedisClient} client    The node_redis client to use
 * @param {object}      [options] Options to apply
 *
 * @return {Lock} A new lock object
 */
exports.createLock = function createLock(client, options) {
  return new Lock(client, options);
};

/**
 * Sets the default options to be used by any new lock created by redislock.
 * Only available options are modified, and all other keys are ignored.
 *
 * @param {object} options The options to set
 */
exports.setDefaults = function setDefaults(options = {}) {
  for (const key in Lock._defaults) {
    if (options[key] !== null && options[key] !== undefined) {
      Lock._defaults[key] = parseInt(options[key], 10);
    }
  }
};

/**
 * Returns an array of currently active/acquired locks.
 *
 * @return {Lock[]} An array of Lock objects
 */
exports.getAcquiredLocks = function getAcquiredLocks() {
  const locks = [];

  for (const lock of Lock._acquiredLocks) {
    locks.push(lock);
  }

  return locks;
};

/**
 * The constructor function for a LockAcquisitionError.
 */
exports.LockAcquisitionError = errors.LockAcquisitionError;

/**
 * The constructor function for a LockReleaseError.
 */
exports.LockReleaseError = errors.LockReleaseError;

/**
 * The constructor function for a LockExtendError
 */
exports.LockExtendError = errors.LockExtendError;
