/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

add_setup(async function () {
  MailServices.accounts.createLocalMailAccount();
});

add_task(async function () {
  // An IMAP account with username/password auth.
  // This user is Marcia and all associated variables have an M# suffix.

  const accountM1 = MailServices.accounts.createAccount();
  accountM1.incomingServer = MailServices.accounts.createIncomingServer(
    "marcia",
    "localhost",
    "imap"
  );
  const loginM1 = await addLogin("imap://localhost", "marcia");

  let relatedLogins = await checkRelated(accountM1, [loginM1]);
  checkLoginsMap(relatedLogins, loginM1, [accountM1]);

  // Add an SMTP server with username/password auth.

  const smtpM1 = MailServices.outgoingServer.createServer("smtp");
  smtpM1.username = "marcia";
  smtpM1.QueryInterface(Ci.nsISmtpServer).hostname = "localhost";
  const loginM2 = await addLogin("smtp://localhost", "marcia");

  const identityM1 = MailServices.accounts.createIdentity();
  identityM1.smtpServerKey = smtpM1.key;
  accountM1.addIdentity(identityM1);

  relatedLogins = await checkRelated(accountM1, [loginM1, loginM2], [smtpM1]);
  checkLoginsMap(relatedLogins, loginM1, [accountM1]);
  checkLoginsMap(relatedLogins, loginM2, [smtpM1]);

  // Add a CardDAV address book and CalDAV calendar.

  const bookM1 = addAddressBook(
    "https://localhost/carddav/marcia/bookM1",
    "marcia"
  );
  const calendarM1 = addCalendar(
    "https://localhost/caldav/marcia/calendarM1",
    "marcia"
  );
  const loginM3 = await addLogin("https://localhost", "marcia");

  relatedLogins = await checkRelated(
    accountM1,
    [loginM1, loginM2, loginM3],
    [smtpM1],
    [bookM1],
    [calendarM1]
  );
  checkLoginsMap(relatedLogins, loginM1, [accountM1]);
  checkLoginsMap(relatedLogins, loginM2, [smtpM1]);
  checkLoginsMap(relatedLogins, loginM3, [bookM1, calendarM1]);

  // Add another CalDAV calendar.

  const calendarM2 = addCalendar(
    "https://localhost/caldav/marcia/calendarM2",
    "marcia"
  );

  await checkRelated(
    accountM1,
    [loginM1, loginM2, loginM3],
    [smtpM1],
    [bookM1],
    [calendarM1, calendarM2]
  );

  // POP3, SMTP, CardDAV, and CalDAV items with username/password.
  // The same servers as above are used. This user is Jan and all associated
  // variables have an J# suffix.

  const accountJ1 = MailServices.accounts.createAccount();
  accountJ1.incomingServer = MailServices.accounts.createIncomingServer(
    "jan",
    "localhost",
    "pop3"
  );
  const loginJ1 = await addLogin("mailbox://localhost", "jan");

  const smtpJ1 = MailServices.outgoingServer.createServer("smtp");
  smtpJ1.username = "jan";
  smtpJ1.QueryInterface(Ci.nsISmtpServer).hostname = "localhost";
  const loginJ2 = await addLogin("smtp://localhost", "jan");

  const identityJ1 = MailServices.accounts.createIdentity();
  identityJ1.smtpServerKey = smtpJ1.key;
  accountJ1.addIdentity(identityJ1);

  const bookJ1 = addAddressBook("https://localhost/carddav/jan/bookJ1", "jan");
  const calendarJ1 = addCalendar(
    "https://localhost/caldav/jan/calendarJ1",
    "jan"
  );
  const loginJ3 = await addLogin("https://localhost", "jan");

  relatedLogins = await checkRelated(
    accountJ1,
    [loginJ1, loginJ2, loginJ3],
    [smtpJ1],
    [bookJ1],
    [calendarJ1]
  );
  checkLoginsMap(relatedLogins, loginJ1, [accountJ1]);
  checkLoginsMap(relatedLogins, loginJ2, [smtpJ1]);
  checkLoginsMap(relatedLogins, loginJ3, [bookJ1, calendarJ1]);

  // An EWS account with username/password.
  // This user is Cindy and all associated variables have an C# suffix.

  const accountC1 = MailServices.accounts.createAccount();
  accountC1.incomingServer = MailServices.accounts.createIncomingServer(
    "cindy",
    "localhost",
    "ews"
  );
  accountC1.incomingServer.setStringValue(
    "ews_url",
    "https://localhost/EWS/Exchange.asmx"
  );
  const loginC1 = await addLogin("https://localhost", "cindy");

  const outgoingC1 = MailServices.outgoingServer.createServer("ews");
  outgoingC1.QueryInterface(Ci.IExchangeOutgoingServer);
  outgoingC1.initialize("https://localhost/EWS/Exchange.asmx");
  outgoingC1.username = "cindy";

  const identityC1 = MailServices.accounts.createIdentity();
  identityC1.smtpServerKey = outgoingC1.key;
  accountC1.addIdentity(identityC1);

  relatedLogins = await checkRelated(accountC1, [loginC1], [outgoingC1]);
  checkLoginsMap(relatedLogins, loginC1, [accountC1, outgoingC1]);

  // IMAP, SMTP, CardDAV and CalDav accounts with OAuth2.
  // This user is Greg and all associated variables have an G# suffix.

  const accountG1 = MailServices.accounts.createAccount();
  accountG1.incomingServer = MailServices.accounts.createIncomingServer(
    "greg",
    "test.test",
    "imap"
  );
  accountG1.incomingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  const loginG1 = await addLogin("oauth://test.test", "greg");

  const smtpG1 = MailServices.outgoingServer.createServer("smtp");
  smtpG1.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  smtpG1.username = "greg";
  smtpG1.QueryInterface(Ci.nsISmtpServer).hostname = "test.test";

  const identityG1 = MailServices.accounts.createIdentity();
  identityG1.smtpServerKey = smtpG1.key;
  accountG1.addIdentity(identityG1);

  const bookG1 = addAddressBook(
    "https://test.test/carddav/greg/bookG1",
    "greg"
  );
  const calendarG1 = addCalendar(
    "https://test.test/caldav/greg/calendarG1",
    "greg"
  );

  relatedLogins = await checkRelated(
    accountG1,
    [loginG1],
    [smtpG1],
    [bookG1],
    [calendarG1]
  );
  checkLoginsMap(relatedLogins, loginG1, [
    smtpG1,
    bookG1,
    calendarG1,
    accountG1,
  ]);

  // An EWS account with OAuth2 on a different host.
  // This user is Bobby and all associated variables have an B# suffix.

  const accountB1 = MailServices.accounts.createAccount();
  accountB1.incomingServer = MailServices.accounts.createIncomingServer(
    "bobby",
    "test.test",
    "ews"
  );
  accountB1.incomingServer.setStringValue(
    "ews_url",
    "https://test.test/EWS/Exchange.asmx"
  );
  accountB1.incomingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  const loginB1 = await addLogin("oauth://test.test", "bobby");

  const outgoingB1 = MailServices.outgoingServer.createServer("ews");
  outgoingB1.QueryInterface(Ci.IExchangeOutgoingServer);
  outgoingB1.initialize("https://test.test/EWS/Exchange.asmx");
  outgoingB1.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  outgoingB1.username = "bobby";

  const identityB1 = MailServices.accounts.createIdentity();
  identityB1.smtpServerKey = outgoingB1.key;
  accountB1.addIdentity(identityB1);

  relatedLogins = await checkRelated(accountB1, [loginB1], [outgoingB1]);
  checkLoginsMap(relatedLogins, loginB1, [accountB1]);

  // Check the earlier accounts are not mixed up with the later additions.

  await checkRelated(
    accountM1,
    [loginM1, loginM2, loginM3],
    [smtpM1],
    [bookM1],
    [calendarM1, calendarM2]
  );

  await checkRelated(
    accountJ1,
    [loginJ1, loginJ2, loginJ3],
    [smtpJ1],
    [bookJ1],
    [calendarJ1]
  );

  await checkRelated(accountC1, [loginC1], [outgoingC1]);

  await checkRelated(accountG1, [loginG1], [smtpG1], [bookG1], [calendarG1]);

  // And now for the edge cases.

  // Jan's account has an identity that uses Marcia's SMTP server. This means
  // the SMTP server, and the password for it, can't be removed.

  const identityJ2 = MailServices.accounts.createIdentity();
  identityJ2.smtpServerKey = smtpM1.key;
  accountJ1.addIdentity(identityJ2);

  await checkRelated(
    accountM1,
    [loginM1, loginM3], // loginM2 is used by smtpM2.
    [], // smtpM1 is used by identityJ2, so it can't be removed.
    [bookM1],
    [calendarM1, calendarM2]
  );

  await checkRelated(
    accountJ1,
    [loginJ1, loginJ2, loginJ3],
    [smtpJ1], // smtpM1 is used by identityM1, so it can't be removed.
    [bookJ1],
    [calendarJ1]
  );

  accountJ1.removeIdentity(identityJ2);

  // Marcia has another address book and calendar on a different service but
  // with the same username. These aren't associated with Marcia's account and
  // should not be included.

  addAddressBook("https://other.test/marcia's_address_book", "marcia");
  addCalendar("https://other.test/marcia's_calendar", "marcia");
  await addLogin("https://other.test", "marcia");
  await checkRelated(
    accountM1,
    [loginM1, loginM2, loginM3],
    [smtpM1],
    [bookM1],
    [calendarM1, calendarM2]
  );

  // Greg has another address book and calendar on a different service but
  // with the same username. These aren't associated with Greg's account and
  // should not be included.

  addAddressBook("https://other.test/greg's_address_book", "greg");
  addCalendar("https://other.test/greg's_calendar", "greg");
  await addLogin("https://other.test", "greg");
  await checkRelated(accountG1, [loginG1], [smtpG1], [bookG1], [calendarG1]);
});

