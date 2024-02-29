/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from am-addressing.js */
/* import-globals-from am-copies.js */
/* import-globals-from ../../../../mail/extensions/am-e2e/am-e2e.js */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gIdentity = null; // the identity we are editing (may be null for a new identity)
var gAccount = null; // the account the identity is (or will be) associated with

document.addEventListener("dialogaccept", onOk);

function onLoadIdentityProperties() {
  // extract the account
  gIdentity = window.arguments[0].identity;
  gAccount = window.arguments[0].account;
  const prefBundle = document.getElementById("bundle_prefs");

  if (gIdentity) {
    const listName = gIdentity.identityName;
    document.title = prefBundle.getFormattedString("identityDialogTitleEdit", [
      listName,
    ]);
  } else {
    document.title = prefBundle.getString("identityDialogTitleAdd");
  }

  loadSMTPServerList();

  initIdentityValues(gIdentity);
  initCopiesAndFolder(gIdentity);
  initCompositionAndAddressing(gIdentity);
  initE2EEncryption(gIdentity);

  // E2E needs an email... hide until we have one.
  document.getElementById("identityE2ETab").hidden = !gIdentity?.email;
}

// based on the values of gIdentity, initialize the identity fields we expose to the user
function initIdentityValues(identity) {
  function initSmtpServer(aServerKey) {
    // Select a server in the SMTP server menulist by its key.
    // The value of the identity.smtpServerKey is null when the
    // "use default server" option is used so, if we get that passed in, select
    // the useDefaultItem representing this option by using the value of "".
    document.getElementById("identity.smtpServerKey").value = aServerKey || "";
  }

  if (identity) {
    document.getElementById("identity.fullName").value = identity.fullName;
    document.getElementById("identity.email").value = identity.email;
    document.getElementById("identity.replyTo").value = identity.replyTo;
    document.getElementById("identity.organization").value =
      identity.organization;
    document.getElementById("identity.attachSignature").checked =
      identity.attachSignature;
    document.getElementById("identity.htmlSigText").value =
      identity.htmlSigText;
    document.getElementById("identity.htmlSigFormat").checked =
      identity.htmlSigFormat;

    if (identity.signature) {
      document.getElementById("identity.signature").value =
        identity.signature.path;
    }

    document.getElementById("identity.attachVCard").checked =
      identity.attachVCard;
    document.getElementById("identity.escapedVCard").value =
      identity.escapedVCard || "";

    document.getElementById("identity.catchAll").checked = identity.catchAll;
    document.getElementById("identity.catchAllHint").value =
      identity.catchAllHint;

    initSmtpServer(identity.smtpServerKey);

    // In am-main.xhtml this field has no ID, because it's hidden by other means.
    const catchAllBox = document.getElementById("identityCatchAllBox");
    if (catchAllBox) {
      const servers = MailServices.accounts.getServersForIdentity(identity);
      catchAllBox.hidden = servers.length > 0 && servers[0].type == "nntp";
    }

    // This field does not exist for the default identity shown in the am-main.xhtml pane.
    const idLabel = document.getElementById("identity.label");
    if (idLabel) {
      idLabel.value = identity.label;
    }
  } else {
    // We're adding an identity, use the best default we have.
    initSmtpServer(gAccount.defaultIdentity.smtpServerKey);

    // Hide catchAll until we know what this identitity is associated with.
    document.getElementById("identityCatchAllBox").hidden = true;
  }

  setupSignatureItems();
}

