'use strict';

const request = require('request');

exports.removeTopicFromAllNsqd = (topic, cb) => {
  cb = cb || function() {};
  const nsqd = ['localhost:9021', 'localhost:9031'];
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
