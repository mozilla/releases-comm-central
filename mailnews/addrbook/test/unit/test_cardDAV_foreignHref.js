/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests that hrefs pointing to a different origin than the address book's
// server are never requested. Only their path is used, on the address book's
// server.

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

const otherServer = new HttpServer();
const otherRequests = [];

add_setup(function () {
  otherServer.registerPrefixHandler("/", (request, response) => {
    otherRequests.push(`${request.method} ${request.path}`);
    response.setStatusLine("1.1", 204, "No Content");
  });
  otherServer.start(-1);
  registerCleanupFunction(
    () => new Promise(resolve => otherServer.stop(resolve))
  );
});

function otherURL(path) {
  return `http://localhost:${otherServer.identity.primaryPort}${path}`;
}

function putCardAt(href, uid) {
  const vCard = `BEGIN:VCARD\r\nUID:${uid}\r\nFN:${uid}\r\nEND:VCARD\r\n`;
  CardDAVServer.cards.set(href, {
    etag: "" + vCard.length,
    vCard,
    changed: ++CardDAVServer.changeCount,
  });
}

add_task(async function foreignHrefIsReducedToPath() {
  // The server reports this card as being on another origin, as a server
  // behind a proxy might.
  const elsewhere = `${CardDAVServer.path}elsewhere.vcf`;
  const originalCardResponse = CardDAVServer._cardResponse;
  CardDAVServer._cardResponse = function (href, ...args) {
    return originalCardResponse.call(
      this,
      href == elsewhere ? otherURL(href) : href,
      ...args
    );
  };

  CardDAVServer.putCardInternal(
    "elsewhere.vcf",
    "BEGIN:VCARD\r\nUID:elsewhere\r\nFN:Elsewhere\r\nEND:VCARD\r\n"
  );
  putCardAt(`${CardDAVServer.url}absolute.vcf`, "absolute");

  const directory = await initDirectory();
  await directory.fetchAllFromServer();

  Assert.deepEqual(
    directory.childCards.map(c => c.UID).sort(),
    ["absolute", "elsewhere"],
    "all cards should be on the client"
  );
  Assert.equal(
    directory.getCard("elsewhere").getProperty("_href", ""),
    elsewhere,
    "only the path of the foreign href should be stored"
  );
  Assert.equal(
    directory.getCard("absolute").getProperty("_href", ""),
    `${CardDAVServer.url}absolute.vcf`,
    "an href on the server's origin should be stored as it is"
  );

  info("Changing the card on the server, then syncing.");
  CardDAVServer.putCardInternal(
    "elsewhere.vcf",
    "BEGIN:VCARD\r\nUID:elsewhere\r\nFN:Changed on server\r\nEND:VCARD\r\n"
  );
  await directory.syncWithServer();
  Assert.equal(
    directory.getCard("elsewhere").displayName,
    "Changed on server",
    "the change on the server should reach the client"
  );

  info("Changing the card on the client.");
  const card = directory.getCard("elsewhere");
  card.vCardProperties.clearValues("fn");
  card.vCardProperties.addValue("fn", "Changed on client");
  directory.modifyCard(card);
  await TestUtils.waitForCondition(
    () =>
      CardDAVServer.cards.get(elsewhere).vCard.includes("Changed on client"),
    "the change should reach the address book's server"
  );

  await Assert.rejects(
    directory._makeRequest(otherURL(elsewhere), { method: "DELETE" }),
    /different server/,
    "a request to a different origin should be refused"
  );
  Assert.deepEqual(
    otherRequests,
    [],
    "no request should reach the other server"
  );

  CardDAVServer._cardResponse = originalCardResponse;
  await clearDirectory(directory);
  CardDAVServer.reset();
});

add_task(async function queuedForeignHrefIsRemovedFromServer() {
  CardDAVServer.putCardInternal(
    "keep-me.vcf",
    "BEGIN:VCARD\r\nUID:keep-me\r\nFN:I shall stay.\r\nEND:VCARD\r\n"
  );
  CardDAVServer.putCardInternal(
    "gone.vcf",
    "BEGIN:VCARD\r\nUID:gone\r\nFN:I shall go.\r\nEND:VCARD\r\n"
  );

  // A foreign href stored by an earlier version is waiting to be removed.
  Services.prefs.setStringPref(
    "ldap_2.servers.carddav.carddav.hrefsToRemove",
    otherURL(`${CardDAVServer.path}gone.vcf`)
  );

  const directory = await initDirectory();
  await directory.fetchAllFromServer();

  info("Adding a card on the server, then syncing.");
  CardDAVServer.putCardInternal(
    "sync-me.vcf",
    "BEGIN:VCARD\r\nUID:sync-me\r\nFN:Please sync me.\r\nEND:VCARD\r\n"
  );
  await directory.syncWithServer();

  Assert.deepEqual(
    directory.childCards.map(c => c.UID).sort(),
    ["keep-me", "sync-me"],
    "the card should be removed, and the sync should continue"
  );
  Assert.ok(
    !CardDAVServer.cards.has(`${CardDAVServer.path}gone.vcf`),
    "the card should be removed from the address book's server"
  );
  Assert.equal(
    directory._hrefsToRemove.size,
    0,
    "the foreign href should no longer be waiting to be removed"
  );
  Assert.deepEqual(
    otherRequests,
    [],
    "no request should reach the other server"
  );

  await clearDirectory(directory);
  CardDAVServer.reset();
});

