/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpMessageService"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Services: "resource://gre/modules/Services.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
});

/**
 * A message service for NNTP messages.
 * @implements {nsIMsgMessageService}
 */
class NntpMessageService {
  QueryInterface = ChromeUtils.generateQI(["nsIMsgMessageService"]);

  DisplayMessage(
    messageURI,
    displayConsumer,
    msgWindow,
    urlListener,
    charsetOverride,
    outURL
  ) {
    let uri = Services.io
      .newURI(this._createMessageIdUrl(messageURI))
      .QueryInterface(Ci.nsIMsgMailNewsUrl);
    uri.msgWindow = msgWindow;
    if (urlListener) {
      uri.RegisterListener(urlListener);
    }
    uri.loadURI(
      displayConsumer.QueryInterface(Ci.nsIDocShell),
      Ci.nsIWebNavigation.LOAD_FLAGS_NONE
    );
  }

  getUrlForUri(messageURI, msgWindow) {
    let uri = Services.io
      .newURI(this._createMessageIdUrl(messageURI))
      .QueryInterface(Ci.nsIMsgMailNewsUrl);
    uri.msgWindow = msgWindow;
    return uri;
  }

  messageURIToMsgHdr(uri) {
    let [folder, key] = this._decomposeNewsMessageURI(uri);
    return folder.GetMessageHeader(key);
  }

  /**
   * Parse a message uri to folder and message key.
   * @param {string} uri - The news-message:// url to parse.
   * @returns {[nsIMsgFolder, string]} - The folder and message key.
   */
  _decomposeNewsMessageURI(uri) {
    let matches = /news-message:\/\/([^:]+)\/(.+)#(\d+)/.exec(uri);
    if (!matches) {
      throw Components.Exception(
        `Failed to parse message url: ${uri}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }
    let [, host, groupName, key] = matches;
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
    return url.toString();
  }
}

NntpMessageService.prototype.classID = Components.ID(
  "{9cefbe67-5966-4f8a-b7b0-cedd60a02c8e}"
);
