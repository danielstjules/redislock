/**
 * The following tests are designed to run against a live redis-server instance.
 */

var expect    = require('expect.js');
var Promise   = require('bluebird');
var client    = require('redis').createClient();
var redislock = require('../../lib/redislock');

var LockAcquisitionError = redislock.LockAcquisitionError;
var LockReleaseError     = redislock.LockReleaseError;
var LockExtendError      = redislock.LockExtendError;

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

  it('can be used multiple times', function() {
    return lock.acquire(key).then(function() {
      return lock.release();
    }).then(function() {
      return lock.acquire(key);
    }).then(function() {
      return client.getAsync(key);
    }).then(function(res) {
      expect(res).to.be(lock._id);
    });
  });

  describe('acquire', function() {
    it('sets the key if not held by another lock', function() {
      return lock.acquire(key).then(function() {
        return client.getAsync(key);
      }).then(function(res) {
        expect(res).to.be(lock._id);
        expect(lock._locked).to.be(true);
        expect(lock._key).to.be(key);
      });
    });

    it('throws an error if the key is already in use', function(done) {
      var lock2 = redislock.createLock(client);

      lock.acquire(key).then(function() {
        return lock2.acquire(key);
      }).catch(function(err) {
        expect(err).to.be.an(LockAcquisitionError);
        expect(err.message).to.be('Could not acquire lock on "integration:test"');
        expect(lock2._locked).to.be(false);
        expect(lock2._key).to.be(null);
        done();
      });
    });
  });

  describe('release', function() {
    it('deletes the key if held by the current lock', function() {
      return lock.acquire(key).then(function() {
        return lock.release();
      }).then(function() {
        return client.getAsync(key);
      }).then(function(res) {
        expect(res).to.be(null);
        expect(lock._locked).to.be(false);
        expect(lock._key).to.be(null);
      });
    });

    it('throws an error if the key no longer belongs to the lock', function(done) {
      lock.acquire(key).then(function() {
        return client.setAsync(key, 'mismatch');
      }).then(function() {
        return lock.release();
      }).catch(function(err) {
        expect(err).to.be.an(LockReleaseError);
        expect(err.message).to.be('Lock on "integration:test" had expired');
        expect(lock._locked).to.be(false);
        expect(lock._key).to.be(null);
        done();
      });
    });
  });

  describe('extend', function() {
    it('extends the key ttl if held by the current lock', function() {
      return lock.acquire(key).then(function() {
        return lock.extend(10000);
      }).then(function() {
        return client.pttlAsync(key);
      }).then(function(ttl) {
        // Compensate for delay
        expect(ttl).to.be.within(9000, 10000);
        return client.getAsync(key);
      }).then(function(res) {
        expect(res).to.be(lock._id);
        expect(lock._locked).to.be(true);
        expect(lock._key).to.be(key);
      });
    });

    it('throws an error if the key no longer belongs to the lock', function(done) {
      lock.acquire(key).then(function() {
        return client.setAsync(key, 'mismatch');
      }).then(function() {
        return lock.extend(10000);
      }).catch(function(err) {
        expect(err).to.be.an(LockExtendError);
        expect(err.message).to.be('Lock on "integration:test" had expired');
        expect(lock._locked).to.be(false);
        expect(lock._key).to.be(null);
        done();
      });
    });
  });
});
