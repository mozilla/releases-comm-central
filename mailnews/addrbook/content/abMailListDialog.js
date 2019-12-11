/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mail/components/addrbook/content/abCommon.js */
/* import-globals-from ../../../mail/components/compose/content/addressingWidgetOverlay.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { fixIterator, toXPCOMArray } = ChromeUtils.import(
  "resource:///modules/iteratorUtils.jsm"
);

top.MAX_RECIPIENTS = 1;
var inputElementType = "";

var gListCard;
var gEditList;
var gOldListName = "";
var gLoadListeners = [];
var gSaveListeners = [];

try {
  var gDragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
    Ci.nsIDragService
  );
} catch (e) {}

// Returns the load context for the current window
function getLoadContext() {
  return window.docShell.QueryInterface(Ci.nsILoadContext);
}

function mailingListExists(listname) {
  if (MailServices.ab.mailListNameExists(listname)) {
    Services.prompt.alert(
      window,
      gAddressBookBundle.getString("mailListNameExistsTitle"),
      gAddressBookBundle.getString("mailListNameExistsMessage")
    );
    return true;
  }
  return false;
}

/**
 * Get the new inputs from the create/edit mailing list dialog and use them to
 * update the mailing list that was passed in as an argument.
 *
 * @param {nsIAbDirectory} mailList - The mailing list object to update. When
 *   creating a new list it will be newly created and empty.
 * @param {boolean} isNewList - Whether we are populating a new list.
 * @return {boolean} - Whether the operation succeeded or not.
 */
function updateMailList(mailList, isNewList) {
  let listname = document.getElementById("ListName").value.trim();

  if (listname.length == 0) {
    alert(gAddressBookBundle.getString("emptyListName"));
    return false;
  }

  if (listname.match("  ")) {
    alert(gAddressBookBundle.getString("badListNameSpaces"));
    return false;
  }

  for (let char of ',;"<>') {
    if (listname.includes(char)) {
      alert(gAddressBookBundle.getString("badListNameCharacters"));
      return false;
    }
  }

  let canonicalNewListName = listname.toLowerCase();
  let canonicalOldListName = gOldListName.toLowerCase();
  if (isNewList || canonicalOldListName != canonicalNewListName) {
    if (mailingListExists(canonicalNewListName)) {
      return false;
    }
  }

  mailList.isMailList = true;
  mailList.dirName = listname;
  mailList.listNickName = document.getElementById("ListNickName").value;
  mailList.description = document.getElementById("ListDescription").value;

  return true;
}

/**
 * Updates the members of the mailing list.
 *
 * @param {nsIAbDirectory} mailList - The mailing list object to
 *   update. When creating a new list it will be newly created and empty.
 * @param {nsIAbDirectory} parentDirectory - The address book containing the
 *   mailing list.
 */
function updateMailListMembers(mailList, parentDirectory) {
  // Gather email address inputs into a single string (comma-separated).
  let addresses = Array.from(
    document.querySelectorAll(".textbox-addressingWidget"),
    element => element.value
  )
    .filter(value => value.trim())
    .join();

  // Convert the addresses string into address objects.
  let addressObjects = MailServices.headerParser.makeFromDisplayAddress(
    addresses
  );
  let existingCards = [...fixIterator(mailList.addressLists, Ci.nsIAbCard)];

  // Work out which addresses need to be added...
  let existingCardAddresses = existingCards.map(card => card.primaryEmail);
  let addressObjectsToAdd = addressObjects.filter(
    aObj => !existingCardAddresses.includes(aObj.email)
  );

  // ... and which need to be removed.
  let addressObjectAddresses = addressObjects.map(aObj => aObj.email);
  let cardsToRemove = existingCards.filter(
    card => !addressObjectAddresses.includes(card.primaryEmail)
  );

  for (let { email, name } of addressObjectsToAdd) {
    let card = parentDirectory.cardForEmailAddress(email);
    if (!card) {
      card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
        Ci.nsIAbCard
      );
      card.primaryEmail = email;
      card.displayName = name || email;
    }
    mailList.addCard(card);
  }

  if (cardsToRemove.length > 0) {
    mailList.deleteCards(toXPCOMArray(cardsToRemove, Ci.nsIMutableArray));
  }
}

