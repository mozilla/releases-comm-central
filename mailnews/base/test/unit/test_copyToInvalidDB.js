/*
 * Simple tests for copying local messages to a folder whose db is missing
 * or invalid
 */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

async function setup() {
  const createSubfolder = async function (parentFolder, name) {
    const promiseAdded = PromiseTestUtils.promiseFolderAdded(name);
    parentFolder.createSubfolder(name, null);
    await promiseAdded;
    return parentFolder.getChildNamed(name);
  };

  // Create account.
  const account = MailServices.accounts.createLocalMailAccount();
  const root = account.incomingServer.rootFolder;

  // Add a couple of folders containing some test messages.
  const folder1 = await createSubfolder(root, "test1");
  folder1.QueryInterface(Ci.nsIMsgLocalMailFolder);

  const folder2 = await createSubfolder(root, "test2");
  folder2.QueryInterface(Ci.nsIMsgLocalMailFolder);

  const gen = new MessageGenerator();
  const msg1 = gen.makeMessage();
  const msg2 = gen.makeMessage({ inReplyTo: msg1 });
  folder1.addMessageBatch([msg1, msg2].map(m => m.toMessageString()));

  const msg3 = gen.makeMessage();
  folder2.addMessage(msg3.toMessageString());

  return [folder1, folder2];
}

add_task(async function test_copyToInvalidDB() {
  const [folder1, folder2] = await setup();

  // folder1 contains [msg1, msg2].
  // folder2 contains [msg3].

  // Take note of the message we're going to move (first msg in folder1).
  const msgHdr = Array.from(folder1.msgDatabase.enumerateMessages())[0];
  const expectedID = msgHdr.messageId;
  const expectedMsg = mailTestUtils.loadMessageToString(folder1, msgHdr);

  // Sabotage the destination folder2 database.
  folder2.msgDatabase.summaryValid = false;
  folder2.msgDatabase = null;
  folder2.ForceDBClosed();
  // In fact, delete the .msf file entirely.
  folder2.summaryFile.remove(false);

  // So folder2 has no trace of a DB.
  Assert.equal(folder2.databaseOpen, false);
  Assert.equal(folder2.summaryFile.exists(), false);

  // Move the message from folder1 to folder2.
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
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

  // Current behaviour:
  // After the move, there's still no sign of a DB file.
  // Yet the copy didn't fail (see Bug 1737203).
  Assert.equal(folder2.databaseOpen, false);
  Assert.equal(folder2.summaryFile.exists(), false);

  // Rebuild the the database.
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  try {
    folder2.getDatabaseWithReparse(urlListener, null);
  } catch (ex) {
    // We expect this - it indicates the DB is not valid. But it will have
    // kicked off an async reparse, so we need to wait for the listener.
    Assert.equal(ex.result, Cr.NS_ERROR_NOT_INITIALIZED);
    await urlListener.promise;
  }
  Assert.equal(folder2.summaryFile.exists(), true);

  // Check that the message moved over intact.
  const gotHdr = folder2.msgDatabase.getMsgHdrForMessageID(expectedID);
  const gotMsg = mailTestUtils.loadMessageToString(folder2, gotHdr);
  // NOTE: With maildir store, the message seems to gain an extra trailing
  // "\n" during the copy. See Bug 1716651.
  // For now, use .trim() as a workaround.
  Assert.equal(gotMsg.trim(), expectedMsg.trim());
});
