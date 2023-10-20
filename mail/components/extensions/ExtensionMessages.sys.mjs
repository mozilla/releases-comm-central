/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import { EventEmitter } from "resource://gre/modules/EventEmitter.sys.mjs";
import { ExtensionUtils } from "resource://gre/modules/ExtensionUtils.sys.mjs";
import { setTimeout, clearTimeout } from "resource://gre/modules/Timer.sys.mjs";

import { convertFolder } from "resource:///modules/ExtensionAccounts.sys.mjs";

var { ExtensionError } = ExtensionUtils;
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "gJunkThreshold",
  "mail.adaptivefilters.junk_threshold",
  90
);
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "gMessagesPerPage",
  "extensions.webextensions.messagesPerPage",
  100
);

/**
 * Class for cached message headers to reduce XPCOM requests and to cache msgHdr
 * of file and attachment messages.
 */
export class CachedMsgHeader {
  constructor(msgHdr) {
    this.mProperties = {};

    // Properties needed by convertMessage().
    this.author = null;
    this.subject = "";
    this.recipients = null;
    this.ccList = null;
    this.bccList = null;
    this.messageId = null;
    this.date = 0;
    this.flags = 0;
    this.isRead = false;
    this.isFlagged = false;
    this.messageSize = 0;
    this.folder = null;

    // Additional properties.
    this.accountKey = "";

    if (msgHdr) {
      // Cache all elements which are needed by convertMessage().
      this.author = msgHdr.mime2DecodedAuthor;
      this.subject = msgHdr.mime2DecodedSubject;
      this.recipients = msgHdr.mime2DecodedRecipients;
      this.ccList = msgHdr.ccList;
      this.bccList = msgHdr.bccList;
      this.messageId = msgHdr.messageId;
      this.date = msgHdr.date;
      this.flags = msgHdr.flags;
      this.isRead = msgHdr.isRead;
      this.isFlagged = msgHdr.isFlagged;
      this.messageSize = msgHdr.messageSize;
      this.folder = msgHdr.folder;

      this.mProperties.junkscore = msgHdr.getStringProperty("junkscore");
      this.mProperties.keywords = msgHdr.getStringProperty("keywords");

      if (this.folder) {
        this.messageKey = msgHdr.messageKey;
      } else {
        this.mProperties.dummyMsgUrl = msgHdr.getStringProperty("dummyMsgUrl");
        this.mProperties.dummyMsgLastModifiedTime = msgHdr.getUint32Property(
          "dummyMsgLastModifiedTime"
        );
      }

      // Also cache the additional elements.
      this.accountKey = msgHdr.accountKey;
    }
  }

  getProperty(aProperty) {
    return this.getStringProperty(aProperty);
  }
  setProperty(aProperty, aVal) {
    return this.setStringProperty(aProperty, aVal);
  }
  getStringProperty(aProperty) {
    if (this.mProperties.hasOwnProperty(aProperty)) {
      return this.mProperties[aProperty];
    }
    return "";
  }
  setStringProperty(aProperty, aVal) {
    this.mProperties[aProperty] = aVal;
  }
  getUint32Property(aProperty) {
    if (this.mProperties.hasOwnProperty(aProperty)) {
      return parseInt(this.mProperties[aProperty]);
    }
    return 0;
  }
  setUint32Property(aProperty, aVal) {
    this.mProperties[aProperty] = aVal.toString();
  }
  markHasAttachments(hasAttachments) {}
  get mime2DecodedAuthor() {
    return this.author;
  }
  get mime2DecodedSubject() {
    return this.subject;
  }
  get mime2DecodedRecipients() {
    return this.recipients;
  }
}

/**
 * Checks if the provided dummyMsgUrl belongs to an attached message.
 */
function isAttachedMessageUrl(dummyMsgUrl) {
  try {
    return dummyMsgUrl && new URL(dummyMsgUrl).searchParams.has("part");
  } catch (ex) {
    return false;
  }
}

/**
 * A map of numeric identifiers to messages for easy reference.
 *
 * @implements {nsIFolderListener}
 * @implements {nsIMsgFolderListener}
 * @implements {nsIObserver}
 */
