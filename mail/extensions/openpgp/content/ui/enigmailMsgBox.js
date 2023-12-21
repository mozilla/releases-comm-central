/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

window.addEventListener("load", onLoad);
window.addEventListener("keypress", onKeyPress);

function onLoad() {
  document.documentElement.style.minHeight = "120px";
  var dlg = document.getElementById("enigmailMsgBox");
  dlg.getButton("cancel").setAttribute("hidden", "true");
  dlg.getButton("extra1").setAttribute("hidden", "true");
  dlg.getButton("extra2").setAttribute("hidden", "true");

  document.getElementById("filler").style.maxWidth =
    screen.availWidth - 50 + "px";

  const args = window.arguments[0];
  const msgtext = args.msgtext;
  const button1 = args.button1;
  const button2 = args.button2;
  const button3 = args.button3;
  const buttonCancel = args.cancelButton;
  const checkboxLabel = args.checkboxLabel;

  if (args.iconType) {
    const icn = document.getElementById("infoImage");
    icn.removeAttribute("collapsed");
    let iconClass = "";

    switch (args.iconType) {
      case 2:
        iconClass = "question-icon";
        break;
      case 3:
        iconClass = "alert-icon";
        break;
      case 4:
        iconClass = "error-icon";
        break;
      default:
        iconClass = "message-icon";
    }
    icn.setAttribute("class", "spaced " + iconClass);
  }

  if (args.dialogTitle) {
    if (AppConstants.platform == "macosx") {
      const t = document.getElementById("macosDialogTitle");
      t.setAttribute("value", args.dialogTitle);
      t.removeAttribute("collapsed");
    }

    document.title = args.dialogTitle;
  } else {
    document.l10n.setAttributes(dlg, "enig-alert-title");
  }

  if (button1) {
    setButton("accept", button1);
  }
  if (button2) {
    setButton("extra1", button2);
  }
  if (button3) {
    setButton("extra2", button3);
  }
  if (buttonCancel) {
    setButton("cancel", buttonCancel);
  }

  if (checkboxLabel) {
    const checkboxElem = document.getElementById("theCheckBox");
    checkboxElem.setAttribute("label", checkboxLabel);
    document.getElementById("checkboxContainer").removeAttribute("hidden");
  }

  dlg.getButton("accept").focus();
  const textbox = document.getElementById("msgtext");
  textbox.appendChild(textbox.ownerDocument.createTextNode(msgtext));
}

function setButton(buttonId, label) {
  var labelType = buttonId;

  var dlg = document.getElementById("enigmailMsgBox");
  var elem = dlg.getButton(labelType);

  var i = label.indexOf(":");
  if (i === 0) {
    elem = dlg.getButton(label.substr(1));
    elem.setAttribute("hidden", "false");
    elem.setAttribute("oncommand", "dlgClose('" + buttonId + "')");
    return;
  }
  if (i > 0) {
    labelType = label.substr(0, i);
    label = label.substr(i + 1);
    elem = dlg.getButton(labelType);
  }
  i = label.indexOf("&");
  if (i >= 0) {
    var c = label.substr(i + 1, 1);
    if (c != "&") {
      elem.setAttribute("accesskey", c);
    }
    label = label.substr(0, i) + label.substr(i + 1);
  }
  elem.setAttribute("label", label);
  elem.setAttribute("oncommand", "dlgClose('" + buttonId + "')");
  elem.removeAttribute("hidden");
}

function dlgClose(buttonId) {
  let buttonNumber = 99;

  switch (buttonId) {
    case "accept":
      buttonNumber = 0;
      break;
    case "extra1":
      buttonNumber = 1;
      break;
    case "extra2":
      buttonNumber = 2;
      break;
    case "cancel":
      buttonNumber = -1;
  }

  window.arguments[1].value = buttonNumber;
  window.arguments[1].checked =
    document.getElementById("theCheckBox").getAttribute("checked") == "true";
  window.close();
}

function checkboxCb() {
  // do nothing
}

async function copyToClipbrd() {
  const s = window.getSelection().toString();
  return navigator.clipboard.writeText(s);
}

function onKeyPress(event) {
  if (event.key == "c" && event.getModifierState("Accel")) {
    copyToClipbrd();
    event.stopPropagation();
  }
}

document.addEventListener("dialogaccept", function (event) {
  dlgClose("accept");
});
