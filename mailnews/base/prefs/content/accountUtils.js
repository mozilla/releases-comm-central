/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from AccountManager.js */
/* globals openTab */ // From utilityOverlay.js
/* globals SelectFolder */ // From messageWindow.js or msgMail3PaneWindow.js.
/* globals MsgGetMessage */ // From mailWindowOverlay.js.

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gAnyValidIdentity = false; // If there are no valid identities for any account
// returns the first account with an invalid server or identity

var gNewAccountToLoad = null; // used to load new messages if we come from the mail3pane

function getInvalidAccounts(accounts) {
  let invalidAccounts = [];
  for (let account of accounts) {
    try {
      if (!account.incomingServer.valid) {
        invalidAccounts.push(account);
        // skip to the next account
        continue;
      }
    } catch (ex) {
      // this account is busted, just keep going
      continue;
    }

    for (let identity of account.identities) {
      if (identity.valid) {
        gAnyValidIdentity = true;
      } else {
        invalidAccounts.push(account);
      }
    }
  }
  return invalidAccounts;
}

function showMailIntegrationDialog() {
  const nsIShellService = Ci.nsIShellService;

  try {
    var shellService = Cc["@mozilla.org/suite/shell-service;1"].getService(
      nsIShellService
    );
    var appTypesCheck =
      shellService.shouldBeDefaultClientFor &
      (nsIShellService.MAIL | nsIShellService.NEWS);

    // show the default client dialog only if we have at least one account,
    // if we should check for the default client, and we want to check if we are
    // the default for mail/news and are not the default client for mail/news
    if (
      appTypesCheck &&
      shellService.shouldCheckDefaultClient &&
      !shellService.isDefaultClient(true, appTypesCheck)
    ) {
      window.browsingContext.topChromeWindow.openDialog(
        "chrome://communicator/content/defaultClientDialog.xhtml",
        "DefaultClient",
        "modal,centerscreen,chrome,resizable=no"
      );
    }
  } catch (ex) {}
}

/**
 * Check that an account exists which requires Local Folders.
 *
 * @returns {Boolean} - true if at least 1 account exists that requires
 *                      Local Folders, else false.
 */
function requireLocalFoldersAccount() {
  return MailServices.accounts.accounts.some(account =>
    ["imap", "pop3", "nntp"].includes(account.incomingServer?.type)
  );
}

/**
 * Open the Nntp Account Wizard, or focus it if it's already open.
 *
 * @param wizardCallback if the wizard is run, callback when it is done.
 * @see msgNewMailAccount below for the new implementation.
 */
function openNewsgroupAccountWizard(wizardCallback) {
  gNewAccountToLoad = null;

  window.browsingContext.topChromeWindow.openDialog(
    "chrome://messenger/content/AccountWizard.xhtml",
    "AccountWizard",
    "chrome,modal,titlebar,centerscreen",
    { okCallback: wizardCallback }
  );

  loadInboxForNewAccount();

  // If we started with no servers at all and "smtp servers" list selected,
  // refresh display somehow. Bug 58506.
  // TODO Better fix: select newly created account (in all cases)
  if (
    typeof getCurrentAccount == "function" && // in AccountManager, not menu
    !getCurrentAccount()
  ) {
    selectServer(null, null);
  }
}

function AddIMAccount() {
  window.browsingContext.topChromeWindow.openDialog(
    "chrome://messenger/content/chat/imAccountWizard.xhtml",
    "",
    "chrome,modal,titlebar,centerscreen"
  );
}

function AddFeedAccount() {
  window.browsingContext.topChromeWindow.openDialog(
    "chrome://messenger-newsblog/content/feedAccountWizard.xhtml",
    "",
    "chrome,modal,titlebar,centerscreen"
  );
}

function AddAddressBook() {
  window.browsingContext.topChromeWindow.openDialog(
    "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml",
    "",
    "chrome,modal,resizable=no,centerscreen"
  );
}

function addCardDAVAddressBook() {
  window.browsingContext.topChromeWindow.openDialog(
    "chrome://messenger/content/addressbook/abCardDAVDialog.xhtml",
    "",
    "chrome,resizable=no,centerscreen"
  );
}

function addLDAPAddressBook() {
  window.browsingContext.topChromeWindow.openDialog(
    "chrome://messenger/content/addressbook/pref-directory-add.xhtml",
    "",
    "chrome,resizable=no,centerscreen"
  );
}