async function addLogin(origin, username) {
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(origin, null, origin, username, "password");
  return await Services.logins.addLoginAsync(loginInfo);
}

function addAddressBook(url, username) {
  const dirPrefId = MailServices.ab.newAddressBook(
    `${username}'s address book`,
    null,
    Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE
  );
  const book = MailServices.ab.getDirectoryFromId(dirPrefId);
  book.setStringValue("carddav.url", url);
  book.setStringValue("carddav.username", username);
  book.setIntValue("carddav.syncinterval", 0);
  return book;
}

function addCalendar(url, username) {
  const calendar = cal.manager.createCalendar(
    "caldav",
    Services.io.newURI(url)
  );
  calendar.setProperty("username", username);
  calendar.setProperty("refreshInterval", 0);
  cal.manager.registerCalendar(calendar);
  return calendar;
}

/**
 * Check the function finds the correct items related to the given account.
 *
 * @param {nsIMsgAccount} account - The account to check.
 * @param {nsILoginInfo[]} expectedLogins
 * @param {nsIMsgOutgoingServer[]} [expectedOutgoingServers]
 * @param {nsIAbDirectory[]} [expectedAddressBooks]
 * @param {calICalendar[]} [expectedCalendars]
 * @returns {Map<nsILoginInfo, Iterable<any>>} the related logins map.
 */
