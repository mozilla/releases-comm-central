/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the CalTransactionManager and the various CalTransaction instances.
 */

const { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
const {
  CalTransactionManager,
  CalTransaction,
  CalBatchTransaction,
  CalAddTransaction,
  CalModifyTransaction,
  CalDeleteTransaction,
} = ChromeUtils.importESModule("resource:///modules/CalTransactionManager.sys.mjs");

/**
 * Records the number of times doTransction() and undoTransction() is called.
 */
class MockCalTransaction extends CalTransaction {
  /**
   * The number of times doTransaction() was called.
   *
   * @type {number}
   */
  done = 0;

  /**
   * The number of times undoTransaction() was called.
   */
  undone = 0;

  _writable;

  constructor(writable = true) {
    super();
    this._writable = writable;
  }

  canWrite() {
    return this._writable;
  }

  async doTransaction() {
    this.done++;
  }

  async undoTransaction() {
    this.undone++;
  }
}

/**
 * Tests a list of CalMockTransactions have the expected "done" and "undone"
 * values.
 *
 * @param {CalMockTransaction[][]} batches The transaction batches to check.
 * @param {number[][][]} expected - A 3 dimensional array containing
 *  the expected "done" and "undone" values for each transaction in each batch
 *  to be tested.
 */
function doBatchTest(batches, expected) {
  for (const [batch, transactions] of batches.entries()) {
    for (const [index, trn] of transactions.entries()) {
      const [doneCount, undoneCount] = expected[batch][index];
      Assert.equal(
        trn.done,
        doneCount,
        `batch ${batch}, transaction ${index} doTransaction() called ${doneCount} times`
      );
      Assert.equal(
        trn.undone,
        undoneCount,
        `batch ${batch}, transaction ${index} undoTransaction() called ${undoneCount} times`
      );
    }
  }
}

/**
 * Tests the CalTransactionManager methods work as expected.
 */
add_task(async function test_calTransactionManager() {
  let manager = new CalTransactionManager();

  Assert.ok(!manager.canUndo(), "canUndo() returns false with an empty undo stack");
  Assert.ok(!manager.canRedo(), "canRedo() returns false with an empty redo stack");
  Assert.ok(!manager.peekUndoStack(), "peekUndoStack() returns nothing with an empty undo stack");
  Assert.ok(!manager.peekRedoStack(), "peekRedoStack() returns nothing with an empty redo stack");

  info("calling CalTransactionManager.commit()");
  const trn = new MockCalTransaction();
  await manager.commit(trn);
  Assert.equal(trn.done, 1, "doTransaction() called once");
  Assert.equal(trn.undone, 0, "undoTransaction() was not called");
  Assert.ok(manager.canUndo(), "canUndo() returned true");
  Assert.ok(!manager.canRedo(), "canRedo() returned false");
  Assert.equal(manager.peekUndoStack(), trn, "peekUndoStack() returned the transaction");
  Assert.ok(!manager.peekRedoStack(), "peekRedoStack() returned nothing");

  info("calling CalTransactionManager.undo()");
  await manager.undo();
  Assert.equal(trn.done, 1, "doTransaction() was not called again");
  Assert.equal(trn.undone, 1, "undoTransaction() was called once");
  Assert.ok(!manager.canUndo(), "canUndo() returned false");
  Assert.ok(manager.canRedo(), "canRedo() returned true");
  Assert.ok(!manager.peekUndoStack(), "peekUndoStack() returned nothing");
  Assert.equal(manager.peekRedoStack(), trn, "peekRedoStack() returned the transaction");

  info("calling CalTransactionManager.redo()");
  await manager.redo();
  Assert.equal(trn.done, 2, "doTransaction() was called again");
  Assert.equal(trn.undone, 1, "undoTransaction() was not called again");
  Assert.ok(manager.canUndo(), "canUndo() returned true");
  Assert.ok(!manager.canRedo(), "canRedo() returned false");
  Assert.equal(manager.peekUndoStack(), trn, "peekUndoStack() returned the transaction");
  Assert.ok(!manager.peekRedoStack(), "peekRedoStack() returned nothing");

  info("testing CalTransactionManager.beginBatch()");
  manager = new CalTransactionManager();

  const batch = manager.beginBatch();
  Assert.ok(batch instanceof CalBatchTransaction, "beginBatch() returned a CalBatchTransaction");
  Assert.equal(manager.undoStack[0], batch, "the CalBatchTransaction is on the undo stack");
});

/**
 * Tests the BatchTransaction works as expected.
 */
add_task(async function test_batchTransaction() {
  let batch = new CalBatchTransaction();

  Assert.ok(!batch.canWrite(), "canWrite() returns false for an empty BatchTransaction");
  await batch.commit(new MockCalTransaction());
  await batch.commit(new MockCalTransaction(false));
  await batch.commit(new MockCalTransaction());
  Assert.ok(!batch.canWrite(), "canWrite() returns false if any transaction is not writable");

  const transactions = [
    new MockCalTransaction(),
    new MockCalTransaction(),
    new MockCalTransaction(),
  ];
  batch = new CalBatchTransaction();
  for (const trn of transactions) {
    await batch.commit(trn);
  }

  Assert.ok(batch.canWrite(), "canWrite() returns true when all transactions are writable");
  info("testing commit() calls doTransaction() on each transaction in batch");
  doBatchTest(
    [transactions],
    [
      [
        [1, 0],
        [1, 0],
        [1, 0],
      ],
    ]
  );

  await batch.undoTransaction();
  info("testing undoTransaction() called on each transaction in batch");
  doBatchTest(
    [transactions],
    [
      [
        [1, 1],
        [1, 1],
        [1, 1],
      ],
    ]
  );

  await batch.doTransaction();
  info("testing doTransaction() called again on each transaction in batch");
  doBatchTest(
    [transactions],
    [
      [
        [2, 1],
        [2, 1],
        [2, 1],
      ],
    ]
  );
});

/**
 * Tests that executing multiple batch transactions in sequence works.
 */
add_task(async function test_sequentialBatchTransactions() {
  const manager = new CalTransactionManager();

  const batchTransactions = [
    [new MockCalTransaction(), new MockCalTransaction(), new MockCalTransaction()],
    [new MockCalTransaction(), new MockCalTransaction(), new MockCalTransaction()],
    [new MockCalTransaction(), new MockCalTransaction(), new MockCalTransaction()],
  ];

  const batch0 = manager.beginBatch();
  for (const trn of batchTransactions[0]) {
    await batch0.commit(trn);
  }

  const batch1 = manager.beginBatch();
  for (const trn of batchTransactions[1]) {
    await batch1.commit(trn);
  }

  const batch2 = manager.beginBatch();
  for (const trn of batchTransactions[2]) {
    await batch2.commit(trn);
  }

  doBatchTest(batchTransactions, [
    [
      [1, 0],
      [1, 0],
      [1, 0],
    ],
    [
      [1, 0],
      [1, 0],
      [1, 0],
    ],
    [
      [1, 0],
      [1, 0],
      [1, 0],
    ],
  ]);

  // Undo the top most batch.
  await manager.undo();
  doBatchTest(batchTransactions, [
    [
      [1, 0],
      [1, 0],
      [1, 0],
    ],
    [
      [1, 0],
      [1, 0],
      [1, 0],
    ],
    [
      [1, 1],
      [1, 1],
      [1, 1],
    ],
  ]);

  // Undo the next batch.
  await manager.undo();
  doBatchTest(batchTransactions, [
    [
      [1, 0],
      [1, 0],
      [1, 0],
    ],
    [
      [1, 1],
      [1, 1],
      [1, 1],
    ],
    [
      [1, 1],
      [1, 1],
      [1, 1],
    ],
  ]);

  // Undo the last batch left.
  await manager.undo();
  doBatchTest(batchTransactions, [
    [
      [1, 1],
      [1, 1],
      [1, 1],
    ],
    [
      [1, 1],
      [1, 1],
      [1, 1],
    ],
    [
      [1, 1],
      [1, 1],
      [1, 1],
    ],
  ]);

  // Redo the first batch.
  await manager.redo();
  doBatchTest(batchTransactions, [
    [
      [2, 1],
      [2, 1],
      [2, 1],
    ],
    [
      [1, 1],
      [1, 1],
      [1, 1],
    ],
    [
      [1, 1],
      [1, 1],
      [1, 1],
    ],
  ]);

  // Redo the second batch.
  await manager.redo();
  doBatchTest(batchTransactions, [
    [
      [2, 1],
      [2, 1],
      [2, 1],
    ],
    [
      [2, 1],
      [2, 1],
      [2, 1],
    ],
    [
      [1, 1],
      [1, 1],
      [1, 1],
    ],
  ]);

  // Redo the last batch.
  await manager.redo();
  doBatchTest(batchTransactions, [
    [
      [2, 1],
      [2, 1],
      [2, 1],
    ],
    [
      [2, 1],
      [2, 1],
      [2, 1],
    ],
    [
      [2, 1],
      [2, 1],
      [2, 1],
    ],
  ]);
});

/**
 * Tests CalAddTransaction executes and reverses as expected.
 */
add_task(async function test_calAddTransaction() {
  const calendar = CalendarTestUtils.createCalendar("Test", "memory");
  const event = new CalEvent();
  event.id = "test";

  const trn = new CalAddTransaction(event, calendar, null, null);
  await trn.doTransaction();

  let addedEvent = await calendar.getItem("test");
  Assert.ok(!!addedEvent, "transaction added event to the calendar");

  await trn.undoTransaction();
  addedEvent = await calendar.getItem("test");
  Assert.ok(!addedEvent, "transaction removed event from the calendar");
  CalendarTestUtils.removeCalendar(calendar);
});

/**
 * Tests CalModifyTransaction executes and reverses as expected.
 */
add_task(async function test_calModifyTransaction() {
  const calendar = CalendarTestUtils.createCalendar("Test", "memory");
  const event = new CalEvent();
  event.id = "test";
  event.title = "Event";

  const addedEvent = await calendar.addItem(event);
  Assert.ok(!!addedEvent, "event was added to the calendar");

  let modifiedEvent = addedEvent.clone();
  modifiedEvent.title = "Modified Event";

  const trn = new CalModifyTransaction(modifiedEvent, calendar, addedEvent, null);
  await trn.doTransaction();
  modifiedEvent = await calendar.getItem("test");
  Assert.ok(!!modifiedEvent);
  Assert.equal(modifiedEvent.title, "Modified Event", "transaction modified event");

  await trn.undoTransaction();
  const revertedEvent = await calendar.getItem("test");
  Assert.ok(!!revertedEvent);
  Assert.equal(revertedEvent.title, "Event", "transaction reverted event to original state");
  CalendarTestUtils.removeCalendar(calendar);
});

/**
 * Tests CalDeleteTransaction executes and reverses as expected.
 */
add_task(async function test_calDeleteTransaction() {
  const calendar = CalendarTestUtils.createCalendar("Test", "memory");
  const event = new CalEvent();
  event.id = "test";
  event.title = "Event";

  const addedEvent = await calendar.addItem(event);
  Assert.ok(!!addedEvent, "event was added to the calendar");

  const trn = new CalDeleteTransaction(addedEvent, calendar, null, null);
  await trn.doTransaction();

  const result = await calendar.getItem("test");
  Assert.ok(!result, "event was deleted from the calendar");

  await trn.undoTransaction();
  const revertedEvent = await calendar.getItem("test");
  Assert.ok(!!revertedEvent, "event was restored to the calendar");
  CalendarTestUtils.removeCalendar(calendar);
});

/**
 * Checks that a failed commit leaves successful transactions available for Undo.
 * Runs the same failure with an individual transaction and a transaction batch.
 */
add_task(async function test_failedCommitsLeaveOtherTransactions() {
  for (const batch of [false, true]) {
    const manager = new CalTransactionManager();
    const owner = batch ? manager.beginBatch() : manager;
    const first = new MockCalTransaction();
    const last = new MockCalTransaction();
    await owner.commit(first);

    // Keep one commit pending while a later commit succeeds. Failure must
    // remove the pending transaction without removing the later transaction.
    const started = Promise.withResolvers();
    const finish = Promise.withResolvers();
    const failed = new MockCalTransaction();
    failed.doTransaction = async () => {
      started.resolve();
      await finish.promise;
      throw new Error("Commit failed");
    };

    const pending = owner.commit(failed);
    await started.promise;
    await owner.commit(last);
    finish.resolve();

    await Assert.rejects(pending, /Commit failed/, "The pending commit should report its failure.");
    Assert.deepEqual(
      batch ? owner.transactions : manager.undoStack,
      [first, last],
      "Failure should remove only the failed edit, even when another edit finishes first."
    );

    await manager.undo();

    Assert.equal(last.undone, 1, "Undo should reverse the last successful transaction once.");

    if (!batch) {
      await manager.undo();
    }

    Assert.equal(first.undone, 1, "Undo should reverse the first successful transaction once.");
    Assert.equal(failed.undone, 0, "Undo should not run a failed transaction.");

    if (!batch) {
      await manager.redo();
    }
    await manager.redo();

    Assert.equal(first.done, 2, "Redo should execute the first successful transaction again.");
    Assert.equal(last.done, 2, "Redo should execute the last successful transaction again.");
  }
});

/** Checks that empty failed batches do not hide older changes or lose later members. */
add_task(async function test_emptyFailedBatchesKeepUndoHistory() {
  const manager = new CalTransactionManager();
  const first = new MockCalTransaction();
  const later = new MockCalTransaction();
  const commitError = new Error("Batch member failed");

  await manager.commit(first);

  const batch = manager.beginBatch();
  const emptyBatch = manager.beginBatch();

  for (const owner of [batch, emptyBatch]) {
    for (let i = 0; i < 2; i++) {
      const failed = new MockCalTransaction();

      failed.doTransaction = async () => {
        throw commitError;
      };

      await Assert.rejects(
        owner.commit(failed),
        error => error === commitError,
        "Each failed batch member should report the original error."
      );
    }

    Assert.equal(owner.transactions.length, 0, "The failed batch should have no members.");
  }

  Assert.equal(manager.peekUndoStack(), first, "Undo should select the older transaction.");
  Assert.ok(manager.canUndo(), "Empty failed batches should not block Undo.");
  Assert.deepEqual(
    manager.undoStack,
    [first, batch, emptyBatch],
    "Selecting an Undo entry should retain empty batches in their original positions."
  );

  await manager.undo();

  Assert.equal(first.undone, 1, "Undo should reverse the older transaction once.");
  Assert.equal(manager.peekRedoStack(), first, "Redo should contain the older transaction.");
  Assert.equal(manager.peekUndoStack(), undefined, "Empty batches should provide no Undo entry.");
  Assert.ok(!manager.canUndo(), "Undo should be unavailable when only empty batches remain.");

  await Assert.rejects(
    manager.undo(),
    error => error.result === Cr.NS_ERROR_FAILURE,
    "Undo should report an empty history when only empty batches remain."
  );

  Assert.equal(manager.redoStack.length, 1, "Empty batches should not add Redo entries.");

  // The caller can still use the batch after Undo skips it.
  await batch.commit(later);

  Assert.equal(manager.peekUndoStack(), batch, "Undo should select the batch with a later member.");
  Assert.ok(manager.canUndo(), "The later successful member should enable Undo.");

  await manager.undo();

  Assert.equal(later.undone, 1, "Undo should reverse the later batch member once.");
  Assert.equal(manager.peekRedoStack(), batch, "Redo should retain the same batch.");

  await manager.redo();

  Assert.equal(later.done, 2, "Redo should execute the later batch member again.");
  Assert.equal(manager.peekUndoStack(), batch, "Redo should return the batch to Undo history.");
});

/** Checks that a failure does not make a batch with a pending member disappear. */
add_task(async function test_pendingBatchMemberKeepsUndoEntry() {
  const manager = new CalTransactionManager();
  const first = new MockCalTransaction();
  const member = new MockCalTransaction();
  const failed = new MockCalTransaction();
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();

  await manager.commit(first);

  const batch = manager.beginBatch();

  member.doTransaction = async () => {
    started.resolve();
    await finish.promise;
    member.done++;
  };
  failed.doTransaction = async () => {
    throw new Error("Batch member failed");
  };

  const pending = batch.commit(member);

  await started.promise;
  await Assert.rejects(
    batch.commit(failed),
    /Batch member failed/,
    "The failed member should report its error while another member remains pending."
  );

  Assert.equal(manager.peekUndoStack(), batch, "Undo should still select the pending batch.");
  Assert.equal(batch.transactions[0], member, "Failure should retain the pending member.");
  Assert.ok(manager.canUndo(), "The pending batch should retain its existing permission result.");

  finish.resolve();
  await pending;
  await manager.undo();

  Assert.equal(member.undone, 1, "Undo should reverse the completed batch member once.");
  Assert.equal(
    first.undone,
    0,
    "Undo should not skip the batch and reverse the older transaction."
  );
  Assert.equal(manager.peekUndoStack(), first, "Undo should next select the older transaction.");
});

/** Checks that skipping empty batches does not bypass a non-empty entry's permissions. */
add_task(async function test_emptyBatchKeepsUndoPermissionChecks() {
  for (const useBatch of [false, true]) {
    const manager = new CalTransactionManager();
    const first = new MockCalTransaction();
    const unwritable = new MockCalTransaction(false);

    await manager.commit(first);

    const owner = useBatch ? manager.beginBatch() : manager;

    await owner.commit(unwritable);
    manager.beginBatch();

    Assert.equal(
      manager.peekUndoStack(),
      useBatch ? owner : unwritable,
      "Undo should select the non-empty entry even when it is not writable."
    );
    Assert.ok(
      !manager.canUndo(),
      "A non-empty unwritable entry should still block older Undo entries."
    );
    Assert.equal(first.undone, 0, "The permission check should not reverse the older transaction.");
  }
});

/** Checks that a failed Redo leaves other successful transactions available for Undo. */
add_task(async function test_redoFailureKeepsOtherTransactions() {
  const manager = new CalTransactionManager();
  const first = new MockCalTransaction();
  const failed = new MockCalTransaction();
  const last = new MockCalTransaction();
  const redoError = new Error("Redo failed");

  await manager.commit(first);
  await manager.commit(failed);
  await manager.undo();

  // Hold Redo pending until a later commit succeeds. Failure must remove the
  // Redo transaction without removing the later transaction.
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();

  failed.doTransaction = async () => {
    started.resolve();
    await finish.promise;
    throw redoError;
  };

  const pending = manager.redo();

  await started.promise;
  await manager.commit(last);

  finish.resolve();

  await Assert.rejects(
    pending,
    error => error === redoError,
    "Redo should report the original error."
  );

  Assert.equal(manager.undoStack.length, 2, "Undo history should contain only successful changes.");
  Assert.equal(manager.undoStack[0], first, "Undo history should retain the older transaction.");
  Assert.equal(manager.peekUndoStack(), last, "Undo history should retain the later transaction.");
  Assert.ok(!manager.canRedo(), "The failed transaction should leave Redo history.");
  Assert.equal(failed.undone, 1, "Failure should not call the reverse operation again.");

  await manager.undo();

  Assert.equal(last.undone, 1, "Undo should reverse the later successful transaction once.");
  Assert.equal(manager.peekUndoStack(), first, "Undo should next reach the older transaction.");

  await manager.undo();

  Assert.equal(first.undone, 1, "Undo should reverse the older successful transaction once.");
  Assert.equal(failed.undone, 1, "Undo should not reach the failed Redo transaction.");
  Assert.ok(
    !manager.canUndo(),
    "Undo history should be empty after both successful changes are undone."
  );
});

/** Checks that a failed deletion response leaves the destination copy intact. */
add_task(async function test_failedMoveRetainsDestination() {
  const source = CalendarTestUtils.createCalendar("Source", "memory");
  const destination = CalendarTestUtils.createCalendar("Destination", "memory");
  const sourceProvider = source.wrappedJSObject;
  const sourceDelete = sourceProvider.deleteItem;

  registerCleanupFunction(() => {
    sourceProvider.deleteItem = sourceDelete;
    CalendarTestUtils.removeCalendar(source);
    CalendarTestUtils.removeCalendar(destination);
  });

  const sourceError = new Error("Source deletion response lost");
  const event = new CalEvent();

  event.id = "failed-move";
  event.title = "Source";
  const original = await source.addItem(event);
  const moved = original.clone();

  moved.calendar = destination;
  moved.title = "Destination";
  const transaction = new CalModifyTransaction(moved, destination, original, null);
  const manager = new CalTransactionManager();
  let schedulingCalls = 0;

  transaction._dispatch = () => schedulingCalls++;

  // A server can delete the source before its response is lost. Complete the
  // deletion, then reject to reproduce that uncertain result.
  sourceProvider.deleteItem = async function (item) {
    await sourceDelete.call(this, item);

    throw sourceError;
  };

  await Assert.rejects(
    manager.commit(transaction),
    error => error === sourceError,
    "The move should report the source deletion error."
  );

  const remainingSource = await source.getItem(event.id);
  const storedDestination = await destination.getItem(event.id);

  Assert.equal(remainingSource, null, "The source should be deleted before its response fails.");
  Assert.ok(storedDestination, "The destination copy should remain after the failed response.");
  Assert.equal(
    storedDestination.title,
    "Destination",
    "The destination copy should retain the moved title."
  );
  Assert.equal(
    schedulingCalls,
    0,
    "An unconfirmed move should not call the client scheduling handler."
  );
  Assert.equal(manager.undoStack.length, 0, "The failed move should leave no Undo transaction.");
});
