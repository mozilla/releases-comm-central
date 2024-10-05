/* -*- Mode: JavaScript; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from accountUtils.js */
/* import-globals-from amUtils.js */
/* import-globals-from aw-identity.js */
/* import-globals-from aw-incoming.js */
/* import-globals-from aw-accname.js */
/* import-globals-from aw-done.js */

/* NOTE: This Account Wizard is *only* for Newsgroup accounts.
 * Historically, it was a generic Account Wizard, hence the generic naming.
 */

/*
  data flow into the account wizard like this:

  For new accounts:
  * pageData -> accountData -> createAccount -> finishAccount

  for "unfinished accounts"
  * account -> accountData -> pageData -> accountData -> finishAccount
*/

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { NntpUtils } = ChromeUtils.importESModule(
  "resource:///modules/NntpUtils.sys.mjs"
);

var contentWindow;

var gPageData;

var gPrefsBundle, gMessengerBundle;

// the current nsIMsgAccount
var gCurrentAccount;

// The default account before we create a new account.
// We need to store this as just asking for the default account may switch
// it to the newly created one if there was none before.
var gDefaultAccount;

// the current associative array that
// will eventually be dumped into the account
var gCurrentAccountData = null;

// default picker mode for copies and folders
var gDefaultSpecialFolderPickerMode = "0";

// event handlers
function onAccountWizardLoad() {
  document.querySelector("wizard").addEventListener("wizardcancel", onCancel);
  document
    .querySelector("wizard")
    .addEventListener("wizardfinish", FinishAccount);
  const identityPage = document.getElementById("identitypage");
  identityPage.addEventListener("pageshow", identityPageInit);
  identityPage.addEventListener("pageadvanced", identityPageUnload);
  identityPage.next = "newsserver";
  const newsserverPage = document.getElementById("newsserver");
  newsserverPage.addEventListener("pageshow", incomingPageInit);
  newsserverPage.addEventListener("pageadvanced", incomingPageUnload);
  newsserverPage.next = "accnamepage";
  const accnamePage = document.getElementById("accnamepage");
  accnamePage.addEventListener("pageshow", acctNamePageInit);
  accnamePage.addEventListener("pageadvanced", acctNamePageUnload);
  accnamePage.next = "done";
  const donePage = document.getElementById("done");
  donePage.addEventListener("pageshow", donePageInit);

  gPrefsBundle = document.getElementById("bundle_prefs");
  gMessengerBundle = document.getElementById("bundle_messenger");

  checkForInvalidAccounts();

  // It is fine if there is no default account, this is expected the first
  // time you launch mail on a new profile.
  gDefaultAccount = MailServices.accounts.defaultAccount;

  identityPageInit();
}

function onCancel() {
  if ("ActivationOnCancel" in this && this.ActivationOnCancel()) {
    return false;
  }
  var firstInvalidAccount = getInvalidAccounts(
    MailServices.accounts.accounts
  ).find(account => account.incomingServer.type == "nntp");
  var closeWizard = true;

  // if the user cancels the the wizard when it pops up because of
  // an invalid account (example, a webmail account that activation started)
  // we just force create it by setting some values and calling the FinishAccount()
  // see bug #47521 for the full discussion
  if (firstInvalidAccount) {
    var pageData = GetPageData();
    // set the fullName if it doesn't exist
    if (!pageData.fullName) {
      pageData.fullName = "";
    }

    // set the email if it doesn't exist
    if (!pageData.email) {
      pageData.email = "user@domain.invalid";
    }

    // call FinishAccount() and not onFinish(), since the "finish"
    // button may be disabled
    FinishAccount();
  } else if (!MailServices.accounts.accounts.length) {
    // since this is not an invalid account
    // really cancel if the user hits the "cancel" button
    // if the length of the account list is less than 1, there are no accounts
    const confirmMsg = gPrefsBundle.getString("cancelWizard");
    const confirmTitle = gPrefsBundle.getString("accountWizard");
    const result = Services.prompt.confirmEx(
      window,
      confirmTitle,
      confirmMsg,
      Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
        Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_1,
      gPrefsBundle.getString("WizardExit"),
      gPrefsBundle.getString("WizardContinue"),
      null,
      null,
      { value: 0 }
    );

    if (result == 1) {
      closeWizard = false;
    }
  }

  return closeWizard;
}

