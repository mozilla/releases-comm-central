/* -*- Mode: javascript; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 ; js-indent-level: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../mailnews/addrbook/content/abResultsPane.js */
/* import-globals-from ../../../../mailnews/base/content/msgPrintEngine.js */
/* import-globals-from abCardView.js */
/* import-globals-from abCommon.js */

// Ensure the activity modules are loaded for this window.
ChromeUtils.import("resource:///modules/activity/activityModules.jsm");
var { getSearchTokens, getModelQuery, generateQueryURI } = ChromeUtils.import(
  "resource:///modules/ABQueryUtils.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { PluralForm } = ChromeUtils.import(
  "resource://gre/modules/PluralForm.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var nsIAbListener = Ci.nsIAbListener;
var kPrefMailAddrBookLastNameFirst = "mail.addr_book.lastnamefirst";
var kPersistCollapseMapStorage = "directoryTree.json";

var gSearchTimer = null;
var gStatusText = null;
var gQueryURIFormat = null;
var gCardViewBox;
var gCardViewBoxEmail1;
var gPreviousDirTreeIndex = -1;

var msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);

var chatHandler = {};
ChromeUtils.import("resource:///modules/chatHandler.jsm", chatHandler);

// Constants that correspond to choices
// in Address Book->View -->Show Name as
var kDisplayName = 0;
var kLastNameFirst = 1;
var kFirstNameFirst = 2;
var kLDAPDirectory = 0; // defined in nsDirPrefs.h
var kPABDirectory = 2; // defined in nsDirPrefs.h

// These chat properties are the ones that our IM component supports. If a
// contact has a value for one of these properties, we can communicate with
// that contact (assuming that the user has added that value to their list
// of IM contacts).
var kChatProperties = ["_GoogleTalk", "_JabberId"];

// Note: We need to keep this listener as it does not just handle dir
// pane deletes but also deletes of address books and lists from places like
// the sidebar and LDAP preference pane.
var gAddressBookAbListener = {
  onItemAdded(parentDir, item) {
    // will not be called
  },
  onItemRemoved(parentDir, item) {
    // will only be called when an addressbook is deleted
    try {
      // If we don't have a record of the previous selection, the only
      // option is to select the first.
      if (gPreviousDirTreeIndex == -1) {
        SelectFirstAddressBook();
      } else if (gDirTree.currentIndex == -1) {
        // Don't reselect if we already have a valid selection, this may be
        // the case if items are being removed via other methods, e.g. sidebar,
        // LDAP preference pane etc.
        var directory = item.QueryInterface(Ci.nsIAbDirectory);

        // If we are a mail list, move the selection up the list before
        // trying to find the parent. This way we'll end up selecting the
        // parent address book when we remove a mailing list.
        //
        // For simple address books we don't need to move up the list, as
        // we want to select the next one upon removal.
        if (directory.isMailList && gPreviousDirTreeIndex > 0) {
          --gPreviousDirTreeIndex;
        }

        // Now get the parent of the row.
        var newRow = gDirTree.view.getParentIndex(gPreviousDirTreeIndex);

        // if we have no parent (i.e. we are an address book), use the
        // previous index.
        if (newRow == -1) {
          newRow = gPreviousDirTreeIndex;
        }

        // Fall back to the first address book if we're not in a valid range
        if (newRow >= gDirTree.view.rowCount) {
          newRow = 0;
        }

        // Now select the new item.
        gDirTree.view.selection.select(newRow);
      }
    } catch (ex) {}
  },
  onItemPropertyChanged(item, property, oldValue, newValue) {
    // will not be called
  },
};

