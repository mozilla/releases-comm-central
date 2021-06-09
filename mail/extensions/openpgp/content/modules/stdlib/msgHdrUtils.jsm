/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @fileoverview A whole bunch of utility functions that will abstract away
 *  various low-level nsIMsgDbHdr operations. The idea is to save time by not
 *  having to lookup how to do simple actions.
 * @author Jonathan Protzenko
 */

var EXPORTED_SYMBOLS = [
  // Low-level XPCOM boring stuff
  "msgHdrToMessageBody",
  "msgHdrToNeckoURL",
  "msgHdrGetTags",
  "msgUriToMsgHdr",
  "msgHdrGetUri",
  "msgHdrFromNeckoUrl",
  "msgHdrSetTags",
  // Quickly identify a message
  "msgHdrIsDraft",
  "msgHdrIsSent",
  "msgHdrIsArchive",
  "msgHdrIsInbox",
  "msgHdrIsRss",
  "msgHdrIsNntp",
  "msgHdrIsJunk",
  // Actions on a set of message headers
  "msgHdrsMarkAsRead",
  "msgHdrsArchive",
  "msgHdrsDelete",
  // Doesn't really belong here
  "getMail3Pane",
  // Higher-level functions
  "msgHdrGetHeaders",
  // Modify messages, raw.
  "msgHdrsModifyRaw",
];

// from mailnews/base/public/nsMsgFolderFlags.idl
const nsMsgFolderFlags_SentMail = 0x00000200;
const nsMsgFolderFlags_Drafts = 0x00000400;
const nsMsgFolderFlags_Archive = 0x00004000;
const nsMsgFolderFlags_Inbox = 0x00001000;

const PR_WRONLY = 0x02;

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
const { MsgHdrToMimeMessage, MimeMessage } = ChromeUtils.import(
  "resource:///modules/gloda/MimeMessage.jsm"
);
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const { entries, NS_SUCCEEDED } = ChromeUtils.import(
  "chrome://openpgp/content/modules/stdlib/misc.jsm"
);

// Adding a messenger lazy getter to the MailServices even though it's not a service
XPCOMUtils.defineLazyGetter(MailServices, "messenger", function() {
  return Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
});

/**
 * Get a given message header's uri.
 * @param {nsIMsgDbHdr} aMsg The message
 * @return {String}
 */
function msgHdrGetUri(aMsg) {
  return aMsg.folder.getUriForMsg(aMsg);
}

/**
 * Get a msgHdr from a message URI (msgHdr.URI).
 * @param {String} aUri The URI of the message
 * @return {nsIMsgDbHdr}
 */
function msgUriToMsgHdr(aUri) {
  try {
    let messageService = MailServices.messenger.messageServiceFromURI(aUri);
    return messageService.messageURIToMsgHdr(aUri);
  } catch (e) {
    dump("Unable to get " + aUri + " — returning null instead");
    return null;
  }
}

/**
 * Tells if the message is in the account's inbox
 * @param {nsIMsgDbHdr} msgHdr The message header to examine
 * @return {bool}
 */
function msgHdrIsInbox(msgHdr) {
  return msgHdr.folder.getFlag(nsMsgFolderFlags_Inbox);
}

/**
 * Tells if the message is a draft message
 * @param {nsIMsgDbHdr} msgHdr The message header to examine
 * @return {bool}
 */
function msgHdrIsDraft(msgHdr) {
  return msgHdr.folder.getFlag(nsMsgFolderFlags_Drafts);
}

/**
 * Tells if the message is a sent message
 * @param {nsIMsgDbHdr} msgHdr The message header to examine
 * @return {bool}
 */
function msgHdrIsSent(msgHdr) {
  return msgHdr.folder.getFlag(nsMsgFolderFlags_SentMail);
}

/**
 * Tells if the message is an archived message
 * @param {nsIMsgDbHdr} msgHdr The message header to examine
 * @return {bool}
 */
function msgHdrIsArchive(msgHdr) {
  return msgHdr.folder.getFlag(nsMsgFolderFlags_Archive);
}

/**
 * Get a nsIMsgDbHdr from a Necko URL.
 * @param {String} The URL
 * @return {nsIMsgDbHdr} The message header.
 */
