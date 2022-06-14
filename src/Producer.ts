import * as util from 'util';
import { Writer } from 'nsqjs';
import promiseRetry from 'promise-retry';
import dbg from 'debug';
const debug = dbg('nsq-strategies:lib:producer');

import { LookupdCluster } from './api';
import { partialPickWithIndex } from './utils';
import { MockProducer, getMock, applyMixins } from './mock';

export enum PRODUCER_STRATEGY {
  ROUND_ROBIN = 'round_robin',
  FAN_OUT = 'fan_out',
}

export interface ProduceOptions {
  strategy?: PRODUCER_STRATEGY;
  retry?: any;
  delay?: number;
  maxFanoutNodes?: number;
}
type ProducerCtorOptions = Pick<ProduceOptions, 'strategy'>;

export class Producer {
  private opts: any;
  private nsqd: { host: string; port: string };
  private lookupdCluster: LookupdCluster;
  private counter: number;
  private conns: Array<Writer>;
  private strategy: PRODUCER_STRATEGY;
  private _closed: boolean;

  constructor(config, options?: ProducerCtorOptions, { fromStaticFactory = false } = {}) {
    if (getMock() && !fromStaticFactory) {
      return Producer.createMockInstance(config, options);
    }
    this.opts = options || {};
    if (config.tcpPort) {
      config.nsqdHost = config.nsqdHost || 'localhost';
      this.nsqd = { host: config.nsqdHost, port: config.tcpPort };
      return;
    }
    if (config.lookupdHTTPAddresses) {
      this.lookupdCluster = new LookupdCluster(config.lookupdHTTPAddresses);
      this.counter = 0;
      this.strategy = (options && options.strategy) || PRODUCER_STRATEGY.ROUND_ROBIN;
    }
  }

  async connect() {
    this.conns = [];
    this._closed = false;
    if (this.lookupdCluster) {
      const nodes = await this.lookupdCluster.nodes();
      if (nodes.length == 0) {
        return Promise.reject(new Error('No nsqd nodes are discovered from the configured lookupd addresses'));
      }
      await Promise.all(
        nodes.map((node) => {
          return this.connectNsqd(node.broadcast_address, node.tcp_port, this.opts);
        })
      );
      return this.conns;
    }

    // connect directly
    await this.connectNsqd(this.nsqd.host, this.nsqd.port, this.opts);
    return this.conns;
  }

  /**
   * Connect to an NSQD and put it in the pool.
   *
   * @private
   */
  connectNsqd(host, port, options) {
    return new Promise((resolve, reject) => {
      let isReady = false;
      const writer = new Writer(host, port, options);
      writer.deferPublishAsync = util.promisify(writer.deferPublish).bind(writer);
      writer.publishAsync = util.promisify(writer.publish).bind(writer);
      writer.connect();
      writer.on('error', reject);
      writer.on('ready', () => {
        isReady = true;
        debug(`writer on ready: ${writer.nsqdHost}:${writer.nsqdPort}`);
        this.conns.push(writer);
        resolve(writer);
      });
      writer.on('closed', () => {
        if (isReady) {
          return this.reconnectNsqd(host, port, options);
        }
        // from nsqjs 0.12, writer emits `closed` intead of `error` for no repoonse for IDENTIFY_RESPONSE.
        reject('closed');
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
    // TODO should be able to specify the retry strategy
    promiseRetry((retry, number) => {
      debug('connect attempts %d', number);
      return this.connectNsqd(host, port, options).catch((err) => {
        debug('retry when err: ' + err);
        retry(err);
      });
    });
  }

  async produce(topic, msg, options: ProduceOptions = {}) {
    // When all connections are closed manually by calling Producer.close() method, simply reject with error.
    if (this._closed) {
      return Promise.reject(new Error('All nsqd connections are closed now, call connect method to reconnect to them'));
    }

    const strategy = options.strategy || this.strategy;
    if (options.retry && strategy === PRODUCER_STRATEGY.FAN_OUT) {
      return Promise.reject(new Error('Retry on produce level is not supported in fanout strategy'));
    }

    if (!this.conns || this.conns.length === 0) {
      // Start to reconnect to all the nsqd nodes if there is no available connection.
      // Will follow the same retry strategy as specifed from the input parameter.
      if (options.retry) {
        return Promise.resolve(
          promiseRetry(options.retry === true ? {} : options.retry, (retry, num) => {
            debug(`Attempt to reconnect to all nsqd nodes with retry number ${num}...`);
            return this.connect().catch(retry);
          }).then(() => {
            return this.produce(topic, msg, options);
          })
        );
      }

      // If no retry at all, simply call connect method once.
      debug(`Attempt to reconnect to all nsqd nodes without any retry...`);
      return this.connect().then(() => {
        return this.produce(topic, msg, options);
      });
    }

    if (options.retry) {
      return Promise.resolve(
        promiseRetry(options.retry === true ? {} : options.retry, (retry, num) => {
          debug(num);
          return this._produceOnce(topic, msg, options).catch(retry);
        })
      );
    }
    return this._produceOnce(topic, msg, options);
  }

  _produceOnce(topic, msg, options) {
    const publish = (conn, topic, msg, options) => {
      return options.delay ? conn.deferPublishAsync(topic, msg, options.delay) : conn.publishAsync(topic, msg);
    };

    const strategy = options.strategy || this.strategy;
    switch (strategy) {
      case PRODUCER_STRATEGY.ROUND_ROBIN: {
        const i = this.counter % this.conns.length;
        this.counter++;
        return publish(this.conns[i], topic, msg, options);
      }
      case PRODUCER_STRATEGY.FAN_OUT: {
        const i = this.counter % this.conns.length;
        this.counter++;
        const max = (options && options.maxFanoutNodes) || this.conns.length;
        const cons = partialPickWithIndex(max, i, this.conns);
        return Promise.all(cons.map((conn) => publish(conn, topic, msg, options)));
      }
      default: {
        return publish(this.conns[0], topic, msg, options);
      }
    }
  }

  close() {
    if (!this.conns) {
      throw new Error('No connections yet');
    }
    this._closed = true;
    this.conns.forEach((con) => {
      con.close();
    });
    this.conns = [];
  }

  static instance: Producer;
  public static async singleton(config, opt) {
    if (!Producer.instance) {
      Producer.instance = new Producer(config, opt);
      await Producer.instance.connect();
      return Producer.instance;
    }
    return Producer.instance;
  }

  static createMockInstance(config, options?: ProducerCtorOptions) {
    applyMixins(Producer, [MockProducer]);
    return new Producer(config, options, { fromStaticFactory: true });
  }
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