function FinishAccount() {
  try {
    var pageData = GetPageData();

    var accountData = gCurrentAccountData;

    if (!accountData) {
      accountData = {};
    }

    // we may need local folders before account is "Finished"
    // if it's a pop3 account which defers to Local Folders.
    verifyLocalFoldersAccount();

    PageDataToAccountData(pageData, accountData);

    // we might be simply finishing another account
    if (!gCurrentAccount) {
      gCurrentAccount = createAccount(accountData);
    }

    // transfer all attributes from the accountdata
    finishAccount(gCurrentAccount, accountData);

    setupCopiesAndFoldersServer(gCurrentAccount, accountData);

    if (!gDefaultAccount && gCurrentAccount.incomingServer.canBeDefaultServer) {
      MailServices.accounts.defaultAccount = gCurrentAccount;
    }

    // in case we crash, force us a save of the prefs file NOW
    try {
      MailServices.accounts.saveAccountInfo();
    } catch (ex) {
      dump("Error saving account info: " + ex + "\n");
    }
    const openerWindow = window.opener.top;
    // The following block is the same as in feedAccountWizard.js.
    if ("selectServer" in openerWindow) {
      // Opened from Account Settings.
      openerWindow.selectServer(gCurrentAccount.incomingServer);
    }

    // Post a message to the main window on successful account setup.
    openerWindow.postMessage("account-created", "*");

    window.close();
  } catch (ex) {
    dump("FinishAccount failed, " + ex + "\n");
  }
}

// prepopulate pageData with stuff from accountData
// use: to prepopulate the wizard with account information
function AccountDataToPageData(accountData, pageData) {
  var server = accountData.incomingServer;
  pageData.hostname = server.hostName;
  pageData.prettyName = server.prettyName || "";

  var identity;

  if (accountData.identity) {
    dump("This is an accountdata\n");
    identity = accountData.identity;
  } else if (accountData.identities) {
    identity = accountData.identities[0];
    dump("this is an account, id= " + identity + "\n");
  }

  pageData.email = identity.email || "";
  pageData.fullName = identity.fullName || "";
}

// take data from each page of pageData and dump it into accountData
// use: to put results of wizard into a account-oriented object
function PageDataToAccountData(pageData, accountData) {
  if (!accountData.identity) {
    accountData.identity = {};
  }
  if (!accountData.incomingServer) {
    accountData.incomingServer = {};
  }

  var identity = accountData.identity;
  var server = accountData.incomingServer;

  if (pageData.email) {
    identity.email = pageData.email;
  }
  if (pageData.fullName) {
    identity.fullName = pageData.fullName;
  }

  server.hostName = pageData.hostname;
  if (pageData.prettyName) {
    server.prettyName = pageData.prettyName;
  }
}

// given an accountData structure, create an account
// (but don't fill in any fields, that's for finishAccount()
function createAccount(accountData) {
  const hostName = accountData.incomingServer.hostName;
  // If we're here, the server must not be associated with any account, so reuse
  // it.
  let server = NntpUtils.findServer(hostName);

  if (!server) {
    dump(`MailServices.accounts.createIncomingServer(${hostName})\n`);
    // Create a (actual) server.
    server = MailServices.accounts.createIncomingServer(null, hostName, "nntp");
  }

  dump("MailServices.accounts.createAccount()\n");
  // Create an account.
  const account = MailServices.accounts.createAccount();

  // only create an identity for this account if we really have one
  // (use the email address as a check)
  if (accountData.identity && accountData.identity.email) {
    dump("MailServices.accounts.createIdentity()\n");
    // Create an identity.
    const identity = MailServices.accounts.createIdentity();

    // New nntp identities should use plain text by default;
    // we want that GNKSA (The Good Net-Keeping Seal of Approval).
    identity.composeHtml = false;

    account.addIdentity(identity);
  }

  // we mark the server as invalid so that the account manager won't
  // tell RDF about the new server - it's not quite finished getting
  // set up yet, in particular, the deferred storage pref hasn't been set.
  server.valid = false;
  // Set the new account to use the new server.
  account.incomingServer = server;
  server.valid = true;
  return account;
}

