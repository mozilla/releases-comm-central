/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineESModuleGetters(this, {
  AttachmentInfo: "resource:///modules/AttachmentInfo.sys.mjs",
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

var {
  getMsgPartUrl,
  getMessagesInFolder,
  CachedMsgHeader,
  MessageQuery,
  MsgHdrProcessor,
} = ChromeUtils.importESModule("resource:///modules/ExtensionMessages.sys.mjs");

var { getFolder } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionAccounts.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "MessageArchiver",
  "resource:///modules/MessageArchiver.jsm"
);

var { MailStringUtils } = ChromeUtils.import(
  "resource:///modules/MailStringUtils.jsm"
);
XPCOMUtils.defineLazyGlobalGetters(this, ["File", "IOUtils", "PathUtils"]);

var { DefaultMap } = ExtensionUtils;

/**
 * Takes a MimeTreePart and returns the processed headers, to be used in the
 * WebExtension MessagePart.
 *
 * @param {MimeTreePart} mimeTreePart
 * @returns {Object<string, string[]>} The headers of the part. Each key is the
 *   name of a header and its value is an array of the header values.
 *
 * @see mail/extensions/openpgp/content/modules/MimeTree.sys.mjs
 */
function convertHeaders(mimeTreePart) {
  const partHeaders = [];
  for (const [headerName, headerValue] of mimeTreePart.headers._rawHeaders) {
    // Return an array, even for single values.
    const valueArray = Array.isArray(headerValue) ? headerValue : [headerValue];
    // Return a binary string.
    partHeaders[headerName] = valueArray.map(value => {
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
 * @typedef MessagePart
 *
 * The WebExtension type "MessagePart", as defined in messages.json.
 *
 * @property {string} [body] - The content of the part.
 * @property {string} [contentType] - The contentType of the part.
 * @property {string} [decryptionStatus] - The decryptionStatus of the part, one
 *   of "none", "skipped", "success" or "fail".
 * @property {Object<string, string[]>} [headers] - The headers of the part. Each
 *   key is the name of a header and its value is an array of the header values.
 * @property {string} [name] - Name of the part, if it is an attachment/file.
 * @property {string} [partName] - The identifier of this part in the message
 *   (for example "1.2").
 * @property {MessagePart[]} [parts] - Any sub-parts of this part.
 * @property {integer} [size] - The size of this part. The size of message/* parts
 *   is not the actual message size (on disc), but the total size of its decoded
 *   body parts, excluding headers.
 *
 * @see mail/components/extensions/schemas/messages.json
 */

/**
 * Takes a MimeTreePart, filters out the properties we don't want to send to
 * extensions and converts it to a WebExtension MessagePart.
 *
 * @param {MimeTreePart} mimeTreePart
 * @param {boolean} isRoot - if this is the root part, while working through the
 *   tree recursivly
 * @returns {MessagePart}
 *
 * @see mail/extensions/openpgp/content/modules/MimeTree.sys.mjs
 */
function convertMessagePart(mimeTreePart, isRoot = true) {
  const partObject = {
    contentType: mimeTreePart.headers.contentType.type || "text/plain",
    headers: convertHeaders(mimeTreePart),
    size: mimeTreePart.size,
    partName: mimeTreePart.partNum,
  };
  if (mimeTreePart.body && !mimeTreePart.isAttachment) {
    partObject.body = mimeTreePart.body;
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
      convertMessagePart(part, false)
    );
  }

  // The root mimeTreePart is the first MIME part of the message (for example a
  // multipart/* or a text/plain part). WebExtensions should get an outer
  // message/rfc822 part. Most headers are also moved to the outer message part.
  if (isRoot) {
    const rootHeaders = Object.fromEntries(
      Object.entries(partObject.headers).filter(
        h => !h[0].startsWith("content-")
      )
    );
    rootHeaders["content-type"] = ["message/rfc822"];
    partObject.headers = Object.fromEntries(
      Object.entries(partObject.headers).filter(h =>
        h[0].startsWith("content-")
      )
    );
    return {
      contentType: "message/rfc822",
      partName: "",
      size: mimeTreePart.size,
      decryptionStatus: mimeTreePart.decryptionStatus,
      headers: rootHeaders,
      parts: mimeTreePart.decryptionStatus != "fail" ? [partObject] : [],
    };
  }

  // Remove content-disposition and content-transfer-encoding headers.
  partObject.headers = Object.fromEntries(
    Object.entries(partObject.headers).filter(
      h => !["content-disposition", "content-transfer-encoding"].includes(h[0])
    )
  );
  return partObject;
}

/**
 * Takes a MimeTreePart of an attachment and returns a WebExtension MessageAttachment.
 *
 * @param {nsIMsgDBHdr} msgHdr - the msgHdr of the attachment's message
 * @param {MimeTreePart} mimeTreePart
 *
 * @returns {MessageAttachment}
 *
 * @see mail/extensions/openpgp/content/modules/MimeTree.sys.mjs
 * @see mail/components/extensions/schemas/messages.json
 */
async function convertAttachment(msgHdr, mimeTreePart, extension) {
  const rv = {
    contentType: mimeTreePart.headers.contentType.type || "text/plain",
    name: mimeTreePart.name || "",
    size: mimeTreePart.size,
    partName: mimeTreePart.partNum,
  };

  // If it is an attached message, create a dummy msgHdr for it.
  if (rv.contentType.startsWith("message/")) {
    // A message/rfc822 MimeTreePart has its headers in the first child.
    const headers = convertHeaders(mimeTreePart.subParts[0]);

    const attachedMsgHdr = new CachedMsgHeader();
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
  return rv;
}

this.messages = class extends ExtensionAPIPersistent {
  PERSISTENT_EVENTS = {
    // For primed persistent events (deactivated background), the context is only
    // available after fire.wakeup() has fulfilled (ensuring the convert() function
    // has been called).

    onNewMailReceived({ context, fire }, [monitorAllFolders]) {
      const listener = async (event, folder, newMessages) => {
        const { extension } = this;
        // The msgHdr could be gone after the wakeup, convert it early.
        const page = await messageListTracker.startList(newMessages, extension);
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
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onUpdated({ context, fire }) {
      const listener = async (event, message, properties) => {
        const { extension } = this;
        // The msgHdr could be gone after the wakeup, convert it early.
        const convertedMessage = extension.messageManager.convert(message);
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(convertedMessage, properties);
      };
      messageTracker.on("message-updated", listener);
      return {
        unregister: () => {
          messageTracker.off("message-updated", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onMoved({ context, fire }) {
      const listener = async (event, srcMessages, dstMessages) => {
        const { extension } = this;
        // The msgHdr could be gone after the wakeup, convert them early.
        const srcPage = await messageListTracker.startList(
          srcMessages,
          extension
        );
        const dstPage = await messageListTracker.startList(
          dstMessages,
          extension
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
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onCopied({ context, fire }) {
      const listener = async (event, srcMessages, dstMessages) => {
        const { extension } = this;
        // The msgHdr could be gone after the wakeup, convert them early.
        const srcPage = await messageListTracker.startList(
          srcMessages,
          extension
        );
        const dstPage = await messageListTracker.startList(
          dstMessages,
          extension
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
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onDeleted({ context, fire }) {
      const listener = async (event, deletedMessages) => {
        const { extension } = this;
        // The msgHdr could be gone after the wakeup, convert them early.
        const deletedPage = await messageListTracker.startList(
          deletedMessages,
          extension
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
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
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

    async function moveOrCopyMessages(messageIds, destination, isMove) {
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
                    {
                      OnStartCopy() {},
                      OnProgress(progress, progressMax) {},
                      SetMessageKey(key) {},
                      GetMessageId(messageId) {},
                      OnStopCopy(status) {
                        if (status == Cr.NS_OK) {
                          resolve();
                        } else {
                          reject(status);
                        }
                      },
                    },
                    /* msgWindow */ null
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
                {
                  OnStartCopy() {},
                  OnProgress(progress, progressMax) {},
                  SetMessageKey(key) {},
                  GetMessageId(messageId) {},
                  OnStopCopy(status) {
                    if (status == Cr.NS_OK) {
                      resolve();
                    } else {
                      reject(status);
                    }
                  },
                },
                /* msgWindow */ null,
                /* allowUndo */ true
              );
            })
          );
        }
        await Promise.all(promises);
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
          if (messageHeader.id != messageId) {
            throw new ExtensionError(
              "Unexpected Error: Returned message does not equal requested message."
            );
          }
          return messageHeader;
        },
        async getFull(messageId, options) {
          // Default for decrypt is true (backward compatibility).
          const decrypt = options?.decrypt ?? true;

          const msgHdr = messageManager.get(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }

          const msgHdrProcessor = new MsgHdrProcessor(msgHdr);
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
          return convertMessagePart(mimeTree);
        },
        async getRaw(messageId, options) {
          // Default for decrypt is false (backward compatibility).
          const decrypt = options?.decrypt ?? false;

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

          let data_format = options?.data_format;
          if (!["File", "BinaryString"].includes(data_format)) {
            data_format =
              extension.manifestVersion < 3 ? "BinaryString" : "File";
          }
          if (data_format == "BinaryString") {
            return raw;
          }
          // Convert binary string to Uint8Array and return a File.
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) {
            bytes[i] = raw.charCodeAt(i) & 0xff;
          }
          return new File([bytes], `message-${messageId}.eml`, {
            type: "message/rfc822",
          });
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
              attachmentPart = await msgHdrProcessor.getAttachmentPart(
                partName
              );
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
              OnStartRunningUrl(aUrl) {},
              OnStopRunningUrl(aUrl, aExitCode) {
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
              const score = newProperties.junk
                ? Ci.nsIJunkMailPlugin.IS_SPAM_SCORE
                : Ci.nsIJunkMailPlugin.IS_HAM_SCORE;
              msgHdr.folder.setJunkScoreForMessages(msgs, score);
              // nsIFolderListener::OnFolderEvent is notified about changes through
              // setJunkScoreForMessages(), but does not provide the actual message.
              // nsIMsgFolderListener::msgsJunkStatusChanged is notified only by
              // nsMsgDBView::ApplyCommandToIndices(). Since it only works on
              // selected messages, we cannot use it here.
              // Notify msgsJunkStatusChanged() manually.
              MailServices.mfn.notifyMsgsJunkStatusChanged(msgs);
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
        async move(messageIds, destination) {
          return moveOrCopyMessages(messageIds, destination, true);
        },
        async copy(messageIds, destination) {
          return moveOrCopyMessages(messageIds, destination, false);
        },
        async delete(messageIds, skipTrash) {
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
                    /* msgWindow */ null,
                    /* deleteStorage */ skipTrash,
                    /* isMove */ false,
                    {
                      OnStartCopy() {},
                      OnProgress(progress, progressMax) {},
                      SetMessageKey(key) {},
                      GetMessageId(messageId) {},
                      OnStopCopy(status) {
                        if (status == Cr.NS_OK) {
                          resolve();
                        } else {
                          reject(status);
                        }
                      },
                    },
                    /* allowUndo */ true
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

          if (!["none", "pop3"].includes(destinationFolder.server.type)) {
            throw new ExtensionError(
              `messages.import() is not supported for ${destinationFolder.server.type} accounts`
            );
          }
          try {
            const tempFile = await getRealFileForFile(file);
            const msgHeader = await new Promise((resolve, reject) => {
              let newKey = null;
              const msgHdrs = new Map();

              const folderListener = {
                onMessageAdded(parentItem, msgHdr) {
                  if (destinationFolder.URI != msgHdr.folder.URI) {
                    return;
                  }
                  const key = msgHdr.messageKey;
                  msgHdrs.set(key, msgHdr);
                  if (msgHdrs.has(newKey)) {
                    finish(msgHdrs.get(newKey));
                  }
                },
                onFolderAdded(parent, child) {},
              };

              // Note: Currently this API is not supported for IMAP. Once this gets added (Bug 1787104),
              // please note that the MailServices.mfn.addListener will fire only when the IMAP message
              // is visibly shown in the UI, while MailServices.mailSession.AddFolderListener fires as
              // soon as it has been added to the database .
              MailServices.mailSession.AddFolderListener(
                folderListener,
                Ci.nsIFolderListener.added
              );

              const finish = msgHdr => {
                MailServices.mailSession.RemoveFolderListener(folderListener);
                resolve(msgHdr);
              };

              let tags = "";
              let flags = 0;
              if (properties) {
                if (properties.tags) {
                  const knownTags = MailServices.tags
                    .getAllTags()
                    .map(tag => tag.key);
                  tags = properties.tags
                    .filter(tag => knownTags.includes(tag))
                    .join(" ");
                }
                flags |= properties.new ? Ci.nsMsgMessageFlags.New : 0;
                flags |= properties.read ? Ci.nsMsgMessageFlags.Read : 0;
                flags |= properties.flagged ? Ci.nsMsgMessageFlags.Marked : 0;
              }
              MailServices.copy.copyFileMessage(
                tempFile,
                destinationFolder,
                /* msgToReplace */ null,
                /* isDraftOrTemplate */ false,
                /* aMsgFlags */ flags,
                /* aMsgKeywords */ tags,
                {
                  OnStartCopy() {},
                  OnProgress(progress, progressMax) {},
                  SetMessageKey(aKey) {
                    /* Note: Not fired for offline IMAP. Add missing
                     * if (aCopyState) {
                     *  ((nsImapMailCopyState*)aCopyState)->m_listener->SetMessageKey(fakeKey);
                     * }
                     * before firing the OnStopRunningUrl listener in
                     * nsImapService::OfflineAppendFromFile
                     */
                    newKey = aKey;
                    if (msgHdrs.has(newKey)) {
                      finish(msgHdrs.get(newKey));
                    }
                  },
                  GetMessageId(messageId) {},
                  OnStopCopy(status) {
                    if (status == Cr.NS_OK) {
                      if (newKey && msgHdrs.has(newKey)) {
                        finish(msgHdrs.get(newKey));
                      }
                    } else {
                      reject(status);
                    }
                  },
                },
                /* msgWindow */ null
              );
            });

            // Do not wait till the temp file is removed on app shutdown. However, skip deletion if
            // the provided DOM File was already linked to a real file.
            if (!file.mozFullPath) {
              await IOUtils.remove(tempFile.path);
            }
            return context.extension.messageManager.convert(msgHeader);
          } catch (ex) {
            console.error(ex);
            throw new ExtensionError(`Error importing message: ${ex.message}`);
          }
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
          return this.tags.create(key, tag, color);
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
              .map(({ key, tag, color, ordinal }) => {
                return {
                  key,
                  tag,
                  color,
                  ordinal,
                };
              });
          },
          async create(key, tag, color) {
            const tags = MailServices.tags.getAllTags();
            key = key.toLowerCase();
            if (tags.find(t => t.key == key)) {
              throw new ExtensionError(`Specified key already exists: ${key}`);
            }
            if (tags.find(t => t.tag == tag)) {
              throw new ExtensionError(`Specified tag already exists: ${tag}`);
            }
            MailServices.tags.addTagForKey(key, tag, color.toUpperCase(), "");
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
        },
      },
    };
  }
};
