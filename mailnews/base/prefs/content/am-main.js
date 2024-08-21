/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from am-identity-edit.js */

ChromeUtils.defineESModuleGetters(this, {
  AccountManagerUtils: "resource:///modules/AccountManagerUtils.sys.mjs",
});

var gAccount;
var AMUtils;

window.addEventListener("load", () => {
  parent.onPanelLoaded("am-main.xhtml");
});

/**
 * Initialize am-main account settings page when it gets shown.
 * Update an account's main settings title and set up signature items.
 */
function onInit() {
  setAccountTitle();
  setServerColor();
  setupSignatureItems();
  Services.obs.addObserver(
    onDefaultIdentityChange,
    "account-default-identity-changed"
  );

  const defaultAccount = document.getElementById("defaultAccount");
  if (
    gAccount != MailServices.accounts.defaultAccount &&
    gAccount.incomingServer.canBeDefaultServer &&
    gAccount.identities.length > 0 &&
    !(
      Services.prefs.prefIsLocked("mail.disable_button.set_default_account") &&
      Services.prefs.getBoolPref("mail.disable_button.set_default_account")
    )
  ) {
    defaultAccount.removeAttribute("disabled");
  } else {
    defaultAccount.setAttribute("disabled", true);
  }

  const deleteAccount = document.getElementById("deleteAccount");
  if (gAccount.incomingServer.protocolInfo.canDelete) {
    deleteAccount.removeAttribute("disabled");
  } else {
    deleteAccount.setAttribute("disabled", true);
  }
}

window.addEventListener("unload", () => {
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

function setServerColor() {
  const colorInput = document.getElementById("serverColor");
  colorInput.value = AMUtils.serverColor;

  colorInput.addEventListener("input", event =>
    AMUtils.previewServerColor(event.target.value)
  );
  colorInput.addEventListener("change", event =>
    AMUtils.updateServerColor(event.target.value)
  );
  document
    .getElementById("resetColor")
    .addEventListener("click", () => resetServerColor());
}

function resetServerColor() {
  document.getElementById("serverColor").value = AMUtils.defaultServerColor;
  AMUtils.resetServerColor();
}

function onPreInit(account, accountValues) {
  gAccount = account;
  AMUtils = new AccountManagerUtils(gAccount);
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

  const accountName = document.getElementById("server.prettyName").value;

  const args = { account: gAccount, accountName, result: false };

  // save the current identity settings so they show up correctly
  // if the user just changed them in the manage identities dialog
  const identity = gAccount.defaultIdentity;
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
