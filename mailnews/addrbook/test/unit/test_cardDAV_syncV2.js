/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

async function subtest() {
  // Put some cards on the server.
  CardDAVServer.putCardInternal(
    "keep-me.vcf",
    "BEGIN:VCARD\r\nUID:keep-me\r\nFN:I'm going to stay.\r\nEND:VCARD\r\n"
  );
  CardDAVServer.putCardInternal(
    "change-me.vcf",
    // This one includes a character encoded with UTF-8.
    "BEGIN:VCARD\r\nUID:change-me\r\nFN:I'm going to be changed. \xCF\x9E\r\nEND:VCARD\r\n"
  );
  CardDAVServer.putCardInternal(
    "delete-me.vcf",
    "BEGIN:VCARD\r\nUID:delete-me\r\nFN:I'm going to be deleted.\r\nEND:VCARD\r\n"
  );

  const directory = await initDirectory();

  // We'll only use this for the initial sync, so I think it's okay to use
  // bulkAddCards and not get a notification for every contact.
  info("Initial sync with server.");
  await directory.fetchAllFromServer();

  let lastSyncToken = directory._syncToken;
  info(`Token is: ${lastSyncToken}`);

  info("Cards:");
  const cardMap = new Map();
  const oldETags = new Map();
  for (const card of directory.childCards) {
    info(
      ` ${card.displayName} [${card.getProperty(
        "_href",
        ""
      )}, ${card.getProperty("_etag", "")}]`
    );

    cardMap.set(card.UID, card);
    oldETags.set(card.UID, card.getProperty("_etag", ""));
  }

  Assert.equal(cardMap.size, 3);
  Assert.deepEqual([...cardMap.keys()].sort(), [
    "change-me",
    "delete-me",
    "keep-me",
  ]);
  Assert.equal(
    cardMap.get("change-me").displayName,
    "I'm going to be changed. Ϟ"
  );

  // Make some changes on the server.

  CardDAVServer.putCardInternal(
    "change-me.vcf",
    "BEGIN:VCARD\r\nUID:change-me\r\nFN:I've been changed.\r\nEND:VCARD\r\n"
  );
  CardDAVServer.deleteCardInternal("delete-me.vcf");
  CardDAVServer.putCardInternal(
    "new.vcf",
    "BEGIN:VCARD\r\nUID:new\r\nFN:I'm new!\r\nEND:VCARD\r\n"
  );

  // Sync with the server.

  info("Second sync with server.");

  observer.init();
  await directory.updateAllFromServerV2();
  Assert.notEqual(directory._syncToken, lastSyncToken);
  lastSyncToken = directory._syncToken;
  observer.checkAndClearNotifications({
    "addrbook-contact-created": ["new"],
    "addrbook-contact-updated": ["change-me"],
    "addrbook-contact-deleted": ["delete-me"],
  });

  info("Cards:");
  cardMap.clear();
  for (const card of directory.childCards) {
    info(
      ` ${card.displayName} [${card.getProperty(
        "_href",
        ""
      )}, ${card.getProperty("_etag", "")}]`
    );

    cardMap.set(card.UID, card);
  }

  Assert.equal(cardMap.size, 3);
  Assert.deepEqual([...cardMap.keys()].sort(), ["change-me", "keep-me", "new"]);

  Assert.equal(
    cardMap.get("keep-me").getProperty("_etag", ""),
    oldETags.get("keep-me")
  );

  Assert.equal(cardMap.get("change-me").displayName, "I've been changed.");
  Assert.notEqual(
    cardMap.get("change-me").getProperty("_etag", ""),
    oldETags.get("change-me")
  );
  oldETags.set("change-me", cardMap.get("change-me").getProperty("_etag", ""));

  Assert.equal(cardMap.get("new").displayName, "I'm new!");
  oldETags.set("new", cardMap.get("new").getProperty("_etag", ""));

  oldETags.delete("delete-me");

  // Double-check that what we have matches what's on the server.

  await checkCardsOnServer({
    "change-me": {
      etag: cardMap.get("change-me").getProperty("_etag", ""),
      href: cardMap.get("change-me").getProperty("_href", ""),
      vCard: cardMap.get("change-me").getProperty("_vCard", ""),
    },
    "keep-me": {
      etag: cardMap.get("keep-me").getProperty("_etag", ""),
      href: cardMap.get("keep-me").getProperty("_href", ""),
      vCard: cardMap.get("keep-me").getProperty("_vCard", ""),
    },
    new: {
      etag: cardMap.get("new").getProperty("_etag", ""),
      href: cardMap.get("new").getProperty("_href", ""),
      vCard: cardMap.get("new").getProperty("_vCard", ""),
    },
  });

  info("Third sync with server. No changes expected.");

  await directory.updateAllFromServerV2();
  // This time the token should NOT change, there's been no contact with the
  // server since last time.
  Assert.equal(directory._syncToken, lastSyncToken);
  lastSyncToken = directory._syncToken;

  observer.checkAndClearNotifications({
    "addrbook-contact-created": [],
    "addrbook-contact-updated": [],
    "addrbook-contact-deleted": [],
  });

  // Delete a card on the client.

  info("Deleting a card on the client.");

  try {
    directory.deleteCards([cardMap.get("new")]);
    Assert.ok(!directory.readOnly, "read-only directory should throw.");
    observer.checkAndClearNotifications({
      "addrbook-contact-created": [],
      "addrbook-contact-updated": [],
      "addrbook-contact-deleted": ["new"],
    });

    await checkCardsOnServer({
      "change-me": {
        etag: cardMap.get("change-me").getProperty("_etag", ""),
        href: cardMap.get("change-me").getProperty("_href", ""),
        vCard: cardMap.get("change-me").getProperty("_vCard", ""),
      },
      "keep-me": {
        etag: cardMap.get("keep-me").getProperty("_etag", ""),
        href: cardMap.get("keep-me").getProperty("_href", ""),
        vCard: cardMap.get("keep-me").getProperty("_vCard", ""),
      },
    });
  } catch (ex) {
    Assert.ok(directory.readOnly, "read-write directory should not throw");
  }

  // Change a card on the client.

  info("Changing a card on the client.");

  try {
    let changeMeCard = cardMap.get("change-me");
    changeMeCard.displayName = "I've been changed again!";
    directory.modifyCard(changeMeCard);
    Assert.ok(!directory.readOnly, "read-only directory should throw.");

    Assert.equal(
      await observer.waitFor("addrbook-contact-updated"),
      "change-me"
    );
    observer.checkAndClearNotifications({
      "addrbook-contact-created": [],
      "addrbook-contact-updated": ["change-me"],
      "addrbook-contact-deleted": [],
    });

    changeMeCard = directory.childCards.find(c => c.UID == "change-me");
    cardMap.set("change-me", changeMeCard);

    await checkCardsOnServer({
      "change-me": {
        etag: changeMeCard.getProperty("_etag", ""),
        href: changeMeCard.getProperty("_href", ""),
        vCard: changeMeCard.getProperty("_vCard", ""),
      },
      "keep-me": {
        etag: cardMap.get("keep-me").getProperty("_etag", ""),
        href: cardMap.get("keep-me").getProperty("_href", ""),
        vCard: cardMap.get("keep-me").getProperty("_vCard", ""),
      },
    });
  } catch (ex) {
    Assert.ok(directory.readOnly, "read-write directory should not throw");
  }

  // Add a new card on the client.

  info("Adding a new card on the client.");

  try {
    let newCard = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    newCard.displayName = "I'm another new contact. ϔ";
    newCard.UID = "another-new";
    newCard = directory.addCard(newCard);
    Assert.ok(!directory.readOnly, "read-only directory should throw.");
    observer.checkAndClearNotifications({
      "addrbook-contact-created": ["another-new"],
      "addrbook-contact-updated": [],
      "addrbook-contact-deleted": [],
    });

    Assert.equal(
      await observer.waitFor("addrbook-contact-updated"),
      "another-new"
    );

    newCard = directory.childCards.find(c => c.UID == "another-new");
    Assert.equal(
      newCard.displayName,
      "I'm another new contact. ϔ",
      "non-ascii character survived the trip to the server"
    );

    await checkCardsOnServer({
      "another-new": {
        etag: newCard.getProperty("_etag", ""),
        href: newCard.getProperty("_href", ""),
        vCard: newCard.getProperty("_vCard", ""),
      },
      "change-me": {
        etag: cardMap.get("change-me").getProperty("_etag", ""),
        href: cardMap.get("change-me").getProperty("_href", ""),
        vCard: cardMap.get("change-me").getProperty("_vCard", ""),
      },
      "keep-me": {
        etag: cardMap.get("keep-me").getProperty("_etag", ""),
        href: cardMap.get("keep-me").getProperty("_href", ""),
        vCard: cardMap.get("keep-me").getProperty("_vCard", ""),
      },
    });
  } catch (ex) {
    Assert.ok(directory.readOnly, "read-write directory should not throw");
  }

  info("Fourth sync with server. No changes expected.");

  await directory.updateAllFromServerV2();
  if (directory.readOnly) {
    Assert.equal(directory._syncToken, lastSyncToken);
  } else {
    Assert.notEqual(directory._syncToken, lastSyncToken);
  }

  observer.checkAndClearNotifications({
    "addrbook-contact-created": [],
    "addrbook-contact-updated": [],
    "addrbook-contact-deleted": [],
  });

  await clearDirectory(directory);
  CardDAVServer.reset();
}

