/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests that changes in a CardDAV directory when offline or unable to reach
// the server are (a) visible in the client immediately, and (b) sent to the
// server when it's next available.
//
// Note that we close the server rather than using Services.io.offline, as
// the server is localhost and therefore not affected by the offline setting.

var { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

var directory, restart, useSyncV1;

async function subtest() {
  // Put some cards on the server.

  CardDAVServer.putCardInternal(
    "change-me.vcf",
    "BEGIN:VCARD\r\nUID:change-me\r\nFN:I shall be changed.\r\nEND:VCARD\r\n"
  );
  CardDAVServer.putCardInternal(
    "delete-me.vcf",
    "BEGIN:VCARD\r\nUID:delete-me\r\nFN:Please delete me.\r\nEND:VCARD\r\n"
  );

  directory = await initDirectory();

  info("Initial sync with server.");
  await directory.fetchAllFromServer();

  if (useSyncV1) {
    directory._syncToken = null;
  }

  await subtestCreateCard();
  await subtestUpdateCard();
  await subtestDeleteCard();
  await subtestCreateDeleteCard();
  await subtestStillOffline();

  // Check everything is still correct at the end.

  info("Checking cards on client are correct.");
  Assert.deepEqual(
    directory.childCards.map(c => c.UID).sort(),
    ["another-new-card", "change-me"],
    "right cards remain on client"
  );

  await clearDirectory(directory);
  CardDAVServer.reset();
}

function promiseSyncFailed() {
  return TestUtils.topicObserved("addrbook-directory-sync-failed");
}

function promiseSyncSucceeded() {
  return TestUtils.topicObserved("addrbook-directory-synced");
}

/**
 * The behaviour should remain the same even if Thunderbird restarts.
 * If `restart` is true, simulate restarting.
 */
async function pretendToRestart() {
  // Ensure we've finished any async stuff.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 125));

  if (!restart) {
    return;
  }

  await directory.cleanUp();

  info("Shutdown simulated, now restarting.");
  directory = new CardDAVDirectory();
  directory.init("jscarddav://carddav.sqlite");
}

/** Creating a new card while "offline". */
async function subtestCreateCard() {
  Assert.equal(
    directory.childCards.length,
    2,
    "card count on client before test"
  );
  Assert.equal(CardDAVServer.cards.size, 2, "card count on server before test");

  info("Going offline, creating a new card.");
  await CardDAVServer.close();

  let contactPromise = TestUtils.topicObserved("addrbook-contact-created");
  const syncFailedPromise = promiseSyncFailed();
  let newCard = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  newCard.displayName = "A New Card";
  newCard.UID = "a-new-card";
  newCard = directory.addCard(newCard);
  await contactPromise;
  await syncFailedPromise;

  Assert.equal(
    directory.childCards.length,
    3,
    "card should have been added on client while offline"
  );
  Assert.ok(
    directory.childCards.find(c => c.UID == "a-new-card"),
    "card should have been added on client"
  );
  Assert.equal(
    CardDAVServer.cards.size,
    2,
    "card should NOT have been added on server while offline"
  );

  info("Going online and syncing.");
  await pretendToRestart(directory);
  CardDAVServer.reopen();

  Assert.equal(
    CardDAVServer.cards.size,
    2,
    "card should NOT have been added on server before syncing"
  );

  contactPromise = TestUtils.topicObserved("addrbook-contact-updated");
  const syncSucceededPromise = promiseSyncSucceeded();
  await directory.syncWithServer();
  await syncSucceededPromise;
  const [notificationCard] = await contactPromise;
  notificationCard.QueryInterface(Ci.nsIAbCard);
  Assert.equal(
    notificationCard.UID,
    "a-new-card",
    "correct card should have been updated"
  );

  Assert.equal(
    notificationCard.getProperty("_href", "WRONG"),
    `${CardDAVServer.path}a-new-card.vcf`,
    "card should have been given _href property"
  );
  Assert.equal(
    notificationCard.getProperty("_etag", "WRONG"),
    "68",
    "card should have been given _etag property"
  );
  vCardEqual(
    notificationCard.getProperty("_vCard", "WRONG"),
    "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:A New Card\r\nUID:a-new-card\r\nEND:VCARD\r\n",
    "card should have been given _vCard property"
  );

  await checkCardsOnServer({
    ["change-me"]: {
      etag: "63",
      href: `${CardDAVServer.path}change-me.vcf`,
      vCard:
        "BEGIN:VCARD\r\nUID:change-me\r\nFN:I shall be changed.\r\nEND:VCARD\r\n",
    },
    ["delete-me"]: {
      etag: "61",
      href: `${CardDAVServer.path}delete-me.vcf`,
      vCard:
        "BEGIN:VCARD\r\nUID:delete-me\r\nFN:Please delete me.\r\nEND:VCARD\r\n",
    },
    ["a-new-card"]: {
      etag: "68",
      href: `${CardDAVServer.path}a-new-card.vcf`,
      vCard:
        "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:A New Card\r\nUID:a-new-card\r\nEND:VCARD\r\n",
    },
  });
}

/** Changing an existing card while "offline". */
async function subtestUpdateCard() {
  Assert.equal(
    directory.childCards.length,
    3,
    "card count on client before test"
  );
  Assert.equal(CardDAVServer.cards.size, 3, "card count on server before test");

  info("Going offline, changing a card.");
  await CardDAVServer.close();

  let contactPromise = TestUtils.topicObserved("addrbook-contact-updated");
  const syncFailedPromise = promiseSyncFailed();
  let cardToChange = directory.childCards.find(c => c.UID == "change-me");
  cardToChange.displayName = "I'm a new man!";
  cardToChange = directory.modifyCard(cardToChange);
  await contactPromise;
  await syncFailedPromise;

  Assert.equal(
    directory.childCards.find(c => c.UID == "change-me").displayName,
    "I'm a new man!",
    "card should have been changed on client while offline"
  );
  Assert.stringContains(
    CardDAVServer.cards.get(`${CardDAVServer.path}change-me.vcf`).vCard,
    "I shall be changed.",
    "card should NOT have been changed on server while offline"
  );

  info("Going online and syncing.");
  await pretendToRestart(directory);
  CardDAVServer.reopen();

  Assert.stringContains(
    CardDAVServer.cards.get(`${CardDAVServer.path}change-me.vcf`).vCard,
    "I shall be changed.",
    "card should NOT have been changed on server before syncing"
  );

  contactPromise = TestUtils.topicObserved("addrbook-contact-updated");
  const syncSucceededPromise = promiseSyncSucceeded();
  await directory.syncWithServer();
  await syncSucceededPromise;
  const [notificationCard] = await contactPromise;
  notificationCard.QueryInterface(Ci.nsIAbCard);
  Assert.equal(
    notificationCard.UID,
    "change-me",
    "correct card should have been updated"
  );

  Assert.equal(
    notificationCard.getProperty("_href", "WRONG"),
    `${CardDAVServer.path}change-me.vcf`,
    "card _href property didn't change"
  );
  Assert.equal(
    notificationCard.getProperty("_etag", "WRONG"),
    "58",
    "card _etag property did change"
  );
  vCardEqual(
    notificationCard.getProperty("_vCard", "WRONG"),
    "BEGIN:VCARD\r\nUID:change-me\r\nFN:I'm a new man!\r\nEND:VCARD\r\n",
    "card _vCard property did change"
  );

  await checkCardsOnServer({
    ["change-me"]: {
      etag: "58",
      href: `${CardDAVServer.path}change-me.vcf`,
      vCard:
        "BEGIN:VCARD\r\nUID:change-me\r\nFN:I'm a new man!\r\nEND:VCARD\r\n",
    },
    ["delete-me"]: {
      etag: "61",
      href: `${CardDAVServer.path}delete-me.vcf`,
      vCard:
        "BEGIN:VCARD\r\nUID:delete-me\r\nFN:Please delete me.\r\nEND:VCARD\r\n",
    },
    ["a-new-card"]: {
      etag: "68",
      href: `${CardDAVServer.path}a-new-card.vcf`,
      vCard:
        "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:A New Card\r\nUID:a-new-card\r\nEND:VCARD\r\n",
    },
  });
}

/** Deleting an existing card while "offline". */
async function subtestDeleteCard() {
  Assert.equal(
    directory.childCards.length,
    3,
    "card count on client before test"
  );
  Assert.equal(CardDAVServer.cards.size, 3, "card count on server before test");

  info("Going offline, deleting a card.");
  await CardDAVServer.close();

  const contactPromise = TestUtils.topicObserved("addrbook-contact-deleted");
  const syncFailedPromise = promiseSyncFailed();
  const cardToDelete = directory.childCards.find(c => c.UID == "delete-me");
  directory.deleteCards([cardToDelete]);
  await contactPromise;
  await syncFailedPromise;

  Assert.equal(
    directory.childCards.length,
    2,
    "card should have been removed on client while offline"
  );
  Assert.ok(
    !directory.childCards.find(c => c.UID == "delete-me"),
    "card should have been removed on client while offline"
  );
  Assert.equal(
    CardDAVServer.cards.size,
    3,
    "card should NOT have been removed on server while offline"
  );

  info("Going online and syncing.");
  await pretendToRestart(directory);
  CardDAVServer.reopen();

  Assert.equal(
    CardDAVServer.cards.size,
    3,
    "card should NOT have been removed on server before syncing"
  );

  const syncSucceededPromise = promiseSyncSucceeded();
  await directory.syncWithServer();
  await syncSucceededPromise;

  await checkCardsOnServer({
    ["change-me"]: {
      etag: "58",
      href: `${CardDAVServer.path}change-me.vcf`,
      vCard:
        "BEGIN:VCARD\r\nUID:change-me\r\nFN:I'm a new man!\r\nEND:VCARD\r\n",
    },
    ["a-new-card"]: {
      etag: "68",
      href: `${CardDAVServer.path}a-new-card.vcf`,
      vCard:
        "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:A New Card\r\nUID:a-new-card\r\nEND:VCARD\r\n",
    },
  });
}

/** Adding a new card and deleting it again while "offline". */
async function subtestCreateDeleteCard() {
  Assert.equal(
    directory.childCards.length,
    2,
    "card count on client before test"
  );
  Assert.equal(CardDAVServer.cards.size, 2, "card count on server before test");

  info("Going offline, adding a card.");
  await CardDAVServer.close();

  let contactPromise = TestUtils.topicObserved("addrbook-contact-created");
  const syncFailedPromise = promiseSyncFailed();
  let newCard = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  newCard.displayName = "A Temporary Card";
  newCard.UID = "a-temporary-card";
  newCard = directory.addCard(newCard);
  await contactPromise;
  await syncFailedPromise;

  // Ensure we've finished any async stuff.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 125));

  Assert.equal(
    directory.childCards.length,
    3,
    "card should have been added on client while offline"
  );
  Assert.ok(
    directory.childCards.find(c => c.UID == "a-temporary-card"),
    "card should have been added on client while offline"
  );
  Assert.equal(
    CardDAVServer.cards.size,
    2,
    "card should NOT have been added on server while offline"
  );

  info("Deleting the same card before syncing.");
  contactPromise = TestUtils.topicObserved("addrbook-contact-deleted");
  directory.deleteCards([newCard]);
  await contactPromise;
  // No addrbook-directory-sync-failed notification here, we didn't attempt to
  // delete a card that wasn't on the server (it had no _href property).

  Assert.equal(
    directory.childCards.length,
    2,
    "card should have been removed on client while offline"
  );
  Assert.ok(
    !directory.childCards.find(c => c.UID == "a-temporary-card"),
    "card should have been removed on client while offline"
  );
  Assert.equal(
    CardDAVServer.cards.size,
    2,
    "card should NOT have been on server while offline"
  );

  info("Going online and syncing.");
  await pretendToRestart(directory);
  CardDAVServer.reopen();

  const syncSucceededPromise = promiseSyncSucceeded();
  await directory.syncWithServer();
  await syncSucceededPromise;

  await checkCardsOnServer({
    ["change-me"]: {
      etag: "58",
      href: `${CardDAVServer.path}change-me.vcf`,
      vCard:
        "BEGIN:VCARD\r\nUID:change-me\r\nFN:I'm a new man!\r\nEND:VCARD\r\n",
    },
    ["a-new-card"]: {
      etag: "68",
      href: `${CardDAVServer.path}a-new-card.vcf`,
      vCard:
        "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:A New Card\r\nUID:a-new-card\r\nEND:VCARD\r\n",
    },
  });
}

/**
 * Check that doing a sync while offline does nothing crazy. First make both
 * kinds of changes, then sync while offline.
 */
async function subtestStillOffline() {
  Assert.equal(
    directory.childCards.length,
    2,
    "card count on client before test"
  );
  Assert.equal(CardDAVServer.cards.size, 2, "card count on server before test");

  info("Going offline, adding a card.");
  await CardDAVServer.close();

  let contactPromise = TestUtils.topicObserved("addrbook-contact-created");
  let syncFailedPromise = promiseSyncFailed();
  let newCard = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  newCard.displayName = "Another New Card";
  newCard.UID = "another-new-card";
  newCard = directory.addCard(newCard);
  await contactPromise;
  await syncFailedPromise;

  // Ensure we've finished any async stuff.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 125));

  Assert.equal(
    directory.childCards.length,
    3,
    "card should have been added on client while offline"
  );
  Assert.ok(
    directory.childCards.find(c => c.UID == "another-new-card"),
    "card should have been added on client while offline"
  );
  Assert.equal(
    CardDAVServer.cards.size,
    2,
    "card should NOT have been added on server while offline"
  );

  info("Still offline, deleting a card.");
  const cardToDelete = directory.childCards.find(c => c.UID == "a-new-card");
  contactPromise = TestUtils.topicObserved("addrbook-contact-deleted");
  syncFailedPromise = promiseSyncFailed();
  directory.deleteCards([cardToDelete]);
  await contactPromise;
  await syncFailedPromise;

  // Ensure we've finished any async stuff.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 125));

  info("Still offline, attempting to sync.");
  syncFailedPromise = promiseSyncFailed();
  // Assert.rejects eats the thrown exception, so we don't see it logged here.
  await Assert.rejects(
    directory.syncWithServer(),
    /NS_ERROR_CONNECTION_REFUSED/,
    "Attempt to sync threw an exception"
  );
  await syncFailedPromise;

  await pretendToRestart();
  syncFailedPromise = promiseSyncFailed();
  // Assert.rejects eats the thrown exception, so we don't see it logged here.
  await Assert.rejects(
    directory.syncWithServer(),
    /NS_ERROR_CONNECTION_REFUSED/,
    "Attempt to sync threw an exception"
  );
  await syncFailedPromise;

  info("Going online and syncing.");
  await pretendToRestart(directory);
  CardDAVServer.reopen();

  const syncSucceededPromise = promiseSyncSucceeded();
  await directory.syncWithServer();
  await syncSucceededPromise;

  await checkCardsOnServer({
    ["change-me"]: {
      etag: "58",
      href: `${CardDAVServer.path}change-me.vcf`,
      vCard:
        "BEGIN:VCARD\r\nUID:change-me\r\nFN:I'm a new man!\r\nEND:VCARD\r\n",
    },
    ["another-new-card"]: {
      etag: "80",
      href: `${CardDAVServer.path}another-new-card.vcf`,
      vCard:
        "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Another New Card\r\nUID:another-new-card\r\nEND:VCARD\r\n",
    },
  });
}

add_task(async function test_syncV1_noRestart() {
  restart = false;
  useSyncV1 = true;
  await subtest();
});

add_task(async function test_syncV1_restart() {
  restart = true;
  useSyncV1 = true;
  await subtest();
});

add_task(async function test_syncV2_noRestart() {
  restart = false;
  useSyncV1 = false;
  await subtest();
});

add_task(async function test_syncV2_restart() {
  restart = true;
  useSyncV1 = false;
  await subtest();
});
