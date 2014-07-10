/**
 * The following tests are designed to run against a live redis-server instance.
 */

var expect    = require('expect.js');
var Promise   = require('bluebird');
var client    = require('redis').createClient();
var redislock = require('../../lib/redislock');

var LockAcquisitionError = redislock.LockAcquisitionError;
var LockReleaseError     = redislock.LockReleaseError;

Promise.promisifyAll(client);

describe('lock', function() {
  var lock;
  var key = 'integration:test';

  beforeEach(function() {
    lock = redislock.createLock(client);
  });

  afterEach(function(done) {
    client.del(key, done);
  });

  it('can be used multiple times', function(done) {
    lock.acquire(key)
    .then(function() {
      return lock.release();
    })
    .then(function() {
      return lock.acquire(key);
    })
    .then(function() {
      return client.getAsync(key);
    })
    .then(function(res) {
      expect(res).to.be(lock._id);
      done();
    })
    .catch(function(err) {
      done(err);
    });
  });

  describe('acquire', function() {
    it('sets the key if not held by another lock', function(done) {
      lock.acquire(key)
      .then(function() {
        return client.getAsync(key);
      })
      .then(function(res) {
        expect(res).to.be(lock._id);
        expect(lock._locked).to.be(true);
        expect(lock._key).to.be(key);
        done();
      })
      .catch(function(err) {
        done(err);
      });
    });

    it('throws an error if the key is already in use', function(done) {
      var lock2 = redislock.createLock(client);

      lock.acquire(key)
      .then(function() {
        return lock2.acquire(key);
      })
      .catch(function(err) {
        expect(err).to.be.an(LockAcquisitionError);
        expect(err.message).to.be('Could not acquire lock on "integration:test"');
        expect(lock2._locked).to.be(false);
        expect(lock2._key).to.be(null);
        done();
      });
    });
  });

  describe('release', function() {
    it('deletes the key if held by the current lock', function(done) {
      lock.acquire(key)
      .then(function() {
        return lock.release();
      })
      .then(function() {
        return client.getAsync(key);
      })
      .then(function(res) {
        expect(res).to.be(null);
        expect(lock._locked).to.be(false);
        expect(lock._key).to.be(null);
        done();
      })
      .catch(function(err) {
        done(err);
      });
    });

    it('throws an error if the key no longer belongs to the lock', function(done) {
      lock.acquire(key)
      .then(function() {
        return client.setAsync(key, 'mismatch');
      })
      .then(function() {
        return lock.release();
      })
      .catch(function(err) {
        expect(err).to.be.an(LockReleaseError);
        expect(err.message).to.be('Lock on "integration:test" had expired');
        expect(lock._locked).to.be(false);
        expect(lock._key).to.be(null);
        done();
      });
    });
  });
});
