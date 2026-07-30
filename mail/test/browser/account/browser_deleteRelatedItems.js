/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { click_account_tree_row, get_account_tree_row, openAccountSettings } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/AccountManagerHelpers.sys.mjs"
  );

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

let accountM1,
  smtpM1,
  bookM1,
  calendarM1,
  calendarM2,
  loginM1,
  loginM2,
  loginM3;
let accountJ1, smtpJ1, bookJ1, calendarJ1, loginJ1, loginJ2, loginJ3;
let accountC1, outgoingC1, loginC1;
let accountG1, smtpG1, bookG1, calendarG1, loginG1;
let accountB1, outgoingB1, loginB1;
let tab;

add_setup(async function () {
  async function addLogin(origin, username) {
    const loginInfo = Cc[
      "@mozilla.org/login-manager/loginInfo;1"
    ].createInstance(Ci.nsILoginInfo);
    loginInfo.init(origin, null, origin, username, "password");
    return await Services.logins.addLoginAsync(loginInfo);
  }

  function addAddressBook(url, name, username) {
    const dirPrefId = MailServices.ab.newAddressBook(
      name,
      null,
      Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE
    );
    const book = MailServices.ab.getDirectoryFromId(dirPrefId);
    book.setStringValue("carddav.url", url);
    book.setStringValue("carddav.username", username);
    book.setIntValue("carddav.syncinterval", 0);
    return book;
  }

  function addCalendar(url, name, username) {
    const calendar = cal.manager.createCalendar(
      "caldav",
      Services.io.newURI(url)
    );
    calendar.name = name;
    calendar.setProperty("username", username);
    calendar.setProperty("refreshInterval", 0);
    cal.manager.registerCalendar(calendar);
    return calendar;
  }

  // IMAP, SMTP, CardDAV, and CalDAV items with username/password.
  // This user is Marcia and all associated variables have an M# suffix.

  accountM1 = MailServices.accounts.createAccount();
  accountM1.incomingServer = MailServices.accounts.createIncomingServer(
    "marcia",
    "localhost",
    "imap"
  );
  accountM1.incomingServer.prettyName = "Marcia's Incoming Mail";

  smtpM1 = MailServices.outgoingServer.createServer("smtp");
  smtpM1.description = "Marcia's Outgoing Mail";
  smtpM1.username = "marcia";
  smtpM1.QueryInterface(Ci.nsISmtpServer).hostname = "localhost";

  const identityM1 = MailServices.accounts.createIdentity();
  identityM1.smtpServerKey = smtpM1.key;
  accountM1.addIdentity(identityM1);

  bookM1 = addAddressBook(
    "https://localhost/carddav/marcia/bookM1",
    "Marcia's Address Book",
    "marcia"
  );

  calendarM1 = addCalendar(
    "https://localhost/caldav/marcia/calendarM1",
    "Marcia's Calendar",
    "marcia"
  );
  calendarM2 = addCalendar(
    "https://localhost/caldav/marcia/calendarM2",
    "Marcia's Other Calendar",
    "marcia"
  );

  loginM1 = await addLogin("imap://localhost", "marcia");
  loginM2 = await addLogin("smtp://localhost", "marcia");
  loginM3 = await addLogin("https://localhost", "marcia");

  // POP3, SMTP, CardDAV, and CalDAV items with username/password.
  // The same servers as above are used. This user is Jan and all associated
  // variables have an J# suffix.

  accountJ1 = MailServices.accounts.createAccount();
  accountJ1.incomingServer = MailServices.accounts.createIncomingServer(
    "jan",
    "localhost",
    "pop3"
  );
  accountJ1.incomingServer.prettyName = "Jan's Incoming Mail";

  smtpJ1 = MailServices.outgoingServer.createServer("smtp");
  smtpJ1.description = "Jan's Outgoing Mail";
  smtpJ1.username = "jan";
  smtpJ1.QueryInterface(Ci.nsISmtpServer).hostname = "localhost";

  const identityJ1 = MailServices.accounts.createIdentity();
  identityJ1.smtpServerKey = smtpJ1.key;
  accountJ1.addIdentity(identityJ1);

  bookJ1 = addAddressBook(
    "https://localhost/carddav/jan/bookJ1",
    "Jan's Address Book",
    "jan"
  );
  calendarJ1 = addCalendar(
    "https://localhost/caldav/jan/calendarJ1",
    "Jan's Calendar",
    "jan"
  );

  loginJ1 = await addLogin("mailbox://localhost", "jan");
  loginJ2 = await addLogin("smtp://localhost", "jan");
  loginJ3 = await addLogin("https://localhost", "jan");

  // An EWS account with username/password.
  // This user is Cindy and all associated variables have an C# suffix.

  accountC1 = MailServices.accounts.createAccount();
  accountC1.incomingServer = MailServices.accounts.createIncomingServer(
    "cindy",
    "localhost",
    "ews"
  );
  accountC1.incomingServer.prettyName = "Cindy's Incoming Mail";
  accountC1.incomingServer.setStringValue(
    "ews_url",
    "https://localhost/EWS/Exchange.asmx"
  );

  outgoingC1 = MailServices.outgoingServer.createServer("ews");
  outgoingC1.description = "Cindy's Outgoing Mail";
  outgoingC1.QueryInterface(Ci.IExchangeOutgoingServer);
  outgoingC1.initialize("https://localhost/EWS/Exchange.asmx");
  outgoingC1.username = "cindy";

  const identityC1 = MailServices.accounts.createIdentity();
  identityC1.smtpServerKey = outgoingC1.key;
  accountC1.addIdentity(identityC1);

  loginC1 = await addLogin("https://localhost", "cindy");

  // IMAP, SMTP, CardDAV and CalDav accounts with OAuth2.
  // This user is Greg and all associated variables have an G# suffix.

  accountG1 = MailServices.accounts.createAccount();
  accountG1.incomingServer = MailServices.accounts.createIncomingServer(
    "greg",
    "test.test",
    "imap"
  );
  accountG1.incomingServer.prettyName = "Greg's Incoming Mail";
  accountG1.incomingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  loginG1 = await addLogin("oauth://test.test", "greg");

  smtpG1 = MailServices.outgoingServer.createServer("smtp");
  smtpG1.description = "Greg's Outgoing Mail";
  smtpG1.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  smtpG1.username = "greg";
  smtpG1.QueryInterface(Ci.nsISmtpServer).hostname = "test.test";

  const identityG1 = MailServices.accounts.createIdentity();
  identityG1.smtpServerKey = smtpG1.key;
  accountG1.addIdentity(identityG1);

  bookG1 = addAddressBook(
    "https://test.test/carddav/greg/bookG1",
    "Greg's Address Book",
    "greg"
  );
  calendarG1 = addCalendar(
    "https://test.test/caldav/greg/calendarG1",
    "Greg's Calendar",
    "greg"
  );

  // An EWS account with OAuth2 on a different host.
  // This user is Bobby and all associated variables have an B# suffix.

  accountB1 = MailServices.accounts.createAccount();
  accountB1.incomingServer = MailServices.accounts.createIncomingServer(
    "bobby",
    "test.test",
    "ews"
  );
  accountG1.incomingServer.prettyName = "Bobby's Incoming Mail";
  accountB1.incomingServer.setStringValue(
    "ews_url",
    "https://test.test/EWS/Exchange.asmx"
  );
  accountB1.incomingServer.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  loginB1 = await addLogin("oauth://test.test", "bobby");

  outgoingB1 = MailServices.outgoingServer.createServer("ews");
  outgoingB1.description = "Bobby's Outgoing Mail";
  outgoingB1.QueryInterface(Ci.IExchangeOutgoingServer);
  outgoingB1.initialize("https://test.test/EWS/Exchange.asmx");
  outgoingB1.authMethod = Ci.nsMsgAuthMethod.OAuth2;
  outgoingB1.username = "bobby";

  const identityB1 = MailServices.accounts.createIdentity();
  identityB1.smtpServerKey = outgoingB1.key;
  accountB1.addIdentity(identityB1);

  tab = await openAccountSettings();

  registerCleanupFunction(async function () {
    document.getElementById("tabmail").closeTab(tab);
    MailServices.ab.deleteAddressBook(bookJ1.URI);
    MailServices.outgoingServer.deleteServer(smtpJ1);
    MailServices.outgoingServer.deleteServer(outgoingC1);
    cal.manager.unregisterCalendar(calendarG1);
    await Services.logins.removeAllLoginsAsync();
  });
});

