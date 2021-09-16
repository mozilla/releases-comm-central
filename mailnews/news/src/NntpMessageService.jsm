/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpMessageService", "NewsMessageService"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Services: "resource://gre/modules/Services.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  NntpChannel: "resource:///modules/NntpChannel.jsm",
});

/**
 * A message service for news-message://, mainly used for displaying messages.
 * @implements {nsIMsgMessageService}
 */
class BaseMessageService {
  QueryInterface = ChromeUtils.generateQI(["nsIMsgMessageService"]);

  DisplayMessage(
    messageURI,
    displayConsumer,
    msgWindow,
    urlListener,
    charsetOverride,
    outURL
  ) {
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
      let channel = new NntpChannel(uri, {
        QueryInterface: ChromeUtils.generateQI(["nsILoadInfo"]),
        loadingPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        securityFlags:
          Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        internalContentPolicy: Ci.nsIContentPolicy.TYPE_OTHER,
      });
      channel.asyncOpen(streamListener);
    }
  }

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

  messageURIToMsgHdr(uri) {
    let [folder, key] = this._decomposeNewsMessageURI(uri);
    return folder.GetMessageHeader(key);
  }

  openAttachment(
    contentType,
    fileName,
    url,
    messageUri,
    displayConsumer,
    msgWindow,
    urlListener
  ) {
    let newsUrl = `${url}&type=${contentType}&filename=${fileName}`;
    let uri = Services.io
      .newURI(newsUrl.toString())
      .QueryInterface(Ci.nsIMsgMailNewsUrl);
    uri.msgWindow = msgWindow;
    if (urlListener) {
      uri.RegisterListener(urlListener);
    }
    if (displayConsumer instanceof Ci.nsIDocShell) {
      uri.loadURI(
        displayConsumer.QueryInterface(Ci.nsIDocShell),
        Ci.nsIWebNavigation.LOAD_FLAGS_IS_LINK
      );
    } else {
      throw Components.Exception(
        "displayConsumer should be instance of nsIDocShell",
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }
  }

  /**
   * Parse a message uri to folder and message key.
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
    } else {
      let url = new URL(uri);
      host = url.hostname;
      groupName = url.searchParams.get("group");
      key = url.searchParams.get("key");
    }
    let server = MailServices.accounts
      .FindServer("", host, "nntp")
      .QueryInterface(Ci.nsINntpIncomingServer);
    let folder = server.findGroup(groupName);
    return [folder, key];
  }

  /**
   * Create a news:// url from a news-message:// url.
   * @param {string} messageURI - The news-message:// url.
   * @returns {string} The news:// url.
   */
  _createMessageIdUrl(messageURI) {
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
