/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from AccountWizard.js */

var { cleanUpHostName, isLegalHostNameOrIP } = ChromeUtils.import(
  "resource:///modules/hostnameUtils.jsm"
);

function incomingPageValidate() {
  var hostName = cleanUpHostName(document.getElementById("newsServer").value);
  // Can advance if a legal host name and we do not already having an server
  // with the same host name.
  document.querySelector("wizard").canAdvance =
    !!isLegalHostNameOrIP(hostName) &&
    !MailServices.accounts.findRealServer("", hostName, "nntp", 0);
}

function incomingPageUnload() {
  parent.GetPageData().hostname = cleanUpHostName(
    document.getElementById("newsServer").value
  );

  return true;
}

function incomingPageInit() {
  var pageData = parent.GetPageData();
  if (pageData.hostname) {
    document.getElementById("newsServer").value = pageData.hostname;
  }
  incomingPageValidate();
}
