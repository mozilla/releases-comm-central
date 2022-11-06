/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapClient"];

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);
var { MailStringUtils } = ChromeUtils.import(
  "resource:///modules/MailStringUtils.jsm"
);
var { ImapAuthenticator } = ChromeUtils.import(
  "resource:///modules/MailAuthenticator.jsm"
);
var { ImapResponse } = ChromeUtils.import(
  "resource:///modules/ImapResponse.jsm"
);
var { ImapUtils } = ChromeUtils.import("resource:///modules/ImapUtils.jsm");

// There can be multiple ImapClient running concurrently, assign each logger a
// unique prefix.
let loggerInstanceId = 0;

/**
 * A class to interact with IMAP server.
 */
class ImapClient {
  _logger = console.createInstance({
    prefix: `mailnews.imap.${loggerInstanceId++}`,
    maxLogLevel: "Warn",
    maxLogLevelPref: "mailnews.imap.loglevel",
  });

  /**
   * @param {nsIImapIncomingServer} server - The associated server instance.
   */
  constructor(server) {
    this._server = server.QueryInterface(Ci.nsIMsgIncomingServer);
    this._serverSink = this._server.QueryInterface(Ci.nsIImapServerSink);
    this._authenticator = new ImapAuthenticator(server);

    // Auth methods detected from the CAPABILITY response.
    this._supportedAuthMethods = [];
    // Subset of _supportedAuthMethods that are allowed by user preference.
    this._possibleAuthMethods = [];
    // Auth methods set by user preference.
    this._preferredAuthMethods =
      {
        [Ci.nsMsgAuthMethod.passwordCleartext]: ["PLAIN", "LOGIN"],
        [Ci.nsMsgAuthMethod.passwordEncrypted]: ["CRAM-MD5"],
        [Ci.nsMsgAuthMethod.GSSAPI]: ["GSSAPI"],
        [Ci.nsMsgAuthMethod.NTLM]: ["NTLM"],
        [Ci.nsMsgAuthMethod.OAuth2]: ["XOAUTH2"],
        [Ci.nsMsgAuthMethod.External]: ["EXTERNAL"],
      }[server.authMethod] || [];
    // The next auth method to try if the current failed.
    this._nextAuthMethod = null;

    this._tag = Math.floor(100 * Math.random());
    this._charsetManager = Cc[
      "@mozilla.org/charset-converter-manager;1"
    ].getService(Ci.nsICharsetConverterManager);

    this._messageUids = [];
    this._messages = new Map();

    this._loadPrefs();
  }

  /**
   * Load imap related preferences, many behaviors depend on these pref values.
   */
  _loadPrefs() {
    this._prefs = {
      tcpTimeout: Services.prefs.getIntPref("mailnews.tcptimeout"),
    };
  }

  /**
   * Reset some internal states to be safely reused.
   */
  _reset() {
    this.onData = () => {};
    this.onDone = () => {};

    this.channel = null;
    this._urlListener = null;
    this._msgWindow = null;
    this._authenticating = false;
    this.verifyLogon = false;
  }

  /**
   * Initiate a connection to the server
   */
  connect() {
    this._idling = false;
    if (this._socket?.readyState == "open") {
      // Reuse the connection.
      this.onReady();
    } else {
      let hostname = this._server.hostName.toLowerCase();
      this._logger.debug(`Connecting to ${hostname}:${this._server.port}`);
      this._capabilities = null;
      this._secureTransport = this._server.socketType == Ci.nsMsgSocketType.SSL;
      this._socket = new TCPSocket(hostname, this._server.port, {
        binaryType: "arraybuffer",
        useSecureTransport: this._secureTransport,
      });
      this._socket.onopen = this._onOpen;
      this._socket.onerror = this._onError;
    }
  }

  /**
   * Construct an nsIMsgMailNewsUrl instance, setup urlListener to notify when
   * the current request is finished.
   * @param {nsIUrlListener} urlListener - Callback for the request.
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   * @param {nsIMsgMailNewsUrl} [runningUrl] - The url to run, if provided.
   * @returns {nsIMsgMailNewsUrl}
   */
  startRunningUrl(urlListener, msgWindow, runningUrl) {
    this._urlListener = urlListener;
    this._msgWindow = msgWindow;
    this.runningUrl = runningUrl;
    if (!this.runningUrl) {
      this.runningUrl = Services.io.newURI(
        `imap://${this._server.hostName}:${this._server.port}`
      );
    }
    this._urlListener?.OnStartRunningUrl(this.runningUrl, Cr.NS_OK);
    this.runningUrl
      .QueryInterface(Ci.nsIMsgMailNewsUrl)
      .SetUrlState(true, Cr.NS_OK);
    return this.runningUrl;
  }

  /**
   * Discover all folders.
   * @param {nsIMsgFolder} folder - The associated folder.
   */
  discoverAllFolders(folder) {
    this._logger.debug("discoverAllFolders", folder.URI);
    let supportsListExtended = this._capabilities.includes("LIST-EXTENDED");
    let handleListResponse = res => {
      this._hasTrash = res.mailboxes.some(
        mailbox => mailbox.flags & ImapUtils.FLAG_IMAP_TRASH
      );
      if (!this._hasTrash) {
        let trashFolderName = this._server.trashFolderName.toLowerCase();
        let trashMailbox = res.mailboxes.find(
          mailbox => mailbox.name.toLowerCase() == trashFolderName
        );
        if (trashMailbox) {
          this._hasTrash = true;
          trashMailbox.flags |= ImapUtils.FLAG_IMAP_TRASH;
        }
      }
      for (let mailbox of res.mailboxes) {
        this._serverSink.possibleImapMailbox(
          mailbox.name,
          mailbox.delimiter,
          mailbox.flags
        );
      }
    };

    this._nextAction = res => {
      if (supportsListExtended) {
        handleListResponse(res);
        this._actionFinishFolderDiscovery();
        return;
      }
      this._nextAction = res2 => {
        // Per rfc3501#section-6.3.9, if LSUB returns different flags from LIST,
        // use the LIST responses.
        for (let mailbox of res2.mailboxes) {
          let mailboxFromList = res.mailboxes.find(x => x.name == mailbox.name);
          if (
            mailboxFromList?.flags &&
            mailboxFromList?.flags != mailbox.flags
          ) {
            mailbox.flags = mailboxFromList.flags;
          }
        }
        handleListResponse(res2);
        this._actionFinishFolderDiscovery();
      };
      this._sendTagged('LSUB "" "*"');
    };
    this._sendTagged(
      supportsListExtended ? 'LIST (SUBSCRIBED) "" "*"' : 'LIST "" "*"'
    );
  }

