/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { UIFontSize } = ChromeUtils.importESModule(
  "resource:///modules/UIFontSize.sys.mjs"
);

var gAddButton;
var gRemoveButton;
var gHeaderInputElement;
var gArrayHdrs;
var gHdrsList;
var gContainer;
var gFilterBundle = null;
var gCustomBundle = null;

window.addEventListener("DOMContentLoaded", onLoad);
document.addEventListener("dialogaccept", onOk);
document.addEventListener("dialogextra1", onAddHeader);
document.addEventListener("dialogextra2", onRemoveHeader);

function onLoad() {
  const hdrs = Services.prefs.getCharPref("mailnews.customHeaders");
  gHeaderInputElement = document.getElementById("headerInput");
  gHeaderInputElement.focus();

  gHdrsList = document.getElementById("headerList");
  gArrayHdrs = [];
  gAddButton = document.getElementById("addButton");
  gRemoveButton = document.getElementById("removeButton");

  initializeDialog(hdrs);
  updateAddButton(true);
  updateRemoveButton();

  UIFontSize.registerWindow(window);
}

function initializeDialog(hdrs) {
  if (hdrs) {
    hdrs = hdrs.replace(/\s+/g, ""); // remove white spaces before splitting
    gArrayHdrs = hdrs.split(":");
    for (var i = 0; i < gArrayHdrs.length; i++) {
      if (!gArrayHdrs[i]) {
        // Remove any null elements.
        gArrayHdrs.splice(i, 1);
      }
    }
    initializeRows();
  }
}

function initializeRows() {
  for (var i = 0; i < gArrayHdrs.length; i++) {
    addRow(TrimString(gArrayHdrs[i]));
  }
}

function onTextInput() {
  // enable the add button if the user has started to type text
  updateAddButton(gHeaderInputElement.value == "");
}

function onOk() {
  if (gArrayHdrs.length) {
    var hdrs;
    if (gArrayHdrs.length == 1) {
      hdrs = gArrayHdrs;
    } else {
      hdrs = gArrayHdrs.join(": ");
    }
    Services.prefs.setCharPref("mailnews.customHeaders", hdrs);
    // flush prefs to disk, in case we crash, to avoid dataloss and problems with filters that use the custom headers
    Services.prefs.savePrefFile(null);
  } else {
    Services.prefs.clearUserPref("mailnews.customHeaders"); // clear the pref, no custom headers
  }

  window.arguments[0].selectedVal = gHdrsList.selectedItem
    ? gHdrsList.selectedItem.label
    : null;
}

function customHeaderOverflow() {
  if (
    gArrayHdrs.length >=
    Ci.nsMsgSearchAttrib.kNumMsgSearchAttributes -
      Ci.nsMsgSearchAttrib.OtherHeader -
      1
  ) {
    if (!gFilterBundle) {
      gFilterBundle = document.getElementById("bundle_filter");
    }

    var alertText = gFilterBundle.getString("customHeaderOverflow");
    Services.prompt.alert(window, null, alertText);
    return true;
  }
  return false;
}

function onAddHeader() {
  var newHdr = TrimString(gHeaderInputElement.value);

  if (!isRFC2822Header(newHdr)) {
    // if user entered an invalid rfc822 header field name, bail out.
    if (!gCustomBundle) {
      gCustomBundle = document.getElementById("bundle_custom");
    }

    var alertText = gCustomBundle.getString("colonInHeaderName");
    Services.prompt.alert(window, null, alertText);
    return;
  }

  gHeaderInputElement.value = "";
  if (!newHdr || customHeaderOverflow()) {
    return;
  }
  if (!duplicateHdrExists(newHdr)) {
    gArrayHdrs[gArrayHdrs.length] = newHdr;
    var newItem = addRow(newHdr);
    gHdrsList.selectItem(newItem); // make sure the new entry is selected in the tree
    // now disable the add button
    updateAddButton(true);
    gHeaderInputElement.focus(); // refocus the input field for the next custom header
  }
}

function isRFC2822Header(hdr) {
  var charCode;
  for (var i = 0; i < hdr.length; i++) {
    charCode = hdr.charCodeAt(i);
    // 58 is for colon and 33 and 126 are us-ascii bounds that should be used for header field name, as per rfc2822

    if (charCode < 33 || charCode == 58 || charCode > 126) {
      return false;
    }
  }
  return true;
}

function duplicateHdrExists(hdr) {
  for (var i = 0; i < gArrayHdrs.length; i++) {
    if (gArrayHdrs[i] == hdr) {
      return true;
    }
  }
  return false;
}

function onRemoveHeader() {
  var listitem = gHdrsList.selectedItems[0];
  if (!listitem) {
    return;
  }
  listitem.remove();
  var selectedHdr = listitem.firstElementChild.getAttribute("value").trim();
  for (let i = 0; i < gArrayHdrs.length; i++) {
    if (gArrayHdrs[i] == selectedHdr) {
      gArrayHdrs.splice(i, 1);
      break;
    }
  }
}

function addRow(newHdr) {
  return gHdrsList.appendItem(newHdr, "");
}

function updateAddButton(aDisable) {
  // only update the button if the disabled state changed
  if (aDisable == gAddButton.disabled) {
    return;
  }

  gAddButton.disabled = aDisable;
  document.querySelector("dialog").defaultButton = aDisable
    ? "accept"
    : "extra1";
}

function updateRemoveButton() {
  var headerSelected = gHdrsList.selectedItems.length > 0;
  gRemoveButton.disabled = !headerSelected;
  if (gRemoveButton.disabled) {
    gHeaderInputElement.focus();
  }
}

// Remove whitespace from both ends of a string
function TrimString(string) {
  if (!string) {
    return "";
  }
  return string.trim();
}