function OnUnloadAddressBook() {
  // If there's no default startupURI, save the last used URI as new startupURI.
  let saveLastURIasStartupURI = !Services.prefs.getBoolPref(
    "mail.addr_book.view.startupURIisDefault"
  );
  if (saveLastURIasStartupURI) {
    let selectedDirURI = getSelectedDirectoryURI();
    Services.prefs.setCharPref(
      "mail.addr_book.view.startupURI",
      selectedDirURI
    );
  }

  MailServices.ab.removeAddressBookListener(gAddressBookAbListener);
  MailServices.ab.removeAddressBookListener(gDirectoryTreeView);

  // Shutdown the tree view - this will also save the open/collapsed
  // state of the tree view to a JSON file.
  gDirectoryTreeView.shutdown(kPersistCollapseMapStorage);

  MailServices.mailSession.RemoveMsgWindow(msgWindow);

  ToolbarIconColor.uninit();

  CloseAbView();
}

var gAddressBookAbViewListener = {
  onSelectionChanged() {
    ResultsPaneSelectionChanged();
  },
  onCountChanged(total) {
    SetStatusText(total);
    window.dispatchEvent(new CustomEvent("countchange"));
  },
};

function GetAbViewListener() {
  return gAddressBookAbViewListener;
}

// we won't show the window until the onload() handler is finished
// so we do this trick (suggested by hyatt / blaker)
function OnLoadAddressBook() {
  // Set a sane starting width/height for all resolutions on new profiles.
  // Do this before the window loads.
  if (!document.documentElement.hasAttribute("width")) {
    // Prefer 860xfull height.
    let defaultHeight = screen.availHeight;
    let defaultWidth = screen.availWidth >= 860 ? 860 : screen.availWidth;

    // On small screens, default to maximized state.
    if (defaultHeight <= 600) {
      document.documentElement.setAttribute("sizemode", "maximized");
    }

    document.documentElement.setAttribute("width", defaultWidth);
    document.documentElement.setAttribute("height", defaultHeight);
    // Make sure we're safe at the left/top edge of screen
    document.documentElement.setAttribute("screenX", screen.availLeft);
    document.documentElement.setAttribute("screenY", screen.availTop);
  }

  ToolbarIconColor.init();

  // Run menubar initialization first, to avoid TabsInTitlebar code picking
  // up mutations from it and causing a reflow.
  if (AppConstants.platform != "macosx") {
    AutoHideMenubar.init();
  }

  if (!chatHandler.ChatCore.initialized) {
    chatHandler.ChatCore.init();
  }

  setTimeout(delayedOnLoadAddressBook, 0); // when debugging, set this to 5000, so you can see what happens after the window comes up.
}

function delayedOnLoadAddressBook() {
  InitCommonJS();

  GetCurrentPrefs();

  // FIX ME - later we will be able to use onload from the overlay
  OnLoadCardView();

  // Initialize the Address Book tree view
  gDirectoryTreeView.init(gDirTree, kPersistCollapseMapStorage);

  selectStartupViewDirectory();
  gAbResultsTree.focus();

  // if the pref is locked disable the menuitem New->LDAP directory
  if (Services.prefs.prefIsLocked("ldap_2.disable_button_add")) {
    document.getElementById("addLDAP").setAttribute("disabled", "true");
  }

  document
    .getElementById("cmd_newMessage")
    .setAttribute("disabled", MailServices.accounts.allIdentities.length == 0);

  // Add a listener, so we can switch directories if the current directory is
  // deleted. This listener cares when a directory (= address book), or a
  // directory item is/are removed. In the case of directory items, we are
  // only really interested in mailing list changes and not cards but we have
  // to have both.
  MailServices.ab.addAddressBookListener(
    gAddressBookAbListener,
    nsIAbListener.directoryRemoved | nsIAbListener.directoryItemRemoved
  );
  MailServices.ab.addAddressBookListener(gDirectoryTreeView, nsIAbListener.all);

  gDirTree.controllers.appendController(DirPaneController);
  gAbResultsTree.controllers.appendController(abResultsController);
  // Force command update for the benefit of DirPaneController and
  // abResultsController
  CommandUpdate_AddressBook();

  // initialize the customizeDone method on the customizeable toolbar
  var toolbox = document.getElementById("ab-toolbox");
  toolbox.customizeDone = function(aEvent) {
    MailToolboxCustomizeDone(aEvent, "CustomizeABToolbar");
  };

  // Ensure we don't load xul error pages into the main window
  window.docShell.useErrorPages = false;

  MailServices.mailSession.AddMsgWindow(msgWindow);

  // Focus the searchbox as we think the user will want to do that
  // with the highest probability.
  // Bug 1143812: This is disabled for now to keep the New Contact command enabled.
  // QuickSearchFocus();
}

