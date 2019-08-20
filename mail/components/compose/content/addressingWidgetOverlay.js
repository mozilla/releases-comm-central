/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from MsgComposeCommands.js */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

top.MAX_RECIPIENTS = 1; /* for the initial listitem created in the XUL */

var inputElementType = "";
var selectElementType = "";
var selectElementIndexTable = null;

var gNumberOfCols = 0;

var gDragService = Cc["@mozilla.org/widget/dragservice;1"]
                     .getService(Ci.nsIDragService);

var test_addresses_sequence = false;

if (Services.prefs.getPrefType("mail.debug.test_addresses_sequence") == Ci.nsIPrefBranch.PREF_BOOL) {
  test_addresses_sequence = Services.prefs.getBoolPref("mail.debug.test_addresses_sequence");
}

function awGetNumberOfCols() {
  if (gNumberOfCols == 0) {
    var listbox = document.getElementById("addressingWidget");
    var listCols = listbox.getElementsByTagName("treecol");
    gNumberOfCols = listCols.length;
    if (!gNumberOfCols)
      gNumberOfCols = 1;  /* if no cols defined, that means we have only one! */
  }

  return gNumberOfCols;
}

/**
 * Adjust the default and minimum number of visible recipient rows for addressingWidget
 */
function awInitializeNumberOfRowsShown() {
  let msgHeadersToolbar = document.getElementById("MsgHeadersToolbar");
  let addressingWidget = document.getElementById("addressingWidget");
  let awNumRowsShownDefault =
    Services.prefs.getIntPref("mail.compose.addresswidget.numRowsShownDefault");

  // Work around bug 966655: extraHeight 2 pixels for msgHeadersToolbar ensures
  // visibility of recipient rows per awNumRowsShownDefault and prevents scrollbar
  // on empty Address Widget, depending on OS screen resolution dpi scaling
  // (> 100%; thresholds differ).
  let extraHeight = 2;

  // Set minimum number of rows shown for address widget, per hardwired
  // rows="1" attribute of addressingWidget, to prevent resizing the
  // subject and format toolbar over the address widget.
  // This lets users shrink the address widget to one row (with delicate UX)
  // and thus maximize the space available for composition body,
  // especially on small screens.
  let toolbarRect = msgHeadersToolbar.getBoundingClientRect();
  msgHeadersToolbar.minHeight = toolbarRect.height;

  msgHeadersToolbar.height = toolbarRect.height +
    addressingWidget.getBoundingClientRect().height * (awNumRowsShownDefault - 1) +
    extraHeight;

  // Update addressingWidget internals.
  awCreateOrRemoveDummyRows();
}

function awInputElementName() {
  if (inputElementType == "")
    inputElementType = document.getElementById("addressCol2#1").localName;
  return inputElementType;
}

function awSelectElementName() {
  if (selectElementType == "")
      selectElementType = document.getElementById("addressCol1#1").localName;
  return selectElementType;
}

// TODO: replace awGetSelectItemIndex with recipient type index constants

function awGetSelectItemIndex(itemData) {
  if (selectElementIndexTable == null) {
    selectElementIndexTable = {};
    var selectElem = document.getElementById("addressCol1#1");
    for (var i = 0; i < selectElem.menupopup.childNodes.length; i++) {
      var aData = selectElem.menupopup.childNodes[i].getAttribute("value");
      selectElementIndexTable[aData] = i;
    }
  }

  return selectElementIndexTable[itemData];
}

