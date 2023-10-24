/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gOnOkFunction; // function to be called when user clicks OK
var gPublishObject;

window.addEventListener("DOMContentLoaded", loadCalendarPublishDialog);

/**
 * Called when the dialog is loaded.
 */
function loadCalendarPublishDialog() {
  let args = window.arguments[0];

  gOnOkFunction = args.onOk;

  if (args.publishObject) {
    gPublishObject = args.publishObject;
    if (
      args.publishObject.remotePath &&
      /^(https?|webcals?):\/\//.test(args.publishObject.remotePath)
    ) {
      document.getElementById("publish-remotePath-textbox").value = args.publishObject.remotePath;
    }
  } else {
    gPublishObject = {};
  }

  checkURLField();

  let firstFocus = document.getElementById("publish-remotePath-textbox");
  firstFocus.focus();
}

/**
 * Called when the OK button is clicked.
 */
function onOKCommand(event) {
  gPublishObject.remotePath = document
    .getElementById("publish-remotePath-textbox")
    .value.replace(/^webcal/, "http");

  // call caller's on OK function
  gOnOkFunction(gPublishObject, progressDialog);
  let dialog = document.querySelector("dialog");
  dialog.getButton("accept").setAttribute("label", dialog.getAttribute("buttonlabelaccept2"));
  event.preventDefault();
}
document.addEventListener("dialogaccept", onOKCommand, { once: true });

function checkURLField() {
  document.querySelector("dialog").getButton("accept").disabled = !document.getElementById(
    "publish-remotePath-textbox"
  ).validity.valid;
}

var progressDialog = {
  onStartUpload() {
    document.getElementById("publish-progressmeter").setAttribute("value", "0");
    document.querySelector("dialog").getButton("cancel").hidden = true;
  },

  onStopUpload(percentage) {
    document.getElementById("publish-progressmeter").setAttribute("value", percentage);
  },
};
progressDialog.wrappedJSObject = progressDialog;
