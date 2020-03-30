/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* global EnigmailLog: false, EnigmailLocale: false, EnigmailKey: false, EnigmailKeyRing: false */

// from enigmailCommon.js:
/* global GetEnigmailSvc: false, EnigAlert: false, EnigConvertGpgToUnicode: false */
/* global EnigCleanGuiList: false, EnigGetTrustLabel: false, EnigShowPhoto: false, EnigSignKey: false */
/* global EnigEditKeyExpiry: false, EnigEditKeyTrust: false, EnigChangeKeyPwd: false, EnigRevokeKey: false */
/* global EnigCreateRevokeCert: false, EnigmailTimer: false */

// from enigmailKeyManager.js:
/* global keyMgrAddPhoto: false, EnigmailCompat: false */

"use strict";

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var { uidHelper } = ChromeUtils.import(
  "chrome://openpgp/content/modules/uidHelper.jsm"
);
const { PgpSqliteDb2 } = ChromeUtils.import(
  "chrome://openpgp/content/modules/sqliteDb.jsm"
);

var gKeyId = null;
var gUserId = null;
var gKeyList = null;
var gTreeFuncs = null;

var gAllEmails = [];
var gFingerprint = "";

var gAcceptanceRadio = null;
var gOriginalAcceptance;
var gUpdateAllowed = false;

async function onLoad() {
  window.arguments[1].refresh = false;

  gAcceptanceRadio = document.getElementById("acceptanceRadio");

  gKeyId = window.arguments[0].keyId;

  let accept = document
    .getElementById("enigmailKeyDetailsDlg")
    .getButton("accept");
  accept.focus();

  await reloadData();
}

/***
 * Set the label text of a HTML element
 */

function setText(elementId, label) {
  let node = document.getElementById(elementId);
  node.textContent = label;
}

function setLabel(elementId, label) {
  let node = document.getElementById(elementId);
  node.setAttribute("value", label);
}

async function reloadData() {
  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    EnigAlert(EnigmailLocale.getString("accessError"));
    window.close();
    return;
  }

  gUserId = null;

  var treeChildren = document.getElementById("keyListChildren");
  var uidList = document.getElementById("additionalUid");

  // clean lists
  EnigCleanGuiList(treeChildren);
  EnigCleanGuiList(uidList);

  let keyObj = EnigmailKeyRing.getKeyById(gKeyId);
  if (keyObj) {
    let keyIsExpired =
      keyObj.expiryTime && keyObj.expiryTime < Math.floor(Date.now() / 1000);

    let acceptanceIntroText = "";
    if (keyObj.secretAvailable) {
      setLabel("keyType", EnigmailLocale.getString("keyTypePair2"));
      document.getElementById("ownKeyCommands").removeAttribute("hidden");
      acceptanceIntroText = EnigmailLocale.getString("keyAutoAcceptPersonal");
    } else {
      document.getElementById("ownKeyCommands").setAttribute("hidden", "true");
      setLabel("keyType", EnigmailLocale.getString("keyTypePublic"));

      let isStillValid = !(
        keyObj.keyTrust == "r" ||
        keyObj.keyTrust == "e" ||
        keyIsExpired
      );
      if (isStillValid) {
        document
          .getElementById("acceptanceRadio")
          .setAttribute("hidden", "false");
        acceptanceIntroText = EnigmailLocale.getString("keyDoYouAccept");
        gUpdateAllowed = true;

        let acceptanceResult = {};
        await PgpSqliteDb2.getFingerprintAcceptance(
          null,
          keyObj.fpr,
          acceptanceResult
        );

        if (
          "fingerprintAcceptance" in acceptanceResult &&
          acceptanceResult.fingerprintAcceptance != "undecided"
        ) {
          gOriginalAcceptance = acceptanceResult.fingerprintAcceptance;
        } else {
          gOriginalAcceptance = "undecided";
        }
        gAcceptanceRadio.value = gOriginalAcceptance;
      }
    }

    if (keyObj.hasSubUserIds()) {
      document.getElementById("alsoknown").removeAttribute("collapsed");
      createUidData(uidList, keyObj);
    } else {
      document.getElementById("alsoknown").setAttribute("collapsed", "true");
    }

    if (keyObj.signatures) {
      let sigListViewObj = new SigListView(keyObj);
      let tree = document.getElementById("signatures_tree");
      tree.view = sigListViewObj;
      gTreeFuncs = EnigmailCompat.getTreeCompatibleFuncs(tree, sigListViewObj);
    }

    let subkeyListViewObj = new SubkeyListView(keyObj);
    document.getElementById("subkeyList").view = subkeyListViewObj;

    gUserId = keyObj.userId;

    let splitUid = {};
    uidHelper.getPartsFromUidStr(keyObj.userId, splitUid);
    if (splitUid.email) {
      gAllEmails.push(splitUid.email);
    }

    setLabel("userId", gUserId);
    setLabel("keyCreated", keyObj.created);

    let expiryInfo;
    if (keyObj.keyTrust == "r") {
      expiryInfo = EnigmailLocale.getString("keyRevoked");
      acceptanceIntroText = expiryInfo;
    } else if (keyObj.keyTrust == "e" || keyIsExpired) {
      expiryInfo = EnigmailLocale.getString("keyExpired", keyObj.expiry);
      acceptanceIntroText = expiryInfo;
    } else if (keyObj.expiry.length === 0) {
      expiryInfo = EnigmailLocale.getString("keyDoesNotExpire");
    } else {
      expiryInfo = keyObj.expiry;
    }

    setText("acceptanceIntro", acceptanceIntroText);
    setLabel("keyExpiry", expiryInfo);
    if (keyObj.fpr) {
      gFingerprint = keyObj.fpr;
      setLabel("fingerprint", EnigmailKey.formatFpr(keyObj.fpr));
    }
  }
}

