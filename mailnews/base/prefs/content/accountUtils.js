/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from AccountManager.js */
/* globals openTab */ // From utilityOverlay.js
/* globals SelectFolder */ // From messageWindow.js or messenger.js.
/* globals MsgGetMessage */ // From mailWindowOverlay.js.

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var gNewAccountToLoad = null; // used to load new messages if we come from the mail3pane

/**
 * Filters out all fully valid accounts.
 *
 * @param {nsIMsgAccount[]} accounts
 * @returns {nsIMsgAccount[]}
 */
function getInvalidAccounts(accounts) {
  const invalidAccounts = [];
  for (const account of accounts) {
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

    for (const identity of account.identities) {
      if (!identity.valid) {
        invalidAccounts.push(account);
      }
    }
  }
  return invalidAccounts;
}

function showMailIntegrationDialog() {
  try {
    var shellService = Cc["@mozilla.org/suite/shell-service;1"].getService(
      Ci.nsIShellService
    );
    var appTypesCheck =
      shellService.shouldBeDefaultClientFor &
      (Ci.nsIShellService.MAIL | Ci.nsIShellService.NEWS);

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
 * @returns {boolean} - true if at least 1 account exists that requires
 *                      Local Folders, else false.
 */
function requireLocalFoldersAccount() {
  return MailServices.accounts.accounts.some(account =>
    ["imap", "pop3", "nntp"].includes(account.incomingServer?.type)
  );
}

/**
 * Open the Nntp Account Wizard, or focus it if it's already open.
 */
function openNewsgroupAccountWizard() {
  window.browsingContext.topChromeWindow.openDialog(
    "chrome://messenger/content/AccountWizard.xhtml",
    "AccountWizard",
    "chrome,modal,titlebar,centerscreen"
  );
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

/**
 * Opens Address Book tab and triggers the address book creation dialog based on
 * the passed type.
 *
 * @param {string} type - The address book type needing creation. Accepted types
 *   are "JS", "LDAP", and "CARDDAV".
 */
function addNewAddressBook(type) {
  window.browsingContext.topChromeWindow.toAddressBook([
    `cmd_createAddressBook${type}`,
  ]);
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
 * @param {?string} selectPage - The file name for the viewing page, or null for
 *   the account main page. Other pages are 'am-server.xhtml',
 *   'am-copies.xhtml', 'am-offline.xhtml', 'am-addressing.xhtml',
 *   'am-smtp.xhtml'
 * @param {nsIMsgIncomingServer} [server] - The server of the account to select.
 */
async function MsgAccountManager(selectPage, server) {
  const win = Services.wm.getMostRecentWindow("mail:3pane");
  if (!win) {
    // No window available, so force open a new one.
    openTab(
      "contentTab",
      {
        url: "about:accountsettings",
        onLoad(event, browser) {
          browser.contentDocument.documentElement.server = server;
          browser.contentDocument.documentElement.selectPage = selectPage;
          browser.contentDocument.getElementById("accounttree").focus();
        },
      },
      "window"
    );
    return;
  }

  const tabmail = win.document.getElementById("tabmail");
  // If the server wasn't specified, and we have the window open, try
  // and use the currently selected folder to work out the server to select.
  if (!server) {
    server = tabmail.currentAbout3Pane?.gFolder ?? null;
  }
  // If the server is still not found, account settings will default to
  // the first account.

  // If Account settings tab is already open, change the server
  // and the selected page, reload the tab and switch to the tab.
  for (const tabInfo of tabmail.tabInfo) {
    const tab = tabmail.getTabForBrowser(tabInfo.browser);
    if (tab?.urlbar?.value == "about:accountsettings") {
      tab.browser.contentDocument.documentElement.server = server;
      tab.browser.contentDocument.documentElement.selectPage = selectPage;
      tab.browser.contentWindow.onLoad();
      tabmail.switchToTab(tabInfo);
      return;
    }
  }

  // Else fallback to opening a new tab in the window.
  tabmail.openTab("contentTab", {
    url: "about:accountsettings",
    onLoad(event, browser) {
      browser.contentDocument.documentElement.server = server;
      browser.contentDocument.documentElement.selectPage = selectPage;
      browser.contentDocument.getElementById("accounttree").focus();
    },
  });
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

/**
 * Open the Account Setup Tab or focus it if it's already open.
 *
 * @param {boolean} [isInitialSetup] - If this call is for the initial account
 *   setup.
 */
function openAccountSetup(isInitialSetup = false) {
  const mail3Pane = Services.wm.getMostRecentWindow("mail:3pane");

  // Only show the Account Hub if this is not the initial setup and there is at
  // least one account set up already.
  if (
    !isInitialSetup &&
    MailServices.accounts.accounts.length &&
    Services.prefs.getBoolPref("mail.accounthub.enabled", false)
  ) {
    mail3Pane.openAccountHub();
    return;
  }

  const tabmail = mail3Pane.document.getElementById("tabmail");

  // Switch to the account setup tab if it's already open.
  for (const tabInfo of tabmail.tabInfo) {
    const tab = tabmail.getTabForBrowser(tabInfo.browser);
    if (tab?.urlbar?.value == "about:accountsetup") {
      const accountSetup = tabInfo.browser.contentWindow.gAccountSetup;
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
 * Reveal the Folder Pane after an account creation callback.
 */
function updateMailPaneUI() {
  // Nothing to update since no account has been created.
  if (MailServices.accounts.accounts.length == 0) {
    return;
  }

  const mail3Pane = Services.wm.getMostRecentWindow("mail:3pane");
  // Set the folderPaneVisible to true in the tabmail to prevent collapsing
  // on tab switch.
  const tabmail = mail3Pane.document.getElementById("tabmail");
  tabmail.tabInfo[0].folderPaneVisible = true;
}

/**
 * Open the OpenPGP Key Manager from outside the Account Settings.
 */
function openKeyManager() {
  window.browsingContext.topChromeWindow.openDialog(
    "chrome://openpgp/content/ui/enigmailKeyManager.xhtml",
    "enigmail:KeyManager",
    "dialog,centerscreen,resizable",
    {
      cancelCallback: null,
      okCallback: null,
    }
  );
}
