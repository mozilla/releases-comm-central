/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { RemoteAddressBookUtils } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/RemoteAddressBookUtils.sys.mjs"
);

const { CardDAVServer } = ChromeUtils.importESModule(
  "resource://testing-common/CardDAVServer.sys.mjs"
);

const { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

let expectedBooks;

add_setup(async () => {
  do_get_profile();
  // Initialize the AB manager.
  MailServices.ab.directories;
  // Port 9999 is special and makes this work with an email account.
  CardDAVServer.open("test@test.invalid", "bob", 9999);
  const uid = MailServices.ab.newAddressBook(
    "test",
    null,
    Ci.nsIBackgroundTasksManager.CARDDAV_DIRECTORY_TYPE,
    null
  );
  const book = MailServices.ab.getDirectoryFromId(uid);

  book.setStringValue("carddav.url", CardDAVServer.url);
  book.setStringValue(CardDAVServer.username, "bob");
  const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  login.init(
    CardDAVServer.origin,
    null,
    "test",
    "test@test.invalid",
    "bob",
    "",
    ""
  );
  await Services.logins.addLoginAsync(login);

  const abAccount = MailServices.accounts.createAccount();
  abAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "test@test.invalid",
    "test.invalid",
    "imap"
  );
  const identity = MailServices.accounts.createIdentity();
  identity.email = "test@test.invalid";
  abAccount.addIdentity(identity);
  abAccount.defaultIdentity = identity;

  // Oauth with server that's not supported.
  const oauthAccount = MailServices.accounts.createAccount();
  oauthAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "oauth@oauth.example",
    "oauth.example",
    "imap"
  );
  oauthAccount.incomingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;

  // Email account without any associated address books and none to disocver.
  const secondLogin = Cc[
    "@mozilla.org/login-manager/loginInfo;1"
  ].createInstance(Ci.nsILoginInfo);
  secondLogin.init(
    "mochi.test",
    null,
    "test",
    "secondary@localhost",
    "unused",
    "",
    ""
  );
  await Services.logins.addLoginAsync(secondLogin);
  const secondAccount = MailServices.accounts.createAccount();
  secondAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "secondary@localhost",
    "localhost",
    "imap"
  );

  expectedBooks = [
    {
      name: "Not This One",
      url: CardDAVServer.altURL,
      existing: undefined,
    },
    {
      name: "CardDAV Test",
      url: CardDAVServer.url,
      existing: true,
    },
  ];

  registerCleanupFunction(async () => {
    MailServices.ab.deleteAddressBook(book.URI);
    Services.logins.removeAllLogins();
    MailServices.accounts.removeAccount(abAccount, true);
    MailServices.accounts.removeAccount(oauthAccount, true);
    MailServices.accounts.removeAccount(secondAccount, true);
    CardDAVServer.reset();
    await CardDAVServer.close();
  });
});

/**
 * Check a found book against the expected values for it.
 *
 * @param {foundBook} book - The found book object.
 * @param {number} index - The index of the expected book.
 */
function checkFoundBook(book, index) {
  const expectedBook = expectedBooks[index];
  Assert.equal(book.name, expectedBook.name, `Book ${index} name should match`);
  Assert.equal(
    book.url.href,
    expectedBook.url,
    `Should have the correct url for book ${index}`
  );
  Assert.equal(
    book.existing,
    expectedBook.existing,
    `Existing state should match expectation for book ${index}`
  );
  Assert.equal(
    typeof book.create,
    "function",
    `Book ${index} should have a create method`
  );
}

add_task(function test_markExistingAddressBooks() {
  const books = [
    {
      name: "foo",
      url: new URL("https://example.com/foo"),
      _expectExisting: undefined,
    },
    {
      name: "existing book",
      url: new URL(CardDAVServer.url),
      _expectExisting: true,
    },
  ];
  const result = RemoteAddressBookUtils.markExistingAddressBooks(books);
  Assert.ok(Array.isArray(result), "Should return an array");
  Assert.notEqual(result, books, "Should get a new array of address books");
  Assert.equal(
    result.length,
    books.length,
    "Should get the same amount of address books back"
  );
  for (const [index, book] of books.entries()) {
    Assert.strictEqual(
      result[index],
      book,
      "The book object should be the same in both arrays"
    );
    Assert.equal(
      book.existing,
      book._expectExisting,
      `Book ${book.name} existing flag should match expected state`
    );
  }
});

