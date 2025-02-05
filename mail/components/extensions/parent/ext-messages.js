/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  AttachmentInfo: "resource:///modules/AttachmentInfo.sys.mjs",
  MessageArchiver: "resource:///modules/MessageArchiver.sys.mjs",
  MimeParser: "resource:///modules/mimeParser.sys.mjs",
});

var {
  getMsgPartUrl,
  getMessagesInFolder,
  messagePartToRaw,
  parseEncodedAddrHeader,
  CachedMsgHeader,
  MAILBOX_HEADERS,
  MessageQuery,
  MsgHdrProcessor,
} = ChromeUtils.importESModule("resource:///modules/ExtensionMessages.sys.mjs");

var { getFolder } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionAccounts.sys.mjs"
);

var { MailStringUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailStringUtils.sys.mjs"
);

XPCOMUtils.defineLazyGlobalGetters(this, ["File"]);

var { DefaultMap } = ExtensionUtils;

/**
 * Takes a MimeTreePart and returns the raw headers, to be used in the
 * WebExtension MessagePart.
 *
 * @param {MimeTreePart} mimeTreePart
 * @returns {object} An <string, string[]> mapping. The headers of the part.
 *   Each key is the name of a header and its value is an array of the header
 *   values.
 * @see {MimeTree}
 */
function convertRawHeaders(mimeTreePart) {
  const partHeaders = {};
  for (const [headerName, headerValue] of mimeTreePart.headers._rawHeaders) {
    // Return an array, even for single values.
    const valueArray = Array.isArray(headerValue) ? headerValue : [headerValue];
    partHeaders[headerName] = valueArray;
  }

  return partHeaders;
}

/**
 * Takes a MimeTreePart and returns the processed headers, to be used in the
 * WebExtension MessagePart. Adds a content-type header if missing.
 *
 * @param {MimeTreePart} mimeTreePart
 * @returns {object} An <string, string[]> mapping. The headers of the part.
 *   Each key is the name of a header and its value is an array of the header
 *   values.
 * @see {MimeTree}
 */
function convertHeaders(mimeTreePart) {
  // For convenience, the API has always decoded the returned headers. That turned
  // out to make it impossible to parse certain headers. For example, the following
  // TO header
  //   =?UTF-8?Q?H=C3=B6rst=2C_Kenny?= <K.Hoerst@invalid>, new@thunderbird.bug
  // was decoded to
  //   Hörst, Kenny <K.Hoerst@invalid>, new@thunderbird.bug
  // This issue seems to be specific to address headers. Similar to jsmime, which
  // is using a dedicated parser for well known address headers, we will handle
  // these address headers separately as well. Add-on developers may request raw
  // headers and manually decode them using messengerUtilities.decodeMimeHeader(),
  // which allows to specify whether the header is a mailbox header or not.

  const partHeaders = {};
  for (const [headerName, headerValue] of mimeTreePart.headers._rawHeaders) {
    // Return an array, even for single values.
    const valueArray = Array.isArray(headerValue) ? headerValue : [headerValue];

    partHeaders[headerName] = MAILBOX_HEADERS.includes(headerName)
      ? valueArray.map(value => parseEncodedAddrHeader(value).join(", "))
      : valueArray.map(value => {
          return MailServices.mimeConverter.decodeMimeHeader(
            MailStringUtils.stringToByteString(value),
            null,
            false /* override_charset */,
            true /* eatContinuations */
          );
        });
  }
  if (!partHeaders["content-type"]) {
    partHeaders["content-type"] = ["text/plain"];
  }
  return partHeaders;
}

/**
 * @typedef {object} MessagePart
 *
 * The WebExtension type "MessagePart", as defined in messages.json.
 *
 * @property {string} [body] - The quoted-printable or base64 decoded content of
 *   the part. Only present for parts with a content type of <var>text/*</var>
 *   and only if requested.
 * @property {string} [contentType] - The contentType of the part.
 * @property {string} [decryptionStatus] - The decryptionStatus of the part, one
 *   of "none", "skipped", "success" or "fail".
 * @property {object} [headers] - A <string, string[]> mapping.
 *   The RFC2047 decoded headers of the part. Each key is the name of a header
 *   and its value is an array of header values (if header is specified more
 *   than once).
 * @property {string} [name] - Name of the part, if it is an attachment/file.
 * @property {string} [partName] - The identifier of this part in the message
 *   (for example "1.2").
 * @property {MessagePart[]} [parts] - Any sub-parts of this part.
 * @property {string} [rawBody] - The raw content of the part.
 * @property {object} [rawHeaders] - An <string, string[]> mapping. The raw
 *   headers of the part. Each key is the name of a header and its value is an
 *   array of the header values (if header is specified more than once).
 * @property {integer} [size] - The size of this part. The size of message/* parts
 *   is not the actual message size (on disc), but the total size of its decoded
 *   body parts, excluding headers.
 * @see mail/components/extensions/schemas/messages.json
 */

/**
 * Takes a MimeTreePart, filters out the properties we don't want to send to
 * extensions and converts it to a WebExtension MessagePart.
 *
 * @param {MimeTreePart} mimeTreePart
 * @param {boolean} isRoot - If this is the root part, while working through the
 *   tree recursivly.
 * @param {boolean} decodeHeaders - If decoded or raw headers should be returned.
 * @param {boolean} decodeContent - If decoded or raw content should be returned,
 *   this determines if a "body" member only for text/* parts, or if a "rawBody"
 *   member for all parts is to be returned. The actual decoding is done elsewhere
 *   and the option should match the content data in the provided mimeTreePart.
 * @returns {MessagePart}
 * @see mail/extensions/openpgp/content/modules/MimeTree.sys.mjs
 */
