/*
 * Test bug 460636 - nsMsgSaveAsListener sometimes inserts extra LF characters
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var gSavedMsgFile;
var gReservedPermissions;

var gIMAPService = Cc[
  "@mozilla.org/messenger/messageservice;1?type=imap"
].getService(Ci.nsIMsgMessageService);

var gFileName = "bug460636";
var gMsgFile = do_get_file("../../../data/" + gFileName);

add_task(async function run_the_test() {
  await setup();
  await checkSavedMessage();
  teardown();
});

async function setup() {
  setupIMAPPump();

  // Ok, prelude done. Read the original message from disk
  // (through a file URI), and add it to the Inbox.
  var msgfileuri = Services.io
    .newFileURI(gMsgFile)
    .QueryInterface(Ci.nsIFileURL);

  IMAPPump.mailbox.addMessage(
    new ImapMessage(msgfileuri.spec, IMAPPump.mailbox.uidnext++, [])
  );
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  await promiseUrlListener.promise;

  // Save the message to a local file. IMapMD corresponds to
  // <profile_dir>/mailtest/ImapMail (where fakeserver puts the IMAP mailbox
  // files). If we pass the test, we'll remove the file afterwards
  // (cf. UrlListener), otherwise it's kept in IMapMD.
  gSavedMsgFile = Services.dirsvc.get("IMapMD", Ci.nsIFile);
  gSavedMsgFile.append(gFileName + ".eml");

  // The front end reserves the file name before saving by creating the file.
  // The save has to write into that file in place, keeping both the
  // reservation and its permissions, rather than replacing it.
  await IOUtils.writeUTF8(gSavedMsgFile.path, "reserved by the caller\n");
  await IOUtils.setPermissions(gSavedMsgFile.path, 0o640);
  gReservedPermissions = (await IOUtils.stat(gSavedMsgFile.path)).permissions;

  const msg = [...IMAPPump.inbox.messages][0];

  const promiseUrlListener2 = new PromiseTestUtils.PromiseUrlListener();
  gIMAPService.saveMessageToDisk(
    IMAPPump.inbox.getUriForMsg(msg),
    gSavedMsgFile,
    promiseUrlListener2,
    true, // Enforcing canonicalLineEnding (i.e., CRLF).
    null
  );
  await promiseUrlListener2.promise;
}

async function checkSavedMessage() {
  Assert.equal(
    await IOUtils.readUTF8(gMsgFile.path),
    await IOUtils.readUTF8(gSavedMsgFile.path)
  );
  // Windows does not have POSIX permissions.
  if (Services.appinfo.OS != "WINNT") {
    Assert.equal(
      (await IOUtils.stat(gSavedMsgFile.path)).permissions,
      gReservedPermissions,
      "permissions of the reserved file should be kept"
    );
  }
}

function teardown() {
  try {
    gSavedMsgFile.remove(false);
  } catch (ex) {
    dump(ex);
    do_throw(ex);
  }
  teardownIMAPPump();
}