  /**
   * Select a folder.
   * @param {nsIMsgFolder} folder - The folder to select.
   */
  selectFolder(folder) {
    this._logger.debug("selectFolder", folder.URI);
    if (this.folder == folder) {
      this._actionNoop();
      return;
    }
    this.folder = folder;
    this._actionAfterSelectFolder = this._actionUidFetch;
    this._nextAction = this._actionSelectResponse;
    this._sendTagged(`SELECT "${this._getServerFolderName(folder)}"`);
  }

  /**
   * Rename a folder.
   * @param {nsIMsgFolder} folder - The folder to rename.
   * @param {string} newName - The new folder name.
   */
  renameFolder(folder, newName) {
    let delimiter =
      folder.QueryInterface(Ci.nsIMsgImapMailFolder).hierarchyDelimiter || "/";
    let names = this._getAncestorFolderNames(folder);
    let oldName = this._charsetManager.unicodeToMutf7(
      [...names, folder.name].join(delimiter)
    );
    newName = this._charsetManager.unicodeToMutf7(
      [...names, newName].join(delimiter)
    );

    this._nextAction = this._actionRenameResponse(oldName, newName);
    this._sendTagged(`RENAME "${oldName}" "${newName}"`);
  }

  /**
   * Move a source folder to be a child of another folder.
   * @param {nsIMsgFolder} srcFolder - The source folder to move.
   * @param {nsIMsgFolder} dstFolder - The target parent folder.
   */
  moveFolder(srcFolder, dstFolder) {
    this._logger.debug("moveFolder", srcFolder.URI, dstFolder.URI);
    let oldName = this._getServerFolderName(srcFolder);
    let newName = this._getServerSubFolderName(dstFolder, srcFolder.name);
    this._nextAction = this._actionRenameResponse(oldName, newName);
    this._sendTagged(`RENAME "${oldName}" "${newName}"`);
  }

  /**
   * Send LIST command for a folder.
   * @param {nsIMsgFolder} folder - The folder to list.
   */
  listFolder(folder) {
    this._logger.debug("listFolder", folder.URI);
    this._actionList(this._getServerFolderName(folder), () => {
      this._actionDone();
    });
  }

  /**
   * Ensure a folder exists on the server. Create one if not already exists.
   * @param {nsIMsgFolder} parent - The parent folder to check.
   * @param {string} folderName - The folder name.
   */
  ensureFolderExists(parent, folderName) {
    this._logger.debug("ensureFolderExists", parent.URI, folderName);
    let mailboxName = this._getServerSubFolderName(parent, folderName);
    this._nextAction = res => {
      if (res.mailboxes.length) {
        // Already exists.
        this._actionDone();
        return;
      }
      // Create one and subscribe to it.
      this._actionCreateAndSubscribe(mailboxName, res => {
        this._actionList(mailboxName, () => this._actionDone());
      });
    };
    this._sendTagged(`LIST "" "${mailboxName}"`);
  }

  /**
   * Create a folder on the server.
   * @param {nsIMsgFolder} parent - The parent folder to check.
   * @param {string} folderName - The folder name.
   */
  createFolder(parent, folderName) {
    this._logger.debug("createFolder", parent.URI, folderName);
    let mailboxName = this._getServerSubFolderName(parent, folderName);
    this._actionCreateAndSubscribe(mailboxName, res => {
      this._actionList(mailboxName, () => this._actionDone());
    });
  }

  /**
   * Fetch the attribute of messages.
   * @param {nsIMsgFolder} folder - The folder to check.
   * @param {string} uids - The message uids.
   * @param {string} attribute - The message attribute to fetch
   */
  fetchMsgAttribute(folder, uids, attribute) {
    this._logger.debug("fetchMsgAttribute", folder.URI, uids, attribute);
    this._nextAction = res => {
      if (res.done) {
        let resultAttributes = res.messages
          .map(m => m.customAttributes[attribute])
          .flat();
        this.runningUrl.QueryInterface(Ci.nsIImapUrl).customAttributeResult =
          resultAttributes.length > 1
            ? `(${resultAttributes.join(" ")})`
            : resultAttributes[0];
        this._actionDone();
      }
    };
    this._sendTagged(`UID FETCH ${uids} (${attribute})`);
  }

  /**
   * Get the names of all ancestor folders. For example,
   *   folder a/b/c will return ['a', 'b'].
   * @param {nsIMsgFolder} folder - The input folder.
   * @returns {string[]}
   */
  _getAncestorFolderNames(folder) {
    let ancestors = [];
    let parent = folder.parent;
    while (parent && parent != folder.rootFolder) {
      ancestors.unshift(parent.name);
      parent = parent.parent;
    }
    return ancestors;
  }

  /**
   * Get the server name of a msg folder.
   * @param {nsIMsgFolder} folder - The input folder.
   * @returns {string}
   */
  _getServerFolderName(folder) {
    if (folder.isServer) {
      return "";
    }

    if (folder.onlineName) {
      return folder.onlineName;
    }
    let delimiter =
      folder.QueryInterface(Ci.nsIMsgImapMailFolder).hierarchyDelimiter || "/";
    let names = this._getAncestorFolderNames(folder);
    return this._charsetManager.unicodeToMutf7(
      [...names, folder.name].join(delimiter)
    );
  }

