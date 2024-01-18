/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../search/content/searchTerm.js */

var gPickedFolder;
var gMailView = null;
var msgWindow; // important, don't change the name of this variable. it's really a global used by commandglue.js
var gSearchTermSession; // really an in memory temporary filter we use to read in and write out the search terms
var gSearchFolderURIs = "";
var gMessengerBundle = null;
var gFolderBundle = null;
var gDefaultColor = "";
var gMsgFolder;

var { FolderTreeProperties } = ChromeUtils.importESModule(
  "resource:///modules/FolderTreeProperties.sys.mjs"
);
var { FolderUtils } = ChromeUtils.import("resource:///modules/FolderUtils.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { PluralForm } = ChromeUtils.importESModule(
  "resource:///modules/PluralForm.sys.mjs"
);
var { VirtualFolderHelper } = ChromeUtils.import(
  "resource:///modules/VirtualFolderWrapper.jsm"
);

window.addEventListener("DOMContentLoaded", onLoad);

document.addEventListener("dialogaccept", onOK);
document.addEventListener("dialogcancel", onCancel);

function onLoad() {
  var windowArgs = window.arguments[0];
  var acceptButton = document.querySelector("dialog").getButton("accept");

  gMessengerBundle = Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );

  gFolderBundle = Services.strings.createBundle(
    "chrome://messenger/locale/folderWidgets.properties"
  );

  // call this when OK is pressed
  msgWindow = windowArgs.msgWindow; // eslint-disable-line no-global-assign

  initializeSearchWidgets();

  setSearchScope(Ci.nsMsgSearchScope.offlineMail);
  if (windowArgs.editExistingFolder) {
    acceptButton.label = document
      .querySelector("dialog")
      .getAttribute("editFolderAcceptButtonLabel");
    acceptButton.accesskey = document
      .querySelector("dialog")
      .getAttribute("editFolderAcceptButtonAccessKey");
    InitDialogWithVirtualFolder(windowArgs.folder);
  } else {
    // we are creating a new virtual folder
    acceptButton.label = document
      .querySelector("dialog")
      .getAttribute("newFolderAcceptButtonLabel");
    acceptButton.accesskey = document
      .querySelector("dialog")
      .getAttribute("newFolderAcceptButtonAccessKey");
    // it is possible that we were given arguments to pre-fill the dialog with...
    gSearchTermSession = Cc[
      "@mozilla.org/messenger/searchSession;1"
    ].createInstance(Ci.nsIMsgSearchSession);

    if (windowArgs.searchTerms) {
      // then add them to our search session
      for (const searchTerm of windowArgs.searchTerms) {
        gSearchTermSession.appendTerm(searchTerm);
      }
    }
    if (windowArgs.folder) {
      // pre select the folderPicker, based on what they selected in the folder pane
      gPickedFolder = windowArgs.folder;
      try {
        document
          .getElementById("msgNewFolderPopup")
          .selectFolder(windowArgs.folder);
      } catch (ex) {
        document
          .getElementById("msgNewFolderPicker")
          .setAttribute("label", windowArgs.folder.prettyName);
      }

      // if the passed in URI is not a server then pre-select it as the folder to search
      if (!windowArgs.folder.isServer) {
        gSearchFolderURIs = windowArgs.folder.URI;
      }
    }

    const folderNameField = document.getElementById("name");
    folderNameField.removeAttribute("hidden");
    folderNameField.focus();
    if (windowArgs.newFolderName) {
      folderNameField.value = windowArgs.newFolderName;
    }
    if (windowArgs.searchFolderURIs) {
      gSearchFolderURIs = windowArgs.searchFolderURIs;
    }

    setupSearchRows(gSearchTermSession.searchTerms);
    doEnabling(); // we only need to disable/enable the OK button for new virtual folders
  }

  if (typeof windowArgs.searchOnline != "undefined") {
    document.getElementById("searchOnline").checked = windowArgs.searchOnline;
  }
  updateOnlineSearchState();
  updateFoldersCount();
}

function setupSearchRows(aSearchTerms) {
  if (aSearchTerms && aSearchTerms.length > 0) {
    // Load the search terms for the folder.
    initializeSearchRows(Ci.nsMsgSearchScope.offlineMail, aSearchTerms);
  } else {
    onMore(null);
  }
}

