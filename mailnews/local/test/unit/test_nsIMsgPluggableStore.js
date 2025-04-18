/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

// Helper to read a stream until EOF, returning the contents as a string.
function readAll(inStream) {
  const sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
  sstream.init(inStream);
  let data = "";
  let str = sstream.read(1024 * 16);
  while (str.length > 0) {
    data += str;
    str = sstream.read(1024 * 16);
  }
  sstream.close();
  return data;
}

/**
 * nsIMsgPluggableStore interface tests
 */

function test_discoverSubFolders() {
  const directory = create_temporary_directory();

  // Just an ordinary folder with an ordinary name.
  const file = directory.clone();
  // Create a directory for maildir stores to find.
  file.append("file");
  file.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
  // And a summary file.
  file.leafName += ".msf";
  file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);

  // A folder with a name that once was hashed by NS_MsgHashIfNecessary.
  // This name no longer needs hashing but this test is making sure it still
  // works with the hashed file names.
  const hashedFile = directory.clone();
  hashedFile.append("1ad41a64");
  hashedFile.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
  // Copy the summary file containing the folder's real name.
  do_get_file("data/hashedFolder.msf").copyTo(directory, "1ad41a64.msf");

  // A folder with a name that used to require hashing (on Windows).
  // This is only really here for completeness.
  const unhashedFile = directory.clone();
  unhashedFile.append("test π");
  unhashedFile.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
  unhashedFile.leafName += ".msf";
  unhashedFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);

  const rootFolder = setup_mailbox("none", directory);
  rootFolder.msgStore.discoverSubFolders(rootFolder, true);

  const prefix = rootFolder.URI;
  Assert.deepEqual(Array.from(rootFolder.descendants, f => f.URI).toSorted(), [
    `${prefix}/1ad41a64`,
    `${prefix}/Trash`, // Created automagically.
    `${prefix}/Unsent%20Messages`, // Created automagically.
    `${prefix}/file`,
    `${prefix}/test%20%CF%80`,
  ]);

  const hashedFolder = MailServices.folderLookup.getFolderForURL(
    `${prefix}/1ad41a64`
  );
  Assert.equal(hashedFolder.name, "test τ");
  Assert.equal(hashedFolder.prettyName, "test τ");
  Assert.equal(hashedFolder.filePath.leafName, "1ad41a64");
  Assert.equal(hashedFolder.summaryFile.leafName, "1ad41a64.msf");

  const unhashedFolder = MailServices.folderLookup.getFolderForURL(
    `${prefix}/test%20%CF%80`
  );
  Assert.equal(unhashedFolder.name, "test π");
  Assert.equal(unhashedFolder.prettyName, "test π");
  Assert.equal(unhashedFolder.filePath.leafName, "test π");
  Assert.equal(unhashedFolder.summaryFile.leafName, "test π.msf");
}

// Load messages into a msgStore and make sure we can read
// them back correctly using asyncScan().
async function test_asyncScan() {
  const msg1 =
    "To: bob@invalid\r\n" +
    "From: alice@invalid\r\n" +
    "Subject: Hello\r\n" +
    "\r\n" +
    "Hello, Bob! Haven't heard\r\n" +
    "From you in a while...\r\n"; // escaping will be required on this line.

  const msg2 =
    "To: alice@invalid\r\n" +
    "From: bob@invalid\r\n" +
    "Subject: Re: Hello\r\n" +
    "\r\n" +
    "Hi there Alice! All good here.\r\n";

  const testCases = [
    [msg1],
    [msg1, msg2],
    [], // Empty mbox.
  ];

  for (const messages of testCases) {
    // NOTE: we should be able to create stand-alone msgStore to run tests on,
    // but currently they are tightly coupled with folders, msgDB et al...
    // Bug 1714472 should sort that out and strip away some of this gubbins.
    localAccountUtils.loadLocalMailAccount();
    const inbox = localAccountUtils.inboxFolder;

    // Populate the folder with the test messages.

    inbox.addMessageBatch(messages);

    // Perform an async scan on the folder, and make sure we get back all
    // the messages we put in.
    const listener = new PromiseTestUtils.PromiseStoreScanListener();
    inbox.msgStore.asyncScan(inbox, listener);
    await listener.promise;

    // Note: can't rely on message ordering (especially on maildir).
    Assert.deepEqual(listener.messages.toSorted(), messages.toSorted());

    // Clear up so we can run again on different store type.
    localAccountUtils.clearAll();
  }
}

/**
 * Test that we can write messages and read them back without loss.
 */
async function test_basicReadWrite() {
  localAccountUtils.loadLocalMailAccount();
  try {
    const inbox = localAccountUtils.inboxFolder;
    const store = inbox.msgStore;

    // Generate some messages.
    const generator = new MessageGenerator();
    const msgs = generator
      .makeMessages({ count: 10 })
      .map(message => message.toMessageString());

    // Write them.
    const tokens = [];
    for (const msg of msgs) {
      const out = store.getNewMsgOutputStream(inbox);
      out.write(msg, msg.length);
      const storeToken = store.finishNewMessage(inbox, out);
      tokens.push(storeToken);
    }

    // Read them back.
    for (let i = 0; i < msgs.length; ++i) {
      const stream = store.getMsgInputStream(inbox, tokens[i], 0);
      const got = readAll(stream);
      Assert.equal(msgs[i], got);
    }
  } finally {
    localAccountUtils.clearAll();
  }
}

