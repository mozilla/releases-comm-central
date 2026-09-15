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

/**
 * Writability is derived from "current-user-privilege-set" per RFC 3744. The
 * DTD is `<!ELEMENT privilege ANY>`, so a server may report each granted
 * privilege in its own <privilege> element, or group several of them inside a
 * single <privilege> element. Both forms must be understood.
 *
 * A privilege set the server did return, but which grants no read access, means
 * the address book is not ours to use and discovery should not offer it at all.
 */
add_task(async function test_privilegeSetShapes() {
  const cases = [
    {
      desc: "one privilege per element, granting write",
      privileges:
        "<d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege>",
      readOnly: false,
    },
    {
      desc: "several privileges grouped in one element, granting write",
      privileges: `<d:privilege>
        <d:read-current-user-privilege-set/>
        <d:read/>
        <d:write-properties/>
        <d:write/>
        <d:bind/>
        <d:unbind/>
        <d:write-content/>
        <d:read-acl/>
        <d:write-acl/>
      </d:privilege>`,
      readOnly: false,
    },
    {
      desc: "one privilege per element, granting no write",
      privileges:
        "<d:privilege><d:read/></d:privilege><d:privilege><d:write-properties/></d:privilege>",
      readOnly: true,
    },
    {
      desc: "several privileges grouped in one element, granting no write",
      privileges:
        "<d:privilege><d:read/><d:write-properties/><d:read-acl/></d:privilege>",
      readOnly: true,
    },
    {
      desc: "no privilege set at all",
      privileges: null,
      readOnly: false,
    },
    {
      desc: "an empty privilege set, granting nothing",
      privileges: "",
      excluded: true,
    },
    {
      desc: "privileges that grant neither read nor write",
      privileges:
        "<d:privilege><d:write-properties/></d:privilege><d:privilege><d:read-acl/></d:privilege>",
      excluded: true,
    },
  ];

  try {
    for (const { desc, privileges, readOnly, excluded } of cases) {
      info(`Testing a privilege set with ${desc}.`);
      CardDAVServer.privileges = privileges;

      const books = await CardDAVUtils.detectAddressBooks(
        "bob",
        "bob",
        CardDAVServer.url,
        false,
        false
      );

      if (excluded) {
        Assert.deepEqual(
          books.map(book => book.url.href),
          [],
          `discovery should not offer the address book with ${desc}`
        );
        continue;
      }

      Assert.deepEqual(
        books.map(book => book.url.href),
        [CardDAVServer.url],
        `discovery should find the address book with ${desc}`
      );

      const directory = await createBook(
        books[0],
        "creating the found book should not throw"
      );
      Assert.equal(
        directory.readOnly,
        readOnly,
        `a book with ${desc} should${readOnly ? "" : " not"} be read-only`
      );

      await deleteCardDAVBooks();
    }
  } finally {
    CardDAVServer.privileges = "<d:privilege><d:all/></d:privilege>";
    await deleteCardDAVBooks();
  }
});

/**
 * A server may list the properties it doesn't have in a propstat before the
 * propstat with the properties it does have. Discovery must not read the
 * privilege set from a propstat the server reported as 404, nor give up on the
 * whole response because the first propstat it sees isn't a 200.
 *
 * The case where the server has no privilege set to report, so that the 404
 * propstat both comes first and is the one naming the privilege set, is the
 * response from bug 1973205.
 */
add_task(async function test_notFoundPropstatFirst() {
  const cases = [
    {
      desc: "the privilege set was returned in the 200 propstat",
      privileges: "<d:privilege><d:all/></d:privilege>",
    },
    {
      desc: "the privilege set was reported in the 404 propstat",
      privileges: null,
    },
  ];

  CardDAVServer.notFoundPropstatFirst = true;

  try {
    for (const { desc, privileges } of cases) {
      info(`Testing a 404 propstat before the 200 propstat, where ${desc}.`);
      CardDAVServer.privileges = privileges;

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
        `discovery should find the address book when the 404 propstat comes first and ${desc}`
      );

      const directory = await createBook(
        books[0],
        "creating the found book should not throw"
      );
      Assert.ok(
        !directory.readOnly,
        `a book should not be read-only when the 404 propstat comes first and ${desc}`
      );
      Assert.equal(
        directory.dirName,
        "CardDAV Test",
        "the name should come from the displayname the server did return"
      );

      await deleteCardDAVBooks();
    }
  } finally {
    CardDAVServer.notFoundPropstatFirst = false;
    CardDAVServer.privileges = "<d:privilege><d:all/></d:privilege>";
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