function convertMessagePart(
  mimeTreePart,
  isRoot,
  decodeHeaders,
  decodeContent
) {
  const partObject = {
    contentType: mimeTreePart.headers.contentType.type || "text/plain",
    size: mimeTreePart.size,
    partName: mimeTreePart.partNum,
  };

  if (decodeContent) {
    // Supress content of attachments or other binary parts.
    const mediatype = mimeTreePart.headers.contentType.mediatype || "text";
    if (
      mimeTreePart.body &&
      !mimeTreePart.isAttachment &&
      mediatype == "text"
    ) {
      partObject.body = mimeTreePart.body;
    }
  } else {
    partObject.rawBody = mimeTreePart.body;
  }

  if (decodeHeaders) {
    partObject.headers = convertHeaders(mimeTreePart);
  } else {
    partObject.rawHeaders = convertRawHeaders(mimeTreePart);
  }

  if (mimeTreePart.isAttachment) {
    partObject.name = mimeTreePart.name || "";
  }

  if (
    mimeTreePart.decryptionStatus != "fail" &&
    "subParts" in mimeTreePart &&
    Array.isArray(mimeTreePart.subParts) &&
    mimeTreePart.subParts.length > 0
  ) {
    partObject.parts = mimeTreePart.subParts.map(part =>
      convertMessagePart(part, false, decodeHeaders, decodeContent)
    );
  }

  // The root mimeTreePart is the first MIME part of the message (for example a
  // multipart/* or a text/plain part). WebExtensions should get an outer
  // message/rfc822 part. Most headers are also moved to the outer message part.
  if (isRoot) {
    const rv = {
      contentType: "message/rfc822",
      partName: "",
      size: mimeTreePart.size,
      decryptionStatus: mimeTreePart.decryptionStatus,
    };

    if (decodeHeaders) {
      rv.headers = Object.fromEntries(
        Object.entries(partObject.headers).filter(
          h => !h[0].startsWith("content-")
        )
      );
      rv.headers["content-type"] = ["message/rfc822"];
      partObject.headers = Object.fromEntries(
        Object.entries(partObject.headers).filter(h =>
          h[0].startsWith("content-")
        )
      );
    } else {
      rv.rawHeaders = Object.fromEntries(
        Object.entries(partObject.rawHeaders).filter(
          h => !h[0].startsWith("content-")
        )
      );
      partObject.rawHeaders = Object.fromEntries(
        Object.entries(partObject.rawHeaders).filter(h =>
          h[0].startsWith("content-")
        )
      );
    }

    rv.parts = mimeTreePart.decryptionStatus != "fail" ? [partObject] : [];
    return rv;
  }
  return partObject;
}

/**
 * Takes a MimeTreePart of an attachment and returns a WebExtension MessageAttachment.
 *
 * @param {nsIMsgDBHdr} msgHdr - the msgHdr of the attachment's message
 * @param {MimeTreePart} mimeTreePart
 * @returns {MessageAttachment}
 * @see mail/extensions/openpgp/content/modules/MimeTree.sys.mjs
 * @see mail/components/extensions/schemas/messages.json
 */
async function convertAttachment(msgHdr, mimeTreePart, extension) {
  const contentDisposition = mimeTreePart.headers.has("content-disposition")
    ? mimeTreePart.headers
        .get("content-disposition")[0]
        .split(";")[0]
        .trim()
        .toLowerCase()
    : "attachment";

  const rv = {
    contentDisposition,
    contentType: mimeTreePart.headers.contentType.type || "text/plain",
    headers: convertHeaders(mimeTreePart),
    name: mimeTreePart.name || "",
    partName: mimeTreePart.partNum,
    size: mimeTreePart.size,
  };

  // If it is an attached message, create a dummy msgHdr for it.
  if (rv.contentType.startsWith("message/")) {
    // A message/rfc822 MimeTreePart has its headers in the first child.
    const headers = convertHeaders(mimeTreePart.subParts[0]);

    const attachedMsgHdr = new CachedMsgHeader(messageTracker);
    const attachedMsgUrl = getMsgPartUrl(msgHdr, mimeTreePart.partNum);
    attachedMsgHdr.setStringProperty("dummyMsgUrl", attachedMsgUrl);
    attachedMsgHdr.recipients = headers.to;
    attachedMsgHdr.ccList = headers.cc;
    attachedMsgHdr.bccList = headers.bcc;
    attachedMsgHdr.author = headers.from?.[0] || "";
    attachedMsgHdr.subject = headers.subject?.[0] || "";
    attachedMsgHdr.messageSize = mimeTreePart.size;

    const hdrDate = headers.date?.[0];
    attachedMsgHdr.date = hdrDate ? Date.parse(hdrDate) * 1000 : 0;

    const hdrId = headers["message-id"]?.[0];
    attachedMsgHdr.messageId = hdrId ? hdrId.replace(/^<|>$/g, "") : "";

    rv.message = extension.messageManager.convert(attachedMsgHdr);
  }

  // Include the content-Id, if available (for related parts).
  if (mimeTreePart.headers._rawHeaders.has("content-id")) {
    const cId = mimeTreePart.headers._rawHeaders.get("content-id")[0];
    rv.contentId = cId.replace(/^<|>$/g, "");
  }

  return rv;
}

