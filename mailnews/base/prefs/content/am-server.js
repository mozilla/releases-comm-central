/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from am-prefs.js */
/* import-globals-from amUtils.js */

var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

var gServer;
var gOriginalStoreType;

/**
 * Called when the store type menu is clicked.
 *
 * @param {object} aStoreTypeElement - store type menu list element.
 */
function clickStoreTypeMenu(aStoreTypeElement) {
  if (aStoreTypeElement.value == gOriginalStoreType) {
    return;
  }

  // Response from migration dialog modal. If the conversion is complete
  // 'response.newRootFolder' will hold the path to the new account root folder,
  // otherwise 'response.newRootFolder' will be null.
  const response = { newRootFolder: null };
  // Send 'response' as an argument to converterDialog.xhtml.
  window.browsingContext.topChromeWindow.openDialog(
    "converterDialog.xhtml",
    "mailnews:mailstoreconverter",
    "modal,centerscreen,resizable=no,width=700,height=130",
    gServer,
    aStoreTypeElement.value,
    response
  );
  changeStoreType(response);
}

/**
 * Revert store type to the original store type if converter modal closes
 * before migration is complete, otherwise change original store type to
 * currently selected store type.
 *
 * @param {object} aResponse - response from migration dialog modal.
 */
function changeStoreType(aResponse) {
  if (aResponse.newRootFolder) {
    // The conversion is complete.
    // Set local path to the new account root folder which is present
    // in 'aResponse.newRootFolder'.
    if (gServer.type == "nntp") {
      const newRootFolder = aResponse.newRootFolder;
      const lastSlash = newRootFolder.lastIndexOf("/");
      const newsrc =
        newRootFolder.slice(0, lastSlash) +
        "/newsrc-" +
        newRootFolder.slice(lastSlash + 1);
      document.getElementById("nntp.newsrcFilePath").value = newsrc;
    }

    document.getElementById("server.localPath").value = aResponse.newRootFolder;
    gOriginalStoreType = document.getElementById(
      "server.storeTypeMenulist"
    ).value;
    MailUtils.restartApplication();
  } else {
    // The conversion failed or was cancelled.
    // Restore selected item to what was selected before conversion.
    document.getElementById("server.storeTypeMenulist").value =
      gOriginalStoreType;
  }
}

function onSave() {
  const storeContractID = document.getElementById("server.storeTypeMenulist")
    .selectedItem.value;
  document
    .getElementById("server.storeContractID")
    .setAttribute("value", storeContractID);
}

function onInit(aPageId, aServerId) {
  initServerType();

  onCheckItem("server.biffMinutes", ["server.doBiff"]);
  onCheckItem("nntp.maxArticles", ["nntp.notifyOn"]);
  setupMailOnServerUI();
  setupFixedUI();
  const serverType = document
    .getElementById("server.type")
    .getAttribute("value");
  if (serverType == "imap") {
    setupImapDeleteUI(aServerId);
  }

  // OAuth2 are only supported on IMAP and POP.
  document.getElementById("authMethod-oauth2").hidden =
    serverType != "imap" && serverType != "pop3";
  // TLS Cert (External) only supported on IMAP.
  document.getElementById("authMethod-external").hidden = serverType != "imap";

  // "STARTTLS, if available" is vulnerable to MITM attacks so we shouldn't
  // allow users to choose it anymore. Hide the option unless the user already
  // has it set.
  hideUnlessSelected(document.getElementById("connectionSecurityType-1"));

  // UI for account store type.
  const storeTypeElement = document.getElementById("server.storeTypeMenulist");
  // set the menuitem to match the account
  const currentStoreID = document
    .getElementById("server.storeContractID")
    .getAttribute("value");
  const targetItem = storeTypeElement.getElementsByAttribute(
    "value",
    currentStoreID
  );
  storeTypeElement.selectedItem = targetItem[0];
  // Disable store type change if store has not been used yet.
  storeTypeElement.setAttribute(
    "disabled",
    gServer.getBoolValue("canChangeStoreType")
      ? "false"
      : !Services.prefs.getBoolPref("mail.store_conversion_enabled")
  );
  // Initialise 'gOriginalStoreType' to the item that was originally selected.
  gOriginalStoreType = storeTypeElement.value;
}

