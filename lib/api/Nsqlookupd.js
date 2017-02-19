'use strict'

const Base = require('./Base');

module.exports = class Nsqlookupd extends Base {

  lookup(topic) {
    return this.get('lookup', { topic });
  }

  topics() {
    return this.get('topics');
  }

  channels(topic) {
    return this.get('channels', { topic });
  }

  nodes() {
    return this.get('nodes');
  }

};
