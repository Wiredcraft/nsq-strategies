import { publish } from './index';
import { MockMessage } from './Message';
import { ProduceOptions } from '../Producer';

export class MockProducer {
  async connect() {
    return [];
  }

  // eslint-disable-next-line  @typescript-eslint/no-unused-vars
  connectNsqd(host, port, options) {
    return Promise.resolve();
  }

  // eslint-disable-next-line  @typescript-eslint/no-unused-vars
  async produce(topic, msg, options: ProduceOptions = {}) {
    const mockMsg = new MockMessage(msg, topic);
    publish(topic, mockMsg);
  }

  close() {
    return;
  }
}
