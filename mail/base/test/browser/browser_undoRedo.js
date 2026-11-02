/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let txnMgr;

add_setup(function () {
  const originalTxnMgr = MailServices.txns.transactionManager;
  txnMgr = Cc["@mozilla.org/transactionmanager;1"].createInstance(
    Ci.nsITransactionManager
  );
  MailServices.txns.transactionManager = txnMgr;
  registerCleanupFunction(() => {
    txnMgr.clear();
    MailServices.txns.transactionManager = originalTxnMgr;
    window.goUpdateCommand("cmd_undo");
    window.goUpdateCommand("cmd_redo");
  });
});

/**
 * Creates a delete transaction whose state records command execution.
 *
 * @returns {nsIMsgTxn & {applied: boolean}} The transaction and its state.
 */
function createTransaction() {
  return {
    QueryInterface: ChromeUtils.generateQI(["nsIMsgTxn"]),
    txnType: Ci.nsIMsgTransactionService.eDeleteMsg,
    isTransient: false,
    applied: false,
    doTransaction() {
      this.applied = true;
    },
    undoTransaction() {
      this.applied = false;
    },
    redoTransaction() {
      this.applied = true;
    },
    merge() {
      return false;
    },
  };
}

/**
 * Checks the command's enabled state and menu label.
 *
 * @param {string} command - The Undo or Redo command.
 * @param {boolean} enabled - Whether the command should be enabled.
 * @param {string} [labelAttribute="valueDefault"] - The expected label attribute.
 */
function checkCommand(command, enabled, labelAttribute = "valueDefault") {
  Assert.equal(
    window.DefaultController.isCommandEnabled(command),
    enabled,
    `${command} should be ${enabled ? "enabled" : "disabled"}`
  );
  window.goUpdateCommand(command);
  const commandNode = document.getElementById(command);
  Assert.ok(commandNode, `${command} should have a command element`);
  Assert.equal(
    commandNode.hasAttribute("disabled"),
    !enabled,
    `${command} should update its disabled state`
  );
  Assert.equal(
    commandNode.getAttribute("label"),
    commandNode.getAttribute(labelAttribute),
    `${command} should use its ${labelAttribute} label`
  );
}

add_task(function test_emptyStacks() {
  checkCommand("cmd_undo", false);
  checkCommand("cmd_redo", false);
});

add_task(function test_singleTransaction() {
  const txn = createTransaction();
  txnMgr.doTransaction(txn);
  checkCommand("cmd_undo", true, "valueDeleteMsg");
  checkCommand("cmd_redo", false);

  window.goDoCommand("cmd_undo");
  Assert.ok(!txn.applied, "Undo should undo the transaction");
  checkCommand("cmd_undo", false);
  checkCommand("cmd_redo", true, "valueDeleteMsg");

  window.goDoCommand("cmd_redo");
  Assert.ok(txn.applied, "Redo should apply the transaction again");
  checkCommand("cmd_undo", true, "valueDeleteMsg");
  checkCommand("cmd_redo", false);
  txnMgr.clear();
});

add_task(function test_batchedTransactions() {
  const first = createTransaction();
  const second = createTransaction();
  txnMgr.beginBatch(null);
  txnMgr.doTransaction(first);
  txnMgr.doTransaction(second);
  txnMgr.endBatch(false);

  Assert.equal(
    txnMgr.peekUndoStack(),
    null,
    "Peeking an undo batch should return null"
  );
  checkCommand("cmd_undo", true);
  checkCommand("cmd_redo", false);

  window.goDoCommand("cmd_undo");
  Assert.ok(!first.applied, "Undo should undo the first transaction");
  Assert.ok(!second.applied, "Undo should undo the second transaction");
  checkCommand("cmd_undo", false);
  Assert.equal(
    txnMgr.peekRedoStack(),
    null,
    "Peeking a redo batch should return null"
  );
  checkCommand("cmd_redo", true);

  window.goDoCommand("cmd_redo");
  Assert.ok(first.applied, "Redo should apply the first transaction again");
  Assert.ok(second.applied, "Redo should apply the second transaction again");
  checkCommand("cmd_undo", true);
  checkCommand("cmd_redo", false);
  txnMgr.clear();
});
