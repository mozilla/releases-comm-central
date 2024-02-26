/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Test that listing subscribed mailboxes uses LIST (SUBSCRIBED) instead of LSUB
 * for servers that have LIST-EXTENDED capability
 */
/* References:
 * RFC 5258 - http://tools.ietf.org/html/rfc5258
 * Bug 495318
 * Bug 816028
 * http://bugzilla.zimbra.com/show_bug.cgi?id=78794
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

add_setup(async function () {
  // Zimbra is one of the servers that supports LIST-EXTENDED
  // it also has a bug that causes a server crash in certain setups
  setupIMAPPump("Zimbra");

  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );

  // Setup the mailboxes that will be used for this test.
  IMAPPump.mailbox.subscribed = true;
  IMAPPump.daemon.createMailbox("folder1", {
    subscribed: true,
    flags: ["\\Noselect"],
  });
  IMAPPump.daemon.createMailbox("folder1/folder11", {
    subscribed: true,
    flags: ["\\Noinferiors"],
  });
  IMAPPump.daemon.createMailbox("folder2", {
    subscribed: true,
    nonExistent: true,
  });
  IMAPPump.daemon.createMailbox("folder3", {});

  // select the inbox to force folder discovery, etc.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

// tests that LIST (SUBSCRIBED) returns the proper response
add_task(async function testListSubscribed() {
  // check that we have \Noselect and \Noinferiors flags - these would not have
  // been returned if we had used LSUB instead of LIST(SUBSCRIBED)
  const rootFolder = IMAPPump.incomingServer.rootFolder;
  const folder1 = rootFolder.getChildNamed("folder1");
  Assert.ok(folder1.getFlag(Ci.nsMsgFolderFlags.ImapNoselect));
  Assert.ok(!folder1.getFlag(Ci.nsMsgFolderFlags.ImapNoinferiors));

  // make sure the above test was not a fluke
  const folder11 = folder1.getChildNamed("folder11");
  Assert.ok(!folder11.getFlag(Ci.nsMsgFolderFlags.ImapNoselect));
  Assert.ok(folder11.getFlag(Ci.nsMsgFolderFlags.ImapNoinferiors));

  // test that \NonExistent implies \Noselect
  rootFolder.getChildNamed("folder2");
  Assert.ok(folder1.getFlag(Ci.nsMsgFolderFlags.ImapNoselect));

  // should not get a folder3 since it is not subscribed
  let folder3;
  try {
    folder3 = rootFolder.getChildNamed("folder3");
  } catch (ex) {}
  // do_check_false(folder1.getFlag(Ci.nsMsgFolderFlags.Subscribed));
  Assert.equal(null, folder3);
});

add_task(async function testZimbraServerVersions() {
  if (Services.prefs.getBoolPref("mailnews.imap.jsmodule", false)) {
    return;
  }

  // older versions of Zimbra can crash if we send LIST (SUBSCRIBED) so we want
  // to make sure that we are checking for versions

  const testValues = [
    { version: "6.3.1_GA_2790", expectedResult: false },
    { version: "7.2.2_GA_2790", expectedResult: false },
    { version: "7.2.3_GA_2790", expectedResult: true },
    { version: "8.0.2_GA_2790", expectedResult: false },
    { version: "8.0.3_GA_2790", expectedResult: true },
    { version: "9.0.0_GA_2790", expectedResult: true },
  ];

  for (let i = 0; i < testValues.length; i++) {
    IMAPPump.daemon.idResponse =
      '("NAME" "Zimbra" ' +
      '"VERSION" "' +
      testValues[i].version +
      '" ' +
      '"RELEASE" "20120815212257" ' +
      '"USER" "user@domain.com" ' +
      '"SERVER" "14b63305-d002-4f1b-bcd9-23d402d4ef40")';
    IMAPPump.incomingServer.closeCachedConnections();
    IMAPPump.incomingServer.performExpand(null);
    // select inbox is just to wait on performExpand since performExpand does not have listener
    const listener = new PromiseTestUtils.PromiseUrlListener();
    IMAPPump.inbox.updateFolderWithListener(null, listener);
    await listener.promise;
    // if we send LSUB instead of LIST(SUBSCRIBED), then we should not have \NoSelect flag
    const rootFolder = IMAPPump.incomingServer.rootFolder;
    const folder1 = rootFolder.getChildNamed("folder1");
    Assert.equal(
      folder1.getFlag(Ci.nsMsgFolderFlags.ImapNoselect),
      testValues[i].expectedResult
    );
  }
});

// Cleanup at end
add_task(function endTest() {
  teardownIMAPPump();
});
