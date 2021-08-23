/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from commandglue.js */
/* import-globals-from folderDisplay.js */
/* import-globals-from mailWindow.js */
/* import-globals-from utilityOverlay.js */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

function GetNextNMessages(folder) {
  if (folder) {
    var newsFolder = folder.QueryInterface(Ci.nsIMsgNewsFolder);
    if (newsFolder) {
      newsFolder.getNextNMessages(msgWindow);
    }
  }
}

/**
 * Figure out the message key from the message uri.
 * @param uri string defining internal storage
 */
function GetMsgKeyFromURI(uri) {
  // Format of 'uri' : protocol://email/folder#key?params
  //                   '?params' are optional
  //   ex : mailbox-message://john%2Edoe@pop.isp.invalid/Drafts#123456?fetchCompleteMessage=true
  //   ex : mailbox-message://john%2Edoe@pop.isp.invalid/Drafts#12345
  // We keep only the part after '#' and before an optional '?'.
  // The regexp expects 'key' to be an integer (a series of digits) : '\d+'.
  let match = /.+#(\d+)/.exec(uri);
  return match ? match[1] : null;
}

/* eslint-disable complexity */
/**
 * Compose a message.
 *
 * @param type   nsIMsgCompType    Type of composition (new message, reply, draft, etc.)
 * @param format nsIMsgCompFormat  Requested format (plain text, html, default)
 * @param folder nsIMsgFolder      Folder where the original message is stored
 * @param messageArray             Array of messages to process, often only holding one element.
 */
