/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ImapUtils } from "resource:///modules/ImapUtils.sys.mjs";

import { MailChannel } from "resource:///modules/MailChannel.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * A channel to interact with IMAP server.
 *
 * @implements {nsIChannel}
 * @implements {nsIRequest}
 * @implements {nsICacheEntryOpenCallback}
 */
export class ImapChannel extends MailChannel {
  QueryInterface = ChromeUtils.generateQI([
    "nsIMailChannel",
    "nsIChannel",
    "nsIRequest",
    "nsIWritablePropertyBag",
    "nsICacheEntryOpenCallback",
  ]);

  _logger = ImapUtils.logger;
  _status = Cr.NS_OK;

  /**
   * @param {nsIURI} uri - The uri to construct the channel from.
   * @param {nsILoadInfo} loadInfo - The loadInfo associated with the channel.
   */
  constructor(uri, loadInfo) {
    super();
    this._server = MailServices.accounts
      .findServerByURI(uri)
      .QueryInterface(Ci.nsIImapIncomingServer);

    // nsIChannel attributes.
    this.originalURI = uri;
    this.loadInfo = loadInfo;
    this.contentLength = 0;

    this.uri = uri;

    uri = uri.QueryInterface(Ci.nsIMsgMessageUrl);
    try {
      this.contentLength = uri.messageHeader.messageSize;
    } catch (e) {
      // Got passed an IMAP folder URL.
      this._isFolderURL = this._server && !/%3E(\d+)$/.test(uri.spec);
    }
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
   * Get readonly URI.
   * @see nsIChannel
   */
  get URI() {
    return this.uri;
  }

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
    if (this._isFolderURL) {
      const handler = Cc[
        "@mozilla.org/uriloader/content-handler;1?type=x-application-imapfolder"
      ].createInstance(Ci.nsIContentHandler);
      handler.handleContent("x-application-imapfolder", null, this);
      return;
    }

    const url = new URL(this.URI.spec);
    this._listener = listener;
    if (url.searchParams.get("part")) {
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

    const msgIds = this.URI.QueryInterface(Ci.nsIImapUrl).QueryInterface(
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
        uri = uri.mutate().setQuery("").finalize();
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
    if (this._status == Cr.NS_ERROR_OFFLINE) {
      throw new Components.Exception(
        "The requested action could not be completed in the offline state",
        Cr.NS_ERROR_OFFLINE
      );
    }
  }

  /**
   * Try to read the message from the offline storage.
   *
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

    const hdr = this.URI.folder.GetMessageHeader(this._msgKey);
    const stream = this.URI.folder.getLocalMsgStream(hdr);
    this._readFromCacheStream(stream, hdr);
    return true;
  }

  /**
   * Read the message from the a stream.
   *
   * @param {nsIInputStream} cacheStream - The input stream to read.
   * @param {nsIMsgDBHdr} offlineHdr     - If streaming a message from
   *                                       msgStore, this is its header.
   */
  _readFromCacheStream(cacheStream, offlineHdr) {
    const pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(
      Ci.nsIInputStreamPump
    );
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
        if (status != Cr.NS_OK) {
          // If we're streaming an offline message, and it failed, discard
          // the local copy on grounds that it's probably damaged.
          if (offlineHdr) {
            offlineHdr.folder.discardOfflineMsg(offlineHdr.messageKey);
          }
        }
        this._pending = false;
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
    const pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
    pipe.init(true, true, 0, 0);
    const inputStream = pipe.inputStream;
    const outputStream = pipe.outputStream;

    this._server.wrappedJSObject.withClient(this.URI.folder, client => {
      client.startRunningUrl(null, null, this.URI);
      client.channel = this;
      this._listener.onStartRequest(this);
      this._pending = true;
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
        if (status != Cr.NS_OK) {
          // Remove the invalid cache.
          this._cacheEntry?.asyncDoom(null);
        }
        this._listener.onStopRequest(this, status);
      };
      this._pending = false;
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
