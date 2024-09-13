/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NntpChannel: "resource:///modules/NntpChannel.sys.mjs",
  NntpUtils: "resource:///modules/NntpUtils.sys.mjs",
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
  loadMessage(messageURI, displayConsumer, msgWindow, urlListener) {
    this._logger.debug("loadMessage", messageURI);

    const uri = this.getUrlForUri(messageURI, msgWindow);
    if (urlListener) {
      uri.RegisterListener(urlListener);
    }
    if (displayConsumer instanceof Ci.nsIDocShell) {
      uri.loadURI(
        displayConsumer.QueryInterface(Ci.nsIDocShell),
        Ci.nsIWebNavigation.LOAD_FLAGS_NONE
      );
    } else {
      const streamListener = displayConsumer.QueryInterface(
        Ci.nsIStreamListener
      );
      const channel = new lazy.NntpChannel(uri);
      channel.asyncOpen(streamListener);
    }
  }

  /**
   * @param {string} messageURI - Message URI.
   * @param {?nsIMsgWindow} [msgWindow] - Message window.
   * @returns {nsIURI}
   */
  getUrlForUri(messageURI, msgWindow) {
    const uri = Services.io
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
    const [folder, key] = this._decomposeNewsMessageURI(uri);
    return folder?.GetMessageHeader(key);
  }

  copyMessage(messageUri, copyListener, moveMessage, urlListener, msgWindow) {
    this._logger.debug("copyMessage", messageUri);
    this.loadMessage(messageUri, copyListener, msgWindow, urlListener, false);
  }

  saveMessageToDisk(
    messageUri,
    file,
    addDummyEnvelope,
    urlListener,
    canonicalLineEnding,
    msgWindow
  ) {
    this._logger.debug("saveMessageToDisk", messageUri);
    const url = this.getUrlForUri(messageUri, msgWindow);
    if (urlListener) {
      url.RegisterListener(urlListener);
    }
    url.newsAction = Ci.nsINntpUrl.ActionSaveMessageToDisk;
    url.AddDummyEnvelope = addDummyEnvelope;
    url.canonicalLineEnding = canonicalLineEnding;

    const [folder, key] = this._decomposeNewsMessageURI(messageUri);
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
    const slashIndex = searchUri.indexOf("/");
    const xpatLines = searchUri.slice(slashIndex + 1).split("/");
    const server = msgFolder.server.QueryInterface(Ci.nsINntpIncomingServer);

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
    const [folder, key] = this._decomposeNewsMessageURI(messageUri);

    let uri = this.getUrlForUri(messageUri, msgWindow);
    if (additionalHeader) {
      // NOTE: jsmimeemitter relies on this.
      const url = new URL(uri.spec);
      const params = new URLSearchParams(`?header=${additionalHeader}`);
      for (const [param, value] of params.entries()) {
        url.searchParams.set(param, value);
      }
      uri = uri.mutate().setQuery(url.search).finalize();
    }

    uri = uri.QueryInterface(Ci.nsIMsgMailNewsUrl);
    uri.msgIsInLocalCache = folder.hasMsgOffline(key);
    if (urlListener) {
      uri.RegisterListener(urlListener);
    }

    const streamListener = consumer.QueryInterface(Ci.nsIStreamListener);
    const channel = new lazy.NntpChannel(uri.QueryInterface(Ci.nsINntpUrl));
    let listener = streamListener;
    if (convertData) {
      const converter = Cc["@mozilla.org/streamConverters;1"].getService(
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
      const matches = /news-message:\/\/([^:]+)\/(.+)#(\d+)/.exec(uri);
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
      const url = new URL(uri);
      host = url.hostname;
      groupName = url.searchParams.get("group");
      key = url.searchParams.get("key");
    }
    let folder = null;
    if (groupName) {
      const server = MailServices.accounts
        .findServer("", host, "nntp")
        ?.QueryInterface(Ci.nsINntpIncomingServer);
      folder = server?.rootFolder
        .getChildNamed(decodeURIComponent(groupName))
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
    const [folder, key] = this._decomposeNewsMessageURI(messageURI);
    const host = folder.rootFolder.URI;
    const messageId = folder.getMessageIdForKey(key);
    const url = new URL(`${host}/${encodeURIComponent(messageId)}`);
    url.searchParams.set("group", folder.name);
    url.searchParams.set("key", key);
    if (!url.port) {
      url.port = folder.server.port;
    }
    return url.toString();
  }

  /**
   * @see {nsIMsgMessageFetchPartService}
   *
   * @param {nsIURI} uri - URL representing the message.
   * @param {string} messageUri - URI including the part to fetch.
   * @param {nsIStreamListener} - Stream listener.
   * @param {nsIMsgWindow} msgWindow
   * @param {nsIUrlListener} urlListener - URL listener.
   * @returns {nsIURI} the URL that gets run, if any.
   */
  fetchMimePart(uri, messageUri, streamListener, msgWindow, urlListener) {
    this._logger.debug("fetchMimePart", uri.spec);
    this.streamMessage(
      uri.spec,
      streamListener,
      msgWindow,
      urlListener,
      false,
      ""
    );
  }
}

/**
 * A message service for news-message://, mainly for displaying messages.
 */
export class NntpMessageService extends BaseMessageService {}

NntpMessageService.prototype.classID = Components.ID(
  "{9cefbe67-5966-4f8a-b7b0-cedd60a02c8e}"
);

/**
 * A message service for news://, mainly for handling attachments.
 */
export class NewsMessageService extends BaseMessageService {}

NewsMessageService.prototype.classID = Components.ID(
  "{4cae5569-2c72-4910-9f3d-774f9e939df8}"
);
