/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ImapUtils } from "resource:///modules/ImapUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ImapChannel: "resource:///modules/ImapChannel.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
});

/**
 * @implements {nsIMsgMessageService}
 */
class BaseMessageService {
  QueryInterface = ChromeUtils.generateQI(["nsIMsgMessageService"]);

  _logger = ImapUtils.logger;

  /**
   * Copy message.
   *
   * @param {string} messageUri
   * @param {nsIStreamListener} copyListener - Listener that already knows about
   *   the destination folder.
   * @param {boolean} moveMessage - true for move, false for copy.
   * @param {nsIUrlListener} urlListener
   * @param {nsIMsgWindow} msgWindow
   */
  copyMessage(messageUri, copyListener, moveMessage, urlListener, msgWindow) {
    this._logger.debug("copyMessage", messageUri, moveMessage);
    const { serverURI, folderName, key } =
      this._decomposeMessageUri(messageUri);
    const imapUrl = Services.io
      .newURI(`${serverURI}/fetch>UID>/${folderName}>${key}`)
      .QueryInterface(Ci.nsIImapUrl)
      .QueryInterface(Ci.nsIMsgMailNewsUrl);

    if (urlListener) {
      imapUrl.RegisterListener(urlListener);
    }

    imapUrl.imapAction = moveMessage
      ? Ci.nsIImapUrl.nsImapOnlineToOfflineMove
      : Ci.nsIImapUrl.nsImapOnlineToOfflineCopy;
    imapUrl.msgWindow = msgWindow;

    const channel = new lazy.ImapChannel(imapUrl, {
      QueryInterface: ChromeUtils.generateQI(["nsILoadInfo"]),
      loadingPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      internalContentPolicy: Ci.nsIContentPolicy.TYPE_OTHER,
    });
    channel.asyncOpen(copyListener);
  }

  /**
   * When you want a message displayed... this loads it into the docshell
   * consumer.
   *
   * @param {string} messageUri - A uri representing the message to display.
   * @param {nsIDocShell} docShell - Docshell to load the message into.
   * @param {?nsIMsgWindow} msgWindow
   * @param {?nsIUrlListener} urlListener
   * @param {boolean} autodetectCharset - Whether the character set should be
   *   auto-detected.
   */
  loadMessage(messageUri, docShell, msgWindow, urlListener, autodetectCharset) {
    this._logger.debug("loadMessage", messageUri);
    const { serverURI, folderName, key } =
      this._decomposeMessageUri(messageUri);
    const imapUrl = Services.io
      .newURI(`${serverURI}/fetch>UID>/${folderName}>${key}`)
      .QueryInterface(Ci.nsIImapUrl)
      .QueryInterface(Ci.nsIMsgMailNewsUrl)
      .QueryInterface(Ci.nsIMsgI18NUrl);

    if (urlListener) {
      imapUrl.RegisterListener(urlListener);
    }
    imapUrl.autodetectCharset = autodetectCharset;

    imapUrl.imapAction = Ci.nsIImapUrl.nsImapMsgFetch;
    imapUrl.msgWindow = msgWindow;
    imapUrl.loadURI(docShell, Ci.nsIWebNavigation.LOAD_FLAGS_NONE);
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
    const { serverURI, folder, folderName, key } =
      this._decomposeMessageUri(messageUri);
    const imapUrl = Services.io
      .newURI(`${serverURI}/fetch>UID>/${folderName}>${key}`)
      .QueryInterface(Ci.nsIImapUrl)
      .QueryInterface(Ci.nsIMsgMessageUrl)
      .QueryInterface(Ci.nsIMsgMailNewsUrl);

    imapUrl.messageFile = file;
    imapUrl.AddDummyEnvelope = addDummyEnvelope;
    imapUrl.canonicalLineEnding = canonicalLineEnding;

    imapUrl.RegisterListener(urlListener);
    imapUrl.msgIsInLocalCache = folder.hasMsgOffline(key, null, 10);

    imapUrl.imapAction = Ci.nsIImapUrl.nsImapSaveMessageToDisk;
    imapUrl.msgWindow = msgWindow;

    const streamListener = imapUrl.getSaveAsListener(addDummyEnvelope, file);
    const channel = new lazy.ImapChannel(imapUrl, {
      QueryInterface: ChromeUtils.generateQI(["nsILoadInfo"]),
      loadingPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      internalContentPolicy: Ci.nsIContentPolicy.TYPE_OTHER,
    });
    channel.asyncOpen(streamListener);
  }

  getUrlForUri(messageUri) {
    if (messageUri.includes("&type=application/x-message-display")) {
      return Services.io.newURI(messageUri);
    }

    const { serverURI, folder, folderName, key } =
      this._decomposeMessageUri(messageUri);
    const delimiter =
      folder.QueryInterface(Ci.nsIMsgImapMailFolder).hierarchyDelimiter || "/";
    const imapUrl = Services.io
      .newURI(
        `${serverURI}:${folder.server.port}/fetch>UID>${delimiter}${folderName}>${key}`
      )
      .QueryInterface(Ci.nsIImapUrl);

    return imapUrl;
  }

