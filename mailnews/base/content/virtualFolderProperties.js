/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../search/content/searchTerm.js */

var gFolderTreeView;
var gPickedFolder;
var gMailView = null;
var msgWindow; // important, don't change the name of this variable. it's really a global used by commandglue.js
var gSearchTermSession; // really an in memory temporary filter we use to read in and write out the search terms
var gSearchFolderURIs = "";
var gMessengerBundle = null;
var kCurrentColor = "";
var kDefaultColor = "#363959";
var gNeedToRestoreFolderSelection = false;

var nsMsgSearchScope = Ci.nsMsgSearchScope;

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { PluralForm } = ChromeUtils.import(
  "resource://gre/modules/PluralForm.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { VirtualFolderHelper } = ChromeUtils.import(
  "resource:///modules/VirtualFolderWrapper.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

document.addEventListener("dialogaccept", onOK);
document.addEventListener("dialogcancel", onCancel);

function onLoad() {
  var windowArgs = window.arguments[0];
  var acceptButton = document.querySelector("dialog").getButton("accept");

  gMessengerBundle = document.getElementById("bundle_messenger");

  // call this when OK is pressed
  msgWindow = windowArgs.msgWindow; // eslint-disable-line no-global-assign

  initializeSearchWidgets();

  setSearchScope(nsMsgSearchScope.offlineMail);
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
      for (let searchTerm of windowArgs.searchTerms) {
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

    let folderNameField = document.getElementById("name");
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
  let virtualFolderWrapper = VirtualFolderHelper.wrapVirtualFolder(
    window.arguments[0].folder
  );

  // when editing an existing folder, hide the folder picker that stores the parent location of the folder
  document.getElementById("msgNewFolderPicker").collapsed = true;
  document.getElementById("chooseFolderLocationLabel").collapsed = true;
  let folderNameField = document.getElementById("existingName");
  folderNameField.removeAttribute("hidden");

  // Show the icon color options.
  document.getElementById("iconColorContainer").collapsed = false;
  // Store the current icon color to allow discarding edits.
  gFolderTreeView = window.arguments[0].treeView;
  kCurrentColor = gFolderTreeView.getFolderCacheProperty(
    aVirtualFolder,
    "folderIconColor"
  );

  let colorInput = document.getElementById("color");
  colorInput.value = kCurrentColor ? kCurrentColor : kDefaultColor;
  colorInput.addEventListener("input", event => {
    window.arguments[0].previewSelectedColorCallback(
      aVirtualFolder,
      event.target.value
    );
  });

  gSearchFolderURIs = virtualFolderWrapper.searchFolderURIs;
  updateFoldersCount();
  document.getElementById("searchOnline").checked =
    virtualFolderWrapper.onlineSearch;
  gSearchTermSession = virtualFolderWrapper.searchTermsSession;

  setupSearchRows(gSearchTermSession.searchTerms);

  // set the name of the folder
  let folderBundle = document.getElementById("bundle_folder");
  let name = folderBundle.getFormattedString("verboseFolderFormat", [
    aVirtualFolder.prettyName,
    aVirtualFolder.server.prettyName,
  ]);
  folderNameField.setAttribute("value", name);
  // update the window title based on the name of the saved search
  document.title = gMessengerBundle.getFormattedString(
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
      gMessengerBundle.getString("alertNoSearchFoldersSelected")
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
    let virtualFolderWrapper = VirtualFolderHelper.wrapVirtualFolder(
      window.arguments[0].folder
    );
    virtualFolderWrapper.searchTerms = gSearchTermSession.searchTerms;
    virtualFolderWrapper.searchFolders = gSearchFolderURIs;
    virtualFolderWrapper.onlineSearch = searchOnline;
    virtualFolderWrapper.cleanUpMessageDatabase();

    MailServices.accounts.saveVirtualFolders();

    // Check if the icon color was updated.
    if (
      kCurrentColor !=
      gFolderTreeView.getFolderCacheProperty(
        window.arguments[0].folder,
        "folderIconColor"
      )
    ) {
      window.arguments[0].updateColorCallback(window.arguments[0].folder);
    }

    if (window.arguments[0].onOKCallback) {
      window.arguments[0].onOKCallback(virtualFolderWrapper.virtualFolder.URI);
    }

    restoreFolderSelection();
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
        gMessengerBundle.getString("folderCreationFailed")
      );
      event.preventDefault();
      return;
    } else if (parentFolder.containsChildNamed(name)) {
      Services.prompt.alert(
        window,
        null,
        gMessengerBundle.getString("folderExists")
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
  if (
    window.arguments[0].folder &&
    window.arguments[0].previewSelectedColorCallback
  ) {
    // Restore the icon to the previous color and discard edits.
    window.arguments[0].previewSelectedColorCallback(
      window.arguments[0].folder,
      kCurrentColor
    );
  }

  restoreFolderSelection();
}

/**
 * If the user interacted with the color picker, it means the folder was
 * deselected to ensure a proper preview of the color, so we need to re-select
 * the folder when done.
 */
function restoreFolderSelection() {
  if (
    gNeedToRestoreFolderSelection &&
    window.arguments[0].selectFolderCallback
  ) {
    window.arguments[0].selectFolderCallback(window.arguments[0].folder);
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
  let srchFolderUriArray = gSearchFolderURIs.split("|");
  let folderCount = gSearchFolderURIs ? srchFolderUriArray.length : 0;
  let foldersList = document.getElementById("chosenFoldersCount");
  foldersList.textContent = PluralForm.get(
    folderCount,
    gMessengerBundle.getString("virtualFolderSourcesChosen")
  ).replace("#1", folderCount);
  if (folderCount > 0) {
    let folderNames = [];
    for (let folderURI of srchFolderUriArray) {
      let folder = MailUtils.getOrCreateFolder(folderURI);
      let name = this.gMessengerBundle.getFormattedString(
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

/**
 * Clear the tree selection if the user opens the color picker in order to
 * guarantee a proper color preview of the highlighted tree item.
 */
function inputColorClicked() {
  window.arguments[0].clearFolderSelectionCallback();
  gNeedToRestoreFolderSelection = true;
}

/**
 * Reset the folder color to the default value.
 */
function resetColor() {
  inputColorClicked();
  document.getElementById("color").value = kDefaultColor;
  window.arguments[0].previewSelectedColorCallback(
    window.arguments[0].folder,
    null
  );
}
