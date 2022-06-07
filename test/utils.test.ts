import { partialPickWithIndex } from '../src/utils';

describe('partialPickWithIndex', () => {
  it('should get N', () => {
    const arr = ['foo', 'bar', 'baz', 'quz'];
    const result = partialPickWithIndex(2, 0, arr);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('foo');
    expect(result[1]).toBe('bar');
  });

  it('should get N even if the cursor + N exceeds the length', () => {
    const arr = ['foo', 'bar', 'baz', 'quz'];
    const result = partialPickWithIndex(2, 3, arr);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('quz');
    expect(result[1]).toBe('foo');
  });
  it('should get all if the number equals to the length', () => {
    const arr = ['foo', 'bar', 'baz', 'quz'];
    const result = partialPickWithIndex(4, 1, arr);
    expect(result).toHaveLength(4);
    expect(result[0]).toBe('bar');
    expect(result[1]).toBe('baz');
    expect(result[2]).toBe('quz');
    expect(result[3]).toBe('foo');
  });

  it('should get all if the number larger than the length', () => {
    const arr = ['foo', 'bar', 'baz', 'quz'];
    const result = partialPickWithIndex(6, 1, arr);
    expect(result).toHaveLength(4);
    expect(result[0]).toBe('bar');
    expect(result[1]).toBe('baz');
    expect(result[2]).toBe('quz');
    expect(result[3]).toBe('foo');
  });
});
