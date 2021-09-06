/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from AccountWizard.js */

var gPrefsBundle;

function identityPageValidate() {
  document.querySelector("wizard").canAdvance =
    document.getElementById("fullName").validity.valid &&
    document.getElementById("email").validity.valid;
}

function identityPageUnload() {
  var pageData = parent.GetPageData();
  var name = document.getElementById("fullName").value;
  let email = document.getElementById("email").value.trim();
  pageData.fullName = name;
  pageData.email = email;

  return true;
}

function identityPageInit() {
  gPrefsBundle = document.getElementById("bundle_prefs");
  setEmailDescriptionText();
  checkForFullName();
  checkForEmail();
  identityPageValidate();
}

function setEmailDescriptionText() {
  var emailDescText = document.getElementById("emailDescText");
  var emailFieldLabel = document.getElementById("emailFieldLabel");

  // Set the default field label
  emailFieldLabel.setAttribute(
    "value",
    gPrefsBundle.getString("emailFieldText")
  );

  // Check for obtained values and set with default values if needed
  var username = gPrefsBundle.getString("exampleEmailUserName");
  var domain = gPrefsBundle.getString("exampleEmailDomain");

  let displayText = gPrefsBundle.getFormattedString("defaultEmailText", [
    username,
    domain,
  ]);

  // Display the dynamically generated text for email description
  emailDescText.textContent = displayText;
}

function checkForFullName() {
  var name = document.getElementById("fullName");
  if (name.value == "" && "@mozilla.org/userinfo;1" in Cc) {
    name.value = Cc["@mozilla.org/userinfo;1"].getService(
      Ci.nsIUserInfo
    ).fullname;
  }
}

function checkForEmail() {
  var email = document.getElementById("email");
  var pageData = parent.GetPageData();
  if (pageData.email) {
    email.value = pageData.email;
  }
  if (email.value == "" && "@mozilla.org/userinfo;1" in Cc) {
    email.value = Cc["@mozilla.org/userinfo;1"].getService(
      Ci.nsIUserInfo
    ).emailAddress;
  }
}
