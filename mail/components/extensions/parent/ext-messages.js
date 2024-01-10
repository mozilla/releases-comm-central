/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineESModuleGetters(this, {
  AttachmentInfo: "resource:///modules/AttachmentInfo.sys.mjs",
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

var {
  CachedMsgHeader,
  MessageQuery,
  getAttachment,
  getAttachments,
  getMimeMessage,
  getMsgStreamUrl,
  getRawMessage,
  getMessagesInFolder,
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
ChromeUtils.defineModuleGetter(
  this,
  "MimeParser",
  "resource:///modules/mimeParser.jsm"
);

var { MailStringUtils } = ChromeUtils.import(
  "resource:///modules/MailStringUtils.jsm"
);
XPCOMUtils.defineLazyGlobalGetters(this, ["File", "IOUtils", "PathUtils"]);

var { DefaultMap } = ExtensionUtils;

/**
 * Takes a part of a MIME message (as retrieved with MsgHdrToMimeMessage) and
 * filters out the properties we don't want to send to extensions.
 */
function convertMessagePart(part) {
  const partObject = {};
  for (const key of ["body", "contentType", "name", "partName", "size"]) {
    if (key in part) {
      partObject[key] = part[key];
    }
  }

  // Decode headers. This also takes care of headers, which still include
  // encoded words and need to be RFC 2047 decoded.
  if ("headers" in part) {
    partObject.headers = {};
    for (const header of Object.keys(part.headers)) {
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

async function convertAttachment(attachment, extension) {
  const rv = {
    contentType: attachment.contentType,
    name: attachment.name,
    size: attachment.size,
    partName: attachment.partName,
  };

  if (attachment.contentType.startsWith("message/")) {
    // The attached message may not have been seen/opened yet, create a dummy
    // msgHdr.
    const attachedMsgHdr = new CachedMsgHeader();
    attachedMsgHdr.setStringProperty("dummyMsgUrl", attachment.url);
    attachedMsgHdr.recipients = attachment.headers.to;
    attachedMsgHdr.ccList = attachment.headers.cc;
    attachedMsgHdr.bccList = attachment.headers.bcc;
    attachedMsgHdr.author = attachment.headers.from?.[0] || "";
    attachedMsgHdr.subject = attachment.headers.subject?.[0] || "";

    const hdrDate = attachment.headers.date?.[0];
    attachedMsgHdr.date = hdrDate ? Date.parse(hdrDate) * 1000 : 0;

    const hdrId = attachment.headers["message-id"]?.[0];
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
      const rawBinaryString = await getRawMessage(msgHdr);
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
        async getFull(messageId) {
          const msgHdr = messageManager.get(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }
          const mimeMsg = await getMimeMessage(msgHdr);
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

          const msgHdr = messageManager.get(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }
          try {
            const raw = await getRawMessage(msgHdr);
            if (data_format == "File") {
              // Convert binary string to Uint8Array and return a File.
              const bytes = new Uint8Array(raw.length);
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
          const msgHdr = messageManager.get(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }
          const attachments = await getAttachments(msgHdr);
          for (let i = 0; i < attachments.length; i++) {
            attachments[i] = await convertAttachment(
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
          const attachment = await getAttachment(msgHdr, partName, {
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
          const msgHdr = messageManager.get(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }
          const attachment = await getAttachment(msgHdr, partName);
          if (!attachment) {
            throw new ExtensionError(
              `Part ${partName} not found in message ${messageId}.`
            );
          }
          const attachmentInfo = new AttachmentInfo({
            contentType: attachment.contentType,
            url: attachment.url,
            name: attachment.name,
            uri: msgHdr.folder
              ? msgHdr.folder.getUriForMsg(msgHdr)
              : msgHdr.getStringProperty("dummyMsgUrl"),
            isExternalAttachment: attachment.isExternal,
            message: msgHdr,
          });
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

          const attachmentInfos = [];
          for (const partName of partNames) {
            const attachment = await getAttachment(msgHdr, partName);
            if (!attachment) {
              throw new ExtensionError(
                `Part ${partName} not found in message ${messageId}.`
              );
            }

            const attachmentInfo = new AttachmentInfo({
              contentType: attachment.contentType,
              url: attachment.url,
              name: attachment.name,
              uri: msgHdr.folder.getUriForMsg(msgHdr),
              isExternalAttachment: attachment.isExternal,
              message: msgHdr,
            });

            const external = attachmentInfo.isExternalAttachment;
            if (external) {
              throw new ExtensionError(
                `Operation not permitted for external attachment ${partName} in message ${messageId}.`
              );
            }

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
            MailServices.tags.addTagForKey(key, tag, color, "");
          },
          async update(key, updateProperties) {
            const tags = MailServices.tags.getAllTags();
            key = key.toLowerCase();
            const tag = tags.find(t => t.key == key);
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
