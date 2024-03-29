import { randexp } from 'randexp';
import { Nsqd } from '../src/api';

import { removeTopicFromAllNsqd } from './helper';
import { Consumer } from '../src/index';
import { firstValueFrom } from 'rxjs';

const nsqdHTTPAddress = 'http://localhost:9031';
const lookupdHTTPAddresses = ['http://localhost:9001', 'http://localhost:9011'];

describe('Consumer', () => {
  let nsqd;
  let topic;

  beforeAll(() => {
    nsqd = new Nsqd(nsqdHTTPAddress);
  });

  beforeEach(() => {
    if (topic) {
      return removeTopicFromAllNsqd(topic);
    }
  });

  afterEach(() => {
    if (topic) {
      return removeTopicFromAllNsqd(topic);
    }
  });

  it('should receive message successfully', (done) => {
    topic = randexp(/Consume-([a-z]{8})/);
    nsqd.publish(topic, 'hello nsq').then(() => {
      const c = new Consumer(topic, 'ipsum', {
        lookupdHTTPAddresses,
      });
      c.consume((msg) => {
        expect(msg.body.toString()).toBe('hello nsq');
        msg.finish();
        c.close();
        done();
      });
    }, done);
  });

  it('should receive delayed message successfully', (done) => {
    topic = randexp(/Consume-([a-z]{8})/);
    nsqd.deferPublish(topic, 'hello delay', 1000).then(() => {
      const c = new Consumer(topic, 'ipsum', {
        lookupdHTTPAddresses,
      });
      c.consume((msg) => {
        expect(msg.body.toString()).toBe('hello delay');
        msg.finish();
        c.close();
        done();
      });
    }, done);
  });

  it('should throw error if connect after auto connection', (done) => {
    const c = new Consumer('anytopic', 'ipsum', {
      lookupdHTTPAddresses,
      autoConnect: true,
    });
    try {
      c.connect();
    } catch (e) {
      expect(e).toBeDefined();
      c.close();
      done();
    }
  });

  it('should be able to receive comma splitted string as lookupd addr', (done) => {
    const c = new Consumer('anytopic', 'ipsum', {
      lookupdHTTPAddresses: 'http://localhost:9001, http://localhost:9011',
      autoConnect: false,
    });
    try {
      c.connect();
    } catch (e) {
      return done(e);
    }
    c.close();
    done();
  });

  it('should receive message successfully with connect manuallly', (done) => {
    topic = randexp(/Consume-([a-z]{8})/);
    nsqd.publish(topic, 'hello nsq').then(() => {
      const c = new Consumer(topic, 'ipsum', {
        lookupdHTTPAddresses,
        autoConnect: false,
      });
      c.connect();
      c.consume((msg) => {
        expect(msg.body.toString()).toBe('hello nsq');
        msg.finish();
        c.close();
        done();
      });
    }, done);
  });

  it('should be able to requeu message', (done) => {
    topic = randexp(/Consume-([a-z]{8})/);
    nsqd.publish(topic, 'test requeue').then(() => {
      const c = new Consumer(topic, 'sit', {
        lookupdHTTPAddresses,
      });
      let n = 0;
      c.consume((msg) => {
        n++;
        expect(msg.body.toString()).toBe('test requeue');
        if (n === 1) {
          msg.requeue(1500, false);
        }
        if (n === 2) {
          msg.finish();
          c.close();
          done();
        }
      });
    }, done);
  });

  it('should be able to cast to observable', async () => {
    topic = randexp(/Consume-([a-z]{8})/);
    await nsqd.publish(topic, 'test observale style');
    const c = new Consumer(topic, 'ipsum', {
      lookupdHTTPAddresses,
    });
    const source$ = c.toRx();
    const msg = await firstValueFrom(source$);
    expect(msg.body.toString()).toBe('test observale style');
    c.close();
  });

  it('should be able to subscribe', (done) => {
    topic = randexp(/Consume-([a-z]{8})/);
    nsqd.publish(topic, 'test observale style').then(() => {
      const c = new Consumer(topic, 'ipsum', {
        lookupdHTTPAddresses,
      });
      const source$ = c.toRx();
      source$.subscribe((msg) => {
        expect(msg.body.toString()).toBe('test observale style');
        c.close();
        done();
      });
    });
  });

  it('should be able to close the observable', (done) => {
    topic = randexp(/Consume-([a-z]{8})/);
    nsqd.publish(topic, 'test observale style').then(() => {
      const c = new Consumer(topic, 'ipsum', {
        lookupdHTTPAddresses,
      });
      const source$ = c.toRx();
      source$.subscribe({
        next: (v) => {
          expect(v.body.toString()).toBe('test observale style');
        },
        complete: () => {
          done();
        },
      });
      setTimeout(() => {
        c.close();
      }, 1000);
    });
  });

  it('should be able to use the observable for discard msg', (done) => {
    topic = randexp(/Consume-([a-z]{8})/);
    nsqd.publish(topic, 'test observale style').then(() => {
      const c = new Consumer(topic, 'ipsum', {
        lookupdHTTPAddresses,
        maxAttempts: 1,
        requeueDelay: 1000,
      });
      const source$ = c.toRx();
      source$.subscribe({
        next: (msg) => {
          expect(msg.body.toString()).toBe('test observale style');
          msg.requeue();
        },
      });

      const discard$ = c.toRx('discard');
      discard$.subscribe({
        next: (msg) => {
          expect(msg.body.toString()).toBe('test observale style');
          c.close();
        },
        complete: () => {
          done();
        },
      });
    });
  }, 10000);
});
