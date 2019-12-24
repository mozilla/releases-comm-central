/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mail/base/content/mailCore.js */
/* import-globals-from ../prefs/content/accountUtils.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var gSelectedServer = null;
var gSelectedFolder = null;

/**
 * Set up the whole page depending on the selected folder/account.
 * The folder is passed in via the document URL.
 */
function OnInit() {
  try {
    // Title will contain the brand name of the application and the account
    // type (mail/news) and the name of the account.
    let title;
    // Get the brand name
    let brandName = document
      .getElementById("bundle_brand")
      .getString("brandShortName");
    let messengerBundle = document.getElementById("bundle_messenger");

    // Selected folder URI is passed as folderURI argument in the query string.
    let folderURI = document.location.search.replace("?folderURI=", "");
    gSelectedFolder = folderURI ? MailUtils.getExistingFolder(folderURI) : null;
    gSelectedServer = gSelectedFolder ? gSelectedFolder.server : null;
    if (gSelectedServer) {
      // Get the account type
      let serverType = gSelectedServer.type;
      let acctType;
      if (serverType == "nntp") {
        acctType = messengerBundle.getString("newsAcctType");
      } else if (serverType == "rss") {
        acctType = messengerBundle.getString("feedsAcctType");
      } else {
        acctType = messengerBundle.getString("mailAcctType");
      }

      // Get the account name
      let acctName = gSelectedServer.prettyName;
      title = messengerBundle.getFormattedString("acctCentralTitleFormat", [
        brandName,
        acctType,
        acctName,
      ]);
      // Display and collapse items presented to the user based on account type
      ArrangeAccountCentralItems();
    } else {
      // If there is no gSelectedServer, we are in a brand new profile with
      // no accounts - show the create account rows.
      title = brandName;
      SetItemDisplay("accountsHeader", true);
      SetItemDisplay("createAccount", true);
      SetItemDisplay("createAccounts", true);
    }
    // Set the title for the document
    document.getElementById("accountCentralTitle").setAttribute("value", title);
  } catch (ex) {
    Cu.reportError("Error getting selected account: " + ex + "\n");
  }
}

/**
 * Show items in the AccountCentral page depending on the capabilities
 * of the given server.
 */
/* eslint-disable complexity */
function ArrangeAccountCentralItems() {
  let exceptions = [];
  let protocolInfo = null;
  try {
    protocolInfo = gSelectedServer.protocolInfo;
  } catch (e) {
    exceptions.push(e);
  }

  // Is this a RSS account?
  let displayRssHeader = gSelectedServer && gSelectedServer.type == "rss";

  /* Email header and items : Begin */

  // Read Messages
  let canGetMessages = false;
  try {
    canGetMessages = protocolInfo && protocolInfo.canGetMessages;
    SetItemDisplay("readMessages", canGetMessages && !displayRssHeader);
  } catch (e) {
    exceptions.push(e);
  }

  // Compose Messages link
  let showComposeMsgLink = false;
  try {
    showComposeMsgLink = protocolInfo && protocolInfo.showComposeMsgLink;
    SetItemDisplay("composeMessage", showComposeMsgLink);
  } catch (e) {
    exceptions.push(e);
  }

  // Junk mail settings (false, until ready for prime time)
  let canControlJunkEmail = false;
  try {
    canControlJunkEmail =
      false &&
      protocolInfo &&
      protocolInfo.canGetIncomingMessages &&
      protocolInfo.canGetMessages;
    SetItemDisplay("junkSettingsMail", canControlJunkEmail);
  } catch (e) {
    exceptions.push(e);
  }

  // Display Email header, only if any of the items are displayed
  let displayEmailHeader =
    !displayRssHeader &&
    (canGetMessages || showComposeMsgLink || canControlJunkEmail);
  SetItemDisplay("emailHeader", displayEmailHeader);

  /* Email header and items : End */

  /* News header and items : Begin */

  // Subscribe to Newsgroups
  let canSubscribe = false;
  try {
    canSubscribe =
      gSelectedFolder &&
      gSelectedFolder.canSubscribe &&
      protocolInfo &&
      !protocolInfo.canGetMessages;
    SetItemDisplay("subscribeNewsgroups", canSubscribe);
  } catch (e) {
    exceptions.push(e);
  }

  // Junk news settings (false, until ready for prime time)
  let canControlJunkNews = false;
  try {
    canControlJunkNews =
      false &&
      protocolInfo &&
      protocolInfo.canGetIncomingMessages &&
      !protocolInfo.canGetMessages;
    SetItemDisplay("junkSettingsNews", canControlJunkNews);
  } catch (e) {
    exceptions.push(e);
  }

  // Display News header, only if any of the items are displayed
  let displayNewsHeader = canSubscribe || canControlJunkNews;
  SetItemDisplay("newsHeader", displayNewsHeader);

  /* News header and items : End */

  /* RSS header and items : Begin */

  // Display RSS header, only if this is RSS account
  SetItemDisplay("rssHeader", displayRssHeader);

  // Subscribe to RSS Feeds
  SetItemDisplay("subscribeRSS", displayRssHeader);

  /* RSS header and items : End */

  // If either of above sections exists, show section separators
  SetItemDisplay(
    "messagesSection",
    displayNewsHeader || displayEmailHeader || displayRssHeader
  );

  /* Accounts : Begin */

  // Account Settings if a server is found
  let canShowAccountSettings = gSelectedServer != null;
  SetItemDisplay("accountSettings", canShowAccountSettings);

  // Show New Mail Account Wizard if not prohibited by pref
  let canShowCreateAccount = false;
  try {
    canShowCreateAccount = !Services.prefs.prefIsLocked(
      "mail.disable_new_account_addition"
    );
    SetItemDisplay("createAccount", canShowCreateAccount);
    SetItemDisplay("createAccounts", canShowCreateAccount);
  } catch (e) {
    exceptions.push(e);
  }

  // Display Accounts header, only if any of the items are displayed
  SetItemDisplay("accountsHeader", canShowCreateAccount);

  /* Accounts : End */

  /* Advanced Features header and items : Begin */

  // Search Messages
  let canSearchMessages = false;
  try {
    canSearchMessages = gSelectedServer && gSelectedServer.canSearchMessages;
    SetItemDisplay("searchMessages", canSearchMessages);
  } catch (e) {
    exceptions.push(e);
  }

  // Create Filters
  let canHaveFilters = false;
  try {
    canHaveFilters = gSelectedServer && gSelectedServer.canHaveFilters;
    SetItemDisplay("createFilters", canHaveFilters);
  } catch (e) {
    exceptions.push(e);
  }

  // Subscribe to IMAP Folders
  let canSubscribeImapFolders = false;
  try {
    canSubscribeImapFolders =
      gSelectedFolder &&
      gSelectedFolder.canSubscribe &&
      protocolInfo &&
      protocolInfo.canGetMessages;
    SetItemDisplay("subscribeImapFolders", canSubscribeImapFolders);
  } catch (e) {
    exceptions.push(e);
  }

  // Offline Settings
  let supportsOffline = false;
  try {
    supportsOffline =
      gSelectedServer && gSelectedServer.offlineSupportLevel != 0;
    SetItemDisplay("offlineSettings", supportsOffline);
  } catch (e) {
    exceptions.push(e);
  }

  // Display Adv Features header, only if any of the items are displayed
  let displayAdvFeatures =
    canSearchMessages ||
    canHaveFilters ||
    canSubscribeImapFolders ||
    supportsOffline;
  SetItemDisplay("advancedFeaturesHeader", displayAdvFeatures);

  /* Advanced Featuers header and items : End */

  // If either of above features exist, show section separators
  SetItemDisplay("accountsSection", displayAdvFeatures);

  while (exceptions.length) {
    Cu.reportError(
      "Error in setting AccountCentral Items: " + exceptions.pop() + "\n"
    );
  }
}
/* eslint-enable complexity */

