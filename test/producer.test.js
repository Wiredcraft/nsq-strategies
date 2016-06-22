'use strict';

const expect = require('chai').expect;
const spawn = require('child_process').spawn;
const randexp = require('randexp').randexp;
const request = require('request');
const retry = require('retry');
const fs = require('fs');

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
          if (data.toString().trim()) {
            expect(data.toString().trim()).to.contain('test producer');
          }
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
          '-lookupd-tcp-address=127.0.0.1:9002', '-data-path=/tmp/nsq-data-3']);
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

    before('mkdir for nsqd', (done) => {
      fs.mkdir('/tmp/nsq-data-3', (err) => {
        if (err) {
          if (err.code === 'EEXIST') {
            return done(); // ignore the error if the folder already exists
          }
          return done(err);
        }
        done();
      }) ;
    });

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
                if (data.toString().trim()) {
                  expect(data.toString().trim()).to.contain('message before reconnect');
                }
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

    it('should be able to produce after reconnection', function(done) {
      this.timeout(8000);
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

  describe('Retry produce', function() {
    describe('connect nsqd directly', () => {
      it('should fail if retry is not set', (done) => {
        const topic = randexp(/Single-([a-z]{8})/);
        const p = new Producer({
          nsqdHost: '127.0.0.1',
          tcpPort: 9031
        });
        p.connect((conErr, conns) => {
          //mock up publish
          conns.forEach(con => {
            con.publish = (topic, msg, cb) => {
              cb(new Error('selfmade publish error'));
            };
          });
          p.produce(topic, 'any message', (err) => {
            expect(err).to.be.exist;
            expect(err.message).to.be.equal('selfmade publish error');
            done();
          });
        });
      });

      it('should be able to retry', (done) => {
        const topic = randexp(/Single-([a-z]{8})/);
        const p = new Producer({
          nsqdHost: '127.0.0.1',
          tcpPort: 9031
        });
        p.connect((conErr, conns) => {
          //mock up publish
          let times = 0;
          conns.forEach(con => {
            con.publish = (topic, msg, cb) => {
              times++;
              if (times < 2) {
                cb(new Error('selfmade publish error')); //fail at the 1st time
              } else {
                cb(); //succeed at the 2nd time
              }
            };
          });
          p.produce(topic, 'any message', { retry: true }, (err) => {
            expect(err).to.be.not.exist;
            done();
          });
        });
      });

      it('should be able to config retry strategy', (done) => {
        const topic = randexp(/Single-([a-z]{8})/);
        const p = new Producer({
          nsqdHost: '127.0.0.1',
          tcpPort: 9031
        });
        p.connect((conErr, conns) => {
          //mock up publish
          let times = 0;
          conns.forEach(con => {
            con.publish = (topic, msg, cb) => {
              times++;
              if (times < 5) {
                cb(new Error('selfmade publish error'));
              } else {
                cb(); //succeed at the 5th times
              }
            };
          });
          const retryOpt = {
            retries: 3,
            minTimeout: 300
          };
          p.produce(topic, 'any message', { retry: retryOpt }, (err) => {
            expect(err).to.be.exist;
            expect(err.message).to.be.equal('selfmade publish error');
            done();
          });
        });
      });

    });

    describe('round robin strategy', () => {
      it('should fail if retry is not set', (done) => {
        const topic = randexp(/Single-([a-z]{8})/);
        const p = new Producer({
          lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
        }, { strategy: Producer.ROUND_ROBIN });
        p.connect((conErr, conns) => {
          //mock up publish
          conns.forEach(con => {
            con.publish = (topic, msg, cb) => {
              cb(new Error('selfmade publish error'));
            };
          });
          p.produce(topic, 'any message', (err) => {
            expect(err).to.be.exist;
            expect(err.message).to.be.equal('selfmade publish error');
            done();
          });
        });
      });

      it('should be able to retry', (done) => {
        const topic = randexp(/Single-([a-z]{8})/);
        const p = new Producer({
          lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
        }, { strategy: Producer.ROUND_ROBIN });
        p.connect((conErr, conns) => {
          //mock up publish
          let times = 0;
          conns.forEach(con => {
            con.publish = (topic, msg, cb) => {
              times++;
              if (times < 3) {
                cb(new Error('selfmade publish error')); //fail at the first 2 times
              } else {
                cb(); //succeed at the 3rd time
              }
            };
          });
          p.produce(topic, 'any message', { retry: true }, (err) => {
            expect(err).to.be.not.exist;
            done();
          });
        });
      });
    });

    describe('Fanout strategy', () => {
      it('should fail if retry is set, it`s not supported now', (done) => {
        const topic = randexp(/Single-([a-z]{8})/);
        const p = new Producer({
          lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
        }, { strategy: Producer.FAN_OUT });
        p.connect((conErr, conns) => {
          p.produce(topic, 'any message', { retry: true }, (err) => {
            expect(err).to.be.exist;
            expect(err.message).to.contain('not supported');
            done();
          });
        });
      });
    });

  });

});

