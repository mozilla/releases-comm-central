/* -*- Mode: JavaScript; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Here's how this dialog works:
 * The main dialog contains a tree on the left (id="accounttree") and an
 * iframe which loads a particular preference document (such as am-main.xhtml)
 * on the right.
 *
 * When the user clicks on items in the tree on the left, two things have
 * to be determined before the UI can be updated:
 * - the relevant account
 * - the relevant page
 *
 * When both of these are known, this is what happens:
 * - every form element of the previous page is saved in the account value
 *   hashtable for the previous account
 * - the relevant page is loaded into the iframe
 * - each form element in the page is filled in with an appropriate value
 *   from the current account's hashtable
 * - in the iframe inside the page, if there is an onInit() method,
 *   it is called. The onInit method can further update this page based
 *   on values set in the previous step.
 */

/* import-globals-from accountUtils.js */
/* import-globals-from am-prefs.js */
/* import-globals-from amUtils.js */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
var { Gloda } = ChromeUtils.importESModule(
  "resource:///modules/gloda/Gloda.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  FolderTreeProperties: "resource:///modules/FolderTreeProperties.sys.mjs",
  FolderUtils: "resource:///modules/FolderUtils.sys.mjs",
  UIDensity: "resource:///modules/UIDensity.sys.mjs",
  UIFontSize: "resource:///modules/UIFontSize.sys.mjs",
});

var { cleanUpHostName, isLegalHostNameOrIP } = ChromeUtils.importESModule(
  "resource:///modules/hostnameUtils.sys.mjs"
);
const { ChatIcons } = ChromeUtils.importESModule(
  "resource:///modules/chatIcons.sys.mjs"
);

ChromeUtils.defineLazyGetter(this, "gSubDialog", function () {
  const { SubDialogManager } = ChromeUtils.importESModule(
    "resource://gre/modules/SubDialog.sys.mjs"
  );
  return new SubDialogManager({
    dialogStack: document.getElementById("dialogStack"),
    dialogTemplate: document.getElementById("dialogTemplate"),
    dialogOptions: {
      styleSheets: [
        "chrome://messenger/skin/preferences/dialog.css",
        "chrome://messenger/skin/preferences/preferences.css",
      ],
      resizeCallback: ({ frame }) => {
        UIFontSize.registerWindow(frame.contentWindow);

        // Resize the dialog to fit the content with edited font size.
        requestAnimationFrame(() => {
          const dialogs = frame.ownerGlobal.gSubDialog._dialogs;
          const dialog = dialogs.find(
            d => d._frame.contentDocument == frame.contentDocument
          );
          if (dialog) {
            UIFontSize.resizeSubDialog(dialog);
          }
        });
      },
    },
  });
});

// If Local directory has changed the app needs to restart. Once this is set
// a restart will be attempted at each attempt to close the Account manager with OK.
var gRestartNeeded = false;

// This is a hash-map for every account we've touched in the pane. Each entry
// has additional maps of attribute-value pairs that we're going to want to save
// when the user hits OK.
var accountArray;
var gGenericAttributeTypes;

var currentAccount;
var currentPageId;

var pendingAccount;
var pendingPageId;

/**
 * This array contains filesystem folders that are deemed inappropriate
 * for use as the local directory pref for message storage.
 * It is global to allow extensions to add to/remove from it if needed.
 * Extensions adding new server types should first consider setting
 * nsIMsgProtocolInfo(of the server type).defaultLocalPath properly
 * so that the test will allow that directory automatically.
 * See the checkLocalDirectoryIsSafe function for description of the members.
 */
var gDangerousLocalStorageDirs = [
  // profile folder
  { dirsvc: "ProfD", OS: null },
  // GRE install folder
  { dirsvc: "GreD", OS: null },
  // Application install folder
  { dirsvc: "CurProcD", OS: null },
  // system temporary folder
  { dirsvc: "TmpD", OS: null },
  // Windows system folder
  { dirsvc: "SysD", OS: "WINNT" },
  // Windows folder
  { dirsvc: "WinD", OS: "WINNT" },
  // Program Files folder
  { dirsvc: "ProgF", OS: "WINNT" },
  // trash folder
  { dirsvc: "Trsh", OS: "Darwin" },
  // Mac OS system folder
  { dir: "/System", OS: "Darwin" },
  // devices folder
  { dir: "/dev", OS: "Darwin,Linux" },
  // process info folder
  { dir: "/proc", OS: "Linux" },
  // system state folder
  { dir: "/sys", OS: "Linux" },
];

// This sets an attribute in a xul element so that we can later
// know what value to substitute in a prefstring.  Different
// preference types set different attributes.  We get the value
// in the same way as the function getAccountValue() determines it.
function updateElementWithKeys(account, element, type) {
  switch (type) {
    case "identity":
      element.identitykey = account.defaultIdentity.key;
      break;
    case "pop3":
    case "imap":
    case "nntp":
    case "server":
      element.serverkey = account.incomingServer.key;
      break;
    case "smtp":
      if (MailServices.outgoingServer.defaultServer) {
        element.serverkey = MailServices.outgoingServer.defaultServer.key;
      }
      break;
    default:
    //      dump("unknown element type! "+type+"\n");
  }
}

// called when the whole document loads
// perform initialization here
function onLoad() {
  const selectedServer = document.documentElement.server;
  const selectPage = document.documentElement.selectPage || null;

  // Arguments can have two properties: (1) "server," the nsIMsgIncomingServer
  // to select initially and (2) "selectPage," the page for that server to that
  // should be selected.

  accountArray = {};
  gGenericAttributeTypes = {};

  gAccountTree.load();

  setTimeout(selectServer, 0, selectedServer, selectPage);

  const contentFrame = document.getElementById("contentFrame");
  contentFrame.addEventListener("load", () => {
    document
      .getElementById("accountTreeCreateAccount")
      .addEventListener("click", event => {
        document.getElementById("accountAddPopup").openPopup(event.target, {
          position: "after_start",
          triggerEvent: event,
        });
      });
    document
      .getElementById("accounttree")
      .addEventListener("contextmenu", event => {
        event.preventDefault();
      });
    const inputElements = contentFrame.contentDocument.querySelectorAll(
      "checkbox, input, menulist, textarea, radiogroup, richlistbox"
    );
    contentFrame.contentDocument.addEventListener("prefchange", () => {
      onAccept(true);
    });
    for (const input of inputElements) {
      if (input.localName == "input" || input.localName == "textarea") {
        input.addEventListener("change", () => {
          onAccept(true);
        });
      } else {
        input.addEventListener("command", () => {
          onAccept(true);
        });
      }
    }
    UIFontSize.registerWindow(contentFrame.contentWindow);
  });

  UIDensity.registerWindow(window);
  UIFontSize.registerWindow(window);
}

function onUnload() {
  gAccountTree.unload();
}

