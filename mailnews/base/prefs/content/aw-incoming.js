/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from AccountWizard.js */

var { cleanUpHostName, isLegalHostNameOrIP } = ChromeUtils.importESModule(
  "resource:///modules/hostnameUtils.sys.mjs"
);
var { NntpUtils } = ChromeUtils.importESModule(
  "resource:///modules/NntpUtils.sys.mjs"
);

function incomingPageValidate() {
  const hostName = cleanUpHostName(document.getElementById("newsServer").value);

  let hasAccount = false;
  const server = NntpUtils.findServer(hostName);
  if (server) {
    // It's OK if a server exists, as long as it's not used by any account.
    hasAccount = MailServices.accounts.findAccountForServer(server);
  }
  // Can advance if it's a legal host name and we do not already have a server
  // in use with the same host name.
  document.querySelector("wizard").canAdvance =
    !!isLegalHostNameOrIP(hostName) && !hasAccount;
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
