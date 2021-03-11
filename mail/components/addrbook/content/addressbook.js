/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../../toolkit/content/globalOverlay.js */
/* import-globals-from ../../../../mailnews/addrbook/content/abResultsPane.js */
/* import-globals-from ../../../base/content/mailCore.js */
/* import-globals-from ../../../base/content/messenger-customization.js */
/* import-globals-from ../../../base/content/toolbarIconColor.js */
/* import-globals-from abCardView.js */
/* import-globals-from abCommon.js */
/* import-globals-from abTrees.js */

// Ensure the activity modules are loaded for this window.
ChromeUtils.import("resource:///modules/activity/activityModules.jsm");
var { getSearchTokens, getModelQuery, generateQueryURI } = ChromeUtils.import(
  "resource:///modules/ABQueryUtils.jsm"
);
var {
  exportDirectoryToLDIF,
  exportDirectoryToDelimitedText,
  exportDirectoryToVCard,
} = ChromeUtils.import("resource:///modules/AddrBookUtils.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { PluralForm } = ChromeUtils.import(
  "resource://gre/modules/PluralForm.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  MailE10SUtils: "resource:///modules/MailE10SUtils.jsm",
});

// TODO: hide print ui on search
XPCOMUtils.defineLazyScriptGetter(
  this,
  "PrintUtils",
  "chrome://messenger/content/printUtils.js"
);

var kPrefMailAddrBookLastNameFirst = "mail.addr_book.lastnamefirst";
var kPersistCollapseMapStorage = "directoryTree.json";

var gSearchTimer = null;
var gStatusText = null;
var gQueryURIFormat = null;
var gCardViewBox;
var gCardViewBoxEmail1;

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

// These chat properties are the ones that our IM component supports. If a
// contact has a value for one of these properties, we can communicate with
// that contact (assuming that the user has added that value to their list
// of IM contacts).
var kChatProperties = ["_GoogleTalk", "_JabberId"];

window.addEventListener("load", event => {
  OnLoadAddressBook();
});
window.addEventListener("unload", event => {
  OnUnloadAddressBook();
});

async function OnUnloadAddressBook() {
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

  // Shutdown the tree view - this will also save the open/collapsed
  // state of the tree view to a JSON file.
  await gDirectoryTreeView.shutdown(kPersistCollapseMapStorage);

  MailServices.mailSession.RemoveMsgWindow(msgWindow);

  ToolbarIconColor.uninit();

  CloseAbView();
}

