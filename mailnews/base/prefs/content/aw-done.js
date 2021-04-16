/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from AccountWizard.js */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gPrefsBundle;

function donePageInit() {
  var pageData = parent.GetPageData();
  gPrefsBundle = document.getElementById("bundle_prefs");

  var email = "";
  if (pageData.identity && pageData.identity.email) {
    // fixup the email
    email = pageData.identity.email.value;
  }
  setDivTextFromForm("identity.email", email);

  let userName = "";
  if (pageData.login && pageData.login.username) {
    userName = pageData.login.username.value;
  }
  if (!userName && email) {
    userName = getUsernameFromEmail(email);
  }

  // Hide the "username" field if we don't want to show information
  // on the incoming server.
  setDivTextFromForm("server.username", userName);

  let smtpUserName = "";
  if (pageData.login && pageData.login.smtpusername) {
    smtpUserName = pageData.login.smtpusername.value;
  }
  if (!smtpUserName && email) {
    smtpUserName = getUsernameFromEmail(email);
  }
  setDivTextFromForm("smtpServer.username", smtpUserName);

  if (pageData.accname && pageData.accname.prettyName) {
    setDivTextFromForm("account.name", pageData.accname.prettyName.value);
  } else {
    setDivTextFromForm("account.name", "");
  }

  // Show mail servers (incoming & outgoing) details based on current account
  // data.
  if (!serverIsNntp(pageData)) {
    let incomingServerName = "";
    if (pageData.server && pageData.server.hostname) {
      incomingServerName = pageData.server.hostname.value;
    }
    setDivTextFromForm("server.name", incomingServerName);
    setDivTextFromForm(
      "server.port",
      pageData.server.port ? pageData.server.port.value : null
    );
    let incomingServerType = "";
    if (pageData.server && pageData.server.servertype) {
      incomingServerType = pageData.server.servertype.value;
    }
    setDivTextFromForm("server.type", incomingServerType.toUpperCase());

    let smtpServerName = "";
    if (pageData.server && pageData.server.smtphostname) {
      let smtpServer = MailServices.smtp.defaultServer;
      smtpServerName = pageData.server.smtphostname.value;
      if (!smtpServerName && smtpServer && smtpServer.hostname) {
        smtpServerName = smtpServer.hostname;
      }
    }
    setDivTextFromForm("smtpServer.name", smtpServerName);
  } else {
    setDivTextFromForm("server.name", null);
    setDivTextFromForm("server.type", null);
    setDivTextFromForm("server.port", null);
    setDivTextFromForm("smtpServer.name", null);
  }

  if (serverIsNntp(pageData)) {
    let newsServerName = "";
    if (pageData.newsserver && pageData.newsserver.hostname) {
      newsServerName = pageData.newsserver.hostname.value;
    }
    if (newsServerName) {
      // No need to show username for news account
      setDivTextFromForm("server.username", null);
    }
    setDivTextFromForm("newsServer.name", newsServerName);
    setDivTextFromForm("server.port", null);
  } else {
    setDivTextFromForm("newsServer.name", null);
  }

  var isPop = false;
  if (pageData.server && pageData.server.servertype) {
    isPop = pageData.server.servertype.value == "pop3";
  }

  hideShowDownloadMsgsUI(isPop);
}

function hideShowDownloadMsgsUI(isPop) {
  // only show the "download messages now" UI
  // if this is a pop account, we are online, and this was opened
  // from the 3 pane
  var downloadMsgs = document.getElementById("downloadMsgs");
  if (isPop) {
    if (!Services.io.offline) {
      if (
        window.opener.location.href ==
        "chrome://messenger/content/messenger.xhtml"
      ) {
        downloadMsgs.hidden = false;
        return;
      }
    }
  }

  // else hide it
  downloadMsgs.hidden = true;
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
