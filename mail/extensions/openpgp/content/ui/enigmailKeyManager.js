/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

/* global GetEnigmailSvc, EnigRevokeKey */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var { EnigmailCore } = ChromeUtils.import(
  "chrome://openpgp/content/modules/core.jsm"
);
var { EnigmailStreams } = ChromeUtils.import(
  "chrome://openpgp/content/modules/streams.jsm"
);
var { EnigmailClipboard } = ChromeUtils.import(
  "chrome://openpgp/content/modules/clipboard.jsm"
);
var { EnigmailFuncs } = ChromeUtils.import(
  "chrome://openpgp/content/modules/funcs.jsm"
);
var { EnigmailStdlib } = ChromeUtils.import(
  "chrome://openpgp/content/modules/stdlib.jsm"
);
var { EnigmailWindows } = ChromeUtils.import(
  "chrome://openpgp/content/modules/windows.jsm"
);
var { EnigmailKeyServer } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyserver.jsm"
);
var { EnigmailWks } = ChromeUtils.import(
  "chrome://openpgp/content/modules/webKey.jsm"
);
var { EnigmailCryptoAPI } = ChromeUtils.import(
  "chrome://openpgp/content/modules/cryptoAPI.jsm"
);
var { KeyLookupHelper } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyLookupHelper.jsm"
);
var { EnigmailTrust } = ChromeUtils.import(
  "chrome://openpgp/content/modules/trust.jsm"
);
var { EnigmailFiles } = ChromeUtils.import(
  "chrome://openpgp/content/modules/files.jsm"
);
var { PgpSqliteDb2 } = ChromeUtils.import(
  "chrome://openpgp/content/modules/sqliteDb.jsm"
);
var { EnigmailLog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/log.jsm"
);
var { EnigmailKeyRing } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
);
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);
var { EnigmailConstants } = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
);
var { EnigmailDialog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
);

const ENIG_KEY_EXPIRED = "e";
const ENIG_KEY_REVOKED = "r";
const ENIG_KEY_INVALID = "i";
const ENIG_KEY_DISABLED = "d";
const ENIG_KEY_NOT_VALID =
  ENIG_KEY_EXPIRED + ENIG_KEY_REVOKED + ENIG_KEY_INVALID + ENIG_KEY_DISABLED;

var l10n = new Localization(["messenger/openpgp/openpgp.ftl"], true);

const INPUT = 0;
const RESULT = 1;

var gUserList;
var gKeyList;
var gEnigLastSelectedKeys = null;
var gKeySortList = null;
var gSearchInput = null;
var gTreeChildren = null;
var gShowInvalidKeys = null;
var gShowOthersKeys = null;
var gTimeoutId = null;

function enigmailKeyManagerLoad() {
  EnigmailLog.DEBUG("enigmailKeyManager.js: enigmailKeyManagerLoad\n");

  // Close the key manager if GnuPG is not available
  if (!EnigmailCore.getService(window)) {
    window.close();
    return;
  }

  gUserList = document.getElementById("pgpKeyList");
  gSearchInput = document.getElementById("filterKey");
  gShowInvalidKeys = document.getElementById("showInvalidKeys");
  gShowOthersKeys = document.getElementById("showOthersKeys");

  window.addEventListener("reload-keycache", reloadKeys);
  gSearchInput.addEventListener("keydown", event => {
    switch (event.key) {
      case "Escape":
        event.target.value = "";
      // fall through
      case "Enter":
        if (gTimeoutId) {
          clearTimeout(gTimeoutId);
          gTimeoutId = null;
        }
        gKeyListView.applyFilter(0);
        event.preventDefault();
        break;
      default:
        gTimeoutId = setTimeout(() => {
          gKeyListView.applyFilter(0);
        }, 200);
        break;
    }
  });

  gUserList.addEventListener("click", onListClick, true);
  document.l10n.setAttributes(
    document.getElementById("statusText"),
    "key-man-loading-keys"
  );
  document.getElementById("progressBar").style.visibility = "visible";
  setTimeout(loadkeyList, 100);

  gUserList.view = gKeyListView;
  gSearchInput.focus();

  // Dialog event listeners.
  document.addEventListener("dialogaccept", onDialogAccept);
  document.addEventListener("dialogcancel", onDialogClose);
}

function onDialogAccept() {
  if (window.arguments[0].okCallback) {
    window.arguments[0].okCallback();
  }
  window.close();
}

function onDialogClose() {
  if (window.arguments[0].cancelCallback) {
    window.arguments[0].cancelCallback();
  }
  window.close();
}

function loadkeyList() {
  EnigmailLog.DEBUG("enigmailKeyManager.js: loadkeyList\n");

  sortTree();
  gKeyListView.applyFilter(0);
  document.getElementById("pleaseWait").hidePopup();
  document.getElementById("statusText").value = " ";
  document.getElementById("progressBar").style.visibility = "collapse";
}

function clearKeyCache() {
  EnigmailKeyRing.clearCache();
  refreshKeys();
}

function refreshKeys() {
  EnigmailLog.DEBUG("enigmailKeyManager.js: refreshKeys\n");
  var keyList = getSelectedKeys();
  gEnigLastSelectedKeys = [];
  for (var i = 0; i < keyList.length; i++) {
    gEnigLastSelectedKeys[keyList[i]] = 1;
  }

  buildKeyList(true);
}

function reloadKeys() {
  let i = 0;
  let c = Components.stack;

  while (c) {
    if (c.name == "reloadKeys") {
      i++;
    }
    c = c.caller;
  }

  // detect recursion and don't continue if too much recursion
  // this can happen if the key list is empty
  if (i < 4) {
    buildKeyList(true);
  }
}

