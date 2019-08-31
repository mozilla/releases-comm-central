/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test to ensure that we handle the RFC2197 ID command.
 */

/* import-globals-from ../../../test/resources/logHelper.js */
load("../../../resources/logHelper.js");

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var kIDResponse =
  '("name" "GImap" "vendor" "Google, Inc." "support-url" "http://mail.google.com/support")';

add_task(async function setup() {
  setupIMAPPump("GMail");
  IMAPPump.daemon.idResponse = kIDResponse;

  // update folder to kick start tests.
  let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  await promiseUrlListener.promise;
});

add_task(async function updateInbox() {
  let promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  await promiseUrlListener.promise;
});

add_task(function checkIDHandling() {
  Assert.equal(IMAPPump.daemon.clientID, '("name" "xpcshell" "version" "1")');
  Assert.equal(IMAPPump.incomingServer.serverIDPref, kIDResponse);
});

add_task(teardownIMAPPump);