function createUidData(listNode, keyDetails) {
  for (let i = 1; i < keyDetails.userIds.length; i++) {
    if (keyDetails.userIds[i].type === "uid") {
      let item = listNode.appendItem(keyDetails.userIds[i].userId);
      item.setAttribute("label", keyDetails.userIds[i].userId);
      if ("dre".search(keyDetails.userIds[i].keyTrust) >= 0) {
        item.setAttribute("class", "enigmailDisabled");
      }

      let splitUid = {};
      uidHelper.getPartsFromUidStr(keyDetails.userIds[i].userId, splitUid);
      if (splitUid.email) {
        gAllEmails.push(splitUid.email);
      }
    }
  }
}

function getTrustLabel(trustCode) {
  var trustTxt = EnigGetTrustLabel(trustCode);
  if (trustTxt == "-" || trustTxt.length === 0) {
    trustTxt = EnigmailLocale.getString("keyValid.unknown");
  }
  return trustTxt;
}

function setAttr(attribute, value) {
  var elem = document.getElementById(attribute);
  if (elem) {
    elem.value = value;
  }
}

function enableRefresh() {
  window.arguments[1].refresh = true;
}

// ------------------ onCommand Functions  -----------------

/*
function signKey() {
  if (EnigSignKey(gUserId, gKeyId, null)) {
    enableRefresh();
    reloadData();
  }
}

function changeExpirationDate() {
  if (EnigEditKeyExpiry([gUserId], [gKeyId])) {
    enableRefresh();
    reloadData();
  }
}
*/

/*
function manageUids() {
  let keyObj = EnigmailKeyRing.getKeyById(gKeyId);

  var inputObj = {
    keyId: keyObj.keyId,
    ownKey: keyObj.secretAvailable,
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
    enableRefresh();
    reloadData();
  }
}
*/

/*
function changePassword() {
  EnigChangeKeyPwd(gKeyId, gUserId);
}
*/

