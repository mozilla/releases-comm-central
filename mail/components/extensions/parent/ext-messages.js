/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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

// eslint-disable-next-line mozilla/reject-importGlobalProperties
Cu.importGlobalProperties(["fetch", "File"]);

var { DefaultMap } = ExtensionUtils;

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

function convertAttachment(attachment) {
  return {
    contentType: attachment.contentType,
    name: attachment.name,
    size: attachment.size,
    partName: attachment.partName,
  };
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
            MailServices.copy.copyMessages(
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

    async function getMimeMessage(msgHdr) {
      // Use jsmime based MimeParser to read NNTP messages, which are not
      // supported by MsgHdrToMimeMessage. No encryption support!
      if (msgHdr.folder.server.type == "nntp") {
        try {
          let raw = await MsgHdrToRawMessage(msgHdr);
          let mimeMsg = MimeParser.extractMimeMsg(raw, {
            includeAttachments: false,
          });
          return mimeMsg;
        } catch (e) {
          return null;
        }
      }

      return new Promise(resolve => {
        MsgHdrToMimeMessage(
          msgHdr,
          null,
          (_msgHdr, mimeMsg) => {
            resolve(mimeMsg);
          },
          true,
          { examineEncryptedParts: true }
        );
      });
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
          let msgHdr = messageTracker.getMessage(messageId);
          let mimeMsg = await getMimeMessage(msgHdr);
          if (!mimeMsg) {
            throw new ExtensionError(`Error reading message ${messageId}`);
          }
          return convertMessagePart(mimeMsg);
        },
        async getRaw(messageId) {
          let msgHdr = messageTracker.getMessage(messageId);
          return MsgHdrToRawMessage(msgHdr).catch(() => {
            throw new ExtensionError(`Error reading message ${messageId}`);
          });
        },
        async listAttachments(messageId) {
          let msgHdr = messageTracker.getMessage(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }

          // Use jsmime based MimeParser to read NNTP messages, which are not
          // supported by MsgHdrToMimeMessage. No encryption support!
          if (msgHdr.folder.server.type == "nntp") {
            let raw = await MsgHdrToRawMessage(msgHdr);
            let mimeMsg = MimeParser.extractMimeMsg(raw, {
              includeAttachments: true,
            });
            return mimeMsg.allAttachments.map(convertAttachment);
          }

          return new Promise(resolve => {
            MsgHdrToMimeMessage(
              msgHdr,
              null,
              (_msgHdr, mimeMsg) => {
                resolve(mimeMsg.allAttachments.map(convertAttachment));
              },
              true,
              { examineEncryptedParts: true, partsOnDemand: true }
            );
          });
        },
        async getAttachmentFile(messageId, partName) {
          let msgHdr = messageTracker.getMessage(messageId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${messageId}.`);
          }

          // Use jsmime based MimeParser to read NNTP messages, which are not
          // supported by MsgHdrToMimeMessage. No encryption support!
          if (msgHdr.folder.server.type == "nntp") {
            let raw = await MsgHdrToRawMessage(msgHdr);
            let attachment = MimeParser.extractMimeMsg(raw, {
              includeAttachments: true,
              getMimePart: partName,
            });
            if (!attachment) {
              throw new ExtensionError(
                `Part ${partName} not found in message ${messageId}.`
              );
            }
            return new File([attachment.bodyAsTypedArray], attachment.name, {
              type: attachment.contentType,
            });
          }

          // It's not ideal to have to call MsgHdrToMimeMessage here but we
          // need the name of the attached file, plus this also gives us the
          // URI without having to jump through a lot of hoops.
          let attachment = await new Promise(resolve => {
            MsgHdrToMimeMessage(
              msgHdr,
              null,
              (_msgHdr, mimeMsg) => {
                resolve(
                  mimeMsg.allAttachments.find(a => a.partName == partName)
                );
              },
              true,
              { examineEncryptedParts: true, partsOnDemand: true }
            );
          });

          if (!attachment) {
            throw new ExtensionError(
              `Part ${partName} not found in message ${messageId}.`
            );
          }

          let channel = Services.io.newChannelFromURI(
            Services.io.newURI(attachment.url),
            null,
            Services.scriptSecurityManager.getSystemPrincipal(),
            null,
            Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
            Ci.nsIContentPolicy.TYPE_OTHER
          );

          let byteArray = await new Promise(resolve => {
            let listener = Cc[
              "@mozilla.org/network/stream-loader;1"
            ].createInstance(Ci.nsIStreamLoader);
            listener.init({
              onStreamComplete(loader, context, status, resultLength, result) {
                resolve(Uint8Array.from(result));
              },
            });
            channel.asyncOpen(listener, null);
          });

          return new File([byteArray], attachment.name, {
            type: attachment.contentType,
          });
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
            let searchAddresses = MailServices.headerParser.makeFromDisplayAddress(
              searchTerm
            );
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

            return true;
          };

          const searchMessages = async (
            folder,
            foundMessages,
            recursiveSearch = false
          ) => {
            let messages = null;
            try {
              messages = folder.messages;
            } catch (e) {
              /* Some folders fail on message query, instead of returning empty */
            }

            if (messages) {
              while (messages.hasMoreElements()) {
                let msg = messages.getNext();
                if (await checkSearchCriteria(folder, msg)) {
                  foundMessages.push(msg);
                }
              }
            }

            if (recursiveSearch) {
              for (let subFolder of folder.subFolders) {
                await searchMessages(subFolder, foundMessages, true);
              }
            }
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
            // If non-existing tags have been required, return immediately.
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
          let foundMessages = [];
          if (queryInfo.folder) {
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
            await searchMessages(
              folder,
              foundMessages,
              !!queryInfo.includeSubFolders
            );
          } else {
            for (let account of MailServices.accounts.accounts) {
              await searchMessages(
                account.incomingServer.rootFolder,
                foundMessages,
                true
              );
            }
          }

          return messageListTracker.startList(foundMessages, context.extension);
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
