/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for nsIMsgPluggableStore compaction support.
 * Tests _only_ the mailstore side - no folder/db involvement!
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

/**
 * Helper to calculate a checksum for a file.
 *
 * @param {string} fileName - Full path to file.
 * @returns {string} checksum of the file contents.
 */
async function fileChecksum(fileName) {
  const md5 = Cc["@mozilla.org/security/hash;1"].createInstance(
    Ci.nsICryptoHash
  );
  md5.init(Ci.nsICryptoHash.MD5);
  const raw = await IOUtils.read(fileName);
  md5.update(raw, raw.byteLength);
  return md5.finish(true);
}

/**
 * Helper class to provide async listener for store compaction.
 */
class PromiseStoreCompactListener {
  QueryInterface = ChromeUtils.generateQI(["nsIStoreCompactListener"]);
  #promise = Promise.withResolvers();

  onCompactionBegin() {}
  onRetentionQuery(_storeToken) {
    // By default, keep all messages.
    return true;
  }
  onMessageRetained(_oldToken, _newToken, _newSize) {}
  onCompactionComplete(status, _oldSize, _newSize) {
    if (status == Cr.NS_OK) {
      this.#promise.resolve();
    } else {
      this.#promise.reject(status);
    }
  }
  get promise() {
    return this.#promise.promise;
  }
}

/**
 * Test that discarding all messages yields an empty store.
 */
async function test_discardAll() {
  // NOTE: we should be able to create stand-alone msgStore to run tests on,
  // but currently they are tightly coupled with folders, msgDB et al...
  // Bug 1714472 should sort that out and strip away some of this cruft.
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  Assert.ok(inbox.msgStore.supportsCompaction);

  const generator = new MessageGenerator();
  inbox.addMessageBatch(
    generator
      .makeMessages({ count: 10 })
      .map(message => message.toMessageString())
  );

  const compactListener = new PromiseStoreCompactListener();
  // Monkey-patch to discard all messages.
  compactListener.onRetentionQuery = function (_storeToken) {
    return false;
  };

  inbox.msgStore.asyncCompact(inbox, compactListener, true);
  await compactListener.promise;

  Assert.equal(inbox.filePath.fileSize, 0, "should be left with an empty mbox");

  // Clear up so we can run again on different store type.
  localAccountUtils.clearAll();
}

/**
 * Test that throwing errors in listener callbacks leaves mbox untouched.
 */
async function test_listenerErrors() {
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  Assert.ok(inbox.msgStore.supportsCompaction);

  const generator = new MessageGenerator();
  inbox.addMessageBatch(
    generator
      .makeMessages({ count: 10 })
      .map(message => message.toMessageString())
  );

  // Checksum the mbox file before we do anything.
  const checksumBefore = await fileChecksum(inbox.filePath.path);

  // Run compaction, failing listener callback in turn.
  // We'll use an arbitrary but identifable code: NS_ERROR_CRYPTOMINING_URI.
  {
    // Check that onCompactionBegin() can abort.
    const l = new PromiseStoreCompactListener();
    l.onCompactionBegin = function () {
      throw Components.Exception("", Cr.NS_ERROR_CRYPTOMINING_URI);
    };
    inbox.msgStore.asyncCompact(inbox, l, true);
    await Assert.rejects(l.promise, e => {
      return e === Cr.NS_ERROR_CRYPTOMINING_URI;
    });
    // Unchanged mbox file?
    const checksumAfter = await fileChecksum(inbox.filePath.path);
    Assert.equal(checksumBefore, checksumAfter);
  }

  {
    // Check that onRetentionQuery() can abort.
    const l = new PromiseStoreCompactListener();
    l.onRetentionQuery = function (_storeToken) {
      throw Components.Exception("", Cr.NS_ERROR_CRYPTOMINING_URI);
    };
    inbox.msgStore.asyncCompact(inbox, l, true);
    await Assert.rejects(l.promise, e => {
      return e === Cr.NS_ERROR_CRYPTOMINING_URI;
    });
    // Unchanged mbox file?
    const checksumAfter = await fileChecksum(inbox.filePath.path);
    Assert.equal(checksumBefore, checksumAfter);
  }

  {
    // Check that onMessageRetained() can abort.
    const l = new PromiseStoreCompactListener();
    l.onMessageRetained = function (_oldToken, _newToken, _newSize) {
      throw Components.Exception("", Cr.NS_ERROR_CRYPTOMINING_URI);
    };
    inbox.msgStore.asyncCompact(inbox, l, true);
    await Assert.rejects(l.promise, e => {
      return e === Cr.NS_ERROR_CRYPTOMINING_URI;
    });
    // Unchanged mbox file?
    const checksumAfter = await fileChecksum(inbox.filePath.path);
    Assert.equal(checksumBefore, checksumAfter);
  }

  // Don't bother failing onCompactionComplete() - the compaction is already
  // complete by then.

  // Clear up so we can run again on different store type.
  localAccountUtils.clearAll();
}