var gAddressBookAbViewListener = {
  onSelectionChanged() {
    ResultsPaneSelectionChanged();
    gAbResultsTree.ensureRowIsVisible(
      gAbResultsTree.view.selection.currentIndex
    );
  },
  onCountChanged(total) {
    // For some unknown reason the tree needs this before the changes show up.
    // The view is already gAbView but setting it again works.
    gAbResultsTree.view = gAbView;
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
  // Needed for printing. If there is no window.opener, printing will be
  // disabled.
  if (window.opener) {
    window.browserDOMWindow = window.opener.browserDOMWindow;
  }

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

  delayedOnLoadAddressBook();
}

async function delayedOnLoadAddressBook() {
  InitCommonJS();

  GetCurrentPrefs();

  // FIX ME - later we will be able to use onload from the overlay
  OnLoadCardView();

  // Initialize the Address Book tree view
  await gDirectoryTreeView.init(gDirTree, kPersistCollapseMapStorage);

  selectStartupViewDirectory();
  gAbResultsTree.focus();

  // if the pref is locked disable the menuitem New->LDAP directory
  if (Services.prefs.prefIsLocked("ldap_2.disable_button_add")) {
    document.getElementById("addLDAP").setAttribute("disabled", "true");
  }

  document
    .getElementById("cmd_newMessage")
    .setAttribute("disabled", MailServices.accounts.allIdentities.length == 0);

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

function onFileMenuInit() {
  let osxMenuItem = document.getElementById("menu_osxAddressBook");
  if (osxMenuItem) {
    osxMenuItem.setAttribute("checked", AbOSXAddressBookExists());
  }
}

function CommandUpdate_AddressBook() {
  goUpdateCommand("cmd_delete");
  goUpdateCommand("button_delete");
  goUpdateCommand("cmd_printcard");
  goUpdateCommand("cmd_properties");
  goUpdateCommand("cmd_abToggleStartupDir");
  goUpdateCommand("cmd_newlist");
  goUpdateCommand("cmd_newCard");
  goUpdateCommand("cmd_chatWithCard");
}

function ResultsPaneSelectionChanged() {
  UpdateCardView();

  let contextSingle = document.getElementById(
    "abResultsTreeContext-newmessage"
  );
  if (!contextSingle) {
    // Give up, this isn't the main address book window.
    return;
  }
  let contextMultiple = document.getElementById(
    "abResultsTreeContext-newmessageMultiple"
  );
  let menuSingle = document.getElementById("menu_newMessage");
  let menuMultiple = document.getElementById("menu_newMessageMultiple");
  let toolbarButton = document.getElementById("button-newmessage");

  let selectedCards = GetSelectedAbCards();
  if (selectedCards.length == 1) {
    let first = selectedCards[0].primaryEmail;
    let second = selectedCards[0].getProperty("SecondEmail", "");
    if (first && second) {
      // Set the menus and toolbar button to display a list of addresses.
      contextSingle.hidden = true;
      contextMultiple.hidden = false;
      menuSingle.hidden = true;
      menuMultiple.hidden = false;
      toolbarButton.setAttribute("type", "menu");

      while (contextMultiple.menupopup.lastChild) {
        contextMultiple.menupopup.lastChild.remove();
      }
      while (menuMultiple.menupopup.lastChild) {
        menuMultiple.menupopup.lastChild.remove();
      }
      while (toolbarButton.menupopup.lastChild) {
        toolbarButton.menupopup.lastChild.remove();
      }

      for (let address of [first, second]) {
        let callAbNewMessage = function(event) {
          AbNewMessage(
            MailServices.headerParser.makeMimeAddress(
              selectedCards[0].displayName,
              address
            )
          );
          event.stopPropagation();
        };

        let menuitem = contextMultiple.menupopup.appendChild(
          document.createXULElement("menuitem")
        );
        menuitem.label = address;
        menuitem.addEventListener("command", callAbNewMessage);
        menuMultiple.menupopup
          .appendChild(menuitem.cloneNode(false))
          .addEventListener("command", callAbNewMessage);
        toolbarButton.menupopup
          .appendChild(menuitem.cloneNode(false))
          .addEventListener("command", callAbNewMessage);
      }
      return;
    }
  }

  // Set the menus and toolbar button to start a new message.
  contextSingle.hidden = false;
  contextMultiple.hidden = true;
  menuSingle.hidden = false;
  menuMultiple.hidden = true;
  toolbarButton.removeAttribute("type");
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

function AbPrintCard() {
  var selectedItems = GetSelectedAbCards();
  var numSelected = selectedItems.length;

  if (!numSelected) {
    return;
  }

  let printXML = buildXML(
    gAddressBookBundle.getString("addressBook"),
    selectedItems
  );

  let browser = document.getElementById("printContent");
  let listener = {
    onStateChange(webProgress, request, stateFlags, status) {
      if (stateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
        PrintUtils.startPrintWindow(browser.browsingContext, {});
        browser.webProgress.removeProgressListener(listener);
      }
    },
    QueryInterface: ChromeUtils.generateQI([
      "nsIWebProgressListener",
      "nsISupportsWeakReference",
    ]),
  };
  browser.webProgress.addProgressListener(
    listener,
    Ci.nsIWebProgress.NOTIFY_STATE_ALL
  );

  MailE10SUtils.loadURI(
    browser,
    URL.createObjectURL(new File([printXML], "text/xml"))
  );
}

function buildDirectoryXML(directory) {
  let title = directory
    ? directory.dirName
    : gAddressBookBundle.getString("addressBook");

  let cards;
  if (directory) {
    cards = directory.childCards;
  } else {
    cards = [];
    for (let directory of MailServices.ab.directories) {
      cards = cards.concat(directory.childCards);
    }
  }

  return buildXML(title, cards);
}

function buildXML(title, cards) {
  let output = `<?xml version="1.0"?>
<?xml-stylesheet type="text/css" href="chrome://messagebody/content/addressbook/print.css"?>
<directory>
  <title xmlns="http://www.w3.org/1999/xhtml">${title}</title>\n`;

  let collator = new Intl.Collator(undefined, { numeric: true });
  let nameFormat = Services.prefs.getIntPref("mail.addr_book.lastnamefirst", 0);

  cards.sort((a, b) => {
    let aName = a.generateName(nameFormat);
    let bName = b.generateName(nameFormat);
    return collator.compare(aName, bName);
  });

  for (let card of cards) {
    if (card.isMailList) {
      continue;
    }

    let xml = card.translateTo("xml");
    output += `<separator/>\n${xml}\n<separator/>\n`;
  }

  output += "</directory>\n";
  return output;
}

function AbPrintAddressBook() {
  // Silently fail when we don't have an opener (browserDOMWindow is null).
  if (!window.browserDOMWindow) {
    return;
  }
  let printXML;

  let uri = getSelectedDirectoryURI();
  if (!uri || uri == "moz-abdirectory://?") {
    printXML = buildDirectoryXML();
  } else {
    printXML = buildDirectoryXML(getSelectedDirectory());
  }

  let browser = document.getElementById("printContent");
  let listener = {
    onStateChange(webProgress, request, stateFlags, status) {
      if (stateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
        PrintUtils.startPrintWindow(browser.browsingContext, {});
        browser.webProgress.removeProgressListener(listener);
      }
    },
    QueryInterface: ChromeUtils.generateQI([
      "nsIWebProgressListener",
      "nsISupportsWeakReference",
    ]),
  };
  browser.webProgress.addProgressListener(
    listener,
    Ci.nsIWebProgress.NOTIFY_STATE_ALL
  );

  MailE10SUtils.loadURI(
    browser,
    URL.createObjectURL(new File([printXML], "text/xml"))
  );
}

/**
 * Open the import UI, and if a new directory is created, select it.
 */
function AbImport() {
  let createdDirectory;
  let observer = function(subject) {
    // It might be possible for more than one directory to be imported, select
    // the first one.
    if (!createdDirectory) {
      createdDirectory = subject.QueryInterface(Ci.nsIAbDirectory);
    }
  };

  Services.obs.addObserver(observer, "addrbook-directory-created");
  toImport();
  Services.obs.removeObserver(observer, "addrbook-directory-created");

  // Select the directory after the import UI closes, so the user sees the change.
  if (createdDirectory) {
    gDirectoryTreeView.selection.select(
      gDirectoryTreeView.getIndexForUID(createdDirectory.UID)
    );
  }
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

  let systemCharset = "utf-8";
  if (AppConstants.platform == "win") {
    // Some Windows applications (notably Outlook) still don't understand
    // UTF-8 encoding when importing address books and instead use the current
    // operating system encoding. We can get that encoding from the registry.
    let registryKey = Cc["@mozilla.org/windows-registry-key;1"].createInstance(
      Ci.nsIWindowsRegKey
    );
    registryKey.open(
      Ci.nsIWindowsRegKey.ROOT_KEY_LOCAL_MACHINE,
      "SYSTEM\\CurrentControlSet\\Control\\Nls\\CodePage",
      Ci.nsIWindowsRegKey.ACCESS_READ
    );
    let acpValue = registryKey.readStringValue("ACP");

    // This data converts the registry key value into encodings that
    // nsIConverterOutputStream understands. It is from
    // https://github.com/hsivonen/encoding_rs/blob/c3eb642cdf3f17003b8dac95c8fff478568e46da/generate-encoding-data.py#L188
    systemCharset =
      {
        866: "IBM866",
        874: "windows-874",
        932: "Shift_JIS",
        936: "GBK",
        949: "EUC-KR",
        950: "Big5",
        1200: "UTF-16LE",
        1201: "UTF-16BE",
        1250: "windows-1250",
        1251: "windows-1251",
        1252: "windows-1252",
        1253: "windows-1253",
        1254: "windows-1254",
        1255: "windows-1255",
        1256: "windows-1256",
        1257: "windows-1257",
        1258: "windows-1258",
        10000: "macintosh",
        10017: "x-mac-cyrillic",
        20866: "KOI8-R",
        20932: "EUC-JP",
        21866: "KOI8-U",
        28592: "ISO-8859-2",
        28593: "ISO-8859-3",
        28594: "ISO-8859-4",
        28595: "ISO-8859-5",
        28596: "ISO-8859-6",
        28597: "ISO-8859-7",
        28598: "ISO-8859-8",
        28600: "ISO-8859-10",
        28603: "ISO-8859-13",
        28604: "ISO-8859-14",
        28605: "ISO-8859-15",
        28606: "ISO-8859-16",
        38598: "ISO-8859-8-I",
        50221: "ISO-2022-JP",
        54936: "gb18030",
      }[acpValue] || systemCharset;
  }

  let directory = GetDirectoryFromURI(aSelectedDirURI);
  let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(
    Ci.nsIFilePicker
  );
  let bundle = Services.strings.createBundle(
    "chrome://messenger/locale/addressbook/addressBook.properties"
  );

  let title = bundle.formatStringFromName("ExportAddressBookNameTitle", [
    directory.dirName,
  ]);
  filePicker.init(window, title, Ci.nsIFilePicker.modeSave);
  filePicker.defaultString = directory.dirName;

  let filterString;
  // Since the list of file picker filters isn't fixed, keep track of which
  // ones are added, so we can use them in the switch block below.
  let activeFilters = [];

  // CSV
  if (systemCharset != "utf-8") {
    filterString = bundle.GetStringFromName("CSVFilesSysCharset");
    filePicker.appendFilter(filterString, "*.csv");
    activeFilters.push("CSVFilesSysCharset");
  }
  filterString = bundle.GetStringFromName("CSVFilesUTF8");
  filePicker.appendFilter(filterString, "*.csv");
  activeFilters.push("CSVFilesUTF8");

  // Tab separated
  if (systemCharset != "utf-8") {
    filterString = bundle.GetStringFromName("TABFilesSysCharset");
    filePicker.appendFilter(filterString, "*.tab; *.txt");
    activeFilters.push("TABFilesSysCharset");
  }
  filterString = bundle.GetStringFromName("TABFilesUTF8");
  filePicker.appendFilter(filterString, "*.tab; *.txt");
  activeFilters.push("TABFilesUTF8");

  // vCard
  filterString = bundle.GetStringFromName("VCFFiles");
  filePicker.appendFilter(filterString, "*.vcf");
  activeFilters.push("VCFFiles");

  // LDIF
  filterString = bundle.GetStringFromName("LDIFFiles");
  filePicker.appendFilter(filterString, "*.ldi; *.ldif");
  activeFilters.push("LDIFFiles");

  filePicker.open(rv => {
    if (
      rv == Ci.nsIFilePicker.returnCancel ||
      !filePicker.file ||
      !filePicker.file.path
    ) {
      return;
    }

    if (rv == Ci.nsIFilePicker.returnReplace) {
      if (filePicker.file.isFile()) {
        filePicker.file.remove(false);
      }
    }

    let exportFile = filePicker.file.clone();
    let leafName = exportFile.leafName;
    let output = "";
    let charset = "utf-8";

    switch (activeFilters[filePicker.filterIndex]) {
      case "CSVFilesSysCharset":
        charset = systemCharset;
      // Falls through.
      case "CSVFilesUTF8":
        if (!leafName.endsWith(".csv")) {
          exportFile.leafName += ".csv";
        }
        output = exportDirectoryToDelimitedText(directory, ",");
        break;
      case "TABFilesSysCharset":
        charset = systemCharset;
      // Falls through.
      case "TABFilesUTF8":
        if (!leafName.endsWith(".txt") && !leafName.endsWith(".tab")) {
          exportFile.leafName += ".txt";
        }
        output = exportDirectoryToDelimitedText(directory, "\t");
        break;
      case "VCFFiles":
        if (!leafName.endsWith(".vcf")) {
          exportFile.leafName += ".vcf";
        }
        output = exportDirectoryToVCard(directory);
        break;
      case "LDIFFiles":
        if (!leafName.endsWith(".ldi") && !leafName.endsWith(".ldif")) {
          exportFile.leafName += ".ldif";
        }
        output = exportDirectoryToLDIF(directory);
        break;
    }

    let outputFileStream = Cc[
      "@mozilla.org/network/file-output-stream;1"
    ].createInstance(Ci.nsIFileOutputStream);
    outputFileStream.init(exportFile, -1, -1, 0);
    let outputStream = Cc[
      "@mozilla.org/intl/converter-output-stream;1"
    ].createInstance(Ci.nsIConverterOutputStream);
    outputStream.init(outputFileStream, charset);
    outputStream.writeString(output);
    outputStream.close();
  });
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
      "chrome://messenger/content/addressbook/abSearchDialog.xhtml",
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
  let searchQuery;
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
    searchQuery = generateQueryURI(gQueryURIFormat, searchWords);
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

  SetAbView(searchURI, searchQuery, searchInput ? searchInput.value : "");

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

  var currentNode = top.document.activeElement;
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
  return dirPaneBox.getAttribute("collapsed") == "true" || dirPaneBox.hidden;
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
var MAPI_DIRECTORY_TYPE = 3; // From AddrBookManager.jsm.

function AbOSXAddressBookExists() {
  return (
    Services.prefs.getIntPref(kOSXPrefBase + ".dirType", 0) ==
    MAPI_DIRECTORY_TYPE
  );
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
