/**
 * Test bug 92111 - imap download-by-chunks doesn't download complete file if the
 * server lies about rfc822.size (known to happen for Exchange and gmail)
 */

const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

add_task(async function testSaveMessageToDisk() {
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

  // pref tuning: one connection only, turn off notifications
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
  Services.prefs.setIntPref("mail.server.server1.max_cached_connections", 1);
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);
  Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
  Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);

  // Crank down the message chunk size to make test cases easier
  Services.prefs.setBoolPref("mail.server.default.fetch_by_chunks", true);
  Services.prefs.setIntPref("mail.imap.chunk_size", 1000);
  Services.prefs.setIntPref("mail.imap.min_chunk_size_threshold", 1500);
  Services.prefs.setIntPref("mail.imap.chunk_add", 0);

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
  const inbox = incomingServer.rootFolder
    .getChildNamed("INBOX")
    .QueryInterface(Ci.nsIMsgImapMailFolder);

  // Load a message on the server side.
  const fileName = "bug92111";
  const originalFile = do_get_file("../../../data/" + fileName);
  const originalFileUri = Services.io
    .newFileURI(originalFile)
    .QueryInterface(Ci.nsIFileURL);

  const mailbox = imapServer.daemon.getMailbox("INBOX");
  const message = new ImapMessage(originalFileUri.spec, mailbox.uidnext++, []);
  // report an artificially low size, like gmail and Exchange do
  message.setSize(originalFile.fileSize - 100);
  mailbox.addMessage(message);

  // Sync the message list.
  {
    const listener = new PromiseTestUtils.PromiseUrlListener();
    inbox.updateFolderWithListener(false, listener);
    await listener.promise;
  }

  // Sanity checks.
  Assert.equal([...inbox.messages].length, 1, "Inbox should contain 1 message");
  const msg = [...inbox.messages][0];
  Assert.equal(
    msg.flags & Ci.nsMsgMessageFlags.Offline,
    0,
    "Message should not be stored offline."
  );

  // Save the message to a local file.
  const saveFile = Services.dirsvc.get("IMapMD", Ci.nsIFile);
  saveFile.append(fileName + ".eml");

  const msgUri = inbox.generateMessageURI(msg.messageKey);
  const msgService = MailServices.messageServiceFromURI(msgUri);

  // The original bug behind this test (Bug 92111) was only triggered when
  // nsMsgSaveAsListener is used. The imapService saveMessageToDisk() will take
  // that path.
  // Enforcing canonicalLineEnding (CRLF) to make sure that the
  // test also runs successfully on platforms not using CRLF by default.
  const saveListener = new PromiseTestUtils.PromiseUrlListener();
  msgService.saveMessageToDisk(
    msgUri,
    saveFile,
    saveListener,
    true /* canonicalLineEnding */,
    false
  );
  await saveListener.promise;

  // File contents should not have been modified.
  const originalContent = await IOUtils.readUTF8(originalFile.path);
  const saveContent = await IOUtils.readUTF8(saveFile.path);
  Assert.equal(
    originalContent,
    saveContent,
    "Message content should be intact"
  );

  saveFile.remove(false);
});
