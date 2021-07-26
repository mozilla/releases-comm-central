/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpChannel"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  NntpClient: "resource:///modules/NntpClient.jsm",
});

/**
 * A channel to interact with NNTP server.
 * @implements {nsIChannel}
 * @implements {nsIRequest}
 */
class NntpChannel {
  QueryInterface = ChromeUtils.generateQI(["nsIChannel", "nsIRequest"]);

  constructor(uri) {
    this._uri = uri;
  }

  /**
   * @see nsIRequest
   */
  get status() {
    return Cr.NS_OK;
  }

  /**
   * @see nsIChannel
   */
  get contentType() {
    return "message/rfc822";
  }

  open() {
    throw Components.Exception(
      "open not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  asyncOpen(listener) {
    throw Components.Exception(
      "asyncOpen not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }
}
