/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EnigmailLocale = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
).EnigmailLocale;
var EnigmailWindows = ChromeUtils.import(
  "chrome://openpgp/content/modules/windows.jsm"
).EnigmailWindows;
var EnigmailKeyRing = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
).EnigmailKeyRing;
var EnigmailDialog = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
).EnigmailDialog;
var EnigmailData = ChromeUtils.import(
  "chrome://openpgp/content/modules/data.jsm"
).EnigmailData;
var { EnigmailOS } = ChromeUtils.import(
  "chrome://openpgp/content/modules/os.jsm"
);

function onLoad() {
  var dlg = document.getElementById("enigmailKeyImportInfo");

  let i, keys;

  dlg.getButton("help").setAttribute("hidden", "true");
  dlg.getButton("cancel").setAttribute("hidden", "true");
  dlg.getButton("extra1").setAttribute("hidden", "true");
  dlg.getButton("extra2").setAttribute("hidden", "true");
  document.l10n.setAttributes(dlg, "import-info-title");

  if (window.screen.width > 500) {
    dlg.setAttribute("maxwidth", window.screen.width - 150);
  }

  if (window.screen.height > 300) {
    dlg.setAttribute("maxheight", window.screen.height - 100);
  }

  var keyList = window.arguments[0].keyList;

  let onClickFunc = function(event) {
    let keyId = event.target.getAttribute("keyid");
    EnigmailWindows.openKeyDetails(window, keyId, false);
  };

  for (i = 0, keys = []; i < keyList.length; i++) {
    let keyId = keyList[i];

    if (keyId.search(/^0x/) === 0) {
      keyId = keyId.substr(2).toUpperCase();
    }
    let keyObj = EnigmailKeyRing.getKeyById(keyId);
    if (keyObj && keyObj.fpr) {
      let keyGroupBox = buildKeyGroupBox(keyObj);
      keyGroupBox
        .getElementsByClassName("enigmailKeyImportDetails")[0]
        .addEventListener("click", onClickFunc, true);
      keys.push(keyGroupBox);
    }
  }

  dlg.getButton("accept").focus();

  if (keys.length) {
    let keysInfoBox = document.getElementById("keyInfo"),
      keysGrid = document.createXULElement("grid"),
      keysRows = document.createXULElement("rows"),
      keysCols = document.createXULElement("columns");

    for (i = 0; i < 3; i++) {
      keysCols.appendChild(document.createXULElement("column"));
    }

    let keysRow;
    for (i = 0; i < keys.length; i++) {
      if (i % 3 === 0) {
        keysRow = document.createXULElement("row");
        keysRows.appendChild(keysRow);
      }
      keysRow.appendChild(keys[i]);
    }

    keysGrid.appendChild(keysRows);
    keysGrid.appendChild(keysCols);
    keysInfoBox.appendChild(keysGrid);
  } else {
    document.l10n.formatValue("import-info-no-keys").then(value => {
      EnigmailDialog.alert(window, value);
      setTimeout(window.close, 0);
    });
    return;
  }

  setTimeout(resizeDlg, 0);
}

