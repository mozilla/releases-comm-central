/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from abCommon.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var kNonVcardFields = ["ChatName", "preferDisplayName"];

var kPhoneticFields = [
  "PhoneticLastName",
  "PhoneticLabel1",
  "PhoneticFirstName",
  "PhoneticLabel2",
];

// Item is |[dialogField, cardProperty]|.
var kVcardFields = [
  // Contact > Name
  ["FirstName", "FirstName"],
  ["LastName", "LastName"],
  ["DisplayName", "DisplayName"],
  ["NickName", "NickName"],
  // Contact > Internet
  ["PrimaryEmail", "PrimaryEmail"],
  ["SecondEmail", "SecondEmail"],
  ["PreferMailFormat", "PreferMailFormat"],
  // Contact > Phones
  ["WorkPhone", "WorkPhone"],
  ["HomePhone", "HomePhone"],
  ["FaxNumber", "FaxNumber"],
  ["PagerNumber", "PagerNumber"],
  ["CellularNumber", "CellularNumber"],
  // Address > Home
  ["HomeAddress", "HomeAddress"],
  ["HomeAddress2", "HomeAddress2"],
  ["HomeCity", "HomeCity"],
  ["HomeState", "HomeState"],
  ["HomeZipCode", "HomeZipCode"],
  ["HomeCountry", "HomeCountry"],
  ["WebPage2", "WebPage2"],
  // Address > Work
  ["JobTitle", "JobTitle"],
  ["Department", "Department"],
  ["Company", "Company"],
  ["WorkAddress", "WorkAddress"],
  ["WorkAddress2", "WorkAddress2"],
  ["WorkCity", "WorkCity"],
  ["WorkState", "WorkState"],
  ["WorkZipCode", "WorkZipCode"],
  ["WorkCountry", "WorkCountry"],
  ["WebPage1", "WebPage1"],
  // Other > (custom)
  ["Custom1", "Custom1"],
  ["Custom2", "Custom2"],
  ["Custom3", "Custom3"],
  ["Custom4", "Custom4"],
  // Other > Notes
  ["Notes", "Notes"],
  // Chat
  ["Gtalk", "_GoogleTalk"],
  ["AIM", "_AimScreenName"],
  ["Yahoo", "_Yahoo"],
  ["Skype", "_Skype"],
  ["QQ", "_QQ"],
  ["MSN", "_MSN"],
  ["ICQ", "_ICQ"],
  ["XMPP", "_JabberId"],
  ["IRC", "_IRC"],
];

var gEditCard;
var gOnSaveListeners = [];
var gOnLoadListeners = [];
var gOkCallback = null;
var gHideABPicker = false;
var gPhotoHandlers = {};
// If any new photos were added to the card, this stores the name of the original
// and any temporary new filenames used to store photos of the card.
// 'null' is a valid value when there was no photo (e.g. the generic photo).
var gOldPhotos = [];
// If a new photo was added, the name is stored here.
var gNewPhoto = null;

function OnLoadNewCard() {
  InitEditCard();

  gEditCard.card =
    "arguments" in window &&
    window.arguments.length > 0 &&
    window.arguments[0] instanceof Ci.nsIAbCard
      ? window.arguments[0]
      : Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
          Ci.nsIAbCard
        );
  gEditCard.titleProperty = "newContactTitle";
  gEditCard.selectedAB = "";

  if ("arguments" in window && window.arguments[0]) {
    gEditCard.selectedAB = kPersonalAddressbookURI;

    if (
      "selectedAB" in window.arguments[0] &&
      window.arguments[0].selectedAB != kAllDirectoryRoot + "?"
    ) {
      // check if selected ab is a mailing list
      var abURI = window.arguments[0].selectedAB;

      var directory = GetDirectoryFromURI(abURI);
      if (directory.isMailList) {
        var parentURI = GetParentDirectoryFromMailingListURI(abURI);
        if (parentURI) {
          gEditCard.selectedAB = parentURI;
        }
      } else if (!directory.readOnly) {
        gEditCard.selectedAB = window.arguments[0].selectedAB;
      }
    }

    // we may have been given properties to pre-initialize the window with....
    // we'll fill these in here...
    if ("primaryEmail" in window.arguments[0]) {
      gEditCard.card.primaryEmail = window.arguments[0].primaryEmail;
    }
    if ("displayName" in window.arguments[0]) {
      gEditCard.card.displayName = window.arguments[0].displayName;
      // if we've got a display name, don't generate
      // a display name (and stomp on the existing display name)
      // when the user types a first or last name
      if (gEditCard.card.displayName) {
        gEditCard.generateDisplayName = false;
      }
    }
    if ("aimScreenName" in window.arguments[0]) {
      gEditCard.card.setProperty(
        "_AimScreenName",
        window.arguments[0].aimScreenName
      );
    }

    if ("okCallback" in window.arguments[0]) {
      gOkCallback = window.arguments[0].okCallback;
    }

    if ("escapedVCardStr" in window.arguments[0]) {
      HideNonVcardFields();
      if (window.arguments[0].escapedVCardStr) {
        gEditCard.card = Cc["@mozilla.org/addressbook/msgvcardservice;1"]
          .getService(Ci.nsIMsgVCardService)
          .escapedVCardToAbCard(window.arguments[0].escapedVCardStr);
      }
    }

    if ("titleProperty" in window.arguments[0]) {
      gEditCard.titleProperty = window.arguments[0].titleProperty;
    }

    if ("hideABPicker" in window.arguments[0]) {
      gHideABPicker = window.arguments[0].hideABPicker;
    }
  }

  // set popup with address book names
  var abPopup = document.getElementById("abPopup");
  abPopup.value = gEditCard.selectedAB || kPersonalAddressbookURI;

  if (gHideABPicker && abPopup) {
    abPopup.hidden = true;
    document.getElementById("abPopupLabel").hidden = true;
  }

  SetCardDialogTitle(gEditCard.card.displayName);

  GetCardValues(gEditCard.card, document);

  // Focus on first or last name based on the pref of which is first.
  let input = document.getElementById(
    gEditCard.displayLastNameFirst ? "LastName" : "FirstName"
  );
  setTimeout(() => input.select());
}

