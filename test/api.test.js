'use strict';

require('should');
const randexp = require('randexp').randexp;

const nsqdHTTPAddress = 'http://localhost:9021';
const lookupdHTTPAddress = 'http://localhost:9001';
const lookupdHTTPAddresses = ['http://localhost:9001', 'http://localhost:9011'];
const TOPIC = randexp(/\w{8}/);
const CHANNEL = randexp(/\w{8}/);

const lib = require('../');

describe('API libs', () => {
  let Nsqd;
  let nsqd;

  it('should be there', () => {
    lib.should.have.property('api').which.is.Object();
  });

  describe('Nsqd', () => {
    it('should be there', () => {
      lib.should.have.property('api').which.is.Object();
      lib.api.should.have.property('Nsqd').which.is.Function();
      Nsqd = lib.api.Nsqd;
    });

    it('can build an instance', () => {
      nsqd = new Nsqd(nsqdHTTPAddress);
    });

    it('can ping', () => {
      return nsqd.ping();
    });

    it('can create a topic', () => {
      return nsqd.createTopic(TOPIC);
    });

    it('can create a created topic', () => {
      return nsqd.createTopic(TOPIC);
    });

    it('can empty a topic', () => {
      return nsqd.emptyTopic(TOPIC);
    });

    it('can empty an empty topic', () => {
      return nsqd.emptyTopic(TOPIC);
    });

    it('can delete a topic', () => {
      return nsqd.deleteTopic(TOPIC);
    });

    it('cannot delete a deleted topic', () => {
      return nsqd.deleteTopic(TOPIC).then(
        () => {
          throw new Error('expected an error');
        },
        err => {
          err.should.have.property('statusCode', 404);
          err.should.have.property('message', 'TOPIC_NOT_FOUND');
        }
      );
    });

    it('cannot empty a deleted topic', () => {
      return nsqd.emptyTopic(TOPIC).then(
        () => {
          throw new Error('expected an error');
        },
        err => {
          err.should.have.property('statusCode', 404);
          err.should.have.property('message', 'TOPIC_NOT_FOUND');
        }
      );
    });

    it('can create a topic', () => {
      return nsqd.createTopic(TOPIC);
    });

    it('can create a channel', () => {
      return nsqd.createChannel(TOPIC, CHANNEL);
    });

    it('can create a created channel', () => {
      return nsqd.createChannel(TOPIC, CHANNEL);
    });

    it('can empty a channel', () => {
      return nsqd.emptyChannel(TOPIC, CHANNEL);
    });

    it('can empty an empty channel', () => {
      return nsqd.emptyChannel(TOPIC, CHANNEL);
    });

    it('can delete a channel', () => {
      return nsqd.deleteChannel(TOPIC, CHANNEL);
    });

    it('cannot delete a deleted channel', () => {
      return nsqd.deleteChannel(TOPIC, CHANNEL).then(
        () => {
          throw new Error('expected an error');
        },
        err => {
          err.should.have.property('statusCode', 404);
          err.should.have.property('message', 'CHANNEL_NOT_FOUND');
        }
      );
    });

    it('cannot empty a deleted channel', () => {
      return nsqd.emptyChannel(TOPIC, CHANNEL).then(
        () => {
          throw new Error('expected an error');
        },
        err => {
          err.should.have.property('statusCode', 404);
          err.should.have.property('message', 'CHANNEL_NOT_FOUND');
        }
      );
    });

    it('can publish', () => {
      return nsqd.publish(TOPIC, 'Lorem');
    });

    it('can empty a topic', () => {
      return nsqd.emptyTopic(TOPIC);
    });
  });

  describe('Lookupd', () => {
    let Lookupd;
    let lookupd;

    before(() => {
      return nsqd.createChannel(TOPIC, CHANNEL);
    });

    after(() => {
      return nsqd.deleteChannel(TOPIC, CHANNEL).catchReturn();
    });

    it('should be there', () => {
      lib.should.have.property('api').which.is.Object();
      lib.api.should.have.property('Lookupd').which.is.Function();
      Lookupd = lib.api.Lookupd;
    });

    it('can build an instance', () => {
      lookupd = new Lookupd(lookupdHTTPAddress);
    });

    it('can ping', () => {
      return lookupd.ping();
    });

    it('can lookup a topic', () => {
      return lookupd.lookup(TOPIC).spread((res, body) => {
        body.should.be.Object();
        body.should.have.property('channels').which.is.Array();
        body.should.have.property('producers').which.is.Array();
      });
    });

    it('cannot lookup a wrong topic', () => {
      return lookupd.lookup(randexp(/\w{8}/)).then(
        () => {
          throw new Error('expected an error');
        },
        err => {
          err.should.have.property('statusCode', 404);
          err.should.have.property('message', 'TOPIC_NOT_FOUND');
        }
      );
    });

    it('can list all topics', () => {
      return lookupd.topics().spread((res, body) => {
        body.should.be.Object();
        body.should.have.property('topics').which.is.Array();
      });
    });

    it('can list channels for a topic', () => {
      return lookupd.channels(TOPIC).spread((res, body) => {
        body.should.be.Object();
        body.should.have.property('channels').which.is.Array();
      });
    });

    it('can list channels for a wrong topic', () => {
      return lookupd.channels(randexp(/\w{8}/)).spread((res, body) => {
        body.should.be.Object();
        body.should.have.property('channels').which.is.Array();
      });
    });

    it('can list all nodes', () => {
      return lookupd.nodes().spread((res, body) => {
        body.should.be.Object();
        body.should.have.property('producers').which.is.Array();
      });
    });

    it('can delete a channel', () => {
      return lookupd.deleteChannel(TOPIC, CHANNEL);
    });

    it('cannot delete a deleted channel', () => {
      return lookupd.deleteChannel(TOPIC, CHANNEL).then(
        () => {
          throw new Error('expected an error');
        },
        err => {
          err.should.have.property('statusCode', 404);
          err.should.have.property('message', 'CHANNEL_NOT_FOUND');
        }
      );
    });

    it('can delete a topic', () => {
      return lookupd.deleteTopic(TOPIC);
    });

    it('cannot lookup a deleted topic', () => {
      return lookupd.lookup(TOPIC).then(
        () => {
          throw new Error('expected an error');
        },
        err => {
          err.should.have.property('statusCode', 404);
          err.should.have.property('message', 'TOPIC_NOT_FOUND');
        }
      );
    });

    it('can delete a deleted topic', () => {
      return lookupd.deleteTopic(TOPIC);
    });
  });

  describe('LookupdCluster', () => {
    let LookupdCluster;
    let cluster;

    it('should be there', () => {
      lib.should.have.property('api').which.is.Object();
      lib.api.should.have.property('LookupdCluster').which.is.Function();
      LookupdCluster = lib.api.LookupdCluster;
    });

    it('can build an instance with one address', () => {
      cluster = new LookupdCluster(lookupdHTTPAddress);
    });

    it('can list all nodes', () => {
      return cluster.nodes().then(res => {
        res.should.be.Array().with.length(3);
      });
    });

    it('can build an instance with two addresses', () => {
      cluster = new LookupdCluster(lookupdHTTPAddresses);
    });

    it('can list all nodes', () => {
      return cluster.nodes().then(res => {
        res.should.be.Array().with.length(3);
      });
    });
  });
});
