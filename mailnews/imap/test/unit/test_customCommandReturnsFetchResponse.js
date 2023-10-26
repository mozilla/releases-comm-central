/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test to ensure that imap customCommandResult function works properly
 * Bug 778246
 */

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

// IMAP pump

// Globals

// Messages to load must have CRLF line endings, that is Windows style
var gMessageFileName = "bugmail10"; // message file used as the test message
var gMessage, gExpectedLength;

var gCustomList = ["Custom1", "Custom2", "Custom3"];

var gMsgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);

setupIMAPPump("CUSTOM1");

add_setup(async function () {
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
  // Load and update a message in the imap fake server.

  gMessage = new ImapMessage(
    specForFileName(gMessageFileName),
    IMAPPump.mailbox.uidnext++,
    []
  );
  gMessage.xCustomList = [];
  IMAPPump.mailbox.addMessage(gMessage);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function testStoreCustomList() {
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  gExpectedLength = gCustomList.length;
  const uri = IMAPPump.inbox.issueCommandOnMsgs(
    "STORE",
    msgHdr.messageKey + " X-CUSTOM-LIST (" + gCustomList.join(" ") + ")",
    gMsgWindow
  );
  uri.QueryInterface(Ci.nsIMsgMailNewsUrl);
  // Listens for response from customCommandResult request for X-CUSTOM-LIST.
  const storeCustomListSetListener = new PromiseTestUtils.PromiseUrlListener({
    OnStopRunningUrl(aUrl, aExitCode) {
      aUrl.QueryInterface(Ci.nsIImapUrl);
      Assert.equal(
        aUrl.customCommandResult,
        "(" + gMessage.xCustomList.join(" ") + ")"
      );
      Assert.equal(gMessage.xCustomList.length, gExpectedLength);
    },
  });
  uri.RegisterListener(storeCustomListSetListener);
  await storeCustomListSetListener.promise;
});

add_task(async function testStoreMinusCustomList() {
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  gExpectedLength--;
  const uri = IMAPPump.inbox.issueCommandOnMsgs(
    "STORE",
    msgHdr.messageKey + " -X-CUSTOM-LIST (" + gCustomList[0] + ")",
    gMsgWindow
  );
  uri.QueryInterface(Ci.nsIMsgMailNewsUrl);
  // Listens for response from customCommandResult request for X-CUSTOM-LIST.
  const storeCustomListRemovedListener =
    new PromiseTestUtils.PromiseUrlListener({
      OnStopRunningUrl(aUrl, aExitCode) {
        aUrl.QueryInterface(Ci.nsIImapUrl);
        Assert.equal(
          aUrl.customCommandResult,
          "(" + gMessage.xCustomList.join(" ") + ")"
        );
        Assert.equal(gMessage.xCustomList.length, gExpectedLength);
      },
    });
  uri.RegisterListener(storeCustomListRemovedListener);
  await storeCustomListRemovedListener.promise;
});

add_task(async function testStorePlusCustomList() {
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  gExpectedLength++;
  const uri = IMAPPump.inbox.issueCommandOnMsgs(
    "STORE",
    msgHdr.messageKey + ' +X-CUSTOM-LIST ("Custom4")',
    gMsgWindow
  );
  uri.QueryInterface(Ci.nsIMsgMailNewsUrl);
  const storeCustomListAddedListener = new PromiseTestUtils.PromiseUrlListener({
    OnStopRunningUrl(aUrl, aExitCode) {
      aUrl.QueryInterface(Ci.nsIImapUrl);
      Assert.equal(
        aUrl.customCommandResult,
        "(" + gMessage.xCustomList.join(" ") + ")"
      );
      Assert.equal(gMessage.xCustomList.length, gExpectedLength);
    },
  });
  uri.RegisterListener(storeCustomListAddedListener);
  await storeCustomListAddedListener.promise;
});

// Cleanup at end
add_task(function endTest() {
  teardownIMAPPump();
});

/*
 * helper functions
 */

// given a test file, return the file uri spec
function specForFileName(aFileName) {
  const file = do_get_file("../../../data/" + aFileName);
  const msgfileuri = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  return msgfileuri.spec;
}
