import { randexp } from 'randexp';
import { Nsqd, Lookupd, LookupdCluster } from '../src/api';

const nsqdHTTPAddress = 'http://localhost:9021';
const lookupdHTTPAddress = 'http://localhost:9001';
const lookupdHTTPAddresses = ['http://localhost:9001', 'http://localhost:9011'];
const randTopic = () => randexp(/\w{8}/);
const randChannel = () => randexp(/\w{8}/);

describe('API libs', () => {
  describe('Nsqd', () => {
    let nsqd: Nsqd;
    beforeAll(() => {
      nsqd = new Nsqd(nsqdHTTPAddress);
    });

    it('can ping', async () => {
      const res = await nsqd.ping();
      expect(res.status).toBe(200);
    });

    it('can create a topic', async () => {
      const res = await nsqd.createTopic(randTopic());
      expect(res.status).toBe(200);
    });

    it('can empty a topic', async () => {
      const topic = randTopic();
      await nsqd.createTopic(topic);
      const res = await nsqd.emptyTopic(topic);
      expect(res.status).toBe(200);
    });

    it('can delete a topic', async () => {
      const topic = randTopic();
      await nsqd.createTopic(topic);
      return nsqd.deleteTopic(topic);
    });

    it('cannot delete a deleted topic', async () => {
      const topic = randTopic();
      await nsqd.createTopic(topic);
      await nsqd.deleteTopic(topic);
      try {
        await nsqd.deleteTopic(topic);
      } catch (err) {
        expect(err.response.status).toBe(404);
        expect(err.response.data).toEqual({ message: 'TOPIC_NOT_FOUND' });
        return;
      }
      throw new Error('expected an error');
    });

    it('can create a channel', async () => {
      const topic = randTopic();
      await nsqd.createTopic(topic);
      const res = await nsqd.createChannel(topic, randChannel());
      expect(res.status).toBe(200);
    });

    it('can empty a channel', async () => {
      const topic = randTopic();
      const channel = randChannel();
      await nsqd.createTopic(topic);
      await nsqd.createChannel(topic, channel);
      return nsqd.emptyChannel(topic, channel);
    });

    it('can delete a channel', async () => {
      const topic = randTopic();
      const channel = randChannel();
      await nsqd.createTopic(topic);
      await nsqd.createChannel(topic, channel);
      const res = await nsqd.deleteChannel(topic, channel);
      expect(res.status).toBe(200);
    });

    it('can publish', async () => {
      const topic = randTopic();
      const res = await nsqd.publish(topic, 'Lorem');
      expect(res.status).toBe(200);
    });
  });

  describe('Lookupd', () => {
    let lookupd: Lookupd;
    let nsqd: Nsqd;

    beforeAll(() => {
      lookupd = new Lookupd(lookupdHTTPAddress);
      nsqd = new Nsqd(nsqdHTTPAddress);
    });

    it('can ping', () => {
      return lookupd.ping();
    });

    it('can lookup a topic', async () => {
      const topic = randTopic();
      await nsqd.createTopic(topic);
      const res = await lookupd.lookup(topic);
      expect(res.data).toMatchObject({
        channels: expect.any(Array),
        producers: expect.any(Array),
      });
    });

    it('cannot lookup a wrong topic', async () => {
      try {
        await lookupd.lookup(randexp(/\w{8}/));
      } catch (err) {
        expect(err.response.status).toBe(404);
        expect(err.response.data).toEqual({ message: 'TOPIC_NOT_FOUND' });
        return;
      }
      throw new Error('expected an error');
    });

    it('can list all topics', async () => {
      const res = await lookupd.topics();
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({
        topics: expect.any(Array),
      });
    });

    it('can list channels for a topic', async () => {
      const topic = randTopic();
      await nsqd.createTopic(topic);
      await nsqd.createChannel(topic, randChannel());
      await nsqd.createChannel(topic, randChannel());
      const res = await lookupd.channels(topic);
      expect(res.data).toMatchObject({
        channels: expect.any(Array),
      });
    });

    it('can list all nodes', async () => {
      const res = await lookupd.nodes();
      expect(res.data).toMatchObject({
        producers: expect.any(Array),
      });
    });

    it('can delete a channel', async () => {
      const topic = randTopic();
      const channel = randChannel();
      await nsqd.createTopic(topic);
      await nsqd.createChannel(topic, channel);
      return lookupd.deleteChannel(topic, channel);
    });

    it('can delete a topic', async () => {
      const topic = randTopic();
      await nsqd.createTopic(topic);
      return lookupd.deleteTopic(topic);
    });

    it('can delete a deleted topic', async () => {
      const topic = randTopic();
      await nsqd.createTopic(topic);
      await lookupd.deleteTopic(topic);
      return lookupd.deleteTopic(topic);
    });
  });

  describe('LookupdCluster', () => {
    let cluster: LookupdCluster;

    it('can list all nodes', async () => {
      cluster = new LookupdCluster(lookupdHTTPAddress);
      const res = await cluster.nodes();
      expect(res).toHaveLength(3);
    });

    it('can list all nodes with two addresses', async () => {
      cluster = new LookupdCluster(lookupdHTTPAddresses);
      const res = await cluster.nodes();
      expect(res).toHaveLength(3);
    });
  });
});