function msgHdrFromNeckoUrl(aUrl) {
  return aUrl.QueryInterface(Ci.nsIMsgMessageUrl).messageHeader;
}

/**
 * Get a string containing the body of a messsage.
 * @param {nsIMsgDbHdr} aMessageHeader The message header
 * @param {bool} aStripHtml Keep html?
 * @return {string}
 */
function msgHdrToMessageBody(aMessageHeader, aStripHtml, aLength) {
  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );
  let listener = Cc[
    "@mozilla.org/network/sync-stream-listener;1"
  ].createInstance(Ci.nsISyncStreamListener);
  let uri = aMessageHeader.folder.getUriForMsg(aMessageHeader);
  messenger
    .messageServiceFromURI(uri)
    .streamMessage(uri, listener, null, null, false, "");
  let folder = aMessageHeader.folder;
  /*
   * AUTF8String getMsgTextFromStream(in nsIInputStream aStream, in ACString aCharset,
                                      in unsigned long aBytesToRead, in unsigned long aMaxOutputLen,
                                      in boolean aCompressQuotes, in boolean aStripHTMLTags,
                                      out ACString aContentType);
  */
  return folder.getMsgTextFromStream(
    listener.inputStream,
    aMessageHeader.Charset,
    2 * aLength,
    aLength,
    false,
    aStripHtml,
    {}
  );
}

/**
 * Get a nsIURI from a nsIMsgDBHdr
 * @param {nsIMsgDbHdr} aMsgHdr The message header
 * @return {nsIURI}
 */
function msgHdrToNeckoURL(aMsgHdr) {
  let uri = aMsgHdr.folder.getUriForMsg(aMsgHdr);
  let msgService = MailServices.messenger.messageServiceFromURI(uri);
  return msgService.getUrlForUri(uri);
}

/**
 * Given a msgHdr, return a list of tag objects. This function
 * just does the messy work of understanding how tags are
 * stored in nsIMsgDBHdrs.
 *
 * @param {nsIMsgDbHdr} aMsgHdr the msgHdr whose tags we want
 * @return {nsIMsgTag array} a list of tag objects
 */
function msgHdrGetTags(aMsgHdr) {
  let keywords = aMsgHdr.getStringProperty("keywords");
  let keywordList = keywords.split(" ");
  let keywordMap = {};
  for (let keyword of keywordList) {
    keywordMap[keyword] = true;
  }

  let tagArray = MailServices.tags.getAllTags({});
  let tags = tagArray.filter(tag => tag.key in keywordMap);
  return tags;
}

/**
 * Set the tags for a given msgHdr.
 *
 * @param {nsIMsgDBHdr} aMsgHdr
 * @param {nsIMsgTag array} aTags
 */
function msgHdrSetTags(aMsgHdr, aTags) {
  let oldTagList = msgHdrGetTags(aMsgHdr);
  let oldTags = {}; // hashmap
  for (let tag of oldTagList) {
    oldTags[tag.key] = null;
  }

  let newTags = {};
  let newTagList = aTags;
  for (let tag of newTagList) {
    newTags[tag.key] = null;
  }

  let toAdd = newTagList.filter(x => !(x.key in oldTags)).map(x => x.key);
  let toRemove = oldTagList.filter(x => !(x.key in newTags)).map(x => x.key);

  let folder = aMsgHdr.folder;
  folder.addKeywordsToMessages([aMsgHdr], toAdd.join(" "));
  folder.removeKeywordsFromMessages([aMsgHdr], toRemove.join(" "));
  aMsgHdr.folder.msgDatabase = null;
}

/**
 * Mark an array of msgHdrs read (or unread)
 * @param {nsIMsgDbHdr array} msgHdrs The message headers
 * @param {bool} read True to mark them read, false to mark them unread
 */
function msgHdrsMarkAsRead(msgHdrs, read) {
  let pending = {};
  for (let msgHdr of msgHdrs) {
    if (msgHdr.isRead == read) {
      continue;
    }
    if (!pending[msgHdr.folder.URI]) {
      pending[msgHdr.folder.URI] = {
        folder: msgHdr.folder,
        msgs: [],
      };
    }
    pending[msgHdr.folder.URI].msgs.push(msgHdr);
  }
  for (let [{ folder, msgs }] of entries(pending)) {
    folder.markMessagesRead(msgs, read);
    folder.msgDatabase = null; /* don't leak */
  }
}