async function revokeKey() {
  /*
  EnigRevokeKey(gKeyId, gUserId, function(success) {
    if (success) {
      enableRefresh();
      await reloadData();
    }
  });
  */
}

function genRevocationCert() {
  EnigCreateRevokeCert(gKeyId, gUserId);
}

function SigListView(keyObj) {
  this.keyObj = [];

  let sigObj = keyObj.signatures;
  for (let i in sigObj) {
    let k = {
      uid: sigObj[i].userId,
      keyId: sigObj[i].keyId,
      created: sigObj[i].created,
      expanded: true,
      sigList: [],
    };

    for (let j in sigObj[i].sigList) {
      let s = sigObj[i].sigList[j];
      k.sigList.push({
        uid: s.userId,
        created: s.created,
        keyId: s.signerKeyId,
        sigType: s.sigType,
      });
    }
    this.keyObj.push(k);
  }

  this.prevKeyObj = null;
  this.prevRow = -1;

  this.updateRowCount();
}

// implements nsITreeView
SigListView.prototype = {
  updateRowCount() {
    let rc = 0;

    for (let i in this.keyObj) {
      rc += this.keyObj[i].expanded ? this.keyObj[i].sigList.length + 1 : 1;
    }

    this.rowCount = rc;
  },

  setLastKeyObj(keyObj, row) {
    this.prevKeyObj = keyObj;
    this.prevRow = row;
    return keyObj;
  },

  getSigAtIndex(row) {
    if (this.lastIndex == row) {
      return this.lastKeyObj;
    }

    let j = 0,
      l = 0;

    for (let i in this.keyObj) {
      if (j === row) {
        return this.setLastKeyObj(this.keyObj[i], row);
      }
      j++;

      if (this.keyObj[i].expanded) {
        l = this.keyObj[i].sigList.length;

        if (j + l >= row && row - j < l) {
          return this.setLastKeyObj(this.keyObj[i].sigList[row - j], row);
        }
        j += l;
      }
    }

    return null;
  },

  getCellText(row, column) {
    let s = this.getSigAtIndex(row);

    if (s) {
      switch (column.id) {
        case "sig_uid_col":
          return s.uid;
        case "sig_keyid_col":
          return s.keyId;
        case "sig_created_col":
          return s.created;
      }
    }

    return "";
  },

  setTree(treebox) {
    this.treebox = treebox;
  },

  isContainer(row) {
    let s = this.getSigAtIndex(row);
    return "sigList" in s;
  },

  isSeparator(row) {
    return false;
  },

  isSorted() {
    return false;
  },

  getLevel(row) {
    let s = this.getSigAtIndex(row);
    return "sigList" in s ? 0 : 1;
  },

  cycleHeader(col, elem) {},

  getImageSrc(row, col) {
    return null;
  },

  getRowProperties(row, props) {},

  getCellProperties(row, col) {
    if (col.id === "sig_keyid_col") {
      return "fixedWidthFont";
    }

    return "";
  },

  canDrop(row, orientation, data) {
    return false;
  },

  getColumnProperties(colid, col, props) {},

  isContainerEmpty(row) {
    return false;
  },

  getParentIndex(idx) {
    return -1;
  },

  getProgressMode(row, col) {},

  isContainerOpen(row) {
    let s = this.getSigAtIndex(row);
    return s.expanded;
  },

  isSelectable(row, col) {
    return true;
  },

  toggleOpenState(row) {
    let s = this.getSigAtIndex(row);
    s.expanded = !s.expanded;
    let r = this.rowCount;
    this.updateRowCount();
    gTreeFuncs.rowCountChanged(row, this.rowCount - r);
  },
};