function onPreInit(account, accountValues) {
  var type = parent.getAccountValue(
    account,
    accountValues,
    "server",
    "type",
    null,
    false
  );
  hideShowControls(type);

  gServer = account.incomingServer;
}

function initServerType() {
  var serverType = document.getElementById("server.type").getAttribute("value");
  var propertyName = "serverType-" + serverType;

  var messengerBundle = document.getElementById("bundle_messenger");
  var verboseName;
  try {
    verboseName = messengerBundle.getString(propertyName);
  } catch (e) {
    // Addon-provided server types do not have a description string,
    // then display the raw server type.
    verboseName = serverType;
  }
  setDivText("servertypeVerbose", verboseName);

  secureSelect(true);

  setLabelFromStringBundle("authMethod-no", "authNo");
  setLabelFromStringBundle("authMethod-old", "authOld");
  setLabelFromStringBundle("authMethod-kerberos", "authKerberos");
  setLabelFromStringBundle("authMethod-external", "authExternal");
  setLabelFromStringBundle("authMethod-ntlm", "authNTLM");
  setLabelFromStringBundle("authMethod-oauth2", "authOAuth2");
  setLabelFromStringBundle("authMethod-anysecure", "authAnySecure");
  setLabelFromStringBundle("authMethod-any", "authAny");
  setLabelFromStringBundle(
    "authMethod-password-encrypted",
    "authPasswordEncrypted"
  );
  // authMethod-password-cleartext already set in secureSelect()

  // Hide deprecated/hidden auth options, unless selected
  hideUnlessSelected(document.getElementById("authMethod-no"));
  hideUnlessSelected(document.getElementById("authMethod-old"));
  hideUnlessSelected(document.getElementById("authMethod-anysecure"));
  hideUnlessSelected(document.getElementById("authMethod-any"));
}

function hideUnlessSelected(element) {
  element.hidden = !element.selected;
}

function setLabelFromStringBundle(elementID, stringName) {
  document.getElementById(elementID).label = document
    .getElementById("bundle_messenger")
    .getString(stringName);
}

function setDivText(divname, value) {
  var div = document.getElementById(divname);
  if (!div) {
    return;
  }
  div.setAttribute("value", value);
}

