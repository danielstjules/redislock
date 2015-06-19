var expect = require('expect.js');
var errors = require('../lib/errors');

describe('errors', function() {
  describe('LockAcquisitionError', function() {
    it('inherits from Error', function() {
      expect(new errors.LockAcquisitionError()).to.be.an(Error);
    });

    it('accepts a message', function() {
      var message = 'ErrorMessage';
      var error = new errors.LockAcquisitionError(message);

      expect(error.message).to.be(message);
    });
  });

  describe('LockReleaseError', function() {
    it('inherits from Error', function() {
      expect(new errors.LockReleaseError()).to.be.an(Error);
    });

    it('accepts a message', function() {
      var message = 'ErrorMessage';
      var error = new errors.LockReleaseError(message);

      expect(error.message).to.be(message);
    });
  });

  describe('LockExtendError', function() {
    it('inherits from Error', function() {
      expect(new errors.LockExtendError()).to.be.an(Error);
    });

    it('accepts a message', function() {
      var message = 'ErrorMessage';
      var error = new errors.LockExtendError(message);

      expect(error.message).to.be(message);
    });
  });
});
