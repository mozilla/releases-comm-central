/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

/* global GetEnigmailSvc, EnigRevokeKey */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var { EnigmailCore } = ChromeUtils.import(
  "chrome://openpgp/content/modules/core.jsm"
);
var { EnigmailStreams } = ChromeUtils.import(
  "chrome://openpgp/content/modules/streams.jsm"
);
var { EnigmailFuncs } = ChromeUtils.import(
  "chrome://openpgp/content/modules/funcs.jsm"
);
var { EnigmailWindows } = ChromeUtils.import(
  "chrome://openpgp/content/modules/windows.jsm"
);
var { EnigmailKeyServer } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyserver.jsm"
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
var { EnigmailKeyserverURIs } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyserverUris.jsm"
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
  if (!EnigmailCore.getService()) {
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
  document.getElementById("statusText").value = l10n.formatValueSync(
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
  document.getElementById("statusText").value = "";
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

  let singleSecretSelected = keyList.length == 1 && haveSecretForAll;

  // Make the selected key count available to translations.
  for (let el of document.querySelectorAll(".enigmail-bulk-key-operation")) {
    el.setAttribute(
      "data-l10n-args",
      JSON.stringify({ count: keyList.length })
    );
  }

  document.getElementById("backupSecretKey").disabled = !haveSecretForAll;
  document.getElementById("uploadToServer").disabled = !singleSecretSelected;

  document.getElementById("revokeKey").disabled =
    keyList.length != 1 || !gKeyList[keyList[0]].secretAvailable;
  document.getElementById("ctxRevokeKey").hidden =
    keyList.length != 1 || !gKeyList[keyList[0]].secretAvailable;

  document.getElementById("importFromClipbrd").disabled =
    !Services.clipboard.hasDataMatchingFlavors(
      ["text/plain"],
      Ci.nsIClipboard.kGlobalClipboard
    );

  for (let item of document.querySelectorAll(
    ".requires-single-key-selection"
  )) {
    item.disabled = keyList.length != 1;
  }

  for (let item of document.querySelectorAll(".requires-key-selection")) {
    item.disabled = keyList.length == 0;
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

async function enigmailDeleteKey() {
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
    await cApi.deleteKey(fpr, deleteSecret);
    await PgpSqliteDb2.deleteAcceptance(fpr);
  }
  clearKeyCache();
  gUserList.view.selection.clearSelection();
}

async function enigCreateKeyMsg() {
  var keyList = getSelectedKeyIds();
  var tmpFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
  tmpFile.append("key.asc");
  tmpFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);

  // save file
  var exitCodeObj = {};
  var errorMsgObj = {};

  var keyIdArray = [];
  for (let id of keyList) {
    keyIdArray.push("0x" + id);
  }

  await EnigmailKeyRing.extractPublicKeys(
    keyIdArray, // full
    null,
    null,
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
  EnigRevokeKey(keyInfo, function (success) {
    if (success) {
      refreshKeys();
    }
  });
}

async function enigmailExportKeys(which) {
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
      fprArray.push(gKeyList[id].fpr);
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
    await EnigmailKeyRing.exportPublicKeysInteractive(
      window,
      defaultFileName,
      keyIdArray
    );
  }
}

async function enigmailImportFromClipbrd() {
  if (
    !EnigmailDialog.confirmDlg(
      window,
      l10n.formatValueSync("import-from-clip"),
      l10n.formatValueSync("key-man-button-import")
    )
  ) {
    return;
  }

  let cBoardContent = await navigator.clipboard.readText();
  var errorMsgObj = {};
  var preview = await EnigmailKey.getKeyListFromKeyBlock(
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
        true,
        outParam.acceptance
      );
      var keyList = preview.map(function (a) {
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
async function copyOpenPGPFingerPrints() {
  let fprs = getSelectedKeys()
    .map(idx => gKeyList[idx].fpr)
    .join("\n");
  return navigator.clipboard.writeText(fprs);
}

/**
 * Places the key id of each key selected onto the clipboard.
 */
async function copyOpenPGPKeyIds() {
  let ids = getSelectedKeyIds();
  return navigator.clipboard.writeText(ids.map(id => `0x${id}`).join("\n"));
}

async function enigmailCopyToClipbrd() {
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

  let keyData = await EnigmailKeyRing.extractPublicKeys(
    keyIdArray, // full
    null,
    null,
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
  navigator.clipboard
    .writeText(keyData)
    .then(() => {
      l10n.formatValue("copy-to-clipbrd-ok").then(value => {
        EnigmailDialog.info(window, value);
      });
    })
    .catch(err => {
      l10n.formatValue("copy-to-clipbrd-failed").then(value => {
        EnigmailDialog.alert(window, value);
      });
    });
}

async function enigmailSearchKey() {
  var result = {
    value: "",
  };
  if (
    !Services.prompt.prompt(
      window,
      l10n.formatValueSync("enig-prompt"),
      l10n.formatValueSync("openpgp-key-man-discover-prompt"),
      result,
      "",
      {}
    )
  ) {
    return;
  }

  result.value = result.value.trim();

  let imported = false;
  if (EnigmailFuncs.stringLooksLikeEmailAddress(result.value)) {
    imported = await KeyLookupHelper.lookupAndImportByEmail(
      "interactive-import",
      window,
      result.value,
      true
    );
  } else {
    imported = await KeyLookupHelper.lookupAndImportByKeyID(
      "interactive-import",
      window,
      result.value,
      true
    );
  }

  if (imported) {
    refreshKeys();
  }
}

async function enigmailUploadKey() {
  // Always upload to the first configured keyserver with a supported protocol.
  let selKeyList = getSelectedKeys();
  if (selKeyList.length != 1) {
    return;
  }

  let keyId = gKeyList[selKeyList[0]].keyId;
  let ks = EnigmailKeyserverURIs.getUploadKeyServer();

  let ok = await EnigmailKeyServer.upload(keyId, ks);
  document.l10n
    .formatValue(ok ? "openpgp-key-publish-ok" : "openpgp-key-publish-fail", {
      keyserver: ks,
    })
    .then(value => {
      EnigmailDialog.alert(window, value);
    });
}

function enigmailImportKeysFromUrl() {
  var result = {
    value: "",
  };
  if (
    !Services.prompt.prompt(
      window,
      l10n.formatValueSync("enig-prompt"),
      l10n.formatValueSync("import-from-url"),
      result,
      "",
      {}
    )
  ) {
    return;
  }
  var p = new Promise(function (resolve, reject) {
    var cbFunc = async function (data) {
      EnigmailLog.DEBUG("enigmailImportKeysFromUrl: _cbFunc()\n");
      var errorMsgObj = {};

      var preview = await EnigmailKey.getKeyListFromKeyBlock(
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
            true,
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
      var msgUri = Services.io.newURI(result.value.trim());

      var channel = EnigmailStreams.createChannel(msgUri);
      channel.asyncOpen(bufferListener, msgUri);
    } catch (ex) {
      var err = {
        value: ex,
      };
      reject(err);
    }
  });

  p.then(function (errorMsgObj) {
    var keyList = errorMsgObj.preview.map(function (a) {
      return a.id;
    });
    EnigmailDialog.keyImportDlg(window, keyList);
    refreshKeys();
  }).catch(async function (reason) {
    EnigmailDialog.alert(
      window,
      await document.l10n.formatValue("general-error", {
        reason: reason.value,
      })
    );
  });
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
    case "createdCol":
      return "created";
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

  window.browsingContext.topChromeWindow.openDialog(
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
          case "createdCol":
            return keyObj.created;
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
   * @returns Number: number of UIDs added
   */
  appendUids(uidType, keyNum, realRow, parentRow) {
    let keyObj = gKeyList[keyNum];
    let uidAdded = 0;

    for (let i = 0; i < keyObj.userIds.length; i++) {
      if (keyObj.userIds[i].type === uidType) {
        if (keyObj.userIds[i].userId == keyObj.userId) {
          continue;
        }
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
   * @returns array of keyNums (= display some keys) or null (= display ALL keys)
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
   * @returns array of keyNums (= display some keys) or null (= display ALL keys)
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
   * @returns Object: keyViewList entry of corresponding row
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
