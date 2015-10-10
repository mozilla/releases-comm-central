/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Simple demonstration of the imap pump test method.
 */

// async support 
load("../../../resources/logHelper.js");
load("../../../resources/alertTestUtils.js");
Components.utils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

// IMAP pump
Components.utils.import("resource://testing-common/mailnews/IMAPpump.js");
Components.utils.import("resource://testing-common/mailnews/imapd.js");

Components.utils.import("resource://gre/modules/Services.jsm");

// Globals

// Messages to load must have CRLF line endings, that is Windows style
var gMessage = "bugmail10"; // message file used as the test message

// Definition of tests

// load and update a message in the imap fake server

var gTestArray = 
[
  // initial setup of IMAP environment
  setupIMAPPump,

  // optionally set server parameters, here enabling debug messages
  function serverParms() {
    if (typeof fsDebugAll == "undefined")
      Components.utils.import("resource://testing-common/mailnews/maild.js");
    IMAPPump.server.setDebugLevel(fsDebugAll);
  },

  // the main test
  function* loadImapMessage()
  {
    IMAPPump.mailbox.addMessage(
      new imapMessage(specForFileName(gMessage),
                      IMAPPump.mailbox.uidnext++, []));
    let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
    IMAPPump.inbox.updateFolderWithListener(gDummyMsgWindow, promiseUrlListener);
    yield promiseUrlListener.promise;

    Assert.equal(1, IMAPPump.inbox.getTotalMessages(false));
    let msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
    Assert.ok(msgHdr instanceof Ci.nsIMsgDBHdr);
  },

  // all done
  teardownIMAPPump,
];

function run_test() {
  Services.prefs.setBoolPref("mail.server.default.autosync_offline_stores", false);
  gTestArray.forEach(add_task);
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
