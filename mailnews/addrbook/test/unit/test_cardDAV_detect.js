/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { CardDAVUtils } = ChromeUtils.importESModule(
  "resource:///modules/CardDAVUtils.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/**
 * Create the address book a discovery run found, and wait for its first sync.
 *
 * @param {foundBook} book - An address book returned by detectAddressBooks.
 * @param {string} message - What the caller expected creating the book to do.
 * @returns {nsIAbDirectory} The created directory.
 */
async function createBook(book, message) {
  const synced = TestUtils.topicObserved("addrbook-directory-synced");
  let directory = null;
  let error = null;
  try {
    directory = book.create();
  } catch (ex) {
    error = ex;
  }
  Assert.strictEqual(error?.message ?? null, null, message);
  Assert.ok(directory, "creating the book should return a directory");
  await synced;
  return directory;
}

async function deleteCardDAVBooks() {
  for (const directory of MailServices.ab.directories) {
    if (directory.dirType != Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE) {
      continue;
    }
    const deleted = TestUtils.topicObserved(
      "addrbook-directory-deleted",
      subject => subject == directory
    );
    MailServices.ab.deleteAddressBook(directory.URI);
    await deleted;
  }
}

add_task(async function test_serverAsksForCredentials() {
  const books = await CardDAVUtils.detectAddressBooks(
    "bob",
    "bob",
    CardDAVServer.url,
    false,
    false
  );

  Assert.deepEqual(
    books.map(book => book.url.href),
    [CardDAVServer.url],
    "discovery should find the address book the URL points at"
  );

  const directory = await createBook(
    books[0],
    "creating the found book should not throw"
  );

  Assert.equal(
    directory.getStringValue("carddav.username", ""),
    "bob",
    "the created book should know which user it belongs to"
  );

  await deleteCardDAVBooks();
});

add_task(async function test_serverDoesNotAskForCredentials() {
  const { username, password } = CardDAVServer;
  CardDAVServer.username = null;
  CardDAVServer.password = null;

  try {
    const books = await CardDAVUtils.detectAddressBooks(
      "bob",
      "bob",
      CardDAVServer.url,
      false,
      false
    );

    Assert.deepEqual(
      books.map(book => book.url.href),
      [CardDAVServer.url],
      "discovery should find the address book on a server without auth"
    );

    const directory = await createBook(
      books[0],
      "creating the found book should not throw when the server never asked for credentials"
    );

    Assert.equal(
      directory.getStringValue("carddav.username", ""),
      "bob",
      "the created book should know which user it belongs to"
    );
  } finally {
    CardDAVServer.username = username;
    CardDAVServer.password = password;
    await deleteCardDAVBooks();
  }
});

add_task(async function test_credentialsInTheURL() {
  const location = new URL(CardDAVServer.url);
  location.username = CardDAVServer.username;
  location.password = CardDAVServer.password;

  const books = await CardDAVUtils.detectAddressBooks(
    "",
    "",
    location.href,
    false,
    false
  );

  Assert.equal(
    books.length,
    1,
    "discovery should find the address book with the credentials taken from the URL"
  );

  const directory = await createBook(
    books[0],
    "creating the found book should not throw when the credentials came from the URL"
  );

  Assert.equal(
    directory.getStringValue("carddav.url", ""),
    CardDAVServer.url,
    "the created book should store the URL without the credentials"
  );
  Assert.equal(
    directory.getStringValue("carddav.username", ""),
    CardDAVServer.username,
    "the created book should know which user it belongs to"
  );

  await deleteCardDAVBooks();
});

add_task(async function test_credentialsInTheURLAreStored() {
  const location = new URL(CardDAVServer.url);
  location.username = CardDAVServer.username;
  location.password = CardDAVServer.password;

  try {
    const books = await CardDAVUtils.detectAddressBooks(
      "",
      "",
      location.href,
      false,
      true
    );
    await createBook(
      books[0],
      "creating the found book should not throw when the credentials came from the URL"
    );

    const logins = await Services.logins.searchLoginsAsync({
      origin: CardDAVServer.origin,
    });
    Assert.deepEqual(
      logins.map(login => [login.username, login.password]),
      [[CardDAVServer.username, CardDAVServer.password]],
      "the credentials from the URL should be stored for the next session"
    );
  } finally {
    await Services.logins.removeAllLoginsAsync();
    await deleteCardDAVBooks();
  }
});

add_task(async function test_theURLDoesNotOverrideGivenCredentials() {
  const location = new URL(CardDAVServer.url);
  location.username = "wrong";
  location.password = "wrong";

  const books = await CardDAVUtils.detectAddressBooks(
    "bob",
    "bob",
    location.href,
    false,
    false
  );

  Assert.deepEqual(
    books.map(book => book.url.href),
    [CardDAVServer.url],
    "discovery should use the given credentials, not the ones in the URL"
  );

  const directory = await createBook(
    books[0],
    "creating the found book should not throw"
  );

  Assert.equal(
    directory.getStringValue("carddav.username", ""),
    "bob",
    "the created book should belong to the user who was named, not to the URL"
  );

  await deleteCardDAVBooks();
});
