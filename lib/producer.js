'use strict';

const nsq = require('nsqjs');
const nsqlookup = require('nsq-lookup');
const async = require('async');
const retry = require('retry');
const debug = require('debug')('nsq-strategies:lib:producer');

class Producer {

  constructor(config, options) {
    this.opts = options || {};
    if (config.tcpPort) {
      config.nsqdHost = config.nsqdHost || '127.0.0.1';
      this.nsqd = { host: config.nsqdHost, port: config.tcpPort };
      return;
    }
    if (config.lookupdHTTPAddresses) {
      let lookupd = config.lookupdHTTPAddresses;
      if (!Array.isArray(lookupd)) {
        lookupd = [lookupd];
      }
      this.lookupd = normalizeAddress(lookupd);
      this.counter = 0;
      this.strategy = (options && options.strategy) || Producer.ROUND_ROBIN;
    }
  }

  connect(callback) {
    this.conns = [];
    this.manualClosed = false;
    if (this.lookupd) {
      nsqlookup(this.lookupd, (errors, nodes) => {
        if (errors) {
          debug('lookup errors %j', errors);
          return callback(errors);
        }

        return async.each(nodes, (node, cb) => {
          this.connectNsqd(node.broadcast_address,
              node.tcp_port, this.opts, cb);
        }, (error) => {
          //TODO ignore the error?
          callback(null, this.conns);
        });
      });
      return;
    }

    //connect directly
    this.connectNsqd(this.nsqd.host, this.nsqd.port, this.opt, (err) => {
      callback(err, this.conns);
    });
  }

  connectNsqd(host, port, option, cb) {
    const writer = new nsq.Writer(host, port, option);
    writer.connect();
    writer.on('error', cb);
    writer.on('ready', () => {
      debug(`writer on ready: ${writer.nsqdHost}:${writer.nsqdPort}`);
      this.conns.push(writer);
      cb();
    });
    writer.on('closed', () => {
      if (this.manualClosed) {
        return;
      }
      const idx = indexOfConnection(this.conns, host, port);
      debug('on closed, idx of cached connection: %d', idx);
      if (idx === -1) {
        return;
      }
      this.conns.splice(idx, 1);
      //TODO should be able to specify the retry strategy
      const operation = retry.operation();
      operation.attempt((currentAttemps) => {
        debug('connect attempts %d', currentAttemps);
        this.connectNsqd(host, port, option, (err) => {
          debug('retry when err: ' + err);
          operation.retry(err);
        });
      });
    });
  }

  produce(topic, msg, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    if (!this.conns || this.conns.length === 0) {
      return callback(new Error('No connections to nsqd'));
    }

    if (options.retry && this.strategy === Producer.FAN_OUT) {
      return callback(new Error('Retry on produce level is not supported in fanout strategy'));
    }

    if (options.retry) {
      const operation = options.retry === true ?
        retry.operation() : retry.operation(options.retry); //default is around 17 mins
      operation.attempt((currentAttemps) => {
        this._produceOnce(topic, msg, options, (err) => {
          debug(currentAttemps);
          if (operation.retry(err)) {
            return;
          }
          callback(err ? operation.mainError() : null);
        });
      });
      return;
    }
    this._produceOnce(topic, msg, options, callback);
  }

  _produceOnce(topic, msg, options, callback) {
    //TODO refactoring to avoid so many if-clauses
    if (this.strategy === Producer.ROUND_ROBIN) {
      const i = this.counter % this.conns.length;
      this.counter++;
      this.conns[i].publish(topic, msg, (err) => {
        callback(err);
      });
      return;
    }

    if (this.strategy === Producer.FAN_OUT) {
      async.each(this.conns, (con, cb) => {//TODO eachLimit?
        con.publish(topic, msg, cb);
      }, (error) => {
        callback(error);
      });
      return;
    }
    this.conns[0].publish(topic, msg, (err) => {
      callback(err);
    });
  }

  close() {
    if (!this.conns) {
      throw new Error('No connections yet');
    }
    this.manualClosed = true;
    this.conns.forEach(con => {
      con.close();
    });
    this.conns = [];
  }

}

function normalizeAddress(addresses) {
  return addresses.map((address) => {
    if (address.indexOf('http') === 0) {
      return address;
    }
    return 'http://' + address;
  });
}

function indexOfConnection(conns, host, port) {
  let ret = -1;
  conns.forEach((con, idx) => {
    if (con.nsqdHost === host && con.nsqdPort === port) {
      ret = idx;
    }
  });
  return ret;
}

Producer.ROUND_ROBIN = 'round_robin';
Producer.FAN_OUT = 'fan_out';

module.exports = Producer;