// given an accountData structure, copy the data into the
// given account, incoming server, and so forth
function finishAccount(account, accountData) {
  if (accountData.incomingServer) {
    var destServer = account.incomingServer;
    var srcServer = accountData.incomingServer;
    copyObjectToInterface(destServer, srcServer, true);

    // See if there are any protocol-specific attributes.
    // If so, we use the type to get the IID, QueryInterface
    // as appropriate, then copy the data over.
    const typeProperty = "ServerType-" + srcServer.type;
    const serverAttrs =
      typeProperty in srcServer ? srcServer[typeProperty] : null;
    dump(`srcServer.${typeProperty} = ${serverAttrs}\n`);
    if (serverAttrs) {
      // handle server-specific stuff
      var IID;
      try {
        IID = destServer.protocolInfo.serverIID;
      } catch (ex) {
        console.error(`Could not get IID for ${srcServer.type}`, ex);
      }

      if (IID) {
        const destProtocolServer = destServer.QueryInterface(IID);
        const srcProtocolServer = srcServer["ServerType-" + srcServer.type];

        dump("Copying over " + srcServer.type + "-specific data\n");
        copyObjectToInterface(destProtocolServer, srcProtocolServer, false);
      }
    }

    account.incomingServer.valid = true;
    // hack to cause an account loaded notification now the server is valid
    account.incomingServer = account.incomingServer; // eslint-disable-line no-self-assign
  }

  // copy identity info
  var destIdentity = account.identities.length ? account.identities[0] : null;

  if (destIdentity) {
    // does this account have an identity?
    if (accountData.identity && accountData.identity.email) {
      // fixup the email address if we have a default domain
      const emailArray = accountData.identity.email.split("@");
      if (emailArray.length < 2 && accountData.domain) {
        accountData.identity.email += "@" + accountData.domain;
      }

      copyObjectToInterface(destIdentity, accountData.identity, true);
      destIdentity.valid = true;
    }

    /**
     * If signature file need to be set, get the path to the signature file.
     * Signature files, if exist, are placed under default location. Get
     * default files location for messenger using directory service. Signature
     * file name should be extracted from the account data to build the complete
     * path for signature file. Once the path is built, set the identity's signature pref.
     */
    if (destIdentity.attachSignature) {
      var sigFileName = accountData.signatureFileName;
      const sigFile = MailServices.mailSession.getDataFilesDir("messenger");
      sigFile.append(sigFileName);
      destIdentity.signature = sigFile;
    }
  } // if the account has an identity...

  if (this.FinishAccountHook != undefined) {
    this.FinishAccountHook(accountData.domain);
  }
}

// Helper method used by copyObjectToInterface which attempts to set dest[attribute] as a generic
// attribute on the xpconnect object, src.
// This routine skips any attribute that begins with ServerType-
function setGenericAttribute(dest, src, attribute) {
  if (!attribute.toLowerCase().startsWith("servertype-") && src[attribute]) {
    switch (typeof src[attribute]) {
      case "string":
        dest.setUnicharAttribute(attribute, src[attribute]);
        break;
      case "boolean":
        dest.setBoolAttribute(attribute, src[attribute]);
        break;
      case "number":
        dest.setIntAttribute(attribute, src[attribute]);
        break;
      default:
        dump(
          "Error: No Generic attribute " +
            attribute +
            " found for: " +
            dest +
            "\n"
        );
        break;
    }
  }
}

// copy over all attributes from dest into src that already exist in src
// the assumption is that src is an XPConnect interface full of attributes
// @param useGenericFallback if we can't set an attribute directly on src, then fall back
//        and try setting it generically. This assumes that src supports setIntAttribute, setUnicharAttribute
//        and setBoolAttribute.
function copyObjectToInterface(dest, src, useGenericFallback) {
  if (!dest) {
    return;
  }
  if (!src) {
    return;
  }

  var attribute;
  for (attribute in src) {
    if (dest.__lookupSetter__(attribute)) {
      if (dest[attribute] != src[attribute]) {
        dest[attribute] = src[attribute];
      }
    } else if (useGenericFallback) {
      // fall back to setting the attribute generically
      setGenericAttribute(dest, src, attribute);
    }
  } // for each attribute in src we want to copy
}

// check if there already is a "Local Folders"
// if not, create it.
function verifyLocalFoldersAccount() {
  var localMailServer = null;
  try {
    localMailServer = MailServices.accounts.localFoldersServer;
  } catch (ex) {
    // dump("exception in findserver: " + ex + "\n");
    localMailServer = null;
  }

  try {
    if (!localMailServer) {
      // dump("Creating local mail account\n");
      // creates a copy of the identity you pass in
      MailServices.accounts.createLocalMailAccount();
      try {
        localMailServer = MailServices.accounts.localFoldersServer;
      } catch (ex) {
        dump(
          "error!  we should have found the local mail server after we created it.\n"
        );
        localMailServer = null;
      }
    }
  } catch (ex) {
    dump("Error in verifyLocalFoldersAccount" + ex + "\n");
  }
}

