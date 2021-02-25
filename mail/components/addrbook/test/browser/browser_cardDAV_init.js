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

async function wrappedTest(testInitCallback, ...attemptArgs) {
  Services.logins.removeAllLogins();

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
        if (args.url?.startsWith("/")) {
          args.url = CardDAVServer.origin + args.url;
        }
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

  let logins = Services.logins.getAllLogins();
  Assert.equal(logins.length, 0, "no faulty logins were saved");
}

async function attemptInit(
  dialogWindow,
  {
    url = CardDAVServer.origin,
    certError,
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

  let certPromise =
    certError === undefined ? Promise.resolve() : handleCertError();
  let promptPromise =
    password === undefined ? Promise.resolve() : handlePasswordPrompt(password);

  acceptButton.click();

  Assert.equal(
    statusMessage.getAttribute("data-l10n-id"),
    "carddav-loading",
    "Correct status message"
  );

  await certPromise;
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

function handleCertError() {
  return BrowserTestUtils.promiseAlertDialog(
    "cancel",
    "chrome://pippki/content/exceptionDialog.xhtml"
  );
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

    let checkbox = prompt.document.getElementById("checkbox");
    Assert.greater(checkbox.getBoundingClientRect().width, 0);
    Assert.ok(checkbox.checked);
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

/** Test a server with a certificate problem. */
add_task(function testBadSSL() {
  return wrappedTest(null, {
    url: "https://expired.example.com/",
    certError: true,
  });
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

/** Test that entering the full URL of a book links to (only) that book. */
add_task(function testDirectLink() {
  return wrappedTest(null, {
    url: "/addressbooks/me/test/",
    password: "alice",
    expectedStatus: "",
    expectedBooks: [DEFAULT_BOOKS[1]],
  });
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
  Assert.equal(
    Services.prefs.getStringPref(`${directory.dirPrefId}.carddav.username`, ""),
    "alice"
  );
  Assert.notEqual(davDirectory._syncTimer, null, "sync scheduled");

  let logins = Services.logins.findLogins(CardDAVServer.origin, null, "");
  Assert.equal(logins.length, 1, "login was saved");
  Assert.equal(logins[0].username, "alice");
  Assert.equal(logins[0].password, "alice");

  Assert.equal(dirTree.view.rowCount, 4);
  Assert.equal(dirTree.view.getCellText(2, dirTree.columns[0]), "CardDAV Test");

  await closeAddressBookWindow();
  await CardDAVServer.close();

  await promiseDirectoryRemoved(directory.URI);
});