/**
 * Delete a set of messages.
 * @param {nsIMsgDbHdr array} msgHdrs The message headers
 */
function msgHdrsDelete(msgHdrs) {
  let pending = {};
  for (let msgHdr of msgHdrs) {
    if (!pending[msgHdr.folder.URI]) {
      pending[msgHdr.folder.URI] = { folder: msgHdr.folder, msgs: [] };
    }
    pending[msgHdr.folder.URI].msgs.push(msgHdr);
  }
  for (let [{ folder, msgs }] of entries(pending)) {
    folder.deleteMessages(
      msgs,
      getMail3Pane().msgWindow,
      false,
      false,
      null,
      true
    );
    folder.msgDatabase = null; /* don't leak */
  }
}

/**
 * Get the main Thunderbird window. Used heavily to get a reference to globals
 *  that are defined in mail/base/content/.
 * @return The window object for the main window.
 */
function getMail3Pane() {
  return Services.wm.getMostRecentWindow("mail:3pane");
}

/**
 * Archive a set of messages
 * @param {nsIMsgDbHdr array} msgHdrs The message headers
 */
function msgHdrsArchive(msgHdrs) {
  /* See
   * http://mxr.mozilla.org/comm-central/source/suite/mailnews/mailWindowOverlay.js#1337
   *
   * The window is here because otherwise we don't have access to
   * BatchMessageMover.
   * */
  let mail3PaneWindow = getMail3Pane();
  let batchMover = new mail3PaneWindow.BatchMessageMover();
  batchMover.archiveMessages(
    msgHdrs.filter(
      x =>
        !msgHdrIsArchive(x) &&
        getMail3Pane().getIdentityForHeader(x)[0].archiveEnabled
    )
  );
}

/**
 * Tell if a message is an RSS feed iteme
 * @param {nsIMsgDbHdr} msgHdr The message header
 * @return {Bool}
 */
function msgHdrIsRss(msgHdr) {
  return msgHdr.folder.server instanceof Ci.nsIRssIncomingServer;
}

/**
 * Tell if a message is a NNTP message
 * @param {nsIMsgDbHdr} msgHdr The message header
 * @return {Bool}
 */
function msgHdrIsNntp(msgHdr) {
  return msgHdr.folder.server instanceof Ci.nsINntpIncomingServer;
}

/**
 * Tell if a message has been marked as junk.
 * @param {nsIMsgDbHdr} msgHdr The message header
 * @return {Bool}
 */
function msgHdrIsJunk(aMsgHdr) {
  return (
    aMsgHdr.getStringProperty("junkscore") == Ci.nsIJunkMailPlugin.IS_SPAM_SCORE
  );
}

/**
 * Recycling the HeaderHandlerBase from MimeMessage.jsm
 */
function HeaderHandler(aHeaders) {
  this.headers = aHeaders;
}

HeaderHandler.prototype = {
  __proto__: MimeMessage.prototype.__proto__, // == HeaderHandlerBase
};

/**
 * Creates a stream listener that will call k once done, passing it the string
 * that has been read.
 */
function createStreamListener(k) {
  return {
    _data: "",
    _stream: null,

    QueryInterface: ChromeUtils.generateQI([
      "nsIStreamListener",
      "nsIRequestObserver",
    ]),

    // nsIRequestObserver
    onStartRequest(aRequest) {},
    onStopRequest(aRequest, aStatusCode) {
      try {
        k(this._data);
      } catch (e) {
        dump("Error inside stream listener:\n" + e + "\n");
      }
    },

    // nsIStreamListener
    onDataAvailable(aRequest, dummy, aInputStream, aOffset, aCount) {
      aInputStream = dummy;
      aCount = aOffset;
      if (this._stream == null) {
        this._stream = Cc[
          "@mozilla.org/scriptableinputstream;1"
        ].createInstance(Ci.nsIScriptableInputStream);
        this._stream.init(aInputStream);
      }
      this._data += this._stream.read(aCount);
    },
  };
}

