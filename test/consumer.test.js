'use strict';

const expect = require('chai').expect;
const request = require('request');
const randexp = require('randexp').randexp;

const Consumer = require('../index').Consumer;

const removeTopicFromAllNsqd = require('./helper').removeTopicFromAllNsqd;

describe('consumer', function () {
  this.timeout(5000);
  const send = (topic, msg, cb) => {
    const option = {
      uri: `http://127.0.0.1:9042/put?topic=${topic}`,
      method: 'POST',
      body: msg
    };
    request(option, (e, res, body) => {
      cb(e);
    });
  };

  it('should receive message successfully', (done) => {
    const topic = randexp(/Consume-([a-z]{8})/);
    send(topic, 'hello nsq', () => {
      const c = new Consumer(topic, 'ipsum', {
          lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
        });
      c.consume((msg) => {
        expect(msg.body.toString()).to.be.equal('hello nsq');
        msg.finish();
        removeTopicFromAllNsqd(topic, done);
      });
    });
  });

  it('should be able to requeu message', function(done) {
    const topic = randexp(/Consume-([a-z]{8})/);
    send(topic, 'test requeue', () => {
      const c = new Consumer(topic, 'sit', {
        lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
      });
      let n = 0;
      c.consume((msg) => {
        n++;
        expect(msg.body.toString()).to.be.equal('test requeue');
        if (n === 1) {
          msg.requeue(1500, false);
        }
        if (n === 2) {
          msg.finish();
          done();
        }
      });
    });
  });

});

