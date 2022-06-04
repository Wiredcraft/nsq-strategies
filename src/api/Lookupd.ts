import { AxiosInstance } from 'axios';
import { createAxiosInstance } from './helper';

export class Lookupd {
  private instance: AxiosInstance;
  constructor(options: { baseUrl: string } | string) {
    this.instance = createAxiosInstance(options);
  }

  ping() {
    return this.instance.get('/ping');
  }

  lookup(topic) {
    return this.instance.get('/lookup', { params: { topic } });
  }

  topics() {
    return this.instance.get('/topics');
  }

  channels(topic) {
    return this.instance.get('/channels', { params: { topic } });
  }

  nodes() {
    return this.instance.get('/nodes');
  }

  deleteTopic(topic) {
    return this.instance.post('/topic/delete', null, { params: { topic } });
  }

  deleteChannel(topic, channel) {
    return this.instance.post('/channel/delete', null, { params: { topic, channel } });
  }
}