function buildKeyList(refresh) {
  EnigmailLog.DEBUG("enigmailKeyManager.js: buildKeyList\n");

  var keyListObj = {};

  if (refresh) {
    EnigmailKeyRing.clearCache();
  }

  keyListObj = EnigmailKeyRing.getAllKeys(
    window,
    getSortColumn(),
    getSortDirection()
  );

  if (!keyListObj.keySortList) {
    return;
  }

  gKeyList = keyListObj.keyList;
  gKeySortList = keyListObj.keySortList;

  gKeyListView.keysRefreshed();
}

function getSelectedKeys() {
  let selList = [];
  let rangeCount = gUserList.view.selection.getRangeCount();
  for (let i = 0; i < rangeCount; i++) {
    let start = {};
    let end = {};
    gUserList.view.selection.getRangeAt(i, start, end);
    for (let c = start.value; c <= end.value; c++) {
      try {
        //selList.push(gUserList.view.getItemAtIndex(c).getAttribute("keyNum"));
        selList.push(gKeyListView.getFilteredRow(c).keyNum);
      } catch (ex) {
        return [];
      }
    }
  }
  return selList;
}

function getSelectedKeyIds() {
  let keyList = getSelectedKeys();

  let a = [];
  for (let i in keyList) {
    a.push(gKeyList[keyList[i]].keyId);
  }

  return a;
}

function enigmailKeyMenu() {
  var keyList = getSelectedKeys();

  let haveSecretForAll;
  if (keyList.length == 0) {
    haveSecretForAll = false;
  } else {
    haveSecretForAll = true;
    for (let key of keyList) {
      if (!gKeyList[key].secretAvailable) {
        haveSecretForAll = false;
        break;
      }
    }
  }

  // Make the selected key count available to translations.
  for (let el of document.querySelectorAll(".enigmail-bulk-key-operation")) {
    el.setAttribute(
      "data-l10n-args",
      JSON.stringify({ count: keyList.length })
    );
  }

  document.getElementById("backupSecretKey").disabled = !haveSecretForAll;

  document.getElementById("revokeKey").disabled =
    keyList.length != 1 || !gKeyList[keyList[0]].secretAvailable;
  document.getElementById("ctxRevokeKey").hidden =
    keyList.length != 1 || !gKeyList[keyList[0]].secretAvailable;

  document.getElementById("importFromClipbrd").disabled = !enigGetClipboard();

  for (let item of document.querySelectorAll(".requires-key-selection")) {
    item.disabled = keyList.length != 1;
  }

  // Disable the "Generate key" menu item if no mail account is available.
  document
    .getElementById("genKey")
    .setAttribute("disabled", MailServices.accounts.defaultAccount == null);

  // Disable the context menu if no keys are selected.
  return keyList.length > 0;
}

function onListClick(event) {
  if (event.detail > 2) {
    return;
  }

  if (event.type === "click") {
    // Mouse event
    let { col } = gUserList.getCellAt(event.clientX, event.clientY);

    if (!col) {
      // not clicked on a valid column (e.g. scrollbar)
      return;
    }
  }

  if (event.detail != 2) {
    return;
  }

  // do not propagate double clicks
  event.stopPropagation();
  enigmailKeyDetails();
}

function enigmailSelectAllKeys() {
  gUserList.view.selection.selectAll();
}

/**
 * Open the Key Properties subdialog.
 *
 * @param {string|null} keyId - Optional ID of the selected OpenPGP Key.
 */
function enigmailKeyDetails(keyId = null) {
  if (!keyId) {
    let keyList = getSelectedKeys();
    // Interrupt if we don't have a single selected key nor a key was passed.
    if (keyList.length != 1) {
      return;
    }
    keyId = gKeyList[keyList[0]].keyId;
  }

  if (EnigmailWindows.openKeyDetails(window, keyId, false)) {
    refreshKeys();
  }
}

function enigmailDeleteKey() {
  var keyList = getSelectedKeys();
  var deleteSecret = false;

  if (keyList.length == 1) {
    // one key selected
    var userId = gKeyList[keyList[0]].userId;
    if (gKeyList[keyList[0]].secretAvailable) {
      if (
        !EnigmailDialog.confirmDlg(
          window,
          l10n.formatValueSync("delete-secret-key", {
            userId,
          }),
          l10n.formatValueSync("dlg-button-delete")
        )
      ) {
        return;
      }
      deleteSecret = true;
    } else if (
      !EnigmailDialog.confirmDlg(
        window,
        l10n.formatValueSync("delete-pub-key", {
          userId,
        }),
        l10n.formatValueSync("dlg-button-delete")
      )
    ) {
      return;
    }
  } else {
    // several keys selected
    for (var i = 0; i < keyList.length; i++) {
      if (gKeyList[keyList[i]].secretAvailable) {
        deleteSecret = true;
      }
    }

    if (deleteSecret) {
      if (
        !EnigmailDialog.confirmDlg(
          window,
          l10n.formatValueSync("delete-mix"),
          l10n.formatValueSync("dlg-button-delete")
        )
      ) {
        return;
      }
    } else if (
      !EnigmailDialog.confirmDlg(
        window,
        l10n.formatValueSync("delete-selected-pub-key"),
        l10n.formatValueSync("dlg-button-delete")
      )
    ) {
      return;
    }
  }

  const cApi = EnigmailCryptoAPI();
  for (let j in keyList) {
    let fpr = gKeyList[keyList[j]].fpr;
    cApi.sync(cApi.deleteKey(fpr, deleteSecret));
    cApi.sync(PgpSqliteDb2.deleteAcceptance(fpr));
  }
  clearKeyCache();
}

