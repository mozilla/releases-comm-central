/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["DisplayNameUtils"];

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var DisplayNameUtils = {
  formatDisplayName,
  formatDisplayNameList,
};

// XXX: Maybe the strings for this file should go in a separate bundle?
var gMessengerBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

function _getIdentityForAddress(aEmailAddress) {
  let emailAddress = aEmailAddress.toLowerCase();
  for (let identity of MailServices.accounts.allIdentities) {
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
 * @param aEmailAddress      The email address to format.
 * @param aHeaderDisplayName The display name from the header, if any
 *                           (unused, maintained for add-ons, previously used
 *                           as a fallback).
 * @param aContext           The field being formatted (e.g. "to", "from").
 * @param aCard              The address book card, if any.
 * @return The formatted display name, or null.
 */
function formatDisplayName(aEmailAddress, aHeaderDisplayName, aContext, aCard) {
  var displayName = null;
  var identity = _getIdentityForAddress(aEmailAddress);
  var card = MailServices.ab.cardForEmailAddress(aEmailAddress);

  // If this address is one of the user's identities...
  if (identity) {
    // ...pick a localized version of the word "Me" appropriate to this
    // specific header; fall back to the version used by the "to" header
    // if nothing else is available.
    try {
      displayName = gMessengerBundle.GetStringFromName(
        "header" + aContext + "FieldMe"
      );
    } catch (e) {
      displayName = gMessengerBundle.GetStringFromName("headertoFieldMe");
    }

    // Make sure we have an unambiguous name if there are multiple identities
    if (MailServices.accounts.allIdentities.length > 1) {
      displayName = MailServices.headerParser
        .makeMailboxObject(displayName, identity.email)
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

    // Note: aHeaderDisplayName is not used as a fallback as confusion could be
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
 * @return The formatted display name.
 */
function formatDisplayNameList(aHeaderValue, aContext) {
  let addresses = MailServices.headerParser.parseDecodedHeader(aHeaderValue);
  if (addresses.length > 0) {
    let displayName = formatDisplayName(
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