function onAdvanced() {
  // Store the server type and, if an IMAP or POP3 server,
  // the settings needed for the IMAP/POP3 tab into the array
  var serverSettings = {};
  var serverType = document.getElementById("server.type").getAttribute("value");
  serverSettings.serverType = serverType;

  serverSettings.serverPrettyName = gServer.prettyName;
  serverSettings.account = top.getCurrentAccount();

  if (serverType == "imap") {
    serverSettings.dualUseFolders = document.getElementById(
      "imap.dualUseFolders"
    ).checked;
    serverSettings.usingSubscription = document.getElementById(
      "imap.usingSubscription"
    ).checked;
    serverSettings.maximumConnectionsNumber = document
      .getElementById("imap.maximumConnectionsNumber")
      .getAttribute("value");
    serverSettings.personalNamespace = document
      .getElementById("imap.personalNamespace")
      .getAttribute("value");
    serverSettings.publicNamespace = document
      .getElementById("imap.publicNamespace")
      .getAttribute("value");
    serverSettings.serverDirectory = document
      .getElementById("imap.serverDirectory")
      .getAttribute("value");
    serverSettings.otherUsersNamespace = document
      .getElementById("imap.otherUsersNamespace")
      .getAttribute("value");
    serverSettings.overrideNamespaces = document.getElementById(
      "imap.overrideNamespaces"
    ).checked;
  } else if (serverType == "pop3") {
    serverSettings.deferGetNewMail = document.getElementById(
      "pop3.deferGetNewMail"
    ).checked;
    serverSettings.deferredToAccount = document
      .getElementById("pop3.deferredToAccount")
      .getAttribute("value");
  }

  const onCloseAdvanced = function () {
    if (serverType == "imap") {
      document.getElementById("imap.dualUseFolders").checked =
        serverSettings.dualUseFolders;
      document.getElementById("imap.usingSubscription").checked =
        serverSettings.usingSubscription;
      document
        .getElementById("imap.maximumConnectionsNumber")
        .setAttribute("value", serverSettings.maximumConnectionsNumber);
      document
        .getElementById("imap.personalNamespace")
        .setAttribute("value", serverSettings.personalNamespace);
      document
        .getElementById("imap.publicNamespace")
        .setAttribute("value", serverSettings.publicNamespace);
      document
        .getElementById("imap.serverDirectory")
        .setAttribute("value", serverSettings.serverDirectory);
      document
        .getElementById("imap.otherUsersNamespace")
        .setAttribute("value", serverSettings.otherUsersNamespace);
      document.getElementById("imap.overrideNamespaces").checked =
        serverSettings.overrideNamespaces;
    } else if (serverType == "pop3") {
      document.getElementById("pop3.deferGetNewMail").checked =
        serverSettings.deferGetNewMail;
      document
        .getElementById("pop3.deferredToAccount")
        .setAttribute("value", serverSettings.deferredToAccount);
      const pop3Server = gServer.QueryInterface(Ci.nsIPop3IncomingServer);
      // we're explicitly setting this so we'll go through the SetDeferredToAccount method
      pop3Server.deferredToAccount = serverSettings.deferredToAccount;
      // Setting the server to be deferred causes a rebuild of the account tree,
      // losing the current selection. Reselect the current server again as it
      // didn't really disappear.
      parent.selectServer(
        parent.getCurrentAccount().incomingServer,
        parent.currentPageId
      );

      // Iterate over all accounts to see if any of their junk targets are now
      // invalid (pointed to the account that is now deferred).
      // If any such target is found it is reset to a new safe folder
      // (the deferred to account or Local Folders). If junk was really moved
      // to that folder (moveOnSpam = true) then moving junk is disabled
      // (so that the user notices it and checks the settings).
      // This is the same sanitization as in am-junk.js, just applied to all POP accounts.
      const deferredURI =
        serverSettings.deferredToAccount &&
        MailServices.accounts.getAccount(serverSettings.deferredToAccount)
          .incomingServer.serverURI;

      for (const account of MailServices.accounts.accounts) {
        const accountValues = parent.getValueArrayFor(account);
        const type = parent.getAccountValue(
          account,
          accountValues,
          "server",
          "type",
          null,
          false
        );
        // Try to keep this list of account types not having Junk settings
        // synchronized with the list in AccountManager.js.
        if (type != "nntp" && type != "rss" && type != "im") {
          let spamActionTargetAccount = parent.getAccountValue(
            account,
            accountValues,
            "server",
            "spamActionTargetAccount",
            "string",
            true
          );
          let spamActionTargetFolder = parent.getAccountValue(
            account,
            accountValues,
            "server",
            "spamActionTargetFolder",
            "wstring",
            true
          );
          let moveOnSpam = parent.getAccountValue(
            account,
            accountValues,
            "server",
            "moveOnSpam",
            "bool",
            true
          );

          // Check if there are any invalid junk targets and fix them.
          [spamActionTargetAccount, spamActionTargetFolder, moveOnSpam] =
            sanitizeJunkTargets(
              spamActionTargetAccount,
              spamActionTargetFolder,
              deferredURI || account.incomingServer.serverURI,
              parent.getAccountValue(
                account,
                accountValues,
                "server",
                "moveTargetMode",
                "int",
                true
              ),
              account.incomingServer.spamSettings,
              moveOnSpam
            );

          parent.setAccountValue(
            accountValues,
            "server",
            "moveOnSpam",
            moveOnSpam
          );
          parent.setAccountValue(
            accountValues,
            "server",
            "spamActionTargetAccount",
            spamActionTargetAccount
          );
          parent.setAccountValue(
            accountValues,
            "server",
            "spamActionTargetFolder",
            spamActionTargetFolder
          );
        }
      }
    }
    document.dispatchEvent(new CustomEvent("prefchange"));
  };

  parent.gSubDialog.open(
    "chrome://messenger/content/am-server-advanced.xhtml",
    { closingCallback: onCloseAdvanced },
    serverSettings
  );
}

