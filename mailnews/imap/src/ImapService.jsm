/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapService"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  ImapChannel: "resource:///modules/ImapChannel.jsm",
});

/**
 * Set mailnews.imap.jsmodule to true to use this module.
 *
 * @implements {nsIImapService}
 */
class ImapService {
  QueryInterface = ChromeUtils.generateQI(["nsIImapService"]);

  selectFolder(folder, urlListener, msgWindow) {
    let server = folder.QueryInterface(Ci.nsIMsgImapMailFolder)
      .imapIncomingServer;
    let runningUrl = Services.io
      .newURI(`imap://${server.hostName}:${server.port}`)
      .QueryInterface(Ci.nsIMsgMailNewsUrl);
    server.wrappedJSObject.withClient(client => {
      client.startRunningUrl(
        urlListener || folder.QueryInterface(Ci.nsIUrlListener),
        msgWindow,
        runningUrl
      );
      runningUrl.updatingFolder = true;
      client.onReady = () => {
        client.selectFolder(folder);
      };
    });
    return runningUrl;
  }

  discoverAllFolders(folder, urlListener, msgWindow) {
    let server = folder.QueryInterface(Ci.nsIMsgImapMailFolder)
      .imapIncomingServer;
    if (server.wrappedJSObject.hasDiscoveredFolders) {
      return;
    }
    server.wrappedJSObject.hasDiscoveredFolders = true;
    server.wrappedJSObject.withClient(client => {
      client.startRunningUrl(urlListener, msgWindow);
      client.onReady = () => {
        client.discoverAllFolders(folder);
      };
    });
  }

  addMessageFlags(folder, urlListener, messageIds, flags, messageIdsAreUID) {
    this._updateMessageFlags("+", folder, urlListener, messageIds, flags);
  }

  subtractMessageFlags(
    folder,
    urlListener,
    messageIds,
    flags,
    messageIdsAreUID
  ) {
    this._updateMessageFlags("-", folder, urlListener, messageIds, flags);
  }

  setMessageFlags(
    folder,
    urlListener,
    outURL,
    messageIds,
    flags,
    messageIdsAreUID
  ) {
    this._updateMessageFlags("", folder, urlListener, messageIds, flags);
  }

  _updateMessageFlags(action, folder, urlListener, messageIds, flags) {
    let server = folder.QueryInterface(Ci.nsIMsgImapMailFolder)
      .imapIncomingServer;
    server.wrappedJSObject.withClient(client => {
      client.onReady = () => {
        client.updateMesageFlags(
          action,
          folder,
          urlListener,
          messageIds,
          flags
        );
      };
    });
  }

  renameLeaf(folder, newName, urlListener, msgWindow) {
    let server = folder.QueryInterface(Ci.nsIMsgImapMailFolder)
      .imapIncomingServer;
    server.wrappedJSObject.withClient(client => {
      client.startRunningUrl(urlListener, msgWindow);
      client.onReady = () => {
        client.renameFolder(folder, newName);
      };
    });
  }

