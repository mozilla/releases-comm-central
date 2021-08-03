/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpChannel"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  MailServices: "resource:///modules/MailServices.jsm",
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
    // nsIChannel attributes.
    this.originalURI = uri;
    this.URI = uri;
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
      "open not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  asyncOpen(listener) {
    let pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
    pipe.init(true, true, 0, 0);
    let inputStream = pipe.inputStream;
    let outputStream = pipe.outputStream;

    let server = MailServices.accounts
      .findServerByURI(this.URI, false)
      .QueryInterface(Ci.nsINntpIncomingServer);
    let client = new NntpClient(server, this.URI.spec);
    client.connect();
    client.onOpen = () => {
      client.getArticle();
      if (this.loadGroup) {
        this.loadGroup.addRequest(this, null);
      }
      let converter = Cc["@mozilla.org/streamConverters;1"].getService(
        Ci.nsIStreamConverterService
      );
      listener = converter.asyncConvertData(
        "message/rfc822",
        "*/*",
        listener,
        this
      );
      listener.onStartRequest(this);
    };

    client.onData = data => {
      outputStream.write(data, data.length);
      listener.onDataAvailable(null, inputStream, 0, data.length);
    };

    client.onDone = () => {
      listener.onStopRequest(null, Cr.NS_OK);
      if (this.loadGroup) {
        this.loadGroup.removeRequest(this, null, Cr.NS_OK);
      }
    };
  }
}