function secureSelect(aLoading) {
  var socketType = document.getElementById("server.socketType").value;
  var defaultPort = gServer.protocolInfo.getDefaultServerPort(false);
  var defaultPortSecure = gServer.protocolInfo.getDefaultServerPort(true);
  var port = document.getElementById("server.port");
  var portDefault = document.getElementById("defaultPort");
  var prevDefaultPort = portDefault.value;

  if (socketType == Ci.nsMsgSocketType.SSL) {
    portDefault.value = defaultPortSecure;
    if (
      port.value == "" ||
      (!aLoading &&
        port.value == defaultPort &&
        prevDefaultPort != portDefault.value)
    ) {
      port.value = defaultPortSecure;
    }
  } else {
    portDefault.value = defaultPort;
    if (
      port.value == "" ||
      (!aLoading &&
        port.value == defaultPortSecure &&
        prevDefaultPort != portDefault.value)
    ) {
      port.value = defaultPort;
    }
  }

  // switch "insecure password" label
  setLabelFromStringBundle(
    "authMethod-password-cleartext",
    socketType == Ci.nsMsgSocketType.SSL ||
      socketType == Ci.nsMsgSocketType.alwaysSTARTTLS
      ? "authPasswordCleartextViaSSL"
      : "authPasswordCleartextInsecurely"
  );
}

function setupMailOnServerUI() {
  onCheckItem("pop3.deleteMailLeftOnServer", ["pop3.leaveMessagesOnServer"]);
  setupAgeMsgOnServerUI();
}

function setupAgeMsgOnServerUI() {
  const kLeaveMsgsId = "pop3.leaveMessagesOnServer";
  const kDeleteByAgeId = "pop3.deleteByAgeFromServer";
  onCheckItem(kDeleteByAgeId, [kLeaveMsgsId]);
  onCheckItem("daysEnd", [kLeaveMsgsId]);
  onCheckItem("pop3.numDaysToLeaveOnServer", [kLeaveMsgsId, kDeleteByAgeId]);
}

function setupFixedUI() {
  var controls = [
    document.getElementById("fixedServerName"),
    document.getElementById("fixedUserName"),
    document.getElementById("fixedServerPort"),
  ];

  var len = controls.length;
  for (let i = 0; i < len; i++) {
    var fixedElement = controls[i];
    var otherElement = document.getElementById(
      fixedElement.getAttribute("use")
    );

    fixedElement.setAttribute("collapsed", "true");
    otherElement.removeAttribute("collapsed");
  }
}

function BrowseForNewsrc() {
  var newsrcTextBox = document.getElementById("nntp.newsrcFilePath");
  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  fp.init(
    window.browsingContext,
    document.getElementById("browseForNewsrc").getAttribute("filepickertitle"),
    Ci.nsIFilePicker.modeSave
  );

  var currentNewsrcFile;
  try {
    currentNewsrcFile = Cc["@mozilla.org/file/local;1"].createInstance(
      Ci.nsIFile
    );
    currentNewsrcFile.initWithPath(newsrcTextBox.value);
  } catch (e) {
    dump("Failed to create nsIFile instance for the current newsrc file.\n");
  }

  if (currentNewsrcFile) {
    fp.displayDirectory = currentNewsrcFile.parent;
    fp.defaultString = currentNewsrcFile.leafName;
  }

  fp.appendFilters(Ci.nsIFilePicker.filterAll);

  fp.open(rv => {
    if (rv != Ci.nsIFilePicker.returnOK || !fp.file) {
      return;
    }
    newsrcTextBox.value = fp.file.path;
    newsrcTextBox.dispatchEvent(new CustomEvent("change"));
  });
}

