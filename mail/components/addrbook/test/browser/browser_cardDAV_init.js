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
    await testInitCallback();
  }

  let abWindow = await openAddressBookWindow();

  let dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/addressbook/abCardDAVDialog.xhtml",
    {
      async callback(dialogWindow) {
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
      },
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
    username,
    url,
    certError,
    password,
    savePassword,
    expectedStatus = "carddav-connection-error",
    expectedBooks = [],
  }
) {
  let dialogDocument = dialogWindow.document;
  let acceptButton = dialogDocument.querySelector("dialog").getButton("accept");

  let usernameInput = dialogDocument.getElementById("carddav-username");
  let urlInput = dialogDocument.getElementById("carddav-location");
  let statusMessage = dialogDocument.getElementById("carddav-statusMessage");
  let availableBooks = dialogDocument.getElementById("carddav-availableBooks");

  if (username) {
    usernameInput.select();
    EventUtils.sendString(username, dialogWindow);
  }
  if (url) {
    urlInput.select();
    EventUtils.sendString(url, dialogWindow);
  }

  let certPromise =
    certError === undefined ? Promise.resolve() : handleCertError();
  let promptPromise =
    password === undefined
      ? Promise.resolve()
      : handlePasswordPrompt(username, password, savePassword);

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

function handlePasswordPrompt(expectedUsername, password, savePassword = true) {
  return BrowserTestUtils.promiseAlertDialog(null, undefined, {
    async callback(prompt) {
      await new Promise(resolve => prompt.setTimeout(resolve));

      if (!password) {
        prompt.document
          .querySelector("dialog")
          .getButton("cancel")
          .click();
        return;
      }

      if (expectedUsername) {
        Assert.equal(
          prompt.document.getElementById("loginTextbox").value,
          expectedUsername
        );
      } else {
        prompt.document.getElementById("loginTextbox").value = "alice";
      }
      prompt.document.getElementById("password1Textbox").value = password;

      let checkbox = prompt.document.getElementById("checkbox");
      Assert.greater(checkbox.getBoundingClientRect().width, 0);
      Assert.ok(checkbox.checked);

      if (!savePassword) {
        EventUtils.synthesizeMouseAtCenter(checkbox, {}, prompt);
        Assert.ok(!checkbox.checked);
      }

      prompt.document
        .querySelector("dialog")
        .getButton("accept")
        .click();
    },
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
  return wrappedTest(
    () => {
      CardDAVServer.server.registerPathHandler("/", null);
      CardDAVServer.server.registerPathHandler("/.well-known/carddav", null);
    },
    {
      url: "/",
    }
  );
});

/** Test a CardDAV server without the /.well-known/carddav response. */
add_task(function testNoWellKnown() {
  return wrappedTest(
    () =>
      CardDAVServer.server.registerPathHandler("/.well-known/carddav", null),
    {
      url: "/",
      password: "alice",
      expectedStatus: "",
      expectedBooks: DEFAULT_BOOKS,
    }
  );
});

/** Test cancelling the password prompt when it appears. */
add_task(function testPasswordCancelled() {
  return wrappedTest(null, {
    url: "/",
    password: null,
  });
});

/** Test entering the wrong password, then retrying with the right one. */
add_task(function testBadPassword() {
  return wrappedTest(
    null,
    {
      url: "/",
      password: "bob",
    },
    {
      url: "/",
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

/** Test that entering only a username finds the right URL. */
add_task(function testEmailGoodPreset() {
  return wrappedTest(
    async () => {
      // The server is open but we need it on a specific port.
      await CardDAVServer.close();
      CardDAVServer.open("alice@test.invalid", "alice", 9999);
    },
    {
      username: "alice@test.invalid",
      password: "alice",
      expectedStatus: "",
      expectedBooks: DEFAULT_BOOKS,
    }
  );
});

/** Test that entering only a bad username fails appropriately. */
add_task(function testEmailBadPreset() {
  return wrappedTest(null, {
    username: "alice@bad.invalid",
    expectedStatus: "carddav-known-incompatible",
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
    {
      async callback(dialogWindow) {
        await attemptInit(dialogWindow, {
          url: CardDAVServer.origin,
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
      },
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

  // Don't close the server or delete the directory, they're needed below.
});

/**
 * Tests adding a second directory on the same server. The auth prompt should
 * show again, even though we've saved the credentials in the previous test.
 */
add_task(async function testEveryThingOKAgain() {
  // Ensure at least a second has passed since the previous test, since we use
  // context identifiers based on the current time in seconds.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => setTimeout(r, 1000));

  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;
  let dirTree = abDocument.getElementById("dirTree");

  Assert.equal(dirTree.view.rowCount, 4);

  let dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/addressbook/abCardDAVDialog.xhtml",
    {
      async callback(dialogWindow) {
        await attemptInit(dialogWindow, {
          url: CardDAVServer.origin,
          password: "alice",
          expectedStatus: "",
          expectedBooks: [DEFAULT_BOOKS[0]],
        });

        dialogWindow.document
          .querySelector("dialog")
          .getButton("accept")
          .click();
      },
    }
  );
  let syncPromise = TestUtils.topicObserved("addrbook-directory-synced");

  abWindow.AbNewCardDAVBook();

  await dialogPromise;
  let [directory] = await syncPromise;
  let davDirectory = CardDAVDirectory.forFile(directory.fileName);

  Assert.equal(
    Services.prefs.getStringPref(`${directory.dirPrefId}.carddav.url`, ""),
    CardDAVServer.altURL
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

  Assert.equal(dirTree.view.rowCount, 5);
  Assert.equal(dirTree.view.getCellText(2, dirTree.columns[0]), "CardDAV Test");
  Assert.equal(dirTree.view.getCellText(3, dirTree.columns[0]), "Not This One");

  await closeAddressBookWindow();
  await CardDAVServer.close();

  let otherDirectory = MailServices.ab.getDirectoryFromId(
    "ldap_2.servers.CardDAVTest"
  );
  await promiseDirectoryRemoved(directory.URI);
  await promiseDirectoryRemoved(otherDirectory.URI);

  Services.logins.removeAllLogins();
});

/**
 * Test setting up a directory but not saving the password. The username
 * should be saved and no further password prompt should appear. We can't test
 * restarting Thunderbird but if we could the password prompt would appear
 * next time the directory makes a reqeust.
 */
add_task(async function testNoSavePassword() {
  CardDAVServer.open("alice", "alice");

  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;
  let dirTree = abDocument.getElementById("dirTree");

  Assert.equal(dirTree.view.rowCount, 3);

  let dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/addressbook/abCardDAVDialog.xhtml",
    {
      async callback(dialogWindow) {
        await attemptInit(dialogWindow, {
          url: CardDAVServer.origin,
          password: "alice",
          savePassword: false,
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
      },
    }
  );
  let syncPromise = TestUtils.topicObserved("addrbook-directory-synced");

  abWindow.AbNewCardDAVBook();
  await dialogPromise;
  let [directory] = await syncPromise;
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
  Assert.equal(logins.length, 0, "login was NOT saved");

  Assert.equal(dirTree.view.rowCount, 4);
  Assert.equal(dirTree.view.getCellText(2, dirTree.columns[0]), "CardDAV Test");

  await closeAddressBookWindow();

  // Disable sync as we're going to start the address book manager again.
  directory.setIntValue("carddav.syncinterval", 0);

  // Don't close the server or delete the directory, they're needed below.
});

/**
 * Tests saving a previously unsaved password. This uses the directory from
 * the previous test and simulates a restart of the address book manager.
 */
add_task(async function testSavePasswordLater() {
  let reloadPromise = TestUtils.topicObserved("addrbook-reloaded");
  Services.obs.notifyObservers(null, "addrbook-reload");
  await reloadPromise;

  Assert.equal(MailServices.ab.directories.length, 3);
  let directory = MailServices.ab.getDirectoryFromId(
    "ldap_2.servers.CardDAVTest"
  );
  let davDirectory = CardDAVDirectory.forFile(directory.fileName);

  let promptPromise = handlePasswordPrompt("alice", "alice");
  let syncPromise = TestUtils.topicObserved("addrbook-directory-synced");
  davDirectory.fetchAllFromServer();
  await promptPromise;
  await syncPromise;

  Assert.equal(
    Services.prefs.getStringPref(`${directory.dirPrefId}.carddav.username`, ""),
    "alice",
    "username was saved"
  );

  let logins = Services.logins.findLogins(CardDAVServer.origin, null, "");
  Assert.equal(logins.length, 1, "login was saved");
  Assert.equal(logins[0].username, "alice");
  Assert.equal(logins[0].password, "alice");

  await CardDAVServer.close();

  await promiseDirectoryRemoved(directory.URI);

  Services.logins.removeAllLogins();
});