/**
 * Get the source directory containing the card we are editing.
 */
function getContainingDirectory() {
  let directory = GetDirectoryFromURI(gEditCard.abURI);
  // If the source directory is "All Address Books", find the parent
  // address book of the card being edited and reflect the changes in it.
  if (directory.URI == kAllDirectoryRoot + "?") {
    directory = MailServices.ab.getDirectoryFromUID(
      gEditCard.card.directoryUID
    );
  }
  return directory;
}

function EditCardOKButton(event) {
  if (!CheckCardRequiredDataPresence(document)) {
    event.preventDefault(); // don't close window
    return;
  }

  let directory = getContainingDirectory();
  if (directory.isMailList) {
    var parentURI = GetParentDirectoryFromMailingListURI(gEditCard.abURI);
    directory = GetDirectoryFromURI(parentURI);
  }

  CheckAndSetCardValues(gEditCard.card, document, false);

  directory.modifyCard(gEditCard.card);

  NotifySaveListeners(directory);

  // callback to allow caller to update
  if (gOkCallback) {
    gOkCallback();
  }
}

function EditCardCancelButton() {
  // If a new photo was created, remove it now as it won't be used.
  purgeOldPhotos(false);
}

function OnLoadEditCard() {
  InitEditCard();

  gEditCard.titleProperty = "editContactTitle";

  if (window.arguments && window.arguments[0]) {
    if (window.arguments[0].card) {
      gEditCard.card = window.arguments[0].card;
    }
    if (window.arguments[0].okCallback) {
      gOkCallback = window.arguments[0].okCallback;
    }
    if (window.arguments[0].abURI) {
      gEditCard.abURI = window.arguments[0].abURI;
    }
  }

  // set global state variables
  // if first or last name entered, disable generateDisplayName
  if (
    gEditCard.generateDisplayName &&
    gEditCard.card.firstName.length +
      gEditCard.card.lastName.length +
      gEditCard.card.displayName.length >
      0
  ) {
    gEditCard.generateDisplayName = false;
  }

  GetCardValues(gEditCard.card, document);

  SetCardDialogTitle(gEditCard.card.displayName);

  // check if selectedAB is a writeable
  // if not disable all the fields
  if ("arguments" in window && window.arguments[0]) {
    if ("abURI" in window.arguments[0]) {
      var abURI = window.arguments[0].abURI;
      var directory = GetDirectoryFromURI(abURI);

      if (directory.readOnly) {
        // Set all the editable vcard fields to read only
        for (let i = kVcardFields.length - 1; i >= 0; i--) {
          document.getElementById(kVcardFields[i][0]).readOnly = true;
        }

        // the birthday fields
        document.getElementById("BirthDay").readOnly = true;
        document.getElementById("BirthMonth").readOnly = true;
        document.getElementById("BirthYear").readOnly = true;
        document.getElementById("Age").readOnly = true;

        // the photo field and buttons
        document.getElementById("PhotoType").disabled = true;
        document.getElementById("PhotoURI").disabled = true;
        document.getElementById("PhotoURI").placeholder = "";
        document.getElementById("BrowsePhoto").disabled = true;
        document.getElementById("UpdatePhoto").disabled = true;

        // And the phonetic fields
        document.getElementById(kPhoneticFields[0]).readOnly = true;
        document.getElementById(kPhoneticFields[2]).readOnly = true;

        // Also disable the mail format popup and allow remote content items.
        document.getElementById("PreferMailFormat").disabled = true;

        // And the "prefer display name" checkbox
        document.getElementById("preferDisplayName").disabled = true;

        document.querySelector("dialog").buttons = "accept";
        return;
      }
    }
  }
  document.addEventListener("dialogaccept", EditCardOKButton);
}

/* Registers functions that are called when loading the card
 * values into the contact editor dialog.  This is useful if
 * extensions have added extra fields to the nsIAbCard, and
 * need to display them in the contact editor.
 */
function RegisterLoadListener(aFunc) {
  gOnLoadListeners[gOnLoadListeners.length] = aFunc;
}

function UnregisterLoadListener(aFunc) {
  var fIndex = gOnLoadListeners.indexOf(aFunc);
  if (fIndex != -1) {
    gOnLoadListeners.splice(fIndex, 1);
  }
}

// Notifies load listeners that an nsIAbCard is being loaded.
function NotifyLoadListeners(aCard, aDoc) {
  if (!gOnLoadListeners.length) {
    return;
  }

  for (var i = 0; i < gOnLoadListeners.length; i++) {
    gOnLoadListeners[i](aCard, aDoc);
  }
}