function updateOnlineSearchState() {
  var enableCheckbox = false;
  var checkbox = document.getElementById("searchOnline");
  // only enable the checkbox for selection, for online servers
  var srchFolderUriArray = gSearchFolderURIs.split("|");
  if (srchFolderUriArray[0]) {
    var realFolder = MailUtils.getOrCreateFolder(srchFolderUriArray[0]);
    enableCheckbox = realFolder.server.offlineSupportLevel; // anything greater than 0 is an online server like IMAP or news
  }

  if (enableCheckbox) {
    checkbox.removeAttribute("disabled");
  } else {
    checkbox.setAttribute("disabled", true);
    checkbox.checked = false;
  }
}

function InitDialogWithVirtualFolder(aVirtualFolder) {
  const virtualFolderWrapper = VirtualFolderHelper.wrapVirtualFolder(
    window.arguments[0].folder
  );
  gMsgFolder = window.arguments[0].folder;

  const styles = getComputedStyle(document.body);
  const folderColors = {
    Inbox: styles.getPropertyValue("--folder-color-inbox"),
    Sent: styles.getPropertyValue("--folder-color-sent"),
    Outbox: styles.getPropertyValue("--folder-color-outbox"),
    Drafts: styles.getPropertyValue("--folder-color-draft"),
    Trash: styles.getPropertyValue("--folder-color-trash"),
    Archive: styles.getPropertyValue("--folder-color-archive"),
    Templates: styles.getPropertyValue("--folder-color-template"),
    Junk: styles.getPropertyValue("--folder-color-spam"),
    Virtual: styles.getPropertyValue("--folder-color-folder-filter"),
    RSS: styles.getPropertyValue("--folder-color-rss"),
    Newsgroup: styles.getPropertyValue("--folder-color-newsletter"),
  };
  gDefaultColor = styles.getPropertyValue("--folder-color-folder");

  // when editing an existing folder, hide the folder picker that stores the parent location of the folder
  document.getElementById("msgNewFolderPicker").collapsed = true;
  const items = document.getElementsByClassName("chooseFolderLocation");
  for (const item of items) {
    item.setAttribute("hidden", true);
  }
  const folderNameField = document.getElementById("existingName");
  folderNameField.removeAttribute("hidden");

  // Show the icon color options.
  document.getElementById("iconColorContainer").collapsed = false;

  const folderType = FolderUtils.getSpecialFolderString(gMsgFolder);
  if (folderType in folderColors) {
    gDefaultColor = folderColors[folderType];
  }

  const colorInput = document.getElementById("color");
  colorInput.value =
    FolderTreeProperties.getColor(aVirtualFolder.URI) || gDefaultColor;
  colorInput.addEventListener("input", event => {
    // Preview the chosen color.
    Services.obs.notifyObservers(
      gMsgFolder,
      "folder-color-preview",
      colorInput.value
    );
  });
  const resetColorButton = document.getElementById("resetColor");
  resetColorButton.addEventListener("click", function () {
    colorInput.value = gDefaultColor;
    // Preview the default color.
    Services.obs.notifyObservers(
      gMsgFolder,
      "folder-color-preview",
      gDefaultColor
    );
  });

  gSearchFolderURIs = virtualFolderWrapper.searchFolderURIs;
  updateFoldersCount();
  document.getElementById("searchOnline").checked =
    virtualFolderWrapper.onlineSearch;
  gSearchTermSession = virtualFolderWrapper.searchTermsSession;

  setupSearchRows(gSearchTermSession.searchTerms);

  // set the name of the folder
  const name = gFolderBundle.formatStringFromName("verboseFolderFormat", [
    aVirtualFolder.prettyName,
    aVirtualFolder.server.prettyName,
  ]);
  folderNameField.setAttribute("value", name);
  // update the window title based on the name of the saved search
  document.title = gMessengerBundle.formatStringFromName(
    "editVirtualFolderPropertiesTitle",
    [aVirtualFolder.prettyName]
  );
}

function onFolderPick(aEvent) {
  gPickedFolder = aEvent.target._folder;
  document.getElementById("msgNewFolderPopup").selectFolder(gPickedFolder);
}