add_task(async function testRemoveMarcia() {
  const win = await promiseRemoveDialog(accountM1);
  const doc = win.document;
  const question = doc.getElementById("accountName");
  const outgoingsCheckbox = doc.getElementById("removeOutgoings");
  const outgoingsList = doc.querySelector(
    "#removeOutgoingsPossibility description"
  );
  const addressBooksCheckbox = doc.getElementById("removeAddressBooks");
  const addressBooksList = doc.querySelector(
    "#removeAddressBooksPossibility description"
  );
  const calendarsCheckbox = doc.getElementById("removeCalendars");
  const calendarsList = doc.querySelector(
    "#removeCalendarsPossibility description"
  );
  const loginsCheckbox = doc.getElementById("removeLogins");
  const acceptButton = doc.querySelector("dialog").getButton("accept");

  Assert.equal(
    question.textContent,
    `Are you sure you want to remove the account "Marcia's Incoming Mail"?`
  );

  Assert.ok(BrowserTestUtils.isVisible(outgoingsCheckbox));
  Assert.equal(outgoingsList.textContent, "Marcia's Outgoing Mail");
  Assert.ok(BrowserTestUtils.isVisible(addressBooksCheckbox));
  Assert.equal(addressBooksList.textContent, "Marcia's Address Book");
  Assert.ok(BrowserTestUtils.isVisible(calendarsCheckbox));
  Assert.equal(
    calendarsList.textContent,
    "Marcia's Calendar and Marcia's Other Calendar"
  );
  Assert.ok(BrowserTestUtils.isVisible(loginsCheckbox));
  checkLoginsCheckbox(loginsCheckbox, "passwords", 3);

  EventUtils.synthesizeMouseAtCenter(acceptButton, {}, win);
  Assert.ok(acceptButton.disabled);
  await TestUtils.waitForCondition(() => !acceptButton.disabled);
  EventUtils.synthesizeMouseAtCenter(acceptButton, {}, win);

  Assert.ok(!MailServices.accounts.getAccount(accountM1.key));
  Assert.ok(!MailServices.outgoingServer.getServerByKey(smtpM1.key));
  Assert.ok(!MailServices.ab.getDirectoryFromUID(bookM1.UID));
  Assert.ok(!cal.manager.getCalendarById(calendarM1.id));
  Assert.ok(!cal.manager.getCalendarById(calendarM2.id));
  const loginGUIDs = Array.from(
    await Services.logins.getAllLogins(),
    l => l.guid
  );
  Assert.ok(!loginGUIDs.includes(loginM1.guid));
  Assert.ok(!loginGUIDs.includes(loginM2.guid));
  Assert.ok(!loginGUIDs.includes(loginM3.guid));
});

