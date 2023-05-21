/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test to ensure that imap fetchCustomMsgAttribute function works properly
 */

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

// IMAP pump

// Globals

// Messages to load must have CRLF line endings, that is Windows style
var gMessage = "bugmail10"; // message file used as the test message

var gCustomValue = "Custom";
var gCustomList = ["Custom1", "Custom2", "Custom3"];

var gMsgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);

add_setup(async function () {
  setupIMAPPump("CUSTOM1");
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
  // Load and update a message in the imap fake server.
  let message = new ImapMessage(
    specForFileName(gMessage),
    IMAPPump.mailbox.uidnext++,
    []
  );
  message.xCustomValue = gCustomValue;
  message.xCustomList = gCustomList;
  IMAPPump.mailbox.addMessage(message);
  let listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

// Used to verify that nsIServerResponseParser.msg_fetch() can handle
// not in a parenthesis group - Bug 750012
add_task(async function testFetchCustomValue() {
  let msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  let uri = IMAPPump.inbox.fetchCustomMsgAttribute(
    "X-CUSTOM-VALUE",
    msgHdr.messageKey,
    gMsgWindow
  );
  uri.QueryInterface(Ci.nsIMsgMailNewsUrl);
  // Listens for response from fetchCustomMsgAttribute request for X-CUSTOM-VALUE.
  let fetchCustomValueListener = new PromiseTestUtils.PromiseUrlListener({
    OnStopRunningUrl(aUrl, aExitCode) {
      aUrl.QueryInterface(Ci.nsIImapUrl);
      Assert.equal(aUrl.customAttributeResult, gCustomValue);
    },
  });
  uri.RegisterListener(fetchCustomValueListener);
  await fetchCustomValueListener.promise;
});

// Used to verify that nsIServerResponseParser.msg_fetch() can handle a parenthesis group - Bug 735542
add_task(async function testFetchCustomList() {
  let msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  let uri = IMAPPump.inbox.fetchCustomMsgAttribute(
    "X-CUSTOM-LIST",
    msgHdr.messageKey,
    gMsgWindow
  );
  uri.QueryInterface(Ci.nsIMsgMailNewsUrl);
  // Listens for response from fetchCustomMsgAttribute request for X-CUSTOM-VALUE.
  let fetchCustomListListener = new PromiseTestUtils.PromiseUrlListener({
    OnStopRunningUrl(aUrl, aExitCode) {
      aUrl.QueryInterface(Ci.nsIImapUrl);
      Assert.equal(
        aUrl.customAttributeResult,
        "(" + gCustomList.join(" ") + ")"
      );
    },
  });
  uri.RegisterListener(fetchCustomListListener);
  await fetchCustomListListener.promise;
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
  let file = do_get_file("../../../data/" + aFileName);
  let msgfileuri = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  return msgfileuri.spec;
}