function createSubkeyItem(subkey) {
  // Get expiry state of this subkey
  let expire;
  if (subkey.keyTrust === "r") {
    expire = EnigmailLocale.getString("keyValid.revoked");
  } else if (subkey.expiryTime === 0) {
    expire = EnigmailLocale.getString("keyExpiryNever");
  } else {
    expire = subkey.expiry;
  }

  let subkeyType =
    subkey.type === "pub"
      ? EnigmailLocale.getString("keyTypePrimary")
      : EnigmailLocale.getString("keyTypeSubkey");

  let usagetext = "";
  let i;
  //  e = encrypt
  //  s = sign
  //  c = certify
  //  a = authentication
  //  Capital Letters are ignored, as these reflect summary properties of a key

  var singlecode = "";
  for (i = 0; i < subkey.keyUseFor.length; i++) {
    singlecode = subkey.keyUseFor.substr(i, 1);
    switch (singlecode) {
      case "e":
        if (usagetext.length > 0) {
          usagetext = usagetext + ", ";
        }
        usagetext = usagetext + EnigmailLocale.getString("keyUsageEncrypt");
        break;
      case "s":
        if (usagetext.length > 0) {
          usagetext = usagetext + ", ";
        }
        usagetext = usagetext + EnigmailLocale.getString("keyUsageSign");
        break;
      case "c":
        if (usagetext.length > 0) {
          usagetext = usagetext + ", ";
        }
        usagetext = usagetext + EnigmailLocale.getString("keyUsageCertify");
        break;
      case "a":
        if (usagetext.length > 0) {
          usagetext = usagetext + ", ";
        }
        usagetext =
          usagetext + EnigmailLocale.getString("keyUsageAuthentication");
        break;
    } // * case *
  } // * for *

  let keyObj = {
    keyType: subkeyType,
    keyId: "0x" + subkey.keyId,
    algo: subkey.algoSym,
    size: subkey.keySize,
    creationDate: subkey.created,
    expiry: expire,
    usage: usagetext,
  };

  return keyObj;
}

function SubkeyListView(keyObj) {
  this.subkeys = [];
  this.rowCount = keyObj.subKeys.length + 1;
  this.subkeys.push(createSubkeyItem(keyObj));

  for (let i = 0; i < keyObj.subKeys.length; i++) {
    this.subkeys.push(createSubkeyItem(keyObj.subKeys[i]));
  }
}

// implements nsITreeView
SubkeyListView.prototype = {
  getCellText(row, column) {
    let s = this.subkeys[row];

    if (s) {
      switch (column.id) {
        case "keyTypeCol":
          return s.keyType;
        case "keyIdCol":
          return s.keyId;
        case "algoCol":
          return s.algo;
        case "sizeCol":
          return s.size;
        case "createdCol":
          return s.creationDate;
        case "expiryCol":
          return s.expiry;
        case "keyUsageCol":
          return s.usage;
      }
    }

    return "";
  },

  setTree(treebox) {
    this.treebox = treebox;
  },

  isContainer(row) {
    return false;
  },

  isSeparator(row) {
    return false;
  },

  isSorted() {
    return false;
  },

  getLevel(row) {
    return 0;
  },

  cycleHeader(col, elem) {},

  getImageSrc(row, col) {
    return null;
  },

  getRowProperties(row, props) {},

  getCellProperties(row, col) {
    return "";
  },

  canDrop(row, orientation, data) {
    return false;
  },

  getColumnProperties(colid, col, props) {},

  isContainerEmpty(row) {
    return false;
  },

  getParentIndex(idx) {
    return -1;
  },

  getProgressMode(row, col) {},

  isContainerOpen(row) {
    return false;
  },

  isSelectable(row, col) {
    return true;
  },

  toggleOpenState(row) {},
};

function sigHandleDblClick(event) {}

function onAccept() {
  if (gUpdateAllowed && gAcceptanceRadio.value != gOriginalAcceptance) {
    PgpSqliteDb2.updateAcceptance(
      gFingerprint,
      gAllEmails,
      gAcceptanceRadio.value
    );
  }
  return true;
}

document.addEventListener("dialogaccept", function(event) {
  if (!onAccept()) {
    event.preventDefault();
  } // Prevent the dialog closing.
});