add_task(async function test_getAddressBooksForAccount_badURLs() {
  await Assert.rejects(
    RemoteAddressBookUtils.getAddressBooksForAccount(
      CardDAVServer.username,
      "bob",
      "mochi.test:8888"
    ),
    /NS_NOINTERFACE/
  );
  await Assert.rejects(
    RemoteAddressBookUtils.getAddressBooksForAccount(
      CardDAVServer.username,
      "bob",
      "http://mochi.test:8888"
    ),
    /NS_ERROR_UNKNOWN_HOST/
  );
  await Assert.rejects(
    RemoteAddressBookUtils.getAddressBooksForAccount(
      CardDAVServer.username,
      "bob",
      "https://mochi.test:8888"
    ),
    /NS_ERROR_UNKNOWN_HOST/
  );
});

add_task(async function test_getAddressBooksForAccount_badPassword() {
  await Assert.rejects(
    RemoteAddressBookUtils.getAddressBooksForAccount(
      CardDAVServer.username,
      "boo",
      CardDAVServer.url
    ),
    /Authorization failure/
  );
});

add_task(async function test_getAddressBooksForAccount_directLink() {
  const result = await RemoteAddressBookUtils.getAddressBooksForAccount(
    CardDAVServer.username,
    "bob",
    `${CardDAVServer.origin}/addressbooks/me/`
  );
  Assert.ok(Array.isArray(result), "Should return an array");
  Assert.equal(
    result.length,
    expectedBooks.length,
    "Should find correct amount of books"
  );
  for (const [index, book] of result.entries()) {
    checkFoundBook(book, index);
  }
});

add_task(async function test_getAddressBookForAccount_specificBook() {
  const result = await RemoteAddressBookUtils.getAddressBooksForAccount(
    CardDAVServer.username,
    "bob",
    CardDAVServer.altURL
  );
  Assert.ok(Array.isArray(result), "Should return an array");
  Assert.equal(result.length, 1, "Should only find a single book");
  checkFoundBook(result[0], 0);
});

add_task(async function test_getAddressBooksForExistingAccounts() {
  const results =
    await RemoteAddressBookUtils.getAddressBooksForExistingAccounts();
  Assert.ok(Array.isArray(results), "Should get an array of results");
  Assert.equal(results.length, 1, "Should get one account object");
  const [firstResult] = results;
  Assert.ok(
    firstResult.account instanceof Ci.nsIMsgAccount,
    "Should get the account"
  );
  Assert.equal(
    firstResult.existingAddressBookCount,
    1,
    "Should have an existing address book"
  );
  Assert.ok(
    Array.isArray(firstResult.addressBooks),
    "Should get an array of address book results"
  );
  Assert.equal(
    firstResult.addressBooks.length,
    expectedBooks.length,
    "Should find expected amount of address books for accounts"
  );
  for (const [index, book] of firstResult.addressBooks.entries()) {
    checkFoundBook(book, index);
  }
});

