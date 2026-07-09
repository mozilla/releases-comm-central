/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that Block exceptions in the remote content permission list are
 * honoured even when the global "Allow remote content in messages"
 * preference is enabled (Bug 1999348).
 */

"use strict";

var {
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  get_about_message,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var folder = null;
var gMsgNo = -1;

var url =
  "http://mochi.test:8888/browser/comm/mail/test/browser/content-policy/html/";

var msgBodyStart =
  '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">\n' +
  "<html>\n" +
  "<head>\n" +
  '\n<meta http-equiv="content-type" content="text/html; charset=ISO-8859-1">\n' +
  "</head>\n" +
  '<body bgcolor="#ffffff" text="#000000">\n';

var msgBodyEnd = "</body>\n</html>\n";

add_setup(async () => {
  folder = await create_folder("blockExceptionContentPolicy");
  registerCleanupFunction(() => {
    folder.deleteSelf(null);
    Services.prefs.clearUserPref(
      "mailnews.message_display.disable_remote_image"
    );
  });
});

function checkPermission(aURI) {
  const principal = Services.scriptSecurityManager.createContentPrincipal(
    aURI,
    {}
  );
  return Services.perms.testPermissionFromPrincipal(principal, "image");
}

function addPermission(aURI, aAllowDeny) {
  const principal = Services.scriptSecurityManager.createContentPrincipal(
    aURI,
    {}
  );
  return Services.perms.addFromPrincipal(principal, "image", aAllowDeny);
}

function removePermission(aURI) {
  const principal = Services.scriptSecurityManager.createContentPrincipal(
    aURI,
    {}
  );
  return Services.perms.removeFromPrincipal(principal, "image");
}

function addToFolder(aSubject, aBody, aFolder) {
  const msgId = Services.uuid.generateUUID() + "@example.com";

  gMsgNo++;
  const source =
    "X-Mozilla-Status: 0001\n" +
    "X-Mozilla-Status2: 00000000\n" +
    "Message-ID: <" +
    msgId +
    ">\n" +
    "Date: Wed, 11 Jun 2008 20:32:02 -0400\n" +
    "From: Tester <tests@example.com>\n" +
    "MIME-Version: 1.0\n" +
    "To: recipient@example.com\n" +
    "Subject: " +
    aSubject +
    " #" +
    gMsgNo +
    "\n" +
    "Content-Type: text/html; charset=ISO-8859-1\n" +
    "Content-Transfer-Encoding: 7bit\n" +
    "\n" +
    aBody +
    "\n";

  aFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  aFolder.gettingNewMessages = true;

  aFolder.addMessage(source);
  aFolder.gettingNewMessages = false;

  return aFolder.msgDatabase.getMsgHdrForMessageID(msgId);
}

/** Check if the test image is loaded (remote content allowed). */
function isImageLoaded(document) {
  const img = document.getElementById("testelement");
  return img && img.naturalWidth > 0 && img.naturalHeight > 0;
}

/**
 * Test that a Block exception for a sender prevents remote content from
 * loading, even when the global "Allow remote content" pref is enabled.
 */
add_task(async function test_blockSenderWhenGlobalAllow() {
  await be_in_folder(folder);

  // Enable global "Allow remote content".
  Services.prefs.setBoolPref(
    "mailnews.message_display.disable_remote_image",
    false
  );

  // Add a Block exception for the sender.
  const senderURI = Services.io.newURI(
    "chrome://messenger/content/email=tests@example.com"
  );
  addPermission(senderURI, Services.perms.DENY_ACTION);
  Assert.equal(
    checkPermission(senderURI),
    Services.perms.DENY_ACTION,
    "sender should have DENY_ACTION permission"
  );

  // Create a message from that sender with a remote image.
  const msgDbHdr = addToFolder(
    "block sender test",
    msgBodyStart +
      '<img id="testelement" src="' +
      url +
      'pass.png"/>' +
      msgBodyEnd,
    folder
  );

  // Select and display the message.
  const msgHdr = await select_click_row(gMsgNo);
  Assert.equal(msgDbHdr, msgHdr, "selected msg should match created msg");
  await assert_selected_and_displayed(gMsgNo);

  // The remote image should be BLOCKED because of the sender Block exception.
  const messageDocument =
    get_about_message().getMessagePaneBrowser().contentDocument;
  Assert.ok(
    !isImageLoaded(messageDocument),
    "remote image should be blocked due to sender Block exception"
  );

  // Clean up.
  removePermission(senderURI);
  Assert.equal(
    checkPermission(senderURI),
    Services.perms.UNKNOWN_ACTION,
    "sender permission should be cleaned up"
  );
});

/**
 * Test that remote content is still allowed when global allow is on and
 * there are no block exceptions.
 */
add_task(async function test_allowWhenGlobalAllowNoExceptions() {
  await be_in_folder(folder);

  // Enable global "Allow remote content".
  Services.prefs.setBoolPref(
    "mailnews.message_display.disable_remote_image",
    false
  );

  // Create a message with a remote image (no block exceptions set).
  const msgDbHdr = addToFolder(
    "allow no exceptions test",
    msgBodyStart +
      '<img id="testelement" src="' +
      url +
      'pass.png"/>' +
      msgBodyEnd,
    folder
  );

  // Select and display the message.
  const msgHdr = await select_click_row(gMsgNo);
  Assert.equal(msgDbHdr, msgHdr, "selected msg should match created msg");
  await assert_selected_and_displayed(gMsgNo);

  // The remote image should be ALLOWED because global allow is on and there
  // are no block exceptions.
  const messageDocument =
    get_about_message().getMessagePaneBrowser().contentDocument;
  Assert.ok(
    isImageLoaded(messageDocument),
    "remote image should be allowed when global allow is on and no block exceptions exist"
  );
});

/**
 * Test that a Block exception for a specific content URL (image host) prevents
 * that image from loading when global allow is enabled.
 */
add_task(async function test_blockContentURLWhenGlobalAllow() {
  await be_in_folder(folder);

  // Enable global "Allow remote content".
  Services.prefs.setBoolPref(
    "mailnews.message_display.disable_remote_image",
    false
  );

  // Add a Block exception for the image host.
  const imageURI = Services.io.newURI(url);
  addPermission(imageURI, Services.perms.DENY_ACTION);
  Assert.equal(
    checkPermission(imageURI),
    Services.perms.DENY_ACTION,
    "image host should have DENY_ACTION permission"
  );

  // Create a message with a remote image from that host.
  const msgDbHdr = addToFolder(
    "block content url test",
    msgBodyStart +
      '<img id="testelement" src="' +
      url +
      'pass.png"/>' +
      msgBodyEnd,
    folder
  );

  // Select and display the message.
  const msgHdr = await select_click_row(gMsgNo);
  Assert.equal(msgDbHdr, msgHdr, "selected msg should match created msg");
  await assert_selected_and_displayed(gMsgNo);

  // The remote image should be BLOCKED because of the content URL Block exception.
  const messageDocument =
    get_about_message().getMessagePaneBrowser().contentDocument;
  Assert.ok(
    !isImageLoaded(messageDocument),
    "remote image should be blocked due to content URL Block exception"
  );

  // Clean up.
  removePermission(imageURI);
  Assert.equal(
    checkPermission(imageURI),
    Services.perms.UNKNOWN_ACTION,
    "image host permission should be cleaned up"
  );
});
