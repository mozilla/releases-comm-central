/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from am-prefs.js */
/* import-globals-from amUtils.js */

var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

var { OAuth2Providers } = ChromeUtils.importESModule(
  "resource:///modules/OAuth2Providers.sys.mjs"
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
  } else if (serverType == "ews") {
    setupEwsDeleteUI(aServerId);
  }
  // OAuth2 is only supported on certain servers.
  const details = OAuth2Providers.getHostnameDetails(
    document.getElementById("server.hostName").value,
    serverType
  );
  document.getElementById("authMethod-oauth2").hidden = !details;
  // TLS Cert (External) only supported on IMAP.
  document.getElementById("authMethod-external").hidden = serverType != "imap";

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
  storeTypeElement.toggleAttribute(
    "disabled",
    !(
      gServer.getBoolValue("canChangeStoreType") ||
      Services.prefs.getBoolPref("mail.store_conversion_enabled")
    )
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

  // EWS does not currently support other authentication methods than password
  // and OAuth2. While some of them just do not really make sense in the context
  // of Exchange (e.g. there is no practical difference between "normal
  // password" and "encrypted password"), others are just not supported in the
  // EWS code just yet and may come later.
  // Note: `authMethod-external` is already hidden from `onInit`.
  if (serverType == "ews") {
    hideUnlessSelected(document.getElementById("authMethod-kerberos"));
    hideUnlessSelected(document.getElementById("authMethod-ntlm"));
    hideUnlessSelected(
      document.getElementById("authMethod-password-encrypted")
    );
  }
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
  } else if (serverType == "ews") {
    serverSettings.ewsUrl = document
      .getElementById("ews.ewsUrl")
      .getAttribute("value");
    serverSettings.ewsOverrideOAuthDetails = document.getElementById(
      "ews.ewsOverrideOAuthDetails"
    ).checked;
    serverSettings.ewsApplicationId = document
      .getElementById("ews.ewsApplicationId")
      .getAttribute("value");
    serverSettings.ewsTenantId = document
      .getElementById("ews.ewsTenantId")
      .getAttribute("value");
    serverSettings.ewsRedirectUri = document
      .getElementById("ews.ewsRedirectUri")
      .getAttribute("value");
    serverSettings.ewsEndpointHost = document
      .getElementById("ews.ewsEndpointHost")
      .getAttribute("value");
    serverSettings.ewsOAuthScopes = document
      .getElementById("ews.ewsOAuthScopes")
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
            "string",
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
    } else if (serverType == "ews") {
      document
        .getElementById("ews.ewsUrl")
        .setAttribute("value", serverSettings.ewsUrl);
      document.getElementById("ews.ewsOverrideOAuthDetails").checked =
        serverSettings.ewsOverrideOAuthDetails;
      document
        .getElementById("ews.ewsApplicationId")
        .setAttribute("value", serverSettings.ewsApplicationId);
      document
        .getElementById("ews.ewsTenantId")
        .setAttribute("value", serverSettings.ewsTenantId);
      document
        .getElementById("ews.ewsRedirectUri")
        .setAttribute("value", serverSettings.ewsRedirectUri);
      document
        .getElementById("ews.ewsEndpointHost")
        .setAttribute("value", serverSettings.ewsEndpointHost);
      document
        .getElementById("ews.ewsOAuthScopes")
        .setAttribute("value", serverSettings.ewsOAuthScopes);
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

  const certCheck = document.getElementById("certCheck");
  if (gServer.type == "nntp" || socketType == Ci.nsMsgSocketType.plain) {
    certCheck.hidden = true;
  } else {
    certCheck.init(
      document.getElementById("server.hostName").value,
      document.getElementById("server.port").value,
      document.getElementById("server.type").value,
      document.getElementById("server.socketType").value ==
        Ci.nsMsgSocketType.alwaysSTARTTLS
    );
    certCheck.hidden = false;
  }
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

    fixedElement.toggleAttribute("collapsed", true);
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

  // Get trash_folder_name from prefs. Despite its name this returns a folder
  // path, e.g., "INBOX/Deleted" and "[Gmail]/Trash". If pref not set just
  // return empty string and leave pref not set. This avoids showing a default
  // name (e.g., "Trash") in trash folder picker when trash folder is something
  // else or has yet to be determined.
  const trashFolderName = document
    .getElementById("imap.trashFolderName")
    .getAttribute("value");

  // set folderPicker menulist
  const trashPopup = setupFolderPicker("msgTrashFolderPopup", aServerId);

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
  document.getElementById("msgTrashFolderPicker").disabled = choice != "1";
}