export class MessageTracker extends EventEmitter {
  constructor(windowTracker) {
    super();
    this._nextId = 1;
    this._messages = new Map();
    this._messageIds = new Map();
    this._listenerCount = 0;
    this._pendingKeyChanges = new Map();
    this._dummyMessageHeaders = new Map();
    this._windowTracker = windowTracker;

    // nsIObserver
    Services.obs.addObserver(this, "quit-application-granted");
    Services.obs.addObserver(this, "attachment-delete-msgkey-changed");
    // nsIFolderListener
    MailServices.mailSession.AddFolderListener(
      this,
      Ci.nsIFolderListener.propertyFlagChanged |
        Ci.nsIFolderListener.intPropertyChanged
    );
    // nsIMsgFolderListener
    MailServices.mfn.addListener(
      this,
      MailServices.mfn.msgsJunkStatusChanged |
        MailServices.mfn.msgsDeleted |
        MailServices.mfn.msgsMoveCopyCompleted |
        MailServices.mfn.msgKeyChanged
    );

    this._messageOpenListenerRegistered = false;
    try {
      this._windowTracker.addListener("MsgLoaded", this);
      this._messageOpenListenerRegistered = true;
    } catch (ex) {
      // Fails during XPCSHELL tests, which mock the WindowWatcher but do not
      // implement registerNotification.
    }
  }

  // Event handler for MsgLoaded event.
  handleEvent(event) {
    let msgHdr = event.detail;
    // It is not possible to retrieve the dummyMsgHdr of messages opened
    // from file at a later time, track them manually.
    if (
      msgHdr &&
      !msgHdr.folder &&
      msgHdr.getStringProperty("dummyMsgUrl").startsWith("file://")
    ) {
      this.getId(msgHdr);
    }
  }

  cleanup() {
    // nsIObserver
    Services.obs.removeObserver(this, "quit-application-granted");
    Services.obs.removeObserver(this, "attachment-delete-msgkey-changed");
    // nsIFolderListener
    MailServices.mailSession.RemoveFolderListener(this);
    // nsIMsgFolderListener
    MailServices.mfn.removeListener(this);
    if (this._messageOpenListenerRegistered) {
      this._windowTracker.removeListener("MsgLoaded", this);
      this._messageOpenListenerRegistered = false;
    }
  }

  /**
   * Generates a hash for the given msgIdentifier.
   *
   * @param {*} msgIdentifier
   * @returns {string}
   */
  getHash(msgIdentifier) {
    if (msgIdentifier.folderURI) {
      return `folderURI:${msgIdentifier.folderURI}, messageKey: ${msgIdentifier.messageKey}`;
    }
    return `dummyMsgUrl:${msgIdentifier.dummyMsgUrl}, dummyMsgLastModifiedTime: ${msgIdentifier.dummyMsgLastModifiedTime}`;
  }

  /**
   * Maps the provided message identifier to the given messageTracker id.
   *
   * @param {integer} id - messageTracker id of the message
   * @param {*} msgIdentifier - msgIdentifier of the message
   * @param {nsIMsgDBHdr} [msgHdr] - optional msgHdr of the message, will be
   *   added to the cache if it is a dummy msgHdr (a file or attachment message)
   */
  _set(id, msgIdentifier, msgHdr) {
    let hash = this.getHash(msgIdentifier);
    this._messageIds.set(hash, id);
    this._messages.set(id, msgIdentifier);
    // Keep track of dummy message headers, which do not have a folder property
    // and cannot be retrieved later.
    if (msgHdr && !msgHdr.folder && msgIdentifier.dummyMsgUrl) {
      this._dummyMessageHeaders.set(
        msgIdentifier.dummyMsgUrl,
        msgHdr instanceof Ci.nsIMsgDBHdr ? new CachedMsgHeader(msgHdr) : msgHdr
      );
    }
  }

  /**
   * Lookup the messageTracker id for the given message identifier, return null
   * if not known.
   *
   * @param {*} msgIdentifier - msgIdentifier of the message
   * @returns {integer} The messageTracker id of the message.
   */
  _get(msgIdentifier) {
    let hash = this.getHash(msgIdentifier);
    if (this._messageIds.has(hash)) {
      return this._messageIds.get(hash);
    }
    return null;
  }

  /**
   * Removes the provided message identifier from the messageTracker.
   *
   * @param {*} msgIdentifier - msgIdentifier of the message
   */
  _remove(msgIdentifier) {
    let hash = this.getHash(msgIdentifier);
    let id = this._get(msgIdentifier);
    this._messages.delete(id);
    this._messageIds.delete(hash);
    this._dummyMessageHeaders.delete(msgIdentifier.dummyMsgUrl);
  }