function GetCurrentPrefs() {
  // check "Show Name As" menu item based on pref
  var menuitemID;
  switch (Services.prefs.getIntPref(kPrefMailAddrBookLastNameFirst)) {
    case kFirstNameFirst:
      menuitemID = "firstLastCmd";
      break;
    case kLastNameFirst:
      menuitemID = "lastFirstCmd";
      break;
    case kDisplayName:
    default:
      menuitemID = "displayNameCmd";
      break;
  }

  var menuitem = top.document.getElementById(menuitemID);
  if (menuitem) {
    menuitem.setAttribute("checked", "true");
  }

  // initialize phonetic
  var showPhoneticFields = Services.prefs.getComplexValue(
    "mail.addr_book.show_phonetic_fields",
    Ci.nsIPrefLocalizedString
  ).data;
  // show phonetic fields if indicated by the pref
  if (showPhoneticFields == "true") {
    document
      .getElementById("cmd_SortBy_PhoneticName")
      .setAttribute("hidden", "false");
  }
}

function SetNameColumn(cmd) {
  var prefValue;

  switch (cmd) {
    case "firstLastCmd":
      prefValue = kFirstNameFirst;
      break;
    case "lastFirstCmd":
      prefValue = kLastNameFirst;
      break;
    case "displayNameCmd":
      prefValue = kDisplayName;
      break;
  }

  Services.prefs.setIntPref(kPrefMailAddrBookLastNameFirst, prefValue);
}

function onOSXFileMenuInit() {
  document
    .getElementById("menu_osxAddressBook")
    .setAttribute("checked", AbOSXAddressBookExists());
}

function CommandUpdate_AddressBook() {
  goUpdateCommand("cmd_delete");
  goUpdateCommand("button_delete");
  goUpdateCommand("cmd_printcardpreview");
  goUpdateCommand("cmd_printcard");
  goUpdateCommand("cmd_properties");
  goUpdateCommand("cmd_abToggleStartupDir");
  goUpdateCommand("cmd_newlist");
  goUpdateCommand("cmd_newCard");
  goUpdateCommand("cmd_chatWithCard");
}

function ResultsPaneSelectionChanged() {
  UpdateCardView();
}

function UpdateCardView() {
  var cards = GetSelectedAbCards();

  if (!cards) {
    ClearCardViewPane();
    return;
  }

  // display the selected card, if exactly one card is selected.
  // either no cards, or more than one card is selected, clear the pane.
  // We do not need to check cards[0] any more since GetSelectedAbCards() only
  // push non-null entity to the list.
  if (cards.length == 1) {
    OnClickedCard(cards[0]);
  } else {
    ClearCardViewPane();
  }
}

function OnClickedCard(card) {
  if (card) {
    DisplayCardViewPane(card);
  } else {
    ClearCardViewPane();
  }
}

function AbClose() {
  top.close();
}

function AbPrintCardInternal(doPrintPreview, msgType) {
  var selectedItems = GetSelectedAbCards();
  var numSelected = selectedItems.length;

  if (!numSelected) {
    return;
  }

  let statusFeedback;
  statusFeedback = Cc[
    "@mozilla.org/messenger/statusfeedback;1"
  ].createInstance();
  statusFeedback = statusFeedback.QueryInterface(Ci.nsIMsgStatusFeedback);

  let selectionArray = [];

  for (let i = 0; i < numSelected; i++) {
    let card = selectedItems[i];
    let printCardUrl = CreatePrintCardUrl(card);
    if (printCardUrl) {
      selectionArray.push(printCardUrl);
    }
  }

  window.openDialog(
    "chrome://messenger/content/msgPrintEngine.xhtml",
    "",
    "chrome,dialog=no,all",
    selectionArray.length,
    selectionArray,
    statusFeedback,
    doPrintPreview,
    msgType
  );
}

