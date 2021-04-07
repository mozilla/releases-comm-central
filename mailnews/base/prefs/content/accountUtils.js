/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from AccountManager.js */
/* globals openTab */ // From utilityOverlay.js
/* globals SelectFolder, LoadPostAccountWizard */ // From messageWindow.js or msgMail3PaneWindow.js.
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
 * Verify that there is at least one account. If not, open a new account wizard.
 *
 * @param wizardCallback if the wizard is run, callback when it is done.
 * @param needsIdentity True only when verifyAccounts is called from the
 *                      compose window. This last condition is so that we open
 *                      the account wizard if the user does not have any
 *                      identities defined and tries to compose mail.
 * @param wizardOpen optional param that allows the caller to specify a
 *                   different method to open a wizard. The wizardOpen method
 *                   takes wizardCallback as an argument. The wizardCallback
 *                   doesn't take any arguments.
 */
function verifyAccounts(wizardCallback, needsIdentity, wizardOpen) {
  var openWizard = false;
  var prefillAccount;
  var ret = true;

  try {
    // migrate quoting preferences from global to per account. This function returns
    // true if it had to migrate, which we will use to mean this is a just migrated
    // or new profile
    var newProfile = migrateGlobalQuotingPrefs(
      MailServices.accounts.allIdentities
    );

    var accounts = MailServices.accounts.accounts;

    // as long as we have some accounts, we're fine.
    var accountCount = accounts.length;
    var invalidAccounts = getInvalidAccounts(accounts);
    if (invalidAccounts.length > 0 && invalidAccounts.length == accountCount) {
      prefillAccount = invalidAccounts[0];
    }

    // if there are no accounts, or all accounts are "invalid"
    // then kick off the account migration. Or if this is a new (to Mozilla) profile.
    // MCD can set up accounts without the profile being used yet
    if (newProfile) {
      // check if MCD is configured. If not, say this is not a new profile
      // so that we don't accidentally remigrate non MCD profiles.
      var adminUrl = Services.prefs.getCharPref(
        "autoadmin.global_config_url",
        ""
      );
      if (!adminUrl) {
        newProfile = false;
      }
    }
    if (
      (newProfile && !accountCount) ||
      accountCount == invalidAccounts.length
    ) {
      openWizard = true;
    }

    // openWizard is true if messenger migration returns some kind of
    // error (including those cases where there is nothing to migrate).
    // prefillAccount is non-null if there is at least one invalid account.
    // gAnyValidIdentity is true when you've got at least one *valid*
    // identity. Since local and RSS folders are identity-less accounts, if you
    // only have one of those, it will be false.
    // needsIdentity is true only when verifyAccounts is called from the
    // compose window. This last condition is so that we open the account
    // wizard if the user does not have any identities defined and tries to
    // compose mail.

    if (openWizard || prefillAccount || (!gAnyValidIdentity && needsIdentity)) {
      if (wizardOpen != undefined) {
        wizardOpen(wizardCallback);
      } else {
        MsgAccountWizard(wizardCallback);
      }
      ret = false;
    } else {
      var localFoldersExists;
      try {
        localFoldersExists = MailServices.accounts.localFoldersServer;
      } catch (ex) {
        localFoldersExists = false;
      }

      // we didn't create the MsgAccountWizard - we need to verify that local folders exists.
      if (!localFoldersExists) {
        MailServices.accounts.createLocalMailAccount();
      }
    }

    // This will do nothing on platforms without a shell service
    if ("@mozilla.org/suite/shell-service;1" in Cc) {
      // hack, set a time out to do this, so that the window can load first
      setTimeout(showMailIntegrationDialog, 0);
    }
    return ret;
  } catch (ex) {
    dump("error verifying accounts " + ex + "\n");
    return false;
  }
}

// we do this from a timer because if this is called from the onload=
// handler, then the parent window doesn't appear until after the wizard
// has closed, and this is confusing to the user
function MsgAccountWizard(wizardCallback) {
  setTimeout(function() {
    msgOpenAccountWizard(wizardCallback);
  }, 0);
}

/**
 * Open the Old Mail Account Wizard, or focus it if it's already open.
 *
 * @param wizardCallback if the wizard is run, callback when it is done.
 * @param type - optional account type token, for Tb.
 * @see msgNewMailAccount below for the new implementation.
 */
