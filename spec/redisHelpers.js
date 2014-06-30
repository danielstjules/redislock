/**
 * A collection of functions used to help in testing redislock's interactions
 * with redis using fakeredis.
 */

var helpers = {};

/**
 * Tries to mimic support for SET command options such as EX, PX, NX, etc,
 * while avoiding the use of internal fakeredis APIs.
 *
 * @param {RedisClient} client The node_redis client for which to add support
 */
helpers.addSetOptions = function(client) {
  client.origSet = client.set;
  client.set = function(key, val) {
    var count = arguments.length;
    var fn = arguments[count - 1];

    if (count == 3) {
      return client.origSet(key, val, fn);
    }

    client.get(key, function(err, res) {
      if (err) return fn(err);
      if (res) return fn(null, 0);

      client.origSet(key, val, fn);
    });
  };
};

module.exports = helpers;
