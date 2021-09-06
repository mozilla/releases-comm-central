/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from AccountWizard.js */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

function donePageInit() {
  var pageData = parent.GetPageData();

  var email = pageData.email;
  setDivTextFromForm("identity.email", email);
  setDivTextFromForm("server.username", getUsernameFromEmail(email));
  setDivTextFromForm("account.name", pageData.prettyName);
  setDivTextFromForm("newsServer.name", pageData.hostname);
}

function setDivTextFromForm(divid, value) {
  // collapse the row if the div has no value
  let label = document.getElementById(`${divid}.label`);
  let text = document.getElementById(`${divid}.text`);

  if (!value) {
    text.style.display = "none";
    label.style.display = "none";
    return;
  }

  // otherwise fill in the .text element
  text.style.display = null;
  label.style.display = null;

  // set the value
  text.setAttribute("value", value);
}
