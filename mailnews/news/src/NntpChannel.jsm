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
  QueryInterface = ChromeUtils.generateQI([
    "nsIChannel",
    "nsIRequest",
    "nsICacheEntryOpenCallback",
  ]);

  /**
   * @param {nsIURI} uri - The uri to construct the channel from.
   */
  constructor(uri) {
    this._server = MailServices.accounts
      .findServerByURI(uri, false)
      .QueryInterface(Ci.nsINntpIncomingServer);

    if (uri.port < 1) {
      // Ensure the uri has a port so that memory cache works.
      uri = uri
        .mutate()
        .setPort(this._server.port)
        .finalize();
    }

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
   * @see nsICacheEntryOpenCallback
   */
  onCacheEntryAvailable(entry, isNew, status) {
    if (!Components.isSuccessCode(status)) {
      // If memory cache doesn't work, read from the server.
      this._readFromServer();
      return;
    }

    if (isNew) {
      // It's a new entry, needs to read from the server.
      let tee = Cc["@mozilla.org/network/stream-listener-tee;1"].createInstance(
        Ci.nsIStreamListenerTee
      );
      let outStream = entry.openOutputStream(0, -1);
      // When the tee stream receives data from the server, it writes to both
      // the original listener and outStream (memory cache).
      tee.init(this._listener, outStream, null);
      this._listener = tee;
      this._readFromServer();
      return;
    }

    // It's an old entry, read from the memory cache.
    let cacheStream = entry.openInputStream(0);
    let pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(
      Ci.nsIInputStreamPump
    );
    this._contentType = "";
    pump.init(cacheStream, 0, 0, true);
    pump.asyncRead({
      onStartRequest: () => {
        if (this.loadGroup) {
          this.loadGroup.addRequest(this, null);
        }
        this._listener.onStartRequest(this);
      },
      onStopRequest: (request, status) => {
        this._listener.onStopRequest(null, status);
        if (this.loadGroup) {
          this.loadGroup.removeRequest(this, null, Cr.NS_OK);
        }
      },
      onDataAvailable: (request, stream, offset, count) => {
        this._listener.onDataAvailable(null, stream, offset, count);
      },
    });
  }

  onCacheEntryCheck(entry) {
    return Ci.nsICacheEntryOpenCallback.ENTRY_WANTED;
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
    this._listener = listener;
    try {
      // Check if a memory cache is available for the current URI.
      MailServices.nntp.cacheStorage.asyncOpenURI(
        this.URI,
        "",
        Ci.nsICacheStorage.OPEN_NORMALLY,
        this
      );
    } catch (e) {
      this._readFromServer();
    }
  }

  /**
   * Retrieve the article from the server.
   */
  _readFromServer() {
    let pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
    pipe.init(true, true, 0, 0);
    let inputStream = pipe.inputStream;
    let outputStream = pipe.outputStream;

    let client = new NntpClient(this._server, this.URI.spec);
    client.connect();
    client.onOpen = () => {
      client.getArticle();
      if (this.loadGroup) {
        this.loadGroup.addRequest(this, null);
      }
      this._listener.onStartRequest(this);
    };

    client.onData = data => {
      outputStream.write(data, data.length);
      this._listener.onDataAvailable(null, inputStream, 0, data.length);
    };

    client.onDone = () => {
      this._listener.onStopRequest(null, Cr.NS_OK);
      if (this.loadGroup) {
        this.loadGroup.removeRequest(this, null, Cr.NS_OK);
      }
    };
  }
}
