/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { CardDAVDirectory } = ChromeUtils.import(
  "resource:///modules/CardDAVDirectory.jsm"
);
const { CardDAVServer } = ChromeUtils.import(
  "resource://testing-common/CardDAVServer.jsm"
);

// A list of books returned by CardDAVServer unless changed.
const DEFAULT_BOOKS = [
  {
    label: "Not This One",
    url: "/addressbooks/me/default/",
  },
  {
    label: "CardDAV Test",
    url: "/addressbooks/me/test/",
  },
];

/** Check that the menu item is hidden unless the pref is set. */
add_task(async function testFileMenuItem() {
  CardDAVServer.open("alice", "alice");

  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;

  // We can't simulate opening the File menu, because it wouldn't work on OS X.
  abWindow.onFileMenuInit();
  Assert.ok(
    abDocument.getElementById("menu_newCardDAVBook").hidden,
    "CardDAV menu item should be hidden"
  );

  Services.prefs.setBoolPref("mail.addr_book.carddav.enabled", true);
  abWindow.onFileMenuInit();
  Assert.ok(
    !abDocument.getElementById("menu_newCardDAVBook").hidden,
    "CardDAV menu item should be shown"
  );

  await closeAddressBookWindow();
  await CardDAVServer.close();
  Services.prefs.clearUserPref("mail.addr_book.carddav.enabled");
});

async function wrappedTest(testInitCallback, ...attemptArgs) {
  CardDAVServer.open("alice", "alice");
  if (testInitCallback) {
    testInitCallback();
  }

  let abWindow = await openAddressBookWindow();

  let dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/addressbook/abCardDAVDialog.xhtml",
    async dialogWindow => {
      for (let args of attemptArgs) {
        await attemptInit(dialogWindow, args);
      }
      dialogWindow.document
        .querySelector("dialog")
        .getButton("cancel")
        .click();
    }
  );
  abWindow.AbNewCardDAVBook();
  await dialogPromise;
  CardDAVServer.resetHandlers();

  await closeAddressBookWindow();
  await CardDAVServer.close();
}

async function attemptInit(
  dialogWindow,
  {
    url = CardDAVServer.origin,
    password,
    expectedStatus = "carddav-connection-error",
    expectedBooks = [],
  }
) {
  let dialogDocument = dialogWindow.document;
  let acceptButton = dialogDocument.querySelector("dialog").getButton("accept");

  let urlInput = dialogDocument.getElementById("carddav-url");
  let statusMessage = dialogDocument.getElementById("carddav-statusMessage");
  let availableBooks = dialogDocument.getElementById("carddav-availableBooks");

  urlInput.select();
  EventUtils.sendString(url, dialogWindow);

  let promptPromise =
    password === undefined ? Promise.resolve() : handlePasswordPrompt(password);

  acceptButton.click();

  Assert.equal(
    statusMessage.getAttribute("data-l10n-id"),
    "carddav-loading",
    "Correct status message"
  );

  await promptPromise;
  await BrowserTestUtils.waitForEvent(dialogWindow, "status-changed");

  Assert.equal(
    statusMessage.getAttribute("data-l10n-id"),
    expectedStatus,
    "Correct status message"
  );

  Assert.equal(
    availableBooks.childElementCount,
    expectedBooks.length,
    "Expected number of address books found"
  );
  for (let i = 0; i < expectedBooks.length; i++) {
    Assert.equal(availableBooks.children[i].label, expectedBooks[i].label);
    Assert.equal(
      availableBooks.children[i].value,
      `${CardDAVServer.origin}${expectedBooks[i].url}`
    );
    Assert.ok(availableBooks.children[i].checked);
  }
}

function handlePasswordPrompt(password) {
  return BrowserTestUtils.promiseAlertDialog(null, undefined, prompt => {
    if (!password) {
      prompt.document
        .querySelector("dialog")
        .getButton("cancel")
        .click();
      return;
    }
    prompt.document.getElementById("loginTextbox").value = "alice";
    prompt.document.getElementById("password1Textbox").value = password;
    prompt.document
      .querySelector("dialog")
      .getButton("accept")
      .click();
  });
}

/** Test URLs that don't respond. */
add_task(function testBadURLs() {
  return wrappedTest(
    null,
    { url: "mochi.test:8888" },
    { url: "http://mochi.test:8888" },
    { url: "https://mochi.test:8888" }
  );
});

/** Test an ordinary HTTP server that doesn't support CardDAV. */
add_task(function testNotACardDAVServer() {
  return wrappedTest(() => {
    CardDAVServer.server.registerPathHandler("/", null);
    CardDAVServer.server.registerPathHandler("/.well-known/carddav", null);
  }, {});
});

/** Test a CardDAV server without the /.well-known/carddav response. */
add_task(function testNoWellKnown() {
  return wrappedTest(
    () =>
      CardDAVServer.server.registerPathHandler("/.well-known/carddav", null),
    {
      password: "alice",
      expectedStatus: "",
      expectedBooks: DEFAULT_BOOKS,
    }
  );
});

/** Test cancelling the password prompt when it appears. */
add_task(function testPasswordCancelled() {
  return wrappedTest(null, { password: null });
});

/** Test entering the wrong password, then retrying with the right one. */
add_task(function testBadPassword() {
  return wrappedTest(
    null,
    { password: "bob" },
    {
      password: "alice",
      expectedStatus: "",
      expectedBooks: DEFAULT_BOOKS,
    }
  );
});

/**
 * Test doing everything correctly, including creating the directory and
 * doing the initial sync.
 */
add_task(async function testEveryThingOK() {
  CardDAVServer.open("alice", "alice");

  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;
  let dirTree = abDocument.getElementById("dirTree");

  Assert.equal(dirTree.view.rowCount, 3);

  let dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/addressbook/abCardDAVDialog.xhtml",
    async dialogWindow => {
      await attemptInit(dialogWindow, {
        password: "alice",
        expectedStatus: "",
        expectedBooks: DEFAULT_BOOKS,
      });

      let availableBooks = dialogWindow.document.getElementById(
        "carddav-availableBooks"
      );
      availableBooks.children[0].checked = false;

      dialogWindow.document
        .querySelector("dialog")
        .getButton("accept")
        .click();
    }
  );
  let syncPromise = new Promise(resolve => {
    let observer = {
      observe(directory) {
        Services.obs.removeObserver(this, "addrbook-directory-synced");
        resolve(directory);
      },
    };
    Services.obs.addObserver(observer, "addrbook-directory-synced");
  });

  abWindow.AbNewCardDAVBook();

  await dialogPromise;
  let directory = await syncPromise;
  let davDirectory = CardDAVDirectory.forFile(directory.fileName);

  Assert.equal(
    Services.prefs.getStringPref(`${directory.dirPrefId}.carddav.url`, ""),
    CardDAVServer.url
  );
  Assert.equal(
    Services.prefs.getStringPref(`${directory.dirPrefId}.carddav.token`, ""),
    "http://mochi.test/sync/0"
  );
  Assert.notEqual(davDirectory._syncTimer, null, "sync scheduled");

  Assert.equal(dirTree.view.rowCount, 4);
  Assert.equal(dirTree.view.getCellText(2, dirTree.columns[0]), "CardDAV Test");

  await closeAddressBookWindow();
  await CardDAVServer.close();

  let removePromise = promiseDirectoryRemoved();
  MailServices.ab.deleteAddressBook(directory.URI);
  await removePromise;
});
