/*
 * Test bug 460636 - nsMsgSaveAsListener sometimes inserts extra LF characters
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var gSavedMsgFile;

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

  // From nsIMsgMessageService.idl:
  // void SaveMessageToDisk(in string aMessageURI, in nsIFile aFile,
  //                        in boolean aGenerateDummyEnvelope,
  //                        in nsIUrlListener aUrlListener, out nsIURI aURL,
  //                        in boolean canonicalLineEnding,
  //                        in nsIMsgWindow aMsgWindow);
  // Enforcing canonicalLineEnding (i.e., CRLF) makes sure that the
  const promiseUrlListener2 = new PromiseTestUtils.PromiseUrlListener();
  gIMAPService.SaveMessageToDisk(
    "imap-message://user@localhost/INBOX#" + (IMAPPump.mailbox.uidnext - 1),
    gSavedMsgFile,
    false,
    promiseUrlListener2,
    {},
    true,
    null
  );
  await promiseUrlListener2.promise;
}

async function checkSavedMessage() {
  Assert.equal(
    await IOUtils.readUTF8(gMsgFile.path),
    await IOUtils.readUTF8(gSavedMsgFile.path)
  );
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