  /**
   * Get the server name of a sub folder. The sub folder may or may not exist on
   * the server.
   * @param {nsIMsgFolder} parent - The parent folder.
   * @param {string} folderName - The sub folder name.
   * @returns {string}
   */
  _getServerSubFolderName(parent, folderName) {
    let mailboxName = this._getServerFolderName(parent);
    if (mailboxName) {
      let delimiter = parent.QueryInterface(Ci.nsIMsgImapMailFolder)
        .hierarchyDelimiter;
      // @see nsImapCore.h.
      const ONLINE_HIERARCHY_SEPARATOR_UNKNOWN = "^";
      if (!delimiter || delimiter == ONLINE_HIERARCHY_SEPARATOR_UNKNOWN) {
        delimiter = "/";
      }
      return mailboxName + delimiter + folderName;
    }
    return folderName;
  }

  /**
   * Fetch the full content of a message by UID.
   * @param {nsIMsgFolder} folder - The associated folder.
   * @param {number} uid - The message uid.
   */
  fetchMessage(folder, uid) {
    this._logger.debug(`fetchMessage folder=${folder.name} uid=${uid}`);
    if (folder.hasMsgOffline(uid, null, 10)) {
      this.onDone = () => {};
      this.channel?.readFromLocalCache();
      this._actionDone();
      return;
    }
    let fetchUid = () => {
      this._nextAction = this._actionUidFetchBodyResponse;
      this._sendTagged(`UID FETCH ${uid} (UID RFC822.SIZE FLAGS BODY.PEEK[])`);
    };
    if (this.folder != folder) {
      this.folder = folder;
      this._actionAfterSelectFolder = fetchUid;
      this._nextAction = this._actionSelectResponse;
      this._sendTagged(`SELECT "${this._getServerFolderName(folder)}"`);
    } else {
      fetchUid();
    }
  }

  /**
   * Add, remove or replace flags of specified messages.
   * @param {string} action - "+" means add, "-" means remove, "" means replace.
   * @param {nsIMsgFolder} folder - The target folder.
   * @param {nsIUrlListener} urlListener - Callback for the request.
   * @param {string} messageIds - Message UIDs, e.g. "23,30:33".
   * @param {number} flags - The internal flags number to update.
   */
  updateMesageFlags(action, folder, urlListener, messageIds, flags) {
    this._urlListener = urlListener;
    let getCommand = () => {
      // _supportedFlags is available after _actionSelectResponse.
      let flagsStr = ImapUtils.flagsToString(flags, this._supportedFlags);
      return `UID STORE ${messageIds} ${action}FLAGS ${flagsStr}`;
    };
    if (this.folder == folder) {
      this._nextAction = () => this._actionDone();
      this._sendTagged(getCommand());
    } else {
      this.folder = folder;
      this._actionAfterSelectFolder = () => {
        this._nextAction = () => this._actionDone();
        this._sendTagged(getCommand());
      };
      this._nextAction = this._actionSelectResponse;
      this._sendTagged(`SELECT "${folder.name}"`);
    }
  }

  /**
   * Send EXPUNGE command to a folder.
   * @param {nsIMsgFolder} folder - The associated folder.
   */
  expunge(folder) {
    this._actionFolderCommand(folder, () => {
      this._nextAction = () => this._actionDone();
      this._sendTagged("EXPUNGE");
    });
  }

  /**
   * Move or copy messages from a folder to another folder.
   * @param {nsIMsgFolder} folder - The source folder.
   * @param {nsIMsgFolder} folder - The target folder.
   * @param {string} messageIds - The message identifiers.
   * @param {boolean} idsAreUids - If true messageIds are UIDs, otherwise,
   *   messageIds are sequences.
   * @param {boolean} isMove - If true, use MOVE command when supported.
   */
  copy(folder, dstFolder, messageIds, idsAreUids, isMove) {
    let command = idsAreUids ? "UID " : "";
    command +=
      isMove && this._capabilities.includes("MOVE")
        ? "MOVE " // rfc6851
        : "COPY ";
    command += messageIds + ` "${this._getServerFolderName(dstFolder)}"`;
    this._actionFolderCommand(folder, () => {
      this._nextAction = () => this._actionDone();
      this._sendTagged(command);
    });
  }

  /**
   * Upload a message file to a folder.
   * @param {nsIFile} file - The message file to upload.
   * @param {nsIMsgFolder} dstFolder - The target folder.
   * @param {nsImapMailCopyState} copyState - A state used by nsImapMailFolder.
   */
  async uploadMessageFromFile(file, dstFolder, copyState) {
    this._logger.debug("uploadMessageFromFile", file.path, dstFolder.URI);
    let mailbox = this._getServerFolderName(dstFolder);
    let content = MailStringUtils.uint8ArrayToByteString(
      await IOUtils.read(file.path)
    );
    this._nextAction = res => {
      if (res.tag != "+") {
        this._actionDone(Cr.NS_ERROR_FAILURE);
        return;
      }
      this._nextAction = res => {
        this._folderSink = dstFolder.QueryInterface(Ci.nsIImapMailFolderSink);
        this._actionDone();
        try {
          this._folderSink.copyNextStreamMessage(true, copyState);
        } catch (e) {
          this._logger.warn("copyNextStreamMessage failed", e);
        }
      };
      this._send(content);
    };
    this._sendTagged(`APPEND "${mailbox}" {${content.length}}`);
  }

  /**
   * Check the status of a folder.
   * @param {nsIMsgFolder} folder - The folder to check.
   */
  updateFolderStatus(folder) {
    this._logger.debug("updateFolderStatus", folder.URI);
    if (this._folder == folder) {
      // According to rfc3501, "the STATUS command SHOULD NOT be used on the
      // currently selected mailbox", so use NOOP instead.
      this._actionNoop();
      return;
    }

    this._nextAction = res => {
      if (res.status == "OK") {
        folder
          .QueryInterface(Ci.nsIImapMailFolderSink)
          .UpdateImapMailboxStatus(this, {
            QueryInterface: ChromeUtils.generateQI(["nsIMailboxSpec"]),
            nextUID: res.attributes.uidnext,
            numMessages: res.attributes.messages.length,
            numUnseenMessages: res.attributes.unseen,
          });
        folder.msgDatabase = null;
      }
      this._actionDone();
    };
    this._sendTagged(
      `STATUS "${this._getServerFolderName(folder)}" (UIDNEXT MESSAGES UNSEEN)`
    );
  }

