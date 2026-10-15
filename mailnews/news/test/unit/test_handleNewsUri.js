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
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
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
var gMessagesDisplayed = [];
var gEmlFilesOpened = [];
var gConfirmResult = true;
var gConfirmCallCount = 0;
var gLastConfirmTitle = null;
var gLastConfirmText = null;
var gOnEmlOpened = null;

// Keep originals for cleanup.
var originalDisplayFolderIn3Pane = MailUtils.displayFolderIn3Pane;
var originalDisplayMessage = MailUtils.displayMessage;
var originalOpenEMLFile = MailUtils.openEMLFile;
var originalPrompt = Services.prompt;

add_setup(function () {
  // Set up the fake NNTP server.
  daemon = setupNNTPDaemon();
  daemon.addGroup("comp.lang.c++");
  var article = new NewsArticle(kArticleForMsgId);
  daemon.addArticleToGroup(article, "misc.test", 128);
  daemon.addArticle(article);
  for (const [index, messageId] of [
    "test%test@nntp.invalid",
    "test%25test@nntp.invalid",
    "test#?/test@nntp.invalid",
  ].entries()) {
    const specialArticle = new NewsArticle(
      kArticleForMsgId.replace("test-msgid@nntp.invalid", messageId)
    );
    daemon.addArticleToGroup(specialArticle, "misc.test", 129 + index);
    daemon.addArticle(specialArticle);
  }

  server = makeServer(NNTP_RFC977_handler, daemon);
  server.start();
  incomingServer = setupLocalServer(server.port);

  // Stub UI-dependent MailUtils methods (no real windows in xpcshell).
  MailUtils.displayFolderIn3Pane = function (folderURI) {
    gFolderUrisOpened.push(folderURI);
  };
  MailUtils.displayMessage = function (msgHdr) {
    gMessagesDisplayed.push(msgHdr);
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
    MailUtils.displayMessage = originalDisplayMessage;
    MailUtils.openEMLFile = originalOpenEMLFile;
    server.stop();
  });
});