add_task(async function testNormal() {
  await subtest();
});

add_task(async function testGoogle() {
  CardDAVServer.mimicGoogle = true;
  Services.prefs.setBoolPref("ldap_2.servers.carddav.carddav.vcard3", true);
  await subtest();
  Services.prefs.clearUserPref("ldap_2.servers.carddav.carddav.vcard3");
  CardDAVServer.mimicGoogle = false;
});

add_task(async function testReadOnly() {
  Services.prefs.setBoolPref("ldap_2.servers.carddav.readOnly", true);
  await subtest();
  Services.prefs.clearUserPref("ldap_2.servers.carddav.readOnly");
});

add_task(async function testExpiredToken() {
  // Put some cards on the server.
  CardDAVServer.putCardInternal(
    "first.vcf",
    "BEGIN:VCARD\r\nUID:first\r\nFN:First Person\r\nEND:VCARD\r\n"
  );
  CardDAVServer.putCardInternal(
    "second.vcf",
    "BEGIN:VCARD\r\nUID:second\r\nFN:Second Person\r\nEND:VCARD\r\n"
  );
  CardDAVServer.putCardInternal(
    "third.vcf",
    "BEGIN:VCARD\r\nUID:third\r\nFN:Third Person\r\nEND:VCARD\r\n"
  );

  const directory = await initDirectory();

  info("Initial sync with server.");
  await directory.fetchAllFromServer();

  info(`Token is: ${directory._syncToken}`);

  info("Cards:");
  for (const card of directory.childCards) {
    info(
      ` ${card.displayName} [${card.getProperty(
        "_href",
        ""
      )}, ${card.getProperty("_etag", "")}]`
    );
  }

  Assert.equal(directory.childCardCount, 3);
  Assert.deepEqual(Array.from(directory.childCards, c => c.UID).sort(), [
    "first",
    "second",
    "third",
  ]);

  // Corrupt the sync token. This will cause a 400 Bad Request response and a
  // complete resync should happen.

  directory._syncToken = "wrong token";

  // Make some changes on the server.

  CardDAVServer.putCardInternal(
    "fourth.vcf",
    "BEGIN:VCARD\r\nUID:fourth\r\nFN:Fourth\r\nEND:VCARD\r\n"
  );
  CardDAVServer.putCardInternal(
    "second.vcf",
    "BEGIN:VCARD\r\nUID:second\r\nFN:Second Person, but different\r\nEND:VCARD\r\n"
  );
  CardDAVServer.deleteCardInternal("first.vcf");

  // Sync with the server.

  info("Sync with server.");

  const notificationPromise = TestUtils.topicObserved(
    "addrbook-directory-invalidated"
  );
  observer.init();
  await directory.updateAllFromServerV2();
  // Check what notifications were fired. There should be an "invalidated"
  // notification, making the others redundant, but the "deleted"
  // notification is hard to avoid.
  observer.checkAndClearNotifications({
    "addrbook-contact-created": [],
    "addrbook-contact-updated": [],
    "addrbook-contact-deleted": ["first"],
  });
  await notificationPromise;

  info(`Token is now: ${directory._syncToken}`);

  info("Cards:");
  for (const card of directory.childCards) {
    info(
      ` ${card.displayName} [${card.getProperty(
        "_href",
        ""
      )}, ${card.getProperty("_etag", "")}]`
    );
  }

  // Check that the changes were synced.

  Assert.equal(directory.childCardCount, 3);
  Assert.deepEqual(Array.from(directory.childCards, c => c.UID).sort(), [
    "fourth",
    "second",
    "third",
  ]);
  Assert.equal(
    directory.childCards.find(c => c.UID == "second").displayName,
    "Second Person, but different"
  );

  await clearDirectory(directory);
  CardDAVServer.reset();
});