function enigCreateKeyMsg() {
  var keyList = getSelectedKeyIds();
  var tmpDir = EnigmailFiles.getTempDir();
  var tmpFile;
  try {
    tmpFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    tmpFile.initWithPath(tmpDir);
    if (!(tmpFile.isDirectory() && tmpFile.isWritable())) {
      document.l10n.formatValue("no-temp-dir").then(value => {
        EnigmailDialog.alert(window, value);
      });
      return;
    }
  } catch (ex) {}
  tmpFile.append("key.asc");
  tmpFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);

  // save file
  var exitCodeObj = {};
  var errorMsgObj = {};

  var keyIdArray = [];
  for (let id of keyList) {
    keyIdArray.push("0x" + id);
  }

  EnigmailKeyRing.extractKey(
    false,
    keyIdArray,
    tmpFile,
    exitCodeObj,
    errorMsgObj
  );
  if (exitCodeObj.value !== 0) {
    EnigmailDialog.alert(window, errorMsgObj.value);
    return;
  }

  // create attachment
  var ioServ = Services.io;
  var tmpFileURI = ioServ.newFileURI(tmpFile);
  var keyAttachment = Cc[
    "@mozilla.org/messengercompose/attachment;1"
  ].createInstance(Ci.nsIMsgAttachment);
  keyAttachment.url = tmpFileURI.spec;
  if (keyList.length == 1) {
    keyAttachment.name = "0x" + keyList[0] + ".asc";
  } else {
    keyAttachment.name = "pgpkeys.asc";
  }
  keyAttachment.temporary = true;
  keyAttachment.contentType = "application/pgp-keys";

  // create Msg
  var msgCompFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  msgCompFields.addAttachment(keyAttachment);

  var msgCompSvc = Cc["@mozilla.org/messengercompose;1"].getService(
    Ci.nsIMsgComposeService
  );

  var msgCompParam = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  msgCompParam.composeFields = msgCompFields;
  msgCompParam.identity = EnigmailFuncs.getDefaultIdentity();
  msgCompParam.type = Ci.nsIMsgCompType.New;
  msgCompParam.format = Ci.nsIMsgCompFormat.Default;
  msgCompParam.originalMsgURI = "";
  msgCompSvc.OpenComposeWindowWithParams("", msgCompParam);
}

async function enigmailRevokeKey() {
  var keyList = getSelectedKeys();
  let keyInfo = gKeyList[keyList[0]];
  EnigRevokeKey(keyInfo, function(success) {
    if (success) {
      refreshKeys();
    }
  });
}

function enigmailExportKeys(which) {
  let exportSecretKey = which == "secret";
  var keyList = getSelectedKeys();
  var defaultFileName;

  if (keyList.length == 1) {
    let extension = exportSecretKey ? "secret.asc" : "public.asc";
    defaultFileName = gKeyList[keyList[0]].userId.replace(/[<>]/g, "");
    defaultFileName =
      defaultFileName +
      "-" +
      `(0x${gKeyList[keyList[0]].keyId})` +
      "-" +
      extension;
  } else {
    let id = exportSecretKey
      ? "default-pub-sec-key-filename"
      : "default-pub-key-filename";
    defaultFileName = l10n.formatValueSync(id) + ".asc";
  }

  if (exportSecretKey) {
    var fprArray = [];
    for (let id of keyList) {
      fprArray.push("0x" + gKeyList[id].fpr);
    }
    EnigmailKeyRing.backupSecretKeysInteractive(
      window,
      defaultFileName,
      fprArray
    );
  } else {
    let keyList2 = getSelectedKeyIds();
    var keyIdArray = [];
    for (let id of keyList2) {
      keyIdArray.push("0x" + id);
    }
    EnigmailKeyRing.exportPublicKeysInteractive(
      window,
      defaultFileName,
      keyIdArray
    );
  }
}

/*
function enigmailManageUids() {
  var keyList = getSelectedKeys();
  var inputObj = {
    keyId: gKeyList[keyList[0]].keyId,
    ownKey: gKeyList[keyList[0]].secretAvailable,
  };
  var resultObj = {
    refresh: false,
  };
  window.openDialog(
    "chrome://openpgp/content/ui/enigmailManageUidDlg.xhtml",
    "",
    "dialog,modal,centerscreen,resizable=yes",
    inputObj,
    resultObj
  );
  if (resultObj.refresh) {
    refreshKeys();
  }
}
*/

function enigGetClipboard() {
  return EnigmailClipboard.getClipboardContent(
    window,
    Ci.nsIClipboard.kGlobalClipboard
  );
}

function enigmailImportFromClipbrd() {
  if (
    !EnigmailDialog.confirmDlg(
      window,
      l10n.formatValueSync("import-from-clip"),
      l10n.formatValueSync("key-man-button-import")
    )
  ) {
    return;
  }

  var cBoardContent = enigGetClipboard();
  var errorMsgObj = {};
  var preview = EnigmailKey.getKeyListFromKeyBlock(
    cBoardContent,
    errorMsgObj,
    true,
    true,
    false
  );
  // should we allow importing secret keys?
  if (preview && preview.length > 0) {
    let confirmImport = false;
    let outParam = {};
    confirmImport = EnigmailDialog.confirmPubkeyImport(
      window,
      preview,
      outParam
    );
    if (confirmImport) {
      // import
      EnigmailKeyRing.importKey(
        window,
        false,
        cBoardContent,
        false,
        "",
        errorMsgObj,
        null,
        false,
        [],
        false,
        true,
        null,
        outParam.acceptance
      );
      var keyList = preview.map(function(a) {
        return a.id;
      });
      EnigmailDialog.keyImportDlg(window, keyList);
      refreshKeys();
    }
  } else {
    document.l10n.formatValue("preview-failed").then(value => {
      EnigmailDialog.alert(window, value);
    });
  }
}

/**
 * Places the fingerprint of each selected key onto the keyboard.
 */
function copyOpenPGPFingerPrints() {
  let fprs = getSelectedKeys()
    .map(idx => gKeyList[idx].fpr)
    .join("\n");
  EnigmailClipboard.setClipboardContent(fprs);
}

/**
 * Places the key id of each key selected onto the clipboard.
 */
