/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Simple demonstration of the imap pump test method.
 */

// async support
/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/logHelper.js");
load("../../../resources/alertTestUtils.js");
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

// IMAP pump
var { IMAPPump, setupIMAPPump, teardownIMAPPump } = ChromeUtils.import(
  "resource://testing-common/mailnews/IMAPpump.jsm"
);
var { imapMessage } = ChromeUtils.import(
  "resource://testing-common/mailnews/Imapd.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { fsDebugAll } = ChromeUtils.import(
  "resource://testing-common/mailnews/Maild.jsm"
);

// Globals

// Messages to load must have CRLF line endings, that is Windows style
var gMessage = "bugmail10"; // message file used as the test message

// Definition of tests

// load and update a message in the imap fake server

var gTestArray = [
  // initial setup of IMAP environment
  setupIMAPPump,

  // optionally set server parameters, here enabling debug messages
  function serverParms() {
    IMAPPump.server.setDebugLevel(fsDebugAll);
  },

  // the main test
  async function loadImapMessage() {
    IMAPPump.mailbox.addMessage(
      new imapMessage(specForFileName(gMessage), IMAPPump.mailbox.uidnext++, [])
    );
    let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    IMAPPump.inbox.updateFolderWithListener(
      gDummyMsgWindow,
      promiseUrlListener
    );
    await promiseUrlListener.promise;

    Assert.equal(1, IMAPPump.inbox.getTotalMessages(false));
    let msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
    Assert.ok(msgHdr instanceof Ci.nsIMsgDBHdr);
  },

  // all done
  teardownIMAPPump,
];

function run_test() {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  gTestArray.forEach(x => add_task(x));
  run_next_test();
}

/*
 * helper functions
 */

// given a test file, return the file uri spec
function specForFileName(aFileName) {
  let file = do_get_file(gDEPTH + "mailnews/data/" + aFileName);
  let msgfileuri = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  return msgfileuri.spec;
}
