'use strict';

const expect = require('chai').expect;
const spawn = require('child_process').spawn;
const randexp = require('randexp').randexp;
const request = require('request');
const retry = require('retry');

const Producer = require('../index').Producer;
const removeTopicFromAllNsqd = require('./helper').removeTopicFromAllNsqd;

const runOnce = (callback) => {
  let count = 0;
  return (err) => {
    count++;
    if (err) {
      count = 2;
      return callback(err);
    }
    if (count === 2) {
      callback(err);
    }
  };
};

describe('producer', function() {
  this.timeout(5000);

  it('should be able to publish to single nsqd', function(done) {
    const topic = randexp(/Single-([a-z]{8})/);
    const p = new Producer({
      nsqdHost: '127.0.0.1',
      tcpPort: 9031
    });
    p.connect(() => {
      p.produce(topic, 'test producer', (err) => {
        if (err) { return done(err); }
        const nsqTail = spawn('nsq_tail', ['--lookupd-http-address=127.0.0.1:9011',
            `--topic=${topic}`, '-n', '1']);
        nsqTail.stdout.on('data', (data) => {
          expect(data.toString()).to.contain('test producer');
        });
        nsqTail.on('close', (code) => {
          removeTopicFromAllNsqd(topic, done);
        });
      });
    });
  });

  it('should be able to publish to lookup', function(done) {
    const topic = randexp(/Lookup-([a-z]{8})/);
    const p = new Producer({
      lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
    });
    p.connect(() => {
      p.produce(topic, 'test lookup', (err) => {
        if (err) { return done(err); }
        const nsqTail = spawn('nsq_tail', ['--lookupd-http-address=127.0.0.1:9011',
            `--topic=${topic}`, '-n', '1']);
        nsqTail.stdout.on('data', (data) => {
          if (data.toString().trim()) {//need remove \n
            expect(data.toString()).to.contain('test lookup');
          }
        });
        nsqTail.on('close', (code) => {
          removeTopicFromAllNsqd(topic, done);
        });
      });
    });
  });

  it('should be called with error if lookup fails', function(done) {
    const p = new Producer({
      lookupdHTTPAddresses: ['127.0.0.1:9091', '127.0.0.1:9092'] //non-existed lookupd
    });
    p.connect((errors) => {
      expect(errors).to.be.an('array');
      done();
    });
  });

  it('should be able to play round robin', function(done) {
    const topic = randexp(/Roundrobin-([a-z]{8})/);
    const p = new Producer({
      lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
    });
    const doneOnce = runOnce(() => {
      removeTopicFromAllNsqd(topic, done);
    });
    p.connect(() => {
      p.produce(topic, 'round1', (err) => {});
      p.produce(topic, 'round2', (err) => {});
      spawn('nsq_tail', ['--nsqd-tcp-address=127.0.0.1:9031',
          `--topic=${topic}`, '-n', '1'])
        .stdout.on('data', (data) => {
          if (data.toString().trim()) {//need remove \n
            expect(data.toString().trim()).to.contain('round');
          }
        })
        .on('close', (code) => {
          doneOnce(code);
        });
      spawn('nsq_tail', ['--nsqd-tcp-address=127.0.0.1:9032',
          `--topic=${topic}`, '-n', '1'])
        .stdout.on('data', (data) => {
          if (data.toString().trim()) {//need remove \n
            expect(data.toString().trim()).to.contain('round');
          }
        })
        .on('close', (code) => {
          doneOnce(code);
        });
    });
  });

  it('should be able to play fanout', function(done) {
    const topic = randexp(/Roundrobin-([a-z]{8})/);
    const p = new Producer({
      lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
    }, { strategy: Producer.FAN_OUT });
    const doneOnce = runOnce(() => {
      removeTopicFromAllNsqd(topic, done);
    });
    p.connect(() => {
      p.produce(topic, 'fanout message', (err) => {});
      spawn('nsq_tail', ['--nsqd-tcp-address=127.0.0.1:9031',
          `--topic=${topic}`, '-n', '1'])
        .stdout.on('data', (data) => {
          if (data.toString().trim()) {//need remove \n
            expect(data.toString().trim()).to.contain('fanout message');
          }
        })
        .on('close', (code) => {
          doneOnce(code);
        });
      spawn('nsq_tail', ['--nsqd-tcp-address=127.0.0.1:9032',
          `--topic=${topic}`, '-n', '1'])
        .stdout.on('data', (data) => {
          if (data.toString().trim()) {//need remove \n
            expect(data.toString().trim()).to.contain('fanout message');
          }
        })
        .on('close', (code) => {
          doneOnce(code);
        });
    });
  });

  describe('reconnect', function() {

    function startNsqd(callback) {
      const childProcess = spawn('nsqd', ['-broadcast-address=127.0.0.1', '-tcp-address=127.0.0.1:9033',
          '-http-address=127.0.0.1:9043', '-lookupd-tcp-address=127.0.0.1:9001',
          '-lookupd-tcp-address=127.0.0.1:9002', '-data-path=/tmp/nsq-data']);
      const operation = retry.operation({
        retries: 3,
        factor: 2,
        minTimeout: 500
      });
      operation.attempt((currentAttemps) => {
        request('http://127.0.0.1:9043/ping', (err, res, body) => {
          if (operation.retry(err)) {
            return;
          }
          callback(err ? operation.mainError() : null, childProcess);
        });
      });
    }

    it('should raise error when nsqd is gone', (done) => {
      const topic = randexp(/Reconnect-([a-z]{8})/);
      const p = new Producer({
        nsqdHost: '127.0.0.1',
        tcpPort: 9033
      });
      startNsqd((err, nsqd) => {
        p.connect(() => {
          p.produce(topic, 'message before reconnect', (err) => {
            if (err) { return done(err); }
            spawn('nsq_tail', ['--lookupd-http-address=127.0.0.1:9011',
                `--topic=${topic}`, '-n', '1'])
              .stdout.on('data', (data) => {
                data.toString().should.contain('message before reconnect');
              })
              .on('close', (code) => {
                nsqd.kill();
                setTimeout(() => {//wait connection closed
                  p.produce(topic, 'message after reconnect', (err) => {
                    expect(err.message).to.contain('No connections to nsqd');
                    removeTopicFromAllNsqd(topic, done);
                  });
                }, 500);
              });
          });
        });
      });
    });

    it('should be able to produce after reconnection', (done) => {
      const topic = randexp(/Reconnect-([a-z]{8})/);
      const p = new Producer({
        nsqdHost: '127.0.0.1',
        tcpPort: 9033
      });
      startNsqd((err, nsqd) => {
        p.connect((e) => {
          p.produce(topic, 'message before reconnect', (err) => {
            if (err) { return done(err); }
            nsqd.kill();
            startNsqd((e, newNsqd) => {
              setTimeout(() => { //wait to reconnection
                p.produce(topic, 'message after reconnect', (error) => {
                  expect(error).to.not.exist;
                  newNsqd.kill();
                  done();
                });
              }, 2000);
            });
          });
        });
      });

    });
  });

});