function resetCaptures() {
  gFolderUrisOpened = [];
  gMessagesDisplayed = [];
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

add_task(function test_nntp_newsgroup() {
  resetCaptures();
  MailUtils.handleNewsUri(
    `nntp://localhost:${server.port}/test.subscribe.simple`,
    null
  );
  Assert.equal(gConfirmCallCount, 0, "should not prompt");
  Assert.equal(gFolderUrisOpened.length, 1, "should open the newsgroup folder");
  Assert.ok(
    gFolderUrisOpened[0].includes("test.subscribe.simple"),
    "folder URI should contain the newsgroup name"
  );
});

add_task(async function test_nntp_article_fetch() {
  resetCaptures();
  const openedPromise = new Promise(resolve => {
    gOnEmlOpened = resolve;
  });
  MailUtils.handleNewsUri(
    `nntp://localhost:${server.port}/test.filter/1`,
    null
  );
  await openedPromise;

  Assert.equal(gConfirmCallCount, 0, "should not prompt");
  Assert.equal(gFolderUrisOpened.length, 0, "should not open a folder");
  Assert.greater(
    gEmlFilesOpened[0].tempFile.fileSize,
    0,
    "should fetch the article when its header isn't in the folder"
  );
});

add_task(async function test_nntp_articles_fetched_separately() {
  const messageIds = [];
  for (const articleNumber of [1, 2]) {
    resetCaptures();
    const openedPromise = new Promise(resolve => {
      gOnEmlOpened = resolve;
    });
    MailUtils.handleNewsUri(
      `nntp://localhost:${server.port}/test.filter/${articleNumber}`,
      null
    );
    const tempFile = await openedPromise;
    const data = await IOUtils.readUTF8(tempFile.path);
    messageIds.push(data.match(/^Message-ID: (.*)$/m)?.[1]);
  }
  Assert.ok(messageIds[0], "first article should be fetched");
  Assert.notEqual(
    messageIds[0],
    messageIds[1],
    "different articles should be displayed"
  );
});

add_task(async function test_nntp_article_in_folder() {
  const folder = incomingServer.rootFolder.getChildNamed("test.filter");
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  incomingServer.getNewMessages(folder, null, urlListener);
  await urlListener.promise;

  resetCaptures();
  MailUtils.handleNewsUri(
    `nntp://localhost:${server.port}/test.filter/1`,
    null
  );
  Assert.equal(gMessagesDisplayed.length, 1, "should display the message");
  Assert.equal(
    gMessagesDisplayed[0].messageKey,
    1,
    "should display the message with the article number as key"
  );
  Assert.equal(gEmlFilesOpened.length, 0, "should not fetch the article");
});

add_task(function test_nntp_article_unsubscribed_reject() {
  resetCaptures();
  gConfirmResult = false;
  MailUtils.handleNewsUri(
    `nntp://localhost:${server.port}/misc.test/128`,
    null
  );
  Assert.equal(gConfirmCallCount, 1, "should prompt to subscribe");
  Assert.equal(gMessagesDisplayed.length, 0, "should not display a message");
  Assert.equal(gEmlFilesOpened.length, 0, "should not fetch the article");
  Assert.ok(
    !incomingServer
      .QueryInterface(Ci.nsINntpIncomingServer)
      .containsNewsgroup("misc.test"),
    "misc.test should not be subscribed after the user rejected"
  );
});

add_task(function test_nntp_invalid_article_number() {
  const originalOpenNewsArticle = MailUtils._openNewsArticle;
  let articlesOpened = 0;
  MailUtils._openNewsArticle = () => articlesOpened++;
  try {
    for (const articleNumber of [
      "abc",
      "0",
      "2147483648",
      "23434534534534534545454",
    ]) {
      resetCaptures();
      MailUtils.handleNewsUri(
        `nntp://localhost:${server.port}/test.filter/${articleNumber}`,
        null
      );
      Assert.equal(gConfirmCallCount, 0, `${articleNumber} should not prompt`);
      Assert.equal(
        gFolderUrisOpened.length,
        0,
        `${articleNumber} should not open a folder`
      );
      Assert.equal(
        gMessagesDisplayed.length,
        0,
        `${articleNumber} should not display a message`
      );
      Assert.equal(
        articlesOpened,
        0,
        `${articleNumber} should not fetch an article`
      );
    }
  } finally {
    MailUtils._openNewsArticle = originalOpenNewsArticle;
  }
});

add_task(function test_nntps_newsgroup() {
  resetCaptures();
  MailUtils.handleNewsUri(
    `nntps://localhost:${server.port}/test.subscribe.simple`,
    null
  );
  Assert.equal(gFolderUrisOpened.length, 1, "should open the newsgroup folder");
  Assert.ok(
    gFolderUrisOpened[0].includes("test.subscribe.simple"),
    "folder URI should contain the newsgroup name"
  );
});

add_task(function test_nntp_message_id() {
  resetCaptures();
  MailUtils.handleNewsUri(
    `nntp://localhost:${server.port}/test-msgid@nntp.invalid`,
    null
  );
  Assert.equal(gFolderUrisOpened.length, 0, "should not open a folder");
  Assert.equal(gEmlFilesOpened.length, 0, "should not fetch a message");
  Assert.equal(gConfirmCallCount, 0, "should not prompt");
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

add_task(function test_constructNewsUriSpecWithNewsgroupNoServer() {
  resetCaptures();
  const newsgroup = "comp.lang.c++";
  const uri = MailUtils.constructNewsUriSpec(newsgroup);
  Assert.equal(
    uri,
    "news:comp.lang.c%2B%2B",
    "The news URI should escape plus signs in the newsgroup name"
  );
  Assert.ok(
    !incomingServer.containsNewsgroup(newsgroup),
    "The newsgroup should not be subscribed initially"
  );

  MailUtils.handleNewsUri(uri, null);

  Assert.equal(
    gConfirmCallCount,
    1,
    "The newsgroup should prompt to subscribe"
  );
  Assert.ok(
    gLastConfirmText.includes(newsgroup),
    "The subscription prompt should contain the unencoded newsgroup name"
  );
  Assert.ok(
    incomingServer.containsNewsgroup(newsgroup),
    "The unencoded newsgroup should be subscribed after accepting"
  );
  Assert.deepEqual(
    gFolderUrisOpened,
    [incomingServer.rootFolder.getChildNamed(newsgroup).URI],
    "The news URI should open the folder for the unencoded newsgroup name"
  );
});

add_task(function test_constructNewsUriSpecWithNewsgroupAndServer() {
  resetCaptures();
  const newsgroup = "comp.lang.c++";
  const uri = MailUtils.constructNewsUriSpec(newsgroup, incomingServer);
  Assert.equal(
    uri,
    `news://localhost:${server.port}/comp.lang.c%2B%2B`,
    "The news URI should include the server and escape the newsgroup name"
  );

  MailUtils.handleNewsUri(uri, null);

  Assert.equal(
    gConfirmCallCount,
    0,
    "The subscribed newsgroup should open without prompting"
  );
  Assert.deepEqual(
    gFolderUrisOpened,
    [incomingServer.rootFolder.getChildNamed(newsgroup).URI],
    "The news URI should open the folder for the unencoded newsgroup name"
  );
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

  Assert.equal(gConfirmCallCount, 0, "should not prompt for a known server");
  Assert.equal(gEmlFilesOpened.length, 1);
  Assert.greater(gEmlFilesOpened[0].tempFile.fileSize, 0);
});

add_task(async function test_messageId_unknown_server_reject() {
  resetCaptures();
  gConfirmResult = false;

  const otherServer = makeServer(NNTP_RFC977_handler, daemon);
  otherServer.start();

  for (const uri of [
    `news://127.0.0.1:${otherServer.port}/test-msgid@nntp.invalid`,
    `news://localhost:${otherServer.port}/test-msgid@nntp.invalid`,
    `snews://localhost:${otherServer.port}/test-msgid@nntp.invalid`,
  ]) {
    MailUtils.handleNewsUri(uri, null);
  }

  await new Promise(resolve => do_timeout(500, resolve));
  otherServer.stop();

  Assert.equal(gConfirmCallCount, 3, "should prompt for each unknown server");
  Assert.ok(
    gLastConfirmText.includes(`localhost:${otherServer.port}`),
    "prompt text should mention the server host and port"
  );
  Assert.equal(
    gEmlFilesOpened.length,
    0,
    "should not fetch a message when the user rejected the prompt"
  );
});

add_task(function test_messageId_unknown_server_snews_port() {
  resetCaptures();
  gConfirmResult = false;

  MailUtils.handleNewsUri(
    "snews://unknown.invalid/test-msgid@nntp.invalid",
    null
  );
  Assert.equal(gConfirmCallCount, 1, "should prompt for the unknown server");
  Assert.ok(
    gLastConfirmText.includes("unknown.invalid:563"),
    "prompt text should mention the default NNTPS port"
  );
});

add_task(function test_messageId_unknown_server_restricted_port() {
  resetCaptures();
  gConfirmResult = true;

  for (const uri of [
    "news://unknown.invalid:25/test-msgid@nntp.invalid",
    "snews://unknown.invalid:6000/test-msgid@nntp.invalid",
  ]) {
    MailUtils.handleNewsUri(uri, null);
  }
  Assert.equal(
    gConfirmCallCount,
    0,
    "should not prompt for an unknown server on a restricted port"
  );
  Assert.equal(gEmlFilesOpened.length, 0, "should not fetch a message");
});

add_task(async function test_messageId_unknown_server_accept() {
  resetCaptures();
  gConfirmResult = true;

  const otherServer = makeServer(NNTP_RFC977_handler, daemon);
  otherServer.start();

  const openedPromise = new Promise(resolve => {
    gOnEmlOpened = resolve;
  });
  MailUtils.handleNewsUri(
    `news://127.0.0.1:${otherServer.port}/test-msgid@nntp.invalid`,
    null
  );
  await openedPromise;
  otherServer.stop();

  Assert.equal(gConfirmCallCount, 1, "should prompt for the unknown server");
  Assert.ok(
    gLastConfirmText.includes(`127.0.0.1:${otherServer.port}`),
    "prompt text should mention the server host and port"
  );
  Assert.greater(
    gEmlFilesOpened[0].tempFile.fileSize,
    0,
    "should fetch the message when the user accepted the prompt"
  );

  const adHocServer = MailServices.accounts.findServer("", "127.0.0.1", "nntp");
  if (adHocServer) {
    MailServices.accounts.removeIncomingServer(adHocServer, false);
  }
});

add_task(async function test_messageId_unknown_server_snews_accept() {
  resetCaptures();
  gConfirmResult = true;

  const tlsServer = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.nntp.tls
  );
  tlsServer.daemon.addArticle(new NewsArticle(kArticleForMsgId));

  const openedPromise = new Promise(resolve => {
    gOnEmlOpened = resolve;
  });
  MailUtils.handleNewsUri("snews://test.test/test-msgid@nntp.invalid", null);
  await openedPromise;

  Assert.ok(
    gLastConfirmText.includes("test.test:563"),
    "prompt text should mention the default NNTPS port"
  );
  Assert.greater(
    gEmlFilesOpened[0].tempFile.fileSize,
    0,
    "should fetch the message over TLS"
  );

  const adHocServer = MailServices.accounts.findServer("", "test.test", "nntp");
  Assert.equal(
    adHocServer.socketType,
    Ci.nsMsgSocketType.SSL,
    "server should use TLS"
  );
  adHocServer.closeCachedConnections();
  MailServices.accounts.removeIncomingServer(adHocServer, false);
  tlsServer.close();
});

add_task(async function test_encodedMessageIds() {
  for (const messageId of [
    "test%test@nntp.invalid",
    "test%25test@nntp.invalid",
    "test#?/test@nntp.invalid",
  ]) {
    const uri = MailUtils.constructNewsUriSpec(messageId, incomingServer);
    Assert.ok(
      uri.includes(encodeURIComponent(messageId).replaceAll("%40", "@")),
      "The news URI should escape the Message-ID"
    );

    resetCaptures();
    const openedPromise = new Promise(resolve => {
      gOnEmlOpened = resolve;
    });
    MailUtils.handleNewsUri(uri, null);
    const tempFile = await openedPromise;
    const content = await IOUtils.readUTF8(tempFile.path);
    Assert.ok(
      content.includes(`Message-ID: <${messageId}>`),
      "The news URI should retrieve the original Message-ID after decoding once"
    );
  }
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