function selectServer(server, selectPageId) {
  const accountTree = document.getElementById("accounttree");

  // Default to showing the first account.
  let accountRow = accountTree.rows[0];

  // Find the tree-node for the account we want to select.
  if (server) {
    for (const row of accountTree.children) {
      const account = row._account;
      if (account && server == account.incomingServer) {
        accountRow = row;
        // Make sure all the panes of the account to be selected are shown.
        accountTree.expandRow(accountRow);
        break;
      }
    }
  }

  let pageToSelect = accountRow;

  if (selectPageId) {
    // Find the page that also corresponds to this server.
    // It either is the accountRow itself...
    const pageId = accountRow.getAttribute("PageTag");
    if (pageId != selectPageId) {
      // ... or one of its children.
      pageToSelect = accountRow.querySelector(
        '[PageTag="' + selectPageId + '"]'
      );
    }
  }

  accountTree.selectedIndex = accountTree.rows.indexOf(pageToSelect);
}

function replaceWithDefaultSmtpServer(deletedSmtpServerKey) {
  // First we replace the smtpserverkey in every identity.
  for (const identity of MailServices.accounts.allIdentities) {
    if (identity.smtpServerKey == deletedSmtpServerKey) {
      identity.smtpServerKey = "";
    }
  }

  // When accounts have already been loaded in the panel then the first
  // replacement will be overwritten when the accountvalues are written out
  // from the pagedata.  We get the loaded accounts and check to make sure
  // that the account exists for the accountid and that it has a default
  // identity associated with it (to exclude smtpservers and local folders)
  // Then we check only for the identity[type] and smtpServerKey[slot] and
  // replace that with the default smtpserverkey if necessary.

  for (var accountid in accountArray) {
    var account = accountArray[accountid]._account;
    if (account && account.defaultIdentity) {
      var accountValues = accountArray[accountid];
      var smtpServerKey = getAccountValue(
        account,
        accountValues,
        "identity",
        "smtpServerKey",
        null,
        false
      );
      if (smtpServerKey == deletedSmtpServerKey) {
        setAccountValue(accountValues, "identity", "smtpServerKey", "");
      }
    }
  }
}

/**
 * Called when OK is clicked on the dialog.
 *
 * @param {boolean} aDoChecks - If true, execute checks on data, otherwise hope
 *   they were already done elsewhere and proceed directly to saving the data.
 */
function onAccept(aDoChecks) {
  if (aDoChecks) {
    // Check if user/host have been modified correctly.
    if (!checkUserServerChanges(true)) {
      return false;
    }

    if (!checkAccountNameIsValid()) {
      return false;
    }
  }

  // Run checks as if the page was being left.
  if ("onLeave" in top.frames.contentFrame) {
    if (!top.frames.contentFrame.onLeave()) {
      // Prevent closing Account manager if user declined the changes.
      return false;
    }
  }

  if (!onSave()) {
    return false;
  }

  // hack hack - save the prefs file NOW in case we crash
  Services.prefs.savePrefFile(null);

  if (gRestartNeeded) {
    MailUtils.restartApplication();
    // Prevent closing Account manager in case restart failed. If restart did not fail,
    // return value does not matter, as we are restarting.
    return false;
  }

  return true;
}

/**
 * See if the given path to a directory is usable on the current OS.
 *
 * aLocalPath  the nsIFile of a directory to check.
 */
function checkDirectoryIsValid(aLocalPath) {
  // Any directory selected in the file picker already exists.
  // Any directory specified in prefs.js will be created at start if it does
  // not exist yet.
  // If at the time of entering Account Manager the directory does not exist,
  // it must be invalid in the current OS or not creatable due to permissions.
  // Even then, the backend sometimes tries to create a new one
  // under the current profile.
  if (!aLocalPath.exists() || !aLocalPath.isDirectory()) {
    return false;
  }

  if (Services.appinfo.OS == "WINNT") {
    // Do not allow some special filenames on Windows.
    // Taken from mozilla/widget/windows/nsDataObj.cpp::MangleTextToValidFilename()
    const dirLeafName = aLocalPath.leafName;
    const kForbiddenNames = [
      "COM1",
      "COM2",
      "COM3",
      "COM4",
      "COM5",
      "COM6",
      "COM7",
      "COM8",
      "COM9",
      "LPT1",
      "LPT2",
      "LPT3",
      "LPT4",
      "LPT5",
      "LPT6",
      "LPT7",
      "LPT8",
      "LPT9",
      "CON",
      "PRN",
      "AUX",
      "NUL",
      "CLOCK$",
    ];
    if (kForbiddenNames.includes(dirLeafName)) {
      return false;
    }
  }

  // The directory must be readable and writable to work as a mail store.
  if (!(aLocalPath.isReadable() && aLocalPath.isWritable())) {
    return false;
  }

  return true;
}

/**
 * Even if the local path is usable, there are some special folders we do not
 * want to allow for message storage as they cause problems (see e.g. bug 750781).
 *
 * aLocalPath  The nsIFile of a directory to check.
 */
