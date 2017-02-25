'use strict'

const debug = require('debug')('nsq-strategies:api');
const Promise = require('bluebird');
const Base = require('lib-rest').Base;

module.exports = class NsqBase extends Base {

  post(key, qs, json) {
    return this.api.post(key).qs(qs).json(json).request().spread(this.errHandler);
  }

  get(key, qs) {
    return this.api.get(key).qs(qs).request().spread(this.errHandler);
  }

  /**
   * Recursively ping.
   */
  ping(max) {
    if (max == null) {
      max = 10;
    }
    debug('max', max);
    if (max-- <= 0) {
      return Promise.reject(new Error('pinged too many times'));
    }
    return this.get('ping').spread((res, body) => {
      debug('status:', body);
      return true;
    }).catch((err) => {
      debug('error: %s', err);
      return Promise.delay(5000).then(() => {
        return this.ping(max);
      });
    });
  }

};
