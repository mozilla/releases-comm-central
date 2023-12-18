/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Test content length for the IMAP protocol. This focuses on necko URLs
 * that are run externally.
 */

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var gFile = do_get_file("../../../data/bug92111b");
var gIMAPDaemon, gIMAPServer, gIMAPIncomingServer;

// Adds some messages directly to a mailbox (eg new mail)
function addMessageToServer(file, mailbox) {
  const URI = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  const msg = new ImapMessage(URI.spec, mailbox.uidnext++, []);
  // underestimate the actual file size, like some IMAP servers do
  msg.setSize(file.fileSize - 55);
  mailbox.addMessage(msg);
}

add_task(async function verifyContentLength() {
  // Disable new mail notifications
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);
  Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
  Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );

  // Crank down the message chunk size to make test cases easier
  Services.prefs.setBoolPref("mail.server.default.fetch_by_chunks", true);
  Services.prefs.setIntPref("mail.imap.chunk_size", 1000);
  Services.prefs.setIntPref("mail.imap.min_chunk_size_threshold", 1500);
  Services.prefs.setIntPref("mail.imap.chunk_add", 0);

  // set up IMAP fakeserver and incoming server
  gIMAPDaemon = new ImapDaemon();
  gIMAPServer = makeServer(gIMAPDaemon, "");
  gIMAPIncomingServer = createLocalIMAPServer(gIMAPServer.port);

  // The server doesn't support more than one connection
  Services.prefs.setIntPref("mail.server.server1.max_cached_connections", 1);
  // We aren't interested in downloading messages automatically
  Services.prefs.setBoolPref("mail.server.server1.download_on_biff", false);

  dump("adding message to server\n");
  // Add a message to the IMAP server
  addMessageToServer(gFile, gIMAPDaemon.getMailbox("INBOX"));

  const imapS = Cc[
    "@mozilla.org/messenger/messageservice;1?type=imap"
  ].getService(Ci.nsIMsgMessageService);

  const uri = imapS.getUrlForUri("imap-message://user@localhost/INBOX#1");

  // Get a channel from this URI, and check its content length
  const channel = Services.io.newChannelFromURI(
    uri,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );

  const promiseStreamListener = new PromiseTestUtils.PromiseStreamListener();

  // Read all the contents
  channel.asyncOpen(promiseStreamListener, null);
  const streamData = (await promiseStreamListener.promise).replace(
    /\r\n/g,
    "\n"
  );

  // Now check whether our stream listener got the right bytes
  // First, clean up line endings to avoid CRLF vs. LF differences
  const origData = (await IOUtils.readUTF8(gFile.path)).replace(/\r\n/g, "\n");
  Assert.equal(origData.length, streamData.length);
  Assert.equal(origData, streamData);

  // Now try an attachment. &part=1.2
  // let attachmentURL = Services.io.newURI(neckoURL.value.spec + "&part=1.2",
  //                                        null, null);
  // let attachmentChannel = Services.io.newChannelFromURI(attachmentURL,
  //                                                       null,
  //                                                       Services.scriptSecurityManager.getSystemPrincipal(),
  //                                                       null,
  //                                                       Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
  //                                                       Ci.nsIContentPolicy.TYPE_OTHER);
  // Currently attachments have their content length set to the length of the
  // entire message
  // do_check_eq(attachmentChannel.contentLength, gFile.fileSize);

  gIMAPIncomingServer.closeCachedConnections();
  gIMAPServer.stop();
  const thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
});
