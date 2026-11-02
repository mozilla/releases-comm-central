/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that a write which has been pre-empted by a later
 * getNewMsgOutputStream() call on the same folder can neither be committed
 * nor discard the write that pre-empted it, whether or not that write is
 * still ongoing: finishNewMessage() must fail with NS_ERROR_ABORT, and
 * discardNewMessage() must succeed without touching anything else.
 */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

// Helper to read a stream until EOF, returning the contents as a string.
function readAll(inStream) {
  const sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
  sstream.init(inStream);
  let data = "";
  let str = sstream.read(1024 * 16);
  while (str.length) {
    data += str;
    str = sstream.read(1024 * 16);
  }
  sstream.close();
  return data;
}

/**
 * Starts writing message A, then pre-empts it by starting to write message B
 * in the same folder.
 *
 * @param {nsIMsgPluggableStore} store
 * @param {nsIMsgFolder} folder
 * @returns {{msgA: string, msgB: string, outA: nsIOutputStream, outB: nsIOutputStream}}
 */
function startPreemptedWrite(store, folder) {
  const generator = new MessageGenerator();
  const [msgA, msgB] = generator
    .makeMessages({ count: 2 })
    .map(message => message.toMessageString());

  const outA = store.getNewMsgOutputStream(folder);
  outA.write(msgA, msgA.length);

  // This pre-empts (and closes) outA.
  const outB = store.getNewMsgOutputStream(folder);
  outB.write(msgB, msgB.length);

  return { msgA, msgB, outA, outB };
}

/**
 * Checks that the folder only contains `msg`, under `token`.
 *
 * @param {nsIMsgPluggableStore} store
 * @param {nsIMsgFolder} folder
 * @param {string} msg
 * @param {string} token
 */
async function checkOnlyMessage(store, folder, msg, token) {
  Assert.equal(
    readAll(store.getMsgInputStream(folder, token, 0)),
    msg,
    "the storeToken of the pre-empting write should point at its own message"
  );

  const listener = new PromiseTestUtils.PromiseStoreScanListener();
  store.asyncScan(folder, listener);
  await listener.promise;
  Assert.deepEqual(
    listener.messages,
    [msg],
    "the store should only contain the message of the pre-empting write"
  );
  Assert.deepEqual(
    listener.tokens,
    [token],
    "the message should have the storeToken returned by finishNewMessage()"
  );
}

/**
 * Test that a pre-empted write can't be committed, and doesn't steal the
 * pre-empting write's message.
 */
async function test_finishPreemptedWrite() {
  localAccountUtils.loadLocalMailAccount();
  try {
    const inbox = localAccountUtils.inboxFolder;
    const store = inbox.msgStore;

    const { msgB, outA, outB } = startPreemptedWrite(store, inbox);

    // Finish the pre-empted write before the pre-empting one.
    Assert.throws(
      () => store.finishNewMessage(inbox, outA),
      /NS_ERROR_ABORT/,
      "finishing a pre-empted write should fail"
    );

    // The pre-empting write must be unaffected.
    const tokenB = store.finishNewMessage(inbox, outB);
    Assert.ok(tokenB, "finishing the pre-empting write should succeed");

    await checkOnlyMessage(store, inbox, msgB, tokenB);
  } finally {
    localAccountUtils.clearAll();
  }
}

/**
 * Test that discarding a pre-empted write succeeds, and doesn't discard the
 * pre-empting write.
 */
async function test_discardPreemptedWrite() {
  localAccountUtils.loadLocalMailAccount();
  try {
    const inbox = localAccountUtils.inboxFolder;
    const store = inbox.msgStore;

    const { msgB, outA, outB } = startPreemptedWrite(store, inbox);

    // Must not throw: the pre-empted write is already gone.
    store.discardNewMessage(inbox, outA);

    // The pre-empting write must still be ongoing, and its file intact.
    const tokenB = store.finishNewMessage(inbox, outB);
    Assert.ok(tokenB, "finishing the pre-empting write should succeed");

    await checkOnlyMessage(store, inbox, msgB, tokenB);
  } finally {
    localAccountUtils.clearAll();
  }
}

/**
 * Test that a pre-empted write can be neither committed nor discarded in a
 * harmful way after the write that pre-empted it is done.
 */
async function test_preemptedWriteAfterPreemptingFinished() {
  localAccountUtils.loadLocalMailAccount();
  try {
    const inbox = localAccountUtils.inboxFolder;
    const store = inbox.msgStore;

    const { msgB, outA, outB } = startPreemptedWrite(store, inbox);

    const tokenB = store.finishNewMessage(inbox, outB);
    Assert.ok(tokenB, "finishing the pre-empting write should succeed");

    // There is no ongoing write for the folder anymore.
    store.discardNewMessage(inbox, outA);
    Assert.throws(
      () => store.finishNewMessage(inbox, outA),
      /NS_ERROR_ABORT/,
      "finishing a pre-empted write should fail"
    );

    await checkOnlyMessage(store, inbox, msgB, tokenB);
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
  add_task(withStore(store, test_finishPreemptedWrite));
  add_task(withStore(store, test_discardPreemptedWrite));
  add_task(withStore(store, test_preemptedWriteAfterPreemptingFinished));
}
