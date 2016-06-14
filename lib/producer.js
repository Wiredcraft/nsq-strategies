'use strict';

const assert = require('assert');
const nsq = require('nsqjs');
const nsqlookup = require('nsq-lookup');
const once = require('once');
const async = require('async');
const debug = require('debug')('ams-api:lib:producer');

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
    if (this.lookupd) {
      nsqlookup(this.lookupd, (errors, nodes) => {
        if (errors) {
          debug('lookup errors %j', errors);
          return callback(errors);
        }

        if (this.strategy === Producer.FAN_OUT) {
          return async.each(nodes, (node, cb) => {
            this.connectNsqd(node.broadcast_address,
                node.tcp_port, this.opts, cb);
          }, (error) => {
            callback(error);
          });
        }
        if (this.strategy === Producer.ROUND_ROBIN) {
          const callbackOnce = once(callback);
          nodes.map((node) => {
            this.connectNsqd(node.broadcast_address,
                node.tcp_port, this.opts, callbackOnce);
          });
        }
      });
      return;
    }

    //connect directly
    this.connectNsqd(this.nsqd.host, this.nsqd.port, this.opt, callback);
  }

  connectNsqd(host, port, option, cb) {
    const writer = new nsq.Writer(host, port, option);
    writer.connect();
    writer.on('ready', () => {
      this.conns.push(writer);

      //wait event io loop to let more connections usable
      setTimeout(() => {
        cb();
      }, 0);
    });
  }

  produce(topic, msg, callback) {
    if (!this.conns || this.conns.length === 0) {
      return callback('No connection to nsqd');
    }

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

}

function normalizeAddress(addresses) {
  return addresses.map((address) => {
    if (address.indexOf('http') === 0) {
      return address;
    }
    return 'http://' + address;
  });
}

Producer.ROUND_ROBIN = 'round_robin';
Producer.FAN_OUT = 'fan_out';

module.exports = Producer;
