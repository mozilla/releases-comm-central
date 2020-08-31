/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);
ChromeUtils.defineModuleGetter(this, "OS", "resource://gre/modules/osfile.jsm");
ChromeUtils.defineModuleGetter(
  this,
  "toXPCOMArray",
  "resource:///modules/iteratorUtils.jsm"
);

// eslint-disable-next-line mozilla/reject-importGlobalProperties
Cu.importGlobalProperties(["File", "FileReader"]);

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
        if (subject.location.href == COMPOSE_WINDOW_URI) {
          Services.obs.removeObserver(observer, "chrome-document-loaded");
          subject.ownerGlobal.addEventListener(
            "compose-editor-ready",
            () => {
              resolve(subject.ownerGlobal);
            },
            { once: true }
          );
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
      null,
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

    if (details.attachments !== null) {
      for (let data of details.attachments) {
        let attachment = Cc[
          "@mozilla.org/messengercompose/attachment;1"
        ].createInstance(Ci.nsIMsgAttachment);
        attachment.name = data.name || data.file.name;
        attachment.size = data.file.size;
        attachment.url = await fileURLForFile(data.file);

        composeFields.addAttachment(attachment);
      }
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

async function fileURLForFile(file) {
  if (file.mozFullPath) {
    let realFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    realFile.initWithPath(file.mozFullPath);
    return Services.io.newFileURI(realFile).spec;
  }

  let tempDir = OS.Constants.Path.tmpDir;
  let destFile = OS.Path.join(tempDir, file.name);

  let { path: outputPath, file: outputFileWriter } = await OS.File.openUnique(
    destFile
  );
  let outputFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  outputFile.initWithPath(outputPath);

  let extAppLauncher = Cc["@mozilla.org/mime;1"].getService(
    Ci.nsPIExternalAppLauncher
  );
  extAppLauncher.deleteTemporaryFileOnExit(outputFile);

  return new Promise(function(resolve) {
    let reader = new FileReader();
    reader.onloadend = async function() {
      await outputFileWriter.write(new Uint8Array(reader.result));
      outputFileWriter.close();

      let outputURL = Services.io.newFileURI(outputFile);
      resolve(outputURL.spec);
    };
    reader.readAsArrayBuffer(file);
  });
}

var composeEventTracker = {
  listeners: new Set(),

  addListener(listener) {
    this.listeners.add(listener);
    if (this.listeners.size == 1) {
      windowTracker.addListener("beforesend", this);
    }
  },
  removeListener(listener) {
    this.listeners.delete(listener);
    if (this.listeners.size == 0) {
      windowTracker.removeListener("beforesend", this);
    }
  },
  async handleEvent(event) {
    event.preventDefault();

    let msgType = event.detail;
    let composeWindow = event.target;

    composeWindow.ToggleWindowLock(true);

    for (let { handler, extension } of this.listeners) {
      let result = await handler(
        composeWindow,
        getComposeDetails(composeWindow, extension)
      );
      if (!result) {
        continue;
      }
      if (result.cancel) {
        composeWindow.ToggleWindowLock(false);
        return;
      }
      if (result.details) {
        await setComposeDetails(composeWindow, result.details, extension);
      }
    }

    // Load the new details into gMsgCompose.compFields for sending.
    composeWindow.GetComposeDetails();

    // Calling getComposeDetails collapses mailing lists. Expand them again.
    composeWindow.expandRecipients();
    composeWindow.ToggleWindowLock(false);
    composeWindow.CompleteGenericSendMessage(msgType);
  },
};

var composeAttachmentTracker = {
  _nextId: 1,
  _attachments: new Map(),
  _attachmentIds: new Map(),

  getId(attachment, window) {
    if (this._attachmentIds.has(attachment)) {
      return this._attachmentIds.get(attachment).id;
    }
    let id = this._nextId++;
    this._attachments.set(id, { attachment, window });
    this._attachmentIds.set(attachment, { id, window });
    return id;
  },

  getAttachment(id) {
    return this._attachments.get(id);
  },

  hasAttachment(id) {
    return this._attachments.has(id);
  },

  forgetAttachment(attachment) {
    // This is called on all attachments when the window closes, whether the
    // attachments have been assigned IDs or not.
    let id = this._attachmentIds.get(attachment)?.id;
    if (id) {
      this._attachmentIds.delete(attachment);
      this._attachments.delete(id);
    }
  },

  forgetAttachments(window) {
    if (window.location.href == COMPOSE_WINDOW_URI) {
      let bucket = window.document.getElementById("attachmentBucket");
      for (let item of bucket.itemChildren) {
        this.forgetAttachment(item.attachment);
      }
    }
  },

  async convert(attachment, window) {
    return {
      id: this.getId(attachment, window),
      name: attachment.name,
    };
  },

  getFile(id) {
    let { attachment } = this.getAttachment(id);
    if (!attachment) {
      return null;
    }

    let uri = Services.io.newURI(attachment.url).QueryInterface(Ci.nsIFileURL);
    return File.createFromNsIFile(uri.file);
  },
};
windowTracker.addCloseListener(
  composeAttachmentTracker.forgetAttachments.bind(composeAttachmentTracker)
);

this.compose = class extends ExtensionAPI {
  getAPI(context) {
    function getComposeTab(tabId) {
      let tab = tabManager.get(tabId);
      if (tab instanceof TabmailTab) {
        throw new ExtensionError("Not a valid compose window");
      }
      let location = tab.nativeTab.location.href;
      if (location != COMPOSE_WINDOW_URI) {
        throw new ExtensionError(`Not a valid compose window: ${location}`);
      }
      return tab;
    }

    let { extension } = context;
    let { tabManager, windowManager } = extension;

    return {
      compose: {
        onBeforeSend: new EventManager({
          context,
          name: "compose.onBeforeSend",
          inputHandling: true,
          register: fire => {
            let listener = {
              handler(window, details) {
                let win = windowManager.wrapWindow(window);
                return fire.async(
                  tabManager.convert(win.activeTab.nativeTab),
                  details
                );
              },
              extension,
            };

            composeEventTracker.addListener(listener);
            return () => {
              composeEventTracker.removeListener(listener);
            };
          },
        }).api(),
        onAttachmentAdded: new ExtensionCommon.EventManager({
          context,
          name: "compose.onAttachmentAdded",
          register(fire) {
            async function callback(event) {
              for (let attachment of event.detail.enumerate(
                Ci.nsIMsgAttachment
              )) {
                attachment = await composeAttachmentTracker.convert(
                  attachment,
                  event.target.ownerGlobal
                );
                fire.async(
                  tabManager.convert(event.target.ownerGlobal),
                  attachment
                );
              }
            }

            windowTracker.addListener("attachments-added", callback);
            return function() {
              windowTracker.removeListener("attachments-added", callback);
            };
          },
        }).api(),
        onAttachmentRemoved: new ExtensionCommon.EventManager({
          context,
          name: "compose.onAttachmentRemoved",
          register(fire) {
            function callback(event) {
              for (let attachment of event.detail.enumerate(
                Ci.nsIMsgAttachment
              )) {
                let attachmentId = composeAttachmentTracker.getId(
                  attachment,
                  event.target.ownerGlobal
                );
                fire.async(
                  tabManager.convert(event.target.ownerGlobal),
                  attachmentId
                );
                composeAttachmentTracker.forgetAttachment(attachment);
              }
            }

            windowTracker.addListener("attachments-removed", callback);
            return function() {
              windowTracker.removeListener("attachments-removed", callback);
            };
          },
        }).api(),
        onIdentityChanged: new ExtensionCommon.EventManager({
          context,
          name: "compose.onIdentityChanged",
          register(fire) {
            function callback(event) {
              fire.async(
                tabManager.convert(event.target.ownerGlobal),
                event.target.getCurrentIdentityKey()
              );
            }

            windowTracker.addListener("compose-from-changed", callback);
            return function() {
              windowTracker.removeListener("compose-from-changed", callback);
            };
          },
        }).api(),
        async beginNew(details) {
          let composeWindow = await openComposeWindow(
            null,
            Ci.nsIMsgCompType.New,
            details,
            extension
          );
          return tabManager.convert(composeWindow);
        },
        async beginReply(messageId, replyType, details) {
          let type = Ci.nsIMsgCompType.Reply;
          if (replyType == "replyToList") {
            type = Ci.nsIMsgCompType.ReplyToList;
          } else if (replyType == "replyToAll") {
            type = Ci.nsIMsgCompType.ReplyAll;
          }
          let composeWindow = await openComposeWindow(
            messageId,
            type,
            details,
            extension
          );
          return tabManager.convert(composeWindow);
        },
        async beginForward(messageId, forwardType, details) {
          let type = Ci.nsIMsgCompType.ForwardInline;
          if (forwardType == "forwardAsAttachment") {
            type = Ci.nsIMsgCompType.ForwardAsAttachment;
          } else if (
            forwardType === null &&
            Services.prefs.getIntPref("mail.forward_message_mode") == 0
          ) {
            type = Ci.nsIMsgCompType.ForwardAsAttachment;
          }
          let composeWindow = await openComposeWindow(
            messageId,
            type,
            details,
            extension
          );
          return tabManager.convert(composeWindow);
        },
        getComposeDetails(tabId) {
          let tab = getComposeTab(tabId);
          return getComposeDetails(tab.nativeTab, extension);
        },
        setComposeDetails(tabId, details) {
          let tab = getComposeTab(tabId);
          return setComposeDetails(tab.nativeTab, details, extension);
        },
        async listAttachments(tabId) {
          let tab = tabManager.get(tabId);
          if (!tab.isComposeTab) {
            throw new ExtensionError(`Invalid compose tab: ${tabId}`);
          }
          let bucket = tab.nativeTab.document.getElementById(
            "attachmentBucket"
          );
          let attachments = [];
          for (let item of bucket.itemChildren) {
            attachments.push(
              await composeAttachmentTracker.convert(
                item.attachment,
                tab.nativeTab
              )
            );
          }
          return attachments;
        },
        async addAttachment(tabId, data) {
          let tab = tabManager.get(tabId);
          if (!tab.isComposeTab) {
            throw new ExtensionError(`Invalid compose tab: ${tabId}`);
          }

          let attachment = Cc[
            "@mozilla.org/messengercompose/attachment;1"
          ].createInstance(Ci.nsIMsgAttachment);
          attachment.name = data.name || data.file.name;
          attachment.size = data.file.size;
          attachment.url = await fileURLForFile(data.file);

          tab.nativeTab.AddAttachments([attachment]);

          return composeAttachmentTracker.convert(attachment, tab.nativeTab);
        },
        async updateAttachment(tabId, attachmentId, data) {
          let tab = tabManager.get(tabId);
          if (!tab.isComposeTab) {
            throw new ExtensionError(`Invalid compose tab: ${tabId}`);
          }
          if (!composeAttachmentTracker.hasAttachment(attachmentId)) {
            throw new ExtensionError(`Invalid attachment: ${attachmentId}`);
          }
          let { attachment, window } = composeAttachmentTracker.getAttachment(
            attachmentId
          );
          if (window != tab.nativeTab) {
            throw new ExtensionError(
              `Attachment ${attachmentId} is not associated with tab ${tabId}`
            );
          }

          if (data.name) {
            attachment.name = data.name;
          }
          if (data.file) {
            attachment.size = data.file.size;
            attachment.url = await fileURLForFile(data.file);
          }

          window.AttachmentsChanged();
          return composeAttachmentTracker.convert(attachment);
        },
        async removeAttachment(tabId, attachmentId) {
          let tab = tabManager.get(tabId);
          if (!tab.isComposeTab) {
            throw new ExtensionError(`Invalid compose tab: ${tabId}`);
          }
          if (!composeAttachmentTracker.hasAttachment(attachmentId)) {
            throw new ExtensionError(`Invalid attachment: ${attachmentId}`);
          }
          let { attachment, window } = composeAttachmentTracker.getAttachment(
            attachmentId
          );
          if (window != tab.nativeTab) {
            throw new ExtensionError(
              `Attachment ${attachmentId} is not associated with tab ${tabId}`
            );
          }

          let bucket = window.document.getElementById("attachmentBucket");
          let item = bucket.findItemForAttachment(attachment);
          item.remove();

          window.RemoveAttachments([item]);
        },

        // This method is not available to the extension code, the extension
        // code will call .getFile() on the object that is resolved from
        // promises returned by various API methods.
        getFile(attachmentId) {
          return composeAttachmentTracker.getFile(attachmentId);
        },
      },
    };
  }
};
