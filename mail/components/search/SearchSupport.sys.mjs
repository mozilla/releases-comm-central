/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const PERM_DIRECTORY = 0o755;
const PERM_FILE = 0o644;

/**
 * Common, useful functions for desktop search integration components.
 *
 * @abstract
 */
export class SearchSupport {
  /**
   * The property in the database that indicates whether a message has been
   * indexed. Needs to be set by subclasses.
   *
   * @type {?string}
   */
  _hdrIndexedProperty = null;

  /**
   * The file extension to be used for support files. Needs to be set by
   * subclasses.
   *
   * @type {?string}
   */
  _fileExt = null;

  /**
   * The base for preferences that are stored. Needs to be set by subclasses.
   *
   * @type {?string}
   */
  _prefBase = null;

  /**
   * An nsIStreamListener to read message text. Needs to be set by subclasses.
   *
   * @type {?BaseStreamListener}
   */
  _streamListener = null;

  /**
   * URI of last folder indexed. Kept in sync with the pref.
   *
   * @type {?string}
   */
  #lastFolderIndexedUri = null;
  set _lastFolderIndexedUri(uri) {
    this._prefBranch.setStringPref("lastFolderIndexedUri", uri);
    this.#lastFolderIndexedUri = uri;
  }
  get _lastFolderIndexedUri() {
    // If we don't know about it, get it from the pref branch
    if (this.#lastFolderIndexedUri === null) {
      this.#lastFolderIndexedUri = this._prefBranch.getStringPref(
        "lastFolderIndexedUri",
        ""
      );
    }
    return this.#lastFolderIndexedUri;
  }

  /**
   * Queue of message headers to index, along with reindex times for each header.
   *
   * @type {[nsIMsgDBHdr, integer][]}
   */
  _msgHdrsToIndex = [];

  /**
   * Messenger object, used primarily to get message URIs
   *
   * @type {?nsIMessenger}
   */
  #messenger = null;
  get _messenger() {
    if (!this.#messenger) {
      this.#messenger = Cc["@mozilla.org/messenger;1"].createInstance(
        Ci.nsIMessenger
      );
    }
    return this.#messenger;
  }

  /**
   * The preferences branch to use.
   *
   * @type {?nsIPrefBranch}
   */
  #prefBranch = null;
  get _prefBranch() {
    if (!this.#prefBranch) {
      this.#prefBranch = Services.prefs.getBranch(this._prefBase);
    }
    return this.#prefBranch;
  }

  /**
   * If this is true, we'll show disabled UI, because while the OS does have
   * the support we need, not all the OS components we need are running.
   *
   * @type {boolean}
   */
  osComponentsNotRunning = false;

  /**
   * Whether the preference is enabled. The module might be in a state where
   * the preference is on but "enabled" is false, so take care of that.
   *
   * @type {boolean}
   */
  get prefEnabled() {
    // Don't cache the value
    return this._prefBranch.getBoolPref("enable");
  }
  set prefEnabled(aEnabled) {
    if (this.prefEnabled != aEnabled) {
      this._prefBranch.setBoolPref("enable", aEnabled);
    }
  }

  /**
   * Whether the first run has occurred. This will be used to determine if
   * a dialog box needs to be displayed.
   *
   * @type {boolean}
   */
  get firstRunDone() {
    // Don't cache this value either
    return this._prefBranch.getBoolPref("firstRunDone");
  }
  set firstRunDone(aAlwaysTrue) {
    this._prefBranch.setBoolPref("firstRunDone", true);
  }

  /**
   * Last global reindex time, used to check if reindexing is required.
   * Kept in sync with the pref. Unix time in seconds.
   *
   * @type {integer}
   */
  #globalReindexTime = null;
  set globalReindexTime(aTime) {
    this.#globalReindexTime = aTime;
    // Set the pref as well
    this._prefBranch.setCharPref("global_reindex_time", "" + aTime);
  }
  get globalReindexTime() {
    if (!this.#globalReindexTime) {
      // Try getting the time from the preferences
      try {
        this.#globalReindexTime = parseInt(
          this._prefBranch.getCharPref("global_reindex_time")
        );
      } catch (e) {
        // We don't have it defined, so set it (Unix time, in seconds)
        this.#globalReindexTime = parseInt(Date.now() / 1000);
        this._prefBranch.setCharPref(
          "global_reindex_time",
          "" + this.#globalReindexTime
        );
      }
    }
    return this.#globalReindexTime;
  }

  /**
   * Amount of time the user is idle before we (re)start an indexing sweep. In
   * seconds.
   *
   * @type {integer}
   */
  _idleThresholdSecs = 30;

  /**
   * Reference to timer object
   *
   * @type {?nsITimer}
   */
  #timer = null;
  get _timer() {
    if (!this.#timer) {
      this.#timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    }
    return this.#timer;
  }

  #cancelTimer() {
    try {
      this._timer.cancel();
    } catch (ex) {}
  }

  /**
   * Enabled status.
   *
   * When we're enabled, then we get notifications about every message or folder
   * operation, including "message displayed" operations which we bump up in
   * priority. We also have a background sweep which we do on idle.
   *
   * We aren't fully disabled when we're "disabled", though. We still observe
   * message and folder moves and deletes, as we don't want to have support
   * files for non-existent messages.
   *
   * @type {?boolean}
   */
  #enabled = null;
  set enabled(aEnable) {
    // Nothing to do if there's no change in state
    if (this.#enabled == aEnable) {
      return;
    }

    this._log.info(
      "Enabled status changing from " + this.#enabled + " to " + aEnable
    );

    this._removeObservers();

    if (aEnable) {
      // This stuff we always need to do.
      // This code pre-dates msgsClassified.
      // Some events intentionally omitted.
      MailServices.mfn.addListener(
        this._msgFolderListener,
        MailServices.mfn.msgAdded |
          MailServices.mfn.msgsDeleted |
          MailServices.mfn.msgsMoveCopyCompleted |
          MailServices.mfn.folderDeleted |
          MailServices.mfn.folderMoveCopyCompleted |
          MailServices.mfn.folderRenamed
      );
      Services.obs.addObserver(this, "MsgMsgDisplayed");
      const idleService = Cc[
        "@mozilla.org/widget/useridleservice;1"
      ].getService(Ci.nsIUserIdleService);
      idleService.addIdleObserver(this, this._idleThresholdSecs);
    } else {
      // We want to observe moves, deletes and renames in case we're disabled
      // If we don't, we'll have no idea the support files exist later
      MailServices.mfn.addListener(
        this._msgFolderListener,
        MailServices.mfn.msgsMoveCopyCompleted |
          MailServices.mfn.msgsDeleted |
          // folderAdded intentionally omitted
          MailServices.mfn.folderDeleted |
          MailServices.mfn.folderMoveCopyCompleted |
          MailServices.mfn.folderRenamed
      );
    }

    this.#enabled = aEnable;
  }
  get enabled() {
    return this.#enabled;
  }

  /**
   * Remove whatever observers are present. This is done while switching states
   */
  _removeObservers() {
    if (this.enabled === null) {
      return;
    }

    MailServices.mfn.removeListener(this._msgFolderListener);

    if (this.enabled) {
      Services.obs.removeObserver(this, "MsgMsgDisplayed");
      const idleService = Cc[
        "@mozilla.org/widget/useridleservice;1"
      ].getService(Ci.nsIUserIdleService);
      idleService.removeIdleObserver(this, this._idleThresholdSecs);

      // in case there's a background sweep going on
      this.#cancelTimer();
    }
    // We don't need to do anything extra if we're disabled
  }

  /**
   * Init function -- this should be called from the component's init function
   *
   * @param {boolean} enabled
   */
  _initSupport(enabled) {
    this._log.info(
      "Search integration running in " +
        (enabled ? "active" : "backoff") +
        " mode"
    );
    this.enabled = enabled;

    // Set up a pref observer
    this._prefBranch.addObserver("enable", this);
  }

  /**
   * Current folder being indexed.
   *
   * @type {?nsIMsgFolder}
   */
  #currentFolderToIndex = null;

  /**
   * For the current folder being indexed, an enumerator for all the headers in
   * the folder.
   *
   * @type {?nsIMsgEnumerator}
   */
  #headerEnumerator = null;

  /*
   * These functions are to index already existing messages
   */

  /**
   * Generator to look for the next folder to index, and return it
   *
   * This first looks for folders that have their corresponding search results
   * folders missing. If it finds such a folder first, it'll yield return that
   * folder.
   *
   * Next, it looks for the next folder after the lastFolderIndexedUri. If it is
   * in such a folder, it'll yield return that folder, then set the
   * lastFolderIndexedUrl to the URI of that folder.
   *
   * It resets lastFolderIndexedUri to an empty string, then yield returns null
   * once iteration across all folders is complete.
   *
   * @yields {?nsIMsgFolder}
   */
  *_foldersToIndexGenerator() {
    // Stores whether we're after the last folder indexed or before that --
    // if the last folder indexed is empty, this needs to be true initially
    let afterLastFolderIndexed = this._lastFolderIndexedUri.length == 0;

    for (const server of MailServices.accounts.allServers) {
      this._log.debug(
        "in find next folder, lastFolderIndexedUri = " +
          this._lastFolderIndexedUri
      );

      for (var folder of server.rootFolder.descendants) {
        const searchPath = this._getSearchPathForFolder(folder);
        searchPath.leafName = searchPath.leafName + ".mozmsgs";
        // If after the last folder indexed, definitely index this
        if (afterLastFolderIndexed) {
          // Create the folder if it doesn't exist, so that we don't hit the
          // condition below later
          if (!searchPath.exists()) {
            searchPath.create(Ci.nsIFile.DIRECTORY_TYPE, PERM_DIRECTORY);
          }

          yield folder;
          // We're back after yielding -- set the last folder indexed
          this._lastFolderIndexedUri = folder.URI;
        } else {
          // If a folder's entire corresponding search results folder is
          // missing, we need to index it, and force a reindex of all the
          // messages in it
          if (!searchPath.exists()) {
            this._log.debug(
              "using folder " +
                folder.URI +
                " because " +
                "corresponding search folder does not exist"
            );
            // Create the folder, so that next time we're checking we don't hit
            // this
            searchPath.create(Ci.nsIFile.DIRECTORY_TYPE, PERM_DIRECTORY);
            folder.setStringProperty(
              this._hdrIndexedProperty,
              "" + Date.now() / 1000
            );
            yield folder;
          } else if (this._pathNeedsReindexing(searchPath)) {
            // folder may need reindexing for other reasons
            folder.setStringProperty(
              this._hdrIndexedProperty,
              "" + Date.now() / 1000
            );
            yield folder;
          }

          // Even if we yielded above, check if this is the last folder
          // indexed
          if (this._lastFolderIndexedUri == folder.URI) {
            afterLastFolderIndexed = true;
          }
        }
      }
    }
    // We're done with one iteration of all the folders; time to reset the
    // lastFolderIndexedUri
    this._lastFolderIndexedUri = "";
    yield null;
  }

  /**
   * @type {?Generator<nsIMsgFolder, undefined, void>}
   */
  #foldersToIndex = null;
  get _foldersToIndex() {
    if (!this.#foldersToIndex) {
      this.#foldersToIndex = this._foldersToIndexGenerator();
    }
    return this.#foldersToIndex;
  }

  _findNextHdrToIndex() {
    try {
      const reindexTime = this._getLastReindexTime(this.#currentFolderToIndex);
      this._log.debug("Reindex time for this folder is " + reindexTime);
      if (!this.#headerEnumerator) {
        //  we need to create search terms for messages to index
        const searchSession = Cc[
          "@mozilla.org/messenger/searchSession;1"
        ].createInstance(Ci.nsIMsgSearchSession);
        const searchTerms = [];

        searchSession.addScopeTerm(
          Ci.nsMsgSearchScope.offlineMail,
          this.#currentFolderToIndex
        );
        // first term: (_hdrIndexProperty < reindexTime)
        const searchTerm = searchSession.createTerm();
        searchTerm.booleanAnd = false; // actually don't care here
        searchTerm.attrib = Ci.nsMsgSearchAttrib.Uint32HdrProperty;
        searchTerm.op = Ci.nsMsgSearchOp.IsLessThan;
        const value = searchTerm.value;
        value.attrib = searchTerm.attrib;
        searchTerm.hdrProperty = this._hdrIndexedProperty;
        value.status = reindexTime;
        searchTerm.value = value;
        searchTerms.push(searchTerm);
        this.#headerEnumerator =
          this.#currentFolderToIndex.msgDatabase.getFilterEnumerator(
            searchTerms
          );
      }

      // iterate over the folder finding the next message to index
      for (const msgHdr of this.#headerEnumerator) {
        // Check if the file exists. If it does, then assume indexing to be
        // complete for this file
        if (this._getSupportFile(msgHdr).exists()) {
          this._log.debug(
            "Message time not set but file exists; setting " +
              "time to " +
              reindexTime
          );
          msgHdr.setUint32Property(this._hdrIndexedProperty, reindexTime);
        } else {
          return [msgHdr, reindexTime];
        }
      }
    } catch (ex) {
      this._log.debug("Error while finding next header: " + ex);
    }

    // If we couldn't find any headers to index, null out the enumerator
    this.#headerEnumerator = null;
    if (!(this.#currentFolderToIndex.flags & Ci.nsMsgFolderFlags.Inbox)) {
      this.#currentFolderToIndex.msgDatabase = null;
    }
    return null;
  }

  /**
   * Get the last reindex time for this folder. This will be whichever's
   * greater, the global reindex time or the folder reindex time
   *
   * @returns {integer}
   */
  _getLastReindexTime() {
    let reindexTime = this.globalReindexTime;

    // Check if this folder has a separate string property set
    let folderReindexTime;
    try {
      folderReindexTime = this.#currentFolderToIndex.getStringProperty(
        this._hdrIndexedProperty
      );
    } catch (e) {
      folderReindexTime = "";
    }

    if (folderReindexTime.length > 0) {
      const folderReindexTimeInt = parseInt(folderReindexTime);
      if (folderReindexTimeInt > reindexTime) {
        reindexTime = folderReindexTimeInt;
      }
    }
    return reindexTime;
  }

  /**
   * Whether background indexing has been completed
   *
   * @type {boolean}
   */
  #backgroundIndexingDone = false;

  /**
   * The main background sweeping function. It first looks for a folder to
   * start or continue indexing in, then for a header. If it can't find anything
   * to index, it resets the last folder indexed URI so that the sweep can
   * be restarted
   */
  _continueSweep() {
    let msgHdrAndReindexTime = null;

    if (this.#backgroundIndexingDone) {
      return;
    }

    // find the current folder we're working on
    if (!this.#currentFolderToIndex) {
      this.#currentFolderToIndex = this._foldersToIndex.next().value;
    }

    // we'd like to index more than one message on each timer fire,
    // but since streaming is async, it's hard to know how long
    // it's going to take to stream any particular message.
    if (this.#currentFolderToIndex) {
      msgHdrAndReindexTime = this._findNextHdrToIndex();
    } else {
      // We've cycled through all the folders. We should take a break
      // from indexing of existing messages.
      this.#backgroundIndexingDone = true;
    }

    if (!msgHdrAndReindexTime) {
      this._log.debug("reached end of folder");
      if (this.#currentFolderToIndex) {
        this.#currentFolderToIndex = null;
      }
    } else {
      this._queueMessage(msgHdrAndReindexTime[0], msgHdrAndReindexTime[1]);
    }

    // Restart the timer, and call ourselves
    this.#cancelTimer();
    this._timer.initWithCallback(
      this.#wrapContinueSweep,
      this._msgHdrsToIndex.length > 1 ? 5000 : 1000,
      Ci.nsITimer.TYPE_ONE_SHOT
    );
  }

  /**
   * A simple wrapper to make "this" be right for _continueSweep
   */
  #wrapContinueSweep = () => {
    this._continueSweep();
  };

  /**
   * Observer implementation. Consists of
   * - idle observer; starts running through folders when it receives an "idle"
   * notification, and cancels any timers when it receives a "back" notification
   * - msg displayed observer, queues the message if necessary
   * - pref observer, to see if the preference has been poked
   */
  observe(aSubject, aTopic, aData) {
    if (aTopic == "idle") {
      this._log.debug("Idle detected, continuing sweep");
      this._continueSweep();
    } else if (aTopic == "back") {
      this._log.debug("Non-idle, so suspending sweep");
      this.#cancelTimer();
    } else if (aTopic == "MsgMsgDisplayed") {
      this._log.debug("topic = " + aTopic + " uri = " + aData);
      const msgHdr = this._messenger.msgHdrFromURI(aData);
      const reindexTime = this._getLastReindexTime(msgHdr.folder);
      this._log.debug("Reindex time for this folder is " + reindexTime);
      if (msgHdr.getUint32Property(this._hdrIndexedProperty) < reindexTime) {
        // Check if the file exists. If it does, then assume indexing to be
        // complete for this file
        if (this._getSupportFile(msgHdr).exists()) {
          this._log.debug(
            "Message time not set but file exists; setting " +
              " time to " +
              reindexTime
          );
          msgHdr.setUint32Property(this._hdrIndexedProperty, reindexTime);
        } else {
          this._queueMessage(msgHdr, reindexTime);
        }
      }
    } else if (aTopic == "nsPref:changed" && aData == "enable") {
      const prefEnabled = this.prefEnabled;
      // Search integration turned on
      if (prefEnabled && this.register()) {
        this.enabled = true;
      } else if (!prefEnabled && this.deregister()) {
        // Search integration turned off
        this.enabled = false;
      } else {
        // The call to register or deregister has failed.
        // This is a hack to handle this case
        const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        timer.initWithCallback(
          () => {
            this._handleRegisterFailure(!prefEnabled);
          },
          200,
          Ci.nsITimer.TYPE_ONE_SHOT
        );
      }
    }
  }

  /**
   * Handle failure to register or deregister
   *
   * @param {boolean} enabled
   */
  _handleRegisterFailure(enabled) {
    // Remove ourselves from the observer list, flip the pref,
    // and add ourselves back
    this._prefBranch.removeObserver("enable", this);
    this.prefEnabled = enabled;
    this._prefBranch.addObserver("enable", this);
  }

  /**
   * This object gets notifications for new/moved/copied/deleted messages/folders.
   *
   * @implements {nsIMsgFolderListener}
   */
  _msgFolderListener = {
    _searchIntegration: this,

    msgAdded(aMsg) {
      this._searchIntegration._log.info("in msgAdded");
      // The message already being there is an expected case
      const file = this._searchIntegration._getSupportFile(aMsg);
      if (!file.exists()) {
        this._searchIntegration._queueMessage(
          aMsg,
          this._searchIntegration._getLastReindexTime(aMsg.folder)
        );
      }
    },

    msgsDeleted(aMsgs) {
      this._searchIntegration._log.info("in msgsDeleted");
      for (const msgHdr of aMsgs) {
        const file = this._searchIntegration._getSupportFile(msgHdr);
        if (file.exists()) {
          file.remove(false);
        }
      }
    },

    msgsMoveCopyCompleted(aMove, aSrcMsgs, aDestFolder) {
      this._searchIntegration._log.info(
        "in msgsMoveCopyCompleted, aMove = " + aMove
      );
      // Forget about copies if disabled
      if (!aMove && !this.enabled) {
        return;
      }

      const count = aSrcMsgs.length;
      for (let i = 0; i < count; i++) {
        const srcFile = this._searchIntegration._getSupportFile(aSrcMsgs[i]);
        if (srcFile && srcFile.exists()) {
          const destFile =
            this._searchIntegration._getSearchPathForFolder(aDestFolder);
          destFile.leafName = destFile.leafName + ".mozmsgs";
          if (!destFile.exists()) {
            try {
              // create the directory, if it doesn't exist
              destFile.create(Ci.nsIFile.DIRECTORY_TYPE, PERM_DIRECTORY);
            } catch (ex) {
              this._searchIntegration._log.warn(ex);
            }
          }
          this._searchIntegration._log.debug(
            "dst file path = " + destFile.path
          );
          this._searchIntegration._log.debug("src file path = " + srcFile.path);
          // We're not going to copy in case we're not in active mode
          if (destFile.exists()) {
            if (aMove) {
              srcFile.moveTo(destFile, "");
            } else {
              srcFile.copyTo(destFile, "");
            }
          }
        }
      }
    },

    folderDeleted(aFolder) {
      this._searchIntegration._log.info(
        "in folderDeleted, folder name = " + aFolder.prettyName
      );
      const srcFile = this._searchIntegration._getSearchPathForFolder(aFolder);
      srcFile.leafName = srcFile.leafName + ".mozmsgs";
      if (srcFile.exists()) {
        srcFile.remove(true);
      }
    },

    folderMoveCopyCompleted(aMove, aSrcFolder, aDestFolder) {
      this._searchIntegration._log.info(
        "in folderMoveCopyCompleted, aMove = " + aMove
      );

      // Forget about copies if disabled
      if (!aMove && !this.enabled) {
        return;
      }

      const srcFile =
        this._searchIntegration._getSearchPathForFolder(aSrcFolder);
      const destFile =
        this._searchIntegration._getSearchPathForFolder(aDestFolder);
      srcFile.leafName = srcFile.leafName + ".mozmsgs";
      destFile.leafName += ".sbd";
      this._searchIntegration._log.debug("src file path = " + srcFile.path);
      this._searchIntegration._log.debug("dst file path = " + destFile.path);
      if (srcFile.exists()) {
        // We're not going to copy if we aren't in active mode
        if (aMove) {
          srcFile.moveTo(destFile, "");
        } else {
          srcFile.copyTo(destFile, "");
        }
      }
    },

    folderRenamed(aOrigFolder, aNewFolder) {
      this._searchIntegration._log.info(
        "in folderRenamed, aOrigFolder = " +
          aOrigFolder.prettyName +
          ", aNewFolder = " +
          aNewFolder.prettyName
      );
      const srcFile =
        this._searchIntegration._getSearchPathForFolder(aOrigFolder);
      srcFile.leafName = srcFile.leafName + ".mozmsgs";
      const destName = aNewFolder.name + ".mozmsgs";
      this._searchIntegration._log.debug("src file path = " + srcFile.path);
      this._searchIntegration._log.debug("dst name = " + destName);
      if (srcFile.exists()) {
        srcFile.moveTo(null, destName);
      }
    },
  };

  /**
   * Support functions to queue/generate files.
   *
   * @param {nsIMsgDBHdr} msgHdr
   * @param {integer} reindexTime
   */
  _queueMessage(msgHdr, reindexTime) {
    if (this._msgHdrsToIndex.push([msgHdr, reindexTime]) == 1) {
      this._log.info("generating support file for id = " + msgHdr.messageId);
      this._streamListener.startStreaming(msgHdr, reindexTime);
    } else {
      this._log.info(
        "queueing support file generation for id = " + msgHdr.messageId
      );
    }
  }

  /**
   * Handle results from the command line. This method is the inverse of the
   * _getSupportFile method below.
   *
   * @param {nsIFile} aFile the file passed in by the command line
   * @returns {nsIMsgDBHdr} the nsIMsgDBHdr corresponding to the file passed in
   */
  handleResult(aFile) {
    // The file path has two components -- the search path, which needs to be
    // converted into a folder, and the message ID.
    const searchPath = aFile.parent;
    // Strip off ".mozmsgs" from the end (8 characters)
    searchPath.leafName = searchPath.leafName.slice(0, -8);

    const folder = this._getFolderForSearchPath(searchPath);

    // Get rid of the file extension at the end (7 characters), and unescape
    const messageID = decodeURIComponent(aFile.leafName.slice(0, -7));

    // Look for the message ID in the folder
    return folder.msgDatabase.getMsgHdrForMessageID(messageID);
  }

  /**
   * @param {nsIMsgDBHdr} msgHdr
   * @returns {?nsIFile}
   */
  _getSupportFile(msgHdr) {
    const folder = msgHdr.folder;
    if (folder) {
      const messageId = encodeURIComponent(msgHdr.messageId);
      this._log.debug("encoded message id = " + messageId);
      const file = this._getSearchPathForFolder(folder);
      file.leafName = file.leafName + ".mozmsgs";
      file.appendRelativePath(messageId + this._fileExt);
      this._log.debug("getting support file path = " + file.path);
      return file;
    }
    return null;
  }

  /**
   * Logging functionality, shamelessly ripped from gloda.
   * If enabled, warnings and above are logged to the error console, while dump
   * gets everything.
   *
   * @type {ConsoleInstance}
   */
  _log = null;
  _initLogging() {
    this._log = console.createInstance({
      prefix: this._prefBase.slice(0, -1),
      maxLogLevel: "Warn",
      maxLogLevelPref: `${this._prefBase}loglevel`,
    });
    this._log.info("Logging initialized");
  }
}

