/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../mailnews/addrbook/content/abResultsPane.js */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gAbView = null;

var kDefaultAscending = "ascending";
var kDefaultDescending = "descending";
var kAllDirectoryRoot = "moz-abdirectory://";
var kPersonalAddressbookURI = "jsaddrbook://abook.sqlite";

async function AbDelete() {
  const types = GetSelectedCardTypes();
  if (types == kNothingSelected) {
    return;
  }

  const cards = GetSelectedAbCards();

  // Determine strings for smart and context-sensitive user prompts
  // for confirming deletion.
  let action, name, list;
  const selectedDir = gAbView.directory;

  switch (types) {
    case kListsAndCards:
      action = "delete-mixed";
      break;
    case kSingleListOnly:
    case kMultipleListsOnly:
      action = "delete-lists";
      name = cards[0].displayName;
      break;
    default: {
      const nameFormatFromPref = Services.prefs.getIntPref(
        "mail.addr_book.lastnamefirst"
      );
      name = cards[0].generateName(nameFormatFromPref);
      if (selectedDir && selectedDir.isMailList) {
        action = "remove-contacts";
        list = selectedDir.dirName;
      } else {
        action = "delete-contacts";
      }
      break;
    }
  }

  // Adjust strings to match translations.
  let actionString;
  switch (action) {
    case "delete-contacts":
      actionString = !cards.length
        ? "delete-contacts-single"
        : "delete-contacts-multi";
      break;
    case "remove-contacts":
      actionString = !cards.length
        ? "remove-contacts-single"
        : "remove-contacts-multi";
      break;
    default:
      actionString = action;
      break;
  }

  const [title, message] = await document.l10n.formatValues([
    {
      id: `about-addressbook-confirm-${action}-title`,
      args: { count: cards.length },
    },
    {
      id: `about-addressbook-confirm-${actionString}`,
      args: {
        count: cards.length,
        name,
        list,
      },
    },
  ]);

  // Finally, show our smart confirmation message, and act upon it!
  if (!Services.prompt.confirm(window, title, message)) {
    // Deletion cancelled by user.
    return;
  }

  // Delete cards from address books or mailing lists.
  gAbView.deleteSelectedCards();
}

function AbNewMessage(address) {
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.type = Ci.nsIMsgCompType.New;
  params.format = Ci.nsIMsgCompFormat.Default;
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  if (address) {
    params.composeFields.to = address;
  } else {
    params.composeFields.to = GetSelectedAddresses();
  }
  MailServices.compose.OpenComposeWindowWithParams(null, params);
}

/**
 * Make a mailbox string from the card, for use in the UI.
 *
 * @param {nsIAbCard} - The card to use.
 * @returns {string} A mailbox representation of the card.
 */
function makeMailboxObjectFromCard(card) {
  if (!card) {
    return "";
  }

  let email;
  if (card.isMailList) {
    const directory = GetDirectoryFromURI(card.mailListURI);
    email = directory.description || card.displayName;
  } else {
    email = card.primaryEmail;
  }

  return MailServices.headerParser
    .makeMailboxObject(card.displayName, email)
    .toString();
}

function GetDirectoryFromURI(uri) {
  if (uri.startsWith("moz-abdirectory://")) {
    return null;
  }
  return MailServices.ab.getDirectory(uri);
}
