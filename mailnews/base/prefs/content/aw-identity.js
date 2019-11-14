/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from AccountWizard.js */

var gCurrentDomain;
var gPrefsBundle;

function identityPageValidate() {
  var canAdvance = false;
  var name = document.getElementById("fullName").value;
  let email = document.getElementById("email").value.trim();

  if (name && email) {
    canAdvance = gCurrentDomain
      ? emailNameIsLegal(email)
      : emailNameAndDomainAreLegal(email);

    if (gCurrentDomain && canAdvance) {
      // For prefilled ISP data we must check if the account already exists as
      // there is no second chance. The email is the username since the user
      // fills in [______]@example.com.
      var pageData = parent.GetPageData();
      var serverType = parent.getCurrentServerType(pageData);
      var hostName = parent.getCurrentHostname(pageData);
      var usernameWithDomain = email + "@" + gCurrentDomain;
      if (
        parent.AccountExists(email, hostName, serverType) ||
        parent.AccountExists(usernameWithDomain, hostName, serverType)
      ) {
        canAdvance = false;
      }
    }
  }

  document.querySelector("wizard").canAdvance = canAdvance;
}

function identityPageUnload() {
  var pageData = parent.GetPageData();
  var name = document.getElementById("fullName").value;
  let email = document.getElementById("email").value.trim();
  setPageData(pageData, "identity", "fullName", name);
  setPageData(pageData, "identity", "email", email);

  return true;
}

// This is for the case when the code appends the domain
// unnecessarily.
// This simply gets rid  of "@domain" from "foo@domain"

function fixPreFilledEmail() {
  var emailElement = document.getElementById("email");
  var email = emailElement.value;
  var emailArray = email.split("@");

  if (gCurrentDomain) {
    // check if user entered an @ sign even though we have a domain
    if (emailArray.length >= 2) {
      email = emailArray[0];
      emailElement.value = email;
    }
  }
}

/**
 * This function checks for common illegal characters.
 * It shouldn't be too strict, since we do more extensive tests later.
 */
function emailNameIsLegal(aString) {
  return aString && !/[^!-?A-~]/.test(aString);
}

function emailNameAndDomainAreLegal(aString) {
  return /^[!-?A-~]+\@[A-Za-z0-9.-]+$/.test(aString);
}

function identityPageInit() {
  gCurrentDomain = null;
  gPrefsBundle = document.getElementById("bundle_prefs");
  clearEmailTextItems();
  setEmailDescriptionText();
  checkForFullName();
  checkForEmail();
  fixPreFilledEmail();
  identityPageValidate();
}

function clearEmailTextItems() {
  var emailDescText = document.getElementById("emailDescText");

  if (emailDescText.hasChildNodes()) {
    emailDescText.lastChild.remove();
  }

  var postEmailText = document.getElementById("postEmailText");
  postEmailText.setAttribute("value", "");
  postEmailText.hidden = true;
}

// Use email example data that ISP has provided. ISP data, if available
// for the choice user has made, will be read into CurrentAccountData.
// Default example data from properties will be used when the info is missing.
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

  // Create a text nodes with text to be displayed
  var emailDescTextNode = document.createTextNode(displayText);

  // Display the dynamically generated text for email description
  emailDescText.appendChild(emailDescTextNode);
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
  if (pageData && pageData.identity && pageData.identity.email) {
    email.value = pageData.identity.email.value;
  }
  if (email.value == "" && "@mozilla.org/userinfo;1" in Cc) {
    email.value = Cc["@mozilla.org/userinfo;1"].getService(
      Ci.nsIUserInfo
    ).emailAddress;
  }
}
