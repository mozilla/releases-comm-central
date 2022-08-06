/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapMessageService", "ImapMessageMessageService"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { ImapUtils } = ChromeUtils.import("resource:///modules/ImapUtils.jsm");

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  MailUtils: "resource:///modules/MailUtils.jsm",
});

/**
 * @implements {nsIMsgMessageService}
 */
class BaseMessageService {
  QueryInterface = ChromeUtils.generateQI(["nsIMsgMessageService"]);

  _logger = ImapUtils.logger;

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
    let { host, folderName, key } = this._decomposeMessageUri(messageUri);
    let imapUrl = Services.io
      .newURI(`imap://${host}/fetch>UID>/${folderName}>${key}`)
      .QueryInterface(Ci.nsIImapUrl);

    let folder = lazy.MailUtils.getOrCreateFolder(
      `imap://${host}/${folderName}`
    );
    let msgUrl = imapUrl.QueryInterface(Ci.nsIMsgMessageUrl);
    msgUrl.messageFile = file;
    msgUrl.AddDummyEnvelope = addDummyEnvelope;
    msgUrl.canonicalLineEnding = canonicalLineEnding;
    let mailnewsUrl = imapUrl.QueryInterface(Ci.nsIMsgMailNewsUrl);
    mailnewsUrl.RegisterListener(urlListener);
    mailnewsUrl.msgIsInLocalCache = folder.hasMsgOffline(key, null, 10);

    return MailServices.imap.fetchMessage(
      imapUrl,
      Ci.nsIImapUrl.nsImapSaveMessageToDisk,
      folder,
      folder.QueryInterface(Ci.nsIImapMessageSink),
      msgWindow,
      mailnewsUrl.getSaveAsListener(addDummyEnvelope, file),
      key,
      false,
      {}
    );
  }

  getUrlForUri(messageUri, msgWindow) {
    if (messageUri.includes("&type=application/x-message-display")) {
      return Services.io.newURI(messageUri);
    }

    let { host, folderName, key } = this._decomposeMessageUri(messageUri);
    let imapUrl = Services.io
      .newURI(`imap://${host}/fetch>UID>/${folderName}>${key}`)
      .QueryInterface(Ci.nsIImapUrl);

    return imapUrl;
  }

  streamMessage(messageUri, consumer, msgWindow, urlListener, localOnly) {
    let { host, folderName, key } = this._decomposeMessageUri(messageUri);
    let imapUrl = Services.io
      .newURI(`imap://${host}/fetch>UID>/${folderName}>${key}`)
      .QueryInterface(Ci.nsIImapUrl);
    imapUrl.localFetchOnly = localOnly;

    let folder = lazy.MailUtils.getOrCreateFolder(
      `imap://${host}/${folderName}`
    );

    let mailnewsUrl = imapUrl.QueryInterface(Ci.nsIMsgMailNewsUrl);
    mailnewsUrl.folder = folder;
    mailnewsUrl.msgWindow = msgWindow;
    mailnewsUrl.msgIsInLocalCache = folder.hasMsgOffline(key);
    if (urlListener) {
      mailnewsUrl.RegisterListener(urlListener);
    }

    return MailServices.imap.fetchMessage(
      imapUrl,
      Ci.nsIImapUrl.nsImapMsgFetchPeek,
      folder,
      folder.QueryInterface(Ci.nsIImapMessageSink),
      msgWindow,
      consumer,
      key,
      false,
      {}
    );
  }

  messageURIToMsgHdr(messageUri) {
    let { host, folderName, key } = this._decomposeMessageUri(messageUri);
    let folder = lazy.MailUtils.getOrCreateFolder(
      `imap://${host}/${folderName}`
    );
    return folder.GetMessageHeader(key);
  }

  /**
   * Parse a message uri to hostname, folder and message key.
   * @param {string} uri - The imap-message:// url to parse.
   * @returns {host: string, folderName: string, key: string}
   */
  _decomposeMessageUri(messageUri) {
    let matches = /imap-message:\/\/([^:]+)\/(.+)#(\d+)/.exec(messageUri);
    let [, host, folderName, key] = matches;

    return { host, folderName, key };
  }
}

/**
 * A message service for imap://.
 */
class ImapMessageService extends BaseMessageService {}

ImapMessageService.prototype.classID = Components.ID(
  "{d63af753-c2f3-4f1d-b650-9d12229de8ad}"
);

/**
 * A message service for imap-message://.
 */
class ImapMessageMessageService extends BaseMessageService {}

ImapMessageMessageService.prototype.classID = Components.ID(
  "{2532ae4f-a852-4c96-be45-1308ba23d62e}"
);