  /**
   * Finds a message in the messageTracker or adds it.
   *
   * @param {nsIMsgDBHdr} - msgHdr of the requested message
   * @returns {integer} The messageTracker id of the message.
   */
  getId(msgHdr) {
    let msgIdentifier;
    if (msgHdr.folder) {
      msgIdentifier = {
        folderURI: msgHdr.folder.URI,
        messageKey: msgHdr.messageKey,
      };
    } else {
      // Normalize the dummyMsgUrl by sorting its parameters and striping them
      // to a minimum.
      let url = new URL(msgHdr.getStringProperty("dummyMsgUrl"));
      let parameters = Array.from(url.searchParams, p => p[0]).filter(
        p => !["group", "number", "key", "part"].includes(p)
      );
      for (let parameter of parameters) {
        url.searchParams.delete(parameter);
      }
      url.searchParams.sort();

      msgIdentifier = {
        dummyMsgUrl: url.href,
        dummyMsgLastModifiedTime: msgHdr.getUint32Property(
          "dummyMsgLastModifiedTime"
        ),
      };
    }

    let id = this._get(msgIdentifier);
    if (id) {
      return id;
    }
    id = this._nextId++;

    this._set(id, msgIdentifier, msgHdr);
    return id;
  }

  /**
   * Check if the provided msgIdentifier belongs to a modified file message.
   *
   * @param {*} msgIdentifier - msgIdentifier object of the message
   * @returns {boolean}
   */
  isModifiedFileMsg(msgIdentifier) {
    if (!msgIdentifier.dummyMsgUrl?.startsWith("file://")) {
      return false;
    }

    try {
      let file = Services.io
        .newURI(msgIdentifier.dummyMsgUrl)
        .QueryInterface(Ci.nsIFileURL).file;
      if (!file?.exists()) {
        throw new ExtensionError("File does not exist");
      }
      if (
        msgIdentifier.dummyMsgLastModifiedTime &&
        Math.floor(file.lastModifiedTime / 1000000) !=
          msgIdentifier.dummyMsgLastModifiedTime
      ) {
        throw new ExtensionError("File has been modified");
      }
    } catch (ex) {
      console.error(ex);
      return true;
    }
    return false;
  }

  /**
   * Retrieves a message from the messageTracker. If the message no longer,
   * exists it is removed from the messageTracker.
   *
   * @param {integer} id - messageTracker id of the message
   * @returns {nsIMsgDBHdr} The identifier of the message.
   */
  getMessage(id) {
    let msgIdentifier = this._messages.get(id);
    if (!msgIdentifier) {
      return null;
    }

    if (msgIdentifier.folderURI) {
      let folder = MailServices.folderLookup.getFolderForURL(
        msgIdentifier.folderURI
      );
      if (folder) {
        let msgHdr = folder.msgDatabase.getMsgHdrForKey(
          msgIdentifier.messageKey
        );
        if (msgHdr) {
          return msgHdr;
        }
      }
    } else {
      let msgHdr = this._dummyMessageHeaders.get(msgIdentifier.dummyMsgUrl);
      if (msgHdr && !this.isModifiedFileMsg(msgIdentifier)) {
        return msgHdr;
      }
    }

    this._remove(msgIdentifier);
    return null;
  }

