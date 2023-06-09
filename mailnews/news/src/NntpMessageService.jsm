/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpMessageService", "NewsMessageService"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const lazy = {};
XPCOMUtils.defineLazyModuleGetters(lazy, {
  NntpChannel: "resource:///modules/NntpChannel.jsm",
  NntpUtils: "resource:///modules/NntpUtils.jsm",
});

/**
 * A message service for news-message://, mainly used for displaying messages.
 *
 * @implements {nsIMsgMessageService}
 * @implements {nsIMsgMessageFetchPartService}
 */
class BaseMessageService {
  QueryInterface = ChromeUtils.generateQI([
    "nsIMsgMessageService",
    "nsIMsgMessageFetchPartService",
  ]);

  _logger = lazy.NntpUtils.logger;

  /** @see nsIMsgMessageService */
  loadMessage(
    messageURI,
    displayConsumer,
    msgWindow,
    urlListener,
    autodetectCharset
  ) {
    this._logger.debug("loadMessage", messageURI);

    let uri = this.getUrlForUri(messageURI, msgWindow);
    if (urlListener) {
      uri.RegisterListener(urlListener);
    }
    if (displayConsumer instanceof Ci.nsIDocShell) {
      uri.loadURI(
        displayConsumer.QueryInterface(Ci.nsIDocShell),
        Ci.nsIWebNavigation.LOAD_FLAGS_NONE
      );
    } else {
      let streamListener = displayConsumer.QueryInterface(Ci.nsIStreamListener);
      let channel = new lazy.NntpChannel(uri);
      channel.asyncOpen(streamListener);
    }
  }

  /**
   * @param {string} messageURI - Message URI.
   * @param {?nsIMsgWindow} [msgWindow] - Message window.
   * @returns {nsIURI}
   */
  getUrlForUri(messageURI, msgWindow) {
    let uri = Services.io
      .newURI(this._createMessageIdUrl(messageURI))
      .QueryInterface(Ci.nsIMsgMailNewsUrl);
    uri.msgWindow = msgWindow;
    uri.QueryInterface(Ci.nsIMsgMessageUrl).originalSpec = messageURI;
    uri.QueryInterface(Ci.nsINntpUrl).newsAction =
      Ci.nsINntpUrl.ActionFetchArticle;
    return uri;
  }

  /**
   * @param {string} uri - The message URI.
   * @returns {?nsIMsgDBHdr} The message for the URI, or null.
   */
  messageURIToMsgHdr(uri) {
    let [folder, key] = this._decomposeNewsMessageURI(uri);
    return folder?.GetMessageHeader(key);
  }

  copyMessage(messageUri, copyListener, moveMessage, urlListener, msgWindow) {
    this._logger.debug("copyMessage", messageUri);
    this.loadMessage(messageUri, copyListener, msgWindow, urlListener, false);
  }

  SaveMessageToDisk(
    messageUri,
    file,
    addDummyEnvelope,
    urlListener,
    outUrl,
    canonicalLineEnding,
    msgWindow
  ) {
    this._logger.debug("SaveMessageToDisk", messageUri);
    let url = this.getUrlForUri(messageUri, msgWindow);
    if (urlListener) {
      url.RegisterListener(urlListener);
    }
    url.newsAction = Ci.nsINntpUrl.ActionSaveMessageToDisk;
    url.AddDummyEnvelope = addDummyEnvelope;
    url.canonicalLineEnding = canonicalLineEnding;

    let [folder, key] = this._decomposeNewsMessageURI(messageUri);
    if (folder && folder.QueryInterface(Ci.nsIMsgNewsFolder)) {
      url.msgIsInLocalCache = folder.hasMsgOffline(key);
    }

    this.loadMessage(
      messageUri,
      url.getSaveAsListener(addDummyEnvelope, file),
      msgWindow,
      urlListener,
      false
    );
  }

  Search(searchSession, msgWindow, msgFolder, searchUri) {
    let slashIndex = searchUri.indexOf("/");
    let xpatLines = searchUri.slice(slashIndex + 1).split("/");
    let server = msgFolder.server.QueryInterface(Ci.nsINntpIncomingServer);

    server.wrappedJSObject.withClient(client => {
      client.startRunningUrl(
        searchSession.QueryInterface(Ci.nsIUrlListener),
        msgWindow
      );
      client.onOpen = () => {
        client.search(msgFolder.name, xpatLines);
      };

      client.onData = line => {
        searchSession.runningAdapter.AddHit(line.split(" ")[0]);
      };
    });
  }