function setupEwsDeleteUI(serverId) {
  const deleteModel = document
    .getElementById("ews.deleteModel")
    .getAttribute("value");
  selectEwsDeleteModel(deleteModel);

  // read trash folder path preference
  const trashFolderPath = document
    .getElementById("ews.trashFolderPath")
    .getAttribute("value");

  const escapedPath = Services.io.escapeString(
    trashFolderPath.replace(/([\\"])/g, "\\$1"),
    Services.io.ESCAPE_URL_PATH
  );

  // set folderPicker menulist
  const trashPopup = setupFolderPicker("ewsMsgTrashFolderPopup", serverId);

  const trashFolder = MailUtils.getExistingFolder(serverId + "/" + escapedPath);

  trashPopup.selectFolder(trashFolder);
  trashPopup.parentNode.folder = trashFolder;
}

function selectEwsDeleteModel(choice) {
  document.getElementById("ews.deleteModel").setAttribute("value", choice);
  document.getElementById("ewsMsgTrashFolderPicker").disabled = choice == "0";
}

// Capture any menulist changes from folderPicker
function folderPickerChange(aEvent) {
  const folder = aEvent.target._folder;
  // If the server does not support ACCEPT=UTF-8, convert the folder path from
  // MUTF-7 or UTF-8 to Unicode.
  const imapServer = folder.server.QueryInterface(Ci.nsIImapIncomingServer);

  const trashUnicode = localisedUnicodePath(
    folder,
    !imapServer.utf8AcceptEnabled
  );

  // Set the value to be persisted.
  document
    .getElementById("imap.trashFolderName")
    .setAttribute("value", trashUnicode);

  // Update the widget to show/do correct things even for subfolders.
  const trashFolderPicker = document.getElementById("msgTrashFolderPicker");
  trashFolderPicker.menupopup.selectFolder(folder);
}

/**
 * Handle a change to the EWS trash folder picker.
 *
 * This will set the value of the trash folder to be persisted in the preference
 * value.
 *
 * @param {Event} event
 */
function ewsFolderPickerChange(event) {
  const folder = event.target._folder;
  const trashUnicode = localisedUnicodePath(folder, false);

  // Set the value to be persisted.
  document
    .getElementById("ews.trashFolderPath")
    .setAttribute("value", trashUnicode);

  // Update the widget to show/do correct things even for subfolders.
  const trashFolderPicker = document.getElementById("ewsMsgTrashFolderPicker");
  trashFolderPicker.menupopup.selectFolder(folder);
}

/**
 * Set up a folder picker with the given `elementId` to list the folders for the
 * server with the given `serverId`.
 *
 * @param {string} elementId
 * @param {string} serverId
 * @returns {MozFolderMenuPopup}
 */
function setupFolderPicker(elementId, serverId) {
  const folderPicker = document.getElementById(elementId);
  folderPicker._teardown();
  folderPicker._parentFolder = MailUtils.getExistingFolder(serverId);
  folderPicker._ensureInitialized();
  return folderPicker;
}

/**
 * Return the localised unicode path of a folder relative to its server.
 *
 * If `convertFromImapMutf7` is `true`, then it is assumed that the folder's
 * path contains MUTF-7 characters that must be converted to javascript unicode.
 * Otherwise, the decoded path will be converted to javascript unicode from
 * UTF-8
 *
 * @param {nsIMsgFolder} folder
 * @param {boolean} convertFromImapMutf7
 * @returns {string}
 */
function localisedUnicodePath(folder, convertFromImapMutf7) {
  // Since we need to deal with localised folder names, we simply use
  // the path of the URI like we do in nsImapIncomingServer::DiscoveryDone().
  // Note that the path is returned with a leading slash which we need to remove.
  const folderPath = Services.io.newURI(folder.URI).pathQueryRef.substring(1);
  const folderPathUnescaped = Services.io.unescapeString(
    folderPath,
    Ci.nsINetUtil.ESCAPE_URL_PATH
  );

  if (convertFromImapMutf7) {
    // We need to convert that from MUTF-7 to Unicode.
    const manager = Cc["@mozilla.org/charset-converter-manager;1"].getService(
      Ci.nsICharsetConverterManager
    );
    return manager.mutf7ToUnicode(folderPathUnescaped);
  }

  // If input was not MUTF-7, then unescaping has brought back raw UTF-8 bytes,
  // so convert them to JS Unicode.
  const typedarray = new Uint8Array(folderPathUnescaped.length);
  for (let i = 0; i < folderPathUnescaped.length; i++) {
    typedarray[i] = folderPathUnescaped.charCodeAt(i);
  }
  const utf8Decoder = new TextDecoder("utf-8");
  return utf8Decoder.decode(typedarray);
}