/* Registers functions that are called when saving the card
 * values.  This is useful if extensions have added extra
 * fields to the user interface, and need to set those values
 * in their nsIAbCard.
 */
function RegisterSaveListener(func) {
  gOnSaveListeners[gOnSaveListeners.length] = func;
}

function UnregisterSaveListener(aFunc) {
  var fIndex = gOnSaveListeners.indexOf(aFunc);
  if (fIndex != -1) {
    gOnSaveListeners.splice(fIndex, 1);
  }
}

// Notifies save listeners that an nsIAbCard is being saved.
function NotifySaveListeners(directory) {
  if (!gOnSaveListeners.length) {
    return;
  }

  for (var i = 0; i < gOnSaveListeners.length; i++) {
    gOnSaveListeners[i](gEditCard.card, document);
  }

  // the save listeners might have tweaked the card
  // in which case we need to commit it.
  directory.modifyCard(gEditCard.card);
}

function InitPhoneticFields() {
  var showPhoneticFields = Services.prefs.getComplexValue(
    "mail.addr_book.show_phonetic_fields",
    Ci.nsIPrefLocalizedString
  ).data;

  // show phonetic fields if indicated by the pref
  if (showPhoneticFields == "true") {
    for (var i = kPhoneticFields.length - 1; i >= 0; i--) {
      document.getElementById(kPhoneticFields[i]).hidden = false;
    }
    document
      .getElementById("NameField1Container")
      .classList.add("showingPhonetic");
    document
      .getElementById("NameField2Container")
      .classList.add("showingPhonetic");
  }
}

function InitBirthDateFields() {
  let birthMonth = document.getElementById("BirthMonth");
  let birthDay = document.getElementById("BirthDay");
  let birthYear = document.getElementById("BirthYear");

  if (birthMonth.menupopup.childElementCount == 1) {
    let formatter = Intl.DateTimeFormat(undefined, { month: "long" });
    for (let m = 1; m <= 12; m++) {
      let menuitem = document.createXULElement("menuitem");
      menuitem.setAttribute("value", m);
      menuitem.setAttribute(
        "label",
        formatter.format(new Date(2000, m - 1, 2))
      );
      birthMonth.menupopup.appendChild(menuitem);
    }

    formatter = Intl.DateTimeFormat(undefined, { day: "numeric" });
    for (let d = 1; d <= 31; d++) {
      let menuitem = document.createXULElement("menuitem");
      menuitem.setAttribute("value", d);
      menuitem.setAttribute("label", formatter.format(new Date(2000, 0, d)));
      birthDay.menupopup.appendChild(menuitem);
    }
  }

  birthMonth.addEventListener("command", setDisabledMonthDays);
  birthYear.addEventListener("change", setDisabledMonthDays);
}

function InitEditCard() {
  // Fix broken element IDs caused by translation mistakes. NameField1's ID should be either
  // "FirstName" or "LastName", and if it isn't, make it so.
  let nameField1Container = document.getElementById("NameField1Container");
  let nameField1 = nameField1Container.querySelector(".input-inline");
  if (nameField1.id != "FirstName" && nameField1.id != "LastName") {
    nameField1Container
      .querySelector("label")
      .setAttribute("control", "FirstName");
    nameField1.id = "FirstName";
    nameField1Container
      .querySelector(".input-inline ~ label")
      .setAttribute("control", "PhoneticFirstName");
    nameField1Container.querySelector(".input-inline ~ .input-inline").id =
      "PhoneticFirstName";

    let nameField2Container = document.getElementById("NameField2Container");
    nameField2Container
      .querySelector("label")
      .setAttribute("control", "LastName");
    nameField2Container.querySelector(".input-inline").id = "LastName";
    nameField2Container
      .querySelector(".input-inline ~ label")
      .setAttribute("control", "PhoneticLastName");
    nameField2Container.querySelector(".input-inline ~ .input-inline").id =
      "PhoneticLastName";
  }

  InitPhoneticFields();
  InitBirthDateFields();

  InitCommonJS();

  // Create gEditCard object that contains global variables for the current js
  //   file.
  gEditCard = {};

  // get specific prefs that gEditCard will need
  try {
    var displayLastNameFirst = Services.prefs.getComplexValue(
      "mail.addr_book.displayName.lastnamefirst",
      Ci.nsIPrefLocalizedString
    ).data;
    gEditCard.displayLastNameFirst = displayLastNameFirst == "true";
    gEditCard.generateDisplayName = Services.prefs.getBoolPref(
      "mail.addr_book.displayName.autoGeneration"
    );
  } catch (ex) {
    dump("ex: failed to get pref" + ex + "\n");
  }
}

function NewCardOKButton(event) {
  if (gOkCallback) {
    // This is the case of editing an identity vCard to attach.
    if (!CheckAndSetCardValues(gEditCard.card, document, true)) {
      event.preventDefault(); // don't close window
      return;
    }

    gOkCallback(gEditCard.card.translateTo("vcard"));
    return; // close the window
  }

  var popup = document.getElementById("abPopup");
  if (popup) {
    var uri = popup.value;

    // FIX ME - hack to avoid crashing if no ab selected because of blank option bug from template
    // should be able to just remove this if we are not seeing blank lines in the ab popup
    if (!uri) {
      event.preventDefault();
      return; // don't close window
    }
    // -----

    if (gEditCard.card) {
      if (!CheckAndSetCardValues(gEditCard.card, document, true)) {
        event.preventDefault();
        return; // don't close window
      }

      // replace gEditCard.card with the card we added
      // so that save listeners can get / set attributes on
      // the card that got created.
      var directory = GetDirectoryFromURI(uri);
      gEditCard.card = directory.addCard(gEditCard.card);
      NotifySaveListeners(directory);
    }
  }
}

