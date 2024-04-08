/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailChannel } from "resource:///modules/MailChannel.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NntpUtils: "resource:///modules/NntpUtils.sys.mjs",
});

/**
 * A channel to interact with NNTP server.
 *
 * @implements {nsIChannel}
 * @implements {nsIRequest}
 * @implements {nsICacheEntryOpenCallback}
 */
export class NntpChannel extends MailChannel {
  QueryInterface = ChromeUtils.generateQI([
    "nsIMailChannel",
    "nsIChannel",
    "nsIRequest",
    "nsICacheEntryOpenCallback",
  ]);

  _logger = lazy.NntpUtils.logger;
  _status = Cr.NS_OK;

  /**
   * @param {nsIURI} uri - The uri to construct the channel from.
   * @param {nsILoadInfo} [loadInfo] - The loadInfo associated with the channel.
   */
  constructor(uri, loadInfo) {
    super();
    this._server = lazy.NntpUtils.findServer(uri.asciiHost);
    if (!this._server) {
      this._server = MailServices.accounts
        .createIncomingServer("", uri.asciiHost, "nntp")
        .QueryInterface(Ci.nsINntpIncomingServer);
      this._server.port = uri.port;
    }

    if (uri.port < 1) {
      // Ensure the uri has a port so that memory cache works.
      uri = uri.mutate().setPort(this._server.port).finalize();
    }

    // Two forms of the uri:
    // - news://news.mozilla.org:119/mailman.30.1608649442.1056.accessibility%40lists.mozilla.org?group=mozilla.accessibility&key=378
    // - news://news.mozilla.org:119/id@mozilla.org
    const url = new URL(uri.spec);
    this._groupName = url.searchParams.get("group");
    if (this._groupName) {
      this._newsFolder = this._server.rootFolder.getChildNamed(
        decodeURIComponent(url.searchParams.get("group"))
      );
      this._articleNumber = url.searchParams.get("key");
    } else {
      this._messageId = decodeURIComponent(url.pathname.slice(1));
      if (!this._messageId.includes("@")) {
        this._groupName = this._messageId;
        this._messageId = null;
      }
    }

    // nsIChannel attributes.
    this.originalURI = uri;
    this.URI = uri.QueryInterface(Ci.nsIMsgMailNewsUrl);
    this.loadInfo = loadInfo || {
      QueryInterface: ChromeUtils.generateQI(["nsILoadInfo"]),
      loadingPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      internalContentPolicy: Ci.nsIContentPolicy.TYPE_OTHER,
    };
    this.contentLength = 0;
  }

  /**
   * @see nsIRequest
   * @returns {string}
   */
  get name() {
    return this.URI?.spec;
  }

  /**
   * @see nsIRequest
   * @returns {boolean}
   */
  isPending() {
    return !!this._pending;
  }

