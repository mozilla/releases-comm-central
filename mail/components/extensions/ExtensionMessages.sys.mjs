/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

import { EventEmitter } from "resource://gre/modules/EventEmitter.sys.mjs";
import { ExtensionUtils } from "resource://gre/modules/ExtensionUtils.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import { clearTimeout, setTimeout } from "resource://gre/modules/Timer.sys.mjs";

import {
  getFolder,
  getMailAccounts,
  getWildcardVirtualFolders,
} from "resource:///modules/ExtensionAccounts.sys.mjs";

import {
  MimeTreeEmitter,
  MimeTreeDecrypter,
  mimeTreeToString,
} from "chrome://openpgp/content/modules/MimeTree.sys.mjs";

var { ExtensionError } = ExtensionUtils;
import { MailServices } from "resource:///modules/MailServices.sys.mjs";

ChromeUtils.defineESModuleGetters(lazy, {
  MimeParser: "resource:///modules/mimeParser.sys.mjs",
  VirtualFolderHelper: "resource:///modules/VirtualFolderWrapper.sys.mjs",
  jsmime: "resource:///modules/jsmime.sys.mjs",
});

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

// Headers holding multiple mailbox strings needs special handling during encoding
// and decoding. For example, the following TO header
//   =?UTF-8?Q?H=C3=B6rst=2C_Kenny?= <K.Hoerst@invalid>, new@thunderbird.bug
// will be wrongly decoded to
//   Hörst, Kenny <K.Hoerst@invalid>, new@thunderbird.bug
// The data in the header is no longer usable, because the structure of the first
// mailbox string has been corrupted.
export const MAILBOX_HEADERS = [
  // Addressing headers from RFC 5322:
  "bcc",
  "cc",
  "from",
  "reply-to",
  "resent-bcc",
  "resent-cc",
  "resent-from",
  "resent-reply-to",
  "resent-sender",
  "resent-to",
  "sender",
  "to",
  // From RFC 5536:
  "approved",
  // From RFC 3798:
  "disposition-notification-to",
  // Non-standard headers:
  "delivered-to",
  "return-receipt-to",
  // http://cr.yp.to/proto/replyto.html
  "mail-reply-to",
  "mail-followup-to",
];

/**
 * Creates a raw message string from a WebExtension MessagePart. Fails if the
 * MessagePart does not contain raw header or raw content data.
 *
 * @param {MessagePart} messagePart
 * @returns {string} The raw message reconstructed from the provided MessagePart.
 */
export function messagePartToRaw(messagePart) {
  if (messagePart.rawHeaders == undefined) {
    throw new ExtensionError(
      "Failed to create message from MessagePart due to missing raw headers."
    );
  }

  // Skip the outer RFC822 MessagePart envelope and merge its headers into the
  // first real part. This envelope is a historic speciality of our MessagePart
  // and removing it here simplifies the following process.
  if (
    messagePart.contentType == "message/rfc822" &&
    messagePart.partName == ""
  ) {
    messagePart.parts[0].rawHeaders = {
      ...messagePart.rawHeaders,
      ...messagePart.parts[0].rawHeaders,
    };
    messagePart = messagePart.parts[0];
    // Follow convention to include multi-part message text description.
    if (
      messagePart.contentType.startsWith("multipart/") &&
      !messagePart.rawBody
    ) {
      messagePart.rawBody = "This is a multi-part message in MIME format.\r\n";
    }
  }

  if (messagePart.body) {
    throw new ExtensionError(
      "Failed to create message from MessagePart due to missing raw part content."
    );
  }

  let msg = "";
  const rawHeaders = Object.entries(messagePart.rawHeaders);
  if (rawHeaders.length > 0) {
    for (const [name, value] of rawHeaders) {
      const formattedName = name.replace(/^.|(-.)/g, function (match) {
        return match.toUpperCase();
      });

      // Note: value is an array holding multiple entries for the same header.
      const headers = value.map(v => `${formattedName}: ${v}`).join("\r\n");
      msg += headers;
      if (!msg.endsWith("\r\n")) {
        msg += "\r\n";
      }
    }
    msg += "\r\n";
  }

  if (messagePart.rawBody) {
    msg += messagePart.rawBody;
  }

  if (messagePart.parts && messagePart.parts.length > 0) {
    const contentTypeHeader = messagePart.rawHeaders["content-type"].join("");
    const boundary = lazy.MimeParser.getParameter(
      contentTypeHeader,
      "boundary"
    );
    for (const part of messagePart.parts) {
      msg += `--${boundary}\r\n`;
      msg += messagePartToRaw(part);
      if (msg.search(/[\r\n]$/) < 0) {
        msg += "\r\n";
      }
      msg += "\r\n";
    }
    msg += `--${boundary}--\r\n`;
  }
  return msg;
}

/**
 * Parse an address header containing one or more email addresses, and return an
 * array of RFC 5322 compliant mailbox strings.
 *
 * @param {string} headerString
 * @param {boolean} emailAddressOnly - return only the email address
 *
 * @returns {string[]}
 */
export function parseEncodedAddrHeader(headerString, emailAddressOnly) {
  return MailServices.headerParser
    .parseEncodedHeaderW(headerString)
    .map(hdr => {
      if (emailAddressOnly || !hdr.name) {
        return hdr.email;
      }
      return MailServices.headerParser.makeMimeAddress(hdr.name, hdr.email);
    });
}

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
 * Create a messageUrl for a specific part inside the message specified by the
 * provided msgHdr. If the message itself is a nested message (i.e its message
 * url itself has already a partName), the requested partName is correctly
 * appended.
 *
 * @param {nsIMsgDBHdr} msgHdr
 * @param {string} partName
 * @returns {string} the part url
 */
export function getMsgPartUrl(msgHdr, partName) {
  let msgUrl;
  if (msgHdr.folder) {
    const msgUri = msgHdr.folder.getUriForMsg(msgHdr);
    msgUrl =
      MailServices.messageServiceFromURI(msgUri).getUrlForUri(msgUri).spec;
  } else {
    msgUrl = msgHdr.getStringProperty("dummyMsgUrl");
  }
  const url = new URL(msgUrl);
  const basePart = url.searchParams.get("part");
  const part = basePart ? `${basePart}.${partName}` : partName;
  url.searchParams.delete("part");
  url.searchParams.append("part", part);
  return url.href;
}

/**
 * Checks if the provided nsIMsgDBHdr belongs to a message which is actually an
 * attachment of another message. Returns the parent nsIMsgDBHdr and the located
 * partName, or undefined.
 *
 * @param {nsIMsgDBHdr} msgHdr
 *
 * @returns {?object} parentMsgInfo
 * @returns {nsIMsgDBHdr} parentMsgInfo.msgHdr
 * @returns {string} parentMsgInfo.partName
 */
