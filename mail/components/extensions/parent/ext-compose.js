/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

XPCOMUtils.defineLazyGlobalGetters(this, ["File", "IOUtils", "PathUtils"]);

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);

var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
let { MsgUtils } = ChromeUtils.import(
  "resource:///modules/MimeMessageUtils.jsm"
);
let parserUtils = Cc["@mozilla.org/parserutils;1"].getService(
  Ci.nsIParserUtils
);

var { convertMessage } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionMessages.sys.mjs"
);
var { convertFolder, folderPathToURI } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionAccounts.sys.mjs"
);

const deliveryFormats = [
  { id: Ci.nsIMsgCompSendFormat.Auto, value: "auto" },
  { id: Ci.nsIMsgCompSendFormat.PlainText, value: "plaintext" },
  { id: Ci.nsIMsgCompSendFormat.HTML, value: "html" },
  { id: Ci.nsIMsgCompSendFormat.Both, value: "both" },
];

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
      let addressObjects =
        MailServices.headerParser.makeFromDisplayAddress(recipient);

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
  let format = Ci.nsIMsgCompFormat.Default;
  let identity = null;

  if (details) {
    if (details.isPlainText != null) {
      format = details.isPlainText
        ? Ci.nsIMsgCompFormat.PlainText
        : Ci.nsIMsgCompFormat.HTML;
    } else {
      // If none or both of details.body and details.plainTextBody are given, the
      // default compose format will be used.
      if (details.body != null && details.plainTextBody == null) {
        format = Ci.nsIMsgCompFormat.HTML;
      }
      if (details.plainTextBody != null && details.body == null) {
        format = Ci.nsIMsgCompFormat.PlainText;
      }
    }

    if (details.identityId != null) {
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

    let composeWindowPromise = new Promise(resolve => {
      function listener(event) {
        let composeWindow = event.target.ownerGlobal;
        // Skip if this window has been processed already. This already helps
        // a lot to assign the opened windows in the correct order to the
        // OpenCompomposeWindow calls.
        if (composeWindowTracker.has(composeWindow)) {
          return;
        }
        // Do a few more checks to make sure we are looking at the expected
        // window. This is still a hack. We need to make OpenCompomposeWindow
        // actually return the opened window.
        let _msgURI = composeWindow.gMsgCompose.originalMsgURI;
        let _type = composeWindow.gComposeType;
        if (_msgURI == msgURI && _type == type) {
          composeWindowTracker.add(composeWindow);
          windowTracker.removeListener("compose-editor-ready", listener);
          resolve(composeWindow);
        }
      }
      windowTracker.addListener("compose-editor-ready", listener);
    });
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
    let composeWindow = await composeWindowPromise;

    if (details) {
      await setComposeDetails(composeWindow, details, extension);
      if (details.attachments != null) {
        let attachmentData = [];
        for (let data of details.attachments) {
          attachmentData.push(await createAttachment(data));
        }
        await AddAttachmentsToWindow(composeWindow, attachmentData);
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

  params.composeFields = composeFields;
  let composeWindow = Services.ww.openWindow(
    null,
    "chrome://messenger/content/messengercompose/messengercompose.xhtml",
    "_blank",
    "all,chrome,dialog=no,status,toolbar",
    params
  );
  await composeWindowIsReady(composeWindow);

  // Not all details can be set with params for all types, so some need an extra
  // call to setComposeDetails here. Since we have to use setComposeDetails for
  // the EditAsNew code path, unify API behavior by always calling it here too.
  if (details) {
    await setComposeDetails(composeWindow, details, extension);
    if (details.attachments != null) {
      let attachmentData = [];
      for (let data of details.attachments) {
        attachmentData.push(await createAttachment(data));
      }
      await AddAttachmentsToWindow(composeWindow, attachmentData);
    }
  }
  composeWindow.gContentChanged = false;
  return composeWindow;
}

/**
 * Converts "\r\n" line breaks to "\n" and removes trailing line breaks.
 *
 * @param {string} content - original content
 * @returns {string} - trimmed content
 */
function trimContent(content) {
  let data = content.replaceAll("\r\n", "\n").split("\n");
  while (data[data.length - 1] == "") {
    data.pop();
  }
  return data.join("\n");
}

/**
 * Get the compose details of the requested compose window.
 *
 * @param {DOMWindow} composeWindow
 * @param {ExtensionData} extension
 * @returns {ComposeDetails}
 *
 * @see mail/components/extensions/schemas/compose.json
 */
async function getComposeDetails(composeWindow, extension) {
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

  let relatedMessageId = null;
  if (composeWindow.gMsgCompose.originalMsgURI) {
    try {
      // This throws for messages opened from file and then being replied to.
      let relatedMsgHdr = composeWindow.gMessenger.msgHdrFromURI(
        composeWindow.gMsgCompose.originalMsgURI
      );
      relatedMessageId = messageTracker.getId(relatedMsgHdr);
    } catch (ex) {
      // We are currently unable to get the fake msgHdr from the uri of messages
      // opened from file.
    }
  }

  let customHeaders = [...composeFields.headerNames]
    .map(h => h.toLowerCase())
    .filter(h => h.startsWith("x-"))
    .map(h => {
      return {
        // All-lower-case-names are ugly, so capitalize first letters.
        name: h.replace(/(^|-)[a-z]/g, function (match) {
          return match.toUpperCase();
        }),
        value: composeFields.getHeader(h),
      };
    });

  // We have two file carbon copy settings: fcc and fcc2. fcc allows to override
  // the default identity fcc and fcc2 is coupled to the UI selection.
  let overrideDefaultFcc = false;
  if (composeFields.fcc && composeFields.fcc != "") {
    overrideDefaultFcc = true;
  }
  let overrideDefaultFccFolder = "";
  if (overrideDefaultFcc && !composeFields.fcc.startsWith("nocopy://")) {
    let folder = MailUtils.getExistingFolder(composeFields.fcc);
    if (folder) {
      overrideDefaultFccFolder = convertFolder(folder);
    }
  }
  let additionalFccFolder = "";
  if (composeFields.fcc2 && !composeFields.fcc2.startsWith("nocopy://")) {
    let folder = MailUtils.getExistingFolder(composeFields.fcc2);
    if (folder) {
      additionalFccFolder = convertFolder(folder);
    }
  }

  let deliveryFormat = composeWindow.IsHTMLEditor()
    ? deliveryFormats.find(f => f.id == composeFields.deliveryFormat).value
    : null;

  let body = trimContent(
    editor.outputToString("text/html", Ci.nsIDocumentEncoder.OutputRaw)
  );
  let plainTextBody;
  if (composeWindow.IsHTMLEditor()) {
    plainTextBody = trimContent(MsgUtils.convertToPlainText(body, true));
  } else {
    plainTextBody = parserUtils.convertToPlainText(
      body,
      Ci.nsIDocumentEncoder.OutputLFLineBreak,
      0
    );
    // Remove the extra new line at the end.
    if (plainTextBody.endsWith("\n")) {
      plainTextBody = plainTextBody.slice(0, -1);
    }
  }

  let details = {
    from: composeFields.splitRecipients(composeFields.from, false).shift(),
    to: composeFields.splitRecipients(composeFields.to, false),
    cc: composeFields.splitRecipients(composeFields.cc, false),
    bcc: composeFields.splitRecipients(composeFields.bcc, false),
    overrideDefaultFcc,
    overrideDefaultFccFolder: overrideDefaultFcc
      ? overrideDefaultFccFolder
      : null,
    additionalFccFolder,
    type,
    relatedMessageId,
    replyTo: composeFields.splitRecipients(composeFields.replyTo, false),
    followupTo: composeFields.splitRecipients(composeFields.followupTo, false),
    newsgroups: composeFields.newsgroups
      ? composeFields.newsgroups.split(",")
      : [],
    subject: composeFields.subject,
    isPlainText: !composeWindow.IsHTMLEditor(),
    deliveryFormat,
    body,
    plainTextBody,
    customHeaders,
    priority: composeFields.priority.toLowerCase() || "normal",
    returnReceipt: composeFields.returnReceipt,
    deliveryStatusNotification: composeFields.DSN,
    attachVCard: composeFields.attachVCard,
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
  } catch (ex) {
    throw new ExtensionError(`ComposeDetails.from: ${ex.message}`);
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

/**
 * Updates the compose details of the specified compose window, overwriting any
 * property given in the details object.
 *
 * @param {DOMWindow} composeWindow
 * @param {ComposeDetails} details - compose details to update the composer with
 * @param {ExtensionData} extension
 *
 * @see mail/components/extensions/schemas/compose.json
 */
async function setComposeDetails(composeWindow, details, extension) {
  let activeElement = composeWindow.document.activeElement;

  // Check if conflicting formats have been specified.
  if (
    details.isPlainText === true &&
    details.body != null &&
    details.plainTextBody == null
  ) {
    throw new ExtensionError(
      "Conflicting format setting: isPlainText =  true and providing a body but no plainTextBody."
    );
  }
  if (
    details.isPlainText === false &&
    details.body == null &&
    details.plainTextBody != null
  ) {
    throw new ExtensionError(
      "Conflicting format setting: isPlainText = false and providing a plainTextBody but no body."
    );
  }

  // Remove any unsupported body type. Otherwise, this will throw an
  // NS_UNEXPECTED_ERROR later. Note: setComposeDetails cannot change the compose
  // format, details.isPlainText is ignored.
  if (composeWindow.IsHTMLEditor()) {
    delete details.plainTextBody;
  } else {
    delete details.body;
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
    let identityElement = composeWindow.document.getElementById("msgIdentity");
    identityElement.selectedItem = [
      ...identityElement.childNodes[0].childNodes,
    ].find(e => e.getAttribute("identitykey") == details.identityId);
    composeWindow.LoadIdentity(false);
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

  // Set file carbon copy values.
  if (details.overrideDefaultFcc === false) {
    composeWindow.gMsgCompose.compFields.fcc = "";
  } else if (details.overrideDefaultFccFolder != null) {
    // Override identity fcc with enforced value.
    if (details.overrideDefaultFccFolder) {
      let uri = folderPathToURI(
        details.overrideDefaultFccFolder.accountId,
        details.overrideDefaultFccFolder.path
      );
      let folder = MailUtils.getExistingFolder(uri);
      if (folder) {
        composeWindow.gMsgCompose.compFields.fcc = uri;
      } else {
        throw new ExtensionError(
          `Invalid MailFolder: {accountId:${details.overrideDefaultFccFolder.accountId}, path:${details.overrideDefaultFccFolder.path}}`
        );
      }
    } else {
      composeWindow.gMsgCompose.compFields.fcc = "nocopy://";
    }
  } else if (
    details.overrideDefaultFcc === true &&
    composeWindow.gMsgCompose.compFields.fcc == ""
  ) {
    throw new ExtensionError(
      `Setting overrideDefaultFcc to true requires setting overrideDefaultFccFolder as well`
    );
  }

  if (details.additionalFccFolder != null) {
    if (details.additionalFccFolder) {
      let uri = folderPathToURI(
        details.additionalFccFolder.accountId,
        details.additionalFccFolder.path
      );
      let folder = MailUtils.getExistingFolder(uri);
      if (folder) {
        composeWindow.gMsgCompose.compFields.fcc2 = uri;
      } else {
        throw new ExtensionError(
          `Invalid MailFolder: {accountId:${details.additionalFccFolder.accountId}, path:${details.additionalFccFolder.path}}`
        );
      }
    } else {
      composeWindow.gMsgCompose.compFields.fcc2 = "";
    }
  }

  // Update custom headers, if specified.
  if (details.customHeaders) {
    let newHeaderNames = details.customHeaders.map(h => h.name.toUpperCase());
    let obsoleteHeaderNames = [
      ...composeWindow.gMsgCompose.compFields.headerNames,
    ]
      .map(h => h.toUpperCase())
      .filter(h => h.startsWith("X-") && !newHeaderNames.hasOwnProperty(h));

    for (let headerName of obsoleteHeaderNames) {
      composeWindow.gMsgCompose.compFields.deleteHeader(headerName);
    }
    for (let { name, value } of details.customHeaders) {
      composeWindow.gMsgCompose.compFields.setHeader(name, value);
    }
  }

  // Update priorities. The enum in the schema defines all allowed values, no
  // need to validate here.
  if (details.priority) {
    if (details.priority == "normal") {
      composeWindow.gMsgCompose.compFields.priority = "";
    } else {
      composeWindow.gMsgCompose.compFields.priority =
        details.priority[0].toUpperCase() + details.priority.slice(1);
    }
    composeWindow.updatePriorityToolbarButton(
      composeWindow.gMsgCompose.compFields.priority
    );
  }

  // Update receipt notifications.
  if (details.returnReceipt != null) {
    composeWindow.ToggleReturnReceipt(details.returnReceipt);
  }

  if (
    details.deliveryStatusNotification != null &&
    details.deliveryStatusNotification !=
      composeWindow.gMsgCompose.compFields.DSN
  ) {
    let target = composeWindow.document.getElementById("dsnMenu");
    composeWindow.ToggleDSN(target);
  }

  if (details.deliveryFormat && composeWindow.IsHTMLEditor()) {
    // Do not throw when a deliveryFormat is set on a plaint text composer, because
    // it is allowed to set ComposeDetails of an html composer onto a plain text
    // composer (and automatically pick the plainText body). The deliveryFormat
    // will be ignored.
    composeWindow.gMsgCompose.compFields.deliveryFormat = deliveryFormats.find(
      f => f.value == details.deliveryFormat
    ).id;
    composeWindow.initSendFormatMenu();
  }

  if (details.attachVCard != null) {
    composeWindow.gMsgCompose.compFields.attachVCard = details.attachVCard;
    composeWindow.gAttachVCardOptionChanged = true;
  }

  activeElement.focus();
}

async function fileURLForFile(file) {
  let realFile = await getRealFileForFile(file);
  return Services.io.newFileURI(realFile).spec;
}

async function createAttachment(data) {
  let attachment = Cc[
    "@mozilla.org/messengercompose/attachment;1"
  ].createInstance(Ci.nsIMsgAttachment);

  if (data.id) {
    if (!composeAttachmentTracker.hasAttachment(data.id)) {
      throw new ExtensionError(`Invalid attachment ID: ${data.id}`);
    }

    let { attachment: originalAttachment, window: originalWindow } =
      composeAttachmentTracker.getAttachment(data.id);

    let originalAttachmentItem =
      originalWindow.gAttachmentBucket.findItemForAttachment(
        originalAttachment
      );

    attachment.name = data.name || originalAttachment.name;
    attachment.size = originalAttachment.size;
    attachment.url = originalAttachment.url;

    return {
      attachment,
      originalAttachment,
      originalCloudFileAccount: originalAttachmentItem.cloudFileAccount,
      originalCloudFileUpload: originalAttachmentItem.cloudFileUpload,
    };
  }

  if (data.file) {
    attachment.name = data.name || data.file.name;
    attachment.size = data.file.size;
    attachment.url = await fileURLForFile(data.file);
    attachment.contentType = data.file.type;
    return { attachment };
  }

  throw new ExtensionError(`Failed to create attachment.`);
}

async function AddAttachmentsToWindow(window, attachmentData) {
  await window.AddAttachments(attachmentData.map(a => a.attachment));
  // Check if an attachment has been cloned and the cloudFileUpload needs to be
  // re-applied.
  for (let entry of attachmentData) {
    let addedAttachmentItem = window.gAttachmentBucket.findItemForAttachment(
      entry.attachment
    );
    if (!addedAttachmentItem) {
      continue;
    }

    if (
      !entry.originalAttachment ||
      !entry.originalCloudFileAccount ||
      !entry.originalCloudFileUpload
    ) {
      continue;
    }

    let updateSettings = {
      cloudFileAccount: entry.originalCloudFileAccount,
      relatedCloudFileUpload: entry.originalCloudFileUpload,
    };
    if (entry.originalAttachment.name != entry.attachment.name) {
      updateSettings.name = entry.attachment.name;
    }

    try {
      await window.UpdateAttachment(addedAttachmentItem, updateSettings);
    } catch (ex) {
      throw new ExtensionError(ex.message);
    }
  }
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

class MsgOperationObserver {
  constructor(composeWindow) {
    this.composeWindow = composeWindow;
    this.savedMessages = [];
    this.headerMessageId = null;
    this.deliveryCallbacks = null;
    this.preparedCallbacks = null;
    this.classifiedMessages = new Map();

    // The preparedPromise fulfills when the message has been prepared and handed
    // over to the send process.
    this.preparedPromise = new Promise((resolve, reject) => {
      this.preparedCallbacks = { resolve, reject };
    });

    // The deliveryPromise fulfills when the message has been saved/send.
    this.deliveryPromise = new Promise((resolve, reject) => {
      this.deliveryCallbacks = { resolve, reject };
    });

    Services.obs.addObserver(this, "mail:composeSendProgressStop");
    this.composeWindow.gMsgCompose.addMsgSendListener(this);
    MailServices.mfn.addListener(this, MailServices.mfn.msgsClassified);
    this.composeWindow.addEventListener(
      "compose-prepare-message-success",
      event => this.preparedCallbacks.resolve(),
      { once: true }
    );
    this.composeWindow.addEventListener(
      "compose-prepare-message-failure",
      event => this.preparedCallbacks.reject(event.detail.exception),
      { once: true }
    );
  }

  // Observer for mail:composeSendProgressStop.
  observe(subject, topic, data) {
    let { composeWindow } = subject.wrappedJSObject;
    if (composeWindow == this.composeWindow) {
      this.deliveryCallbacks.resolve();
    }
  }

  // nsIMsgSendListener
  onStartSending(msgID, msgSize) {}
  onProgress(msgID, progress, progressMax) {}
  onStatus(msgID, msg) {}
  onStopSending(msgID, status, msg, returnFile) {
    if (!Components.isSuccessCode(status)) {
      this.deliveryCallbacks.reject(
        new ExtensionError("Message operation failed")
      );
      return;
    }
    // In case of success, this is only called for sendNow, stating the
    // headerMessageId of the outgoing message.
    // The msgID starts with < and ends with > which is not used by the API.
    this.headerMessageId = msgID.replace(/^<|>$/g, "");
  }
  onGetDraftFolderURI(msgID, folderURI) {
    // Only called for save operations and sendLater. Collect messageIds and
    // folders of saved messages.
    let headerMessageId = msgID.replace(/^<|>$/g, "");
    this.savedMessages.push(JSON.stringify({ headerMessageId, folderURI }));
  }
  onSendNotPerformed(msgID, status) {}
  onTransportSecurityError(msgID, status, secInfo, location) {}

  // Implementation for nsIMsgFolderListener::msgsClassified
  msgsClassified(msgs, junkProcessed, traitProcessed) {
    // Collect all msgHdrs added to folders during the current message operation.
    for (let msgHdr of msgs) {
      let key = JSON.stringify({
        headerMessageId: msgHdr.messageId,
        folderURI: msgHdr.folder.URI,
      });
      if (!this.classifiedMessages.has(key)) {
        this.classifiedMessages.set(key, messageTracker.convertMessage(msgHdr));
      }
    }
  }

  /**
   * @typedef MsgOperationInfo
   * @property {string} headerMessageId - the id used in the "Message-Id" header
   *    of the outgoing message, only available for the "sendNow" mode
   * @property {MessageHeader[]} messages - array of WebExtension MessageHeader
   *   objects, with information about saved messages (depends on fcc config)
   *   @see mail/components/extensions/schemas/compose.json
   */

  /**
   * Returns a Promise, which resolves once the message operation has finished.
   *
   * @returns {Promise<MsgOperationInfo>} - Promise for information about the
   *   performed message operation.
   */
  async waitForOperation() {
    try {
      await Promise.all([this.deliveryPromise, this.preparedPromise]);
      return {
        messages: this.savedMessages
          .map(m => this.classifiedMessages.get(m))
          .filter(Boolean),
        headerMessageId: this.headerMessageId,
      };
    } catch (ex) {
      // In case of error, reject the pending delivery Promise.
      this.deliveryCallbacks.reject();
      throw ex;
    } finally {
      MailServices.mfn.removeListener(this);
      Services.obs.removeObserver(this, "mail:composeSendProgressStop");
      this.composeWindow?.gMsgCompose?.removeMsgSendListener(this);
    }
  }
}

/**
 * @typedef MsgOperationReturnValue
 * @property {string} headerMessageId - the id used in the "Message-Id" header
 *    of the outgoing message, only available for the "sendNow" mode
 * @property {MessageHeader[]} messages - array of WebExtension MessageHeader
 *   objects, with information about saved messages (depends on fcc config)
 *   @see mail/components/extensions/schemas/compose.json
 * @property {string} mode - the mode of the message operation
 *   @see mail/components/extensions/schemas/compose.json
 */

/**
 * Executes the given save/send command. The returned Promise resolves once the
 * message operation has finished.
 *
 * @returns {Promise<MsgOperationReturnValue>} - Promise for information about
 *   the performed message operation, which is passed to the WebExtension.
 */
async function goDoCommand(composeWindow, extension, mode) {
  let commands = new Map([
    ["draft", "cmd_saveAsDraft"],
    ["template", "cmd_saveAsTemplate"],
    ["sendNow", "cmd_sendNow"],
    ["sendLater", "cmd_sendLater"],
  ]);

  if (!commands.has(mode)) {
    throw new ExtensionError(`Unsupported mode: ${mode}`);
  }

  if (!composeWindow.defaultController.isCommandEnabled(commands.get(mode))) {
    throw new ExtensionError(
      `Message compose window not ready for the requested command`
    );
  }

  let sendPromise = new Promise((resolve, reject) => {
    let listener = {
      onSuccess(window, mode, messages, headerMessageId) {
        if (window == composeWindow) {
          afterSaveSendEventTracker.removeListener(listener);
          let info = { mode, messages };
          if (mode == "sendNow") {
            info.headerMessageId = headerMessageId;
          }
          resolve(info);
        }
      },
      onFailure(window, mode, exception) {
        if (window == composeWindow) {
          afterSaveSendEventTracker.removeListener(listener);
          reject(exception);
        }
      },
      modes: [mode],
      extension,
    };
    afterSaveSendEventTracker.addListener(listener);
  });

  // Initiate send.
  switch (mode) {
    case "draft":
      composeWindow.SaveAsDraft();
      break;
    case "template":
      composeWindow.SaveAsTemplate();
      break;
    case "sendNow":
      composeWindow.SendMessage();
      break;
    case "sendLater":
      composeWindow.SendMessageLater();
      break;
  }
  return sendPromise;
}

var afterSaveSendEventTracker = {
  listeners: new Set(),

  addListener(listener) {
    this.listeners.add(listener);
  },
  removeListener(listener) {
    this.listeners.delete(listener);
  },
  async handleSuccess(window, mode, messages, headerMessageId) {
    for (let listener of this.listeners) {
      if (!listener.modes.includes(mode)) {
        continue;
      }
      await listener.onSuccess(
        window,
        mode,
        messages.map(message => {
          // Strip data from MessageHeader if this extension doesn't have
          // the required permission.
          let clone = Object.assign({}, message);
          if (!listener.extension.hasPermission("accountsRead")) {
            delete clone.folders;
          }
          return clone;
        }),
        headerMessageId
      );
    }
  },
  async handleFailure(window, mode, exception) {
    for (let listener of this.listeners) {
      if (!listener.modes.includes(mode)) {
        continue;
      }
      await listener.onFailure(window, mode, exception);
    }
  },

  // Event handler for the "compose-prepare-message-start", which initiates a
  // new message operation (send or save).
  handleEvent(event) {
    let composeWindow = event.target;
    let msgType = event.detail.msgType;

    let modes = new Map([
      [Ci.nsIMsgCompDeliverMode.SaveAsDraft, "draft"],
      [Ci.nsIMsgCompDeliverMode.SaveAsTemplate, "template"],
      [Ci.nsIMsgCompDeliverMode.Now, "sendNow"],
      [Ci.nsIMsgCompDeliverMode.Later, "sendLater"],
    ]);
    let mode = modes.get(msgType);

    if (mode && this.listeners.size > 0) {
      let msgOperationObserver = new MsgOperationObserver(composeWindow);
      msgOperationObserver
        .waitForOperation()
        .then(msgOperationInfo =>
          this.handleSuccess(
            composeWindow,
            mode,
            msgOperationInfo.messages,
            msgOperationInfo.headerMessageId
          )
        )
        .catch(msgOperationException =>
          this.handleFailure(composeWindow, mode, msgOperationException)
        );
    }
  },
};
windowTracker.addListener(
  "compose-prepare-message-start",
  afterSaveSendEventTracker
);

var beforeSendEventTracker = {
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

    let sendPromise = event.detail;
    let composeWindow = event.target;
    await composeWindowIsReady(composeWindow);
    composeWindow.ToggleWindowLock(true);

    // Send process waits till sendPromise.resolve() or sendPromise.reject() is
    // called.

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
        sendPromise.reject();
        return;
      }
      if (result.details) {
        await setComposeDetails(composeWindow, result.details, extension);
      }
    }

    // Load the new details into gMsgCompose.compFields for sending.
    composeWindow.GetComposeDetails();

    composeWindow.ToggleWindowLock(false);
    sendPromise.resolve();
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

  getFile(attachment) {
    if (!attachment) {
      return null;
    }
    let uri = Services.io.newURI(attachment.url).QueryInterface(Ci.nsIFileURL);
    // Enforce the actual filename used in the composer, do not leak internal or
    // temporary filenames.
    return File.createFromNsIFile(uri.file, { name: attachment.name });
  },
};

windowTracker.addCloseListener(
  composeAttachmentTracker.forgetAttachments.bind(composeAttachmentTracker)
);

var composeWindowTracker = new Set();
windowTracker.addCloseListener(window => composeWindowTracker.delete(window));

this.compose = class extends ExtensionAPIPersistent {
  PERSISTENT_EVENTS = {
    // For primed persistent events (deactivated background), the context is only
    // available after fire.wakeup() has fulfilled (ensuring the convert() function
    // has been called).

    onBeforeSend({ context, fire }) {
      const { extension } = this;
      const { tabManager, windowManager } = extension;
      let listener = {
        async handler(window, details) {
          if (fire.wakeup) {
            await fire.wakeup();
          }
          let win = windowManager.wrapWindow(window);
          return fire.async(
            tabManager.convert(win.activeTab.nativeTab),
            details
          );
        },
        extension,
      };

      beforeSendEventTracker.addListener(listener);
      return {
        unregister: () => {
          beforeSendEventTracker.removeListener(listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onAfterSend({ context, fire }) {
      const { extension } = this;
      const { tabManager, windowManager } = extension;
      let listener = {
        async onSuccess(window, mode, messages, headerMessageId) {
          let win = windowManager.wrapWindow(window);
          let tab = tabManager.convert(win.activeTab.nativeTab);
          if (fire.wakeup) {
            await fire.wakeup();
          }
          let sendInfo = { mode, messages };
          if (mode == "sendNow") {
            sendInfo.headerMessageId = headerMessageId;
          }
          return fire.async(tab, sendInfo);
        },
        async onFailure(window, mode, exception) {
          let win = windowManager.wrapWindow(window);
          let tab = tabManager.convert(win.activeTab.nativeTab);
          if (fire.wakeup) {
            await fire.wakeup();
          }
          return fire.async(tab, {
            mode,
            messages: [],
            error: exception.message,
          });
        },
        modes: ["sendNow", "sendLater"],
        extension,
      };
      afterSaveSendEventTracker.addListener(listener);
      return {
        unregister: () => {
          afterSaveSendEventTracker.removeListener(listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onAfterSave({ context, fire }) {
      const { extension } = this;
      const { tabManager, windowManager } = extension;
      let listener = {
        async onSuccess(window, mode, messages, headerMessageId) {
          if (fire.wakeup) {
            await fire.wakeup();
          }
          let win = windowManager.wrapWindow(window);
          let saveInfo = { mode, messages };
          return fire.async(
            tabManager.convert(win.activeTab.nativeTab),
            saveInfo
          );
        },
        async onFailure(window, mode, exception) {
          if (fire.wakeup) {
            await fire.wakeup();
          }
          let win = windowManager.wrapWindow(window);
          return fire.async(tabManager.convert(win.activeTab.nativeTab), {
            mode,
            messages: [],
            error: exception.message,
          });
        },
        modes: ["draft", "template"],
        extension,
      };
      afterSaveSendEventTracker.addListener(listener);
      return {
        unregister: () => {
          afterSaveSendEventTracker.removeListener(listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onAttachmentAdded({ context, fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(event) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        for (let attachment of event.detail) {
          attachment = composeAttachmentTracker.convert(
            attachment,
            event.target.ownerGlobal
          );
          fire.async(tabManager.convert(event.target.ownerGlobal), attachment);
        }
      }
      windowTracker.addListener("attachments-added", listener);
      return {
        unregister: () => {
          windowTracker.removeListener("attachments-added", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onAttachmentRemoved({ context, fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(event) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
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
      windowTracker.addListener("attachments-removed", listener);
      return {
        unregister: () => {
          windowTracker.removeListener("attachments-removed", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onIdentityChanged({ context, fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(event) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(
          tabManager.convert(event.target.ownerGlobal),
          event.target.getCurrentIdentityKey()
        );
      }
      windowTracker.addListener("compose-from-changed", listener);
      return {
        unregister: () => {
          windowTracker.removeListener("compose-from-changed", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onComposeStateChanged({ context, fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(event) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(
          tabManager.convert(event.target.ownerGlobal),
          composeStates.convert(event.detail)
        );
      }
      windowTracker.addListener("compose-state-changed", listener);
      return {
        unregister: () => {
          windowTracker.removeListener("compose-state-changed", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onActiveDictionariesChanged({ context, fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(event) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        let activeDictionaries = event.detail.split(",");
        fire.async(
          tabManager.convert(event.target.ownerGlobal),
          Cc["@mozilla.org/spellchecker/engine;1"]
            .getService(Ci.mozISpellCheckingEngine)
            .getDictionaryList()
            .reduce((list, dict) => {
              list[dict] = activeDictionaries.includes(dict);
              return list;
            }, {})
        );
      }
      windowTracker.addListener("active-dictionaries-changed", listener);
      return {
        unregister: () => {
          windowTracker.removeListener("active-dictionaries-changed", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
  };

  getAPI(context) {
    /**
     * Guard to make sure the API waits until the compose tab has been fully loaded,
     * to cope with tabs.onCreated returning tabs very early.
     *
     * @param {integer} tabId
     * @returns {Tab} a fully loaded messageCompose tab
     */
    async function getComposeTab(tabId) {
      let tab = tabManager.get(tabId);
      if (tab.type != "messageCompose") {
        throw new ExtensionError(`Invalid compose tab: ${tabId}`);
      }
      await composeWindowIsReady(tab.nativeTab);
      return tab;
    }

    let { extension } = context;
    let { tabManager } = extension;

    return {
      compose: {
        onBeforeSend: new EventManager({
          context,
          module: "compose",
          event: "onBeforeSend",
          inputHandling: true,
          extensionApi: this,
        }).api(),
        onAfterSend: new EventManager({
          context,
          module: "compose",
          event: "onAfterSend",
          inputHandling: true,
          extensionApi: this,
        }).api(),
        onAfterSave: new EventManager({
          context,
          module: "compose",
          event: "onAfterSave",
          inputHandling: true,
          extensionApi: this,
        }).api(),
        onAttachmentAdded: new ExtensionCommon.EventManager({
          context,
          module: "compose",
          event: "onAttachmentAdded",
          extensionApi: this,
        }).api(),
        onAttachmentRemoved: new ExtensionCommon.EventManager({
          context,
          module: "compose",
          event: "onAttachmentRemoved",
          extensionApi: this,
        }).api(),
        onIdentityChanged: new ExtensionCommon.EventManager({
          context,
          module: "compose",
          event: "onIdentityChanged",
          extensionApi: this,
        }).api(),
        onComposeStateChanged: new ExtensionCommon.EventManager({
          context,
          module: "compose",
          event: "onComposeStateChanged",
          extensionApi: this,
        }).api(),
        onActiveDictionariesChanged: new ExtensionCommon.EventManager({
          context,
          module: "compose",
          event: "onActiveDictionariesChanged",
          extensionApi: this,
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
        async saveMessage(tabId, options) {
          let tab = await getComposeTab(tabId);
          let saveMode = options?.mode || "draft";

          try {
            return await goDoCommand(
              tab.nativeTab,
              context.extension,
              saveMode
            );
          } catch (ex) {
            throw new ExtensionError(
              `compose.saveMessage failed: ${ex.message}`
            );
          }
        },
        async sendMessage(tabId, options) {
          let tab = await getComposeTab(tabId);
          let sendMode = options?.mode;
          if (!["sendLater", "sendNow"].includes(sendMode)) {
            sendMode = Services.io.offline ? "sendLater" : "sendNow";
          }

          try {
            return await goDoCommand(
              tab.nativeTab,
              context.extension,
              sendMode
            );
          } catch (ex) {
            throw new ExtensionError(
              `compose.sendMessage failed: ${ex.message}`
            );
          }
        },
        async getComposeState(tabId) {
          let tab = await getComposeTab(tabId);
          return composeStates.getStates(tab);
        },
        async getComposeDetails(tabId) {
          let tab = await getComposeTab(tabId);
          return getComposeDetails(tab.nativeTab, extension);
        },
        async setComposeDetails(tabId, details) {
          let tab = await getComposeTab(tabId);
          return setComposeDetails(tab.nativeTab, details, extension);
        },
        async getActiveDictionaries(tabId) {
          let tab = await getComposeTab(tabId);
          let dictionaries = tab.nativeTab.gActiveDictionaries;

          // Return the list of installed dictionaries, setting those who are
          // enabled to true.
          return Cc["@mozilla.org/spellchecker/engine;1"]
            .getService(Ci.mozISpellCheckingEngine)
            .getDictionaryList()
            .reduce((list, dict) => {
              list[dict] = dictionaries.has(dict);
              return list;
            }, {});
        },
        async setActiveDictionaries(tabId, activeDictionaries) {
          let tab = await getComposeTab(tabId);
          let installedDictionaries = Cc["@mozilla.org/spellchecker/engine;1"]
            .getService(Ci.mozISpellCheckingEngine)
            .getDictionaryList();

          for (let dict of activeDictionaries) {
            if (!installedDictionaries.includes(dict)) {
              throw new ExtensionError(`Dictionary not found: ${dict}`);
            }
          }

          await tab.nativeTab.ComposeChangeLanguage(activeDictionaries);
        },
        async listAttachments(tabId) {
          let tab = await getComposeTab(tabId);

          let bucket =
            tab.nativeTab.document.getElementById("attachmentBucket");
          let attachments = [];
          for (let item of bucket.itemChildren) {
            attachments.push(
              composeAttachmentTracker.convert(item.attachment, tab.nativeTab)
            );
          }
          return attachments;
        },
        async getAttachmentFile(attachmentId) {
          if (!composeAttachmentTracker.hasAttachment(attachmentId)) {
            throw new ExtensionError(`Invalid attachment: ${attachmentId}`);
          }
          let { attachment } =
            composeAttachmentTracker.getAttachment(attachmentId);
          return composeAttachmentTracker.getFile(attachment);
        },
        async addAttachment(tabId, data) {
          let tab = await getComposeTab(tabId);
          let attachmentData = await createAttachment(data);
          await AddAttachmentsToWindow(tab.nativeTab, [attachmentData]);
          return composeAttachmentTracker.convert(
            attachmentData.attachment,
            tab.nativeTab
          );
        },
        async updateAttachment(tabId, attachmentId, data) {
          let tab = await getComposeTab(tabId);
          if (!composeAttachmentTracker.hasAttachment(attachmentId)) {
            throw new ExtensionError(`Invalid attachment: ${attachmentId}`);
          }
          let { attachment, window } =
            composeAttachmentTracker.getAttachment(attachmentId);
          if (window != tab.nativeTab) {
            throw new ExtensionError(
              `Attachment ${attachmentId} is not associated with tab ${tabId}`
            );
          }

          let attachmentItem =
            window.gAttachmentBucket.findItemForAttachment(attachment);
          if (!attachmentItem) {
            throw new ExtensionError(`Unexpected invalid attachment item`);
          }

          if (!data.file && !data.name) {
            throw new ExtensionError(
              `Either data.file or data.name property must be specified`
            );
          }

          let realFile = data.file ? await getRealFileForFile(data.file) : null;
          try {
            await window.UpdateAttachment(attachmentItem, {
              file: realFile,
              name: data.name,
              relatedCloudFileUpload: attachmentItem.cloudFileUpload,
            });
          } catch (ex) {
            throw new ExtensionError(ex.message);
          }

          return composeAttachmentTracker.convert(attachmentItem.attachment);
        },
        async removeAttachment(tabId, attachmentId) {
          let tab = await getComposeTab(tabId);
          if (!composeAttachmentTracker.hasAttachment(attachmentId)) {
            throw new ExtensionError(`Invalid attachment: ${attachmentId}`);
          }
          let { attachment, window } =
            composeAttachmentTracker.getAttachment(attachmentId);
          if (window != tab.nativeTab) {
            throw new ExtensionError(
              `Attachment ${attachmentId} is not associated with tab ${tabId}`
            );
          }

          let item = window.gAttachmentBucket.findItemForAttachment(attachment);
          await window.RemoveAttachments([item]);
        },
      },
    };
  }
};
