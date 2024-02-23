/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests CardDAV properties dialog.
 */

const { CardDAVDirectory } = ChromeUtils.importESModule(
  "resource:///modules/CardDAVDirectory.sys.mjs"
);
const { CardDAVServer } = ChromeUtils.import(
  "resource://testing-common/CardDAVServer.jsm"
);

add_task(async () => {
  const INTERVAL_PREF = "ldap_2.servers.props.carddav.syncinterval";
  const TOKEN_PREF = "ldap_2.servers.props.carddav.token";
  const TOKEN_VALUE = "http://mochi.test/sync/0";
  const URL_PREF = "ldap_2.servers.props.carddav.url";
  const URL_VALUE = "https://mochi.test/carddav/test";

  const dirPrefId = MailServices.ab.newAddressBook(
    "props",
    undefined,
    Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE
  );
  Assert.equal(dirPrefId, "ldap_2.servers.props");
  Assert.equal([...MailServices.ab.directories].length, 3);

  const directory = MailServices.ab.getDirectoryFromId(dirPrefId);
  const davDirectory = CardDAVDirectory.forFile(directory.fileName);
  registerCleanupFunction(async () => {
    Assert.equal(davDirectory._syncTimer, null, "sync timer cleaned up");
  });
  Assert.equal(directory.dirType, Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE);

  Services.prefs.setIntPref(INTERVAL_PREF, 0);
  Services.prefs.setStringPref(TOKEN_PREF, TOKEN_VALUE);
  Services.prefs.setStringPref(URL_PREF, URL_VALUE);

  Assert.ok(davDirectory);
  Assert.equal(davDirectory._serverURL, URL_VALUE);
  Assert.equal(davDirectory._syncToken, TOKEN_VALUE);
  Assert.equal(davDirectory._syncTimer, null, "no sync scheduled");
  Assert.equal(davDirectory.readOnly, false);

  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;
  const booksList = abWindow.booksList;

  openDirectory(directory);

  Assert.equal(booksList.rowCount, 4);
  Assert.equal(booksList.getIndexForUID(directory.UID), 2);
  Assert.equal(booksList.selectedIndex, 2);

  const menu = abDocument.getElementById("bookContext");
  const menuItem = abDocument.getElementById("bookContextProperties");

  const subtest = async function (expectedValues, newValues, buttonAction) {
    Assert.equal(booksList.selectedIndex, 2);

    const shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
    EventUtils.synthesizeMouseAtCenter(
      booksList.getRowAtIndex(2),
      { type: "contextmenu" },
      abWindow
    );
    await shownPromise;

    Assert.ok(BrowserTestUtils.isVisible(menuItem));

    const dialogPromise = promiseLoadSubDialog(
      "chrome://messenger/content/addressbook/abCardDAVProperties.xhtml"
    ).then(async function (dialogWindow) {
      const dialogDocument = dialogWindow.document;

      const nameInput = dialogDocument.getElementById("carddav-name");
      Assert.equal(nameInput.value, expectedValues.name);
      if ("name" in newValues) {
        nameInput.value = newValues.name;
      }

      const urlInput = dialogDocument.getElementById("carddav-url");
      Assert.equal(urlInput.value, expectedValues.url);
      if ("url" in newValues) {
        urlInput.value = newValues.url;
      }

      const refreshActiveInput = dialogDocument.getElementById(
        "carddav-refreshActive"
      );
      const refreshIntervalInput = dialogDocument.getElementById(
        "carddav-refreshInterval"
      );

      Assert.equal(refreshActiveInput.checked, expectedValues.refreshActive);
      Assert.equal(
        refreshIntervalInput.disabled,
        !expectedValues.refreshActive
      );
      if (
        "refreshActive" in newValues &&
        newValues.refreshActive != expectedValues.refreshActive
      ) {
        EventUtils.synthesizeMouseAtCenter(
          refreshActiveInput,
          {},
          dialogWindow
        );
        Assert.equal(refreshIntervalInput.disabled, !newValues.refreshActive);
      }

      Assert.equal(refreshIntervalInput.value, expectedValues.refreshInterval);
      if ("refreshInterval" in newValues) {
        refreshIntervalInput.value = newValues.refreshInterval;
      }

      const readOnlyInput = dialogDocument.getElementById("carddav-readOnly");

      Assert.equal(readOnlyInput.checked, expectedValues.readOnly);
      if ("readOnly" in newValues) {
        readOnlyInput.checked = newValues.readOnly;
      }

      dialogDocument.querySelector("dialog").getButton(buttonAction).click();
    });
    menu.activateItem(menuItem);
    await dialogPromise;

    await new Promise(resolve => abWindow.setTimeout(resolve));
  };

  info("Open the dialog and cancel it. Nothing should change.");
  await subtest(
    {
      name: "props",
      url: URL_VALUE,
      refreshActive: false,
      refreshInterval: 30,
      readOnly: false,
    },
    {},
    "cancel"
  );

  Assert.equal(davDirectory.dirName, "props");
  Assert.equal(davDirectory._serverURL, URL_VALUE);
  Assert.equal(davDirectory.getIntValue("carddav.syncinterval", -1), 0);
  Assert.equal(davDirectory._syncTimer, null, "no sync scheduled");
  Assert.equal(davDirectory.readOnly, false);

  info("Open the dialog and accept it. Nothing should change.");
  await subtest(
    {
      name: "props",
      url: URL_VALUE,
      refreshActive: false,
      refreshInterval: 30,
      readOnly: false,
    },
    {},
    "accept"
  );

  Assert.equal(davDirectory.dirName, "props");
  Assert.equal(davDirectory._serverURL, URL_VALUE);
  Assert.equal(davDirectory.getIntValue("carddav.syncinterval", -1), 0);
  Assert.equal(davDirectory._syncTimer, null, "no sync scheduled");
  Assert.equal(davDirectory.readOnly, false);

  info("Open the dialog and change the values.");
  await subtest(
    {
      name: "props",
      url: URL_VALUE,
      refreshActive: false,
      refreshInterval: 30,
      readOnly: false,
    },
    {
      name: "CardDAV Properties Test",
      refreshActive: true,
      refreshInterval: 30,
      readOnly: true,
    },
    "accept"
  );

  Assert.equal(davDirectory.dirName, "CardDAV Properties Test");
  Assert.equal(davDirectory._serverURL, URL_VALUE);
  Assert.equal(davDirectory.getIntValue("carddav.syncinterval", -1), 30);
  Assert.notEqual(davDirectory._syncTimer, null, "sync scheduled");
  const currentSyncTimer = davDirectory._syncTimer;
  Assert.equal(davDirectory.readOnly, true);

  info("Open the dialog and accept it. Nothing should change.");
  await subtest(
    {
      name: "CardDAV Properties Test",
      url: URL_VALUE,
      refreshActive: true,
      refreshInterval: 30,
      readOnly: true,
    },
    {},
    "accept"
  );

  Assert.equal(davDirectory.dirName, "CardDAV Properties Test");
  Assert.equal(davDirectory._serverURL, URL_VALUE);
  Assert.equal(davDirectory.getIntValue("carddav.syncinterval", -1), 30);
  Assert.equal(
    davDirectory._syncTimer,
    currentSyncTimer,
    "same sync scheduled"
  );
  Assert.equal(davDirectory.readOnly, true);

  info("Open the dialog and change the interval.");
  await subtest(
    {
      name: "CardDAV Properties Test",
      url: URL_VALUE,
      refreshActive: true,
      refreshInterval: 30,
      readOnly: true,
    },
    { refreshInterval: 60 },
    "accept"
  );

  Assert.equal(davDirectory.dirName, "CardDAV Properties Test");
  Assert.equal(davDirectory._serverURL, URL_VALUE);
  Assert.equal(davDirectory.getIntValue("carddav.syncinterval", -1), 60);
  Assert.greater(
    davDirectory._syncTimer,
    currentSyncTimer,
    "new sync scheduled"
  );
  Assert.equal(davDirectory.readOnly, true);

  await promiseDirectoryRemoved(directory.URI);
});