/**
 * Test that mbox is left untouched if we fail after retaining some messages.
 */
async function test_midwayFail() {
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  Assert.ok(inbox.msgStore.supportsCompaction);

  // Some test messages.
  const numMessages = 50;
  const generator = new MessageGenerator();
  inbox.addMessageBatch(
    generator
      .makeMessages({ count: numMessages })
      .map(message => message.toMessageString())
  );

  // Checksum the mbox file before we do anything.
  const checksumBefore = await fileChecksum(inbox.filePath.path);

  // Monkey-patch a listener to keep every other message then fail
  // half way through.
  const l = new PromiseStoreCompactListener();
  l.queriedCount = 0;
  l.onRetentionQuery = function (_storeToken) {
    ++this.queriedCount;
    return (this.queriedCount & 1) == 0;
  };
  l.onMessageRetained = function (_oldToken, _newToken, _newSize) {
    // Abort halfway through.
    if (this.queriedCount >= numMessages / 2) {
      throw Components.Exception("", Cr.NS_ERROR_CRYPTOMINING_URI);
    }
  };

  // Go!
  inbox.msgStore.asyncCompact(inbox, l, true);
  await Assert.rejects(l.promise, e => {
    return e === Cr.NS_ERROR_CRYPTOMINING_URI;
  });

  // Unchanged mbox file?
  const checksumAfter = await fileChecksum(inbox.filePath.path);
  Assert.equal(checksumBefore, checksumAfter);

  localAccountUtils.clearAll();
}

/**
 * Test that onCompactionComplete returns sensible before and after sizes.
 * See Bug 1900172.
 */
async function test_sizesAtCompletion() {
  localAccountUtils.loadLocalMailAccount();
  const inbox = localAccountUtils.inboxFolder;

  Assert.ok(inbox.msgStore.supportsCompaction);

  const generator = new MessageGenerator();
  inbox.addMessageBatch(
    generator
      .makeMessages({ count: 50 })
      .map(message => message.toMessageString())
  );

  let info = await IOUtils.stat(inbox.filePath.path);
  const oldFileSize = info.size;

  // Monkey-patch listener to discard every second message and to note
  // sizes upon completion.
  const l = new PromiseStoreCompactListener();
  l.msgCount = 0;
  l.onRetentionQuery = function (_storeToken) {
    ++this.msgCount;
    return this.msgCount % 2 == 0;
  };
  l._onCompactionComplete = l.onCompactionComplete;
  l.onCompactionComplete = function (status, oldSize, newSize) {
    this.newSize = newSize;
    this.oldSize = oldSize;
    this._onCompactionComplete(status, oldSize, newSize);
  };

  inbox.msgStore.asyncCompact(inbox, l, true);
  await l.promise;

  // NOTE: We avoid the use of inbox.filePath.fileSize because of
  // nsIfile stat caching under windows (Bug 456603).
  info = await IOUtils.stat(inbox.filePath.path);
  const newFileSize = info.size;

  Assert.equal(oldFileSize, l.oldSize, "reported oldSize matches filesize");
  Assert.equal(newFileSize, l.newSize, "reported newSize matches filesize");

  localAccountUtils.clearAll();
}

// TODO
// More test ideas:
// - Test X-Mozilla-* header patching (higher-level folder-compact tests
//   already cover this, but it'd probably be cleaner doing it here).

// Return a wrapper which sets the store type before running fn().
function withStore(store, fn) {
  return async () => {
    Services.prefs.setCharPref("mail.serverDefaultStoreContractID", store);
    await fn();
  };
}

// Only mbox has compaction. For now. It is possible others might in future.
const mboxStore = "@mozilla.org/msgstore/berkeleystore;1";
add_task(withStore(mboxStore, test_discardAll));
add_task(withStore(mboxStore, test_listenerErrors));
add_task(withStore(mboxStore, test_midwayFail));
add_task(withStore(mboxStore, test_sizesAtCompletion));
