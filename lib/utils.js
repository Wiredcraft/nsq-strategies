'use strict';

exports.toArray = function(str) {
  return str.split(',').map(address => {
    return address.trim();
  });
};

exports.pickSomeWithCursor = function(n, cursor, arr) {
  const result = [];
  for (let i = 0; i < n; i++) {
    let idx = i + cursor;
    if (idx > arr.length - 1) {
      idx = idx - arr.length;
    }
    result.push(arr[idx]);
  }
  return result;
};