function checkDirectoryIsAllowed(aLocalPath) {
  /**
   * Check if the local path (aLocalPath) is 'safe' i.e. NOT a parent
   * or subdirectory of the given special system/app directory (aDirToCheck).
   *
   * @param {object} aDirToCheck - An object describing the special directory.
   * @param {string} aDirToCheck.dirsvc - A path keyword to retrieve from the
   *   Directory service.
   * @param {string} aDirToCheck.dir - An absolute filesystem path.
   * @param {string} aDirToCheck.OS - A string of comma separated values defining on which.
   *   Operating systems the folder is unusable:
   *     - null   = all
   *     - WINNT  = Windows
   *     - Darwin = OS X
   *     - Linux  = Linux
   * @param {string} aDirToCheck.safeSubdirs - An array of directory names that
   *   are allowed to be used under the tested directory.
   * @param {nsIFile} localPath - An nsIFile of the directory to check,
   *   intended for message storage.
   */
  function checkLocalDirectoryIsSafe(aDirToCheck, localPath) {
    if (aDirToCheck.OS) {
      if (!aDirToCheck.OS.split(",").includes(Services.appinfo.OS)) {
        return true;
      }
    }

    let testDir = null;
    if ("dirsvc" in aDirToCheck) {
      try {
        testDir = Services.dirsvc.get(aDirToCheck.dirsvc, Ci.nsIFile);
      } catch (e) {
        console.error(
          "The special folder",
          aDirToCheck.dirsvc,
          "cannot be retrieved on this platform:",
          e
        );
      }

      if (!testDir) {
        return true;
      }
    } else if ("dir" in aDirToCheck) {
      testDir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      testDir.initWithPath(aDirToCheck.dir);
      if (!testDir.exists()) {
        return true;
      }
    } else {
      console.error("No directory to check?");
      return true;
    }

    testDir.normalize();

    if (testDir.equals(localPath) || localPath.contains(testDir)) {
      return false;
    }

    if (testDir.contains(localPath)) {
      if (!("safeSubdirs" in aDirToCheck)) {
        return false;
      }

      // While the tested directory may not be safe,
      // a subdirectory of some safe subdirectories may be fine.
      let isInSubdir = false;
      for (const subDir of aDirToCheck.safeSubdirs) {
        const checkDir = testDir.clone();
        checkDir.append(subDir);
        if (checkDir.contains(localPath)) {
          isInSubdir = true;
          break;
        }
      }
      return isInSubdir;
    }

    return true;
  } // end of checkDirectoryIsNotSpecial

  // If the server type has a nsIMsgProtocolInfo.defaultLocalPath set,
  // allow that directory.
  if (currentAccount.incomingServer) {
    try {
      const defaultPath =
        currentAccount.incomingServer.protocolInfo.defaultLocalPath;
      if (defaultPath) {
        defaultPath.normalize();
        if (defaultPath.contains(aLocalPath)) {
          return true;
        }
      }
    } catch (e) {
      /* No problem if this fails. */
    }
  }

  for (const tryDir of gDangerousLocalStorageDirs) {
    if (!checkLocalDirectoryIsSafe(tryDir, aLocalPath)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if the specified directory does meet all the requirements
 * for safe mail storage.
 *
 * aLocalPath  the nsIFile of a directory to check.
 */
function checkDirectoryIsUsable(aLocalPath) {
  const kAlertTitle = document
    .getElementById("bundle_prefs")
    .getString("prefPanel-server");
  const originalPath = aLocalPath;

  let invalidPath = false;
  try {
    aLocalPath.normalize();
  } catch (e) {
    invalidPath = true;
  }

  if (invalidPath || !checkDirectoryIsValid(aLocalPath)) {
    const alertString = document
      .getElementById("bundle_prefs")
      .getFormattedString("localDirectoryInvalid", [originalPath.path]);
    Services.prompt.alert(window, kAlertTitle, alertString);
    return false;
  }

  if (!checkDirectoryIsAllowed(aLocalPath)) {
    const alertNotAllowed = document
      .getElementById("bundle_prefs")
      .getFormattedString("localDirectoryNotAllowed", [originalPath.path]);
    Services.prompt.alert(window, kAlertTitle, alertNotAllowed);
    return false;
  }

  // Check that no other account has this same or dependent local directory.
  for (const server of MailServices.accounts.allServers) {
    if (server.key == currentAccount.incomingServer.key) {
      continue;
    }

    const serverPath = server.localPath;
    try {
      serverPath.normalize();
      let alertStringID = null;
      if (serverPath.equals(aLocalPath)) {
        alertStringID = "directoryAlreadyUsedByOtherAccount";
      } else if (serverPath.contains(aLocalPath)) {
        alertStringID = "directoryParentUsedByOtherAccount";
      } else if (aLocalPath.contains(serverPath)) {
        alertStringID = "directoryChildUsedByOtherAccount";
      }

      if (alertStringID) {
        const alertString = document
          .getElementById("bundle_prefs")
          .getFormattedString(alertStringID, [server.prettyName]);

        Services.prompt.alert(window, kAlertTitle, alertString);
        return false;
      }
    } catch (e) {
      // The other account's path is seriously broken, so we can't compare it.
      console.error(
        "The Local Directory path of the account " +
          server.prettyName +
          " seems invalid."
      );
    }
  }

  return true;
}

/**
 * Check if the user and/or host names have been changed and if so check
 * if the new names already exists for an account or are empty.
 * Also check if the Local Directory path was changed.
 *
 * @param {boolean} showAlert - Show and alert if a problem with the host / user
 *   name is found.
 */
function checkUserServerChanges(showAlert) {
  const prefBundle = document.getElementById("bundle_prefs");
  const alertTitle = prefBundle.getString("prefPanel-server");
  var alertText = null;

  var accountValues = getValueArrayFor(currentAccount);
  if (!accountValues) {
    return true;
  }

  const currentServer = currentAccount ? currentAccount.incomingServer : null;

  // If this type doesn't exist (just removed) then return.
  if (!("server" in accountValues) || !accountValues.server) {
    return true;
  }

  // Get the new username, hostname and type from the page.
  var typeElem = getPageFormElement("server.type");
  var hostElem = getPageFormElement("server.hostName");
  var userElem = getPageFormElement("server.username");
  if (typeElem && userElem && hostElem) {
    var newType = getFormElementValue(typeElem);
    var oldHost = getAccountValue(
      currentAccount,
      accountValues,
      "server",
      "hostName",
      null,
      false
    );
    var newHost = getFormElementValue(hostElem);
    var oldUser = getAccountValue(
      currentAccount,
      accountValues,
      "server",
      "username",
      null,
      false
    );

    var newUser = getFormElementValue(userElem);
    var checkUser = true;
    // There is no username needed for e.g. news so reset it.
    if (currentServer && !currentServer.protocolInfo.requiresUsername) {
      oldUser = newUser = "";
      checkUser = false;
    }
    alertText = null;
    // If something is changed then check if the new user/host already exists.
    if (oldUser != newUser || oldHost != newHost) {
      newUser = newUser.trim();
      newHost = cleanUpHostName(newHost);
      if (checkUser && newUser == "") {
        alertText = prefBundle.getString("userNameEmpty");
      } else if (!isLegalHostNameOrIP(newHost)) {
        alertText = prefBundle.getString("enterValidServerName");
      } else {
        const sameServer = MailServices.accounts.findServer(
          newUser,
          newHost,
          newType
        );
        if (sameServer && sameServer != currentServer) {
          alertText = prefBundle.getString("modifiedAccountExists");
        } else {
          // New hostname passed all checks. We may have cleaned it up so set
          // the new value back into the input element.
          setFormElementValue(hostElem, newHost);
        }
      }

      if (alertText) {
        if (showAlert) {
          Services.prompt.alert(window, alertTitle, alertText);
        }
        // Restore the old values before return
        if (checkUser) {
          setFormElementValue(userElem, oldUser);
        }
        setFormElementValue(hostElem, oldHost);
        // If no message is shown to the user, silently revert the values
        // and consider the check a success.
        return !showAlert;
      }

      // If username is changed remind users to change Your Name and Email Address.
      // If server name is changed and has defined filters then remind users
      // to edit rules.
      if (showAlert) {
        let filterList;
        if (currentServer && checkUser) {
          filterList = currentServer.getEditableFilterList(null);
        }
        let changeText = "";
        if (
          oldHost != newHost &&
          filterList != undefined &&
          filterList.filterCount
        ) {
          changeText = prefBundle.getString("serverNameChanged");
        }
        // In the event that oldHost == newHost or oldUser == newUser,
        // the \n\n will be trimmed off before the message is shown.
        if (oldUser != newUser) {
          changeText =
            changeText + "\n\n" + prefBundle.getString("userNameChanged");
        }

        if (changeText != "") {
          Services.prompt.alert(window, alertTitle, changeText.trim());
        }
      }

      const l10n = new Localization(["messenger/accountManager.ftl"], true);
      const cancel = Services.prompt.confirmEx(
        window,
        alertTitle,
        l10n.formatValueSync("server-change-restart-required"),
        Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
          Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL,
        prefBundle.getString("localDirectoryRestart"),
        null,
        null,
        null,
        {}
      );
      if (cancel) {
        setFormElementValue(hostElem, oldHost);
        setFormElementValue(userElem, oldUser);
        return false;
      }
      gRestartNeeded = true;
    }
  }

  // Check the new value of the server.localPath field for validity.
  var pathElem = getPageFormElement("server.localPath");
  if (!pathElem) {
    return true;
  }
  const dir = getFormElementValue(pathElem);
  if (!checkDirectoryIsUsable(dir)) {
    //          return false; // Temporarily disable this. Just show warning but do not block. See bug 921371.
    console.error(
      `Local directory ${dir.path} of account ${currentAccount.key} is not safe to use. Consider changing it.`
    );
  }

  // Warn if the Local directory path was changed.
  // This can be removed once bug 2654 is fixed.
  const oldLocalDir = getAccountValue(
    currentAccount,
    accountValues,
    "server",
    "localPath",
    null,
    false
  ); // both return nsIFile
  const newLocalDir = getFormElementValue(pathElem);
  if (oldLocalDir && newLocalDir && oldLocalDir.path != newLocalDir.path) {
    const brandName = document
      .getElementById("bundle_brand")
      .getString("brandShortName");
    alertText = prefBundle.getFormattedString("localDirectoryChanged", [
      brandName,
    ]);

    const cancel = Services.prompt.confirmEx(
      window,
      alertTitle,
      alertText,
      Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
        Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL,
      prefBundle.getString("localDirectoryRestart"),
      null,
      null,
      null,
      {}
    );
    if (cancel) {
      setFormElementValue(pathElem, oldLocalDir);
      return false;
    }
    gRestartNeeded = true;
  }

  return true;
}

/**
 * If account name is not valid, alert the user.
 */
function checkAccountNameIsValid() {
  if (!currentAccount) {
    return true;
  }

  const prefBundle = document.getElementById("bundle_prefs");
  let alertText = null;

  const serverNameElem = getPageFormElement("server.prettyName");
  if (serverNameElem) {
    const accountName = getFormElementValue(serverNameElem);

    if (!accountName) {
      alertText = prefBundle.getString("accountNameEmpty");
    } else if (accountNameExists(accountName, currentAccount.key)) {
      alertText = prefBundle.getString("accountNameExists");
      // Change the account name to prevent UI freeze.
      let counter = 2;
      while (
        accountNameExists(`${accountName}_${counter}`, currentAccount.key)
      ) {
        counter++;
      }
      serverNameElem.value = `${accountName}_${counter}`;
    }

    if (alertText) {
      const alertTitle = prefBundle.getString("accountWizard");
      Services.prompt.alert(window, alertTitle, alertText);
      return false;
    }
  }

  return true;
}

function onSave() {
  if (pendingPageId) {
    dump("ERROR: " + pendingPageId + " hasn't loaded yet! Not saving.\n");
    return false;
  }

  // make sure the current visible page is saved
  savePage(currentAccount);

  for (var accountid in accountArray) {
    var accountValues = accountArray[accountid];
    var account = accountArray[accountid]._account;
    if (!saveAccount(accountValues, account)) {
      return false;
    }
  }

  return true;
}

/**
 * Highlight the default account row in the account tree,
 * optionally un-highlight the previous one.
 *
 * @param {?nsIMsgAccount} newDefault - The account that has become the new
 *   default. Can be given as null if there is none.
 * @param {?nsIMsgAccount} oldDefault - The account that has stopped being the
 *   default. Can be given as null if there was none.
 */
function markDefaultServer(newDefault, oldDefault) {
  if (oldDefault == newDefault) {
    return;
  }

  const accountTree = document.getElementById("accounttree");
  for (const accountRow of accountTree.children) {
    if (newDefault && newDefault == accountRow._account) {
      accountRow.classList.add("isDefaultServer");
    }
    if (oldDefault && oldDefault == accountRow._account) {
      accountRow.classList.remove("isDefaultServer");
    }
  }
}

/**
 * Notify the UI to rebuild the account tree.
 */
function rebuildAccountTree() {
  // TODO: Reimplement or replace.
}

/**
 * Make currentAccount (currently selected in the account tree) the default one.
 */
function onSetDefault(event) {
  // Make sure this function was not called while the control item is disabled
  if (event.target.getAttribute("disabled") == "true") {
    return;
  }

  const previousDefault = MailServices.accounts.defaultAccount;
  MailServices.accounts.defaultAccount = currentAccount;
  markDefaultServer(currentAccount, previousDefault);

  // Update gloda's myContact with the new default account's default identity.
  Gloda._initMyIdentities();

  gAccountTree.load();
}

function onRemoveAccount(event) {
  if (event.target.getAttribute("disabled") == "true") {
    return;
  }

  const server = currentAccount.incomingServer;

  const canDelete = server.protocolInfo.canDelete;
  if (!canDelete) {
    return;
  }

  const serverList = [];
  const accountTree = document.getElementById("accounttree");
  // build the list of servers in the account tree (order is important)
  for (const row of accountTree.children) {
    if ("_account" in row) {
      const curServer = row._account.incomingServer;
      if (!serverList.includes(curServer)) {
        serverList.push(curServer);
      }
    }
  }

  // get position of the current server in the server list
  let serverIndex = serverList.indexOf(server);

  // After the current server is deleted, choose the next server/account,
  // or the previous one if the last one was deleted.
  if (serverIndex == serverList.length - 1) {
    serverIndex--;
  } else {
    serverIndex++;
  }

  // Need to save these before the account and its server is removed.
  const serverId = server.serverURI;

  // Confirm account deletion.
  const removeArgs = {
    server,
    account: currentAccount,
    result: false,
  };

  const onCloseDialog = function () {
    // If result is true, the account was removed.
    if (!removeArgs.result) {
      return;
    }

    // clear cached data out of the account array
    currentAccount = currentPageId = null;
    if (serverId in accountArray) {
      delete accountArray[serverId];
    }

    if (serverIndex >= 0 && serverIndex < serverList.length) {
      selectServer(serverList[serverIndex], null);
    }

    // Either the default account was deleted so there is a new one
    // or the default account was not changed. Either way, there is
    // no need to unmark the old one.
    markDefaultServer(MailServices.accounts.defaultAccount, null);
  };

  gSubDialog.open(
    "chrome://messenger/content/removeAccount.xhtml",
    {
      features: "resizable=no",
      closingCallback: onCloseDialog,
    },
    removeArgs
  );
}

function saveAccount(accountValues, account) {
  var identity = null;
  var server = null;

  if (account) {
    identity = account.defaultIdentity;
    server = account.incomingServer;
  }

  for (var type in accountValues) {
    var dest;
    try {
      if (type == "identity") {
        dest = identity;
      } else if (type == "server") {
        dest = server;
      } else if (type == "pop3") {
        dest = server.QueryInterface(Ci.nsIPop3IncomingServer);
      } else if (type == "imap") {
        dest = server.QueryInterface(Ci.nsIImapIncomingServer);
      } else if (type == "none") {
        dest = server.QueryInterface(Ci.nsINoIncomingServer);
      } else if (type == "nntp") {
        dest = server.QueryInterface(Ci.nsINntpIncomingServer);
      } else if (type == "smtp") {
        dest = MailServices.outgoingServer.defaultServer;
      }
    } catch (ex) {
      // don't do anything, just means we don't support that
    }
    if (dest == undefined) {
      continue;
    }
    var typeArray = accountValues[type];

    for (var slot in typeArray) {
      if (
        type in gGenericAttributeTypes &&
        slot in gGenericAttributeTypes[type]
      ) {
        var methodName = "get";
        switch (gGenericAttributeTypes[type][slot]) {
          case "int":
            methodName += "Int";
            break;
          case "wstring":
            methodName += "Unichar";
            break;
          case "string":
            methodName += "Char";
            break;
          case "bool":
            // in some cases
            // like for radiogroups of type boolean
            // the value will be "false" instead of false
            // we need to convert it.
            if (typeArray[slot] == "false") {
              typeArray[slot] = false;
            } else if (typeArray[slot] == "true") {
              typeArray[slot] = true;
            }

            methodName += "Bool";
            break;
          default:
            dump(
              "unexpected preftype: " +
                gGenericAttributeTypes[type][slot] +
                "\n"
            );
            break;
        }
        methodName += methodName + "Value" in dest ? "Value" : "Attribute";
        if (dest[methodName](slot) != typeArray[slot]) {
          methodName = methodName.replace("get", "set");
          dest[methodName](slot, typeArray[slot]);
        }
      } else if (
        slot in dest &&
        typeArray[slot] != undefined &&
        dest[slot] != typeArray[slot]
      ) {
        try {
          dest[slot] = typeArray[slot];
        } catch (ex) {
          // hrm... need to handle special types here
        }
      }
    }
  }

  // if we made account changes to the spam settings, we'll need to re-initialize
  // our settings object
  if (server && server.spamSettings) {
    try {
      server.spamSettings.initialize(server);
    } catch (e) {
      const accountName = getAccountValue(
        account,
        getValueArrayFor(account),
        "server",
        "prettyName",
        null,
        false
      );
      const alertText = document
        .getElementById("bundle_prefs")
        .getFormattedString("junkSettingsBroken", [accountName]);
      const review = Services.prompt.confirmEx(
        window,
        null,
        alertText,
        Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_YES +
          Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_NO,
        null,
        null,
        null,
        null,
        {}
      );
      if (!review) {
        onAccountTreeSelect("am-junk.xhtml", account);
        return false;
      }
    }
  }

  return true;
}

/**
 * Disable buttons/menu items if their control preference is locked.
 *
 * @param {Node[]|NodeList} aItems - Elements to be checked.
 * @param {boolean} aMustBeTrue - If true then the pref must be boolean and set
 *   to true to trigger the disabling.
 */
function updateBlockedItems(aItems, aMustBeTrue) {
  for (const item of aItems) {
    const prefstring = item.getAttribute("prefstring");
    if (!prefstring) {
      continue;
    }

    if (
      Services.prefs.prefIsLocked(prefstring) &&
      (!aMustBeTrue || Services.prefs.getBoolPref(prefstring))
    ) {
      item.setAttribute("disabled", true);
    }
  }
}

/**
 * Set enabled/disabled state for the control.
 */
function setEnabled(control, enabled) {
  if (!control) {
    return;
  }

  if (enabled) {
    control.removeAttribute("disabled");
  } else {
    control.setAttribute("disabled", true);
  }
}

// Called when someone clicks on an account. Figure out context by what they
// clicked on. This is also called when an account is removed. In this case,
// nothing is selected.
function onAccountTreeSelect(pageId, account) {
  const tree = document.getElementById("accounttree");

  let changeView = pageId && account;
  if (!changeView) {
    if (tree.selectedIndex < 0) {
      return false;
    }

    const node = tree.rows[tree.selectedIndex];
    account = "_account" in node ? node._account : null;

    pageId = node.getAttribute("PageTag");
  }

  if (pageId == currentPageId && account == currentAccount) {
    return true;
  }

  if (
    document
      .getElementById("contentFrame")
      .contentDocument.getElementById("server.localPath")
  ) {
    // Check if user/host names have been changed or the Local Directory is invalid.
    if (!checkUserServerChanges(false)) {
      changeView = true;
      account = currentAccount;
      pageId = currentPageId;
    }

    if (gRestartNeeded) {
      onAccept(false);
    }
  }

  if (
    document
      .getElementById("contentFrame")
      .contentDocument.getElementById("server.prettyName")
  ) {
    // Check if account name is valid.
    if (!checkAccountNameIsValid()) {
      changeView = true;
      account = currentAccount;
      pageId = currentPageId;
    }
  }

  if (currentPageId) {
    // Change focus to the account tree first so that any 'onchange' handlers
    // on elements in the current page have a chance to run before the page
    // is saved and replaced by the new one.
    tree.focus();
  }

  // Provide opportunity to do cleanups or checks when the current page is being left.
  if ("onLeave" in top.frames.contentFrame) {
    top.frames.contentFrame.onLeave();
  }

  // save the previous page
  savePage(currentAccount);

  const changeAccount = account != currentAccount;

  if (changeView) {
    selectServer(account.incomingServer, pageId);
  }

  if (pageId != currentPageId) {
    // loading a complete different page

    // prevent overwriting with bad stuff
    currentAccount = currentPageId = null;

    pendingAccount = account;
    pendingPageId = pageId;
    loadPage(pageId);
  } else if (changeAccount) {
    // same page, different server
    restorePage(pageId, account);
  }

  return true;
}

// page has loaded
function onPanelLoaded(pageId) {
  if (pageId != pendingPageId) {
    // if we're reloading the current page, we'll assume the
    // page has asked itself to be completely reloaded from
    // the prefs. to do this, clear out the the old entry in
    // the account data, and then restore theh page
    if (pageId == currentPageId) {
      var serverId = currentAccount
        ? currentAccount.incomingServer.serverURI
        : "global";
      delete accountArray[serverId];
      restorePage(currentPageId, currentAccount);
    }
  } else {
    restorePage(pendingPageId, pendingAccount);
  }

  // probably unnecessary, but useful for debugging
  pendingAccount = null;
  pendingPageId = null;
}

function pageURL(pageId) {
  // If we have a special non account manager pane (e.g. about:blank),
  // do not translate it into ChromePackageName URL.
  if (!pageId.startsWith("am-")) {
    return pageId;
  }

  let chromePackageName;
  try {
    // we could compare against "main","server","copies","offline","addressing",
    // "smtp" and "advanced" first to save the work, but don't,
    // as some of these might be turned into extensions (for thunderbird)
    const packageName = pageId.split("am-")[1].split(".xhtml")[0];
    chromePackageName = MailServices.accounts.getChromePackageName(packageName);
  } catch (ex) {
    chromePackageName = "messenger";
  }
  return "chrome://" + chromePackageName + "/content/" + pageId;
}

function loadPage(pageId) {
  const loadURIOptions = {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  };
  document
    .getElementById("contentFrame")
    .webNavigation.fixupAndLoadURIString(pageURL(pageId), loadURIOptions);
}

// save the values of the widgets to the given server
function savePage(account) {
  if (!account) {
    return;
  }

  // tell the page that it's about to save
  if ("onSave" in top.frames.contentFrame) {
    top.frames.contentFrame.onSave();
  }

  var accountValues = getValueArrayFor(account);
  if (!accountValues) {
    return;
  }
  // Reset accountArray so that only the current page will be saved. This is
  // needed to prevent resetting prefs unintentionally. An example is when
  // changing username/hostname, MsgIncomingServer.sys.mjs will modify identities,
  // without this, identities changes may be reverted to old values in
  // accountArray.
  accountArray = {};
  accountValues = {};
  const serverId = account.incomingServer.serverURI;
  accountArray[serverId] = accountValues;
  accountArray[serverId]._account = account;

  var pageElements = getPageFormElements();
  if (!pageElements) {
    return;
  }

  // store the value in the account
  for (let i = 0; i < pageElements.length; i++) {
    if (pageElements[i].id) {
      const vals = pageElements[i].id.split(".");
      if (vals.length >= 2) {
        const type = vals[0];
        const slot = pageElements[i].id.slice(type.length + 1);

        setAccountValue(
          accountValues,
          type,
          slot,
          getFormElementValue(pageElements[i])
        );
      }
    }
  }
}

function setAccountValue(accountValues, type, slot, value) {
  if (!(type in accountValues)) {
    accountValues[type] = {};
  }

  accountValues[type][slot] = value;
}

function getAccountValue(
  account,
  accountValues,
  type,
  slot,
  preftype,
  isGeneric
) {
  if (!(type in accountValues)) {
    accountValues[type] = {};
  }

  // fill in the slot from the account if necessary
  if (
    !(slot in accountValues[type]) ||
    accountValues[type][slot] == undefined
  ) {
    var server;
    if (account) {
      server = account.incomingServer;
    }
    var source = null;
    try {
      if (type == "identity") {
        source = account.defaultIdentity;
      } else if (type == "server") {
        source = account.incomingServer;
      } else if (type == "pop3") {
        source = server.QueryInterface(Ci.nsIPop3IncomingServer);
      } else if (type == "imap") {
        source = server.QueryInterface(Ci.nsIImapIncomingServer);
      } else if (type == "none") {
        source = server.QueryInterface(Ci.nsINoIncomingServer);
      } else if (type == "nntp") {
        source = server.QueryInterface(Ci.nsINntpIncomingServer);
      } else if (type == "smtp") {
        source = MailServices.outgoingServer.defaultServer;
      }
    } catch (ex) {}

    if (source) {
      if (isGeneric) {
        if (!(type in gGenericAttributeTypes)) {
          gGenericAttributeTypes[type] = {};
        }

        // we need the preftype later, for setting when we save.
        gGenericAttributeTypes[type][slot] = preftype;
        var methodName = "get";
        switch (preftype) {
          case "int":
            methodName += "Int";
            break;
          case "wstring":
            methodName += "Unichar";
            break;
          case "string":
            methodName += "Char";
            break;
          case "bool":
            methodName += "Bool";
            break;
          default:
            dump("unexpected preftype: " + preftype + "\n");
            break;
        }
        methodName += methodName + "Value" in source ? "Value" : "Attribute";
        accountValues[type][slot] = source[methodName](slot);
      } else if (slot in source) {
        accountValues[type][slot] = source[slot];
      } else {
        accountValues[type][slot] = null;
      }
    } else {
      accountValues[type][slot] = null;
    }
  }
  return accountValues[type][slot];
}

// restore the values of the widgets from the given server
function restorePage(pageId, account) {
  if (!account) {
    return;
  }

  var accountValues = getValueArrayFor(account);
  if (!accountValues) {
    return;
  }

  if ("onPreInit" in top.frames.contentFrame) {
    top.frames.contentFrame.onPreInit(account, accountValues);
  }

  var pageElements = getPageFormElements();
  if (!pageElements) {
    return;
  }

  // restore the value from the account
  for (let i = 0; i < pageElements.length; i++) {
    if (pageElements[i].id) {
      const vals = pageElements[i].id.split(".");
      if (vals.length >= 2) {
        const type = vals[0];
        const slot = pageElements[i].id.slice(type.length + 1);

        // buttons are lockable, but don't have any data so we skip that part.
        // elements that do have data, we get the values at poke them in.
        if (pageElements[i].localName != "button") {
          var value = getAccountValue(
            account,
            accountValues,
            type,
            slot,
            pageElements[i].getAttribute("preftype"),
            pageElements[i].getAttribute("genericattr") == "true"
          );
          setFormElementValue(pageElements[i], value);
        }
        var element = pageElements[i];
        switch (type) {
          case "identity":
            element.identitykey = account.defaultIdentity.key;
            break;
          case "pop3":
          case "imap":
          case "nntp":
          case "server":
            element.serverkey = account.incomingServer.key;
            break;
          case "smtp":
            if (MailServices.outgoingServer.defaultServer) {
              element.serverkey = MailServices.outgoingServer.defaultServer.key;
            }
            break;
        }
        var isLocked = getAccountValueIsLocked(pageElements[i]);
        setEnabled(pageElements[i], !isLocked);
      }
    }
  }

  // tell the page that new values have been loaded
  if ("onInit" in top.frames.contentFrame) {
    top.frames.contentFrame.onInit(pageId, account.incomingServer.serverURI);
  }

  // everything has succeeded, vervied by setting currentPageId
  currentPageId = pageId;
  currentAccount = account;
}

/**
 * Gets the value of a widget in current the account settings page,
 * automatically setting the right property of it depending on element type.
 *
 * @param {HTMLInputElement} formElement - An input element.
 */
function getFormElementValue(formElement) {
  try {
    var type = formElement.localName;
    if (type == "checkbox") {
      if (formElement.getAttribute("reversed")) {
        return !formElement.checked;
      }
      return formElement.checked;
    }
    if (type == "input" && formElement.getAttribute("datatype") == "nsIFile") {
      if (formElement.value) {
        const localfile = Cc["@mozilla.org/file/local;1"].createInstance(
          Ci.nsIFile
        );

        localfile.initWithPath(formElement.value);
        return localfile;
      }
      return null;
    }
    if (type == "input" || "value" in formElement) {
      return formElement.value.trim();
    }
    return null;
  } catch (ex) {
    console.error("getFormElementValue failed", ex);
  }
  return null;
}

/**
 * Sets the value of a widget in current the account settings page,
 * automatically setting the right property of it depending on element type.
 *
 * @param {HTMLInputElement} formElement - An input element.
 * @param {string|nsIFile} value - The value to store in the element.
 */
function setFormElementValue(formElement, value) {
  var type = formElement.localName;
  if (type == "checkbox") {
    if (value == null) {
      formElement.checked = false;
    } else if (formElement.getAttribute("reversed")) {
      formElement.checked = !value;
    } else {
      formElement.checked = value;
    }
  } else if (type == "radiogroup" || type == "menulist") {
    if (value == null) {
      formElement.selectedIndex = 0;
    } else {
      formElement.value = value;
    }
  } else if (
    type == "input" &&
    formElement.getAttribute("datatype") == "nsIFile"
  ) {
    // handle nsIFile
    if (value) {
      const localfile = value.QueryInterface(Ci.nsIFile);
      try {
        formElement.value = localfile.path;
      } catch (ex) {
        dump("Still need to fix uninitialized nsIFile problem!\n");
      }
    } else {
      formElement.value = "";
    }
  } else if (type == "input") {
    if (value == null) {
      formElement.value = null;
    } else {
      formElement.value = value;
    }
  } else if (type == "label") {
    formElement.value = value || "";
  } else if (value == null) {
    // let the form figure out what to do with it
    formElement.value = null;
  } else {
    formElement.value = value;
  }
}

//
// conversion routines - get data associated
// with a given pageId, serverId, etc
//

// helper routine for account manager panels to get the current account for the selected server
function getCurrentAccount() {
  return currentAccount;
}

/**
 * Get the array of persisted form elements for the given page.
 */
function getPageFormElements() {
  // Uses getElementsByAttribute() which returns a live NodeList which is usually
  // faster than e.g. querySelector().
  if ("getElementsByAttribute" in top.frames.contentFrame.document) {
    return top.frames.contentFrame.document.getElementsByAttribute(
      "wsm_persist",
      "true"
    );
  }

  return null;
}

/**
 * Get a single persisted form element in the current page.
 *
 * @param {srtring} aId - ID of the element requested.
 */
function getPageFormElement(aId) {
  const elem = top.frames.contentFrame.document.getElementById(aId);
  if (elem && elem.getAttribute("wsm_persist") == "true") {
    return elem;
  }

  return null;
}

// get the value array for the given account
function getValueArrayFor(account) {
  var serverId = account ? account.incomingServer.serverURI : "global";

  if (!(serverId in accountArray)) {
    accountArray[serverId] = {};
    accountArray[serverId]._account = account;
  }

  return accountArray[serverId];
}

/**
 * Sets the name of the account rowitem in the tree pane.
 *
 * @param {string} aAccountKey - The key of the account to change.
 * @param {string} aLabel - The value of the label to set.
 */
function setAccountLabel(aAccountKey, aLabel) {
  const row = document.getElementById(aAccountKey);
  if (row) {
    row.setAttribute("aria-label", aLabel);
    row.title = aLabel;
    row.querySelector(".name").textContent = aLabel;
  }
  rebuildAccountTree(false);
}

var gAccountTree = {
  QueryInterface: ChromeUtils.generateQI([
    "nsIObserver",
    "nsISupportsWeakReference",
  ]),

  async load() {
    await FolderTreeProperties.ready;

    this._build();

    const mainTree = document.getElementById("accounttree");
    mainTree.__defineGetter__("_orderableChildren", function () {
      const rows = [...this.children];
      rows.pop();
      return rows;
    });
    mainTree.addEventListener("ordering", event => {
      if (!event.detail || event.detail.id == "smtp") {
        event.preventDefault();
      }
    });
    mainTree.addEventListener("ordered", () => {
      const accountKeyList = Array.from(mainTree.children, row => row.id);
      accountKeyList.pop(); // Remove SMTP.
      MailServices.accounts.reorderAccounts(accountKeyList);
      rebuildAccountTree();
    });
    mainTree.addEventListener("expanded", event => {
      this._dataStore.setValue(
        document.documentURI,
        event.target.id,
        "open",
        "true"
      );
    });
    mainTree.addEventListener("collapsed", event => {
      this._dataStore.setValue(
        document.documentURI,
        event.target.id,
        "open",
        "false"
      );
    });

    MailServices.accounts.addIncomingServerListener(this);
    Services.obs.addObserver(this, "server-color-changed", true);
    Services.obs.addObserver(this, "server-color-preview", true);
  },
  unload() {
    MailServices.accounts.removeIncomingServerListener(this);
    Services.obs.removeObserver(this, "server-color-changed");
    Services.obs.removeObserver(this, "server-color-preview");
  },
  onServerLoaded(server) {
    // We assume the newly appeared server was created by the user so we select
    // it in the tree.
    this._build(server);
  },
  onServerUnloaded() {
    this._build();
  },
  onServerChanged() {},

  observe(subject, topic, data) {
    switch (topic) {
      case "server-color-changed":
      case "server-color-preview":
        this._updateAccountRowColor(subject, data);
        break;
    }
  },

  /**
   * Update the custom icon color of the account row.
   *
   * @param {nsIMsgAccount} account - The account that changed.
   * @param {?string} iconColor - The new color to apply to the server item.
   */
  _updateAccountRowColor(account, iconColor = null) {
    const server = account.incomingServer;
    const serverRow = document
      .getElementById("accounttree")
      .querySelector(`li[data-server-key="${server.key}"]`);
    if (!serverRow) {
      return;
    }

    if (!iconColor) {
      iconColor = FolderTreeProperties.getColor(server.rootFolder.URI);
    }
    serverRow
      .querySelector(".icon")
      .style.setProperty("--icon-color", iconColor ?? "");
  },

  _dataStore: Services.xulStore,

  /**
   * Retrieve from XULStore.json whether the account should be expanded (open)
   * in the account tree.
   *
   * @param {string} aAccountKey - Key of the account to check.
   */
  _getAccountOpenState(aAccountKey) {
    if (!this._dataStore.hasValue(document.documentURI, aAccountKey, "open")) {
      // If there was no value stored, use opened state.
      return "true";
    }
    // Retrieve the persisted value from XULStore.json.
    // It is stored under the URI of the current document and ID of the XUL element.
    return this._dataStore.getValue(document.documentURI, aAccountKey, "open");
  },

  _build(newServer) {
    var bundle = document.getElementById("bundle_prefs");
    function getString(aString) {
      return bundle.getString(aString);
    }
    var panels = [
      { string: getString("prefPanel-server"), src: "am-server.xhtml" },
      { string: getString("prefPanel-copies"), src: "am-copies.xhtml" },
      {
        string: getString("prefPanel-synchronization"),
        src: "am-offline.xhtml",
      },
      { string: getString("prefPanel-diskspace"), src: "am-offline.xhtml" },
      { string: getString("prefPanel-addressing"), src: "am-addressing.xhtml" },
      { string: getString("prefPanel-junk"), src: "am-junk.xhtml" },
    ];

    const accounts = FolderUtils.allAccountsSorted(false);

    const mainTree = document.getElementById("accounttree");
    // Clear off all children...
    while (mainTree.hasChildNodes()) {
      mainTree.lastChild.remove();
    }

    for (const account of accounts) {
      let accountName = null;
      const accountKey = account.key;
      let amChrome = "about:blank";
      const panelsToKeep = [];
      let server = null;
      let validAccount = true;

      // This "try {} catch {}" block is intentionally very long to catch
      // unknown exceptions and confine them to this single account.
      // This may happen from broken accounts. See e.g. bug 813929.
      // Other accounts can still be shown properly if they are valid.
      try {
        server = account.incomingServer;

        if (
          server.type == "im" &&
          !Services.prefs.getBoolPref("mail.chat.enabled")
        ) {
          continue;
        }

        accountName = server.prettyName;

        // Now add our panels.
        const idents = MailServices.accounts.getIdentitiesForServer(server);
        if (idents.length) {
          panelsToKeep.push(panels[0]); // The server panel is valid
          panelsToKeep.push(panels[1]); // also the copies panel
          panelsToKeep.push(panels[4]); // and addressing
        }

        // Everyone except News, RSS and IM has a junk panel
        // XXX: unextensible!
        // The existence of server.spamSettings can't currently be used for this.
        if (
          server.type != "nntp" &&
          server.type != "rss" &&
          server.type != "im"
        ) {
          panelsToKeep.push(panels[5]);
        }

        // Check offline/diskspace support level.
        const diskspace = server.supportsDiskSpace;
        if (server.offlineSupportLevel >= 10 && diskspace) {
          panelsToKeep.push(panels[2]);
        } else if (diskspace) {
          panelsToKeep.push(panels[3]);
        }

        // extensions
        const CATEGORY = "mailnews-accountmanager-extensions";
        for (const { data } of Services.catMan.enumerateCategory(CATEGORY)) {
          try {
            const svc = Cc[
              Services.catMan.getCategoryEntry(CATEGORY, data)
            ].getService(Ci.nsIMsgAccountManagerExtension);
            if (svc.showPanel(server)) {
              const bundleName =
                "chrome://" +
                svc.chromePackageName +
                "/locale/am-" +
                svc.name +
                ".properties";
              const panelBundle = Services.strings.createBundle(bundleName);
              const title = panelBundle.GetStringFromName(
                "prefPanel-" + svc.name
              );
              panelsToKeep.push({
                string: title,
                src: "am-" + svc.name + ".xhtml",
              });
            }
          } catch (e) {
            // Fetching of this extension panel failed so do not show it,
            // just log error.
            const extName = data || "(unknown)";
            console.error(`Error accessing panel from extension ${extName}`, e);
          }
        }
        amChrome = server.accountManagerChrome;
      } catch (e) {
        // Show only a placeholder in the account list saying this account
        // is broken, with no child panels.
        const accountID = accountName || accountKey;
        console.error(`Error accessing account ${accountID}`, e);
        accountName = "Invalid account " + accountID;
        panelsToKeep.length = 0;
        validAccount = false;
      }

      // Create the top level tree-item.
      const treeitem = document
        .getElementById("accountTreeItem")
        .content.firstElementChild.cloneNode(true);
      mainTree.appendChild(treeitem);
      treeitem.setAttribute("aria-label", accountName);
      treeitem.title = accountName;
      treeitem.querySelector(".name").textContent = accountName;
      treeitem.setAttribute("PageTag", amChrome);
      // Add icons based on account type.
      if (server) {
        treeitem.dataset.serverKey = server.key;
        treeitem.classList.add("serverType-" + server.type);
        if (server.isSecure) {
          treeitem.classList.add("isSecure");
        }
        // For IM accounts, we can try to fetch a protocol specific icon.
        if (server.type == "im" && validAccount) {
          treeitem.querySelector(".icon").style.backgroundImage =
            "url(" +
            ChatIcons.getProtocolIconURI(
              server.wrappedJSObject.imAccount.protocol
            ) +
            ")";
          treeitem.id = accountKey;
        }
        this._updateAccountRowColor(account);
      }

      if (panelsToKeep.length > 0) {
        const treekids = treeitem.querySelector("ul");
        for (const panel of panelsToKeep) {
          const kidtreeitem = document.createElement("li");
          kidtreeitem.title = panel.string;
          treekids.appendChild(kidtreeitem);
          const kidtreerow = document.createElement("div");
          kidtreeitem.appendChild(kidtreerow);
          kidtreerow.classList.add("container");
          const kidtreecell = document.createElement("span");
          kidtreecell.classList.add("name");
          kidtreecell.tabIndex = -1;
          kidtreerow.appendChild(kidtreecell);
          kidtreecell.textContent = panel.string;
          kidtreeitem.setAttribute("PageTag", panel.src);
          kidtreeitem._account = account;
          kidtreeitem.id = `${accountKey}/${panel.src}`;
        }
        treeitem.id = accountKey;
        // Load the 'open' state of the account from XULStore.json.
        if (this._getAccountOpenState(accountKey) != "true") {
          treeitem.classList.add("collapsed");
        }
      }
      treeitem._account = account;
    }

    markDefaultServer(MailServices.accounts.defaultAccount, null);

    // Now add the outgoing server node.
    const treeitem = document
      .getElementById("accountTreeItem")
      .content.firstElementChild.cloneNode(true);
    mainTree.appendChild(treeitem);
    treeitem.id = "smtp";
    treeitem.querySelector(".name").textContent = getString("prefPanel-smtp");
    treeitem.setAttribute("PageTag", "am-smtp.xhtml");
    treeitem.classList.add("serverType-smtp");

    // If a new server was created, select the server after rebuild of the tree.
    if (newServer) {
      setTimeout(selectServer, 0, newServer);
    }
  },
};
