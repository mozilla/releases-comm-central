/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../mailnews/addrbook/content/abResultsPane.js */
/* import-globals-from ../../../../mailnews/base/content/dateFormat.js */
/* import-globals-from ../../../../mailnews/search/content/searchTerm.js */
/* import-globals-from ../../../base/content/globalOverlay.js */
/* import-globals-from abCommon.js */

var { encodeABTermValue } = ChromeUtils.importESModule(
  "resource:///modules/ABQueryUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { PluralForm } = ChromeUtils.importESModule(
  "resource:///modules/PluralForm.sys.mjs"
);
var { UIDensity } = ChromeUtils.importESModule(
  "resource:///modules/UIDensity.sys.mjs"
);
var { UIFontSize } = ChromeUtils.importESModule(
  "resource:///modules/UIFontSize.sys.mjs"
);

window.addEventListener("load", searchOnLoad);
window.addEventListener("unload", searchOnUnload);
window.addEventListener("close", onSearchStop);

var searchSessionContractID = "@mozilla.org/messenger/searchSession;1";
var gSearchSession;

var gStatusText;
var gSearchBundle;
var gAddressBookBundle;

var gSearchStopButton;
var gPropertiesCmd;
var gComposeCmd;
var gDeleteCmd;

var gSearchAbViewListener = {
  onSelectionChanged() {
    UpdateCardView();
  },
  onCountChanged(aTotal) {
    let statusText;
    if (aTotal == 0) {
      statusText = gAddressBookBundle.GetStringFromName("noMatchFound");
    } else {
      statusText = PluralForm.get(
        aTotal,
        gAddressBookBundle.GetStringFromName("matchesFound1")
      ).replace("#1", aTotal);
    }

    gStatusText.setAttribute("value", statusText);
  },
};

function searchOnLoad() {
  UIDensity.registerWindow(window);
  UIFontSize.registerWindow(window);

  initializeSearchWidgets();
  initializeSearchWindowWidgets();

  gSearchBundle = Services.strings.createBundle(
    "chrome://messenger/locale/search.properties"
  );
  gSearchStopButton.setAttribute(
    "label",
    gSearchBundle.GetStringFromName("labelForSearchButton")
  );
  gSearchStopButton.setAttribute(
    "accesskey",
    gSearchBundle.GetStringFromName("labelForSearchButton.accesskey")
  );
  gAddressBookBundle = Services.strings.createBundle(
    "chrome://messenger/locale/addressbook/addressBook.properties"
  );
  gSearchSession = Cc[searchSessionContractID].createInstance(
    Ci.nsIMsgSearchSession
  );

  if (window.arguments && window.arguments[0]) {
    SelectDirectory(window.arguments[0].directory);
  } else {
    SelectDirectory(
      document.getElementById("abPopup-menupopup").firstElementChild.value
    );
  }

  gAbResultsTree = document.getElementById("abResultsTree");
  gAbResultsTree.setAttribute("rows", "auto-tree-view-table-row");
  gAbResultsTree.defaultColumns = [
    {
      id: "GeneratedName",
      l10n: {
        header: "about-addressbook-column-header-generatedname2",
        menuitem: "about-addressbook-column-label-generatedname2",
        cell: "about-addressbook-cell-generatedname2",
      },
      picker: false,
    },
    {
      id: "EmailAddresses",
      l10n: {
        header: "about-addressbook-column-header-emailaddresses2",
        menuitem: "about-addressbook-column-label-emailaddresses2",
        cell: "about-addressbook-cell-emailaddresses2",
      },
    },
    {
      id: "NickName",
      l10n: {
        header: "about-addressbook-column-header-nickname2",
        menuitem: "about-addressbook-column-label-nickname2",
        cell: "about-addressbook-cell-nickname2",
      },
      hidden: true,
    },
    {
      id: "PhoneNumbers",
      l10n: {
        header: "about-addressbook-column-header-phonenumbers2",
        menuitem: "about-addressbook-column-label-phonenumbers2",
        cell: "about-addressbook-cell-phonenumbers2",
      },
    },
    {
      id: "Addresses",
      l10n: {
        header: "about-addressbook-column-header-addresses2",
        menuitem: "about-addressbook-column-label-addresses2",
        cell: "about-addressbook-cell-addresses2",
      },
    },
    {
      id: "Title",
      l10n: {
        header: "about-addressbook-column-header-title2",
        menuitem: "about-addressbook-column-label-title2",
        cell: "about-addressbook-cell-title2",
      },
      hidden: true,
    },
    {
      id: "Department",
      l10n: {
        header: "about-addressbook-column-header-department2",
        menuitem: "about-addressbook-column-label-department2",
        cell: "about-addressbook-cell-department2",
      },
      hidden: true,
    },
    {
      id: "Organization",
      l10n: {
        header: "about-addressbook-column-header-organization2",
        menuitem: "about-addressbook-column-label-organization2",
        cell: "about-addressbook-cell-organization2",
      },
      hidden: true,
    },
    {
      id: "addrbook",
      l10n: {
        header: "about-addressbook-column-header-addrbook2",
        menuitem: "about-addressbook-column-label-addrbook2",
        cell: "about-addressbook-cell-addrbook2",
      },
    },
  ];
  gAbResultsTree.addEventListener("rowcountchange", () =>
    gSearchAbViewListener.onCountChanged(gAbResultsTree.view.rowCount)
  );
  gAbResultsTree.addEventListener("select", () =>
    gSearchAbViewListener.onSelectionChanged()
  );
  gAbResultsTree.addEventListener("viewchange", () =>
    gSearchAbViewListener.onCountChanged(gAbResultsTree.view?.rowCount)
  );

  onMore(null);
}

