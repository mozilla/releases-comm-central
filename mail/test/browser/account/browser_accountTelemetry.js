/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global reportAccountTypes */

/**
 * Test telemetry related to account.
 */

let { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
let { TelemetryTestUtils } = ChromeUtils.import(
  "resource://testing-common/TelemetryTestUtils.jsm"
);
let { FeedUtils } = ChromeUtils.import("resource:///modules/FeedUtils.jsm");

// Collect all added accounts to be cleaned up at the end.
let addedAccounts = [];

/**
 * Check that we are counting account types.
 */
add_task(async function test_account_types() {
  Services.telemetry.clearScalars();

  const NUM_IMAP = 3;
  const NUM_RSS = 1;
  const NUM_IRC = 1;

  // Add incoming servers.
  let imapServer = MailServices.accounts
    .createIncomingServer("nobody", "foo.invalid", "imap")
    .QueryInterface(Ci.nsIImapIncomingServer);
  let imAccount = Services.accounts.createAccount(
    "telemetry-irc-user",
    "prpl-irc"
  );
  imAccount.autoLogin = false;
  let ircServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "foo.invalid",
    "im"
  );
  ircServer.wrappedJSObject.imAccount = imAccount;

  // Add accounts and assign incoming servers.
  for (let i = 0; i < NUM_IMAP; i++) {
    let identity = MailServices.accounts.createIdentity();
    identity.email = "tinderbox@foo.invalid";
    let account = MailServices.accounts.createAccount();
    account.incomingServer = imapServer;
    account.addIdentity(identity);
    addedAccounts.push(account);
  }
  for (let i = 0; i < NUM_RSS; i++) {
    let account = FeedUtils.createRssAccount("rss");
    addedAccounts.push(account);
  }
  for (let i = 0; i < NUM_IRC; i++) {
    let account = MailServices.accounts.createAccount();
    account.incomingServer = ircServer;
    addedAccounts.push(account);
  }

  reportAccountTypes();
  let scalars = TelemetryTestUtils.getProcessScalars("parent", true);

  // Check if we count account types correctly.
  Assert.equal(
    scalars["tb.account.count"].imap,
    NUM_IMAP,
    "IMAP account number must be correct"
  );
  Assert.equal(
    scalars["tb.account.count"].rss,
    NUM_RSS,
    "RSS account number must be correct"
  );
  Assert.equal(
    scalars["tb.account.count"].im_irc,
    NUM_IRC,
    "IRC account number must be correct"
  );

  for (let account of addedAccounts) {
    MailServices.accounts.removeAccount(account);
  }
});