add_task(async function testRemoveJan() {
  const win = await promiseRemoveDialog(accountJ1);
  const doc = win.document;
  const outgoingsCheckbox = doc.getElementById("removeOutgoings");
  const addressBooksCheckbox = doc.getElementById("removeAddressBooks");
  const calendarsCheckbox = doc.getElementById("removeCalendars");
  const loginsCheckbox = doc.getElementById("removeLogins");
  const acceptButton = doc.querySelector("dialog").getButton("accept");

  Assert.ok(BrowserTestUtils.isVisible(outgoingsCheckbox));
  Assert.ok(BrowserTestUtils.isVisible(addressBooksCheckbox));
  Assert.ok(BrowserTestUtils.isVisible(calendarsCheckbox));
  Assert.ok(BrowserTestUtils.isVisible(loginsCheckbox));
  checkLoginsCheckbox(loginsCheckbox, "passwords", 3);

  // Uncheck the outgoing server. Its password can't be removed.
  EventUtils.synthesizeMouseAtCenter(outgoingsCheckbox, {}, win);
  checkLoginsCheckbox(loginsCheckbox, "passwords", 2);
  // Uncheck the address book. Its password can't be removed.
  EventUtils.synthesizeMouseAtCenter(addressBooksCheckbox, {}, win);
  checkLoginsCheckbox(loginsCheckbox, "passwords", 1);
  // Uncheck the calendar. Its password is the same as the address book, which
  // already can't be removed.
  EventUtils.synthesizeMouseAtCenter(calendarsCheckbox, {}, win);
  checkLoginsCheckbox(loginsCheckbox, "passwords", 1);
  EventUtils.synthesizeMouseAtCenter(calendarsCheckbox, {}, win);
  checkLoginsCheckbox(loginsCheckbox, "passwords", 1);

  EventUtils.synthesizeMouseAtCenter(acceptButton, {}, win);
  Assert.ok(acceptButton.disabled);
  await TestUtils.waitForCondition(() => !acceptButton.disabled);
  EventUtils.synthesizeMouseAtCenter(acceptButton, {}, win);

  Assert.ok(!MailServices.accounts.getAccount(accountJ1.key));
  Assert.ok(MailServices.outgoingServer.getServerByKey(smtpJ1.key));
  Assert.ok(MailServices.ab.getDirectoryFromUID(bookJ1.UID));
  Assert.ok(!cal.manager.getCalendarById(calendarJ1.id));
  const loginGUIDs = Array.from(
    await Services.logins.getAllLogins(),
    l => l.guid
  );
  Assert.ok(!loginGUIDs.includes(loginJ1.guid));
  Assert.ok(loginGUIDs.includes(loginJ2.guid));
  Assert.ok(loginGUIDs.includes(loginJ3.guid));
});

