# nsq-strategies

[![Build Status](https://travis-ci.org/Wiredcraft/nsq-strategies.svg?branch=master)](https://travis-ci.org/Wiredcraft/nsq-strategies)
[![Coverage Status](https://coveralls.io/repos/github/Wiredcraft/nsq-strategies/badge.svg?branch=master)](https://coveralls.io/github/Wiredcraft/nsq-strategies?branch=master)

## Introduction
Typical strategies of using [NSQ](http://nsq.io/), in Node.js. It's a wrapper of official client library([nsqjs](https://github.com/dudleycarr/nsqjs)) with different strategies.

### Motivation
The [nsqjs](https://github.com/dudleycarr/nsqjs) is handy, but it requires you to send message with a known nsqd address, which's neither impractical nor adhered to the principle of avoiding SPOF.
The best practise is always using nsqlookup, but when you got a bunch of nsqds by lookup, which one should you choose to send the message?
This module preprares some typical strategies for you.


## Installation
`npm install nsq-strategies`

## Usage

### new Producer(connectConfig, option)
* `connecConfig`:
  It can be specified with an array of nsqlookupd addresses or a single nsqd.

* `option`:
  * `strategy`: `Producer.ROUND_ROBIN` | `Producer.FAN_OUT` (default: `Producer.ROUND_ROBIN`)
  * Other optional properties are exactly same with option in `Writer` of nsqjs. Refer [here](https://github.com/dudleycarr/nsqjs#new-writernsqdhost-nsqdport-options) for details.

#### Method
* `produce(topic, msgs[, produceOptions, callback])`
  * `topic`: NSQ Topic
  * `msgs`: NSQ messages, should use array in delay message.
  * `produceOptions`:
    * [`retry`](https://github.com/Wiredcraft/nsq-strategies#produce-retry)
    * `delay`: send delay message in given millisecond, the value must be smaller than `-max-req-timeout` of NSQD

#### Round robin strategy

1. The producer discovers the nsqd nodes from lookupd
2. Every `produce` picks up a single nsqd in round-robin way and sends the message.
3. The round-robin doesn't care about which topic to be sent.

* Example

```js
  const Producer = require('nsq-strategies').Producer;
  const p = new Producer({
    lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
  }, {
    strategy: Producer.ROUND_ROBIN
  });

  p.connect((errors) => {
    p.produce('topic', 'message', (err) => {
      if (err) {
        console.log(err);
      }
    });
  });

  // with options
  // enable retry with default node-promise-retry strategy,
  // send NSQ message with 2-second delay
  p.connect((errors) => {
    p.produce('topic', 'message', { retry: true, delay: 2000 }, (err) => {
      if (err) {
        console.log(err);
      }
    });
  });

  // with options
  // enable retry with given node-promise-retry strategy,
  // send NSQ message with 2-second delay
  p.connect((errors) => {
    p.produce('topic', 'message', { retry: {
      retries: 3,
      minTimeout: 300
    }, delay: 2000 }, (err) => {
      if (err) {
        console.log(err);
      }
    });
  });

  // with promise style
  // enable retry with given node-promise-retry strategy,
  // send NSQ message with 2-second delay
  p.connect().then(() => {
    p.produce('topic', 'message', { retry: {
      retries: 3,
      minTimeout: 300
    }, delay: 2000 })
    .catch(err => {
      if (err) {
        console.log(err);
      }
    });
  });
```
* Diagram
```
                  *************************
         *********                         *********
     ****                                           ****
  ***    +---------------+      +---------------+       ***
**       |               |      |               |          **
*        | nsqlookupd1   |      | nsqlookupd2   |           *
**       |               |      |               |          **
  ***    +---------------+      +---------------+       ***
     ****                                           ****
         *********                         *********
                  *************************
                             ^
                             |
                             |
                      +------+------+
                      |             |
                      |  Prroducer  |
                      |             |
                      +-+----+----+-+
                        |    |    |
         +--------------+    |    +---------------+
         |  msg1             |              msg3  |
         |                   |msg2                |
         v                   v                    v
     +---+----+         +----+---+           +----+---+
     |        |         |        |           |        |
     | nsqd1  |         | nsqd2  |           | nsqd2  |
     |        |         |        |           |        |
     +--------+         +--------+           +--------+
```

#### Fanout strategy

1. The producer discovers the nsqd nodes from lookupd
2. Every `produce` spreads the message to all nsqd nodes.
3. This stategy is mainly for delivery guarantee, it's **not** designed for pub-sub mode in nsq,
note the message is duplicated among the nsqds, if you have a consumer(client) listening to it's topic, it will get the same message multiple times,
if this is not expected you have to de-dupe in the consumer side or make the operation for the message idempotent.

* Example
```js
  const Producer = require('nsq-strategies').Producer;
  const p = new Producer({
    lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
  }, {
    strategy: Producer.FAN_OUT
  });
  p.connect((errors) => {
    p.produce('topic', 'message', (err) => {
      if (err) {
        console.log(err);
      }
    });
  });
```

* Diagram
```

                  *************************
         *********                         *********
     ****                                           ****
  ***    +---------------+      +---------------+       ***
**       |               |      |               |          **
*        | nsqlookupd1   |      | nsqlookupd2   |           *
**       |               |      |               |          **
  ***    +---------------+      +---------------+       ***
     ****                                           ****
         *********                         *********
                  *************************
                             ^
                             |
                             |
                      +------+------+
                      |             |
                      |  Prroducer  |
                      |             |
                      +-+----+----+-+
                        |    |    |
         +--------------+    |    +---------------+
         |  msg1             |              msg1  |
         |                   |msg1                |
         v                   v                    v
     +---+----+         +----+---+           +----+---+
     |        |         |        |           |        |
     | nsqd1  |         | nsqd2  |           | nsqd2  |
     |        |         |        |           |        |
     +--------+         +--------+           +--------+
```

#### Connect a single nsqd directly
This is useful for development or debugging.

```js
  const Producer = require('nsq-strategies').Producer;
  const p = new Producer({
    nsqdHost: '127.0.0.1',
    tcpPort: 9031
  });
  p.connect(() => {
    p.produce(topic, 'message', (err) => {
      if (err) {
        console.log(err);
      }
    });
  });
```
#### Singleton producer
Ordinarily you only need one producer in your application, you can use the singleton method for convenience.
```js
  const Producer = require('nsq-strategies').Producer;
  const lookupdAddr = ['127.0.0.1:9011', '127.0.0.1:9012'];
  const opt = { strategy: Producer.ROUND_ROBIN };
  //singleton will call connect automatically
  Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt, (e, p) => {
    p.produce(topic, 'some message', (err) => {
      //TODO
    });

```

### new Consumer(topic, channel, option)
* `option`:
  * `autoConnect`: boolean (default: true)
  * Other optional properties can be refered to https://github.com/dudleycarr/nsqjs#new-readertopic-channel-options for parameters usages. Currently `Consumer` is just a delegation of `Reader` in nsqjs.

Example:
```js
  const Consumer = require('nsq-strategies').Consumer;
  const c = new Consumer('topic', 'channel', {
      lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
    });
  c.consume((msg) => {
    console.log(msg.body.toString());
    const result = handle(msg);
    if (result) {
      msg.finish();
    } else {
      msg.requeue(3000); //requeue with delay of 3000 milliseconds
    }
  });
```

## Nsqd Connection

There's an auto rennection mechanisim on prodcuer, which means if you lost the connection of the nsqd discovered,
it will try to reconnect automatically in an exponential way until it's timeouted.

## Produce retry

For every `produce`, you can set the exponential retry for the message.
```js
const opt = {
  retry: {
    retries: 5,
    factor: 3
    //forever: true
  }
};
p.produce(topic, 'message', opt, (err) => {
  if (err) {
    console.log(err);
  }
});
```
* retries: The maximum amount of times to retry, Default is 10.
* factor: The exponential factor to use. Default is 2.
* forever: Whether to retry forever, defaults to false.
* refer [retry](https://www.npmjs.com/package/retry#api) for more options.

## TODO
* Load balance strategy(pick the nsqd which has least topics)
* An option to config the retry times/backoff of nsqd reconnection
* Auto refresh the nsqd pool

## License
MIT
