'use strict';

exports.toArray = function(str) {
  return str.split(',').map(address => {
    return address.trim();
  });
};

exports.partialPickWithIndex = function(n, startIndex, arr) {
  const result = [];
  if (n > arr.length) {
    n = arr.length;
  }
  for (let i = 0; i < n; i++) {
    let idx = i + startIndex;
    if (idx > arr.length - 1) {
      idx = idx % arr.length;
    }
    result.push(arr[idx]);
  }
  return result;
};
