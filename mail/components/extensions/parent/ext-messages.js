/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineESModuleGetters(this, {
  AttachmentInfo: "resource:///modules/AttachmentInfo.sys.mjs",
});

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
ChromeUtils.defineModuleGetter(
  this,
  "MimeParser",
  "resource:///modules/mimeParser.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "MsgHdrToMimeMessage",
  "resource:///modules/gloda/MimeMessage.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "NetUtil",
  "resource://gre/modules/NetUtil.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "jsmime",
  "resource:///modules/jsmime.jsm"
);

var { MailStringUtils } = ChromeUtils.import(
  "resource:///modules/MailStringUtils.jsm"
);

// eslint-disable-next-line mozilla/reject-importGlobalProperties
Cu.importGlobalProperties(["File", "IOUtils", "PathUtils"]);

var { DefaultMap } = ExtensionUtils;

let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

/**
 * Takes a part of a MIME message (as retrieved with MsgHdrToMimeMessage) and
 * filters out the properties we don't want to send to extensions.
 */
function convertMessagePart(part) {
  let partObject = {};
  for (let key of ["body", "contentType", "name", "partName", "size"]) {
    if (key in part) {
      partObject[key] = part[key];
    }
  }

  // Decode headers. This also takes care of headers, which still include
  // encoded words and need to be RFC 2047 decoded.
  if ("headers" in part) {
    partObject.headers = {};
    for (let header of Object.keys(part.headers)) {
      partObject.headers[header] = part.headers[header].map(h =>
        MailServices.mimeConverter.decodeMimeHeader(
          h,
          null,
          false /* override_charset */,
          true /* eatContinuations */
        )
      );
    }
  }

  if ("parts" in part && Array.isArray(part.parts) && part.parts.length > 0) {
    partObject.parts = part.parts.map(convertMessagePart);
  }
  return partObject;
}

