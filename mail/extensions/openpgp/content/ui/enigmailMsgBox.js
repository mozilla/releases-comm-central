/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var { EnigmailClipboard } = ChromeUtils.import(
  "chrome://openpgp/content/modules/clipboard.jsm"
);
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

function onLoad() {
  var dlg = document.getElementById("enigmailMsgBox");
  dlg.getButton("help").setAttribute("hidden", "true");
  dlg.getButton("cancel").setAttribute("hidden", "true");
  dlg.getButton("extra1").setAttribute("hidden", "true");
  dlg.getButton("extra2").setAttribute("hidden", "true");

  document.getElementById("filler").maxWidth = screen.availWidth - 50;
  //dlg.maxHeight = screen.availHeight;

  let args = window.arguments[0];
  let msgtext = args.msgtext;
  let button1 = args.button1;
  let button2 = args.button2;
  let button3 = args.button3;
  let buttonCancel = args.cancelButton;
  let checkboxLabel = args.checkboxLabel;

  if (args.iconType) {
    let icn = document.getElementById("infoImage");
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
      let t = document.getElementById("macosDialogTitle");
      t.setAttribute("value", args.dialogTitle);
      t.removeAttribute("collapsed");
    }

    dlg.setAttribute("title", args.dialogTitle);
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
    let checkboxElem = document.getElementById("theCheckBox");
    checkboxElem.setAttribute("label", checkboxLabel);
    document.getElementById("checkboxContainer").removeAttribute("hidden");
  }

  dlg.getButton("accept").focus();
  let textbox = document.getElementById("msgtext");
  textbox.appendChild(textbox.ownerDocument.createTextNode(msgtext));

  window.addEventListener("keypress", onKeyPress);
  setTimeout(resizeDlg, 0);
}

function resizeDlg() {
  let availHeight = screen.availHeight;
  if (window.outerHeight > availHeight - 100) {
    let box = document.getElementById("msgContainer");
    let dlg = document.getElementById("enigmailMsgBox");
    let btnHeight = dlg.getButton("accept").parentNode.clientHeight + 20;
    let boxHeight = box.clientHeight;
    let dlgHeight = dlg.clientHeight;

    box.setAttribute("style", "overflow: auto;");
    box.setAttribute(
      "height",
      boxHeight - btnHeight - (dlgHeight - availHeight)
    );
    window.outerHeight = availHeight;
  }
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

function copyToClipbrd() {
  let s = window.getSelection().toString();

  EnigmailClipboard.setClipboardContent(s);
}

function onKeyPress(event) {
  if (event.key == "c" && event.getModifierState("Accel")) {
    copyToClipbrd();
    event.stopPropagation();
  }
}

document.addEventListener("dialogaccept", function(event) {
  dlgClose("accept");
});
