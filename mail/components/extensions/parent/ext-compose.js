/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);

async function parseComposeRecipientList(list) {
  if (Array.isArray(list)) {
    let recipients = [];
    for (let recipient of list) {
      if (typeof recipient == "string") {
        recipients.push(recipient);
        continue;
      }
      if (!("addressBookCache" in this)) {
        await extensions.asyncLoadModule("addressBook");
      }
      if (recipient.type == "contact") {
        let contactNode = this.addressBookCache.findContactById(recipient.id);
        recipients.push(
          MailServices.headerParser.makeMimeAddress(
            contactNode.item.displayName,
            contactNode.item.primaryEmail
          )
        );
      } else {
        let mailingListNode = this.addressBookCache.findMailingListById(
          recipient.id
        );
        recipients.push(
          MailServices.headerParser.makeMimeAddress(
            mailingListNode.item.dirName,
            mailingListNode.item.description || mailingListNode.item.dirName
          )
        );
      }
    }
    return recipients.join(",");
  }
  return list;
}

async function openComposeWindow(relatedMessageId, type, details, extension) {
  function waitForWindow() {
    return new Promise(resolve => {
      function observer(subject, topic, data) {
        if (
          subject.location.href ==
          "chrome://messenger/content/messengercompose/messengercompose.xhtml"
        ) {
          Services.obs.removeObserver(observer, "chrome-document-loaded");
          resolve();
        }
      }
      Services.obs.addObserver(observer, "chrome-document-loaded");
    });
  }

  // ForwardInline is totally broken, see bug 1513824.
  if (type == Ci.nsIMsgCompType.ForwardInline) {
    let msgHdr = null;
    let msgURI = null;
    let hdrIdentity = null;
    if (relatedMessageId) {
      msgHdr = messageTracker.getMessage(relatedMessageId);
      msgURI = msgHdr.folder.getUriForMsg(msgHdr);
    }
    let newWindowPromise = waitForWindow();
    MailServices.compose.OpenComposeWindow(
      null,
      msgHdr,
      msgURI,
      type,
      0,
      hdrIdentity,
      null
    );
    return newWindowPromise;
  }

  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  let composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  if (relatedMessageId) {
    let msgHdr = messageTracker.getMessage(relatedMessageId);
    params.originalMsgURI = msgHdr.folder.getUriForMsg(msgHdr);
  }
  params.type = type;
  if (details) {
    if (details.body !== null) {
      if (details.plainTextBody !== null) {
        throw new ExtensionError(
          "Only one of body and plainTextBody can be specified."
        );
      }
      if (details.isPlainText) {
        throw new ExtensionError(
          "Cannot specify body when isPlainText is true. Use plainTextBody instead."
        );
      }
    }

    if (details.identityId !== null) {
      if (!extension.hasPermission("accountsRead")) {
        throw new ExtensionError(
          'Using identities requires the "accountsRead" permission'
        );
      }

      let identity = MailServices.accounts.allIdentities.find(
        i => i.key == details.identityId
      );
      if (!identity) {
        throw new ExtensionError(`Identity not found: ${details.identityId}`);
      }
      params.identity = identity;
    }
    for (let field of ["to", "cc", "bcc", "replyTo", "followupTo"]) {
      composeFields[field] = await parseComposeRecipientList(details[field]);
    }
    if (details.newsgroups) {
      if (Array.isArray(details.newsgroups)) {
        composeFields.newsgroups = details.newsgroups.join(",");
      } else {
        composeFields.newsgroups = details.newsgroups;
      }
    }
    if (details.subject !== null) {
      composeFields.subject = details.subject;
    }
    if (details.body !== null) {
      composeFields.body = details.body;
    }
    if (details.plainTextBody != null) {
      if (details.isPlainText) {
        params.format = Ci.nsIMsgCompFormat.PlainText;
      }
      composeFields.body = details.plainTextBody;
    }
  }

  params.composeFields = composeFields;

  let newWindowPromise = waitForWindow();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  return newWindowPromise;
}

function getComposeDetails(composeWindow, extension) {
  let composeFields = composeWindow.GetComposeDetails();
  let editor = composeWindow.GetCurrentEditor();

  let details = {
    to: composeFields.splitRecipients(composeFields.to, false),
    cc: composeFields.splitRecipients(composeFields.cc, false),
    bcc: composeFields.splitRecipients(composeFields.bcc, false),
    replyTo: composeFields.splitRecipients(composeFields.replyTo, false),
    followupTo: composeFields.splitRecipients(composeFields.followupTo, false),
    newsgroups: composeFields.newsgroups
      ? composeFields.newsgroups.split(",")
      : [],
    subject: composeFields.subject,
    isPlainText: !composeWindow.IsHTMLEditor(),
    body: editor.outputToString("text/html", 0),
    plainTextBody: editor.outputToString("text/plain", 0),
  };
  if (extension.hasPermission("accountsRead")) {
    details.identityId = composeWindow.getCurrentIdentityKey();
  }
  return details;
}