function Recipients2CompFields(msgCompFields) {
  if (!msgCompFields) {
    throw new Error("Message Compose Error: msgCompFields is null (ExtractRecipients)");
  }

  var i = 1;
  var addrTo = "";
  var addrCc = "";
  var addrBcc = "";
  var addrReply = "";
  var addrNg = "";
  var addrFollow = "";
  var to_Sep = "";
  var cc_Sep = "";
  var bcc_Sep = "";
  var reply_Sep = "";
  var ng_Sep = "";
  var follow_Sep = "";

  var recipientType;
  var inputField;
  var fieldValue;
  var recipient;
  while ((inputField = awGetInputElement(i))) {
    fieldValue = inputField.value;
    if (fieldValue != "") {
      recipientType = awGetPopupElement(i).value;
      recipient = null;

      switch (recipientType) {
        case "addr_to":
        case "addr_cc":
        case "addr_bcc":
        case "addr_reply":
          try {
            let headerParser = MailServices.headerParser;
            recipient =
              headerParser.makeFromDisplayAddress(fieldValue, {})
                          .map(fullValue => headerParser.makeMimeAddress(fullValue.name,
                                                                         fullValue.email))
                          .join(", ");
          } catch (ex) {
            recipient = fieldValue;
          }
          break;
      }

      switch (recipientType) {
        case "addr_to":
          addrTo += to_Sep + recipient;
          to_Sep = ",";
          break;
        case "addr_cc":
          addrCc += cc_Sep + recipient;
          cc_Sep = ",";
          break;
        case "addr_bcc":
          addrBcc += bcc_Sep + recipient;
          bcc_Sep = ",";
          break;
        case "addr_reply":
          addrReply += reply_Sep + recipient;
          reply_Sep = ",";
          break;
        case "addr_newsgroups":
          addrNg += ng_Sep + fieldValue;
          ng_Sep = ",";
          break;
        case "addr_followup":
          addrFollow += follow_Sep + fieldValue;
          follow_Sep = ",";
          break;
        case "addr_other":
          let headerName = awGetPopupElement(i).label;
          headerName = headerName.substring(0, headerName.indexOf(":"));
          msgCompFields.setRawHeader(headerName, fieldValue, null);
          break;
      }
    }
    i++;
  }

  msgCompFields.to = addrTo;
  msgCompFields.cc = addrCc;
  msgCompFields.bcc = addrBcc;
  msgCompFields.replyTo = addrReply;
  msgCompFields.newsgroups = addrNg;
  msgCompFields.followupTo = addrFollow;
}

function CompFields2Recipients(msgCompFields) {
  if (msgCompFields) {
    let listbox = document.getElementById("addressingWidget");
    let templateNode = listbox.getItemAtIndex(0);
    templateNode.remove();

    top.MAX_RECIPIENTS = 0;
    let msgReplyTo = msgCompFields.replyTo;
    let msgTo = msgCompFields.to;
    let msgCC = msgCompFields.cc;
    let msgBCC = msgCompFields.bcc;
    let msgNewsgroups = msgCompFields.newsgroups;
    let msgFollowupTo = msgCompFields.followupTo;
    let havePrimaryRecipient = false;
    if (msgReplyTo)
      awSetInputAndPopupFromArray(msgCompFields.splitRecipients(msgReplyTo, false, {}),
                                  "addr_reply", listbox, templateNode);
    if (msgTo) {
      let rcp = msgCompFields.splitRecipients(msgTo, false, {});
      if (rcp.length) {
        awSetInputAndPopupFromArray(rcp, "addr_to", listbox, templateNode);
        havePrimaryRecipient = true;
      }
    }
    if (msgCC)
      awSetInputAndPopupFromArray(msgCompFields.splitRecipients(msgCC, false, {}),
                                  "addr_cc", listbox, templateNode);
    if (msgBCC)
      awSetInputAndPopupFromArray(msgCompFields.splitRecipients(msgBCC, false, {}),
                                  "addr_bcc", listbox, templateNode);
    if (msgNewsgroups) {
      awSetInputAndPopup(msgNewsgroups, "addr_newsgroups", listbox, templateNode);
      havePrimaryRecipient = true;
    }
    if (msgFollowupTo)
      awSetInputAndPopup(msgFollowupTo, "addr_followup", listbox, templateNode);

    // If it's a new message, we need to add an extra empty recipient.
    if (!havePrimaryRecipient)
      _awSetInputAndPopup("", "addr_to", listbox, templateNode);
    awFitDummyRows(2);

    // CompFields2Recipients is called whenever a user replies or edits an existing message. We want to
    // add all of the non-empty recipients for this message to the ignore list for spell check
    let currentAddress = gCurrentIdentity ? gCurrentIdentity.fullAddress : "";
    addRecipientsToIgnoreList([currentAddress, msgTo, msgCC, msgBCC].filter(adr => adr).join(", "));
  }
}

function awSetInputAndPopupId(inputElem, popupElem, rowNumber) {
  popupElem.id = "addressCol1#" + rowNumber;
  inputElem.id = "addressCol2#" + rowNumber;
  inputElem.setAttribute("aria-labelledby", popupElem.id);
}

/**
 * Set value of the recipient input field at row rowNumber and set up
 * the recipient type menulist.
 *
 * @param inputElem                 recipient input element
 * @param inputValue                recipient value (address)
 * @param popupElem                 recipient type menulist element
 * @param popupValue
 * @param aNotifyRecipientsChanged  Notify that the recipients have changed.
 *                                  Generally we notify unless recipients are
 *                                  added in batch when the caller takes care
 *                                  of the notification.
 */