/**
 * Base to use for stream listeners, extended by the respective
 * implementations. Is missing the onDataAvailable implementation.
 *
 * @implements {nsIStreamListener}
 */
export class StreamListenerBase {
  QueryInterface = ChromeUtils.generateQI(["nsIStreamListener"]);

  /**
   * @param {SearchSupport} parent - Instance that owns this stream listener.
   */
  constructor(parent) {
    this._searchIntegration = parent;
  }

  /**
   * Output file.
   *
   * @type {?nsIFile}
   */
  _outputFile = null;

  /**
   * Stream to use to write to the output file.
   *
   * @type {?nsIConverterOutputStream}
   */
  #outputStream = null;
  set _outputStream(stream) {
    if (this.#outputStream) {
      this.#outputStream.close();
    }
    this.#outputStream = stream;
  }
  get _outputStream() {
    return this.#outputStream;
  }

  /**
   * Reference to message header
   *
   * @type {?nsIMsgDBHdr}
   */
  _msgHdr = null;

  /**
   * Reindex time for this message header
   *
   * @type {?integer}
   */
  _reindexTime = null;

  /**
   * "Finish" function, cleans up behind itself if unsuccessful
   *
   * @param {boolean} successful
   */
  _onDoneStreaming(successful) {
    this._outputStream = null;
    if (!successful && this._msgHdr) {
      const file = this._searchIntegration._getSupportFile(this._msgHdr);
      if (file && file.exists()) {
        file.remove(false);
      }
    }
    // should we try to delete the file on disk in case not successful?
    this._searchIntegration._msgHdrsToIndex.shift();

    if (this._searchIntegration._msgHdrsToIndex.length > 0) {
      const [msgHdr, reindexTime] = this._searchIntegration._msgHdrsToIndex[0];
      this.startStreaming(msgHdr, reindexTime);
    }
  }