add_task(async function test_getAddressBooksForAccountStorePassword() {
  const initialLogins = await Services.logins.searchLoginsAsync({
    origin: CardDAVServer.origin,
  });
  Assert.equal(
    initialLogins.length,
    1,
    "Should already have one login at the start of the test"
  );
  for (const login of initialLogins) {
    Services.logins.removeLogin(login);
  }

  const books = await RemoteAddressBookUtils.getAddressBooksForAccount(
    CardDAVServer.username,
    "bob",
    CardDAVServer.origin
  );
  let syncPromise = TestUtils.topicObserved("addrbook-directory-synced");
  let directory = await books[0].create();

  const firstLogins = await Services.logins.searchLoginsAsync({
    origin: CardDAVServer.origin,
  });
  Assert.equal(firstLogins.length, 0, "Should not store a login by default");

  let [rawDirectory] = await syncPromise;

  let removePromise = TestUtils.topicObserved(
    "addrbook-directory-deleted",
    subject => subject == rawDirectory
  );
  MailServices.ab.deleteAddressBook(directory.URI);
  await removePromise;

  info("This time we'll tell it to save the password");

  const moreBooks = await RemoteAddressBookUtils.getAddressBooksForAccount(
    CardDAVServer.username,
    CardDAVServer.password,
    CardDAVServer.origin,
    true
  );

  syncPromise = TestUtils.topicObserved("addrbook-directory-synced");
  directory = await moreBooks[0].create();

  const secondLogins = await Services.logins.searchLoginsAsync({
    origin: CardDAVServer.origin,
  });
  Assert.equal(firstLogins.length, 0, "Should not store a login by default");

  [rawDirectory] = await syncPromise;

  removePromise = TestUtils.topicObserved(
    "addrbook-directory-deleted",
    subject => subject == rawDirectory
  );
  MailServices.ab.deleteAddressBook(directory.URI);
  await removePromise;

  Assert.equal(secondLogins.length, 1, "Should store a login when told to");
  Assert.equal(
    secondLogins[0].username,
    CardDAVServer.username,
    "Should have username provided in the search"
  );
  Assert.equal(
    secondLogins[0].password,
    CardDAVServer.password,
    "Should have password provided in the search"
  );
});

add_task(
  async function test_getAddressBooksForExistingAccounts_ignoreNonMail() {
    const accountQuerySpy = sinon.spy(
      RemoteAddressBookUtils,
      "getAddressBooksForAccount"
    );
    try {
      if (!MailServices.accounts.localFoldersServer) {
        throw new Error("Need local folders");
      }
    } catch {
      MailServices.accounts.createLocalMailAccount();
    }
    const feedAccount = FeedUtils.createRssAccount("remoteAddressBookUtils");

    const results =
      await RemoteAddressBookUtils.getAddressBooksForExistingAccounts();
    Assert.ok(Array.isArray(results), "Should get an array of results");
    Assert.equal(results.length, 1, "Should get one account object");
    Assert.equal(
      accountQuerySpy.callCount,
      2,
      "Should only call getAddressBooksForAccount twice"
    );
    Assert.ok(
      accountQuerySpy.calledWith(
        CardDAVServer.username,
        "",
        "https://test.invalid",
        true
      ),
      "Should have called getAddressBooksForAccount for the test CardDAV account"
    );

    accountQuerySpy.restore();
    MailServices.accounts.removeAccount(feedAccount, true);
  }
);

add_task(
  async function test_getAddressBooksForExistingAccounts_fallbackToIdentity() {
    const abAccount = MailServices.accounts.accounts.find(
      account => account.incomingServer.username == CardDAVServer.username
    );
    CardDAVServer.username = "neo";
    abAccount.incomingServer.username = CardDAVServer.username;
    abAccount.incomingServer.password = CardDAVServer.password;
    const results =
      await RemoteAddressBookUtils.getAddressBooksForExistingAccounts();
    Assert.ok(Array.isArray(results), "Should get an array of results");
    Assert.equal(results.length, 1, "Should get one account object");
    const [firstResult] = results;
    Assert.ok(
      firstResult.account instanceof Ci.nsIMsgAccount,
      "Should get the account"
    );
    Assert.equal(
      firstResult.account.key,
      abAccount.key,
      "Should find results for the account without host in the username"
    );
    Assert.equal(
      firstResult.existingAddressBookCount,
      1,
      "Should have an existing address book"
    );
    Assert.ok(
      Array.isArray(firstResult.addressBooks),
      "Should get an array of address book results"
    );
    Assert.equal(
      firstResult.addressBooks.length,
      expectedBooks.length,
      "Should find expected amount of address books for accounts"
    );
    CardDAVServer.username = "test@test.invalid";
    abAccount.incomingServer.username = CardDAVServer.username;
    abAccount.incomingServer.password = CardDAVServer.password;
  }
);
