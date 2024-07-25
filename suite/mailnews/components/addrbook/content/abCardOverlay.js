/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const kNonVcardFields =
        ["NickNameContainer", "SecondaryEmailContainer", "ScreenNameContainer",
         "customFields", "preferDisplayName"];

const kPhoneticFields =
        ["PhoneticLastName", "PhoneticLabel1", "PhoneticSpacer1",
         "PhoneticFirstName", "PhoneticLabel2", "PhoneticSpacer2"];

// Item is |[dialogField, cardProperty]|.
const kVcardFields =
        [ // Contact > Name
         ["FirstName", "FirstName"],
         ["LastName", "LastName"],
         ["DisplayName", "DisplayName"],
         ["NickName", "NickName"],
          // Contact > Internet
         ["PrimaryEmail", "PrimaryEmail"],
         ["SecondEmail", "SecondEmail"],
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
         ["Yahoo", "_Yahoo"],
         ["Skype", "_Skype"],
         ["QQ", "_QQ"],
         ["XMPP", "_JabberId"],
         ["IRC", "_IRC"]
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

function OnLoadNewCard()
{
  InitEditCard();

  gEditCard.card =
    (("arguments" in window) && (window.arguments.length > 0) &&
     (window.arguments[0] instanceof Ci.nsIAbCard))
    ? window.arguments[0]
    : Cc["@mozilla.org/addressbook/cardproperty;1"]
        .createInstance(Ci.nsIAbCard);
  gEditCard.titleProperty = "newContactTitle";
  gEditCard.selectedAB = "";

  if ("arguments" in window && window.arguments[0])
  {
    gEditCard.selectedAB = kPersonalAddressbookURI;

    if ("selectedAB" in window.arguments[0] &&
        (window.arguments[0].selectedAB != kAllDirectoryRoot + "?")) {
      // check if selected ab is a mailing list
      var abURI = window.arguments[0].selectedAB;

      var directory = GetDirectoryFromURI(abURI);
      if (directory.isMailList) {
        var parentURI = GetParentDirectoryFromMailingListURI(abURI);
        if (parentURI)
          gEditCard.selectedAB = parentURI;
      }
      else if (!directory.readOnly)
        gEditCard.selectedAB = window.arguments[0].selectedAB;
    }

    // we may have been given properties to pre-initialize the window with....
    // we'll fill these in here...
    if ("primaryEmail" in window.arguments[0])
      gEditCard.card.primaryEmail = window.arguments[0].primaryEmail;
    if ("displayName" in window.arguments[0]) {
      gEditCard.card.displayName = window.arguments[0].displayName;
      // if we've got a display name, don't generate
      // a display name (and stomp on the existing display name)
      // when the user types a first or last name
      if (gEditCard.card.displayName)
        gEditCard.generateDisplayName = false;
    }
    if ("okCallback" in window.arguments[0])
      gOkCallback = window.arguments[0].okCallback;

    if ("escapedVCardStr" in window.arguments[0]) {
      // hide non vcard values
      HideNonVcardFields();
      gEditCard.card = Cc["@mozilla.org/addressbook/msgvcardservice;1"]
                         .getService(Ci.nsIMsgVCardService)
                         .escapedVCardToAbCard(window.arguments[0].escapedVCardStr);
    }

    if ("titleProperty" in window.arguments[0])
      gEditCard.titleProperty = window.arguments[0].titleProperty;

    if ("hideABPicker" in window.arguments[0])
      gHideABPicker = window.arguments[0].hideABPicker;
  }

  // set popup with address book names
  var abPopup = document.getElementById('abPopup');
  abPopup.value = gEditCard.selectedAB || kPersonalAddressbookURI;

  if (gHideABPicker && abPopup) {
    abPopup.hidden = true;
    document.getElementById("abPopupLabel").hidden = true;
  }

  SetCardDialogTitle(gEditCard.card.displayName);

  GetCardValues(gEditCard.card, document);

  // FIX ME - looks like we need to focus on both the text field and the tab widget
  // probably need to do the same in the addressing widget

  // focus on first or last name based on the pref
  var focus = document.getElementById(gEditCard.displayLastNameFirst
                                      ? "LastName" : "FirstName");
  if (focus) {
    // XXX Using the setTimeout hack until bug 103197 is fixed
    setTimeout( function(firstTextBox) { firstTextBox.focus(); }, 0, focus );
  }
}

/**
 * Get the source directory containing the card we are editing.
 */
function getContainingDirectory() {
  let directory = GetDirectoryFromURI(gEditCard.abURI);
  // If the source directory is "All Address Books", find the parent
  // address book of the card being edited and reflect the changes in it.
  if (directory.URI == kAllDirectoryRoot + "?") {
    let dirId =
      gEditCard.card.directoryId
                    .substring(0, gEditCard.card.directoryId.indexOf("&"));
    directory = MailServices.ab.getDirectoryFromId(dirId);
  }
  return directory;
}

function EditCardOKButton()
{
  if (!CheckCardRequiredDataPresence(document))
    return false;  // don't close window

  // See if this card is in any mailing list
  // if so then we need to update the addresslists of those mailing lists
  let directory = getContainingDirectory();

  // if the directory is a mailing list we need to search all the mailing lists
  // in the parent directory if the card exists.
  if (directory.isMailList) {
    var parentURI = GetParentDirectoryFromMailingListURI(gEditCard.abURI);
    directory = GetDirectoryFromURI(parentURI);
  }

  var listDirectoriesCount = directory.addressLists.length;
  var foundDirectories = [];

  // create a list of mailing lists and the index where the card is at.
  for (let i = 0; i < listDirectoriesCount; i++)
  {
    var subdirectory = directory.addressLists.queryElementAt(i, Ci.nsIAbDirectory);
    if (subdirectory.isMailList)
    {
      // See if any card in this list is the one we edited.
      // Must compare card contents using .equals() instead of .indexOf()
      // because gEditCard is not really a member of the .addressLists array.
      let listCardsCount = subdirectory.addressLists.length;
      for (let index = 0; index < listCardsCount; index++)
      {
        let card = subdirectory.addressLists.queryElementAt(index, Ci.nsIAbCard);
        if (card.equals(gEditCard.card))
          foundDirectories.push({directory:subdirectory, cardIndex:index});
      }
    }
  }

  CheckAndSetCardValues(gEditCard.card, document, false);

  directory.modifyCard(gEditCard.card);

  while (foundDirectories.length)
  {
    // Update the addressLists item for this card
    let foundItem = foundDirectories.pop();
    foundItem.directory.addressLists.replaceElementAt(gEditCard.card, foundItem.cardIndex);
  }

  NotifySaveListeners(directory);

  // callback to allow caller to update
  if (gOkCallback)
    gOkCallback();

  return true;  // close the window
}

function EditCardCancelButton()
{
  // If a new photo was created, remove it now as it won't be used.
  purgeOldPhotos(false);
}

function OnLoadEditCard()
{
  InitEditCard();

  gEditCard.titleProperty = "editContactTitle";

  if (window.arguments && window.arguments[0])
  {
    if ( window.arguments[0].card )
      gEditCard.card = window.arguments[0].card;
    if ( window.arguments[0].okCallback )
      gOkCallback = window.arguments[0].okCallback;
    if ( window.arguments[0].abURI )
      gEditCard.abURI = window.arguments[0].abURI;
  }

  // set global state variables
  // if first or last name entered, disable generateDisplayName
  if (gEditCard.generateDisplayName &&
      (gEditCard.card.firstName.length +
       gEditCard.card.lastName.length +
       gEditCard.card.displayName.length > 0))
  {
    gEditCard.generateDisplayName = false;
  }

  GetCardValues(gEditCard.card, document);

  SetCardDialogTitle(gEditCard.card.displayName);

  // check if selectedAB is a writeable
  // if not disable all the fields
  if ("arguments" in window && window.arguments[0])
  {
    if ("abURI" in window.arguments[0]) {
      var abURI = window.arguments[0].abURI;
      var directory = GetDirectoryFromURI(abURI);

      if (directory.readOnly)
      {
        // Set all the editable vcard fields to read only
        for (var i = kVcardFields.length; i-- > 0; )
          document.getElementById(kVcardFields[i][0]).readOnly = true;

        // the birthday fields
        document.getElementById("Birthday").readOnly = true;
        document.getElementById("BirthYear").readOnly = true;
        document.getElementById("Age").readOnly = true;

        // the photo field and buttons
        document.getElementById("PhotoType").disabled        = true;
        document.getElementById("GenericPhotoList").disabled = true;
        document.getElementById("PhotoURI").disabled         = true;
        document.getElementById("PhotoURI").placeholder      = "";
        document.getElementById("BrowsePhoto").disabled      = true;
        document.getElementById("UpdatePhoto").disabled      = true;

        // And the phonetic fields
        document.getElementById(kPhoneticFields[0]).readOnly = true;
        document.getElementById(kPhoneticFields[3]).readOnly = true;

        // Also disable the mail format popup.
        document.getElementById("PreferMailFormatPopup").disabled = true;

        // And the "prefer display name" checkbox.
        document.getElementById("preferDisplayName").disabled = true;

        document.documentElement.buttons = "accept";
        document.documentElement.removeAttribute("ondialogaccept");
      }
    }
  }
}

/* Registers functions that are called when loading the card
 * values into the contact editor dialog.  This is useful if
 * extensions have added extra fields to the nsIAbCard, and
 * need to display them in the contact editor.
 */
function RegisterLoadListener(aFunc)
{
  gOnLoadListeners.push(aFunc);
}

function UnregisterLoadListener(aFunc)
{
  var fIndex = gOnLoadListeners.indexOf(aFunc);
  if (fIndex != -1)
    gOnLoadListeners.splice(fIndex, 1);
}

// Notifies load listeners that an nsIAbCard is being loaded.
function NotifyLoadListeners(aCard, aDoc)
{
  if (!gOnLoadListeners.length)
    return;

  for (let listener of gOnLoadListeners)
    listener(aCard, aDoc);
}

/* Registers functions that are called when saving the card
 * values.  This is useful if extensions have added extra
 * fields to the user interface, and need to set those values
 * in their nsIAbCard.
 */
function RegisterSaveListener(aFunc)
{
  gOnSaveListeners.push(aFunc);
}

function UnregisterSaveListener(aFunc)
{
  var fIndex = gOnSaveListeners.indexOf(aFunc);
  if (fIndex != -1)
    gOnSaveListeners.splice(fIndex, 1);
}

// Notifies save listeners that an nsIAbCard is being saved.
function NotifySaveListeners(directory)
{
  if (!gOnSaveListeners.length)
    return;

  for (let listener of gOnSaveListeners)
    listener(gEditCard.card, document);

  // the save listeners might have tweaked the card
  // in which case we need to commit it.
  directory.modifyCard(gEditCard.card);
}

function InitPhoneticFields()
{
  var showPhoneticFields =
    Services.prefs.getComplexValue("mail.addr_book.show_phonetic_fields",
      Ci.nsIPrefLocalizedString).data;

  // show phonetic fields if indicated by the pref
  if (showPhoneticFields == "true")
  {
    for (var i = kPhoneticFields.length; i-- > 0; )
      document.getElementById(kPhoneticFields[i]).hidden = false;
  }
}

function InitEditCard()
{
  InitPhoneticFields();

  InitCommonJS();
  // Create gEditCard object that contains global variables for the current js
  //   file.
  gEditCard = new Object();

  // get specific prefs that gEditCard will need
  try {
    var displayLastNameFirst =
      Services.prefs.getComplexValue("mail.addr_book.displayName.lastnamefirst",
        Ci.nsIPrefLocalizedString).data;
    gEditCard.displayLastNameFirst = (displayLastNameFirst == "true");
    gEditCard.generateDisplayName =
      Services.prefs.getBoolPref("mail.addr_book.displayName.autoGeneration");
  }
  catch (ex) {
    dump("ex: failed to get pref" + ex + "\n");
  }
}

function NewCardOKButton()
{
  if (gOkCallback)
  {
    if (!CheckAndSetCardValues(gEditCard.card, document, true))
      return false;  // don't close window

    gOkCallback(gEditCard.card.translateTo("vcard"));
    return true;  // close the window
  }

  var popup = document.getElementById('abPopup');
  if ( popup )
  {
    var uri = popup.value;

    // FIX ME - hack to avoid crashing if no ab selected because of blank option bug from template
    // should be able to just remove this if we are not seeing blank lines in the ab popup
    if ( !uri )
      return false;  // don't close window
    // -----

    if (gEditCard.card)
    {
      if (!CheckAndSetCardValues(gEditCard.card, document, true))
        return false;  // don't close window

      // replace gEditCard.card with the card we added
      // so that save listeners can get / set attributes on
      // the card that got created.
      var directory = GetDirectoryFromURI(uri);
      gEditCard.card = directory.addCard(gEditCard.card);
      NotifySaveListeners(directory);
    }
  }

  return true;  // close the window
}

function NewCardCancelButton()
{
  // If a new photo was created, remove it now as it won't be used.
  purgeOldPhotos(false);
}

// Move the data from the cardproperty to the dialog
function GetCardValues(cardproperty, doc)
{
  if (!cardproperty)
    return;

  // Pass the nsIAbCard and the Document through the listeners
  // to give extensions a chance to populate custom fields.
  NotifyLoadListeners(cardproperty, doc);

  for (var i = kVcardFields.length; i-- > 0; ) {
    doc.getElementById(kVcardFields[i][0]).value =
      cardproperty.getProperty(kVcardFields[i][1], "");
  }

  var birthday = doc.getElementById("Birthday");
  modifyDatepicker(birthday);

  // Get the year first, so that the following month/day
  // calculations can take leap years into account.
  var year = cardproperty.getProperty("BirthYear", null);
  var birthYear = doc.getElementById("BirthYear");
  // set the year in the datepicker to the stored year
  // if the year isn't present, default to 2000 (a leap year)
  birthday.year = saneBirthYear(year);
  birthYear.value = year;

  // get the month of the year (1 - 12)
  var month = cardproperty.getProperty("BirthMonth", null);
  if (month > 0 && month < 13)
    birthday.month = month - 1;
  else
    birthday.monthField.value = null;

  // get the date of the month (1 - 31)
  var date = cardproperty.getProperty("BirthDay", null);
  if (date > 0 && date < 32)
    birthday.date = date;
  else
    birthday.dateField.value = null;

  // get the current age
  calculateAge(null, birthYear);
  // when the birth year changes, update the datepicker's year to the new value
  // or to kDefaultYear if the value is null
  birthYear.onchange = calculateAge;
  birthday.onchange = calculateAge;
  var age = doc.getElementById("Age");
  age.onchange = calculateYear;

  var popup = document.getElementById("PreferMailFormatPopup");
  if (popup)
    popup.value = cardproperty.getProperty("PreferMailFormat", "");

  var preferDisplayNameEl = document.getElementById("preferDisplayName");
  if (preferDisplayNameEl)
    // getProperty may return a "1" or "0" string, we want a boolean
    preferDisplayNameEl.checked = cardproperty.getProperty("PreferDisplayName", true) != false;

  // get phonetic fields if exist
  try {
    doc.getElementById("PhoneticFirstName").value = cardproperty.getProperty("PhoneticFirstName", "");
    doc.getElementById("PhoneticLastName").value = cardproperty.getProperty("PhoneticLastName", "");
  }
  catch (ex) {}

  // Select the type if there is a valid value stored for that type, otherwise
  // select the generic photo
  loadPhoto(cardproperty);

  updateChatName();
}

// when the ab card dialog is being loaded to show a vCard,
// hide the fields which aren't supported
// by vCard so the user does not try to edit them.
function HideNonVcardFields()
{
  document.getElementById("homeTabButton").hidden = true;
  document.getElementById("photoTabButton").hidden = true;
  var i;
  for (i = kNonVcardFields.length; i-- > 0; )
    document.getElementById(kNonVcardFields[i]).collapsed = true;
  for (i = kPhoneticFields.length; i-- > 0; )
    document.getElementById(kPhoneticFields[i]).collapsed = true;
}

// Move the data from the dialog to the cardproperty to be stored in the database
// @Returns false - Some required data are missing (card values were not set);
//          true - Card values were set, or there is no card to set values on.
function CheckAndSetCardValues(cardproperty, doc, check)
{
  // If requested, check the required data presence.
  if (check && !CheckCardRequiredDataPresence(document))
    return false;

  if (!cardproperty)
    return true;

  for (var i = kVcardFields.length; i-- > 0; )
    cardproperty.setProperty(kVcardFields[i][1],
      doc.getElementById(kVcardFields[i][0]).value);

  // get the birthday information from the dialog
  var birthdayElem = doc.getElementById("Birthday");
  var birthMonth = birthdayElem.monthField.value;
  var birthDay = birthdayElem.dateField.value;
  var birthYear = doc.getElementById("BirthYear").value;

  // set the birth day, month, and year properties
  cardproperty.setProperty("BirthDay", birthDay);
  cardproperty.setProperty("BirthMonth", birthMonth);
  cardproperty.setProperty("BirthYear", birthYear);

  var popup = document.getElementById("PreferMailFormatPopup");
  if (popup)
    cardproperty.setProperty("PreferMailFormat", popup.value);

  var preferDisplayNameEl = document.getElementById("preferDisplayName");
  if (preferDisplayNameEl)
    cardproperty.setProperty("PreferDisplayName", preferDisplayNameEl.checked);

  // set phonetic fields if exist
  try {
    cardproperty.setProperty("PhoneticFirstName", doc.getElementById("PhoneticFirstName").value);
    cardproperty.setProperty("PhoneticLastName", doc.getElementById("PhoneticLastName").value);
  }
  catch (ex) {}

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

  // Remove obsolete chat names.
  try {
    cardproperty.setProperty("_GoogleTalk", "");
  }
  catch (ex) {}
  try {
    cardproperty.setProperty("_AimScreenName", "");
  }
  catch (ex) {}
  try {
    cardproperty.setProperty("_MSN", "");
  }
  catch (ex) {}
  try {
    cardproperty.setProperty("_ICQ", "");
  }
  catch (ex) {}

  return true;
}

function CleanUpWebPage(webPage)
{
  // no :// yet so we should add something
  if ( webPage.length && webPage.search("://") == -1 )
  {
    // check for missing / on http://
    if ( webPage.substr(0, 6) == "http:/" )
      return( "http://" + webPage.substr(6) );
    else
      return( "http://" + webPage );
  }
  else
    return(webPage);
}

// @Returns false - Some required data are missing;
//          true - All required data are present.
function CheckCardRequiredDataPresence(doc)
{
  // Bug 314995 - We require at least one of the following fields to be
  // filled in: email address, first name, last name, display name,
  //            organization (company name).
  var primaryEmail = doc.getElementById("PrimaryEmail");
  if (primaryEmail.textLength == 0 &&
      doc.getElementById("FirstName").textLength == 0 &&
      doc.getElementById("LastName").textLength == 0 &&
      doc.getElementById("DisplayName").textLength == 0 &&
      doc.getElementById("Company").textLength == 0)
  {
    Services.prompt.alert(window,
      gAddressBookBundle.getString("cardRequiredDataMissingTitle"),
      gAddressBookBundle.getString("cardRequiredDataMissingMessage"));

    return false;
  }

  // Simple checks that the primary email should be of the form |user@host|.
  // Note: if the length of the primary email is 0 then we skip the check
  // as some other field must have something as per the check above.
  if (primaryEmail.textLength != 0 && !/.@./.test(primaryEmail.value))
  {
    Services.prompt.alert(window,
      gAddressBookBundle.getString("incorrectEmailAddressFormatTitle"),
      gAddressBookBundle.getString("incorrectEmailAddressFormatMessage"));

    // Focus the dialog field, to help the user.
    document.getElementById("abTabs").selectedIndex = 0;
    primaryEmail.focus();

    return false;
  }

  return true;
}

function GenerateDisplayName()
{
  if (!gEditCard.generateDisplayName)
    return;

  var displayName;

  var firstNameValue = document.getElementById("FirstName").value;
  var lastNameValue = document.getElementById("LastName").value;
  if (lastNameValue && firstNameValue) {
    displayName = (gEditCard.displayLastNameFirst)
      ? gAddressBookBundle.getFormattedString("lastFirstFormat", [lastNameValue, firstNameValue])
      : gAddressBookBundle.getFormattedString("firstLastFormat", [firstNameValue, lastNameValue]);
  }
  else {
    // one (or both) of these is empty, so this works.
    displayName = firstNameValue + lastNameValue;
  }

  document.getElementById("DisplayName").value = displayName;

  SetCardDialogTitle(displayName);
}

function DisplayNameChanged()
{
  // turn off generateDisplayName if the user changes the display name
  gEditCard.generateDisplayName = false;

  SetCardDialogTitle(document.getElementById("DisplayName").value);
}

function SetCardDialogTitle(displayName)
{
  document.title = displayName
    ? gAddressBookBundle.getFormattedString(gEditCard.titleProperty + "WithDisplayName", [displayName])
    : gAddressBookBundle.getString(gEditCard.titleProperty);
}

/**
 * Calculates the duration of time between an event and now and updates the year
 * of whichever element did not call this function.
 * @param aEvent   The event calling this method.
 * @param aElement Optional, but required if this function is not called from an
 *                 element's event listener. The element that would call this.
 */
function calculateAge(aEvent, aElement) {
  var datepicker, yearElem, ageElem;
  if (aEvent)
    aElement = this;
  if (aElement.id == "BirthYear" || aElement.id == "Birthday") {
    datepicker = document.getElementById("Birthday");
    yearElem = document.getElementById("BirthYear");
    ageElem = document.getElementById("Age");
  }
  if (!datepicker || !yearElem || !ageElem)
    return;

  // if the datepicker was updated, update the year element
  if (aElement == datepicker && !(datepicker.year == kDefaultYear && !yearElem.value))
    yearElem.value = datepicker.year;
  var year = yearElem.value;
  // if the year element's value is invalid set the year and age elements to null
  if (isNaN(year) || year < kMinYear || year > kMaxYear) {
    yearElem.value = null;
    ageElem.value = null;
    datepicker.year = kDefaultYear;
    return;
  }
  else if (aElement == yearElem)
    datepicker.year = year;
  // calculate the length of time between the event and now
  try {
    var event = new Date(datepicker.year, datepicker.month, datepicker.date);
    // if the year is only 2 digits, then the year won't be set correctly
    // using setFullYear fixes this issue
    event.setFullYear(datepicker.year);
    // get the difference between today and the event
    var age = new Date(new Date() - event);
    // get the number of years of the difference and subtract 1970 (epoch)
    ageElem.value = age.getFullYear() - 1970;
  }
  catch(e) {
    datepicker.year = kDefaultYear;
    // if there was an error (like invalid year) set the year and age to null
    yearElem.value = null;
    ageElem.value = null;
  }
}

/**
 * Calculates the year an event ocurred based on the number of years, months,
 * and days since the event and updates the relevant element.
 * @param aEvent   The event calling this method.
 * @param aElement Optional, but required if this function is not called from an
 *                 element's event listener. The element that would call this.
 */
function calculateYear(aEvent, aElement) {
  var yearElem, datepicker;
  if (aEvent)
    aElement = this;
  if (aElement.id == "Age") {
    datepicker = document.getElementById("Birthday");
    yearElem = document.getElementById("BirthYear");
  }
  if (!datepicker || !yearElem)
    return;

  // if the age is null, remove the year from the year element, and set the
  // datepicker to the default year
  if (!aElement.value) {
    datepicker.year = kDefaultYear;
    yearElem.value = null;
    return;
  }
  var today = new Date();
  try {
    var date = new Date(aElement.value, datepicker.month, datepicker.date);
    date.setFullYear(aElement.value);
    // get the difference between today and the age (the year is offset by 1970)
    var difference = new Date(today - date);
    datepicker.year = yearElem.value = difference.getFullYear() - 1970;
  }
  // the above code may throw an invalid year exception.  If that happens, set
  // the year to kDefaultYear and set the year element's value to 0
  catch (e) {
    datepicker.year = kDefaultYear;
    // if there was an error (like invalid year) set the year and age to null
    yearElem.value = null;
    let ageElem = document.getElementById("Age");
    if (ageElem)
      ageElem.value = null;
  }
}

/**
 * Modifies a datepicker in the following ways:
 *  - Removes the scroll arrows
 *  - Hides the year
 *  - Allows the day and month to be blank
 * NOTE:
 * The datepicker's date, month, year, and dateValue properties are not always
 * what appear physically to the user in the datepicker fields.
 * If any field is blank, the corresponding property is either the previous
 * value if there was one since the card was opened or the relevant portion of
 * the current date.
 *
 * To get the displayed values, get the value of the individual field, such as
 * datepicker.yyyyField.value where yyyy is "year", "month", or "date" for the
 * year, month, and day, respectively.
 * If the value is null, then the field is blank and vice versa.
 * @param aDatepicker The datepicker to modify.
 */
function modifyDatepicker(aDatepicker) {
  // collapse the year field and separator
  aDatepicker.yearField.parentNode.collapsed = true;
  if (aDatepicker.yearField == aDatepicker._fieldThree ||
      aDatepicker.yearField == aDatepicker._fieldTwo)
    aDatepicker._separatorSecond.collapsed = true;
  else
    aDatepicker._separatorFirst.collapsed = true;
  // collapse the spinner element
  document.getAnonymousElementByAttribute(aDatepicker, "anonid", "buttons")
          .collapsed = true;
  // this modified constrain value function ignores values less than the minimum
  // to let the value be blank (null)
  // from: mozilla/toolkit/content/widgets/datetimepicker.xml#759
  aDatepicker._constrainValue = function newConstrainValue(aField, aValue, aNoWrap) {
    // if the value is less than one, make the field's value null
    if (aValue < 1) {
      aField.value = null;
      return null;
    }
    if (aNoWrap && aField == this.monthField)
      aValue--;
    // make sure the date is valid for the given month
    if (aField == this.dateField) {
      var currentMonth = this.month;
      var dt = new Date(this.year, currentMonth, aValue);
      return dt.getMonth() != currentMonth ? 1 : aValue;
    }
    var min = (aField == this.monthField) ? 0 : 1;
    var max = (aField == this.monthField) ? 11 : kMaxYear;
    // make sure the value isn't too high
    if (aValue > max)
      return aNoWrap ? max : min;
    return aValue;
  }
  // sets the specified field to the given value, but allows blank fields
  // from: mozilla/toolkit/content/widgets/datetimepicker.xml#698
  aDatepicker._setFieldValue = function setValue(aField, aValue) {
    if (aField == this.yearField && aValue >= kMinYear && aValue <= kMaxYear) {
      var oldDate = this._dateValue;
      this._dateValue.setFullYear(aValue);
      if (oldDate != this._dateValue) {
        this._dateValue.setDate(0);
        this._updateUI(this.dateField, this.date);
      }
    }
    // update the month if the value isn't null
    else if (aField == this.monthField && aValue != null) {
      var oldDate = this.date;
      this._dateValue.setMonth(aValue);
      if (oldDate != this.date)
        this._dateValue.setDate(0);
      this._updateUI(this.dateField, this.date);
      var date = this._dateValue.getDate();
      this.dateField.value = date < 10 && this.dateLeadingZero ? "0" + date : date;
      var month = this._dateValue.getMonth() + 1;
      this.monthField.value = month < 10 && this.monthLeadingZero ? "0" + month : month;
    }
    // update the date if the value isn't null
    else if (aField == this.dateField && aValue != null) {
      this._dateValue.setDate(aValue);
      this._updateUI(this.dateField, this.date);
      var date = this._dateValue.getDate();
      this.dateField.value = date < 10 && this.dateLeadingZero ? "0" + date : date;
      var month = this._dateValue.getMonth() + 1;
      this.monthField.value = month < 10 && this.monthLeadingZero ? "0" + month : month;
    }
    this.setAttribute("value", this.value);

    if (this.attachedControl)
      this.attachedControl._setValueNoSync(this._dateValue);
    // if the aField's value is null or 0, set both field's values to null
    if (!aField.value && aField != this.yearField) {
      this.dateField.value = null;
      this.monthField.value = null;
    }
    // make the field's value null if aValue is null and the field's value isn't
    if (aValue == null && aField.value != null)
      aField.value = null;
  }
}

var chatNameFieldIds =
  ["Yahoo", "Skype", "QQ", "XMPP", "IRC"];

/**
 * Show the 'Chat' tab and focus the first field that has a value, or
 * the first field if none of them has a value.
 */
function showChat()
{
  document.getElementById('abTabPanels').parentNode.selectedTab =
    document.getElementById('chatTabButton');
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
function updateChatName()
{
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
 * Event handler for when the user switches the type of
 * photo for the nsIAbCard being edited. Tries to initiate a
 * photo download.
 *
 * @param aPhotoType {string}  The type to switch to
 * @param aEvent {Event}       The event object if used as an event handler
 */
function onSwitchPhotoType(aPhotoType, aEvent) {
  if (!gEditCard)
    return;

  // Stop event propagation to the radiogroup command event in case that the
  // child button is pressed. Otherwise, the download is started twice in a row.
  if (aEvent) {
    aEvent.stopPropagation();
  }

  if (aPhotoType) {
    if (aPhotoType != document.getElementById("PhotoType").value) {
      document.getElementById("PhotoType").value = aPhotoType;
    }
  } else {
    aPhotoType = document.getElementById("PhotoType").value;
  }

  if (gPhotoHandlers[aPhotoType]) {
    if (!gPhotoHandlers[aPhotoType].onRead(gEditCard.card, document)) {
      onSwitchPhotoType("generic");
    }
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
  if (!aName)
    return false;
  // Get the directory with all the photos
  var file = getPhotosDir();
  // Get the photo (throws an exception for invalid names)
  try {
    file.append(aName);
    file.remove(false);
    return true;
  }
  catch (e) {}
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
    if (!aSaved && (gOldPhotos.length == 0)) {
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
 * If the user selects a file and clicks OK then the PhotoURI textbox is set
 * with a file URI pointing to that file and updatePhoto is called.
 *
 * @param aEvent {Event} The event object if used as an event handler.
 */
function browsePhoto(aEvent) {
  // Stop event propagation to the radiogroup command event in case that the
  // child button is pressed. Otherwise, the download is started twice in a row.
  if (aEvent)
    aEvent.stopPropagation();

  let fp = Cc["@mozilla.org/filepicker;1"]
             .createInstance(Ci.nsIFilePicker);
  fp.init(window, gAddressBookBundle.getString("browsePhoto"),
          Ci.nsIFilePicker.modeOpen);

  // Open the directory of the currently chosen photo (if any)
  let currentPhotoFile = document.getElementById("PhotoFile").file
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

  window.addEventListener("load", function load(event) {
    if (!elProgressbar)
      elProgressbar = document.getElementById("PhotoDownloadProgress");
    if (!elProgressLabel)
      elProgressLabel = document.getElementById("PhotoStatus");
    if (!elPhotoType)
      elPhotoType = document.getElementById("PhotoType");
    if (!elProgressContainer)
      elProgressContainer = document.getElementById("ProgressContainer");
  }, false);

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
    elProgressbar.value = percent;
    elProgressLabel.value = gAddressBookBundle.getString("stateImageSave");
  }

  return {
    onStart: onStart,
    onSuccess: onSuccess,
    onError: onError,
    onProgress: onProgress
  }
})();

/* A photo handler defines the behaviour of the contact editor
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

var gGenericPhotoHandler = {
  onLoad: function(aCard, aDocument) {
    return true;
  },

  onShow: function(aCard, aDocument, aTargetID) {
    // XXX TODO: this ignores any other value from the generic photos
    // menulist than "default".
    aDocument.getElementById(aTargetID)
             .setAttribute("src", defaultPhotoURI);
    return true;
  },

  onRead: function(aCard, aDocument) {
    gPhotoDownloadUI.onSuccess();

    newPhotoAdded("", aCard);

    gGenericPhotoHandler.onShow(aCard, aDocument, "photo");
    return true;
  },

  onSave: function(aCard, aDocument) {
    // XXX TODO: this ignores any other value from the generic photos
    // menulist than "default".

    // Update contact
    aCard.setProperty("PhotoName", "");
    aCard.setProperty("PhotoURI", "");
    return true;
  }
};

var gFilePhotoHandler = {

  onLoad: function(aCard, aDocument) {
    let photoURI = aCard.getProperty("PhotoURI", "");
    let file;
    try {
      // The original file may not exist anymore, but we still display it.
      file = Services.io.newURI(photoURI)
                        .QueryInterface(Ci.nsIFileURL)
                        .file;
    } catch (e) {}

    if (!file)
      return false;

    aDocument.getElementById("PhotoFile").file = file;
    return true;
  },

  onShow: function(aCard, aDocument, aTargetID) {
    let photoName = gNewPhoto || aCard.getProperty("PhotoName", null);
    let photoURI = getPhotoURI(photoName);
    aDocument.getElementById(aTargetID).setAttribute("src", photoURI);
    return true;
  },

  onRead: function(aCard, aDocument) {
    let file = aDocument.getElementById("PhotoFile").file;
    if (!file)
      return false;

    // If the local file has been removed/renamed, keep the current photo as is.
    if (!file.exists() || !file.isFile())
      return false;

    let photoURI = Services.io.newFileURI(file).spec;

    gPhotoDownloadUI.onStart();

    let cbSuccess = function(newPhotoName) {
      gPhotoDownloadUI.onSuccess();

      newPhotoAdded(newPhotoName, aCard);
      aDocument.getElementById("PhotoFile").setAttribute("PhotoURI", photoURI);

      gFilePhotoHandler.onShow(aCard, aDocument, "photo");
    };

    gImageDownloader.savePhoto(photoURI, cbSuccess,
                               gPhotoDownloadUI.onError,
                               gPhotoDownloadUI.onProgress);
    return true;
  },

  onSave: function(aCard, aDocument) {
    // Update contact
    if (gNewPhoto) {
      // The file may not be valid unless the photo has changed.
      let photoURI = aDocument.getElementById("PhotoFile").getAttribute("PhotoURI");
      aCard.setProperty("PhotoName", gNewPhoto);
      aCard.setProperty("PhotoURI", photoURI);
    }
    return true;
  }
};

var gWebPhotoHandler = {
  onLoad: function(aCard, aDocument) {
    let photoURI = aCard.getProperty("PhotoURI", null);

    if (!photoURI)
      return false;

    aDocument.getElementById("PhotoURI").value = photoURI;
    return true;
  },

  onShow: function(aCard, aDocument, aTargetID) {
    let photoName = gNewPhoto || aCard.getProperty("PhotoName", null);
    if (!photoName)
      return false;

    let photoURI = getPhotoURI(photoName);

    aDocument.getElementById(aTargetID).setAttribute("src", photoURI);
    return true;
  },

  onRead: function(aCard, aDocument) {
    let photoURI = aDocument.getElementById("PhotoURI").value;
    if (!photoURI)
      return false;

    gPhotoDownloadUI.onStart();

    let cbSuccess = function(newPhotoName) {
      gPhotoDownloadUI.onSuccess();

      newPhotoAdded(newPhotoName, aCard);

      gWebPhotoHandler.onShow(aCard, aDocument, "photo");

    }

    gImageDownloader.savePhoto(photoURI, cbSuccess,
                               gPhotoDownloadUI.onError,
                               gPhotoDownloadUI.onProgress);
    return true;
  },

  onSave: function(aCard, aDocument) {
    // Update contact
    if (gNewPhoto) {
      let photoURI = aDocument.getElementById("PhotoURI").value;
      aCard.setProperty("PhotoName", gNewPhoto);
      aCard.setProperty("PhotoURI", photoURI);
    }
    return true;
  }
};

function newPhotoAdded(aPhotoName, aCard) {
  // If we had the photo saved locally, shedule it for removal if card is saved.
  gOldPhotos.push(gNewPhoto !== null ? gNewPhoto : aCard.getProperty("PhotoName", null));
  gNewPhoto = aPhotoName;
}

/* In order for other photo handlers to be recognized for
 * a particular type, they must be registered through this
 * function.
 * @param aType the type of photo to handle
 * @param aPhotoHandler the photo handler to register
 */
function registerPhotoHandler(aType, aPhotoHandler)
{
  gPhotoHandlers[aType] = aPhotoHandler;
}

registerPhotoHandler("generic", gGenericPhotoHandler);
registerPhotoHandler("web", gWebPhotoHandler);
registerPhotoHandler("file", gFilePhotoHandler);
