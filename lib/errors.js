/**
 * Contains the potential errors thrown by a lock.
 */

var util = require('util');

/**
 * The constructor for a LockAcquisitionError. Thrown or returned when a lock
 * could not be acquired.
 *
 * @constructor
 * @extends Error
 *
 * @param {string} message The message to assign the error
 */
function LockAcquisitionError(message) {
  Error.captureStackTrace(this, LockAcquisitionError);
  this.name = 'LockAcquisitionError';
  this.message = message;
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
function LockReleaseError(message) {
  Error.captureStackTrace(this, LockReleaseError);
  this.name = 'LockReleaseError';
  this.message = message;
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
function LockExtendError(message) {
  Error.captureStackTrace(this, LockExtendError);
  this.name = 'LockExtendError';
  this.message = message;
}

util.inherits(LockAcquisitionError, Error);
util.inherits(LockReleaseError, Error);
util.inherits(LockExtendError, Error);

exports.LockAcquisitionError = LockAcquisitionError;
exports.LockReleaseError     = LockReleaseError;
exports.LockExtendError      = LockExtendError;
