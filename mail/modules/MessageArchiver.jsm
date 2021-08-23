/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MessageArchiver"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

function MessageArchiver() {
  this._batches = {};
  this._currentKey = null;
  this._dstFolderParent = null;
  this._dstFolderName = null;

  this.folderDisplay = null;
  this.msgWindow = null;
  this.oncomplete = null;
}

// Bad things happen if you have multiple archivers running on the same
// messages (See Bug 1705824). We could probably make this more fine
// grained, and maintain a list of messages/folders already queued up...
// but that'd get complex quick, so let's keep things simple for now and
// only allow one active archiver.
let gIsArchiving = false;

MessageArchiver.prototype = {
  archiveMessages(aMsgHdrs) {
    if (!aMsgHdrs.length) {
      return;
    }
    if (gIsArchiving) {
      throw new Error("Can only have one MessageArchiver running at once");
    }
    gIsArchiving = true;

    if (this.folderDisplay) {
      this.folderDisplay.hintMassMoveStarting();
    }
    for (let i = 0; i < aMsgHdrs.length; i++) {
      let msgHdr = aMsgHdrs[i];

      let server = msgHdr.folder.server;

      // Convert date to JS date object.
      let msgDate = new Date(msgHdr.date / 1000);
      let msgYear = msgDate.getFullYear().toString();
      let monthFolderName =
        msgYear + "-" + (msgDate.getMonth() + 1).toString().padStart(2, "0");

      let archiveFolderURI;
      let archiveGranularity;
      let archiveKeepFolderStructure;

      let [identity] = MailUtils.getIdentityForHeader(msgHdr);
      if (!identity || msgHdr.folder.server.type == "rss") {
        // If no identity, or a server (RSS) which doesn't have an identity
        // and doesn't want the default unrelated identity value, figure
        // this out based on the default identity prefs.
        let enabled = Services.prefs.getBoolPref(
          "mail.identity.default.archive_enabled"
        );
        if (!enabled) {
          continue;
        }

        archiveFolderURI = server.serverURI + "/Archives";
        archiveGranularity = Services.prefs.getIntPref(
          "mail.identity.default.archive_granularity"
        );
        archiveKeepFolderStructure = Services.prefs.getBoolPref(
          "mail.identity.default.archive_keep_folder_structure"
        );
      } else {
        if (!identity.archiveEnabled) {
          continue;
        }

        archiveFolderURI = identity.archiveFolder;
        archiveGranularity = identity.archiveGranularity;
        archiveKeepFolderStructure = identity.archiveKeepFolderStructure;
      }

      let copyBatchKey = msgHdr.folder.URI;
      if (archiveGranularity >= Ci.nsIMsgIdentity.perYearArchiveFolders) {
        copyBatchKey += "\0" + msgYear;
      }

      if (archiveGranularity >= Ci.nsIMsgIdentity.perMonthArchiveFolders) {
        copyBatchKey += "\0" + monthFolderName;
      }

      if (archiveKeepFolderStructure) {
        copyBatchKey += msgHdr.folder.URI;
      }

      // Add a key to copyBatchKey
      if (!(copyBatchKey in this._batches)) {
        this._batches[copyBatchKey] = {
          srcFolder: msgHdr.folder,
          archiveFolderURI,
          granularity: archiveGranularity,
          keepFolderStructure: archiveKeepFolderStructure,
          yearFolderName: msgYear,
          monthFolderName,
          messages: [],
        };
      }
      this._batches[copyBatchKey].messages.push(msgHdr);
    }
    MailServices.mfn.addListener(this, MailServices.mfn.folderAdded);

    // Now we launch the code iterating over all message copies, one in turn.
    this.processNextBatch();
  },

  processNextBatch() {
    // get the first defined key and value
    for (let key in this._batches) {
      this._currentBatch = this._batches[key];
      delete this._batches[key];
      this.filterBatch();
      return;
    }
    // All done!
    this._batches = null;
    if (this.folderDisplay) {
      this.folderDisplay.hintMassMoveCompleted();
    }
    MailServices.mfn.removeListener(this);

    if (typeof this.oncomplete == "function") {
      this.oncomplete();
    }
    gIsArchiving = false;
  },

  filterBatch() {
    let batch = this._currentBatch;
    // Apply filters to this batch.
    MailServices.filters.applyFilters(
      Ci.nsMsgFilterType.Archive,
      batch.messages,
      batch.srcFolder,
      this.msgWindow,
      this
    );
    // continues with onStopOperation
  },

  onStopOperation(aResult) {
    if (!Components.isSuccessCode(aResult)) {
      Cu.reportError("Archive filter failed: " + aResult);
      // We don't want to effectively disable archiving because a filter
      // failed, so we'll continue after reporting the error.
    }
    // Now do the default archive processing
    this.continueBatch();
  },

  // continue processing of default archive operations
  continueBatch() {
    let batch = this._currentBatch;
    let srcFolder = batch.srcFolder;
    let archiveFolderURI = batch.archiveFolderURI;
    let archiveFolder = MailUtils.getOrCreateFolder(archiveFolderURI);
    let dstFolder = archiveFolder;

    let moveArray = [];
    // Don't move any items that the filter moves or deleted
    for (let item of batch.messages) {
      if (
        srcFolder.msgDatabase.ContainsKey(item.messageKey) &&
        !(
          srcFolder.getProcessingFlags(item.messageKey) &
          Ci.nsMsgProcessingFlags.FilterToMove
        )
      ) {
        moveArray.push(item);
      }
    }

    if (moveArray.length == 0) {
      // Continue processing.
      this.processNextBatch();
    }

    // For folders on some servers (e.g. IMAP), we need to create the
    // sub-folders asynchronously, so we chain the urls using the listener
    // called back from createStorageIfMissing. For local,
    // createStorageIfMissing is synchronous.
    let isAsync = archiveFolder.server.protocolInfo.foldersCreatedAsync;
    if (!archiveFolder.parent) {
      archiveFolder.setFlag(Ci.nsMsgFolderFlags.Archive);
      archiveFolder.createStorageIfMissing(this);
      if (isAsync) {
        // Continues with OnStopRunningUrl.
        return;
      }
    }

    let granularity = batch.granularity;
    let forceSingle = !archiveFolder.canCreateSubfolders;
    if (
      !forceSingle &&
      archiveFolder.server instanceof Ci.nsIImapIncomingServer
    ) {
      forceSingle = archiveFolder.server.isGMailServer;
    }
    if (forceSingle) {
      granularity = Ci.nsIMsgIncomingServer.singleArchiveFolder;
    }

    if (granularity >= Ci.nsIMsgIdentity.perYearArchiveFolders) {
      archiveFolderURI += "/" + batch.yearFolderName;
      dstFolder = MailUtils.getOrCreateFolder(archiveFolderURI);
      if (!dstFolder.parent) {
        dstFolder.createStorageIfMissing(this);
        if (isAsync) {
          // Continues with OnStopRunningUrl.
          return;
        }
      }
    }
    if (granularity >= Ci.nsIMsgIdentity.perMonthArchiveFolders) {
      archiveFolderURI += "/" + batch.monthFolderName;
      dstFolder = MailUtils.getOrCreateFolder(archiveFolderURI);
      if (!dstFolder.parent) {
        dstFolder.createStorageIfMissing(this);
        if (isAsync) {
          // Continues with OnStopRunningUrl.
          return;
        }
      }
    }

    // Create the folder structure in Archives.
    // For imap folders, we need to create the sub-folders asynchronously,
    // so we chain the actions using the listener called back from
    // createSubfolder. For local, createSubfolder is synchronous.
    if (archiveFolder.canCreateSubfolders && batch.keepFolderStructure) {
      // Collect in-order list of folders of source folder structure,
      // excluding top-level INBOX folder
      let folderNames = [];
      let rootFolder = srcFolder.server.rootFolder;
      let inboxFolder = MailUtils.getInboxFolder(srcFolder.server);
      let folder = srcFolder;
      while (folder != rootFolder && folder != inboxFolder) {
        folderNames.unshift(folder.name);
        folder = folder.parent;
      }
      // Determine Archive folder structure.
      for (let i = 0; i < folderNames.length; ++i) {
        let folderName = folderNames[i];
        if (!dstFolder.containsChildNamed(folderName)) {
          // Create Archive sub-folder (IMAP: async).
          if (isAsync) {
            this._dstFolderParent = dstFolder;
            this._dstFolderName = folderName;
          }
          dstFolder.createSubfolder(folderName, this.msgWindow);
          if (isAsync) {
            // Continues with folderAdded.
            return;
          }
        }
        dstFolder = dstFolder.getChildNamed(folderName);
      }
    }

    if (dstFolder != srcFolder) {
      let isNews = srcFolder.flags & Ci.nsMsgFolderFlags.Newsgroup;
      // If the source folder doesn't support deleting messages, we
      // make archive a copy, not a move.
      MailServices.copy.copyMessages(
        srcFolder,
        moveArray,
        dstFolder,
        srcFolder.canDeleteMessages && !isNews,
        this,
        this.msgWindow,
        true
      );
      return; // continues with OnStopCopy
    }
    this.processNextBatch(); // next batch
  },

  // @implements {nsIUrlListener}
  OnStartRunningUrl(url) {},
  OnStopRunningUrl(url, exitCode) {
    // this will always be a create folder url, afaik.
    if (Components.isSuccessCode(exitCode)) {
      this.continueBatch();
    } else {
      Cu.reportError("Archive failed to create folder: " + exitCode);
      this._batches = null;
      this.processNextBatch(); // for cleanup and exit
    }
  },

  // also implements nsIMsgCopyServiceListener, but we only care
  // about the OnStopCopy
  // @implements {nsIMsgCopyServiceListener}
  OnStartCopy() {},
  OnProgress(aProgress, aProgressMax) {},
  SetMessageKey(aKey) {},
  GetMessageId() {},
  OnStopCopy(aStatus) {
    if (Components.isSuccessCode(aStatus)) {
      this.processNextBatch();
    } else {
      // stop on error
      Cu.reportError("Archive failed to copy: " + aStatus);
      this._batches = null;
      this.processNextBatch(); // for cleanup and exit
    }
  },

  // This also implements nsIMsgFolderListener, but we only care about the
  // folderAdded (createSubfolder callback).
  // @implements {nsIMsgFolderListener}
  folderAdded(aFolder) {
    // Check that this is the folder we're interested in.
    if (
      aFolder.parent == this._dstFolderParent &&
      aFolder.name == this._dstFolderName
    ) {
      this._dstFolderParent = null;
      this._dstFolderName = null;
      this.continueBatch();
    }
  },

  QueryInterface: ChromeUtils.generateQI([
    "nsIUrlListener",
    "nsIMsgCopyServiceListener",
    "nsIMsgOperationListener",
  ]),
};