function copyOpenPGPKeyIds() {
  let ids = getSelectedKeyIds();
  EnigmailClipboard.setClipboardContent(ids.map(id => `0x${id}`).join("\n"));
}

function enigmailCopyToClipbrd() {
  var keyList = getSelectedKeyIds();
  if (keyList.length === 0) {
    document.l10n.formatValue("no-key-selected").then(value => {
      EnigmailDialog.info(window, value);
    });
    return;
  }
  var exitCodeObj = {};
  var errorMsgObj = {};

  var keyIdArray = [];
  for (let id of keyList) {
    keyIdArray.push("0x" + id);
  }

  var keyData = EnigmailKeyRing.extractKey(
    0,
    keyIdArray,
    null,
    exitCodeObj,
    errorMsgObj
  );
  if (exitCodeObj.value !== 0) {
    l10n.formatValue("copy-to-clipbrd-failed").then(value => {
      EnigmailDialog.alert(window, value);
    });
    return;
  }
  if (EnigmailClipboard.setClipboardContent(keyData)) {
    EnigmailLog.DEBUG(
      "enigmailKeyManager.js: enigmailImportFromClipbrd: set clipboard data\n"
    );
    l10n.formatValue("copy-to-clipbrd-ok").then(value => {
      EnigmailDialog.info(window, value);
    });
  } else {
    l10n.formatValue("copy-to-clipbrd-failed").then(value => {
      EnigmailDialog.alert(window, value);
    });
  }
}

function enigmailSearchKey() {
  var result = {
    value: "",
  };
  if (
    !EnigmailDialog.promptValue(
      window,
      l10n.formatValueSync("openpgp-key-man-discover-prompt"),
      result
    )
  ) {
    return;
  }

  result.value = result.value.trim();

  let imported = false;
  if (EnigmailFuncs.stringLooksLikeEmailAddress(result.value)) {
    imported = KeyLookupHelper.lookupAndImportByEmail(
      window,
      result.value,
      true,
      null
    );
  } else {
    imported = KeyLookupHelper.lookupAndImportByKeyID(
      window,
      result.value,
      true,
      null
    );
  }

  if (imported) {
    refreshKeys();
  }
}

/*
function enigmailUploadKeys() {
  accessKeyServer(EnigmailConstants.UPLOAD_KEY, enigmailUploadKeysCb);
}

function enigmailUploadKeysCb(exitCode, errorMsg, msgBox) {
  if (msgBox) {
    if (exitCode !== 0) {
      EnigmailDialog.alert(window, "Sending of keys failed" + "\n" + errorMsg);
    }
  } else {
    return exitCode === 0 ? "Key(s) sent successfully" : "Sending of keys failed";
  }
  return "";
}

function enigmailUploadToWkd() {
  let selKeyList = getSelectedKeys();
  let keyList = [];
  for (let i = 0; i < selKeyList.length; i++) {
    keyList.push(gKeyList[selKeyList[i]]);
  }

  EnigmailWks.wksUpload(keyList, window)
    .then(result => {
      if (result.length > 0) {
        EnigmailDialog.info(window, "Key(s) sent successfully");
      } else if (keyList.length === 1) {
        EnigmailDialog.alert(
          window,
          "Sending of keys failed" +
            "\n\n" +
            "The key %S does not have a WKS identity.".replace("%S", keyList[0].userId)
        );
      } else {
        EnigmailDialog.alert(
          window,
          "The upload was not successful - your provider does not seem to support WKS."
        );
      }
    })
    .catch(error => {
      EnigmailDialog.alert(
        "Sending of keys failed" + "\n" + error
      );
    });
}
*/

/*
function enigmailReceiveKey() {
  accessKeyServer(EnigmailConstants.DOWNLOAD_KEY, enigmailReceiveKeyCb);
}
*/

function userAcceptsWarning(warningMessage) {
  if (!Services.prefs.getBoolPref("temp.openpgp.warnRefreshAll")) {
    return true;
  }

  let checkedObj = {};

  let confirm =
    EnigmailDialog.msgBox(
      window,
      {
        msgtext: warningMessage,
        checkboxLabel: l10n.formatValueSync("dlg-no-prompt"),
        button1: l10n.formatValueSync("dlg-button-continue"),
        cancelButton: ":cancel",
        iconType: EnigmailConstants.ICONTYPE_QUESTION,
        dialogTitle: l10n.formatValueSync("enig-confirm"),
      },
      checkedObj
    ) === 0;

  if (checkedObj.value) {
    Services.prefs.setBoolCharPref("temp.openpgp.warnRefreshAll", false);
  }
  return confirm;
}

/*
function userAcceptsRefreshWarning() {
  if (Services.prefs.getBoolPref("temp.openpgp.keyRefreshOn") === true) {
    return userAcceptsWarning("Warning: Your keys are currently being refreshed in the background as safely as possible.\nRefreshing all your keys at once will unnecessarily reveal information about you.\nDo you really want to do this?");
  }
  return userAcceptsWarning("XXXrefreshKey.warn");
}

function enigmailRefreshAllKeys() {
  if (userAcceptsRefreshWarning() === true) {
    accessKeyServer(EnigmailConstants.REFRESH_KEY, enigmailReceiveKeyCb);
  }
}
*/