// Show the item if the item feature is supported
function SetItemDisplay(elemId, displayThisItem) {
  if (displayThisItem) {
    let elem = document.getElementById(elemId);
    if (elem) {
      elem.setAttribute("collapsed", false);
    }

    let elemSpacer = document.getElementById(elemId + "Spacer");
    if (elemSpacer) {
      elemSpacer.setAttribute("collapsed", false);
    }
  }
}

/**
 * Open Inbox for selected server.
 * If needed, open the twisty and select Inbox.
 */
function ReadMessages() {
  if (!gSelectedServer) {
    return;
  }
  try {
    window.parent.OpenInboxForServer(gSelectedServer);
  } catch (ex) {
    Cu.reportError("Error opening Inbox for server: " + ex + "\n");
  }
}

// Trigger composer for a new message
function ComposeAMessage(event) {
  // Pass event to allow holding Shift key for toggling HTML vs. plaintext format
  window.parent.MsgNewMessage(event);
}

/**
 * Open AccountManager to view settings for a given account
 * @param selectPage  the xul file name for the viewing page,
 *                    null for the account main page, other pages are
 *                    'am-server.xhtml', 'am-copies.xhtml', 'am-offline.xhtml',
 *                    'am-addressing.xhtml', 'am-smtp.xhtml'
 */
function ViewSettings(selectPage) {
  window.parent.MsgAccountManager(selectPage, gSelectedServer);
}

// Open AccountWizard to create an account
function CreateNewAccount() {
  window.parent.msgOpenAccountWizard();
}

function CreateNewAccountTB(type) {
  if (type == "mail") {
    AddMailAccount();
    return;
  }

  if (type == "feeds") {
    AddFeedAccount();
    return;
  }

  window.parent.msgOpenAccountWizard(function(state) {
    let win = getMostRecentMailWindow();
    if (state && win && win.gFolderTreeView && this.gCurrentAccount) {
      win.gFolderTreeView.selectFolder(
        this.gCurrentAccount.incomingServer.rootMsgFolder
      );
    }
  }, type);
}

// Bring up search interface for selected account
function SearchMessages() {
  window.parent.MsgSearchMessages(gSelectedFolder);
}

// Open filters window
function CreateMsgFilters() {
  window.parent.MsgFilters(null, gSelectedFolder);
}

// Open Subscribe dialog
function Subscribe() {
  if (!gSelectedServer) {
    return;
  }
  if (gSelectedServer.type == "rss") {
    window.parent.openSubscriptionsDialog(gSelectedServer.rootFolder);
  } else {
    window.parent.MsgSubscribe(gSelectedFolder);
  }
}

// Open junk mail settings dialog
function JunkSettings() {
  // TODO: function does not exist yet, will throw an exception if exposed
  window.parent.MsgJunkMail();
}
