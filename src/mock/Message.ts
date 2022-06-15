import { publish } from './index';

export class MockMessage {
  private _body: string;
  private _topic: string;
  private _attempts = 0;

  constructor(msg, topic) {
    this._topic = topic;
    if (typeof msg === 'string') {
      this._body = msg;
      return;
    }
    try {
      this._body = JSON.stringify(msg);
    } catch (err) {}
  }
  get body(): Buffer {
    return Buffer.from(this._body, 'utf-8');
  }

  get attempts(): number {
    return this._attempts;
  }
  incrAttempts() {
    this._attempts += 1;
  }
  json() {
    return JSON.parse(this._body);
  }

  toString() {
    return this._body;
  }

  finish() {
    // do nothing
  }

  requeue(delay = 0) {
    setTimeout(() => {
      publish(this._topic, this);
    }, delay);
  }
}
