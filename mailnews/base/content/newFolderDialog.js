/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var FOLDERS = 1;
var MESSAGES = 2;
var dialog;
var { UIFontSize } = ChromeUtils.importESModule(
  "resource:///modules/UIFontSize.sys.mjs"
);

window.addEventListener("load", onLoad);
document.addEventListener("dialogaccept", onOK);

function onLoad() {
  var windowArgs = window.arguments[0];

  dialog = {};

  dialog.nameField = document.getElementById("name");
  dialog.nameField.focus();

  // call this when OK is pressed
  dialog.okCallback = windowArgs.okCallback;

  // pre select the folderPicker, based on what they selected in the folder pane
  dialog.folder = windowArgs.folder;
  dialog.folderSelected = document
    .getElementById("MsgNewFolderPopup")
    .selectFolder(windowArgs.folder);

  // can folders contain both folders and messages?
  if (windowArgs.dualUseFolders) {
    dialog.folderType = FOLDERS | MESSAGES;

    // hide the section when folder contain both folders and messages.
    var newFolderTypeBox = document.getElementById("newFolderTypeBox");
    newFolderTypeBox.toggleAttribute("hidden", true);
  } else {
    // set our folder type by calling the default selected type's oncommand
    document.getElementById("folderGroup").selectedItem.doCommand();
  }

  // Handle enabling/disabling of the OK button.
  dialog.nameField.addEventListener("input", doEnabling);
  doEnabling();

  UIFontSize.registerWindow(window);
}

function onFolderSelect(event) {
  dialog.folder = event.target._folder;
  dialog.folderSelected = document
    .getElementById("MsgNewFolderPopup")
    .selectFolder(dialog.folder);
  doEnabling();
}

function onOK() {
  const name = dialog.nameField.value;
  // make sure name ends in  "/" if folder to create can only contain folders
  if (dialog.folderType == FOLDERS && !name.endsWith("/")) {
    dialog.okCallback(name + "/", dialog.folder);
  } else {
    dialog.okCallback(name, dialog.folder);
  }
}

function onFoldersOnly() {
  dialog.folderType = FOLDERS;
}

function onMessagesOnly() {
  dialog.folderType = MESSAGES;
}

function doEnabling() {
  const childName = dialog.nameField.value;
  // Disable if no value set, no folder selected, or if child folder with that
  // name already exists.
  document.querySelector("dialog").getButton("accept").disabled =
    !childName ||
    !dialog.folderSelected ||
    dialog.folder.getChildNamed(childName);
}