  /**
   * "Start" function
   *
   * @param {nsIMsgDBHdr} msgHdr
   * @param {integer} reindexTime
   */
  startStreaming(msgHdr, reindexTime) {
    try {
      const folder = msgHdr.folder;
      if (folder) {
        const messageId = encodeURIComponent(msgHdr.messageId);
        this._searchIntegration._log.info(
          "generating support file, id = " + messageId
        );
        const file = this._searchIntegration._getSearchPathForFolder(folder);

        file.leafName = file.leafName + ".mozmsgs";
        this._searchIntegration._log.debug("file leafname = " + file.leafName);
        if (!file.exists()) {
          try {
            // create the directory, if it doesn't exist
            file.create(Ci.nsIFile.DIRECTORY_TYPE, PERM_DIRECTORY);
          } catch (ex) {
            this._log.error(ex);
          }
        }

        file.appendRelativePath(messageId + this._searchIntegration._fileExt);
        this._searchIntegration._log.debug("file path = " + file.path);
        file.create(0, PERM_FILE);
        const uri = folder.getUriForMsg(msgHdr);
        const msgService = MailServices.messageServiceFromURI(uri);
        this._msgHdr = msgHdr;
        this._outputFile = file;
        this._reindexTime = reindexTime;
        try {
          // XXX For now, try getting the messages from the server. This has
          // to be improved so that we don't generate any excess network
          // traffic
          msgService.streamMessage(uri, this, null, null, false, "", false);
        } catch (ex) {
          // This is an expected case, in case we're offline
          this._searchIntegration._log.warn(
            "StreamMessage unsuccessful for id = " + messageId
          );
          this._onDoneStreaming(false);
        }
      }
    } catch (ex) {
      this._searchIntegration._log.error(ex);
      this._onDoneStreaming(false);
    }
  }
}