/*
// Iterate through contact emails and download them
function enigmailDowloadContactKeysEngine() {
  let abManager = Cc["@mozilla.org/abmanager;1"].getService(Ci.nsIAbManager);
  let emails = [];

  for (let addressBook of abManager.directories) {
    if (addressBook instanceof Ci.nsIAbDirectory) {
      // or nsIAbItem or nsIAbCollection
      // ask for confirmation for each address book:
      var doIt = EnigmailDialog.confirmDlg(
        window,
        "Import contacts from address book '%S'?".replace("%S, addressBook.dirName),
        "&Yes",
        "XXXdlg.button.skip"
      );
      if (!doIt) {
        continue; // SKIP this address book
      }

      for (let card of addressBook.childCards) {
        try {
          let email = card.getPropertyAsAString("PrimaryEmail");
          if (email && email.includes("@")) {
            emails.push(email);
          }
        } catch (e) {}

        try {
          let email = card.getPropertyAsAString("SecondEmail");
          if (email && email.includes("@")) {
            emails.push(email);
          }
        } catch (e) {}
      }
    }
  }

  // list of emails might be emoty here, in which case we do nothing
  if (emails.length <= 0) {
    return;
  }

  // sort the e-mail array
  emails.sort();

  //remove duplicates
  var i = 0;
  while (i < emails.length - 1) {
    if (emails[i] == emails[i + 1]) {
      emails.splice(i, 1);
    } else {
      i = i + 1;
    }
  }

  var inputObj = {
    searchList: emails,
    autoKeyServer: Services.prefs.getBoolPref("temp.openpgp.autoKeyServerSelection")
      ? Services.prefs.getCharPref("temp.openpgp.keyserver").split(/[ ,;]/g)[0]
      : null,
  };
  var resultObj = {};

  EnigmailWindows.downloadKeys(window, inputObj, resultObj);

  if (resultObj.importedKeys > 0) {
    refreshKeys();
  }
}

function enigmailDownloadContactKeys() {
  var doIt = EnigmailDialog.confirmBoolPref(
    window,
    "XXXdownloadContactsKeys.warn",
    "temp.openpgp.warnDownloadContactKeys",
    "XXXdlg.button.continue",
    "XXXdlg.button.cancel"
  );

  if (doIt) {
    enigmailDowloadContactKeysEngine();
  }
}
*/

function displayResult(arrayOfMsgText) {
  EnigmailDialog.info(window, arrayOfMsgText.join("\n"));
}

/*
function enigmailReceiveKeyCb(exitCode, errorMsg, msgBox) {
  EnigmailLog.DEBUG("enigmailKeyManager.js: enigmailReceiveKeyCb\n");
  if (msgBox) {
    if (exitCode === 0) {
      refreshKeys();
      EnigmailEvents.dispatchEvent(displayResult, 100, [
        "Key(s) updated successfully",
        errorMsg,
      ]);
    } else {
      EnigmailEvents.dispatchEvent(displayResult, 100, [
        "Downloading of keys failed",
        errorMsg,
      ]);
    }
  } else {
    return exitCode === 0 ? "Key(s) updated successfully" : "Downloading of keys failed";
  }
  return "";
}
*/

function enigmailImportKeysFromUrl() {
  var value = {
    value: "",
  };
  if (
    EnigmailDialog.promptValue(
      window,
      l10n.formatValueSync("import-from-url"),
      value
    )
  ) {
    var p = new Promise(function(resolve, reject) {
      var cbFunc = async function(data) {
        EnigmailLog.DEBUG("enigmailImportKeysFromUrl: _cbFunc()\n");
        var errorMsgObj = {};

        var preview = EnigmailKey.getKeyListFromKeyBlock(
          data,
          errorMsgObj,
          true,
          true,
          false
        );
        // should we allow importing secret keys?
        if (preview && preview.length > 0) {
          let confirmImport = false;
          let outParam = {};
          confirmImport = EnigmailDialog.confirmPubkeyImport(
            window,
            preview,
            outParam
          );
          if (confirmImport) {
            EnigmailKeyRing.importKey(
              window,
              false,
              data,
              false,
              "",
              errorMsgObj,
              null,
              false,
              [],
              false,
              true,
              null,
              outParam.acceptance
            );
            errorMsgObj.preview = preview;
            resolve(errorMsgObj);
          }
        } else {
          EnigmailDialog.alert(
            window,
            await document.l10n.formatValue("preview-failed")
          );
        }
      };

      try {
        var bufferListener = EnigmailStreams.newStringStreamListener(cbFunc);
        var ioServ = Services.io;
        var msgUri = ioServ.newURI(value.value);

        var channel = EnigmailStreams.createChannel(msgUri);
        channel.asyncOpen(bufferListener, msgUri);
      } catch (ex) {
        var err = {
          value: ex,
        };
        reject(err);
      }
    });

    p.then(function(errorMsgObj) {
      var keyList = errorMsgObj.preview.map(function(a) {
        return a.id;
      });
      EnigmailDialog.keyImportDlg(window, keyList);
      refreshKeys();
    }).catch(async function(reason) {
      EnigmailDialog.alert(
        window,
        await document.l10n.formatValue("general-error", {
          reason: reason.value,
        })
      );
    });
  }
}

function initiateAcKeyTransfer() {
  EnigmailWindows.inititateAcSetupMessage();
}

//
// ----- key filtering functionality  -----
//

function determineHiddenKeys(keyObj, showInvalidKeys, showOthersKeys) {
  var show = true;

  const INVALID_KEYS = "ierdD";

  if (
    !showInvalidKeys &&
    INVALID_KEYS.includes(EnigmailTrust.getTrustCode(keyObj))
  ) {
    show = false;
  }

  if (!showOthersKeys && !keyObj.secretAvailable) {
    show = false;
  }

  return show;
}