function onOK(event) {
  var name = document.getElementById("name").value;
  var searchOnline = document.getElementById("searchOnline").checked;

  if (!gSearchFolderURIs) {
    Services.prompt.alert(
      window,
      null,
      gMessengerBundle.GetStringFromName("alertNoSearchFoldersSelected")
    );
    event.preventDefault();
    return;
  }

  if (window.arguments[0].editExistingFolder) {
    // update the search terms
    gSearchTermSession.searchTerms = saveSearchTerms(
      gSearchTermSession.searchTerms,
      gSearchTermSession
    );
    // save the settings
    const virtualFolderWrapper = VirtualFolderHelper.wrapVirtualFolder(
      window.arguments[0].folder
    );
    virtualFolderWrapper.searchTerms = gSearchTermSession.searchTerms;
    virtualFolderWrapper.searchFolders = gSearchFolderURIs;
    virtualFolderWrapper.onlineSearch = searchOnline;
    virtualFolderWrapper.cleanUpMessageDatabase();

    MailServices.accounts.saveVirtualFolders();

    let color = document.getElementById("color").value;
    if (color == gDefaultColor) {
      color = undefined;
    }
    FolderTreeProperties.setColor(gMsgFolder.URI, color);
    // Tell 3-pane tabs to update the folder's color.
    Services.obs.notifyObservers(gMsgFolder, "folder-color-changed", color);

    if (window.arguments[0].onOKCallback) {
      window.arguments[0].onOKCallback();
    }

    return;
  }

  var uri = gPickedFolder.URI;
  if (name && uri) {
    // create a new virtual folder
    // check to see if we already have a folder with the same name and alert the user if so...
    var parentFolder = MailUtils.getOrCreateFolder(uri);

    // sanity check the name based on the logic used by nsMsgBaseUtils.cpp. It can't start with a '.', it can't end with a '.', '~' or ' '.
    // it can't contain a ';' or '#'.
    if (/^\.|[\.\~ ]$|[\;\#]/.test(name)) {
      Services.prompt.alert(
        window,
        null,
        gMessengerBundle.GetStringFromName("folderCreationFailed")
      );
      event.preventDefault();
      return;
    } else if (parentFolder.containsChildNamed(name)) {
      Services.prompt.alert(
        window,
        null,
        gMessengerBundle.GetStringFromName("folderExists")
      );
      event.preventDefault();
      return;
    }

    gSearchTermSession.searchTerms = saveSearchTerms(
      gSearchTermSession.searchTerms,
      gSearchTermSession
    );
    VirtualFolderHelper.createNewVirtualFolder(
      name,
      parentFolder,
      gSearchFolderURIs,
      gSearchTermSession.searchTerms,
      searchOnline
    );
  }
}

function onCancel(event) {
  if (gMsgFolder) {
    // Clear any previewed color.
    Services.obs.notifyObservers(gMsgFolder, "folder-color-preview");
  }
}

function doEnabling() {
  var acceptButton = document.querySelector("dialog").getButton("accept");
  acceptButton.disabled = !document.getElementById("name").value;
}

function chooseFoldersToSearch() {
  // if we have some search folders already, then root the folder picker dialog off the account
  // for those folders. Otherwise fall back to the preselectedfolderURI which is the parent folder
  // for this new virtual folder.
  window.openDialog(
    "chrome://messenger/content/virtualFolderListEdit.xhtml",
    "",
    "chrome,titlebar,modal,centerscreen,resizable",
    {
      searchFolderURIs: gSearchFolderURIs,
      okCallback: onFolderListDialogCallback,
    }
  );
}

// callback routine from chooseFoldersToSearch
function onFolderListDialogCallback(searchFolderURIs) {
  gSearchFolderURIs = searchFolderURIs;
  updateFoldersCount();
  updateOnlineSearchState(); // we may have changed the server type we are searching...
}

function updateFoldersCount() {
  const srchFolderUriArray = gSearchFolderURIs.split("|");
  const folderCount = gSearchFolderURIs ? srchFolderUriArray.length : 0;
  const foldersList = document.getElementById("chosenFoldersCount");
  foldersList.textContent = PluralForm.get(
    folderCount,
    gMessengerBundle.GetStringFromName("virtualFolderSourcesChosen")
  ).replace("#1", folderCount);
  if (folderCount > 0) {
    const folderNames = [];
    for (const folderURI of srchFolderUriArray) {
      const folder = MailUtils.getOrCreateFolder(folderURI);
      const name = this.gMessengerBundle.formatStringFromName(
        "verboseFolderFormat",
        [folder.prettyName, folder.server.prettyName]
      );
      folderNames.push(name);
    }
    foldersList.setAttribute("tooltiptext", folderNames.join("\n"));
  } else {
    foldersList.removeAttribute("tooltiptext");
  }
}

function onEnterInSearchTerm() {
  // stub function called by the core search widget code...
  // nothing for us to do here
}
