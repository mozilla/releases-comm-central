/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests CardDAV synchronization.
 */

const { CardDAVDirectory } = ChromeUtils.importESModule(
  "resource:///modules/CardDAVDirectory.sys.mjs"
);
const { CardDAVServer } = ChromeUtils.importESModule(
  "resource://testing-common/CardDAVServer.sys.mjs"
);

add_task(async () => {
  CardDAVServer.open();
  registerCleanupFunction(async () => {
    await CardDAVServer.close();
  });

  const dirPrefId = MailServices.ab.newAddressBook(
    "sync",
    undefined,
    Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE
  );
  Assert.equal(dirPrefId, "ldap_2.servers.sync");
  Assert.equal([...MailServices.ab.directories].length, 3);

  const directory = MailServices.ab.getDirectoryFromId(dirPrefId);
  const davDirectory = CardDAVDirectory.forFile(directory.fileName);
  Assert.equal(directory.dirType, Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE);

  Services.prefs.setStringPref(
    "ldap_2.servers.sync.carddav.token",
    "http://mochi.test/sync/0"
  );
  Services.prefs.setStringPref(
    "ldap_2.servers.sync.carddav.url",
    CardDAVServer.url
  );

  Assert.ok(davDirectory);
  Assert.equal(davDirectory._serverURL, CardDAVServer.url);
  Assert.equal(davDirectory._syncToken, "http://mochi.test/sync/0");

  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;

  // This test becomes unreliable if we don't pause for a moment.
  await new Promise(resolve => abWindow.setTimeout(resolve, 500));

  openDirectory(directory);
  checkNamesListed();

  const menu = abDocument.getElementById("bookContext");
  const menuItem = abDocument.getElementById("bookContextSynchronize");
  const openContext = async (index, itemHidden) => {
    const shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
    EventUtils.synthesizeMouseAtCenter(
      abWindow.booksList.getRowAtIndex(index),
      { type: "contextmenu" },
      abWindow
    );
    await shownPromise;
    Assert.equal(menuItem.hidden, itemHidden);
  };

  for (const index of [1, 3]) {
    await openContext(index, true);

    const hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.hidePopup();
    await hiddenPromise;
  }

  CardDAVServer.putCardInternal(
    "first.vcf",
    "BEGIN:VCARD\r\nUID:first\r\nFN:First\r\nEND:VCARD\r\n"
  );

  Assert.equal(davDirectory._syncTimer, null, "no sync scheduled");

  let syncedPromise = TestUtils.topicObserved("addrbook-directory-synced");
  await openContext(2, false);
  menu.activateItem(menuItem);
  await syncedPromise;

  await new Promise(resolve => setTimeout(resolve));
  Assert.notEqual(davDirectory._syncTimer, null, "first sync scheduled");
  let currentSyncTimer = davDirectory._syncTimer;

  checkNamesListed("First");

  CardDAVServer.putCardInternal(
    "second.vcf",
    "BEGIN:VCARD\r\nUID:second\r\nFN:Second\r\nEND:VCARD\r\n"
  );

  syncedPromise = TestUtils.topicObserved("addrbook-directory-synced");
  await openContext(2, false);
  menu.activateItem(menuItem);
  await syncedPromise;

  await new Promise(resolve => setTimeout(resolve));
  Assert.greater(
    davDirectory._syncTimer,
    currentSyncTimer,
    "second sync not the same as the first"
  );
  currentSyncTimer = davDirectory._syncTimer;

  checkNamesListed("First", "Second");

  CardDAVServer.deleteCardInternal("second.vcf");
  CardDAVServer.putCardInternal(
    "third.vcf",
    "BEGIN:VCARD\r\nUID:third\r\nFN:Third\r\nEND:VCARD\r\n"
  );

  syncedPromise = TestUtils.topicObserved("addrbook-directory-synced");
  await openContext(2, false);
  menu.activateItem(menuItem);
  await syncedPromise;

  await new Promise(resolve => setTimeout(resolve));
  Assert.greater(
    davDirectory._syncTimer,
    currentSyncTimer,
    "third sync not the same as the second"
  );

  checkNamesListed("First", "Third");

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(directory.URI);
  Assert.equal(davDirectory._syncTimer, null, "sync timer cleaned up");
});
