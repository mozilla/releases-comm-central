/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
});

/**
 * @typedef {object} ArchiveBatch
 * @property {nsIMsgFolder} srcFolder - The folder containing the messages.
 * @property {nsIMsgFolder} archiveFolder - The archive destination root.
 * @property {nsIMsgDBHdr[]} messages - The messages to archive.
 * @property {number} granularity - The archive date grouping.
 * @property {boolean} keepFolderStructure - Whether to recreate source folders.
 * @property {boolean} recreateInbox - Whether to include the inbox in that path.
 * @property {string} yearFolderName - The destination year folder name.
 * @property {string} monthFolderName - The destination month folder name.
 */

export function MessageArchiver() {
  this.interactive = false;
}

/**
 * The maximum number of messages to try to examine directly to determine if
 * they can be archived; if we exceed this count, we'll try to approximate
 * the answer by looking at the server's identities.  This is only here to
 * let tests tweak the value.
 */
MessageArchiver.MAX_COUNT_FOR_CAN_ARCHIVE_CHECK = 100;
MessageArchiver.canArchive = function (messages, isSingleFolder) {
  if (messages.length == 0) {
    return false;
  }

  // If we're looking at a single folder (i.e. not a cross-folder search), we
  // can just check to see if all the identities for this folder/server have
  // archives enabled (or disabled). This is way faster than checking every
  // message. Note: this may be slightly inaccurate if the identity for a
  // header is actually on another server.
  if (
    messages.length > MessageArchiver.MAX_COUNT_FOR_CAN_ARCHIVE_CHECK &&
    isSingleFolder
  ) {
    const folder = messages[0].folder;
    const folderIdentity = folder.customIdentity;
    if (folderIdentity) {
      return folderIdentity.archiveEnabled;
    }

    if (folder.server) {
      const serverIdentities = MailServices.accounts.getIdentitiesForServer(
        folder.server
      );

      // Do all identities have the same archiveEnabled setting?
      if (serverIdentities.every(id => id.archiveEnabled)) {
        return true;
      }
      if (serverIdentities.every(id => !id.archiveEnabled)) {
        return false;
      }
      // If we get here it's a mixture, so have to examine all the messages.
    }
  }

  // Either we've selected a small number of messages or we just can't
  // fast-path the result; examine all the messages.
  return messages.every(function (msg) {
    const [identity] = lazy.MailUtils.getIdentityForHeader(msg);
    return Boolean(identity && identity.archiveEnabled);
  });
};

// Bad things happen if you have multiple archivers running on the same
// messages (See Bug 1705824). We could probably make this more fine
// grained, and maintain a list of messages/folders already queued up...
// but that'd get complex quick, so let's keep things simple for now and
// only allow one active archiver.
let gIsArchiving = false;

