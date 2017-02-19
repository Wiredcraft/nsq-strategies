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

};
