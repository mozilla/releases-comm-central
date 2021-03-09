/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(
  this,
  "Gloda",
  "resource:///modules/gloda/GlodaPublic.jsm"
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
  "MsgHdrToMimeMessage",
  "resource:///modules/gloda/MimeMessage.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "toXPCOMArray",
  "resource:///modules/iteratorUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "NetUtil",
  "resource://gre/modules/NetUtil.jsm"
);

Cu.importGlobalProperties(["fetch"]);

var { DefaultMap } = ExtensionUtils;

/**
 * Takes a part of a MIME message (as retrieved with MsgHdrToMimeMessage) and filters
 * out the properties we don't want to send to extensions.
 */
function convertMessagePart(part) {
  let partObject = {};
  for (let key of [
    "body",
    "contentType",
    "headers",
    "name",
    "partName",
    "size",
  ]) {
    if (key in part) {
      partObject[key] = part[key];
    }
  }
  if ("parts" in part && Array.isArray(part.parts) && part.parts.length > 0) {
    partObject.parts = part.parts.map(convertMessagePart);
  }
  return partObject;
}

/**
 * Listens to the folder notification service for new messages, which are
 * passed to the onNewMailReceived event.
 *
 * @implements {nsIMsgFolderListener}
 */
let newMailEventTracker = new (class extends EventEmitter {
  constructor() {
    super();
    this.listenerCount = 0;
  }
  on(event, listener) {
    super.on(event, listener);

    if (++this.listenerCount == 1) {
      MailServices.mfn.addListener(this, MailServices.mfn.msgsClassified);
    }
  }
  off(event, listener) {
    super.off(event, listener);

    if (--this.listenerCount == 0) {
      MailServices.mfn.removeListener(this);
    }
  }

  msgsClassified(messages, junkProcessed, traitProcessed) {
    if (messages.length > 0) {
      this.emit("new-mail-received", messages[0].folder, messages);
    }
  }
})();

