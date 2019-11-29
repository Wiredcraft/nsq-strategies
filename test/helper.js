'use strict';

const Promise = require('bluebird');
const spawn = require('child_process').spawn;

const lib = require('../lib');
const Nsqd = lib.api.Nsqd;

const nsqd1 = new Nsqd('http://localhost:9021');
const nsqd2 = new Nsqd('http://localhost:9031');
const nsqd3 = new Nsqd('http://localhost:9041');

exports.removeTopicFromAllNsqd = function(topic, done) {
  return Promise.all([nsqd1.deleteTopic(topic), nsqd2.deleteTopic(topic), nsqd3.deleteTopic(topic)])
    .catchReturn([])
    .asCallback(done);
};

exports.nsqTail = function(containerName, topic, tcpAddress) {
  return spawn('docker', [
    'exec',
    containerName,
    'nsq_tail',
    `--nsqd-tcp-address=${tcpAddress}`,
    `--topic=${topic}`,
    '--n=1'
  ]);
};
