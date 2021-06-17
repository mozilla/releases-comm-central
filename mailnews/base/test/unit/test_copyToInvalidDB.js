/*
 * Simple tests for copying local messages to a folder whose db is missing
 * or invalid
 */

const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

async function setup() {
  let createSubfolder = async function(parentFolder, name) {
    let promiseAdded = PromiseTestUtils.promiseFolderAdded(name);
    parentFolder.createSubfolder(name, null);
    await promiseAdded;
    return parentFolder.getChildNamed(name);
  };

  // Create account.
  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.FindAccountForServer(
    MailServices.accounts.localFoldersServer
  );
  let root = account.incomingServer.rootFolder;

  // Add a couple of folders containing some test messages.
  let folder1 = await createSubfolder(root, "test1");
  folder1.QueryInterface(Ci.nsIMsgLocalMailFolder);

  let folder2 = await createSubfolder(root, "test2");
  folder2.QueryInterface(Ci.nsIMsgLocalMailFolder);

  let gen = new MessageGenerator();
  let msg1 = gen.makeMessage();
  let msg2 = gen.makeMessage({ inReplyTo: msg1 });
  folder1.addMessageBatch([msg1, msg2].map(m => m.toMboxString()));

  let msg3 = gen.makeMessage();
  folder2.addMessage(msg3.toMboxString());

  return [folder1, folder2];
}

add_task(async function test_copyToInvalidDB() {
  let [folder1, folder2] = await setup();

  // Sabotage the destination folder database.
  folder2.msgDatabase.summaryValid = false;
  folder2.msgDatabase = null;
  folder2.ForceDBClosed();
  let dbPath = folder2.filePath;
  dbPath.leafName = dbPath.leafName + ".msf";
  dbPath.remove(false);
  folder2.msgDatabase = null;

  // Take note of the message we're going to move (first msg in folder1).
  let msgHdr = Array.from(folder1.msgDatabase.EnumerateMessages())[0];
  let expectedID = msgHdr.messageId;
  let expectedMsg = mailTestUtils.loadMessageToString(folder1, msgHdr);

  // Move the message from folder1 to folder2.
  let copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    folder1,
    [msgHdr],
    folder2,
    true, // isMove
    copyListener,
    null, // window
    false // allowUndo
  );
  await copyListener.promise;

  // Rebuild the the database.
  let urlListener = new PromiseTestUtils.PromiseUrlListener();
  try {
    folder2.getDatabaseWithReparse(urlListener, null);
  } catch (ex) {
    // We expect this - it indicates the DB is not valid. But it will have
    // kicked off an async reparse, so we need to wait for the listener.
    Assert.equal(ex.result, Cr.NS_ERROR_NOT_INITIALIZED);
    await urlListener.promise;
  }

  // Check that the message moved over intact.
  let gotHdr = folder2.msgDatabase.getMsgHdrForMessageID(expectedID);
  let gotMsg = mailTestUtils.loadMessageToString(folder2, gotHdr);
  // NOTE: With maildir store, the message seems to gain an extra trailing
  // "\n" during the copy. See Bug 1716651.
  // For now, use .trim() as a workaround.
  Assert.equal(gotMsg.trim(), expectedMsg.trim());
});
