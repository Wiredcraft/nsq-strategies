import { Lookupd } from './Lookupd';
import { toArray } from '../utils';

/**
 * Multiple NSQ Lookupd.
 */
export class LookupdCluster {
  private _lookupds: Lookupd[];
  constructor(options: string | string[]) {
    let lookupdHTTPAddresses: string[];
    if (Array.isArray(options)) {
      lookupdHTTPAddresses = options;
    } else if (typeof options === 'string') {
      lookupdHTTPAddresses = toArray(options);
    }
    if (!Array.isArray(lookupdHTTPAddresses) || lookupdHTTPAddresses.length === 0) {
      throw new Error('The option lookupdHTTPAddresses is required');
    }
    this._lookupds = lookupdHTTPAddresses.map(toURL).map((address) => {
      return new Lookupd(address);
    });
  }

  async nodes() {
    const set = {};
    const producers = await Promise.all(
      this._lookupds.map(async (lookupd) => {
        return (await lookupd.nodes()).data.producers;
      })
    );
    return producers.flat().reduce((prev, node) => {
      if (!set[node.hostname]) {
        set[node.hostname] = true;
        prev.push(node);
      }
      return prev;
    }, []);
  }
}

/**
 * Map helper.
 */
function toURL(address: string) {
  if (address.indexOf('http') === 0) {
    return address;
  }
  return 'http://' + address;
}
