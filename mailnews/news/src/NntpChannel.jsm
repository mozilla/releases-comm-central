/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpChannel"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  AppConstants: "resource://gre/modules/AppConstants.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
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
   * @param {nsILoadInfo} loadInfo - The loadInfo associated with the channel.
   */
  constructor(uri, loadInfo) {
    try {
      this._server = MailServices.accounts
        .findServerByURI(uri, false)
        .QueryInterface(Ci.nsINntpIncomingServer);
    } catch (e) {
      this._server = MailServices.accounts
        .createIncomingServer("", uri.asciiHost, "nntp")
        .QueryInterface(Ci.nsINntpIncomingServer);
      this._server.port = uri.port;
    }

    if (uri.port < 1) {
      // Ensure the uri has a port so that memory cache works.
      uri = uri
        .mutate()
        .setPort(this._server.port)
        .finalize();
    }

    // Two forms of the uri:
    // - news://news.mozilla.org:119/mailman.30.1608649442.1056.accessibility%40lists.mozilla.org?group=mozilla.accessibility&key=378
    // - news://news.mozilla.org:119/id@mozilla.org
    let url = new URL(uri.spec);
    this._groupName = url.searchParams.get("group");
    if (this._groupName) {
      this._newsFolder = this._server.rootFolder.getChildNamed(
        decodeURIComponent(url.searchParams.get("group"))
      );
      this._articleNumber = url.searchParams.get("key");
    } else {
      this._messageId = url.pathname.slice(1);
    }

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
      "open not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  asyncOpen(listener) {
    this._listener = listener;
    if (this.URI.spec.includes("?part=") || this.URI.spec.includes("&part=")) {
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
    try {
      // Attempt to get the message from the offline storage.
      try {
        if (this._readFromOfflineStorage()) {
          return;
        }
      } catch (e) {}

      let uri = this.URI;
      if (this.URI.spec.includes("?")) {
        // A full news url may look like
        // news://<host>:119/<Msg-ID>?group=<name>&key=<key>&header=quotebody.
        // Remove any query strings to keep the cache key stable.
        uri = uri
          .mutate()
          .setQuery("")
          .finalize();
      }

      // Check if a memory cache is available for the current URI.
      MailServices.nntp.cacheStorage.asyncOpenURI(
        uri,
        "",
        Ci.nsICacheStorage.OPEN_NORMALLY,
        this
      );
    } catch (e) {
      this._readFromServer();
    }
  }

  /**
   * Try to read the article from the offline storage.
   * @returns {boolean} True if successfully read from the offline storage.
   */
  _readFromOfflineStorage() {
    if (!this._newsFolder) {
      return false;
    }
    if (!this._newsFolder.hasMsgOffline(this._articleNumber)) {
      return false;
    }
    let stream = this._newsFolder.getSlicedOfflineFileStream(
      this._articleNumber
    );
    this._readFromCacheStream(stream);
    return true;
  }

  /**
   * Read the article from the a stream.
   * @param {nsIInputStream} cacheStream - The input stream to read.
   */
  _readFromCacheStream(cacheStream) {
    let pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(
      Ci.nsIInputStreamPump
    );
    this.contentLength = 0;
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
        this.contentLength += count;
        this._listener.onDataAvailable(null, stream, offset, count);
        try {
          if (!cacheStream.available()) {
            cacheStream.close();
          }
        } catch (e) {}
      },
    });
  }

  /**
   * Retrieve the article from the server.
   */
  _readFromServer() {
    let pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
    pipe.init(true, true, 0, 0);
    let inputStream = pipe.inputStream;
    let outputStream = pipe.outputStream;
    if (this._newsFolder) {
      this._newsFolder.saveArticleOffline = this._newsFolder.shouldStoreMsgOffline(
        this._articleNumber
      );
    }

    let lineSeparator = AppConstants.platform == "win" ? "\r\n" : "\n";

    this._server.wrappedJSObject.withClient(client => {
      client.onOpen = () => {
        if (this._messageId) {
          client.getArticleByMessageId(this._messageId);
        } else {
          client.getArticleByArticleNumber(
            this._groupName,
            this._articleNumber
          );
        }
        if (this.loadGroup) {
          this.loadGroup.addRequest(this, null);
        }
        this._listener.onStartRequest(this);
      };

      client.onData = data => {
        outputStream.write(data, data.length);
        this._listener.onDataAvailable(null, inputStream, 0, data.length);
        // NewsFolder will decide whether to save it to the offline storage.
        this._newsFolder?.notifyDownloadedLine(
          data.slice(0, -2) + lineSeparator,
          this._articleNumber
        );
      };

      client.onDone = () => {
        this._listener.onStopRequest(null, Cr.NS_OK);
        if (this.loadGroup) {
          this.loadGroup.removeRequest(this, null, Cr.NS_OK);
        }
        this._newsFolder?.notifyDownloadedLine(
          `.${lineSeparator}`,
          this._articleNumber
        );
        this._newsFolder?.msgDatabase.Commit(
          Ci.nsMsgDBCommitType.kSessionCommit
        );
      };
    });
  }
}
