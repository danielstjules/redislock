var expect = require('expect.js');
var client = require('fakeredis').createClient(6379, '0.0.0.0', {fast: true});

var redislock = require('../lib/redislock');
var Lock      = require('../lib/lock');
var errors    = require('../lib/errors');

describe('redislock', function() {
  it('exports LockAcquisitionError', function() {
    expect(redislock.LockAcquisitionError).to.be(errors.LockAcquisitionError);
  });

  it('exports LockReleaseError', function() {
    expect(redislock.LockReleaseError).to.be(errors.LockReleaseError);
  });

  describe('createLock', function() {
    it('creates a new Lock instance', function() {
      var lock = redislock.createLock(client);
      expect(lock).to.be.a(Lock);
    });

    it('assigns the lock the passed redis client', function() {
      var lock = redislock.createLock(client);
      expect(lock._client).to.be(client);
    });

    it('passes any supplied options to the lock', function() {
      var options = {
        timeout: 999,
        retries: 888,
        delay: 777
      };

      var lock = redislock.createLock(client, options);

      expect(lock.timeout).to.be(options.timeout);
      expect(lock.retries).to.be(options.retries);
      expect(lock.delay).to.be(options.delay);
    });
  });

  describe('setDefaults', function() {
    var defaults = Object.create(Lock._defaults);

    afterEach(function() {
      Lock._defaults = defaults;
    });

    it('updates the supplied defaults', function() {
      var options = {
        timeout: 999,
        retries: 888
      };

      redislock.setDefaults(options);

      expect(Lock._defaults.timeout).to.be(options.timeout);
      expect(Lock._defaults.retries).to.be(options.retries);
      expect(Lock._defaults.delay).to.be(defaults.delay);
    });

    it('ignores unknown options', function() {
      redislock.setDefaults({
        invalid: 123098712,
        another: 23123
      });

      expect(Lock._defaults).to.eql(defaults);
    });
  });

  describe('getAcquiredLocks', function() {
    afterEach(function() {
      Lock._acquiredLocks = {};
    });

    it('returns an array of acquired locks', function() {
      var lock = {};
      Lock._acquiredLocks['lockID'] = lock;
      var locks = redislock.getAcquiredLocks();

      expect(locks).to.have.length(1);
      expect(locks[0]).to.be(lock);
    });
  });
});
