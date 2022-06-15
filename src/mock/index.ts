import { MockMessage as Message } from './Message';
import { Subject, isObservable } from 'rxjs';

type consumerCallback = (m: Message) => Promise<void> | void;
type MsgHandler = consumerCallback | Subject<Message>;

let isMock: boolean;

// { topic01: [ channel01, channel02 ] }
const channels = new Map<string, Array<string>>();

// { topic01-channel01: [ fn1, fn2 ] }
const messageHandlers = new Map<string, Array<MsgHandler>>();

// { topic01: [ msg1, msg2 ] }
const stackMsgQueue = new Map<string, Array<any>>();

export function setMock(m: boolean) {
  isMock = m;
  [channels, messageHandlers, stackMsgQueue].map((m) => m.clear());
}
export function getMock() {
  return isMock;
}

function selectHandlers(topic: string) {
  const chs = channels.get(topic) || [];
  const hdlrs = chs.map((ch) => {
    const handlers = messageHandlers.get(`${topic}-${ch}`);
    if (handlers.length > 0) {
      return handlers[0];
    }
    return null;
  });
  return hdlrs.filter((h) => !!h);
}

export function publish(topic: string, msg: Message) {
  const handlers = selectHandlers(topic);

  if (handlers && handlers.length > 0) {
    handlers.forEach((h) => {
      invoke(h, msg);
    });
  } else {
    const msgs = stackMsgQueue.get(topic) || [];
    msgs.push(msg);
    stackMsgQueue.set(topic, msgs);
  }
}

export function hook(topic: string, channel: string, handler: MsgHandler) {
  const chnls = channels.get(topic) || [];
  if (!chnls.includes(channel)) {
    chnls.push(channel);
    channels.set(topic, chnls);
  }
  const channelKey = `${topic}-${channel}`;
  let handlers = messageHandlers.get(channelKey);

  if (!handlers) {
    handlers = [];
    drain(topic, handler);
  }
  handlers.push(handler);
  messageHandlers.set(channelKey, handlers);
}

function drain(topic: string, handler: MsgHandler) {
  const msgs = stackMsgQueue.get(topic);

  if (!msgs || msgs.length === 0) {
    return;
  }
  msgs.forEach((msg) => {
    invoke(handler, msg);
  });
  stackMsgQueue.set(topic, []);
}

function invoke(fnOrSubject: MsgHandler, msg: Message) {
  if (isObservable(fnOrSubject)) {
    (fnOrSubject as Subject<Message>).next(msg);
  } else {
    fnOrSubject(msg);
  }
}

// override behavior with mixin
export function applyMixins(derivedCtor: any, constructors: any[]) {
  constructors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      Object.defineProperty(
        derivedCtor.prototype,
        name,
        Object.getOwnPropertyDescriptor(baseCtor.prototype, name) || Object.create(null)
      );
    });
  });
}

export { MockProducer } from './Producer';
export { MockConsumer } from './Consumer';
