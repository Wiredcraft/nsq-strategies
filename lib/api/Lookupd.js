'use strict'

const Base = require('./Base');

module.exports = class Lookupd extends Base {

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

  deleteTopic(topic) {
    return this.post('topic/delete', { topic });
  }

  deleteChannel(topic, channel) {
    return this.post('channel/delete', { topic, channel });
  }

};
