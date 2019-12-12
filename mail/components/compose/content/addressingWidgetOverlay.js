/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from MsgComposeCommands.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MimeParser } = ChromeUtils.import("resource:///modules/mimeParser.jsm");
var { DisplayNameUtils } = ChromeUtils.import(
  "resource:///modules/DisplayNameUtils.jsm"
);
var gDragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);

/**
 * Convert all the written recipients into string and store them into the
 * msgCompFields array to be printed in the message header.
 *
 * @param {Array} msgCompFields - The array containing all the recipients.
 */
function Recipients2CompFields(msgCompFields) {
  if (!msgCompFields) {
    throw new Error(
      "Message Compose Error: msgCompFields is null (ExtractRecipients)"
    );
  }

  let addrTo = "";
  let addrCc = "";
  let addrBcc = "";
  let addrReply = "";
  let addrNg = "";
  let addrFollow = "";
  let to_Sep = "";
  let cc_Sep = "";
  let bcc_Sep = "";
  let reply_Sep = "";
  let ng_Sep = "";
  let follow_Sep = "";

  for (let pill of document.getElementsByTagName("mail-address-pill")) {
    let fieldValue = pill.fullAddress;
    let headerParser = MailServices.headerParser;
    let recipient = headerParser
      .makeFromDisplayAddress(fieldValue)
      .map(fullValue =>
        headerParser.makeMimeAddress(fullValue.name, fullValue.email)
      )
      .join(", ");

    // Each pill knows from which recipient they were generated
    // (addr_to, addrs_bcc, etc.).
    let recipientType = pill.getAttribute("recipienttype");
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
        addrNg += ng_Sep + recipient;
        ng_Sep = ",";
        break;
      case "addr_followup":
        addrFollow += follow_Sep + recipient;
        follow_Sep = ",";
        break;
      case "addr_other":
        let label = pill.emailInput.getAttribute("aria-labelledby");
        msgCompFields.setRawHeader(label, recipient, null);
        break;
    }
  }

  msgCompFields.to = addrTo;
  msgCompFields.cc = addrCc;
  msgCompFields.bcc = addrBcc;
  msgCompFields.replyTo = addrReply;
  msgCompFields.newsgroups = addrNg;
  msgCompFields.followupTo = addrFollow;
}

/**
 * Convert all the recipients coming from a message header into pills.
 *
 * @param {Array} msgCompFields - The array containing all the recipients.
 */
function CompFields2Recipients(msgCompFields) {
  if (msgCompFields) {
    let msgReplyTo = msgCompFields.replyTo
      ? MailServices.headerParser.parseEncodedHeader(msgCompFields.replyTo)
      : null;
    let msgTo = msgCompFields.to
      ? MailServices.headerParser.parseEncodedHeader(msgCompFields.to)
      : null;
    let msgCC = msgCompFields.cc
      ? MailServices.headerParser.parseEncodedHeader(msgCompFields.cc)
      : null;
    let msgBCC = msgCompFields.bcc
      ? MailServices.headerParser.parseEncodedHeader(msgCompFields.bcc)
      : null;
    let msgNewsgroups = msgCompFields.newsgroups;
    let msgFollowupTo = msgCompFields.followupTo
      ? MailServices.headerParser.parseEncodedHeader(msgCompFields.followupTo)
      : null;

    // Populate all the recipients with the proper values.
    // We need to force the focus() on each input to trigger the attachment
    // of the autocomplete mController.
    if (msgReplyTo) {
      showAddressRow(document.getElementById("addr_reply"), "addressRowReply");
      let input = document.getElementById("replyAddrInput");
      input.focus();
      input.value = msgReplyTo.join(", ");
      recipientAddPill(input, true);
    }

    if (msgTo) {
      let input = document.getElementById("toAddrInput");
      input.focus();
      input.value = msgTo.join(", ");
      recipientAddPill(input, true);
    }

    if (msgCC) {
      showAddressRow(document.getElementById("addr_cc"), "addressRowCc");
      let input = document.getElementById("ccAddrInput");
      input.focus();
      input.value = msgCC.join(", ");
      recipientAddPill(input, true);
    }

    if (msgBCC) {
      showAddressRow(document.getElementById("addr_bcc"), "addressRowBcc");
      let input = document.getElementById("bccAddrInput");
      input.focus();
      input.value = msgBCC.join(", ");
      recipientAddPill(input, true);
    }

    if (msgNewsgroups) {
      showAddressRow(
        document.getElementById("addr_newsgroups"),
        "addressRowNewsgroups"
      );
      let input = document.getElementById("newsgroupsAddrInput");
      input.focus();
      input.value = msgNewsgroups;
      recipientAddPill(input, true);
    }

    if (msgFollowupTo) {
      showAddressRow(
        document.getElementById("addr_followup"),
        "addressRowFollowup"
      );
      let input = document.getElementById("followupAddrInput");
      input.focus();
      input.value = msgFollowupTo.join(", ");
      recipientAddPill(input, true);
    }

    // CompFields2Recipients is called whenever a user replies or edits an existing message. We want to
    // add all of the non-empty recipients for this message to the ignore list for spell check
    let currentAddress = gCurrentIdentity ? gCurrentIdentity.fullAddress : "";
    addRecipientsToIgnoreList(
      [currentAddress, msgTo, msgCC, msgBCC].filter(adr => adr).join(", ")
    );
  }
}