  /**
   * Converts an nsIMsgDBHdr to a simple object for use in messages.
   * This function WILL change as the API develops.
   *
   * @param {nsIMsgDBHdr} msgHdr
   * @param {ExtensionData} extension
   *
   * @returns {MessageHeader} MessageHeader object
   *
   * @see /mail/components/extensions/schemas/messages.json
   */
  convertMessage(msgHdr, extension) {
    if (!msgHdr) {
      return null;
    }

    let composeFields = Cc[
      "@mozilla.org/messengercompose/composefields;1"
    ].createInstance(Ci.nsIMsgCompFields);

    // Cache msgHdr to reduce XPCOM requests.
    let cachedHdr = new CachedMsgHeader(msgHdr);

    let junkScore = parseInt(cachedHdr.getStringProperty("junkscore"), 10) || 0;
    let tags = (cachedHdr.getStringProperty("keywords") || "")
      .split(" ")
      .filter(MailServices.tags.isValidKey);

    // Getting the size of attached messages does not work consistently. For imap://
    // and mailbox:// messages the returned size in msgHdr.messageSize is 0, and for
    // file:// messages the returned size is always the total file size
    // Be consistent here and always return 0. The user can obtain the message size
    // from the size of the associated attachment file.
    let size = isAttachedMessageUrl(cachedHdr.getStringProperty("dummyMsgUrl"))
      ? 0
      : cachedHdr.messageSize;

    let messageObject = {
      id: this.getId(cachedHdr),
      date: new Date(Math.round(cachedHdr.date / 1000)),
      author: cachedHdr.mime2DecodedAuthor,
      recipients: cachedHdr.mime2DecodedRecipients
        ? composeFields.splitRecipients(cachedHdr.mime2DecodedRecipients, false)
        : [],
      ccList: cachedHdr.ccList
        ? composeFields.splitRecipients(cachedHdr.ccList, false)
        : [],
      bccList: cachedHdr.bccList
        ? composeFields.splitRecipients(cachedHdr.bccList, false)
        : [],
      subject: cachedHdr.mime2DecodedSubject,
      read: cachedHdr.isRead,
      new: !!(cachedHdr.flags & Ci.nsMsgMessageFlags.New),
      headersOnly: !!(cachedHdr.flags & Ci.nsMsgMessageFlags.Partial),
      flagged: !!cachedHdr.isFlagged,
      junk: junkScore >= lazy.gJunkThreshold,
      junkScore,
      headerMessageId: cachedHdr.messageId,
      size,
      tags,
      external: !cachedHdr.folder,
    };
    // convertMessage can be called without providing an extension, if the info is
    // needed for multiple extensions. The caller has to ensure that the folder info
    // is not forwarded to extensions, which do not have the required permission.
    if (
      cachedHdr.folder &&
      (!extension || extension.hasPermission("accountsRead"))
    ) {
      messageObject.folder = convertFolder(cachedHdr.folder);
    }
    return messageObject;
  }

  // nsIFolderListener

  onFolderPropertyFlagChanged(item, property, oldFlag, newFlag) {
    let changes = {};
    switch (property) {
      case "Status":
        if ((oldFlag ^ newFlag) & Ci.nsMsgMessageFlags.Read) {
          changes.read = item.isRead;
        }
        if ((oldFlag ^ newFlag) & Ci.nsMsgMessageFlags.New) {
          changes.new = !!(newFlag & Ci.nsMsgMessageFlags.New);
        }
        break;
      case "Flagged":
        changes.flagged = item.isFlagged;
        break;
      case "Keywords":
        {
          let tags = item.getStringProperty("keywords");
          tags = tags ? tags.split(" ") : [];
          changes.tags = tags.filter(MailServices.tags.isValidKey);
        }
        break;
    }
    if (Object.keys(changes).length) {
      this.emit("message-updated", item, changes);
    }
  }

  onFolderIntPropertyChanged(folder, property, oldValue, newValue) {
    switch (property) {
      case "BiffState":
        if (newValue == Ci.nsIMsgFolder.nsMsgBiffState_NewMail) {
          // The folder argument is a root folder.
          this.findNewMessages(folder);
        }
        break;
      case "NewMailReceived":
        // The folder argument is a real folder.
        this.findNewMessages(folder);
        break;
    }
  }

  /**
   * Finds all folders with new messages in the specified changedFolder and
   * returns those.
   *
   * @see MailNotificationManager._getFirstRealFolderWithNewMail()
   */
  findNewMessages(changedFolder) {
    let folders = changedFolder.descendants;
    folders.unshift(changedFolder);
    for (let folder of folders) {
      let flags = folder.flags;
      if (
        !(flags & Ci.nsMsgFolderFlags.Inbox) &&
        flags & (Ci.nsMsgFolderFlags.SpecialUse | Ci.nsMsgFolderFlags.Virtual)
      ) {
        // Do not notify if the folder is not Inbox but one of
        // Drafts|Trash|SentMail|Templates|Junk|Archive|Queue or Virtual.
        continue;
      }
      let numNewMessages = folder.getNumNewMessages(false);
      if (!numNewMessages) {
        continue;
      }
      let msgDb = folder.msgDatabase;
      let newMsgKeys = msgDb.getNewList().slice(-numNewMessages);
      if (newMsgKeys.length == 0) {
        continue;
      }
      this.emit(
        "messages-received",
        folder,
        newMsgKeys.map(key => msgDb.getMsgHdrForKey(key))
      );
    }
  }

