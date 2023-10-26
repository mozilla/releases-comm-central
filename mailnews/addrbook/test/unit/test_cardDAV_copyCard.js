/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const vCardTemplate =
  "BEGIN:VCARD\r\nUID:{}\r\nFN:Move me around\r\nEND:VCARD\r\n";
const initialVCard = vCardTemplate.replace("{}", "copyme");

let cardDAVDirectory, localDirectory;
let initialCard, localCard;

add_task(async () => {
  // Put some cards on the server.

  CardDAVServer.putCardInternal("copyme.vcf", initialVCard);

  localDirectory = MailServices.ab.getDirectoryFromId("ldap_2.servers.pab");
  cardDAVDirectory = await initDirectory();
  await cardDAVDirectory.fetchAllFromServer();

  observer.init();

  // Check we have the initial version of the card.

  Assert.equal(cardDAVDirectory.childCards.length, 1);

  initialCard = cardDAVDirectory.childCards[0];
  Assert.equal(initialCard.UID, "copyme");
  Assert.equal(initialCard.getProperty("_etag", ""), "55");
  Assert.equal(
    initialCard.getProperty("_href", ""),
    `${CardDAVServer.path}copyme.vcf`
  );
  vCardEqual(initialCard.getProperty("_vCard", ""), initialVCard);
});

/** Copy the card to the local directory. */
add_task(async function copyCardToLocal() {
  localDirectory.dropCard(initialCard, true);
  Assert.equal(localDirectory.childCards.length, 1);

  localCard = localDirectory.childCards[0];
  // The UID must change, since this is a copy.
  Assert.notEqual(localCard.UID, "copyme");
  Assert.equal(localCard.getProperty("_etag", "EMPTY"), "EMPTY");
  Assert.equal(localCard.getProperty("_href", "EMPTY"), "EMPTY");
  vCardEqual(
    localCard.getProperty("_vCard", "EMPTY"),
    vCardTemplate.replace("{}", localCard.UID)
  );
});

/** Remove the card from the local directory for the next step. */
add_task(async function () {
  localDirectory.deleteCards(localDirectory.childCards);
  Assert.equal(localDirectory.childCards.length, 0);
});

/** This time, move the card to the local directory. */
add_task(async function moveCardToLocal() {
  localDirectory.addCard(initialCard);
  Assert.equal(localDirectory.childCards.length, 1);

  localCard = localDirectory.childCards[0];
  // UID should not change
  Assert.equal(localCard.UID, "copyme");
  Assert.equal(localCard.getProperty("_etag", "EMPTY"), "EMPTY");
  Assert.equal(localCard.getProperty("_href", "EMPTY"), "EMPTY");
  vCardEqual(
    localCard.getProperty("_vCard", "EMPTY"),
    vCardTemplate.replace("{}", localCard.UID)
  );
});

/**
 * Okay, let's go back again. First we'll need to remove the card from the
 * CardDAV directory.
 */
add_task(async function () {
  const deletedPromise = observer.waitFor("addrbook-contact-deleted");
  cardDAVDirectory.deleteCards(cardDAVDirectory.childCards);
  await deletedPromise;
  Assert.equal(cardDAVDirectory.childCards.length, 0);
});

/** Copy the card back to the CardDAV directory. */
add_task(async function copyCardToCardDAV() {
  cardDAVDirectory.dropCard(localCard, true);
  Assert.equal(cardDAVDirectory.childCards.length, 1);

  const newCard = cardDAVDirectory.childCards[0];
  Assert.notEqual(newCard.UID, "copyme");
  Assert.equal(localCard.getProperty("_etag", "EMPTY"), "EMPTY");
  Assert.equal(localCard.getProperty("_href", "EMPTY"), "EMPTY");
  vCardEqual(
    localCard.getProperty("_vCard", "EMPTY"),
    vCardTemplate.replace("{}", localCard.UID)
  );

  await observer.waitFor("addrbook-contact-updated");
  const newCardAfterSync = cardDAVDirectory.childCards[0];
  Assert.equal(newCardAfterSync.getProperty("_etag", "EMPTY"), "85");
  Assert.equal(
    newCardAfterSync.getProperty("_href", "EMPTY"),
    `${CardDAVServer.path}${newCard.UID}.vcf`
  );
  vCardEqual(
    newCardAfterSync.getProperty("_vCard", "EMPTY"),
    vCardTemplate.replace("{}", newCard.UID)
  );
});

/** Remove the card from the CardDAV directory again. */
add_task(async function () {
  const deletedPromise = observer.waitFor("addrbook-contact-deleted");
  cardDAVDirectory.deleteCards(cardDAVDirectory.childCards);
  await deletedPromise;
  Assert.equal(cardDAVDirectory.childCards.length, 0);
});

/** This time, move the card to the CardDAV directory. */
add_task(async function moveCardToCardDAV() {
  cardDAVDirectory.addCard(localCard);
  Assert.equal(cardDAVDirectory.childCards.length, 1);

  const newCard = cardDAVDirectory.childCards[0];
  // UID should not change
  Assert.equal(newCard.UID, "copyme");
  Assert.equal(localCard.getProperty("_etag", "EMPTY"), "EMPTY");
  Assert.equal(localCard.getProperty("_href", "EMPTY"), "EMPTY");
  // _vCard property won't change until we send this card to the server.
  vCardEqual(localCard.getProperty("_vCard", "EMPTY"), initialVCard);

  await observer.waitFor("addrbook-contact-updated");
  const newCardAfterSync = cardDAVDirectory.childCards[0];
  Assert.equal(newCardAfterSync.getProperty("_etag", "EMPTY"), "55");
  Assert.equal(
    newCardAfterSync.getProperty("_href", "EMPTY"),
    `${CardDAVServer.path}copyme.vcf`
  );
  vCardEqual(newCardAfterSync.getProperty("_vCard", "EMPTY"), initialVCard);

  await clearDirectory(cardDAVDirectory);
});
