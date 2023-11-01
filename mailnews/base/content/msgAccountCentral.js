/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { UIDensity } = ChromeUtils.import("resource:///modules/UIDensity.jsm");
var { UIFontSize } = ChromeUtils.import("resource:///modules/UIFontSize.jsm");

var gSelectedServer = null;
var gSelectedFolder = null;

window.addEventListener("DOMContentLoaded", OnInit);

/**
 * Set up the whole page depending on the selected folder/account.
 * The folder is passed in via the document URL.
 */
function OnInit() {
  const el = document.getElementById("setupTitle");

  document.l10n.setAttributes(el, "setup-title", {
    accounts: MailServices.accounts.accounts.length,
  });

  // Selected folder URI is passed as folderURI argument in the query string.
  const folderURI = decodeURIComponent(
    document.location.search.replace("?folderURI=", "")
  );
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
    const accountSection = document.getElementById("accountSetupSection");
    for (const btn of accountSection.querySelectorAll(".btn-hub")) {
      btn.classList.remove("btn-inline");
    }
    accountSection.classList.remove("zebra");

    document.getElementById("accountFeaturesSection").hidden = true;
  }

  UIDensity.registerWindow(window);
  UIFontSize.registerWindow(window);
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

  const exceptions = [];
  let protocolInfo = null;
  try {
    protocolInfo = gSelectedServer.protocolInfo;
  } catch (e) {
    exceptions.push(e);
  }

  // Is this a RSS account?
  const isRssAccount = gSelectedServer?.type == "rss";

  // Is this an NNTP account?
  const isNNTPAccount = gSelectedServer?.type == "nntp";

  // Is this a Local Folders account?
  const isLocalFoldersAccount = gSelectedServer?.type == "none";

  document
    .getElementById("readButton")
    .toggleAttribute("hidden", !getReadMessagesFolder());

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
  document
    .getElementById("nntpSubscriptionButton")
    .toggleAttribute("hidden", !isNNTPAccount);

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
    .toggleAttribute(
      "hidden",
      isNNTPAccount || isRssAccount || isLocalFoldersAccount
    );

  // Check if we collected any exception.
  while (exceptions.length) {
    console.error(
      "Error in setting AccountCentral Items: " + exceptions.pop() + "\n"
    );
  }
}

/**
 * For the selected server, check for new messges and display first
 * suitable folder (genrally Inbox) for reading.
 */
function readMessages() {
  const folder = getReadMessagesFolder();
  top.MsgGetMessage([folder]);
  parent.displayFolder(folder);
}

/**
 * Find the folder Read Messages should use.
 *
 * @returns {?nsIMsgFolder} folder to use, if we have a suitable one.
 */
function getReadMessagesFolder() {
  const folder = MailUtils.getInboxFolder(gSelectedServer);
  if (folder) {
    return folder;
  }
  // For feeds and nntp, show the first non-trash folder. Don't use Outbox.
  return gSelectedServer.rootFolder.descendants.find(
    f =>
      !(f.flags & Ci.nsMsgFolderFlags.Trash) &&
      !(f.flags & Ci.nsMsgFolderFlags.Queue)
  );
}

/**
 * Open the AccountManager to view the settings for a given account.
 *
 * @param {string} selectPage - The xhtml file name for the viewing page,
 *   null for the account main page, other pages are 'am-server.xhtml',
 *   'am-copies.xhtml', 'am-offline.xhtml', 'am-addressing.xhtml',
 *   'am-smtp.xhtml'
 */
function viewSettings(selectPage) {
  window.browsingContext.topChromeWindow.MsgAccountManager(
    selectPage,
    gSelectedServer
  );
}

/**
 * Bring up the search interface for selected account.
 */
function searchMessages() {
  top.document
    .getElementById("tabmail")
    .currentAbout3Pane.commandController.doCommand("cmd_searchMessages");
}

/**
 * Open the filters window.
 */
function createMsgFilters() {
  window.browsingContext.topChromeWindow.MsgFilters(null, gSelectedFolder);
}

/**
 * Open the subscribe dialog.
 */
function subscribe() {
  if (!gSelectedServer) {
    return;
  }
  if (gSelectedServer.type == "rss") {
    window.browsingContext.topChromeWindow.openSubscriptionsDialog(
      gSelectedServer.rootFolder
    );
  } else {
    window.browsingContext.topChromeWindow.MsgSubscribe(gSelectedFolder);
  }
}

/**
 * Open the target's url on an external browser.
 *
 * @param {Event} event - The keypress or click event.
 */
function openLink(event) {
  event.preventDefault();
  Cc["@mozilla.org/uriloader/external-protocol-service;1"]
    .getService(Ci.nsIExternalProtocolService)
    .loadURI(Services.io.newURI(event.target.href));
}
