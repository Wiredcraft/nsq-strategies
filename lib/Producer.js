'use strict';

const nsq = require('nsqjs');
const Promise = require('bluebird');
const promiseRetry = require('promise-retry');
const debug = require('debug')('nsq-strategies:lib:producer');

const lib = require('./');
const LookupdCluster = lib.api.LookupdCluster;

class Producer {

  constructor(config, options) {
    this.opts = options || {};
    if (config.tcpPort) {
      config.nsqdHost = config.nsqdHost || 'localhost';
      this.nsqd = { host: config.nsqdHost, port: config.tcpPort };
      return;
    }
    if (config.lookupdHTTPAddresses) {
      this.lookupdCluster = new LookupdCluster(config.lookupdHTTPAddresses);
      this.counter = 0;
      this.strategy = (options && options.strategy) || Producer.ROUND_ROBIN;
    }
  }

  connect(callback) {
    this.conns = [];
    this._closed = false;
    if (this.lookupdCluster) {
      return this.lookupdCluster.nodes().map((node) => {
        return this.connectNsqd(node.broadcast_address, node.tcp_port, this.opts);
      }).then(() => {
        return this.conns;
      }).asCallback(callback);
    }

    //connect directly
    return this.connectNsqd(this.nsqd.host, this.nsqd.port, this.opts).then(() => {
      return this.conns;
    }).asCallback(callback);
  }

  /**
   * Connect to an NSQD and put it in the pool.
   *
   * @private
   */
  connectNsqd(host, port, options) {
    return new Promise((resolve, reject) => {
      const writer = Promise.promisifyAll(new nsq.Writer(host, port, options));
      writer.connect();
      writer.on('error', reject);
      writer.on('ready', () => {
        debug(`writer on ready: ${writer.nsqdHost}:${writer.nsqdPort}`);
        this.conns.push(writer);
        resolve(writer);
      });
      writer.on('closed', () => {
        this.reconnectNsqd(host, port, options);
      });
    });
  }

  /**
   * Reconnect, if and only if the connection is in our pool.
   *
   * @private
   */
  reconnectNsqd(host, port, options) {
    if (this._closed) {
      return;
    }
    const idx = indexOfConnection(this.conns, host, port);
    debug('on closed, idx of cached connection: %d', idx);
    if (idx === -1) {
      return;
    }
    this.conns.splice(idx, 1);
    //TODO should be able to specify the retry strategy
    promiseRetry((retry, number) => {
      debug('connect attempts %d', number);
      return this.connectNsqd(host, port, options).catch((err) => {
        debug('retry when err: ' + err);
        retry(err);
      });
    });
  }

  produce(topic, msg, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    if (!this.conns || this.conns.length === 0) {
      return Promise.reject(new Error('No connections to nsqd'))
        .asCallback(callback);
    }

    if (options.retry && this.strategy === Producer.FAN_OUT) {
      return Promise.reject(new Error('Retry on produce level is not supported in fanout strategy'))
        .asCallback(callback);
    }

    if (options.retry) {
      return Promise.resolve(promiseRetry(options.retry === true ? {} : options.retry, (retry, number) => {
        debug(number);
        return this._produceOnce(topic, msg, options).catch(retry);
      })).asCallback(callback);
    }
    return this._produceOnce(topic, msg, options).asCallback(callback);
  }

  _produceOnce(topic, msg, options) {
    //TODO refactoring to avoid so many if-clauses
    if (this.strategy === Producer.ROUND_ROBIN) {
      const i = this.counter % this.conns.length;
      this.counter++;
      return this.conns[i].publishAsync(topic, msg);
    }

    if (this.strategy === Producer.FAN_OUT) {
      return Promise.map(this.conns, (con) => {
        return con.publishAsync(topic, msg);
      });
    }

    return this.conns[0].publishAsync(topic, msg);
  }

  close() {
    if (!this.conns) {
      throw new Error('No connections yet');
    }
    this._closed = true;
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

let instance;

function singleton(config, opt, cb) {
  if (!instance) {
    instance = new Producer(config, opt);
    instance.connect((err) => {
      cb(err, instance);
    });
    return;
  }
  cb(null, instance);
}

Producer.ROUND_ROBIN = 'round_robin';
Producer.FAN_OUT = 'fan_out';
Producer.singleton = singleton;
module.exports = Producer;