  /**
   * This method streams a message to the passed in streamListener consumer.
   *
   * @param {string} messageUri - The uri of message to stream.
   * @param {nsIStreamListener} streamListener - A streamlistener listening to
   *   the message.
   * @param {nsIMsgWindow} msgWindow - msgWindow for give progress and status feedback
   * @param {nsIUrlListener} urlListener - Gets notified when url starts and stops
   * @param {boolean} convertData - Whether to send data though a stream
       converter converting from message/rfc822 to star/star.
   * @param {string} additionalHeader - Added to URI, e.g., "header=filter"
   * @param {boolean} [localOnly=false] - Whether data should be retrieved only
   *   from local caches. If streaming over the network is required and this
   *   is true, then an exception is thrown.
   *   If we're offline, then even if aLocalOnly is false, we won't stream over
   *   the network.
   * @returns {nsIURI} the URL that gets run.
   */
  streamMessage(
    messageUri,
    streamListener,
    msgWindow,
    urlListener,
    convertData,
    additionalHeader,
    localOnly = false
  ) {
    this._logger.debug("streamMessage", messageUri);
    const { serverURI, folder, folderName, key } =
      this._decomposeMessageUri(messageUri);
    let url = `${serverURI}/fetch>UID>/${folderName}>${key}`;
    if (additionalHeader) {
      url += `?header=${additionalHeader}`;
    }
    const imapUrl = Services.io
      .newURI(url)
      .QueryInterface(Ci.nsIImapUrl)
      .QueryInterface(Ci.nsIMsgMailNewsUrl);
    imapUrl.localFetchOnly = localOnly;

    imapUrl.folder = folder;
    imapUrl.msgWindow = msgWindow;
    imapUrl.msgIsInLocalCache = folder.hasMsgOffline(key);
    if (urlListener) {
      imapUrl.RegisterListener(urlListener);
    }

    const channel = new lazy.ImapChannel(imapUrl, {
      QueryInterface: ChromeUtils.generateQI(["nsILoadInfo"]),
      loadingPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      internalContentPolicy: Ci.nsIContentPolicy.TYPE_OTHER,
    });
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
  }

  streamHeaders(messageUri, consumer) {
    this._logger.debug("streamHeaders", messageUri);
    const { folder, key } = this._decomposeMessageUri(messageUri);

    const hasMsgOffline = folder.hasMsgOffline(key);
    if (!hasMsgOffline) {
      return;
    }

    const localMsgStream = folder.getLocalMsgStream(
      folder.GetMessageHeader(key)
    );
    const sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
      Ci.nsIScriptableInputStream
    );
    sstream.init(localMsgStream);
    let headers = "";
    let str = "";
    do {
      str = sstream.read(4096);
      const index = str.indexOf("\r\n\r\n");
      if (index != -1) {
        headers += str.slice(0, index) + "\r\n";
        break;
      } else {
        headers += str;
      }
    } while (str.length);

    const headersStream = Cc[
      "@mozilla.org/io/string-input-stream;1"
    ].createInstance(Ci.nsIStringInputStream);
    headersStream.setData(headers, headers.length);
    const pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(
      Ci.nsIInputStreamPump
    );
    pump.init(headersStream, 0, 0, true);
    pump.asyncRead(consumer);
  }

  /**
   * Go from message uri to go nsIMsgDBHdr.
   *
   * @param {string} uri - A message uri to get the nsIMsgDBHdr for.
   * @returns {?nsIMsgDBHdr} Hdr for the uri, or or null if failed.
   */
  messageURIToMsgHdr(uri) {
    try {
      const { folder, key } = this._decomposeMessageUri(uri);
      return folder.GetMessageHeader(key);
    } catch (e) {
      return null;
    }
  }

  Search(searchSession, msgWindow, folder, searchUri) {
    const server = folder.server.QueryInterface(Ci.nsIMsgIncomingServer);
    server.wrappedJSObject.withClient(folder, client => {
      client.startRunningUrl(
        searchSession.QueryInterface(Ci.nsIUrlListener),
        msgWindow
      );
      client.onReady = () => {
        client.search(folder, searchUri);
      };
      client.onData = uids => {
        for (const uid of uids) {
          const msgHdr = folder.msgDatabase.getMsgHdrForKey(uid);
          searchSession.runningAdapter.addResultElement(msgHdr);
        }
      };
    });
  }

  /**
   * Parse a message uri to hostname, folder and message key.
   *
   * @param {string} messageUri - The imap-message:// url to parse.
   * @returns {object} object
   * @returns {string} object.serverURI
   * @returns {nsIMsgFolder} object.folder
   * @returns {string} object.folderName
   * @returns {string} object.key
   */
  _decomposeMessageUri(messageUri) {
    const matches = /imap-message:\/\/([^:/]+)\/(.+)#(\d+)/.exec(messageUri);
    if (!matches) {
      throw new Error(`Unexpected IMAP URL: ${messageUri}`);
    }
    const [, host, folderName, key] = matches;
    const folder = lazy.MailUtils.getOrCreateFolder(
      `imap://${host}/${folderName}`
    );
    return { serverURI: folder.server.serverURI, folder, folderName, key };
  }
}

/**
 * A message service for imap://.
 */
export class ImapMessageService extends BaseMessageService {}

ImapMessageService.prototype.classID = Components.ID(
  "{d63af753-c2f3-4f1d-b650-9d12229de8ad}"
);

/**
 * A message service for imap-message://.
 */
export class ImapMessageMessageService extends BaseMessageService {}

ImapMessageMessageService.prototype.classID = Components.ID(
  "{2532ae4f-a852-4c96-be45-1308ba23d62e}"
);