this.messages = class extends ExtensionAPIPersistent {
  PERSISTENT_EVENTS = {
    // For primed persistent events (deactivated background), the context is only
    // available after fire.wakeup() has fulfilled (ensuring the convert() function
    // has been called).

    onNewMailReceived({ fire }, [monitorAllFolders]) {
      const listener = async (event, folder, newMessages) => {
        const { extension } = this;
        // The msgHdr could be gone after the wakeup, convert it early.
        const page = await messageListTracker.startList(
          newMessages,
          extension,
          { includeDeletedMessages: true }
        );
        if (fire.wakeup) {
          await fire.wakeup();
        }
        // Evaluate sensitivity.
        const flags = folder.flags;
        const isInbox = f => f & Ci.nsMsgFolderFlags.Inbox;
        const isNormal = f =>
          !(f & (Ci.nsMsgFolderFlags.SpecialUse | Ci.nsMsgFolderFlags.Virtual));
        if (monitorAllFolders || isInbox(flags) || isNormal(flags)) {
          fire.async(extension.folderManager.convert(folder), page);
        }
      };
      messageTracker.on("messages-received", listener);
      return {
        unregister: () => {
          messageTracker.off("messages-received", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onUpdated({ fire }) {
      const listener = async (event, message, newProperties, oldProperties) => {
        const { extension } = this;
        // The msgHdr could be gone after the wakeup, convert it early.
        const convertedMessage = extension.messageManager.convert(message);
        if (!convertedMessage) {
          return;
        }
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(convertedMessage, newProperties, oldProperties);
      };
      messageTracker.on("message-updated", listener);
      return {
        unregister: () => {
          messageTracker.off("message-updated", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onMoved({ fire }) {
      const listener = async (event, srcMessages, dstMessages) => {
        const { extension } = this;
        // The msgHdr could be gone after the wakeup, convert them early.
        const srcPage = await messageListTracker.startList(
          srcMessages,
          extension,
          { includeDeletedMessages: true }
        );
        const dstPage = await messageListTracker.startList(
          dstMessages,
          extension,
          { includeDeletedMessages: true }
        );
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(srcPage, dstPage);
      };
      messageTracker.on("messages-moved", listener);
      return {
        unregister: () => {
          messageTracker.off("messages-moved", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onCopied({ fire }) {
      const listener = async (event, srcMessages, dstMessages) => {
        const { extension } = this;
        // The msgHdr could be gone after the wakeup, convert them early.
        const srcPage = await messageListTracker.startList(
          srcMessages,
          extension,
          { includeDeletedMessages: true }
        );
        const dstPage = await messageListTracker.startList(
          dstMessages,
          extension,
          { includeDeletedMessages: true }
        );
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(srcPage, dstPage);
      };
      messageTracker.on("messages-copied", listener);
      return {
        unregister: () => {
          messageTracker.off("messages-copied", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onDeleted({ fire }) {
      const listener = async (event, deletedMessages) => {
        const { extension } = this;
        // The msgHdr could be gone after the wakeup, convert them early.
        const deletedPage = await messageListTracker.startList(
          deletedMessages,
          extension,
          { includeDeletedMessages: true }
        );
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(deletedPage);
      };
      messageTracker.on("messages-deleted", listener);
      return {
        unregister: () => {
          messageTracker.off("messages-deleted", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },

    onTagCreated({ fire }) {
      const listener = async (event, key, { tag, color, ordinal }) => {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async({ key, tag, color, ordinal });
      };
      tagTracker.on("tag-created", listener);
      return {
        unregister: () => {
          tagTracker.off("tag-created", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onTagDeleted({ fire }) {
      const listener = async (event, key) => {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(key);
      };
      tagTracker.on("tag-deleted", listener);
      return {
        unregister: () => {
          tagTracker.off("tag-deleted", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onTagUpdated({ fire }) {
      const listener = async (event, key, changedValues, oldValues) => {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(key, changedValues, oldValues);
      };
      tagTracker.on("tag-updated", listener);
      return {
        unregister: () => {
          tagTracker.off("tag-updated", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
  };

  getAPI(context) {
    const { extension } = this;
    const { tabManager, messageManager } = extension;

    function collectMessagesInFolders(messageIds) {
      const folderMap = new DefaultMap(() => new Set());

      for (const messageId of messageIds) {
        const msgHdr = messageManager.get(messageId);
        if (!msgHdr) {
          throw new ExtensionError(`Message not found: ${messageId}.`);
        }

        const msgHeaderSet = folderMap.get(msgHdr.folder);
        msgHeaderSet.add(msgHdr);
      }

      return folderMap;
    }

    async function createTempFileMessage(msgHdr) {
      const msgHdrProcessor = new MsgHdrProcessor(msgHdr);
      const rawBinaryString = await msgHdrProcessor.getOriginalMessage();
      const pathEmlFile = await IOUtils.createUniqueFile(
        PathUtils.tempDir,
        encodeURIComponent(msgHdr.messageId).replaceAll(/[/:*?\"<>|]/g, "_") +
          ".eml",
        0o600
      );

      const emlFile = Cc["@mozilla.org/file/local;1"].createInstance(
        Ci.nsIFile
      );
      emlFile.initWithPath(pathEmlFile);
      const extAppLauncher = Cc[
        "@mozilla.org/uriloader/external-helper-app-service;1"
      ].getService(Ci.nsPIExternalAppLauncher);
      extAppLauncher.deleteTemporaryFileOnExit(emlFile);

      const buffer = MailStringUtils.byteStringToUint8Array(rawBinaryString);
      await IOUtils.write(pathEmlFile, buffer);
      return emlFile;
    }

    async function moveOrCopyMessages(
      messageIds,
      destination,
      isUserAction,
      isMove
    ) {
      const functionName = isMove ? "messages.move()" : "messages.copy()";

      if (
        !context.extension.hasPermission("accountsRead") ||
        !context.extension.hasPermission("messagesMove")
      ) {
        throw new ExtensionError(
          `Using ${functionName} requires the "accountsRead" and the "messagesMove" permission`
        );
      }
      const { folder: destinationFolder } = getFolder(destination);
      if (destinationFolder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
        throw new ExtensionError(
          `The destination used in ${functionName} cannot be a search folder`
        );
      }

      try {
        const promises = [];
        const folderMap = collectMessagesInFolders(messageIds);
        for (const [sourceFolder, msgHeaderSet] of folderMap.entries()) {
          if (sourceFolder == destinationFolder) {
            continue;
          }
          const msgHeaders = [...msgHeaderSet];

          // Special handling for external messages.
          if (!sourceFolder) {
            if (isMove) {
              throw new ExtensionError(
                `Operation not permitted for external messages`
              );
            }

            for (const msgHdr of msgHeaders) {
              let file;
              const fileUrl = msgHdr.getStringProperty("dummyMsgUrl");
              if (fileUrl.startsWith("file://")) {
                file = Services.io
                  .newURI(fileUrl)
                  .QueryInterface(Ci.nsIFileURL).file;
              } else {
                file = await createTempFileMessage(msgHdr);
              }

              promises.push(
                new Promise((resolve, reject) => {
                  MailServices.copy.copyFileMessage(
                    file,
                    destinationFolder,
                    /* msgToReplace */ null,
                    /* isDraftOrTemplate */ false,
                    /* aMsgFlags */ Ci.nsMsgMessageFlags.Read,
                    /* aMsgKeywords */ "",
                    /** @implements {nsIMsgCopyServiceListener} */
                    {
                      onStartCopy() {},
                      onProgress() {},
                      setMessageKey() {},
                      getMessageId() {
                        return null;
                      },
                      onStopCopy(status) {
                        if (status == Cr.NS_OK) {
                          resolve();
                        } else {
                          reject(new Error(`Aborted with status: ${status}`));
                        }
                      },
                    },
                    (isUserAction &&
                      windowTracker.topNormalWindow?.msgWindow) ||
                      null
                  );
                })
              );
            }
            continue;
          }

          // Since the archiver falls back to copy if delete is not supported,
          // lets do that here as well.
          promises.push(
            new Promise((resolve, reject) => {
              MailServices.copy.copyMessages(
                sourceFolder,
                msgHeaders,
                destinationFolder,
                isMove && sourceFolder.canDeleteMessages,
                /** @implements {nsIMsgCopyServiceListener} */
                {
                  onStartCopy() {},
                  onProgress() {},
                  setMessageKey() {},
                  getMessageId() {
                    return null;
                  },
                  onStopCopy(status) {
                    if (status == Cr.NS_OK) {
                      resolve();
                    } else {
                      reject(new Error(`Aborted with status: ${status}`));
                    }
                  },
                },
                (isUserAction && windowTracker.topNormalWindow?.msgWindow) ||
                  null,
                isUserAction // allowUndo
              );
            })
          );
        }
        await Promise.all(promises);
        if (isUserAction) {
          Services.prefs.setStringPref(
            "mail.last_msg_movecopy_target_uri",
            destinationFolder.URI
          );
          Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", isMove);
        }
      } catch (ex) {
        console.error(ex);
        throw new ExtensionError(
          `Error ${isMove ? "moving" : "copying"} message: ${ex.message}`
        );
      }
    }

    return {
      messages: {
        onNewMailReceived: new EventManager({
          context,
          module: "messages",
          event: "onNewMailReceived",
          extensionApi: this,
        }).api(),
        onUpdated: new EventManager({
          context,
          module: "messages",
          event: "onUpdated",
          extensionApi: this,
        }).api(),
        onMoved: new EventManager({
          context,
          module: "messages",
          event: "onMoved",
          extensionApi: this,
        }).api(),
        onCopied: new EventManager({
          context,
          module: "messages",
          event: "onCopied",
          extensionApi: this,
        }).api(),
        onDeleted: new EventManager({
          context,
          module: "messages",
          event: "onDeleted",
          extensionApi: this,
        }).api(),
        async list(target) {
          const { folder } = getFolder(target);
          const messages = getMessagesInFolder(folder);
          return messageListTracker.startList(messages, context.extension);
        },
        async continueList(messageListId) {
          const messageList = messageListTracker.getList(
            messageListId,
            context.extension
          );
          return messageListTracker.getNextPage(messageList);
        },
        async abortList(messageListId) {
          const messageList = messageListTracker.getList(
            messageListId,
            context.extension
          );
          messageList.done();
        },
        async get(messageId) {
          const msgHdr = messageManager.get(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }
          const messageHeader =
            context.extension.messageManager.convert(msgHdr);
          if (!messageHeader || messageHeader.id != messageId) {
            throw new ExtensionError(
              "Unexpected Error: Returned message does not equal requested message."
            );
          }
          return messageHeader;
        },
        async getFull(messageId, options) {
          // Default for decrypt and decode is true (backward compatibility).
          const decrypt = options?.decrypt ?? true;

          const decodeHeaders = options?.decodeHeaders ?? true;
          const decodeContent = options?.decodeContent ?? true;
          const parserOptions = {
            strFormat: decodeContent ? "unicode" : "binarystring",
            bodyFormat: decodeContent ? "decode" : "nodecode",
            stripContinuations: decodeHeaders,
          };

          const msgHdr = messageManager.get(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }

          const msgHdrProcessor = new MsgHdrProcessor(msgHdr, parserOptions);
          let mimeTree;
          try {
            if (decrypt) {
              mimeTree = await msgHdrProcessor.getDecryptedTree();
            } else {
              mimeTree = await msgHdrProcessor.getOriginalTree();
            }
          } catch (ex) {
            console.error(ex);
            throw new ExtensionError(`Error reading message ${messageId}`);
          }

          if (msgHdr.flags & Ci.nsMsgMessageFlags.Partial) {
            // Do not include fake body parts.
            mimeTree.subParts = [];
          }
          return convertMessagePart(
            mimeTree,
            true,
            decodeHeaders,
            decodeContent
          );
        },
        async getRaw(source, options) {
          // Default for decrypt is false (backward compatibility).
          const decrypt = options?.decrypt ?? false;
          // Default for data_format in MV3 is File.
          let data_format = options?.data_format;
          if (!["File", "BinaryString"].includes(data_format)) {
            data_format =
              extension.manifestVersion < 3 ? "BinaryString" : "File";
          }

          const createFileFromBinaryString = (raw, filename) => {
            // Convert binary string to Uint8Array and return a File.
            const bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) {
              bytes[i] = raw.charCodeAt(i) & 0xff;
            }
            return new File([bytes], filename, {
              type: "message/rfc822",
            });
          };

          // Check if the source is a MessagePart.
          if (
            !Number.isInteger(source) &&
            source?.contentType == "message/rfc822"
          ) {
            const raw = messagePartToRaw(source);
            // TODO: Pipe raw through decryptor if requested.
            if (decrypt) {
              console.warn(
                "Decrypting a generated message is not yet supported"
              );
            }
            if (data_format == "BinaryString") {
              return raw;
            }
            return createFileFromBinaryString(raw, "generated.eml");
          }

          const messageId = source;
          const msgHdr = messageManager.get(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }

          const msgHdrProcessor = new MsgHdrProcessor(msgHdr);
          let raw;
          try {
            if (decrypt) {
              raw = await msgHdrProcessor.getDecryptedMessage();
            } else {
              raw = await msgHdrProcessor.getOriginalMessage();
            }
          } catch (ex) {
            switch (ex.cause) {
              case "MessageDecryptionError":
                throw new ExtensionError(
                  `Error decrypting message ${messageId}`
                );
              default:
                console.error(ex);
                throw new ExtensionError(`Error reading message ${messageId}`);
            }
          }

          if (data_format == "BinaryString") {
            return raw;
          }
          return createFileFromBinaryString(raw, `message-${messageId}.eml`);
        },
        async listInlineTextParts(messageId) {
          const msgHdr = messageManager.get(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }
          const msgHdrProcessor = new MsgHdrProcessor(msgHdr);
          let mimeTree;
          try {
            mimeTree = await msgHdrProcessor.getDecryptedTree();
          } catch (ex) {
            console.error(ex);
            throw new ExtensionError(`Error reading message ${messageId}`);
          }

          if (msgHdr.flags & Ci.nsMsgMessageFlags.Partial) {
            // Do not include fake body parts.
            mimeTree.subParts = [];
          }

          const extractInlineTextParts = mimeTreePart => {
            const { mediatype, subtype } = mimeTreePart.headers.contentType;
            if (mediatype == "multipart") {
              for (const subPart of mimeTreePart.subParts) {
                extractInlineTextParts(subPart);
              }
            } else if (
              mediatype == "text" &&
              mimeTreePart.body &&
              !mimeTreePart.isAttachment
            ) {
              textParts.push({
                contentType: `text/${subtype}`,
                content: mimeTreePart.body,
              });
            }
          };

          const textParts = [];
          extractInlineTextParts(mimeTree);
          return textParts;
        },
        async listAttachments(messageId) {
          const msgHdr = messageManager.get(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }

          const msgHdrProcessor = new MsgHdrProcessor(msgHdr);
          let attachments;
          try {
            attachments = await msgHdrProcessor.getAttachmentParts();
          } catch (ex) {
            switch (ex.cause) {
              case "MessageDecryptionError":
                throw new ExtensionError(
                  `Error decrypting message ${messageId}`
                );
              default:
                console.error(ex);
                throw new ExtensionError(`Error reading message ${messageId}`);
            }
          }

          for (let i = 0; i < attachments.length; i++) {
            attachments[i] = await convertAttachment(
              msgHdr,
              attachments[i],
              context.extension
            );
          }
          return attachments;
        },
        async getAttachmentFile(messageId, partName) {
          const msgHdr = messageManager.get(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }

          const msgHdrProcessor = new MsgHdrProcessor(msgHdr);
          let attachmentPart;
          try {
            attachmentPart = await msgHdrProcessor.getAttachmentPart(partName, {
              includeRaw: true,
            });
          } catch (ex) {
            switch (ex.cause) {
              case "MessageDecryptionError":
                throw new ExtensionError(
                  `Error decrypting message ${messageId}`
                );
              default:
                console.error(ex);
                throw new ExtensionError(`Error reading message ${messageId}`);
            }
          }
          if (!attachmentPart) {
            throw new ExtensionError(
              `Part ${partName} not found in message ${messageId}.`
            );
          }

          // Convert binary string to Uint8Array and return a File.
          const bytes = new Uint8Array(attachmentPart.body.length);
          for (let i = 0; i < attachmentPart.body.length; i++) {
            bytes[i] = attachmentPart.body.charCodeAt(i) & 0xff;
          }
          return new File([bytes], attachmentPart.name, {
            type: attachmentPart.headers.contentType.type,
          });
        },
        async openAttachment(messageId, partName, tabId) {
          const msgHdr = messageManager.get(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }

          const msgHdrProcessor = new MsgHdrProcessor(msgHdr);
          let attachmentPart;
          try {
            attachmentPart = await msgHdrProcessor.getAttachmentPart(partName);
          } catch (ex) {
            switch (ex.cause) {
              case "MessageDecryptionError":
                throw new ExtensionError(
                  `Error decrypting message ${messageId}`
                );
              default:
                console.error(ex);
                throw new ExtensionError(`Error reading message ${messageId}`);
            }
          }
          if (!attachmentPart) {
            throw new ExtensionError(
              `Part ${partName} not found in message ${messageId}.`
            );
          }

          const isExternalAttachment = attachmentPart.headers.has(
            "x-mozilla-external-attachment-url"
          );
          const data = {
            contentType: attachmentPart.headers.contentType.type,
            url: getMsgPartUrl(msgHdr, partName),
            name: attachmentPart.name,
            uri: msgHdr.folder
              ? msgHdr.folder.getUriForMsg(msgHdr)
              : msgHdr.getStringProperty("dummyMsgUrl"),
            isExternalAttachment,
            message: msgHdr,
          };
          const attachmentInfo = new AttachmentInfo(data);
          const tab = tabManager.get(tabId);
          try {
            // Content tabs or content windows use browser, while mail and message
            // tabs use chromeBrowser.
            const browser =
              tab.nativeTab.chromeBrowser || tab.nativeTab.browser;
            await attachmentInfo.open(browser.browsingContext);
          } catch (ex) {
            throw new ExtensionError(
              `Part ${partName} could not be opened: ${ex}.`
            );
          }
        },
        async deleteAttachments(messageId, partNames) {
          const msgHdr = messageManager.get(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }

          if (!msgHdr.folder) {
            throw new ExtensionError(
              `Operation not permitted for external messages`
            );
          }

          const msgHdrProcessor = new MsgHdrProcessor(msgHdr);
          const attachmentInfos = [];
          for (const partName of partNames) {
            let attachmentPart;
            try {
              attachmentPart =
                await msgHdrProcessor.getAttachmentPart(partName);
            } catch (ex) {
              switch (ex.cause) {
                case "MessageDecryptionError":
                  throw new ExtensionError(
                    `Error decrypting message ${messageId}`
                  );
                default:
                  console.error(ex);
                  throw new ExtensionError(
                    `Error reading message ${messageId}`
                  );
              }
            }
            if (!attachmentPart) {
              throw new ExtensionError(
                `Part ${partName} not found in message ${messageId}.`
              );
            }

            const isExternalAttachment = attachmentPart.headers.has(
              "x-mozilla-external-attachment-url"
            );
            if (isExternalAttachment) {
              throw new ExtensionError(
                `Operation not permitted for external attachment ${partName} in message ${messageId}.`
              );
            }
            const attachmentInfo = new AttachmentInfo({
              contentType: attachmentPart.headers.contentType.type,
              url: getMsgPartUrl(msgHdr, partName),
              name: attachmentPart.name,
              uri: msgHdr.folder.getUriForMsg(msgHdr),
              isExternalAttachment,
              message: msgHdr,
            });

            const deleted = !attachmentInfo.hasFile;
            if (deleted) {
              throw new ExtensionError(
                `Operation not permitted for deleted attachment ${partName} in message ${messageId}.`
              );
            }

            attachmentInfos.push(attachmentInfo);
          }

          await new Promise(resolve => {
            const listener = {
              OnStartRunningUrl() {},
              OnStopRunningUrl() {
                resolve();
              },
            };
            const messenger = Cc["@mozilla.org/messenger;1"].createInstance(
              Ci.nsIMessenger
            );
            messenger.detachAllAttachments(
              attachmentInfos.map(attachmentInfo => attachmentInfo.contentType),
              attachmentInfos.map(attachmentInfo => attachmentInfo.url),
              attachmentInfos.map(attachmentInfo => attachmentInfo.name),
              attachmentInfos.map(attachmentInfo => attachmentInfo.uri),
              false, // aSaveFirst
              true, // withoutWarning
              listener
            );
          });
        },
        async query(queryInfo) {
          const messageQuery = new MessageQuery(
            queryInfo,
            messageListTracker,
            context.extension
          );
          return messageQuery.startSearch();
        },
        async update(messageId, newProperties) {
          try {
            const msgHdr = messageManager.get(messageId);
            if (!msgHdr) {
              throw new ExtensionError(`Message not found: ${messageId}.`);
            }
            if (!msgHdr.folder) {
              throw new ExtensionError(
                `Operation not permitted for external messages`
              );
            }

            const msgs = [msgHdr];
            if (newProperties.read !== null) {
              msgHdr.folder.markMessagesRead(msgs, newProperties.read);
            }
            if (newProperties.flagged !== null) {
              msgHdr.folder.markMessagesFlagged(msgs, newProperties.flagged);
            }
            if (newProperties.junk !== null) {
              const newJunkScore = newProperties.junk
                ? Ci.nsIJunkMailPlugin.IS_SPAM_SCORE
                : Ci.nsIJunkMailPlugin.IS_HAM_SCORE;
              // FIXME: This sets the junkorigin to "filter", even though we should
              // set it to "user". Note: The IMAP implementation also sets the keyword
              // Junk/NoJunk.
              msgHdr.folder.setJunkScoreForMessages(msgs, newJunkScore);
            }
            if (Array.isArray(newProperties.tags)) {
              const currentTags = msgHdr
                .getStringProperty("keywords")
                .split(" ");

              for (const { key: tagKey } of MailServices.tags.getAllTags()) {
                if (newProperties.tags.includes(tagKey)) {
                  if (!currentTags.includes(tagKey)) {
                    msgHdr.folder.addKeywordsToMessages(msgs, tagKey);
                  }
                } else if (currentTags.includes(tagKey)) {
                  msgHdr.folder.removeKeywordsFromMessages(msgs, tagKey);
                }
              }
            }
          } catch (ex) {
            console.error(ex);
            throw new ExtensionError(`Error updating message: ${ex.message}`);
          }
        },
        async move(messageIds, destination, options) {
          const isUserAction = options?.isUserAction ?? false;
          return moveOrCopyMessages(
            messageIds,
            destination,
            isUserAction,
            true
          );
        },
        async copy(messageIds, destination, options) {
          const isUserAction = options?.isUserAction ?? false;
          return moveOrCopyMessages(
            messageIds,
            destination,
            isUserAction,
            false
          );
        },
        async delete(messageIds, deletePermanentlyOrOptions) {
          const options =
            typeof deletePermanentlyOrOptions == "boolean"
              ? { deletePermanently: deletePermanentlyOrOptions }
              : deletePermanentlyOrOptions;
          const deletePermanently = options?.deletePermanently ?? false;
          const isUserAction = options?.isUserAction ?? false;

          try {
            const promises = [];
            const folderMap = collectMessagesInFolders(messageIds);
            for (const [sourceFolder, msgHeaderSet] of folderMap.entries()) {
              if (!sourceFolder) {
                throw new ExtensionError(
                  `Operation not permitted for external messages`
                );
              }
              if (!sourceFolder.canDeleteMessages) {
                throw new ExtensionError(
                  `Messages in "${sourceFolder.prettyName}" cannot be deleted`
                );
              }
              promises.push(
                new Promise((resolve, reject) => {
                  sourceFolder.deleteMessages(
                    [...msgHeaderSet],
                    (isUserAction &&
                      windowTracker.topNormalWindow?.msgWindow) ||
                      null,
                    deletePermanently, // deleteStorage
                    false, // isMove
                    /** @implements {nsIMsgCopyServiceListener} */
                    {
                      onStartCopy() {},
                      onProgress() {},
                      setMessageKey() {},
                      getMessageId() {
                        return null;
                      },
                      onStopCopy(status) {
                        if (status == Cr.NS_OK) {
                          resolve();
                        } else {
                          reject(new Error(`Aborted with status: ${status}`));
                        }
                      },
                    },
                    isUserAction // allowUndo
                  );
                })
              );
            }
            await Promise.all(promises);
          } catch (ex) {
            console.error(ex);
            throw new ExtensionError(`Error deleting message: ${ex.message}`);
          }
        },
        async import(file, destination, properties) {
          if (
            !context.extension.hasPermission("accountsRead") ||
            !context.extension.hasPermission("messagesImport")
          ) {
            throw new ExtensionError(
              `Using messages.import() requires the "accountsRead" and the "messagesImport" permission`
            );
          }
          const { folder: destinationFolder } = getFolder(destination);
          if (destinationFolder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
            throw new ExtensionError(
              `The destination used in messages.import() cannot be a search folder`
            );
          }

          const serverType = destinationFolder.server.type;
          if (!["none", "pop3", "imap"].includes(serverType)) {
            throw new ExtensionError(
              `messages.import() is not supported for ${serverType} accounts`
            );
          }

          let tempFile, messageId;
          try {
            tempFile = await getRealFileForFile(file);
            const headers = MimeParser.extractHeaders(await file.text());
            messageId = headers.has("Message-ID")
              ? headers.get("Message-ID").replace(/^<|>$/g, "")
              : "";
          } catch (ex) {
            throw new ExtensionError(
              `Error importing message: Could not read file.`
            );
          }

          if (
            MailUtils.findMsgIdInFolder(messageId, destinationFolder, false)
          ) {
            throw new ExtensionError(
              `Error importing message: Destination folder already contains a message with id <${messageId}>`
            );
          }

          let newKey = null;

          let tags = "";
          if (properties?.tags) {
            const knownTags = MailServices.tags
              .getAllTags()
              .map(tag => tag.key);
            tags = properties.tags
              .filter(tag => knownTags.includes(tag))
              .join(" ");
          }

          const wantNew = properties?.new ?? false;
          const wantRead = properties?.read ?? false;
          const wantFlagged = properties?.flagged ?? false;
          let flags = 0;
          flags |= wantNew ? Ci.nsMsgMessageFlags.New : 0;
          flags |= wantRead ? Ci.nsMsgMessageFlags.Read : 0;
          flags |= wantFlagged ? Ci.nsMsgMessageFlags.Marked : 0;

          const copyFileMessageOperation = Promise.withResolvers();
          const importOperation = Promise.withResolvers();

          const handleAddedMessage = msgHdr => {
            if (
              msgHdr.folder.URI != destinationFolder.URI ||
              (newKey && msgHdr.messageKey != newKey) ||
              (!newKey && msgHdr.messageId != messageId)
            ) {
              return;
            }

            // FIXME: Update msgHdr, if it does not match the requested
            //        flags and tags. The protocol implementation of
            //        copyFileMessage() should handle this correctly.
            if (!!(msgHdr.flags & Ci.nsMsgMessageFlags.New) != wantNew) {
              if (wantNew) {
                // FIXME: Missing new state is unfixable here.
                console.error("Failed to set new flag for imported message");
              } else {
                // Wrongly set new state can be fixed by toggling the read flag.
                msgHdr.markRead(true);
              }
            }
            if (msgHdr.isRead != wantRead) {
              msgHdr.markRead(wantRead);
            }
            if (msgHdr.isFlagged != wantFlagged) {
              msgHdr.markFlagged(wantFlagged);
            }

            const currentTags = msgHdr.getStringProperty("keywords").split(" ");
            const missingTags = tags
              .split(" ")
              .filter(tag => !currentTags.includes(tag));
            if (missingTags.length) {
              msgHdr.folder.addKeywordsToMessages(
                [msgHdr],
                missingTags.join(" ")
              );
            }
            importOperation.resolve(
              new CachedMsgHeader(messageTracker, msgHdr)
            );
          };

          const folderListener = {
            // Implements nsIMsgFolderListener.
            msgAdded(msgHdr) {
              handleAddedMessage(msgHdr);
            },
            // Implements nsIFolderListener.
            onMessageAdded(parentItem, msgHdr) {
              handleAddedMessage(msgHdr);
            },
            onFolderAdded() {},
          };

          const offlineFolderListenerType = Services.io.offline;
          if (offlineFolderListenerType) {
            // IMAP: Fires too early if online, message is added to the database,
            // but not yet to the folder.
            MailServices.mailSession.AddFolderListener(
              folderListener,
              Ci.nsIFolderListener.added
            );
          } else {
            // IMAP: Fires after the message is truely added to the server, but
            // does not fire if offline.
            MailServices.mfn.addListener(
              folderListener,
              MailServices.mfn.msgAdded
            );
          }

          MailServices.copy.copyFileMessage(
            tempFile,
            destinationFolder,
            /* msgToReplace */ null,
            /* isDraftOrTemplate */ false,
            /* aMsgFlags */ flags,
            /* aMsgKeywords */ tags,
            /** @implements {nsIMsgCopyServiceListener} */
            {
              onStartCopy() {},
              onProgress() {},
              setMessageKey(aKey) {
                newKey = aKey;
              },
              getMessageId() {
                return null;
              },
              onStopCopy(status) {
                if (status == Cr.NS_OK) {
                  destinationFolder.updateFolder(null);
                  copyFileMessageOperation.resolve();
                } else {
                  copyFileMessageOperation.reject(
                    new Error(`Aborted with status: ${status}`)
                  );
                }
              },
            },
            /* msgWindow */ null
          );

          let cachedMsgHeader, errorMessage;
          try {
            await copyFileMessageOperation.promise;
            cachedMsgHeader = await importOperation.promise;
          } catch (ex) {
            console.error(ex);
            errorMessage = ex.message;
          }

          if (offlineFolderListenerType) {
            MailServices.mailSession.RemoveFolderListener(folderListener);
          } else {
            MailServices.mfn.removeListener(folderListener);
          }

          // Do not wait till the temp file is removed on app shutdown. However, skip deletion if
          // the provided DOM File was already linked to a real file.
          if (!file.mozFullPath) {
            await IOUtils.remove(tempFile.path);
          }

          if (errorMessage) {
            throw new ExtensionError(
              `Error importing message: ${errorMessage}`
            );
          }
          return context.extension.messageManager.convert(cachedMsgHeader);
        },
        async archive(messageIds) {
          try {
            const messages = [];
            const folderMap = collectMessagesInFolders(messageIds);
            for (const [sourceFolder, msgHeaderSet] of folderMap.entries()) {
              if (!sourceFolder) {
                throw new ExtensionError(
                  `Operation not permitted for external messages`
                );
              }
              messages.push(...msgHeaderSet);
            }
            await new Promise(resolve => {
              const archiver = new MessageArchiver();
              archiver.oncomplete = resolve;
              archiver.archiveMessages(messages);
            });
          } catch (ex) {
            console.error(ex);
            throw new ExtensionError(`Error archiving message: ${ex.message}`);
          }
        },

        // Deprecated and removed in MV3.
        async listTags() {
          return this.tags.list();
        },
        async createTag(key, tag, color) {
          // browser.messages.tags.create() returns the associated key, but the
          // deprecated method browser.messages.createTag() is not updated and
          // should not return anything.
          await this.tags.create(key, tag, color);
        },
        async updateTag(key, updateProperties) {
          return this.tags.update(key, updateProperties);
        },
        async deleteTag(key) {
          return this.tags.delete(key);
        },

        tags: {
          async list() {
            return MailServices.tags
              .getAllTags()
              .map(({ key, tag, color, ordinal }) => ({
                key,
                tag,
                color: color.toUpperCase(),
                ordinal,
              }));
          },
          async create(key, tag, color) {
            const tags = MailServices.tags.getAllTags();
            if (tags.find(t => t.tag == tag)) {
              throw new ExtensionError(`Specified tag already exists: ${tag}`);
            }
            if (key != null) {
              key = key.toLowerCase();
              if (tags.find(t => t.key == key)) {
                throw new ExtensionError(
                  `Specified key already exists: ${key}`
                );
              }
              MailServices.tags.addTagForKey(key, tag, color, "");
            } else {
              // Auto-generate a key.
              MailServices.tags.addTag(tag, color, "");
            }
            return MailServices.tags.getKeyForTag(tag);
          },
          async update(key, updateProperties) {
            const tags = MailServices.tags.getAllTags();
            key = key.toLowerCase();
            const tag = tags.find(t => t.key == key);
            if (!tag) {
              throw new ExtensionError(`Specified key does not exist: ${key}`);
            }
            if (updateProperties.color) {
              const newColor = updateProperties.color.toUpperCase();
              if (newColor != tag.color.toUpperCase()) {
                MailServices.tags.setColorForKey(key, newColor);
              }
            }
            if (updateProperties.ordinal != null) {
              MailServices.tags.setOrdinalForKey(key, updateProperties.ordinal);
            }
            if (updateProperties.tag && tag.tag != updateProperties.tag) {
              // Don't let the user edit a tag to the name of another existing tag.
              if (tags.find(t => t.tag == updateProperties.tag)) {
                throw new ExtensionError(
                  `Specified tag already exists: ${updateProperties.tag}`
                );
              }
              MailServices.tags.setTagForKey(key, updateProperties.tag);
            }
          },
          async delete(key) {
            const tags = MailServices.tags.getAllTags();
            key = key.toLowerCase();
            if (!tags.find(t => t.key == key)) {
              throw new ExtensionError(`Specified key does not exist: ${key}`);
            }
            MailServices.tags.deleteKey(key);
          },

          // The module name is messages as defined in ext-mail.json.
          onCreated: new EventManager({
            context,
            module: "messages",
            event: "onTagCreated",
            extensionApi: this,
          }).api(),
          onUpdated: new EventManager({
            context,
            module: "messages",
            event: "onTagUpdated",
            extensionApi: this,
          }).api(),
          onDeleted: new EventManager({
            context,
            module: "messages",
            event: "onTagDeleted",
            extensionApi: this,
          }).api(),
        },
      },
    };
  }
};