function NewCardCancelButton() {
  // If a new photo was created, remove it now as it won't be used.
  purgeOldPhotos(false);
}

// Move the data from the cardproperty to the dialog
function GetCardValues(cardproperty, doc) {
  if (!cardproperty) {
    return;
  }

  // Pass the nsIAbCard and the Document through the listeners
  // to give extensions a chance to populate custom fields.
  NotifyLoadListeners(cardproperty, doc);

  for (var i = kVcardFields.length - 1; i >= 0; i--) {
    doc.getElementById(kVcardFields[i][0]).value = cardproperty.getProperty(
      kVcardFields[i][1],
      ""
    );
  }

  // Get the year first, so that the following month/day
  // calculations can take leap years into account.
  var year = cardproperty.getProperty("BirthYear", null);
  var birthYear = doc.getElementById("BirthYear");
  // set the year in the datepicker to the stored year
  birthYear.value = year;

  var month = parseInt(cardproperty.getProperty("BirthMonth", null), 10);
  var day = parseInt(cardproperty.getProperty("BirthDay", null), 10);
  var birthMonth = doc.getElementById("BirthMonth");
  var birthDay = doc.getElementById("BirthDay");
  birthDay.value = -1;
  if (month > 0 && month < 13) {
    birthMonth.value = month;
    setDisabledMonthDays();
    if (day > 0 && day < 32) {
      birthDay.value = day;
    }
  } else {
    birthMonth.value = -1;
  }

  // get the current age
  calculateAge();

  // when the birth year changes, update the datepicker's year to the new value
  // or to kDefaultYear if the value is null
  birthMonth.addEventListener("command", calculateAge);
  birthDay.addEventListener("command", calculateAge);
  birthYear.addEventListener("change", calculateAge);
  var age = doc.getElementById("Age");
  age.addEventListener("change", calculateYear);

  var popup = document.getElementById("PreferMailFormat");
  if (popup) {
    popup.value = cardproperty.getProperty("PreferMailFormat", "");
  }

  var preferDisplayNameEl = document.getElementById("preferDisplayName");
  if (preferDisplayNameEl) {
    // getProperty may return a "1" or "0" string, we want a boolean
    preferDisplayNameEl.checked =
      // eslint-disable-next-line mozilla/no-compare-against-boolean-literals
      cardproperty.getProperty("PreferDisplayName", true) == true;
  }

  // get phonetic fields if exist
  try {
    doc.getElementById("PhoneticFirstName").value = cardproperty.getProperty(
      "PhoneticFirstName",
      ""
    );
    doc.getElementById("PhoneticLastName").value = cardproperty.getProperty(
      "PhoneticLastName",
      ""
    );
  } catch (ex) {}

  // Select the type if there is a valid value stored for that type, otherwise
  // select the generic photo
  loadPhoto(cardproperty);

  updateChatName();
}

// when the ab card dialog is being loaded to show a vCard,
// hide/disable the fields which aren't supported
// by vCard so the user does not try to edit them.
function HideNonVcardFields() {
  document.getElementById("homeTabButton").hidden = true;
  document.getElementById("chatTabButton").hidden = true;
  document.getElementById("photoTabButton").hidden = true;
  // Custom1-Custom4 don't have a standard representation in vCard.
  document.getElementById("customFields").hidden = true;
  for (let field of kNonVcardFields.map(id => document.getElementById(id))) {
    field.disabled = true;
  }
  // Drop the chat name label so it can't open the hidden chat details tab.
  let chatNameLabel = document.getElementById("ChatNameLabel");
  chatNameLabel.removeAttribute("onclick");
  chatNameLabel.classList.remove("text-link");

  for (let i = kPhoneticFields.length - 1; i >= 0; i--) {
    document.getElementById(kPhoneticFields[i]).hidden = true;
  }
  document
    .getElementById("NameField1Container")
    .classList.remove("showingPhonetic");
  document
    .getElementById("NameField2Container")
    .classList.remove("showingPhonetic");
}

/**
 * Move the data from the dialog to the cardproperty to be stored in the
 * database.
 * @returns {boolean}
 *   false - Some required data are missing (card values were not set);
 *   true - Card values were set, or there is no card to set values on.
 */
