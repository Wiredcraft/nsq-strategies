'use strict';

const should = require('chai').should();
const request = require('request');
const spawn = require('child_process').spawn;

const Consumer = require('../index').Consumer;
const Producer = require('../index').Producer;

const removeTopic = (topic, nsqd, cb) => {
  cb = cb || function() {};
  const option = {
    uri: `http://${nsqd}/topic/delete?topic=${topic}`,
    method: 'POST'
  };
  request(option, (e, res, body) => {
    cb(e);
  });
};

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

describe('msg queue', () => {

  describe('consumer', () => {
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

    after('delete topic', (done) => {
      removeTopic('lorem', '127.0.0.1:9042');
      removeTopic('dolor', '127.0.0.1:9042', done);
    });

    it('should receive message successfully', (done) => {
      send('lorem', 'hello nsq', () => {
        const c = new Consumer('lorem', 'ipsum', {
            lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
          });
        c.consume((msg) => {
          msg.body.toString().should.be.equal('hello nsq');
          msg.finish();
          done();
        });
      });
    });

    it('should be able to requeu message', function(done) {
      this.timeout(5000);
      send('dolor', 'test requeue', () => {
        const c = new Consumer('dolor', 'sit', {
          lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
        });
        let n = 0;
        c.consume((msg) => {
          n++;
          msg.body.toString().should.be.equal('test requeue');
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

  describe('producer', function() {
    this.timeout(5000);
    after('delete topic', (done) => {
      removeTopic('amet', '127.0.0.1:9041');
      removeTopic('amet', '127.0.0.1:9042', done);
    });

    it('should be able to publish to single nsqd', function(done) {
      const p = new Producer({
        nsqdHost: '127.0.0.1',
        tcpPort: 9031
      });
      p.connect(() => {
        p.produce('amet', 'test producer', (err) => {
          if (err) return done(err);
          const nsqTail = spawn('nsq_tail', ['--lookupd-http-address=127.0.0.1:9011',
              '--topic=amet', '-n', '1']);
          nsqTail.stdout.on('data', (data) => {
            data.toString().should.be.equal('test producer\n');
          });
          nsqTail.on('close', (code) => {
            done(code);
          });
        });
      });
    });

    it('should be able to publish to lookup', function(done) {
      const p = new Producer({
        lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
      });
      p.connect(() => {
        p.produce('amet', 'test producer', (err) => {
          if (err) return done(err);
          const nsqTail = spawn('nsq_tail', ['--lookupd-http-address=127.0.0.1:9011',
              '--topic=amet', '-n', '1']);
          nsqTail.stdout.on('data', (data) => {
            data.toString().should.be.equal('test producer\n');
          });
          nsqTail.on('close', (code) => {
            done(code);
          });
        });
      });
    });

    it('should be called with error if lookup fails', function(done) {
      const p = new Producer({
        lookupdHTTPAddresses: ['127.0.0.1:9091', '127.0.0.1:9092'] //non-existed lookupd
      });
      p.connect((errors) => {
        errors.should.be.an('array');
        done();
      });
    });

    it('should be able to play round robin', function(done) {
      const p = new Producer({
        lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
      });
      const doneOnce = runOnce(done);
      p.connect(() => {
        p.produce('amet', 'round1', (err) => {});
        p.produce('amet', 'round2', (err) => {});
        spawn('nsq_tail', ['--nsqd-tcp-address=127.0.0.1:9031',
            '--topic=amet', '-n', '1'])
          .stdout.on('data', (data) => {
            data.toString().should.contain('round');
          })
          .on('close', (code) => {
            doneOnce(code);
          });
        spawn('nsq_tail', ['--nsqd-tcp-address=127.0.0.1:9032',
            '--topic=amet', '-n', '1'])
          .stdout.on('data', (data) => {
            data.toString().should.contain('round');
          })
          .on('close', (code) => {
            doneOnce(code);
          });
      });
    });

    it('should be able to play fanout', function(done) {
      const p = new Producer({
        lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
      }, { strategy: Producer.FAN_OUT });
      const doneOnce = runOnce(done);
      p.connect(() => {
        p.produce('amet', 'fanout message', (err) => {});
        spawn('nsq_tail', ['--nsqd-tcp-address=127.0.0.1:9031',
            '--topic=amet', '-n', '1'])
          .stdout.on('data', (data) => {
            data.toString().should.contain('fanout message');
          })
          .on('close', (code) => {
            doneOnce(code);
          });
        spawn('nsq_tail', ['--nsqd-tcp-address=127.0.0.1:9032',
            '--topic=amet', '-n', '1'])
          .stdout.on('data', (data) => {
            data.toString().should.contain('fanout message');
          })
          .on('close', (code) => {
            doneOnce(code);
          });
      });
    });

  });

});
