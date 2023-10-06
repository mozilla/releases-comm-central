/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env mozilla/chrome-worker, node */
importScripts("resource://gre/modules/workers/require.js");
var PromiseWorker = require("resource://gre/modules/workers/PromiseWorker.js");
var Funcs = {};

// Only what we need from libotr.js
Funcs.generateKey = function (path, otrl_version, address) {
  const libotr = ctypes.open(path);

  const abi = ctypes.default_abi;
  const gcry_error_t = ctypes.unsigned_int;

  // Initialize the OTR library. Pass the version of the API you are using.
  const otrl_init = libotr.declare(
    "otrl_init",
    abi,
    gcry_error_t,
    ctypes.unsigned_int,
    ctypes.unsigned_int,
    ctypes.unsigned_int
  );

  // Do the private key generation calculation. You may call this from a
  // background thread.  When it completes, call
  // otrl_privkey_generate_finish from the _main_ thread.
  const otrl_privkey_generate_calculate = libotr.declare(
    "otrl_privkey_generate_calculate",
    abi,
    gcry_error_t,
    ctypes.void_t.ptr
  );

  otrl_init.apply(libotr, otrl_version);

  const newkey = ctypes.voidptr_t(ctypes.UInt64("0x" + address));
  const err = otrl_privkey_generate_calculate(newkey);
  libotr.close();
  if (err) {
    throw new Error("otrl_privkey_generate_calculate (" + err + ")");
  }
};

var worker = new PromiseWorker.AbstractWorker();

worker.dispatch = function (method, args = []) {
  return Funcs[method](...args);
};

worker.postMessage = function (res, ...args) {
  self.postMessage(res, ...args);
};

worker.close = function () {
  self.close();
};

self.addEventListener("message", msg => worker.handleMessage(msg));