function CheckAndSetCardValues(cardproperty, doc, check) {
  // If requested, check the required data presence.
  if (check && !CheckCardRequiredDataPresence(document)) {
    return false;
  }

  if (!cardproperty) {
    return true;
  }

  for (var i = kVcardFields.length - 1; i >= 0; i--) {
    cardproperty.setProperty(
      kVcardFields[i][1],
      doc.getElementById(kVcardFields[i][0]).value
    );
  }

  // get the birthday information from the dialog
  var birthMonth = document.getElementById("BirthMonth").value;
  var birthDay = document.getElementById("BirthDay").value;
  var birthYear = doc.getElementById("BirthYear").value;

  // set the birth day, month, and year properties
  cardproperty.setProperty("BirthDay", birthDay == -1 ? null : birthDay);
  cardproperty.setProperty("BirthMonth", birthMonth == -1 ? null : birthMonth);
  cardproperty.setProperty("BirthYear", birthYear);

  var popup = document.getElementById("PreferMailFormat");
  if (popup) {
    cardproperty.setProperty("PreferMailFormat", popup.value);
  }

  var preferDisplayNameEl = document.getElementById("preferDisplayName");
  if (preferDisplayNameEl) {
    cardproperty.setProperty("PreferDisplayName", preferDisplayNameEl.checked);
  }

  // set phonetic fields if exist
  try {
    cardproperty.setProperty(
      "PhoneticFirstName",
      doc.getElementById("PhoneticFirstName").value
    );
    cardproperty.setProperty(
      "PhoneticLastName",
      doc.getElementById("PhoneticLastName").value
    );
  } catch (ex) {}

  let photoType = doc.getElementById("PhotoType").value;
  if (gPhotoHandlers[photoType]) {
    if (!gPhotoHandlers[photoType].onSave(cardproperty, doc)) {
      photoType = "generic";
      onSwitchPhotoType("generic");
      gPhotoHandlers[photoType].onSave(cardproperty, doc);
    }
  }
  cardproperty.setProperty("PhotoType", photoType);
  purgeOldPhotos(true);

  return true;
}

function CleanUpWebPage(webPage) {
  // no :// yet so we should add something
  if (webPage.length && !webPage.includes("://")) {
    // check for missing / on http://
    if (webPage.startsWith("http:/")) {
      return "http://" + webPage.substr(6);
    }
    return "http://" + webPage;
  }
  return webPage;
}

// @Returns false - Some required data are missing;
//          true - All required data are present.
function CheckCardRequiredDataPresence(doc) {
  // Bug 314995 We require at least one of the following fields to be
  // filled in: email address, first name, last name, display name,
  //            organization (company name).
  var primaryEmail = doc.getElementById("PrimaryEmail");
  if (
    !primaryEmail.value &&
    !doc.getElementById("FirstName").value &&
    !doc.getElementById("LastName").value &&
    !doc.getElementById("DisplayName").value &&
    !doc.getElementById("Company").value
  ) {
    Services.prompt.alert(
      window,
      gAddressBookBundle.getString("cardRequiredDataMissingTitle"),
      gAddressBookBundle.getString("cardRequiredDataMissingMessage")
    );
    return false;
  }

  // Simple checks that the primary email should be of the form |user@host|.
  // Note: if the length of the primary email is 0 then we skip the check
  // as some other field must have something as per the check above.
  if (primaryEmail.value && !/.@./.test(primaryEmail.value)) {
    Services.prompt.alert(
      window,
      gAddressBookBundle.getString("incorrectEmailAddressFormatTitle"),
      gAddressBookBundle.getString("incorrectEmailAddressFormatMessage")
    );

    // Focus the dialog field, to help the user.
    document.getElementById("abTabs").selectedIndex = 0;
    primaryEmail.focus();

    return false;
  }

  return true;
}

function GenerateDisplayName() {
  if (!gEditCard.generateDisplayName) {
    return;
  }

  var displayName;

  var firstNameValue = document.getElementById("FirstName").value;
  var lastNameValue = document.getElementById("LastName").value;
  if (lastNameValue && firstNameValue) {
    displayName = gEditCard.displayLastNameFirst
      ? gAddressBookBundle.getFormattedString("lastFirstFormat", [
          lastNameValue,
          firstNameValue,
        ])
      : gAddressBookBundle.getFormattedString("firstLastFormat", [
          firstNameValue,
          lastNameValue,
        ]);
  } else {
    // one (or both) of these is empty, so this works.
    displayName = firstNameValue + lastNameValue;
  }

  document.getElementById("DisplayName").value = displayName;

  SetCardDialogTitle(displayName);
}

function DisplayNameChanged() {
  // turn off generateDisplayName if the user changes the display name
  gEditCard.generateDisplayName = false;

  SetCardDialogTitle(document.getElementById("DisplayName").value);
}

function SetCardDialogTitle(displayName) {
  document.title = displayName
    ? gAddressBookBundle.getFormattedString(
        gEditCard.titleProperty + "WithDisplayName",
        [displayName]
      )
    : gAddressBookBundle.getString(gEditCard.titleProperty);
}

function setDisabledMonthDays() {
  let birthMonth = document.getElementById("BirthMonth").value;
  let birthYear = document.getElementById("BirthYear").value;
  let popup = document.getElementById("BirthDay").menupopup;

  if (!isNaN(birthYear) && birthYear >= kMinYear && birthYear <= kMaxYear) {
    popup.children[29].disabled = birthYear % 4 != 0 && birthMonth == "2";
  }
  popup.children[30].disabled = birthMonth == "2";
  popup.children[31].disabled = ["2", "4", "6", "9", "11"].includes(birthMonth);
}

function calculateAge() {
  let birthMonth = document.getElementById("BirthMonth").value;
  let birthDay = document.getElementById("BirthDay").value;
  let birthYear = document.getElementById("BirthYear").value;
  document.getElementById("Age").value = "";

  if (birthMonth == -1 || birthDay == -1) {
    return;
  }
  if (isNaN(birthYear) || birthYear < kMinYear || birthYear > kMaxYear) {
    return;
  }

  birthMonth--; // Date object months are 0-indexed.
  let today = new Date();
  let age = today.getFullYear() - birthYear;
  if (birthMonth > today.getMonth()) {
    age--;
  } else if (birthMonth == today.getMonth() && birthDay > today.getDate()) {
    age--;
  }
  if (age >= 0) {
    document.getElementById("Age").value = age;
  }
}

