'use strict';

const expect = require('chai').expect;
const spawn = require('child_process').spawn;
const randexp = require('randexp').randexp;
const request = require('request');
const retry = require('retry');
const path = require('path');

const Producer = require('../index').Producer;
const nsqTail = require('./helper').nsqTail;
const removeTopicFromAllNsqd = require('./helper').removeTopicFromAllNsqd;

const composeFile = path.resolve(__dirname, '../dockers/cluster/docker-compose.yml');

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

const TOPIC = randexp(/\w{8}/);

describe('producer', () => {

  beforeEach((done) => {
    removeTopicFromAllNsqd(TOPIC, done);
  });

  afterEach((done) => {
    removeTopicFromAllNsqd(TOPIC, done);
  });

  it('should be able to publish to single nsqd', (done) => {
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030
    });
    p.connect(() => {
      p.produce(TOPIC, 'test producer', (err) => {
        if (err) {
          return done(err);
        }
        nsqTail(composeFile, 'nsqd1', TOPIC).stdout.on('data', (data) => {
          if (data.toString().trim()) {
            expect(data.toString().trim()).to.contain('test producer');
          }
        }).on('close', done);
      });
    });
  });

  it('should be able to publish to lookup', (done) => {
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
    });
    p.connect(() => {
      p.produce(TOPIC, 'test lookup', (err) => {
        if (err) {
          return done(err);
        }
        nsqTail(composeFile, 'nsqd1', TOPIC).stdout.on('data', (data) => {
          if (data.toString().trim()) { //need remove \n
            expect(data.toString()).to.contain('test lookup');
          }
        }).on('close', done);
      });
    });
  });

  it('should be called with error if lookup fails', () => {
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9091', 'localhost:9092'] //non-existed lookupd
    });
    return p.connect().then(() => {
      throw new Error('expected an error');
    }, (err) => {
      expect(err).to.exist;
    });
  });

  it('should be able to close', (done) => {
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
    });
    p.connect(() => {
      p.close();
      p.produce(TOPIC, 'test pub after closed', (err) => {
        expect(err).to.exist;
        done();
      });
    });
  });

  it('should be able to play round robin', (done) => {
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
    });
    const doneOnce = runOnce(done);
    p.connect(() => {
      p.produce(TOPIC, 'round1', (err) => {});
      p.produce(TOPIC, 'round2', (err) => {});
      nsqTail(composeFile, 'nsqd1', TOPIC).stdout.on('data', (data) => {
        if (data.toString().trim()) { //need remove \n
          expect(data.toString().trim()).to.contain('round');
        }
      }).on('close', (code) => {
        doneOnce(code);
      });
      nsqTail(composeFile, 'nsqd2', TOPIC).stdout.on('data', (data) => {
        if (data.toString().trim()) { //need remove \n
          expect(data.toString().trim()).to.contain('round');
        }
      }).on('close', (code) => {
        doneOnce(code);
      });
    });
  });

  it('should be able to play fanout', (done) => {
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
    }, { strategy: Producer.FAN_OUT });
    const doneOnce = runOnce(done);
    p.connect(() => {
      p.produce(TOPIC, 'fanout message', (err) => {});
      nsqTail(composeFile, 'nsqd1', TOPIC).stdout.on('data', (data) => {
        if (data.toString().trim()) { //need remove \n
          expect(data.toString().trim()).to.contain('fanout message');
        }
      }).on('close', (code) => {
        doneOnce(code);
      });
      nsqTail(composeFile, 'nsqd2', TOPIC).stdout.on('data', (data) => {
        if (data.toString().trim()) { //need remove \n
          expect(data.toString().trim()).to.contain('fanout message');
        }
      }).on('close', (code) => {
        doneOnce(code);
      });
    });
  });

  describe('Singleton', () => {

    beforeEach((done) => {
      removeTopicFromAllNsqd(TOPIC, done);
    });

    afterEach((done) => {
      removeTopicFromAllNsqd(TOPIC, done);
    });

    it('should be able to publish', (done) => {
      const lookupdAddr = ['localhost:9001', 'localhost:9011'];
      const opt = { strategy: Producer.ROUND_ROBIN };
      Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt, (e, p) => {
        expect(e).to.be.not.exist;
        p.produce(TOPIC, 'some message', (err) => {
          expect(err).to.be.not.exist;
          done();
        });
      });
    });

    it('should be singleton', (done) => {
      const lookupdAddr = ['localhost:9001', 'localhost:9011'];
      const opt = { strategy: Producer.ROUND_ROBIN };
      Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt, (e, p1) => {
        Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt, (e, p2) => {
          expect(p1).to.be.deep.equal(p2);
          done();
        });
      });
    });

    it('should be able to publish twice', (done) => {
      const lookupdAddr = ['localhost:9001', 'localhost:9011'];
      const opt = { strategy: Producer.ROUND_ROBIN };
      Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt, (e, p) => {
        p.produce(TOPIC, 'some message', (err) => {
          expect(err).to.be.not.exist;
          p.produce(TOPIC, 'some other message', (err2) => {
            expect(err2).to.be.not.exist;
            done();
          });
        });
      });
    });
  });

  describe('reconnect', () => {

    beforeEach((done) => {
      removeTopicFromAllNsqd(TOPIC, done);
    });

    afterEach((done) => {
      removeTopicFromAllNsqd(TOPIC, done);
    });

    function startNsqd(callback) {
      spawn('docker-compose', [
        `--file=${composeFile}`, 'start', 'nsqd3'
      ]);
      const operation = retry.operation({
        retries: 3,
        factor: 2,
        minTimeout: 500
      });
      operation.attempt((currentAttemps) => {
        request('http://localhost:9041/ping', (err, res, body) => {
          if (operation.retry(err)) {
            return;
          }
          callback(err ? operation.mainError() : null);
        });
      });
    }

    before('stop nsqd', (done) => {
      spawn('docker-compose', [
        `--file=${composeFile}`, 'stop', 'nsqd3'
      ]).on('close', done);
    });

    it('should raise error when nsqd is gone', (done) => {
      const p = new Producer({
        nsqdHost: 'localhost',
        tcpPort: 9040
      });
      startNsqd((err) => {
        p.connect(() => {
          p.produce(TOPIC, 'message before reconnect', (err) => {
            if (err) {
              return done(err);
            }
            nsqTail(composeFile, 'nsqd3', TOPIC).stdout.on('data', (data) => {
              if (data.toString().trim()) {
                expect(data.toString().trim()).to.contain('message before reconnect');
              }
            }).on('close', (code) => {
              spawn('docker-compose', [
                `--file=${composeFile}`, 'stop', 'nsqd3'
              ]).on('close', () => {
                p.produce(TOPIC, 'message after reconnect', (err) => {
                  expect(err.message).to.contain('No connections to nsqd');
                  p.close();
                  done();
                });
              });
            });
          });
        });
      });
    });

    it('should be able to produce after reconnection', (done) => {
      const p = new Producer({
        nsqdHost: 'localhost',
        tcpPort: 9040
      });
      startNsqd((err) => {
        p.connect((e) => {
          p.produce(TOPIC, 'message before reconnect', (err) => {
            if (err) {
              return done(err);
            }
            spawn('docker-compose', [
              `--file=${composeFile}`, 'stop', 'nsqd3'
            ]).on('close', (code) => {
              startNsqd((e) => {
                setTimeout(() => { //wait to reconnection
                  p.produce(TOPIC, 'message after reconnect', (error) => {
                    expect(error).to.not.exist;
                    spawn('docker-compose', [
                      `--file=${composeFile}`, 'stop', 'nsqd3'
                    ]);
                    done();
                  });
                }, 6000); //1st reconnect after 1 sec, then 2 sec later
              });
            });
          });
        });
      });

    });
  });

  describe('Producer strategies', () => {
    describe('connect nsqd directly', () => {

      beforeEach((done) => {
        removeTopicFromAllNsqd(TOPIC, done);
      });

      afterEach((done) => {
        removeTopicFromAllNsqd(TOPIC, done);
      });

      it('should fail if retry is not set', (done) => {
        const p = new Producer({
          nsqdHost: 'localhost',
          tcpPort: 9030
        });
        p.connect((conErr, conns) => {
          //mock up publish
          conns.forEach(con => {
            con.publish = (topic, msg, cb) => {
              cb(new Error('selfmade publish error'));
            };
          });
          p.produce(TOPIC, 'any message', (err) => {
            expect(err).to.be.exist;
            expect(err.message).to.be.equal('selfmade publish error');
            done();
          });
        });
      });

      it('should be able to retry', (done) => {
        const p = new Producer({
          nsqdHost: 'localhost',
          tcpPort: 9030
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
          p.produce(TOPIC, 'any message', { retry: true }, (err) => {
            expect(err).to.be.not.exist;
            done();
          });
        });
      });

      it('should be able to config retry strategy', (done) => {
        const p = new Producer({
          nsqdHost: 'localhost',
          tcpPort: 9030
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
          p.produce(TOPIC, 'any message', { retry: retryOpt }, (err) => {
            expect(err).to.be.exist;
            expect(err.message).to.be.equal('selfmade publish error');
            done();
          });
        });
      });

    });

    describe('round robin strategy', () => {

      beforeEach((done) => {
        removeTopicFromAllNsqd(TOPIC, done);
      });

      afterEach((done) => {
        removeTopicFromAllNsqd(TOPIC, done);
      });

      it('should fail if retry is not set', (done) => {
        const p = new Producer({
          lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
        }, { strategy: Producer.ROUND_ROBIN });
        p.connect((conErr, conns) => {
          //mock up publish
          conns.forEach(con => {
            con.publish = (topic, msg, cb) => {
              cb(new Error('selfmade publish error'));
            };
          });
          p.produce(TOPIC, 'any message', (err) => {
            expect(err).to.be.exist;
            expect(err.message).to.be.equal('selfmade publish error');
            done();
          });
        });
      });

      it('should be able to retry', (done) => {
        const p = new Producer({
          lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
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
          p.produce(TOPIC, 'any message', { retry: true }, (err) => {
            expect(err).to.be.not.exist;
            done();
          });
        });
      });
    });

    describe('Fanout strategy', () => {

      beforeEach((done) => {
        removeTopicFromAllNsqd(TOPIC, done);
      });

      afterEach((done) => {
        removeTopicFromAllNsqd(TOPIC, done);
      });

      it('should fail if retry is set, it`s not supported now', (done) => {
        const p = new Producer({
          lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
        }, { strategy: Producer.FAN_OUT });
        p.connect((conErr, conns) => {
          p.produce(TOPIC, 'any message', { retry: true }, (err) => {
            expect(err).to.be.exist;
            expect(err.message).to.contain('not supported');
            done();
          });
        });
      });
    });

  });

});