function getParentMsgInfo(msgHdr) {
  if (msgHdr.folder || !msgHdr.getStringProperty("dummyMsgUrl")) {
    return undefined;
  }

  const url = new URL(msgHdr.getStringProperty("dummyMsgUrl"));
  const partName = url.searchParams.get("part");
  if (!partName) {
    return undefined;
  }

  if (url.protocol == "news:") {
    const newsUrl = `news-message://${url.hostname}/${url.searchParams.get(
      "group"
    )}#${url.searchParams.get("key")}`;
    const parentMsgHdr =
      MailServices.messageServiceFromURI("news:").messageURIToMsgHdr(newsUrl);
    return { msgHdr: parentMsgHdr, partName };
  }

  // Everything else should be a mailbox:// or an imap:// url.
  const params = Array.from(url.searchParams, p => p[0]).filter(
    p => !["number"].includes(p)
  );
  for (const param of params) {
    url.searchParams.delete(param);
  }
  const parentMsgHdr = Services.io
    .newURI(url.href)
    .QueryInterface(Ci.nsIMsgMessageUrl).messageHeader;
  return { msgHdr: parentMsgHdr, partName };
}

/**
 * @typedef {object} MimeTreePart - A mime part generated by jsmime using the
 *   MimeTreeEmitter (see MimeTree.sys.mjs).
 *
 * @property {string} partNum
 * @property {StructuredHeaders} headers - A Map, containing all headers. Special
 *   headers for contentType and charset.
 * @property {integer} size - Size of this part, including all subparts.
 * @property {string} body - Body
 * @property {string} [name] - The name, if this part is an attachment.
 * @property {boolean} [isAttachment] - The part is an attachment.
 * @property {MimeTreePart[]} subParts - Array of MimeTreePart with sub parts
 */

/**
 * Custom MimeTreeEmitter class with custom determination of attachment names.
 */
class WebExtMimeTreeEmitter extends MimeTreeEmitter {
  getAttachmentName(mimeTreePart) {
    const getName = header => {
      if (!header) {
        return "";
      }
      const filename = lazy.MimeParser.getParameter(header, "filename");
      if (filename) {
        return filename;
      }
      if (mimeTreePart.fullContentType) {
        const name = lazy.MimeParser.getParameter(
          mimeTreePart.fullContentType,
          "name"
        );
        if (name) {
          return name;
        }
      }
      return "";
    };

    const contentDisposition = mimeTreePart.headers.has("content-disposition")
      ? mimeTreePart.headers.get("content-disposition")[0]
      : undefined;

    // Forwarded messages are sometimes not marked as attachments, but we always
    // consider them as such.
    if (
      contentDisposition ||
      mimeTreePart.headers.contentType.type == "message/rfc822"
    ) {
      if (mimeTreePart.headers.contentType.type == "message/rfc822") {
        return getName(contentDisposition) || "ForwardedMessage.eml";
      }

      // We also consider related (inline) attachments as attachments.
      if (mimeTreePart.headers._rawHeaders.has("content-id")) {
        return (
          getName(contentDisposition) ||
          mimeTreePart.headers.contentType.get("name") ||
          ""
        );
      }

      if (
        /^attachment/i.test(contentDisposition) ||
        mimeTreePart.headers.contentType.type == "text/x-moz-deleted"
      ) {
        return getName(contentDisposition);
      }
    }
    return null;
  }
}

/**
 * @typedef {object} MimeTreeEmitterOptions
 *
 * @property {boolean} [enableFilterMode=false] - Enabling this mode allows using
 *   the other available configuration flags, deviating from the standard behavior.
 *   This is to ensure that changes to this class do not alter the expected
 *   behavior of the consumer in getMimeTree(), which is heavily used in different
 *   areas of the crypto code.
 * @property {boolean} [checkForAttachments=false] - Determines for each part, if
 *   their "content-disposition" header includes "attachment", and sets the"name"
 *   property and the "isAttachment" property of the part.
 * @property {boolean} [checkForEncryption=false] - Check for encrypted parts,
 *   status can be retrieved via MimeTreeEmitter.hasEncryptedParts.
 * @property {boolean} [excludeAttachmentData=false] - Whether to exclude the
 *   bodies of parts whose "content-disposition" header includes "attachment".
 */

/**
 * @typedef {object} MimeTreeParserOptions
 *
 * @param {string} [pruneat=""] - Treat the message as starting at the given part
 *   number, so that no parts above the specified parts are returned.
 * @param {boolean} [decodeSubMessages=false] - Parse attached messages
 *   (message/rfc822, message/global & message/news) and return all of their MIME
 *   data instead of returning their content as regular attachments.
 */

/**
 * Class to handle parsing and decryption of a message.
 */
export class MsgHdrProcessor {
  #msgUri;
  #msgHdr;
  #originalMessage;
  #decryptedMessage;
  #originalTree;
  #decryptedTree;

  // Options for parser.
  #strFormat;
  #bodyFormat;
  #stripContinuations;

  // Keep track of encryption status, to skip encryption if known to be not
  // needed.
  #hasEncryptedParts;

  /**
   * @param {nsIMsgDBHdr} msgHdr
   * @param {object} parserOptions
   * @param {string} parserOptions.strFormat - Either binarystring, unicode or
   *    typedarray. See jsmime.mjs for more details.
   * @param {string} parserOptions.bodyFormat - Either none, raw, nodecode or
   *    decode. See jsmime.mjs for more details.
   * @param {boolean} parserOptions.stripContinuations - Whether to remove line
   *    breaks in headers.
   */
  constructor(msgHdr, parserOptions) {
    this.#msgHdr = msgHdr;
    this.#msgUri = getMsgStreamUrl(msgHdr);
    this.#bodyFormat = parserOptions?.bodyFormat ?? "decode";
    this.#strFormat = parserOptions?.strFormat ?? "unicode";
    this.#stripContinuations = parserOptions?.stripContinuations ?? true;
  }

  /**
   * Creates a new parsed MimeTree for the provided raw message.
   *
   * @param {string} rawMessage
   * @param {MimeTreeParserOptions} parserOptions
   * @param {MimeTreeEmitterOptions} emitterOptions
   *
   * @returns {MimeTreePart}
   */
  #parseMessage(rawMessage, parserOptions, emitterOptions) {
    const checkForEncryption = emitterOptions?.checkForEncryption ?? true;
    const excludeAttachmentData =
      emitterOptions?.excludeAttachmentData ?? false;
    const decodeSubMessages = parserOptions?.decodeSubMessages ?? false;
    // The partNames of the messages API always start with "1." for the root part,
    // jsmime however skips this root level. Adjust the provided pruneat value
    // accordingly.
    const pruneat = parserOptions?.pruneat
      ? parserOptions.pruneat.split(".").slice(1).join(".")
      : "";