function buildKeyGroupBox(keyObj) {
  let i,
    groupBox = document.createXULElement("vbox"),
    vbox = document.createXULElement("hbox"),
    //caption = document.createXULElement("image"),
    userid = document.createXULElement("label"),
    infoGrid = document.createXULElement("grid"),
    infoColumns = document.createXULElement("columns"),
    infoColId = document.createXULElement("column"),
    infoColDate = document.createXULElement("column"),
    infoRows = document.createXULElement("rows"),
    infoRowHead = document.createXULElement("row"),
    infoRowBody = document.createXULElement("row"),
    infoLabelH1 = document.createXULElement("label"),
    infoLabelH2 = document.createXULElement("label"),
    infoLabelH3 = document.createXULElement("label"),
    infoLabelB1 = document.createXULElement("label"),
    infoLabelB2 = document.createXULElement("label"),
    infoLabelB3 = document.createXULElement("label"),
    fprGrid = document.createXULElement("grid"),
    fprLabel = document.createXULElement("label"),
    fprColumns = document.createXULElement("columns"),
    fprRows = document.createXULElement("rows"),
    fprRow1 = document.createXULElement("row"),
    fprRow2 = document.createXULElement("row");

  groupBox.setAttribute("class", "enigmailGroupbox");
  userid.setAttribute("value", keyObj.userId);
  userid.setAttribute("class", "enigmailKeyImportUserId");
  vbox.setAttribute("align", "start");
  //caption.setAttribute("class", "enigmailKeyImportCaption");
  document.l10n.setAttributes(infoLabelH1, "import-info-bits");

  document.l10n.setAttributes(infoLabelH2, "import-info-created");
  infoLabelH3.setAttribute("value", "");
  infoLabelB1.setAttribute("value", keyObj.keySize);
  infoLabelB2.setAttribute("value", keyObj.created);

  infoRowHead.appendChild(infoLabelH1);
  infoRowHead.appendChild(infoLabelH2);
  infoRowHead.appendChild(infoLabelH3);
  infoRowHead.setAttribute("class", "enigmailKeyImportHeader");
  infoRowBody.appendChild(infoLabelB1);
  infoRowBody.appendChild(infoLabelB2);
  infoRows.appendChild(infoRowHead);
  infoRows.appendChild(infoRowBody);
  infoColumns.appendChild(infoColId);
  infoColumns.appendChild(infoColDate);
  infoGrid.appendChild(infoColumns);
  infoGrid.appendChild(infoRows);

  document.l10n.setAttributes(fprLabel, "import-info-fpr");

  fprLabel.setAttribute("class", "enigmailKeyImportHeader");
  for (i = 0; i < keyObj.fpr.length; i += 4) {
    var label = document.createXULElement("label");
    label.setAttribute("value", keyObj.fpr.substr(i, 4));
    if (i < keyObj.fpr.length / 2) {
      fprColumns.appendChild(document.createXULElement("column"));
      fprRow1.appendChild(label);
    } else {
      fprRow2.appendChild(label);
    }
  }

  fprRows.appendChild(fprRow1);
  fprRows.appendChild(fprRow2);
  fprGrid.appendChild(fprColumns);
  fprGrid.appendChild(fprRows);
  //vbox.appendChild(caption);
  groupBox.appendChild(vbox);
  groupBox.appendChild(userid);
  groupBox.appendChild(infoGrid);
  groupBox.appendChild(fprLabel);
  groupBox.appendChild(fprGrid);

  document.l10n.setAttributes(infoLabelB3, "import-info-details");
  infoLabelB3.setAttribute("keyid", keyObj.keyId);
  infoLabelB3.setAttribute("class", "enigmailKeyImportDetails");
  groupBox.appendChild(infoLabelB3);

  return groupBox;
}

function resizeDlg() {
  var txt = document.getElementById("keyInfo");
  var box = document.getElementById("outerbox");

  var deltaWidth = window.outerWidth - box.clientWidth;
  var newWidth = txt.scrollWidth + deltaWidth + 20;

  if (newWidth > window.screen.width - 50) {
    newWidth = window.screen.width - 50;
  }

  txt.style["white-space"] = "pre-wrap";
  window.outerWidth = newWidth;

  var textHeight = txt.scrollHeight;
  var boxHeight = box.clientHeight;
  var deltaHeight = window.outerHeight - boxHeight;

  var newHeight = textHeight + deltaHeight + 25;

  if (newHeight > window.screen.height - 100) {
    newHeight = window.screen.height - 100;
  }

  window.outerHeight = newHeight;
}

function centerDialog() {
  if (EnigmailOS.getOS() != "Darwin") {
    document.getElementById("enigmailKeyImportInfo").centerWindowOnScreen();
  }
}

function dlgClose(buttonNumber) {
  window.arguments[1].value = buttonNumber;
  window.close();
}

document.addEventListener("dialogaccept", function(event) {
  dlgClose(0);
});