function AbPrintCard() {
  AbPrintCardInternal(false, Ci.nsIMsgPrintEngine.MNAB_PRINT_AB_CARD);
}

function AbPrintPreviewCard() {
  AbPrintCardInternal(true, Ci.nsIMsgPrintEngine.MNAB_PRINTPREVIEW_AB_CARD);
}

function CreatePrintCardUrl(card) {
  return "data:application/xml;base64," + card.translateTo("base64xml");
}

function AbPrintAddressBookInternal(doPrintPreview, msgType) {
  let uri = getSelectedDirectoryURI();
  if (!uri) {
    return;
  }

  var statusFeedback;
  statusFeedback = Cc[
    "@mozilla.org/messenger/statusfeedback;1"
  ].createInstance();
  statusFeedback = statusFeedback.QueryInterface(Ci.nsIMsgStatusFeedback);

  /*
    turn "jsaddrbook://abook.sqlite" into
    "addbook://jsaddrbook/abook.sqlite?action=print"
   */

  var abURIArr = uri.split("://");
  var printUrl =
    "addbook://" + abURIArr[0] + "/" + abURIArr[1] + "?action=print";

  window.openDialog(
    "chrome://messenger/content/msgPrintEngine.xhtml",
    "",
    "chrome,dialog=no,all",
    1,
    [printUrl],
    statusFeedback,
    doPrintPreview,
    msgType
  );
}

function AbPrintAddressBook() {
  AbPrintAddressBookInternal(false, Ci.nsIMsgPrintEngine.MNAB_PRINT_ADDRBOOK);
}

function AbPrintPreviewAddressBook() {
  AbPrintAddressBookInternal(
    true,
    Ci.nsIMsgPrintEngine.MNAB_PRINTPREVIEW_ADDRBOOK
  );
}

/**
 * Export the currently selected addressbook.
 */
function AbExportSelection() {
  let selectedDirURI = getSelectedDirectoryURI();
  if (!selectedDirURI) {
    return;
  }

  if (selectedDirURI == kAllDirectoryRoot + "?") {
    AbExportAll();
    return;
  }

  AbExport(selectedDirURI);
}

/**
 * Export all found addressbooks, each in a separate file.
 */
function AbExportAll() {
  for (let directory of MailServices.ab.directories) {
    // Do not export LDAP ABs.
    if (!directory.URI.startsWith(kLdapUrlPrefix)) {
      AbExport(directory.URI);
    }
  }
}

/**
 * Export the specified addressbook to a file.
 *
 * @param aSelectedDirURI  The URI of the addressbook to export.
 */
function AbExport(aSelectedDirURI) {
  if (!aSelectedDirURI) {
    return;
  }

  try {
    let directory = GetDirectoryFromURI(aSelectedDirURI);
    MailServices.ab.exportAddressBook(window, directory);
  } catch (ex) {
    let message;
    switch (ex.result) {
      case Cr.NS_ERROR_FILE_ACCESS_DENIED:
        message = gAddressBookBundle.getString(
          "failedToExportMessageFileAccessDenied"
        );
        break;
      case Cr.NS_ERROR_FILE_NO_DEVICE_SPACE:
        message = gAddressBookBundle.getString(
          "failedToExportMessageNoDeviceSpace"
        );
        break;
      default:
        message = ex.message;
        break;
    }

    Services.prompt.alert(
      window,
      gAddressBookBundle.getString("failedToExportTitle"),
      message
    );
  }
}