function setupImapDeleteUI(aServerId) {
  // read delete_model preference
  const deleteModel = document
    .getElementById("imap.deleteModel")
    .getAttribute("value");
  selectImapDeleteModel(deleteModel);

  // read trash folder path preference
  const trashFolderName = getTrashFolderName();

  // set folderPicker menulist
  const trashPopup = document.getElementById("msgTrashFolderPopup");
  trashPopup._teardown();
  trashPopup._parentFolder = MailUtils.getOrCreateFolder(aServerId);
  trashPopup._ensureInitialized();

  // Escape backslash and double-quote with another backslash before encoding.
  const trashEscaped = trashFolderName.replace(/([\\"])/g, "\\$1");

  // Convert the folder path from JS Unicode to MUTF-7 if necessary.
  const imapServer = trashPopup._parentFolder.server.QueryInterface(
    Ci.nsIImapIncomingServer
  );

  let trashFolder;
  if (imapServer.utf8AcceptEnabled) {
    // Trash folder with UTF8=ACCEPT capability in effect.
    trashFolder = MailUtils.getOrCreateFolder(aServerId + "/" + trashEscaped);
  } else {
    // Traditional MUTF-7.
    const manager = Cc["@mozilla.org/charset-converter-manager;1"].getService(
      Ci.nsICharsetConverterManager
    );
    trashFolder = MailUtils.getOrCreateFolder(
      aServerId + "/" + manager.unicodeToMutf7(trashEscaped)
    );
  }
  trashPopup.selectFolder(trashFolder);
  trashPopup.parentNode.folder = trashFolder;
}

function selectImapDeleteModel(choice) {
  // set deleteModel to selected mode
  document.getElementById("imap.deleteModel").setAttribute("value", choice);

  switch (choice) {
    case "0": // markDeleted
      // disable folderPicker
      document
        .getElementById("msgTrashFolderPicker")
        .setAttribute("disabled", "true");
      break;
    case "1": // moveToTrashFolder
      // enable folderPicker
      document
        .getElementById("msgTrashFolderPicker")
        .removeAttribute("disabled");
      break;
    case "2": // deleteImmediately
      // disable folderPicker
      document
        .getElementById("msgTrashFolderPicker")
        .setAttribute("disabled", "true");
      break;
    default:
      dump("Error in enabling/disabling server.TrashFolderPicker\n");
      break;
  }
}

// Capture any menulist changes from folderPicker
function folderPickerChange(aEvent) {
  const folder = aEvent.target._folder;
  // Since we need to deal with localised folder names, we simply use
  // the path of the URI like we do in nsImapIncomingServer::DiscoveryDone().
  // Note that the path is returned with a leading slash which we need to remove.
  const folderPath = Services.io.newURI(folder.URI).pathQueryRef.substring(1);
  const folderPathUnescaped = Services.io.unescapeString(
    folderPath,
    Ci.nsINetUtil.ESCAPE_URL_PATH
  );

  // Convert the folder path from MUTF-7 or UTF-8 to Unicode.
  const imapServer = folder.server.QueryInterface(Ci.nsIImapIncomingServer);

  let trashUnicode;
  if (imapServer.utf8AcceptEnabled) {
    // UTF8=ACCEPT capability in effect. Unescaping has brought back
    // raw UTF-8 bytes, so convert them to JS Unicode.
    const typedarray = new Uint8Array(folderPathUnescaped.length);
    for (let i = 0; i < folderPathUnescaped.length; i++) {
      typedarray[i] = folderPathUnescaped.charCodeAt(i);
    }
    const utf8Decoder = new TextDecoder("utf-8");
    trashUnicode = utf8Decoder.decode(typedarray);
  } else {
    // We need to convert that from MUTF-7 to Unicode.
    const manager = Cc["@mozilla.org/charset-converter-manager;1"].getService(
      Ci.nsICharsetConverterManager
    );
    trashUnicode = manager.mutf7ToUnicode(folderPathUnescaped);
  }

  // Set the value to be persisted.
  document
    .getElementById("imap.trashFolderName")
    .setAttribute("value", trashUnicode);

  // Update the widget to show/do correct things even for subfolders.
  const trashFolderPicker = document.getElementById("msgTrashFolderPicker");
  trashFolderPicker.menupopup.selectFolder(folder);
}

// Get trash_folder_name from prefs. Despite its name this returns
// a folder path, for example INBOX/Trash.
function getTrashFolderName() {
  let trashFolderName = document
    .getElementById("imap.trashFolderName")
    .getAttribute("value");
  // if the preference hasn't been set, set it to a sane default
  if (!trashFolderName) {
    trashFolderName = "Trash"; // XXX Is this a useful default?
    document
      .getElementById("imap.trashFolderName")
      .setAttribute("value", trashFolderName);
  }
  return trashFolderName;
}
