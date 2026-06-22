/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for MailUtils.handleNewsUri() covering:
 * - Empty/edge cases (empty pathname, snews:→news: conversion, wildcards)
 * - Newsgroup URIs (already subscribed, auto-subscribe prompt, specific host)
 * - Message-ID URIs (fetch from server, success/failure, no-server edge case)
 */

var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

// The basic daemon and server for the NNTP fake server.
var daemon = setupNNTPDaemon();
var server;
var incomingServer;

// --- Article we'll request by message-ID. ---
var kArticleForMsgId =
  "From: Alice <alice@example.com>\n" +
  "Date: Fri, 01 Jan 2021 00:00:00 +0000\n" +
  "Newsgroups: misc.test\n" +
  "Subject: Test article for handleNewsUri\n" +
  "Message-ID: <test-msgid@nntp.invalid>\n" +
  "\n" +
  "This is the body of the test article.\n";

// --- Stub state ---

var gFolderUrisOpened = [];
var gEmlFilesOpened = [];
var gConfirmResult = true;
var gConfirmCallCount = 0;
var gLastConfirmTitle = null;
var gLastConfirmText = null;
var gOnEmlOpened = null;

// Keep originals for cleanup.
var originalDisplayFolderIn3Pane = MailUtils.displayFolderIn3Pane;
var originalOpenEMLFile = MailUtils.openEMLFile;
var originalPrompt = Services.prompt;

add_setup(function () {
  // Set up the fake NNTP server.
  daemon = setupNNTPDaemon();
  var article = new NewsArticle(kArticleForMsgId);
  daemon.addArticleToGroup(article, "misc.test", 128);
  daemon.addArticle(article);

  server = makeServer(NNTP_RFC977_handler, daemon);
  server.start();
  incomingServer = setupLocalServer(server.port);

  // Stub UI-dependent MailUtils methods (no real windows in xpcshell).
  MailUtils.displayFolderIn3Pane = function (folderURI) {
    gFolderUrisOpened.push(folderURI);
  };
  MailUtils.openEMLFile = function (win, tempFile, fileUri) {
    gEmlFilesOpened.push({ tempFile, fileUri });
    if (gOnEmlOpened) {
      gOnEmlOpened(tempFile, fileUri);
    }
  };

  // Replace Services.prompt with a mock so confirm() doesn't try to open
  // a real window (which would fail in xpcshell).  This is the same pattern
  // used by registerAlertTestUtils() in alertTestUtils.js.
  Services.prompt = {
    QueryInterface: ChromeUtils.generateQI(["nsIPromptService"]),

    alert(_win, _title, _text) {},
    alertCheck(_win, _title, _text, _checkMsg, _checkState) {},
    confirm(_win, _title, _text) {
      gConfirmCallCount++;
      gLastConfirmTitle = _title;
      gLastConfirmText = _text;
      return gConfirmResult;
    },
    confirmCheck(_win, _title, _text, _checkMsg, _checkState) {
      return gConfirmResult;
    },
    confirmEx(
      _win,
      _title,
      _text,
      _buttonFlags,
      _button0Title,
      _button1Title,
      _button2Title,
      _checkMsg,
      _checkState
    ) {
      return 0;
    },
    prompt(_win, _title, _text, _value, _checkMsg, _checkState) {
      return false;
    },
    promptUsernameAndPassword(_win, _title, _text, _username, _password) {
      return false;
    },
    promptPassword(_win, _title, _text, _password) {
      return false;
    },
    select(_win, _title, _text, _count, _selectList, _outSelection) {
      return false;
    },
    promptAuth(_win, _channel, _level, _authInfo) {
      return false;
    },
    asyncPromptAuth(_win, _channel, _callback, _level, _authInfo) {},
  };

  registerCleanupFunction(function () {
    Services.prompt = originalPrompt;
    MailUtils.displayFolderIn3Pane = originalDisplayFolderIn3Pane;
    MailUtils.openEMLFile = originalOpenEMLFile;
    server.stop();
  });
});

function resetCaptures() {
  gFolderUrisOpened = [];
  gEmlFilesOpened = [];
  gConfirmResult = true;
  gConfirmCallCount = 0;
  gLastConfirmTitle = null;
  gLastConfirmText = null;
  gOnEmlOpened = null;
}

// ---- Tests -----------------------------------------------------------

add_task(function test_empty_pathname() {
  resetCaptures();
  MailUtils.handleNewsUri("news:", null);
  Assert.equal(gFolderUrisOpened.length, 0);
  Assert.equal(gEmlFilesOpened.length, 0);
  Assert.equal(gConfirmCallCount, 0);
});

add_task(function test_slash_only_pathname() {
  resetCaptures();
  MailUtils.handleNewsUri("news://some.host/", null);
  Assert.equal(gFolderUrisOpened.length, 0);
  Assert.equal(gEmlFilesOpened.length, 0);
  Assert.equal(gConfirmCallCount, 0);
});

add_task(function test_snews_to_news_conversion() {
  resetCaptures();
  MailUtils.handleNewsUri("snews:test.subscribe.simple", null);
  Assert.equal(gFolderUrisOpened.length, 1, "Should open the newsgroup folder");
  Assert.ok(
    gFolderUrisOpened[0].includes("test.subscribe.simple"),
    "Folder URI should contain the newsgroup name"
  );
});