function searchOnUnload() {
  CloseAbView();
}

function disableCommands() {
  gPropertiesCmd.setAttribute("disabled", "true");
  gComposeCmd.setAttribute("disabled", "true");
  gDeleteCmd.setAttribute("disabled", "true");
}

function initializeSearchWindowWidgets() {
  gSearchStopButton = document.getElementById("search-button");
  gPropertiesCmd = document.getElementById("cmd_properties");
  gComposeCmd = document.getElementById("cmd_compose");
  gDeleteCmd = document.getElementById("cmd_deleteCard");
  gStatusText = document.getElementById("statusText");
  disableCommands();
  // matchAll doesn't make sense for address book search
  hideMatchAllItem();
}

function onSearchStop() {}

function onAbSearchReset(event) {
  disableCommands();
  CloseAbView();

  onReset(event);
  gStatusText.setAttribute("value", "");
}

function SelectDirectory(aURI) {
  // set popup with address book names
  const abPopup = document.getElementById("abPopup");
  if (abPopup) {
    if (aURI) {
      abPopup.value = aURI;
    } else {
      abPopup.selectedIndex = 0;
    }
  }

  setSearchScope(GetScopeForDirectoryURI(aURI));
}

function GetScopeForDirectoryURI(aURI) {
  let directory;
  if (aURI && aURI != "moz-abdirectory://?") {
    directory = MailServices.ab.getDirectory(aURI);
  }
  const booleanAnd = gSearchBooleanRadiogroup.selectedItem.value == "and";

  if (directory?.isRemote) {
    if (booleanAnd) {
      return Ci.nsMsgSearchScope.LDAPAnd;
    }
    return Ci.nsMsgSearchScope.LDAP;
  }

  if (booleanAnd) {
    return Ci.nsMsgSearchScope.LocalABAnd;
  }
  return Ci.nsMsgSearchScope.LocalAB;
}

function onEnterInSearchTerm() {
  // on enter
  // if not searching, start the search
  // if searching, stop and then start again
  if (
    gSearchStopButton.getAttribute("label") ==
    gSearchBundle.GetStringFromName("labelForSearchButton")
  ) {
    onSearch();
  } else {
    onSearchStop();
    onSearch();
  }
}