function initCopiesAndFolder(identity) {
  // if we are editing an existing identity, use it...otherwise copy our values from the default identity
  var copiesAndFoldersIdentity = identity ? identity : gAccount.defaultIdentity;

  document.getElementById("identity.fccFolder").value =
    copiesAndFoldersIdentity.fccFolder;
  document.getElementById("identity.draftFolder").value =
    copiesAndFoldersIdentity.draftFolder;
  document.getElementById("identity.archiveFolder").value =
    copiesAndFoldersIdentity.archiveFolder;
  document.getElementById("identity.stationeryFolder").value =
    copiesAndFoldersIdentity.stationeryFolder;

  document.getElementById("identity.fccFolderPickerMode").value =
    copiesAndFoldersIdentity.fccFolderPickerMode
      ? copiesAndFoldersIdentity.fccFolderPickerMode
      : 0;
  document.getElementById("identity.draftsFolderPickerMode").value =
    copiesAndFoldersIdentity.draftsFolderPickerMode
      ? copiesAndFoldersIdentity.draftsFolderPickerMode
      : 0;
  document.getElementById("identity.archivesFolderPickerMode").value =
    copiesAndFoldersIdentity.archivesFolderPickerMode
      ? copiesAndFoldersIdentity.archivesFolderPickerMode
      : 0;
  document.getElementById("identity.tmplFolderPickerMode").value =
    copiesAndFoldersIdentity.tmplFolderPickerMode
      ? copiesAndFoldersIdentity.tmplFolderPickerMode
      : 0;

  document.getElementById("identity.doCc").checked =
    copiesAndFoldersIdentity.doCc;
  document.getElementById("identity.doCcList").value =
    copiesAndFoldersIdentity.doCcList;
  document.getElementById("identity.doBcc").checked =
    copiesAndFoldersIdentity.doBcc;
  document.getElementById("identity.doBccList").value =
    copiesAndFoldersIdentity.doBccList;
  document.getElementById("identity.doFcc").checked =
    copiesAndFoldersIdentity.doFcc;
  document.getElementById("identity.fccReplyFollowsParent").checked =
    copiesAndFoldersIdentity.fccReplyFollowsParent;
  document.getElementById("identity.showSaveMsgDlg").checked =
    copiesAndFoldersIdentity.showSaveMsgDlg;
  document.getElementById("identity.archiveEnabled").checked =
    copiesAndFoldersIdentity.archiveEnabled;

  onInitCopiesAndFolders(); // am-copies.js method
}

function initCompositionAndAddressing(identity) {
  // if we are editing an existing identity, use it...otherwise copy our values from the default identity
  var addressingIdentity = identity ? identity : gAccount.defaultIdentity;

  document.getElementById("identity.directoryServer").value =
    addressingIdentity.directoryServer;
  document.getElementById("identity.overrideGlobal_Pref").value =
    addressingIdentity.overrideGlobalPref;
  const autoCompleteElement = document.getElementById(
    "identity.autocompleteToMyDomain"
  );
  if (autoCompleteElement) {
    // Thunderbird does not have this element.
    autoCompleteElement.checked = addressingIdentity.autocompleteToMyDomain;
  }

  document.getElementById("identity.composeHtml").checked =
    addressingIdentity.composeHtml;
  document.getElementById("identity.autoQuote").checked =
    addressingIdentity.autoQuote;
  document.getElementById("identity.replyOnTop").value =
    addressingIdentity.replyOnTop;
  document.getElementById("identity.sig_bottom").value =
    addressingIdentity.sigBottom;
  document.getElementById("identity.sig_on_reply").checked =
    addressingIdentity.sigOnReply;
  document.getElementById("identity.sig_on_fwd").checked =
    addressingIdentity.sigOnForward;

  onInitCompositionAndAddressing(); // am-addressing.js method
}

function onOk(event) {
  if (!validEmailAddress()) {
    event.preventDefault();
    return;
  }

  // if we are adding a new identity, create an identity, set the fields and add it to the
  // account.
  if (!gIdentity) {
    // ask the account manager to create a new identity for us
    gIdentity = MailServices.accounts.createIdentity();

    // copy in the default identity settings so we inherit lots of stuff like the default drafts folder, etc.
    gIdentity.copy(gAccount.defaultIdentity);

    // assume the identity is valid by default?
    gIdentity.valid = true;

    // add the identity to the account
    gAccount.addIdentity(gIdentity);

    // now fall through to saveFields which will save our new values
  }

  // if we are modifying an existing identity, save the fields
  saveIdentitySettings(gIdentity);
  saveCopiesAndFolderSettings(gIdentity);
  saveAddressingAndCompositionSettings(gIdentity);
  saveE2EEncryptionSettings(gIdentity);

  window.arguments[0].result = true;
}

