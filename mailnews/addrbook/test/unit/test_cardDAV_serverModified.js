/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* Tests what happens if a server modifies a card when it first arrives.
 * In this test the server changes the card's UID and path, which Google's
 * CardDAV server does, and also adds a new property. All changes should be
 * reflected in the client. */

add_task(async () => {
  CardDAVServer.modifyCardOnPut = true;

  const directory = await initDirectory();
  await directory.fetchAllFromServer();

  observer.init();

  // Create a new card, and check it has the right UID.

  let newCard = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  newCard.displayName = "A New Card";
  newCard.UID = "a-new-card";
  newCard = directory.addCard(newCard);
  observer.checkAndClearNotifications({
    "addrbook-contact-created": ["a-new-card"],
    "addrbook-contact-updated": [],
    "addrbook-contact-deleted": [],
  });

  Assert.equal(directory.childCards.length, 1);
  Assert.equal(directory.childCards[0].UID, "a-new-card");

  // Wait for notifications. Both arrive at once so we listen for the first.

  const newUID = await observer.waitFor("addrbook-contact-created");
  Assert.equal(newUID, "drac-wen-a");

  // Check the original card was deleted.

  observer.checkAndClearNotifications({
    "addrbook-contact-created": [],
    "addrbook-contact-updated": [],
    "addrbook-contact-deleted": ["a-new-card"],
  });

  // Check we have the card as modified by the server.

  Assert.equal(directory.childCards.length, 1);
  const modifiedCard = directory.childCards[0];
  Assert.equal(modifiedCard.UID, "drac-wen-a");
  Assert.equal(modifiedCard.getProperty("_etag", ""), "92");
  Assert.equal(
    modifiedCard.getProperty("_href", ""),
    "/addressbooks/me/test/drac-wen-a.vcf"
  );
  Assert.stringContains(
    modifiedCard.getProperty("_vCard", ""),
    "UID:drac-wen-a\r\n"
  );
  Assert.stringContains(
    modifiedCard.getProperty("_vCard", ""),
    "X-MODIFIED-BY-SERVER:1\r\n"
  );

  await clearDirectory(directory);
});