add_task(async function foreignHrefOnLocalCardIsReducedToPath() {
  const directory = await initDirectory();
  await directory.fetchAllFromServer();

  info("Adding a card with a foreign href stored by an earlier version.");
  const card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  card.UID = "local";
  card.displayName = "Local";
  card.setProperty("_href", otherURL(`${CardDAVServer.path}local.vcf`));
  const updated = TestUtils.topicObserved("addrbook-contact-updated");
  directory.addCard(card);
  await updated;

  Assert.ok(
    CardDAVServer.cards.has(`${CardDAVServer.path}local.vcf`),
    "the card should be sent to the address book's server"
  );
  Assert.equal(
    directory.getCard("local").getProperty("_href", ""),
    `${CardDAVServer.path}local.vcf`,
    "the card should have the href on the address book's server"
  );
  Assert.deepEqual(
    otherRequests,
    [],
    "no request should reach the other server"
  );

  await clearDirectory(directory);
  CardDAVServer.reset();
});

/**
 * Stores a foreign href for a card, as an earlier version would have.
 *
 * @param {CardDAVDirectory} directory
 * @param {string} uid
 * @param {string} href
 */
function storeForeignHref(directory, uid, href) {
  const card = directory.getCard(uid);
  card.setProperty("_href", href);
  Object.getPrototypeOf(CardDAVDirectory.prototype).modifyCard.call(
    directory,
    card
  );
}

function clearNotifications() {
  for (const array of Object.values(observer.notifications)) {
    array.length = 0;
  }
}

add_task(async function storedForeignHrefMatchesOnSync() {
  observer.init();
  CardDAVServer.putCardInternal(
    "legacy.vcf",
    "BEGIN:VCARD\r\nUID:legacy\r\nFN:Legacy\r\nEND:VCARD\r\n"
  );

  const directory = await initDirectory();
  await directory.fetchAllFromServer();
  storeForeignHref(
    directory,
    "legacy",
    otherURL(`${CardDAVServer.path}legacy.vcf`)
  );
  clearNotifications();

  info("Fetching everything from the server.");
  await directory.fetchAllFromServer();
  observer.checkAndClearNotifications({
    "addrbook-contact-created": [],
    "addrbook-contact-updated": [],
    "addrbook-contact-deleted": [],
  });

  info("Syncing without a sync token.");
  CardDAVServer.mimicYahoo = true;
  directory._syncToken = "";
  await directory.syncWithServer();
  CardDAVServer.mimicYahoo = false;
  observer.checkAndClearNotifications({
    "addrbook-contact-created": [],
    "addrbook-contact-updated": [],
    "addrbook-contact-deleted": [],
  });

  Assert.deepEqual(
    otherRequests,
    [],
    "no request should reach the other server"
  );

  await clearDirectory(directory);
  CardDAVServer.reset();
});

add_task(async function storedForeignHrefIsDeletedOnSync() {
  observer.init();
  CardDAVServer.putCardInternal(
    "legacy.vcf",
    "BEGIN:VCARD\r\nUID:legacy\r\nFN:Legacy\r\nEND:VCARD\r\n"
  );

  const directory = await initDirectory();
  await directory.fetchAllFromServer();
  Assert.ok(directory._syncToken, "the directory should have a sync token");
  storeForeignHref(
    directory,
    "legacy",
    otherURL(`${CardDAVServer.path}legacy.vcf`)
  );
  clearNotifications();

  info("Deleting the card on the server, then syncing.");
  CardDAVServer.deleteCardInternal("legacy.vcf");
  await directory.syncWithServer();
  observer.checkAndClearNotifications({
    "addrbook-contact-created": [],
    "addrbook-contact-updated": [],
    "addrbook-contact-deleted": ["legacy"],
  });
  Assert.deepEqual(
    directory.childCards,
    [],
    "the card deleted on the server should be deleted on the client"
  );

  Assert.deepEqual(
    otherRequests,
    [],
    "no request should reach the other server"
  );

  await clearDirectory(directory);
  CardDAVServer.reset();
});
