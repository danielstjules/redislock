/*
 * A mock module to substitute redis-evalsha and the resulting Shavaluators
 * objects.
 */

/**
 * The mock Shavaluator constructor. Accepts a node_redis client.
 *
 * @param {RedisClient} client A node_redis or fakeredis client
 */
function Shavaluator(client) {
  this.client = client;
  this.scripts = {};
}

Shavaluator.prototype.add = function(name, body) {
  this.scripts[name] = body;
};

Shavaluator.prototype.exec = function(name, keys, args, fn) {
  var shavaluator = this;
  if (!this.scripts[name]) {
    return fn(new Error('Script not found'));
  } else if (name === 'delifequal') {
    // See scripts.js delifequal
    this.client.get(keys[0], function(err, res) {
      if (res !== args[0]) return fn(null, 0);

      shavaluator.client.del(keys[0], function(err) {
        return fn(null, 1);
      });
    });
  } else if (name === 'pexpireifequal') {
    // See scripts.js pexpireifequal
    this.client.get(keys[0], function(err, res) {
      if (res !== args[0]) return fn(null, 0);

      shavaluator.client.pexpire(keys[0], args[1], function(err) {
        return fn(null, 1);
      });
    });
  }
};

module.exports = Shavaluator;