add_task(function test_wildcard_newsgroup() {
  resetCaptures();
  MailUtils.handleNewsUri("news:comp.*", null);
  Assert.equal(gFolderUrisOpened.length, 0);
  Assert.equal(gEmlFilesOpened.length, 0);
  Assert.equal(gConfirmCallCount, 0);
});

add_task(function test_newsgroup_already_subscribed() {
  resetCaptures();
  MailUtils.handleNewsUri("news:test.subscribe.simple", null);
  Assert.equal(
    gConfirmCallCount,
    0,
    "Should not prompt for already-subscribed group"
  );
  Assert.equal(gFolderUrisOpened.length, 1);
  Assert.ok(gFolderUrisOpened[0].includes("test.subscribe.simple"));
});

add_task(function test_newsgroup_auto_subscribe_accept() {
  resetCaptures();
  gConfirmResult = true;

  Assert.ok(
    !incomingServer
      .QueryInterface(Ci.nsINntpIncomingServer)
      .containsNewsgroup("misc.test"),
    "misc.test should NOT be subscribed initially"
  );

  MailUtils.handleNewsUri("news:misc.test", null);

  Assert.equal(gConfirmCallCount, 1, "Should prompt once for auto-subscribe");
  Assert.ok(
    gLastConfirmText.includes("misc.test"),
    "Prompt text should mention the newsgroup name"
  );
  Assert.equal(gFolderUrisOpened.length, 1);
  Assert.ok(gFolderUrisOpened[0].includes("misc.test"));
  Assert.ok(
    incomingServer
      .QueryInterface(Ci.nsINntpIncomingServer)
      .containsNewsgroup("misc.test"),
    "misc.test should be subscribed after user accepted"
  );
});

add_task(function test_newsgroup_auto_subscribe_reject() {
  resetCaptures();
  gConfirmResult = false;

  Assert.ok(
    !incomingServer
      .QueryInterface(Ci.nsINntpIncomingServer)
      .containsNewsgroup("test.empty"),
    "test.empty should NOT be subscribed initially"
  );

  MailUtils.handleNewsUri("news:test.empty", null);

  Assert.equal(gConfirmCallCount, 1, "Should prompt once");
  Assert.equal(gFolderUrisOpened.length, 0, "Should NOT open folder on reject");
  Assert.ok(
    !incomingServer
      .QueryInterface(Ci.nsINntpIncomingServer)
      .containsNewsgroup("test.empty"),
    "test.empty should STILL not be subscribed after user rejected"
  );
});

add_task(function test_newsgroup_with_specific_host() {
  resetCaptures();
  var uri = `news://localhost:${server.port}/test.subscribe.simple`;
  MailUtils.handleNewsUri(uri, null);

  Assert.equal(gConfirmCallCount, 0);
  Assert.equal(gFolderUrisOpened.length, 1);
  Assert.ok(gFolderUrisOpened[0].includes("test.subscribe.simple"));
});

add_task(function test_newsgroup_unknown_host() {
  resetCaptures();
  MailUtils.handleNewsUri("news://no-such-host.invalid/some.group", null);
  Assert.equal(gFolderUrisOpened.length, 0);
  Assert.equal(gEmlFilesOpened.length, 0);
  Assert.equal(gConfirmCallCount, 0);
});

add_task(async function test_messageId_no_host() {
  resetCaptures();

  var uri = "news:test-msgid@nntp.invalid";
  var openedPromise = new Promise(resolve => {
    gOnEmlOpened = resolve;
  });

  MailUtils.handleNewsUri(uri, null);

  await openedPromise;

  Assert.equal(gEmlFilesOpened.length, 1);
  Assert.ok(gEmlFilesOpened[0].tempFile.exists(), "Temp file should exist");
  Assert.greater(
    gEmlFilesOpened[0].tempFile.fileSize,
    0,
    "Temp file should not be empty"
  );

  // Read back and verify the article content was saved.
  var fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  fstream.init(gEmlFilesOpened[0].tempFile, -1, 0, 0);
  var sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
  sstream.init(fstream);
  var content = sstream.read(fstream.available());
  sstream.close();
  fstream.close();
  Assert.ok(
    content.includes("Test article for handleNewsUri"),
    "Saved file should contain the article body"
  );
});

add_task(async function test_messageId_with_specific_host() {
  resetCaptures();

  var uri = `news://localhost:${server.port}/test-msgid@nntp.invalid`;
  var openedPromise = new Promise(resolve => {
    gOnEmlOpened = resolve;
  });

  MailUtils.handleNewsUri(uri, null);

  await openedPromise;

  Assert.equal(gEmlFilesOpened.length, 1);
  Assert.greater(gEmlFilesOpened[0].tempFile.fileSize, 0);
});

add_task(async function test_messageId_not_found() {
  resetCaptures();

  var uri = `news://localhost:${server.port}/no-such-msg@nntp.invalid`;

  MailUtils.handleNewsUri(uri, null);

  // Wait for the async URL to fail.

  await new Promise(resolve => do_timeout(500, resolve));

  Assert.equal(
    gEmlFilesOpened.length,
    0,
    "openEMLFile should not be called for a non-existent message"
  );
});