  /**
   * Update message flags.
   * @param {nsIMsgFolder} folder - The associated folder.
   * @param {string} flagsToAdd - The flags to add.
   * @param {string} flagsToSubtract - The flags to subtract.
   * @param {string} uids - The message uids.
   */
  storeCustomKeywords(folder, flagsToAdd, flagsToSubtract, uids) {
    this._logger.debug(
      "storeCustomKeywords",
      folder.URI,
      flagsToAdd,
      flagsToSubtract,
      uids
    );
    this._msgSink = this.folder.QueryInterface(Ci.nsIImapMessageSink);
    let handleResponse = res => {
      for (let msg of res.messages) {
        let uid = this._messageUids[msg.sequence];
        this._msgSink.notifyMessageFlags(
          msg.flags,
          msg.keywords,
          uid,
          this._folderState.highestmodseq
        );
      }
    };
    let subtractFlags = () => {
      if (flagsToSubtract) {
        this._nextAction = res => {
          handleResponse(res);
          this._actionDone();
        };
        this._sendTagged(`UID STORE ${uids} -FLAGS (${flagsToAdd})`);
      } else {
        this._actionDone();
      }
    };
    this._actionFolderCommand(folder, () => {
      if (flagsToAdd) {
        this._nextAction = res => {
          handleResponse(res);
          subtractFlags();
        };
        this._sendTagged(`UID STORE ${uids} +FLAGS (${flagsToAdd})`);
      } else {
        subtractFlags();
      }
    });
  }

  /**
   * Get message headers by the specified uids.
   * @param {nsIMsgFolder} folder - The folder of the messages.
   * @param {string[]} uids - The message uids.
   */
  getHeaders(folder, uids) {
    this._logger.debug("getHeaders", folder.URI, uids);
    this._actionFolderCommand(folder, () => {
      this._nextAction = this._actionUidFetchHeaderResponse;
      let extraItems = "";
      if (this._server.isGMailServer) {
        extraItems += "X-GM-MSGID X-GM-THRID X-GM-LABELS ";
      }
      this._sendTagged(
        `UID FETCH ${uids} (UID ${extraItems}RFC822.SIZE FLAGS BODY.PEEK[HEADER])`
      );
    });
  }

  /**
   * Send IDLE command to the server.
   */
  idle() {
    this._idling = true;
    this._nextAction = res => {
      if (res.tag == "*") {
        if (!this.folder) {
          this._actionDone();
          return;
        }
        if (!this._folderSink) {
          this._folderSink = this.folder.QueryInterface(
            Ci.nsIImapMailFolderSink
          );
        }
        this._folderSink.OnNewIdleMessages();
      }
    };
    this._sendTagged("IDLE");
  }

  /**
   * Send DONE to end the IDLE command.
   */
  endIdle() {
    this._idling = false;
    this._nextAction = this._actionDone;
    this._send("DONE");
  }

  /**
   * Send LOGOUT and close the socket.
   */
  logout() {
    this._sendTagged("LOGOUT");
    this._socket.close();
  }

  /**
   * The open event handler.
   */
  _onOpen = () => {
    this._logger.debug("Connected");
    this._socket.ondata = this._onData;
    this._socket.onclose = this._onClose;
    this._nextAction = this._actionCapabilityResponse;

    this._socket.transport.setTimeout(
      Ci.nsISocketTransport.TIMEOUT_READ_WRITE,
      this._prefs.tcpTimeout
    );
  };

  /**
   * The data event handler.
   * @param {TCPSocketEvent} event - The data event.
   */
  _onData = async event => {
    // Without this, some tests are blocked waiting for response from Maild.jsm.
    // Don't know the real cause, but possibly because ImapClient and Maild runs
    // on the same process. We also have this in Pop3Client.
    await new Promise(resolve => setTimeout(resolve));

    let stringPayload = MailStringUtils.uint8ArrayToByteString(
      new Uint8Array(event.data)
    );
    this._logger.debug(`S: ${stringPayload}`);
    if (!this._response || this._idling || this._response.done) {
      this._response = new ImapResponse();
    }
    this._response.parse(stringPayload);
    this._logger.debug("Parsed:", this._response);
    if (
      !this._authenticating &&
      this._response.done &&
      this._response.status &&
      this._response.tag != "+" &&
      !["OK", "+"].includes(this._response.status)
    ) {
      this._actionDone(ImapUtils.NS_MSG_ERROR_IMAP_COMMAND_FAILED);
      return;
    }
    if (!this._capabilities || this._idling || this._response.done) {
      this._nextAction?.(this._response);
    }
  };

  /**
   * The error event handler.
   * @param {TCPSocketErrorEvent} event - The error event.
   */
  _onError = event => {
    this._logger.error(event, event.name, event.message, event.errorCode);
    if (event.errorCode == Cr.NS_ERROR_NET_TIMEOUT) {
      this._actionError("imapNetTimeoutError");
      this._actionDone(event.errorCode);
      return;
    }
    this.logout();
    let secInfo = event.target.transport?.tlsSocketControl;
    if (secInfo) {
      this.runningUrl.failedSecInfo = secInfo;
    }
    this._actionDone(event.errorCode);
  };

  /**
   * The close event handler.
   */
  _onClose = () => {
    this._logger.debug("Connection closed.");
  };

  /**
   * Send a command to the server.
   * @param {string} str - The command string to send.
   * @param {boolean} [suppressLogging=false] - Whether to suppress logging the str.
   */
  _send(str, suppressLogging) {
    if (suppressLogging && AppConstants.MOZ_UPDATE_CHANNEL != "default") {
      this._logger.debug(
        "C: Logging suppressed (it probably contained auth information)"
      );
    } else {
      // Do not suppress for non-release builds, so that debugging auth problems
      // is easier.
      this._logger.debug(`C: ${str}`);
    }

    if (this._socket?.readyState != "open") {
      if (!str.includes("LOGOUT")) {
        this._logger.warn(
          `Failed to send because socket state is ${this._socket?.readyState}`
        );
      }
      return;
    }

    this._socket.send(
      MailStringUtils.byteStringToUint8Array(str + "\r\n").buffer
    );
  }

