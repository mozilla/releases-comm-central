/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

registerCleanupFunction(() => {
  for (const book of MailServices.ab.directories) {
    if (
      ["ldap_2.servers.history", "ldap_2.servers.pab"].includes(book.dirPrefId)
    ) {
      let cards = book.childCards;
      if (cards.length > 0) {
        info(`Cleaning up ${cards.length} card(s) from ${book.dirName}`);
        for (const card of cards) {
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

  Services.focus.focusedWindow = window;
  const mailButton = document.getElementById("mailButton");
  mailButton.focus();
  mailButton.blur();
});

/**
 * Get the body part of an MIME message.
 *
 * @param {string} content - The message content.
 * @returns {string}
 */
function getMessageBody(content) {
  const separatorIndex = content.indexOf("\r\n\r\n");
  Assert.equal(content.slice(-2), "\r\n", "Should end with a line break.");
  return content.slice(separatorIndex + 4, -2);
}

async function chooseIdentity(win, identityKey) {
  const popup = win.document.getElementById("msgIdentityPopup");
  const shownPromise = BrowserTestUtils.waitForEvent(popup, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    win.document.getElementById("msgIdentity"),
    {},
    win
  );
  await shownPromise;
  const hiddenPromise = BrowserTestUtils.waitForEvent(popup, "popuphidden");
  popup.activateItem(popup.querySelector(`[identitykey="${identityKey}"]`));
  await hiddenPromise;
}
