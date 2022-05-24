/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapChannel"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  MailServices: "resource:///modules/MailServices.jsm",
});

/**
 * A channel to interact with IMAP server.
 * @implements {nsIChannel}
 * @implements {nsIRequest}
 */
class ImapChannel {
  QueryInterface = ChromeUtils.generateQI(["nsIChannel", "nsIRequest"]);

  _logger = console.createInstance({
    prefix: "mailnews.imap",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mailnews.imap.loglevel",
  });

  /**
   * @param {nsIURI} uri - The uri to construct the channel from.
   * @param {nsILoadInfo} loadInfo - The loadInfo associated with the channel.
   */
  constructor(uri, loadInfo) {
    this._server = MailServices.accounts
      .findServerByURI(uri)
      .QueryInterface(Ci.nsIImapIncomingServer);

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
      "ImapChannel.open() not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  asyncOpen(listener) {
    this._logger.debug(`asyncOpen ${this.URI.spec}`);
    this._listener = listener;
    let msgIds = this.URI.QueryInterface(Ci.nsIImapUrl).QueryInterface(
      Ci.nsIMsgMailNewsUrl
    ).listOfMessageIds;
    this._msgKey = parseInt(msgIds);
    try {
      if (this._readFromLocalCache()) {
        return;
      }
    } catch (e) {}

    this._readFromServer();
  }

  /**
   * Try to read the message from the offline storage.
   * @returns {boolean} True if successfully read from the offline storage.
   */
  _readFromLocalCache() {
    if (
      !this.URI.QueryInterface(Ci.nsIImapUrl).QueryInterface(
        Ci.nsIMsgMailNewsUrl
      ).msgIsInLocalCache
    ) {
      return false;
    }

    let stream = this.URI.folder.getSlicedOfflineFileStream(this._msgKey);
    let pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(
      Ci.nsIInputStreamPump
    );
    this.contentLength = 0;
    this._contentType = "";
    pump.init(stream, 0, 0, true);
    pump.asyncRead({
      onStartRequest: () => {
        this._listener.onStartRequest(this);
      },
      onStopRequest: (request, status) => {
        this._listener.onStopRequest(null, status);
        try {
          this.loadGroup?.removeRequest(this, null, Cr.NS_OK);
        } catch (e) {}
      },
      onDataAvailable: (request, stream, offset, count) => {
        this.contentLength += count;
        this._listener.onDataAvailable(null, stream, offset, count);
        try {
          if (!stream.available()) {
            stream.close();
          }
        } catch (e) {}
      },
    });
    return true;
  }

  /**
   * Retrieve the message from the server.
   */
  _readFromServer() {
    let pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
    pipe.init(true, true, 0, 0);
    let inputStream = pipe.inputStream;
    let outputStream = pipe.outputStream;

    this._server.wrappedJSObject.withClient(client => {
      client.runningUri = this.URI.QueryInterface(Ci.nsIMsgMailNewsUrl);
      this._listener.onStartRequest(this);
      client.onReady = () => {
        client.fetchMessage(this.URI.folder, this._msgKey);
      };

      client.onData = data => {
        if (!data) {
          try {
            this.loadGroup?.removeRequest(this, null, Cr.NS_OK);
          } catch (e) {}
          this._listener.onStopRequest(null, Cr.NS_OK);
          return;
        }
        outputStream.write(data, data.length);
        this._listener.onDataAvailable(null, inputStream, 0, data.length);
      };
    });
  }
}
