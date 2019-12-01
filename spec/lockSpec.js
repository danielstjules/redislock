var expect     = require('expect.js');
var Promise    = require('bluebird');
var fakeredis  = require('fakeredis');
var proxyquire = require('proxyquire');

var helpers         = require('./redisHelpers');
var mockShavaluator = require('./mockShavaluator');
var redislock       = require('../lib/redislock');
var Lock            = proxyquire('../lib/lock', {
  // Mock out redis-evalsha to emulate the lua script in unit tests
  'redis-evalsha': mockShavaluator,
});

var LockAcquisitionError = redislock.LockAcquisitionError;
var LockReleaseError     = redislock.LockReleaseError;
var LockExtendError      = redislock.LockExtendError;

// Fakeredis doesn't support SET options such as PX and NX
var client = fakeredis.createClient(6379, '0.0.0.0', {fast: true});
helpers.addSetOptions(client);
Promise.promisifyAll(client);

describe('lock', function() {
  var lock;

  // Used to mock a Lock's acquire method
  var mockAcquire = function(lock) {
    lock.acquire = function(key, fn) {
      Lock._acquiredLocks[lock._id] = lock;
      lock._locked = true;
      lock._key = key;
      return client.setAsync(key, lock._id).asCallback(fn);
    };
  };

  // Used to mock a Lock's release method
  var mockRelease = function(lock) {
    lock.release = function(fn) {
      delete Lock._acquiredLocks[lock._id];
      return client.delAsync(lock._key).asCallback(fn);
    };
  };

  describe('constructor', function() {
    beforeEach(function() {
      lock = new Lock(client);
    });

    it('assigns the lock a UUID id', function() {
      var altLock = new Lock(client);

      expect(lock._id).to.have.length(36);
      expect(lock._id).not.to.be(altLock._id);
    });

    it('creates the lock with a null key, and locked set to false', function() {
      expect(lock._key).to.be(null);
      expect(lock._locked).to.be(false);
    });

    it('stores the redis client in its _client property', function() {
      expect(lock._client).to.be(client);
    });

    it('promisifies all required methods of the redis client', function() {
      var client = fakeredis.createClient(6379, '0.0.0.0', {fast: true});
      var lock = new Lock(client);

      expect(client).to.have.property('getAsync');
      expect(client).to.have.property('setAsync');
      expect(client).to.have.property('watchAsync');
    });

    it('sets properties to their defaults if not supplied', function() {
      expect(lock.timeout).to.be(Lock._defaults.timeout);
      expect(lock.retries).to.be(Lock._defaults.retries);
      expect(lock.delay).to.be(Lock._defaults.delay);
    });

    it('sets properties for any valid options', function() {
      var options = {
        timeout: 999,
        retries: 888,
        delay: 777
      };

      var lock = new Lock(client, options);

      expect(lock.timeout).to.be(options.timeout);
      expect(lock.retries).to.be(options.retries);
      expect(lock.delay).to.be(options.delay);
    });
  });

  describe('acquire', function() {
    beforeEach(function() {
      lock = new Lock(client);
      mockRelease(lock);
    });

    afterEach(function() {
      if (lock._key) {
        mockRelease(lock);
        return lock.release();
      }
    });

    it('returns a LockAcquisitionError if already locked', function() {
      return lock.acquire('test:key').then(function() {
        return lock.acquire('test:key');
      }).catch(LockAcquisitionError, function(err) {
        expect(err).to.be.an(LockAcquisitionError);
        expect(err.message).to.be('Lock already held');
      });
    });

    it('returns an error if retries is 0, and the key is not empty',function() {
      return client.setAsync('key:taken', 'aLockID').then(function() {
        return lock.acquire('key:taken');
      }).catch(LockAcquisitionError, function(err) {
        expect(err).to.be.an(LockAcquisitionError);
        expect(err.message).to.be('Could not acquire lock on "key:taken"');
      });
    });

    it('sets the locked property to true', function() {
      return lock.acquire('test:key').then(function() {
        expect(lock._locked).to.be(true);
      });
    });

    it('sets its key property to the given key', function() {
      var key = 'test:key';
      return lock.acquire(key).then(function() {
        expect(lock._key).to.be(key);
      });
    });

    it('adds the lock to Lock._acquiredLocks', function() {
      return lock.acquire('propertytest').then(function() {
        expect(Lock._acquiredLocks[lock._id]).to.be(lock);
      });
    });

    it('retries with the configured delay', function() {
      var key = 'retry:test';
      lock = new Lock(client, {
        timeout: 10000,
        retries: 1,
        delay:   10
      });

      setTimeout(function() {
        client.del(key);
      }, 9);

      return client.setAsync(key, 'testID').then(function(res) {
        return lock.acquire(key);
      });
    });

    it('performs infinite retries if set to -1', function() {
      var key = 'infiniteretry:test';
      lock = new Lock(client, {
        timeout: 10000,
        retries: -1,
        delay:   2
      });

      setTimeout(function() {
        client.del(key);
      }, 20);

      return client.setAsync(key, 'testID').then(function(res) {
        return lock.acquire(key);
      });
    });

    it('is compatible with callbacks', function(done) {
      lock.acquire('test:key', function(err) {
        if (err) return done(err);
        expect(lock._locked).to.be(true);
        done();
      });
    });
  });

  describe('release', function() {
    beforeEach(function() {
      lock = new Lock(client);
      mockAcquire(lock);
    });

    it('returns a LockReleaseError if not already locked', function() {
      return lock.release().catch(LockReleaseError, function(err) {
        expect(err).to.be.an(LockReleaseError);
        expect(err.message).to.be('Lock has not been acquired');
      });
    });

    it('sets _locked to false, and _key to null', function() {
      return lock.acquire('propertytest').then(function() {
        return lock.release();
      }).then(function() {
        expect(lock._locked).to.be(false);
        expect(lock._key).to.be(null);
      });
    });

    it('removes the lock from Lock._acquiredLocks', function() {
      return lock.acquire('propertytest').then(function() {
        expect(Lock._acquiredLocks[lock._id]).to.be(lock);
        return lock.release();
      }).then(function() {
        expect(Lock._acquiredLocks).to.be.empty();
      });
    });

    it('returns a LockReleaseError if the lock had expired', function() {
      return lock.acquire('expiredtest').then(function() {
        return client.delAsync('expiredtest');
      }).then(function() {
        return lock.release();
      }).catch(function(err) {
        expect(err).to.be.an(LockReleaseError);
        expect(err.message).to.be('Lock on "expiredtest" had expired');
      });
    });

    it('is compatible with callbacks', function(done) {
      lock.acquire('propertytest', function(err) {
        if (err) return done(err);

        lock.release(function(err) {
          if (err) return done(err);
          expect(lock._locked).to.be(false);
          expect(lock._key).to.be(null);
          done();
        });
      });
    });
  });

  describe('extend', function() {
    beforeEach(function() {
      lock = new Lock(client);
      mockAcquire(lock);
    });

    afterEach(function() {
      if (lock._key) {
        mockRelease(lock);
        return lock.release();
      }
    });

    it('returns a LockExtendError if not time is provided', function() {
      return lock.extend().catch(LockExtendError, function(err) {
        expect(err).to.be.an(LockExtendError);
        expect(err.message).to.be('Int time is required to extend lock');
      });
    });

    it('returns a LockExtendError if not provided an int', function() {
      return lock.extend('10').catch(LockExtendError, function(err) {
        expect(err).to.be.an(LockExtendError);
        expect(err.message).to.be('Int time is required to extend lock');
      });
    });

    it('returns a LockExtendError if not already locked', function() {
      return lock.extend(10).catch(LockExtendError, function(err) {
        expect(err).to.be.an(LockExtendError);
        expect(err.message).to.be('Lock has not been acquired');
      });
    });

    it('extends the pttl', function() {
      var key = 'extendtest';
      var time = 10000;

      return lock.acquire(key).then(function() {
        return lock.extend(time);
      }).then(function() {
        return client.pttlAsync(key);
      }).then(function(ttl) {
        // Compensate for delay
        expect(ttl).to.be.within(time - 100, time);
      });
    });

    it('returns a LockExtendError if the lock had expired', function() {
      var key = 'expiredtest';

      return lock.acquire(key).then(function() {
        return client.delAsync(key);
      }).then(function() {
        return lock.extend(10);
      }).catch(function(err) {
        expect(err).to.be.an(LockExtendError);
        expect(err.message).to.be('Lock on "expiredtest" had expired');
      });
    });

    it('is compatible with callbacks', function(done) {
      var key = 'extendtest';
      var time = 10000;
      var verify = function() {
        client.pttl(key, function(err, ttl) {
          if (err) return done(err);

          // Compensate for delay
          expect(ttl).to.be.within(time - 100, time);
          done();
        });
      };

      lock.acquire(key, function(err) {
        if (err) return done(err);

        lock.extend(time, function(err) {
          if (err) return done(err);

          verify();
        });
      });
    });
  });
});
