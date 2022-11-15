/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapChannel"];

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { ImapUtils } = ChromeUtils.import("resource:///modules/ImapUtils.jsm");

/**
 * A channel to interact with IMAP server.
 * @implements {nsIChannel}
 * @implements {nsIRequest}
 * @implements {nsICacheEntryOpenCallback}
 */
class ImapChannel {
  QueryInterface = ChromeUtils.generateQI([
    "nsIChannel",
    "nsIRequest",
    "nsIWritablePropertyBag",
    "nsICacheEntryOpenCallback",
  ]);

  _logger = ImapUtils.logger;

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
    try {
      this.contentLength = uri.QueryInterface(
        Ci.nsIMsgMessageUrl
      ).messageHeader.messageSize;
    } catch (e) {}
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
      this._cacheEntry = entry;
      this._readFromServer();
      return;
    }

    // It's an old entry, read from the memory cache.
    this._readFromCacheStream(entry.openInputStream(0));
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
      "ImapChannel.open() not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  asyncOpen(listener) {
    this._logger.debug(`asyncOpen ${this.URI.spec}`);
    let url = new URL(this.URI.spec);
    this._listener = listener;
    if (url.searchParams.get("part")) {
      let converter = Cc["@mozilla.org/streamConverters;1"].getService(
        Ci.nsIStreamConverterService
      );
      this._listener = converter.asyncConvertData(
        "message/rfc822",
        "*/*",
        listener,
        this
      );
    }

    let msgIds = this.URI.QueryInterface(Ci.nsIImapUrl).QueryInterface(
      Ci.nsIMsgMailNewsUrl
    ).listOfMessageIds;
    this._msgKey = parseInt(msgIds);
    this.contentLength = 0;
    try {
      if (this.readFromLocalCache()) {
        this._logger.debug("Read from local cache");
        return;
      }
    } catch (e) {
      this._logger.warn(e);
    }

    try {
      let uri = this.URI;
      if (this.URI.spec.includes("?")) {
        uri = uri
          .mutate()
          .setQuery("")
          .finalize();
      }
      // Check if a memory cache is available for the current URI.
      MailServices.imap.cacheStorage.asyncOpenURI(
        uri,
        "",
        this.URI.QueryInterface(Ci.nsIImapUrl).storeResultsOffline
          ? // Don't write to the memory cache if storing offline.
            Ci.nsICacheStorage.OPEN_READONLY
          : Ci.nsICacheStorage.OPEN_NORMALLY,
        this
      );
    } catch (e) {
      this._logger.warn(e);
      this._readFromServer();
    }
  }

  /**
   * Try to read the message from the offline storage.
   * @returns {boolean} True if successfully read from the offline storage.
   */
  readFromLocalCache() {
    if (
      !this.URI.QueryInterface(Ci.nsIImapUrl).QueryInterface(
        Ci.nsIMsgMailNewsUrl
      ).msgIsInLocalCache &&
      !this.URI.folder.hasMsgOffline(this._msgKey, null, 10)
    ) {
      return false;
    }

    let hdr = this.URI.folder.GetMessageHeader(this._msgKey);
    let stream = this.URI.folder.getLocalMsgStream(hdr);
    this._readFromCacheStream(stream);
    return true;
  }

  /**
   * Read the message from the a stream.
   * @param {nsIInputStream} cacheStream - The input stream to read.
   */
  _readFromCacheStream(stream) {
    let pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(
      Ci.nsIInputStreamPump
    );
    this._contentType = "";
    pump.init(stream, 0, 0, true);
    pump.asyncRead({
      onStartRequest: () => {
        this._listener.onStartRequest(this);
        this.URI.SetUrlState(true, Cr.NS_OK);
      },
      onStopRequest: (request, status) => {
        this._listener.onStopRequest(this, status);
        this.URI.SetUrlState(false, status);
        try {
          this.loadGroup?.removeRequest(this, null, Cr.NS_OK);
        } catch (e) {}
      },
      onDataAvailable: (request, stream, offset, count) => {
        this.contentLength += count;
        this._listener.onDataAvailable(this, stream, offset, count);
        try {
          if (!stream.available()) {
            stream.close();
          }
        } catch (e) {}
      },
    });
  }

  /**
   * Retrieve the message from the server.
   */
  _readFromServer() {
    this._logger.debug("Read from server");
    let pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
    pipe.init(true, true, 0, 0);
    let inputStream = pipe.inputStream;
    let outputStream = pipe.outputStream;

    this._server.wrappedJSObject.withClient(this.URI.folder, client => {
      client.startRunningUrl(null, null, this.URI);
      client.channel = this;
      this._listener.onStartRequest(this);
      client.onReady = () => {
        client.fetchMessage(this.URI.folder, this._msgKey);
      };

      client.onData = data => {
        this.contentLength += data.length;
        outputStream.write(data, data.length);
        this._listener.onDataAvailable(this, inputStream, 0, data.length);
      };

      client.onDone = status => {
        try {
          this.loadGroup?.removeRequest(this, null, status);
        } catch (e) {}
        this._listener.onStopRequest(this, status);
      };
    });
  }

  /** @see nsIWritablePropertyBag */
  getProperty(key) {
    return this[key];
  }

  setProperty(key, value) {
    this[key] = value;
  }

  deleteProperty(key) {
    delete this[key];
  }
}
