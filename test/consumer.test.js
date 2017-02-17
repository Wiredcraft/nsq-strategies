'use strict';

const expect = require('chai').expect;
const request = require('request');
const randexp = require('randexp').randexp;

const Consumer = require('../index').Consumer;

const removeTopicFromAllNsqd = require('./helper').removeTopicFromAllNsqd;

describe('consumer', function() {
  this.timeout(5000);
  const send = (topic, msg, cb) => {
    const option = {
      uri: `http://localhost:9031/put?topic=${topic}`,
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
        lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
      });
      c.consume((msg) => {
        expect(msg.body.toString()).to.be.equal('hello nsq');
        msg.finish();
        removeTopicFromAllNsqd(topic, done);
      });
    });
  });

  it('should throw error if connect after auto connection', (done) => {
    const c = new Consumer('anytopic', 'ipsum', {
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011'],
      autoConnect: true
    });
    try {
      c.connect();
    } catch (e) {
      expect(e).to.exist;
      done();
    }
  });

  it('should receive message successfully with connect manuallly', (done) => {
    const topic = randexp(/Consume-([a-z]{8})/);
    send(topic, 'hello nsq', () => {
      const c = new Consumer(topic, 'ipsum', {
        lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011'],
        autoConnect: false
      });
      c.connect();
      c.consume((msg) => {
        expect(msg.body.toString()).to.be.equal('hello nsq');
        msg.finish();
        removeTopicFromAllNsqd(topic, done);
      });
    });
  });

  it('should be able to requeu message', function(done) {
    this.timeout(8000);
    const topic = randexp(/Consume-([a-z]{8})/);
    send(topic, 'test requeue', () => {
      const c = new Consumer(topic, 'sit', {
        lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
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