  /**
   * @see nsIRequest
   * @returns {nsresult}
   */
  get status() {
    return this._status;
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
      if (Services.io.offline) {
        this._status = Cr.NS_ERROR_OFFLINE;
        return;
      }
      // It's a new entry, needs to read from the server.
      const tee = Cc[
        "@mozilla.org/network/stream-listener-tee;1"
      ].createInstance(Ci.nsIStreamListenerTee);
      const outStream = entry.openOutputStream(0, -1);
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

  onCacheEntryCheck() {
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
      `${this.constructor.name}.open not implemented`,
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  asyncOpen(listener) {
    this._logger.debug("asyncOpen", this.URI.spec);
    const url = new URL(this.URI.spec);
    this._listener = listener;
    if (url.searchParams.has("list-ids")) {
      // Triggered by newsError.js.
      this._removeExpired(decodeURIComponent(url.pathname.slice(1)));
      return;
    }

    if (url.searchParams.has("part")) {
      const converter = Cc["@mozilla.org/streamConverters;1"].getService(
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
      } catch (e) {
        this._logger.warn(e);
      }

      let uri = this.URI;
      if (url.search) {
        // A full news url may look like
        // news://<host>:119/<Msg-ID>?group=<name>&key=<key>&header=quotebody.
        // Remove any query strings to keep the cache key stable.
        uri = uri.mutate().setQuery("").finalize();
      }

      // Check if a memory cache is available for the current URI.
      MailServices.nntp.cacheStorage.asyncOpenURI(
        uri,
        "",
        Ci.nsICacheStorage.OPEN_NORMALLY,
        this
      );
    } catch (e) {
      this._logger.warn(e);
      this._readFromServer();
    }
    if (this._status == Cr.NS_ERROR_OFFLINE) {
      throw new Components.Exception(
        "The requested action could not be completed in the offline state",
        Cr.NS_ERROR_OFFLINE
      );
    }
  }

  /**
   * Try to read the article from the offline storage.
   *
   * @returns {boolean} True if successfully read from the offline storage.
   */
  _readFromOfflineStorage() {
    if (!this._newsFolder) {
      return false;
    }
    if (!this._newsFolder.hasMsgOffline(this._articleNumber)) {
      return false;
    }
    const hdr = this._newsFolder.GetMessageHeader(this._articleNumber);
    const stream = this._newsFolder.getLocalMsgStream(hdr);
    this._readFromCacheStream(stream);
    return true;
  }

  /**
   * Read the article from the a stream.
   *
   * @param {nsIInputStream} cacheStream - The input stream to read.
   */
  _readFromCacheStream(cacheStream) {
    const pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(
      Ci.nsIInputStreamPump
    );
    this.contentLength = 0;
    this._contentType = "";
    pump.init(cacheStream, 0, 0, true);
    pump.asyncRead({
      onStartRequest: () => {
        this._listener.onStartRequest(this);
        this.URI.SetUrlState(true, Cr.NS_OK);
        this._pending = true;
      },
      onStopRequest: (request, status) => {
        this._listener.onStopRequest(this, status);
        this.URI.SetUrlState(false, status);
        try {
          this.loadGroup?.removeRequest(this, null, Cr.NS_OK);
        } catch (e) {}
        this._pending = false;
      },
      onDataAvailable: (request, stream, offset, count) => {
        this.contentLength += count;
        this._listener.onDataAvailable(this, stream, offset, count);
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
    this._logger.debug("Read from server");
    const pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
    pipe.init(true, true, 0, 0);
    const inputStream = pipe.inputStream;
    const outputStream = pipe.outputStream;
    if (this._newsFolder) {
      this._newsFolder.QueryInterface(Ci.nsIMsgNewsFolder).saveArticleOffline =
        this._newsFolder.shouldStoreMsgOffline(this._articleNumber);
    }

    this._server.wrappedJSObject.withClient(client => {
      let msgWindow;
      try {
        msgWindow = this.URI.msgWindow;
      } catch (e) {}
      client.startRunningUrl(null, msgWindow, this.URI);
      client.channel = this;
      this._listener.onStartRequest(this);
      this._pending = true;
      client.onOpen = () => {
        if (this._messageId) {
          client.getArticleByMessageId(this._messageId);
        } else {
          client.getArticleByArticleNumber(
            this._groupName,
            this._articleNumber
          );
        }
      };

      client.onData = data => {
        this.contentLength += data.length;
        outputStream.write(data, data.length);
        this._listener.onDataAvailable(this, inputStream, 0, data.length);
      };

      client.onDone = status => {
        try {
          this.loadGroup?.removeRequest(this, null, Cr.NS_OK);
        } catch (e) {}
        if (status != Cr.NS_OK) {
          // Prevent marking a message as read.
          this.URI.errorCode = status;
          // Remove the invalid cache.
          this._cacheEntry?.asyncDoom(null);
        }
        this._listener.onStopRequest(this, status);
        this._newsFolder?.msgDatabase.commit(
          Ci.nsMsgDBCommitType.kSessionCommit
        );
        this._pending = false;
      };
    });
  }

  /**
   * Fetch all the article keys on the server, then remove expired keys from the
   * local folder.
   *
   * @param {string} groupName - The group to check.
   */
  _removeExpired(groupName) {
    this._logger.debug("_removeExpired", groupName);
    const newsFolder = this._server.findGroup(groupName);
    const allKeys = new Set(newsFolder.msgDatabase.listAllKeys());
    this._server.wrappedJSObject.withClient(client => {
      let msgWindow;
      try {
        msgWindow = this.URI.msgWindow;
      } catch (e) {}
      client.startRunningUrl(null, msgWindow, this.URI);
      this._listener.onStartRequest(this);
      this._pending = true;
      client.onOpen = () => {
        client.listgroup(groupName);
      };

      client.onData = data => {
        allKeys.delete(+data);
      };

      client.onDone = status => {
        newsFolder.removeMessages([...allKeys]);
        this._listener.onStopRequest(this, status);
        this._pending = false;
      };
    });
  }
}
