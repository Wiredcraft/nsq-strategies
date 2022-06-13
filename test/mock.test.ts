import { randexp } from 'randexp';
import { firstValueFrom } from 'rxjs';

import { Producer, Consumer } from '../src/index';
import { setMock } from '../src/mock';

let topic: string;
const randTopic = () => randexp(/\w{8}/);
const runCount = (c = 1, callback) => {
  let count = 0;
  return (err) => {
    count++;
    if (err) {
      return callback(err);
    }
    if (count === c) {
      callback(err);
    }
  };
};

describe('mock', () => {
  it('should be able to call the consumer callback', (done) => {
    setMock(true);
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030,
    });
    topic = randTopic();
    const c = new Consumer(topic, 'ipsum', {
      nsqdTCPAddresses: ['localhost:9030'],
    });
    c.consume((msg) => {
      expect(msg.toString().trim()).toContain('test producer');
      done();
    });
    p.connect().then(() => {
      p.produce(topic, 'test producer');
    });
  });
  it('should be able to multi-cast', (done) => {
    setMock(true);
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030,
    });
    topic = randTopic();
    const c1 = new Consumer(topic, 'ipsum', {
      nsqdTCPAddresses: ['localhost:9030'],
    });
    const c2 = new Consumer(topic, 'lorem', {
      nsqdTCPAddresses: ['localhost:9030'],
    });
    const runTwice = runCount(2, done);

    c1.consume((msg) => {
      expect(msg.toString().trim()).toContain('test producer');
      runTwice(null);
    });
    c2.consume((msg) => {
      expect(msg.toString().trim()).toContain('test producer');
      runTwice(null);
    });
    p.connect().then(() => {
      p.produce(topic, 'test producer');
    });
  });
  it('should be able to uni-cast', (done) => {
    setMock(true);
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030,
    });
    topic = randTopic();
    const c1 = new Consumer(topic, 'ipsum', {
      nsqdTCPAddresses: ['localhost:9030'],
    });
    const c2 = new Consumer(topic, 'ipsum', {
      nsqdTCPAddresses: ['localhost:9030'],
    });
    const runOnce = runCount(1, done);

    c1.consume((msg) => {
      expect(msg.toString().trim()).toContain('test producer');
      runOnce(null);
    });
    c2.consume((msg) => {
      expect(msg.toString().trim()).toContain('test producer');
      runOnce(null);
    });
    p.connect().then(() => {
      p.produce(topic, 'test producer');
    });
  });
  it('should be able to receive the msg even if the consumer setup comes later', (done) => {
    setMock(true);
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030,
    });
    topic = randTopic();
    p.connect().then(() => {
      p.produce(topic, 'test mock');
      // setup consumer after the msg published
      const c = new Consumer(topic, 'ipsum', {
        nsqdTCPAddresses: ['localhost:9030'],
      });
      c.consume((msg) => {
        expect(msg.toString().trim()).toContain('test mock');
        done();
      });
    });
  });
  it('should be able to use the consumer as observable', async () => {
    setMock(true);
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030,
    });
    topic = randTopic();
    await p.connect();
    await p.produce(topic, 'test producer');
    const c = new Consumer(topic, 'ipsum', {
      nsqdTCPAddresses: ['localhost:9030'],
    });
    const c$ = c.toRx();
    const msg = await firstValueFrom(c$);
    expect(msg.toString().trim()).toContain('test producer');
  });
  it('should be able to call msg methods like finish, requeue', async () => {
    setMock(true);
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030,
    });
    topic = randTopic();
    await p.connect();
    await p.produce(topic, 'test lorem ipsum');
    const c = new Consumer(topic, 'ipsum', {
      nsqdTCPAddresses: ['localhost:9030'],
    });
    const c$ = c.toRx();
    const msg = await firstValueFrom(c$);
    msg.finish();
    msg.requeue();
    expect(msg.toString().trim()).toContain('test lorem ipsum');
  });

  it('should be able to call msg json method', async () => {
    setMock(true);
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030,
    });
    topic = randTopic();
    await p.connect();
    await p.produce(topic, { foo: 'bar' });
    const c = new Consumer(topic, 'ipsum', {
      nsqdTCPAddresses: ['localhost:9030'],
    });
    const c$ = c.toRx();
    const msg = await firstValueFrom(c$);
    expect(msg.json()).toEqual({ foo: 'bar' });
    expect(Buffer.isBuffer(msg.body)).toBe(true);
    msg.finish();
    msg.requeue();
  });
});
