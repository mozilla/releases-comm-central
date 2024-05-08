/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
var { MsgUtils } = ChromeUtils.importESModule(
  "resource:///modules/MimeMessageUtils.sys.mjs"
);

XPCOMUtils.defineLazyGlobalGetters(this, ["File", "IOUtils", "PathUtils"]);

const parserUtils = Cc["@mozilla.org/parserutils;1"].getService(
  Ci.nsIParserUtils
);

var { getFolder } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionAccounts.sys.mjs"
);

var { CachedMsgHeader, parseEncodedAddrHeader } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionMessages.sys.mjs"
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

  const recipients = [];
  for (const recipient of list) {
    if (typeof recipient == "string") {
      const addressObjects =
        MailServices.headerParser.makeFromDisplayAddress(recipient);

      for (const ao of addressObjects) {
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
      const contactNode = this.addressBookCache.findContactById(recipient.id);

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

      const mailingListNode = this.addressBookCache.findMailingListById(
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
    if (relatedMessageId && extension.messageManager) {
      msgHdr = extension.messageManager.get(relatedMessageId);
      msgURI = msgHdr.folder.getUriForMsg(msgHdr);
    }

    // For the types in this code path, OpenComposeWindow only uses
    // nsIMsgCompFormat.Default or OppositeOfDefault. Check which is needed.
    // See https://hg.mozilla.org/comm-central/file/592fb5c396ebbb75d4acd1f1287a26f56f4164b3/mailnews/compose/src/nsMsgComposeService.cpp#l395
    if (format != Ci.nsIMsgCompFormat.Default) {
      // The mimeConverter used in this code path is not setting any format but
      // defaults to plaintext if no identity and also no default account is set.
      // The "mail.identity.default.compose_html" preference is NOT used.
      const usedIdentity =
        identity || MailServices.accounts.defaultAccount?.defaultIdentity;
      const defaultFormat = usedIdentity?.composeHtml
        ? Ci.nsIMsgCompFormat.HTML
        : Ci.nsIMsgCompFormat.PlainText;
      format =
        format == defaultFormat
          ? Ci.nsIMsgCompFormat.Default
          : Ci.nsIMsgCompFormat.OppositeOfDefault;
    }

    const composeWindowPromise = new Promise(resolve => {
      function listener(event) {
        const composeWindow = event.target.ownerGlobal;
        // Skip if this window has been processed already. This already helps
        // a lot to assign the opened windows in the correct order to the
        // OpenCompomposeWindow calls.
        if (composeWindowTracker.has(composeWindow)) {
          return;
        }
        // Do a few more checks to make sure we are looking at the expected
        // window. This is still a hack. We need to make OpenCompomposeWindow
        // actually return the opened window.
        const _msgURI = composeWindow.gMsgCompose.originalMsgURI;
        const _type = composeWindow.gComposeType;
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
    const composeWindow = await composeWindowPromise;

    if (details) {
      await setComposeDetails(composeWindow, details, extension);
      if (details.attachments != null) {
        const attachmentData = [];
        for (const data of details.attachments) {
          attachmentData.push(await createAttachment(data));
        }
        await AddAttachmentsToWindow(composeWindow, attachmentData);
      }
    }
    composeWindow.gContentChanged = false;
    return composeWindow;
  }

  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  const composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  if (relatedMessageId && extension.messageManager) {
    const msgHdr = extension.messageManager.get(relatedMessageId);
    params.originalMsgURI = msgHdr.folder.getUriForMsg(msgHdr);
  }

  params.type = type;
  params.format = format;
  if (identity) {
    params.identity = identity;
  }

  params.composeFields = composeFields;
  const composeWindow = Services.ww.openWindow(
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
      const attachmentData = [];
      for (const data of details.attachments) {
        attachmentData.push(await createAttachment(data));
      }
      await AddAttachmentsToWindow(composeWindow, attachmentData);
    }
  }
  composeWindow.gContentChanged = false;
  return composeWindow;
}

// List of explicitly allowed header names, which can be manipulated through
// browser.compose.setComposeDetails({customHeaders}). Names must be given in
// lowercase.
const ALLOWED_CUSTOM_HEADER_NAMES = ["msip_labels"];

/**
 * Checks if the provided header name is an allowed custom header and returns it
 * sanitized. It should start with X- (but not with X-Mozilla-) or be one of the
 * explicitly allowed header names.
 *
 * @param {string} headerName - The header name to be checked.
 * @returns {?string} The sanitized header name, or null if the header is invalid.
 */
function sanitizeCustomHeaderName(headerName) {
  const sanitized = headerName.toLowerCase().trim();
  if (
    (sanitized.startsWith("x-") && !sanitized.startsWith("x-mozilla-")) ||
    ALLOWED_CUSTOM_HEADER_NAMES.includes(sanitized)
  ) {
    return sanitized;
  }
  return null;
}

/**
 * Sanitizes the provided header value.
 *
 * @param {string} headerValue - The header value to be sanitized
 * @returns {string} The sanitized header value.
 */
function sanitizeCustomHeaderValue(headerValue) {
  return headerValue.trim();
}

/**
 * Converts "\r\n" line breaks to "\n" and removes trailing line breaks.
 *
 * @param {string} content - original content
 * @returns {string} - trimmed content
 */
function trimContent(content) {
  const data = content.replaceAll("\r\n", "\n").split("\n");
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
  const composeFields = composeWindow.GetComposeDetails();
  const editor = composeWindow.GetCurrentEditor();

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
  if (composeWindow.gMsgCompose.originalMsgURI && extension.messageManager) {
    try {
      // This throws for messages opened from file and then being replied to.
      const relatedMsgHdr = composeWindow.gMessenger.msgHdrFromURI(
        composeWindow.gMsgCompose.originalMsgURI
      );
      const relatedMessage = extension.messageManager.convert(relatedMsgHdr);
      if (relatedMessage) {
        relatedMessageId = relatedMessage.id;
      }
    } catch (ex) {
      // We are currently unable to get the fake msgHdr from the uri of messages
      // opened from file.
    }
  }

  const customHeaders = [...composeFields.headerNames].flatMap(h => {
    const sanitizedName = sanitizeCustomHeaderName(h);
    if (!sanitizedName) {
      return [];
    }
    return [
      {
        // All-lower-case-names are ugly, so capitalize first letters.
        name: sanitizedName.replace(/(^|-|_)[a-z]/g, function (match) {
          return match.toUpperCase();
        }),
        value: sanitizeCustomHeaderValue(composeFields.getHeader(h)),
      },
    ];
  });

  // We have two file carbon copy settings: fcc and fcc2. fcc allows to override
  // the default identity fcc and fcc2 is coupled to the UI selection.
  let overrideDefaultFcc = false;
  if (composeFields.fcc && composeFields.fcc != "") {
    overrideDefaultFcc = true;
  }
  let overrideDefaultFccFolder = "";
  if (overrideDefaultFcc && !composeFields.fcc.startsWith("nocopy://")) {
    const folder = MailUtils.getExistingFolder(composeFields.fcc);
    if (folder) {
      overrideDefaultFccFolder = extension.folderManager.convert(folder);
    }
  }
  let additionalFccFolder = "";
  if (composeFields.fcc2 && !composeFields.fcc2.startsWith("nocopy://")) {
    const folder = MailUtils.getExistingFolder(composeFields.fcc2);
    if (folder) {
      additionalFccFolder = extension.folderManager.convert(folder);
    }
  }

  const body = trimContent(
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

  const details = {
    from: parseEncodedAddrHeader(composeFields.from, false).shift(),
    to: parseEncodedAddrHeader(composeFields.to, false),
    cc: parseEncodedAddrHeader(composeFields.cc, false),
    bcc: parseEncodedAddrHeader(composeFields.bcc, false),
    type,
    replyTo: parseEncodedAddrHeader(composeFields.replyTo, false),
    followupTo: parseEncodedAddrHeader(composeFields.followupTo, false),
    newsgroups: composeFields.newsgroups
      ? composeFields.newsgroups.split(",")
      : [],
    subject: composeFields.subject,
    isPlainText: !composeWindow.IsHTMLEditor(),
    body,
    plainTextBody,
    customHeaders,
    priority: composeFields.priority.toLowerCase() || "normal",
    returnReceipt: composeFields.returnReceipt,
    deliveryStatusNotification: composeFields.DSN,
    attachVCard: composeFields.attachVCard,
    isModified:
      composeWindow.gContentChanged ||
      composeWindow.gMsgCompose.bodyModified ||
      composeWindow.gReceiptOptionChanged ||
      composeWindow.gDSNOptionChanged,
  };

  const deliveryFormat = composeWindow.IsHTMLEditor()
    ? deliveryFormats.find(f => f.id == composeFields.deliveryFormat).value
    : null;
  if (deliveryFormat) {
    details.deliveryFormat = deliveryFormat;
  }

  if (relatedMessageId) {
    details.relatedMessageId = relatedMessageId;
  }

  // overrideDefaultFcc is no longer needed in MV3.
  if (extension.manifest.manifest_version < 3) {
    details.additionalFccFolder = additionalFccFolder;
    details.overrideDefaultFcc = overrideDefaultFcc;
    if (overrideDefaultFcc) {
      details.overrideDefaultFccFolder = overrideDefaultFccFolder;
    }
  } else {
    if (additionalFccFolder?.id) {
      details.additionalFccFolderId = additionalFccFolder.id;
    }
    if (overrideDefaultFcc) {
      // Either a valid folder or disabled.
      details.overrideDefaultFccFolderId = overrideDefaultFccFolder.id || "";
    }
  }

  if (extension.hasPermission("accountsRead")) {
    details.identityId = composeWindow.getCurrentIdentityKey();
  }
  return details;
}

async function setFromField(composeWindow, details) {
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

  const identityList = composeWindow.document.getElementById("msgIdentity");
  // Make the from field editable only, if from differs from the currently shown identity.
  if (from != identityList.value) {
    const activeElement = composeWindow.document.activeElement;
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
  const activeElement = composeWindow.document.activeElement;
  const composeFields = composeWindow.gMsgCompose.compFields;

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

    const identity = MailServices.accounts.allIdentities.find(
      i => i.key == details.identityId
    );
    if (!identity) {
      throw new ExtensionError(`Identity not found: ${details.identityId}`);
    }
    const identityElement =
      composeWindow.document.getElementById("msgIdentity");
    identityElement.selectedItem = [
      ...identityElement.childNodes[0].childNodes,
    ].find(e => e.getAttribute("identitykey") === details.identityId);
    composeWindow.LoadIdentity(false);
  }
  for (const field of ["to", "cc", "bcc", "replyTo", "followupTo"]) {
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
  if (extension.manifest.manifest_version < 3) {
    if (details.overrideDefaultFcc === false) {
      composeFields.fcc = "";
    } else if (details.overrideDefaultFccFolder != null) {
      // Override identity fcc with enforced value.
      if (details.overrideDefaultFccFolder) {
        const { folder } = getFolder(details.overrideDefaultFccFolder);
        composeFields.fcc = folder.URI;
      } else {
        composeFields.fcc = "nocopy://";
      }
    } else if (details.overrideDefaultFcc === true && composeFields.fcc == "") {
      throw new ExtensionError(
        `Setting overrideDefaultFcc to true requires setting overrideDefaultFccFolder as well`
      );
    }

    if (details.additionalFccFolder != null) {
      if (details.additionalFccFolder) {
        const { folder } = getFolder(details.additionalFccFolder);
        composeFields.fcc2 = folder.URI;
      } else {
        composeFields.fcc2 = "";
      }
    }
  } else {
    // We need === here to differentiate between null and undefined.
    if (details.overrideDefaultFccFolderId === null) {
      composeFields.fcc = "";
    } else if (details.overrideDefaultFccFolderId == "") {
      composeFields.fcc = "nocopy://";
    } else if (details.overrideDefaultFccFolderId) {
      // Override identity fcc with enforced value.
      const { folder } = getFolder(details.overrideDefaultFccFolderId);
      composeFields.fcc = folder.URI;
    }

    if (
      details.additionalFccFolderId === null ||
      details.additionalFccFolderId == ""
    ) {
      composeFields.fcc2 = "";
    } else if (details.additionalFccFolderId) {
      const { folder } = getFolder(details.additionalFccFolderId);
      composeFields.fcc2 = folder.URI;
    }
  }

  // Update custom headers, if specified.
  if (details.customHeaders) {
    const customHeaders = new Map(
      details.customHeaders.map(h => {
        const sanitizedName = sanitizeCustomHeaderName(h.name);
        if (!sanitizedName) {
          throw new ExtensionError(
            `Invalid custom header: ${
              h.name
            }. Name must be prefixed by "X-" (but not by "X-Mozilla-") or be one of the explicitly allowed headers (${ALLOWED_CUSTOM_HEADER_NAMES.join(
              ", "
            )})`
          );
        }
        return [sanitizedName, sanitizeCustomHeaderValue(h.value)];
      })
    );

    const obsoleteHeaderNames = new Set(
      [...composeFields.headerNames].flatMap(h => {
        const sanitizedName = sanitizeCustomHeaderName(h);
        return !sanitizedName || customHeaders.has(sanitizedName)
          ? []
          : [sanitizedName];
      })
    );

    for (const headerName of obsoleteHeaderNames) {
      composeFields.deleteHeader(headerName);
    }

    for (const [headerName, headerValue] of customHeaders) {
      composeFields.setHeader(headerName, headerValue);
    }

    // If we added or removed custom headers, which are also displayed in the UI,
    // update these fields as well. Such headers are defined in in the pref
    // "mail.compose.other.header".
    for (const row of composeWindow.document.querySelectorAll(
      ".address-row-raw"
    )) {
      const recipientType = row.dataset.recipienttype.trim().toLowerCase();
      if (customHeaders.has(recipientType)) {
        row.classList.remove("hidden");
        row.querySelector(".address-row-input").value =
          customHeaders.get(recipientType);
      }
      if (obsoleteHeaderNames.has(recipientType)) {
        row.querySelector(".address-row-input").value = "";
      }
    }
  }

  // Update priorities. The enum in the schema defines all allowed values, no
  // need to validate here.
  if (details.priority) {
    if (details.priority == "normal") {
      composeFields.priority = "";
    } else {
      composeFields.priority =
        details.priority[0].toUpperCase() + details.priority.slice(1);
    }
    composeWindow.updatePriorityToolbarButton(composeFields.priority);
  }

  // Update receipt notifications.
  if (details.returnReceipt != null) {
    composeWindow.ToggleReturnReceipt(details.returnReceipt);
  }

  if (
    details.deliveryStatusNotification != null &&
    details.deliveryStatusNotification != composeFields.DSN
  ) {
    const target = composeWindow.document.getElementById("dsnMenu");
    composeWindow.ToggleDSN(target);
  }

  if (details.deliveryFormat && composeWindow.IsHTMLEditor()) {
    // Do not throw when a deliveryFormat is set on a plaint text composer, because
    // it is allowed to set ComposeDetails of an html composer onto a plain text
    // composer (and automatically pick the plainText body). The deliveryFormat
    // will be ignored.
    composeFields.deliveryFormat = deliveryFormats.find(
      f => f.value == details.deliveryFormat
    ).id;
    composeWindow.initSendFormatMenu();
  }

  if (details.attachVCard != null) {
    composeFields.attachVCard = details.attachVCard;
    composeWindow.gAttachVCardOptionChanged = true;
  }

  if (details.isModified != null) {
    const modified =
      composeWindow.gContentChanged ||
      composeWindow.gMsgCompose.bodyModified ||
      composeWindow.gReceiptOptionChanged ||
      composeWindow.gDSNOptionChanged;

    if (details.isModified === true && !modified) {
      // To trigger the close confirmation dialog, it is enough to set
      // gContentChanged to true.
      composeWindow.gContentChanged = true;
    } else if (details.isModified === false && modified) {
      // In order to prevent the close confirmation dialog, we need to make sure
      // all potential triggers are set to false.
      composeWindow.gContentChanged = false;
      composeWindow.gMsgCompose.bodyModified = false;
      composeWindow.gReceiptOptionChanged = false;
      composeWindow.gDSNOptionChanged = false;
    }
  }

  activeElement.focus();
}

async function fileURLForFile(file) {
  const realFile = await getRealFileForFile(file);
  return Services.io.newFileURI(realFile).spec;
}

async function createAttachment(data) {
  const attachment = Cc[
    "@mozilla.org/messengercompose/attachment;1"
  ].createInstance(Ci.nsIMsgAttachment);

  if (data.id) {
    if (!composeAttachmentTracker.hasAttachment(data.id)) {
      throw new ExtensionError(`Invalid attachment ID: ${data.id}`);
    }

    const { attachment: originalAttachment, window: originalWindow } =
      composeAttachmentTracker.getAttachment(data.id);

    const originalAttachmentItem =
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
  for (const entry of attachmentData) {
    const addedAttachmentItem = window.gAttachmentBucket.findItemForAttachment(
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

    const updateSettings = {
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
    const states = {};
    for (const [state, command] of Object.entries(this._states)) {
      state[state] = tab.nativeTab.defaultController.isCommandEnabled(command);
    }
    return states;
  },

  // Translate core states (commands) to API states.
  convert(states) {
    const converted = {};
    for (const [state, command] of Object.entries(this._states)) {
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
      () => this.preparedCallbacks.resolve(),
      { once: true }
    );
    this.composeWindow.addEventListener(
      "compose-prepare-message-failure",
      event => this.preparedCallbacks.reject(event.detail.exception),
      { once: true }
    );
  }

  // Observer for mail:composeSendProgressStop.
  observe(subject) {
    const { composeWindow } = subject.wrappedJSObject;
    if (composeWindow == this.composeWindow) {
      this.deliveryCallbacks.resolve();
    }
  }

  // nsIMsgSendListener
  onStartSending() {}
  onProgress() {}
  onStatus() {}
  onStopSending(msgID, status) {
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
    const headerMessageId = msgID.replace(/^<|>$/g, "");
    this.savedMessages.push(JSON.stringify({ headerMessageId, folderURI }));
  }
  onSendNotPerformed() {}
  onTransportSecurityError() {}

  // Implementation for nsIMsgFolderListener::msgsClassified
  msgsClassified(msgs) {
    // Collect all msgHdrs added to folders during the current message operation.
    for (const msgHdr of msgs) {
      const cachedMsgHdr = new CachedMsgHeader(msgHdr);
      const key = JSON.stringify({
        headerMessageId: cachedMsgHdr.messageId,
        folderURI: cachedMsgHdr.folder.URI,
      });
      if (!this.classifiedMessages.has(key)) {
        this.classifiedMessages.set(key, cachedMsgHdr);
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
  const commands = new Map([
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

  const sendPromise = new Promise((resolve, reject) => {
    const listener = {
      onSuccess(window, mode, messages, headerMessageId) {
        if (window == composeWindow) {
          afterSaveSendEventTracker.removeListener(listener);
          const info = { mode, messages };
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
    for (const listener of this.listeners) {
      if (!listener.modes.includes(mode)) {
        continue;
      }

      let convertedMessages;
      if (listener.extension.messageManager) {
        convertedMessages = messages.flatMap(cachedMsgHdr => {
          const msg = listener.extension.messageManager.convert(cachedMsgHdr);
          return msg ? [msg] : [];
        });
      }

      await listener.onSuccess(
        window,
        mode,
        convertedMessages,
        headerMessageId
      );
    }
  },
  async handleFailure(window, mode, exception) {
    for (const listener of this.listeners) {
      if (!listener.modes.includes(mode)) {
        continue;
      }
      await listener.onFailure(window, mode, exception);
    }
  },

  // Event handler for the "compose-prepare-message-start", which initiates a
  // new message operation (send or save).
  handleEvent(event) {
    const composeWindow = event.target;
    const msgType = event.detail.msgType;

    const modes = new Map([
      [Ci.nsIMsgCompDeliverMode.SaveAsDraft, "draft"],
      [Ci.nsIMsgCompDeliverMode.AutoSaveAsDraft, "autoSave"],
      [Ci.nsIMsgCompDeliverMode.SaveAsTemplate, "template"],
      [Ci.nsIMsgCompDeliverMode.Now, "sendNow"],
      [Ci.nsIMsgCompDeliverMode.Later, "sendLater"],
    ]);
    const mode = modes.get(msgType);

    if (mode && this.listeners.size > 0) {
      const msgOperationObserver = new MsgOperationObserver(composeWindow);
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

    const sendPromise = event.detail;
    const composeWindow = event.target;
    await composeWindowIsReady(composeWindow);
    composeWindow.ToggleWindowLock(true);

    // Send process waits till sendPromise.resolve() or sendPromise.reject() is
    // called.

    for (const { handler, extension } of this.listeners) {
      const result = await handler(
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
    const id = this._nextId++;
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
    const id = this._attachmentIds.get(attachment)?.id;
    if (id) {
      this._attachmentIds.delete(attachment);
      this._attachments.delete(id);
    }
  },

  forgetAttachments(window) {
    if (window.location.href == COMPOSE_WINDOW_URI) {
      const bucket = window.document.getElementById("attachmentBucket");
      for (const item of bucket.itemChildren) {
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
    const uri = Services.io
      .newURI(attachment.url)
      .QueryInterface(Ci.nsIFileURL);
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

    onBeforeSend({ fire }) {
      const { extension } = this;
      const { tabManager, windowManager } = extension;
      const listener = {
        async handler(window, details) {
          if (fire.wakeup) {
            await fire.wakeup();
          }
          const win = windowManager.wrapWindow(window);
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
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onAfterSend({ fire }) {
      const { extension } = this;
      const { tabManager, windowManager } = extension;
      const listener = {
        async onSuccess(window, mode, messages, headerMessageId) {
          const win = windowManager.wrapWindow(window);
          const tab = tabManager.convert(win.activeTab.nativeTab);
          if (fire.wakeup) {
            await fire.wakeup();
          }
          const sendInfo = { mode, messages };
          if (mode == "sendNow") {
            sendInfo.headerMessageId = headerMessageId;
          }
          return fire.async(tab, sendInfo);
        },
        async onFailure(window, mode, exception) {
          const win = windowManager.wrapWindow(window);
          const tab = tabManager.convert(win.activeTab.nativeTab);
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
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onAfterSave({ fire }) {
      const { extension } = this;
      const { tabManager, windowManager } = extension;
      const listener = {
        async onSuccess(window, mode, messages) {
          if (fire.wakeup) {
            await fire.wakeup();
          }
          const win = windowManager.wrapWindow(window);
          const saveInfo = { mode, messages };
          return fire.async(
            tabManager.convert(win.activeTab.nativeTab),
            saveInfo
          );
        },
        async onFailure(window, mode, exception) {
          if (fire.wakeup) {
            await fire.wakeup();
          }
          const win = windowManager.wrapWindow(window);
          return fire.async(tabManager.convert(win.activeTab.nativeTab), {
            mode,
            messages: [],
            error: exception.message,
          });
        },
        modes: ["autoSave", "draft", "template"],
        extension,
      };
      afterSaveSendEventTracker.addListener(listener);
      return {
        unregister: () => {
          afterSaveSendEventTracker.removeListener(listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onAttachmentAdded({ fire }) {
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
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onAttachmentRemoved({ fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(event) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        for (const attachment of event.detail) {
          const attachmentId = composeAttachmentTracker.getId(
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
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onIdentityChanged({ fire }) {
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
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onComposeStateChanged({ fire }) {
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
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onActiveDictionariesChanged({ fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(event) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        const activeDictionaries = event.detail.split(",");
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
        convert(newFire) {
          fire = newFire;
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
      const tab = tabManager.get(tabId);
      if (tab.type != "messageCompose") {
        throw new ExtensionError(`Invalid compose tab: ${tabId}`);
      }
      await composeWindowIsReady(tab.nativeTab);
      return tab;
    }

    const { extension } = context;
    const { tabManager } = extension;

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
          if (messageId && context.extension.messageManager) {
            const msgHdr = context.extension.messageManager.get(messageId);
            type =
              msgHdr.flags & Ci.nsMsgMessageFlags.Template
                ? Ci.nsIMsgCompType.Template
                : Ci.nsIMsgCompType.EditAsNew;
          }
          const composeWindow = await openComposeWindow(
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
          const composeWindow = await openComposeWindow(
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
          const composeWindow = await openComposeWindow(
            messageId,
            type,
            details,
            extension
          );
          return tabManager.convert(composeWindow);
        },
        async saveMessage(tabId, options) {
          const tab = await getComposeTab(tabId);
          const saveMode = options?.mode || "draft";

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
          const tab = await getComposeTab(tabId);
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
          const tab = await getComposeTab(tabId);
          return composeStates.getStates(tab);
        },
        async getComposeDetails(tabId) {
          const tab = await getComposeTab(tabId);
          return getComposeDetails(tab.nativeTab, extension);
        },
        async setComposeDetails(tabId, details) {
          const tab = await getComposeTab(tabId);
          return setComposeDetails(tab.nativeTab, details, extension);
        },
        async getActiveDictionaries(tabId) {
          const tab = await getComposeTab(tabId);
          const dictionaries = tab.nativeTab.gActiveDictionaries;

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
          const tab = await getComposeTab(tabId);
          const installedDictionaries = Cc["@mozilla.org/spellchecker/engine;1"]
            .getService(Ci.mozISpellCheckingEngine)
            .getDictionaryList();

          for (const dict of activeDictionaries) {
            if (!installedDictionaries.includes(dict)) {
              throw new ExtensionError(`Dictionary not found: ${dict}`);
            }
          }

          await tab.nativeTab.ComposeChangeLanguage(activeDictionaries);
        },
        async listAttachments(tabId) {
          const tab = await getComposeTab(tabId);

          const bucket =
            tab.nativeTab.document.getElementById("attachmentBucket");
          const attachments = [];
          for (const item of bucket.itemChildren) {
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
          const { attachment } =
            composeAttachmentTracker.getAttachment(attachmentId);
          return composeAttachmentTracker.getFile(attachment);
        },
        async addAttachment(tabId, data) {
          const tab = await getComposeTab(tabId);
          const attachmentData = await createAttachment(data);
          await AddAttachmentsToWindow(tab.nativeTab, [attachmentData]);
          return composeAttachmentTracker.convert(
            attachmentData.attachment,
            tab.nativeTab
          );
        },
        async updateAttachment(tabId, attachmentId, data) {
          const tab = await getComposeTab(tabId);
          if (!composeAttachmentTracker.hasAttachment(attachmentId)) {
            throw new ExtensionError(`Invalid attachment: ${attachmentId}`);
          }
          const { attachment, window } =
            composeAttachmentTracker.getAttachment(attachmentId);
          if (window != tab.nativeTab) {
            throw new ExtensionError(
              `Attachment ${attachmentId} is not associated with tab ${tabId}`
            );
          }

          const attachmentItem =
            window.gAttachmentBucket.findItemForAttachment(attachment);
          if (!attachmentItem) {
            throw new ExtensionError(`Unexpected invalid attachment item`);
          }

          if (!data.file && !data.name) {
            throw new ExtensionError(
              `Either data.file or data.name property must be specified`
            );
          }

          const realFile = data.file
            ? await getRealFileForFile(data.file)
            : null;
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
          const tab = await getComposeTab(tabId);
          if (!composeAttachmentTracker.hasAttachment(attachmentId)) {
            throw new ExtensionError(`Invalid attachment: ${attachmentId}`);
          }
          const { attachment, window } =
            composeAttachmentTracker.getAttachment(attachmentId);
          if (window != tab.nativeTab) {
            throw new ExtensionError(
              `Attachment ${attachmentId} is not associated with tab ${tabId}`
            );
          }

          const item =
            window.gAttachmentBucket.findItemForAttachment(attachment);
          await window.RemoveAttachments([item]);
        },
      },
    };
  }
};
