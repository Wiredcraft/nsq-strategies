'use strict';

const expect = require('chai').expect;
// const request = require('request');
const randexp = require('randexp').randexp;

const lib = require('../');

const removeTopicFromAllNsqd = require('./helper').removeTopicFromAllNsqd;

const nsqdHTTPAddress = 'http://localhost:9031';
const lookupdHTTPAddresses = ['http://localhost:9001', 'http://localhost:9011'];

describe('Consumer', () => {
  let Consumer;
  let Nsqd;
  let nsqd;

  before(() => {
    Nsqd = lib.api.Nsqd;
    nsqd = new Nsqd(nsqdHTTPAddress);
  });

  it('should be there', () => {
    lib.should.have.property('Consumer').which.is.Function();
    Consumer = lib.Consumer;
  });

  it('should receive message successfully', (done) => {
    const topic = randexp(/Consume-([a-z]{8})/);
    nsqd.publish(topic, 'hello nsq').then(() => {
      const c = new Consumer(topic, 'ipsum', {
        lookupdHTTPAddresses
      });
      c.consume((msg) => {
        expect(msg.body.toString()).to.be.equal('hello nsq');
        msg.finish();
        removeTopicFromAllNsqd(topic, done);
      });
    }, done);
  });

  it('should throw error if connect after auto connection', (done) => {
    const c = new Consumer('anytopic', 'ipsum', {
      lookupdHTTPAddresses,
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
    nsqd.publish(topic, 'hello nsq').then(() => {
      const c = new Consumer(topic, 'ipsum', {
        lookupdHTTPAddresses,
        autoConnect: false
      });
      c.connect();
      c.consume((msg) => {
        expect(msg.body.toString()).to.be.equal('hello nsq');
        msg.finish();
        removeTopicFromAllNsqd(topic, done);
      });
    }, done);
  });

  it('should be able to requeu message', (done) => {
    const topic = randexp(/Consume-([a-z]{8})/);
    nsqd.publish(topic, 'test requeue').then(() => {
      const c = new Consumer(topic, 'sit', {
        lookupdHTTPAddresses
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
    }, done);
  });

});
