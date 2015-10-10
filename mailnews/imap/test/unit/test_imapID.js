/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test to ensure that we handle the RFC2197 ID command.
 */

load("../../../resources/logHelper.js");

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

var kIDResponse = "(\"name\" \"GImap\" \"vendor\" \"Google, Inc.\" \"support-url\" \"http://mail.google.com/support\")";

add_task(function* setup() {
  setupIMAPPump("GMail");
  IMAPPump.daemon.idResponse = kIDResponse;

  // update folder to kick start tests.
  let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  yield promiseUrlListener.promise;
});

add_task(function* updateInbox() {
  let rootFolder = IMAPPump.incomingServer.rootFolder;
  let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  yield promiseUrlListener.promise;
});

add_task(function checkIDHandling() {
  do_check_eq(IMAPPump.daemon.clientID, "(\"name\" \"xpcshell\" \"version\" \"1\")");
  do_check_eq(IMAPPump.incomingServer.serverIDPref, kIDResponse);
});

add_task(teardownIMAPPump);

function run_test() {
  run_next_test();
}