function awSetInputAndPopupValue(inputElem, inputValue, popupElem, popupValue, rowNumber, aNotifyRecipientsChanged = true) {
  inputElem.value = inputValue.trimLeft();

  popupElem.selectedItem = popupElem.menupopup.childNodes[awGetSelectItemIndex(popupValue)];
  // TODO: can there be a row without ID yet?
  if (rowNumber >= 0)
    awSetInputAndPopupId(inputElem, popupElem, rowNumber);

  _awSetAutoComplete(popupElem, inputElem);

  if (aNotifyRecipientsChanged)
    onRecipientsChanged(true);
}

function _awSetInputAndPopup(inputValue, popupValue, parentNode, templateNode) {
  top.MAX_RECIPIENTS++;

  var newNode = templateNode.cloneNode(true);
  parentNode.appendChild(newNode); // we need to insert the new node before we set the value of the select element!

  var input = newNode.getElementsByTagName(awInputElementName());
  var select = newNode.getElementsByTagName(awSelectElementName());

  if (input && input.length == 1 && select && select.length == 1)
    awSetInputAndPopupValue(input[0], inputValue, select[0], popupValue, top.MAX_RECIPIENTS);
}

function awSetInputAndPopup(inputValue, popupValue, parentNode, templateNode) {
  if (inputValue && popupValue) {
    var addressArray = inputValue.split(",");

    for (var index = 0; index < addressArray.length; index++)
      _awSetInputAndPopup(addressArray[index], popupValue, parentNode, templateNode);
  }
}

function awSetInputAndPopupFromArray(inputArray, popupValue, parentNode, templateNode) {
  if (popupValue) {
    for (let recipient of inputArray)
      _awSetInputAndPopup(recipient, popupValue, parentNode, templateNode);
  }
}

function awRemoveRecipients(msgCompFields, recipientType, recipientsList) {
  if (!msgCompFields || !recipientsList)
    return;

  var recipientArray = msgCompFields.splitRecipients(recipientsList, false, {});

  for (var index = 0; index < recipientArray.length; index++)
    for (var row = 1; row <= top.MAX_RECIPIENTS; row++) {
      var popup = awGetPopupElement(row);
      if (popup.value == recipientType) {
        var input = awGetInputElement(row);
        if (input.value == recipientArray[index]) {
          awSetInputAndPopupValue(input, "", popup, "addr_to", -1);
          break;
        }
      }
    }
}

/**
 * Adds a batch of new rows matching recipientType and drops in the list of addresses.
 *
 * @param msgCompFields  A nsIMsgCompFields object that is only used as a helper,
 *                       it will not get the addresses appended.
 * @param recipientType  Type of recipient, e.g. "addr_to".
 * @param recipientList  A string of addresses to add.
 */
function awAddRecipients(msgCompFields, recipientType, recipientsList) {
  if (!msgCompFields || !recipientsList)
    return;

  var recipientArray = msgCompFields.splitRecipients(recipientsList, false, {});
  awAddRecipientsArray(recipientType, recipientArray);
}

/**
 * Adds a batch of new rows matching recipientType and drops in the array of addresses.
 *
 * @param aRecipientType  Type of recipient, e.g. "addr_to".
 * @param aAddressArray   An array of recipient addresses (strings) to add.
 */
function awAddRecipientsArray(aRecipientType, aAddressArray) {
  // Find rows that are empty so that we can fill them.
  let emptyRows = [];
  for (let row = 1; row <= top.MAX_RECIPIENTS; row++) {
    if (awGetInputElement(row).value == "")
      emptyRows.push(row);
  }

  // Push the new recipients into the found empty rows or append new rows when needed.
  let row = 1;
  for (let address of aAddressArray) {
    if (emptyRows.length > 0) {
      row = emptyRows.shift();
    } else {
      awAppendNewRow(false);
      row = top.MAX_RECIPIENTS;
    }

    awSetInputAndPopupValue(awGetInputElement(row), address,
                            awGetPopupElement(row), aRecipientType,
                            row, false);
  }

  // Be sure we still have an empty row left.
  if ((emptyRows.length == 0) && (awGetInputElement(top.MAX_RECIPIENTS).value != "")) {
    // Insert empty row at the end and focus.
    awAppendNewRow(true);
    awSetInputAndPopupValue(awGetInputElement(top.MAX_RECIPIENTS), "",
                            awGetPopupElement(top.MAX_RECIPIENTS), "addr_to",
                            top.MAX_RECIPIENTS, false);
  } else {
    // Focus the next empty row, if any, or the pre-existing empty last row.
    row = (emptyRows.length > 0) ? emptyRows.shift() : top.MAX_RECIPIENTS;
    awSetFocusTo(awGetInputElement(row));
  }

  onRecipientsChanged(true);

  // Add the recipients to our spell check ignore list.
  addRecipientsToIgnoreList(aAddressArray.join(", "));
}

