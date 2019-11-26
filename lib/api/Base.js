'use strict';

const debug = require('debug')('nsq-strategies:api');
const Promise = require('bluebird');
const Base = require('lib-rest').Base;

module.exports = class NsqBase extends Base {
  post(key, qs, json) {
    if (typeof json === 'string') {
      return this.api
        .post(key)
        .qs(qs)
        .json(false)
        .body(json)
        .request()
        .spread(this.errHandler)
        .then(this.betterBody, this.betterError);
    }
    return this.api
      .post(key)
      .qs(qs)
      .json(json)
      .request()
      .spread(this.errHandler)
      .then(this.betterBody, this.betterError);
  }

  get(key, qs) {
    return this.api
      .get(key)
      .qs(qs)
      .request()
      .spread(this.errHandler)
      .then(this.betterBody, this.betterError);
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
    return this.get('ping')
      .spread((res, body) => {
        debug('status:', body);
        return true;
      })
      .catch(err => {
        debug('error: %s', err);
        return Promise.delay(5000).then(() => {
          return this.ping(max);
        });
      });
  }

  /**
   * For backwards compatibilities.
   */
  betterError(err) {
    if (err.status_txt != null) {
      err.message = err.status_txt;
      if (err.status_txt.indexOf('NOT_FOUND') >= 0) {
        err.statusCode = err.status_code = 404;
      }
    }
    throw err;
  }

  /**
   * For backwards compatibilities.
   */
  betterBody(args) {
    if (args[1] != null && args[1].data != null) {
      args[1] = args[1].data;
    }
    return args;
  }
};
