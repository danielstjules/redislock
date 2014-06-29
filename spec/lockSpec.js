var expect    = require('expect.js');
var Promise   = require('bluebird');
var fakeredis = require('fakeredis').createClient(6379, '0.0.0.0', {fast: true});
var client    = Promise.promisifyAll(fakeredis);

var redislock = require('../lib/redislock');

describe('lock', function() {
  describe('constructor', function() {
  });
});
