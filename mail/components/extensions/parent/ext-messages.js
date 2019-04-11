/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(this, "MailServices", "resource:///modules/MailServices.jsm");
ChromeUtils.defineModuleGetter(this, "MessageArchiver", "resource:///modules/MessageArchiver.jsm");
ChromeUtils.defineModuleGetter(this, "MsgHdrToMimeMessage", "resource:///modules/gloda/mimemsg.js");
ChromeUtils.defineModuleGetter(this, "toXPCOMArray", "resource:///modules/iteratorUtils.jsm");

var { DefaultMap } = ExtensionUtils;

/**
 * Takes a part of a MIME message (as retrieved with MsgHdrToMimeMessage) and filters
 * out the properties we don't want to send to extensions.
 */
function convertMessagePart(part) {
  let partObject = {};
  for (let key of ["body", "contentType", "headers", "name", "partName", "size"]) {
    if (key in part) {
      partObject[key] = part[key];
    }
  }
  if (Array.isArray(part.parts) && part.parts.length > 0) {
    partObject.parts = part.parts.map(convertMessagePart);
  }
  return partObject;
}

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
      let destinationFolder = MailServices.folderLookup.getFolderForURL(destinationURI);
      let folderMap = collectMessagesInFolders(messageIds);
      let promises = [];
      for (let [sourceFolder, sourceSet] of folderMap.entries()) {
        if (sourceFolder == destinationFolder) {
          continue;
        }

        let messages = toXPCOMArray(sourceSet.values(), Ci.nsIMutableArray);
        promises.push(new Promise((resolve, reject) => {
          MailServices.copy.CopyMessages(
            sourceFolder, messages, destinationFolder, isMove, {
              OnStartCopy() {
              },
              OnProgress(progress, progressMax) {
              },
              SetMessageKey(key) {
              },
              GetMessageId(messageId) {
              },
              OnStopCopy(status) {
                if (status == Cr.NS_OK) {
                  resolve();
                } else {
                  reject(status);
                }
              },
            }, /* msgWindow */ null, /* allowUndo */ true);
        }));
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
        async list({ accountId, path }) {
          let uri = folderPathToURI(accountId, path);
          let folder = MailServices.folderLookup.getFolderForURL(uri);

          return messageListTracker.startList(folder.messages, context.extension);
        },
        async continueList(messageListId) {
          return messageListTracker.continueList(messageListId, context.extension);
        },
        async get(messageId) {
          return convertMessage(messageTracker.getMessage(messageId), context.extension);
        },
        async getFull(messageId) {
          return new Promise(resolve => {
            let msgHdr = messageTracker.getMessage(messageId);
            MsgHdrToMimeMessage(msgHdr, null, (_msgHdr, mimeMsg) => {
              resolve(convertMessagePart(mimeMsg));
            });
          });
        },
        async update(messageId, newProperties) {
          let msgHdr = messageTracker.getMessage(messageId);
          if (!msgHdr) {
            return;
          }
          if (newProperties.read !== null) {
            msgHdr.markRead(newProperties.read);
          }
          if (newProperties.flagged !== null) {
            msgHdr.markFlagged(newProperties.flagged);
          }
          if (Array.isArray(newProperties.tags)) {
            newProperties.tags = newProperties.tags.filter(MailServices.tags.isValidKey);
            msgHdr.setProperty("keywords", newProperties.tags.join(" "));
            for (let window of Services.wm.getEnumerator("mail:3pane")) {
              window.OnTagsChange();
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
              throw new ExtensionError(`Unable to delete messages in "${sourceFolder.prettyName}"`);
            }
          }
          let promises = [];
          for (let [sourceFolder, sourceSet] of folderMap.entries()) {
            promises.push(new Promise((resolve, reject) => {
              let messages = toXPCOMArray(sourceSet.values(), Ci.nsIMutableArray);
              sourceFolder.deleteMessages(
                messages, /* msgWindow */ null, /* deleteStorage */ skipTrash,
                /* isMove */ false, {
                  OnStartCopy() {
                  },
                  OnProgress(progress, progressMax) {
                  },
                  SetMessageKey(key) {
                  },
                  GetMessageId(messageId) {
                  },
                  OnStopCopy(status) {
                    if (status == Cr.NS_OK) {
                      resolve();
                    } else {
                      reject(status);
                    }
                  },
                }, /* allowUndo */ true
              );
            }));
          }
          try {
            await Promise.all(promises);
          } catch (ex) {
            Cu.reportError(ex);
            throw new ExtensionError(`Unexpected error deleting messages: ${ex}`);
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

          return new Promise((resolve) => {
            let archiver = new MessageArchiver();
            archiver.oncomplete = resolve;
            archiver.archiveMessages(messages);
          });
        },
        async listTags() {
          return MailServices.tags.getAllTags({}).map(({ key, tag, color, ordinal }) => {
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
