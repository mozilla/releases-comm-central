/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from am-identity-edit.js */

var gAccount;

/**
 * Initialize am-main account settings page when it gets shown.
 * Update an account's main settings title and set up signature items.
 */
function onInit() {
  setAccountTitle();
  setupSignatureItems();
  Services.obs.addObserver(
    onDefaultIdentityChange,
    "account-default-identity-changed"
  );
}

window.addEventListener("unload", function () {
  Services.obs.removeObserver(
    onDefaultIdentityChange,
    "account-default-identity-changed"
  );
});

/**
 * If the default identity for the current account changes, loads the values
 * from the new default identity.
 */
function onDefaultIdentityChange(subject, topic, data) {
  if (data == gAccount.key) {
    initIdentityValues(subject.QueryInterface(Ci.nsIMsgIdentity));
  }
}

/**
 * Handle the blur event of the #server.prettyName pref input.
 * Update account name in account manager tree and account settings' main title.
 *
 * @param {Event} event - Blur event from the pretty name input.
 */
function serverPrettyNameOnBlur(event) {
  parent.setAccountLabel(gAccount.key, event.target.value);
  setAccountTitle();
}

/**
 * Update an account's main settings title with the account name if applicable.
 */
function setAccountTitle() {
  const accountName = document.getElementById("server.prettyName");
  const title = document.querySelector("#am-main-title .dialogheader-title");
  let titleValue = title.getAttribute("defaultTitle");
  if (accountName.value) {
    titleValue += " - " + accountName.value;
  }

  title.setAttribute("value", titleValue);
  document.title = titleValue;
}

function onPreInit(account, accountValues) {
  gAccount = account;
  loadSMTPServerList();
  const type = parent.getAccountValue(
    account,
    accountValues,
    "server",
    "type",
    null,
    false
  );
  hideShowControls(type);
}

function manageIdentities() {
  // We want to save the current identity information before bringing up the multiple identities
  // UI. This ensures that the changes are reflected in the identity list dialog
  // onSave();

  if (!gAccount) {
    return;
  }

  var accountName = document.getElementById("server.prettyName").value;

  var args = { account: gAccount, accountName, result: false };

  // save the current identity settings so they show up correctly
  // if the user just changed them in the manage identities dialog
  var identity = gAccount.defaultIdentity;
  saveIdentitySettings(identity);

  parent.gSubDialog.open(
    "chrome://messenger/content/am-identities-list.xhtml",
    { closingCallback: onCloseIdentities },
    args
  );

  function onCloseIdentities() {
    if (args.result) {
      // Refresh the SMTP list in case the user changed server properties
      // from the identity dialog.
      loadSMTPServerList();
    }
  }
}