function calculateYear() {
  let age = document.getElementById("Age").value;
  if (isNaN(age)) {
    return;
  }

  let today = new Date();
  let year = today.getFullYear() - age;

  let birthMonth = document.getElementById("BirthMonth").value;
  birthMonth--; // Date object months are 0-indexed.
  let birthDay = document.getElementById("BirthDay").value;
  if (birthMonth > today.getMonth()) {
    year--;
  } else if (birthMonth == today.getMonth() && birthDay > today.getDate()) {
    year--;
  }
  document.getElementById("BirthYear").value = year;
  setDisabledMonthDays();
}

var chatNameFieldIds = [
  "Gtalk",
  "AIM",
  "Yahoo",
  "Skype",
  "QQ",
  "MSN",
  "ICQ",
  "XMPP",
  "IRC",
];

/**
 * Show the 'Chat' tab and focus the first field that has a value, or
 * the first field if none of them has a value.
 */
function showChat() {
  document.getElementById(
    "abTabPanels"
  ).parentNode.selectedTab = document.getElementById("chatTabButton");
  for (let id of chatNameFieldIds) {
    let elt = document.getElementById(id);
    if (elt.value) {
      elt.focus();
      return;
    }
  }
  document.getElementById(chatNameFieldIds[0]).focus();
}

/**
 * Fill in the value of the ChatName readonly field with the first
 * value of the fields in the Chat tab.
 */
function updateChatName() {
  let value = "";
  for (let id of chatNameFieldIds) {
    let val = document.getElementById(id).value;
    if (val) {
      value = val;
      break;
    }
  }
  document.getElementById("ChatName").value = value;
}

/**
 * Extract the photo information from an nsIAbCard, and populate
 * the appropriate input fields in the contact editor.  If the
 * nsIAbCard returns an unrecognized PhotoType, the generic
 * display photo is switched to.
 *
 * @param aCard The nsIAbCard to extract the information from.
 *
 */
function loadPhoto(aCard) {
  var type = aCard.getProperty("PhotoType", "");

  if (!gPhotoHandlers[type] || !gPhotoHandlers[type].onLoad(aCard, document)) {
    type = "generic";
    gPhotoHandlers[type].onLoad(aCard, document);
  }

  document.getElementById("PhotoType").value = type;
  gPhotoHandlers[type].onShow(aCard, document, "photo");
}

/**
 * Event handler for when the user switches the type of photo for the nsIAbCard
 * being edited. Tries to initiate a photo download.
 *
 * @param {string} aPhotoType - The type to switch to.
 */
function onSwitchPhotoType(aPhotoType) {
  document.getElementById("PhotoType").value = aPhotoType;

  let photoHandler = gPhotoHandlers[aPhotoType];
  if (!photoHandler.onRead(gEditCard.card, document)) {
    onSwitchPhotoType("generic");
  } else {
    photoHandler.onShow(gEditCard.card, document, "photo");
  }
}

/**
 * Removes the photo file at the given path, if present.
 *
 * @param aName The name of the photo to remove from the Photos directory.
 *              'null' value is allowed and means to remove no file.
 *
 * @return {boolean} True if the file was deleted, false otherwise.
 */
function removePhoto(aName) {
  if (!aName) {
    return false;
  }
  // Get the directory with all the photos
  var file = getPhotosDir();
  // Get the photo (throws an exception for invalid names)
  try {
    file.append(aName);
    file.remove(false);
    return true;
  } catch (e) {}
  return false;
}

/**
 * Remove previous and temporary photo files from the Photos directory.
 *
 * @param aSaved {boolean}  Whether the new card is going to be saved/committed.
 */
function purgeOldPhotos(aSaved = true) {
  // If photo was changed, the array contains at least one member, the original photo.
  while (gOldPhotos.length > 0) {
    let photoName = gOldPhotos.pop();
    if (!aSaved && gOldPhotos.length == 0) {
      // If the saving was cancelled, we want to keep the original photo of the card.
      break;
    }
    removePhoto(photoName);
  }

  if (aSaved) {
    // The new photo should stay so we clear the reference to it.
    gNewPhoto = null;
  } else {
    // Changes to card not saved, we don't need the new photo.
    // It may be null when there was no change of it.
    removePhoto(gNewPhoto);
  }
}

/**
 * Opens a file picker with image filters to look for a contact photo.
 * If the user selects a file and clicks OK then the PhotoURI input is set
 * with a file URI pointing to that file and updatePhoto is called.
 *
 * @param aEvent {Event} The event object if used as an event handler.
 */
function browsePhoto(aEvent) {
  // Stop event propagation to the radiogroup command event in case that the
  // child button is pressed. Otherwise, the download is started twice in a row.
  if (aEvent) {
    aEvent.stopPropagation();
  }

  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  fp.init(
    window,
    gAddressBookBundle.getString("browsePhoto"),
    Ci.nsIFilePicker.modeOpen
  );

  // Open the directory of the currently chosen photo (if any)
  let currentPhotoFile = document.getElementById("PhotoFile").file;
  if (currentPhotoFile) {
    fp.displayDirectory = currentPhotoFile.parent;
  }

  // Add All Files & Image Files filters and select the latter
  fp.appendFilters(Ci.nsIFilePicker.filterImages);
  fp.appendFilters(Ci.nsIFilePicker.filterAll);

  fp.open(rv => {
    if (rv != Ci.nsIFilePicker.returnOK) {
      return;
    }
    document.getElementById("PhotoFile").file = fp.file;
    onSwitchPhotoType("file");
  });
}