//
// ----- keyserver related functionality ----
//
function accessKeyServer(accessType, callbackFunc) {
  const ioService = Services.io;
  if (ioService && ioService.offline) {
    document.l10n.formatValue("need-online").then(value => {
      EnigmailDialog.alert(window, value);
    });
    return;
  }

  let inputObj = {};
  let resultObj = {};
  let selKeyList = getSelectedKeys();
  let keyList = [];
  for (let i = 0; i < selKeyList.length; i++) {
    keyList.push(gKeyList[selKeyList[i]]);
  }

  if (accessType !== EnigmailConstants.REFRESH_KEY && selKeyList.length === 0) {
    if (
      EnigmailDialog.confirmDlg(
        window,
        l10n.formatValueSync("refresh-all-question"),
        l10n.formatValueSync("key-man-button-refresh-all")
      )
    ) {
      accessType = EnigmailConstants.DOWNLOAD_KEY;
      EnigmailDialog.alertPref(
        window,
        l10n.formatValueSync("refresh-key-warn"),
        "warnRefreshAll"
      );
    } else {
      return;
    }
  }

  let keyServer = Services.prefs.getBoolPref(
    "temp.openpgp.autoKeyServerSelection"
  )
    ? Services.prefs.getCharPref("temp.openpgp.keyserver").split(/[ ,;]/g)[0]
    : null;
  if (!keyServer) {
    switch (accessType) {
      case EnigmailConstants.REFRESH_KEY:
        inputObj.upload = false;
        inputObj.keyId = "All keys";
        break;
      case EnigmailConstants.DOWNLOAD_KEY:
        inputObj.upload = false;
        inputObj.keyId = keyList
          .map(k => {
            try {
              return EnigmailFuncs.stripEmail(k.userId);
            } catch (x) {
              return "0x" + k.fpr;
            }
          })
          .join(", ");
        break;
      case EnigmailConstants.UPLOAD_KEY:
        inputObj.upload = true;
        inputObj.keyId = keyList
          .map(k => {
            try {
              return EnigmailFuncs.stripEmail(k.userId);
            } catch (x) {
              return "0x" + k.fpr;
            }
          })
          .join(", ");
        break;
      default:
        inputObj.upload = true;
        inputObj.keyId = "";
    }

    window.openDialog(
      "chrome://openpgp/content/ui/enigmailKeyserverDlg.xhtml",
      "",
      "dialog,modal,centerscreen",
      inputObj,
      resultObj
    );
    keyServer = resultObj.value;
  }

  if (keyServer.length === 0) {
    return;
  }

  if (accessType !== EnigmailConstants.REFRESH_KEY) {
    inputObj.keyServer = keyServer;
    inputObj.accessType = accessType;
    inputObj.keyId = keyList.map(k => {
      return "0x" + k.fpr;
    });
    window.openDialog(
      "chrome://openpgp/content/ui/enigRetrieveProgress.xhtml",
      "",
      "dialog,modal,centerscreen",
      inputObj,
      resultObj
    );

    if (resultObj.result) {
      callbackFunc(resultObj.exitCode, resultObj.errorMsg, false);
    }
  } else {
    EnigmailKeyServer.refresh(keyServer);
  }
}

function getSortDirection() {
  return gUserList.getAttribute("sortDirection") == "ascending" ? 1 : -1;
}

function sortTree(column) {
  var columnName;
  var order = getSortDirection();

  //if the column is passed and it's already sorted by that column, reverse sort
  if (column) {
    columnName = column.id;
    if (gUserList.getAttribute("sortResource") == columnName) {
      order *= -1;
    } else {
      document
        .getElementById(gUserList.getAttribute("sortResource"))
        .removeAttribute("sortDirection");
      order = 1;
    }
  } else {
    columnName = gUserList.getAttribute("sortResource");
  }
  gUserList.setAttribute(
    "sortDirection",
    order == 1 ? "ascending" : "descending"
  );
  let col = document.getElementById(columnName);
  if (col) {
    col.setAttribute("sortDirection", order == 1 ? "ascending" : "descending");
    gUserList.setAttribute("sortResource", columnName);
  } else {
    gUserList.setAttribute("sortResource", "enigUserNameCol");
  }
  buildKeyList(false);
}

function getSortColumn() {
  switch (gUserList.getAttribute("sortResource")) {
    case "enigUserNameCol":
      return "userid";
    case "keyCol":
      return "keyid";
    case "expCol":
      return "expiry";
    case "fprCol":
      return "fpr";
    default:
      return "?";
  }
}

/**
 * Open the OpenPGP Key Wizard to generate a new key or import secret keys.
 *
 * @param {boolean} isImport - If the keyWizard should automatically switch to
 *   the import or create screen as requested by the user.
 */
function openKeyWizard(isImport = false) {
  // Bug 1638153: The rootTreeItem object has been removed after 78. We need to
  // the availability of "browsingContext" to use the right DOM window in 79+.
  let w =
    "browsingContext" in window
      ? window.browsingContext.topChromeWindow
      : window.docShell.rootTreeItem.domWindow;

  let args = {
    gSubDialog: null,
    cancelCallback: clearKeyCache,
    okCallback: clearKeyCache,
    okImportCallback: clearKeyCache,
    okExternalCallback: clearKeyCache,
    keyDetailsDialog: enigmailKeyDetails,
    isCreate: !isImport,
    isImport,
  };

  w.openDialog(
    "chrome://openpgp/content/ui/keyWizard.xhtml",
    "enigmail:KeyWizard",
    "dialog,modal,centerscreen,resizable",
    args
  );
}

/***************************** TreeView for user list ***********************************/
/**
 * gKeyListView implements the nsITreeView interface for the displayed list.
 *
 * For speed reasons, we use two lists:
 * - keyViewList:   contains the full list of pointers to all  keys and rows that are
 *                  potentially displayed ordered according to the sort column
 * - keyFilterList: contains the indexes to keyViewList of the keys that are displayed
 *                  according to the current filter criteria.
 */