function MailListOKButton(event) {
  var popup = document.getElementById("abPopup");
  if (popup) {
    var uri = popup.getAttribute("value");

    // FIX ME - hack to avoid crashing if no ab selected because of blank option bug from template
    // should be able to just remove this if we are not seeing blank lines in the ab popup
    if (!uri) {
      event.preventDefault();
      return; // don't close window
    }
    // -----

    // Add mailing list to database
    var mailList = Cc[
      "@mozilla.org/addressbook/directoryproperty;1"
    ].createInstance();
    mailList = mailList.QueryInterface(Ci.nsIAbDirectory);

    if (updateMailList(mailList, true)) {
      var parentDirectory = GetDirectoryFromURI(uri);
      mailList = parentDirectory.addMailList(mailList);
      updateMailListMembers(mailList, parentDirectory);
      NotifySaveListeners(mailList);
    } else {
      event.preventDefault();
    }
  }
}

function OnLoadNewMailList() {
  var selectedAB = null;

  InitCommonJS();

  if ("arguments" in window && window.arguments[0]) {
    var abURI = window.arguments[0].selectedAB;
    if (abURI && abURI != kAllDirectoryRoot + "?") {
      var directory = GetDirectoryFromURI(abURI);
      if (directory.isMailList) {
        var parentURI = GetParentDirectoryFromMailingListURI(abURI);
        if (parentURI) {
          selectedAB = parentURI;
        }
      } else if (directory.readOnly) {
        selectedAB = kPersonalAddressbookURI;
      } else {
        selectedAB = abURI;
      }
    }
  }

  if (!selectedAB) {
    selectedAB = kPersonalAddressbookURI;
  }

  // set popup with address book names
  var abPopup = document.getElementById("abPopup");
  abPopup.value = selectedAB;

  AppendNewRowAndSetFocus();
  awFitDummyRows(1);

  if (AppConstants.MOZ_APP_NAME == "seamonkey") {
    /* global awDocumentKeyPress */
    document.addEventListener("keypress", awDocumentKeyPress, true);
  }

  // focus on first name
  var listName = document.getElementById("ListName");
  if (listName) {
    setTimeout(
      function(firstTextBox) {
        firstTextBox.focus();
      },
      0,
      listName
    );
  }

  NotifyLoadListeners(directory);

  let input = document.getElementById("addressCol1#1");
  input.popup.addEventListener("click", () => {
    awReturnHit(input);
  });
}

function EditListOKButton(event) {
  // edit mailing list in database
  if (updateMailList(gEditList, false)) {
    let parentURI = GetParentDirectoryFromMailingListURI(gEditList.URI);
    let parentDirectory = GetDirectoryFromURI(parentURI);
    updateMailListMembers(gEditList, parentDirectory);
    if (gListCard) {
      // modify the list card (for the results pane) from the mailing list
      gListCard.displayName = gEditList.dirName;
      gListCard.lastName = gEditList.dirName;
      gListCard.setProperty("NickName", gEditList.listNickName);
      gListCard.setProperty("Notes", gEditList.description);
    }

    NotifySaveListeners(gEditList);
    gEditList.editMailListToDatabase(gListCard);

    window.arguments[0].refresh = true;
    return; // close the window
  }
  event.preventDefault();
}

