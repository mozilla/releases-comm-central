/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module is responsible for performing DNS queries using ctypes for
 * loading system DNS libraries on Linux, Mac and Windows.
 */

import { BasePromiseWorker } from "resource://gre/modules/PromiseWorker.sys.mjs";

// These constants are luckily shared, but with different names
const NS_T_TXT = 16; // DNS_TYPE_TXT
const NS_T_SRV = 33; // DNS_TYPE_SRV
const NS_T_MX = 15; // DNS_TYPE_MX

// References to all active workers, so they don't get GC'ed while busy.
const workers = new Set();

export const DNS = {
  /**
   * Constants for use with the lookup function.
   */
  TXT: NS_T_TXT,
  SRV: NS_T_SRV,
  MX: NS_T_MX,

  /**
   * Do an asynchronous DNS lookup. The returned promise resolves with
   * one of SRVRecord, TXTRecord, or MXRecord objects as defined in
   * dnsWorker.js, or rejects with the error from the worker.
   *
   * Example: DNS.lookup("_caldavs._tcp.example.com", DNS.SRV)
   *
   * @param _aName           The aName to look up.
   * @param _aTypeID         The RR type to look up as a constant.
   * @returns A promise resolved when completed.
   */
  async lookup(_aName, _aTypeID) {
    const worker = new BasePromiseWorker("resource:///modules/dnsWorker.js");
    workers.add(worker);
    let result;
    try {
      result = await worker.post("execute", [
        Services.appinfo.OS,
        "lookup",
        [...arguments],
      ]);
    } finally {
      workers.delete(worker);
    }
    return result;
  },

  /** Convenience functions */
  srv(aName) {
    return this.lookup(aName, NS_T_SRV);
  },
  txt(aName) {
    return this.lookup(aName, NS_T_TXT);
  },
  mx(aName) {
    return this.lookup(aName, NS_T_MX);
  },
};