/**
 * Clear a specific recipient row if is visible and pills are present. This is
 * commonly used when loading a new identity.
 *
 * @param {Array} msgCompFields - The array containing all the recipient fields.
 * @param {string} recipientType - Which recipient needs to be cleared.
 * @param {Array} recipientsList - The array containing the old recipients.
 */
function awRemoveRecipients(msgCompFields, recipientType, recipientsList) {
  if (!msgCompFields || !recipientsList) {
    return;
  }

  let element;
  switch (recipientType) {
    case "addr_cc":
      element = document.getElementById("ccAddrInput");
      break;
    case "addr_bcc":
      element = document.getElementById("bccAddrInput");
      break;
    case "addr_reply":
      element = document.getElementById("replyAddrInput");
      break;
    case "addr_to":
    default:
      element = document.getElementById("toAddrInput");
      break;
  }

  let container = element.closest(".address-container");
  for (let pill of container.querySelectorAll("mail-address-pill")) {
    pill.remove();
  }

  // Reset the original input.
  let input = container.querySelector(`input[is="autocomplete-input"]`);
  input.value = "";

  if (recipientType != "addr_to") {
    container.classList.add("hidden");
    document.getElementById(recipientType).removeAttribute("collapsed");
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
  if (!msgCompFields || !recipientsList) {
    return;
  }

  awAddRecipientsArray(
    recipientType,
    msgCompFields.splitRecipients(recipientsList, false)
  );
}

/**
 * Adds a batch of new recipient pill matching recipientType
 * and drops in the array of addresses.
 *
 * @param aRecipientType  Type of recipient, e.g. "addr_to".
 * @param aAddressArray   An array of recipient addresses (strings) to add.
 */
function awAddRecipientsArray(aRecipientType, aAddressArray) {
  let label = document.getElementById(aRecipientType);
  let addresses = MailServices.headerParser.makeFromDisplayAddress(
    aAddressArray
  );
  let element = document.getElementById(label.getAttribute("control"));

  if (label && element.closest(".address-row").classList.contains("hidden")) {
    label.click();
  }

  for (let address of addresses) {
    let pill = createRecipientPill(element, address);
    element.closest(".address-container").insertBefore(pill, element);
  }

  if (element.id != "replyAddrInput") {
    onRecipientsChanged();
  }

  // Add the recipients to our spell check ignore list.
  addRecipientsToIgnoreList(aAddressArray.join(", "));
  calculateHeaderHeight();
}

function DragOverAddressingWidget(event) {
  let dragSession = (dragSession = gDragService.getCurrentSession());

  if (dragSession.isDataFlavorSupported("text/x-moz-address")) {
    dragSession.canDrop = true;
  }
}

function DropOnAddressingWidget(event) {
  let dragSession = gDragService.getCurrentSession();

  let trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  trans.init(getLoadContext());
  trans.addDataFlavor("text/x-moz-address");

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

    // pull the address out of the data object
    let address = dataObj.data.substring(0, dataObj.length);
    if (!address) {
      continue;
    }

    DropRecipient(event.target, address);
  }
}

