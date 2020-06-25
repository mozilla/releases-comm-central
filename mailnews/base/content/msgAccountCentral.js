/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mail/base/content/mailCore.js */
/* import-globals-from ../prefs/content/accountUtils.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gSelectedServer = null;
var gSelectedFolder = null;

/**
 * Set up the whole page depending on the selected folder/account.
 * The folder is passed in via the document URL.
 */
function OnInit() {
  let el = document.getElementById("setupTitle");

  document.l10n.setAttributes(el, "setup-title", {
    accounts: MailServices.accounts.accounts.length,
  });

  // Selected folder URI is passed as folderURI argument in the query string.
  let folderURI = document.location.search.replace("?folderURI=", "");
  gSelectedFolder = folderURI ? MailUtils.getExistingFolder(folderURI) : null;
  gSelectedServer = gSelectedFolder ? gSelectedFolder.server : null;

  if (gSelectedServer) {
    // Display and collapse items presented to the user based on account type
    updateAccountCentralUI();
  } else {
    // If there is no gSelectedServer, we are in a brand new profile.
    document.getElementById("headerFirstRun").hidden = false;
    document.getElementById("headerExistingAccounts").hidden = true;
    document.getElementById("version").textContent = Services.appinfo.version;

    // Update the style of the account setup buttons and area.
    let accountSection = document.getElementById("accountSetupSection");
    for (let btn of accountSection.querySelectorAll(".btn-hub")) {
      btn.classList.remove("btn-inline");
    }
    accountSection.classList.remove("zebra");

    document.getElementById("accountFeaturesSection").hidden = true;
  }
}

/**
 * Show items in the AccountCentral page depending on the capabilities
 * of the given server.
 */
function updateAccountCentralUI() {
  // Set the account name.
  document.getElementById("accountName").textContent =
    gSelectedServer.prettyName;

  // Update the account logo.
  document
    .getElementById("accountLogo")
    .setAttribute("type", gSelectedServer.type);

  let exceptions = [];
  let protocolInfo = null;
  try {
    protocolInfo = gSelectedServer.protocolInfo;
  } catch (e) {
    exceptions.push(e);
  }

  // Is this a RSS account?
  let isRssAccount = gSelectedServer && gSelectedServer.type == "rss";

  // It can read messages.
  let canGetMessages = false;
  try {
    canGetMessages = protocolInfo && protocolInfo.canGetMessages;
    document
      .getElementById("readButton")
      .toggleAttribute("hidden", !canGetMessages || isRssAccount);
  } catch (e) {
    exceptions.push(e);
  }

  // It can compose messages.
  let showComposeMsgLink = false;
  try {
    showComposeMsgLink = protocolInfo && protocolInfo.showComposeMsgLink;
    document
      .getElementById("composeButton")
      .toggleAttribute("hidden", !showComposeMsgLink);
  } catch (e) {
    exceptions.push(e);
  }

  // It can subscribe to a newsgroup.
  let canSubscribe = false;
  try {
    canSubscribe =
      gSelectedFolder &&
      gSelectedFolder.canSubscribe &&
      protocolInfo &&
      !protocolInfo.canGetMessages;
    document
      .getElementById("nntpSubscriptionButton")
      .toggleAttribute("hidden", !canSubscribe);
  } catch (e) {
    exceptions.push(e);
  }

  // It can subscribe to an RSS feed.
  document
    .getElementById("rssSubscriptionButton")
    .toggleAttribute("hidden", !isRssAccount);

  // It can search messages.
  let canSearchMessages = false;
  try {
    canSearchMessages = gSelectedServer && gSelectedServer.canSearchMessages;
    document
      .getElementById("searchButton")
      .toggleAttribute("hidden", !canSearchMessages);
  } catch (e) {
    exceptions.push(e);
  }

  // It can create filters.
  let canHaveFilters = false;
  try {
    canHaveFilters = gSelectedServer && gSelectedServer.canHaveFilters;
    document
      .getElementById("filterButton")
      .toggleAttribute("hidden", !canHaveFilters);
  } catch (e) {
    exceptions.push(e);
  }

  // It can have End-to-end Encryption.
  document
    .getElementById("e2eButton")
    .toggleAttribute("hidden", !canGetMessages || isRssAccount);

  // Check if we collected any exception.
  while (exceptions.length) {
    Cu.reportError(
      "Error in setting AccountCentral Items: " + exceptions.pop() + "\n"
    );
  }
}

/**
 * Open the Inbox for selected server. If needed, open the twisty and
 * select the Inbox menuitem.
 */
function readMessages() {
  if (!gSelectedServer) {
    return;
  }

  try {
    window.parent.OpenInboxForServer(gSelectedServer);
  } catch (ex) {
    Cu.reportError("Error opening Inbox for server: " + ex + "\n");
  }
}

/**
 * Open the AccountManager to view the settings for a given account.
 *
 * @param selectPage - The xhtml file name for the viewing page,
 *   null for the account main page, other pages are 'am-server.xhtml',
 *   'am-copies.xhtml', 'am-offline.xhtml', 'am-addressing.xhtml',
 *   'am-smtp.xhtml'
 */
function viewSettings(selectPage) {
  window.parent.MsgAccountManager(selectPage, gSelectedServer);
}

/**
 * Open the newsgroup account wizard.
 */
function createNewsgroups() {
  window.parent.msgOpenAccountWizard(function(state) {
    updateMailPaneUI();
    let win = getMostRecentMailWindow();
    if (state && win && win.gFolderTreeView && this.gCurrentAccount) {
      win.gFolderTreeView.selectFolder(
        this.gCurrentAccount.incomingServer.rootMsgFolder
      );
    }
  });
}

/**
 * Bring up the search interface for selected account.
 */
function searchMessages() {
  window.parent.MsgSearchMessages(gSelectedFolder);
}

/**
 * Open the filters window.
 */
function createMsgFilters() {
  window.parent.MsgFilters(null, gSelectedFolder);
}

/**
 * Open the subscribe dialog.
 */
function subscribe() {
  if (!gSelectedServer) {
    return;
  }
  if (gSelectedServer.type == "rss") {
    window.parent.openSubscriptionsDialog(gSelectedServer.rootFolder);
  } else {
    window.parent.MsgSubscribe(gSelectedFolder);
  }
}

/**
 * Open the target's url on an external browser.
 *
 * @param {Event} event - The keypress or click event.
 */
function openLink(event) {
  event.preventDefault();
  let messenger = Cc["@mozilla.org/messenger;1"].createInstance();
  messenger = messenger.QueryInterface(Ci.nsIMessenger);
  messenger.launchExternalURL(event.target.href);
}