  // nsIMsgFolderListener

  msgsJunkStatusChanged(messages) {
    for (let msgHdr of messages) {
      let junkScore = parseInt(msgHdr.getStringProperty("junkscore"), 10) || 0;
      this.emit("message-updated", msgHdr, {
        junk: junkScore >= lazy.gJunkThreshold,
      });
    }
  }

  msgsDeleted(deletedMsgs) {
    if (deletedMsgs.length > 0) {
      this.emit("messages-deleted", deletedMsgs);
    }
  }

  msgsMoveCopyCompleted(move, srcMsgs, dstFolder, dstMsgs) {
    if (srcMsgs.length > 0 && dstMsgs.length > 0) {
      let emitMsg = move ? "messages-moved" : "messages-copied";
      this.emit(emitMsg, srcMsgs, dstMsgs);
    }
  }

  msgKeyChanged(oldKey, newMsgHdr) {
    // For IMAP messages there is a delayed update of database keys and if those
    // keys change, the messageTracker needs to update its maps, otherwise wrong
    // messages will be returned. Key changes are replayed in multi-step swaps.
    let newKey = newMsgHdr.messageKey;

    // Replay pending swaps.
    while (this._pendingKeyChanges.has(oldKey)) {
      let next = this._pendingKeyChanges.get(oldKey);
      this._pendingKeyChanges.delete(oldKey);
      oldKey = next;

      // Check if we are left with a no-op swap and exit early.
      if (oldKey == newKey) {
        this._pendingKeyChanges.delete(oldKey);
        return;
      }
    }

    if (oldKey != newKey) {
      // New key swap, log the mirror swap as pending.
      this._pendingKeyChanges.set(newKey, oldKey);

      // Swap tracker entries.
      let oldId = this._get({
        folderURI: newMsgHdr.folder.URI,
        messageKey: oldKey,
      });
      let newId = this._get({
        folderURI: newMsgHdr.folder.URI,
        messageKey: newKey,
      });
      this._set(oldId, { folderURI: newMsgHdr.folder.URI, messageKey: newKey });
      this._set(newId, { folderURI: newMsgHdr.folder.URI, messageKey: oldKey });
    }
  }

  // nsIObserver

  /**
   * Observer to update message tracker if a message has received a new key due
   * to attachments being removed, which we do not consider to be a new message.
   */
  observe(subject, topic, data) {
    if (topic == "attachment-delete-msgkey-changed") {
      data = JSON.parse(data);

      if (data && data.folderURI && data.oldMessageKey && data.newMessageKey) {
        let id = this._get({
          folderURI: data.folderURI,
          messageKey: data.oldMessageKey,
        });
        if (id) {
          // Replace tracker entries.
          this._set(id, {
            folderURI: data.folderURI,
            messageKey: data.newMessageKey,
          });
        }
      }
    } else if (topic == "quit-application-granted") {
      this.cleanup();
    }
  }
}

/**
 * Convenience class to handle message pages.
 */
class MessagePage {
  constructor() {
    this.messages = [];
    this.read = false;
    this._deferredPromise = new Promise(resolve => {
      this._resolveDeferredPromise = resolve;
    });
  }

  get promise() {
    return this._deferredPromise;
  }

  resolvePage() {
    this._resolveDeferredPromise(this.messages);
  }
}

/**
 * Convenience class to keep track of the status of message lists.
 */
export class MessageList {
  constructor(extension, messageTracker) {
    this.messageListId = Services.uuid.generateUUID().number.substring(1, 37);
    this.extension = extension;
    this.isDone = false;
    this.pages = [];
    this._messageTracker = messageTracker;
    this.autoPaginatorTimeout = null;

    this.addPage();
  }

  addPage() {
    if (this.autoPaginatorTimeout) {
      clearTimeout(this.autoPaginatorTimeout);
      this.autoPaginatorTimeout = null;
    }

    if (this.isDone) {
      return;
    }

    // Adding a page will make this.currentPage point to the new page.
    let previousPage = this.currentPage;

    // If the current page has no messages, there is no need to add a page.
    if (previousPage && previousPage.messages.length == 0) {
      return;
    }

    this.pages.push(new MessagePage());
    // The previous page is finished and can be resolved.
    if (previousPage) {
      previousPage.resolvePage();
    }
  }

