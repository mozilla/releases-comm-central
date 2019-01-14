/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(this, "MailServices", "resource:///modules/MailServices.jsm");
ChromeUtils.defineModuleGetter(this, "MsgHdrToMimeMessage", "resource:///modules/gloda/mimemsg.js");

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
    return {
      messages: {
        async list({ accountId, path }) {
          let uri = folderPathToURI(accountId, path);
          let folder = MailServices.folderLookup.getFolderForURL(uri);

          return messageListTracker.startList(folder.messages, context);
        },
        async continueList(messageListId) {
          return messageListTracker.continueList(messageListId, context);
        },
        async get(messageId) {
          return convertMessage(messageTracker.getMessage(messageId), context);
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
