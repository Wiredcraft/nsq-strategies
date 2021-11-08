'use strict';

const expect = require('chai').expect;

const { pickSomeWithCursor } = require('../lib/utils');

describe('pickSomeWithCursor', () => {
  it('should get N', () => {
    const arr = ['foo', 'bar', 'baz', 'quz'];
    const result = pickSomeWithCursor(2, 0, arr);
    expect(result).to.have.lengthOf(2);
    expect(result[0]).to.equal('foo');
    expect(result[1]).to.equal('bar');
  });

  it('should get N even if the cursor + N exceeds the length', () => {
    const arr = ['foo', 'bar', 'baz', 'quz'];
    const result = pickSomeWithCursor(2, 3, arr);
    expect(result).to.have.lengthOf(2);
    expect(result[0]).to.equal('quz');
    expect(result[1]).to.equal('foo');
  });
  it('should get all if the number equals to the length', () => {
    const arr = ['foo', 'bar', 'baz', 'quz'];
    const result = pickSomeWithCursor(4, 1, arr);
    expect(result).to.have.lengthOf(4);
    expect(result[0]).to.equal('bar');
    expect(result[1]).to.equal('baz');
    expect(result[2]).to.equal('quz');
    expect(result[3]).to.equal('foo');
  });
});
