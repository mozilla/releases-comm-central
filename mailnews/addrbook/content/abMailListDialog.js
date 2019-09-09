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

top.MAX_RECIPIENTS = 1;
var inputElementType = "";

var gListCard;
var gEditList;
var oldListName = "";
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

function GetListValue(mailList, doAdd) {
  var listname = document.getElementById("ListName").value.trim();

  if (listname.length == 0) {
    var alertText = gAddressBookBundle.getString("emptyListName");
    alert(alertText);
    return false;
  }

  var canonicalNewListName = listname.toLowerCase();
  var canonicalOldListName = oldListName.toLowerCase();
  if (doAdd) {
    if (mailingListExists(canonicalNewListName)) {
      return false;
    }
  } else if (canonicalOldListName != canonicalNewListName) {
    if (mailingListExists(canonicalNewListName)) {
      return false;
    }
  }

  mailList.isMailList = true;
  mailList.dirName = listname;
  mailList.listNickName = document.getElementById("ListNickName").value;
  mailList.description = document.getElementById("ListDescription").value;

  var oldTotal = mailList.addressLists.length;
  var i = 1;
  var pos = 0;
  var inputField, fieldValue, cardproperty;
  while ((inputField = awGetInputElement(i))) {
    fieldValue = inputField.value;

    if (doAdd || pos >= oldTotal) {
      cardproperty = Cc[
        "@mozilla.org/addressbook/cardproperty;1"
      ].createInstance();
    } else {
      cardproperty = mailList.addressLists.queryElementAt(pos, Ci.nsIAbCard);
    }

    if (fieldValue == "") {
      if (!doAdd && cardproperty) {
        try {
          mailList.addressLists.removeElementAt(pos);
          --oldTotal;
        } catch (ex) {
          // Ignore attempting to remove an item
          // at a position greater than the number
          // of elements in the addressLists attribute
        }
      }
    } else if (cardproperty) {
      cardproperty = cardproperty.QueryInterface(Ci.nsIAbCard);
      if (cardproperty) {
        let addrObjects = MailServices.headerParser.makeFromDisplayAddress(
          fieldValue,
          {}
        );
        for (let j = 0; j < addrObjects.length; j++) {
          if (j > 0) {
            cardproperty = Cc[
              "@mozilla.org/addressbook/cardproperty;1"
            ].createInstance();
            cardproperty = cardproperty.QueryInterface(Ci.nsIAbCard);
          }
          cardproperty.primaryEmail = addrObjects[j].email;
          cardproperty.displayName =
            addrObjects[j].name || addrObjects[j].email;

          if (doAdd || pos >= oldTotal) {
            mailList.addressLists.appendElement(cardproperty);
          }
        }
        pos++;
      }
    }
    i++;
  }

  --i;

  if (!doAdd && i < oldTotal) {
    for (var j = i; j < oldTotal; j++) {
      mailList.addressLists.removeElementAt(j);
    }
  }
  return true;
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

    if (GetListValue(mailList, true)) {
      var parentDirectory = GetDirectoryFromURI(uri);
      mailList = parentDirectory.addMailList(mailList);
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
}

function EditListOKButton(event) {
  // edit mailing list in database
  if (GetListValue(gEditList, false)) {
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
  oldListName = gEditList.dirName;

  document.title = gAddressBookBundle.getFormattedString(
    "mailingListTitleEdit",
    [oldListName]
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

    document.documentElement.buttons = "accept";

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

  var input = newNode.getElementsByTagName(awInputElementName());
  if (input && input.length == 1) {
    input[0].setAttribute("value", inputValue);
    input[0].setAttribute("id", "addressCol1#" + top.MAX_RECIPIENTS);
  }
}

function awNotAnEmptyArea(event) {
  // This is temporary until i figure out how to ensure to always having an empty space after the last row

  var lastInput = awGetInputElement(top.MAX_RECIPIENTS);
  if (lastInput && lastInput.value) {
    awAppendNewRow(false);
  }

  event.stopPropagation();
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

function awInputElementName() {
  if (inputElementType == "") {
    inputElementType = document.getElementById("addressCol1#1").localName;
  }
  return inputElementType;
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

    input = newNode.getElementsByTagName(awInputElementName());
    if (input && input.length == 1) {
      input[0].setAttribute("value", "");
      input[0].setAttribute("id", "addressCol1#" + top.MAX_RECIPIENTS);

      if (input[0].getAttribute("focused") != "") {
        input[0].removeAttribute("focused");
      }
    }
    // Focus the new input widget.
    if (setFocus && input) {
      awSetFocusTo(input[0]);
    }
  }
  return input ? input[0] : null;
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
    let len = {};
    trans.getAnyTransferData(bestFlavor, dataObj, len);
    if (dataObj) {
      dataObj = dataObj.value.QueryInterface(Ci.nsISupportsString);
    }
    if (!dataObj) {
      continue;
    }

    // pull the URL out of the data object
    let address = dataObj.data.substring(0, len.value);
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
  let addresses = {},
    names = {},
    fullNames = {};
  MailServices.headerParser.parseHeadersWithArray(
    address,
    addresses,
    names,
    fullNames
  );
  for (let full of fullNames.value) {
    let lastInput = awGetInputElement(top.MAX_RECIPIENTS);
    lastInput.value = full;
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