/**
 * Test that writes can be discarded.
 */
async function test_discardWrites() {
  localAccountUtils.loadLocalMailAccount();
  try {
    const inbox = localAccountUtils.inboxFolder;
    const store = inbox.msgStore;

    // Generate some messages.
    const generator = new MessageGenerator();
    const msgs = generator
      .makeMessages({ count: 2 })
      .map(message => message.toMessageString());

    // Write every second one.
    const okTokens = [];
    const okMsgs = [];
    for (let i = 0; i < msgs.length; ++i) {
      const out = store.getNewMsgOutputStream(inbox);
      if (i % 2) {
        // Write the message as normal.
        out.write(msgs[i], msgs[i].length);
        okTokens.push(store.finishNewMessage(inbox, out));
        okMsgs.push(msgs[i]);
      } else {
        // Write half, then bail.
        out.write(msgs[i], msgs[i].length / 2);
        store.discardNewMessage(inbox, out);
      }
    }

    // Read back all messages.
    const listener = new PromiseTestUtils.PromiseStoreScanListener();
    store.asyncScan(inbox, listener);
    await listener.promise;

    Assert.equal(
      listener.messages.length,
      okMsgs.length,
      "Expect non-discarded messages"
    );
    Assert.deepEqual(
      listener.messages.toSorted(),
      okMsgs.toSorted(),
      "Expect non-discarded messages"
    );
    Assert.deepEqual(
      listener.tokens.toSorted(),
      okTokens.toSorted(),
      "Expect tokens from non-discarded messages"
    );
  } finally {
    localAccountUtils.clearAll();
  }
}

/**
 * Test that we can only have one outstanding write per folder.
 */
async function test_oneWritePerFolder() {
  localAccountUtils.loadLocalMailAccount();
  try {
    const inbox = localAccountUtils.inboxFolder;
    const store = inbox.msgStore;

    // Generate some messages.
    const generator = new MessageGenerator();
    const msgs = generator
      .makeMessages({ count: 2 })
      .map(message => message.toMessageString());

    const out1 = store.getNewMsgOutputStream(inbox);
    const out2 = store.getNewMsgOutputStream(inbox);
    // out1 should have been closed to allow out2 to proceed.
    await Assert.throws(
      () => out1.write(msgs[0], msgs[0].length),
      /NS_BASE_STREAM_CLOSED/,
      "out1 should have been closed."
    );
    // out2 should be valid.
    out2.write(msgs[1], msgs[1].length);
    const token2 = store.finishNewMessage(inbox, out2);

    // Read back all messages - should be no trace of out1 writing.
    const listener = new PromiseTestUtils.PromiseStoreScanListener();
    store.asyncScan(inbox, listener);
    await listener.promise;

    Assert.equal(
      listener.messages.length,
      1,
      "Store should only contain one message."
    );
    Assert.equal(
      listener.messages[0],
      msgs[1],
      "Message should be what was written via out2."
    );
    Assert.equal(
      listener.tokens[0],
      token2,
      "Message should have expected storeToken."
    );
  } finally {
    localAccountUtils.clearAll();
  }
}

/**
 * Test that we can have multiple writes going at once, as long as they're
 * in different folders.
 */
async function test_multiFolderWriting() {
  localAccountUtils.loadLocalMailAccount();
  try {
    const inbox = localAccountUtils.inboxFolder;
    const store = inbox.msgStore;

    const folder1 =
      localAccountUtils.rootFolder.createLocalSubfolder("folder1");
    const folder2 =
      localAccountUtils.rootFolder.createLocalSubfolder("folder2");

    // Generate some messages.
    const generator = new MessageGenerator();
    const msgs = generator
      .makeMessages({ count: 2 })
      .map(message => message.toMessageString());

    const out1 = store.getNewMsgOutputStream(folder1);
    const out2 = store.getNewMsgOutputStream(folder2);
    out1.write(msgs[0], msgs[0].length);
    out2.write(msgs[1], msgs[1].length);
    store.finishNewMessage(folder1, out1);
    store.finishNewMessage(folder2, out2);

    // Check folder1.
    const listener1 = new PromiseTestUtils.PromiseStoreScanListener();
    store.asyncScan(folder1, listener1);
    await listener1.promise;
    Assert.deepEqual(
      listener1.messages,
      [msgs[0]],
      "folder1 should contain single message"
    );

    // Check folder2.
    const listener2 = new PromiseTestUtils.PromiseStoreScanListener();
    store.asyncScan(folder2, listener2);
    await listener2.promise;
    Assert.deepEqual(
      listener2.messages,
      [msgs[1]],
      "folder2 should contain single message"
    );
  } finally {
    localAccountUtils.clearAll();
  }
}

// Return a wrapper which sets the store type before running fn().
function withStore(store, fn) {
  return async () => {
    Services.prefs.setCharPref("mail.serverDefaultStoreContractID", store);
    dump(`*** Running ${fn.name} against ${store} ***\n`);
    await fn();
  };
}

for (const store of localAccountUtils.pluggableStores) {
  add_task(withStore(store, test_discoverSubFolders));
  add_task(withStore(store, test_asyncScan));
  add_task(withStore(store, test_basicReadWrite));
  add_task(withStore(store, test_discardWrites));
  add_task(withStore(store, test_oneWritePerFolder));
  add_task(withStore(store, test_multiFolderWriting));
}
