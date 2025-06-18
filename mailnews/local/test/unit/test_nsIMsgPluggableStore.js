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
  Assert.deepEqual(
    Array.from(rootFolder.descendants, f => f.URI).toSorted(),
    [
      `${prefix}/1ad41a64`,
      `${prefix}/Trash`, // Created automagically.
      `${prefix}/Unsent%20Messages`, // Created automagically.
      `${prefix}/file`,
      `${prefix}/test%20%CF%80`,
    ],
    "Root folder hierarchy should match expected value."
  );

  const hashedFolder = MailServices.folderLookup.getFolderForURL(
    `${prefix}/1ad41a64`
  );
  Assert.equal(hashedFolder.name, "test τ");
  Assert.equal(hashedFolder.filePath.leafName, "1ad41a64");
  Assert.equal(hashedFolder.summaryFile.leafName, "1ad41a64.msf");

  const unhashedFolder = MailServices.folderLookup.getFolderForURL(
    `${prefix}/test%20%CF%80`
  );
  Assert.equal(unhashedFolder.name, "test π");
  Assert.equal(unhashedFolder.filePath.leafName, "test π");
  Assert.equal(unhashedFolder.summaryFile.leafName, "test π.msf");
}

/**
 * Give nsIMsgPluggableStore.discoverChildFolders() a workout
 */
async function test_discoverChildFolders() {
  // Helper to create raw subfolders to discover.
  async function createTestStoreFolders(rootFolder, dirs) {
    const storeType = rootFolder.msgStore.storeType;
    for (const dir of dirs) {
      const parts = dir.split("/");
      const p = PathUtils.join(rootFolder.filePath.path, ...parts);
      if (storeType == "maildir") {
        await IOUtils.makeDirectory(p);
        await IOUtils.makeDirectory(PathUtils.join(p, "new"));
        await IOUtils.makeDirectory(PathUtils.join(p, "cur"));
      } else if (storeType == "mbox") {
        await IOUtils.writeUTF8(p, "");
      } else {
        throw new Error(`Unexpected storeType: ${storeType}`);
      }
    }
  }

  // Walk down recursively, discovering children and creating nsIMsgFolders as we go.
  const buildFolderHierarchy = function (folder) {
    const msgStore = folder.msgStore;
    const childNames = msgStore.discoverChildFolders(folder);
    for (const name of childNames) {
      // NOTE: this actually triggers folder discovery (Bug 1633955).
      // And that folder discovery will likely screw up the names.
      // But for non-tricksy names we'll be fine.
      let child = folder.getChildNamed(name);
      if (!child) {
        child = folder.addSubfolder(name);
      }
      buildFolderHierarchy(child);
    }
  };

  // Read out a nsIMsgFolder Hierarchy.
  const describeHierarchy = function (folder, desc) {
    const found = [`${desc}`];
    for (const child of folder.subFolders) {
      found.push(...describeHierarchy(child, `${desc} => ${child.name}`));
    }
    return found;
  };

  // Test cases.
  //
  // Note: we use ' => ' instead of '/' as we're not escaping path
  // components so don't want to portray these strings as proper paths!.
  // "Unsent Messages" and "Trash" are automatically created.
  const defaultFolders = ["ROOT", "ROOT => Unsent Messages", "ROOT => Trash"];
  const testCases = [
    // No children.
    {
      dirs: [],
      expect: defaultFolders,
    },
    // Two levels of children.
    {
      dirs: ["foo", "foo.sbd/bar", "foo.sbd/bar.sbd/wibble"],
      expect: [
        ...defaultFolders,
        "ROOT => foo",
        "ROOT => foo => bar",
        "ROOT => foo => bar => wibble",
      ],
    },
    /*
     * These should work, but right now these names will screw things
     * up during DB creation:
     *
     *{
     *  dirs: ["I%2FO stuff", "I%2FO stuff.sbd/wibble", "I%2FO stuff.sbd/n%2Fa"],
     *  expect: [
     *    ...defaultFolders,
     *    "ROOT => I/O stuff",
     *    "ROOT => I/O stuff => wibble",
     *    "ROOT => I/O stuff => n/a",
     *  ],
     *},
     */
    // TODO:
    // - non-latin names
    // - forbidden names ("COM1" etc)
    // - make sure we ignore subdirs without ".sbd" suffix
    // - make sure we skip special names like "popstate.dat" et al
  ];

  for (const testCase of testCases) {
    // New environment.
    const root = create_temporary_directory();
    const rootFolder = setup_mailbox("none", root);

    // Create the raw directories, ready to be discovered.
    await createTestStoreFolders(rootFolder, testCase.dirs);

    // Discover children and create nsIMsgFolders Hierarchy.
    buildFolderHierarchy(rootFolder);

    // Now read out the nsIMsgFolder hierarchy.
    const got = describeHierarchy(rootFolder, "ROOT");

    Assert.deepEqual(got.toSorted(), testCase.expect.toSorted());
  }
}

