/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Simple demonstration of the imap pump test method.
 */

// async support
/* import-globals-from ../../../test/resources/logHelper.js */
load("../../../resources/logHelper.js");
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

// IMAP pump
var { IMAPPump, setupIMAPPump, teardownIMAPPump } = ChromeUtils.import(
  "resource://testing-common/mailnews/IMAPpump.jsm"
);
var { ImapMessage } = ChromeUtils.import(
  "resource://testing-common/mailnews/Imapd.jsm"
);
var { nsMailServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Maild.sys.mjs"
);

// Messages to load must have CRLF line endings, that is Windows style
var gMessage = "bugmail10"; // message file used as the test message

// Definition of tests

// load and update a message in the imap fake server

var gTestArray = [
  // initial setup of IMAP environment
  setupIMAPPump,

  // optionally set server parameters, here enabling debug messages
  function serverParms() {
    IMAPPump.server.setDebugLevel(nsMailServer.debugAll);
  },

  // the main test
  async function loadImapMessage() {
    IMAPPump.mailbox.addMessage(
      new ImapMessage(specForFileName(gMessage), IMAPPump.mailbox.uidnext++, [])
    );
    const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
    await promiseUrlListener.promise;

    Assert.equal(1, IMAPPump.inbox.getTotalMessages(false));
    const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
    Assert.ok(msgHdr instanceof Ci.nsIMsgDBHdr);
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