function showCalendarWizard() {
  window.browsingContext.topChromeWindow.openDialog(
    "chrome://calendar/content/calendar-creation.xhtml",
    "caEditServer",
    "chrome,titlebar,resizable,centerscreen",
    {}
  );
}

/**
 * Opens the account settings window on the specified account
 * and page of settings. If the window is already open it is only focused.
 *
 * @param selectPage  The xul file name for the viewing page or
 *                    null for the account main page. Other pages are
 *                    'am-server.xhtml', 'am-copies.xhtml', 'am-offline.xhtml',
 *                    'am-addressing.xhtml', 'am-smtp.xhtml'
 * @param  aServer    The server of the account to select. Optional.
 */
function MsgAccountManager(selectPage, aServer) {
  if (!aServer) {
    if (typeof window.GetSelectedMsgFolders === "function") {
      let folders = window.GetSelectedMsgFolders();
      if (folders.length > 0) {
        aServer = folders[0].server;
      }
    }
    if (!aServer && typeof window.GetDefaultAccountRootFolder === "function") {
      let folder = window.GetDefaultAccountRootFolder();
      if (folder instanceof Ci.nsIMsgFolder) {
        aServer = folder.server;
      }
    }
  }
  let mailWindow = Services.wm.getMostRecentWindow("mail:3pane");
  let tabmail = mailWindow.document.getElementById("tabmail");

  mailWindow.focus();
  // If Account settings tab is already open, change the server
  // and the selected page, reload the tab and switch to the tab.
  for (let tabInfo of tabmail.tabInfo) {
    let tab = tabmail.getTabForBrowser(tabInfo.browser);
    if (tab && tab.urlbar && tab.urlbar.value == "about:accountsettings") {
      tab.browser.contentDocument.documentElement.server = aServer;
      tab.browser.contentDocument.documentElement.selectPage = selectPage;
      tab.browser.contentWindow.onLoad();
      tabmail.switchToTab(tabInfo);
      return;
    }
  }

  let onLoad = function(event, browser) {
    browser.contentDocument.documentElement.server = aServer;
    browser.contentDocument.documentElement.selectPage = selectPage;
    browser.contentDocument.getElementById("accounttree").focus();
  };
  tabmail.openTab("contentTab", { url: "about:accountsettings", onLoad });
}

function loadInboxForNewAccount() {
  // gNewAccountToLoad is set in the final screen of the Account Wizard if a POP account
  // was created, the download messages box is checked, and the wizard was opened from the 3pane
  if (gNewAccountToLoad) {
    var rootMsgFolder = gNewAccountToLoad.incomingServer.rootMsgFolder;
    const kInboxFlag = Ci.nsMsgFolderFlags.Inbox;
    var inboxFolder = rootMsgFolder.getFolderWithFlags(kInboxFlag);
    SelectFolder(inboxFolder.URI);
    window.focus();
    setTimeout(MsgGetMessage, 0);
    gNewAccountToLoad = null;
  }
}

// returns true if we migrated - it knows this because 4.x did not have the
// pref mailnews.quotingPrefs.version, so if it's not set, we're either
// migrating from 4.x, or a much older version of Mozilla.
function migrateGlobalQuotingPrefs(allIdentities) {
  // if reply_on_top and auto_quote exist then, if non-default
  // migrate and delete, if default just delete.
  var reply_on_top = 0;
  var auto_quote = true;
  var quotingPrefs = Services.prefs.getIntPref(
    "mailnews.quotingPrefs.version",
    0
  );
  var migrated = false;

  // If the quotingPrefs version is 0 then we need to migrate our preferences
  if (quotingPrefs == 0) {
    migrated = true;
    try {
      reply_on_top = Services.prefs.getIntPref("mailnews.reply_on_top");
      auto_quote = Services.prefs.getBoolPref("mail.auto_quote");
    } catch (ex) {}

    if (!auto_quote || reply_on_top) {
      for (let identity of allIdentities) {
        if (identity.valid) {
          identity.autoQuote = auto_quote;
          identity.replyOnTop = reply_on_top;
        }
      }
    }
    Services.prefs.setIntPref("mailnews.quotingPrefs.version", 1);
  }
  return migrated;
}

/**
 * Open the Account Setup Tab or focus it if it's already open.
 */
