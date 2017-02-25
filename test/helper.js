'use strict';

const Promise = require('bluebird');
const spawn = require('child_process').spawn;

const lib = require('../lib');
const Nsqd = lib.api.Nsqd;

const nsqd1 = new Nsqd('http://localhost:9021');
const nsqd2 = new Nsqd('http://localhost:9031');

exports.removeTopicFromAllNsqd = function(topic, done) {
  return Promise.all([
    nsqd1.deleteTopic(topic),
    nsqd2.deleteTopic(topic)
  ]).catchReturn([]).asCallback(done);
};

exports.nsqTail = function(composeFile, containerName, topic) {
  return spawn('docker-compose', [
    `--file=${composeFile}`, 'run', '--rm', containerName,
    'nsq_tail', `--topic=${topic}`, '--n=1'
  ]);
};
