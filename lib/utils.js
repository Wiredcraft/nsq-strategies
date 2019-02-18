'use strict';

exports.toArray = function(str) {
  return str.split(',').map(address => {
    return address.trim();
  });
};
