/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Assert } from "resource://testing-common/Assert.sys.mjs";

const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
const contractID = "@mozilla.org/uriloader/external-protocol-service;1";
let oldClassID;
const newClassID = Services.uuid.generateUUID();
const factory = {
  QueryInterface: ChromeUtils.generateQI(["nsIFactory"]),
  createInstance(iid) {
    return new MockExternalProtocolServiceInstance().QueryInterface(iid);
  },
};

export const MockExternalProtocolService = {
  /**
   * The URLs passed to `loadURI`, in order.
   *
   * @type {string[]}
   */
  urls: [],

  /**
   * A deferred Promise that resolves when `loadURI` is called.
   *
   * @type {PromiseWithResolvers}
   */
  _deferred: null,

  /**
   * Register the mock protocol service with XPCOM.
   */
  init() {
    oldClassID = registrar.contractIDToCID(contractID);
    registrar.registerFactory(newClassID, "", contractID, factory);
  },

  /**
   * Unregister the mock protocol service with XPCOM.
   */
  cleanup() {
    Assert.equal(
      this.urls.length,
      0,
      "found URLs that should have been handled by the test: " + this.urls
    );
    registrar.unregisterFactory(newClassID, factory);
    registrar.registerFactory(oldClassID, "", contractID, null);
    this.reset();
  },

  /**
   * Clear the history of opened URLs and reject any open Promises.
   */
  reset() {
    this.urls.length = 0;
    this._deferred?.reject(new Error("Cleaning up for new scenario"));
    this._deferred = null;
  },

  /**
   * Get a Promise that resolves with an URL string when `loadURI` is called.
   *
   * @returns {Promise}
   */
  promiseLoad() {
    if (!this._deferred) {
      this._deferred = Promise.withResolvers();
    }
    return this._deferred.promise;
  },

  /**
   * Assert that `loadURI` has been called with (and only with) the given URL,
   * and clear the history of opened URLs.
   *
   * @param {string} url - The URL to check.
   * @returns {boolean}
   */
  assertHasLoadedURL(url) {
    Assert.equal(
      this.urls.length,
      1,
      "should have attempted to open exactly 1 URL in a browser"
    );
    Assert.equal(
      this.urls[0],
      url,
      "should have attempted to open the right URL"
    );
    this.urls.length = 0;
  },
};

/** @implements {nsIExternalProtocolService} */
class MockExternalProtocolServiceInstance {
  QueryInterface = ChromeUtils.generateQI(["nsIExternalProtocolService"]);

  externalProtocolHandlerExists() {
    return false;
  }

  isExposedProtocol(scheme) {
    // Match current network.protocol-handler.expose.<scheme> prefs.
    return /^(about|blob|chrome|data|file|https?|imap|javascript|mailto|mid|moz-extension|s?news|nntp|pop)$/.test(
      scheme
    );
  }

  getProtocolHandlerInfo() {
    throw Components.Exception(
      "getProtocolHandlerInfo not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  getProtocolHandlerInfoFromOS() {
    throw Components.Exception(
      "getProtocolHandlerInfoFromOS not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  setProtocolHandlerDefaults() {}

  loadURI(uri) {
    dump(`loadURI: ${uri.spec}\n`);
    if (MockExternalProtocolService._deferred) {
      MockExternalProtocolService._deferred?.resolve(uri.spec);
      MockExternalProtocolService._deferred = null;
    } else {
      MockExternalProtocolService.urls.push(uri.spec);
    }
  }

  getApplicationDescription() {
    throw Components.Exception(
      "getApplicationDescription not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  isCurrentAppOSDefaultForProtocol() {
    return true;
  }
}