function openAccountSetupTab() {
  let mail3Pane = Services.wm.getMostRecentWindow("mail:3pane");
  let tabmail = mail3Pane.document.getElementById("tabmail");

  // Switch to the account setup tab if it's already open.
  for (let tabInfo of tabmail.tabInfo) {
    let tab = tabmail.getTabForBrowser(tabInfo.browser);
    if (tab && tab.urlbar && tab.urlbar.value == "about:accountsetup") {
      let accountSetup = tabInfo.browser.contentWindow.gAccountSetup;
      // Reset the entire UI only if the previously opened setup was completed.
      if (accountSetup._currentModename == "success") {
        accountSetup.resetSetup();
      }
      tabmail.switchToTab(tabInfo);
      return;
    }
  }

  tabmail.openTab("contentTab", { url: "about:accountsetup" });
}

/**
 * Open the account setup tab and switch to the success view to show the newly
 * created account, or show an error if the account wasn't created.
 *
 * @param {Object} account - A newly created account.
 * @param {string} name - The account name defined in the provider's website.
 * @param {string} email - The newly created email address.
 */
function openAccountSetupTabWithAccount(account, name, email) {
  // Define which actions we need to take after the account setup tab has been
  // loaded and we have access to its objects.
  let onTabLoaded = function(event, browser, account) {
    let accountSetup = browser.contentWindow.gAccountSetup;

    if (account) {
      // Update the account setup variables before kicking off the success view
      // which will start fetching linked services with these values.
      accountSetup._realname = name;
      accountSetup._email = email;
      accountSetup._password = account.incomingServer.password;
      accountSetup.showSuccessView(account);
      return;
    }

    accountSetup.showErrorNotification("account-setup-provisioner-error");
  };

  let mail3Pane = Services.wm.getMostRecentWindow("mail:3pane");
  let tabmail = mail3Pane.document.getElementById("tabmail");

  // Switch to the account setup tab if it's already open.
  for (let tabInfo of tabmail.tabInfo) {
    let tab = tabmail.getTabForBrowser(tabInfo.browser);
    if (tab && tab.urlbar && tab.urlbar.value == "about:accountsetup") {
      let accountSetup = tabInfo.browser.contentWindow.gAccountSetup;
      // Reset the entire UI only if the previously opened setup was completed.
      if (accountSetup._currentModename == "success") {
        accountSetup.resetSetup();
      }
      tabmail.switchToTab(tabInfo);
      onTabLoaded(null, tabInfo.browser, account);
      return;
    }
  }

  // Open the account setup tab.
  tabmail.openTab("contentTab", {
    url: "about:accountsetup",
    onLoad(event, browser) {
      onTabLoaded(event, browser, account);
    },
  });
}

/**
 * Open the Account Provisioner Tab or focus it if it's already open.
 */
function openAccountProvisionerTab() {
  let mail3Pane = Services.wm.getMostRecentWindow("mail:3pane");
  let tabmail = mail3Pane.document.getElementById("tabmail");

  // Switch to the account setup tab if it's already open.
  for (let tabInfo of tabmail.tabInfo) {
    let tab = tabmail.getTabForBrowser(tabInfo.browser);
    if (tab && tab.urlbar && tab.urlbar.value == "about:accountprovisioner") {
      tabmail.switchToTab(tabInfo);
      return;
    }
  }

  tabmail.openTab("contentTab", { url: "about:accountprovisioner" });
}

/**
 * Reveal the Folder Pane after an account creation callback.
 */
function updateMailPaneUI() {
  // Nothing to update since no account has been created.
  if (MailServices.accounts.accounts.length == 0) {
    return;
  }

  let mail3Pane = Services.wm.getMostRecentWindow("mail:3pane");
  // Show the folder pane.
  mail3Pane.document.getElementById("folderPaneBox").collapsed = false;
  mail3Pane.document.getElementById("folderpane_splitter").collapsed = false;
  // Set the folderPaneVisible to true in the tabmail to prevent collapsing
  // on tab switch.
  let tabmail = mail3Pane.document.getElementById("tabmail");
  tabmail.tabInfo[0].folderDisplay.folderPaneVisible = true;
}

/**
 * Open the OpenPGP Key Manager from outside the Account Settings.
 */
function openKeyManager() {
  // Bug 1638153: The rootTreeItem object has been removed after 78. We need to
  // the availability of "browsingContext" to use the right DOM window in 79+.
  let w =
    "browsingContext" in window
      ? window.browsingContext.topChromeWindow
      : window.docShell.rootTreeItem.domWindow;

  let args = {
    cancelCallback: null,
    okCallback: null,
  };

  w.openDialog(
    "chrome://openpgp/content/ui/enigmailKeyManager.xhtml",
    "enigmail:KeyManager",
    "dialog,centerscreen,resizable",
    args
  );
}
