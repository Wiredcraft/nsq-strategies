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
    return this.post('delete_topic', { topic });
  }

  deleteChannel(topic, channel) {
    return this.post('delete_channel', { topic, channel });
  }

};
