/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AddrBookCard: "resource:///modules/AddrBookCard.sys.mjs",
});

/**
 * Collects a single name and email address into the address book.
 * By default, it saves the address without checking for an existing one.
 *
 * @param {string} email - The email address to collect.
 * @param {string} displayName - The display name associated with the email
 *   address.
 * @param {boolean} createCard - Set to true if a card should be created if the
 *    email address doesn't exist (ignored if skipCheckExisting is true).
 * @param {boolean} [skipCheckExisting=false] - If this is set then the
 *   implementation will skip checking for an existing card, and just create
 *   a new card.
 */
export function collectSingleAddress(
  email,
  displayName,
  createCard,
  skipCheckExisting
) {
  let book = null;
  let card = null;
  if (!skipCheckExisting) {
    book = MailServices.ab.directories.find(d => d.cardForEmailAddress(email));
    if (book) {
      card = book.cardForEmailAddress(email);

      // If a card has email, but it's the secondary address, we don't want to
      // update any properties, so just return.
      if (card.primaryEmail?.toLowerCase() != email.toLowerCase()) {
        return;
      }
    }
  }
  if (!card && (createCard || skipCheckExisting)) {
    card = new lazy.AddrBookCard();
    card.primaryEmail = email;
    card.displayName = displayName;
    if (displayName.includes(" ")) {
      const idx = displayName.lastIndexOf(" ");
      card.firstName = displayName.substring(0, idx);
      card.lastName = displayName.substring(idx + 1);
    }

    const abURI = Services.prefs.getStringPref("mail.collect_addressbook", "");
    const collectedAddressesBook = MailServices.ab.getDirectory(abURI);
    if (collectedAddressesBook.readOnly) {
      throw new Error("Can't collect to readOnly address book.");
    }
    collectedAddressesBook.addCard(card);
  } else if (card && !book.readOnly) {
    // It could be that the origin directory is read-only, so don't try and
    // write to it if it is.

    if (!card.displayName && displayName) {
      card.displayName = displayName;
      if (displayName.includes(" ")) {
        const idx = displayName.lastIndexOf(" ");
        card.firstName = displayName.substring(0, idx);
        card.lastName = displayName.substring(idx + 1);
      }
      book.modifyCard(card);
    }
  }
}
