/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from am-identity-edit.js */

var gAccount;

function onInit(aPageId, aServerId) {
  var accountName = document.getElementById("server.prettyName");
  var title = document.querySelector("#am-main-title .dialogheader-title");
  var defaultTitle = title.getAttribute("defaultTitle");
  var titleValue;

  if (accountName.value) {
    titleValue = defaultTitle + " - <" + accountName.value + ">";
  } else {
    titleValue = defaultTitle;
  }

  title.setAttribute("value", titleValue);
  document.title = titleValue;

  setupSignatureItems();
}

function onPreInit(account, accountValues) {
  gAccount = account;
  loadSMTPServerList();
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
      // now re-initialize the default identity settings in case they changed
      identity = gAccount.defaultIdentity; // Refetch the default identity in case it changed.
      initIdentityValues(identity);
      // Refresh the SMTP list in case the user changed server properties
      // from the identity dialog.
      loadSMTPServerList();
    }
  }
}