    const emitter = new WebExtMimeTreeEmitter({
      enableFilterMode: true,
      checkForAttachments: true,
      checkForEncryption,
      excludeAttachmentData,
    });
    lazy.MimeParser.parseSync(rawMessage, emitter, {
      strformat: this.#strFormat,
      bodyformat: this.#bodyFormat,
      decodeSubMessages,
      stripcontinuations: this.#stripContinuations,
      pruneat,
    });
    const mimeTree = emitter.mimeTree.subParts[0];
    if (emitterOptions?.checkForEncryption) {
      this.#hasEncryptedParts = emitter.hasEncryptedParts;
    }
    return mimeTree;
  }

  /**
   * Creates a new decrypted MimeTree for the provided raw message.
   *
   * @param {string} rawMessage
   *
   * @returns {Promise<MimeTreePart>}
   */
  async #decryptMessage(rawMessage) {
    // Parse the raw message. This functions keeps all parts by default.
    const mimeTree = this.#parseMessage(
      rawMessage,
      {
        // We should not automatically decrypt nested messages, so we keep them
        // as an blob and do not parse them.
        decodeSubMessages: false,
      },
      {
        checkForEncryption: true,
        excludeAttachmentData: false,
      }
    );

    // Early exit, if there is nothing to decrypt. If we have not yet computed
    // this.#originalTree, we can store the just parsed mimeTree.
    if (this.#hasEncryptedParts === false) {
      mimeTree.decryptionStatus = "none";
      if (!this.#originalTree) {
        // TODO: Strip attachments.
        this.#originalTree = mimeTree;
      }
      return mimeTree;
    }

    // Early exit, if we do not have access to the decryption keys.
    if (!Services.logins.isLoggedIn) {
      mimeTree.decryptionStatus = "fail";
      return mimeTree;
    }

    const decrypter = new MimeTreeDecrypter({ disablePrompts: true });
    await decrypter.decrypt(mimeTree);
    if (decrypter.decryptFailure) {
      mimeTree.decryptionStatus = "fail";
    } else if (!decrypter.cryptoChanged) {
      // The first check for hasEncryptedParts may produce false positives. Fix
      // this if there have not been any changes due to the decryption process.
      this.#hasEncryptedParts = false;
      mimeTree.decryptionStatus = "none";
      // Note: We have a successfully parsed mimeTree, which could be re-used for
      //       getOriginalTree(). However, the decrypter is modifiying the tree
      //       while walking through, even if nothing is decrypted. How bad is it?
      // TODO: Change decrypter to not modify mimeTree and strip attachments.
      // this.#originalTree = mimeTree;
    } else {
      mimeTree.decryptionStatus = "success";
    }
    return mimeTree;
  }

  /**
   * Gets the raw message as a binary string. Throws if message could not be read.
   *
   * @returns {Promise<string>}
   */
  async getOriginalMessage() {
    if (this.#originalMessage) {
      return this.#originalMessage;
    }

    // Check if this msgHdr belongs to a message, which is actually an attachment
    // of an outer message.
    const parentMsgInfo = getParentMsgInfo(this.#msgHdr);
    if (parentMsgInfo) {
      const msgHdrProcessor = new MsgHdrProcessor(parentMsgInfo.msgHdr);
      let partName = parentMsgInfo.partName;

      // The returned partName may need to be adjusted for jsmime x-ray vision,
      // which needs nested messages to be identified by a $ in the partName.
      if (partName.split(".").length > 2) {
        const attachments = await msgHdrProcessor.getAttachmentParts({
          includeNestedAttachments: true,
        });
        const adjustedPartNames = new Map(
          attachments.map(attachment => [
            attachment.partNum.replaceAll("$.", ".1."),
            attachment.partNum,
          ])
        );
        // Convert 1.2.1.3 to 1.2$.3, if 1.2$.3 exists.
        if (adjustedPartNames.has(partName)) {
          partName = adjustedPartNames.get(partName);
        }
      }

      const attachment = await msgHdrProcessor.getAttachmentPart(partName, {
        includeRaw: true,
      });
      this.#originalMessage = attachment.body;
      return this.#originalMessage;
    }

    const msgUri = this.#msgUri;
    const service = MailServices.messageServiceFromURI(msgUri);

    // Setup a connection timout of 20s, to be able to fail if streaming stalls.
    let connectionSuccess = false;
    const connectionPromise = Promise.withResolvers();
    const connectionTimeout = setTimeout(() => {
      if (!connectionSuccess) {
        connectionPromise.reject(
          new ExtensionError(
            `Error while streaming message <${msgUri}>: Timeout`
          )
        );
      }
    }, 20000);

    const messagePromise = new Promise((resolve, reject) => {
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
        onStartRequest() {
          connectionSuccess = true;
        },
        onStopRequest(request, status) {
          if (Components.isSuccessCode(status)) {
            if (!this._data) {
              reject(
                new ExtensionError(
                  `Error while streaming message <${msgUri}>: No data`
                )
              );
            }
            resolve(this._data.join(""));
          } else {
            reject(
              new ExtensionError(
                `Error while streaming message <${msgUri}>: Status ${status}`
              )
            );
          }
        },
        QueryInterface: ChromeUtils.generateQI([
          "nsIStreamListener",
          "nsIRequestObserver",
        ]),
      };

      // This is not using aConvertData and returns the raw unprocessed message.
      service.streamMessage(
        msgUri,
        streamlistener,
        null, // aMsgWindow
        null, // aUrlListener
        false, // aConvertData
        "" //aAdditionalHeader
      );
    });

    try {
      this.#originalMessage = await Promise.race([
        connectionPromise.promise,
        messagePromise,
      ]);
    } finally {
      // Clean up pending connectionPromise and connectionTimeout.
      clearTimeout(connectionTimeout);
      connectionPromise.resolve();
    }
    return this.#originalMessage;
  }

  /**
   * Returns the parsed original MimeTreePart. Throws if message could not be read.
   *
   * @returns {Promise<MimeTreePart>}
   */
  async getOriginalTree() {
    if (this.#originalTree) {
      return this.#originalTree;
    }
    const rawMessage = await this.getOriginalMessage();
    this.#originalTree = this.#parseMessage(
      rawMessage,
      {
        decodeSubMessages: false,
      },
      {
        checkForEncryption: true,
        excludeAttachmentData: true,
      }
    );
    this.#originalTree.decryptionStatus = this.#hasEncryptedParts
      ? "skipped"
      : "none";
    return this.#originalTree;
  }

  /**
   * Returns the decrypted MimeTreePart. Throws if message could not be read.
   *
   * @returns {Promise<MimeTreePart>}
   */
  async getDecryptedTree() {
    if (this.#decryptedTree) {
      return this.#decryptedTree;
    }

    // If this message is not encrypted return the original tree.
    if (this.#hasEncryptedParts === false) {
      return this.getOriginalTree();
    }

    // TODO: The mimeTree decrypted by the MimeTreeDecrypter is not fully parsed.
    //       We therefore use the decrypted message and parse that again.
    //       If the mimeTree would be fully parsed, we could also dynamically skip
    //       large attachments in the MimeTreeEmitter, if the message is not
    //       encrypted.
    if (!this.#decryptedMessage) {
      const rawMessage = await this.getOriginalMessage();
      const mimeTree = await this.#decryptMessage(rawMessage);

      if (mimeTree.decryptionStatus != "success") {
        return mimeTree;
      }
      this.#decryptedMessage = mimeTreeToString(mimeTree, true);
    }

    // Parse the decrypted message, without checking for encryption, because we
    // know decryption has succeeded and the parsed message is already decrypted.
    this.#decryptedTree = this.#parseMessage(
      this.#decryptedMessage,
      {
        decodeSubMessages: false,
      },
      {
        checkForEncryption: false,
        excludeAttachmentData: true,
      }
    );
    // Since we parsed the fully decrypted message, decryption must have
    // succeeded.
    this.#decryptedTree.decryptionStatus = "success";
    return this.#decryptedTree;
  }

  /**
   * Gets the decrypted message as a binary string. Throws if message could not
   * be read or decrypted.
   *
   * @returns {Promise<string>}
   */
  async getDecryptedMessage() {
    if (this.#decryptedMessage) {
      return this.#decryptedMessage;
    }

    // Stream the original message.
    const rawMessage = await this.getOriginalMessage();

    // If this message is not encrypted return the original message.
    if (this.#hasEncryptedParts === false) {
      return rawMessage;
    }

    const mimeTree = await this.#decryptMessage(rawMessage);
    if (mimeTree.decryptionStatus == "fail") {
      const error = new Error(`Failed to decrypt ${this.#msgUri}`);
      error.cause = "MessageDecryptionError";
      throw error;
    }

    if (mimeTree.decryptionStatus == "none") {
      return rawMessage;
    }

    this.#decryptedMessage = mimeTreeToString(mimeTree, true);
    return this.#decryptedMessage;
  }

  /**
   * Returns MimeTreeParts of attachments found in the message.
   *
   * @param {object} [options]
   * @param {boolean} [options.includeNestedAttachments] - Whether to return
   *   all attachments, including attachments from nested mime parts.
   *
   * @returns {Promise<MimeTreePart[]>}
   */
  async getAttachmentParts(options) {
    const rawMessage = await this.getDecryptedMessage();
    const mimeTree = this.#parseMessage(
      rawMessage,
      {
        // We need to get the headers of nested messages, so we have to parse
        // everything.
        decodeSubMessages: true,
      },
      {
        checkForEncryption: false,
        excludeAttachmentData: true,
      }
    );

    // If the message does not contain mime parts, but is just an attachment,
    // return that part directly.
    if (mimeTree.isAttachment) {
      return [mimeTree];
    }

    const flat = (attachmentParts, part) => {
      if (part.isAttachment) {
        attachmentParts.push(part);
      }
      // Attached messages are marked as attachments, but also have subParts.
      // Only dive into the attached messages if includeNestedAttachments = true.
      const checkSubParts =
        !part.isAttachment || options?.includeNestedAttachments;
      if (checkSubParts && part.subParts && part.subParts.length > 0) {
        return part.subParts.reduce(flat, attachmentParts);
      }
      return attachmentParts;
    };
    return mimeTree.subParts.reduce(flat, []);
  }

  /**
   * Returns the MimeTreePart of the attachment identified by the provided
   * partName.
   *
   * @param {string} partName
   * @param {object} [options]
   * @param {boolean} [options.includeRaw] - Whether to include the raw attachment
   *   body.
   *
   * @returns {Promise<MimeTreePart>}
   */
  async getAttachmentPart(partName, options) {
    const rawMessage = await this.getDecryptedMessage();
    const includeRaw = options?.includeRaw ?? false;
    const mimeTree = this.#parseMessage(
      rawMessage,
      {
        pruneat: partName,
        // This uses a special feature of the parser, to dynamically enable
        // decoding of sub messages, if pruneat is set to a nested part.
        decodeSubMessages: false,
      },
      {
        checkForEncryption: false,
        excludeAttachmentData: !includeRaw,
      }
    );
    return mimeTree;
  }
}