function OnLoadEditList() {
  InitCommonJS();

  gListCard = window.arguments[0].abCard;
  var listUri = window.arguments[0].listURI;

  gEditList = GetDirectoryFromURI(listUri);

  document.getElementById("ListName").value = gEditList.dirName;
  document.getElementById("ListNickName").value = gEditList.listNickName;
  document.getElementById("ListDescription").value = gEditList.description;
  gOldListName = gEditList.dirName;

  document.title = gAddressBookBundle.getFormattedString(
    "mailingListTitleEdit",
    [gOldListName]
  );

  if (gEditList.addressLists) {
    let total = gEditList.addressLists.length;
    if (total) {
      let listbox = document.getElementById("addressingWidget");
      let newListBoxNode = listbox.cloneNode(false);
      let templateNode = listbox.querySelector("richlistitem");

      top.MAX_RECIPIENTS = 0;
      for (let i = 0; i < total; i++) {
        let card = gEditList.addressLists.queryElementAt(i, Ci.nsIAbCard);
        let address = MailServices.headerParser
          .makeMailboxObject(card.displayName, card.primaryEmail)
          .toString();
        SetInputValue(address, newListBoxNode, templateNode);
      }
      listbox.parentNode.replaceChild(newListBoxNode, listbox);
    }
  }

  // Is this directory read-only? If so, we now need to set all the fields to
  // read-only.
  if (gEditList.readOnly) {
    const kMailListFields = ["ListName", "ListNickName", "ListDescription"];

    for (let i = 0; i < kMailListFields.length; ++i) {
      document.getElementById(kMailListFields[i]).readOnly = true;
    }

    document.querySelector("dialog").buttons = "accept";

    // Getting a sane read-only implementation for the addressing widget would
    // basically need a separate dialog. Given I'm not sure about the future of
    // the mailing list dialog in its current state, let's just disable it
    // completely.
    document.getElementById("addressingWidget").disabled = true;
  } else {
    document.addEventListener("dialogaccept", EditListOKButton);
  }

  if (AppConstants.MOZ_APP_NAME == "seamonkey") {
    document.addEventListener("keypress", awDocumentKeyPress, true);
  }

  // workaround for bug 118337 - for mailing lists that have more rows than fits inside
  // the display, the value of the textbox inside the new row isn't inherited into the input -
  // the first row then appears to be duplicated at the end although it is actually empty.
  // see awAppendNewRow which copies first row and clears it
  setTimeout(AppendLastRow, 0);
  NotifyLoadListeners(gEditList);

  document.querySelectorAll(`input[is="autocomplete-input"]`).forEach(input => {
    input.popup.addEventListener("click", () => {
      awReturnHit(input);
    });
  });
}

function AppendLastRow() {
  AppendNewRowAndSetFocus();
  awFitDummyRows(1);

  // focus on first name
  let listName = document.getElementById("ListName");
  if (listName) {
    listName.focus();
  }
}

function AppendNewRowAndSetFocus() {
  let lastInput = awGetInputElement(top.MAX_RECIPIENTS);
  if (lastInput && lastInput.value) {
    awAppendNewRow(true);
  } else {
    awSetFocusTo(lastInput);
  }
}

function SetInputValue(inputValue, parentNode, templateNode) {
  top.MAX_RECIPIENTS++;

  var newNode = templateNode.cloneNode(true);
  parentNode.appendChild(newNode); // we need to insert the new node before we set the value of the select element!

  var input = newNode.querySelector(`input[is="autocomplete-input"]`);
  if (input) {
    input.value = inputValue;
    input.setAttribute("id", "addressCol1#" + top.MAX_RECIPIENTS);
    input.popup.addEventListener("click", () => {
      awReturnHit(input);
    });
  }
}

function awClickEmptySpace(target, setFocus) {
  if (target == null || target.localName != "hbox") {
    return;
  }

  let lastInput = awGetInputElement(top.MAX_RECIPIENTS);

  if (lastInput && lastInput.value) {
    awAppendNewRow(setFocus);
  } else if (setFocus) {
    awSetFocusTo(lastInput);
  }
}

function awReturnHit(inputElement) {
  let row = awGetRowByInputElement(inputElement);
  if (inputElement.value) {
    let nextInput = awGetInputElement(row + 1);
    if (!nextInput) {
      awAppendNewRow(true);
    } else {
      awSetFocusTo(nextInput);
    }
  }
}

function awDeleteRow(rowToDelete) {
  /* When we delete a row, we must reset the id of others row in order to not break the sequence */
  var maxRecipients = top.MAX_RECIPIENTS;
  awRemoveRow(rowToDelete);

  var numberOfCols = awGetNumberOfCols();
  for (var row = rowToDelete + 1; row <= maxRecipients; row++) {
    for (var col = 1; col <= numberOfCols; col++) {
      awGetElementByCol(row, col).setAttribute(
        "id",
        "addressCol" + col + "#" + (row - 1)
      );
    }
  }

  awTestRowSequence();
}

function awInputChanged(inputElement) {
  //  AutoCompleteAddress(inputElement);

  // Do we need to add a new row?
  var lastInput = awGetInputElement(top.MAX_RECIPIENTS);
  if (lastInput && lastInput.value && !top.doNotCreateANewRow) {
    awAppendNewRow(false);
  }
  top.doNotCreateANewRow = false;
}

/**
 * Append a new row.
 *
 * @param {boolean} setFocus  Whether to set the focus on the new row.
 * @return {Element?}         The input element from the new row.
 */
