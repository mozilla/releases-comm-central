/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to account.
 */

const { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);

const { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { MailTelemetryForTests } = ChromeUtils.importESModule(
  "resource:///modules/MailGlue.sys.mjs"
);

const { add_message_to_folder, msgGen, get_special_folder, create_folder } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );

/**
 * Check that we are counting account types.
 */
add_task(async function test_account_types() {
  // Collect all added accounts to be cleaned up at the end.
  const addedAccounts = [];

  Services.fog.testResetFOG();

  const NUM_IMAP = 3;
  const NUM_RSS = 1;
  const NUM_IRC = 1;

  // Add incoming servers.
  const imapServer = MailServices.accounts
    .createIncomingServer("nobody", "foo.invalid", "imap")
    .QueryInterface(Ci.nsIImapIncomingServer);
  const imAccount = IMServices.accounts.createAccount(
    "telemetry-irc-user",
    "prpl-irc"
  );
  imAccount.autoLogin = false;
  const ircServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "foo.invalid",
    "im"
  );
  ircServer.wrappedJSObject.imAccount = imAccount;

  // Add accounts and assign incoming servers.
  for (let i = 0; i < NUM_IMAP; i++) {
    const identity = MailServices.accounts.createIdentity();
    identity.email = "tinderbox@foo.invalid";
    const account = MailServices.accounts.createAccount();
    account.incomingServer = imapServer;
    account.addIdentity(identity);
    addedAccounts.push(account);
  }
  for (let i = 0; i < NUM_RSS; i++) {
    const account = FeedUtils.createRssAccount("rss");
    addedAccounts.push(account);
  }
  for (let i = 0; i < NUM_IRC; i++) {
    const account = MailServices.accounts.createAccount();
    account.incomingServer = ircServer;
    addedAccounts.push(account);
  }

  registerCleanupFunction(() => {
    for (const account of addedAccounts) {
      MailServices.accounts.removeAccount(account);
    }
  });

  MailTelemetryForTests.reportAccountTypes();

  // Check if we count account types correctly.
  const imapValue = Glean.mail.accountCount.imap.testGetValue();
  Assert.equal(imapValue, NUM_IMAP, "IMAP account number must be correct");
  const rssValue = Glean.mail.accountCount.rss.testGetValue();
  Assert.equal(rssValue, NUM_RSS, "RSS account number must be correct");
  const ircValue = Glean.mail.accountCount.im_irc.testGetValue();
  Assert.equal(ircValue, NUM_IRC, "IRC account number must be correct");
  const noneValue = Glean.mail.accountCount.none.testGetValue();
  Assert.equal(noneValue, undefined, "Should not report Local Folders account");
});

/**
 * Check that we are counting account sizes.
 */
add_task(async function test_account_sizes() {
  Services.fog.testResetFOG();

  const NUM_INBOX = 3;
  const NUM_OTHER = 2;

  const inbox = await get_special_folder(
    Ci.nsMsgFolderFlags.Inbox,
    true,
    null,
    false
  );
  const other = await create_folder("TestAccountSize");

  let expectInboxSize = 0;
  for (let i = 0; i < NUM_INBOX; i++) {
    const synMsg = msgGen.makeMessage({ body: { body: `test inbox ${i}` } });
    expectInboxSize += synMsg.toMessageString().length;
    await add_message_to_folder([inbox], synMsg);
  }
  let expectOtherSize = 0;
  for (let i = 0; i < NUM_OTHER; i++) {
    const synMsg = msgGen.makeMessage({ body: { body: `test other ${i}` } });
    expectOtherSize += synMsg.toMessageString().length;
    await add_message_to_folder([other], synMsg);
  }

  MailTelemetryForTests.reportAccountSizes();
  // Check if we count total messages correctly.
  Assert.equal(
    Glean.mail.folderTotalMessages.Inbox.testGetValue(),
    NUM_INBOX,
    "Number of messages in Inbox must be correct"
  );
  Assert.equal(
    Glean.mail.folderTotalMessages.Other.testGetValue(),
    NUM_OTHER,
    "Number of messages in other folders must be correct"
  );
  Assert.equal(
    Glean.mail.folderTotalMessages.Total.testGetValue(),
    NUM_INBOX + NUM_OTHER,
    "Number of messages in all folders must be correct"
  );

  // Rough stab at per-message mbox size overhead.
  const fromOverhead = "From MAILER-DAEMON Fri Jul  8 12:08:34 2011".length;

  // Check if we count size on disk correctly.
  const gotInboxSize = Number(Glean.mail.folderSizeOnDisk.Inbox.testGetValue());
  Assert.greaterOrEqual(
    gotInboxSize,
    expectInboxSize,
    "Inbox size >= minimum expected"
  );
  const expectInboxSizeUpper = expectInboxSize + fromOverhead * NUM_INBOX;
  Assert.less(
    gotInboxSize,
    expectInboxSizeUpper,
    "Inbox size < maximum expected"
  );

  const gotOtherSize = Number(Glean.mail.folderSizeOnDisk.Other.testGetValue());
  Assert.greaterOrEqual(
    gotOtherSize,
    expectOtherSize,
    "Other size >= minimum expected"
  );
  const expectOtherSizeUpper = expectOtherSize + fromOverhead * NUM_OTHER;
  Assert.less(
    gotOtherSize,
    expectOtherSizeUpper,
    "Other size < maximum expected"
  );

  const expectTotal = expectInboxSize + expectOtherSize;
  const expectTotalUpper = expectInboxSizeUpper + expectOtherSizeUpper;
  const gotTotal = Number(Glean.mail.folderSizeOnDisk.Total.testGetValue());
  Assert.greaterOrEqual(
    gotTotal,
    expectTotal,
    "Total size >= minimum expected"
  );
  Assert.less(gotTotal, expectTotalUpper, "Total size < maximum expected");
});

