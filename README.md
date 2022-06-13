# nsq-strategies

[![Build Status](https://travis-ci.org/Wiredcraft/nsq-strategies.svg?branch=master)](https://travis-ci.org/Wiredcraft/nsq-strategies)
[![Coverage Status](https://coveralls.io/repos/github/Wiredcraft/nsq-strategies/badge.svg?branch=master)](https://coveralls.io/github/Wiredcraft/nsq-strategies?branch=master)

## Introduction
Typical strategies of using [NSQ](http://nsq.io/), in Node.js. It's a wrapper of official client library([nsqjs](https://github.com/dudleycarr/nsqjs)) with different strategies.

### Motivation
The [nsqjs](https://github.com/dudleycarr/nsqjs) is handy, but it requires you to send message with a known nsqd address, which's neither impractical nor adhered to the principle of avoiding SPOF.
The best practise is always using nsqlookup, but when you got a bunch of nsqds by lookup, which one should you choose to send the message?
This module preprares some typical strategies for you.

### *Notes*
This library has been upgraded to v2.x by a rewritting in TypeScript, for the users who is using the v1.x version, please refer to [migraiton from v1](#migration-from-v1).

## Installation
`npm install nsq-strategies`

## Usage

### new Producer(connectConfig, option)
* `connectConfig`:
  It can be specified with an array of nsqlookupd addresses or a single nsqd.

* `option`:
  * `strategy`: `PRODUCER_STRATEGY.ROUND_ROBIN` | `PRODUCER_STRATEGY.FAN_OUT` (default: `PRODUCER_STRATEGY.ROUND_ROBIN`)
  * Other optional properties are exactly same with option in `Writer` of nsqjs. Refer [here](https://github.com/dudleycarr/nsqjs#new-writernsqdhost-nsqdport-options) for details.

#### Method
* `produce(topic, msgs[, produceOptions])`
  * `topic`: NSQ Topic
  * `msgs`: NSQ messages, should use array in delay message.
  * `produceOptions`:
    * [`retry`](https://github.com/Wiredcraft/nsq-strategies#produce-retry)
    * `delay`: send delay message in given millisecond.
    * `strategy`: `PRODUCER_STRATEGY.ROUND_ROBIN` | `PPRODUCER_STRATEGY.FAN_OUT` (default: `PRODUCER_STRATEGY.ROUND_ROBIN`)
    * `maxFanoutNodes`: the maximum nodes with FAN_OUT strategy(ignored if the strategy is not FAN_OUT)

#### Round robin strategy

1. The producer discovers the nsqd nodes from lookupd
2. Every `producer` picks up a single nsqd in round-robin way and sends the message.
3. The producer doesn't take the topics into consideration for the round-robin pattern.

* Example

```ts
  import { Producer } from 'nsq-strategies';

  const p = new Producer({
    lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
  }, {
    strategy: PRODUCER_STRATEGY.ROUND_ROBIN
  });
  await p.connect();
  await p.produce('topic', 'message');

  // with options
  // enable retry with default node-promise-retry strategy,
  // send NSQ message with 2-second delay
  await p.produce('topic', 'message', { retry: true, delay: 2000 });

  // with options
  // enable retry with given node-promise-retry strategy,
  // send NSQ message with 2-second delay
  await p.produce('topic', 'message', { retry: {
      retries: 3,
      minTimeout: 300
    }, delay: 2000 });

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
                      |  Producer   |                        
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
2. Every `producer` spreads the message to all nsqd nodes.
3. This stategy is mainly for delivery guarantee, it's **not** designed for pub-sub mode in nsq,
note the message is duplicated among the nsqds, if you have a consumer(client) listening to it's topic, it will get the same message multiple times,
if this is not expected you have to de-dupe in the consumer side or make the operation for the message idempotent.

* Example
```ts
  import { Producer, PRODUCER_STRATEGY } from 'nsq-strategies';
  const p = new Producer({
    lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
  }, {
    strategy: PRODUCER_STRATEGY.FAN_OUT
  });
  await p.connect();
  await p.produce('topic', 'message');
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
                      |  Producer   |                        
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

```ts
  import { Producer } from 'nsq-strategies';
  const p = new Producer({
    nsqdHost: '127.0.0.1',
    tcpPort: 9031
  });
  await p.connect();
  await p.produce(topic, 'message');
```

#### Singleton producer
Ordinarily you only need one producer in your application, you can use the singleton method for convenience.
```js
  import { Producer, PRODUCER_STRATEGY} from 'nsq-strategies';
  const lookupdAddr = ['127.0.0.1:9011', '127.0.0.1:9012'];
  const opt = { strategy: PRODUCER_STRATEGY.ROUND_ROBIN };
  //singleton will call connect automatically
  const producer = await Producer.singleton({ lookupdHTTPAddresses: lookupdAddr }, opt);
  await p.produce(topic, 'some message');

```

### new Consumer(topic, channel, option)
* `option`:
  * `autoConnect`: boolean (default: true)
  * Other optional properties can be refered to https://github.com/dudleycarr/nsqjs#new-readertopic-channel-options for parameters usages. Currently `Consumer` is mostly a delegation of `Reader` in nsqjs.

Example:
```js
  import { Consumer } from 'nsq-strategies';
  const c = new Consumer('topic', 'channel', {
      lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
    });
  // callback style
  c.consume((msg) => {
    console.log(msg.body.toString());
    const result = handle(msg);
    if (result) {
      msg.finish();
    } else {
      msg.requeue(3000); //requeue with delay of 3000 milliseconds
    }
  });
  
  // Observable style
  const consumer$ = c.toRx();
  consumer$.subscribe({
    next: (msg) => handle(msg),
    error: (err) => console.log(err),
    complete: () => console.log('completed')
  });

```

## Nsqd Connection

There's an auto rennection mechanisim on prodcuer, which means if you lost the connection of the nsqd discovered,
it will try to reconnect automatically in an exponential way until it's timeouted.

## Produce retry

For every `produce`, you can set the exponential retry for the message.
```ts
const opt = {
  retry: {
    retries: 5,
    factor: 3
    //forever: true
  }
};
await p.produce(topic, 'message', opt, );
```
* retries: The maximum amount of times to retry, Default is 10.
* factor: The exponential factor to use. Default is 2.
* forever: Whether to retry forever, defaults to false.
* refer [retry](https://www.npmjs.com/package/retry#api) for more options.

## Testing fixture for nsq

Testing with message queue is not easy, of course you can test your codes with a booted nsq clusters with dockers like [this](https://github.com/Wiredcraft/nsq-strategies/blob/bede44d8dd05b1418e3b473ca96c08e7ae142630/dockers/up.sh#L13-L14), but you should focus on your business logic instead of the nsq itself.
This library provides a fake simplistic in-memory queue with exact the same interfaces of the Producer/Consumer for your testing convenience.

```ts

  import { Producer, Consumer, setMock } from 'nsq-strategies';

  // CAVEAT: the setMock should be prior to the creation of Producer/Consumer
  setMokc(true);


  const p = new Producer({
    lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
  });
  await p.connect();
  await p.produce('topic', 'message');

  // The message sent by the producer above will flow to the same topic of consumers
  const c = new Consumer('topic', 'channel', {
      lookupdHTTPAddresses: ['127.0.0.1:9011', '127.0.0.1:9012']
  });
  const consumer$ = c.toRx();
  consumer$.subscribe((msg) => console.log(msg.toString()));

```


## Migration from v1
A few major changes from v1.x
* We moved to TypeScript.
* We abandoned the callback pattern and adopted aysnc/Consumer.
* The `Consumer` now support Rxjs by returning an Observable.
* The RestFul APIs for Nsqd/Lookup/LookupdCluster now return [Axios](https://www.npmjs.com/package/axios) Response.
* `Producer`.`ROUND_ROBIN` / `FAN_OUT` are renamed to `PRODUCER_STRATEGY`.`ROUND_ROBIN` / `FAN_OUT`. 

## TODO
* Load balance strategy(pick the nsqd which has least topics)
* An option to config the retry times/backoff of nsqd reconnection
* Auto refresh the nsqd pool

## License
MIT
