/**
 * Test bug 92111 - imap download-by-chunks doesn't download complete file if the
 * server lies about rfc822.size (known to happen for Exchange and gmail)
 */

var gIMAPDaemon, gServer, gIMAPIncomingServer, gSavedMsgFile;

var gIMAPService = Cc[
  "@mozilla.org/messenger/messageservice;1?type=imap"
].getService(Ci.nsIMsgMessageService);

var gFileName = "bug92111";
var gMsgFile = do_get_file("../../../data/" + gFileName);

add_task(async function run_the_test() {
  /*
   * Set up an IMAP server. The bug is only triggered when nsMsgSaveAsListener
   * is used (i.e., for IMAP and NNTP).
   */
  gIMAPDaemon = new ImapDaemon();
  gServer = makeServer(gIMAPDaemon, "");
  gIMAPIncomingServer = createLocalIMAPServer(gServer.port);

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

  var inbox = gIMAPDaemon.getMailbox("INBOX");

  /*
   * Ok, prelude done. Read the original message from disk
   * (through a file URI), and add it to the Inbox.
   */
  var msgfileuri = Services.io
    .newFileURI(gMsgFile)
    .QueryInterface(Ci.nsIFileURL);

  const message = new ImapMessage(msgfileuri.spec, inbox.uidnext++, []);
  // report an artificially low size, like gmail and Exchange do
  message.setSize(gMsgFile.fileSize - 100);
  inbox.addMessage(message);

  // Save the message to a local file. IMapMD corresponds to
  // <profile_dir>/mailtest/ImapMail (where fakeserver puts the IMAP mailbox
  // files). If we pass the test, we'll remove the file afterwards
  // (cf. UrlListener), otherwise it's kept in IMapMD.
  gSavedMsgFile = Services.dirsvc.get("IMapMD", Ci.nsIFile);
  gSavedMsgFile.append(gFileName + ".eml");

  do_test_pending();
  do_timeout(10000, function () {
    do_throw(
      "saveMessageToDisk did not complete within 10 seconds" +
        "(incorrect messageURI?). ABORTING."
    );
  });

  // Enforcing canonicalLineEnding (i.e., CRLF) makes sure that the
  // test also runs successfully on platforms not using CRLF by default.
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  gIMAPService.saveMessageToDisk(
    "imap-message://user@localhost/INBOX#" + (inbox.uidnext - 1),
    gSavedMsgFile,
    false,
    promiseUrlListener,

    true,
    null
  );
  await promiseUrlListener.promise;

  const msgFileContent = await IOUtils.readUTF8(gMsgFile.path);
  const savedMsgFileContent = await IOUtils.readUTF8(gSavedMsgFile.path);
  // File contents should not have been modified.
  Assert.equal(msgFileContent, savedMsgFileContent);

  // The file doesn't get closed straight away, but does after a little bit.
  // So wait, and then remove it. We need to test this to ensure we don't
  // indefinitely lock the file.
  do_timeout(1000, endTest);
});

function endTest() {
  gIMAPIncomingServer.closeCachedConnections();
  gServer.stop();
  var thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }

  try {
    gSavedMsgFile.remove(false);
  } catch (ex) {
    dump(ex);
    do_throw(ex);
  }
  do_test_finished();
}

// XXX IRVING we need a separate check somehow to make sure we store the correct
// content size for chunked messages where the server lied