async function convertAttachment(attachment) {
  let rv = {
    contentType: attachment.contentType,
    name: attachment.name,
    size: attachment.size,
    partName: attachment.partName,
  };

  if (attachment.contentType.startsWith("message/")) {
    // The attached message may not have been seen/opened yet, create a dummy
    // msgHdr.
    let attachedMsgHdr = new CachedMsgHeader();
    attachedMsgHdr.setStringProperty("dummyMsgUrl", attachment.url);
    attachedMsgHdr.recipients = attachment.headers.to;
    attachedMsgHdr.ccList = attachment.headers.cc;
    attachedMsgHdr.bccList = attachment.headers.bcc;
    attachedMsgHdr.author = attachment.headers.from?.[0] || "";
    attachedMsgHdr.subject = attachment.headers.subject?.[0] || "";

    let hdrDate = attachment.headers.date?.[0];
    attachedMsgHdr.date = hdrDate ? Date.parse(hdrDate) * 1000 : 0;

    let hdrId = attachment.headers["message-id"]?.[0];
    attachedMsgHdr.messageId = hdrId ? hdrId.replace(/^<|>$/g, "") : "";

    rv.message = convertMessage(attachedMsgHdr);
  }

  return rv;
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
 * Returns attachments found in the message belonging to the given nsIMsgHdr.
 *
 * @param {nsIMsgHdr} msgHdr
 * @param {boolean} includeNestedAttachments - Whether to return all attachments,
 *   including attachments from nested mime parts.
 * @returns {Promise<MimeMessagePart[]>}
 */
async function getAttachments(msgHdr, includeNestedAttachments = false) {
  let mimeMsg = await getMimeMessage(msgHdr);
  if (!mimeMsg) {
    return null;
  }

  // Reduce returned attachments according to includeNestedAttachments.
  let level = mimeMsg.partName ? mimeMsg.partName.split(".").length : 0;
  return mimeMsg.attachments.filter(
    a => includeNestedAttachments || a.partName.split(".").length == level + 2
  );
}

/**
 * Returns the attachment identified by the provided partName.
 *
 * @param {nsIMsgHdr} msgHdr
 * @param {string} partName
 * @param {object} [options={}] - If the includeRaw property is truthy the raw
 *   attachment contents are included.
 * @returns {Promise<MimeMessagePart>}
 */
async function getAttachment(msgHdr, partName, options = {}) {
  // It's not ideal to have to call MsgHdrToMimeMessage here again, but we need
  // the name of the attached file, plus this also gives us the URI without having
  // to jump through a lot of hoops.
  let attachment = await getMimeMessage(msgHdr, partName);
  if (!attachment) {
    return null;
  }

  if (options.includeRaw) {
    let channel = Services.io.newChannelFromURI(
      Services.io.newURI(attachment.url),
      null,
      Services.scriptSecurityManager.getSystemPrincipal(),
      null,
      Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      Ci.nsIContentPolicy.TYPE_OTHER
    );

    attachment.raw = await new Promise((resolve, reject) => {
      let listener = Cc["@mozilla.org/network/stream-loader;1"].createInstance(
        Ci.nsIStreamLoader
      );
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
 * Returns the <part> parameter of the dummyMsgUrl of the provided nsIMsgHdr.
 *
 * @param {nsIMsgHdr} msgHdr
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
 * Returns the nsIMsgHdr of the outer message, if the provided nsIMsgHdr belongs
 * to a message which is actually an attachment of another message. Returns null
 * otherwise.
 *
 * @param {nsIMsgHdr} msgHdr
 * @returns {nsIMsgHdr}
 */
function getParentMsgHdr(msgHdr) {
  if (msgHdr.folder || !msgHdr.getStringProperty("dummyMsgUrl")) {
    return null;
  }

  let url = new URL(msgHdr.getStringProperty("dummyMsgUrl"));

  if (url.protocol == "news:") {
    let newsUrl = `news-message://${url.hostname}/${url.searchParams.get(
      "group"
    )}#${url.searchParams.get("key")}`;
    return messenger.msgHdrFromURI(newsUrl);
  }

  if (url.protocol == "mailbox:") {
    // This could be a sub-message of a message opened from file.
    let fileUrl = `file://${url.pathname}`;
    let parentMsgHdr = messageTracker._dummyMessageHeaders.get(fileUrl);
    if (parentMsgHdr) {
      return parentMsgHdr;
    }
  }
  // Everything else should be a mailbox:// or an imap:// url.
  let params = Array.from(url.searchParams, p => p[0]).filter(
    p => !["number"].includes(p)
  );
  for (let param of params) {
    url.searchParams.delete(param);
  }
  return Services.io.newURI(url.href).QueryInterface(Ci.nsIMsgMessageUrl)
    .messageHeader;
}

/**
 * Get the raw message for a given nsIMsgHdr.
 *
 * @param aMsgHdr - The message header to retrieve the raw message for.
 * @returns {Promise<string>} - Binary string of the raw message.
 */
async function getRawMessage(msgHdr) {
  // If this message is a sub-message (an attachment of another message), get it
  // as an attachment from the parent message and return its raw content.
  let subMsgPartName = getSubMessagePartName(msgHdr);
  if (subMsgPartName) {
    let parentMsgHdr = getParentMsgHdr(msgHdr);
    let attachment = await getAttachment(parentMsgHdr, subMsgPartName, {
      includeRaw: true,
    });
    return attachment.raw.reduce(
      (prev, curr) => prev + String.fromCharCode(curr),
      ""
    );
  }

  // Messages opened from file do not have a folder property, but
  // have their url stored as a string property.
  let msgUri = msgHdr.folder
    ? msgHdr.folder.generateMessageURI(msgHdr.messageKey)
    : msgHdr.getStringProperty("dummyMsgUrl");

  let service = MailServices.messageServiceFromURI(msgUri);
  return new Promise((resolve, reject) => {
    let streamlistener = {
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
 * Returns MIME parts found in the message identified by the given nsIMsgHdr.
 *
 * @param {nsIMsgHdr} msgHdr
 * @param {string} partName - Return only a specific mime part.
 * @returns {Promise<MimeMessagePart>}
 */
async function getMimeMessage(msgHdr, partName = "") {
  // If this message is a sub-message (an attachment of another message), get the
  // mime parts of the parent message and return the part of the sub-message.
  let subMsgPartName = getSubMessagePartName(msgHdr);
  if (subMsgPartName) {
    let parentMsgHdr = getParentMsgHdr(msgHdr);
    if (!parentMsgHdr) {
      return null;
    }

    let mimeMsg = await getMimeMessage(parentMsgHdr, partName);
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
    let findSubPart = (parts, partName) => {
      let match = parts.find(a => partName.startsWith(a.partName));
      if (!match) {
        throw new ExtensionError(
          `Unexpected Error: Part ${partName} not found.`
        );
      }
      return match.partName == partName
        ? match
        : findSubPart(match.parts, partName);
    };
    let subMimeMsg = findSubPart(mimeMsg.parts, subMsgPartName);

    if (mimeMsg.attachments) {
      subMimeMsg.attachments = mimeMsg.attachments.filter(
        a =>
          a.partName != subMsgPartName && a.partName.startsWith(subMsgPartName)
      );
    }
    return subMimeMsg;
  }

  try {
    let mimeMsg = await new Promise((resolve, reject) => {
      MsgHdrToMimeMessage(
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

this.messages = class extends ExtensionAPIPersistent {
  PERSISTENT_EVENTS = {
    // For primed persistent events (deactivated background), the context is only
    // available after fire.wakeup() has fulfilled (ensuring the convert() function
    // has been called).

    onNewMailReceived({ context, fire }) {
      let listener = async (event, folder, newMessages) => {
        let { extension } = this;
        // The msgHdr could be gone after the wakeup, convert it early.
        let page = await messageListTracker.startList(newMessages, extension);
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(convertFolder(folder), page);
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
      let listener = async (event, message, properties) => {
        let { extension } = this;
        // The msgHdr could be gone after the wakeup, convert it early.
        let convertedMessage = convertMessage(message, extension);
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
      let listener = async (event, srcMessages, dstMessages) => {
        let { extension } = this;
        // The msgHdr could be gone after the wakeup, convert them early.
        let srcPage = await messageListTracker.startList(
          srcMessages,
          extension
        );
        let dstPage = await messageListTracker.startList(
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
      let listener = async (event, srcMessages, dstMessages) => {
        let { extension } = this;
        // The msgHdr could be gone after the wakeup, convert them early.
        let srcPage = await messageListTracker.startList(
          srcMessages,
          extension
        );
        let dstPage = await messageListTracker.startList(
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
      let listener = async (event, deletedMessages) => {
        let { extension } = this;
        // The msgHdr could be gone after the wakeup, convert them early.
        let deletedPage = await messageListTracker.startList(
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
    const { tabManager } = extension;

    function collectMessagesInFolders(messageIds) {
      let folderMap = new DefaultMap(() => new Set());

      for (let messageId of messageIds) {
        let msgHdr = messageTracker.getMessage(messageId);
        if (!msgHdr) {
          throw new ExtensionError(`Message not found: ${messageId}.`);
        }

        let msgHeaderSet = folderMap.get(msgHdr.folder);
        msgHeaderSet.add(msgHdr);
      }

      return folderMap;
    }

    async function createTempFileMessage(msgHdr) {
      let rawBinaryString = await getRawMessage(msgHdr);
      let pathEmlFile = await IOUtils.createUniqueFile(
        PathUtils.tempDir,
        encodeURIComponent(msgHdr.messageId).replaceAll(/[/:*?\"<>|]/g, "_") +
          ".eml",
        0o600
      );

      let emlFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      emlFile.initWithPath(pathEmlFile);
      let extAppLauncher = Cc[
        "@mozilla.org/uriloader/external-helper-app-service;1"
      ].getService(Ci.nsPIExternalAppLauncher);
      extAppLauncher.deleteTemporaryFileOnExit(emlFile);

      let buffer = MailStringUtils.byteStringToUint8Array(rawBinaryString);
      await IOUtils.write(pathEmlFile, buffer);
      return emlFile;
    }

    async function moveOrCopyMessages(messageIds, { accountId, path }, isMove) {
      if (
        !context.extension.hasPermission("accountsRead") ||
        !context.extension.hasPermission("messagesMove")
      ) {
        throw new ExtensionError(
          `Using messages.${
            isMove ? "move" : "copy"
          }() requires the "accountsRead" and the "messagesMove" permission`
        );
      }
      let destinationURI = folderPathToURI(accountId, path);
      let destinationFolder =
        MailServices.folderLookup.getFolderForURL(destinationURI);
      try {
        let promises = [];
        let folderMap = collectMessagesInFolders(messageIds);
        for (let [sourceFolder, msgHeaderSet] of folderMap.entries()) {
          if (sourceFolder == destinationFolder) {
            continue;
          }
          let msgHeaders = [...msgHeaderSet];

          // Special handling for external messages.
          if (!sourceFolder) {
            if (isMove) {
              throw new ExtensionError(
                `Operation not permitted for external messages`
              );
            }

            for (let msgHdr of msgHeaders) {
              let file;
              let fileUrl = msgHdr.getStringProperty("dummyMsgUrl");
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
        async list({ accountId, path }) {
          let uri = folderPathToURI(accountId, path);
          let folder = MailServices.folderLookup.getFolderForURL(uri);

          if (!folder) {
            throw new ExtensionError(`Folder not found: ${path}`);
          }

          return messageListTracker.startList(
            folder.messages,
            context.extension
          );
        },
        async continueList(messageListId) {
          let messageList = messageListTracker.getList(
            messageListId,
            context.extension
          );
          return messageListTracker.getNextPage(messageList);
        },
        async abortList(messageListId) {
          let messageList = messageListTracker.getList(
            messageListId,
            context.extension
          );
          messageList.done();
        },
        async get(messageId) {
          let msgHdr = messageTracker.getMessage(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }
          let messageHeader = convertMessage(msgHdr, context.extension);
          if (messageHeader.id != messageId) {
            throw new ExtensionError(
              "Unexpected Error: Returned message does not equal requested message."
            );
          }
          return messageHeader;
        },
        async getFull(messageId) {
          let msgHdr = messageTracker.getMessage(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }
          let mimeMsg = await getMimeMessage(msgHdr);
          if (!mimeMsg) {
            throw new ExtensionError(`Error reading message ${messageId}`);
          }
          if (msgHdr.flags & Ci.nsMsgMessageFlags.Partial) {
            // Do not include fake body.
            mimeMsg.parts = [];
          }
          return convertMessagePart(mimeMsg);
        },
        async getRaw(messageId, options) {
          let data_format = options?.data_format;
          if (!["File", "BinaryString"].includes(data_format)) {
            data_format =
              extension.manifestVersion < 3 ? "BinaryString" : "File";
          }

          let msgHdr = messageTracker.getMessage(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }
          try {
            let raw = await getRawMessage(msgHdr);
            if (data_format == "File") {
              // Convert binary string to Uint8Array and return a File.
              let bytes = new Uint8Array(raw.length);
              for (let i = 0; i < raw.length; i++) {
                bytes[i] = raw.charCodeAt(i) & 0xff;
              }
              return new File([bytes], `message-${messageId}.eml`, {
                type: "message/rfc822",
              });
            }
            return raw;
          } catch (ex) {
            console.error(ex);
            throw new ExtensionError(`Error reading message ${messageId}`);
          }
        },
        async listAttachments(messageId) {
          let msgHdr = messageTracker.getMessage(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }
          let attachments = await getAttachments(msgHdr);
          for (let i = 0; i < attachments.length; i++) {
            attachments[i] = await convertAttachment(attachments[i]);
          }
          return attachments;
        },
        async getAttachmentFile(messageId, partName) {
          let msgHdr = messageTracker.getMessage(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }
          let attachment = await getAttachment(msgHdr, partName, {
            includeRaw: true,
          });
          if (!attachment) {
            throw new ExtensionError(
              `Part ${partName} not found in message ${messageId}.`
            );
          }
          return new File([attachment.raw], attachment.name, {
            type: attachment.contentType,
          });
        },
        async openAttachment(messageId, partName, tabId) {
          let msgHdr = messageTracker.getMessage(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }
          let attachment = await getAttachment(msgHdr, partName);
          if (!attachment) {
            throw new ExtensionError(
              `Part ${partName} not found in message ${messageId}.`
            );
          }
          let attachmentInfo = new AttachmentInfo({
            contentType: attachment.contentType,
            url: attachment.url,
            name: attachment.name,
            uri: msgHdr.folder.getUriForMsg(msgHdr),
            isExternalAttachment: attachment.isExternal,
            message: msgHdr,
          });
          let tab = tabManager.get(tabId);
          try {
            // Content tabs or content windows use browser, while mail and message
            // tabs use chromeBrowser.
            let browser = tab.nativeTab.chromeBrowser || tab.nativeTab.browser;
            await attachmentInfo.open(browser.browsingContext);
          } catch (ex) {
            throw new ExtensionError(
              `Part ${partName} could not be opened: ${ex}.`
            );
          }
        },
        async query(queryInfo) {
          let composeFields = Cc[
            "@mozilla.org/messengercompose/composefields;1"
          ].createInstance(Ci.nsIMsgCompFields);

          const includesContent = (folder, parts, searchTerm) => {
            if (!parts || parts.length == 0) {
              return false;
            }
            for (let part of parts) {
              if (
                coerceBodyToPlaintext(folder, part).includes(searchTerm) ||
                includesContent(folder, part.parts, searchTerm)
              ) {
                return true;
              }
            }
            return false;
          };

          const coerceBodyToPlaintext = (folder, part) => {
            if (!part || !part.body) {
              return "";
            }
            if (part.contentType == "text/plain") {
              return part.body;
            }
            // text/enriched gets transformed into HTML by libmime
            if (
              part.contentType == "text/html" ||
              part.contentType == "text/enriched"
            ) {
              return folder.convertMsgSnippetToPlainText(part.body);
            }
            return "";
          };

          /**
           * Prepare name and email properties of the address object returned by
           * MailServices.headerParser.makeFromDisplayAddress() to be lower case.
           * Also fix the name being wrongly returned in the email property, if
           * the address was just a single name.
           */
          const prepareAddress = displayAddr => {
            let email = displayAddr.email?.toLocaleLowerCase();
            let name = displayAddr.name?.toLocaleLowerCase();
            if (email && !name && !email.includes("@")) {
              name = email;
              email = null;
            }
            return { name, email };
          };

          /**
           * Check multiple addresses if they match the provided search address.
           *
           * @returns A boolean indicating if search was successful.
           */
          const searchInMultipleAddresses = (searchAddress, addresses) => {
            // Return on first positive match.
            for (let address of addresses) {
              let nameMatched =
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
          };

          /**
           * Substring match on name and exact match on email. If searchTerm
           * includes multiple addresses, all of them must match.
           *
           * @returns A boolean indicating if search was successful.
           */
          const isAddressMatch = (searchTerm, addressObjects) => {
            let searchAddresses =
              MailServices.headerParser.makeFromDisplayAddress(searchTerm);
            if (!searchAddresses || searchAddresses.length == 0) {
              return false;
            }

            // Prepare addresses.
            let addresses = [];
            for (let addressObject of addressObjects) {
              let decodedAddressString = addressObject.doRfc2047
                ? jsmime.headerparser.decodeRFC2047Words(addressObject.addr)
                : addressObject.addr;
              for (let address of MailServices.headerParser.makeFromDisplayAddress(
                decodedAddressString
              )) {
                addresses.push(prepareAddress(address));
              }
            }
            if (addresses.length == 0) {
              return false;
            }

            let success = false;
            for (let searchAddress of searchAddresses) {
              // Exit early if this search was not successfully, but all search
              // addresses have to be matched.
              if (
                !searchInMultipleAddresses(
                  prepareAddress(searchAddress),
                  addresses
                )
              ) {
                return false;
              }
              success = true;
            }

            return success;
          };

          const checkSearchCriteria = async (folder, msg) => {
            // Check date ranges.
            if (
              queryInfo.fromDate !== null &&
              msg.dateInSeconds * 1000 < queryInfo.fromDate.getTime()
            ) {
              return false;
            }
            if (
              queryInfo.toDate !== null &&
              msg.dateInSeconds * 1000 > queryInfo.toDate.getTime()
            ) {
              return false;
            }

            // Check headerMessageId.
            if (
              queryInfo.headerMessageId &&
              msg.messageId != queryInfo.headerMessageId
            ) {
              return false;
            }

            // Check unread.
            if (queryInfo.unread !== null && msg.isRead != !queryInfo.unread) {
              return false;
            }

            // Check flagged.
            if (
              queryInfo.flagged !== null &&
              msg.isFlagged != queryInfo.flagged
            ) {
              return false;
            }

            // Check subject (substring match).
            if (
              queryInfo.subject &&
              !msg.mime2DecodedSubject.includes(queryInfo.subject)
            ) {
              return false;
            }

            // Check tags.
            if (requiredTags || forbiddenTags) {
              let messageTags = msg.getStringProperty("keywords").split(" ");
              if (requiredTags.length > 0) {
                if (
                  queryInfo.tags.mode == "all" &&
                  !requiredTags.every(tag => messageTags.includes(tag))
                ) {
                  return false;
                }
                if (
                  queryInfo.tags.mode == "any" &&
                  !requiredTags.some(tag => messageTags.includes(tag))
                ) {
                  return false;
                }
              }
              if (forbiddenTags.length > 0) {
                if (
                  queryInfo.tags.mode == "all" &&
                  forbiddenTags.every(tag => messageTags.includes(tag))
                ) {
                  return false;
                }
                if (
                  queryInfo.tags.mode == "any" &&
                  forbiddenTags.some(tag => messageTags.includes(tag))
                ) {
                  return false;
                }
              }
            }

            // Check toMe (case insensitive email address match).
            if (queryInfo.toMe !== null) {
              let recipients = [].concat(
                composeFields.splitRecipients(msg.recipients, true),
                composeFields.splitRecipients(msg.ccList, true),
                composeFields.splitRecipients(msg.bccList, true)
              );

              if (
                queryInfo.toMe !=
                recipients.some(email =>
                  identities.includes(email.toLocaleLowerCase())
                )
              ) {
                return false;
              }
            }

            // Check fromMe (case insensitive email address match).
            if (queryInfo.fromMe !== null) {
              let authors = composeFields.splitRecipients(
                msg.mime2DecodedAuthor,
                true
              );
              if (
                queryInfo.fromMe !=
                authors.some(email =>
                  identities.includes(email.toLocaleLowerCase())
                )
              ) {
                return false;
              }
            }

            // Check author.
            if (
              queryInfo.author &&
              !isAddressMatch(queryInfo.author, [
                { addr: msg.mime2DecodedAuthor, doRfc2047: false },
              ])
            ) {
              return false;
            }

            // Check recipients.
            if (
              queryInfo.recipients &&
              !isAddressMatch(queryInfo.recipients, [
                { addr: msg.mime2DecodedRecipients, doRfc2047: false },
                { addr: msg.ccList, doRfc2047: true },
                { addr: msg.bccList, doRfc2047: true },
              ])
            ) {
              return false;
            }

            // Check if fullText is already partially fulfilled.
            let fullTextBodySearchNeeded = false;
            if (queryInfo.fullText) {
              let subjectMatches = msg.mime2DecodedSubject.includes(
                queryInfo.fullText
              );
              let authorMatches = msg.mime2DecodedAuthor.includes(
                queryInfo.fullText
              );
              fullTextBodySearchNeeded = !(subjectMatches || authorMatches);
            }

            // Check body.
            if (queryInfo.body || fullTextBodySearchNeeded) {
              let mimeMsg = await getMimeMessage(msg);
              if (
                queryInfo.body &&
                !includesContent(folder, [mimeMsg], queryInfo.body)
              ) {
                return false;
              }
              if (
                fullTextBodySearchNeeded &&
                !includesContent(folder, [mimeMsg], queryInfo.fullText)
              ) {
                return false;
              }
            }

            // Check attachments.
            if (queryInfo.attachment != null) {
              let attachments = await getAttachments(
                msg,
                /* includeNestedAttachments */ true
              );
              return !!attachments.length == queryInfo.attachment;
            }

            return true;
          };

          const searchMessages = async (
            folder,
            messageList,
            includeSubFolders = false
          ) => {
            let messages = null;
            try {
              messages = folder.messages;
            } catch (e) {
              /* Some folders fail on message query, instead of returning empty */
            }

            if (messages) {
              for (let msg of [...messages]) {
                if (messageList.isDone) {
                  return;
                }
                if (await checkSearchCriteria(folder, msg)) {
                  messageList.addMessage(msg);
                }
              }
            }

            if (includeSubFolders) {
              for (let subFolder of folder.subFolders) {
                if (messageList.isDone) {
                  return;
                }
                await searchMessages(subFolder, messageList, true);
              }
            }
          };

          const searchFolders = async (
            folders,
            messageList,
            includeSubFolders = false
          ) => {
            for (let folder of folders) {
              if (messageList.isDone) {
                return;
              }
              await searchMessages(folder, messageList, includeSubFolders);
            }
            messageList.done();
          };

          // Prepare case insensitive me filtering.
          let identities;
          if (queryInfo.toMe !== null || queryInfo.fromMe !== null) {
            identities = MailServices.accounts.allIdentities.map(i =>
              i.email.toLocaleLowerCase()
            );
          }

          // Prepare tag filtering.
          let requiredTags;
          let forbiddenTags;
          if (queryInfo.tags) {
            let availableTags = MailServices.tags.getAllTags();
            requiredTags = availableTags.filter(
              tag =>
                tag.key in queryInfo.tags.tags && queryInfo.tags.tags[tag.key]
            );
            forbiddenTags = availableTags.filter(
              tag =>
                tag.key in queryInfo.tags.tags && !queryInfo.tags.tags[tag.key]
            );
            // If non-existing tags have been required, return immediately with
            // an empty message list.
            if (
              requiredTags.length === 0 &&
              Object.values(queryInfo.tags.tags).filter(v => v).length > 0
            ) {
              return messageListTracker.startList([], context.extension);
            }
            requiredTags = requiredTags.map(tag => tag.key);
            forbiddenTags = forbiddenTags.map(tag => tag.key);
          }

          // Limit search to a given folder, or search all folders.
          let folders = [];
          let includeSubFolders = false;
          if (queryInfo.folder) {
            includeSubFolders = !!queryInfo.includeSubFolders;
            if (!context.extension.hasPermission("accountsRead")) {
              throw new ExtensionError(
                'Querying by folder requires the "accountsRead" permission'
              );
            }
            let folder = MailServices.folderLookup.getFolderForURL(
              folderPathToURI(queryInfo.folder.accountId, queryInfo.folder.path)
            );
            if (!folder) {
              throw new ExtensionError(
                `Folder not found: ${queryInfo.folder.path}`
              );
            }
            folders.push(folder);
          } else {
            includeSubFolders = true;
            for (let account of MailServices.accounts.accounts) {
              folders.push(account.incomingServer.rootFolder);
            }
          }

          // The searchFolders() function searches the provided folders for
          // messages matching the query and adds results to the messageList. It
          // is an asynchronous function, but it is not awaited here. Instead,
          // messageListTracker.getNextPage() returns a Promise, which will
          // fulfill after enough messages for a full page have been added.
          let messageList = messageListTracker.createList(context.extension);
          searchFolders(folders, messageList, includeSubFolders);
          return messageListTracker.getNextPage(messageList);
        },
        async update(messageId, newProperties) {
          try {
            let msgHdr = messageTracker.getMessage(messageId);
            if (!msgHdr) {
              throw new ExtensionError(`Message not found: ${messageId}.`);
            }
            if (!msgHdr.folder) {
              throw new ExtensionError(
                `Operation not permitted for external messages`
              );
            }

            let msgs = [msgHdr];
            if (newProperties.read !== null) {
              msgHdr.folder.markMessagesRead(msgs, newProperties.read);
            }
            if (newProperties.flagged !== null) {
              msgHdr.folder.markMessagesFlagged(msgs, newProperties.flagged);
            }
            if (newProperties.junk !== null) {
              let score = newProperties.junk
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
              let currentTags = msgHdr.getStringProperty("keywords").split(" ");

              for (let { key: tagKey } of MailServices.tags.getAllTags()) {
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
            let promises = [];
            let folderMap = collectMessagesInFolders(messageIds);
            for (let [sourceFolder, msgHeaderSet] of folderMap.entries()) {
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
        async import(file, { accountId, path }, properties) {
          if (
            !context.extension.hasPermission("accountsRead") ||
            !context.extension.hasPermission("messagesImport")
          ) {
            throw new ExtensionError(
              `Using messages.import() requires the "accountsRead" and the "messagesImport" permission`
            );
          }
          let destinationURI = folderPathToURI(accountId, path);
          let destinationFolder =
            MailServices.folderLookup.getFolderForURL(destinationURI);
          if (!destinationFolder) {
            throw new ExtensionError(`Folder not found: ${path}`);
          }
          if (!["none", "pop3"].includes(destinationFolder.server.type)) {
            throw new ExtensionError(
              `browser.messenger.import() is not supported for ${destinationFolder.server.type} accounts`
            );
          }
          try {
            let tempFile = await getRealFileForFile(file);
            let msgHeader = await new Promise((resolve, reject) => {
              let newKey = null;
              let msgHdrs = new Map();

              let folderListener = {
                onMessageAdded(parentItem, msgHdr) {
                  if (destinationFolder.URI != msgHdr.folder.URI) {
                    return;
                  }
                  let key = msgHdr.messageKey;
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

              let finish = msgHdr => {
                MailServices.mailSession.RemoveFolderListener(folderListener);
                resolve(msgHdr);
              };

              let tags = "";
              let flags = 0;
              if (properties) {
                if (properties.tags) {
                  let knownTags = MailServices.tags
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
            return convertMessage(msgHeader, context.extension);
          } catch (ex) {
            console.error(ex);
            throw new ExtensionError(`Error importing message: ${ex.message}`);
          }
        },
        async archive(messageIds) {
          try {
            let messages = [];
            let folderMap = collectMessagesInFolders(messageIds);
            for (let [sourceFolder, msgHeaderSet] of folderMap.entries()) {
              if (!sourceFolder) {
                throw new ExtensionError(
                  `Operation not permitted for external messages`
                );
              }
              messages.push(...msgHeaderSet);
            }
            await new Promise(resolve => {
              let archiver = new MessageArchiver();
              archiver.oncomplete = resolve;
              archiver.archiveMessages(messages);
            });
          } catch (ex) {
            console.error(ex);
            throw new ExtensionError(`Error archiving message: ${ex.message}`);
          }
        },
        async listTags() {
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
        async createTag(key, tag, color) {
          let tags = MailServices.tags.getAllTags();
          key = key.toLowerCase();
          if (tags.find(t => t.key == key)) {
            throw new ExtensionError(`Specified key already exists: ${key}`);
          }
          if (tags.find(t => t.tag == tag)) {
            throw new ExtensionError(`Specified tag already exists: ${tag}`);
          }
          MailServices.tags.addTagForKey(key, tag, color, "");
        },
        async updateTag(key, updateProperties) {
          let tags = MailServices.tags.getAllTags();
          key = key.toLowerCase();
          let tag = tags.find(t => t.key == key);
          if (!tag) {
            throw new ExtensionError(`Specified key does not exist: ${key}`);
          }
          if (updateProperties.color && tag.color != updateProperties.color) {
            MailServices.tags.setColorForKey(key, updateProperties.color);
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
        async deleteTag(key) {
          let tags = MailServices.tags.getAllTags();
          key = key.toLowerCase();
          if (!tags.find(t => t.key == key)) {
            throw new ExtensionError(`Specified key does not exist: ${key}`);
          }
          MailServices.tags.deleteKey(key);
        },
      },
    };
  }
};
