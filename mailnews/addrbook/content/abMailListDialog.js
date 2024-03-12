/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mail/components/addrbook/content/abCommon.js */
/* import-globals-from ../../../mail/components/compose/content/addressingWidgetOverlay.js */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

top.MAX_RECIPIENTS = 1;

var gListCard;
var gEditList;
var gOldListName = "";

var gAWContentHeight = 0;
var gAWRowHeight = 0;
var gNumberOfCols = 0;

window.addEventListener("load", onAbListDialogLoad);
window.addEventListener("dragover", DragOverAddressListTree);
window.addEventListener("drop", DropOnAddressListTree);

function onAbListDialogLoad() {
  if (window.arguments[0].listURI) {
    document.getElementById("abListSelector").hidden = true;
    OnLoadEditList();
    return;
  }
  OnLoadNewMailList();
}

var test_addresses_sequence = false;

if (
  Services.prefs.getPrefType("mail.debug.test_addresses_sequence") ==
  Ci.nsIPrefBranch.PREF_BOOL
) {
  test_addresses_sequence = Services.prefs.getBoolPref(
    "mail.debug.test_addresses_sequence"
  );
}

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
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/addressbook/addressBook.properties"
    );
    Services.prompt.alert(
      window,
      bundle.GetStringFromName("mailListNameExistsTitle"),
      bundle.GetStringFromName("mailListNameExistsMessage")
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
 * @returns {boolean} - Whether the operation succeeded or not.
 */
function updateMailList(mailList, isNewList) {
  const bundle = Services.strings.createBundle(
    "chrome://messenger/locale/addressbook/addressBook.properties"
  );
  const listname = document.getElementById("ListName").value.trim();

  if (listname.length == 0) {
    alert(bundle.GetStringFromName("emptyListName"));
    return false;
  }

  if (listname.match("  ")) {
    alert(bundle.GetStringFromName("badListNameSpaces"));
    return false;
  }

  for (const char of ',;"<>') {
    if (listname.includes(char)) {
      alert(bundle.GetStringFromName("badListNameCharacters"));
      return false;
    }
  }

  const canonicalNewListName = listname.toLowerCase();
  const canonicalOldListName = gOldListName.toLowerCase();
  if (isNewList || canonicalOldListName != canonicalNewListName) {
    if (mailingListExists(listname)) {
      // After showing the "Mailing List Already Exists" error alert,
      // focus ListName input field for user to choose a different name.
      document.getElementById("ListName").focus();
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
  const addresses = Array.from(
    document.querySelectorAll(".textbox-addressingWidget"),
    element => element.value
  )
    .filter(value => value.trim())
    .join();

  // Convert the addresses string into address objects.
  const addressObjects =
    MailServices.headerParser.makeFromDisplayAddress(addresses);
  const existingCards = mailList.childCards;

  // Work out which addresses need to be added...
  const existingCardAddresses = existingCards.map(card => card.primaryEmail);
  const addressObjectsToAdd = addressObjects.filter(
    aObj => !existingCardAddresses.includes(aObj.email)
  );
  // Eliminate duplicate emails while retaining the first occurrence.
  const addressesToAdd = new Map(
    addressObjectsToAdd
      .reverse()
      .map(obj => [obj.email, obj.name])
      .reverse()
  );

  // ... and which need to be removed.
  const addressObjectAddresses = addressObjects.map(aObj => aObj.email);
  const cardsToRemove = existingCards.filter(
    card => !addressObjectAddresses.includes(card.primaryEmail)
  );

  for (const [email, name] of addressesToAdd) {
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
    mailList.deleteCards(cardsToRemove);
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
    var mailList =
      Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance();
    mailList = mailList.QueryInterface(Ci.nsIAbDirectory);

    if (updateMailList(mailList, true)) {
      var parentDirectory = GetDirectoryFromURI(uri);
      mailList = parentDirectory.addMailList(mailList);
      updateMailListMembers(mailList, parentDirectory);
      window.arguments[0].newListUID = mailList.UID;
      window.arguments[0].newListURI = mailList.URI;
    } else {
      event.preventDefault();
    }
  }
}

function OnLoadNewMailList() {
  var selectedAB = null;

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

    const cards = window.arguments[0].cards;
    if (cards && cards.length > 0) {
      const listbox = document.getElementById("addressingWidget");
      const newListBoxNode = listbox.cloneNode(false);
      const templateNode = listbox.querySelector("richlistitem");

      top.MAX_RECIPIENTS = 0;
      for (const card of cards) {
        const address = MailServices.headerParser
          .makeMailboxObject(card.displayName, card.primaryEmail)
          .toString();
        SetInputValue(address, newListBoxNode, templateNode);
      }
      listbox.parentNode.replaceChild(newListBoxNode, listbox);
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
      function (firstTextBox) {
        firstTextBox.focus();
      },
      0,
      listName
    );
  }

  const input = document.getElementById("addressCol1#1");
  input.popup.addEventListener("click", () => {
    awReturnHit(input);
  });

  document.addEventListener("dialogaccept", MailListOKButton);
}

function EditListOKButton(event) {
  // edit mailing list in database
  if (updateMailList(gEditList, false)) {
    const parentURI = GetParentDirectoryFromMailingListURI(gEditList.URI);
    const parentDirectory = GetDirectoryFromURI(parentURI);
    updateMailListMembers(gEditList, parentDirectory);
    if (gListCard) {
      // modify the list card (for the results pane) from the mailing list
      gListCard.displayName = gEditList.dirName;
      gListCard.lastName = gEditList.dirName;
      gListCard.setProperty("NickName", gEditList.listNickName);
      gListCard.setProperty("Notes", gEditList.description);
    }

    gEditList.editMailListToDatabase(gListCard);

    window.arguments[0].refresh = true;
    return; // close the window
  }
  event.preventDefault();
}

function OnLoadEditList() {
  gListCard = window.arguments[0].abCard;
  var listUri = window.arguments[0].listURI;

  gEditList = GetDirectoryFromURI(listUri);

  document.getElementById("ListName").value = gEditList.dirName;
  document.getElementById("ListNickName").value = gEditList.listNickName;
  document.getElementById("ListDescription").value = gEditList.description;
  gOldListName = gEditList.dirName;

  const bundle = Services.strings.createBundle(
    "chrome://messenger/locale/addressbook/addressBook.properties"
  );
  document.title = bundle.formatStringFromName("mailingListTitleEdit", [
    gOldListName,
  ]);

  const cards = gEditList.childCards;
  if (cards.length > 0) {
    const listbox = document.getElementById("addressingWidget");
    const newListBoxNode = listbox.cloneNode(false);
    const templateNode = listbox.querySelector("richlistitem");

    top.MAX_RECIPIENTS = 0;
    for (const card of cards) {
      const address = MailServices.headerParser
        .makeMailboxObject(card.displayName, card.primaryEmail)
        .toString();
      SetInputValue(address, newListBoxNode, templateNode);
    }
    listbox.parentNode.replaceChild(newListBoxNode, listbox);
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
  const listName = document.getElementById("ListName");
  if (listName) {
    listName.focus();
  }
}

function AppendNewRowAndSetFocus() {
  const lastInput = awGetInputElement(top.MAX_RECIPIENTS);
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
  const label = newNode.querySelector(`label.person-icon`);
  if (input) {
    input.value = inputValue;
    input.setAttribute("id", "addressCol1#" + top.MAX_RECIPIENTS);
    label.setAttribute("for", "addressCol1#" + top.MAX_RECIPIENTS);
    input.popup.addEventListener("click", () => {
      awReturnHit(input);
    });
  }
}

function awClickEmptySpace(target, setFocus) {
  if (target == null || target.localName != "hbox") {
    return;
  }

  const lastInput = awGetInputElement(top.MAX_RECIPIENTS);

  if (lastInput && lastInput.value) {
    awAppendNewRow(setFocus);
  } else if (setFocus) {
    awSetFocusTo(lastInput);
  }
}

function awReturnHit(inputElement) {
  const row = awGetRowByInputElement(inputElement);
  if (inputElement.value) {
    const nextInput = awGetInputElement(row + 1);
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

/**
 * Append a new row.
 *
 * @param {boolean} setFocus - Whether to set the focus on the new row.
 * @returns {Element?} The input element from the new row.
 */
function awAppendNewRow(setFocus) {
  const body = document.getElementById("addressingWidget");
  const listitem1 = awGetListItem(1);
  let input;
  let label;

  if (body && listitem1) {
    const nextDummy = awGetNextDummyRow();
    const newNode = listitem1.cloneNode(true);
    if (nextDummy) {
      body.replaceChild(newNode, nextDummy);
    } else {
      body.appendChild(newNode);
    }

    top.MAX_RECIPIENTS++;

    input = newNode.querySelector(`input[is="autocomplete-input"]`);
    label = newNode.querySelector(`label.person-icon`);
    if (input) {
      input.value = "";
      input.setAttribute("id", "addressCol1#" + top.MAX_RECIPIENTS);
      label.setAttribute("for", "addressCol1#" + top.MAX_RECIPIENTS);
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

/**
 * Returns the recipient inputbox for a row.
 *
 * @param {integer} row - Index of the recipient row to return. Starts at 1.
 * @returns {Element} This returns the input element.
 */
function awGetInputElement(row) {
  return document.getElementById("addressCol1#" + row);
}

function awGetElementByCol(row, col) {
  var colID = "addressCol" + col + "#" + row;
  return document.getElementById(colID);
}

function awGetListItem(row) {
  var listbox = document.getElementById("addressingWidget");
  if (listbox && row > 0) {
    return listbox.getItemAtIndex(row - 1);
  }

  return null;
}

/**
 * @param {Element} inputElement - The recipient input element.
 * @returns {integer} The row index (starting from 1) where the input element
 *   is found. 0 if the element is not found.
 */
function awGetRowByInputElement(inputElement) {
  if (!inputElement) {
    return 0;
  }

  var listitem = inputElement.parentNode.parentNode;
  return (
    document.getElementById("addressingWidget").getIndexOfItem(listitem) + 1
  );
}

function DragOverAddressListTree(event) {
  var dragSession = gDragService.getCurrentSession();

  // XXX add support for other flavors here
  if (dragSession.isDataFlavorSupported("text/x-moz-address")) {
    dragSession.canDrop = true;
  }
}

function DropOnAddressListTree(event) {
  const dragSession = gDragService.getCurrentSession();
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
    const bestFlavor = {};
    trans.getAnyTransferData(bestFlavor, dataObj);
    if (dataObj) {
      dataObj = dataObj.value.QueryInterface(Ci.nsISupportsString);
    }
    if (!dataObj) {
      continue;
    }

    // pull the URL out of the data object
    const address = dataObj.data.substring(0, dataObj.length);
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
  const addresses = MailServices.headerParser.parseEncodedHeader(address);
  for (const addr of addresses) {
    const lastInput = awGetInputElement(top.MAX_RECIPIENTS);
    lastInput.value = addr.toString();
    awAppendNewRow(true);
  }
}

/**
 * Handles keypress events for the email address inputs (that auto-fill)
 * in the Address Book Mailing List dialogs. When a comma-separated list of
 * addresses is entered on one row, split them into one address per row. Only
 * add a new blank row on "Enter" key. On "Tab" key focus moves to the "Cancel"
 * button.
 *
 * @param {KeyboardEvent} event - The DOM keypress event.
 * @param {Element} element - The element that triggered the keypress event.
 */
function awAbRecipientKeyPress(event, element) {
  if (event.key != "Enter" && event.key != "Tab") {
    return;
  }

  if (!element.value) {
    if (event.key == "Enter") {
      awReturnHit(element);
    }
  } else {
    let inputElement = element;
    const originalRow = awGetRowByInputElement(element);
    let row;
    const addresses = MailServices.headerParser.makeFromDisplayAddress(
      element.value
    );

    if (addresses.length > 1) {
      // Collect any existing addresses from the following rows so we don't
      // simply overwrite them.
      row = originalRow + 1;
      inputElement = awGetInputElement(row);

      while (inputElement) {
        if (inputElement.value) {
          addresses.push(inputElement.value);
          inputElement.value = "";
        }
        row += 1;
        inputElement = awGetInputElement(row);
      }
    }

    // Insert the addresses, adding new rows if needed.
    row = originalRow;
    let needNewRows = false;

    for (const address of addresses) {
      if (needNewRows) {
        inputElement = awAppendNewRow(false);
      } else {
        inputElement = awGetInputElement(row);
        if (!inputElement) {
          needNewRows = true;
          inputElement = awAppendNewRow(false);
        }
      }

      if (inputElement) {
        inputElement.value = address;
      }
      row += 1;
    }

    if (event.key == "Enter") {
      // Prevent the dialog from closing. "Enter" inserted a new row instead.
      event.preventDefault();
      awReturnHit(inputElement);
    } else if (event.key == "Tab") {
      // Focus the last row to let "Tab" move focus to the "Cancel" button.
      const lastRow = row - 1;
      awGetInputElement(lastRow).focus();
    }
  }
}

/**
 * Handle keydown event on a recipient input.
 * Enables recipient row deletion with DEL or BACKSPACE and
 * recipient list navigation with cursor up/down.
 *
 * Note that the keydown event fires for ALL keys, so this may affect
 * autocomplete as user enters a recipient text.
 *
 * @param {KeyboardEvent} event - The keydown event fired on a recipient input.
 * @param {HTMLInputElement} inputElement - The recipient input element
 *   on which the event fired (textbox-addressingWidget).
 */
function awRecipientKeyDown(event, inputElement) {
  switch (event.key) {
    // Enable deletion of empty recipient rows.
    case "Delete":
    case "Backspace":
      if (inputElement.value.length == 1 && event.repeat) {
        // User is holding down Delete or Backspace to delete recipient text
        // inline and is now deleting the last character: Set flag to
        // temporarily block row deletion.
        top.awRecipientInlineDelete = true;
      }
      if (!inputElement.value && !event.altKey) {
        // When user presses DEL or BACKSPACE on an empty row, and it's not an
        // ongoing inline deletion, and not ALT+BACKSPACE for input undo,
        // we delete the row.
        if (top.awRecipientInlineDelete && !event.repeat) {
          // User has released and re-pressed Delete or Backspace key
          // after holding them down to delete recipient text inline:
          // unblock row deletion.
          top.awRecipientInlineDelete = false;
        }
        if (!top.awRecipientInlineDelete) {
          const deleteForward = event.key == "Delete";
          awDeleteHit(inputElement, deleteForward);
        }
      }
      break;

    // Enable browsing the list of recipients up and down with cursor keys.
    case "ArrowDown":
    case "ArrowUp":
      // Only browse recipients if the autocomplete popup is not open.
      if (!inputElement.popupOpen) {
        const row = awGetRowByInputElement(inputElement);
        const down = event.key == "ArrowDown";
        const noEdgeRow = down ? row < top.MAX_RECIPIENTS : row > 1;
        if (noEdgeRow) {
          const targetRow = down ? row + 1 : row - 1;
          awSetFocusTo(awGetInputElement(targetRow));
        }
      }
      break;
  }
}

/**
 * Delete recipient row (addressingWidgetItem) from UI.
 *
 * @param {HTMLInputElement} inputElement - The recipient input element.
 *   textbox-addressingWidget) whose parent row (addressingWidgetItem) will be
 *   deleted.
 * @param {boolean} deleteForward - true: focus next row after deleting the row
 *   false: focus previous row after deleting the row
 */
function awDeleteHit(inputElement, deleteForward = false) {
  const row = awGetRowByInputElement(inputElement);

  // Don't delete the row if it's the last one remaining; just reset it.
  if (top.MAX_RECIPIENTS <= 1) {
    inputElement.value = "";
    return;
  }

  // Set the focus to the input field of the next/previous row according to
  // the direction of deleting if possible.
  // Note: awSetFocusTo() is asynchronous, i.e. we'll focus after row removal.
  if (
    (!deleteForward && row > 1) ||
    (deleteForward && row == top.MAX_RECIPIENTS)
  ) {
    // We're deleting backwards, but not the first row,
    // or forwards on the last row: Focus previous row.
    awSetFocusTo(awGetInputElement(row - 1));
  } else {
    // We're deleting forwards, but not the last row,
    // or backwards on the first row: Focus next row.
    awSetFocusTo(awGetInputElement(row + 1));
  }

  // Delete the row.
  awDeleteRow(row);
}

function awTestRowSequence() {
  /*
    This function is for debug and testing purpose only, normal user should not run it!

    Every time we insert or delete a row, we must be sure we didn't break the ID sequence of
    the addressing widget rows. This function will run a quick test to see if the sequence still ok

    You need to define the pref mail.debug.test_addresses_sequence to true in order to activate it
  */

  if (!test_addresses_sequence) {
    return true;
  }

  // Debug code to verify the sequence is still good.

  const listbox = document.getElementById("addressingWidget");
  const listitems = listbox.itemChildren;
  if (listitems.length >= top.MAX_RECIPIENTS) {
    for (let i = 1; i <= listitems.length; i++) {
      const item = listitems[i - 1];
      const inputID = item
        .querySelector(`input[is="autocomplete-input"]`)
        .id.split("#")[1];
      const menulist = item.querySelector("menulist");
      // In some places like the mailing list dialog there is no menulist,
      // and so no popupID that needs to be kept in sequence.
      const popupID = menulist && menulist.id.split("#")[1];
      if (inputID != i || (popupID && popupID != i)) {
        dump(
          `#ERROR: sequence broken at row ${i}, ` +
            `inputID=${inputID}, popupID=${popupID}\n`
        );
        return false;
      }
      dump("---SEQUENCE OK---\n");
      return true;
    }
  } else {
    dump(
      `#ERROR: listitems.length(${listitems.length}) < ` +
        `top.MAX_RECIPIENTS(${top.MAX_RECIPIENTS})\n`
    );
  }

  return false;
}

function awRemoveRow(row) {
  awGetListItem(row).remove();
  awFitDummyRows();

  top.MAX_RECIPIENTS--;
}

function awGetNumberOfCols() {
  if (gNumberOfCols == 0) {
    var listbox = document.getElementById("addressingWidget");
    var listCols = listbox.getElementsByTagName("treecol");
    gNumberOfCols = listCols.length;
    if (!gNumberOfCols) {
      // If no cols defined, that means we have only one!
      gNumberOfCols = 1;
    }
  }

  return gNumberOfCols;
}

function awCreateDummyItem(aParent) {
  var listbox = document.getElementById("addressingWidget");
  var item = listbox.getItemAtIndex(0);

  var titem = document.createXULElement("richlistitem");
  titem.setAttribute("_isDummyRow", "true");
  titem.setAttribute("class", "dummy-row");
  titem.style.height = item.getBoundingClientRect().height + "px";

  for (let i = 0; i < awGetNumberOfCols(); i++) {
    const cell = awCreateDummyCell(titem);
    if (item.children[i].hasAttribute("style")) {
      cell.setAttribute("style", item.children[i].getAttribute("style"));
    }
    if (item.children[i].hasAttribute("flex")) {
      cell.setAttribute("flex", item.children[i].getAttribute("flex"));
    }
  }

  if (aParent) {
    aParent.appendChild(titem);
  }

  return titem;
}

function awFitDummyRows() {
  awCalcContentHeight();
  awCreateOrRemoveDummyRows();
}

function awCreateOrRemoveDummyRows() {
  const listbox = document.getElementById("addressingWidget");
  const listboxHeight = listbox.getBoundingClientRect().height;

  // remove rows to remove scrollbar
  const kids = listbox.querySelectorAll("[_isDummyRow]");
  for (
    let i = kids.length - 1;
    gAWContentHeight > listboxHeight && i >= 0;
    --i
  ) {
    gAWContentHeight -= gAWRowHeight;
    kids[i].remove();
  }

  // add rows to fill space
  if (gAWRowHeight) {
    while (gAWContentHeight + gAWRowHeight < listboxHeight) {
      awCreateDummyItem(listbox);
      gAWContentHeight += gAWRowHeight;
    }
  }
}

function awCalcContentHeight() {
  var listbox = document.getElementById("addressingWidget");
  var items = listbox.itemChildren;

  gAWContentHeight = 0;
  if (items.length > 0) {
    // all rows are forced to a uniform height in xul listboxes, so
    // find the first listitem with a boxObject and use it as precedent
    var i = 0;
    do {
      gAWRowHeight = items[i].getBoundingClientRect().height;
      ++i;
    } while (i < items.length && !gAWRowHeight);
    gAWContentHeight = gAWRowHeight * items.length;
  }
}

/* ::::::::::: addressing widget dummy rows ::::::::::::::::: */

function awCreateDummyCell(aParent) {
  var cell = document.createXULElement("hbox");
  cell.setAttribute("class", "addressingWidgetCell dummy-row-cell");
  if (aParent) {
    aParent.appendChild(cell);
  }

  return cell;
}

function awGetNextDummyRow() {
  // gets the next row from the top down
  return document.querySelector("#addressingWidget > [_isDummyRow]");
}

/**
 * Set focus to the specified element, typically a recipient input element.
 * We do this asynchronously to allow other processes like adding or removing rows
 * to complete before shifting focus.
 *
 * @param {Element} element - The element to receive focus asynchronously.
 */
function awSetFocusTo(element) {
  // Remember the (input) element to focus for asynchronous focusing, so that we
  // play safe if this gets called again and the original element gets removed
  // before we can focus it.
  top.awInputToFocus = element;
  setTimeout(_awSetFocusTo, 0);
}

function _awSetFocusTo() {
  top.awInputToFocus.focus();
}

// returns null if abURI is not a mailing list URI
function GetParentDirectoryFromMailingListURI(abURI) {
  var abURIArr = abURI.split("/");
  /*
   Turn "jsaddrbook://abook.sqlite/MailList6"
   into ["jsaddrbook:","","abook.sqlite","MailList6"],
   then into "jsaddrbook://abook.sqlite".

   Turn "moz-aboutlookdirectory:///<top dir ID>/<ML dir ID>"
   into ["moz-aboutlookdirectory:","","","<top dir ID>","<ML dir ID>"],
   and then into: "moz-aboutlookdirectory:///<top dir ID>".
  */
  if (
    abURIArr.length == 4 &&
    ["jsaddrbook:", "moz-abmdbdirectory:"].includes(abURIArr[0]) &&
    abURIArr[3] != ""
  ) {
    return abURIArr[0] + "//" + abURIArr[2];
  } else if (
    abURIArr.length == 5 &&
    abURIArr[0] == "moz-aboutlookdirectory:" &&
    abURIArr[4] != ""
  ) {
    return abURIArr[0] + "///" + abURIArr[3];
  }

  return null;
}
