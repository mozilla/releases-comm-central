/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests CardDAV synchronization.
 */

const { CardDAVDirectory } = ChromeUtils.import(
  "resource:///modules/CardDAVDirectory.jsm"
);
const { CardDAVServer } = ChromeUtils.import(
  "resource://testing-common/CardDAVServer.jsm"
);

function promiseSynced() {
  return new Promise(resolve => {
    let observer = {
      observe(directory) {
        Services.obs.removeObserver(this, "addrbook-directory-synced");
        resolve(directory);
      },
    };
    Services.obs.addObserver(observer, "addrbook-directory-synced");
  });
}

add_task(async () => {
  CardDAVServer.open();
  registerCleanupFunction(async () => {
    await CardDAVServer.close();
  });

  let dirPrefId = MailServices.ab.newAddressBook(
    "sync",
    undefined,
    Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE
  );
  Assert.equal(dirPrefId, "ldap_2.servers.sync");
  Assert.equal([...MailServices.ab.directories].length, 3);

  let directory = MailServices.ab.getDirectoryFromId(dirPrefId);
  let davDirectory = CardDAVDirectory.forFile(directory.fileName);
  registerCleanupFunction(async () => {
    await promiseDirectoryRemoved(directory.URI);

    Assert.equal(davDirectory._syncTimer, null, "sync timer cleaned up");
  });
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

  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;
  registerCleanupFunction(async () => {
    await closeAddressBookWindow();
    Services.prefs.clearUserPref("mail.addr_book.view.startupURI");
  });

  // This test becomes unreliable if we don't pause for a moment.
  await new Promise(resolve => abWindow.setTimeout(resolve, 500));

  openDirectory(directory);
  checkNamesListed();

  Assert.equal(abWindow.gDirectoryTreeView.rowCount, 4);
  Assert.equal(abWindow.gDirectoryTreeView.getIndexForId(directory.URI), 2);
  Assert.equal(abWindow.gDirTree.currentIndex, 2);

  let menu = abDocument.getElementById("dirTreeContext");
  let menuItem = abDocument.getElementById("dirTreeContext-sync");
  let openContext = async (row, itemHidden) => {
    let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
    mailTestUtils.treeClick(EventUtils, abWindow, abWindow.gDirTree, row, 0, {
      type: "mousedown",
      button: 2,
    });
    mailTestUtils.treeClick(EventUtils, abWindow, abWindow.gDirTree, row, 0, {
      type: "contextmenu",
    });
    mailTestUtils.treeClick(EventUtils, abWindow, abWindow.gDirTree, row, 0, {
      type: "mouseup",
      button: 2,
    });
    await shownPromise;

    Assert.equal(abWindow.gDirTree.currentIndex, row);
    Assert.equal(menuItem.hidden, itemHidden);
  };
  for (let row of [0, 1, 3]) {
    await openContext(row, true);

    let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.hidePopup();
    await hiddenPromise;
  }

  CardDAVServer.putCardInternal(
    "first.vcf",
    "BEGIN:VCARD\r\nUID:first\r\nFN:First\r\nEND:VCARD\r\n"
  );

  Assert.equal(davDirectory._syncTimer, null, "no sync scheduled");

  let syncedPromise = promiseSynced();
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

  syncedPromise = promiseSynced();
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

  syncedPromise = promiseSynced();
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
});
