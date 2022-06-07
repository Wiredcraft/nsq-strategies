import { Reader, Message } from 'nsqjs';
import dbg from 'debug';
const debug = dbg('nsq-strategies:lib:consumer');
import { toArray } from './utils';
import { Observable } from 'rxjs';

export class Consumer {
  private reader: Reader;
  private opt: any;
  constructor(topic, channel, options) {
    options = options || {};
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
}