function msgOpenAccountWizard(wizardCallback, type) {
  gNewAccountToLoad = null;

  window.browsingContext.topChromeWindow.openDialog(
    "chrome://messenger/content/AccountWizard.xhtml",
    "AccountWizard",
    "chrome,modal,titlebar,centerscreen",
    { okCallback: wizardCallback, acctType: type }
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

function initAccountWizardTB(args) {
  let type = args[0] && args[0].acctType;
  let selType = null;
  if (type == "newsgroups") {
    selType = "newsaccount";
  }
  let accountwizard = document.querySelector("wizard");
  let acctyperadio = document.getElementById("acctyperadio");
  let feedRadio = acctyperadio.querySelector("radio[value='Feeds']");
  if (feedRadio) {
    feedRadio.remove();
  }
  if (selType) {
    acctyperadio.selectedItem = acctyperadio.querySelector(
      "radio[value='" + selType + "']"
    );
    accountwizard.advance("identitypage");
  } else {
    acctyperadio.selectedItem = acctyperadio.getItemAtIndex(0);
  }
}

function AddMailAccount() {
  NewMailAccount(updateMailPaneUI);
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
  tabmail.openTab("contentTab", {
    url: "about:accountsettings",
    onLoad,
  });

  for (let tabInfo of tabmail.tabInfo) {
    let tab = tabmail.getTabForBrowser(tabInfo.browser);
    if (tab && tab.urlbar && tab.urlbar.value == "about:accountsettings") {
      tab.tabNode.setAttribute("type", "accountManager");
      break;
    }
  }
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

// we do this from a timer because if this is called from the onload=
// handler, then the parent window doesn't appear until after the wizard
// has closed, and this is confusing to the user
function NewMailAccount(okCallback, extraData) {
  // Populate the extra data.
  if (!extraData) {
    extraData = {};
  }

  let mail3Pane = Services.wm.getMostRecentWindow("mail:3pane");

  if (!extraData.NewMailAccount) {
    extraData.NewMailAccount = NewMailAccount;
  }

  if (!extraData.msgNewMailAccount) {
    extraData.msgNewMailAccount = msgNewMailAccount;
  }

  if (!extraData.NewComposeMessage) {
    extraData.NewComposeMessage = mail3Pane.ComposeMessage;
  }

  if (!extraData.openAddonsMgr) {
    extraData.openAddonsMgr = mail3Pane.openAddonsMgr;
  }

  if (!extraData.okCallback) {
    extraData.okCallback = null;
  }

  if (!extraData.success) {
    extraData.success = false;
  }

  msgNewMailAccount(mail3Pane.msgWindow, okCallback, extraData);
}

function NewMailAccountProvisioner(aMsgWindow, args) {
  if (!args) {
    args = {};
  }

  args.msgWindow = aMsgWindow;

  let mail3Pane = Services.wm.getMostRecentWindow("mail:3pane");

  // If we couldn't find a 3pane, bail out.
  if (!mail3Pane) {
    Cu.reportError("Could not find a 3pane to connect to.");
    return;
  }

  let tabmail = mail3Pane.document.getElementById("tabmail");

  if (!tabmail) {
    Cu.reportError("Could not find a tabmail in the 3pane!");
    return;
  }

  // If there's already an accountProvisionerTab open, just focus it instead
  // of opening a new dialog.
  let apTab = tabmail.getTabInfoForCurrentOrFirstModeInstance(
    tabmail.tabModes.accountProvisionerTab
  );

  if (apTab) {
    tabmail.switchToTab(apTab);
    return;
  }

  // XXX make sure these are all defined in all contexts... to be on the safe
  // side, just get a mail:3pane and borrow the functions from it?
  if (!args.NewMailAccount) {
    args.NewMailAccount = NewMailAccount;
  }

  if (!args.msgNewMailAccount) {
    args.msgNewMailAccount = msgNewMailAccount;
  }

  if (!args.NewComposeMessage) {
    args.NewComposeMessage = mail3Pane.ComposeMessage;
  }

  if (!args.openAddonsMgr) {
    args.openAddonsMgr = mail3Pane.openAddonsMgr;
  }

  if (!args.okCallback) {
    args.okCallback = null;
  }

  let windowParams = "chrome,titlebar,centerscreen,width=640,height=480";

  // A new email address was successfully created and we need to load the UI
  // in case the account was created but the UI wasn't properly loaded. This
  // might happen if the user switches to the account provisioner dialog from
  // the emailWizard dialog on first launch. The okCallback of the emailWizard
  // is overwritten and it doesn't properly go through the verifyAccount().
  // FIXME: This can be removed after the account creation is moved to a tab.
  if (args.success) {
    if (document.getElementById("folderPaneBox").collapsed) {
      LoadPostAccountWizard(true);
    }
  } else {
    args.success = false;
    // If we're not opening up the success dialog, then our window should be
    // modal.
    windowParams = "modal," + windowParams;
  }

  // NOTE: If you're a developer, and you notice that the jQuery code in
  // accountProvisioner.xhtml isn't throwing errors or warnings, that's due
  // to bug 688273. Just make the window non-modal to get those errors and
  // warnings back, and then clear this comment when bug 688273 is closed.
  window.browsingContext.topChromeWindow.openDialog(
    "chrome://messenger/content/newmailaccount/accountProvisioner.xhtml",
    "AccountCreation",
    windowParams,
    args
  );
}

/**
 * Open the New Mail Account Wizard, or focus it if it's already open.
 *
 * @param msgWindow a msgWindow for us to use to verify the accounts.
 * @param okCallback an optional callback for us to call back to if
 *                   everything's okay.
 * @param extraData an optional param that allows us to pass data in and
 *                  out.  Used in the upcoming AccountProvisioner add-on.
 * @see msgOpenAccountWizard above for the previous implementation.
 */
function msgNewMailAccount(msgWindow, okCallback, extraData) {
  if (!msgWindow) {
    throw new Error("msgNewMailAccount must be given a msgWindow.");
  }

  let onLoad = function(event, browser) {
    browser.contentDocument.documentElement.msgWindow = msgWindow;
    browser.contentDocument.documentElement.okCallback = okCallback;
    browser.contentDocument.documentElement.extraData = extraData;
  };

  // We need to get the tabmail since this method might be called as a callback
  // from the account provisioner.
  let mailWindow = Services.wm.getMostRecentWindow("mail:3pane");
  let tabmail = mailWindow.document.getElementById("tabmail");

  tabmail.openTab("contentTab", {
    url: "about:accounthub",
    onLoad,
  });
}

/**
 * Open the Account Hub Tab or focus it if it's already open.
 */
function openAccountHubTab() {
  let mail3Pane = Services.wm.getMostRecentWindow("mail:3pane");

  let onLoad = function(event, browser) {
    browser.contentDocument.documentElement.okCallback = LoadPostAccountWizard;
    browser.contentDocument.documentElement.msgWindow = mail3Pane.msgWindow;
  };

  openTab("contentTab", {
    url: "about:accounthub",
    onLoad,
  });
}

/**
 * Reveal the Folder Pane and Today Pane after a successful account creation
 * callback.
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
