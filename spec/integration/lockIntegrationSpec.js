/* global describe, beforeEach, afterEach, it */

/**
 * The following tests are designed to run against a live redis-server instance.
 */

const expect = require('expect.js');
const Redis = require('ioredis');
const client = new Redis();
const redislock = require('../../lib/redislock');

const LockAcquisitionError = redislock.LockAcquisitionError;
const LockReleaseError = redislock.LockReleaseError;
const LockExtendError = redislock.LockExtendError;

describe('lock', () => {
  const key = 'integration:test';
  let lock;

  beforeEach(() => {
    lock = redislock.createLock(client);
  });

  afterEach(done => {
    client.del(key, done);
  });

  it('can be used multiple times', () => {
    return lock.acquire(key).then(() => {
      return lock.release();
    }).then(() => {
      return lock.acquire(key);
    })
    .then(() => {
      return client.get(key);
    })
    .then(res => {
      expect(res).to.be(lock._id);
    });
  });

  describe('acquire', () => {
    it('sets the key if not held by another lock', () => {
      return lock
        .acquire(key)
        .then(() => client.get(key))
        .then(res => {
          expect(res).to.be(lock._id);
          expect(lock._locked).to.be(true);
          expect(lock._key).to.be(key);
        });
    });

    it('throws an error if the key is already in use', () => {
      const lock2 = redislock.createLock(client);

      return lock.acquire(key).then(() => {
        return lock2.acquire(key);
      }).catch(err => {
        expect(err).to.be.an(LockAcquisitionError);
        expect(err.message).to.be('Could not acquire lock on "integration:test"');
        expect(lock2._locked).to.be(false);
        expect(lock2._key).to.be(null);
      });
    });
  });

  describe('extend', () => {
    it('extends the lock if it has not expired', () => {
      return lock.acquire(key)
      .then(() => {
        return client.pttl(key);
      })
      .then(ttl => {
        expect(ttl).to.be.within(9900, 10000);
        return lock.extend(30000);
      })
      .then(() => {
        return client.pttl(key);
      })
      .then(ttl => {
        expect(ttl).to.be.within(29900, 30000);
      });
    });

    it('throw an error if the key no longer belongs to the lock', () => {
      return lock.acquire(key)
      .then(() => {
        return client.set(key, 'mismatch');
      })
      .then(() => {
        return lock.extend();
      })
      .catch(err => {
        expect(err).to.be.an(LockExtendError);
        expect(err.message).to.be('Lock on "integration:test" had expired');
        expect(lock._locked).to.be(false);
        expect(lock._key).to.be(null);
      });
    });
  });

  describe('release', () => {
    it('deletes the key if held by the current lock', () => {
      return lock.acquire(key).then(() => {
        return lock.release();
      })
      .then(() => {
        return client.get(key);
      })
      .then(res => {
        expect(res).to.be(null);
        expect(lock._locked).to.be(false);
        expect(lock._key).to.be(null);
      });
    });

    it('throws an error if the key no longer belongs to the lock', () => {
      return lock.acquire(key)
      .then(() => {
        return client.set(key, 'mismatch');
      })
      .then(() => {
        return lock.release();
      }).catch(err => {
        expect(err).to.be.an(LockReleaseError);
        expect(err.message).to.be('Lock on "integration:test" had expired');
        expect(lock._locked).to.be(false);
        expect(lock._key).to.be(null);
      });
    });
  });

  describe('extend', () => {
    it('extends the key ttl if held by the current lock', () => {
      return lock.acquire(key).then(() => {
        return lock.extend(10000);
      }).then(() => {
        return client.pttl(key);
      }).then(ttl => {
        // Compensate for delay
        expect(ttl).to.be.within(9000, 10000);
        return client.get(key);
      }).then(res => {
        expect(res).to.be(lock._id);
        expect(lock._locked).to.be(true);
        expect(lock._key).to.be(key);
      });
    });

    it('throws an error if the key no longer belongs to the lock', () => {
      lock.acquire(key).then(() => {
        return client.set(key, 'mismatch');
      }).then(() => {
        return lock.extend(10000);
      }).catch(err => {
        expect(err).to.be.an(LockExtendError);
        expect(err.message).to.be('Lock on "integration:test" had expired');
        expect(lock._locked).to.be(false);
        expect(lock._key).to.be(null);
      });
    });
  });
});
