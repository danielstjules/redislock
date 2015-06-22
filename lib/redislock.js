/**
 * redislock exposes a total of three functions: createLock, setDefaults,
 * and getActiveLocks.
 */

var Lock = require('./lock');
var errors = require('./errors');

/**
 * Returns a new Lock instance, configured for use with the supplied redis
 * client, as well as options, if provided.
 *
 * @param {RedisClient} client    The node_redis client to use
 * @param {object}      [options] Options to apply
 *
 * @return {Lock} A new lock object
 */
exports.createLock = function(client, options) {
  return new Lock(client, options);
};

/**
 * Sets the default options to be used by any new lock created by redislock.
 * Only available options are modified, and all other keys are ignored.
 *
 * @param {object} options The options to set
 */
exports.setDefaults = function(options) {
  options = options || {};

  for (var key in Lock._defaults) {
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
exports.getAcquiredLocks = function() {
  var locks = [];
  for (var key in Lock._acquiredLocks) {
    locks.push(Lock._acquiredLocks[key]);
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
 * The constructor function for a LockExtendError.
 */
exports.LockExtendError = errors.LockExtendError;