export function getMessagesInFolder(folder) {
  if (folder.isServer) {
    return [];
  }

  if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    // We first try to read the cached results.
    try {
      return [...folder.parent.msgDatabase.getCachedHits(folder.URI)];
    } catch (e) {}

    // Manually search the folder.
    const messages = [];
    const wrappedVirtualFolder =
      lazy.VirtualFolderHelper.wrapVirtualFolder(folder);

    const searchFolders = getWildcardVirtualFolders(wrappedVirtualFolder);
    for (const searchFolder of wrappedVirtualFolder.searchFolders) {
      searchFolders.push(searchFolder);
    }

    for (const searchFolder of searchFolders) {
      const msgs = searchFolder.msgDatabase.getFilterEnumerator(
        wrappedVirtualFolder.searchTerms
      );
      for (const msg of msgs) {
        messages.push(msg);
      }
    }
    return messages;
  }

  // Attempt to read the folder directly.
  try {
    return [...folder.messages];
  } catch (e) {
    // Some folders fail to retrieve messages, instead of returning an empty array.
    console.warn(
      `Failed to retrieve content of folder ${folder.prettyName}: ${e}`
    );
  }

  return [];
}

/**
 * Map() that automatically removes added entries after 60s.
 */
export class TemporaryCacheMap extends Map {
  set(key, value) {
    super.set(key, value);
    // Remove the value from the cache after 60s.
    setTimeout(() => this.delete(key), 1000 * 60);
  }
}

/**
 * Class for cached message headers to reduce XPCOM requests and to cache a real
 * or dummy msgHdr (file or attachment message).
 */
export class CachedMsgHeader {
  #id;

  /**
   * @param {MessageTracker} messageTracker - reference to global MessageTracker
   * @param {nsIMsgDBHdr} [msgHdr] - a msgHdr to cache
   * @param {object} [options]
   * @param {boolean} [options.addToMessageTracker=true] - Whether to automatically
   *    add the cached msgHdr to the messageTracker and generate a WebExtension
   *    message ID. Ignored if no msgHdr was provided. An untracked cached msgHdr
   *    will forcefully be added to the messageTracker if its ID is requested.
   */
  constructor(messageTracker, msgHdr, options) {
    const addToMessageTracker = options?.addToMessageTracker ?? true;
    this.mProperties = {};
    this.messageTracker = messageTracker;

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
      this.author = msgHdr.author;
      this.subject = msgHdr.mime2DecodedSubject;
      this.recipients = msgHdr.recipients;
      this.ccList = msgHdr.ccList;
      this.bccList = msgHdr.bccList;
      this.messageId = msgHdr.messageId;
      this.date = msgHdr.date;
      this.flags = msgHdr.flags;
      this.isRead = msgHdr.isRead;
      this.isFlagged = msgHdr.isFlagged;
      this.messageSize = msgHdr.messageSize;
      this.folder = msgHdr.folder;

      // Also cache the additional elements.
      this.accountKey = msgHdr.accountKey;

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

      if (addToMessageTracker) {
        this.addToMessageTracker();
      }
    }
  }

  get hasId() {
    return !!this.#id;
  }

  get id() {
    if (!this.#id) {
      this.addToMessageTracker();
    }
    if (!this.#id) {
      throw new Error("Failed to add cached header to the MessageTracker.");
    }
    return this.#id;
  }

  addToMessageTracker() {
    if (this.#id) {
      return;
    }
    if (!this.messageTracker) {
      throw new Error("Missing MessageTracker.");
    }
    this.#id = this.messageTracker.getId(this);
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
  markHasAttachments() {}
  get mime2DecodedSubject() {
    return this.subject;
  }

  QueryInterface() {
    return this;
  }
}