function SetStatusText(total) {
  if (!gStatusText) {
    gStatusText = document.getElementById("statusText");
  }

  try {
    let statusText;

    let searchInput = document.getElementById("peopleSearchInput");
    if (searchInput && searchInput.value) {
      if (total == 0) {
        statusText = gAddressBookBundle.getString("noMatchFound");
      } else {
        statusText = PluralForm.get(
          total,
          gAddressBookBundle.getString("matchesFound1")
        ).replace("#1", total);
      }
    } else {
      let selectedDirectory = getSelectedDirectory();
      // The result of getSelectedDirectory may be null, like when there's a
      // mailing list just being created in a brand new address book.
      if (selectedDirectory) {
        statusText = gAddressBookBundle.getFormattedString(
          "totalContactStatus",
          [selectedDirectory.dirName, total]
        );
      } else {
        statusText = "";
      }
    }

    gStatusText.setAttribute("value", statusText);
  } catch (ex) {
    Cu.reportError("ERROR: failed to set status text: " + ex);
  }
}

function AbResultsPaneKeyPress(event) {
  if (event.keyCode == 13) {
    AbEditSelectedCard();
  }
}

function AbResultsPaneDoubleClick(card) {
  AbEditCard(card);
}

function onAdvancedAbSearch() {
  let selectedDirURI = getSelectedDirectoryURI();
  if (!selectedDirURI) {
    return;
  }

  let existingSearchWindow = Services.wm.getMostRecentWindow(
    "mailnews:absearch"
  );
  if (existingSearchWindow) {
    existingSearchWindow.focus();
  } else {
    window.openDialog(
      "chrome://messenger/content/ABSearchDialog.xhtml",
      "",
      "chrome,resizable,status,centerscreen,dialog=no",
      { directory: selectedDirURI }
    );
  }
}

function onEnterInSearchBar() {
  ClearCardViewPane();
  if (!gQueryURIFormat) {
    // Get model query from pref. We don't want the query starting with "?"
    // as we have to prefix "?and" to this format.
    gQueryURIFormat = getModelQuery("mail.addr_book.quicksearchquery.format");
  }

  let searchURI = getSelectedDirectoryURI();
  if (!searchURI) {
    return;
  }

  /*
   XXX todo, handle the case where the LDAP url
   already has a query, like
   moz-abldapdirectory://nsdirectory.netscape.com:389/ou=People,dc=netscape,dc=com?(or(Department,=,Applications))
  */
  let searchInput = document.getElementById("peopleSearchInput");
  // Use helper method to split up search query to multi-word search
  // query against multiple fields.
  if (searchInput) {
    let searchWords = getSearchTokens(searchInput.value);
    searchURI += generateQueryURI(gQueryURIFormat, searchWords);
  }

  if (searchURI == kAllDirectoryRoot) {
    searchURI += "?";
  }

  document
    .getElementById("localResultsOnlyMessage")
    .setAttribute(
      "hidden",
      !gDirectoryTreeView.hasRemoteAB || searchURI != kAllDirectoryRoot + "?"
    );

  SetAbView(searchURI);

  // XXX todo
  // this works for synchronous searches of local addressbooks,
  // but not for LDAP searches
  SelectFirstCard();
}

function SwitchPaneFocus(event) {
  var focusedElement = WhichPaneHasFocus();
  var cardViewBox = GetCardViewBox();
  var cardViewBoxEmail1 = GetCardViewBoxEmail1();
  var searchBox = document.getElementById("search-container");
  var dirTree = GetDirTree();
  var searchInput = document.getElementById("peopleSearchInput");

  if (event && event.shiftKey) {
    if (focusedElement == gAbResultsTree && searchBox) {
      searchInput.focus();
    } else if (
      (focusedElement == gAbResultsTree || focusedElement == searchBox) &&
      !IsDirPaneCollapsed()
    ) {
      dirTree.focus();
    } else if (
      focusedElement != cardViewBox &&
      !IsCardViewAndAbResultsPaneSplitterCollapsed() &&
      cardViewBoxEmail1 &&
      cardViewBoxEmail1.getAttribute("collapsed") != "true"
    ) {
      cardViewBoxEmail1.focus();
    } else {
      gAbResultsTree.focus();
    }
  } else if (focusedElement == searchBox) {
    gAbResultsTree.focus();
  } else if (
    focusedElement == gAbResultsTree &&
    !IsCardViewAndAbResultsPaneSplitterCollapsed() &&
    cardViewBoxEmail1 &&
    cardViewBoxEmail1.getAttribute("collapsed") != "true"
  ) {
    cardViewBoxEmail1.focus();
  } else if (focusedElement != dirTree && !IsDirPaneCollapsed()) {
    dirTree.focus();
  } else if (searchBox && searchInput) {
    searchInput.focus();
  } else {
    gAbResultsTree.focus();
  }
}

