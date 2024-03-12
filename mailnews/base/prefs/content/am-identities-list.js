/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Gloda } = ChromeUtils.importESModule(
  "resource:///modules/gloda/Gloda.sys.mjs"
);

var gIdentityListBox; // the root <richlistbox> node
var gAddButton;
var gEditButton;
var gSetDefaultButton;
var gDeleteButton;

var gAccount = null; // the account we are showing the identities for

window.addEventListener("DOMContentLoaded", onLoad);

document.addEventListener("dialogaccept", onOk);
document.addEventListener("dialogcancel", onOk);

function onLoad() {
  gIdentityListBox = document.getElementById("identitiesList");
  gAddButton = document.getElementById("cmd_add");
  gEditButton = document.getElementById("cmd_edit");
  gSetDefaultButton = document.getElementById("cmd_default");
  gDeleteButton = document.getElementById("cmd_delete");

  // extract the account
  gAccount = window.arguments[0].account;

  var accountName = window.arguments[0].accountName;
  document.title = document
    .getElementById("bundle_prefs")
    .getFormattedString("identity-list-title", [accountName]);

  refreshIdentityList(0);
}

/**
 * Rebuilds the listbox holding the list of identities.
 *
 * @param {number} aSelectIndex - Attempt to select the identity with this index.
 */
function refreshIdentityList(aSelectIndex) {
  // Remove all children.
  while (gIdentityListBox.hasChildNodes()) {
    gIdentityListBox.lastChild.remove();
  }

  // Build the list from the identities array.
  for (const identity of gAccount.identities) {
    if (identity.valid) {
      const label = document.createXULElement("label");
      label.setAttribute("value", identity.identityName);

      const listitem = document.createXULElement("richlistitem");
      listitem.appendChild(label);
      listitem.setAttribute("key", identity.key);
      gIdentityListBox.appendChild(listitem);
    }
  }

  // Ensure one identity is always selected.
  if (!aSelectIndex || aSelectIndex < 0) {
    aSelectIndex = 0;
  } else if (aSelectIndex >= gIdentityListBox.itemCount) {
    aSelectIndex = gIdentityListBox.itemCount - 1;
  }

  // This also fires the onselect event, which in turn calls updateButtons().
  gIdentityListBox.selectedIndex = aSelectIndex;
}

/**
 * Opens the identity editor dialog.
 *
 * @param {nsIMsgIdentity} identity - The identity (if any) to load in the dialog.
 */
function openIdentityEditor(identity) {
  const args = { identity, account: gAccount, result: false };

  const indexToSelect = identity
    ? gIdentityListBox.selectedIndex
    : gIdentityListBox.itemCount;

  parent.gSubDialog.open(
    "chrome://messenger/content/am-identity-edit.xhtml",
    { closingCallback: onCloseIdentity },
    args
  );

  function onCloseIdentity() {
    if (args.result) {
      refreshIdentityList(indexToSelect);
    }
  }
}

function getSelectedIdentity() {
  if (gIdentityListBox.selectedItems.length != 1) {
    return null;
  }

  const identityKey = gIdentityListBox.selectedItems[0].getAttribute("key");
  return (
    gAccount.identities.find(id => id.valid && id.key == identityKey) || null
  );
}

function onEdit(event) {
  var id = getSelectedIdentity();
  openIdentityEditor(id);
}

/**
 * Enable/disable buttons depending on number of identities and current selection.
 */
function updateButtons() {
  // In this listbox there should always be one item selected.
  if (
    gIdentityListBox.selectedItems.length != 1 ||
    gIdentityListBox.itemCount == 0
  ) {
    // But in case this is not met (e.g. there is no identity for some reason,
    // or the list is being rebuilt), disable all buttons.
    gEditButton.setAttribute("disabled", "true");
    gDeleteButton.setAttribute("disabled", "true");
    gSetDefaultButton.setAttribute("disabled", "true");
    return;
  }

  gEditButton.setAttribute("disabled", "false");
  gDeleteButton.setAttribute(
    "disabled",
    gIdentityListBox.itemCount <= 1 ? "true" : "false"
  );
  gSetDefaultButton.setAttribute(
    "disabled",
    gIdentityListBox.selectedIndex == 0 ? "true" : "false"
  );
  // The Add command is always enabled.
}

function onSetDefault(event) {
  const identity = getSelectedIdentity();
  if (!identity) {
    return;
  }

  // If the first identity is selected, there is nothing to do.
  if (gIdentityListBox.selectedIndex == 0) {
    return;
  }

  gAccount.defaultIdentity = identity;
  // Rebuilt the identity list and select the moved identity again.
  refreshIdentityList(0);
  // Update gloda's myContact with the new default identity.
  Gloda._initMyIdentities();
}

function onDelete(event) {
  if (gIdentityListBox.itemCount <= 1) {
    // don't support deleting the last identity
    return;
  }

  // get delete confirmation
  const selectedIdentity = getSelectedIdentity();

  const prefsBundle = document.getElementById("bundle_prefs");
  const confirmTitle = prefsBundle.getFormattedString(
    "identity-delete-confirm-title",
    [window.arguments[0].accountName]
  );
  const confirmText = prefsBundle.getFormattedString(
    "identity-delete-confirm",
    [selectedIdentity.identityName]
  );
  const confirmButton = prefsBundle.getString("identity-delete-confirm-button");

  if (
    Services.prompt.confirmEx(
      window,
      confirmTitle,
      confirmText,
      Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
        Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL,
      confirmButton,
      null,
      null,
      null,
      {}
    )
  ) {
    return;
  }

  const selectedItemIndex = gIdentityListBox.selectedIndex;

  gAccount.removeIdentity(selectedIdentity);

  refreshIdentityList(selectedItemIndex);
}

function onOk() {
  window.arguments[0].result = true;
}
