/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);
ChromeUtils.defineModuleGetter(this, "OS", "resource://gre/modules/osfile.jsm");

// eslint-disable-next-line mozilla/reject-importGlobalProperties
Cu.importGlobalProperties(["File", "FileReader"]);

async function parseComposeRecipientList(
  list,
  requireSingleValidEmail = false
) {
  if (!list) {
    return list;
  }

  function isValidAddress(address) {
    return address.includes("@", 1) && !address.endsWith("@");
  }

  // A ComposeRecipientList could be just a single ComposeRecipient.
  if (!Array.isArray(list)) {
    list = [list];
  }

  let recipients = [];
  for (let recipient of list) {
    if (typeof recipient == "string") {
      let addressObjects = MailServices.headerParser.makeFromDisplayAddress(
        recipient
      );

      for (let ao of addressObjects) {
        if (requireSingleValidEmail && !isValidAddress(ao.email)) {
          throw new ExtensionError(`Invalid address: ${ao.email}`);
        }
        recipients.push(
          MailServices.headerParser.makeMimeAddress(ao.name, ao.email)
        );
      }
      continue;
    }
    if (!("addressBookCache" in this)) {
      await extensions.asyncLoadModule("addressBook");
    }
    if (recipient.type == "contact") {
      let contactNode = this.addressBookCache.findContactById(recipient.id);

      if (
        requireSingleValidEmail &&
        !isValidAddress(contactNode.item.primaryEmail)
      ) {
        throw new ExtensionError(
          `Contact does not have a valid email address: ${recipient.id}`
        );
      }
      recipients.push(
        MailServices.headerParser.makeMimeAddress(
          contactNode.item.displayName,
          contactNode.item.primaryEmail
        )
      );
    } else {
      if (requireSingleValidEmail) {
        throw new ExtensionError("Mailing list not allowed.");
      }

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
  if (requireSingleValidEmail && recipients.length != 1) {
    throw new ExtensionError(
      `Exactly one address instead of ${recipients.length} is required.`
    );
  }
  return recipients.join(",");
}

function composeWindowIsReady(composeWindow) {
  return new Promise(resolve => {
    if (composeWindow.composeEditorReady) {
      resolve();
      return;
    }
    composeWindow.addEventListener("compose-editor-ready", resolve, {
      once: true,
    });
  });
}

async function openComposeWindow(relatedMessageId, type, details, extension) {
  function waitForWindow() {
    return new Promise(resolve => {
      function observer(subject, topic, data) {
        if (subject.location.href == COMPOSE_WINDOW_URI) {
          Services.obs.removeObserver(observer, "chrome-document-loaded");
          resolve(subject.ownerGlobal);
        }
      }
      Services.obs.addObserver(observer, "chrome-document-loaded");
    });
  }

  let format = Ci.nsIMsgCompFormat.Default;
  let identity = null;

  if (details) {
    if (details.body !== null && details.plainTextBody !== null) {
      throw new ExtensionError(
        "Only one of body and plainTextBody can be specified."
      );
    }

    if (details.isPlainText === false || details.body !== null) {
      if (details.plainTextBody !== null) {
        throw new ExtensionError(
          "Cannot specify plainTextBody when isPlainText is false. Use body instead."
        );
      }
      format = Ci.nsIMsgCompFormat.HTML;
    }
    if (details.isPlainText === true || details.plainTextBody !== null) {
      if (details.body !== null) {
        throw new ExtensionError(
          "Cannot specify body when isPlainText is true. Use plainTextBody instead."
        );
      }
      format = Ci.nsIMsgCompFormat.PlainText;
    }
    if (details.identityId !== null) {
      if (!extension.hasPermission("accountsRead")) {
        throw new ExtensionError(
          'Using identities requires the "accountsRead" permission'
        );
      }

      identity = MailServices.accounts.allIdentities.find(
        i => i.key == details.identityId
      );
      if (!identity) {
        throw new ExtensionError(`Identity not found: ${details.identityId}`);
      }
    }
  }

  // ForwardInline is totally broken, see bug 1513824. Fake it 'til we make it.
  if (
    [
      Ci.nsIMsgCompType.ForwardInline,
      Ci.nsIMsgCompType.Redirect,
      Ci.nsIMsgCompType.EditAsNew,
      Ci.nsIMsgCompType.Template,
    ].includes(type)
  ) {
    let msgHdr = null;
    let msgURI = null;
    if (relatedMessageId) {
      msgHdr = messageTracker.getMessage(relatedMessageId);
      msgURI = msgHdr.folder.getUriForMsg(msgHdr);
    }

    // For the types in this code path, OpenComposeWindow only uses
    // nsIMsgCompFormat.Default or OppositeOfDefault. Check which is needed.
    // See https://hg.mozilla.org/comm-central/file/592fb5c396ebbb75d4acd1f1287a26f56f4164b3/mailnews/compose/src/nsMsgComposeService.cpp#l395
    if (format != Ci.nsIMsgCompFormat.Default) {
      // The mimeConverter used in this code path is not setting any format but
      // defaults to plaintext if no identity and also no default account is set.
      // The "mail.identity.default.compose_html" preference is NOT used.
      let usedIdentity =
        identity || MailServices.accounts.defaultAccount?.defaultIdentity;
      let defaultFormat = usedIdentity?.composeHtml
        ? Ci.nsIMsgCompFormat.HTML
        : Ci.nsIMsgCompFormat.PlainText;
      format =
        format == defaultFormat
          ? Ci.nsIMsgCompFormat.Default
          : Ci.nsIMsgCompFormat.OppositeOfDefault;
    }

    let newWindowPromise = waitForWindow();
    MailServices.compose.OpenComposeWindow(
      null,
      msgHdr,
      msgURI,
      type,
      format,
      identity,
      null,
      null
    );
    let composeWindow = await newWindowPromise;
    await composeWindowIsReady(composeWindow);

    if (details) {
      await setComposeDetails(composeWindow, details, extension);
      if (details.attachments != null) {
        let attachments = [];
        for (let data of details.attachments) {
          let attachment = Cc[
            "@mozilla.org/messengercompose/attachment;1"
          ].createInstance(Ci.nsIMsgAttachment);
          attachment.name = data.name || data.file.name;
          attachment.size = data.file.size;
          attachment.url = await fileURLForFile(data.file);
          attachments.push(attachment);
        }
        composeWindow.AddAttachments(attachments);
      }
    }
    composeWindow.gContentChanged = false;
    return composeWindow;
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
  params.format = format;
  if (identity) {
    params.identity = identity;
  }

  if (details) {
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
  let composeWindow = await newWindowPromise;
  await composeWindowIsReady(composeWindow);

  // Not all details can be set with params for all types, so some need an extra
  // call to setComposeDetails here. Since we have to use setComposeDetails for
  // the EditAsNew code path, unify API behavior by always calling it here too.
  if (details) {
    await setComposeDetails(composeWindow, details, extension);
  }
  composeWindow.gContentChanged = false;
  return composeWindow;
}

async function getComposeDetails(composeWindow, extension) {
  await composeWindowIsReady(composeWindow);

  let composeFields = composeWindow.GetComposeDetails();
  let editor = composeWindow.GetCurrentEditor();

  let type;
  // check all known nsIMsgComposeParams
  switch (composeWindow.gComposeType) {
    case Ci.nsIMsgCompType.Draft:
      type = "draft";
      break;
    case Ci.nsIMsgCompType.New:
    case Ci.nsIMsgCompType.Template:
    case Ci.nsIMsgCompType.MailToUrl:
    case Ci.nsIMsgCompType.EditAsNew:
    case Ci.nsIMsgCompType.EditTemplate:
    case Ci.nsIMsgCompType.NewsPost:
      type = "new";
      break;
    case Ci.nsIMsgCompType.Reply:
    case Ci.nsIMsgCompType.ReplyAll:
    case Ci.nsIMsgCompType.ReplyToSender:
    case Ci.nsIMsgCompType.ReplyToGroup:
    case Ci.nsIMsgCompType.ReplyToSenderAndGroup:
    case Ci.nsIMsgCompType.ReplyWithTemplate:
    case Ci.nsIMsgCompType.ReplyToList:
      type = "reply";
      break;
    case Ci.nsIMsgCompType.ForwardAsAttachment:
    case Ci.nsIMsgCompType.ForwardInline:
      type = "forward";
      break;
    case Ci.nsIMsgCompType.Redirect:
      type = "redirect";
      break;
  }

  let details = {
    from: composeFields.splitRecipients(composeFields.from, false).shift(),
    to: composeFields.splitRecipients(composeFields.to, false),
    cc: composeFields.splitRecipients(composeFields.cc, false),
    bcc: composeFields.splitRecipients(composeFields.bcc, false),
    type,
    replyTo: composeFields.splitRecipients(composeFields.replyTo, false),
    followupTo: composeFields.splitRecipients(composeFields.followupTo, false),
    newsgroups: composeFields.newsgroups
      ? composeFields.newsgroups.split(",")
      : [],
    subject: composeFields.subject,
    isPlainText: !composeWindow.IsHTMLEditor(),
    body: editor.outputToString("text/html", Ci.nsIDocumentEncoder.OutputRaw),
    plainTextBody: editor.outputToString(
      "text/plain",
      Ci.nsIDocumentEncoder.OutputRaw
    ),
  };
  if (extension.hasPermission("accountsRead")) {
    details.identityId = composeWindow.getCurrentIdentityKey();
  }
  return details;
}

async function setFromField(composeWindow, details, extension) {
  if (!details || details.from == null) {
    return;
  }

  let from;
  // Re-throw exceptions from parseComposeRecipientList with a prefix to
  // minimize developers debugging time and make clear where restrictions are
  // coming from.
  try {
    from = await parseComposeRecipientList(details.from, true);
  } catch (e) {
    throw new ExtensionError(`ComposeDetails.from: ${e.message}`);
  }
  if (!from) {
    throw new ExtensionError(
      "ComposeDetails.from: Address must not be set to an empty string."
    );
  }

  let identityList = composeWindow.document.getElementById("msgIdentity");
  // Make the from field editable only, if from differs from the currently shown identity.
  if (from != identityList.value) {
    let activeElement = composeWindow.document.activeElement;
    // Manually update from, using the same approach used in
    // https://hg.mozilla.org/comm-central/file/1283451c02926e2b7506a6450445b81f6d076f89/mail/components/compose/content/MsgComposeCommands.js#l3621
    composeWindow.MakeFromFieldEditable(true);
    identityList.value = from;
    activeElement.focus();
  }
}

async function setComposeDetails(composeWindow, details, extension) {
  await composeWindowIsReady(composeWindow);

  if (details.body && details.plainTextBody) {
    throw new ExtensionError(
      "Only one of body and plainTextBody can be specified."
    );
  }
  // Check for body usage on a plain text composer and throw a helpful error.
  // Otherwise, this will throw a NS_UNEXPECTED_ERROR later.
  if (details.body && !composeWindow.IsHTMLEditor()) {
    throw new ExtensionError(
      "Cannot use body on a plain text compose window. Use plainTextBody instead."
    );
  }
  // For consistency, using plainTextBody on a html compsoser is not allowed.
  if (details.plainTextBody && composeWindow.IsHTMLEditor()) {
    throw new ExtensionError(
      "Cannot use plainTextBody on an HTML compose window. Use body instead."
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
  await setFromField(composeWindow, details, extension);
}

async function fileURLForFile(file) {
  if (file.mozFullPath) {
    let realFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    realFile.initWithPath(file.mozFullPath);
    return Services.io.newFileURI(realFile).spec;
  }

  // TODO PathUtils and IOUtils aren't exposed on the extension global at
  // https://searchfox.org/mozilla-central/rev/6309f663e7396e957138704f7ae7254c92f52f43/toolkit/components/extensions/ExtensionCommon.jsm#1749
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

var composeStates = {
  _states: {
    canSendNow: "cmd_sendNow",
    canSendLater: "cmd_sendLater",
  },

  getStates(tab) {
    let states = {};
    for (let [state, command] of Object.entries(this._states)) {
      state[state] = tab.nativeTab.defaultController.isCommandEnabled(command);
    }
    return states;
  },

  // Translate core states (commands) to API states.
  convert(states) {
    let converted = {};
    for (let [state, command] of Object.entries(this._states)) {
      if (states.hasOwnProperty(command)) {
        converted[state] = states[command];
      }
    }
    return converted;
  },
};

var composeCommands = {
  _commands: {
    sendNow: "cmd_sendNow",
    sendLater: "cmd_sendLater",
    default: "cmd_sendButton",
  },

  // Translate API modes to commands.
  getCommand(mode = "default") {
    return this._commands[mode];
  },

  goDoCommand(tab, command) {
    if (!tab.nativeTab.defaultController.isCommandEnabled(command)) {
      return false;
    }
    tab.nativeTab.goDoCommand(command);
    return true;
  },
};

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
        await getComposeDetails(composeWindow, extension)
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
    await composeWindow.CompleteGenericSendMessage(msgType);
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

  convert(attachment, window) {
    return {
      id: this.getId(attachment, window),
      name: attachment.name,
      size: attachment.size,
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
              for (let attachment of event.detail) {
                attachment = composeAttachmentTracker.convert(
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
              for (let attachment of event.detail) {
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
        onComposeStateChanged: new ExtensionCommon.EventManager({
          context,
          name: "compose.onComposeStateChanged",
          register(fire) {
            function callback(event) {
              fire.async(
                tabManager.convert(event.target.ownerGlobal),
                composeStates.convert(event.detail)
              );
            }

            windowTracker.addListener("compose-state-changed", callback);
            return function() {
              windowTracker.removeListener("compose-state-changed", callback);
            };
          },
        }).api(),
        async beginNew(messageId, details) {
          let type = Ci.nsIMsgCompType.New;
          if (messageId) {
            let msgHdr = messageTracker.getMessage(messageId);
            type =
              msgHdr.flags & Ci.nsMsgMessageFlags.Template
                ? Ci.nsIMsgCompType.Template
                : Ci.nsIMsgCompType.EditAsNew;
          }
          let composeWindow = await openComposeWindow(
            messageId,
            type,
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

        async sendMessage(tabId, options = {}) {
          let command = composeCommands.getCommand(options.mode);
          let tab = getComposeTab(tabId);
          return composeCommands.goDoCommand(tab, command);
        },
        getComposeState(tabId) {
          let tab = getComposeTab(tabId);
          return composeStates.getStates(tab);
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
          if (tab.type != "messageCompose") {
            throw new ExtensionError(`Invalid compose tab: ${tabId}`);
          }
          let bucket = tab.nativeTab.document.getElementById(
            "attachmentBucket"
          );
          let attachments = [];
          for (let item of bucket.itemChildren) {
            attachments.push(
              composeAttachmentTracker.convert(item.attachment, tab.nativeTab)
            );
          }
          return attachments;
        },
        async addAttachment(tabId, data) {
          let tab = tabManager.get(tabId);
          if (tab.type != "messageCompose") {
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
          if (tab.type != "messageCompose") {
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
          if (tab.type != "messageCompose") {
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
