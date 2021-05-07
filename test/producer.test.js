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

const Promise = require('bluebird');

const runCount = (c = 1, callback) => {
  let count = 0;
  return err => {
    count++;
    if (err) {
      count = 2;
      return callback(err);
    }
    if (count === c) {
      callback(err);
    }
  };
};

let topic;
const renewTopic = () => randexp(/\w{8}/);

describe('producer', () => {
  beforeEach(done => {
    removeTopicFromAllNsqd(topic, done);
  });

  afterEach(done => {
    removeTopicFromAllNsqd(topic, done);
  });

  it('should be able to publish to single nsqd', done => {
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030
    });
    topic = renewTopic();
    p.connect(() => {
      p.produce(topic, 'test producer', err => {
        if (err) {
          return done(err);
        }
        nsqTail('nsqd2', topic, '0.0.0.0:9030').stdout.on('data', data => {
          if (data.toString().trim()) {
            expect(data.toString().trim()).to.contain('test producer');
            done();
          }
        });
      });
    });
  });

  it('should be able to publish to single nsqd with promise style', done => {
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030
    });
    topic = renewTopic();
    p.connect().then(() => {
      p.produce(topic, 'test producer')
        .then(() => {
          nsqTail('nsqd2', topic, '0.0.0.0:9030').stdout.on('data', data => {
            if (data.toString().trim()) {
              expect(data.toString().trim()).to.contain('test producer');
              done();
            }
          });
        })
        .catch(done);
    });
  });

  it('should be able to publish delay msg', done => {
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030
    });
    topic = renewTopic();
    p.connect(() => {
      p.produce(topic, ['test delay'], { delay: 10000 }, err => {
        if (err) {
          return done(err);
        }
        nsqTail('nsqd2', topic, '0.0.0.0:9030').stdout.on('data', data => {
          if (data.toString().trim()) {
            expect(data.toString().trim()).to.contain('test delay');
            done();
          }
        });
      });
    });
  });

  it('should be able to publish delay msg and ignore invalid param', done => {
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030
    });
    topic = renewTopic();
    p.connect(() => {
      p.produce(topic, ['test delay invalid'], { delay: () => {} }, err => {
        if (err) {
          return done(err);
        }
        nsqTail('nsqd2', topic, '0.0.0.0:9030').stdout.on('data', data => {
          if (data.toString().trim()) {
            expect(data.toString().trim()).to.contain('test delay invalid');
            done();
          }
        });
      });
    });
  });

  it('should be able to publish to lookup', done => {
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
    });
    const runOnce = runCount(1, done);
    topic = renewTopic();
    p.connect(() => {
      p.produce(topic, 'test lookup', err => {
        if (err) {
          return done(err);
        }
        nsqTail('nsqd1', topic, '0.0.0.0:9020').stdout.on('data', data => {
          if (data.toString().trim()) {
            // need remove \n
            expect(data.toString()).to.contain('test lookup');
            runOnce();
          }
        });
        nsqTail('nsqd2', topic, '0.0.0.0:9030').stdout.on('data', data => {
          if (data.toString().trim()) {
            // need remove \n
            expect(data.toString()).to.contain('test lookup');
            runOnce();
          }
        });
        nsqTail('nsqd3', topic, '0.0.0.0:9040').stdout.on('data', data => {
          if (data.toString().trim()) {
            // need remove \n
            expect(data.toString()).to.contain('test lookup');
            done();
          }
        });
      });
    });
  });

  it('should be called with error if lookup fails', () => {
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9091', 'localhost:9092'] // non-existed lookupd
    });
    return p.connect().then(
      () => {
        throw new Error('expected an error');
      },
      err => {
        expect(err).to.exist;
      }
    );
  });

  it('should be able to receive comman slitted string', done => {
    const p = new Producer({
      lookupdHTTPAddresses: 'localhost:9001,localhost:9011'
    });
    p.connect(e => {
      expect(e).to.not.exist;
      done();
    });
  });

  it('should be able to close', done => {
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
    });
    p.connect(() => {
      p.close();
      p.produce(topic, 'test pub after closed', err => {
        expect(err).to.exist;
        done();
      });
    });
  });

  it('should be able to play round robin', done => {
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
    });
    topic = renewTopic();
    const doneOnce = runCount(1, done);
    p.connect(() => {
      p.produce(topic, 'round1', err => {});
      p.produce(topic, 'round2', err => {});
      nsqTail('nsqd1', topic, '0.0.0.0:9020').stdout.on('data', data => {
        if (data.toString().trim()) {
          // need remove \n
          expect(data.toString().trim()).to.contain('round');
          doneOnce();
        }
      });
      nsqTail('nsqd2', topic, '0.0.0.0:9030').stdout.on('data', data => {
        if (data.toString().trim()) {
          // need remove \n
          expect(data.toString().trim()).to.contain('round');
          doneOnce();
        }
      });
    });
  });

  it('should be able to play fanout', done => {
    const p = new Producer(
      {
        lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
      },
      { strategy: Producer.FAN_OUT }
    );
    topic = renewTopic();
    const doneTwice = runCount(2, done);
    p.connect(() => {
      p.produce(topic, 'fanout message', err => {});
      nsqTail('nsqd1', topic, '0.0.0.0:9020').stdout.on('data', data => {
        if (data.toString().trim()) {
          // need remove \n
          expect(data.toString().trim()).to.contain('fanout message');
          doneTwice();
        }
      });
      nsqTail('nsqd2', topic, '0.0.0.0:9030').stdout.on('data', data => {
        if (data.toString().trim()) {
          // need remove \n
          expect(data.toString().trim()).to.contain('fanout message');
          doneTwice();
        }
      });
    });
  });

  describe('Singleton', () => {
    beforeEach(done => {
      removeTopicFromAllNsqd(topic, done);
    });

    afterEach(done => {
      removeTopicFromAllNsqd(topic, done);
    });

    it('should be able to publish', done => {
      const lookupdAddr = ['localhost:9001', 'localhost:9011'];
      const opt = { strategy: Producer.ROUND_ROBIN };
      Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt, (e, p) => {
        expect(e).to.be.not.exist;
        p.produce(topic, 'some message', err => {
          expect(err).to.be.not.exist;
          done();
        });
      });
    });

    it('should be singleton', done => {
      const lookupdAddr = ['localhost:9001', 'localhost:9011'];
      const opt = { strategy: Producer.ROUND_ROBIN };
      Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt, (e, p1) => {
        Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt, (e, p2) => {
          expect(p1).to.be.deep.equal(p2);
          done();
        });
      });
    });

    it('should be able to publish twice', done => {
      const lookupdAddr = ['localhost:9001', 'localhost:9011'];
      const opt = { strategy: Producer.ROUND_ROBIN };
      Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt, (e, p) => {
        p.produce(topic, 'some message', err => {
          expect(err).to.be.not.exist;
          p.produce(topic, 'some other message', err2 => {
            expect(err2).to.be.not.exist;
            done();
          });
        });
      });
    });
  });

  describe('reconnect', () => {
    beforeEach(done => {
      removeTopicFromAllNsqd(topic, done);
      topic = renewTopic();
    });

    afterEach(done => {
      removeTopicFromAllNsqd(topic, done);
    });

    function startNsqd(callback) {
      spawn('docker-compose', [`--file=${composeFile}`, 'start', 'nsqd3']).on('close', () => {
        const operation = retry.operation({
          retries: 3,
          factor: 2,
          minTimeout: 500
        });
        operation.attempt(currentAttemps => {
          request('http://127.0.0.1:9041/ping', (err, res, body) => {
            if (operation.retry(err)) {
              return;
            }
            callback(err ? operation.mainError() : null);
          });
        });
      });
    }

    it('should raise error when nsqd is down and maximum retries are exhuasted', done => {
      const p = new Producer({
        nsqdHost: 'localhost',
        tcpPort: 9040
      });
      const errMsg = 'Failed to connect';
      const retryOpt = {
        retries: 3,
        minTimeout: 300
      };

      let retryTimes = 0;
      p.connect = () => {
        return new Promise((resolve, reject) => {
          retryTimes++;
          if (retryTimes < 5) {
            reject(new Error(errMsg));
          } else {
            resolve();
          }
        });
      };
      p.produce(topic, 'any message', { retry: retryOpt }, err => {
        expect(err).to.be.exist;
        expect(err.message).to.be.equal(errMsg);
        done();
      });
    });

    it('should be able to produce when nsqd is down and recovered before maximum retries are exhuasted', done => {
      const p = new Producer({
        nsqdHost: 'localhost',
        tcpPort: 9040
      });
      const errMsg = 'Failed to connect';
      const retryOpt = {
        retries: 3,
        minTimeout: 300
      };

      let retryTimes = 0;
      p.connect = () => {
        return new Promise((resolve, reject) => {
          retryTimes++;
          if (retryTimes < 2) {
            reject(new Error(errMsg));
          } else {
            resolve();
          }
        });
      };
      p._produce = (topic, msg, options, callback) => {
        return Promise.resolve();
      };
      p.produce(topic, 'any message', { retry: retryOpt }, err => {
        expect(err).not.to.be.exist;
        done();
      });
    });

    it('should be able to use default retry strategy when option.retry = true', done => {
      const p = new Producer({
        nsqdHost: 'localhost',
        tcpPort: 9040
      });
      const errMsg = 'Failed to connect';

      let retryTimes = 0;
      p.connect = () => {
        return new Promise((resolve, reject) => {
          retryTimes++;
          if (retryTimes < 3) {
            reject(new Error(errMsg));
          } else {
            resolve();
          }
        });
      };
      p._produce = (topic, msg, options, callback) => {
        return Promise.resolve();
      };
      p.produce(topic, 'any message', { retry: true }, err => {
        expect(err).not.to.be.exist;
        done();
      });
    });

    it('should be able to produce after reconnection', done => {
      const p = new Producer({
        nsqdHost: 'localhost',
        tcpPort: 9040
      });

      p.connect(e => {
        p.produce(topic, 'message before reconnect', err => {
          if (err) {
            return done(err);
          }
          spawn('docker-compose', [`--file=${composeFile}`, 'stop', 'nsqd3']).on('close', code => {
            startNsqd(e => {
              setTimeout(() => {
                // wait to reconnection
                p.produce(topic, 'message after reconnect', error => {
                  expect(error).to.not.exist;
                  done();
                });
              }, 10000); // 1st reconnect after 1 sec, then 2 sec later
            });
          });
        });
      });
    });
  });

  describe('Producer strategies', () => {
    describe('connect nsqd directly', () => {
      beforeEach(done => {
        removeTopicFromAllNsqd(topic, done);
      });

      afterEach(done => {
        removeTopicFromAllNsqd(topic, done);
      });

      it('should fail if retry is not set', done => {
        const p = new Producer({
          nsqdHost: 'localhost',
          tcpPort: 9030
        });
        p.connect((conErr, conns) => {
          // mock up publish
          conns.forEach(con => {
            con.publish = (topic, msg, cb) => {
              cb(new Error('selfmade publish error'));
            };
          });
          p.produce(topic, 'any message', err => {
            expect(err).to.be.exist;
            expect(err.message).to.be.equal('selfmade publish error');
            done();
          });
        });
      });

      it('should be able to retry', done => {
        const p = new Producer({
          nsqdHost: 'localhost',
          tcpPort: 9030
        });
        p.connect((conErr, conns) => {
          // mock up publish
          let times = 0;
          conns.forEach(con => {
            con.publish = (topic, msg, cb) => {
              times++;
              if (times < 2) {
                cb(new Error('selfmade publish error')); // fail at the 1st time
              } else {
                cb(); // succeed at the 2nd time
              }
            };
          });
          p.produce(topic, 'any message', { retry: true }, err => {
            expect(err).to.be.not.exist;
            done();
          });
        });
      });

      it('should be able to config retry strategy', done => {
        const p = new Producer({
          nsqdHost: 'localhost',
          tcpPort: 9030
        });
        p.connect((conErr, conns) => {
          // mock up publish
          let times = 0;
          conns.forEach(con => {
            con.publish = (topic, msg, cb) => {
              times++;
              if (times < 5) {
                cb(new Error('selfmade publish error'));
              } else {
                cb(); // succeed at the 5th times
              }
            };
          });
          const retryOpt = {
            retries: 3,
            minTimeout: 300
          };
          p.produce(topic, 'any message', { retry: retryOpt }, err => {
            expect(err).to.be.exist;
            expect(err.message).to.be.equal('selfmade publish error');
            done();
          });
        });
      });
    });

    describe('round robin strategy', () => {
      beforeEach(done => {
        removeTopicFromAllNsqd(topic, done);
      });

      afterEach(done => {
        removeTopicFromAllNsqd(topic, done);
      });

      it('should fail if retry is not set', done => {
        const p = new Producer(
          {
            lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
          },
          { strategy: Producer.ROUND_ROBIN }
        );
        p.connect((conErr, conns) => {
          // mock up publish
          conns.forEach(con => {
            con.publish = (topic, msg, cb) => {
              cb(new Error('selfmade publish error'));
            };
          });
          p.produce(topic, 'any message', err => {
            expect(err).to.be.exist;
            expect(err.message).to.be.equal('selfmade publish error');
            done();
          });
        });
      });

      it('should be able to retry', done => {
        const p = new Producer(
          {
            lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
          },
          { strategy: Producer.ROUND_ROBIN }
        );
        p.connect((conErr, conns) => {
          // mock up publish
          let times = 0;
          conns.forEach(con => {
            con.publish = (topic, msg, cb) => {
              times++;
              if (times < 3) {
                cb(new Error('selfmade publish error')); // fail at the first 2 times
              } else {
                cb(); // succeed at the 3rd time
              }
            };
          });
          p.produce(topic, 'any message', { retry: true }, err => {
            expect(err).to.be.not.exist;
            done();
          });
        });
      });
    });

    describe('Fanout strategy', () => {
      beforeEach(done => {
        removeTopicFromAllNsqd(topic, done);
      });

      afterEach(done => {
        removeTopicFromAllNsqd(topic, done);
      });

      it('should fail if retry is set, it`s not supported now', done => {
        const p = new Producer(
          {
            lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
          },
          { strategy: Producer.FAN_OUT }
        );
        p.connect((conErr, conns) => {
          p.produce(topic, 'any message', { retry: true }, err => {
            expect(err).to.be.exist;
            expect(err.message).to.contain('not supported');
            done();
          });
        });
      });
    });
  });
});
