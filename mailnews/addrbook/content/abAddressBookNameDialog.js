/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var gOkButton;
var gNameInput;
var gDirectory = null;

var kPersonalAddressbookURI = "jsaddrbook://abook.sqlite";
var kCollectedAddressbookURI = "jsaddrbook://history.sqlite";
var kAllDirectoryRoot = "moz-abdirectory://";

window.addEventListener("DOMContentLoaded", abNameOnLoad);

function abNameOnLoad() {
  // Get the document elements.
  gOkButton = document.querySelector("dialog").getButton("accept");
  gNameInput = document.getElementById("name");

  // look in arguments[0] for parameters to see if we have a directory or not
  if (
    "arguments" in window &&
    window.arguments[0] &&
    "selectedDirectory" in window.arguments[0]
  ) {
    gDirectory = window.arguments[0].selectedDirectory;
    gNameInput.value = gDirectory.dirName;
  }

  // Work out the window title (if we have a directory specified, then it's a
  // rename).
  var bundle = document.getElementById("bundle_addressBook");

  if (gDirectory) {
    const oldListName = gDirectory.dirName;
    document.title = bundle.getFormattedString("addressBookTitleEdit", [
      oldListName,
    ]);
  } else {
    document.title = bundle.getString("addressBookTitleNew");
  }

  if (
    gDirectory &&
    (gDirectory.URI == kCollectedAddressbookURI ||
      gDirectory.URI == kPersonalAddressbookURI ||
      gDirectory.URI == kAllDirectoryRoot + "?")
  ) {
    // Address book name is not editable, therefore disable the field and
    // only have an ok button that doesn't do anything.
    gNameInput.readOnly = true;
    document.querySelector("dialog").buttons = "accept";
  } else {
    document.addEventListener("dialogaccept", abNameOKButton);
    gNameInput.focus();
    abNameDoOkEnabling();
  }
}

function abNameOKButton(event) {
  const newDirName = gNameInput.value.trim();

  // Do not allow an already existing name.
  if (
    MailServices.ab.directoryNameExists(newDirName) &&
    (!gDirectory || newDirName != gDirectory.dirName)
  ) {
    const kAlertTitle = document
      .getElementById("bundle_addressBook")
      .getString("duplicateNameTitle");
    const kAlertText = document
      .getElementById("bundle_addressBook")
      .getFormattedString("duplicateNameText", [newDirName]);
    Services.prompt.alert(window, kAlertTitle, kAlertText);
    event.preventDefault();
    return;
  }

  // Either create a new directory or update an existing one depending on what
  // we were given when we started.
  if (gDirectory) {
    gDirectory.dirName = newDirName;
  } else {
    const dirPrefId = MailServices.ab.newAddressBook(
      newDirName,
      "",
      Ci.nsIAbManager.JS_DIRECTORY_TYPE
    );
    const directory = MailServices.ab.getDirectoryFromId(dirPrefId);
    window.arguments[0].newDirectoryUID = directory.UID;
    if ("onNewDirectory" in window.arguments[0]) {
      window.arguments[0].onNewDirectory(directory);
    }
  }
}

function abNameDoOkEnabling() {
  gOkButton.disabled = gNameInput.value.trim() == "";
}