async function setComposeDetails(composeWindow, details, extension) {
  if (details.body && details.plainTextBody) {
    throw new ExtensionError(
      "Only one of body and plainTextBody can be specified."
    );
  }

  if (details.identityId) {
    if (!extension.hasPermission("accountsRead")) {
      throw new ExtensionError(
        'Using identities requires the "accountsRead" permission'
      );
    }

    let identity = MailServices.accounts.allIdentities.find(
      i => i.key == details.identityId
    );
    if (!identity) {
      throw new ExtensionError(`Identity not found: ${details.identityId}`);
    }
    details.identityKey = details.identityId;
  }
  for (let field of ["to", "cc", "bcc", "replyTo", "followupTo"]) {
    if (field in details) {
      details[field] = await parseComposeRecipientList(details[field]);
    }
  }
  if (Array.isArray(details.newsgroups)) {
    details.newsgroups = details.newsgroups.join(",");
  }
  composeWindow.SetComposeDetails(details);
}

class ComposeEventTracker extends EventEmitter {
  constructor(extension) {
    super();
    this.extension = extension;
    this.listenerCount = 0;
  }
  on(event, listener) {
    super.on(event, listener);

    this.listenerCount++;
    if (this.listenerCount == 1) {
      windowTracker.addListener("beforesend", this);
    }
  }
  off(event, listener) {
    super.off(event, listener);

    this.listenerCount--;
    if (this.listenerCount == 0) {
      windowTracker.removeListener("beforesend", this);
    }
  }
  async handleEvent(event) {
    event.preventDefault();

    let msgType = event.detail;
    let composeWindow = event.target;

    composeWindow.ToggleWindowLock(true);

    let results = await this.emit(
      "compose-before-send",
      composeWindow,
      getComposeDetails(composeWindow, this.extension)
    );
    if (results) {
      for (let result of results) {
        if (!result) {
          continue;
        }
        if (result.cancel) {
          composeWindow.ToggleWindowLock(false);
          return;
        }
        if (result.details) {
          await setComposeDetails(
            composeWindow,
            result.details,
            this.extension
          );
          composeWindow.GetComposeDetails();
          composeWindow.expandRecipients();
        }
      }
    }

    composeWindow.ToggleWindowLock(false);
    composeWindow.CompleteGenericSendMessage(msgType);
  }
}

this.compose = class extends ExtensionAPI {
  getAPI(context) {
    function getComposeTab(tabId) {
      let tab = tabManager.get(tabId);
      if (tab instanceof TabmailTab) {
        throw new ExtensionError("Not a valid compose window");
      }
      let location = tab.nativeTab.location.href;
      if (
        location !=
        "chrome://messenger/content/messengercompose/messengercompose.xhtml"
      ) {
        throw new ExtensionError(`Not a valid compose window: ${location}`);
      }
      return tab;
    }

    let { extension } = context;
    let { tabManager, windowManager } = extension;
    this.eventTracker = new ComposeEventTracker(extension);

    return {
      compose: {
        onBeforeSend: new EventManager({
          context,
          name: "compose.onBeforeSend",
          inputHandling: true,
          register: fire => {
            let listener = (event, window, details) => {
              let win = windowManager.wrapWindow(window);
              return fire.async(
                tabManager.convert(win.activeTab.nativeTab),
                details
              );
            };

            this.eventTracker.on("compose-before-send", listener);
            return () => {
              this.eventTracker.off("compose-before-send", listener);
            };
          },
        }).api(),
        beginNew(details) {
          return openComposeWindow(
            null,
            Ci.nsIMsgCompType.New,
            details,
            extension
          );
        },
        beginReply(messageId, replyType, details) {
          let type = Ci.nsIMsgCompType.Reply;
          if (replyType == "replyToList") {
            type = Ci.nsIMsgCompType.ReplyToList;
          } else if (replyType == "replyToAll") {
            type = Ci.nsIMsgCompType.ReplyAll;
          }
          return openComposeWindow(messageId, type, details, extension);
        },
        beginForward(messageId, forwardType, details) {
          let type = Ci.nsIMsgCompType.ForwardInline;
          if (forwardType == "forwardAsAttachment") {
            type = Ci.nsIMsgCompType.ForwardAsAttachment;
          } else if (
            forwardType === null &&
            Services.prefs.getIntPref("mail.forward_message_mode") == 0
          ) {
            type = Ci.nsIMsgCompType.ForwardAsAttachment;
          }
          return openComposeWindow(messageId, type, details, extension);
        },
        getComposeDetails(tabId) {
          let tab = getComposeTab(tabId);
          return getComposeDetails(tab.nativeTab, extension);
        },
        setComposeDetails(tabId, details) {
          let tab = getComposeTab(tabId);
          return setComposeDetails(tab.nativeTab, details, extension);
        },
      },
    };
  }
};