async function checkRelated(
  account,
  expectedLogins,
  expectedOutgoingServers = [],
  expectedAddressBooks = [],
  expectedCalendars = []
) {
  info(`finding related items for ${account.key}`);
  const { logins, outgoingServers, addressBooks, calendars } =
    await MailUtils.findRelatedItems(account);

  Assert.deepEqual(
    Array.from(logins.keys()).toSorted(),
    expectedLogins.map(l => l.guid).toSorted(),
    "logins"
  );
  Assert.deepEqual(
    Array.from(outgoingServers, o => o.key).toSorted(),
    expectedOutgoingServers.map(o => o.key).toSorted(),
    "outgoingServers"
  );
  Assert.deepEqual(
    Array.from(addressBooks, b => b.UID).toSorted(),
    expectedAddressBooks.map(b => b.UID).toSorted(),
    "addressBooks"
  );
  Assert.deepEqual(
    Array.from(calendars, c => c.id).toSorted(),
    expectedCalendars.map(c => c.id).toSorted(),
    "calendars"
  );

  return logins;
}

/**
 * Check the returned logins match the correct items.
 *
 * @param {Map<nsILoginInfo, Iterable<any>>} relatedLogins - Returned from
 *   `checkRelated`.
 * @param {nsILoginInfo} login - The login to check.
 * @param {any[]} expectedItems
 */
async function checkLoginsMap(relatedLogins, login, expectedItems) {
  expectedItems = new Set(expectedItems);
  const actualItems = relatedLogins.get(login.guid);
  Assert.equal(
    actualItems.symmetricDifference(expectedItems).size,
    0,
    `login ${login.guid} is tied to the right items`
  );
}
