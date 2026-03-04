/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// This test tests basic notifications for incoming messages.  The EWS behavior
// differs from other protocols in that notifications are generated for messages
// that would otherwise be filtered.  See
// comm/mail/test/browser/notification/browser_collection.js and
// https://bugzilla.mozilla.org/show_bug.cgi?id=1985881 for more details.

const { MockAlertsService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockAlertsService.sys.mjs"
);

var { SyntheticPartLeaf, MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var { EwsServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);

var { RemoteFolder } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockServer.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var ewsServer;
var incomingServer;

const generator = new MessageGenerator();

add_setup(async function () {
  ewsServer = new EwsServer();
  ewsServer.start();
  incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "127.0.0.1",
    "ews"
  );
  incomingServer.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );
  incomingServer.prettyName = "EWS Account";
  incomingServer.password = "password";

  const ewsAccount = MailServices.accounts.createAccount();
  ewsAccount.addIdentity(MailServices.accounts.createIdentity());
  ewsAccount.incomingServer = incomingServer;

  MockAlertsService.init();

  registerCleanupFunction(() => {
    ewsServer.stop();
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeAccount(ewsAccount, false);
    Services.logins.removeAllLogins();
    MockAlertsService.cleanup();
  });
});

async function addMessage(folderId, messageDef) {
  const message = generator.makeMessage(messageDef);
  await ewsServer.addMessages(folderId, [message]);
}

add_task(async function test_basic_notifications() {
  // Get the inbox.
  incomingServer.performExpand(null);
  const inbox = await TestUtils.waitForCondition(
    () =>
      incomingServer.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox),
    "waiting for inbox to exist"
  );
  Assert.equal(
    inbox.getNumUnread(false),
    0,
    "inbox should have 0 unread messages at the start"
  );

  const message1Body =
    "twas brillig and the slithy toves did gyre and gimbal in the wabe";
  await addMessage("inbox", {
    from: ["friend", "friend@test.invalid"],
    bodyPart: new SyntheticPartLeaf(message1Body),
  });
  incomingServer.performBiff(window.msgWindow);
  await promiseAlert("friend", "INBOX#", message1Body);

  // Add a bunch of messages.
  const bodies = [
    "All mimsy were the borogroves and the mome raths outgrabe",
    "Beware the jabberwock my son",
    "The jaws that bite, the claws that catch",
    "Beware the jub jub bird.",
    "And shun the frumious bandersnatch",
  ];
  for (let i = 0; i < 20; i++) {
    await addMessage("inbox", {
      from: [`friend${i}`, `friend${i}@test.invalid`],
      bodyPart: new SyntheticPartLeaf(bodies[i % 5]),
    });
  }

  incomingServer.performBiff(window.msgWindow);
  // The notificaiton we get should be about the first message.
  await promiseAlert("friend0", "INBOX#", bodies[0]);
});

/**
 * Waits for a call to the alerts service, and tests it is as expected.
 *
 * @param {string} expectedSender - The name of the expected message's author.
 * @param {string} expectedCookie - Part of the expected message's URI, to
 *   check it is the right message.
 */
async function promiseAlert(expectedSender, expectedCookie, expectedPreview) {
  const alert = await TestUtils.waitForCondition(
    () => MockAlertsService.alert,
    `waiting for a notification about inbox`
  );
  Assert.stringContains(
    alert.text,
    `from "${expectedSender}"`,
    `notification should be about a message from ${expectedSender}`
  );
  Assert.stringContains(
    alert.cookie.toLowerCase(),
    expectedCookie.toLowerCase(),
    `notification should be about ${expectedCookie}`
  );

  // The ews server truncates the preview text to the first 256 characters of
  // the body part, but the notification itself truncates even further. Take
  // only the first 10 characters to be safe.
  Assert.stringContains(
    alert.text,
    expectedPreview.substring(0, 10),
    "notification should contain a body preview"
  );

  MockAlertsService.listener.observe(null, "alertfinished", alert.cookie);
  MockAlertsService.reset();
}
