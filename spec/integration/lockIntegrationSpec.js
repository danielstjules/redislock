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

  describe('release', function() {
    it('deletes the key if held by the current lock', function(done) {
      lock.acquire(key)
      .then(function() {
        return client.getAsync(key);
      })
      .then(function(res) {
        expect(res).to.be(lock.id);
        return lock.release();
      })
      .then(function() {
        return client.getAsync(key);
      })
      .then(function(res) {
        expect(res).to.be(null);
        expect(lock.locked).to.be(false);
        expect(lock.key).to.be(null);
        done();
      })
      .catch(function(err) {
        done(err);
      });
    });

    it('throws an error if the key no longer belongs to the lock', function(done) {
      lock.acquire(key)
      .then(function() {
        return client.getAsync(key);
      })
      .then(function(res) {
        expect(res).to.be(lock.id);
        return client.setAsync(key, 'mismatch');
      })
      .then(function() {
        return lock.release();
      })
      .catch(function(err) {
        expect(err).to.be.an(LockReleaseError);
        expect(err.message).to.be('Lock on integration:test has expired');
        expect(lock.locked).to.be(false);
        expect(lock.key).to.be(null);
        done();
      });
    });
  });
});
