'use strict';

const request = require('request');

exports.removeTopicFromAllNsqd = (topic, cb) => {
  cb = cb || function() {};
  const nsqd = ['127.0.0.1:9041', '127.0.0.1:9042'];
  removeSingle(nsqd[0], () => {
    removeSingle(nsqd[1], cb);
  });

  function removeSingle(host, callback) {
    const option = {
      uri: `http://${host}/topic/delete?topic=${topic}`,
      method: 'POST'
    };
    request(option, (e, res, body) => {
      callback(e);
    });
  }
};