/**
 * Adds a new row matching recipientType and drops in the single address.
 *
 * This is mostly used by addons, even though they should use AddRecipient().
 *
 * @param aRecipientType  Type of recipient, e.g. addr_to.
 * @param aAddress        A string with recipient address.
 */
function awAddRecipient(aRecipientType, aAddress) {
  awAddRecipientsArray(aRecipientType, [aAddress]);
}

function awTestRowSequence() {
  /*
    This function is for debug and testing purpose only, normal user should not run it!

    Every time we insert or delete a row, we must be sure we didn't break the ID sequence of
    the addressing widget rows. This function will run a quick test to see if the sequence still ok

    You need to define the pref mail.debug.test_addresses_sequence to true in order to activate it
  */

  if (!test_addresses_sequence)
    return true;

  /* debug code to verify the sequence still good */

  let listbox = document.getElementById("addressingWidget");
  let listitems = listbox.itemChildren;
  if (listitems.length >= top.MAX_RECIPIENTS) {
    for (let i = 1; i <= listitems.length; i++) {
      let item = listitems[i - 1];
      let inputID = item.querySelector(awInputElementName()).id.split("#")[1];
      let popupID = item.querySelector(awSelectElementName()).id.split("#")[1];
      if (inputID != i || popupID != i) {
        dump("#ERROR: sequence broken at row " + i + ", inputID=" + inputID + ", popupID=" + popupID + "\n");
        return false;
      }
      dump("---SEQUENCE OK---\n");
      return true;
    }
  } else {
    dump("#ERROR: listitems.length(" + listitems.length + ") < top.MAX_RECIPIENTS(" + top.MAX_RECIPIENTS + ")\n");
  }

  return false;
}

function awCleanupRows() {
  var maxRecipients = top.MAX_RECIPIENTS;
  var rowID = 1;

  for (var row = 1; row <= maxRecipients; row++) {
    var inputElem = awGetInputElement(row);
    if (inputElem.value == "" && row < maxRecipients) {
      awRemoveRow(awGetRowByInputElement(inputElem));
    } else {
      awSetInputAndPopupId(inputElem, awGetPopupElement(row), rowID);
      rowID++;
    }
  }

  awTestRowSequence();
}

function awDeleteRow(rowToDelete) {
  // When we delete a row, we must reset the id of other rows in order to not break the sequence.
  var maxRecipients = top.MAX_RECIPIENTS;
  awRemoveRow(rowToDelete);

  // assume 2 column update (input and popup)
  for (var row = rowToDelete + 1; row <= maxRecipients; row++)
    awSetInputAndPopupId(awGetInputElement(row), awGetPopupElement(row), (row - 1));

  awTestRowSequence();
}

function awClickEmptySpace(target, setFocus) {
  if (document.getElementById("addressCol2#1").disabled ||
      target == null ||
      target.localName != "hbox")
    return;

  let lastInput = awGetInputElement(top.MAX_RECIPIENTS);

  if (lastInput && lastInput.value)
    awAppendNewRow(setFocus);
  else if (setFocus)
    awSetFocusTo(lastInput);
}

function awReturnHit(inputElement) {
  let row = awGetRowByInputElement(inputElement);
  let nextInput = awGetInputElement(row + 1);

  if (!nextInput) {
    if (inputElement.value) {
      awAppendNewRow(true);
    } else {
      // No address entered, switch to Subject field
      let subjectField = document.getElementById("msgSubject");
      subjectField.select();
      subjectField.focus();
    }
  } else {
    nextInput.select();
    awSetFocusTo(nextInput);
  }

  // be sure to add the user add recipient to our ignore list
  // when the user hits enter in an autocomplete widget...
  addRecipientsToIgnoreList(inputElement.value);
}

function awDeleteAddressOnClick(deleteAddressElement) {
  awDeleteHit(deleteAddressElement.parentNode.parentNode
                                  .querySelector("textbox.textbox-addressingWidget"),
                                  true);
}

/**
 * Delete recipient row (addressingWidgetItem) from UI.
 *
 * @param {<xul:textbox>} inputElement  the recipient input XUL textbox element
 *                                      (textbox-addressingWidget) whose parent
 *                                      row (addressingWidgetItem) will be deleted.
 * @param {boolean} deleteForward  true: focus next row after deleting the row
 *                                 false: focus previous row after deleting the row
 */
