/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { ctypes } = ChromeUtils.importESModule(
  "resource://gre/modules/ctypes.sys.mjs"
);
var { MimeParser } = ChromeUtils.import("resource:///modules/mimeParser.jsm");
var { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);

// Set up an SMTP server and the MAPI daemon.
getBasicSmtpServer();
const [daemon, server] = setupServerDaemon();
server.start(SMTP_PORT);
const mapi = loadMAPILibrary();

registerCleanupFunction(() => {
  server.stop();
});

/**
 * Construct a MapiMessage, then send through MAPI.
 *
 * @param {boolean} offline - Switch to offline mode if true.
 */
function testMapiSendMail(offline) {
  Services.io.offline = offline;

  // Build a message using the MAPI interface.
  const message = new mapi.MapiMessage();
  message.lpszSubject = ctypes.char.array()(`Hello, MAPI offline=${offline}!`);
  message.lpszNoteText = ctypes.char.array()("I successfully sent a message!");
  message.lpszMessageType = ctypes.char.array()("");

  const file = do_get_file("../../../compose/test/unit/data/message1.eml");
  const attachment = new mapi.MapiFileDesc();
  attachment.lpszFileName = ctypes.char.array()(file.leafName);
  attachment.lpszPathName = ctypes.char.array()(file.path);
  message.nFileCount = 1;
  message.lpFiles = attachment.address();

  const recipient = new mapi.MapiRecipDesc();
  recipient.ulRecipClass = 1; /* MAPI_TO */
  recipient.lpszName = ctypes.char.array()("John Doe");
  recipient.lpszAddress = ctypes.char.array()("SMTP:john.doe@example.com");
  message.nRecipCount = 1;
  message.lpRecips = recipient.address();

  // Use MAPISendMail to send this message.
  mapi.SendMail(
    null /* No session */,
    null /* No HWND */,
    message.address(),
    0x2 /* MAPI_NEW_SESSION */,
    0
  );
}

/**
 * Test that when we're online, the message can be sent correctly to the SMTP
 * server.
 */
add_task(function mapiSendMailOnline() {
  server.resetTest();
  testMapiSendMail(false);

  // Check that the post has the correct information.
  const [headers, body] = MimeParser.extractHeadersAndBody(daemon.post);
  Assert.equal(headers.get("from")[0].email, "tinderbox@tinderbox.invalid");
  Assert.equal(headers.get("to")[0].email, "john.doe@example.com");
  Assert.equal(headers.get("subject"), "Hello, MAPI offline=false!");
  Assert.ok(body.includes("I successfully sent a message!"));
  Assert.ok(body.includes("this email is in dos format"));
});

/**
 * Test that when we're offline, the message can be saved correctly to the Outbox.
 */
add_task(function mapiSendMailOffline() {
  server.resetTest();
  testMapiSendMail(true);

  const outbox = localAccountUtils.rootFolder.getChildNamed("Outbox");
  const msgData = mailTestUtils.loadMessageToString(
    outbox,
    mailTestUtils.firstMsgHdr(outbox)
  );
  // Check that the post has the correct information.
  const [headers, body] = MimeParser.extractHeadersAndBody(msgData);
  Assert.equal(headers.get("from")[0].email, "tinderbox@tinderbox.invalid");
  Assert.equal(headers.get("to")[0].email, "john.doe@example.com");
  Assert.equal(headers.get("subject"), "Hello, MAPI offline=true!");
  Assert.ok(body.includes("I successfully sent a message!"));
  Assert.ok(body.includes("this email is in dos format"));
});
