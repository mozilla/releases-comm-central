/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests a sync where the list of cards waiting to be sent to the server names
// a card that is not in the directory.

add_task(async function staleCardDoesNotStopTheSync() {
  CardDAVServer.putCardInternal(
    "keep-me.vcf",
    "BEGIN:VCARD\r\nUID:keep-me\r\nFN:I shall stay.\r\nEND:VCARD\r\n"
  );

  // An earlier session left a card waiting to be sent. It is not in this
  // directory, which is the state found on the affected profiles.
  Services.prefs.setStringPref(
    "ldap_2.servers.carddav.carddav.uidsToSync",
    "vanished"
  );

  const directory = await initDirectory();
  await directory.fetchAllFromServer();

  Assert.deepEqual(
    directory.childCards.map(c => c.UID),
    ["keep-me"],
    "the card on the server should be on the client"
  );

  info("Adding a card on the server, then syncing.");
  observer.init();
  CardDAVServer.putCardInternal(
    "sync-me.vcf",
    "BEGIN:VCARD\r\nUID:sync-me\r\nFN:Please sync me.\r\nEND:VCARD\r\n"
  );

  await directory.syncWithServer();

  observer.checkAndClearNotifications({
    "addrbook-contact-created": ["sync-me"],
    "addrbook-contact-updated": [],
    "addrbook-contact-deleted": [],
  });
  Assert.deepEqual(
    directory.childCards.map(c => c.UID).sort(),
    ["keep-me", "sync-me"],
    "the card added on the server should arrive on the client"
  );

  const cardMap = new Map(directory.childCards.map(c => [c.UID, c]));
  await checkCardsOnServer({
    "keep-me": {
      etag: cardMap.get("keep-me").getProperty("_etag", ""),
      href: cardMap.get("keep-me").getProperty("_href", ""),
      vCard: cardMap.get("keep-me").getProperty("_vCard", ""),
    },
    "sync-me": {
      etag: cardMap.get("sync-me").getProperty("_etag", ""),
      href: cardMap.get("sync-me").getProperty("_href", ""),
      vCard: cardMap.get("sync-me").getProperty("_vCard", ""),
    },
  });

  info("Syncing again, the stale card should not have come back.");
  await directory.syncWithServer();

  observer.checkAndClearNotifications({
    "addrbook-contact-created": [],
    "addrbook-contact-updated": [],
    "addrbook-contact-deleted": [],
  });
  Assert.deepEqual(
    directory.childCards.map(c => c.UID).sort(),
    ["keep-me", "sync-me"],
    "syncing again should change nothing"
  );

  await clearDirectory(directory);
  CardDAVServer.reset();
});

add_task(async function queuedCardIsSentPastAStaleOne() {
  CardDAVServer.putCardInternal(
    "keep-me.vcf",
    "BEGIN:VCARD\r\nUID:keep-me\r\nFN:I shall stay.\r\nEND:VCARD\r\n"
  );

  // Again the list names a card that is not in this directory, but this time
  // a card the user really did change is waiting behind it.
  Services.prefs.setStringPref(
    "ldap_2.servers.carddav.carddav.uidsToSync",
    "vanished"
  );

  const directory = await initDirectory();
  await directory.fetchAllFromServer();

  info(
    "Going offline and adding a card, which queues it behind the stale one."
  );
  await CardDAVServer.close();
  const syncFailed = TestUtils.topicObserved("addrbook-directory-sync-failed");
  let queuedCard = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  queuedCard.UID = "queue-me";
  queuedCard.displayName = "Queue Me";
  queuedCard = directory.addCard(queuedCard);
  await syncFailed;

  Assert.deepEqual(
    [...directory._uidsToSync],
    ["vanished", "queue-me"],
    "the new card should be waiting behind the stale one"
  );

  info("Coming back to the server, then syncing.");
  CardDAVServer.reopen();
  await directory.syncWithServer();

  Assert.deepEqual(
    [...directory._uidsToSync],
    [],
    "nothing should be left waiting to be sent"
  );
  Assert.deepEqual(
    directory.childCards.map(c => c.UID).sort(),
    ["keep-me", "queue-me"],
    "no contact should have appeared out of nowhere"
  );

  const cardMap = new Map(directory.childCards.map(c => [c.UID, c]));
  await checkCardsOnServer({
    "keep-me": {
      etag: cardMap.get("keep-me").getProperty("_etag", ""),
      href: cardMap.get("keep-me").getProperty("_href", ""),
      vCard: cardMap.get("keep-me").getProperty("_vCard", ""),
    },
    "queue-me": {
      etag: cardMap.get("queue-me").getProperty("_etag", ""),
      href: cardMap.get("queue-me").getProperty("_href", ""),
      vCard: cardMap.get("queue-me").getProperty("_vCard", ""),
    },
  });

  await clearDirectory(directory);
  CardDAVServer.reset();
});
