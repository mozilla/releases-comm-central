/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

registerCleanupFunction(() => {
  for (let book of MailServices.ab.directories) {
    if (
      ["ldap_2.servers.history", "ldap_2.servers.pab"].includes(book.dirPrefId)
    ) {
      let cards = book.childCards;
      if (cards.length > 0) {
        info(`Cleaning up ${cards.length} card(s) from ${book.dirName}`);
        for (let card of cards) {
          if (card.isMailList) {
            MailServices.ab.deleteAddressBook(card.mailListURI);
          }
        }
        cards = cards.filter(c => !c.isMailList);
        if (cards.length > 0) {
          book.deleteCards(cards);
        }
      }
      is(book.childCards.length, 0);
    } else {
      Assert.report(true, undefined, undefined, "Unexpected address book!");
      MailServices.ab.deleteAddressBook(book.URI);
    }
  }
});

function waitForSaveOperation(cwc) {
  utils.waitFor(
    () => !cwc.window.gSaveOperationInProgress && !cwc.window.gWindowLock,
    "Saving of draft did not finish"
  );
}