  get currentPage() {
    return this.pages.length > 0 ? this.pages[this.pages.length - 1] : null;
  }

  get id() {
    return this.messageListId;
  }

  addMessage(message) {
    if (this.isDone || !this.currentPage) {
      return;
    }
    if (this.currentPage.messages.length >= lazy.gMessagesPerPage) {
      this.addPage();
    }

    this.currentPage.messages.push(
      this._messageTracker.convertMessage(message, this.extension)
    );

    // Automatically push a new page and return the page with this message after
    // a fixed amount of time, so that small sets of search results are not held
    // back until a full page has been found or the entire search has finished.
    if (!this.autoPaginatorTimeout) {
      this.autoPaginatorTimeout = setTimeout(this.addPage.bind(this), 1000);
    }
  }

  done() {
    if (this.isDone) {
      return;
    }
    this.isDone = true;

    // Resolve the current page.
    if (this.currentPage) {
      this.currentPage.resolvePage();
    }
  }

  async getNextUnreadPage() {
    let page = this.pages.find(p => !p.read);
    if (!page) {
      return null;
    }

    let messages = await page.promise;
    page.read = true;

    return {
      id: this.pages.find(p => !p.read) ? this.id : null,
      messages,
    };
  }
}

/**
 * Tracks lists of messages so that an extension can consume them in chunks.
 * Any WebExtensions method that could return multiple messages should instead call
 * messageListTracker.startList and return the results, which contain the first
 * chunk. Further chunks can be fetched by the extension calling
 * browser.messages.continueList. Chunk size is controlled by a pref.
 */
export class MessageListTracker {
  constructor(messageTracker) {
    this._contextLists = new WeakMap();
    this._messageTracker = messageTracker;
  }

  /**
   * Takes an array or enumerator of messages and returns a Promise for the first
   * page, which will resolve as soon as it is available.
   *
   * @returns {object}
   */
  startList(messages, extension) {
    let messageList = this.createList(extension);
    this._addMessages(messages, messageList);
    return this.getNextPage(messageList);
  }

  /**
   * Add messages to a messageList.
   */
  async _addMessages(messages, messageList) {
    if (messageList.isDone) {
      return;
    }
    if (Array.isArray(messages)) {
      messages = this._createEnumerator(messages);
    }
    while (messages.hasMoreElements()) {
      let next = messages.getNext();
      messageList.addMessage(next.QueryInterface(Ci.nsIMsgDBHdr));
    }
    messageList.done();
  }

  _createEnumerator(array) {
    let current = 0;
    return {
      hasMoreElements() {
        return current < array.length;
      },
      getNext() {
        return array[current++];
      },
    };
  }

  /**
   * Creates and returns a new messageList object.
   *
   * @returns {object}
   */
  createList(extension) {
    let messageList = new MessageList(extension, this._messageTracker);
    let lists = this._contextLists.get(extension);
    if (!lists) {
      lists = new Map();
      this._contextLists.set(extension, lists);
    }
    lists.set(messageList.id, messageList);
    return messageList;
  }

  /**
   * Returns the messageList object for a given id.
   *
   * @returns {object}
   */
  getList(messageListId, extension) {
    let lists = this._contextLists.get(extension);
    let messageList = lists ? lists.get(messageListId, null) : null;
    if (!messageList) {
      throw new ExtensionError(
        `No message list for id ${messageListId}. Have you reached the end of a list?`
      );
    }
    return messageList;
  }

  /**
   * Returns the first/next message page of the given messageList.
   *
   * @returns {object}
   */
  async getNextPage(messageList) {
    let page = await messageList.getNextUnreadPage();
    if (!page) {
      return null;
    }

    // If the page does not have an id, the list has been retrieved completely
    // and can be removed.
    if (!page.id) {
      let lists = this._contextLists.get(messageList.extension);
      if (lists && lists.has(messageList.id)) {
        lists.delete(messageList.id);
      }
    }
    return page;
  }
}

export class MessageManager {
  constructor(extension, messageTracker, messageListTracker) {
    this.extension = extension;
    this._messageTracker = messageTracker;
    this._messageListTracker = messageListTracker;
  }

  convert(msgHdr) {
    return this._messageTracker.convertMessage(msgHdr, this.extension);
  }

  get(id) {
    return this._messageTracker.getMessage(id);
  }

  startMessageList(messageList) {
    return this._messageListTracker.startList(messageList, this.extension);
  }
}
