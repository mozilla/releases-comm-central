/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../mailnews/addrbook/content/abResultsPane.js */
/* import-globals-from ../../../../mailnews/base/content/dateFormat.js */
/* import-globals-from ../../../../mailnews/search/content/searchTerm.js */
/* import-globals-from ../../../base/content/globalOverlay.js */
/* import-globals-from abCommon.js */

var { encodeABTermValue } = ChromeUtils.import(
  "resource:///modules/ABQueryUtils.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { PluralForm } = ChromeUtils.importESModule(
  "resource:///modules/PluralForm.sys.mjs"
);

var searchSessionContractID = "@mozilla.org/messenger/searchSession;1";
var gSearchSession;

var nsMsgSearchScope = Ci.nsMsgSearchScope;
var nsMsgSearchOp = Ci.nsMsgSearchOp;
var nsMsgSearchAttrib = Ci.nsMsgSearchAttrib;

var gStatusText;
var gSearchBundle;
var gAddressBookBundle;

var gSearchStopButton;
var gPropertiesCmd;
var gComposeCmd;
var gDeleteCmd;
var gSearchPhoneticName = "false";

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

  // initialize a flag for phonetic name search
  gSearchPhoneticName = Services.prefs.getComplexValue(
    "mail.addr_book.show_phonetic_fields",
    Ci.nsIPrefLocalizedString
  ).data;

  if (window.arguments && window.arguments[0]) {
    SelectDirectory(window.arguments[0].directory);
  } else {
    SelectDirectory(
      document.getElementById("abPopup-menupopup").firstElementChild.value
    );
  }

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
      return nsMsgSearchScope.LDAPAnd;
    }
    return nsMsgSearchScope.LDAP;
  }

  if (booleanAnd) {
    return nsMsgSearchScope.LocalABAnd;
  }
  return nsMsgSearchScope.LocalAB;
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
      case nsMsgSearchAttrib.Name:
        if (gSearchPhoneticName != "true") {
          attrs = [
            "DisplayName",
            "FirstName",
            "LastName",
            "NickName",
            "_AimScreenName",
          ];
        } else {
          attrs = [
            "DisplayName",
            "FirstName",
            "LastName",
            "NickName",
            "_AimScreenName",
            "PhoneticFirstName",
            "PhoneticLastName",
          ];
        }
        break;
      case nsMsgSearchAttrib.DisplayName:
        attrs = ["DisplayName"];
        break;
      case nsMsgSearchAttrib.Email:
        attrs = ["PrimaryEmail"];
        break;
      case nsMsgSearchAttrib.PhoneNumber:
        attrs = [
          "HomePhone",
          "WorkPhone",
          "FaxNumber",
          "PagerNumber",
          "CellularNumber",
        ];
        break;
      case nsMsgSearchAttrib.Organization:
        attrs = ["Company"];
        break;
      case nsMsgSearchAttrib.Department:
        attrs = ["Department"];
        break;
      case nsMsgSearchAttrib.City:
        attrs = ["WorkCity"];
        break;
      case nsMsgSearchAttrib.Street:
        attrs = ["WorkAddress"];
        break;
      case nsMsgSearchAttrib.Nickname:
        attrs = ["NickName"];
        break;
      case nsMsgSearchAttrib.WorkPhone:
        attrs = ["WorkPhone"];
        break;
      case nsMsgSearchAttrib.HomePhone:
        attrs = ["HomePhone"];
        break;
      case nsMsgSearchAttrib.Fax:
        attrs = ["FaxNumber"];
        break;
      case nsMsgSearchAttrib.Pager:
        attrs = ["PagerNumber"];
        break;
      case nsMsgSearchAttrib.Mobile:
        attrs = ["CellularNumber"];
        break;
      case nsMsgSearchAttrib.Title:
        attrs = ["JobTitle"];
        break;
      case nsMsgSearchAttrib.AdditionalEmail:
        attrs = ["SecondEmail"];
        break;
      case nsMsgSearchAttrib.ScreenName:
        attrs = ["_AimScreenName"];
        break;
      default:
        dump("XXX " + searchTerm.attrib + " not a supported search attr!\n");
        attrs = ["DisplayName"];
        break;
    }

    var opStr;

    switch (searchTerm.op) {
      case nsMsgSearchOp.Contains:
        opStr = "c";
        break;
      case nsMsgSearchOp.DoesntContain:
        opStr = "!c";
        break;
      case nsMsgSearchOp.Is:
        opStr = "=";
        break;
      case nsMsgSearchOp.Isnt:
        opStr = "!=";
        break;
      case nsMsgSearchOp.BeginsWith:
        opStr = "bw";
        break;
      case nsMsgSearchOp.EndsWith:
        opStr = "ew";
        break;
      case nsMsgSearchOp.SoundsLike:
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

function GetAbViewListener() {
  return gSearchAbViewListener;
}

function onProperties() {
  if (!gPropertiesCmd.hasAttribute("disabled")) {
    window.opener.toAddressBook({ action: "display", card: GetSelectedCard() });
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

function AbResultsPaneDoubleClick(card) {
  // Kept for abResultsPane.js.
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
