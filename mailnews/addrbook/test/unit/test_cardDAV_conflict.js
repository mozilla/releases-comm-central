/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  // Put some cards on the server.
  CardDAVServer.putCardInternal(
    "conflict.vcf",
    "BEGIN:VCARD\r\nUID:conflict\r\nFN:Changes A Lot\r\nEND:VCARD\r\n"
  );

  let directory = initDirectory();
  await directory.fetchAllFromServer();

  observer.init();

  // Check we have the initial version of the card.

  let cards = directory.childCards;
  Assert.equal(cards.length, 1);

  let [conflictCard] = cards;
  Assert.equal(conflictCard.getProperty("_etag", ""), "56");
  Assert.equal(
    conflictCard.getProperty("_href", ""),
    `${CardDAVServer.path}conflict.vcf`
  );
  Assert.equal(
    conflictCard.getProperty("_vCard", ""),
    "BEGIN:VCARD\r\nUID:conflict\r\nFN:Changes A Lot\r\nEND:VCARD\r\n"
  );

  // Change the card on the client. The server accepts the changes.

  conflictCard.firstName = "Changes A";
  conflictCard.lastName = "Lot";
  directory.modifyCard(conflictCard);

  await observer.waitFor("addrbook-contact-updated");
  cards = directory.childCards;
  Assert.equal(cards.length, 1);
  [conflictCard] = cards;

  Assert.equal(conflictCard.getProperty("_etag", ""), "76");
  Assert.equal(
    conflictCard.getProperty("_vCard", ""),
    "BEGIN:VCARD\r\nUID:conflict\r\nFN:Changes A Lot\r\nN:Lot;Changes A;;;\r\nEND:VCARD\r\n"
  );

  await checkCardsOnServer({
    conflict: {
      etag: "76",
      href: `${CardDAVServer.path}conflict.vcf`,
      vCard:
        "BEGIN:VCARD\r\nUID:conflict\r\nFN:Changes A Lot\r\nN:Lot;Changes A;;;\r\nEND:VCARD\r\n",
    },
  });

  // Change the card on the server.

  CardDAVServer.putCardInternal(
    "conflict.vcf",
    "BEGIN:VCARD\r\nUID:conflict\r\nFN:Changes A Lot\r\nN:Lot;Changes;A;;\r\nEND:VCARD\r\n"
  );

  // Change it on the client too. The server rejects the changes.

  conflictCard.setProperty(
    "Notes",
    "This change should be rejected by the server."
  );
  directory.modifyCard(conflictCard);

  await observer.waitFor("addrbook-contact-updated");
  cards = directory.childCards;
  Assert.equal(cards.length, 1);
  [conflictCard] = cards;

  Assert.equal(conflictCard.getProperty("_etag", ""), "127");
  Assert.equal(
    conflictCard.getProperty("_vCard", ""),
    "BEGIN:VCARD\r\nUID:conflict\r\nFN:Changes A Lot\r\nN:Lot;Changes;A;;\r\nNOTE:This change should be rejected by the server.\r\nEND:VCARD\r\n"
  );
  Assert.equal(conflictCard.firstName, "Changes");
  Assert.equal(conflictCard.lastName, "Lot");
  Assert.equal(conflictCard.getProperty("AdditionalNames", ""), "A");

  await checkCardsOnServer({
    conflict: {
      etag: "127",
      href: `${CardDAVServer.path}conflict.vcf`,
      vCard:
        "BEGIN:VCARD\r\nUID:conflict\r\nFN:Changes A Lot\r\nN:Lot;Changes;A;;\r\nNOTE:This change should be rejected by the server.\r\nEND:VCARD\r\n",
    },
  });

  await clearDirectory(directory);
});