  /**
   * Same as _send, but prepend a tag to the command.
   */
  _sendTagged(str, suppressLogging) {
    this._send(`${this._getNextTag()} ${str}`, suppressLogging);
  }

  /**
   * Get the next command tag.
   * @returns {number}
   */
  _getNextTag() {
    this._tag = (this._tag + 1) % 100;
    return this._tag;
  }

  /**
   * Send CAPABILITY command to the server.
   */
  _actionCapability() {
    this._nextAction = this._actionCapabilityResponse;
    this._sendTagged("CAPABILITY");
  }

  /**
   * Handle the capability response.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionCapabilityResponse = res => {
    if (res.capabilities) {
      this._capabilities = res.capabilities;
      this._server.wrappedJSObject.capabilities = res.capabilities;
      if (this._capabilities.includes("X-GM-EXT-1")) {
        this._server.isGMailServer = true;
      }

      this._supportedAuthMethods = res.authMethods;
      this._actionChooseFirstAuthMethod();
    } else {
      this._actionCapability();
    }
  };

  /**
   * Decide the first auth method to try.
   */
  _actionChooseFirstAuthMethod = () => {
    if (
      [
        Ci.nsMsgSocketType.trySTARTTLS,
        Ci.nsMsgSocketType.alwaysSTARTTLS,
      ].includes(this._server.socketType) &&
      !this._secureTransport
    ) {
      if (this._capabilities.includes("STARTTLS")) {
        // Init STARTTLS negotiation if required by user pref and supported.
        this._nextAction = this._actionStarttlsResponse;
        this._sendTagged("STARTTLS");
      } else {
        // Abort if not supported.
        this._logger.error("Server doesn't support STARTTLS. Aborting.");
        this._actionError("imapServerDisconnected");
        this._actionDone(Cr.NS_ERROR_FAILURE);
      }
      return;
    }

    this._possibleAuthMethods = this._preferredAuthMethods.filter(x =>
      this._supportedAuthMethods.includes(x)
    );
    if (
      !this._possibleAuthMethods.length &&
      this._server.authMethod == Ci.nsMsgAuthMethod.passwordCleartext &&
      !this._capabilities.includes("LOGINDISABLED")
    ) {
      this._possibleAuthMethods = ["OLDLOGIN"];
    }
    this._logger.debug(`Possible auth methods: ${this._possibleAuthMethods}`);
    this._nextAuthMethod = this._possibleAuthMethods[0];
    if (this._capabilities.includes("CLIENTID") && this._server.clientid) {
      this._nextAction = res => {
        if (res.status == "OK") {
          this._actionAuth();
        } else {
          this._actionDone(Cr.NS_ERROR_FAILURE);
        }
      };
      this._sendTagged(`CLIENTID UUID ${this._server.clientid}`);
    } else {
      this._actionAuth();
    }
  };

  /**
   * Handle the STARTTLS response.
   * @param {ImapResponse} res - The server response.
   */
  _actionStarttlsResponse(res) {
    if (!res.status == "OK") {
      this._actionDone(Cr.NS_ERROR_FAILURE);
      return;
    }
    this._socket.upgradeToSecure();
    this._secureTransport = true;
    this._actionCapability();
  }

  /**
   * Init authentication depending on server capabilities and user prefs.
   */
  _actionAuth = async () => {
    if (!this._nextAuthMethod) {
      this._socket.close();
      this._actionDone(Cr.NS_ERROR_FAILURE);
      return;
    }

    this._authenticating = true;

    this._currentAuthMethod = this._nextAuthMethod;
    this._nextAuthMethod = this._possibleAuthMethods[
      this._possibleAuthMethods.indexOf(this._currentAuthMethod) + 1
    ];

    switch (this._currentAuthMethod) {
      case "OLDLOGIN":
        this._nextAction = this._actionAuthResponse;
        let password = await this._getPassword();
        this._sendTagged(
          `LOGIN ${this._authenticator.username} ${password}`,
          true
        );
        break;
      case "PLAIN":
        this._nextAction = this._actionAuthPlain;
        this._sendTagged("AUTHENTICATE PLAIN");
        break;
      case "LOGIN":
        this._nextAction = this._actionAuthLoginUser;
        this._sendTagged("AUTHENTICATE LOGIN");
        break;
      case "CRAM-MD5":
        this._nextAction = this._actionAuthCramMd5;
        this._sendTagged("AUTHENTICATE CRAM-MD5");
        break;
      case "GSSAPI": {
        this._nextAction = this._actionAuthGssapi;
        this._authenticator.initGssapiAuth("imap");
        let token;
        try {
          token = this._authenticator.getNextGssapiToken("");
        } catch (e) {
          this._logger.error(e);
          this._actionDone(Cr.NS_ERROR_FAILURE);
          return;
        }
        this._sendTagged(`AUTHENTICATE GSSAPI ${token}`, true);
        break;
      }
      case "NTLM": {
        this._nextAction = this._actionAuthNtlm;
        this._authenticator.initNtlmAuth("imap");
        let token;
        try {
          token = this._authenticator.getNextNtlmToken("");
        } catch (e) {
          this._logger.error(e);
          this._actionDone(Cr.NS_ERROR_FAILURE);
          return;
        }
        this._sendTagged(`AUTHENTICATE NTLM ${token}`, true);
        break;
      }
      case "XOAUTH2":
        this._nextAction = this._actionAuthResponse;
        let token = await this._authenticator.getOAuthToken();
        this._sendTagged(`AUTHENTICATE XOAUTH2 ${token}`, true);
        break;
      case "EXTERNAL":
        this._nextAction = this._actionAuthResponse;
        this._sendTagged(
          `AUTHENTICATE EXTERNAL ${this._authenticator.username}`
        );
        break;
      default:
        this._actionDone();
    }
  };

