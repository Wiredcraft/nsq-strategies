'use strict'

const Base = require('./Base');

module.exports = class Nsqd extends Base {

  publish(topic, message) {
    return this.post('pub', { topic }, message);
  }

  createTopic(topic) {
    return this.post('topic/create', { topic });
  }

  deleteTopic(topic) {
    return this.post('topic/delete', { topic });
  }

  emptyTopic(topic) {
    return this.post('topic/empty', { topic });
  }

  createChannel(topic, channel) {
    return this.post('channel/create', { topic, channel });
  }

  deleteChannel(topic, channel) {
    return this.post('channel/delete', { topic, channel });
  }

  emptyChannel(topic, channel) {
    return this.post('channel/empty', { topic, channel });
  }

};
