import { Observable, Subject } from 'rxjs';
import { Message } from 'nsqjs';
import { hook } from './index';

export class MockConsumer {
  private topic: string;
  private channel: string;

  connect() {
    // do nothing
  }

  consume(fn: (m: Message) => Promise<void> | void) {
    hook(this.topic, this.channel, fn);
  }

  toRx(event = 'message'): Observable<Message> {
    if (event !== 'message') {
      throw new Error('toRx with discarded event is not implemented in mock module');
    }
    return new Observable<Message>((subscriber) => {
      const s = new Subject<Message>();
      s.subscribe((msg) => subscriber.next(msg));
      hook(this.topic, this.channel, s);
    });
  }

  close() {
    // do nothing
  }
}
