'use strict';

const expect = require('chai').expect;
const spawn = require('child_process').spawn;
const randexp = require('randexp').randexp;
const request = require('request');
const retry = require('retry');
const path = require('path');

const Producer = require('../index').Producer;
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

describe('producer', function() {

  it('should be able to publish to single nsqd', function(done) {
    const topic = randexp(/Single-([a-z]{8})/);
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030
    });
    p.connect(() => {
      p.produce(topic, 'test producer', (err) => {
        if (err) {
          return done(err);
        }
        const nsqTail = spawn('docker-compose', [
          `--file=${composeFile}`, 'run', '--rm', 'nsqd1', 'nsq_tail',
          `--topic=${topic}`, '-n', '1'
        ]);
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
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
    });
    p.connect(() => {
      p.produce(topic, 'test lookup', (err) => {
        if (err) {
          return done(err);
        }
        const nsqTail = spawn('docker-compose', [
          `--file=${composeFile}`, 'run', '--rm', 'nsqd1', 'nsq_tail',
          `--topic=${topic}`, '-n', '1'
        ]);
        nsqTail.stdout.on('data', (data) => {
          if (data.toString().trim()) { //need remove \n
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
      lookupdHTTPAddresses: ['localhost:9091', 'localhost:9092'] //non-existed lookupd
    });
    p.connect((errors) => {
      expect(errors).to.be.an('array');
      done();
    });
  });

  it('should be able to close', function(done) {
    const topic = randexp(/Close-([a-z]{8})/);
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
    });
    p.connect(() => {
      p.close();
      p.produce(topic, 'test pub after closed', (err) => {
        expect(err).to.exist;
        done();
      });
    });
  });

  it('should be able to play round robin', function(done) {
    const topic = randexp(/Roundrobin-([a-z]{8})/);
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
    });
    const doneOnce = runOnce(() => {
      removeTopicFromAllNsqd(topic, done);
    });
    p.connect(() => {
      p.produce(topic, 'round1', (err) => {});
      p.produce(topic, 'round2', (err) => {});
      spawn('docker-compose', [
          `--file=${composeFile}`, 'run', '--rm', 'nsqd1', 'nsq_tail',
          `--topic=${topic}`, '-n', '1'
        ])
        .stdout.on('data', (data) => {
          if (data.toString().trim()) { //need remove \n
            expect(data.toString().trim()).to.contain('round');
          }
        })
        .on('close', (code) => {
          doneOnce(code);
        });
      spawn('docker-compose', [
          `--file=${composeFile}`, 'run', '--rm', 'nsqd2', 'nsq_tail',
          `--topic=${topic}`, '-n', '1'
        ])
        .stdout.on('data', (data) => {
          if (data.toString().trim()) { //need remove \n
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
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
    }, { strategy: Producer.FAN_OUT });
    const doneOnce = runOnce(() => {
      removeTopicFromAllNsqd(topic, done);
    });
    p.connect(() => {
      p.produce(topic, 'fanout message', (err) => {});
      spawn('docker-compose', [
          `--file=${composeFile}`, 'run', '--rm', 'nsqd1', 'nsq_tail',
          `--topic=${topic}`, '-n', '1'
        ])
        .stdout.on('data', (data) => {
          if (data.toString().trim()) { //need remove \n
            expect(data.toString().trim()).to.contain('fanout message');
          }
        })
        .on('close', (code) => {
          doneOnce(code);
        });
      spawn('docker-compose', [
          `--file=${composeFile}`, 'run', '--rm', 'nsqd2', 'nsq_tail',
          `--topic=${topic}`, '-n', '1'
        ])
        .stdout.on('data', (data) => {
          if (data.toString().trim()) { //need remove \n
            expect(data.toString().trim()).to.contain('fanout message');
          }
        })
        .on('close', (code) => {
          doneOnce(code);
        });
    });
  });

  describe('Singleton', () => {

    it('should be able to publish', (done) => {
      const topic = randexp(/Single-([a-z]{8})/);
      const lookupdAddr = ['localhost:9001', 'localhost:9011'];
      const opt = { strategy: Producer.ROUND_ROBIN };
      Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt, (e, p) => {
        expect(e).to.be.not.exist;
        p.produce(topic, 'some message', (err) => {
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
      const topic = randexp(/Single-([a-z]{8})/);
      const lookupdAddr = ['localhost:9001', 'localhost:9011'];
      const opt = { strategy: Producer.ROUND_ROBIN };
      Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt, (e, p) => {
        p.produce(topic, 'some message', (err) => {
          expect(err).to.be.not.exist;
          p.produce(topic, 'some other message', (err2) => {
            expect(err2).to.be.not.exist;
            done();
          });
        });
      });
    });
  });

  describe('reconnect', function() {

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
      const topic = randexp(/Reconnect-([a-z]{8})/);
      const p = new Producer({
        nsqdHost: 'localhost',
        tcpPort: 9040
      });
      startNsqd((err) => {
        p.connect(() => {
          p.produce(topic, 'message before reconnect', (err) => {
            if (err) {
              return done(err);
            }
            spawn('docker-compose', [
              `--file=${composeFile}`, 'run', '--rm', 'nsqd3', 'nsq_tail',
              `--topic=${topic}`, '-n', '1'
            ]).stdout.on('data', (data) => {
              if (data.toString().trim()) {
                expect(data.toString().trim()).to.contain('message before reconnect');
              }
            }).on('close', (code) => {
              spawn('docker-compose', [
                `--file=${composeFile}`, 'stop', 'nsqd3'
              ]).on('close', () => {
                p.produce(topic, 'message after reconnect', (err) => {
                  expect(err.message).to.contain('No connections to nsqd');
                  p.close();
                  removeTopicFromAllNsqd(topic, done);
                });
              });
            });
          });
        });
      });
    });

    it('should be able to produce after reconnection', function(done) {
      const topic = randexp(/Reconnect-([a-z]{8})/);
      const p = new Producer({
        nsqdHost: 'localhost',
        tcpPort: 9040
      });
      startNsqd((err) => {
        p.connect((e) => {
          p.produce(topic, 'message before reconnect', (err) => {
            if (err) {
              return done(err);
            }
            spawn('docker-compose', [
              `--file=${composeFile}`, 'stop', 'nsqd3'
            ]).on('close', (code) => {
              startNsqd((e) => {
                setTimeout(() => { //wait to reconnection
                  p.produce(topic, 'message after reconnect', (error) => {
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

  describe('Producer strategies', function() {
    describe('connect nsqd directly', () => {
      it('should fail if retry is not set', (done) => {
        const topic = randexp(/Single-([a-z]{8})/);
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
          p.produce(topic, 'any message', { retry: true }, (err) => {
            expect(err).to.be.not.exist;
            done();
          });
        });
      });

      it('should be able to config retry strategy', (done) => {
        const topic = randexp(/Single-([a-z]{8})/);
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
          lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
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
          lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011']
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
