import { spawn } from 'child_process';
import { Nsqd } from '../src/api';

const nsqd1 = new Nsqd('http://localhost:9021');
const nsqd2 = new Nsqd('http://localhost:9031');
const nsqd3 = new Nsqd('http://localhost:9041');

export async function removeTopicFromAllNsqd(topic: string) {
  try {
    await Promise.all([nsqd1.deleteTopic(topic), nsqd2.deleteTopic(topic), nsqd3.deleteTopic(topic)]);
  } catch (err) {}
}

export function nsqTail(containerName: string, topic: string, tcpAddress: string) {
  return spawn('docker', [
    'exec',
    containerName,
    'nsq_tail',
    `--nsqd-tcp-address=${tcpAddress}`,
    `--topic=${topic}`,
    '--n=1',
  ]);
}
