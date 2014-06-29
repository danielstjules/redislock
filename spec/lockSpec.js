var expect    = require('expect.js');
var Promise   = require('bluebird');
var fakeredis = require('fakeredis');

var client = fakeredis.createClient(6379, '0.0.0.0', {fast: true});
Promise.promisifyAll(client);

var Lock = require('../lib/lock');

describe('lock', function() {
  describe('constructor', function() {
    var lock;

    beforeEach(function() {
      lock = new Lock(client);
    });

    it('assigns the lock a UUID id', function() {
      var altLock = new Lock(client);

      expect(lock.id).to.have.length(36);
      expect(lock.id).not.to.be(altLock.id);
    });

    it('creates the lock with a null key, and locked set to false', function() {
      expect(lock.key).to.be(null);
      expect(lock.locked).to.be(false);
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
});
