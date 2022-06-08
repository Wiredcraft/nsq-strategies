import { randexp } from 'randexp';
import * as path from 'path';
import { spawn } from 'child_process';
import { fromEvent, firstValueFrom, merge } from 'rxjs';
const delay = (time: number) => new Promise((res) => setTimeout(res, time));
import promiseRetry from 'promise-retry';

import { Producer, PRODUCER_STRATEGY } from '../src/index';
import { removeTopicFromAllNsqd, nsqTail } from './helper';
import { Nsqd } from '../src/api';

const composeFile = path.resolve(__dirname, '../dockers/cluster/docker-compose.yml');

let topic: string;
const randTopic = () => randexp(/\w{8}/);

describe('producer', () => {
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

  it('should be able to publish to single nsqd', async () => {
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030,
    });
    topic = randTopic();
    await p.connect();
    await p.produce(topic, 'test producer');
    p.close();
    const stdout = fromEvent(nsqTail('nsqd2', topic, '0.0.0.0:9030').stdout, 'data');
    const data = await firstValueFrom(stdout);
    expect(data.toString().trim()).toContain('test producer');
  });

  it('should be able to publish delay msg', async () => {
    const p = new Producer({
      nsqdHost: 'localhost',
      tcpPort: 9030,
    });
    topic = randTopic();
    await p.connect();
    // have to wrap in array: see https://github.com/Wiredcraft/nsq-strategies/pull/24
    await p.produce(topic, ['test delay'], { delay: 2000 });
    p.close();
    const stdout = fromEvent(nsqTail('nsqd2', topic, '0.0.0.0:9030').stdout, 'data');
    const data = await firstValueFrom(stdout);
    expect(data.toString().trim()).toContain('test delay');
  }, 10000);

  it('should be able to publish to lookup', async () => {
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011'],
    });
    topic = randTopic();

    await p.connect();
    await p.produce(topic, 'test lookup');
    p.close();
    const process1 = nsqTail('nsqd1', topic, '0.0.0.0:9020');
    const process2 = nsqTail('nsqd2', topic, '0.0.0.0:9030');
    const process3 = nsqTail('nsqd3', topic, '0.0.0.0:9040');
    const nsqd1 = fromEvent(process1.stdout, 'data');
    const nsqd2 = fromEvent(process2.stdout, 'data');
    const nsqd3 = fromEvent(process3.stdout, 'data');
    const source$ = merge(nsqd1, nsqd2, nsqd3);
    const data = await firstValueFrom(source$);
    expect(data.toString().trim()).toBe('test lookup');
    process1.kill();
    process2.kill();
    process3.kill();
  });

  it('should be called with error if lookup fails', async () => {
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9091', 'localhost:9092'], // non-existed lookupd
    });
    try {
      await p.connect();
    } catch (err) {
      expect(err).toBeDefined();
      return;
    }
    throw new Error('expected an error');
  });

  it('should be able to receive comman slitted string', async () => {
    const p = new Producer({
      lookupdHTTPAddresses: 'localhost:9001,localhost:9011',
    });
    await p.connect();
    p.close();
  });

  it('should be able to close', async () => {
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011'],
    });
    await p.connect();
    p.close();
    try {
      await p.produce(topic, 'test pub after closed');
    } catch (err) {
      expect(err).toBeDefined();
      return;
    }
    throw new Error('should not hit here');
  });

  it('should be able to play round robin', async () => {
    const p = new Producer({
      lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011'],
    });
    topic = randTopic();
    const conns = await p.connect();
    const spies = conns.map((c) => {
      return jest.spyOn(c, 'publishAsync');
    });
    await p.produce(topic, 'round1');
    await p.produce(topic, 'round2');
    await p.produce(topic, 'round3');
    p.close();
    spies.forEach((s) => {
      expect(s).toBeCalledTimes(1);
      s.mockReset();
    });
  });

  it('should be able to play fanout', async () => {
    const p = new Producer(
      {
        lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011'],
      },
      { strategy: PRODUCER_STRATEGY.FAN_OUT }
    );
    topic = randTopic();
    const conns = await p.connect();
    const spies = conns.map((c) => {
      return jest.spyOn(c, 'publishAsync');
    });

    await p.produce(topic, 'fanout message');
    p.close();
    spies.forEach((s) => {
      expect(s).toBeCalledTimes(1);
      s.mockReset();
    });
  });

  describe('Singleton', () => {
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

    it('should be able to publish', async () => {
      const lookupdAddr = ['localhost:9001', 'localhost:9011'];
      const opt = { strategy: PRODUCER_STRATEGY.ROUND_ROBIN };
      topic = randTopic();
      const p = await Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt);
      await p.produce(topic, 'some message');
      p.close();
    });

    it('should be singleton', async () => {
      const lookupdAddr = ['localhost:9001', 'localhost:9011'];
      const opt = { strategy: PRODUCER_STRATEGY.ROUND_ROBIN };
      const p1 = await Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt);
      const p2 = await Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt);
      expect(p1).toEqual(p2);
    });
  });
  describe('reconnect', () => {
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

    async function startNsqd() {
      const p = spawn('docker-compose', [`--file=${composeFile}`, 'start', 'nsqd3']);
      const closed$ = fromEvent(p.stdout, 'close');
      await firstValueFrom(closed$);

      const options = {
        retries: 3,
        factor: 2,
        minTimeout: 500,
      };
      await promiseRetry(function (retry) {
        const nsqd = new Nsqd('http://127.0.0.1:9041');
        return nsqd.ping().catch(retry);
      }, options);
      p.kill();
    }

    it('should raise error when nsqd is down and maximum retries are exhuasted', async () => {
      const p = new Producer({
        nsqdHost: 'localhost',
        tcpPort: 9040,
      });
      const errMsg = 'Failed to connect';
      const retryOpt = {
        retries: 3,
        minTimeout: 300,
      };
      let retryTimes = 0;
      p.connect = () => {
        return new Promise((resolve, reject) => {
          retryTimes++;
          if (retryTimes < 5) {
            reject(new Error(errMsg));
          } else {
            resolve(null);
          }
        });
      };
      topic = randTopic();
      try {
        await p.produce(topic, 'any message', { retry: retryOpt });
      } catch (err) {
        expect(err.message).toBe(errMsg);
        return;
      }
      throw new Error('should not hit here');
    });

    it('should be able to produce when nsqd is down and recovered before maximum retries are exhuasted', async () => {
      const p = new Producer({
        nsqdHost: 'localhost',
        tcpPort: 9040,
      });
      await p.connect();
      const errMsg = 'Failed to connect';
      const retryOpt = {
        retries: 3,
        minTimeout: 300,
      };
      let retryTimes = 0;
      p._produceOnce = () => {
        return new Promise((resolve, reject) => {
          retryTimes++;
          if (retryTimes < 2) {
            reject(new Error(errMsg));
          } else {
            resolve(null);
          }
        });
      };
      await p.produce(topic, 'any message', { retry: retryOpt });
      p.close();
    });

    it('should be able to use default retry strategy when option.retry = true', async () => {
      const p = new Producer({
        nsqdHost: 'localhost',
        tcpPort: 9040,
      });
      await p.connect();
      const errMsg = 'Failed to connect';
      let retryTimes = 0;

      p._produceOnce = () => {
        return new Promise((resolve, reject) => {
          retryTimes++;
          if (retryTimes < 2) {
            reject(new Error(errMsg));
          } else {
            resolve(null);
          }
        });
      };
      await p.produce(topic, 'any message', { retry: true });
      p.close();
    });

    it('should be able to produce after reconnection', async () => {
      const p = new Producer({
        nsqdHost: 'localhost',
        tcpPort: 9040,
      });
      topic = randTopic();
      await p.connect();

      await p.produce(topic, 'message before reconnect');
      const childProcess = spawn('docker-compose', [`--file=${composeFile}`, 'stop', 'nsqd3']);
      const code$ = fromEvent(childProcess.stdout, 'close');
      await firstValueFrom(code$);

      await startNsqd();

      // wait to reconnection
      await delay(8000); // 1st reconnect after 1 sec, then 2 sec later
      await p.produce(topic, 'message after reconnect');
      p.close();
    }, 15000);
  });
  describe('Producer strategies', () => {
    describe('connect nsqd directly', () => {
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

      it('should fail if retry is not set', async () => {
        const p = new Producer({
          nsqdHost: 'localhost',
          tcpPort: 9030,
        });
        const conns = await p.connect();
        // mock up publish
        conns.forEach((con) => {
          con.publishAsync = async () => {
            throw new Error('selfmade publish error');
          };
        });
        try {
          await p.produce(topic, 'any message');
        } catch (err) {
          expect(err.message).toBe('selfmade publish error');
          p.close();
          return;
        }
        throw new Error('should not reach here');
      });

      it('should be able to retry', async () => {
        const p = new Producer({
          nsqdHost: 'localhost',
          tcpPort: 9030,
        });
        const conns = await p.connect();
        // mock up publish
        let times = 0;
        conns.forEach((con) => {
          con.publishAsync = async () => {
            times++;
            if (times < 2) {
              throw new Error('selfmade publish error'); // fail at the 1st time
            } else {
              return; // succeed at the 2nd time
            }
          };
        });
        await p.produce(topic, 'any message', { retry: true });
        p.close();
      });

      it('should be able to config retry strategy', async () => {
        const p = new Producer({
          nsqdHost: 'localhost',
          tcpPort: 9030,
        });
        const conns = await p.connect();
        // mock up publish
        let times = 0;
        conns.forEach((con) => {
          con.publishAsync = () => {
            times++;
            if (times < 5) {
              throw new Error('selfmade publish error');
            } else {
              return; // succeed at the 5th times
            }
          };
        });
        const retryOpt = {
          retries: 3,
          minTimeout: 300,
        };
        try {
          await p.produce(topic, 'any message', { retry: retryOpt });
        } catch (err) {
          expect(err.message).toBe('selfmade publish error');
          p.close();
          return;
        }
        throw new Error('should not reach here');
      });
    });
    describe('Fanout strategy', () => {
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

      it('should fail if retry is set, it`s not supported now', async () => {
        const p = new Producer(
          {
            lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011'],
          },
          { strategy: PRODUCER_STRATEGY.FAN_OUT }
        );
        await p.connect();
        try {
          await p.produce(topic, 'any message', { retry: true });
        } catch (err) {
          expect(err.message).toContain('not supported');
          p.close();
          return;
        }
        throw new Error('should not reach here');
      });
      it('should able to override the strategy when producing', async () => {
        const p = new Producer(
          {
            lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011'],
          },
          { strategy: PRODUCER_STRATEGY.ROUND_ROBIN }
        );
        const conns = await p.connect();

        const mocks = conns.map((c) => {
          return jest.spyOn(c, 'publishAsync').mockImplementation(() => {
            return Promise.resolve();
          });
        });
        await p.produce(topic, 'any message', { strategy: PRODUCER_STRATEGY.FAN_OUT });
        mocks.forEach((m) => {
          expect(m).toBeCalledTimes(1);
          m.mockRestore();
        });
        p.close();
      });

      it('should able to specify the max nodes when fanout', async () => {
        const p = new Producer(
          {
            lookupdHTTPAddresses: ['localhost:9001', 'localhost:9011'],
          },
          { strategy: PRODUCER_STRATEGY.ROUND_ROBIN }
        );
        const conns = await p.connect();
        const mocks = conns.map((c) => {
          return jest.spyOn(c, 'publishAsync').mockImplementation(() => {
            return Promise.resolve();
          });
        });
        await p.produce(topic, 'any message', { strategy: PRODUCER_STRATEGY.FAN_OUT, maxFanoutNodes: 2 });
        await p.produce(topic, 'any message', { strategy: PRODUCER_STRATEGY.FAN_OUT, maxFanoutNodes: 2 });

        // 3 writers with twice fanout nodes as two, calls should be [1, 2, 1]
        const callCounts = mocks.map((m) => {
          return m.mock.calls.length;
        });
        const calledTwice = callCounts.filter((c) => c === 2);
        expect(calledTwice).toHaveLength(1);

        const calledOnce = callCounts.filter((c) => c === 1);
        expect(calledOnce).toHaveLength(2);
        p.close();
      });
    });
  });
});
