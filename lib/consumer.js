'use strict';

const nsq = require('nsqjs');
const debug = require('debug')('ams-api:lib:consumer');

class Consumer {
  constructor(topic, channel, options) {
    this.reader = new nsq.Reader(topic, channel, options);
    this.reader.connect();
  }

  consume(fn) {
    this.reader.on('message', (msg) => {
      debug(msg);
      fn(msg);
    });
  }

}
module.exports = Consumer;