add_task(async function testRemoveCindy() {
  const win = await promiseRemoveDialog(accountC1);
  const doc = win.document;
  const outgoingsCheckbox = doc.getElementById("removeOutgoings");
  const addressBooksCheckbox = doc.getElementById("removeAddressBooks");
  const calendarsCheckbox = doc.getElementById("removeCalendars");
  const loginsCheckbox = doc.getElementById("removeLogins");
  const acceptButton = doc.querySelector("dialog").getButton("accept");

  Assert.ok(BrowserTestUtils.isVisible(outgoingsCheckbox));
  Assert.ok(BrowserTestUtils.isHidden(addressBooksCheckbox));
  Assert.ok(BrowserTestUtils.isHidden(calendarsCheckbox));
  Assert.ok(BrowserTestUtils.isVisible(loginsCheckbox));
  checkLoginsCheckbox(loginsCheckbox, "passwords", 1);

  EventUtils.synthesizeMouseAtCenter(outgoingsCheckbox, {}, win);
  checkLoginsCheckbox(loginsCheckbox, "passwords", 0);

  EventUtils.synthesizeMouseAtCenter(acceptButton, {}, win);
  Assert.ok(acceptButton.disabled);
  await TestUtils.waitForCondition(() => !acceptButton.disabled);
  EventUtils.synthesizeMouseAtCenter(acceptButton, {}, win);

  Assert.ok(!MailServices.accounts.getAccount(accountC1.key));
  Assert.ok(MailServices.outgoingServer.getServerByKey(outgoingC1.key));
  const loginGUIDs = Array.from(
    await Services.logins.getAllLogins(),
    l => l.guid
  );
  Assert.ok(loginGUIDs.includes(loginC1.guid));
});

