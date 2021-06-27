/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported loadCalendarPublishDialog, closeDialog */

/* globals publishButtonLabel, closeButtonLabel */ // From publishDialog.xhtml

var gOnOkFunction; // function to be called when user clicks OK
var gPublishObject;

/**
 * Called when the dialog is loaded.
 */
function loadCalendarPublishDialog() {
  // Get arguments, see description at top of file

  let args = window.arguments[0];

  gOnOkFunction = args.onOk;

  if (args.publishObject) {
    gPublishObject = args.publishObject;
    if (args.publishObject.remotePath) {
      document.getElementById("publish-remotePath-textbox").value = args.publishObject.remotePath;
    }
  } else {
    gPublishObject = {};
  }
  document
    .querySelector("dialog")
    .getButton("accept")
    .setAttribute("label", publishButtonLabel);

  checkURLField();

  let firstFocus = document.getElementById("publish-remotePath-textbox");
  firstFocus.focus();
}

/**
 * Called when the OK button is clicked.
 */
function onOKCommand(event) {
  gPublishObject.remotePath = document.getElementById("publish-remotePath-textbox").value;

  // call caller's on OK function
  gOnOkFunction(gPublishObject, progressDialog);
  document
    .querySelector("dialog")
    .getButton("accept")
    .setAttribute("label", closeButtonLabel);
  document.removeEventListener("dialogaccept", onOKCommand);
  event.preventDefault();
}
document.addEventListener("dialogaccept", onOKCommand);

function checkURLField() {
  if (document.getElementById("publish-remotePath-textbox").value.length == 0) {
    document
      .querySelector("dialog")
      .getButton("accept")
      .setAttribute("disabled", "true");
  } else {
    document
      .querySelector("dialog")
      .getButton("accept")
      .removeAttribute("disabled");
  }
}

var progressDialog = {
  onStartUpload() {
    document.getElementById("publish-progressmeter").removeAttribute("value");
  },

  onStopUpload() {
    document.getElementById("publish-progressmeter").setAttribute("value", "0");
  },
};
progressDialog.wrappedJSObject = progressDialog;