  /**
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionAuthResponse = res => {
    this._authenticating = false;

    if (this.verifyLogon) {
      this._actionDone(res.status == "OK" ? Cr.NS_OK : Cr.NS_ERROR_FAILURE);
      return;
    }
    if (res.status == "OK") {
      this._serverSink.userAuthenticated = true;
      let actionId = () => {
        if (this._capabilities.includes("ID") && Services.appinfo.name) {
          this._nextAction = res => {
            this._server.serverIDPref = res.id;
            this.onReady();
          };
          this._sendTagged(
            `ID ("name" "${Services.appinfo.name}" "version" "${Services.appinfo.version}")`
          );
        } else {
          this.onReady();
        }
      };
      if (res.capabilities) {
        this._capabilities = res.capabilities;
        this._server.wrappedJSObject.capabilities = res.capabilities;
        actionId();
      } else {
        this._nextAction = res => {
          this._capabilities = res.capabilities;
          this._server.wrappedJSObject.capabilities = res.capabilities;
          actionId();
        };
        this._sendTagged("CAPABILITY");
      }
      return;
    }
    if (
      ["OLDLOGIN", "PLAIN", "LOGIN", "CRAM-MD5"].includes(
        this._currentAuthMethod
      )
    ) {
      // Ask user what to do.
      let action = this._authenticator.promptAuthFailed();
      if (action == 1) {
        // Cancel button pressed.
        this._socket.close();
        this._actionDone(Cr.NS_ERROR_FAILURE);
        return;
      }
      if (action == 2) {
        // 'New password' button pressed.
        this._authenticator.forgetPassword();
      }

      // Retry.
      this._nextAuthMethod = this._possibleAuthMethods[0];
      this._actionAuth();
      return;
    }
    this._logger.error("Authentication failed.");
    this._actionDone(Cr.NS_ERROR_FAILURE);
  };

  /**
   * Returns the saved/cached server password, or show a password dialog. If the
   * user cancels the dialog, stop the process.
   * @returns {string} The server password.
   */
  async _getPassword() {
    try {
      let password = await this._authenticator.getPassword();
      return password;
    } catch (e) {
      if (e.result == Cr.NS_ERROR_ABORT) {
        this._actionDone(e.result);
      }
      throw e;
    }
  }

  /**
   * The second step of PLAIN auth. Send the auth token to the server.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionAuthPlain = async res => {
    this._nextAction = this._actionAuthResponse;
    this._send(await this._authenticator.getPlainToken(), true);
  };

  /**
   * The second step of LOGIN auth. Send the username to the server.
   * @param {ImapResponse} res - The server response.
   */
  _actionAuthLoginUser = res => {
    this._nextAction = this._actionAuthLoginPass;
    this._send(btoa(this._authenticator.username), true);
  };

  /**
   * The third step of LOGIN auth. Send the password to the server.
   * @param {ImapResponse} res - The server response.
   */
  _actionAuthLoginPass = async res => {
    this._nextAction = this._actionAuthResponse;
    let password = MailStringUtils.stringToByteString(
      await this._getPassword()
    );
    this._send(btoa(password), true);
  };

  /**
   * The second step of CRAM-MD5 auth, send a HMAC-MD5 signature to the server.
   * @param {ImapResponse} res - The server response.
   */
  _actionAuthCramMd5 = async res => {
    this._nextAction = this._actionAuthResponse;
    let password = await this._getPassword();
    this._send(
      this._authenticator.getCramMd5Token(password, res.statusText),
      true
    );
  };

  /**
   * The second and next step of GSSAPI auth.
   * @param {ImapResponse} res - The server response.
   */
  _actionAuthGssapi = res => {
    if (res.tag != "+") {
      this._actionAuthResponse(res);
      return;
    }

    // Server returns a challenge, we send a new token. Can happen multiple times.
    let token;
    try {
      token = this._authenticator.getNextGssapiToken(res.statusText);
    } catch (e) {
      this._logger.error(e);
      this._actionAuthResponse(res);
      return;
    }
    this._send(token, true);
  };

  /**
   * The second and next step of NTLM auth.
   * @param {ImapResponse} res - The server response.
   */
  _actionAuthNtlm = res => {
    if (res.tag != "+") {
      this._actionAuthResponse(res);
      return;
    }

    // Server returns a challenge, we send a new token. Can happen multiple times.
    let token;
    try {
      token = this._authenticator.getNextNtlmToken(res.statusText);
    } catch (e) {
      this._logger.error(e);
      this._actionAuthResponse(res);
      return;
    }
    this._send(token, true);
  };

  /**
   * Execute an action with a folder selected.
   * @param {nsIMsgFolder} folder - The folder to select.
   * @param {function} actionInFolder - The action to execute.
   */
  _actionFolderCommand(folder, actionInFolder) {
    if (this.folder == folder) {
      // If already in the folder, execute the action now.
      actionInFolder();
    } else {
      // Send the SELECT command and queue the action.
      this.folder = folder;
      this._actionAfterSelectFolder = actionInFolder;
      this._nextAction = this._actionSelectResponse;
      this._sendTagged(`SELECT "${this._getServerFolderName(folder)}"`);
    }
  }

  /**
   * Send LSUB or LIST command depending on the server capabilities.
   */
  _actionListOrLsub() {
    this._nextAction = this._actionListResponse();
    let command = this._capabilities.includes("LIST-EXTENDED")
      ? "LIST (SUBSCRIBED)" // rfc5258
      : "LSUB";
    command += ' "" "*"';
    if (this._capabilities.includes("SPECIAL-USE")) {
      command += " RETURN (SPECIAL-USE)"; // rfc6154
    }
    this._sendTagged(command);
    this._listInboxSent = false;
  }

  /**
   * Handle LIST response.
   * @param {Function} actionAfterResponse - A callback after handling the response.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionListResponse = (
    actionAfterResponse = this._actionFinishFolderDiscovery
  ) => res => {
    if (!this._hasInbox) {
      this._hasInbox = res.mailboxes.some(
        mailbox => mailbox.flags & ImapUtils.FLAG_IMAP_INBOX
      );
    }
    for (let mailbox of res.mailboxes) {
      this._serverSink.possibleImapMailbox(
        mailbox.name,
        mailbox.delimiter,
        mailbox.flags
      );
    }

    actionAfterResponse();
  };

  /**
   * Send LIST command.
   * @param {string} folderName - The name of the folder to list.
   * @param {Function} actionAfterResponse - A callback after handling the response.
   */
  _actionList(folderName, actionAfterResponse) {
    this._nextAction = this._actionListResponse(actionAfterResponse);
    this._sendTagged(`LIST "" "${folderName}"`);
  }