function awDeleteHit(inputElement, deleteForward = false) {
  let row = awGetRowByInputElement(inputElement);

  // Don't delete the row if it's the last one remaining; just reset it.
  if (top.MAX_RECIPIENTS <= 1) {
    inputElement.value = "";
    return;
  }

  // Set the focus to the input field of the next/previous row according to
  // the direction of deleting if possible.
  // Note: awSetFocusTo() is asynchronous, i.e. we'll focus after row removal.
  if (!deleteForward && row > 1 ||
      deleteForward && row == top.MAX_RECIPIENTS) {
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

// If we add a menulist to the DOM, it has some child nodes added to it
// by the menulist custom element. If we then clone the menulist and add
// it to the DOM again, more child nodes are added and we end up with
// bug 1525828. This function clones any menulist as it originally was.
function _menulistFriendlyClone(element) {
  let clone = element.cloneNode(false);
  if (element.localName == "menulist") {
    clone.appendChild(element.menupopup.cloneNode(true));
    return clone;
  }
  for (let child of element.children) {
    clone.appendChild(_menulistFriendlyClone(child));
  }
  return clone;
}

function awAppendNewRow(setFocus) {
  var listbox = document.getElementById("addressingWidget");
  var listitem1 = awGetListItem(1);

  if (listbox && listitem1) {
    var lastRecipientType = awGetPopupElement(top.MAX_RECIPIENTS).value;

    var nextDummy = awGetNextDummyRow();
    var newNode = _menulistFriendlyClone(listitem1);
    if (nextDummy)
      listbox.replaceChild(newNode, nextDummy);
    else
      listbox.appendChild(newNode);

    top.MAX_RECIPIENTS++;

    var input = newNode.getElementsByTagName(awInputElementName());
    if (input && input.length == 1) {
      input[0].value = "";

      // We always clone the first row.  The problem is that the first row
      // could be focused.  When we clone that row, we end up with a cloned
      // XUL textbox that has a focused attribute set.  Therefore we think
      // we're focused and don't properly refocus.  The best solution to this
      // would be to clone a template row that didn't really have any presentation,
      // rather than using the real visible first row of the listbox.
      //
      // For now we'll just put in a hack that ensures the focused attribute
      // is never copied when the node is cloned.
      input[0].removeAttribute("focused");

      // Reset autocomplete attribute "nomatch" so we don't cause red addresses
      // on a cloned row.
      input[0].removeAttribute("nomatch");
    }
    var select = newNode.getElementsByTagName(awSelectElementName());
    if (select && select.length == 1) {
      // It only makes sense to clone some field types; others
      // should not be cloned, since it just makes the user have
      // to go to the trouble of selecting something else. In such
      // cases let's default to 'To' (a reasonable default since
      // we already default to 'To' on the first dummy field of
      // a new message).
      switch (lastRecipientType) {
        case "addr_reply":
        case "addr_other":
          select[0].selectedIndex = awGetSelectItemIndex("addr_to");
          break;
        case "addr_followup":
          select[0].selectedIndex = awGetSelectItemIndex("addr_newsgroups");
          break;
        default:
        // e.g. "addr_to","addr_cc","addr_bcc","addr_newsgroups":
          select[0].selectedIndex = awGetSelectItemIndex(lastRecipientType);
      }

      awSetInputAndPopupId(input[0], select[0], top.MAX_RECIPIENTS);

      if (input)
        _awSetAutoComplete(select[0], input[0]);
    }

    // Focus the new input widget
    if (setFocus && input[0])
      awSetFocusTo(input[0]);
  }
}

// functions for accessing the elements in the addressing widget

/**
 * Returns the recipient type popup for a row.
 *
 * @param row  Index of the recipient row to return. Starts at 1.
 * @return     This returns the menulist (not its child menupopup), despite the function name.
 */
function awGetPopupElement(row) {
    return document.getElementById("addressCol1#" + row);
}

/**
 * Returns the recipient inputbox for a row.
 *
 * @param row  Index of the recipient row to return. Starts at 1.
 * @return     This returns the textbox element.
 */
function awGetInputElement(row) {
    return document.getElementById("addressCol2#" + row);
}

function awGetElementByCol(row, col) {
  var colID = "addressCol" + col + "#" + row;
  return document.getElementById(colID);
}

function awGetListItem(row) {
  var listbox = document.getElementById("addressingWidget");
  if (listbox && row > 0)
    return listbox.getItemAtIndex(row - 1);

  return null;
}

/**
 * @param inputElement  The textbox of recipient input.
 * @return              The row index (starting from 1) where the input element
 *                      is found. 0 if the element is not found.
 */
function awGetRowByInputElement(inputElement) {
  if (!inputElement)
    return 0;

  var listitem = inputElement.parentNode.parentNode;
  return document.getElementById("addressingWidget").getIndexOfItem(listitem) + 1;
}

// Copy Node - copy this node and insert ahead of the (before) node.  Append to end if before=0
function awCopyNode(node, parentNode, beforeNode) {
  var newNode = node.cloneNode(true);

  if (beforeNode)
    parentNode.insertBefore(newNode, beforeNode);
  else
    parentNode.appendChild(newNode);

  return newNode;
}

function awRemoveRow(row) {
  awGetListItem(row).remove();
  awFitDummyRows();

  top.MAX_RECIPIENTS--;
}

/**
 * Set focus to the specified element, typically a recipient input element.
 * We do this asynchronously to allow other processes like adding or removing rows
 * to complete before shifting focus.
 *
 * @param element  the element to receive focus asynchronously
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

// Deprecated - use awSetFocusTo() instead.
// ### TODO: This function should be removed if we're sure addons aren't using it.
function awSetFocus(row, inputElement) {
  awSetFocusTo(inputElement);
}

function awGetNumberOfRecipients() {
  return top.MAX_RECIPIENTS;
}

function DragOverAddressingWidget(event) {
  var validFlavor = false;
  var dragSession = dragSession = gDragService.getCurrentSession();

  if (dragSession.isDataFlavorSupported("text/x-moz-address"))
    validFlavor = true;

  if (validFlavor)
    dragSession.canDrop = true;
}

function DropOnAddressingWidget(event) {
  var dragSession = gDragService.getCurrentSession();

  var trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
  trans.init(getLoadContext());
  trans.addDataFlavor("text/x-moz-address");

  for (var i = 0; i < dragSession.numDropItems; ++i) {
    dragSession.getData(trans, i);
    var dataObj = {};
    var bestFlavor = {};
    var len = {};
    trans.getAnyTransferData(bestFlavor, dataObj, len);
    if (dataObj)
      dataObj = dataObj.value.QueryInterface(Ci.nsISupportsString);
    if (!dataObj)
      continue;

    // pull the address out of the data object
    var address = dataObj.data.substring(0, len.value);
    if (!address)
      continue;

    DropRecipient(event.target, address);
  }
}

function DropRecipient(target, recipient) {
  // break down and add each address
  return parseAndAddAddresses(recipient, awGetPopupElement(top.MAX_RECIPIENTS).value);
}

function _awSetAutoComplete(selectElem, inputElem) {
  let params = JSON.parse(inputElem.getAttribute("autocompletesearchparam"));
  params.type = selectElem.value;
  inputElem.setAttribute("autocompletesearchparam", JSON.stringify(params));
}

function awSetAutoComplete(rowNumber) {
  var inputElem = awGetInputElement(rowNumber);
  var selectElem = awGetPopupElement(rowNumber);
  _awSetAutoComplete(selectElem, inputElem);
}

function awRecipientOnFocus(inputElement) {
  inputElement.select();
}

/**
 * Handles keypress events for the email address inputs (that auto-fill)
 * in the Address Book Mailing List dialogs.
 *
 * @param event       The DOM keypress event
 * @param element     The element that triggered the keypress event
 */
function awAbRecipientKeyPress(event, element) {
  // Only add new row when enter was hit (not for tab/autocomplete select).
  if (event.key == "Enter") {
    // Prevent dialogs from closing.
    if (element.value != "") {
      event.preventDefault();
    }
    awReturnHit(element);
  }
}

/**
 * Handles keypress events for the email address inputs (that auto-fill)
 * in the Message Compose window.
 *
 * @param event       The DOM keypress event
 * @param element     The element that triggered the keypress event
 */
function awRecipientKeyPress(event, element) {
  switch (event.key) {
    case "Enter":
    case "Tab":
      // If the recipient input text contains a comma (we also convert pasted line
      // feeds into commas), check if multiple recipients and add them accordingly.
      if (element.value.includes(",")) {
        let addresses = element.value;
        element.value = ""; // Clear out the current line so we don't try to autocomplete it.
        parseAndAddAddresses(addresses, awGetPopupElement(awGetRowByInputElement(element)).value);
      } else if (event.key == "Tab") {
        // Single recipient added via Tab key:
        // Add the recipient to our spellcheck ignore list.
        // For Enter key, this is done in awReturnHit().
        addRecipientsToIgnoreList(element.value);
      } else if (event.key == "Enter") {
        awReturnHit(element);
      }

      break;
  }
}

/**
 * Handle keydown event on a recipient input textbox.
 * Enables recipient row deletion with DEL or BACKSPACE and
 * recipient list navigation with cursor up/down.
 *
 * Note that the keydown event fires for ALL keys, so this may affect
 * autocomplete as user enters a recipient text.
 *
 * @param {keydown event} event  the keydown event fired on a recipient input
 * @param {<xul:textbox>} inputElement  the recipient input XUL textbox element
 *                                      on which the event fired (textbox-addressingWidget)
 */
function awRecipientKeyDown(event, inputElement) {
  switch (event.key) {
    // Enable deletion of empty recipient rows.
    case "Delete":
    case "Backspace":
      if (inputElement.textLength == 1 && event.repeat) {
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
          let deleteForward = (event.key == "Delete");
          awDeleteHit(inputElement, deleteForward);
        }
      }
      break;

    // Enable browsing the list of recipients up and down with cursor keys.
    case "ArrowDown":
    case "ArrowUp":
      // Only browse recipients if the autocomplete popup is not open.
      if (!inputElement.popupOpen) {
        let row = awGetRowByInputElement(inputElement);
        let down = (event.key == "ArrowDown");
        let noEdgeRow = down ? row < top.MAX_RECIPIENTS : row > 1;
        if (noEdgeRow) {
          let targetRow = down ? row + 1 : row - 1;
          awSetFocusTo(awGetInputElement(targetRow));
        }
      }
      break;
  }
}

/* ::::::::::: addressing widget dummy rows ::::::::::::::::: */

var gAWContentHeight = 0;
var gAWRowHeight = 0;

function awFitDummyRows() {
  awCalcContentHeight();
  awCreateOrRemoveDummyRows();
}

function awCreateOrRemoveDummyRows() {
  let listbox = document.getElementById("addressingWidget");
  let listboxHeight = listbox.getBoundingClientRect().height;

  // remove rows to remove scrollbar
  let kids = listbox.querySelectorAll("[_isDummyRow]");
  for (let i = kids.length - 1; gAWContentHeight > listboxHeight && i >= 0; --i) {
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

function awCreateDummyItem(aParent) {
  var listbox = document.getElementById("addressingWidget");
  var item = listbox.getItemAtIndex(0);

  var titem = document.createXULElement("richlistitem");
  titem.setAttribute("_isDummyRow", "true");
  titem.setAttribute("class", "dummy-row");
  titem.style.height = item.getBoundingClientRect().height + "px";

  for (let i = 0; i < awGetNumberOfCols(); i++) {
    let cell = awCreateDummyCell(titem);
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

function awCreateDummyCell(aParent) {
  var cell = document.createXULElement("hbox");
  cell.setAttribute("class", "addressingWidgetCell dummy-row-cell");
  if (aParent)
    aParent.appendChild(cell);

  return cell;
}

function awGetNextDummyRow() {
  // gets the next row from the top down
  return document.querySelector("#addressingWidget > [_isDummyRow]");
}

function awSizerListen() {
  // when splitter is clicked, fill in necessary dummy rows each time the mouse is moved
  awCalcContentHeight(); // precalculate
  document.addEventListener("mousemove", awSizerMouseMove, true);
  document.addEventListener("mouseup", awSizerMouseUp, {capture: false, once: true});
}

function awSizerMouseMove() {
  awCreateOrRemoveDummyRows(2);
}

function awSizerMouseUp() {
  document.removeEventListener("mousemove", awSizerMouseMove, true);
}

// Given an arbitrary block of text like a comma delimited list of names or a names separated by spaces,
// we will try to autocomplete each of the names and then take the FIRST match for each name, adding it the
// addressing widget on the compose window.

var gAutomatedAutoCompleteListener = null;

function parseAndAddAddresses(addressText, recipientType) {
  // strip any leading >> characters inserted by the autocomplete widget
  var strippedAddresses = addressText.replace(/.* >> /, "");

  let addresses = MailServices.headerParser
                              .makeFromDisplayAddress(strippedAddresses);

  if (addresses.length > 0) {
    // we need to set up our own autocomplete session and search for results
    if (!gAutomatedAutoCompleteListener)
      gAutomatedAutoCompleteListener = new AutomatedAutoCompleteHandler();

    gAutomatedAutoCompleteListener.init(addresses.map(addr => addr.toString()),
                                        recipientType);
  }
}

function AutomatedAutoCompleteHandler() {
}

// state driven self contained object which will autocomplete a block of addresses without any UI.
// force picks the first match and adds it to the addressing widget, then goes on to the next
// name to complete.

AutomatedAutoCompleteHandler.prototype = {
  param: this,
  sessionName: null,
  namesToComplete: null,
  numNamesToComplete: 0,
  indexIntoNames: 0,
  finalAddresses: null,

  numSessionsToSearch: 0,
  numSessionsSearched: 0,
  recipientType: null,
  searchResults: null,

  init(namesToComplete, recipientType) {
    this.indexIntoNames = 0;
    this.numNamesToComplete = namesToComplete.length;
    this.namesToComplete = namesToComplete;
    this.finalAddresses = [];

    this.recipientType = recipientType ? recipientType : "addr_to";

    // set up the auto complete sessions to use
    this.autoCompleteNextAddress();
  },

  autoCompleteNextAddress() {
    this.numSessionsToSearch = 0;
    this.numSessionsSearched = 0;
    this.searchResults = [];

    if (this.indexIntoNames < this.numNamesToComplete) {
      if (this.namesToComplete[this.indexIntoNames]) {
      /* XXX This is used to work, until switching to the new toolkit broke it
         We should fix it see bug 456550.
      if (!this.namesToComplete[this.indexIntoNames].includes('@')) // don't autocomplete if address has an @ sign in it
      {
        // make sure total session count is updated before we kick off ANY actual searches
        if (gAutocompleteSession)
          this.numSessionsToSearch++;

        if (gLDAPSession && gCurrentAutocompleteDirectory)
          this.numSessionsToSearch++;

        if (gAutocompleteSession)
        {
           gAutocompleteSession.onAutoComplete(this.namesToComplete[this.indexIntoNames], null, this);
           // AB searches are actually synchronous. So by the time we get here we have already looked up results.

           // if we WERE going to also do an LDAP lookup, then check to see if we have a valid match in the AB, if we do
           // don't bother with the LDAP search too just return

           if (gLDAPSession && gCurrentAutocompleteDirectory && this.searchResults[0] && this.searchResults[0].defaultItemIndex != -1)
           {
             this.processAllResults();
             return;
           }
        }

        if (gLDAPSession && gCurrentAutocompleteDirectory)
          gLDAPSession.onStartLookup(this.namesToComplete[this.indexIntoNames], null, this);
      }
      */

        if (!this.numSessionsToSearch)
          this.processAllResults(); // ldap and ab are turned off, so leave text alone.
      }
    } else {
      this.finish();
    }
  },

  onStatus(aStatus) {
  },

  onAutoComplete(aResults, aStatus) {
    // store the results until all sessions are done and have reported in
    if (aResults)
      this.searchResults[this.numSessionsSearched] = aResults;

    this.numSessionsSearched++; // bump our counter

    if (this.numSessionsToSearch <= this.numSessionsSearched)
      setTimeout(gAutomatedAutoCompleteListener.processAllResults, 0); // we are all done
  },

  processAllResults() {
    // Take the first result and add it to the compose window
    var addressToAdd;

    // loop through the results looking for the non default case (default case is the address book with only one match, the default domain)
    var sessionIndex;

    var searchResultsForSession;

    for (sessionIndex in this.searchResults) {
      searchResultsForSession = this.searchResults[sessionIndex];
      if (searchResultsForSession && searchResultsForSession.defaultItemIndex > -1) {
        addressToAdd = searchResultsForSession.items
          .queryElementAt(searchResultsForSession.defaultItemIndex,
                          Ci.nsIAutoCompleteItem).value;
        break;
      }
    }

    // still no match? loop through looking for the -1 default index
    if (!addressToAdd) {
      for (sessionIndex in this.searchResults) {
        searchResultsForSession = this.searchResults[sessionIndex];
        if (searchResultsForSession && searchResultsForSession.defaultItemIndex == -1) {
          addressToAdd = searchResultsForSession.items
            .queryElementAt(0, Ci.nsIAutoCompleteItem).value;
          break;
        }
      }
    }

    // no matches anywhere...just use what we were given
    if (!addressToAdd)
      addressToAdd = this.namesToComplete[this.indexIntoNames];

    this.finalAddresses.push(addressToAdd);

    this.indexIntoNames++;
    this.autoCompleteNextAddress();
  },

  finish() {
    // This will now append all the recipients, set the focus on a new
    // available row, and make sure it is visible.
    awAddRecipientsArray(this.recipientType, this.finalAddresses);
  },

  QueryInterface: ChromeUtils.generateQI(["nsIAutoCompleteListener"]),
};

// Returns the load context for the current window
function getLoadContext() {
  return window.docShell.QueryInterface(Ci.nsILoadContext);
}
