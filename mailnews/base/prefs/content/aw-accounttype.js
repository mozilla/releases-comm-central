/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from AccountWizard.js */

function setAccountTypeData() {
  var rg = document.getElementById("acctyperadio");
  var selectedItemId = rg.selectedItem.id;
  var mail = selectedItemId == "mailaccount";
  var news = selectedItemId == "newsaccount";

  var pageData = parent.GetPageData();
  setPageData(pageData, "accounttype", "mailaccount", mail);
  setPageData(pageData, "accounttype", "newsaccount", news);

  // Other account types.
  setPageData(pageData, "accounttype", "otheraccount", !(news || mail));
}

function acctTypePageUnload() {
  setAccountTypeData();
  setupWizardPanels();
  return true;
}

function setupWizardPanels() {
  let pageData = parent.GetPageData();

  // We default this to false, even though we could set it to true if we
  // are going to display the page. However as the accname page will set
  // it to true for us, we'll just default it to false and not work it out
  // twice.
  setPageData(pageData, "accname", "userset", false);

  // "done" is the only required panel for all accounts. We used to require an identity panel but not anymore.
  // initialize wizardPanels with the optional mail/news panels
  let wizardPanels;
  let isMailAccount = pageData.accounttype.mailaccount;
  let isNewsAccount = pageData.accounttype.newsaccount;
  if (isMailAccount && isMailAccount.value) {
    wizardPanels = [
      "identitypage",
      "incomingpage",
      "outgoingpage",
      "accnamepage",
    ];
  } else if (isNewsAccount && isNewsAccount.value) {
    wizardPanels = ["identitypage", "newsserver", "accnamepage"];
  } else {
    // An account created by an extension and XUL overlays
    let pages = document.getElementById("acctyperadio").selectedItem.value;
    wizardPanels = pages.split(/ *, */);
  }
  wizardPanels.push("done");

  // Set up order of panels
  for (let i = 0; i < wizardPanels.length - 1; i++) {
    setNextPage(wizardPanels[i], wizardPanels[i + 1]);
  }

  // make the account type page go to the very first of our approved wizard panels...this is usually going to
  // be accounttype --> identitypage unless we were configured to skip the identity page
  setNextPage("accounttype", wizardPanels[0]);
}