/**
 * Find the autocomplete input when an address is dropped in the compose header.
 *
 * @param {XULElement} target - The element where an address was dropped.
 * @param {string} recipient - The email address dragged by the user.
 */
function DropRecipient(target, recipient) {
  let input;

  if (target.tagName == "label" && target.hasAttribute("control")) {
    input = document.getElementById(target.getAttribute("control"));
  } else {
    let container = target.classList.contains("address-row")
      ? target
      : target.closest("hbox.address-row");

    if (!container) {
      return;
    }
    input = container.querySelector(
      `.address-container > input[is="autocomplete-input"]`
    );
  }

  if (!input || !input.hasAttribute("is")) {
    return;
  }

  let recipientType =
    input.getAttribute("recipienttype") != "addr_other"
      ? input.getAttribute("recipienttype")
      : input.getAttribute("aria-labelledby");

  awAddRecipientsArray(recipientType, [recipient]);
}

function awSizerListen() {
  // when splitter is clicked, fill in necessary dummy rows each time
  // the mouse is moved.
  document.addEventListener("mousemove", awSizerMouseMove, true);
  document.addEventListener("mouseup", awSizerMouseUp, {
    capture: false,
    once: true,
  });
}
// Add the overflow scroll attribute to the recipients container.
function awSizerMouseMove() {
  document.getElementById("recipientsContainer").classList.add("overflow");
}

function awSizerMouseUp() {
  document.removeEventListener("mousemove", awSizerMouseMove, true);
}

// Returns the load context for the current window
function getLoadContext() {
  return window.docShell.QueryInterface(Ci.nsILoadContext);
}

/**
 * Handles keypress events for the email address inputs (that auto-fill)
 * in the Message Compose window.
 *
 * @param {Event} event - The DOM keypress event.
 * @param {HTMLElement} element - The element that triggered the keypress event.
 */
function recipientKeyPress(event, element) {
  switch (event.key) {
    case "a":
      // Select all the pills if the input is empty.
      if ((event.ctrlKey || event.metaKey) && !element.value.trim()) {
        selectRecipientPills(element);
      }
      break;
    case ",":
      event.preventDefault();
      element.handleEnter(event);
      break;
    case "Home":
    case "End":
    case "ArrowLeft":
    case "Backspace":
      if (!element.value.trim() && !event.repeat) {
        let pills = element
          .closest(".address-container")
          .querySelectorAll("mail-address-pill");
        if (pills.length) {
          let key = event.key == "Home" ? 0 : pills.length - 1;
          pills[key].focus();
          pills[key].checkKeyboardSelected(event, pills[key]);
        }
      }
      break;
    case "Enter":
      // No address entered, move focus to Subject field.
      if (!element.value.trim()) {
        document.getElementById("msgSubject").focus();
        return;
      }
      break;
    case "Tab":
      // Trigger the autocomplete controller only if we have a value
      // to prevent interfering with the natural change of focus on Tab.
      if (element.value.trim()) {
        event.preventDefault();
        element.handleEnter(event);
      }
      break;
  }

  // Don't alter the field size if any arrow key is triggered.
  if ([37, 38, 39, 40].includes(event.keyCode)) {
    return;
  }

  let size = parseInt(element.getAttribute("size"));
  // Change the min size of the input field on typing.
  if (event.key == "Backspace" && size > 1) {
    element.setAttribute("size", size - 1);
  } else {
    element.setAttribute("size", size + 1);
  }
}

/**
 * Add a new "address-pill" to the parent recipient container.
 *
 * @param {HTMLElement} element - The element that triggered the keypress event.
 * @param {boolean} [automatic=false] - Set to true if the change of recipients
 *   was invoked programmatically and should not be considered a change of
 *   message content.
 */
function recipientAddPill(element, automatic = false) {
  if (!element.value.trim()) {
    return;
  }

  let parent = document.getElementById(
    element.closest(".address-container").id
  );
  let addresses = MailServices.headerParser.makeFromDisplayAddress(
    element.value
  );

  for (let address of addresses) {
    let pill = createRecipientPill(element, address);
    parent.insertBefore(pill, element);

    // Be sure to add the user add recipient to our ignore list
    // when the user hits enter in an autocomplete widget...
    addRecipientsToIgnoreList(element.value);
  }

  // Reset the input element.
  element.removeAttribute("nomatch");
  element.setAttribute("size", 1);
  element.value = "";

  // We need to detach the autocomplete Controller to prevent the input
  // to be filled with the previously selected address when the "blur" event
  // gets triggered.
  element.detachController();
  // Attach it again to enable autocomplete.
  element.attachController();

  onRecipientsChanged(automatic);
  calculateHeaderHeight();
}