// returns false and prompts the user if
// the identity does not have an email address
function validEmailAddress() {
  var emailAddress = document.getElementById("identity.email").value;

  // quickly test for an @ sign to test for an email address. We don't have
  // to be anymore precise than that.
  if (!emailAddress.includes("@")) {
    // alert user about an invalid email address

    var prefBundle = document.getElementById("bundle_prefs");

    Services.prompt.alert(
      window,
      prefBundle.getString("identity-edit-req-title"),
      prefBundle.getString("identity-edit-req")
    );
    return false;
  }

  return true;
}

function saveIdentitySettings(identity) {
  if (identity) {
    const idLabel = document.getElementById("identity.label");
    if (idLabel) {
      identity.label = idLabel.value;
    }
    identity.fullName = document.getElementById("identity.fullName").value;
    identity.email = document.getElementById("identity.email").value;
    identity.replyTo = document.getElementById("identity.replyTo").value;
    identity.organization = document.getElementById(
      "identity.organization"
    ).value;
    identity.attachSignature = document.getElementById(
      "identity.attachSignature"
    ).checked;
    identity.htmlSigText = document.getElementById(
      "identity.htmlSigText"
    ).value;
    identity.htmlSigFormat = document.getElementById(
      "identity.htmlSigFormat"
    ).checked;

    identity.attachVCard = document.getElementById(
      "identity.attachVCard"
    ).checked;
    identity.escapedVCard = document.getElementById(
      "identity.escapedVCard"
    ).value;
    identity.catchAll = document.getElementById("identity.catchAll").checked;
    identity.catchAllHint = document.getElementById(
      "identity.catchAllHint"
    ).value;
    identity.smtpServerKey = document.getElementById(
      "identity.smtpServerKey"
    ).value;

    const attachSignaturePath =
      document.getElementById("identity.signature").value;
    identity.signature = null; // this is important so we don't accidentally inherit the default

    if (attachSignaturePath) {
      // convert signature path back into a nsIFile
      var sfile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      sfile.initWithPath(attachSignaturePath);
      if (sfile.exists()) {
        identity.signature = sfile;
      }
    }
  }
}

function saveCopiesAndFolderSettings(identity) {
  onSaveCopiesAndFolders(); // am-copies.js routine

  identity.fccFolder = document.getElementById("identity.fccFolder").value;
  identity.draftFolder = document.getElementById("identity.draftFolder").value;
  identity.archiveFolder = document.getElementById(
    "identity.archiveFolder"
  ).value;
  identity.stationeryFolder = document.getElementById(
    "identity.stationeryFolder"
  ).value;
  identity.fccFolderPickerMode = document.getElementById(
    "identity.fccFolderPickerMode"
  ).value;
  identity.draftsFolderPickerMode = document.getElementById(
    "identity.draftsFolderPickerMode"
  ).value;
  identity.archivesFolderPickerMode = document.getElementById(
    "identity.archivesFolderPickerMode"
  ).value;
  identity.tmplFolderPickerMode = document.getElementById(
    "identity.tmplFolderPickerMode"
  ).value;
  identity.doCc = document.getElementById("identity.doCc").checked;
  identity.doCcList = document.getElementById("identity.doCcList").value;
  identity.doBcc = document.getElementById("identity.doBcc").checked;
  identity.doBccList = document.getElementById("identity.doBccList").value;
  identity.doFcc = document.getElementById("identity.doFcc").checked;
  identity.fccReplyFollowsParent = document.getElementById(
    "identity.fccReplyFollowsParent"
  ).checked;
  identity.showSaveMsgDlg = document.getElementById(
    "identity.showSaveMsgDlg"
  ).checked;
  identity.archiveEnabled = document.getElementById(
    "identity.archiveEnabled"
  ).checked;
}