function WhichPaneHasFocus() {
  var cardViewBox = GetCardViewBox();
  var searchBox = document.getElementById("search-container");
  var dirTree = GetDirTree();

  var currentNode = top.document.commandDispatcher.focusedElement;
  while (currentNode) {
    if (
      currentNode == gAbResultsTree ||
      currentNode == cardViewBox ||
      currentNode == searchBox ||
      currentNode == dirTree
    ) {
      return currentNode;
    }

    currentNode = currentNode.parentNode;
  }

  return null;
}

function GetDirTree() {
  if (!gDirTree) {
    gDirTree = document.getElementById("dirTree");
  }
  return gDirTree;
}

function GetCardViewBox() {
  if (!gCardViewBox) {
    gCardViewBox = document.getElementById("CardViewBox");
  }
  return gCardViewBox;
}

function GetCardViewBoxEmail1() {
  if (!gCardViewBoxEmail1) {
    try {
      gCardViewBoxEmail1 = document.getElementById("cvEmail1");
    } catch (ex) {
      gCardViewBoxEmail1 = null;
    }
  }
  return gCardViewBoxEmail1;
}

function IsDirPaneCollapsed() {
  var dirPaneBox = GetDirTree().parentNode;
  return (
    dirPaneBox.getAttribute("collapsed") == "true" ||
    dirPaneBox.getAttribute("hidden") == "true"
  );
}

function IsCardViewAndAbResultsPaneSplitterCollapsed() {
  var cardViewInnerBox = document.getElementById("CardViewInnerBox");
  var cardViewOuterBox = document.getElementById("CardViewOuterBox");
  try {
    return (
      cardViewInnerBox.getAttribute("collapsed") == "true" ||
      cardViewOuterBox.getAttribute("collapsed") == "true"
    );
  } catch (ex) {
    return false;
  }
}

function LaunchUrl(url) {
  // Doesn't matter if this bit fails, window.location contains its own prompts
  try {
    window.location = url;
  } catch (ex) {}
}

