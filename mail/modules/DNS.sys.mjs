/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module is responsible for performing DNS queries using ctypes for
 * loading system DNS libraries on Linux, Mac and Windows.
 */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { AsyncShutdown } from "resource://gre/modules/AsyncShutdown.sys.mjs";
import { BasePromiseWorker } from "resource://gre/modules/PromiseWorker.sys.mjs";

// These constants are luckily shared, but with different names
const NS_T_TXT = 16; // DNS_TYPE_TXT
const NS_T_SRV = 33; // DNS_TYPE_SRV
const NS_T_MX = 15; // DNS_TYPE_MX

export const DNS = {
  /**
   * Constants for use with the lookup function.
   */
  TXT: NS_T_TXT,
  SRV: NS_T_SRV,
  MX: NS_T_MX,

  worker: null,

  /**
   * Do an asynchronous DNS lookup. The returned promise resolves with
   * one of SRVRecord, TXTRecord, or MXRecord objects as defined in
   * dnsWorker.js, or rejects with the error from the worker.
   *
   * Example: await DNS.lookup("_caldavs._tcp.example.com", DNS.SRV)
   *
   * @param {string} _name - The hostname to look up records for.
   * @param {string} _recordTypeID - The RR type to look up as a constant.
   * @returns {Promise<object[]>} records
   */
  async lookup(_name, _recordTypeID) {
    // The platform-specific C APIs used for DNS lookup are not necessarily
    // thread safe, so we maintain a single worker and allow requests to queue
    // so they are executed serially.
    if (!this.worker) {
      this.worker = new BasePromiseWorker(
        "resource:///modules/DNS.worker.mjs",
        {
          type: "module",
        }
      );

      const self = this;

      // Ensure the worker is stopped prior to web worker shutdown.
      AsyncShutdown.webWorkersShutdown.addBlocker(
        "Thunderbird DNS: Shutting down.",
        function () {
          if (self.worker) {
            self.worker.terminate();
            // Allow GC.
            self.worker = null;
          }
        }
      );
    }
    return await this.worker.post("execute", [
      AppConstants.platform,
      AppConstants.unixstyle,
      "lookup",
      [...arguments],
    ]);
  },

  /**
   * Look up SRV records for hostname.
   *
   * @param {string} hostname
   * @returns {Promise<SRVRecord[]>} records.
   */
  async srv(hostname) {
    return this.lookup(hostname, NS_T_SRV);
  },

  /**
   * Look up TXT records for hostname.
   *
   * @param {string} hostname
   * @returns {Promise<TXTRecord[]>} records.
   */
  async txt(hostname) {
    return this.lookup(hostname, NS_T_TXT);
  },

  /**
   * Look up MX records for hostname.
   *
   * @param {string} hostname
   * @returns {Promise<MXRecord[]>} records.
   */
  async mx(hostname) {
    return this.lookup(hostname, NS_T_MX);
  },
};
