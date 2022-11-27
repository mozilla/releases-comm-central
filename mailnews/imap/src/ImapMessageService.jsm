/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapMessageService", "ImapMessageMessageService"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
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

  CopyMessage(
    messageUri,
    copyListener,
    moveMessage,
    urlListener,
    msgWindow,
    outUrl
  ) {
    this._logger.debug("CopyMessage", messageUri, moveMessage);
    let { host, folder, folderName, key } = this._decomposeMessageUri(
      messageUri
    );
    let imapUrl = Services.io
      .newURI(`imap://${host}/fetch>UID>/${folderName}>${key}`)
      .QueryInterface(Ci.nsIImapUrl);

    if (urlListener) {
      imapUrl
        .QueryInterface(Ci.nsIMsgMailNewsUrl)
        .RegisterListener(urlListener);
    }

    return MailServices.imap.fetchMessage(
      imapUrl,
      moveMessage
        ? Ci.nsIImapUrl.nsImapOnlineToOfflineMove
        : Ci.nsIImapUrl.nsImapOnlineToOfflineCopy,
      folder,
      folder.QueryInterface(Ci.nsIImapMessageSink),
      msgWindow,
      copyListener,
      key,
      false,
      {}
    );
  }

  DisplayMessage(
    messageUri,
    displayConsumer,
    msgWindow,
    urlListener,
    autodetectCharset,
    outURL
  ) {
    this._logger.debug("DisplayMessage", messageUri);
    let { host, folder, folderName, key } = this._decomposeMessageUri(
      messageUri
    );
    let imapUrl = Services.io
      .newURI(`imap://${host}/fetch>UID>/${folderName}>${key}`)
      .QueryInterface(Ci.nsIImapUrl);

    let mailnewsUrl = imapUrl.QueryInterface(Ci.nsIMsgMailNewsUrl);
    if (urlListener) {
      mailnewsUrl.RegisterListener(urlListener);
    }

    return MailServices.imap.fetchMessage(
      imapUrl,
      Ci.nsIImapUrl.nsImapMsgFetch,
      folder,
      folder.QueryInterface(Ci.nsIImapMessageSink),
      msgWindow,
      displayConsumer,
      key,
      false,
      {}
    );
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
    let { host, folder, folderName, key } = this._decomposeMessageUri(
      messageUri
    );
    let imapUrl = Services.io
      .newURI(`imap://${host}/fetch>UID>/${folderName}>${key}`)
      .QueryInterface(Ci.nsIImapUrl);

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

    let { host, folder, folderName, key } = this._decomposeMessageUri(
      messageUri
    );
    let delimiter =
      folder.QueryInterface(Ci.nsIMsgImapMailFolder).hierarchyDelimiter || "/";
    let imapUrl = Services.io
      .newURI(
        `imap://${host}:${folder.server.port}/fetch>UID>${delimiter}${folderName}>${key}`
      )
      .QueryInterface(Ci.nsIImapUrl);

    return imapUrl;
  }

  streamMessage(
    messageUri,
    consumer,
    msgWindow,
    urlListener,
    convertData,
    additionalHeader,
    localOnly
  ) {
    this._logger.debug("streamMessage", messageUri);
    let { host, folder, folderName, key } = this._decomposeMessageUri(
      messageUri
    );
    let url = `imap://${host}/fetch>UID>/${folderName}>${key}`;
    if (additionalHeader) {
      url += `?header=${additionalHeader}`;
    }
    let imapUrl = Services.io.newURI(url).QueryInterface(Ci.nsIImapUrl);
    imapUrl.localFetchOnly = localOnly;

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
      convertData,
      {}
    );
  }

  streamHeaders(messageUri, consumer, urlListener, localOnly) {
    this._logger.debug("streamHeaders", messageUri);
    let { folder, key } = this._decomposeMessageUri(messageUri);

    let hasMsgOffline = folder.hasMsgOffline(key);
    if (!hasMsgOffline) {
      return;
    }

    let localMsgStream = folder.getLocalMsgStream(folder.GetMessageHeader(key));
    let sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
      Ci.nsIScriptableInputStream
    );
    sstream.init(localMsgStream);
    let headers = "";
    let str = "";
    do {
      str = sstream.read(4096);
      let index = str.indexOf("\r\n\r\n");
      if (index != -1) {
        headers += str.slice(0, index) + "\r\n";
        break;
      } else {
        headers += str;
      }
    } while (str.length);

    let headersStream = Cc[
      "@mozilla.org/io/string-input-stream;1"
    ].createInstance(Ci.nsIStringInputStream);
    headersStream.setData(headers, headers.length);
    let pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(
      Ci.nsIInputStreamPump
    );
    pump.init(headersStream, 0, 0, true);
    pump.asyncRead(consumer);
  }

  messageURIToMsgHdr(messageUri) {
    let { folder, key } = this._decomposeMessageUri(messageUri);
    return folder.GetMessageHeader(key);
  }

  /**
   * Parse a message uri to hostname, folder and message key.
   *
   * @param {string} uri - The imap-message:// url to parse.
   * @returns {host: string, folder: nsIMsgFolder, folderName: string, key: string}
   */
  _decomposeMessageUri(messageUri) {
    let matches = /imap-message:\/\/([^:/]+)\/(.+)#(\d+)/.exec(messageUri);
    let [, host, folderName, key] = matches;
    let folder = lazy.MailUtils.getOrCreateFolder(
      `imap://${host}/${folderName}`
    );

    return { host, folder, folderName, key };
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