/**
 * Verify counting of OAuth2 providers
 */
add_task(async function test_account_oauth_providers() {
  // Collect all added accounts to be cleaned up at the end
  const addedAccounts = [];

  Services.fog.testResetFOG();

  const EXPECTED_GOOGLE_COUNT = 2;
  const EXPECTED_MICROSOFT_COUNT = 1;
  const EXPECTED_AOL_COUNT = 1;
  const EXPECTED_YAHOO_COUNT = 1;

  const hostnames = [
    "imap.googlemail.com",
    "imap.gmail.com",
    "imap.mail.ru",
    "imap.yandex.com",
    "imap.mail.yahoo.com",
    "imap.aol.com",
    "outlook.office365.com",
    "something.totally.unexpected",
  ];

  function createIncomingImapServer(username, hostname, authMethod) {
    const incoming = MailServices.accounts.createIncomingServer(
      username,
      hostname,
      "imap"
    );

    incoming.authMethod = authMethod;

    const account = MailServices.accounts.createAccount();
    account.incomingServer = incoming;

    const identity = MailServices.accounts.createIdentity();
    account.addIdentity(identity);

    addedAccounts.push(account);
  }

  // Add incoming servers
  let i = 0;
  const otherAuthMethods = [
    Ci.nsMsgAuthMethod.none,
    Ci.nsMsgAuthMethod.passwordCleartext,
    Ci.nsMsgAuthMethod.passwordEncrypted,
    Ci.nsMsgAuthMethod.secure,
  ];

  for (const hostname of hostnames) {
    // Create one with OAuth2
    createIncomingImapServer("nobody", hostname, Ci.nsMsgAuthMethod.OAuth2);

    // Create one with an arbitrary method from our list
    createIncomingImapServer("somebody_else", hostname, otherAuthMethods[i]);
    i = i + (1 % otherAuthMethods.length);
  }

  registerCleanupFunction(() => {
    for (const account of addedAccounts) {
      MailServices.accounts.removeAccount(account);
    }
  });

  MailTelemetryForTests.reportAccountTypes();

  // Check if we count account types correctly.
  Assert.equal(
    Glean.mail.oauth2ProviderCount["accounts.google.com"].testGetValue(),
    EXPECTED_GOOGLE_COUNT,
    "should have expected number of Google accounts"
  );
  Assert.equal(
    Glean.mail.oauth2ProviderCount["login.microsoftonline.com"].testGetValue(),
    EXPECTED_MICROSOFT_COUNT,
    "should have expected number of Microsoft accounts"
  );
  Assert.equal(
    Glean.mail.oauth2ProviderCount["login.aol.com"].testGetValue(),
    EXPECTED_AOL_COUNT,
    "should have expected number of AOL accounts"
  );
  Assert.equal(
    Glean.mail.oauth2ProviderCount["login.yahoo.com"].testGetValue(),
    EXPECTED_YAHOO_COUNT,
    "should have expected number of Yahoo accounts"
  );
});