/**
 * @param aMsgHdr The message header whose headers you want
 * @param k A function that takes a HeaderHandler object (see MimeMessage.jsm).
 *  Such an object has a get function, a has function. It has a header property,
 *  whose keys are lowercased header names, and whose values are list of
 *  strings corresponding to the multiple entries found for that header.
 */
function msgHdrGetHeaders(aMsgHdr, k) {
  let uri = msgHdrGetUri(aMsgHdr);
  let messageService = MailServices.messenger.messageServiceFromURI(uri);

  let fallback = () =>
    MsgHdrToMimeMessage(
      aMsgHdr,
      null,
      function(aMsgHdr, aMimeMsg) {
        k(aMimeMsg);
      },
      true,
      {
        partsOnDemand: true,
      }
    );

  // This is intentionally disabled because there's a bug in Thunderbird that
  // renders the supposedly-useful streamHeaders function unusable.
  if (false && "streamHeaders" in messageService) {
    try {
      messageService.streamHeaders(
        uri,
        createStreamListener(aRawString => {
          let re = /\r?\n\s+/g;
          let str = aRawString.replace(re, " ");
          let lines = str.split(/\r?\n/);
          let obj = {};
          for (let line of lines) {
            let i = line.indexOf(":");
            if (i < 0) {
              continue;
            }
            let k = line.substring(0, i).toLowerCase();
            let v = line.substring(i + 1).trim();
            if (!(k in obj)) {
              obj[k] = [];
            }
            obj[k].push(v);
          }
          k(new HeaderHandler(obj));
        }),
        null,
        true
      );
    } catch (e) {
      fallback();
    }
  } else {
    fallback();
  }
}

/**
 * @param aMsgHdrs The messages to modify
 * @param aTransformer A function which takes the input data, modifies it, and
 * returns the corresponding data. This is the _raw_ contents of the message.
 */
function msgHdrsModifyRaw(aMsgHdrs, aTransformer) {
  let toCopy = [];
  let toDelete = [];
  let copyNext = () => {
    dump("msgHdrModifyRaw: copying next\n");
    let obj = toCopy.pop();
    if (!obj) {
      msgHdrsDelete(toDelete);
      return;
    }

    let { msgHdr, tempFile } = obj;

    MailServices.copy.copyFileMessage(
      tempFile,
      msgHdr.folder,
      null,
      false,
      msgHdr.flags,
      msgHdr.getStringProperty("keywords"),
      {
        QueryInterface: ChromeUtils.generateQI(["nsIMsgCopyServiceListener"]),

        OnStartCopy() {},
        OnProgress(aProgress, aProgressMax) {},
        SetMessageKey(aKey) {},
        GetMessageId(aMessageId) {},
        OnStopCopy(aStatus) {
          if (NS_SUCCEEDED(aStatus)) {
            dump("msgHdrModifyRaw: copied successfully\n");
            toDelete.push(msgHdr);
            tempFile.remove(false);
          }
          copyNext();
        },
      },
      null
    );
  };

  let count = aMsgHdrs.length;
  let tick = function() {
    if (--count == 0) {
      copyNext();
    }
  };

  for (let aMsgHdr of aMsgHdrs) {
    let msgHdr = aMsgHdr;
    let uri = msgHdrGetUri(msgHdr);
    let messageService = MailServices.messenger.messageServiceFromURI(uri);
    messageService.streamMessage(
      uri,
      createStreamListener(function(aRawString) {
        let data = aTransformer(aRawString);
        if (!data) {
          dump("msgHdrModifyRaw: no data, aborting\n");
          return;
        }

        let tempFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
        tempFile.append("rethread.eml");
        tempFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, parseInt("0600", 8));

        let stream = Cc[
          "@mozilla.org/network/file-output-stream;1"
        ].createInstance(Ci.nsIFileOutputStream);
        stream.init(tempFile, PR_WRONLY, parseInt("0600", 8), 0);
        stream.write(data, data.length);
        stream.close();

        dump("msgHdrModifyRaw: wrote to file\n");
        toCopy.push({
          tempFile,
          msgHdr,
        });
        tick();
      }),
      null,
      null,
      false,
      ""
    );
  }
}
