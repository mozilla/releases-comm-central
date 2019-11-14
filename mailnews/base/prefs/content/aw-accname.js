/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from AccountWizard.js */

var gPrefsBundle;

function acctNamePageValidate() {
  var accountname = document.getElementById("prettyName").value;
  var canAdvance = !!accountname;

  // Check if this accountname already exists. If so, return false so that
  // user can enter a different unique account name.
  if (canAdvance && accountNameExists(accountname)) {
    canAdvance = false;
  }

  document.querySelector("wizard").canAdvance = canAdvance;
}

function acctNamePageUnload() {
  var pageData = parent.GetPageData();
  var accountname = document.getElementById("prettyName").value;
  setPageData(pageData, "accname", "prettyName", accountname);
  // Set this to true so we know the user has set the name.
  setPageData(pageData, "accname", "userset", true);
  return true;
}

function acctNamePageInit() {
  gPrefsBundle = document.getElementById("bundle_prefs");
  var accountNameInput = document.getElementById("prettyName");
  if (accountNameInput.value == "") {
    var pageData = parent.GetPageData();
    var type = parent.getCurrentServerType(pageData);
    var accountName;

    if (type == "nntp") {
      accountName = pageData.newsserver.hostname.value;
    } else {
      accountName = pageData.identity.email.value;
    }
    accountNameInput.value = accountName;
  }
  acctNamePageValidate();
}