  /**
   * Finish folder discovery after checking Inbox and Trash folders.
   */
  _actionFinishFolderDiscovery = () => {
    if (!this._hasInbox && !this._listInboxSent) {
      this._actionList("Inbox");
      this._listInboxSent = true;
      return;
    }
    if (!this._hasTrash && !this._listTrashSent) {
      this._actionCreateTrashFolderIfNeeded();
      return;
    }
    this._serverSink.discoveryDone();
    this._actionDone();
  };

  /**
   * If Trash folder is not found on server, create one and subscribe to it.
   */
  _actionCreateTrashFolderIfNeeded() {
    let trashFolderName = this._server.trashFolderName;
    this._actionList(trashFolderName, () => {
      if (this._hasTrash) {
        // Trash folder exists.
        this._actionFinishFolderDiscovery();
      } else {
        // Trash folder doesn't exist, create one and subscribe to it.
        this._nextAction = res => {
          this._actionList(trashFolderName, () => {
            // After subscribing, finish folder discovery.
            this._nextAction = this._actionFinishFolderDiscovery;
            this._sendTagged(`SUBSCRIBE "${trashFolderName}"`);
          });
        };
        this._sendTagged(`CREATE "${trashFolderName}"`);
      }
    });
    this._listTrashSent = true;
  }

  /**
   * Create and subscribe to a folder.
   * @param {string} folderName - The folder name.
   * @param {Function} callbackAfterSubscribe - The action after the subscribe
   *   command.
   */
  _actionCreateAndSubscribe(folderName, callbackAfterSubscribe) {
    this._nextAction = res => {
      this._actionList(folderName, () => {
        this._nextAction = callbackAfterSubscribe;
        this._sendTagged(`SUBSCRIBE "${folderName}"`);
      });
    };
    this._sendTagged(`CREATE "${folderName}"`);
  }

  /**
   * Handle SELECT response.
   */
  _actionSelectResponse(res) {
    this._supportedFlags = res.permanentflags || res.flags;
    this._folderState = res;
    this._actionAfterSelectFolder();
  }

  /**
   * Handle RENAME response. Three steps are involved.
   * @param {string} oldName - The old folder name.
   * @param {string} newName - The new folder name.
   * @param {ImapResponse} res - The server response.
   */
  _actionRenameResponse = (oldName, newName) => res => {
    // Step 3: Rename the local folder and send LIST command to re-sync folders.
    let actionAfterUnsubscribe = () => {
      this._serverSink.onlineFolderRename(this._msgWindow, oldName, newName);
      this._actionListOrLsub();
    };
    // Step 2: unsubscribe to the oldName.
    this._nextAction = () => {
      this._nextAction = actionAfterUnsubscribe;
      this._sendTagged(`UNSUBSCRIBE "${oldName}"`);
    };
    // Step 1: subscribe to the newName.
    this._sendTagged(`SUBSCRIBE "${newName}"`);
  };

  /**
   * Send UID FETCH request to the server.
   */
  _actionUidFetch() {
    this._nextAction = this._actionUidFetchResponse;
    this._sendTagged("UID FETCH 1:* (FLAGS)");
  }

  /**
   * Handle UID FETCH response.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionUidFetchResponse(res) {
    let outFolderInfo = {};
    this.folder.getDBFolderInfoAndDB(outFolderInfo);
    let highestUid = outFolderInfo.value.getUint32Property(
      "highestRecordedUID",
      0
    );
    for (let msg of res.messages) {
      this._messageUids[msg.sequence] = msg.uid;
      this._messages.set(msg.uid, msg);
      this.folder
        .QueryInterface(Ci.nsIImapMessageSink)
        .notifyMessageFlags(
          msg.flags,
          msg.keywords,
          msg.uid,
          this._folderState.highestmodseq
        );
    }
    this._folderSink = this.folder.QueryInterface(Ci.nsIImapMailFolderSink);
    this._folderSink.UpdateImapMailboxInfo(this, this._getMailboxSpec());
    let latestUid = this._messageUids.at(-1);
    if (latestUid > highestUid) {
      let extraItems = "";
      if (this._server.isGMailServer) {
        extraItems += "X-GM-MSGID X-GM-THRID X-GM-LABELS ";
      }
      this._nextAction = this._actionUidFetchHeaderResponse;
      this._sendTagged(
        `UID FETCH ${highestUid +
          1}:${latestUid} (UID ${extraItems}RFC822.SIZE FLAGS BODY.PEEK[HEADER])`
      );
    } else {
      this._folderSink.headerFetchCompleted(this);
      if (this._bodysToDownload.length) {
        let uids = this._bodysToDownload.join(",");
        this._nextAction = this._actionUidFetchBodyResponse;
        this._sendTagged(
          `UID FETCH ${uids} (UID RFC822.SIZE FLAGS BODY.PEEK[])`
        );
        return;
      }
      this._actionDone();
    }
  }

  /**
   * Make an nsIMailboxSpec instance to interact with nsIImapMailFolderSink.
   * @returns {nsIMailboxSpec}
   */
  _getMailboxSpec() {
    return {
      QueryInterface: ChromeUtils.generateQI(["nsIMailboxSpec"]),
      folder_UIDVALIDITY: this._folderState.uidvalidity,
      box_flags: this._folderState.flags,
      supportedUserFlags: this._folderState.supportedUserFlags,
      nextUID: this._folderState.attributes.uidnext,
      numMessages: this._messages.size,
      numUnseenMessages: this._folderState.attributes.unseen,
      flagState: this.flagAndUidState,
    };
  }