  fetchMessage(
    imapUrl,
    imapAction,
    folder,
    msgSink,
    msgWindow,
    displayConsumer,
    msgIds,
    convertDataToText
  ) {
    imapUrl.imapAction = imapAction;
    if (displayConsumer instanceof Ci.nsIDocShell) {
      imapUrl
        .QueryInterface(Ci.nsIMsgMailNewsUrl)
        .loadURI(
          displayConsumer.QueryInterface(Ci.nsIDocShell),
          Ci.nsIWebNavigation.LOAD_FLAGS_NONE
        );
    } else {
      let streamListener = displayConsumer.QueryInterface(Ci.nsIStreamListener);
      let channel = new lazy.ImapChannel(imapUrl, {
        QueryInterface: ChromeUtils.generateQI(["nsILoadInfo"]),
        loadingPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        securityFlags:
          Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        internalContentPolicy: Ci.nsIContentPolicy.TYPE_OTHER,
      });
      let listener = streamListener;
      if (convertDataToText) {
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
    }
  }

  fetchCustomMsgAttribute(folder, msgWindow, attribute, uids) {
    return this._withClient(folder, (client, runningUrl) => {
      client.startRunningUrl(null, msgWindow, runningUrl);
      client.onReady = () => {
        client.fetchMsgAttribute(folder, uids, attribute);
      };
    });
  }

  expunge(folder, urlListener, msgWindow) {
    this._withClient(folder, client => {
      client.startRunningUrl(urlListener, msgWindow);
      client.onReady = () => {
        client.expunge(folder);
      };
    });
  }

  onlineMessageCopy(
    folder,
    messageIds,
    dstFolder,
    idsAreUids,
    isMove,
    urlListener,
    outURL,
    copyState,
    msgWindow
  ) {
    this._withClient(folder, client => {
      let runningUrl = client.startRunningUrl(urlListener, msgWindow);
      runningUrl.QueryInterface(Ci.nsIImapUrl).imapAction = isMove
        ? Ci.nsIImapUrl.nsImapOnlineMove
        : Ci.nsIImapUrl.nsImapOnlineCopy;
      client.onReady = () => {
        client.copy(folder, dstFolder, messageIds, idsAreUids, isMove);
      };
    });
  }

  appendMessageFromFile(
    file,
    dstFolder,
    messageId,
    idsAreUids,
    inSelectedState,
    urlListener,
    copyState,
    msgWindow
  ) {
    this._withClient(dstFolder, client => {
      let runningUrl = client.startRunningUrl(urlListener, msgWindow);
      runningUrl.QueryInterface(Ci.nsIImapUrl).imapAction =
        Ci.nsIImapUrl.nsImapAppendMsgFromFile;
      client.onReady = () => {
        client.uploadMessageFromFile(file, dstFolder, copyState);
      };
    });
  }

  ensureFolderExists(parent, folderName, msgWindow, urlListener) {
    this._withClient(parent, client => {
      let runningUrl = client.startRunningUrl(urlListener, msgWindow);
      runningUrl.QueryInterface(Ci.nsIImapUrl).imapAction =
        Ci.nsIImapUrl.nsImapEnsureExistsFolder;
      client.onReady = () => {
        client.ensureFolderExists(parent, folderName);
      };
    });
  }

  updateFolderStatus(folder, urlListener) {
    this._withClient(folder, client => {
      let runningUrl = client.startRunningUrl(urlListener);
      runningUrl.QueryInterface(Ci.nsIImapUrl).imapAction =
        Ci.nsIImapUrl.nsImapFolderStatus;
      client.onReady = () => {
        client.updateFolderStatus(folder);
      };
    });
  }

  createFolder(parent, folderName, urlListener) {
    return this._withClient(parent, (client, runningUrl) => {
      client.startRunningUrl(urlListener, null, runningUrl);
      runningUrl.QueryInterface(Ci.nsIImapUrl).imapAction =
        Ci.nsIImapUrl.nsImapCreateFolder;
      client.onReady = () => {
        client.createFolder(parent, folderName);
      };
    });
  }

  moveFolder(srcFolder, dstFolder, urlListener, msgWindow) {
    this._withClient(srcFolder, client => {
      let runningUrl = client.startRunningUrl(urlListener, msgWindow);
      runningUrl.QueryInterface(Ci.nsIImapUrl).imapAction =
        Ci.nsIImapUrl.nsImapMoveFolderHierarchy;
      client.onReady = () => {
        client.moveFolder(srcFolder, dstFolder);
      };
    });
  }

  listFolder(folder, urlListener) {
    this._withClient(folder, client => {
      let runningUrl = client.startRunningUrl(urlListener);
      runningUrl.QueryInterface(Ci.nsIImapUrl).imapAction =
        Ci.nsIImapUrl.nsImapListFolder;
      client.onReady = () => {
        client.listFolder(folder);
      };
    });
  }

  storeCustomKeywords(folder, msgWindow, flagsToAdd, flagsToSubtract, uids) {
    return this._withClient(folder, (client, runningUrl) => {
      client.startRunningUrl(null, msgWindow, runningUrl);
      runningUrl.QueryInterface(Ci.nsIImapUrl).imapAction =
        Ci.nsIImapUrl.nsImapMsgStoreCustomKeywords;
      client.onReady = () => {
        client.storeCustomKeywords(folder, flagsToAdd, flagsToSubtract, uids);
      };
    });
  }

  downloadMessagesForOffline(messageIds, folder, urlListener, msgWindow) {
    let server = folder.QueryInterface(Ci.nsIMsgImapMailFolder)
      .imapIncomingServer;
    let imapUrl = Services.io
      .newURI(
        `imap://${server.hostName}:${server.port}/fetch>UID>/${folder.name}>${messageIds}`
      )
      .QueryInterface(Ci.nsIImapUrl);
    imapUrl.storeResultsOffline = true;
    if (urlListener) {
      imapUrl
        .QueryInterface(Ci.nsIMsgMailNewsUrl)
        .RegisterListener(urlListener);
    }
    this._withClient(folder, client => {
      client.startRunningUrl(urlListener, msgWindow, imapUrl);
      client.onReady = () => {
        client.fetchMessage(folder, messageIds);
      };
    });
  }

  /**
   * Do some actions with a connection.
   * @param {nsIMsgFolder} folder - The associated folder.
   * @param {Function} handler - A callback function to take a ImapClient
   *   instance, and do some actions.
   */
  _withClient(folder, handler) {
    let server = folder.QueryInterface(Ci.nsIMsgImapMailFolder)
      .imapIncomingServer;
    let runningUrl = Services.io
      .newURI(`imap://${server.hostName}:${server.port}`)
      .QueryInterface(Ci.nsIMsgMailNewsUrl);
    server.wrappedJSObject.withClient(client => handler(client, runningUrl));
    return runningUrl;
  }
}

ImapService.prototype.classID = Components.ID(
  "{2ea8fbe6-029b-4bff-ae05-b794cf955afb}"
);
