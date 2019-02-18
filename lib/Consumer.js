'use strict';

const nsq = require('nsqjs');
const debug = require('debug')('nsq-strategies:lib:consumer');
const { toArray } = require('./utils');

class Consumer {
  constructor(topic, channel, options) {
    options = options || {};
    if (options.autoConnect == null) {
      //default is true
      options.autoConnect = true;
    }
    if (typeof options.lookupdHTTPAddresses === 'string') {
      options.lookupdHTTPAddresses = toArray(options.lookupdHTTPAddresses);
    }
    this.opt = options;
    this.reader = new nsq.Reader(topic, channel, options);
    if (this.opt.autoConnect) {
      this.reader.connect();
    }
  }

  connect() {
    if (this.opt.autoConnect) {
      throw new Error('connect has been called');
    }
    this.reader.connect();
  }

  consume(fn) {
    this.reader.on('message', (msg) => {
      debug(msg);
      fn(msg);
    });
  }

  close() {
    this.reader.close();
  }

}
module.exports = Consumer;
