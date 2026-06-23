/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that a truncated chunked body download is not stored as a complete
 * offline message.
 *
 * When a message body is downloaded in chunks and the server stops delivering
 * data partway through without any protocol error (e.g. a premature connection
 * close), the short chunk must not be treated as the final chunk and stored as
 * a *complete* offline copy (nsMsgMessageFlags::Offline). Doing so would mean
 * the message is never re-fetched and the user silently sees a truncated
 * message (e.g. missing attachments). Instead, the download must be detected as
 * incomplete -- fewer octets received than the server announced in RFC822.SIZE
 * -- and aborted, so the partial copy is discarded and re-fetched on next
 * access.
 *
 * The test uses the fakeserver's `_truncateBodyAt` hook to simulate the
 * truncation while keeping RFC822.SIZE reporting the true (larger) size; this
 * is distinct from the wrong-RFC822.SIZE case (where the server under-reports
 * the size, covered by bug 92111).
 *
 * See bug 770888 for the original report.
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// Chunk parameters -- small so the body spans several chunks.
const CHUNK_SIZE = 4000;
const CHUNK_THRESHOLD = 2000;

// A body large enough to require multiple chunks. The truncation point is set
// roughly in the middle, on a chunk boundary that is *before* the end of the
// message, so the short chunk is mistaken for the final one.
const BODY_LINE =
  "This is a line of the test message body, padding it out.\r\n"; // 58 bytes
const BODY_LINES = 800; // ~41 KB body
const TRUNCATE_AT = 20000; // deliver only the first ~20 KB

var gIMAPService;
var gFullMsgFile, gTruncMsgFile;
var gFullMsg, gTruncMsg;

function writeMessageFile(subject) {
  const headers =
    `From: sender@example.com\r\n` +
    `To: receiver@example.com\r\n` +
    `Subject: ${subject}\r\n` +
    `Message-ID: <${subject}@example.com>\r\n` +
    `Content-Type: text/plain\r\n` +
    `\r\n`;
  const body = BODY_LINE.repeat(BODY_LINES);
  const content = headers + body;

  const file = Services.dirsvc.get("TmpD", Ci.nsIFile);
  file.append(`truncated-offline-${subject}.eml`);
  file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
  const fos = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(
    Ci.nsIFileOutputStream
  );
  fos.init(file, 0x02 | 0x08 | 0x20, 0o600, 0); // write | create | truncate
  fos.write(content, content.length);
  fos.close();
  return file;
}

function addMessageToServer(file, mailbox) {
  const uri = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  const msg = new ImapMessage(uri.spec, mailbox.uidnext++, []);
  // Do NOT call setSize(): RFC822.SIZE then reports the true file size, so the
  // truncated delivery is genuinely short of what the server announced.
  mailbox.addMessage(msg);
  return msg;
}

async function streamMessageToOfflineStore(msgHdr) {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  gIMAPService.streamMessage(
    IMAPPump.inbox.getUriForMsg(msgHdr),
    streamListener,
    null,
    listener,
    false,
    "",
    false
  );
  // The truncated download aborts, so the stream/url may resolve with an error.
  // Swallow it -- the assertions below check the resulting offline state.
  await streamListener.promise.catch(() => {});
  await listener.promise.catch(() => {});
}

add_setup(async function () {
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);
  Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
  Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
  Services.prefs.setBoolPref("mail.server.server1.offline_download", true);

  // Force download-by-chunks with small chunks so the body is fetched in
  // several BODY[]<start.count> requests.
  Services.prefs.setBoolPref("mail.server.default.fetch_by_chunks", true);
  Services.prefs.setIntPref("mail.imap.chunk_size", CHUNK_SIZE);
  Services.prefs.setIntPref(
    "mail.imap.min_chunk_size_threshold",
    CHUNK_THRESHOLD
  );
  Services.prefs.setIntPref("mail.imap.chunk_add", 0);

  setupIMAPPump();

  IMAPPump.inbox.hierarchyDelimiter = "/";
  IMAPPump.inbox.verifiedAsOnlineFolder = true;

  gFullMsgFile = writeMessageFile("full");
  gTruncMsgFile = writeMessageFile("truncated");

  const inbox = IMAPPump.daemon.getMailbox("INBOX");
  gFullMsg = addMessageToServer(gFullMsgFile, inbox);
  gTruncMsg = addMessageToServer(gTruncMsgFile, inbox);
  // Make the second message deliver a truncated body.
  gTruncMsg._truncateBodyAt = TRUNCATE_AT;

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  gIMAPService = Cc[
    "@mozilla.org/messenger/messageservice;1?type=imap"
  ].getService(Ci.nsIMsgMessageService);
});

/**
 * Positive control: a complete chunked download must be stored offline.
 */
add_task(async function fullMessageIsMarkedOffline() {
  const db = IMAPPump.inbox.msgDatabase;
  const hdr = db.getMsgHdrForMessageID("full@example.com");
  Assert.ok(!!hdr, "header for full message exists");

  await streamMessageToOfflineStore(hdr);

  Assert.notEqual(
    hdr.flags & Ci.nsMsgMessageFlags.Offline,
    0,
    "a fully-downloaded chunked message is marked as offline-complete"
  );
});

/**
 * A truncated chunked download must NOT be stored as a complete offline copy.
 */
add_task(async function truncatedMessageIsNotMarkedOffline() {
  const db = IMAPPump.inbox.msgDatabase;
  const hdr = db.getMsgHdrForMessageID("truncated@example.com");
  Assert.ok(!!hdr, "header for truncated message exists");

  await streamMessageToOfflineStore(hdr);

  Assert.equal(
    hdr.flags & Ci.nsMsgMessageFlags.Offline,
    0,
    "a truncated chunked message must not be marked as offline-complete"
  );
});

add_task(function endTest() {
  teardownIMAPPump();
  try {
    gFullMsgFile.remove(false);
    gTruncMsgFile.remove(false);
  } catch (ex) {
    // best effort cleanup
  }
});
