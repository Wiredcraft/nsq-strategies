import { AxiosInstance } from 'axios';
import { createAxiosInstance } from './helper';

export class Nsqd {
  private instance: AxiosInstance;
  constructor(options: { baseUrl: string } | string) {
    this.instance = createAxiosInstance(options);
  }
  publish(topic, message) {
    return this.instance.post('/pub', message, { params: { topic } });
  }

  ping() {
    return this.instance.get('/ping');
  }

  deferPublish(topic, message, defer) {
    return this.instance.post('/pub', message, { params: { topic, defer } });
  }

  createTopic(topic) {
    return this.instance.post('/topic/create', null /* empty body */, { params: { topic } });
  }

  deleteTopic(topic) {
    return this.instance.post('/topic/delete', null, { params: { topic } });
  }

  emptyTopic(topic) {
    return this.instance.post('/topic/empty', null, { params: { topic } });
  }

  createChannel(topic, channel) {
    return this.instance.post('/channel/create', null, { params: { topic, channel } });
  }

  deleteChannel(topic, channel) {
    return this.instance.post('/channel/delete', null, { params: { topic, channel } });
  }

  emptyChannel(topic, channel) {
    return this.instance.post('/channel/empty', null, { params: { topic, channel } });
  }
}
