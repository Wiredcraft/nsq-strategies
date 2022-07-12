import { Observable, Subject } from 'rxjs';
import { MockMessage as Message } from './Message';
import { hook } from './index';

export class MockConsumer {
  private topic: string;
  private channel: string;
  private _discardSubject: Subject<Message>;
  private opt: any;

  connect() {
    // do nothing
  }

  consume(fn: (m: Message) => Promise<void> | void) {
    const wrapper = (m: Message) => {
      m.incrAttempts();
      if (this.exceedMaxAttempts(m) && this._discardSubject) {
        return this._discardSubject.next(m);
      }
      return fn.call(null, m);
    };
    hook(this.topic, this.channel, wrapper);
  }

  toRx(event = 'message'): Observable<Message> {
    if (event === 'discard') {
      return new Observable<Message>((subscriber) => {
        this._discardSubject = new Subject<Message>();
        this._discardSubject.subscribe((msg) => subscriber.next(msg));
      });
    }
    return new Observable<Message>((subscriber) => {
      const s = new Subject<Message>();
      s.subscribe((msg) => {
        msg.incrAttempts();
        if (this.exceedMaxAttempts(msg) && this._discardSubject) {
          return this._discardSubject.next(msg);
        }
        return subscriber.next(msg);
      });
      hook(this.topic, this.channel, s);
    });
  }

  close() {
    // do nothing
  }

  exceedMaxAttempts(msg) {
    if (!this.opt || !this.opt.maxAttempts) {
      return false;
    }
    return msg.attempts > this.opt.maxAttempts;
  }
}