var gKeyListView = {
  keyViewList: [],
  keyFilterList: [],

  //// nsITreeView implementation

  rowCount: 0,
  selection: null,

  canDrop(index, orientation, dataTransfer) {
    return false;
  },

  cycleCell(row, col) {},
  cycleHeader(col) {},
  drop(row, orientation, dataTransfer) {},

  getCellProperties(row, col) {
    let r = this.getFilteredRow(row);
    if (!r) {
      return "";
    }

    let keyObj = gKeyList[r.keyNum];
    if (!keyObj) {
      return "";
    }

    let keyTrustStyle = "";

    switch (r.rowType) {
      case "key":
      case "uid":
        switch (keyObj.keyTrust) {
          case "q":
            keyTrustStyle = "enigmail_keyValid_unknown";
            break;
          case "r":
            keyTrustStyle = "enigmail_keyValid_revoked";
            break;
          case "e":
            keyTrustStyle = "enigmail_keyValid_expired";
            break;
          case "n":
            keyTrustStyle = "enigmail_keyTrust_untrusted";
            break;
          case "m":
            keyTrustStyle = "enigmail_keyTrust_marginal";
            break;
          case "f":
            keyTrustStyle = "enigmail_keyTrust_full";
            break;
          case "u":
            keyTrustStyle = "enigmail_keyTrust_ultimate";
            break;
          case "-":
            keyTrustStyle = "enigmail_keyTrust_unknown";
            break;
          default:
            keyTrustStyle = "enigmail_keyTrust_unknown";
            break;
        }

        if (
          keyObj.keyTrust.length > 0 &&
          ENIG_KEY_NOT_VALID.includes(keyObj.keyTrust.charAt(0))
        ) {
          keyTrustStyle += " enigKeyInactive";
        }

        if (r.rowType === "key" && keyObj.secretAvailable) {
          keyTrustStyle += " enigmailOwnKey";
        }
        break;
    }

    return keyTrustStyle;
  },

  getCellText(row, col) {
    let r = this.getFilteredRow(row);
    if (!r) {
      return "";
    }
    let keyObj = gKeyList[r.keyNum];
    if (!keyObj) {
      return "???";
    }

    switch (r.rowType) {
      case "key":
        switch (col.id) {
          case "enigUserNameCol":
            return keyObj.userId;
          case "keyCol":
            return `0x${keyObj.keyId}`;
          case "expCol":
            return keyObj.effectiveExpiry;
          case "fprCol":
            return keyObj.fprFormatted;
        }
        break;
      case "uid":
        switch (col.id) {
          case "enigUserNameCol":
            return keyObj.userIds[r.uidNum].userId;
        }
        break;
    }

    return "";
  },
  getCellValue(row, col) {
    return "";
  },
  getColumnProperties(col) {
    return "";
  },

  getImageSrc(row, col) {
    let r = this.getFilteredRow(row);
    if (!r) {
      return null;
    }
    //let keyObj = gKeyList[r.keyNum];

    return null;
  },

  /**
   * indentation level for rows
   */
  getLevel(row) {
    let r = this.getFilteredRow(row);
    if (!r) {
      return 0;
    }

    switch (r.rowType) {
      case "key":
        return 0;
      case "uid":
        return 1;
    }

    return 0;
  },

  getParentIndex(idx) {
    return -1;
  },
  getProgressMode(row, col) {},

  getRowProperties(row) {
    return "";
  },
  hasNextSibling(rowIndex, afterIndex) {
    return false;
  },
  isContainer(row) {
    let r = this.getFilteredRow(row);
    if (!r) {
      return false;
    }
    switch (r.rowType) {
      case "key":
        return true;
    }

    return false;
  },
  isContainerEmpty(row) {
    let r = this.getFilteredRow(row);
    if (!r) {
      return true;
    }
    switch (r.rowType) {
      case "key":
        return !r.hasSubUID;
    }
    return true;
  },
  isContainerOpen(row) {
    return this.getFilteredRow(row).isOpen;
  },
  isEditable(row, col) {
    return false;
  },
  isSelectable(row, col) {
    return true;
  },
  isSeparator(index) {
    return false;
  },
  isSorted() {
    return false;
  },
  performAction(action) {},
  performActionOnCell(action, row, col) {},
  performActionOnRow(action, row) {},
  selectionChanged() {},
  // void setCellText(in long row, in nsITreeColumn col, in AString value);
  // void setCellValue(in long row, in nsITreeColumn col, in AString value);
  setTree(treebox) {
    this.treebox = treebox;
  },

  toggleOpenState(row) {
    let r = this.getFilteredRow(row);
    if (!r) {
      return;
    }
    let realRow = this.keyFilterList[row];
    switch (r.rowType) {
      case "key":
        if (r.isOpen) {
          let i = 0;
          while (
            this.getFilteredRow(row + 1 + i) &&
            this.getFilteredRow(row + 1 + i).keyNum === r.keyNum
          ) {
            ++i;
          }

          this.keyViewList.splice(realRow + 1, i);
          r.isOpen = false;
          this.applyFilter(row);
        } else {
          this.appendUids("uid", r.keyNum, realRow, this.keyViewList[row]);

          r.isOpen = true;
          this.applyFilter(row);
        }
        break;
    }
  },

  /**
   * add UIDs for a given key to key view
   *
   * @param uidType: String - one of uid (user ID), uat (photo)
   * @param keyNum:  Number - index of key in gKeyList
   * @param realRow: Number - index of row in keyViewList (i.e. without filter)
   *
   * @return Number: number of UIDs added
   */
  appendUids(uidType, keyNum, realRow, parentRow) {
    let keyObj = gKeyList[keyNum];
    let uidAdded = 0;

    for (let i = 1; i < keyObj.userIds.length; i++) {
      if (keyObj.userIds[i].type === uidType) {
        ++uidAdded;
        this.keyViewList.splice(realRow + uidAdded, 0, {
          rowType: uidType,
          keyNum,
          parent: parentRow,
          uidNum: i,
        });
      }
    }

    return uidAdded;
  },

  /**
   * Reload key list entirely
   */
  keysRefreshed() {
    this.keyViewList = [];
    this.keyFilterList = [];
    for (let i = 0; i < gKeySortList.length; i++) {
      this.keyViewList.push({
        row: i,
        rowType: "key",
        fpr: gKeySortList[i].fpr,
        keyNum: gKeySortList[i].keyNum,
        isOpen: false,
        hasSubUID: gKeyList[gKeySortList[i].keyNum].userIds.length > 1,
      });
    }

    this.applyFilter(0);
    let oldRowCount = this.rowCount;
    this.rowCount = this.keyViewList.length;
    gUserList.rowCountChanged(0, this.rowCount - oldRowCount);
  },

  /**
   * If no search term is entered, decide which keys to display
   *
   * @return array of keyNums (= display some keys) or null (= display ALL keys)
   */
  showOrHideAllKeys() {
    var showInvalidKeys = gShowInvalidKeys.getAttribute("checked") == "true";
    var showOthersKeys = gShowOthersKeys.getAttribute("checked") == "true";

    document.getElementById("nothingFound").hidePopup();

    if (showInvalidKeys && showOthersKeys) {
      return null;
    }

    let keyShowList = [];
    for (let i = 0; i < gKeyList.length; i++) {
      if (determineHiddenKeys(gKeyList[i], showInvalidKeys, showOthersKeys)) {
        keyShowList.push(i);
      }
    }

    return keyShowList;
  },

  /**
   * Search for keys that match filter criteria
   *
   * @return array of keyNums (= display some keys) or null (= display ALL keys)
   */
  getFilteredKeys() {
    let searchTxt = gSearchInput.value;

    if (!searchTxt || searchTxt.length === 0) {
      return this.showOrHideAllKeys();
    }

    if (!gKeyList) {
      return [];
    }
    let showInvalidKeys = gShowInvalidKeys.getAttribute("checked") == "true";
    let showOthersKeys = gShowOthersKeys.getAttribute("checked") == "true";

    // skip leading 0x in case we search for a key:
    if (searchTxt.length > 2 && searchTxt.substr(0, 2).toLowerCase() == "0x") {
      searchTxt = searchTxt.substr(2);
    }

    searchTxt = searchTxt.toLowerCase();
    searchTxt = searchTxt.replace(/^(\s*)(.*)/, "$2").replace(/\s+$/, ""); // trim spaces

    // check if we search for a full fingerprint (with optional spaces every 4 letters)
    var fpr = null;
    if (searchTxt.length == 49) {
      // possible fingerprint with spaces?
      if (
        searchTxt.search(/^[0-9a-f ]*$/) >= 0 &&
        searchTxt[4] == " " &&
        searchTxt[9] == " " &&
        searchTxt[14] == " " &&
        searchTxt[19] == " " &&
        searchTxt[24] == " " &&
        searchTxt[29] == " " &&
        searchTxt[34] == " " &&
        searchTxt[39] == " " &&
        searchTxt[44] == " "
      ) {
        fpr = searchTxt.replace(/ /g, "");
      }
    } else if (searchTxt.length == 40) {
      // possible fingerprint without spaces
      if (searchTxt.search(/^[0-9a-f ]*$/) >= 0) {
        fpr = searchTxt;
      }
    }

    let keyShowList = [];

    for (let i = 0; i < gKeyList.length; i++) {
      let keyObj = gKeyList[i];
      let uid = keyObj.userId;
      let showKey = false;

      // does a user ID (partially) match?
      for (let idx = 0; idx < keyObj.userIds.length; idx++) {
        uid = keyObj.userIds[idx].userId;
        if (uid.toLowerCase().includes(searchTxt)) {
          showKey = true;
        }
      }

      // does the full fingerprint (without spaces) match?
      // - no partial match check because this is special for the collapsed spaces inside the fingerprint
      if (showKey === false && fpr && keyObj.fpr.toLowerCase() == fpr) {
        showKey = true;
      }
      // does the fingerprint (partially) match?
      if (showKey === false && keyObj.fpr.toLowerCase().includes(searchTxt)) {
        showKey = true;
      }
      // does a sub key of (partially) match?
      if (showKey === false) {
        for (
          let subKeyIdx = 0;
          subKeyIdx < keyObj.subKeys.length;
          subKeyIdx++
        ) {
          let subkey = keyObj.subKeys[subKeyIdx].keyId;
          if (subkey.toLowerCase().includes(searchTxt)) {
            showKey = true;
          }
        }
      }
      // take option to show invalid/untrusted... keys into account
      if (
        showKey &&
        determineHiddenKeys(keyObj, showInvalidKeys, showOthersKeys)
      ) {
        keyShowList.push(i);
      }
    }

    return keyShowList;
  },

  /**
   * Trigger re-displaying the list of keys and apply a filter
   *
   * @param selectedRow: Number - the row that is currently selected or
   *                     clicked on
   */
  applyFilter(selectedRow) {
    let keyDisplayList = this.getFilteredKeys();

    this.keyFilterList = [];
    if (keyDisplayList === null) {
      for (let i = 0; i < this.keyViewList.length; i++) {
        this.keyFilterList.push(i);
      }

      this.adjustRowCount(this.keyViewList.length, selectedRow);
    } else {
      for (let i = 0; i < this.keyViewList.length; i++) {
        if (keyDisplayList.includes(this.keyViewList[i].keyNum)) {
          this.keyFilterList.push(i);
        }
      }

      this.adjustRowCount(this.keyFilterList.length, selectedRow);
    }
  },

  /**
   * Re-calculate the row count and instruct the view to update
   */

  adjustRowCount(newRowCount, selectedRow) {
    if (this.rowCount === newRowCount) {
      gUserList.invalidate();
      return;
    }

    let delta = newRowCount - this.rowCount;
    this.rowCount = newRowCount;
    gUserList.rowCountChanged(selectedRow, delta);
  },

  /**
   * Determine the row object from the a filtered row number
   *
   * @param row: Number - row number of displayed (=filtered) list
   *
   * @return Object: keyViewList entry of corresponding row
   */

  getFilteredRow(row) {
    let r = this.keyFilterList[row];
    if (r !== undefined) {
      return this.keyViewList[r];
    }
    return null;
  },

  treebox: null,
};