function saveAddressingAndCompositionSettings(identity) {
  identity.directoryServer = document.getElementById(
    "identity.directoryServer"
  ).value;
  identity.overrideGlobalPref =
    document.getElementById("identity.overrideGlobal_Pref").value == "true";
  const autoCompleteElement = document.getElementById(
    "identity.autocompleteToMyDomain"
  );
  if (autoCompleteElement) {
    // Thunderbird does not have this element.
    identity.autocompleteToMyDomain = autoCompleteElement.checked;
  }
  identity.composeHtml = document.getElementById(
    "identity.composeHtml"
  ).checked;
  identity.autoQuote = document.getElementById("identity.autoQuote").checked;
  identity.replyOnTop = document.getElementById("identity.replyOnTop").value;
  identity.sigBottom =
    document.getElementById("identity.sig_bottom").value == "true";
  identity.sigOnReply = document.getElementById(
    "identity.sig_on_reply"
  ).checked;
  identity.sigOnForward = document.getElementById(
    "identity.sig_on_fwd"
  ).checked;
}

function selectFile() {
  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

  var prefBundle = document.getElementById("bundle_prefs");
  var title = prefBundle.getString("choosefile");
  fp.init(window.browsingContext, title, Ci.nsIFilePicker.modeOpen);
  fp.appendFilters(Ci.nsIFilePicker.filterAll);

  // Get current signature folder, if there is one.
  // We can set that to be the initial folder so that users
  // can maintain their signatures better.
  var sigFolder = GetSigFolder();
  if (sigFolder) {
    fp.displayDirectory = sigFolder;
  }

  fp.open(rv => {
    if (rv != Ci.nsIFilePicker.returnOK || !fp.file) {
      return;
    }
    document.getElementById("identity.signature").value = fp.file.path;
    document
      .getElementById("identity.signature")
      .dispatchEvent(new CustomEvent("change"));
  });
}

/**
 * Adjust the catch-all hint so that is removes stars from the allowed pattern.
 * We only allow to use stars for matching full domains *@example.com,
 * not *foo@example.com.
 *
 * @param {Event} event - the oninput event of the catchAllHint input field.
 */
function handleInputCatchAllHint(event) {
  const value = event.target.value;
  event.target.value = value
    .replace(/(\*[^@]+)/g, "*")
    .replace(/(^|\s)@/g, "$1*@")
    .replace(/\s*[;,]/g, ",")
    .replace(/\s+/g, " ");
}

function GetSigFolder() {
  var sigFolder = null;
  try {
    var account = parent.getCurrentAccount();
    var identity = account.defaultIdentity;
    var signatureFile = identity.signature;

    if (signatureFile) {
      signatureFile = signatureFile.QueryInterface(Ci.nsIFile);
      sigFolder = signatureFile.parent;

      if (!sigFolder.exists()) {
        sigFolder = null;
      }
    }
  } catch (ex) {
    dump("failed to get signature folder..\n");
  }
  return sigFolder;
}

// Signature textbox is active unless option to select from file is checked.
// If a signature is need to be attached, the associated items which
// displays the absolute path to the signature (in a textbox) and the way
// to select a new signature file (a button) are enabled. Otherwise, they
// are disabled. Check to see if the attachSignature is locked to block
// broadcasting events.
function setupSignatureItems() {
  var signature = document.getElementById("identity.signature");
  var browse = document.getElementById("identity.sigbrowsebutton");
  var htmlSigText = document.getElementById("identity.htmlSigText");
  var htmlSigFormat = document.getElementById("identity.htmlSigFormat");
  var attachSignature = document.getElementById("identity.attachSignature");
  var checked = attachSignature.checked;

  if (checked) {
    htmlSigText.setAttribute("disabled", "disabled");
    htmlSigFormat.setAttribute("disabled", "true");
  } else {
    htmlSigText.removeAttribute("disabled");
    htmlSigFormat.removeAttribute("disabled");
  }

  if (checked && !getAccountValueIsLocked(signature)) {
    signature.removeAttribute("disabled");
  } else {
    signature.setAttribute("disabled", "disabled");
  }

  if (checked && !getAccountValueIsLocked(browse)) {
    browse.removeAttribute("disabled");
  } else {
    browse.setAttribute("disabled", "true");
  }
}

