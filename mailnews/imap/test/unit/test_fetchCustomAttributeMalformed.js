/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that fetchCustomMsgAttribute handles a FETCH response where the
 * custom attribute has no value before the end of the line.
 */

var gMsgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);

add_setup(async function () {
  setupIMAPPump("CUSTOM1");
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
  const file = do_get_file("../../../data/bugmail10");
  const message = new ImapMessage(
    Services.io.newFileURI(file).spec,
    IMAPPump.mailbox.uidnext++,
    []
  );
  // Ends the FETCH line right after the attribute name.
  message.xCustomValue = "\r\n";
  IMAPPump.mailbox.addMessage(message);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function testFetchMissingCustomValue() {
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  const uri = IMAPPump.inbox.fetchCustomMsgAttribute(
    "X-CUSTOM-VALUE",
    msgHdr.messageKey,
    gMsgWindow
  );
  uri.QueryInterface(Ci.nsIMsgMailNewsUrl);
  const listener = new PromiseTestUtils.PromiseUrlListener({
    OnStopRunningUrl(url) {
      url.QueryInterface(Ci.nsIImapUrl);
      Assert.equal(
        url.customAttributeResult,
        "",
        "customAttributeResult should be empty for a missing value"
      );
    },
  });
  uri.RegisterListener(listener);
  await listener.promise.catch(() => {});
});

add_task(function endTest() {
  teardownIMAPPump();
});
