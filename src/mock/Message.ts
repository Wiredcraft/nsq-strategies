export class MockMessage {
  private _body: string;

  constructor(msg) {
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

  json() {
    return JSON.parse(this._body);
  }

  toString() {
    return this._body;
  }

  finish() {
    // do nothing
  }

  requeue() {
    // do nothing
  }
}
