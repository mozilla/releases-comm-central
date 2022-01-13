/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["Pop3Channel"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  MailServices: "resource:///modules/MailServices.jsm",
  Pop3Client: "resource:///modules/Pop3Client.jsm",
});

/**
 * A channel to interact with POP3 server.
 * @implements {nsIChannel}
 * @implements {nsIRequest}
 */
class Pop3Channel {
  QueryInterface = ChromeUtils.generateQI(["nsIChannel", "nsIRequest"]);

  /**
   * @param {nsIURI} uri - The uri to construct the channel from.
   * @param {nsILoadInfo} loadInfo - The loadInfo associated with the channel.
   */
  constructor(uri, loadInfo) {
    this._server = MailServices.accounts
      .findServerByURI(uri, false)
      .QueryInterface(Ci.nsIPop3IncomingServer);

    // nsIChannel attributes.
    this.originalURI = uri;
    this.URI = uri;
    this.loadInfo = loadInfo;
    this.contentLength = 0;
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
    return this._contentType || "message/rfc822";
  }

  set contentType(value) {
    this._contentType = value;
  }

  get isDocument() {
    return true;
  }

  open() {
    throw Components.Exception(
      "Pop3Channel.open() not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  asyncOpen(listener) {
    let match = this.URI.spec.match(/pop3?:\/\/.+\/\?uidl=(\w+)/);
    let uidl = match?.[1];
    if (!uidl) {
      return;
    }

    let client = new Pop3Client(this._server);
    client.runningUri = this.URI;
    client.connect();
    client.onOpen = () => {
      client.fetchBodyForUidl(
        this.URI.QueryInterface(Ci.nsIPop3URL).pop3Sink,
        uidl
      );
    };
  }
}