this.messages = class extends ExtensionAPI {
  getAPI(context) {
    function collectMessagesInFolders(messageIds) {
      let folderMap = new DefaultMap(() => new Set());

      for (let id of messageIds) {
        let msgHdr = messageTracker.getMessage(id);
        if (!msgHdr) {
          continue;
        }

        let sourceSet = folderMap.get(msgHdr.folder);
        sourceSet.add(msgHdr);
      }

      return folderMap;
    }

    async function moveOrCopyMessages(messageIds, { accountId, path }, isMove) {
      let destinationURI = folderPathToURI(accountId, path);
      let destinationFolder = MailServices.folderLookup.getFolderForURL(
        destinationURI
      );
      let folderMap = collectMessagesInFolders(messageIds);
      let promises = [];
      for (let [sourceFolder, sourceSet] of folderMap.entries()) {
        if (sourceFolder == destinationFolder) {
          continue;
        }

        let messages = [...sourceSet];
        promises.push(
          new Promise((resolve, reject) => {
            MailServices.copy.CopyMessages(
              sourceFolder,
              messages,
              destinationFolder,
              isMove,
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
      try {
        await Promise.all(promises);
      } catch (ex) {
        Cu.reportError(ex);
        if (isMove) {
          throw new ExtensionError(`Unexpected error moving messages: ${ex}`);
        }
        throw new ExtensionError(`Unexpected error copying messages: ${ex}`);
      }
    }

    return {
      messages: {
        onNewMailReceived: new EventManager({
          context,
          name: "messageDisplay.onNewMailReceived",
          register: fire => {
            let listener = (event, folder, newMessages) => {
              fire.async(
                convertFolder(folder),
                messageListTracker.startList(newMessages, context.extension)
              );
            };

            newMailEventTracker.on("new-mail-received", listener);
            return () => {
              newMailEventTracker.off("new-mail-received", listener);
            };
          },
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
          return messageListTracker.continueList(
            messageListId,
            context.extension
          );
        },
        async get(messageId) {
          return convertMessage(
            messageTracker.getMessage(messageId),
            context.extension
          );
        },
        async getFull(messageId) {
          let mimeMsg = await new Promise(resolve => {
            let msgHdr = messageTracker.getMessage(messageId);
            MsgHdrToMimeMessage(
              msgHdr,
              null,
              (_msgHdr, mimeMsg) => {
                resolve(mimeMsg);
              },
              null,
              { examineEncryptedParts: true }
            );
          });
          if (!mimeMsg) {
            throw new ExtensionError(`Error reading message ${messageId}`);
          }
          return convertMessagePart(mimeMsg);
        },
        async getRaw(messageId) {
          let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
            Ci.nsIMessenger
          );
          let msgHdr = messageTracker.getMessage(messageId);
          let msgUri = msgHdr.folder.generateMessageURI(msgHdr.messageKey);
          let service = messenger.messageServiceFromURI(msgUri);

          let streamListener = Cc[
            "@mozilla.org/network/sync-stream-listener;1"
          ].createInstance(Ci.nsISyncStreamListener);
          await new Promise((resolve, reject) => {
            service.streamMessage(
              msgUri,
              streamListener,
              null,
              {
                OnStartRunningUrl() {},
                OnStopRunningUrl(url, exitCode) {
                  if (exitCode !== 0) {
                    Cu.reportError(exitCode);
                    reject();
                    return;
                  }
                  resolve();
                },
              },
              false,
              ""
            );
          }).catch(() => {
            throw new ExtensionError(`Error reading message ${messageId}`);
          });
          return NetUtil.readInputStreamToString(
            streamListener.inputStream,
            streamListener.available()
          );
        },
        async query(queryInfo) {
          let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);

          if (queryInfo.subject) {
            query.subjectMatches(queryInfo.subject);
          }
          if (queryInfo.fullText) {
            query.fulltextMatches(queryInfo.fullText);
          }
          if (queryInfo.body) {
            query.bodyMatches(queryInfo.body);
          }
          if (queryInfo.author) {
            query.authorMatches(queryInfo.author);
          }
          if (queryInfo.recipients) {
            query.recipientsMatch(queryInfo.recipients);
          }
          if (queryInfo.fromMe) {
            query.fromMe();
          }
          if (queryInfo.toMe) {
            query.toMe();
          }
          if (queryInfo.flagged !== null) {
            query.starred(queryInfo.flagged);
          }
          if (queryInfo.folder) {
            if (!context.extension.hasPermission("accountsRead")) {
              throw new ExtensionError(
                'Querying by folder requires the "accountsRead" permission'
              );
            }
            let { accountId, path } = queryInfo.folder;
            let uri = folderPathToURI(accountId, path);
            let folder = MailServices.folderLookup.getFolderForURL(uri);
            if (!folder) {
              throw new ExtensionError(`Folder not found: ${path}`);
            }
            query.folder(folder);
          }
          if (queryInfo.fromDate || queryInfo.toDate) {
            query.dateRange([queryInfo.fromDate, queryInfo.toDate]);
          }
          if (queryInfo.headerMessageId) {
            query.headerMessageID(queryInfo.headerMessageId);
          }
          let validTags;
          if (queryInfo.tags) {
            validTags = MailServices.tags
              .getAllTags()
              .filter(
                tag =>
                  tag.key in queryInfo.tags.tags && queryInfo.tags.tags[tag.key]
              );
            if (validTags.length === 0) {
              // No messages will match this. Just return immediately.
              return messageListTracker.startList([], context.extension);
            }
            query.tags(...validTags);
            validTags = validTags.map(tag => tag.key);
          }

          let collectionArray = await new Promise(resolve => {
            query.getCollection({
              onItemsAdded(items, collection) {},
              onItemsModified(items, collection) {},
              onItemsRemoved(items, collection) {},
              onQueryCompleted(collection) {
                resolve(
                  collection.items
                    .map(glodaMsg => glodaMsg.folderMessage)
                    .filter(Boolean)
                );
              },
            });
          });

          if (queryInfo.unread !== null) {
            collectionArray = collectionArray.filter(
              msg => msg.isRead == !queryInfo.unread
            );
          }
          if (validTags && queryInfo.tags.mode == "all") {
            collectionArray = collectionArray.filter(msg => {
              let messageTags = msg.getStringProperty("keywords").split(" ");
              return validTags.every(tag => messageTags.includes(tag));
            });
          }

          return messageListTracker.startList(
            collectionArray,
            context.extension
          );
        },
        async update(messageId, newProperties) {
          let msgHdr = messageTracker.getMessage(messageId);
          if (!msgHdr) {
            return;
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
        },
        async move(messageIds, destination) {
          return moveOrCopyMessages(messageIds, destination, true);
        },
        async copy(messageIds, destination) {
          return moveOrCopyMessages(messageIds, destination, false);
        },
        async delete(messageIds, skipTrash) {
          let folderMap = collectMessagesInFolders(messageIds);
          for (let sourceFolder of folderMap.keys()) {
            if (!sourceFolder.canDeleteMessages) {
              throw new ExtensionError(
                `Unable to delete messages in "${sourceFolder.prettyName}"`
              );
            }
          }
          let promises = [];
          for (let [sourceFolder, sourceSet] of folderMap.entries()) {
            promises.push(
              new Promise((resolve, reject) => {
                sourceFolder.deleteMessages(
                  [...sourceSet],
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
          try {
            await Promise.all(promises);
          } catch (ex) {
            Cu.reportError(ex);
            throw new ExtensionError(
              `Unexpected error deleting messages: ${ex}`
            );
          }
        },
        async archive(messageIds) {
          let messages = [];
          for (let id of messageIds) {
            let msgHdr = messageTracker.getMessage(id);
            if (!msgHdr) {
              continue;
            }
            messages.push(msgHdr);
          }

          return new Promise(resolve => {
            let archiver = new MessageArchiver();
            archiver.oncomplete = resolve;
            archiver.archiveMessages(messages);
          });
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
      },
    };
  }
};