/**
 * Create a new recipient pill.
 *
 * @param {HTMLElement} element - The original autocomplete input that generated
 *   the pill.
 * @param {Array} address - The array containing the recipient's info.
 * @returns {XULElement} The newly created pill element.
 */
function createRecipientPill(element, address) {
  let pill = document.createXULElement("mail-address-pill");

  pill.originalInput = element;
  pill.label = address.toString();
  pill.emailAddress = address.email || "";
  pill.fullAddress = address.toString();
  pill.displayName = address.name || "";
  pill.setAttribute("recipienttype", element.getAttribute("recipienttype"));

  let listNames = MimeParser.parseHeaderField(
    address.toString(),
    MimeParser.HEADER_ADDRESS
  );
  let isMailingList =
    listNames.length > 0 &&
    MailServices.ab.mailListNameExists(listNames[0].name);
  let isNewsgroup = element.classList.contains("nntp-input");

  pill.classList.toggle(
    "error",
    !isValidAddress(address.email) && !isMailingList && !isNewsgroup
  );

  let emailCard = DisplayNameUtils.getCardForEmail(address.email);
  pill.classList.toggle(
    "warning",
    isValidAddress(address.email) &&
      !emailCard.card &&
      !isMailingList &&
      !isNewsgroup
  );

  return pill;
}

/**
 * Force a focused styling on the recipient container of the currently
 * selected input element.
 *
 * @param {HTMLElement} element - The element receving focus.
 */
function highlightAddressContainer(element) {
  element.closest(".address-container").setAttribute("focused", "true");
  deselectAllPills();
}

/**
 * Deselect any previously selected pills.
 */
function deselectAllPills() {
  for (let pill of document.querySelectorAll(`mail-address-pill[selected]`)) {
    pill.removeAttribute("selected");
  }
}

/**
 * Remove the focused styling from the recipient container and create
 * address pills if valid recipients were written.
 *
 * @param {HTMLElement} element - The element losing focus.
 */
function resetAddressContainer(element) {
  let address = element.value.trim();
  let listNames = MimeParser.parseHeaderField(
    address,
    MimeParser.HEADER_ADDRESS
  );
  let isMailingList =
    listNames.length > 0 &&
    MailServices.ab.mailListNameExists(listNames[0].name);

  if (
    address &&
    (isValidAddress(address) ||
      isMailingList ||
      element.classList.contains("nntp-input"))
  ) {
    recipientAddPill(element);
  }

  // Reset the input size if no pill was created.
  if (!address) {
    element.setAttribute("size", 1);
  }
  element.closest(".address-container").removeAttribute("focused");
}

/**
 * Trigger the startEditing() method of the mail-address-pill element.
 *
 * @param {XULlement} element - The element from which the context menu was
 *   opened.
 * @param {Event} event - The DOM event.
 */
function editAddressPill(element, event) {
  element.closest("mail-address-pill").startEditing(event);
}

/**
 * Copy the selected pills email address.
 *
 * @param {XULElement} element - The element from which the context menu was
 *   opened.
 */
function copyEmailNewsAddress(element) {
  let allAddresses = [];
  for (let pill of getAllSelectedPills(element.closest("mail-address-pill"))) {
    allAddresses.push(pill.fullAddress);
  }

  let clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
    Ci.nsIClipboardHelper
  );
  clipboard.copyString(allAddresses.join(", "));
}

/**
 * Cut the selected pills email address.
 *
 * @param {XULElement} element - The element from which the context menu was
 *   opened.
 */
function cutEmailNewsAddress(element) {
  copyEmailNewsAddress(element);
  deleteAddressPill(element);
}

/**
 * Delete the selected pill/pills.
 *
 * @param {XULElement} element - The element from which the context menu was
 *   opened.
 */
