/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This file provides a number of methods for modifying (synthetic) messages
 *  for testing purposes.
 */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

/**
 * Represents a set of synthetic messages, also supporting insertion into and
 *  tracking of the message folders to which they belong.  This then allows
 *  mutations of the messages (in their folders) for testing purposes.
 *
 * In general, you would create a synthetic message set by passing in only a
 *  list of synthetic messages, and then add then messages to nsIMsgFolders by
 *  using one of the addMessage* methods.  This will populate the aMsgFolders
 *  and aFolderIndices values.  (They are primarily intended for reasons of
 *  slicing, but people who know what they are doing can also use them.)
 *
 * @param aSynMessages The synthetic messages that should belong to this set.
 * @param aMsgFolders Optional nsIMsgDBFolder or list of folders.
 * @param aFolderIndices Optional list where each value is an index into the
 *     msgFolders attribute, specifying what folder the message can be found
 *     in.  The value may also be null if the message has not yet been
 *     inserted into a folder.
 */
function SyntheticMessageSet(aSynMessages, aMsgFolders, aFolderIndices) {
  this.synMessages = aSynMessages;

  if (Array.isArray(aMsgFolders)) {
    this.msgFolders = aMsgFolders;
  } else if (aMsgFolders) {
    this.msgFolders = [aMsgFolders];
  } else {
    this.msgFolders = [];
  }

  if (aFolderIndices == null) {
    this.folderIndices = aSynMessages.map(_ => null);
  } else {
    this.folderIndices = aFolderIndices;
  }
}
SyntheticMessageSet.prototype = {
  /**
   * Helper method for messageInjection to use to tell us it is injecting a
   *  message in a given folder.  As a convenience, we also return the
   *  synthetic message.
   *
   * @protected
   */
  _trackMessageAddition(aFolder, aMessageIndex) {
    let aFolderIndex = this.msgFolders.indexOf(aFolder);
    if (aFolderIndex == -1) {
      aFolderIndex = this.msgFolders.push(aFolder) - 1;
    }
    this.folderIndices[aMessageIndex] = aFolderIndex;
    return this.synMessages[aMessageIndex];
  },
  /**
   * Helper method for use by |async_move_messages| to tell us that it moved
   *  all the messages from aOldFolder to aNewFolder.
   */
  _folderSwap(aOldFolder, aNewFolder) {
    let folderIndex = this.msgFolders.indexOf(aOldFolder);
    this.msgFolders[folderIndex] = aNewFolder;
  },

  /**
   * Union this set with another set and return the (new) result.
   *
   * @param aOtherSet The other synthetic message set.
   * @returns a new SyntheticMessageSet containing the union of this set and
   *     the other set.
   */
  union(aOtherSet) {
    let messages = this.synMessages.concat(aOtherSet.synMessages);
    let folders = this.msgFolders.concat();
    let indices = this.folderIndices.concat();

    let folderUrisToIndices = {};
    for (let [iFolder, folder] of this.msgFolders.entries()) {
      folderUrisToIndices[folder.URI] = iFolder;
    }

    for (let iOther = 0; iOther < aOtherSet.synMessages.length; iOther++) {
      let folderIndex = aOtherSet.folderIndices[iOther];
      if (folderIndex == null) {
        indices.push(folderIndex);
      } else {
        let folder = aOtherSet.msgFolders[folderIndex];
        if (!(folder.URI in folderUrisToIndices)) {
          folderUrisToIndices[folder.URI] = folders.length;
          folders.push(folder);
        }
        indices.push(folderUrisToIndices[folder.URI]);
      }
    }

    return new SyntheticMessageSet(messages, folders, indices);
  },

  /**
   * Get the single message header of the message at the given index; use
   *  |msgHdrs| if you want to get all the headers at once.
   */
  getMsgHdr(aIndex) {
    let folder = this.msgFolders[this.folderIndices[aIndex]];
    let synMsg = this.synMessages[aIndex];
    return folder.msgDatabase.getMsgHdrForMessageID(synMsg.messageId);
  },

  /**
   * Get the URI for the message at the given index.
   */
  getMsgURI(aIndex) {
    let msgHdr = this.getMsgHdr(aIndex);
    return msgHdr.folder.getUriForMsg(msgHdr);
  },

  /**
   * @return a JS iterator of the message headers for all messages inserted into
   *     a folder.
   */
  *msgHdrs() {
    // get the databases
    let msgDatabases = this.msgFolders.map(folder => folder.msgDatabase);
    for (let [iMsg, synMsg] of this.synMessages.entries()) {
      let folderIndex = this.folderIndices[iMsg];
      if (folderIndex != null) {
        yield msgDatabases[folderIndex].getMsgHdrForMessageID(synMsg.messageId);
      }
    }
  },
  /**
   * @return a JS list of the message headers for all messages inserted into a
   *     folder.
   */
  get msgHdrList() {
    return Array.from(this.msgHdrs());
  },
  /**
   * @return a list where each item is a list with two elements; the first is
   *     an nsIMsgFolder, and the second is a list of all of the nsIMsgDBHdrs
   *     for the synthetic messages in the set inserted into that folder.
   */
  get foldersWithMsgHdrs() {
    let results = this.msgFolders.map(folder => [folder, []]);
    for (let [iMsg, synMsg] of this.synMessages.entries()) {
      let folderIndex = this.folderIndices[iMsg];
      if (folderIndex != null) {
        let [folder, msgHdrs] = results[folderIndex];
        msgHdrs.push(
          folder.msgDatabase.getMsgHdrForMessageID(synMsg.messageId)
        );
      }
    }
    return results;
  },
  /**
   * Sets the status of the messages to read/unread.
   *
   * @param aRead    true/false to set messages as read/unread
   * @param aMsgHdr  A message header to work on. If not specified,
   *                 mark all messages in the current set.
   */
  setRead(aRead, aMsgHdr) {
    let msgHdrs = aMsgHdr ? [aMsgHdr] : this.msgHdrList;
    for (let msgHdr of msgHdrs) {
      msgHdr.markRead(aRead);
    }
  },
  setStarred(aStarred) {
    for (let msgHdr of this.msgHdrs()) {
      msgHdr.markFlagged(aStarred);
    }
  },
  addTag(aTagName) {
    for (let [folder, msgHdrs] of this.foldersWithMsgHdrs) {
      folder.addKeywordsToMessages(msgHdrs, aTagName);
    }
  },
  removeTag(aTagName) {
    for (let [folder, msgHdrs] of this.foldersWithMsgHdrs) {
      folder.removeKeywordsFromMessages(msgHdrs, aTagName);
    }
  },
  /**
   * Sets the junk score for the messages to junk/non-junk.  It does not
   *  involve the bayesian classifier because we really don't want it
   *  affecting our unit tests!  (Unless we were testing the bayesian
   *  classifier.  Which I'm conveniently not.  Feel free to add a
   *  "setJunkForRealsies" method if you are.)
   *
   * @param aIsJunk  true/false to set messages to junk/non-junk
   * @param aMsgHdr  A message header to work on. If not specified,
   *                 mark all messages in the current set.
   * Generates a msgsJunkStatusChanged nsIMsgFolderListener notification.
   */
  setJunk(aIsJunk, aMsgHdr) {
    let junkscore = aIsJunk ? "100" : "0";
    let msgHdrs = aMsgHdr ? [aMsgHdr] : this.msgHdrList;
    for (let msgHdr of msgHdrs) {
      msgHdr.setStringProperty("junkscore", junkscore);
    }
    MailServices.mfn.notifyMsgsJunkStatusChanged(msgHdrs);
  },

  /**
   * Slice the message set using the exact Array.prototype.slice semantics
   * (because we call Array.prototype.slice).
   */
  slice(...aArgs) {
    let slicedMessages = this.synMessages.slice(...aArgs);
    let slicedIndices = this.folderIndices.slice(...aArgs);
    let sliced = new SyntheticMessageSet(
      slicedMessages,
      this.msgFolders,
      slicedIndices
    );
    if ("glodaMessages" in this && this.glodaMessages) {
      sliced.glodaMessages = this.glodaMessages.slice(...aArgs);
    }
    return sliced;
  },
};
