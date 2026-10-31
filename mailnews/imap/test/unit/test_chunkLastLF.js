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

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

// Add a message to a server mailbox, returning its UID.
function addMessageToServer(file, mailbox) {
  const URI = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  const msg = new ImapMessage(URI.spec, mailbox.uidnext++, []);
  // underestimate the actual file size, like some IMAP servers do
  msg.setSize(file.fileSize - 55);
  mailbox.addMessage(msg);
  return msg.uid;
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

  // The server doesn't support more than one connection
  Services.prefs.setIntPref("mail.server.server1.max_cached_connections", 1);
  // We aren't interested in downloading messages automatically
  Services.prefs.setBoolPref("mail.server.server1.download_on_biff", false);

  // Set up IMAP fakeserver and corresponding client-side bits.
  const imapServer = await ServerTestUtils.createServer({ type: "imap" });
  const account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  account.addIdentity(identity);
  account.defaultIdentity = identity;
  const incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  incomingServer.port = imapServer.port;
  incomingServer.password = "password";
  account.incomingServer = incomingServer;
  MailServices.accounts.defaultAccount = account;

  // Sync the folder list with server.
  {
    const listener = new PromiseTestUtils.PromiseUrlListener();
    MailServices.imap.discoverAllFolders(
      incomingServer.rootFolder,
      listener,
      false
    );
    await listener.promise;
  }

  // Load a message directly into INBOX on the IMAP server.
  const srcFile = do_get_file("../../../data/bug92111b");
  addMessageToServer(srcFile, imapServer.daemon.getMailbox("INBOX"));

  // Sync the message list and get an imap: URL for fetching the message.
  const imapMsgService = Cc[
    "@mozilla.org/messenger/messageservice;1?type=imap"
  ].getService(Ci.nsIMsgMessageService);

  const inbox = incomingServer.rootFolder
    .getChildNamed("INBOX")
    .QueryInterface(Ci.nsIMsgImapMailFolder);
  {
    const listener = new PromiseTestUtils.PromiseUrlListener();
    inbox.updateFolderWithListener(false, listener);
    await listener.promise;
  }

  Assert.equal([...inbox.messages].length, 1, "Inbox should contain 1 message");
  const hdr = [...inbox.messages][0];
  const msgUri = inbox.generateMessageURI(hdr.messageKey);

  // URL to stream directly from server, bypassing the folder entirely.
  const fetchUrl = imapMsgService.getUrlForUri(msgUri);

  // Get a channel from this URI, and check its content length
  const channel = Services.io.newChannelFromURI(
    fetchUrl,
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
  const origData = (await IOUtils.readUTF8(srcFile.path)).replace(
    /\r\n/g,
    "\n"
  );
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
});