function deleteAddressPill(element) {
  let firstPill = element.closest("mail-address-pill");

  // We need to store the input location before removing the pills.
  let input = firstPill
    .closest(".address-container")
    .querySelector(`input[is="autocomplete-input"][recipienttype]`);

  for (let pill of getAllSelectedPills(firstPill)) {
    pill.remove();
  }

  input.focus();
  onRecipientsChanged();
}

/**
 * Handle the keypress event on the labels to show the container row
 * of an hidden recipient (Cc, Bcc, etc.).
 *
 * @param {Event} event - The DOM keypress event.
 * @param {XULelement} label - The clicked label to hide.
 * @param {string} rowID - The ID of the container to reveal.
 */
function showAddressRowKeyPress(event, label, rowID) {
  if (event.key == "Enter") {
    showAddressRow(label, rowID);
  }
}

/**
 * Show the container row of an hidden recipient (Cc, Bcc, etc.).
 *
 * @param {XULelement} label - The clicked label to hide.
 * @param {string} rowID - The ID of the container to reveal.
 */
function showAddressRow(label, rowID) {
  let container = document.getElementById(rowID);
  let input = container.querySelector(`input[is="autocomplete-input"]`);

  container.classList.remove("hidden");
  label.setAttribute("collapsed", "true");
  input.focus();
}

/**
 * Hide the container row of a recipient (Cc, Bcc, etc.).
 * The container can't be hidden if previously typed addresses are listed.
 *
 * @param {XULelement} element - The clicked label.
 * @param {string} labelID - The ID of the label to show.
 */
function hideAddressRow(element, labelID) {
  let container = element.closest(".address-row");
  let fieldName = container.querySelector(".address-label-container > label");
  let confirmTitle = getComposeBundle().getFormattedString(
    "confirmRemoveRecipientRowTitle",
    [fieldName.value]
  );
  let confirmBody = getComposeBundle().getFormattedString(
    "confirmRemoveRecipientRowBody",
    [fieldName.value]
  );

  let pills = container.querySelectorAll("mail-address-pill");
  // Ask the user to confirm the removal of all the typed addresses.
  if (
    pills.length &&
    !Services.prompt.confirm(null, confirmTitle, confirmBody)
  ) {
    return;
  }

  for (let pill of pills) {
    pill.remove();
  }

  // Reset the original input.
  let input = container.querySelector(`input[is="autocomplete-input"]`);
  input.value = "";

  container.classList.add("hidden");
  document.getElementById(labelID).removeAttribute("collapsed");

  onRecipientsChanged();
}

/**
 * Calculate the height of the composer header area every time a pill is created.
 * If the height is bigger than 2/3 of the compose window heigh, enable overflow.
 */
function calculateHeaderHeight() {
  let container = document.getElementById("msgheaderstoolbar-box");
  if (container.classList.contains("overflow")) {
    return;
  }

  if (container.clientHeight >= window.outerHeight * 0.7) {
    document.getElementById("recipientsContainer").classList.add("overflow");

    let header = document.getElementById("headers-box");
    if (!header.hasAttribute("height")) {
      header.setAttribute("height", 300);
    }
  }
}

/**
 * Move the focus on the first pill from the same .address-container.
 *
 * @param {XULElement} pill - The mail-address-pill element.
 */
function setFocusOnFirstPill(pill) {
  pill.closest(".address-container").firstElementChild.focus();
}

// #TODO: The getSiblingPills(), getAllPills(), and getAllSelectedPills()
// methods are not a good way to handle these scenarios, and they should be
// moved into their own CE. See Bug 1601740

/**
 * Return all the pills from the same .address-container.
 *
 * @param {XULElement} pill - The mail-address-pill element.
 * @return {Array} Array of mail-address-pill elements.
 */
function getSiblingPills(pill) {
  return pill
    .closest(".address-container")
    .querySelectorAll("mail-address-pill");
}

/**
 * Return all the pills currently available in the document.
 *
 * @return {Array} Array of mail-address-pill elements.
 */
function getAllPills() {
  return document.querySelectorAll("mail-address-pill");
}

/**
 * Return all the selected pills currently available in the document.
 *
 * @return {Array} Array of selected mail-address-pill elements.
 */
function getAllSelectedPills() {
  return document.querySelectorAll(`mail-address-pill[selected]`);
}

// #END TODO
