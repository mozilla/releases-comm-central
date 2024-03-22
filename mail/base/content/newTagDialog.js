/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var dialog;

window.addEventListener("load", () => {
  onLoad();
});

/**
 * Pass in keyToEdit as a window argument to turn this dialog into an edit
 * tag dialog.
 */
function onLoad() {
  const windowArgs = window.arguments[0];

  dialog = {};

  dialog.OKButton = document.querySelector("dialog").getButton("accept");
  dialog.nameField = document.getElementById("name");
  dialog.nameField.focus();

  // call this when OK is pressed
  dialog.okCallback = windowArgs.okCallback;
  if (windowArgs.keyToEdit) {
    initializeForEditing(windowArgs.keyToEdit);
    document.addEventListener("dialogaccept", onOKEditTag);
  } else {
    document.addEventListener("dialogaccept", onOKNewTag);
  }

  doEnabling();
}

/**
 * Turn the new tag dialog into an edit existing tag dialog
 */
function initializeForEditing(aTagKey) {
  dialog.editTagKey = aTagKey;

  // Change the title of the dialog
  var messengerBundle = document.getElementById("bundle_messenger");
  document.title = messengerBundle.getString("editTagTitle");

  // extract the color and name for the current tag
  document.getElementById("tagColorPicker").value =
    MailServices.tags.getColorForKey(aTagKey);
  dialog.nameField.value = MailServices.tags.getTagForKey(aTagKey);
}

/**
 * on OK handler for editing a new tag.
 */
function onOKEditTag(event) {
  // get the tag name of the current key we are editing
  const existingTagName = MailServices.tags.getTagForKey(dialog.editTagKey);

  // it's ok if the name didn't change
  if (existingTagName != dialog.nameField.value) {
    // don't let the user edit a tag to the name of another existing tag
    if (MailServices.tags.getKeyForTag(dialog.nameField.value)) {
      alertForExistingTag();
      event.preventDefault();
      return;
    }

    MailServices.tags.setTagForKey(dialog.editTagKey, dialog.nameField.value);
  }

  MailServices.tags.setColorForKey(
    dialog.editTagKey,
    document.getElementById("tagColorPicker").value
  );
}

/**
 * on OK handler for creating a new tag. Alerts the user if a tag with
 * the name already exists.
 */
function onOKNewTag(event) {
  var name = dialog.nameField.value;

  if (MailServices.tags.getKeyForTag(name)) {
    alertForExistingTag();
    event.preventDefault();
    return;
  }
  if (
    !dialog.okCallback(name, document.getElementById("tagColorPicker").value)
  ) {
    event.preventDefault();
  }
}

/**
 * Alerts the user that they are trying to create a tag with a name that
 * already exists.
 */
function alertForExistingTag() {
  var messengerBundle = document.getElementById("bundle_messenger");
  var alertText = messengerBundle.getString("tagExists");
  Services.prompt.alert(window, document.title, alertText);
}

function doEnabling() {
  dialog.OKButton.disabled = !dialog.nameField.value;
}
