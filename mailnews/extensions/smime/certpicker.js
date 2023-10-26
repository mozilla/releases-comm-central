/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var dialogParams;
var itemCount = 0;

window.addEventListener("DOMContentLoaded", onLoad);

document.addEventListener("dialogaccept", doOK);
document.addEventListener("dialogcancel", doCancel);

function onLoad() {
  dialogParams = window.arguments[0].QueryInterface(Ci.nsIDialogParamBlock);

  var selectElement = document.getElementById("nicknames");
  itemCount = dialogParams.GetInt(0);

  var selIndex = dialogParams.GetInt(1);
  if (selIndex < 0) {
    selIndex = 0;
  }

  for (let i = 0; i < itemCount; i++) {
    const menuItemNode = document.createXULElement("menuitem");
    const nick = dialogParams.GetString(i);
    menuItemNode.setAttribute("value", i);
    menuItemNode.setAttribute("label", nick); // This is displayed.
    selectElement.menupopup.appendChild(menuItemNode);

    if (selIndex == i) {
      selectElement.selectedItem = menuItemNode;
    }
  }

  dialogParams.SetInt(0, 0); // Set cancel return value.
  setDetails();
}

function setDetails() {
  const selItem = document.getElementById("nicknames").value;
  if (selItem.length == 0) {
    return;
  }

  const index = parseInt(selItem);
  const details = dialogParams.GetString(index + itemCount);
  document.getElementById("details").value = details;
}

function onCertSelected() {
  setDetails();
}

function doOK() {
  // Signal that the user accepted.
  dialogParams.SetInt(0, 1);

  // Signal the index of the selected cert in the list of cert nicknames
  // provided.
  const index = parseInt(document.getElementById("nicknames").value);
  dialogParams.SetInt(1, index);
}

function doCancel() {
  dialogParams.SetInt(0, 0); // Signal that the user cancelled.
}