function setupCopiesAndFoldersServer(account, accountData) {
  try {
    var server = account.incomingServer;

    if (!account.identities.length) {
      return false;
    }

    const identity = account.identities[0];
    // For this server, do we default the folder prefs to this server, or to the "Local Folders" server
    // If it's deferred, we use the local folders account.
    var defaultCopiesAndFoldersPrefsToServer =
      server.defaultCopiesAndFoldersPrefsToServer;

    var copiesAndFoldersServer = null;
    if (defaultCopiesAndFoldersPrefsToServer) {
      copiesAndFoldersServer = server;
    } else {
      if (!MailServices.accounts.localFoldersServer) {
        dump("error!  we should have a local mail server at this point\n");
        return false;
      }
      copiesAndFoldersServer = MailServices.accounts.localFoldersServer;
    }

    setDefaultCopiesAndFoldersPrefs(
      identity,
      copiesAndFoldersServer,
      accountData
    );
  } catch (ex) {
    // return false (meaning we did not setupCopiesAndFoldersServer)
    // on any error
    dump("Error in setupCopiesAndFoldersServer: " + ex + "\n");
    return false;
  }
  return true;
}

function setDefaultCopiesAndFoldersPrefs(identity, server, accountData) {
  var rootFolder = server.rootFolder;

  // we need to do this or it is possible that the server's draft,
  // stationery fcc folder will not be in rdf
  //
  // this can happen in a couple cases
  // 1) the first account we create, creates the local mail.  since
  // local mail was just created, it obviously hasn't been opened,
  // or in rdf..
  // 2) the account we created is of a type where
  // defaultCopiesAndFoldersPrefsToServer is true
  // this since we are creating the server, it obviously hasn't been
  // opened, or in rdf.
  //
  // this makes the assumption that the server's draft, stationery fcc folder
  // are at the top level (ie subfolders of the root folder.)  this works
  // because we happen to be doing things that way, and if the user changes
  // that, it will work because to change the folder, it must be in rdf,
  // coming from the folder cache, in the worst case.
  var msgFolder = rootFolder.QueryInterface(Ci.nsIMsgFolder);

  /**
   * When a new account is created, folders 'Sent', 'Drafts'
   * and 'Templates' are not created then, but created on demand at runtime.
   * But we do need to present them as possible choices in the Copies and Folders
   * UI. To do that, folder URIs have to be created and stored in the prefs file.
   * So, if there is a need to build special folders, append the special folder
   * names and create right URIs.
   */
  var folderDelim = "/";

  /* we use internal names known to everyone like Sent, Templates and Drafts */
  /* if folder names were already given in isp rdf, we use them,
     otherwise we use internal names known to everyone like Sent, Templates and Drafts */

  // Note the capital F, D and S!
  var draftFolder =
    accountData.identity && accountData.identity.DraftFolder
      ? accountData.identity.DraftFolder
      : "Drafts";
  var stationeryFolder =
    accountData.identity && accountData.identity.StationeryFolder
      ? accountData.identity.StationeryFolder
      : "Templates";
  var fccFolder =
    accountData.identity && accountData.identity.FccFolder
      ? accountData.identity.FccFolder
      : "Sent";

  identity.draftFolder = msgFolder.server.serverURI + folderDelim + draftFolder;
  identity.stationeryFolder =
    msgFolder.server.serverURI + folderDelim + stationeryFolder;
  identity.fccFolder = msgFolder.server.serverURI + folderDelim + fccFolder;

  // Note the capital F, D and S!
  identity.fccFolderPickerMode =
    accountData.identity && accountData.identity.FccFolder
      ? 1
      : gDefaultSpecialFolderPickerMode;
  identity.draftsFolderPickerMode =
    accountData.identity && accountData.identity.DraftFolder
      ? 1
      : gDefaultSpecialFolderPickerMode;
  identity.tmplFolderPickerMode =
    accountData.identity && accountData.identity.StationeryFolder
      ? 1
      : gDefaultSpecialFolderPickerMode;
}

function checkForInvalidAccounts() {
  var firstInvalidAccount = getInvalidAccounts(
    MailServices.accounts.accounts
  ).find(account => account.incomingServer.type == "nntp");

  if (firstInvalidAccount) {
    var pageData = GetPageData();
    dump(
      "We have an invalid account, " +
        firstInvalidAccount +
        ", let's use that!\n"
    );
    gCurrentAccount = firstInvalidAccount;

    var accountData = {};
    accountData.incomingServer = firstInvalidAccount.incomingServer;
    accountData.identity = firstInvalidAccount.identities[0];
    AccountDataToPageData(accountData, pageData);

    gCurrentAccountData = accountData;
  }
}

function getUsernameFromEmail(email) {
  return email && email.substr(0, email.indexOf("@"));
}

function GetPageData() {
  if (!gPageData) {
    gPageData = {};
  }

  return gPageData;
}

// flush the XUL cache - just for debugging purposes - not called
function onFlush() {
  Services.prefs.setBoolPref("nglayout.debug.disable_xul_cache", true);
  Services.prefs.setBoolPref("nglayout.debug.disable_xul_cache", false);
}