function editVCard() {
  // Read vCard hidden value from UI.
  const escapedVCard = document.getElementById("identity.escapedVCard");
  const dialog = top.document.getElementById("editVCardDialog");
  const form = dialog.querySelector("form");
  const vCardEdit = dialog.querySelector("vcard-edit");

  vCardEdit.vCardString = decodeURIComponent(escapedVCard.value);

  top.addEventListener("keydown", editVCardKeyDown, { capture: true });
  form.addEventListener("submit", editVCardSubmit);
  form.addEventListener("reset", editVCardReset);

  top.gSubDialog._topDialog?._overlay.removeAttribute("topmost");
  dialog.showModal();
}

function editVCardKeyDown(event) {
  const dialog = top.document.getElementById("editVCardDialog");
  if (event.keyCode == KeyboardEvent.DOM_VK_ESCAPE && dialog.open) {
    // This is a bit of a hack to prevent other dialogs (particularly
    // SubDialogs) from closing when the vCard dialog is open.
    event.preventDefault();
    editVCardReset();
  }
}

function editVCardSubmit(event) {
  const escapedVCard = document.getElementById("identity.escapedVCard");
  const dialog = top.document.getElementById("editVCardDialog");
  const form = dialog.querySelector("form");
  const vCardEdit = dialog.querySelector("vcard-edit");

  vCardEdit.saveVCard();
  escapedVCard.value = encodeURIComponent(vCardEdit.vCardString);
  // Trigger a change event so for the am-main view the event listener
  // set up in AccountManager.js onLoad() can make sure to save the change.
  escapedVCard.dispatchEvent(new CustomEvent("change"));

  top.gSubDialog._topDialog?._overlay.setAttribute("topmost", "true");
  dialog.close();

  event.preventDefault();
  form.removeEventListener("submit", editVCardSubmit);
  form.removeEventListener("reset", editVCardReset);
}

function editVCardReset() {
  const dialog = top.document.getElementById("editVCardDialog");
  const form = dialog.querySelector("form");

  top.gSubDialog._topDialog?._overlay.setAttribute("topmost", "true");
  dialog.close();

  form.removeEventListener("submit", editVCardSubmit);
  form.removeEventListener("reset", editVCardReset);
}

function getAccountForFolderPickerState() {
  return gAccount;
}

/**
 * Build the SMTP server list for display.
 */
function loadSMTPServerList() {
  var smtpServerList = document.getElementById("identity.smtpServerKey");
  const defaultServer = MailServices.smtp.defaultServer;
  const currentValue = smtpServerList.value;

  var smtpPopup = smtpServerList.menupopup;
  while (smtpPopup.lastChild.nodeName != "menuseparator") {
    smtpPopup.lastChild.remove();
  }

  for (const server of MailServices.smtp.servers) {
    let serverName = "";
    if (server.description) {
      serverName = server.description + " - ";
    } else if (server.username) {
      serverName = server.username + " - ";
    }
    serverName += server.hostname;

    if (defaultServer.key == server.key) {
      serverName +=
        " " +
        document
          .getElementById("bundle_messenger")
          .getString("defaultServerTag");
    }

    smtpServerList.appendItem(serverName, server.key);
  }

  smtpServerList.value = currentValue;
}

/**
 * Open dialog for editing properties of currently selected SMTP server.
 */
function editCurrentSMTP() {
  const smtpKey = document.getElementById("identity.smtpServerKey").value;
  const server =
    smtpKey === ""
      ? MailServices.smtp.defaultServer
      : MailServices.smtp.getServerByKey(smtpKey);
  const args = { server, result: false, addSmtpServer: "" };

  parent.gSubDialog.open(
    "chrome://messenger/content/SmtpServerEdit.xhtml",
    { closingCallback: loadSMTPServerList },
    args
  );
}
