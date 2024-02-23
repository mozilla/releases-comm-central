/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the CalTransactionManager and the various CalTransaction instances.
 */

const { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);
const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");
const {
  CalTransactionManager,
  CalTransaction,
  CalBatchTransaction,
  CalAddTransaction,
  CalModifyTransaction,
  CalDeleteTransaction,
} = ChromeUtils.import("resource:///modules/CalTransactionManager.jsm");

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

add_setup(async function () {
  await new Promise(resolve => do_load_calmgr(resolve));
});

/**
 * Tests the CalTransactionManager methods work as expected.
 */
add_task(async function testCalTransactionManager() {
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
add_task(async function testBatchTransaction() {
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
add_task(async function testSequentialBatchTransactions() {
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
add_task(async function testCalAddTransaction() {
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
add_task(async function testCalModifyTransaction() {
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
add_task(async function testCalDeleteTransaction() {
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