add_task(async function testRemoveGreg() {
  const win = await promiseRemoveDialog(accountG1);
  const doc = win.document;
  const outgoingsCheckbox = doc.getElementById("removeOutgoings");
  const addressBooksCheckbox = doc.getElementById("removeAddressBooks");
  const calendarsCheckbox = doc.getElementById("removeCalendars");
  const loginsCheckbox = doc.getElementById("removeLogins");
  const acceptButton = doc.querySelector("dialog").getButton("accept");

  Assert.ok(BrowserTestUtils.isVisible(outgoingsCheckbox));
  Assert.ok(BrowserTestUtils.isVisible(addressBooksCheckbox));
  Assert.ok(BrowserTestUtils.isVisible(calendarsCheckbox));
  Assert.ok(BrowserTestUtils.isVisible(loginsCheckbox));
  checkLoginsCheckbox(loginsCheckbox, "oauth-tokens", 1);

  EventUtils.synthesizeMouseAtCenter(outgoingsCheckbox, {}, win);
  checkLoginsCheckbox(loginsCheckbox, "oauth-tokens", 0);

  EventUtils.synthesizeMouseAtCenter(outgoingsCheckbox, {}, win);
  checkLoginsCheckbox(loginsCheckbox, "oauth-tokens", 1);
  EventUtils.synthesizeMouseAtCenter(calendarsCheckbox, {}, win);
  checkLoginsCheckbox(loginsCheckbox, "oauth-tokens", 0);

  EventUtils.synthesizeMouseAtCenter(acceptButton, {}, win);
  Assert.ok(acceptButton.disabled);
  await TestUtils.waitForCondition(() => !acceptButton.disabled);
  EventUtils.synthesizeMouseAtCenter(acceptButton, {}, win);

  Assert.ok(!MailServices.accounts.getAccount(accountG1.key));
  Assert.ok(!MailServices.outgoingServer.getServerByKey(smtpG1.key));
  Assert.ok(!MailServices.ab.getDirectoryFromUID(bookG1.UID));
  Assert.ok(cal.manager.getCalendarById(calendarG1.id));
  const loginGUIDs = Array.from(
    await Services.logins.getAllLogins(),
    l => l.guid
  );
  Assert.ok(loginGUIDs.includes(loginG1.guid));
});

add_task(async function testRemoveBobby() {
  const win = await promiseRemoveDialog(accountB1);
  const doc = win.document;
  const outgoingsCheckbox = doc.getElementById("removeOutgoings");
  const addressBooksCheckbox = doc.getElementById("removeAddressBooks");
  const calendarsCheckbox = doc.getElementById("removeCalendars");
  const loginsCheckbox = doc.getElementById("removeLogins");
  const acceptButton = doc.querySelector("dialog").getButton("accept");

  Assert.ok(BrowserTestUtils.isVisible(outgoingsCheckbox));
  Assert.ok(!BrowserTestUtils.isVisible(addressBooksCheckbox));
  Assert.ok(!BrowserTestUtils.isVisible(calendarsCheckbox));
  Assert.ok(BrowserTestUtils.isVisible(loginsCheckbox));
  checkLoginsCheckbox(loginsCheckbox, "oauth-tokens", 1);

  EventUtils.synthesizeMouseAtCenter(acceptButton, {}, win);
  Assert.ok(acceptButton.disabled);
  await TestUtils.waitForCondition(() => !acceptButton.disabled);
  EventUtils.synthesizeMouseAtCenter(acceptButton, {}, win);

  Assert.ok(!MailServices.accounts.getAccount(accountB1.key));
  Assert.ok(!MailServices.outgoingServer.getServerByKey(outgoingB1.key));
  const loginGUIDs = Array.from(
    await Services.logins.getAllLogins(),
    l => l.guid
  );
  Assert.ok(!loginGUIDs.includes(loginB1.guid));
});

async function promiseRemoveDialog(account) {
  const accountRow = get_account_tree_row(account.key, null, tab);
  await click_account_tree_row(tab, accountRow);

  const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/removeAccount.xhtml",
    { isSubDialog: true }
  );
  const frameWin =
    tab.browser.contentDocument.getElementById("contentFrame").contentWindow;
  EventUtils.synthesizeMouseAtCenter(
    frameWin.document.getElementById("deleteAccount"),
    {},
    frameWin
  );
  const win = await dialogPromise;
  await BrowserTestUtils.waitForEvent(win, "relatedItemsLoaded");
  await new Promise(resolve => win.requestAnimationFrame(resolve));
  return win;
}

function checkLoginsCheckbox(loginsCheckbox, expectedType, expectedCount) {
  if (expectedCount == 0) {
    Assert.ok(loginsCheckbox.disabled, "logins checkbox should be disabled");
    Assert.deepEqual(
      document.l10n.getAttributes(loginsCheckbox),
      {
        id: `remove-${expectedType}-checkbox`,
        args: { count: 1 },
      },
      "logins checkbox string should be singular"
    );
  } else {
    Assert.ok(!loginsCheckbox.disabled, "logins checkbox shoudl be enabled");
    Assert.deepEqual(
      document.l10n.getAttributes(loginsCheckbox),
      {
        id: `remove-${expectedType}-checkbox`,
        args: { count: expectedCount },
      },
      "logins checkbox string should match the expected count"
    );
  }
}
