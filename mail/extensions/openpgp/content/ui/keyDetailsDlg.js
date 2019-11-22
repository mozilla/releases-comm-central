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

var Cu = Components.utils;
var Cc = Components.classes;
var Ci = Components.interfaces;

var gKeyId = null;
var gUserId = null;
var gKeyList = null;
var gTreeFuncs = null;

function onLoad() {
  window.arguments[1].refresh = false;

  gKeyId = window.arguments[0].keyId;

  let accept = document.getElementById("enigmailKeyDetailsDlg").getButton("accept");
  accept.focus();

  reloadData();
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

function reloadData() {
  var enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    EnigAlert(EnigmailLocale.getString("accessError"));
    window.close();
    return;
  }
  var exitCodeObj = {};
  var statusFlagsObj = {};
  var errorMsgObj = {};

  gUserId = null;

  var fingerprint = "";
  var subKeyLen = "";
  var subAlgo = "";
  var treeChildren = document.getElementById("keyListChildren");
  var uidList = document.getElementById("additionalUid");
  var photoImg = document.getElementById("photoIdImg");

  // clean lists
  EnigCleanGuiList(treeChildren);
  EnigCleanGuiList(uidList);

  let keyObj = EnigmailKeyRing.getKeyById(gKeyId);
  if (keyObj) {

    if (keyObj.secretAvailable) {
      setLabel("keyType", EnigmailLocale.getString("keyTypePair"));
      document.getElementById("ownKeyCommands").removeAttribute("hidden");
    } else {
      document.getElementById("ownKeyCommands").setAttribute("hidden", "true");
      setLabel("keyType", EnigmailLocale.getString("keyTypePublic"));
    }

    if (keyObj.photoAvailable === true) {
      let pFile = keyObj.getPhotoFile(0);

      if (pFile && pFile.isFile() && pFile.isReadable()) {
        const photoUri = Cc["@mozilla.org/network/io-service;1"].
        getService(Ci.nsIIOService).newFileURI(pFile).spec;

        photoImg.setAttribute("src", photoUri);
        photoImg.removeAttribute("hidden");
      }
    } else {
      photoImg.setAttribute("hidden", "true");
    }

    if (keyObj.isOwnerTrustUseful()) {
      document.getElementById("setOwnerTrust").removeAttribute("collapsed");
    } else {
      document.getElementById("setOwnerTrust").setAttribute("collapsed", "true");
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
    let expiryDate = keyObj.expiry;
    if (expiryDate.length === 0) {
      expiryDate = EnigmailLocale.getString("keyDoesNotExpire");
    }
    setLabel("userId", gUserId);
    setText("keyValidity", getTrustLabel(keyObj.keyTrust));
    setText("ownerTrust", getTrustLabel(keyObj.ownerTrust));
    setText("keyCreated", keyObj.created);
    setText("keyExpiry", expiryDate);
    if (keyObj.fpr) {
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

function showPhoto() {
  EnigShowPhoto(gKeyId, gUserId, 0);
}

function keyDetailsAddPhoto() {
  keyMgrAddPhoto(gUserId, gKeyId);
}

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


function setOwnerTrust() {

  if (EnigEditKeyTrust([gUserId], [gKeyId])) {
    enableRefresh();
    reloadData();
  }
}

function manageUids() {
  let keyObj = EnigmailKeyRing.getKeyById(gKeyId);

  var inputObj = {
    keyId: keyObj.keyId,
    ownKey: keyObj.secretAvailable
  };

  var resultObj = {
    refresh: false
  };
  window.openDialog("chrome://openpgp/content/ui/enigmailManageUidDlg.xul",
    "", "dialog,modal,centerscreen,resizable=yes", inputObj, resultObj);
  if (resultObj.refresh) {
    enableRefresh();
    reloadData();
  }
}

function changePassword() {
  EnigChangeKeyPwd(gKeyId, gUserId);
}

function revokeKey() {
  EnigRevokeKey(gKeyId, gUserId, function _revokeKeyCb(success) {
    if (success) {
      enableRefresh();
      reloadData();
    }
  });
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
      fpr: sigObj[i].fpr,
      created: sigObj[i].created,
      expanded: true,
      sigList: []
    };

    for (let j in sigObj[i].sigList) {
      let s = sigObj[i].sigList[j];
      if (s.sigKnown) {
        let sig = EnigmailKeyRing.getKeyById(s.signerKeyId);
        k.sigList.push({
          uid: s.userId,
          created: s.created,
          fpr: sig ? sig.fpr : "",
          sigType: s.sigType
        });
      }
    }
    this.keyObj.push(k);
  }

  this.prevKeyObj = null;
  this.prevRow = -1;

  this.updateRowCount();
}

// implements nsITreeView
SigListView.prototype = {

  updateRowCount: function() {
    let rc = 0;

    for (let i in this.keyObj) {
      rc += this.keyObj[i].expanded ? this.keyObj[i].sigList.length + 1 : 1;
    }

    this.rowCount = rc;
  },

  setLastKeyObj: function(keyObj, row) {
    this.prevKeyObj = keyObj;
    this.prevRow = row;
    return keyObj;
  },

  getSigAtIndex: function(row) {
    if (this.lastIndex == row) {
      return this.lastKeyObj;
    }

    let j = 0,
      l = 0;

    for (let i in this.keyObj) {
      if (j === row) return this.setLastKeyObj(this.keyObj[i], row);
      j++;

      if (this.keyObj[i].expanded) {
        l = this.keyObj[i].sigList.length;

        if (j + l >= row && row - j < l) {
          return this.setLastKeyObj(this.keyObj[i].sigList[row - j], row);
        } else {
          j += l;
        }
      }
    }

    return null;
  },

  getCellText: function(row, column) {
    let s = this.getSigAtIndex(row);

    if (s) {
      switch (column.id) {
        case "sig_uid_col":
          return s.uid;
        case "sig_fingerprint_col":
          return EnigmailKey.formatFpr(s.fpr);
        case "sig_created_col":
          return s.created;
      }
    }

    return "";
  },

  setTree: function(treebox) {
    this.treebox = treebox;
  },

  isContainer: function(row) {
    let s = this.getSigAtIndex(row);
    return ("sigList" in s);
  },

  isSeparator: function(row) {
    return false;
  },

  isSorted: function() {
    return false;
  },

  getLevel: function(row) {
    let s = this.getSigAtIndex(row);
    return ("sigList" in s ? 0 : 1);
  },

  cycleHeader: function(col, elem) {},

  getImageSrc: function(row, col) {
    return null;
  },

  getRowProperties: function(row, props) {},

  getCellProperties: function(row, col) {
    if (col.id === "sig_fingerprint_col") {
      return "fixedWidthFont";
    }

    return "";
  },

  canDrop: function(row, orientation, data) {
    return false;
  },

  getColumnProperties: function(colid, col, props) {},

  isContainerEmpty: function(row) {
    return false;
  },

  getParentIndex: function(idx) {
    return -1;
  },

  getProgressMode: function(row, col) {},

  isContainerOpen: function(row) {
    let s = this.getSigAtIndex(row);
    return s.expanded;
  },

  isSelectable: function(row, col) {
    return true;
  },

  toggleOpenState: function(row) {
    let s = this.getSigAtIndex(row);
    s.expanded = !s.expanded;
    let r = this.rowCount;
    this.updateRowCount();
    gTreeFuncs.rowCountChanged(row, this.rowCount - r);
  }
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

  let subkeyType = subkey.type === "pub" ? EnigmailLocale.getString("keyTypePrimary") :
    EnigmailLocale.getString("keyTypeSubkey");

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
        usagetext = usagetext + EnigmailLocale.getString("keyUsageAuthentication");
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
    usage: usagetext
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

  getCellText: function(row, column) {
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

  setTree: function(treebox) {
    this.treebox = treebox;
  },

  isContainer: function(row) {
    return false;
  },

  isSeparator: function(row) {
    return false;
  },

  isSorted: function() {
    return false;
  },

  getLevel: function(row) {
    return 0;
  },

  cycleHeader: function(col, elem) {},

  getImageSrc: function(row, col) {
    return null;
  },

  getRowProperties: function(row, props) {},

  getCellProperties: function(row, col) {
    return "";
  },

  canDrop: function(row, orientation, data) {
    return false;
  },

  getColumnProperties: function(colid, col, props) {},

  isContainerEmpty: function(row) {
    return false;
  },

  getParentIndex: function(idx) {
    return -1;
  },

  getProgressMode: function(row, col) {},

  isContainerOpen: function(row) {
    return false;
  },

  isSelectable: function(row, col) {
    return true;
  },

  toggleOpenState: function(row) {}
};