function awAppendNewRow(setFocus) {
  let body = document.getElementById("addressingWidget");
  let listitem1 = awGetListItem(1);
  let input;

  if (body && listitem1) {
    let nextDummy = awGetNextDummyRow();
    let newNode = listitem1.cloneNode(true);
    if (nextDummy) {
      body.replaceChild(newNode, nextDummy);
    } else {
      body.appendChild(newNode);
    }

    top.MAX_RECIPIENTS++;

    input = newNode.querySelector(`input[is="autocomplete-input"]`);
    if (input) {
      input.value = "";
      input.setAttribute("id", "addressCol1#" + top.MAX_RECIPIENTS);
      input.popup.addEventListener("click", () => {
        awReturnHit(input);
      });
    }
    // Focus the new input widget.
    if (setFocus && input) {
      awSetFocusTo(input);
    }
  }
  return input;
}

// functions for accessing the elements in the addressing widget

function awGetInputElement(row) {
  return document.getElementById("addressCol1#" + row);
}

function DragOverAddressListTree(event) {
  var dragSession = gDragService.getCurrentSession();

  // XXX add support for other flavors here
  if (dragSession.isDataFlavorSupported("text/x-moz-address")) {
    dragSession.canDrop = true;
  }
}

function DropOnAddressListTree(event) {
  let dragSession = gDragService.getCurrentSession();
  let trans;

  try {
    trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(
      Ci.nsITransferable
    );
    trans.init(getLoadContext());
    trans.addDataFlavor("text/x-moz-address");
  } catch (ex) {
    return;
  }

  for (let i = 0; i < dragSession.numDropItems; ++i) {
    dragSession.getData(trans, i);
    let dataObj = {};
    let bestFlavor = {};
    trans.getAnyTransferData(bestFlavor, dataObj);
    if (dataObj) {
      dataObj = dataObj.value.QueryInterface(Ci.nsISupportsString);
    }
    if (!dataObj) {
      continue;
    }

    // pull the URL out of the data object
    let address = dataObj.data.substring(0, dataObj.length);
    if (!address) {
      continue;
    }

    DropListAddress(event.target, address);
  }
}

function DropListAddress(target, address) {
  // Set focus on a new available, visible row.
  awClickEmptySpace(target, true);
  if (top.MAX_RECIPIENTS == 0) {
    top.MAX_RECIPIENTS = 1;
  }

  // Break apart the MIME-ready header address into individual addressees to
  // add to the dialog.
  let addresses = MailServices.headerParser.parseEncodedHeader(address);
  for (let addr of addresses) {
    let lastInput = awGetInputElement(top.MAX_RECIPIENTS);
    lastInput.value = addr.toString();
    awAppendNewRow(true);
  }
}

/* Allows extensions to register a listener function for
 * when a mailing list is loaded.  The listener function
 * should take two parameters - the first being the
 * mailing list being loaded, the second one being the
 * current window document.
 */
function RegisterLoadListener(aListener) {
  gLoadListeners.push(aListener);
}

/* Allows extensions to unload a load listener function.
 */
function UnregisterLoadListener(aListener) {
  var fIndex = gLoadListeners.indexOf(aListener);
  if (fIndex != -1) {
    gLoadListeners.splice(fIndex, 1);
  }
}

/* Allows extensions to register a listener function for
 * when a mailing list is saved.  Like a load listener,
 * the save listener should take two parameters: the first
 * being a copy of the mailing list that is being saved,
 * and the second being the current window document.
 */
function RegisterSaveListener(aListener) {
  gSaveListeners.push(aListener);
}

/* Allows extensions to unload a save listener function.
 */
function UnregisterSaveListener(aListener) {
  var fIndex = gSaveListeners.indexOf(aListener);
  if (fIndex != -1) {
    gSaveListeners.splice(fIndex, 1);
  }
}

/* Notifies all load listeners.
 */
function NotifyLoadListeners(aMailingList) {
  for (let i = 0; i < gLoadListeners.length; i++) {
    gLoadListeners[i](aMailingList, document);
  }
}

/* Notifies all save listeners.
 */
function NotifySaveListeners(aMailingList) {
  for (let i = 0; i < gSaveListeners.length; i++) {
    gSaveListeners[i](aMailingList, document);
  }
}
