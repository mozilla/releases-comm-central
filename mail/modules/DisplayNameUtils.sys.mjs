/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

export var DisplayNameUtils = {
  formatDisplayName,
  formatDisplayNameList,
};

// XXX: Maybe the strings for this file should go in a separate bundle?
var gMessengerBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

function _getIdentityForAddress(aEmailAddress) {
  const emailAddress = aEmailAddress.toLowerCase();
  for (const identity of MailServices.accounts.allIdentities) {
    if (!identity.email) {
      continue;
    }
    if (emailAddress == identity.email.toLowerCase()) {
      return identity;
    }
  }
  return null;
}

/**
 * Take an email address and compose a sensible display name based on the
 * header display name and/or the display name from the address book. If no
 * appropriate name can be made (e.g. there is no card for this address),
 * returns |null|.
 *
 * @param {string} emailAddress - The email address to format.
 * @param {string} headerDisplayName - The display name from the header, if any.
 * @param {string} context - The field being formatted (e.g. "to", "from").
 * @returns The formatted display name, or null.
 */
function formatDisplayName(emailAddress, headerDisplayName, context) {
  let displayName = null;
  const identity = _getIdentityForAddress(emailAddress);
  const card = MailServices.ab.cardForEmailAddress(emailAddress);

  // If this address is one of the user's identities...
  if (identity) {
    if (
      MailServices.accounts.allIdentities.length == 1 &&
      (!headerDisplayName || identity.fullName == headerDisplayName)
    ) {
      // ...pick a localized version of the word "Me" appropriate to this
      // specific header; fall back to the version used by the "to" header
      // if nothing else is available.
      try {
        displayName = gMessengerBundle.GetStringFromName(
          `header${context}FieldMe`
        );
      } catch (e) {
        displayName = gMessengerBundle.GetStringFromName("headertoFieldMe");
      }
    } else {
      // Use the full address. It's not the expected name, maybe a customized
      //  one the user sent, or one the sender got wrong, or we have multiple
      // identities making the "Me" short string ambiguous.
      displayName = MailServices.headerParser
        .makeMailboxObject(headerDisplayName, emailAddress)
        .toString();
    }
  }

  // If we don't have a card, refuse to generate a display name. Places calling
  // this are then responsible for falling back to something else (e.g. the
  // value from the message header).
  if (card) {
    // getProperty may return a "1" or "0" string, we want a boolean
    if (card.getProperty("PreferDisplayName", "1") == "1") {
      displayName = card.displayName || null;
    }

    // Note: headerDisplayName is not used as a fallback as confusion could be
    // caused by a collected address using an e-mail address as display name.
  }

  return displayName;
}

/**
 * Format the display name from a list of addresses. First, try using
 * formatDisplayName, then fall back to the header's display name or the
 * address.
 *
 * @param aHeaderValue  The decoded header value (e.g. mime2DecodedAuthor).
 * @param aContext      The context of the header field (e.g. "to", "from").
 * @returns The formatted display name.
 */
function formatDisplayNameList(aHeaderValue, aContext) {
  const addresses = MailServices.headerParser.parseDecodedHeader(aHeaderValue);
  if (addresses.length > 0) {
    const displayName = formatDisplayName(
      addresses[0].email,
      addresses[0].name,
      aContext
    );
    let andOthersStr = "";
    if (addresses.length > 1) {
      andOthersStr = " " + gMessengerBundle.GetStringFromName("andOthers");
    }

    if (displayName) {
      return displayName + andOthersStr;
    }

    // Construct default display.
    if (addresses[0].email) {
      return (
        MailServices.headerParser
          .makeMailboxObject(addresses[0].name, addresses[0].email)
          .toString() + andOthersStr
      );
    }
  }

  // Something strange happened, just return the raw header value.
  return aHeaderValue;
}
