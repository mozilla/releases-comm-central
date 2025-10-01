/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that multiple messages can be copied while not stored locally,
 * targeting the maildir issues of bug 856519.
 */

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/logHelper.js");
load("../../../resources/alertTestUtils.js");

var gMessages = ["bugmail10", "draft1"]; // message files used as a tests

// Definition of tests

var gTestArray = [
  // initial setup of IMAP environment
  setupIMAPPump,

  // optionally set server parameters, here enabling debug messages
  function serverParms() {
    IMAPPump.server.setDebugLevel(nsMailServer.debugAll);
  },

  // local setup
  function localSetup() {
    // don't download offline inbox
    IMAPPump.inbox.clearFlag(Ci.nsMsgFolderFlags.Offline);
  },

  async function loadImapMessages() {
    for (const fileName of gMessages) {
      IMAPPump.mailbox.addMessage(
        new ImapMessage(
          specForFileName(fileName),
          IMAPPump.mailbox.uidnext++,
          []
        )
      );
    }
    const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    IMAPPump.inbox.updateFolderWithListener(
      gDummyMsgWindow,
      promiseUrlListener
    );
    await promiseUrlListener.promise;

    Assert.equal(2, IMAPPump.inbox.getTotalMessages(false));
    const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
    Assert.ok(msgHdr instanceof Ci.nsIMsgDBHdr);
  },

  async function copyMessagesToLocal() {
    const messages = [];
    const enumerator = IMAPPump.inbox.msgDatabase.enumerateMessages();
    while (enumerator.hasMoreElements()) {
      messages.push(enumerator.getNext());
    }
    const listener = new PromiseTestUtils.PromiseCopyListener();
    MailServices.copy.copyMessages(
      IMAPPump.inbox,
      messages,
      localAccountUtils.inboxFolder,
      false,
      listener,
      null,
      false
    );
    await listener.promise;
  },

  function testCopiedMessagesExist() {
    Assert.equal(localAccountUtils.inboxFolder.getTotalMessages(false), 2);
    const enumerator =
      localAccountUtils.inboxFolder.msgDatabase.enumerateMessages();
    let dbCount = 0;
    while (enumerator.hasMoreElements()) {
      dbCount++;
      const hdr = enumerator.getNext().QueryInterface(Ci.nsIMsgDBHdr);
      Assert.greater(hdr.storeToken.length, 0);
      // the following throws NS_ERROR_FILE_NOT_FOUND in maildir in bug 856519
      const stream = localAccountUtils.inboxFolder.getMsgInputStream(hdr, {});
      Assert.ok(stream instanceof Ci.nsIInputStream);
    }
    Assert.equal(dbCount, 2);
  },

  // all done
  teardownIMAPPump,
];

add_setup(() => {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  gTestArray.forEach(x => add_task(x));
});

/*
 * helper functions
 */

// given a test file, return the file uri spec
function specForFileName(aFileName) {
  const file = do_get_file(gDEPTH + "mailnews/data/" + aFileName);
  const msgfileuri = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  return msgfileuri.spec;
}