  /**
   * Handle UID FETCH BODY.PEEK[HEADER] response.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionUidFetchHeaderResponse(res) {
    this._msgSink = this.folder.QueryInterface(Ci.nsIImapMessageSink);
    this._folderSink = this.folder.QueryInterface(Ci.nsIImapMailFolderSink);
    for (let msg of res.messages) {
      this._messageUids[msg.sequence] = msg.uid;
      this._messages.set(msg.uid, msg);
      this._folderSink.StartMessage(this.runningUrl);
      let hdrXferInfo = {
        numHeaders: 1,
        getHeader() {
          return {
            msgUid: msg.uid,
            msgSize: msg.size,
            get msgHdrs() {
              let sepIndex = msg.body.indexOf("\r\n\r\n");
              return sepIndex == -1
                ? msg.body + "\r\n"
                : msg.body.slice(0, sepIndex + 2);
            },
          };
        },
      };
      this._folderSink.parseMsgHdrs(this, hdrXferInfo);
      this.onData?.(msg.body);
    }
    this._folderSink.headerFetchCompleted(this);
    if (this._bodysToDownload.length) {
      // nsImapMailFolder decides to fetch the full body by calling
      // NotifyBodysToDownload.
      let uids = this._bodysToDownload.join(",");
      this._nextAction = this._actionUidFetchBodyResponse;
      this._sendTagged(`UID FETCH ${uids} (UID RFC822.SIZE FLAGS BODY.PEEK[])`);
      return;
    }
    this._actionDone();
  }

  /**
   * Handle UID FETCH BODY response.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionUidFetchBodyResponse(res) {
    this._msgSink = this.folder.QueryInterface(Ci.nsIImapMessageSink);
    this._folderSink = this.folder.QueryInterface(Ci.nsIImapMailFolderSink);
    for (let msg of res.messages) {
      let shouldStoreMsgOffline = false;
      try {
        shouldStoreMsgOffline = this.folder.shouldStoreMsgOffline(msg.uid);
      } catch (e) {}
      if (
        shouldStoreMsgOffline ||
        this.runningUrl.QueryInterface(Ci.nsIImapUrl).storeResultsOffline
      ) {
        this._folderSink.StartMessage(this.runningUrl);
        this._msgSink.parseAdoptedMsgLine(msg.body, msg.uid, this.runningUrl);
        this._msgSink.normalEndMsgWriteStream(
          msg.uid,
          true,
          this.runningUrl,
          msg.body.length
        );
        this._folderSink.EndMessage(this.runningUrl, msg.uid);
      }
      this.onData?.(msg.body);
    }
    this._folderSink.headerFetchCompleted(this);
    this._actionDone();
  }

  /**
   * Send NOOP command.
   */
  _actionNoop() {
    this._nextAction = this._actionNoopResponse;
    this._sendTagged("NOOP");
  }

  /**
   * Handle NOOP response.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionNoopResponse(res) {
    for (let msg of res.messages) {
      // Handle message flag changes.
      let uid = this._messageUids[msg.sequence];
      this.folder
        .QueryInterface(Ci.nsIImapMessageSink)
        .notifyMessageFlags(
          msg.flags,
          msg.keywords,
          uid,
          this._folderState.highestmodseq
        );
    }
    if (
      (res.exists && res.exists != this._folderState.exists) ||
      res.expunged.length
    ) {
      // Handle messages number changes, re-sync the folder.
      this._folderState.exists = res.exists;
      this._actionAfterSelectFolder = this._actionUidFetch;
      this._nextAction = this._actionSelectResponse;
      this._sendTagged(`SELECT "${this.folder.name}"`);
    } else if (res.messages.length || res.exists) {
      let outFolderInfo = {};
      this.folder.getDBFolderInfoAndDB(outFolderInfo);
      let highestUid = outFolderInfo.value.getUint32Property(
        "highestRecordedUID",
        0
      );
      this._nextAction = this._actionUidFetchResponse;
      this._sendTagged(`UID FETCH ${highestUid + 1}:* (FLAGS)`);
    } else {
      if (!res.exists) {
        this._messageUids = [];
        this._messages.clear();
      }
      this.folder
        .QueryInterface(Ci.nsIImapMailFolderSink)
        .UpdateImapMailboxInfo(this, this._getMailboxSpec());
      this._actionDone();
    }
  }

  /**
   * Show an error prompt.
   * @param {string} errorName - An error name corresponds to an entry of
   *   imapMsgs.properties.
   */
  _actionError(errorName) {
    if (!this._msgWindow) {
      return;
    }
    let bundle = Services.strings.createBundle(
      "chrome://messenger/locale/imapMsgs.properties"
    );
    let errorMsg = bundle.formatStringFromName(errorName, [
      this._server.hostName,
    ]);
    this._msgWindow.promptDialog.alert(null, errorMsg);
  }

  /**
   * Finish a request and do necessary cleanup.
   */
  _actionDone = (status = Cr.NS_OK) => {
    this._logger.debug(`Done with status=${status}`);
    this._nextAction = null;
    this._urlListener?.OnStopRunningUrl(this.runningUrl, status);
    this.runningUrl.SetUrlState(false, status);
    this.onDone?.(status);
    this._reset();
    // Tell ImapIncomingServer this client can be reused now.
    this.onFree?.();
  };

  /** @see nsIImapProtocol */
  NotifyBodysToDownload(keys) {
    this._logger.debug("NotifyBodysToDownload", keys);
    this._bodysToDownload = keys;
  }

  GetRunningUrl() {
    this._logger.debug("GetRunningUrl");
  }

  get flagAndUidState() {
    // The server sequence is 1 based, nsIImapFlagAndUidState sequence is 0 based.
    let getUidOfMessage = index => this._messageUids[index + 1];
    let getMessageFlagsByUid = uid => this._messages.get(uid)?.flags;

    return {
      QueryInterface: ChromeUtils.generateQI(["nsIImapFlagAndUidState"]),
      numberOfMessages: this._messages.size,
      getUidOfMessage,
      getMessageFlags: index => getMessageFlagsByUid(getUidOfMessage(index)),
      hasMessage: uid => this._messages.has(uid),
      getMessageFlagsByUid,
      getCustomFlags: uid => this._messages.get(uid)?.keywords,
      getCustomAttribute: (uid, name) => {
        let value = this._messages.get(uid)?.customAttributes[name];
        return Array.isArray(value) ? value.join(" ") : value;
      },
    };
  }
}
