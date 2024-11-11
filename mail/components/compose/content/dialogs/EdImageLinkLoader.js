/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from EdDialogCommon.js */

var gMsgCompProcessLink = false;
var gMsgCompInputElement = null;
var gMsgCompPrevInputValue = null;
var gMsgCompPrevMozDoNotSendAttribute;
var gMsgCompAttachSourceElement = null;

window.addEventListener("load", OnLoadDialog);
document.addEventListener("dialogaccept", OnAcceptDialog, true);

function OnLoadDialog() {
  gMsgCompAttachSourceElement = document.getElementById("AttachSourceToMail");
  var editor = GetCurrentEditor();
  if (
    gMsgCompAttachSourceElement &&
    editor &&
    editor.flags & Ci.nsIEditor.eEditorMailMask
  ) {
    // initialize the AttachSourceToMail checkbox
    gMsgCompAttachSourceElement.hidden = false;

    switch (document.querySelector("dialog").id) {
      case "imageDlg":
        gMsgCompInputElement = gDialog.srcInput;
        gMsgCompProcessLink = false;
        break;
      case "linkDlg":
        gMsgCompInputElement = gDialog.hrefInput;
        gMsgCompProcessLink = true;
        break;
    }
    if (gMsgCompInputElement) {
      SetAttachCheckbox();
      gMsgCompPrevMozDoNotSendAttribute =
        globalElement.getAttribute("moz-do-not-send");
    }
  }
}

function OnAcceptDialog() {
  // Auto-convert file URLs to data URLs. If we're in the link properties
  // dialog convert only when requested - for the image dialog do it always.
  if (
    /^file:/i.test(gMsgCompInputElement.value.trim()) &&
    (gMsgCompAttachSourceElement.checked || !gMsgCompProcessLink)
  ) {
    var dataURI = GenerateDataURL(gMsgCompInputElement.value.trim());
    gMsgCompInputElement.value = dataURI;
    gMsgCompAttachSourceElement.checked = true;
  }
  DoAttachSourceCheckbox();
}

function SetAttachCheckbox() {
  var resetCheckbox = false;
  var mozDoNotSend = globalElement.getAttribute("moz-do-not-send");

  // In case somebody played with the advanced property and changed the moz-do-not-send attribute
  if (mozDoNotSend != gMsgCompPrevMozDoNotSendAttribute) {
    gMsgCompPrevMozDoNotSendAttribute = mozDoNotSend;
    resetCheckbox = true;
  }

  // Has the URL changed
  if (
    gMsgCompInputElement &&
    gMsgCompInputElement.value != gMsgCompPrevInputValue
  ) {
    gMsgCompPrevInputValue = gMsgCompInputElement.value;
    resetCheckbox = true;
  }

  if (gMsgCompInputElement && resetCheckbox) {
    // Here is the rule about how to set the checkbox Attach Source To Message:
    // If the attribute "moz-do-not-send" has not been set, we look at the scheme of the URL
    // and at some preference to decide what is the best for the user.
    // If it is set to "false", the checkbox is checked, otherwise unchecked.
    var attach = false;
    if (mozDoNotSend == null) {
      // We haven't yet set the "moz-do-not-send" attribute.
      var inputValue = gMsgCompInputElement.value.trim();
      if (/^(file|data):/i.test(inputValue)) {
        // For files or data URLs, default to attach them.
        attach = true;
      } else if (
        !gMsgCompProcessLink && // Implies image dialogue.
        /^https?:/i.test(inputValue)
      ) {
        // For images loaded via http(s) we default to the preference value.
        attach = Services.prefs.getBoolPref("mail.compose.attach_http_images");
      }
    } else {
      attach = mozDoNotSend == "false";
    }

    gMsgCompAttachSourceElement.checked = attach;
  }
}

function DoAttachSourceCheckbox() {
  gMsgCompPrevMozDoNotSendAttribute =
    (!gMsgCompAttachSourceElement.checked).toString();
  globalElement.setAttribute(
    "moz-do-not-send",
    gMsgCompPrevMozDoNotSendAttribute
  );
}

function GenerateDataURL(url) {
  var file = Services.io.newURI(url).QueryInterface(Ci.nsIFileURL).file;
  var contentType = Cc["@mozilla.org/mime;1"]
    .getService(Ci.nsIMIMEService)
    .getTypeFromFile(file);
  var inputStream = Cc[
    "@mozilla.org/network/file-input-stream;1"
  ].createInstance(Ci.nsIFileInputStream);
  inputStream.init(file, 0x01, 0o600, 0);
  var stream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
    Ci.nsIBinaryInputStream
  );
  stream.setInputStream(inputStream);
  let data = "";
  while (stream.available() > 0) {
    data += stream.readBytes(stream.available());
  }
  const encoded = btoa(data);
  stream.close();
  return (
    "data:" +
    contentType +
    ";filename=" +
    encodeURIComponent(file.leafName) +
    ";base64," +
    encoded
  );
}