async function ComposeMessage(type, format, folder, messageArray) {
  function findDeliveredToIdentityEmail(hdr) {
    // This function reads from currentHeaderData, which is only useful if we're
    // looking at the currently-displayed message. Otherwise, just return
    // immediately so we don't waste time.
    if (hdr != gMessageDisplay.displayedMessage) {
      return "";
    }

    // Get the delivered-to headers.
    let key = "delivered-to";
    let deliveredTos = [];
    let index = 0;
    let header = "";
    while ((header = currentHeaderData[key])) {
      deliveredTos.push(header.headerValue.toLowerCase().trim());
      key = "delivered-to" + index++;
    }

    // Reverse the array so that the last delivered-to header will show at front.
    deliveredTos.reverse();

    for (let i = 0; i < deliveredTos.length; i++) {
      for (let identity of MailServices.accounts.allIdentities) {
        if (!identity.email) {
          continue;
        }
        // If the deliver-to header contains the defined identity, that's it.
        if (
          deliveredTos[i] == identity.email.toLowerCase() ||
          deliveredTos[i].includes("<" + identity.email.toLowerCase() + ">")
        ) {
          return identity.email;
        }
      }
    }
    return "";
  }

  let msgComposeType = Ci.nsIMsgCompType;
  let suppressReplyQuote = false;
  let msgKey;
  if (messageArray && messageArray.length == 1) {
    msgKey = GetMsgKeyFromURI(messageArray[0]);
    if (msgKey != gMessageDisplay.keyForCharsetOverride) {
      msgWindow.charsetOverride = false;
    }
    if (
      type == msgComposeType.Reply ||
      type == msgComposeType.ReplyAll ||
      type == msgComposeType.ReplyToSender ||
      type == msgComposeType.ReplyToGroup ||
      type == msgComposeType.ReplyToSenderAndGroup ||
      type == msgComposeType.ReplyToList
    ) {
      let displayKey =
        gMessageDisplay.displayedMessage &&
        "messageKey" in gMessageDisplay.displayedMessage
          ? gMessageDisplay.displayedMessage.messageKey
          : null;
      if (msgKey != displayKey) {
        // Not replying to the displayed message, so remove the selection
        // in order not to quote from the wrong message.
        suppressReplyQuote = true;
      }
    }
  }

  // Check if the draft is already open in another window. If it is, just focus the window.
  if (type == msgComposeType.Draft && messageArray.length == 1) {
    // We'll search this uri in the opened windows.
    for (let win of Services.wm.getEnumerator("")) {
      // Check if it is a compose window.
      if (
        win.document.defaultView.gMsgCompose &&
        win.document.defaultView.gMsgCompose.compFields.draftId
      ) {
        let wKey = GetMsgKeyFromURI(
          win.document.defaultView.gMsgCompose.compFields.draftId
        );
        if (wKey == msgKey) {
          // Found ! just focus it...
          win.focus();
          // ...and nothing to do anymore.
          return;
        }
      }
    }
  }
  var identity = null;
  var newsgroup = null;
  var hdr;

  // dump("ComposeMessage folder=" + folder + "\n");
  try {
    if (folder) {
      // Get the incoming server associated with this uri.
      var server = folder.server;

      // If they hit new or reply and they are reading a newsgroup,
      // turn this into a new post or a reply to group.
      if (
        !folder.isServer &&
        server.type == "nntp" &&
        type == msgComposeType.New
      ) {
        type = msgComposeType.NewsPost;
        newsgroup = folder.folderURL;
      }

      identity = folder.customIdentity;
      if (!identity) {
        [identity] = MailUtils.getIdentityForServer(server);
      }
      // dump("identity = " + identity + "\n");
    }
  } catch (ex) {
    dump("failed to get an identity to pre-select: " + ex + "\n");
  }

  // dump("\nComposeMessage from XUL: " + identity + "\n");

  switch (type) {
    case msgComposeType.New: // new message
      // dump("OpenComposeWindow with " + identity + "\n");

      MailServices.compose.OpenComposeWindow(
        null,
        null,
        null,
        type,
        format,
        identity,
        null,
        msgWindow
      );
      return;
    case msgComposeType.NewsPost:
      // dump("OpenComposeWindow with " + identity + " and " + newsgroup + "\n");
      MailServices.compose.OpenComposeWindow(
        null,
        null,
        newsgroup,
        type,
        format,
        identity,
        null,
        msgWindow
      );
      return;
    case msgComposeType.ForwardAsAttachment:
      if (messageArray && messageArray.length) {
        // If we have more than one ForwardAsAttachment then pass null instead
        // of the header to tell the compose service to work out the attachment
        // subjects from the URIs.
        hdr =
          messageArray.length > 1
            ? null
            : messenger.msgHdrFromURI(messageArray[0]);
        MailServices.compose.OpenComposeWindow(
          null,
          hdr,
          messageArray.join(","),
          type,
          format,
          identity,
          null,
          msgWindow
        );
      }
      return;
    default:
      if (!messageArray) {
        return;
      }

      // Limit the number of new compose windows to 8. Why 8 ?
      // I like that number :-)
      if (messageArray.length > 8) {
        messageArray.length = 8;
      }

      for (var i = 0; i < messageArray.length; ++i) {
        var messageUri = messageArray[i];
        hdr = messenger.msgHdrFromURI(messageUri);

        if (
          [
            Ci.nsIMsgCompType.Reply,
            Ci.nsIMsgCompType.ReplyAll,
            Ci.nsIMsgCompType.ReplyToSender,
            Ci.nsIMsgCompType.ReplyToGroup,
            Ci.nsIMsgCompType.ReplyToSenderAndGroup,
            Ci.nsIMsgCompType.ReplyWithTemplate,
            Ci.nsIMsgCompType.ReplyToList,
          ].includes(type)
        ) {
          let replyTo = hdr.getStringProperty("replyTo");
          let from = replyTo || hdr.author;
          let fromAddrs = MailServices.headerParser.parseEncodedHeader(
            from,
            null
          );
          let email = fromAddrs[0]?.email;
          if (type == msgComposeType.ReplyToList) {
            // ReplyToList is only enabled for current message (if at all), so
            // using currentHeaderData is ok.
            // List-Post value is of the format <mailto:list@example.com>
            let listPost = currentHeaderData["list-post"]?.headerValue;
            if (listPost) {
              email = listPost.replace(/.*<mailto:(.+)>.*/, "$1");
            }
          }

          if (
            /^(.*[._-])?(do[._-]?not|no)[._-]?reply([._-].*)?@/i.test(email)
          ) {
            let [
              title,
              message,
              replyAnywayButton,
            ] = await document.l10n.formatValues([
              { id: "no-reply-title" },
              { id: "no-reply-message", args: { email } },
              { id: "no-reply-reply-anyway-button" },
            ]);

            let buttonFlags =
              Ci.nsIPrompt.BUTTON_TITLE_IS_STRING * Ci.nsIPrompt.BUTTON_POS_0 +
              Ci.nsIPrompt.BUTTON_TITLE_CANCEL * Ci.nsIPrompt.BUTTON_POS_1 +
              Ci.nsIPrompt.BUTTON_POS_1_DEFAULT;

            if (
              Services.prompt.confirmEx(
                window,
                title,
                message,
                buttonFlags,
                replyAnywayButton,
                null, // cancel
                null,
                null,
                {}
              )
            ) {
              continue;
            }
          }
        }

        if (FeedUtils.isFeedMessage(hdr)) {
          // Do not use the header derived identity for feeds, pass on only a
          // possible server identity from above.
          openComposeWindowForRSSArticle(
            null,
            hdr,
            messageUri,
            type,
            format,
            identity,
            msgWindow
          );
        } else {
          // Replies come here.

          let useCatchAll = false;
          // Check if we are using catchAll on any identity. If current
          // folder has some customIdentity set, ignore catchAll settings.
          // CatchAll is not applicable to news (and doesn't work, bug 545365).
          if (
            hdr.folder &&
            hdr.folder.server.type != "nntp" &&
            !hdr.folder.customIdentity
          ) {
            useCatchAll = MailServices.accounts.allIdentities.some(
              identity => identity.catchAll
            );
          }

          if (useCatchAll) {
            // If we use catchAll, we need to get all headers.
            // MsgHdr retrieval is asynchronous, do everything in the callback.
            MsgHdrToMimeMessage(
              hdr,
              null,
              function(hdr, mimeMsg) {
                let catchAllHeaders = Services.prefs
                  .getStringPref("mail.compose.catchAllHeaders")
                  .split(",")
                  .map(header => header.toLowerCase().trim());
                // Collect catchAll hints from given headers.
                let collectedHeaderAddresses = "";
                for (let header of catchAllHeaders) {
                  if (mimeMsg.has(header)) {
                    for (let mimeMsgHeader of mimeMsg.headers[header]) {
                      collectedHeaderAddresses +=
                        MailServices.headerParser
                          .parseEncodedHeaderW(mimeMsgHeader)
                          .toString() + ",";
                    }
                  }
                }

                let [identity, matchingHint] = MailUtils.getIdentityForHeader(
                  hdr,
                  type,
                  collectedHeaderAddresses
                );

                // The found identity might have no catchAll enabled.
                if (identity.catchAll && matchingHint) {
                  // If name is not set in matchingHint, search trough other hints.
                  if (matchingHint.email && !matchingHint.name) {
                    let hints = MailServices.headerParser.makeFromDisplayAddress(
                      hdr.recipients +
                        "," +
                        hdr.ccList +
                        "," +
                        collectedHeaderAddresses
                    );
                    for (let hint of hints) {
                      if (
                        hint.name &&
                        hint.email.toLowerCase() ==
                          matchingHint.email.toLowerCase()
                      ) {
                        matchingHint = MailServices.headerParser.makeMailboxObject(
                          hint.name,
                          matchingHint.email
                        );
                        break;
                      }
                    }
                  }
                } else {
                  matchingHint = MailServices.headerParser.makeMailboxObject(
                    "",
                    ""
                  );
                }

                // Now open compose window and use matching hint as reply sender.
                MailServices.compose.OpenComposeWindow(
                  null,
                  hdr,
                  messageUri,
                  type,
                  format,
                  identity,
                  matchingHint.toString(),
                  msgWindow,
                  suppressReplyQuote
                );
              },
              true,
              { saneBodySize: true, partsOnDemand: true }
            );
          } else {
            // Fall back to traditional behavior.
            let [hdrIdentity] = MailUtils.getIdentityForHeader(
              hdr,
              type,
              findDeliveredToIdentityEmail(hdr)
            );
            MailServices.compose.OpenComposeWindow(
              null,
              hdr,
              messageUri,
              type,
              format,
              hdrIdentity,
              null,
              msgWindow,
              suppressReplyQuote
            );
          }
        }
      }
  }
}
/* eslint-enable complexity */

