'use strict';

const Promise = require('bluebird');

const Lookupd = require('./Lookupd');
const { toArray } = require('../utils');

/**
 * Multiple NSQ Lookupd.
 */
module.exports = class LookupdCluster {
  constructor(options) {
    if (Array.isArray(options)) {
      options = { lookupdHTTPAddresses: options };
    } else if (typeof options === 'string') {
      options = { lookupdHTTPAddresses: toArray(options) };
    }
    if (!Array.isArray(options.lookupdHTTPAddresses) || options.lookupdHTTPAddresses.length === 0) {
      throw new Error('The option lookupdHTTPAddresses is required');
    }
    this._options = options;
    this._lookupds = options.lookupdHTTPAddresses.map(toURL).map(address => {
      return new Lookupd(address);
    });
  }

  // lookup(topic) {}

  // topics() {}

  // channels(topic) {}

  nodes() {
    const set = {};
    return Promise.map(this._lookupds, lookupd => {
      return lookupd
        .nodes()
        .get(1)
        .get('producers');
    })
      .reduce((res, nodes) => {
        return Promise.reduce(nodes, notNull, res);
      }, [])
      .filter(
        node => {
          // Dedupe.
          const address = node.broadcast_address + ':' + node.tcp_port;
          set[address] = set[address] == null;
          return set[address];
        },
        { concurrency: 1 }
      );
  }
};

/**
 * Reduce helper.
 */
function notNull(res, node) {
  if (node != null) {
    res.push(node);
  }
  return res;
}

/**
 * Map helper.
 */
function toURL(address) {
  if (address.indexOf('http') === 0) {
    return address;
  }
  return 'http://' + address;
}