/**
 * Load messages into a msgStore and make sure we can read
 * them back correctly using asyncScan().
 */
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

/**
 * Test that we can store flags in the store.
 * (via the X-Mozilla-Status/X-Mozilla-Status2 hack).
 */
async function test_changeFlags() {
  localAccountUtils.loadLocalMailAccount();
  try {
    const inbox = localAccountUtils.inboxFolder;
    const store = inbox.msgStore;

    const generator = new MessageGenerator();
    let msgs = generator.makeMessages({ count: 10 });
    msgs.forEach(msg => {
      msg.headers["X-Mozilla-Status"] = "0000";
      msg.headers["X-Mozilla-Status2"] = "00000000";
    });
    msgs = msgs.map(message => message.toMessageString());

    // Write the messages into the store
    const tokens = [];
    for (const msg of msgs) {
      const out = store.getNewMsgOutputStream(inbox);
      out.write(msg, msg.length);
      tokens.push(store.finishNewMessage(inbox, out));
    }

    const f = Ci.nsMsgMessageFlags;
    const testCases = [
      // Change lower 16 bits only:
      { flags: f.Read, lo: "0001", hi: "00000000" },

      // Change upper 16 bits only:
      { flags: f.MDNReportSent, lo: "0000", hi: "00800000" },

      // Change both (but X-Mozilla-Status2 never stores low 16 bits!):
      { flags: f.Read | f.MDNReportSent, lo: "0001", hi: "00800000" },

      // These ones are RuntimeOnly flags and should never appear in the
      // X-Mozilla-Status headers:
      { flags: f.Elided, lo: "0000", hi: "00000000" },
      { flags: f.New, lo: "0000", hi: "00000000" },
      { flags: f.Offline, lo: "0000", hi: "00000000" },

      // Lots of flags:
      {
        flags:
          f.Read |
          f.Replied |
          f.Marked |
          f.Expunged |
          f.MDNReportSent |
          f.IMAPDeleted,
        lo: "000f",
        hi: "00a00000",
      },

      // Lots of flags + RuntimeOnly ones:
      {
        flags:
          f.Elided |
          f.New |
          f.Offline |
          f.Read |
          f.Replied |
          f.Marked |
          f.Expunged |
          f.MDNReportSent |
          f.IMAPDeleted,
        lo: "000f",
        hi: "00a00000",
      },

      // No flags (we'll also use this to test that we're back to the
      // original message data - see below).
      { flags: 0, lo: "0000", hi: "00000000" },
    ];

    for (const t of testCases) {
      // Use the same flag for all messages.
      const flagArray = Array(msgs.length).fill(t.flags, 0);
      store.changeFlags(inbox, tokens, flagArray);

      // Read back all messages and check the flags are stored as we expect.
      const listener = new PromiseTestUtils.PromiseStoreScanListener();
      store.asyncScan(inbox, listener);
      await listener.promise;

      for (const msg of listener.messages) {
        const lo = msg.match(/X-Mozilla-Status:\s*([0-9a-fA-Z]+)/)[1];
        Assert.equal(
          lo.toLowerCase(),
          t.lo.toLowerCase(),
          "X-Mozilla-Status should have expected value"
        );
        const hi = msg.match(/X-Mozilla-Status2:\s*([0-9a-fA-F]+)/)[1];
        Assert.equal(
          hi.toLowerCase(),
          t.hi.toLowerCase(),
          "X-Mozilla-Status2 should have expected value"
        );
      }

      if (t.flags == 0) {
        // We started off with clear flags, so we should be back where we
        // started and can check there's been no message corruption.
        Assert.deepEqual(
          msgs.toSorted(),
          listener.messages.toSorted(),
          "Messages should survive intact."
        );
      }
    }
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
  add_task(withStore(store, test_discoverChildFolders));
  add_task(withStore(store, test_discoverSubFolders));
  add_task(withStore(store, test_asyncScan));
  add_task(withStore(store, test_basicReadWrite));
  add_task(withStore(store, test_discardWrites));
  add_task(withStore(store, test_oneWritePerFolder));
  add_task(withStore(store, test_multiFolderWriting));
  add_task(withStore(store, test_changeFlags));
}
