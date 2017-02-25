'use strict';

const Register = require('file-register');

// The lib.
const lib = Register();

// Register files.
lib.register(__dirname);

// Export.
module.exports = lib;
