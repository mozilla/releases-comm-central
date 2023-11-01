/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import { EventEmitter } from "resource://gre/modules/EventEmitter.sys.mjs";
import { ExtensionUtils } from "resource://gre/modules/ExtensionUtils.sys.mjs";
import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

import { folderPathToURI } from "resource:///modules/ExtensionAccounts.sys.mjs";

var { ExtensionError } = ExtensionUtils;
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

ChromeUtils.defineModuleGetter(
  lazy,
  "MsgHdrToMimeMessage",
  "resource:///modules/gloda/MimeMessage.jsm"
);
ChromeUtils.defineModuleGetter(
  lazy,
  "jsmime",
  "resource:///modules/jsmime.jsm"
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
 * Returns the msgUrl of the given msgHdr, which is usable with,
 * nsIMsgMessageService.streamMessage().
 *
 * For dummy messages the "application/x-message-display" type is added to the
 * url, if missing.
 *
 * @param {nsIMsgDBHdr} msgHdr
 * @returns {string}
 */
export function getMsgStreamUrl(msgHdr) {
  if (msgHdr.folder) {
    return msgHdr.folder.getUriForMsg(msgHdr);
  }

  const url = new URL(msgHdr.getStringProperty("dummyMsgUrl"));
  url.searchParams.set("type", "application/x-message-display");
  return url.toString();
}

/**
 * @typedef MimeMessagePart
 * @property {MimeMessagePart[]} [attachments] - flat list of attachment parts
 *   found in any of the nested mime parts
 * @property {string} [body] - the body of the part
 * @property {Uint8Array} [raw] - the raw binary content of the part
 * @property {string} [contentType]
 * @property {string} headers - key-value object with key being a header name
 *   and value an array with all header values found
 * @property {string} [name] - filename, if part is an attachment
 * @property {string} partName - name of the mime part (e.g: "1.2")
 * @property {MimeMessagePart[]} [parts] - nested mime parts
 * @property {string} [size] - size of the part
 * @property {string} [url] - message url
 */

/**
 * Returns attachments found in the message belonging to the given nsIMsgDBHdr.
 *
 * @param {nsIMsgDBHdr} msgHdr
 * @param {boolean} includeNestedAttachments - Whether to return all attachments,
 *   including attachments from nested mime parts.
 *
 * @returns {Promise<MimeMessagePart[]>}
 */
export async function getAttachments(msgHdr, includeNestedAttachments = false) {
  const mimeMsg = await getMimeMessage(msgHdr);
  if (!mimeMsg) {
    return null;
  }

  // Reduce returned attachments according to includeNestedAttachments.
  const level = mimeMsg.partName ? mimeMsg.partName.split(".").length : 0;
  return mimeMsg.attachments.filter(
    a => includeNestedAttachments || a.partName.split(".").length == level + 2
  );
}

/**
 * Returns the attachment identified by the provided partName.
 *
 * @param {nsIMsgDBHdr} msgHdr
 * @param {string} partName
 * @param {object} [options={}] - If the includeRaw property is truthy the raw
 *   attachment contents are included.
 *
 * @returns {Promise<MimeMessagePart>}
 */
export async function getAttachment(msgHdr, partName, options = {}) {
  // It's not ideal to have to call MsgHdrToMimeMessage here again, but we need
  // the name of the attached file, plus this also gives us the URI without having
  // to jump through a lot of hoops.
  const attachment = await getMimeMessage(msgHdr, partName);
  if (!attachment) {
    return null;
  }

  if (options.includeRaw) {
    const channel = Services.io.newChannelFromURI(
      Services.io.newURI(attachment.url),
      null,
      Services.scriptSecurityManager.getSystemPrincipal(),
      null,
      Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      Ci.nsIContentPolicy.TYPE_OTHER
    );

    attachment.raw = await new Promise((resolve, reject) => {
      const listener = Cc[
        "@mozilla.org/network/stream-loader;1"
      ].createInstance(Ci.nsIStreamLoader);
      listener.init({
        onStreamComplete(loader, context, status, resultLength, result) {
          if (Components.isSuccessCode(status)) {
            resolve(Uint8Array.from(result));
          } else {
            reject(
              new ExtensionError(
                `Failed to read attachment ${attachment.url} content: ${status}`
              )
            );
          }
        },
      });
      channel.asyncOpen(listener, null);
    });
  }

  return attachment;
}

/**
 * Returns the <part> parameter of the dummyMsgUrl of the provided nsIMsgDBHdr.
 *
 * @param {nsIMsgDBHdr} msgHdr
 * @returns {string}
 */
function getSubMessagePartName(msgHdr) {
  if (msgHdr.folder || !msgHdr.getStringProperty("dummyMsgUrl")) {
    return "";
  }

  return new URL(msgHdr.getStringProperty("dummyMsgUrl")).searchParams.get(
    "part"
  );
}

/**
 * Returns the nsIMsgDBHdr of the outer message, if the provided nsIMsgDBHdr belongs
 * to a message which is actually an attachment of another message. Returns null
 * otherwise.
 *
 * @param {nsIMsgDBHdr} msgHdr
 * @returns {nsIMsgDBHdr}
 */
function getParentMsgHdr(msgHdr) {
  if (msgHdr.folder || !msgHdr.getStringProperty("dummyMsgUrl")) {
    return null;
  }

  const url = new URL(msgHdr.getStringProperty("dummyMsgUrl"));

  if (url.protocol == "news:") {
    const newsUrl = `news-message://${url.hostname}/${url.searchParams.get(
      "group"
    )}#${url.searchParams.get("key")}`;
    return MailServices.messageServiceFromURI("news:").messageURIToMsgHdr(
      newsUrl
    );
  }

  // Everything else should be a mailbox:// or an imap:// url.
  const params = Array.from(url.searchParams, p => p[0]).filter(
    p => !["number"].includes(p)
  );
  for (const param of params) {
    url.searchParams.delete(param);
  }
  return Services.io.newURI(url.href).QueryInterface(Ci.nsIMsgMessageUrl)
    .messageHeader;
}

/**
 * Get the raw message for a given nsIMsgDBHdr.
 *
 * @param aMsgHdr - The message header to retrieve the raw message for.
 * @returns {Promise<string>} - Binary string of the raw message.
 */
export async function getRawMessage(msgHdr) {
  // If this message is a sub-message (an attachment of another message), get it
  // as an attachment from the parent message and return its raw content.
  const subMsgPartName = getSubMessagePartName(msgHdr);
  if (subMsgPartName) {
    const parentMsgHdr = getParentMsgHdr(msgHdr);
    const attachment = await getAttachment(parentMsgHdr, subMsgPartName, {
      includeRaw: true,
    });
    return attachment.raw.reduce(
      (prev, curr) => prev + String.fromCharCode(curr),
      ""
    );
  }

  const msgUri = getMsgStreamUrl(msgHdr);
  const service = MailServices.messageServiceFromURI(msgUri);
  return new Promise((resolve, reject) => {
    const streamlistener = {
      _data: [],
      _stream: null,
      onDataAvailable(aRequest, aInputStream, aOffset, aCount) {
        if (!this._stream) {
          this._stream = Cc[
            "@mozilla.org/scriptableinputstream;1"
          ].createInstance(Ci.nsIScriptableInputStream);
          this._stream.init(aInputStream);
        }
        this._data.push(this._stream.read(aCount));
      },
      onStartRequest() {},
      onStopRequest(request, status) {
        if (Components.isSuccessCode(status)) {
          resolve(this._data.join(""));
        } else {
          reject(
            new ExtensionError(
              `Error while streaming message <${msgUri}>: ${status}`
            )
          );
        }
      },
      QueryInterface: ChromeUtils.generateQI([
        "nsIStreamListener",
        "nsIRequestObserver",
      ]),
    };

    // This is not using aConvertData and therefore works for news:// messages.
    service.streamMessage(
      msgUri,
      streamlistener,
      null, // aMsgWindow
      null, // aUrlListener
      false, // aConvertData
      "" //aAdditionalHeader
    );
  });
}

/**
 * Returns MIME parts found in the message identified by the given nsIMsgDBHdr.
 *
 * @param {nsIMsgDBHdr} msgHdr
 * @param {string} partName - Return only a specific mime part.
 *
 * @returns {Promise<MimeMessagePart>}
 */
export async function getMimeMessage(msgHdr, partName = "") {
  // If this message is a sub-message (an attachment of another message), get the
  // mime parts of the parent message and return the part of the sub-message.
  const subMsgPartName = getSubMessagePartName(msgHdr);
  if (subMsgPartName) {
    const parentMsgHdr = getParentMsgHdr(msgHdr);
    if (!parentMsgHdr) {
      return null;
    }

    const mimeMsg = await getMimeMessage(parentMsgHdr, partName);
    if (!mimeMsg) {
      return null;
    }

    // If <partName> was specified, the returned mime message is just that part,
    // no further processing needed. But prevent x-ray vision into the parent.
    if (partName) {
      if (partName.split(".").length > subMsgPartName.split(".").length) {
        return mimeMsg;
      }
      return null;
    }

    // Limit mimeMsg and attachments to the requested <subMessagePart>.
    const findSubPart = (parts, partName) => {
      const match = parts.find(a => partName.startsWith(a.partName));
      if (!match) {
        throw new ExtensionError(
          `Unexpected Error: Part ${partName} not found.`
        );
      }
      return match.partName == partName
        ? match
        : findSubPart(match.parts, partName);
    };
    const subMimeMsg = findSubPart(mimeMsg.parts, subMsgPartName);

    if (mimeMsg.attachments) {
      subMimeMsg.attachments = mimeMsg.attachments.filter(
        a =>
          a.partName != subMsgPartName && a.partName.startsWith(subMsgPartName)
      );
    }
    return subMimeMsg;
  }

  try {
    const mimeMsg = await new Promise((resolve, reject) => {
      lazy.MsgHdrToMimeMessage(
        msgHdr,
        null,
        (_msgHdr, mimeMsg) => {
          if (!mimeMsg) {
            reject();
          } else {
            mimeMsg.attachments = mimeMsg.allInlineAttachments;
            resolve(mimeMsg);
          }
        },
        true,
        { examineEncryptedParts: true }
      );
    });
    return partName
      ? mimeMsg.attachments.find(a => a.partName == partName)
      : mimeMsg;
  } catch (ex) {
    // Something went wrong. Return null, which will inform the user that the
    // message could not be read.
    console.warn(ex);
    return null;
  }
}

/**
 * Class for cached message headers to reduce XPCOM requests and to cache msgHdr
 * of file and attachment messages.
 */
export class CachedMsgHeader {
  constructor(msgHdr) {
    this.mProperties = {};

    // Properties needed by MessageManager.convert().
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
      // Cache all elements which are needed by MessageManager.convert().
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

  QueryInterface() {
    return this;
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
  }

  cleanup() {
    // nsIObserver
    Services.obs.removeObserver(this, "quit-application-granted");
    Services.obs.removeObserver(this, "attachment-delete-msgkey-changed");
    // nsIFolderListener
    MailServices.mailSession.RemoveFolderListener(this);
    // nsIMsgFolderListener
    MailServices.mfn.removeListener(this);
  }

  /**
   * Generates a hash for the given msgIdentifier.
   *
   * @param {object} msgIdentifier
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
   * @param {object} msgIdentifier - msgIdentifier of the message
   * @param {nsIMsgDBHdr} [msgHdr] - optional msgHdr of the message, will be
   *   added to the cache if it is a non-file dummy msgHdr, which cannot be
   *   retrieved later (for example an attached message)
   */
  _set(id, msgIdentifier, msgHdr) {
    const hash = this.getHash(msgIdentifier);
    this._messageIds.set(hash, id);
    this._messages.set(id, msgIdentifier);
    if (
      msgHdr &&
      !msgHdr.folder &&
      msgIdentifier.dummyMsgUrl &&
      !msgIdentifier.dummyMsgUrl.startsWith("file://")
    ) {
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
   * @param {object} msgIdentifier - msgIdentifier of the message
   * @returns {integer} The messageTracker id of the message.
   */
  _get(msgIdentifier) {
    const hash = this.getHash(msgIdentifier);
    if (this._messageIds.has(hash)) {
      return this._messageIds.get(hash);
    }
    return null;
  }

  /**
   * Removes the provided message identifier from the messageTracker.
   *
   * @param {object} msgIdentifier - msgIdentifier of the message
   */
  _remove(msgIdentifier) {
    const hash = this.getHash(msgIdentifier);
    const id = this._get(msgIdentifier);
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
      const url = new URL(msgHdr.getStringProperty("dummyMsgUrl"));
      const parameters = Array.from(url.searchParams, p => p[0]).filter(
        p => !["group", "number", "key", "part"].includes(p)
      );
      for (const parameter of parameters) {
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
   * @param {object} msgIdentifier - msgIdentifier object of the message
   * @returns {boolean}
   */
  isModifiedFileMsg(msgIdentifier) {
    if (!msgIdentifier.dummyMsgUrl?.startsWith("file://")) {
      return false;
    }

    try {
      const file = Services.io
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
    const msgIdentifier = this._messages.get(id);
    if (!msgIdentifier) {
      return null;
    }

    if (msgIdentifier.folderURI) {
      const folder = MailServices.folderLookup.getFolderForURL(
        msgIdentifier.folderURI
      );
      if (folder) {
        const msgHdr = folder.msgDatabase.getMsgHdrForKey(
          msgIdentifier.messageKey
        );
        if (msgHdr) {
          return msgHdr;
        }
      }
    } else if (msgIdentifier.dummyMsgUrl.startsWith("file://")) {
      const msgHdr = MailServices.messageServiceFromURI(
        "file:"
      ).messageURIToMsgHdr(msgIdentifier.dummyMsgUrl);
      if (msgHdr && !this.isModifiedFileMsg(msgIdentifier)) {
        return msgHdr;
      }
    } else {
      return this._dummyMessageHeaders.get(msgIdentifier.dummyMsgUrl);
    }

    this._remove(msgIdentifier);
    return null;
  }

  // nsIFolderListener

  onFolderPropertyFlagChanged(item, property, oldFlag, newFlag) {
    const changes = {};
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
    const folders = changedFolder.descendants;
    folders.unshift(changedFolder);
    for (const folder of folders) {
      const flags = folder.flags;
      if (
        !(flags & Ci.nsMsgFolderFlags.Inbox) &&
        flags & (Ci.nsMsgFolderFlags.SpecialUse | Ci.nsMsgFolderFlags.Virtual)
      ) {
        // Do not notify if the folder is not Inbox but one of
        // Drafts|Trash|SentMail|Templates|Junk|Archive|Queue or Virtual.
        continue;
      }
      const numNewMessages = folder.getNumNewMessages(false);
      if (!numNewMessages) {
        continue;
      }
      const msgDb = folder.msgDatabase;
      const newMsgKeys = msgDb.getNewList().slice(-numNewMessages);
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
    for (const msgHdr of messages) {
      const junkScore =
        parseInt(msgHdr.getStringProperty("junkscore"), 10) || 0;
      this.emit("message-updated", new CachedMsgHeader(msgHdr), {
        junk: junkScore >= lazy.gJunkThreshold,
      });
    }
  }

  msgsDeleted(deletedMsgs) {
    if (deletedMsgs.length > 0) {
      this.emit(
        "messages-deleted",
        deletedMsgs.map(msgHdr => new CachedMsgHeader(msgHdr))
      );
    }
  }

  msgsMoveCopyCompleted(move, srcMsgs, dstFolder, dstMsgs) {
    if (srcMsgs.length > 0 && dstMsgs.length > 0) {
      const emitMsg = move ? "messages-moved" : "messages-copied";
      this.emit(
        emitMsg,
        srcMsgs.map(msgHdr => new CachedMsgHeader(msgHdr)),
        dstMsgs.map(msgHdr => new CachedMsgHeader(msgHdr))
      );
    }
  }

  msgKeyChanged(oldKey, newMsgHdr) {
    // For IMAP messages there is a delayed update of database keys and if those
    // keys change, the messageTracker needs to update its maps, otherwise wrong
    // messages will be returned. Key changes are replayed in multi-step swaps.
    const newKey = newMsgHdr.messageKey;

    // Replay pending swaps.
    while (this._pendingKeyChanges.has(oldKey)) {
      const next = this._pendingKeyChanges.get(oldKey);
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
      const oldId = this._get({
        folderURI: newMsgHdr.folder.URI,
        messageKey: oldKey,
      });
      const newId = this._get({
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
        const id = this._get({
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
    this.timeOfFirstMessage = null;
    this._deferredPromise = new Promise(resolve => {
      this._resolveDeferredPromise = resolve;
    });
  }

  addMessage(msgHdr) {
    if (this.messages.length == 0) {
      this.timeOfFirstMessage = Date.now();
    }
    this.messages.push(msgHdr);
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
  /**
   * @param {ExtensionData} extension
   * @param {MessageTracker} messageTracker
   * @param {integer} [messagesPerPage]
   */
  constructor(extension, messageTracker, messagesPerPage) {
    this.messageListId = Services.uuid.generateUUID().number.substring(1, 37);
    this.extension = extension;
    this.isDone = false;
    this.pages = [];
    this._messageTracker = messageTracker;
    this.folderCache = new Map();
    this.messagesPerPage = messagesPerPage ?? lazy.gMessagesPerPage;

    this.pages.push(new MessagePage());
  }

  async addPage() {
    if (this.isDone) {
      return;
    }

    // Adding a page will make this.currentPage point to the new page.
    const previousPage = this.currentPage;

    // If the current page has no messages, there is no need to add a page.
    if (previousPage && previousPage.messages.length == 0) {
      return;
    }

    this.pages.push(new MessagePage());
    // The previous page is finished and can be resolved.
    if (previousPage) {
      previousPage.resolvePage();
    }

    await this.allowPagesToResolve();
  }

  async allowPagesToResolve() {
    // Interrupt the execution flow, so pending callbacks on the call stack
    // (for example waiting for a fulfilled page promise) can be processed.
    return new Promise(resolve => setTimeout(resolve, 25));
  }

  get currentPage() {
    return this.pages.at(-1);
  }

  get id() {
    return this.messageListId;
  }

  async addMessage(msgHdr) {
    if (this.isDone || !this.currentPage) {
      return;
    }

    if (this.currentPage.messages.length >= this.messagesPerPage) {
      await this.addPage();
    }

    const messageHeader = this.extension.messageManager.convert(msgHdr, {
      skipFolder: true,
    });

    if (msgHdr.folder && this.extension.folderManager) {
      if (this.folderCache.has(msgHdr.folder.URI)) {
        messageHeader.folder = this.folderCache.get(msgHdr.folder.URI);
      } else {
        messageHeader.folder = this.extension.folderManager.convert(
          msgHdr.folder
        );
        this.folderCache.set(msgHdr.folder.URI, messageHeader.folder);
      }
    }
    this.currentPage.addMessage(messageHeader);
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

  /**
   * Returns the next unread message page.
   *
   * @returns {Promise<MessageList>}
   * @see /mail/components/extensions/schemas/messages.json
   */
  async getNextUnreadPage() {
    const page = this.pages.find(p => !p.read);
    if (!page) {
      return null;
    }

    const messages = await page.promise;
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
   * page.
   *
   * @param {nsIMsgDBHdr[]} Array or enumerator of messages.
   * @param {ExtensionData} extension
   *
   * @returns {Promise<MessageList>}
   * @see /mail/components/extensions/schemas/messages.json
   */
  async startList(messages, extension) {
    const messageList = this.createList(extension);
    // Do not await _addMessages() here, to let the function return the Promise
    // for the first page as soon as possible and not after all messages have
    // been added.
    setTimeout(() => this._addMessages(messages, messageList));

    return this.getNextPage(messageList);
  }

  /**
   * Add messages to a messageList and finalize the list once all messages have
   * been added.
   *
   * @param {nsIMsgDBHdr[]} Array or enumerator of messages.
   * @param {MessageList}
   */
  async _addMessages(messages, messageList) {
    if (messageList.isDone) {
      return;
    }
    if (Array.isArray(messages)) {
      messages = this._createEnumerator(messages);
    }
    while (messages.hasMoreElements()) {
      const next = messages.getNext();
      await messageList.addMessage(next.QueryInterface(Ci.nsIMsgDBHdr));
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
   * @param {ExtensionData} extension
   * @param {integer} [messagesPerPage]
   *
   * @returns {MessageList}
   */
  createList(extension, messagesPerPage) {
    const messageList = new MessageList(
      extension,
      this._messageTracker,
      messagesPerPage
    );
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
   * @returns {MessageList}
   */
  getList(messageListId, extension) {
    const lists = this._contextLists.get(extension);
    const messageList = lists ? lists.get(messageListId, null) : null;
    if (!messageList) {
      throw new ExtensionError(
        `No message list for id ${messageListId}. Have you reached the end of a list?`
      );
    }
    return messageList;
  }

  /**
   * Returns the next message page of the given messageList.
   *
   * @returns {Promise<MessageList>}
   * @see /mail/components/extensions/schemas/messages.json
   */
  async getNextPage(messageList) {
    const page = await messageList.getNextUnreadPage();
    if (!page) {
      return null;
    }

    // If the page does not have an id, the list has been retrieved completely
    // and can be removed.
    if (!page.id) {
      const lists = this._contextLists.get(messageList.extension);
      if (lists && lists.has(messageList.id)) {
        lists.delete(messageList.id);
      }
    }
    return page;
  }
}

/**
 * @typedef MessageConvertOptions
 * @property {boolean} [skipFolder] - do not include the converted folder
 */

export class MessageManager {
  constructor(extension, messageTracker, messageListTracker) {
    this.extension = extension;
    this._messageTracker = messageTracker;
    this._messageListTracker = messageListTracker;
  }

  /**
   * Converts an nsIMsgDBHdr to a simple object for use in messages.
   * This function WILL change as the API develops.
   *
   * @param {nsIMsgDBHdr} msgHdr
   * @param {MessageConvertOptions} [options]
   *
   * @returns {MessageHeader} MessageHeader object
   * @see /mail/components/extensions/schemas/messages.json
   */
  convert(msgHdr, options = {}) {
    if (!msgHdr) {
      return null;
    }

    const composeFields = Cc[
      "@mozilla.org/messengercompose/composefields;1"
    ].createInstance(Ci.nsIMsgCompFields);

    // Cache msgHdr to reduce XPCOM requests.
    const cachedHdr = new CachedMsgHeader(msgHdr);

    const junkScore =
      parseInt(cachedHdr.getStringProperty("junkscore"), 10) || 0;
    const tags = (cachedHdr.getStringProperty("keywords") || "")
      .split(" ")
      .filter(MailServices.tags.isValidKey);

    // Getting the size of attached messages does not work consistently. For imap://
    // and mailbox:// messages the returned size in msgHdr.messageSize is 0, and for
    // file:// messages the returned size is always the total file size
    // Be consistent here and always return 0. The user can obtain the message size
    // from the size of the associated attachment file.
    const size = isAttachedMessageUrl(
      cachedHdr.getStringProperty("dummyMsgUrl")
    )
      ? 0
      : cachedHdr.messageSize;

    const messageObject = {
      id: this._messageTracker.getId(cachedHdr),
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

    if (
      !options.skipFolder &&
      cachedHdr.folder &&
      this.extension.folderManager
    ) {
      messageObject.folder = this.extension.folderManager.convert(
        cachedHdr.folder
      );
    }
    return messageObject;
  }

  get(id) {
    return this._messageTracker.getMessage(id);
  }

  startMessageList(messageList) {
    return this._messageListTracker.startList(messageList, this.extension);
  }
}

/**
 * Convenience class to keep track of a search.
 */
export class MessageQuery {
  /**
   * @callback CheckSearchCriteriaCallback
   *
   * Check if the given msgHdr matches the current search criteria.
   *
   * @param {nsIMsgDBHdr} msgHdr
   * @param {nsIMsgFolder} [folder = msgHdr.folder] - The parent folder of the
   *   msgHdr, can be specified to prevent multiple lookups while evaluating
   *   multiple messages of the same folder.
   *
   * @returns {Promise<boolean>}
   */

  /**
   * @param {object} queryInfo
   * @param {MessageListTracker} messageListTracker
   * @param {ExtensionData} extension
   * @param {CheckSearchCriteriaCallback} [checkSearchCriteriaFn] - Function
   *   to be used instead of the default MessageQuery.checkSearchCriteria(),
   *   when checking if a message matches the current search criteria.
   *
   * @see /mail/components/extensions/schemas/messages.json
   */
  constructor(queryInfo, messageListTracker, extension, checkSearchCriteriaFn) {
    this.extension = extension;
    this.queryInfo = queryInfo;
    this.messageListTracker = messageListTracker;

    this.messageList = this.messageListTracker.createList(
      this.extension,
      queryInfo.messagesPerPage
    );

    this.checkSearchCriteriaFn =
      checkSearchCriteriaFn || this.checkSearchCriteria;

    this.composeFields = Cc[
      "@mozilla.org/messengercompose/composefields;1"
    ].createInstance(Ci.nsIMsgCompFields);

    this.autoPaginationTimeout = queryInfo.autoPaginationTimeout ?? 1000;
  }

  /**
   * Initiates the search.
   *
   * @returns {Promise<MessageList> | Promise<string>} A Promise for the first
   *   page with search results, or the id of the created list (depends on
   *   this.queryInfo.returnMessageListId).
   */
  async startSearch() {
    // Prepare case insensitive me filtering.
    this.identities = null;
    if (this.queryInfo.toMe || this.queryInfo.fromMe) {
      this.identities = MailServices.accounts.allIdentities.map(i =>
        i.email.toLocaleLowerCase()
      );
    }

    // Prepare tag filtering.
    this.requiredTags = null;
    this.forbiddenTags = null;
    if (this.queryInfo.tags) {
      const availableTags = MailServices.tags.getAllTags();
      this.requiredTags = availableTags.filter(
        tag =>
          tag.key in this.queryInfo.tags.tags &&
          this.queryInfo.tags.tags[tag.key]
      );
      this.forbiddenTags = availableTags.filter(
        tag =>
          tag.key in this.queryInfo.tags.tags &&
          !this.queryInfo.tags.tags[tag.key]
      );
      // If non-existing tags have been required, return immediately with
      // an empty message list.
      if (
        this.requiredTags.length === 0 &&
        Object.values(this.queryInfo.tags.tags).filter(v => v).length > 0
      ) {
        return this.messageListTracker.startList([], this.extension);
      }
      this.requiredTags = this.requiredTags.map(tag => tag.key);
      this.forbiddenTags = this.forbiddenTags.map(tag => tag.key);
    }

    // Limit search to a given folder, or search all folders.
    const folders = [];
    let includeSubFolders = false;
    if (this.queryInfo.folder) {
      includeSubFolders = !!this.queryInfo.includeSubFolders;
      if (!this.extension.hasPermission("accountsRead")) {
        throw new ExtensionError(
          'Querying by folder requires the "accountsRead" permission'
        );
      }
      const folder = MailServices.folderLookup.getFolderForURL(
        folderPathToURI(
          this.queryInfo.folder.accountId,
          this.queryInfo.folder.path
        )
      );
      if (!folder) {
        throw new ExtensionError(
          `Folder not found: ${this.queryInfo.folder.path}`
        );
      }
      folders.push(folder);
    } else {
      includeSubFolders = true;
      for (const account of MailServices.accounts.accounts) {
        folders.push(account.incomingServer.rootFolder);
      }
    }

    // The searchFolders() function searches the provided folders for
    // messages matching the query and adds results to the messageList. It
    // is an asynchronous function, but it is not awaited here. Instead,
    // messageListTracker.getNextPage() returns a Promise, which will
    // fulfill after enough messages for a full page have been added.
    setTimeout(() => this.searchFolders(folders, includeSubFolders));

    if (this.queryInfo.returnMessageListId) {
      return this.messageList.id;
    }
    return this.messageListTracker.getNextPage(this.messageList);
  }

  /**
   * Check if the given msgHdr matches the current search criteria.
   *
   * @param {nsIMsgDBHdr} msgHdr
   * @param {nsIMsgFolder} [folder = msgHdr.folder] - The parent folder of the
   *   msgHdr, can be specified to prevent multiple lookups while evaluating
   *   multiple messages of the same folder.
   *
   * @returns {Promise<boolean>}
   */
  async checkSearchCriteria(msgHdr, folder = msgHdr.folder) {
    // Check date ranges.
    if (
      this.queryInfo.fromDate !== null &&
      msgHdr.dateInSeconds * 1000 < this.queryInfo.fromDate.getTime()
    ) {
      return false;
    }
    if (
      this.queryInfo.toDate !== null &&
      msgHdr.dateInSeconds * 1000 > this.queryInfo.toDate.getTime()
    ) {
      return false;
    }

    // Check headerMessageId.
    if (
      this.queryInfo.headerMessageId &&
      msgHdr.messageId != this.queryInfo.headerMessageId
    ) {
      return false;
    }

    // Check unread (MV2).
    if (
      this.extension.manifestVersion < 3 &&
      this.queryInfo.unread !== null &&
      msgHdr.isRead != !this.queryInfo.unread
    ) {
      return false;
    }

    // Check read (MV3+).
    if (
      this.extension.manifestVersion > 2 &&
      this.queryInfo.read !== null &&
      msgHdr.isRead != this.queryInfo.read
    ) {
      return false;
    }

    // Check size.
    if (this.queryInfo.size != null) {
      const size = msgHdr.messageSize;
      const query = this.queryInfo.size;
      if (query.min != null && size < query.min) {
        return false;
      }
      if (query.max != null && size > query.max) {
        return false;
      }
    }

    // Check junk score.
    if (this.queryInfo.junkScore != null) {
      const score = parseInt(msgHdr.getStringProperty("junkscore"), 10) || 0;
      const query = this.queryInfo.junkScore;
      if (query.min != null && score < query.min) {
        return false;
      }
      if (query.max != null && score > query.max) {
        return false;
      }
    }

    // Check junk flag.
    if (this.queryInfo.junk != null) {
      const junk =
        (parseInt(msgHdr.getStringProperty("junkscore"), 10) || 0) >=
        lazy.gJunkThreshold;
      if (this.queryInfo.junk != junk) {
        return false;
      }
    }

    // Check flagged.
    if (
      this.queryInfo.flagged !== null &&
      msgHdr.isFlagged != this.queryInfo.flagged
    ) {
      return false;
    }

    // Check subject (substring match).
    if (
      this.queryInfo.subject &&
      !msgHdr.mime2DecodedSubject.includes(this.queryInfo.subject)
    ) {
      return false;
    }

    // Check new.
    if (
      this.queryInfo.new !== null &&
      !!(msgHdr.flags & Ci.nsMsgMessageFlags.New) != this.queryInfo.new
    ) {
      return false;
    }

    // Check tags.
    if (this.requiredTags || this.forbiddenTags) {
      const messageTags = msgHdr.getStringProperty("keywords").split(" ");
      if (this.requiredTags.length > 0) {
        if (
          this.queryInfo.tags.mode == "all" &&
          !this.requiredTags.every(tag => messageTags.includes(tag))
        ) {
          return false;
        }
        if (
          this.queryInfo.tags.mode == "any" &&
          !this.requiredTags.some(tag => messageTags.includes(tag))
        ) {
          return false;
        }
      }
      if (this.forbiddenTags.length > 0) {
        if (
          this.queryInfo.tags.mode == "all" &&
          this.forbiddenTags.every(tag => messageTags.includes(tag))
        ) {
          return false;
        }
        if (
          this.queryInfo.tags.mode == "any" &&
          this.forbiddenTags.some(tag => messageTags.includes(tag))
        ) {
          return false;
        }
      }
    }

    // Check toMe (case insensitive email address match).
    if (this.queryInfo.toMe !== null) {
      const recipients = [].concat(
        this.composeFields.splitRecipients(msgHdr.recipients, true),
        this.composeFields.splitRecipients(msgHdr.ccList, true),
        this.composeFields.splitRecipients(msgHdr.bccList, true)
      );

      if (
        this.queryInfo.toMe !=
        recipients.some(email =>
          this.identities.includes(email.toLocaleLowerCase())
        )
      ) {
        return false;
      }
    }

    // Check fromMe (case insensitive email address match).
    if (this.queryInfo.fromMe !== null) {
      const authors = this.composeFields.splitRecipients(
        msgHdr.mime2DecodedAuthor,
        true
      );
      if (
        this.queryInfo.fromMe !=
        authors.some(email =>
          this.identities.includes(email.toLocaleLowerCase())
        )
      ) {
        return false;
      }
    }

    // Check author.
    if (
      this.queryInfo.author &&
      !isAddressMatch(this.queryInfo.author, [
        { addr: msgHdr.mime2DecodedAuthor, doRfc2047: false },
      ])
    ) {
      return false;
    }

    // Check recipients.
    if (
      this.queryInfo.recipients &&
      !isAddressMatch(this.queryInfo.recipients, [
        { addr: msgHdr.mime2DecodedRecipients, doRfc2047: false },
        { addr: msgHdr.ccList, doRfc2047: true },
        { addr: msgHdr.bccList, doRfc2047: true },
      ])
    ) {
      return false;
    }

    // Check if fullText is already partially fulfilled.
    let fullTextBodySearchNeeded = false;
    if (this.queryInfo.fullText) {
      const subjectMatches = msgHdr.mime2DecodedSubject.includes(
        this.queryInfo.fullText
      );
      const authorMatches = msgHdr.mime2DecodedAuthor.includes(
        this.queryInfo.fullText
      );
      fullTextBodySearchNeeded = !(subjectMatches || authorMatches);
    }

    // Check body.
    if (this.queryInfo.body || fullTextBodySearchNeeded) {
      const mimeMsg = await getMimeMessage(msgHdr);
      if (
        this.queryInfo.body &&
        !includesContent(folder, [mimeMsg], this.queryInfo.body)
      ) {
        return false;
      }
      if (
        fullTextBodySearchNeeded &&
        !includesContent(folder, [mimeMsg], this.queryInfo.fullText)
      ) {
        return false;
      }
    }

    // Check attachments.
    if (this.queryInfo.attachment != null) {
      const attachments = await getAttachments(
        msgHdr,
        true // includeNestedAttachments
      );
      if (typeof this.queryInfo.attachment == "boolean") {
        if (this.queryInfo.attachment != (attachments.length != 0)) {
          return false;
        }
      } else {
        // If not a boolean, it is an object with min and max members.
        const attRange = this.queryInfo.attachment;
        if (attRange.min != null && attachments.length < attRange.min) {
          return false;
        }
        if (attRange.max != null && attachments.length > attRange.max) {
          return false;
        }
      }
    }

    return true;
  }

  async searchMessages(folder, includeSubFolders = false) {
    let messages = null;
    try {
      messages = folder.messages;
    } catch (e) {
      // Some folders fail on message query, instead of returning empty
    }

    if (messages) {
      for (const msg of [...messages]) {
        if (this.messageList.isDone) {
          return;
        }
        if (await this.checkSearchCriteriaFn(msg, folder)) {
          await this.messageList.addMessage(msg);
        }

        // Check if auto-pagination is needed.
        if (
          this.autoPaginationTimeout &&
          this.messageList.currentPage.messages.length > 0 &&
          Date.now() - this.messageList.currentPage.timeOfFirstMessage >
            this.autoPaginationTimeout
        ) {
          await this.messageList.addPage();
        }
      }
    }

    if (includeSubFolders) {
      for (const subFolder of folder.subFolders) {
        if (this.messageList.isDone) {
          return;
        }
        await this.searchMessages(subFolder, true);
      }
    }
  }

  async searchFolders(folders, includeSubFolders = false) {
    for (const folder of folders) {
      if (this.messageList.isDone) {
        return;
      }
      await this.searchMessages(folder, includeSubFolders);
    }
    this.messageList.done();
  }
}

function includesContent(folder, parts, searchTerm) {
  if (!parts || parts.length == 0) {
    return false;
  }
  for (const part of parts) {
    if (
      coerceBodyToPlaintext(folder, part).includes(searchTerm) ||
      includesContent(folder, part.parts, searchTerm)
    ) {
      return true;
    }
  }
  return false;
}

function coerceBodyToPlaintext(folder, part) {
  if (!part || !part.body) {
    return "";
  }
  if (part.contentType == "text/plain") {
    return part.body;
  }
  // text/enriched gets transformed into HTML by libmime
  if (part.contentType == "text/html" || part.contentType == "text/enriched") {
    return folder.convertMsgSnippetToPlainText(part.body);
  }
  return "";
}

/**
 * Prepare name and email properties of the address object returned by
 * MailServices.headerParser.makeFromDisplayAddress() to be lower case.
 * Also fix the name being wrongly returned in the email property, if
 * the address was just a single name.
 *
 * @param {string} displayAddr - Full mail address with (potentially) name and
 *   email.
 */
function prepareAddress(displayAddr) {
  let email = displayAddr.email?.toLocaleLowerCase();
  let name = displayAddr.name?.toLocaleLowerCase();
  if (email && !name && !email.includes("@")) {
    name = email;
    email = null;
  }
  return { name, email };
}

/**
 * Check multiple addresses if they match the provided search address.
 *
 * @returns A boolean indicating if search was successful.
 */
function searchInMultipleAddresses(searchAddress, addresses) {
  // Return on first positive match.
  for (const address of addresses) {
    const nameMatched =
      searchAddress.name &&
      address.name &&
      address.name.includes(searchAddress.name);

    // Check for email match. Name match being required on top, if
    // specified.
    if (
      (nameMatched || !searchAddress.name) &&
      searchAddress.email &&
      address.email &&
      address.email == searchAddress.email
    ) {
      return true;
    }

    // If address match failed, name match may only be true if no
    // email has been specified.
    if (!searchAddress.email && nameMatched) {
      return true;
    }
  }
  return false;
}

/**
 * Substring match on name and exact match on email. If searchTerm
 * includes multiple addresses, all of them must match.
 *
 * @returns A boolean indicating if search was successful.
 */
function isAddressMatch(searchTerm, addressObjects) {
  const searchAddresses =
    MailServices.headerParser.makeFromDisplayAddress(searchTerm);
  if (!searchAddresses || searchAddresses.length == 0) {
    return false;
  }

  // Prepare addresses.
  const addresses = [];
  for (const addressObject of addressObjects) {
    const decodedAddressString = addressObject.doRfc2047
      ? lazy.jsmime.headerparser.decodeRFC2047Words(addressObject.addr)
      : addressObject.addr;
    for (const address of MailServices.headerParser.makeFromDisplayAddress(
      decodedAddressString
    )) {
      addresses.push(prepareAddress(address));
    }
  }
  if (addresses.length == 0) {
    return false;
  }

  let success = false;
  for (const searchAddress of searchAddresses) {
    // Exit early if this search was not successfully, but all search
    // addresses have to be matched.
    if (!searchInMultipleAddresses(prepareAddress(searchAddress), addresses)) {
      return false;
    }
    success = true;
  }

  return success;
}
