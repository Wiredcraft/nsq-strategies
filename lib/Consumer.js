'use strict';

const nsq = require('nsqjs');
const debug = require('debug')('nsq-strategies:lib:consumer');

class Consumer {
  constructor(topic, channel, options) {
    options = options || {};
    if (typeof options.autoConnect === 'undefined') {
      //default is true
      options.autoConnect = true;
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