/**
 * @typedef {object} MsgIdentifier - An object with information needed to identify
 *    a specific message.
 * @property {boolean} [folderURI] - folder URI of the real message
 * @property {integer} [messageKey] - messageKey of the real message
 * @property {string}  [dummyMsgUrl] - dummyMsgUrl of the dummy message (mostly
 *    a file:// URL)
 * @property {integer} [dummyMsgLastModifiedTime] - the time the dummy message
 *    was last modified, to distinguish different revisions of the same message
 */

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
    this._headerPromises = new Map();
    this._msgHdrCache = new TemporaryCacheMap();

    // nsIObserver
    Services.obs.addObserver(this, "quit-application-granted");
    Services.obs.addObserver(this, "attachment-delete-msgkey-changed");
    // nsIFolderListener
    MailServices.mailSession.AddFolderListener(
      this,
      Ci.nsIFolderListener.propertyFlagChanged |
        Ci.nsIFolderListener.intPropertyChanged |
        Ci.nsIFolderListener.removed
    );
    // nsIMsgFolderListener
    MailServices.mfn.addListener(
      this,
      MailServices.mfn.msgPropertyChanged |
        MailServices.mfn.msgAdded |
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
   * @param {MsgIdentifier} msgIdentifier
   * @returns {string}
   */
  getHash(msgIdentifier) {
    if (msgIdentifier.folderURI) {
      return `folderURI:${msgIdentifier.folderURI}, messageKey: ${msgIdentifier.messageKey}`;
    }
    return `dummyMsgUrl:${msgIdentifier.dummyMsgUrl}, dummyMsgLastModifiedTime: ${msgIdentifier.dummyMsgLastModifiedTime}`;
  }

  /**
   * Maps the provided internal message identifier to the given messageTracker id.
   *
   * @param {integer} id - messageTracker id of the message
   * @param {MsgIdentifier} msgIdentifier - msgIdentifier of the message
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
        msgHdr instanceof CachedMsgHeader
          ? msgHdr
          : new CachedMsgHeader(this, msgHdr)
      );
    }
  }

  /**
   * Lookup the messageTracker id for the given internal message identifier,
   * return null if not known.
   *
   * @param {MsgIdentifier} msgIdentifier - msgIdentifier of the message
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
   * Removes the provided internal message identifier from the messageTracker.
   *
   * @param {MsgIdentifier} msgIdentifier - msgIdentifier of the message
   */
  _remove(msgIdentifier) {
    const hash = this.getHash(msgIdentifier);
    const id = this._get(msgIdentifier);
    this._messages.delete(id);
    this._messageIds.delete(hash);
    this._dummyMessageHeaders.delete(msgIdentifier.dummyMsgUrl);
  }

  /**
   * Decouple the provided message identifier from the ID it is currently
   * associated with and remove its tracker entries.
   *
   * @param {MsgIdentifier} msgIdentifier - msgIdentifier of the message
   */
  _decouple(msgIdentifier) {
    const hash = this.getHash(msgIdentifier);
    this._messageIds.delete(hash);
    this._dummyMessageHeaders.delete(msgIdentifier.dummyMsgUrl);
  }

  /**
   * Returns the internal message identifier for the given message.
   *
   * @param {nsIMsgDBHdr} msgHdr - The requested message.
   * @returns {object} The msgIdentifier of the message.
   */
  getIdentifier(msgHdr) {
    if (msgHdr instanceof CachedMsgHeader && msgHdr.hasId) {
      return this._messages.get(msgHdr.id);
    }

    if (msgHdr.folder) {
      return {
        folderURI: msgHdr.folder.URI,
        messageKey: msgHdr.messageKey,
      };
    }
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

    return {
      dummyMsgUrl: url.href,
      dummyMsgLastModifiedTime: msgHdr.getUint32Property(
        "dummyMsgLastModifiedTime"
      ),
    };
  }

  /**
   * Finds a message in the messageTracker or adds it.
   *
   * @param {nsIMsgDBHdr} msgHdr - The requested message.
   * @returns {integer} The messageTracker id of the message.
   */
  getId(msgHdr) {
    if (msgHdr instanceof CachedMsgHeader && msgHdr.hasId) {
      return msgHdr.id;
    }

    const msgIdentifier = this.getIdentifier(msgHdr);
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
   * @param {MsgIdentifier} msgIdentifier - msgIdentifier object of the message
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

  /**
   * Finds all folders with new messages in the specified changedFolder and
   * emits a "messages-received" event for them.
   *
   * @param {nsIMsgFolder} changedFolder
   * @see MailNotificationManager._getFirstRealFolderWithNewMail()
   */
  findNewMessages(changedFolder) {
    const folders = changedFolder.descendants;
    folders.unshift(changedFolder);
    for (const folder of folders) {
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

  // Implements nsIFolderListener.

  /**
   * Implements nsIFolderListener.onFolderPropertyFlagChanged().
   *
   * @param {nsIMsgDBHdr} msgHdr
   * @param {string} property
   * @param {integer} oldFlag
   * @param {integer} newFlag
   */
  onFolderPropertyFlagChanged(msgHdr, property, oldFlag, newFlag) {
    const newProperties = {};
    switch (property) {
      case "Status":
        if ((oldFlag ^ newFlag) & Ci.nsMsgMessageFlags.Read) {
          newProperties.read = msgHdr.isRead;
        }
        if ((oldFlag ^ newFlag) & Ci.nsMsgMessageFlags.New) {
          newProperties.new = !!(newFlag & Ci.nsMsgMessageFlags.New);
        }
        break;
      case "Flagged":
        newProperties.flagged = msgHdr.isFlagged;
        break;
    }
    if (Object.keys(newProperties).length) {
      // Reconstruct old values of changed boolean properties.
      const oldProperties = Object.fromEntries(
        Object.entries(newProperties).map(([name, value]) => [name, !value])
      );
      this.emit(
        "message-updated",
        new CachedMsgHeader(this, msgHdr),
        newProperties,
        oldProperties
      );
    }
  }

  /**
   * Implements nsIFolderListener.onFolderIntPropertyChanged().
   *
   * @param {nsIMsgFolder} folder
   * @param {string} property
   * @param {integer} oldValue
   * @param {integer} newValue
   */
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
   * Implements nsIFolderListener.onMessageRemoved().
   *
   * @param {nsIMsgFolder} folder
   * @param {nsIMsgDBHdr} msgHdr
   */
  onMessageRemoved(folder, msgHdr) {
    // An IMAP move operation may not get this information in time, cache it.
    const hash = `folderURI: ${folder.URI}, messageKey: ${msgHdr.messageKey}`;
    // Do not add the cached header of the deleted message unnecessarily to the
    // message tracker. It will be added once it is actually used.
    const cachedHdr = new CachedMsgHeader(this, msgHdr, {
      addToMessageTracker: false,
    });
    // Since this message is removed, it will have certain flags set which will
    // prevent it from being returned to the caller. For the purpose of this cache,
    // this needs to be ignored.
    cachedHdr.flags &= ~(
      Ci.nsMsgMessageFlags.IMAPDeleted | Ci.nsMsgMessageFlags.Expunged
    );
    this._msgHdrCache.set(hash, cachedHdr);
  }

  // Implements nsIMsgFolderListener.

  /**
   * Implements nsIMsgFolderListener.msgPropertyChanged().
   *
   * @param {nsIMsgDBHdr} msgHdr
   * @param {string} property
   * @param {string} oldValue
   * @param {string} newValue
   */
  msgPropertyChanged(msgHdr, property, oldValue, newValue) {
    const newProperties = {};
    const oldProperties = {};

    switch (property) {
      case "keywords":
        {
          const newKeywords = newValue
            ? newValue.split(" ").filter(MailServices.tags.isValidKey)
            : [];
          const oldKeywords = oldValue
            ? oldValue.split(" ").filter(MailServices.tags.isValidKey)
            : [];
          if (newKeywords != oldKeywords) {
            newProperties.tags = newKeywords;
            oldProperties.tags = oldKeywords;
          }
        }
        break;

      case "junkscore":
        {
          const newJunk = (parseInt(newValue, 10) || 0) >= lazy.gJunkThreshold;
          const oldJunk = (parseInt(oldValue, 10) || 0) >= lazy.gJunkThreshold;
          if (newJunk != oldJunk) {
            newProperties.junk = newJunk;
            oldProperties.junk = oldJunk;
          }
        }
        break;
    }

    if (Object.keys(newProperties).length) {
      this.emit(
        "message-updated",
        new CachedMsgHeader(this, msgHdr),
        newProperties,
        oldProperties
      );
    }
  }

  /**
   * Implements nsIMsgFolderListener.msgsDeleted().
   *
   * @param {nsIMsgDBHdr[]} deletedMsgs
   */
  msgsDeleted(deletedMsgs) {
    if (deletedMsgs.length > 0) {
      const cachedDeletedMsgs = deletedMsgs.map(
        msgHdr => new CachedMsgHeader(this, msgHdr)
      );
      cachedDeletedMsgs
        .map(msgHdr => this.getIdentifier(msgHdr))
        .forEach(msgIdentifier => this._remove(msgIdentifier));
      this.emit("messages-deleted", cachedDeletedMsgs);
    }
  }

  /**
   * Implements nsIMsgFolderListener.msgAdded().
   *
   * @param {nsIMsgDBHdr} msgHdr
   */
  msgAdded(msgHdr) {
    // An IMAP copy/move operation may be waiting for a newly added header.
    const hash = `folderURI: ${msgHdr.folder.URI}, headerMessageId: ${msgHdr.messageId}`;
    if (this._headerPromises.has(hash)) {
      this._headerPromises.get(hash).resolve(new CachedMsgHeader(this, msgHdr));
      this._headerPromises.delete(hash);
    }
  }

  /**
   * Implements nsIMsgFolderListener.msgsMoveCopyCompleted().
   *
   * @param {boolean} move - whether this is a move or a copy operation
   * @param {nsIMsgDBHdr[]} srcMsgs
   * @param {nsIMsgFolder} dstFolder
   * @param {nsIMsgDBHdr[]} dstMsgs
   */
  async msgsMoveCopyCompleted(move, srcMsgs, dstFolder, dstMsgs) {
    if (srcMsgs.length == 0) {
      return;
    }

    const emitMsg = move ? "messages-moved" : "messages-copied";
    const cachedSrcMsgs = srcMsgs.map(msgHdr => {
      // Some move operations will have an invalid src msgHdr (message is already
      // gone), extract the header from _msgHdrCache.
      if (!msgHdr.messageId) {
        const hash = `folderURI: ${msgHdr.folder.URI}, messageKey: ${msgHdr.messageKey}`;
        if (this._msgHdrCache.has(hash)) {
          const cachedHdr = this._msgHdrCache.get(hash);
          // Manually add the cached header to the tracker, which was skipped
          // during its creation to prevent needlessly tracked headers. If the
          // message is already known, the existing ID is re-used. This must be
          // done before the information of the deleted message is purged from
          // the tracker, otherwise a new message ID will be assigned.
          cachedHdr.addToMessageTracker();
          return cachedHdr;
        }
      }
      return new CachedMsgHeader(this, msgHdr);
    });
    if (move) {
      cachedSrcMsgs
        .map(msgHdr => this.getIdentifier(msgHdr))
        .forEach(msgIdentifier => this._remove(msgIdentifier));
    }

    // If messages are moved or copied to IMAP servers, the dstMsgs array can be
    // empty. In these cases we trigger an update of the destination folder and
    // wait for the msgAdded event.
    if (cachedSrcMsgs.length > 0 && dstMsgs.length == 0) {
      // Create Promises for new messages to appear in the destination folder
      // with the expected headerMessageId.
      const dstMsgsPromises = cachedSrcMsgs.map(msgHdr => {
        const hash = `folderURI: ${dstFolder.URI}, headerMessageId: ${msgHdr.messageId}`;
        const deferred = Promise.withResolvers();
        this._headerPromises.set(hash, deferred);
        return deferred.promise;
      });

      dstFolder.updateFolder(null);
      const deferredDstMsgs = await Promise.all(dstMsgsPromises);
      this.emit(emitMsg, cachedSrcMsgs, deferredDstMsgs);
    } else {
      const cachedDstMsgs = dstMsgs.map(
        msgHdr => new CachedMsgHeader(this, msgHdr)
      );
      this.emit(emitMsg, cachedSrcMsgs, cachedDstMsgs);
    }
  }

  /**
   * Implements nsIMsgFolderListener.msgKeyChanged().
   *
   * Updates the mapping of message keys to WebExtension message IDs in the message
   * tracker: For IMAP messages there is a delayed update of database keys and if
   * those keys change, the messageTracker needs to update its maps, otherwise
   * wrong messages will be returned.
   *
   * @param {nsMsgKey} oldKey - The previous message key of the updated message.
   * @param {nsIMsgDBHdr} newMsgHdr - The updated message metadata.
   */
  msgKeyChanged(oldKey, newMsgHdr) {
    const newKey = newMsgHdr.messageKey;

    // In some cases, the new key is already used by another message, and the keys
    // have to be swapped in the message tracker. When this occurs, we immediately
    // update both associated tracker entries. However, IMAP will send this event
    // for both updates and we need to catch the second call and avoid reverting
    // the mapping. Note: In some cases the swap sequence may involve multiple
    // steps:
    //                                                                                     A: 6  B: 5  C: 4  D: 3  E: 2  F: 1  G:34  H:33  I:32  J:31  K:30  L:29
    // keyChange: 33 -> [ 1]                                          add pending  1->33   A: 6  B: 5  C: 4  D: 3  E: 2  F:33  G:34  H: 1  I:32  J:31  K:30  L:29
    // keyChange: 32 -> [ 2]                                          add pending  2->32   A: 6  B: 5  C: 4  D: 3  E:32  F:33  G:34  H: 1  I: 2  J:31  K:30  L:29
    // keyChange: 31 -> [ 3]                                          add pending  3->31   A: 6  B: 5  C: 4  D:31  E:32  F:33  G:34  H: 1  I: 2  J: 3  K:30  L:29
    // keyChange: 30 -> [ 4]                                          add pending  4->30   A: 6  B: 5  C:30  D:31  E:32  F:33  G:34  H: 1  I: 2  J: 3  K: 4  L:29
    // keyChange: 29 -> [ 5]                                          add pending  5->29   A: 6  B:29  C:30  D:31  E:32  F:33  G:34  H: 1  I: 2  J: 3  K: 4  L: 5
    // keyChange: 34 -> [ 6]                                          add pending  6->34   A:34  B:29  C:30  D:31  E:32  F:33  G: 6  H: 1  I: 2  J: 3  K: 4  L: 5
    // keyChange:  6 -> [29]  replayed as  6->34 & 34->[29]           add pending 29->34   A:29  B:34  C:30  D:31  E:32  F:33  G: 6  H: 1  I: 2  J: 3  K: 4  L: 5
    // keyChange:  5 -> [30]  replayed as  5->29 & 29->34 & 34->[30]  add pending 30->34   A:29  B:30  C:34  D:31  E:32  F:33  G: 6  H: 1  I: 2  J: 3  K: 4  L: 5
    // keyChange:  4 -> [31]  replayed as  4->30 & 30->34 & 34->[31]  add pending 31->34   A:29  B:30  C:31  D:34  E:32  F:33  G: 6  H: 1  I: 2  J: 3  K: 4  L: 5
    // keyChange:  3 -> [32]  replayed as  3->31 & 31->34 & 34->[32]  add pending 32->34   A:29  B:30  C:31  D:32  E:34  F:33  G: 6  H: 1  I: 2  J: 3  K: 4  L: 5
    // keyChange:  2 -> [33]  replayed as  2->32 & 32->34 & 34->[33]  add pending 33->34   A:29  B:30  C:31  D:32  E:33  F:34  G: 6  H: 1  I: 2  J: 3  K: 4  L: 5
    // keyChange:  1 -> [34]  replayed as  1->33 & 33->34 & 34->[34]  NO-OP
    while (oldKey != newKey && this._pendingKeyChanges.has(oldKey)) {
      const next = this._pendingKeyChanges.get(oldKey);
      this._pendingKeyChanges.delete(oldKey);
      oldKey = next;
    }

    // Check if we are left with a no-op swap and exit early.
    if (oldKey == newKey) {
      this._pendingKeyChanges.delete(oldKey);
      return;
    }

    const createIdentifier = messageKey => ({
      folderURI: newMsgHdr.folder.URI,
      messageKey,
    });

    const idAssociatedWithOldKey = this._get(createIdentifier(oldKey));
    const idAssociatedWithNewKey = this._get(createIdentifier(newKey));

    // Update the tracker entries for the ID associated with the old key and make
    // it point to the new key.
    this._set(idAssociatedWithOldKey, createIdentifier(newKey));

    if (idAssociatedWithNewKey) {
      // If the new key was already in use, make its associated ID point to the
      // old key (swapping the keys).
      this._set(idAssociatedWithNewKey, createIdentifier(oldKey));
      // Log the executed mirror swap as pending.
      this._pendingKeyChanges.set(newKey, oldKey);
    } else {
      // Decouple the obsolete message identifier for the old key from the ID it
      // was associated with and remove it from the tracker.
      this._decouple(createIdentifier(oldKey));
    }
  }

  // Implements nsIObserver.

  /**
   * Observer to update message tracker if a message has received a new key due
   * to attachments being removed, which we do not consider to be a new message.
   */
  observe(subject, topic, data) {
    if (topic == "attachment-delete-msgkey-changed") {
      data = JSON.parse(data);
      if (data && data.folderURI && data.oldMessageKey && data.newMessageKey) {
        const createIdentifier = messageKey => ({
          folderURI: data.folderURI,
          messageKey,
        });

        const id = this._get(createIdentifier(data.oldMessageKey));
        if (id) {
          // Update the tracker entry for ID to point to the new key.
          this._set(id, createIdentifier(data.newMessageKey));
          // Decouple the obsolete message identifier from the ID it was associated
          // with and remove it from the tracker.
          this._decouple(createIdentifier(data.oldMessageKey));
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
    this.log = new Set();

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

    const messageHeader = this.extension.messageManager.convert(msgHdr, {
      skipFolder: true,
    });
    if (!messageHeader || this.log.has(messageHeader.id)) {
      return;
    }

    if (this.currentPage.messages.length >= this.messagesPerPage) {
      await this.addPage();
    }

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
    this.log.add(messageHeader.id);
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
   * @param {nsIMsgDBHdr[]} messages - Array or enumerator of messages.
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
   * @param {nsIMsgDBHdr[]|Iterator} messages - Array or enumerator of messages.
   * @param {MessageList} messageList
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
      await messageList.addMessage(next);
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
   * @param {string} messageListId
   * @param {ExtensionData} extension
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
 * @typedef {object} MessageConvertOptions
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

    // Cache msgHdr to reduce XPCOM requests.
    const cachedHdr =
      msgHdr instanceof CachedMsgHeader
        ? msgHdr
        : new CachedMsgHeader(this._messageTracker, msgHdr);

    // Skip messages, which are actually deleted.
    if (
      cachedHdr.flags &
      (Ci.nsMsgMessageFlags.IMAPDeleted | Ci.nsMsgMessageFlags.Expunged)
    ) {
      return null;
    }

    const junkScore =
      parseInt(cachedHdr.getStringProperty("junkscore"), 10) || 0;
    const tags = (cachedHdr.getStringProperty("keywords") || "")
      .split(" ")
      .filter(MailServices.tags.isValidKey);

    const messageObject = {
      id: cachedHdr.id,
      date: new Date(Math.round(cachedHdr.date / 1000)),
      author: parseEncodedAddrHeader(cachedHdr.author).shift() || "",
      recipients: parseEncodedAddrHeader(cachedHdr.recipients, false),
      ccList: parseEncodedAddrHeader(cachedHdr.ccList, false),
      bccList: parseEncodedAddrHeader(cachedHdr.bccList, false),
      subject: cachedHdr.mime2DecodedSubject,
      read: cachedHdr.isRead,
      new: !!(cachedHdr.flags & Ci.nsMsgMessageFlags.New),
      headersOnly: !!(cachedHdr.flags & Ci.nsMsgMessageFlags.Partial),
      flagged: !!cachedHdr.isFlagged,
      junk: junkScore >= lazy.gJunkThreshold,
      junkScore,
      headerMessageId: cachedHdr.messageId,
      size: cachedHdr.messageSize,
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
    const msgHdr = this._messageTracker.getMessage(id);
    if (!msgHdr) {
      return null;
    }

    // Skip messages, which are actually deleted.
    if (
      msgHdr.flags &
      (Ci.nsMsgMessageFlags.IMAPDeleted | Ci.nsMsgMessageFlags.Expunged)
    ) {
      return null;
    }

    return msgHdr;
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
    const allAccounts = getMailAccounts().map(account => ({
      key: account.key,
      rootFolder: account.incomingServer.rootFolder,
      incomingServer: account.incomingServer,
    }));

    // The queryInfo.folder property is only supported in MV2 and specifies a
    // single MailFolder. The queryInfo.folderId property specifies one or more
    // MailFolderIds. When one or more accounts and one or more folders are
    // specified, the accounts are used as a filter on the specified folders.
    let queryFolders = null;
    if (this.queryInfo.folder) {
      queryFolders = [getFolder(this.queryInfo.folder)];
    } else if (this.queryInfo.folderId) {
      // Enforce the order as specified.
      const folderIds = Array.isArray(this.queryInfo.folderId)
        ? this.queryInfo.folderId
        : [this.queryInfo.folderId];
      queryFolders = folderIds.map(f => getFolder(f));
    }

    let queryAccounts = null;
    if (this.queryInfo.accountId) {
      // Enforce the order as specified.
      const accountKeys = Array.isArray(this.queryInfo.accountId)
        ? this.queryInfo.accountId
        : [this.queryInfo.accountId];
      queryAccounts = accountKeys.map(accountKey =>
        allAccounts.find(account => accountKey == account.key)
      );
    }

    if (this.queryInfo.online) {
      if (!this.queryInfo.headerMessageId) {
        throw new ExtensionError(
          `Property headerMessageId is required for online queries.`
        );
      }
      const nntpAccounts = (queryAccounts ?? allAccounts).filter(
        account => account.incomingServer.type == "nntp"
      );
      for (const account of nntpAccounts) {
        const msgHdr = await retrieveMessageFromServer(
          this.queryInfo.headerMessageId,
          account.incomingServer
        );
        if (msgHdr) {
          return this.messageListTracker.startList([msgHdr], this.extension);
        }
      }
      return this.messageListTracker.startList([], this.extension);
    }

    if (queryFolders) {
      includeSubFolders = !!this.queryInfo.includeSubFolders;
      if (!this.extension.hasPermission("accountsRead")) {
        throw new ExtensionError(
          'Querying by folder requires the "accountsRead" permission'
        );
      }
      for (const queryFolder of queryFolders) {
        const { folder, accountKey } = queryFolder;
        if (
          !queryAccounts ||
          queryAccounts.some(account => accountKey == account.key)
        ) {
          folders.push(folder);
        }
      }
    } else {
      includeSubFolders = true;
      for (const account of queryAccounts || allAccounts) {
        folders.push(account.rootFolder);
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
    const msgHdrProcessor = new MsgHdrProcessor(msgHdr);

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
        parseEncodedAddrHeader(msgHdr.recipients, true),
        parseEncodedAddrHeader(msgHdr.ccList, true),
        parseEncodedAddrHeader(msgHdr.bccList, true)
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
      const authors = parseEncodedAddrHeader(msgHdr.author, true);
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
        { addr: msgHdr.author, doRfc2047: true },
      ])
    ) {
      return false;
    }

    // Check recipients.
    if (
      this.queryInfo.recipients &&
      !isAddressMatch(this.queryInfo.recipients, [
        { addr: msgHdr.recipients, doRfc2047: true },
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
      const authorMatches = parseEncodedAddrHeader(msgHdr.author, false)
        .shift()
        .includes(this.queryInfo.fullText);
      fullTextBodySearchNeeded = !(subjectMatches || authorMatches);
    }

    // Check body.
    if (this.queryInfo.body || fullTextBodySearchNeeded) {
      const mimeTree = await msgHdrProcessor.getDecryptedTree();
      if (
        this.queryInfo.body &&
        !includesContent(folder, [mimeTree], this.queryInfo.body)
      ) {
        return false;
      }
      if (
        fullTextBodySearchNeeded &&
        !includesContent(folder, [mimeTree], this.queryInfo.fullText)
      ) {
        return false;
      }
    }

    // Check attachments.
    if (this.queryInfo.attachment != null) {
      const attachments = await msgHdrProcessor.getAttachmentParts({
        includeNestedAttachments: true,
      });
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
    const messages = getMessagesInFolder(folder);

    for (const msg of messages) {
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
      includesContent(folder, part.subParts, searchTerm)
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
  const contentType = part.headers.contentType.type;
  if (contentType == "text/plain") {
    return part.body;
  }
  // text/enriched gets transformed into HTML by libmime
  if (contentType == "text/html" || part.contentType == "text/enriched") {
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
 * @returns {boolean} true if search was successful.
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
 * @returns {boolean} true if search was successful.
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

async function retrieveMessageFromServer(mid, server) {
  const url = new URL(`news://${server.hostName}:${server.port}/${mid}`);

  const tempFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
  tempFile.append("nntp-downloaded-message.eml");
  tempFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
  const extAppLauncher = Cc[
    "@mozilla.org/uriloader/external-helper-app-service;1"
  ].getService(Ci.nsPIExternalAppLauncher);
  extAppLauncher.deleteTemporaryFileOnExit(tempFile);

  const messageService = Cc[
    "@mozilla.org/messenger/messageservice;1?type=news"
  ].getService(Ci.nsIMsgMessageService);
  const savedPromise = new Promise(resolve => {
    messageService.saveMessageToDisk(
      url.href,
      tempFile,
      false,
      {
        async OnStopRunningUrl(_url, status) {
          resolve(status);
        },
      },
      true,
      null
    );
  });
  const status = await savedPromise;
  if (!Components.isSuccessCode(status) || tempFile.fileSize <= 0) {
    console.warn(`Could not open ${url.href}`);
    return null;
  }

  const uri = Services.io.newFileURI(tempFile).spec;
  return MailServices.messageServiceFromURI(uri).messageURIToMsgHdr(uri);
}

/**
 * Tracks tags in order to include the new and old value in update events.
 */
export class TagTracker extends EventEmitter {
  #tags;
  constructor() {
    super();
    this.#tags = new Map(
      MailServices.tags
        .getAllTags()
        .map(({ key, tag, color, ordinal }) => [
          key,
          { tag, color: color.toUpperCase(), ordinal },
        ])
    );
    Services.prefs.addObserver("mailnews.tags.", this);
  }

  observe(subject, topic, data) {
    if (topic != "nsPref:changed") {
      return;
    }
    const [, , key, property] = data.split(".");
    if (!["tag", "color", "ordinal"].includes(property)) {
      return;
    }

    let newValue = Services.prefs.getStringPref(data, null);
    if (newValue == null) {
      // Removing a tag. Is fired for each property, handle it only once for the
      // "tag" property.
      if (property == "tag") {
        this.#tags.delete(key);
        this.emit("tag-deleted", key);
      }
      return;
    }

    const knownEntry = this.#tags.get(key);
    if (!knownEntry) {
      // Adding a new tag. The sequence of a new tag being added ends with the
      // "color" property. Skip all other property notifications.
      if (property == "color") {
        const [createdTag] = MailServices.tags
          .getAllTags()
          .filter(t => t.key == key)
          .map(({ tag, color, ordinal }) => ({
            tag,
            color: color.toUpperCase(),
            ordinal,
          }));
        this.#tags.set(key, createdTag);
        this.emit("tag-created", key, createdTag);
      }
      return;
    }

    // Updating the property of an existing tag.
    if (property == "color") {
      newValue = newValue.toUpperCase();
    }
    const oldValue = knownEntry[property];
    if (oldValue != newValue) {
      knownEntry[property] = newValue;
      this.emit(
        "tag-updated",
        key,
        { [property]: newValue },
        { [property]: oldValue }
      );
    }
  }
}
