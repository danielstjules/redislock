/**
 * Exports the required lua scripts to be loaded into redis.
 */

module.exports = {
  delifequal:
    "if redis.call('GET', KEYS[1]) == ARGV[1] then\n" +
    "  return redis.call('DEL', KEYS[1])\n" +
    "end\n" +
    "return 0",

  pexpireifequal:
    "if redis.call('GET', KEYS[1]) == ARGV[1] then\n" +
    "  return redis.call('PEXPIRE', KEYS[1], ARGV[2])\n" +
    "end\n" +
    "return 0"
};
