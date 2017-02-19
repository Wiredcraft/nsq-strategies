'use strict';

require('should');
const randexp = require('randexp').randexp;

const nsqdHTTPAddresses = 'http://localhost:9021';
const lookupdHTTPAddresses = 'http://localhost:9001';
const TOPIC = 'test';
// const CHANNEL = 'test';

const lib = require('../');

describe('API libs', () => {

  it('should be there', () => {
    lib.should.have.property('api').which.is.Object();
  });

  describe('Nsqd', () => {
    let Nsqd;
    let nsqd;

    it('should be there', () => {
      lib.should.have.property('api').which.is.Object();
      lib.api.should.have.property('Nsqd').which.is.Function();
      Nsqd = lib.api.Nsqd;
    });

    it('can build an instance', () => {
      nsqd = new Nsqd(nsqdHTTPAddresses);
    });

    it('can ping', () => {
      return nsqd.ping();
    });

    it('can create a topic', () => {
      return nsqd.createTopic(TOPIC);
    });

    it('can create a topic twice', () => {
      return nsqd.createTopic(TOPIC);
    });

    it('can empty a topic', () => {
      return nsqd.emptyTopic(TOPIC);
    });

    it('can empty a topic twice', () => {
      return nsqd.emptyTopic(TOPIC);
    });

    it('can delete a topic', () => {
      return nsqd.deleteTopic(TOPIC);
    });

    it('cannot delete a deleted topic', () => {
      return nsqd.deleteTopic(TOPIC).then(() => {
        throw new Error('expected an error');
      }, (err) => {
        err.should.have.property('statusCode', 404);
        err.should.have.property('message', 'TOPIC_NOT_FOUND');
      });
    });

    it('cannot empty a deleted topic', () => {
      return nsqd.emptyTopic(TOPIC).then(() => {
        throw new Error('expected an error');
      }, (err) => {
        err.should.have.property('statusCode', 404);
        err.should.have.property('message', 'TOPIC_NOT_FOUND');
      });
    });

    it('can publish', () => {
      return nsqd.publish(TOPIC, 'Lorem');
    });

    it('can empty a topic', () => {
      return nsqd.emptyTopic(TOPIC);
    });

  });

  describe('Nsqlookupd', () => {
    let Nsqlookupd;
    let nsqlookupd;

    it('should be there', () => {
      lib.should.have.property('api').which.is.Object();
      lib.api.should.have.property('Nsqlookupd').which.is.Function();
      Nsqlookupd = lib.api.Nsqlookupd;
    });

    it('can build an instance', () => {
      nsqlookupd = new Nsqlookupd(lookupdHTTPAddresses);
    });

    it('can ping', () => {
      return nsqlookupd.ping();
    });

    it('can lookup a topic', () => {
      return nsqlookupd.lookup(TOPIC).spread((res, body) => {
        body.should.be.Object();
        body.should.have.property('status_txt', 'OK');
      });
    });

    it('cannot lookup a wrong topic', () => {
      return nsqlookupd.lookup(randexp(/\w{8}/)).then(() => {
        throw new Error('expected an error');
      }, (err) => {
        err.should.have.property('statusCode', 500);
        err.should.have.property('status_txt', 'TOPIC_NOT_FOUND');
      });
    });

    it('can list all topics', () => {
      return nsqlookupd.topics().spread((res, body) => {
        body.should.be.Object();
        body.should.have.property('status_txt', 'OK');
      });
    });

    it('can list channels for a topic', () => {
      return nsqlookupd.channels(TOPIC).spread((res, body) => {
        body.should.be.Object();
        body.should.have.property('status_txt', 'OK');
      });
    });

    it('can list channels for a wrong topic', () => {
      return nsqlookupd.channels(randexp(/\w{8}/)).spread((res, body) => {
        body.should.be.Object();
        body.should.have.property('status_txt', 'OK');
      });
    });

    it('can list all nodes', () => {
      return nsqlookupd.nodes().spread((res, body) => {
        body.should.be.Object();
        body.should.have.property('status_txt', 'OK');
      });
    });

  });

});