function onSearch() {
  gStatusText.setAttribute("value", "");
  disableCommands();

  gSearchSession.clearScopes();

  var currentAbURI = document.getElementById("abPopup").getAttribute("value");

  gSearchSession.addDirectoryScopeTerm(GetScopeForDirectoryURI(currentAbURI));
  gSearchSession.searchTerms = saveSearchTerms(
    gSearchSession.searchTerms,
    gSearchSession
  );

  let searchUri = "?(";
  for (let i = 0; i < gSearchSession.searchTerms.length; i++) {
    const searchTerm = gSearchSession.searchTerms[i];
    if (!searchTerm.value.str) {
      continue;
    }
    // get the "and" / "or" value from the first term
    if (i == 0) {
      if (searchTerm.booleanAnd) {
        searchUri += "and";
      } else {
        searchUri += "or";
      }
    }

    var attrs;

    switch (searchTerm.attrib) {
      case Ci.nsMsgSearchAttrib.Name:
        attrs = [
          "DisplayName",
          "FirstName",
          "LastName",
          "NickName",
          "_AimScreenName",
        ];
        break;
      case Ci.nsMsgSearchAttrib.DisplayName:
        attrs = ["DisplayName"];
        break;
      case Ci.nsMsgSearchAttrib.Email:
        attrs = ["PrimaryEmail"];
        break;
      case Ci.nsMsgSearchAttrib.PhoneNumber:
        attrs = [
          "HomePhone",
          "WorkPhone",
          "FaxNumber",
          "PagerNumber",
          "CellularNumber",
        ];
        break;
      case Ci.nsMsgSearchAttrib.Organization:
        attrs = ["Company"];
        break;
      case Ci.nsMsgSearchAttrib.Department:
        attrs = ["Department"];
        break;
      case Ci.nsMsgSearchAttrib.City:
        attrs = ["WorkCity"];
        break;
      case Ci.nsMsgSearchAttrib.Street:
        attrs = ["WorkAddress"];
        break;
      case Ci.nsMsgSearchAttrib.Nickname:
        attrs = ["NickName"];
        break;
      case Ci.nsMsgSearchAttrib.WorkPhone:
        attrs = ["WorkPhone"];
        break;
      case Ci.nsMsgSearchAttrib.HomePhone:
        attrs = ["HomePhone"];
        break;
      case Ci.nsMsgSearchAttrib.Fax:
        attrs = ["FaxNumber"];
        break;
      case Ci.nsMsgSearchAttrib.Pager:
        attrs = ["PagerNumber"];
        break;
      case Ci.nsMsgSearchAttrib.Mobile:
        attrs = ["CellularNumber"];
        break;
      case Ci.nsMsgSearchAttrib.Title:
        attrs = ["JobTitle"];
        break;
      case Ci.nsMsgSearchAttrib.AdditionalEmail:
        attrs = ["SecondEmail"];
        break;
      case Ci.nsMsgSearchAttrib.ScreenName:
        attrs = ["_AimScreenName"];
        break;
      default:
        dump("XXX " + searchTerm.attrib + " not a supported search attr!\n");
        attrs = ["DisplayName"];
        break;
    }

    var opStr;

    switch (searchTerm.op) {
      case Ci.nsMsgSearchOp.Contains:
        opStr = "c";
        break;
      case Ci.nsMsgSearchOp.DoesntContain:
        opStr = "!c";
        break;
      case Ci.nsMsgSearchOp.Is:
        opStr = "=";
        break;
      case Ci.nsMsgSearchOp.Isnt:
        opStr = "!=";
        break;
      case Ci.nsMsgSearchOp.BeginsWith:
        opStr = "bw";
        break;
      case Ci.nsMsgSearchOp.EndsWith:
        opStr = "ew";
        break;
      case Ci.nsMsgSearchOp.SoundsLike:
        opStr = "~=";
        break;
      default:
        opStr = "c";
        break;
    }

    // currently, we can't do "and" and "or" searches at the same time
    // (it's either all "and"s or all "or"s)
    var max_attrs = attrs.length;

    for (var j = 0; j < max_attrs; j++) {
      // append the term(s) to the searchUri
      searchUri +=
        "(" +
        attrs[j] +
        "," +
        opStr +
        "," +
        encodeABTermValue(searchTerm.value.str) +
        ")";
    }
  }

  searchUri += ")";
  if (searchUri == "?()") {
    // Empty search.
    searchUri = "";
  }
  SetAbView(currentAbURI, searchUri, "");
}

// used to toggle functionality for Search/Stop button.
function onSearchButton(event) {
  if (
    event.target.label ==
    gSearchBundle.GetStringFromName("labelForSearchButton")
  ) {
    onSearch();
  } else {
    onSearchStop();
  }
}

function onProperties() {
  if (!gPropertiesCmd.hasAttribute("disabled")) {
    window.opener.toAddressBook(["cmd_displayContact", GetSelectedCard()]);
  }
}

function onCompose() {
  if (!gComposeCmd.hasAttribute("disabled")) {
    AbNewMessage();
  }
}

function onDelete() {
  if (!gDeleteCmd.hasAttribute("disabled")) {
    AbDelete();
  }
}

function AbResultsPaneKeyPress(event) {
  switch (event.keyCode) {
    case KeyEvent.DOM_VK_RETURN:
      onProperties();
      break;
    case KeyEvent.DOM_VK_DELETE:
    case KeyEvent.DOM_VK_BACK_SPACE:
      onDelete();
  }
}

function UpdateCardView() {
  disableCommands();
  const numSelected = GetNumSelectedCards();

  if (!numSelected) {
    return;
  }

  if (MailServices.accounts.allIdentities.length > 0) {
    gComposeCmd.removeAttribute("disabled");
  }

  gDeleteCmd.removeAttribute("disabled");
  if (numSelected == 1) {
    gPropertiesCmd.removeAttribute("disabled");
  }
}