  streamMessage(
    messageUri,
    consumer,
    msgWindow,
    urlListener,
    convertData,
    additionalHeader
  ) {
    this._logger.debug("streamMessage", messageUri);
    let [folder, key] = this._decomposeNewsMessageURI(messageUri);

    let uri = this.getUrlForUri(messageUri, msgWindow);
    if (additionalHeader) {
      // NOTE: jsmimeemitter relies on this.
      let url = new URL(uri.spec);
      let params = new URLSearchParams(`?header=${additionalHeader}`);
      for (let [key, value] of params.entries()) {
        url.searchParams.set(key, value);
      }
      uri = uri.mutate().setQuery(url.search).finalize();
    }

    uri = uri.QueryInterface(Ci.nsIMsgMailNewsUrl);
    uri.msgIsInLocalCache = folder.hasMsgOffline(key);
    if (urlListener) {
      uri.RegisterListener(urlListener);
    }

    let streamListener = consumer.QueryInterface(Ci.nsIStreamListener);
    let channel = new lazy.NntpChannel(uri.QueryInterface(Ci.nsINntpUrl));
    let listener = streamListener;
    if (convertData) {
      let converter = Cc["@mozilla.org/streamConverters;1"].getService(
        Ci.nsIStreamConverterService
      );
      listener = converter.asyncConvertData(
        "message/rfc822",
        "*/*",
        streamListener,
        channel
      );
    }
    channel.asyncOpen(listener);
    return uri;
  }

  /**
   * Parse a message uri to folder and message key.
   *
   * @param {string} uri - The news-message:// url to parse.
   * @returns {[nsIMsgFolder, string]} - The folder and message key.
   */
  _decomposeNewsMessageURI(uri) {
    let host, groupName, key;
    if (uri.startsWith("news-message://")) {
      let matches = /news-message:\/\/([^:]+)\/(.+)#(\d+)/.exec(uri);
      if (!matches) {
        throw Components.Exception(
          `Failed to parse message url: ${uri}`,
          Cr.NS_ERROR_ILLEGAL_VALUE
        );
      }
      [, host, groupName, key] = matches;
      if (host.includes("@")) {
        host = host.slice(host.indexOf("@") + 1);
      }
    } else {
      let url = new URL(uri);
      host = url.hostname;
      groupName = url.searchParams.get("group");
      key = url.searchParams.get("key");
    }
    groupName = groupName ? decodeURIComponent(groupName) : null;
    let server = MailServices.accounts
      .findServer("", host, "nntp")
      .QueryInterface(Ci.nsINntpIncomingServer);
    let folder;
    if (groupName) {
      folder = server.rootFolder
        .getChildNamed(groupName)
        .QueryInterface(Ci.nsIMsgNewsFolder);
    }
    return [folder, key];
  }

  /**
   * Create a news:// url from a news-message:// url.
   *
   * @param {string} messageURI - The news-message:// url.
   * @returns {string} The news:// url.
   */
  _createMessageIdUrl(messageURI) {
    if (messageURI.startsWith("news://")) {
      return messageURI;
    }
    let [folder, key] = this._decomposeNewsMessageURI(messageURI);
    let host = folder.rootFolder.URI;
    let messageId = folder.getMessageIdForKey(key);
    let url = new URL(`${host}/${encodeURIComponent(messageId)}`);
    url.searchParams.set("group", folder.name);
    url.searchParams.set("key", key);
    if (!url.port) {
      url.port = folder.server.port;
    }
    return url.toString();
  }

  /** @see nsIMsgMessageFetchPartService */
  fetchMimePart(uri, messageUri, displayConsumer, msgWindow, urlListener) {
    this._logger.debug("fetchMimePart", uri.spec);
    this.loadMessage(uri.spec, displayConsumer, msgWindow, urlListener, false);
  }
}

/**
 * A message service for news-message://, mainly for displaying messages.
 */
class NntpMessageService extends BaseMessageService {}

NntpMessageService.prototype.classID = Components.ID(
  "{9cefbe67-5966-4f8a-b7b0-cedd60a02c8e}"
);

/**
 * A message service for news://, mainly for handling attachments.
 */
class NewsMessageService extends BaseMessageService {}

NewsMessageService.prototype.classID = Components.ID(
  "{4cae5569-2c72-4910-9f3d-774f9e939df8}"
);
