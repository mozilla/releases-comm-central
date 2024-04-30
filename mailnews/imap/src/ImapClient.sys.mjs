/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

import { clearTimeout, setTimeout } from "resource://gre/modules/Timer.sys.mjs";
import { MailStringUtils } from "resource:///modules/MailStringUtils.sys.mjs";
import { ImapAuthenticator } from "resource:///modules/MailAuthenticator.sys.mjs";
import { ImapResponse } from "resource:///modules/ImapResponse.sys.mjs";
import { ImapUtils } from "resource:///modules/ImapUtils.sys.mjs";

// There can be multiple ImapClient running concurrently, assign each logger a
// unique prefix.
let loggerInstanceId = 0;

const PR_UINT32_MAX = 0xffffffff;

/**
 * A class to interact with IMAP server.
 */
export class ImapClient {
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
   * @type {boolean} - Whether the socket is open.
   */
  get isOnline() {
    return this._socket?.readyState == "open";
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

    this._actionAfterDiscoverAllFolders = null;
    this.channel = null;
    this._urlListener = null;
    this._msgWindow = null;
    this._authenticating = false;
    this.verifyLogon = false;
    this._idling = false;
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  /**
   * Initiate a connection to the server
   */
  connect() {
    if (this.isOnline) {
      // Reuse the connection.
      this.onReady();
      this._setSocketTimeout(this._prefs.tcpTimeout);
    } else {
      const hostname = this._server.hostName.toLowerCase();
      this._logger.debug(`Connecting to ${hostname}:${this._server.port}`);
      this._greeted = false;
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
   * Set socket timeout in seconds.
   *
   * @param {number} timeout - The timeout in seconds.
   */
  _setSocketTimeout(timeout) {
    this._socket.transport?.setTimeout(
      Ci.nsISocketTransport.TIMEOUT_READ_WRITE,
      timeout
    );
  }

  /**
   * Construct an nsIMsgMailNewsUrl instance, setup urlListener to notify when
   * the current request is finished.
   *
   * @param {nsIUrlListener} urlListener - Callback for the request.
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   * @param {nsIMsgMailNewsUrl} [runningUri] - The url to run, if provided.
   * @returns {nsIMsgMailNewsUrl}
   */
  startRunningUrl(urlListener, msgWindow, runningUri) {
    this._urlListener = urlListener;
    this._msgWindow = msgWindow;
    this.runningUri = runningUri;
    if (!this.runningUri) {
      this.runningUri = Services.io.newURI(
        `imap://${this._server.hostName}:${this._server.port}`
      );
    }
    this._urlListener?.OnStartRunningUrl(this.runningUri, Cr.NS_OK);
    this.runningUri
      .QueryInterface(Ci.nsIMsgMailNewsUrl)
      .SetUrlState(true, Cr.NS_OK);
    return this.runningUri;
  }

  /**
   * Discover all folders if the current server hasn't already discovered.
   */
  _discoverAllFoldersIfNecessary = () => {
    if (this._server.hasDiscoveredFolders) {
      this.onReady();
      return;
    }
    this._actionAfterDiscoverAllFolders = this.onReady;
    this.discoverAllFolders(this._server.rootFolder);
  };

  /**
   * Discover all folders.
   *
   * @param {nsIMsgFolder} folder - The associated folder.
   */
  discoverAllFolders(folder) {
    this._logger.debug("discoverAllFolders", folder.URI);

    const handleListResponse = res => {
      this._hasTrash = res.mailboxes.some(
        mailbox => mailbox.flags & ImapUtils.FLAG_IMAP_TRASH
      );
      if (!this._hasTrash) {
        const trashFolderName = this._server.trashFolderName.toLowerCase();
        const trashMailbox = res.mailboxes.find(
          mailbox => mailbox.name.toLowerCase() == trashFolderName
        );
        if (trashMailbox) {
          this._hasTrash = true;
          trashMailbox.flags |= ImapUtils.FLAG_IMAP_TRASH;
        }
      }
      for (const mailbox of res.mailboxes) {
        this._serverSink.possibleImapMailbox(
          mailbox.name.replaceAll(mailbox.delimiter, "/"),
          mailbox.delimiter,
          mailbox.flags
        );
      }
    };

    if (this._capabilities.includes("LIST-EXTENDED")) {
      this._nextAction = res => {
        handleListResponse(res);
        this._actionFinishFolderDiscovery();
      };
      let command = 'LIST (SUBSCRIBED) "" "*"';
      if (this._capabilities.includes("SPECIAL-USE")) {
        command += " RETURN (SPECIAL-USE)"; // rfc6154
      }
      this._sendTagged(command);
      return;
    }

    this._nextAction = res => {
      this._nextAction = res2 => {
        // Per rfc3501#section-6.3.9, if LSUB returns different flags from LIST,
        // use the LIST responses.
        for (const mailbox of res2.mailboxes) {
          const mailboxFromList = res.mailboxes.find(
            x => x.name == mailbox.name
          );
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
    let command = 'LIST "" "*"';
    if (this._capabilities.includes("SPECIAL-USE")) {
      command += " RETURN (SPECIAL-USE)"; // rfc6154
    }
    this._sendTagged(command);
  }

  /**
   * Discover all folders for the subscribe dialog.
   *
   * @param {nsIMsgFolder} folder - The associated folder.
   */
  discoverAllAndSubscribedFolders(folder) {
    this._logger.debug("discoverAllAndSubscribedFolders", folder.URI);
    const handleListResponse = res => {
      for (const mailbox of res.mailboxes) {
        this._serverSink.possibleImapMailbox(
          mailbox.name.replaceAll(mailbox.delimiter, "/"),
          mailbox.delimiter,
          mailbox.flags
        );
      }
    };

    this._nextAction = res => {
      handleListResponse(res);
      this._server.doingLsub = false;
      this._nextAction = res2 => {
        // Per rfc3501#section-6.3.9, if LSUB returns different flags from LIST,
        // use the LIST responses.
        for (const mailbox of res2.mailboxes) {
          const mailboxFromList = res.mailboxes.find(
            x => x.name == mailbox.name
          );
          if (
            mailboxFromList?.flags &&
            mailboxFromList?.flags != mailbox.flags
          ) {
            mailbox.flags = mailboxFromList.flags;
          }
        }
        handleListResponse(res2);
        this._actionDone();
      };
      this._sendTagged('LIST "" "*"');
    };
    this._sendTagged('LSUB "" "*"');
    this._server.doingLsub = true;
  }

  /**
   * Select a folder.
   *
   * @param {nsIMsgFolder} folder - The folder to select.
   */
  selectFolder(folder) {
    this._logger.debug("selectFolder", folder.URI);
    if (this.folder == folder) {
      this._actionNoop();
      return;
    }
    this._actionAfterSelectFolder = this._actionUidFetch;
    this._nextAction = this._actionSelectResponse(folder);
    this._sendTagged(`SELECT "${this._getServerFolderName(folder)}"`);
  }

  /**
   * Rename a folder.
   *
   * @param {nsIMsgFolder} folder - The folder to rename.
   * @param {string} newName - The new folder name.
   */
  renameFolder(folder, newName) {
    this._logger.debug("renameFolder", folder.URI, newName);
    const delimiter =
      folder.QueryInterface(Ci.nsIMsgImapMailFolder).hierarchyDelimiter || "/";
    const names = this._getAncestorFolderNames(folder);
    const oldName = this._getServerFolderName(folder);
    newName = this._encodeMailboxName([...names, newName].join(delimiter));

    this._nextAction = this._actionRenameResponse(oldName, newName);
    this._sendTagged(`RENAME "${oldName}" "${newName}"`);
  }

  /**
   * Move a source folder to be a child of another folder.
   *
   * @param {nsIMsgFolder} srcFolder - The source folder to move.
   * @param {nsIMsgFolder} dstFolder - The target parent folder.
   */
  moveFolder(srcFolder, dstFolder) {
    this._logger.debug("moveFolder", srcFolder.URI, dstFolder.URI);
    const oldName = this._getServerFolderName(srcFolder);
    const newName = this._getServerSubFolderName(dstFolder, srcFolder.name);
    this._nextAction = this._actionRenameResponse(oldName, newName, true);
    this._sendTagged(`RENAME "${oldName}" "${newName}"`);
  }

  /**
   * Send LIST command for a folder.
   *
   * @param {nsIMsgFolder} folder - The folder to list.
   */
  listFolder(folder) {
    this._logger.debug("listFolder", folder.URI);
    this._actionList(this._getServerFolderName(folder), () => {
      this._actionDone();
    });
  }

  /**
   * Send DELETE command for a folder and all subfolders.
   *
   * @param {nsIMsgFolder} folder - The folder to delete.
   */
  deleteFolder(folder) {
    this._logger.debug("deleteFolder", folder.URI);
    this._nextAction = res => {
      // Leaves have longer names than parent mailbox, sort them by the name
      // length, so that leaf mailbox will be deleted first.
      const mailboxes = res.mailboxes.sort(
        (x, y) => y.name.length - x.name.length
      );
      const selfName = this._getServerFolderName(folder);
      let selfIncluded = false;
      this._nextAction = () => {
        const mailbox = mailboxes.shift();
        if (mailbox) {
          this._sendTagged(`DELETE "${mailbox.name}"`);
          if (!selfIncluded && selfName == mailbox.name) {
            selfIncluded = true;
          }
        } else if (!selfIncluded) {
          this._nextAction = () => this._actionDone();
          this._sendTagged(`DELETE "${this._getServerFolderName(folder)}"`);
        } else {
          this._actionDone();
        }
      };
      this._nextAction();
    };
    this._sendTagged(`LIST "" "${this._getServerFolderName(folder)}"`);
  }

  /**
   * Ensure a folder exists on the server. Create one if not already exists.
   *
   * @param {nsIMsgFolder} parent - The parent folder to check.
   * @param {string} folderName - The folder name.
   */
  ensureFolderExists(parent, folderName) {
    this._logger.debug("ensureFolderExists", parent.URI, folderName);
    const mailboxName = this._getServerSubFolderName(parent, folderName);
    this._nextAction = res => {
      if (res.mailboxes.length) {
        // Already exists.
        this._actionDone();
        return;
      }
      // Create one and subscribe to it.
      this._actionCreateAndSubscribe(mailboxName, () => {
        this._actionList(mailboxName, () => this._actionDone());
      });
    };
    this._sendTagged(`LIST "" "${mailboxName}"`);
  }

  /**
   * Create a folder on the server.
   *
   * @param {nsIMsgFolder} parent - The parent folder to check.
   * @param {string} folderName - The folder name.
   */
  createFolder(parent, folderName) {
    this._logger.debug("createFolder", parent.URI, folderName);
    const mailboxName = this._getServerSubFolderName(parent, folderName);
    this._actionCreateAndSubscribe(mailboxName, () => {
      this._actionList(mailboxName, () => this._actionDone());
    });
  }

  /**
   * Subscribe a folder.
   *
   * @param {nsIMsgFolder} folder - The folder to subscribe.
   * @param {string} folderName - The folder name.
   */
  subscribeFolder(folder, folderName) {
    this._logger.debug("subscribeFolder", folder.URI, folderName);
    this._nextAction = () => this._server.performExpand();
    this._sendTagged(`SUBSCRIBE "${folderName}"`);
  }

  /**
   * Unsubscribe a folder.
   *
   * @param {nsIMsgFolder} folder - The folder to unsubscribe.
   * @param {string} folderName - The folder name.
   */
  unsubscribeFolder(folder, folderName) {
    this._logger.debug("unsubscribeFolder", folder.URI, folderName);
    this._nextAction = () => this._server.performExpand();
    this._sendTagged(`UNSUBSCRIBE "${folderName}"`);
  }

  /**
   * Fetch the attribute of messages.
   *
   * @param {nsIMsgFolder} folder - The folder to check.
   * @param {string} uids - The message uids.
   * @param {string} attribute - The message attribute to fetch
   */
  fetchMsgAttribute(folder, uids, attribute) {
    this._logger.debug("fetchMsgAttribute", folder.URI, uids, attribute);
    this._nextAction = res => {
      if (res.done) {
        const resultAttributes = res.messages
          .map(m => m.customAttributes[attribute])
          .flat();
        this.runningUri.QueryInterface(Ci.nsIImapUrl).customAttributeResult =
          resultAttributes.length > 1
            ? `(${resultAttributes.join(" ")})`
            : resultAttributes[0];
        this._actionDone();
      }
    };
    this._sendTagged(`UID FETCH ${uids} (${attribute})`);
  }

  /**
   * Delete all the messages in a folder.
   *
   * @param {nsIMsgFolder} folder - The folder to delete messages.
   */
  deleteAllMessages(folder) {
    this._logger.debug("deleteAllMessages", folder.URI);
    this._actionInFolder(folder, () => {
      if (!this._messages.size) {
        this._actionDone();
        return;
      }

      this._nextAction = () => this.expunge(folder);
      this._sendTagged("UID STORE 1:* +FLAGS.SILENT (\\Deleted)");
    });
  }

  /**
   * Search in a folder.
   *
   * @param {nsIMsgFolder} folder - The folder to delete messages.
   * @param {string} searchCommand - The SEARCH command together with the search
   *   criteria.
   */
  search(folder, searchCommand) {
    this._logger.debug("search", folder.URI);
    this._actionInFolder(folder, () => {
      this._nextAction = res => {
        this.onData(res.search);
        this._actionDone();
      };
      this._sendTagged(`UID ${searchCommand}`);
    });
  }

  /**
   * Get the names of all ancestor folders. For example,
   *   folder a/b/c will return ['a', 'b'].
   *
   * @param {nsIMsgFolder} folder - The input folder.
   * @returns {string[]}
   */
  _getAncestorFolderNames(folder) {
    const matches = /imap:\/\/[^/]+\/(.+)/.exec(folder.URI);
    return matches[1].split("/").slice(0, -1);
  }

  /**
   * When UTF8 is enabled, use the name directly. Otherwise, encode to mUTF-7.
   *
   * @param {string} name - The mailbox name.
   */
  _encodeMailboxName(name) {
    return this._utf8Enabled ? name : this._charsetManager.unicodeToMutf7(name);
  }

  /**
   * Get the server name of a msg folder.
   *
   * @param {nsIMsgFolder} folder - The input folder.
   * @returns {string}
   */
  _getServerFolderName(folder) {
    if (folder.isServer) {
      return "";
    }

    if (folder.onlineName) {
      return folder.onlineName.replaceAll('"', '\\"');
    }
    const delimiter =
      folder.QueryInterface(Ci.nsIMsgImapMailFolder).hierarchyDelimiter || "/";
    const names = this._getAncestorFolderNames(folder);
    return this._encodeMailboxName(
      [...names, folder.name].join(delimiter)
    ).replaceAll('"', '\\"');
  }

  /**
   * Get the server name of a sub folder. The sub folder may or may not exist on
   * the server.
   *
   * @param {nsIMsgFolder} parent - The parent folder.
   * @param {string} folderName - The sub folder name.
   * @returns {string}
   */
  _getServerSubFolderName(parent, folderName) {
    folderName = this._encodeMailboxName(folderName);
    const mailboxName = this._getServerFolderName(parent);
    if (mailboxName) {
      let delimiter = parent.QueryInterface(
        Ci.nsIMsgImapMailFolder
      ).hierarchyDelimiter;
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
   *
   * @param {nsIMsgFolder} folder - The associated folder.
   * @param {number} uid - The message uid.
   * @param {number} [size] - The body size to fetch.
   */
  fetchMessage(folder, uid, size) {
    this._logger.debug(`fetchMessage folder=${folder.name} uid=${uid}`);
    if (folder.hasMsgOffline(uid, null, 10)) {
      this.onDone = () => {};
      this.channel?.readFromLocalCache();
      this._actionDone();
      return;
    }
    this._actionInFolder(folder, () => {
      this._nextAction = this._actionUidFetchBodyResponse;
      let command;
      if (size) {
        command = `UID FETCH ${uid} (UID RFC822.SIZE FLAGS BODY.PEEK[HEADER.FIELDS (Content-Type Content-Transfer-Encoding)] BODY.PEEK[TEXT]<0.${size}>)`;
      } else {
        command = `UID FETCH ${uid} (UID RFC822.SIZE FLAGS BODY.PEEK[])`;
      }
      this._sendTagged(command);
    });
  }

  /**
   * Add, remove or replace flags of specified messages.
   *
   * @param {string} action - "+" means add, "-" means remove, "" means replace.
   * @param {nsIMsgFolder} folder - The target folder.
   * @param {string} messageIds - Message UIDs, e.g. "23,30:33".
   * @param {number} flags - The internal flags number to update.
   */
  updateMessageFlags(action, folder, messageIds, flags) {
    this._actionInFolder(folder, () => {
      this._nextAction = () => this._actionDone();
      // _supportedFlags is available after _actionSelectResponse.
      const flagsStr = ImapUtils.flagsToString(flags, this._supportedFlags);
      this._sendTagged(`UID STORE ${messageIds} ${action}FLAGS (${flagsStr})`);
    });
  }

  /**
   * Send EXPUNGE command to a folder.
   *
   * @param {nsIMsgFolder} folder - The associated folder.
   */
  expunge(folder) {
    this._actionInFolder(folder, () => {
      this._nextAction = () => this._actionDone();
      this._sendTagged("EXPUNGE");
    });
  }

  /**
   * Move or copy messages from a folder to another folder.
   *
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
    this._actionInFolder(folder, () => {
      this._nextAction = this._actionNoopResponse;
      this._sendTagged(command);
    });
  }

  /**
   * Upload a message file to a folder.
   *
   * @param {nsIFile} file - The message file to upload.
   * @param {nsIMsgFolder} dstFolder - The target folder.
   * @param {nsImapMailCopyState} copyState - A state used by nsImapMailFolder.
   * @param {boolean} isDraft - Is the uploaded file a draft.
   */
  async uploadMessageFromFile(file, dstFolder, copyState, isDraft) {
    this._logger.debug("uploadMessageFromFile", file.path, dstFolder.URI);
    const mailbox = this._getServerFolderName(dstFolder);
    const content = MailStringUtils.uint8ArrayToByteString(
      await IOUtils.read(file.path)
    );
    this._nextAction = res => {
      if (res.tag != "+") {
        this._actionDone(Cr.NS_ERROR_FAILURE);
        return;
      }
      this._nextAction = res => {
        this._folderSink = dstFolder.QueryInterface(Ci.nsIImapMailFolderSink);
        if (
          // See rfc4315.
          this._capabilities.includes("UIDPLUS") &&
          res.attributes.appenduid
        ) {
          // The response is like `<tag> OK [APPENDUID <uidvalidity> <uid>]`.
          this._folderSink.setAppendMsgUid(
            res.attributes.appenduid[1],
            this.runningUri
          );
        }
        this._actionDone();
        if (res.exists) {
          // FIXME: _actionNoopResponse should be enough here, but it breaks
          // test_imapAttachmentSaves.js.
          this.folder = null;
        }
        try {
          this._folderSink.copyNextStreamMessage(true, copyState);
        } catch (e) {
          this._logger.warn("copyNextStreamMessage failed", e);
        }
      };
      this._send(content + (this._utf8Enabled ? ")" : ""));
    };
    const outKeywords = {};
    const flags = dstFolder
      .QueryInterface(Ci.nsIImapMessageSink)
      .getCurMoveCopyMessageInfo(this.runningUri, {}, outKeywords);
    let flagString = ImapUtils.flagsToString(flags, this._supportedFlags);
    if (isDraft && !/\b\Draft\b/.test(flagString)) {
      flagString += " \\Draft";
    }
    if (outKeywords.value) {
      flagString += " " + outKeywords.value;
    }
    const open = this._utf8Enabled ? "UTF8 (~{" : "{";
    const command = `APPEND "${mailbox}" (${flagString.trim()}) ${open}${
      content.length
    }}`;
    this._sendTagged(command);
  }

  /**
   * Check the status of a folder.
   *
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
   *
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
    const subtractFlags = () => {
      if (flagsToSubtract) {
        this._nextAction = () => {
          this._actionDone();
        };
        this._sendTagged(`UID STORE ${uids} -FLAGS (${flagsToSubtract})`);
      } else {
        this._actionDone();
      }
    };
    this._actionInFolder(folder, () => {
      if (flagsToAdd) {
        this._nextAction = () => {
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
   *
   * @param {nsIMsgFolder} folder - The folder of the messages.
   * @param {string[]} uids - The message uids.
   */
  getHeaders(folder, uids) {
    this._logger.debug("getHeaders", folder.URI, uids);
    this._actionInFolder(folder, () => {
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
    if (!this.folder) {
      this._actionDone();
      return;
    }
    this._nextAction = res => {
      if (res.tag == "*") {
        this.folder.performingBiff = true;
        this._actionNoopResponse(res);
      }
    };
    this._sendTagged("IDLE");
    this._setSocketTimeout(PR_UINT32_MAX);
    this._idling = true;
    this._idleTimer = setTimeout(() => {
      this.endIdle(() => {
        this._actionNoop();
      });
      // Per rfc2177, should terminate the IDLE and re-issue it at least every
      // 29 minutes. But in practice many servers timeout before that. A noop
      // every 5min is better than timeout.
    }, 5 * 60 * 1000);
    this._logger.debug(`Idling in ${this.folder.URI}`);
  }

  /**
   * Send DONE to end the IDLE command.
   *
   * @param {Function} nextAction - Callback function after IDLE is ended.
   */
  endIdle(nextAction) {
    this._nextAction = res => {
      if (res.status == "OK") {
        nextAction();
      }
    };
    this._send("DONE");
    this._idling = false;
    this.busy = true;
    clearTimeout(this._idleTimer);
    this._idleTimer = null;
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
    this._nextAction = res => {
      this._greeted = true;
      this._actionCapabilityResponse(res);
    };

    this._setSocketTimeout(this._prefs.tcpTimeout);
  };

  /**
   * The data event handler.
   *
   * @param {TCPSocketEvent} event - The data event.
   */
  _onData = async event => {
    // Without this, some tests are blocked waiting for response from Maild.sys.mjs.
    // Don't know the real cause, but possibly because ImapClient and Maild runs
    // on the same process. We also have this in Pop3Client.
    await new Promise(resolve => setTimeout(resolve));

    const stringPayload = this._utf8Enabled
      ? new TextDecoder().decode(event.data)
      : MailStringUtils.uint8ArrayToByteString(new Uint8Array(event.data));
    this._logger.debug(`S: ${stringPayload}`);
    if (!this._response || this._idling || this._response.done) {
      this._response = new ImapResponse();
      this._response.onMessage = this._onMessage;
    }
    this._response.parse(stringPayload);
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
    if (!this._greeted || this._idling || this._response.done) {
      this._nextAction?.(this._response);
    }
  };

  /**
   * The error event handler.
   *
   * @param {TCPSocketErrorEvent} event - The error event.
   */
  _onError = async event => {
    this._logger.error(`${event.name}: a ${event.message} error occurred`);
    if (event.errorCode == Cr.NS_ERROR_NET_TIMEOUT) {
      this._actionError("imapNetTimeoutError");
      this._actionDone(event.errorCode);
      return;
    }

    const secInfo =
      await event.target.transport?.tlsSocketControl?.asyncGetSecurityInfo();
    if (secInfo) {
      this._logger.error(`SecurityError info: ${secInfo.errorCodeString}`);
      if (secInfo.failedCertChain.length) {
        const chain = secInfo.failedCertChain.map(c => {
          return c.commonName + "; serial# " + c.serialNumber;
        });
        this._logger.error(`SecurityError cert chain: ${chain.join(" <- ")}`);
      }
      this.runningUri.failedSecInfo = secInfo;
      this._server.closeCachedConnections();
    } else {
      this.logout();
    }

    this._actionDone(event.errorCode);
  };

  /**
   * The close event handler.
   */
  _onClose = () => {
    this._logger.debug("Connection closed.");
    this.folder = null;
  };

  /**
   * Send a command to the server.
   *
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

    if (!this.isOnline) {
      if (!str.includes("LOGOUT")) {
        this._logger.warn(
          `Failed to send because socket state is ${this._socket?.readyState}`
        );
      }
      return;
    }

    const encode = this._utf8Enabled
      ? x => new TextEncoder().encode(x)
      : MailStringUtils.byteStringToUint8Array;
    this._socket.send(encode(str + "\r\n").buffer);
  }

  /**
   * Same as _send, but prepend a tag to the command.
   */
  _sendTagged(str, suppressLogging) {
    if (this._idling) {
      const nextAction = this._nextAction;
      this.endIdle(() => {
        this._nextAction = nextAction;
        this._sendTagged(str, suppressLogging);
      });
    } else {
      this._send(`${this._getNextTag()} ${str}`, suppressLogging);
    }
  }

  /**
   * Get the next command tag.
   *
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
   *
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
   *
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
    this._nextAuthMethod =
      this._possibleAuthMethods[
        this._possibleAuthMethods.indexOf(this._currentAuthMethod) + 1
      ];

    switch (this._currentAuthMethod) {
      case "OLDLOGIN": {
        this._nextAction = this._actionAuthResponse;
        const password = await this._getPassword();
        this._sendTagged(
          `LOGIN ${this._authenticator.username} ${password}`,
          true
        );
        break;
      }
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
      case "XOAUTH2": {
        this._nextAction = this._actionAuthResponse;
        const token = await this._authenticator.getOAuthToken();
        this._sendTagged(`AUTHENTICATE XOAUTH2 ${token}`, true);
        break;
      }
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
      if (res.capabilities) {
        this._capabilities = res.capabilities;
        this._server.wrappedJSObject.capabilities = res.capabilities;
        this._actionId();
      } else {
        this._nextAction = res => {
          this._capabilities = res.capabilities;
          this._server.wrappedJSObject.capabilities = res.capabilities;
          this._actionId();
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
      const action = this._authenticator.promptAuthFailed(this._msgWindow);
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
   *
   * @returns {string} The server password.
   */
  async _getPassword() {
    try {
      const password = await this._authenticator.getPassword();
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
   *
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionAuthPlain = async () => {
    this._nextAction = this._actionAuthResponse;
    this._send(await this._authenticator.getPlainToken(), true);
  };

  /**
   * The second step of LOGIN auth. Send the username to the server.
   *
   * @param {ImapResponse} res - The server response.
   */
  _actionAuthLoginUser = () => {
    this._nextAction = this._actionAuthLoginPass;
    this._send(btoa(this._authenticator.username), true);
  };

  /**
   * The third step of LOGIN auth. Send the password to the server.
   *
   * @param {ImapResponse} res - The server response.
   */
  _actionAuthLoginPass = async () => {
    this._nextAction = this._actionAuthResponse;
    const password = MailStringUtils.stringToByteString(
      await this._getPassword()
    );
    this._send(btoa(password), true);
  };

  /**
   * The second step of CRAM-MD5 auth, send a HMAC-MD5 signature to the server.
   *
   * @param {ImapResponse} res - The server response.
   */
  _actionAuthCramMd5 = async res => {
    this._nextAction = this._actionAuthResponse;
    const password = await this._getPassword();
    this._send(
      this._authenticator.getCramMd5Token(password, res.statusText),
      true
    );
  };

  /**
   * The second and next step of GSSAPI auth.
   *
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
   *
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
   * Send ID command to the server.
   *
   * @param {Function} [actionAfter] - A callback after processing ID command.
   */
  _actionId = (actionAfter = this._actionEnableUtf8) => {
    if (this._capabilities.includes("ID") && Services.appinfo.name) {
      this._nextAction = res => {
        this._server.serverIDPref = res.id;
        actionAfter();
      };
      this._sendTagged(
        `ID ("name" "${Services.appinfo.name}" "version" "${Services.appinfo.version}")`
      );
    } else {
      actionAfter();
    }
  };

  /**
   * Enable UTF8 if supported by the server.
   *
   * @param {Function} [actionAfter] - A callback after processing ENABLE UTF8.
   */
  _actionEnableUtf8 = (actionAfter = this._discoverAllFoldersIfNecessary) => {
    if (
      this._server.allowUTF8Accept &&
      (this._capabilities.includes("UTF8=ACCEPT") ||
        this._capabilities.includes("UTF8=ONLY"))
    ) {
      this._nextAction = res => {
        this._utf8Enabled = res.status == "OK";
        this._server.utf8AcceptEnabled = this._utf8Enabled;
        actionAfter();
      };
      this._sendTagged("ENABLE UTF8=ACCEPT");
    } else {
      this._utf8Enabled = false;
      actionAfter();
    }
  };

  /**
   * Execute an action with a folder selected.
   *
   * @param {nsIMsgFolder} folder - The folder to select.
   * @param {Function} actionInFolder - The action to execute.
   */
  _actionInFolder(folder, actionInFolder) {
    if (this.folder == folder) {
      // If already in the folder, execute the action now.
      actionInFolder();
    } else {
      // Send the SELECT command and queue the action.
      this._actionAfterSelectFolder = actionInFolder;
      this._nextAction = this._actionSelectResponse(folder);
      this._sendTagged(`SELECT "${this._getServerFolderName(folder)}"`);
    }
  }

  /**
   * Send LSUB or LIST command depending on the server capabilities.
   *
   * @param {string} [mailbox="*"] - The mailbox to list, default to list all.
   */
  _actionListOrLsub(mailbox = "*") {
    this._nextAction = this._actionListResponse();
    let command = this._capabilities.includes("LIST-EXTENDED")
      ? "LIST (SUBSCRIBED)" // rfc5258
      : "LSUB";
    command += ` "" "${mailbox}"`;
    if (this._capabilities.includes("SPECIAL-USE")) {
      command += " RETURN (SPECIAL-USE)"; // rfc6154
    }
    this._sendTagged(command);
    this._listInboxSent = false;
  }

  /**
   * Handle LIST response.
   *
   * @param {Function} actionAfterResponse - A callback after handling the response.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionListResponse =
    (actionAfterResponse = this._actionFinishFolderDiscovery) =>
    res => {
      if (!this._hasInbox) {
        this._hasInbox = res.mailboxes.some(
          mailbox => mailbox.flags & ImapUtils.FLAG_IMAP_INBOX
        );
      }
      for (const mailbox of res.mailboxes) {
        this._serverSink.possibleImapMailbox(
          mailbox.name.replaceAll(mailbox.delimiter, "/"),
          mailbox.delimiter,
          mailbox.flags
        );
      }

      actionAfterResponse(res);
    };

  /**
   * Send LIST command.
   *
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
      this._actionList("INBOX");
      this._listInboxSent = true;
      return;
    }
    if (!this._hasTrash && !this._listTrashSent) {
      this._actionCreateTrashFolderIfNeeded();
      return;
    }
    this._serverSink.discoveryDone();
    this._actionAfterDiscoverAllFolders
      ? this._actionAfterDiscoverAllFolders()
      : this._actionDone();
  };

  /**
   * If Trash folder is not found on server, create one and subscribe to it.
   */
  _actionCreateTrashFolderIfNeeded() {
    const trashFolderName = this._server.trashFolderName;
    this._actionList(trashFolderName, res => {
      this._hasTrash = res.mailboxes.length > 0;
      if (this._hasTrash) {
        // Trash folder exists.
        this._actionFinishFolderDiscovery();
      } else {
        // Trash folder doesn't exist, create one and subscribe to it.
        this._nextAction = () => {
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
   *
   * @param {string} folderName - The folder name.
   * @param {Function} callbackAfterSubscribe - The action after the subscribe
   *   command.
   */
  _actionCreateAndSubscribe(folderName, callbackAfterSubscribe) {
    this._nextAction = () => {
      this._nextAction = callbackAfterSubscribe;
      this._sendTagged(`SUBSCRIBE "${folderName}"`);
    };
    this._sendTagged(`CREATE "${folderName}"`);
  }

  /**
   * Handle SELECT response.
   */
  _actionSelectResponse = folder => res => {
    if (folder) {
      this.folder = folder;
    }
    this._supportedFlags = res.permanentflags || res.flags;
    this._folderState = res;
    if (this._capabilities.includes("QUOTA")) {
      this._actionGetQuotaData();
    } else {
      this._actionAfterSelectFolder();
    }
  };

  /**
   * Send GETQUOTAROOT command and handle the response.
   */
  _actionGetQuotaData() {
    this._folderSink = this.folder.QueryInterface(Ci.nsIImapMailFolderSink);
    this._nextAction = res => {
      const INVALIDATE_QUOTA = 0;
      const STORE_QUOTA = 1;
      const VALIDATE_QUOTA = 2;
      for (const root of res.quotaRoots || []) {
        this._folderSink.setFolderQuotaData(INVALIDATE_QUOTA, root, 0, 0);
      }
      for (const [mailbox, resource, usage, limit] of res.quotas || []) {
        this._folderSink.setFolderQuotaData(
          STORE_QUOTA,
          mailbox ? `${mailbox} / ${resource}` : resource,
          usage,
          limit
        );
      }
      this._folderSink.setFolderQuotaData(VALIDATE_QUOTA, "", 0, 0);
      this._actionAfterSelectFolder();
    };
    this._sendTagged(
      `GETQUOTAROOT "${this._getServerFolderName(this.folder)}"`
    );
    this._folderSink.folderQuotaCommandIssued = true;
  }

  /**
   * Handle RENAME response. Three steps are involved.
   *
   * @param {string} oldName - The old folder name.
   * @param {string} newName - The new folder name.
   * @param {boolean} [isMove] - Is it response to MOVE command.
   * @param {ImapResponse} res - The server response.
   */
  _actionRenameResponse = (oldName, newName, isMove) => () => {
    // Step 3: Rename the local folder and send LIST command to re-sync folders.
    const actionAfterUnsubscribe = () => {
      this._serverSink.onlineFolderRename(this._msgWindow, oldName, newName);
      if (isMove) {
        this._actionDone();
      } else {
        this._actionListOrLsub(newName);
      }
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
    if (this.runningUri.imapAction == Ci.nsIImapUrl.nsImapLiteSelectFolder) {
      this._nextAction = () => this._actionDone();
    } else {
      this._nextAction = this._actionUidFetchResponse;
    }
    this._sendTagged("UID FETCH 1:* (FLAGS)");
  }

  /**
   * Handle UID FETCH response.
   *
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionUidFetchResponse() {
    const outFolderInfo = {};
    this.folder.getDBFolderInfoAndDB(outFolderInfo);
    const highestUid = outFolderInfo.value.getUint32Property(
      "highestRecordedUID",
      0
    );
    this._folderSink = this.folder.QueryInterface(Ci.nsIImapMailFolderSink);
    this._folderSink.UpdateImapMailboxInfo(this, this._getMailboxSpec());
    const latestUid = this._messageUids.at(-1);
    if (latestUid > highestUid) {
      let extraItems = "";
      if (this._server.isGMailServer) {
        extraItems += "X-GM-MSGID X-GM-THRID X-GM-LABELS ";
      }
      this._nextAction = this._actionUidFetchHeaderResponse;
      this._sendTagged(
        `UID FETCH ${
          highestUid + 1
        }:${latestUid} (UID ${extraItems}RFC822.SIZE FLAGS BODY.PEEK[HEADER])`
      );
    } else {
      this._folderSink.headerFetchCompleted(this);
      if (this._bodysToDownload.length) {
        const uids = this._bodysToDownload.join(",");
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
   *
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
   *
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionUidFetchHeaderResponse() {
    this.folder
      .QueryInterface(Ci.nsIImapMailFolderSink)
      .headerFetchCompleted(this);
    if (this._bodysToDownload.length) {
      // nsImapMailFolder decides to fetch the full body by calling
      // NotifyBodysToDownload.
      const uids = this._bodysToDownload.join(",");
      this._nextAction = this._actionUidFetchBodyResponse;
      this._sendTagged(`UID FETCH ${uids} (UID RFC822.SIZE FLAGS BODY.PEEK[])`);
      return;
    }
    this._actionDone();
  }

  /**
   * Handle UID FETCH BODY response.
   *
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionUidFetchBodyResponse() {
    this._actionDone();
  }

  /**
   * Handle a single message data response.
   *
   * @param {MessageData} msg - Message data parsed in ImapResponse.
   */
  _onMessage = msg => {
    this._msgSink = this.folder.QueryInterface(Ci.nsIImapMessageSink);
    this._folderSink = this.folder.QueryInterface(Ci.nsIImapMailFolderSink);

    // Handle message flags.
    if ((msg.uid || msg.sequence) && msg.flags != undefined) {
      let uid = msg.uid;
      if (uid && msg.sequence) {
        this._messageUids[msg.sequence] = uid;
        this._messages.set(uid, msg);
      } else if (msg.sequence) {
        uid = this._messageUids[msg.sequence];
      }
      if (uid) {
        this.folder
          .QueryInterface(Ci.nsIImapMessageSink)
          .notifyMessageFlags(
            msg.flags,
            msg.keywords,
            uid,
            this._folderState.highestmodseq
          );
      }
    }

    if (msg.body) {
      if (!msg.body.endsWith("\r\n")) {
        msg.body += "\r\n";
      }
      if (msg.bodySection.length == 1 && msg.bodySection[0] == "HEADER") {
        // Handle message headers.
        this._messageUids[msg.sequence] = msg.uid;
        this._messages.set(msg.uid, msg);
        this._folderSink.StartMessage(this.runningUri);
        const hdrXferInfo = {
          numHeaders: 1,
          getHeader() {
            return {
              msgUid: msg.uid,
              msgSize: msg.size,
              get msgHdrs() {
                const sepIndex = msg.body.indexOf("\r\n\r\n");
                return sepIndex == -1
                  ? msg.body + "\r\n"
                  : msg.body.slice(0, sepIndex + 2);
              },
            };
          },
        };
        this._folderSink.parseMsgHdrs(this, hdrXferInfo);
      } else {
        // Handle message body.
        let shouldStoreMsgOffline = false;
        try {
          shouldStoreMsgOffline = this.folder.shouldStoreMsgOffline(msg.uid);
        } catch (e) {}
        if (
          (shouldStoreMsgOffline ||
            this.runningUri.QueryInterface(Ci.nsIImapUrl)
              .storeResultsOffline) &&
          msg.body
        ) {
          this._folderSink.StartMessage(this.runningUri);
          this._msgSink.parseAdoptedMsgLine(msg.body, msg.uid, this.runningUri);
          this._msgSink.normalEndMsgWriteStream(
            msg.uid,
            true,
            this.runningUri,
            msg.body.length
          );
          this._folderSink.EndMessage(this.runningUri, msg.uid);
        }

        this.onData?.(msg.body);
        // Release some memory.
        msg.body = "";
      }
    }
  };

  /**
   * Send NOOP command.
   */
  _actionNoop() {
    this._nextAction = this._actionNoopResponse;
    this._sendTagged("NOOP");
  }

  /**
   * Handle NOOP response.
   *
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionNoopResponse(res) {
    if (
      (res.exists && res.exists != this._folderState.exists) ||
      res.expunged.length
    ) {
      // Handle messages number changes, re-sync the folder.
      this._folderState.exists = res.exists;
      this._actionAfterSelectFolder = this._actionUidFetch;
      this._nextAction = this._actionSelectResponse();
      if (res.expunged.length) {
        this._messageUids = [];
        this._messages.clear();
      }
      const folder = this.folder;
      this.folder = null;
      this.selectFolder(folder);
    } else if (res.messages.length || res.exists) {
      const outFolderInfo = {};
      this.folder.getDBFolderInfoAndDB(outFolderInfo);
      const highestUid = outFolderInfo.value.getUint32Property(
        "highestRecordedUID",
        0
      );
      this._nextAction = this._actionUidFetchResponse;
      this._sendTagged(`UID FETCH ${highestUid + 1}:* (FLAGS)`);
    } else {
      if (res.exists == 0) {
        this._messageUids = [];
        this._messages.clear();
        this.folder
          .QueryInterface(Ci.nsIImapMailFolderSink)
          .UpdateImapMailboxInfo(this, this._getMailboxSpec());
      }
      if (!this._idling) {
        this._actionDone();
      }
    }
  }

  /**
   * Show an error prompt.
   *
   * @param {string} errorName - An error name corresponds to an entry of
   *   imapMsgs.properties.
   */
  _actionError(errorName) {
    if (!this._msgWindow) {
      return;
    }
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/imapMsgs.properties"
    );
    const errorMsg = bundle.formatStringFromName(errorName, [
      this._server.hostName,
    ]);
    Services.prompt.alert(this._msgWindow.domWindow, null, errorMsg);
  }

  /**
   * Finish a request and do necessary cleanup.
   */
  _actionDone = (status = Cr.NS_OK) => {
    this._logger.debug(`Done with status=${status}`);
    this._nextAction = null;
    this._urlListener?.OnStopRunningUrl(this.runningUri, status);
    this.runningUri.SetUrlState(false, status);
    this.onDone?.(status);
    this._reset();
    // Tell ImapIncomingServer this client can be reused now.
    this.onFree?.();
  };

  /**
   * @see {nsIImapProtocol}
   * @param {nsMsgKey[]} keys
   */
  NotifyBodysToDownload(keys) {
    this._logger.debug("NotifyBodysToDownload", keys);
    this._bodysToDownload = keys;
  }

  /** @see {nsIImapProtocol} */
  GetRunningUrl() {
    this._logger.debug("GetRunningUrl");
  }

  /**
   * @see {nsIImapProtocol}
   * @returns {nsIImapFlagAndUidState}
   */
  get flagAndUidState() {
    // The server sequence is 1 based, nsIImapFlagAndUidState sequence is 0 based.
    const getUidOfMessage = index => this._messageUids[index + 1];
    const getMessageFlagsByUid = uid => this._messages.get(uid)?.flags;
    return {
      QueryInterface: ChromeUtils.generateQI(["nsIImapFlagAndUidState"]),
      numberOfMessages: this._messages.size,
      getUidOfMessage,
      getMessageFlags: index => getMessageFlagsByUid(getUidOfMessage(index)),
      hasMessage: uid => this._messages.has(uid),
      getMessageFlagsByUid,
      getCustomFlags: uid => this._messages.get(uid)?.keywords,
      getCustomAttribute: (uid, name) => {
        const value = this._messages.get(uid)?.customAttributes[name];
        return Array.isArray(value) ? value.join(" ") : value;
      },
    };
  }
}