/**
 * Handlers to add drag and drop support.
 */
function checkDropPhoto(aEvent) {
  // Just allow anything to be dropped. Different types of data are handled
  // in doDropPhoto() below.
  aEvent.preventDefault();
}

function doDropPhoto(aEvent) {
  aEvent.preventDefault();

  let photoType = "";

  // Check if a file has been dropped.
  let file = aEvent.dataTransfer.mozGetDataAt("application/x-moz-file", 0);
  if (file instanceof Ci.nsIFile) {
    photoType = "file";
    document.getElementById("PhotoFile").file = file;
  } else {
    // Check if a URL has been dropped.
    let link = aEvent.dataTransfer.getData("URL");
    if (link) {
      photoType = "web";
      document.getElementById("PhotoURI").value = link;
    } else {
      // Check if dropped text is a URL.
      link = aEvent.dataTransfer.getData("text/plain");
      if (/^(ftps?|https?):\/\//i.test(link)) {
        photoType = "web";
        document.getElementById("PhotoURI").value = link;
      }
    }
  }

  onSwitchPhotoType(photoType);
}

/**
 * Self-contained object to manage the user interface used for downloading
 * and storing contact photo images.
 */
var gPhotoDownloadUI = (function() {
  // UI DOM elements
  let elProgressbar;
  let elProgressLabel;
  let elPhotoType;
  let elProgressContainer;

  window.addEventListener("load", function(event) {
    if (!elProgressbar) {
      elProgressbar = document.getElementById("PhotoDownloadProgress");
    }
    if (!elProgressLabel) {
      elProgressLabel = document.getElementById("PhotoStatus");
    }
    if (!elPhotoType) {
      elPhotoType = document.getElementById("PhotoType");
    }
    if (!elProgressContainer) {
      elProgressContainer = document.getElementById("ProgressContainer");
    }
  });

  function onStart() {
    elProgressContainer.setAttribute("class", "expanded");
    elProgressLabel.value = "";
    elProgressbar.hidden = false;
    elProgressbar.value = 3; // Start with a tiny visible progress
  }

  function onSuccess() {
    elProgressLabel.value = "";
    elProgressContainer.setAttribute("class", "");
  }

  function onError(state) {
    let msg;
    switch (state) {
      case gImageDownloader.ERROR_INVALID_URI:
        msg = gAddressBookBundle.getString("errorInvalidUri");
        break;
      case gImageDownloader.ERROR_UNAVAILABLE:
        msg = gAddressBookBundle.getString("errorNotAvailable");
        break;
      case gImageDownloader.ERROR_INVALID_IMG:
        msg = gAddressBookBundle.getString("errorInvalidImage");
        break;
      case gImageDownloader.ERROR_SAVE:
        msg = gAddressBookBundle.getString("errorSaveOperation");
        break;
    }
    if (msg) {
      elProgressLabel.value = msg;
      elProgressbar.hidden = true;
      onSwitchPhotoType("generic");
    }
  }

  function onProgress(state, percent) {
    if (percent !== undefined) {
      elProgressbar.value = percent;
    }
    elProgressLabel.value = gAddressBookBundle.getString("stateImageSave");
  }

  return {
    onStart,
    onSuccess,
    onError,
    onProgress,
  };
})();

/**
 * A photo handler defines the behaviour of the contact editor
 * for a particular photo type. Each photo handler must implement
 * the following interface:
 *
 * onLoad: function(aCard, aDocument):
 *   Called when the editor wants to populate the contact editor
 *   input fields with information about aCard's photo.  Note that
 *   this does NOT make aCard's photo appear in the contact editor -
 *   this is left to the onShow function.  Returns true on success.
 *   If the function returns false, the generic photo handler onLoad
 *   function will be called.
 *
 * onShow: function(aCard, aDocument, aTargetID):
 *   Called when the editor wants to show this photo type.
 *   The onShow method should take the input fields in the document,
 *   and render the requested photo in the IMG tag with id
 *   aTargetID.  Note that onShow does NOT save the photo for aCard -
 *   this job is left to the onSave function.  Returns true on success.
 *   If the function returns false, the generic photo handler onShow
 *   function will be called.
 *
 * onRead: function(aCard, aDocument)
 *   Called when the editor wants to read the user supplied new photo.
 *   The onRead method is responsible for analyzing the photo of this
 *   type requested by the user, and storing it, as well as the
 *   other fields required by onLoad/onShow to retrieve and display
 *   the photo again. Returns true on success.  If the function
 *   returns false, the generic photo handler onRead function will
 *   be called.
 *
 * onSave: function(aCard, aDocument)
 *   Called when the editor wants to save this photo type to the card.
 *   Returns true on success.
 */

var genericPhotoHandler = {
  onLoad(aCard, aDocument) {
    return true;
  },

  onShow(aCard, aDocument, aTargetID) {
    // XXX TODO: this ignores any other value from the generic photos
    // menulist than "default".
    aDocument.getElementById(aTargetID).setAttribute("src", defaultPhotoURI);
    return true;
  },

  onRead(aCard, aDocument) {
    gPhotoDownloadUI.onSuccess();

    newPhotoAdded("", aCard);

    genericPhotoHandler.onShow(aCard, aDocument, "photo");
    return true;
  },

  onSave(aCard, aDocument) {
    // XXX TODO: this ignores any other value from the generic photos
    // menulist than "default".

    // Update contact
    aCard.setProperty("PhotoName", "");
    aCard.setProperty("PhotoURI", "");
    return true;
  },
};