function Subscribe(preselectedMsgFolder) {
  window.openDialog(
    "chrome://messenger/content/subscribe.xhtml",
    "subscribe",
    "chrome,modal,titlebar,resizable=yes",
    {
      folder: preselectedMsgFolder,
      okCallback: SubscribeOKCallback,
    }
  );
}

function SubscribeOKCallback(changeTable) {
  for (var serverURI in changeTable) {
    var folder = MailUtils.getExistingFolder(serverURI);
    var server = folder.server;
    var subscribableServer = server.QueryInterface(Ci.nsISubscribableServer);

    for (var name in changeTable[serverURI]) {
      if (changeTable[serverURI][name]) {
        try {
          subscribableServer.subscribe(name);
        } catch (ex) {
          dump("failed to subscribe to " + name + ": " + ex + "\n");
        }
      } else if (!changeTable[serverURI][name]) {
        try {
          subscribableServer.unsubscribe(name);
        } catch (ex) {
          dump("failed to unsubscribe to " + name + ": " + ex + "\n");
        }
      }
    }

    try {
      subscribableServer.commitSubscribeChanges();
    } catch (ex) {
      dump("failed to commit the changes: " + ex + "\n");
    }
  }
}

function SaveAsFile(uris) {
  let filenames = [];

  for (let uri of uris) {
    let msgHdr = messenger.messageServiceFromURI(uri).messageURIToMsgHdr(uri);
    let nameBase = GenerateFilenameFromMsgHdr(msgHdr);
    let name = GenerateValidFilename(nameBase, ".eml");

    let number = 2;
    while (filenames.includes(name)) {
      // should be unlikely
      name = GenerateValidFilename(nameBase + "-" + number, ".eml");
      number++;
    }
    filenames.push(name);
  }

  if (uris.length == 1) {
    messenger.saveAs(uris[0], true, null, filenames[0]);
  } else {
    messenger.saveMessages(filenames, uris);
  }
}

