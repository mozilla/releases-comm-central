/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from AccountWizard.js */

function acctNamePageValidate() {
  var accountname = document.getElementById("prettyName").value;
  // Check if this accountname already exists. If so, return false so that
  // user can enter a different unique account name.
  document.querySelector("wizard").canAdvance =
    !!accountname && !accountNameExists(accountname);
}

function acctNamePageUnload() {
  var pageData = parent.GetPageData();
  var accountname = document.getElementById("prettyName").value;
  pageData.prettyName = accountname;
  return true;
}

function acctNamePageInit() {
  var accountNameInput = document.getElementById("prettyName");
  if (accountNameInput.value == "") {
    accountNameInput.value = parent.GetPageData().hostname;
  }
  acctNamePageValidate();
}