var filePhotoHandler = {
  onLoad(aCard, aDocument) {
    let photoURI = aCard.getProperty("PhotoURI", "");
    let file;
    try {
      // The original file may not exist anymore, but we still display it.
      file = Services.io.newURI(photoURI).QueryInterface(Ci.nsIFileURL).file;
    } catch (e) {}

    if (!file) {
      return false;
    }

    aDocument.getElementById("PhotoFile").file = file;
    this._showFilename(aCard, aDocument);
    return true;
  },

  onShow(aCard, aDocument, aTargetID) {
    let photoName = gNewPhoto || aCard.getProperty("PhotoName", null);
    let photoURI = getPhotoURI(photoName);
    aDocument.getElementById(aTargetID).setAttribute("src", photoURI);
    return true;
  },

  onRead(aCard, aDocument) {
    let file = aDocument.getElementById("PhotoFile").file;
    filePhotoHandler._showFilename(aCard, aDocument);
    if (!file) {
      return false;
    }

    // If the local file has been removed/renamed, keep the current photo as is.
    if (!file.exists() || !file.isFile()) {
      return false;
    }

    let photoURI = Services.io.newFileURI(file).spec;

    gPhotoDownloadUI.onStart();

    let cbSuccess = function(newPhotoName) {
      gPhotoDownloadUI.onSuccess();

      newPhotoAdded(newPhotoName, aCard);
      aDocument.getElementById("PhotoFile").setAttribute("PhotoURI", photoURI);

      filePhotoHandler.onShow(aCard, aDocument, "photo");
    };

    gImageDownloader.savePhoto(
      photoURI,
      cbSuccess,
      gPhotoDownloadUI.onError,
      gPhotoDownloadUI.onProgress
    );
    return true;
  },

  onSave(aCard, aDocument) {
    // Update contact
    if (gNewPhoto) {
      // The file may not be valid unless the photo has changed.
      let photoURI = aDocument
        .getElementById("PhotoFile")
        .getAttribute("PhotoURI");
      aCard.setProperty("PhotoName", gNewPhoto);
      aCard.setProperty("PhotoURI", photoURI);
    }
    return true;
  },

  _showFilename(aCard, aDocument) {
    let photoElem = aDocument.getElementById("PhotoFile");
    let photoFile = photoElem.file ? photoElem.file : null;
    if (photoFile) {
      let photoSpec = Services.io
        .getProtocolHandler("file")
        .QueryInterface(Ci.nsIFileProtocolHandler)
        .getURLSpecFromFile(photoFile);
      photoElem.style.backgroundImage =
        "url(moz-icon://" + photoSpec + "?size=16)";
      photoElem.value = photoFile.leafName;
    } else {
      photoElem.value = "";
    }
  },
};

var webPhotoHandler = {
  onLoad(aCard, aDocument) {
    let photoURI = aCard.getProperty("PhotoURI", null);

    if (!photoURI) {
      return false;
    }

    aDocument.getElementById("PhotoURI").value = photoURI;
    return true;
  },

  onShow(aCard, aDocument, aTargetID) {
    let photoName = gNewPhoto || aCard.getProperty("PhotoName", null);
    if (!photoName) {
      return false;
    }

    let photoURI = getPhotoURI(photoName);

    aDocument.getElementById(aTargetID).setAttribute("src", photoURI);
    return true;
  },

  onRead(aCard, aDocument) {
    let photoURI = aDocument.getElementById("PhotoURI").value;
    if (!photoURI) {
      return false;
    }

    gPhotoDownloadUI.onStart();

    let cbSuccess = function(newPhotoName) {
      gPhotoDownloadUI.onSuccess();

      newPhotoAdded(newPhotoName, aCard);

      webPhotoHandler.onShow(aCard, aDocument, "photo");
    };

    gImageDownloader.savePhoto(
      photoURI,
      cbSuccess,
      gPhotoDownloadUI.onError,
      gPhotoDownloadUI.onProgress
    );
    return true;
  },

  onSave(aCard, aDocument) {
    // Update contact
    if (gNewPhoto) {
      let photoURI = aDocument.getElementById("PhotoURI").value;
      aCard.setProperty("PhotoName", gNewPhoto);
      aCard.setProperty("PhotoURI", photoURI);
    }
    return true;
  },
};

function newPhotoAdded(aPhotoName, aCard) {
  // If we had the photo saved locally, schedule it for removal if card is saved.
  gOldPhotos.push(
    gNewPhoto !== null ? gNewPhoto : aCard.getProperty("PhotoName", null)
  );
  gNewPhoto = aPhotoName;
}

/* In order for other photo handlers to be recognized for
 * a particular type, they must be registered through this
 * function.
 * @param aType the type of photo to handle
 * @param aPhotoHandler the photo handler to register
 */
function registerPhotoHandler(aType, aPhotoHandler) {
  gPhotoHandlers[aType] = aPhotoHandler;
}

registerPhotoHandler("generic", genericPhotoHandler);
registerPhotoHandler("web", webPhotoHandler);
registerPhotoHandler("file", filePhotoHandler);