function GenerateFilenameFromMsgHdr(msgHdr) {
  function MakeIS8601ODateString(date) {
    function pad(n) {
      return n < 10 ? "0" + n : n;
    }
    return (
      date.getFullYear() +
      "-" +
      pad(date.getMonth() + 1) +
      "-" +
      pad(date.getDate()) +
      " " +
      pad(date.getHours()) +
      "" +
      pad(date.getMinutes()) +
      ""
    );
  }

  let filename;
  if (msgHdr.flags & Ci.nsMsgMessageFlags.HasRe) {
    filename = msgHdr.mime2DecodedSubject
      ? "Re: " + msgHdr.mime2DecodedSubject
      : "Re: ";
  } else {
    filename = msgHdr.mime2DecodedSubject;
  }

  filename += " - ";
  filename += msgHdr.mime2DecodedAuthor + " - ";
  filename += MakeIS8601ODateString(new Date(msgHdr.date / 1000));

  return filename;
}

function saveAsUrlListener(aUri, aIdentity) {
  this.uri = aUri;
  this.identity = aIdentity;
}

saveAsUrlListener.prototype = {
  OnStartRunningUrl(aUrl) {},
  OnStopRunningUrl(aUrl, aExitCode) {
    messenger.saveAs(this.uri, false, this.identity, null);
  },
};

function SaveAsTemplate(uri) {
  if (uri) {
    let hdr = messenger.msgHdrFromURI(uri);
    let [identity] = MailUtils.getIdentityForHeader(
      hdr,
      Ci.nsIMsgCompType.Template
    );
    let templates = MailUtils.getOrCreateFolder(identity.stationeryFolder);
    if (!templates.parent) {
      templates.setFlag(Ci.nsMsgFolderFlags.Templates);
      let isAsync = templates.server.protocolInfo.foldersCreatedAsync;
      templates.createStorageIfMissing(new saveAsUrlListener(uri, identity));
      if (isAsync) {
        return;
      }
    }
    messenger.saveAs(uri, false, identity, null);
  }
}

function MarkSelectedMessagesRead(markRead) {
  ClearPendingReadTimer();
  gDBView.doCommand(
    markRead
      ? Ci.nsMsgViewCommandType.markMessagesRead
      : Ci.nsMsgViewCommandType.markMessagesUnread
  );
  if (markRead) {
    reportMsgRead({ isNewRead: true });
  }
}

function MarkSelectedMessagesFlagged(markFlagged) {
  gDBView.doCommand(
    markFlagged
      ? Ci.nsMsgViewCommandType.flagMessages
      : Ci.nsMsgViewCommandType.unflagMessages
  );
}

function ViewPageSource(messages) {
  var numMessages = messages.length;

  if (numMessages == 0) {
    dump("MsgViewPageSource(): No messages selected.\n");
    return false;
  }

  try {
    for (var i = 0; i < numMessages; i++) {
      // Now, we need to get a URL from a URI
      var url = MailServices.mailSession.ConvertMsgURIToMsgURL(
        messages[i],
        msgWindow
      );

      // Strip out the message-display parameter to ensure that attached emails
      // display the message source, not the processed HTML.
      url = url.replace(/type=application\/x-message-display&/, "");
      window.openDialog(
        "chrome://messenger/content/viewSource.xhtml",
        "_blank",
        "all,dialog=no",
        { URL: url }
      );
    }
    return true;
  } catch (e) {
    // Couldn't get mail session
    return false;
  }
}
