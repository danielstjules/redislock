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

util.inherits(LockAcquisitionError, Error);
util.inherits(LockReleaseError, Error);

exports.LockAcquisitionError = LockAcquisitionError;
exports.LockReleaseError     = LockReleaseError;
