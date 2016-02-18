/**
 * Contains the potential errors thrown by a lock.
 */

/**
 * The constructor for a LockAcquisitionError. Thrown or returned when a lock
 * could not be acquired.
 *
 * @constructor
 * @extends Error
 *
 * @param {string} message The message to assign the error
 */
class LockAcquisitionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LockAcquisitionError';
  }
}

/**
 * The constructor for a LockReleaseError. Thrown or returned when a lock
 * could not be released.
 *
 * @constructor
 * @extends Error
 *
 * @param {string} message The message to assign the error
 */
class LockReleaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LockReleaseError';
  }
}

/**
 * The constructor for a LockExtendError. Thrown or returned when a lock
 * could not be extended.
 *
 * @constructor
 * @extends Error
 *
 * @param {string} message The message to assign the error
 */
class LockExtendError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LockExtendError';
  }
}

exports.LockAcquisitionError = LockAcquisitionError;
exports.LockReleaseError = LockReleaseError;
exports.LockExtendError = LockExtendError;
