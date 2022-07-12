import { Reader, Message } from 'nsqjs';
import dbg from 'debug';
const debug = dbg('nsq-strategies:lib:consumer');
import { toArray } from './utils';
import { Observable } from 'rxjs';

import { MockConsumer, getMock, applyMixins } from './mock';
export class Consumer {
  private reader: Reader;
  private opt: any;
  private topic: string;
  private channel: string;
  constructor(topic, channel, options, { fromStaticFactory = false } = {}) {
    options = options || {};
    if (getMock()) {
      if (!fromStaticFactory) {
        return Consumer.createMockInstance(topic, channel, options);
      }
      this.topic = topic;
      this.channel = channel;
      this.opt = options;
      return;
    }

    if (options.autoConnect == null) {
      // default is true
      options.autoConnect = true;
    }
    if (typeof options.lookupdHTTPAddresses === 'string') {
      options.lookupdHTTPAddresses = toArray(options.lookupdHTTPAddresses);
    }
    this.opt = options;
    this.reader = new Reader(topic, channel, options);
    if (this.opt.autoConnect) {
      this.reader.connect();
    }
  }

  connect() {
    if (this.opt.autoConnect) {
      throw new Error('connect has been called');
    }
    this.reader.connect();
  }

  consume(fn: (m: Message) => Promise<void> | void) {
    this.reader.on('message', (msg: Message) => {
      debug(msg);
      fn(msg);
    });
  }

  toRx(event = 'message'): Observable<Message> {
    return new Observable<Message>((subscriber) => {
      this.reader.on(event, (msg) => {
        subscriber.next(msg);
      });
      this.reader.on('nsqd_closed', () => {
        subscriber.complete();
      });
      this.reader.on('error', (err) => {
        subscriber.error(err);
      });
    });
  }

  close() {
    this.reader.close();
  }
  static createMockInstance(topic, channel, options) {
    applyMixins(Consumer, [MockConsumer]);
    return new Consumer(topic, channel, options, { fromStaticFactory: true });
  }
}