function AbIMSelected() {
  let cards = GetSelectedAbCards();

  if (!cards) {
    Cu.reportError("ERROR: AbIMSelected: |cards| is null.");
    return;
  }

  if (cards.length != 1) {
    Cu.reportError(
      "AbIMSelected should only be called when 1" +
        " card is selected. There are " +
        cards.length +
        " cards selected."
    );
    return;
  }

  let card = cards[0];

  if (!card) {
    Cu.reportError(
      "AbIMSelected: one card was selected, but its only member was null."
    );
    return;
  }
  // We want to open a conversation with the first online username that we can
  // find. Failing that, we'll take the first offline (but still chat-able)
  // username we can find.
  //
  // First, sort the IM usernames into two groups - online contacts go into
  // the "online" group, and offline (but chat-able) contacts go into the
  // "offline" group.

  let online = [];
  let offline = [];

  for (let chatProperty of kChatProperties) {
    let chatID = card.getProperty(chatProperty, "");

    if (chatID && chatID in chatHandler.allContacts) {
      let chatContact = chatHandler.allContacts[chatID];
      if (chatContact.online) {
        online.push(chatContact);
      } else if (chatContact.canSendMessage) {
        offline.push(chatContact);
      }
    }
  }

  let selectedContact;

  if (online.length) {
    // We have contacts in the online group, take the first one.
    selectedContact = online[0];
  } else if (offline.length) {
    // Else take the first contact in the offline group.
    selectedContact = offline[0];
  }

  // If we found a contact we can chat with, open / focus the chat tab with
  // a conversation opened with that contact.
  if (selectedContact) {
    let prplConv = selectedContact.createConversation();
    let uiConv = Services.conversations.getUIConversation(prplConv);
    let win = Services.wm.getMostRecentWindow("mail:3pane");

    if (win) {
      win.focus();
      win.showChatTab();
      win.chatHandler.focusConversation(uiConv);
    } else {
      window.openDialog(
        "chrome://messenger/content/messenger.xhtml",
        "_blank",
        "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar",
        null,
        { tabType: "chat", tabParams: { convType: "focus", conv: uiConv } }
      );
    }

    return;
  }

  // Ok, if we get here, we're going the old route of trying to use AIM.
  let AIM = card.getProperty("_AimScreenName", "");
  if (AIM) {
    LaunchUrl("aim:goim?screenname=" + AIM);
    return;
  }

  // And if we got here, that means we couldn't find *any* usernames we could
  // chat with. That really shouldn't be possible, since the isEnabled for
  // cmd_chatWithCard makes checks for this sort of thing, but we'll throw
  // an exception for good measure.
  throw new Error("Couldn't find any usernames to chat with for this card.");
}

function getMailToolbox() {
  return document.getElementById("ab-toolbox");
}

var kOSXDirectoryURI = "moz-abosxdirectory:///";
var kOSXPrefBase = "ldap_2.servers.osx";

function AbOSXAddressBookExists() {
  // I hate doing it this way - until we redo how we manage address books
  // I can't think of a better way though.

  // See if the pref exists, if so, then we need to delete the address book
  var uriPresent =
    Services.prefs.getStringPref(kOSXPrefBase + ".uri", null) ==
    kOSXDirectoryURI;
  var position = Services.prefs.getIntPref(kOSXPrefBase + ".position", 1);

  // Address book exists if the uri is correct and the position is not zero.
  return uriPresent && position != 0;
}

function AbShowHideOSXAddressBook() {
  if (AbOSXAddressBookExists()) {
    MailServices.ab.deleteAddressBook(kOSXDirectoryURI);
  } else {
    MailServices.ab.newAddressBook(
      gAddressBookBundle.getString(kOSXPrefBase + ".description"),
      kOSXDirectoryURI,
      3,
      kOSXPrefBase
    );
  }
}

var abResultsController = {
  commands: {
    cmd_chatWithCard: {
      isEnabled() {
        let selected = GetSelectedAbCards();

        if (selected.length != 1) {
          return false;
        }

        let selectedCard = selected[0];
        if (!selectedCard) {
          return false;
        }

        let isIMContact = kChatProperties.some(function(aProperty) {
          let contactName = selectedCard.getProperty(aProperty, "");

          if (!contactName) {
            return false;
          }

          return (
            contactName in chatHandler.allContacts &&
            chatHandler.allContacts[contactName].canSendMessage
          );
        });

        let hasAIM = selectedCard.getProperty("_AimScreenName", "");

        return isIMContact || hasAIM;
      },

      doCommand() {
        AbIMSelected();
      },
    },
  },

  supportsCommand(aCommand) {
    return aCommand in this.commands;
  },

  isCommandEnabled(aCommand) {
    if (!this.supportsCommand(aCommand)) {
      return false;
    }

    return this.commands[aCommand].isEnabled();
  },

  doCommand(aCommand) {
    if (!this.supportsCommand(aCommand)) {
      return;
    }
    let cmd = this.commands[aCommand];
    if (!cmd.isEnabled()) {
      return;
    }
    cmd.doCommand();
  },

  onEvent(aEvent) {},
};
