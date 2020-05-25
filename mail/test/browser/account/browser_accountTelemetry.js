/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to account.
 */

let {
  plan_for_new_window,
  plan_for_window_close,
  wait_for_new_window,
  wait_for_window_close,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

let { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

let { TelemetryTestUtils } = ChromeUtils.import(
  "resource://testing-common/TelemetryTestUtils.jsm"
);

function open3PaneWindow() {
  plan_for_new_window("mail:3pane");
  Services.ww.openWindow(
    null,
    "chrome://messenger/content/messenger.xhtml",
    "",
    "all,chrome,dialog=no,status,toolbar",
    null
  );
  return wait_for_new_window("mail:3pane");
}

// Should be exactly the same as TB_ACCOUNT_TYPE labels in Histogram.json.
const ACCOUNT_TYPE_LABELS = [
  "pop3",
  "imap",
  "nntp",
  "exchange",
  "rss",
  "none",
  "im_facebook",
  "im_gtalk",
  "im_irc",
  "im_matrix",
  "im_odnoklassniki",
  "im_skype",
  "im_twitter",
  "im_xmpp",
  "im_yahoo",
];

/**
 * Check that we are counting account types.
 */
add_task(async function test_account_types() {
  let histogram = TelemetryTestUtils.getAndClearHistogram("TB_ACCOUNT_TYPE");

  const NUM_IMAP = 3;
  const NUM_RSS = 1;
  const NUM_IRC = 1;

  // Add incoming servers.
  let imapServer = MailServices.accounts
    .createIncomingServer("nobody", "foo.invalid", "imap")
    .QueryInterface(Ci.nsIImapIncomingServer);
  let rssServer = MailServices.accounts
    .createIncomingServer("nobody", "foo.invalid", "rss")
    .QueryInterface(Ci.nsIRssIncomingServer);
  let ircServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "foo.invalid",
    "im"
  );
  ircServer.wrappedJSObject.imAccount = {
    protocol: {
      name: "IRC",
    },
  };

  // Add accounts and assign incoming servers.
  for (let i = 0; i < NUM_IMAP; i++) {
    let identity = MailServices.accounts.createIdentity();
    identity.email = "tinderbox@foo.invalid";
    let account = MailServices.accounts.createAccount();
    account.incomingServer = imapServer;
    account.addIdentity(identity);
  }
  for (let i = 0; i < NUM_RSS; i++) {
    let account = MailServices.accounts.createAccount();
    account.incomingServer = rssServer;
  }
  for (let i = 0; i < NUM_IRC; i++) {
    let account = MailServices.accounts.createAccount();
    account.incomingServer = ircServer;
  }

  let wc = open3PaneWindow();
  let snapshot = histogram.snapshot();

  // Check if we count account types correctly.
  Assert.equal(
    snapshot.values[ACCOUNT_TYPE_LABELS.indexOf("imap")],
    NUM_IMAP,
    "IMAP account number must be correct"
  );
  Assert.equal(
    snapshot.values[ACCOUNT_TYPE_LABELS.indexOf("rss")],
    NUM_RSS,
    "RSS account number must be correct"
  );
  Assert.equal(
    snapshot.values[ACCOUNT_TYPE_LABELS.indexOf("im_irc")],
    NUM_IRC,
    "IRC account number must be correct"
  );

  plan_for_window_close(wc);
  wc.window.close();
  wait_for_window_close();
});
