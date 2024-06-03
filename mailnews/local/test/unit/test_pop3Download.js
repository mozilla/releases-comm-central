/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that pop3 download code and message storage works correctly.
 */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const [daemon, server, handler] = setupServerDaemon();
server.start();
registerCleanupFunction(() => {
  server.stop();
});

/**
 * Helper function to parse an RFC5322 message.
 * Not totally comprehensive, but good enough for tests.
 *
 * For example:
 *   parseMessage("From: Alice\r\nTo: Bob\r\n\r\nHello there!\r\n")
 *
 * Returns:
 *   [{"From":["Alice"], "To": "Bob"}, "Hello there!\r\n"]
 *
 * NOTE: The returned header values are arrays because headers can repeat.
 *
 */
function parseMessage(raw) {
  // Mbox separators are more common than you'd like in test data.
  // We'll tolerate and discard them.
  raw = raw.replace("/^From .*\r?\n/", "");

  // Split header block and body.
  const headerBody = raw.match(/(.*?)\r?\n\r?\n(.*)/s);
  const body = headerBody[2];

  // Parse the headers.
  const headers = {};
  // Flatten any multi-line headers (delete any EOL followed by whitespace).
  const rawHdrs = headerBody[1].replaceAll(/\r?\n(\s)/g, "$1");
  const headerLines = rawHdrs.split(/\r?\n/);
  for (const line of headerLines) {
    // Split "name: value".
    const m = line.match(/^([^\s:]+):\s+(.*)$/);
    if (m == null) {
      continue; // Uh-oh... Bad header.
    }
    const name = m[1];
    // Headers can have multiple values.
    headers[name] ??= [];
    headers[name].push(m[2]);
  }

  return [headers, body];
}

// For Bug 713611.
Services.prefs.setBoolPref("mailnews.downloadToTempFile", false);

/**
 * Test that messages download correctly, and have some of the basic headers
 * correctly parsed.
 */
add_task(async function testDownloadMessages() {
  const incomingServer = createPop3ServerAndLocalFolders(server.port);

  const testMessages = [
    "message1.eml",
    "message_with_from_line.eml",
    "message2.eml",
    "message3.eml",
  ];

  incomingServer.leaveMessagesOnServer = true;

  // Read our original test messages directly from disk.
  const expectRaw = [];
  for (const filename of testMessages) {
    const f = PathUtils.join(do_get_cwd().path, "data", filename);
    expectRaw.push(await IOUtils.readUTF8(f));
  }

  // Inject test messages into POP3 server, and fetch them.
  daemon.setMessages(testMessages);
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    localAccountUtils.inboxFolder,
    incomingServer
  );
  await urlListener.promise;

  // Collect the downloaded messages back out from the folder.
  const gotMsgHdrs = [];
  const gotRaw = [];
  for (const msgHdr of localAccountUtils.inboxFolder.messages) {
    const streamListener = new PromiseTestUtils.PromiseStreamListener();
    const msgURI = msgHdr.folder.getUriForMsg(msgHdr);
    MailServices.messageServiceFromURI(msgURI).streamMessage(
      msgURI,
      streamListener,
      null,
      null,
      false,
      "",
      false
    );

    gotRaw.push(await streamListener.promise);
    gotMsgHdrs.push(msgHdr);
  }

  // Check each downloaded message against what we're expecting.
  // We're assuming the same ordering, which is a bit dodgy, but
  // fine for our fake test server.
  Assert.equal(
    expectRaw.length,
    gotRaw.length,
    "Download correct number of messages"
  );

  // Some headers we want to strip out (because they are added by pop3 and
  // the local message store):
  const blacklist = [
    // POP3 additions:
    "X-UIDL",
    "X-Account-Key",
    // msgStore additions:
    "X-Mozilla-Status",
    "X-Mozilla-Status2",
    "X-Mozilla-Keys",
  ];

  // Check the downloaded messages against the expected data.
  for (let i = 0; i < expectRaw.length; ++i) {
    // Parse the message.
    let [expectHeaders, expectBody] = parseMessage(expectRaw[i]);
    let [gotHeaders, gotBody] = parseMessage(gotRaw[i]);
    // Strip blacklisted headers.
    for (const bad of blacklist) {
      delete gotHeaders[bad];
      delete expectHeaders[bad];
    }

    // Normalise EOLs and compare body.
    expectBody = gotBody.replaceAll(/\r\n/gs, "\n");
    gotBody = gotBody.replaceAll(/\r\n/gs, "\n");
    Assert.equal(expectBody, gotBody, "Message bodies match");

    // Compare headers (stripping out ones that might have added).
    Assert.deepEqual(expectHeaders, gotHeaders, "Message headers match");

    // Check the msgDB has correct subject (Bug 1888790).
    if ("Subject" in expectHeaders) {
      Assert.equal(
        gotMsgHdrs[i].subject,
        expectHeaders.Subject.join(","),
        "Parsed subject matches"
      );
    }
  }

  // Clean up.
  MailServices.accounts.removeIncomingServer(incomingServer, false);
});