MessageArchiver.prototype = {
  /**
   * Archive messages and wait for all batches to finish.
   *
   * @param {nsIMsgDBHdr[]} msgHdrs - The messages to archive.
   * @returns {Promise<void>} Resolves when archiving finishes, including for
   *   empty input. Rejects if destination setup or message copying fails.
   * @throws {Error} If another archiver is running.
   */
  async archiveMessages(msgHdrs) {
    if (!msgHdrs.length) {
      return;
    }
    if (gIsArchiving) {
      throw new Error("Can only have one MessageArchiver running at once");
    }
    gIsArchiving = true;

    try {
      /** @type {Record<string, ArchiveBatch>} */
      const batches = {};
      for (const msgHdr of msgHdrs) {
        // Convert date to JS date object.
        const msgDate = new Date(msgHdr.date / 1000);
        const msgYear = msgDate.getFullYear().toString();
        const monthFolderName =
          msgYear + "-" + (msgDate.getMonth() + 1).toString().padStart(2, "0");

        let archiveFolder;
        let archiveGranularity;
        let archiveKeepFolderStructure;
        let archiveRecreateInbox;

        const [identity] = lazy.MailUtils.getIdentityForHeader(msgHdr);
        if (!identity || msgHdr.folder.server.type == "rss") {
          // If no identity, or a server (RSS) which doesn't have an identity
          // and doesn't want the default unrelated identity value, figure
          // this out based on the default identity prefs.
          const enabled = Services.prefs.getBoolPref(
            "mail.identity.default.archive_enabled"
          );
          if (!enabled) {
            continue;
          }

          archiveFolder = msgHdr.folder.rootFolder.getChildNamed("Archives");
          if (!archiveFolder) {
            archiveFolder =
              await msgHdr.folder.rootFolder.createSubfolderAsync("Archives");
          }
          archiveFolder.setFlag(Ci.nsMsgFolderFlags.Archive);
          archiveGranularity = Services.prefs.getIntPref(
            "mail.identity.default.archive_granularity"
          );
          archiveKeepFolderStructure = Services.prefs.getBoolPref(
            "mail.identity.default.archive_keep_folder_structure"
          );
          archiveRecreateInbox = Services.prefs.getBoolPref(
            "mail.identity.default.archive_recreate_inbox"
          );
        } else {
          if (!identity.archiveEnabled) {
            continue;
          }

          archiveFolder = await identity.getOrCreateArchivesFolderAsync();
          archiveGranularity = identity.archiveGranularity;
          archiveKeepFolderStructure = identity.archiveKeepFolderStructure;
          archiveRecreateInbox = identity.archiveRecreateInbox;
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
        if (!(copyBatchKey in batches)) {
          batches[copyBatchKey] = {
            srcFolder: msgHdr.folder,
            archiveFolder,
            granularity: archiveGranularity,
            keepFolderStructure: archiveKeepFolderStructure,
            recreateInbox: archiveRecreateInbox,
            yearFolderName: msgYear,
            monthFolderName,
            messages: [],
          };
        }
        batches[copyBatchKey].messages.push(msgHdr);
      }

      for (const batch of Object.values(batches)) {
        await this.filterBatch(batch);
        await this.continueBatch(batch);
      }
    } finally {
      gIsArchiving = false;
    }
  },

  /**
   * Run archive filters for a batch, logging filter failures before continuing.
   *
   * @param {ArchiveBatch} batch - The batch to filter.
   * @returns {Promise<void>} Resolves when the filters finish.
   */
  filterBatch(batch) {
    return new Promise(resolve => {
      MailServices.filters.applyFilters(
        Ci.nsMsgFilterType.Archive,
        batch.messages,
        [],
        batch.srcFolder,
        this.interactive,
        {
          QueryInterface: ChromeUtils.generateQI(["nsIMsgOperationListener"]),
          onStopOperation(result) {
            if (!Components.isSuccessCode(result)) {
              // Continue archiving even if a filter failed.
              console.error("Archive filter failed: " + result);
            }
            resolve();
          },
        }
      );
    });
  },

  /**
   * Archive the messages that remain after filtering a batch.
   *
   * @param {ArchiveBatch} batch - The filtered batch.
   * @returns {Promise<void>} Resolves after copying or moving the messages.
   */
  async continueBatch(batch) {
    const srcFolder = batch.srcFolder;
    const archiveFolder = batch.archiveFolder;
    let dstFolder = archiveFolder;

    const moveArray = [];
    // Don't move any items that the filter moves or deleted
    for (const item of batch.messages) {
      if (
        srcFolder.msgDatabase.containsKey(item.messageKey) &&
        !(
          srcFolder.getProcessingFlags(item.messageKey) &
          Ci.nsMsgProcessingFlags.FilterToMove
        )
      ) {
        moveArray.push(item);
      }
    }

    if (moveArray.length == 0) {
      return;
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
      if (!dstFolder.containsChildNamed(batch.yearFolderName)) {
        await dstFolder.createSubfolderAsync(batch.yearFolderName);
      }
      dstFolder = dstFolder.getChildNamed(batch.yearFolderName);
    }
    if (granularity >= Ci.nsIMsgIdentity.perMonthArchiveFolders) {
      if (!dstFolder.containsChildNamed(batch.monthFolderName)) {
        await dstFolder.createSubfolderAsync(batch.monthFolderName);
      }
      dstFolder = dstFolder.getChildNamed(batch.monthFolderName);
    }

    if (archiveFolder.canCreateSubfolders && batch.keepFolderStructure) {
      // Collect in-order list of folders of source folder structure,
      // excluding top-level INBOX folder. Use the localized names so that the
      // archive structure matches what the user sees in the folder pane.
      const folderNames = [];
      const rootFolder = srcFolder.server.rootFolder;
      const inboxFolder = lazy.MailUtils.getInboxFolder(srcFolder.server);
      let folder = srcFolder;
      while (
        folder != rootFolder &&
        (folder != inboxFolder || batch.recreateInbox)
      ) {
        folderNames.unshift(folder.localizedName);
        folder = folder.parent;
      }
      // Determine Archive folder structure.
      for (let i = 0; i < folderNames.length; ++i) {
        const folderName = folderNames[i];
        if (!dstFolder.containsChildNamed(folderName)) {
          await dstFolder.createSubfolderAsync(folderName);
        }
        dstFolder = dstFolder.getChildNamed(folderName);
      }
    }

    if (dstFolder != srcFolder) {
      const isNews = srcFolder.flags & Ci.nsMsgFolderFlags.Newsgroup;
      // If the source folder doesn't support deleting messages, we
      // make archive a copy, not a move.
      const isMove = srcFolder.canDeleteMessages && !isNews;
      await new Promise((resolve, reject) => {
        MailServices.copy.copyMessages(
          srcFolder,
          moveArray,
          dstFolder,
          isMove,
          {
            QueryInterface: ChromeUtils.generateQI([
              "nsIMsgCopyServiceListener",
            ]),
            onStartCopy() {},
            onProgress() {},
            setMessageKey() {},
            getMessageId() {
              return null;
            },
            onStopCopy(status) {
              if (Components.isSuccessCode(status)) {
                resolve();
              } else {
                reject(Components.Exception("Archive failed to copy", status));
              }
            },
          },
          true,
          true
        );
      });
    }
  },
};
