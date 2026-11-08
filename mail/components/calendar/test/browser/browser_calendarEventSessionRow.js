/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
const openedTabs = [];

add_setup(function () {
  registerCleanupFunction(() => {
    for (const tab of openedTabs) {
      if (tabmail.tabInfo.includes(tab)) {
        tabmail.closeTab(tab);
      }
    }
  });
});

async function openFixture() {
  const tab = tabmail.openTab("contentTab", {
    duplicate: true,
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventSessionRow.xhtml",
  });
  openedTabs.push(tab);

  await BrowserTestUtils.browserLoaded(tab.browser);

  const view = tab.browser.contentWindow;
  const doc = view.document;

  return {
    tab,
    view,
    dialog: doc.getElementById("sessionDialog"),
    row: doc.getElementById("firstRow"),
    otherRow: doc.getElementById("secondRow"),
    ...view.sessionRowTest,
  };
}

add_task(async function test_bindEventSession() {
  const { row, otherRow, store, actions } = await openFixture();

  Assert.strictEqual(
    row.selectValue("value"),
    undefined,
    "An unbound row should have no selected state"
  );

  // Read updates immediately to check the observer's synchronous contract.
  store.dispatch(actions.setValue({ sessionKey: "first", value: "Current" }));
  Assert.equal(
    row.observedValues.length,
    0,
    "An unbound session selector should ignore store changes"
  );
  Assert.deepEqual(
    [...row.unrelatedValues],
    [0],
    "An unscoped selector should receive updates before session binding"
  );
  Assert.equal(
    row.observedLengths.length,
    0,
    "Every wrapped selector should wait for session binding"
  );

  row.bindEventSession("empty");
  otherRow.bindEventSession("first");
  Assert.strictEqual(
    row.selectValue("value"),
    null,
    "A bound row should preserve a null selection"
  );
  Assert.strictEqual(
    row.previousValues[0],
    undefined,
    "The first bound update should have no previous selection"
  );

  Assert.deepEqual(
    [...row.observedValues],
    [null],
    "Binding an empty session should deliver its null value"
  );
  Assert.equal(
    otherRow.querySelector("output").textContent,
    "Current",
    "Binding a populated session should display its current value"
  );
  Assert.deepEqual(
    [...otherRow.observedLengths],
    [7],
    "A second named session selector should receive the bound value"
  );
  Assert.equal(
    otherRow.selectValue("value", " suffix"),
    "Current suffix",
    "A wrapped selector should receive extra arguments after the session key"
  );

  row.bindEventSession("empty");
  store.dispatch(actions.changeUnrelatedValue());
  Assert.equal(
    row.observedValues.length,
    1,
    "Repeated binding and unrelated changes should keep the existing display"
  );
  Assert.deepEqual(
    [...row.unrelatedValues],
    [0, 1],
    "An unscoped selector should keep receiving its own changes after binding"
  );
  Assert.throws(
    () => row.bindEventSession("first"),
    /original dialog session key/,
    "Binding a different session should reject the replacement key"
  );

  store.dispatch(actions.setValue({ sessionKey: "empty", value: "Original" }));
  Assert.equal(
    row.querySelector("output").textContent,
    "Original",
    "A rejected replacement should preserve the original session binding"
  );
  Assert.equal(
    otherRow.observedValues.length,
    1,
    "Changing another session should leave the populated row unchanged"
  );
});

add_task(async function test_dispatchSessionAction() {
  const { row, otherRow, store, actions } = await openFixture();
  store.dispatch(actions.setValue({ sessionKey: "first", value: "First" }));
  store.dispatch(actions.setValue({ sessionKey: "second", value: "Second" }));
  const beforeBinding = store.getState();

  row.dispatchSessionAction(actions.setValue, { value: "Ignored" });
  Assert.strictEqual(
    store.getState(),
    beforeBinding,
    "An unbound row should leave the stored values unchanged"
  );

  row.bindEventSession("first");
  otherRow.bindEventSession("second");
  row.dispatchSessionAction(actions.setValue, {
    sessionKey: "second",
    value: "Changed",
  });
  Assert.equal(
    row.querySelector("output").textContent,
    "Changed",
    "A row action should update its bound session"
  );
  Assert.equal(
    otherRow.querySelector("output").textContent,
    "Second",
    "Action details should not redirect a change to another session"
  );

  row.dispatchSessionAction(
    details => dispatch => dispatch(actions.setValue(details)),
    { value: "From thunk" }
  );
  Assert.equal(
    row.querySelector("output").textContent,
    "From thunk",
    "A row thunk should receive and update the bound session"
  );
});

add_task(async function test_updatesWhileHidden() {
  const { dialog, row, store, actions } = await openFixture();
  store.dispatch(
    actions.setValue({ sessionKey: "singleton", value: "Before" })
  );
  row.bindEventSession("singleton");
  dialog.show();
  dialog.close();
  Assert.ok(
    BrowserTestUtils.isHidden(row),
    "Closing the dialog should hide the row"
  );

  store.dispatch(actions.setValue({ sessionKey: "singleton", value: "After" }));
  Assert.equal(
    row.querySelector("output").textContent,
    "After",
    "The hidden singleton row should continue receiving store updates"
  );

  dialog.show();
  row.bindEventSession("singleton");
  Assert.ok(
    BrowserTestUtils.isVisible(row),
    "Reopening the dialog should show the existing row"
  );
  Assert.deepEqual(
    [...row.observedValues],
    ["Before", "After"],
    "Reopening should retain the current values without another initial update"
  );
});

add_task(async function test_unloadStopsOnlyOwningRows() {
  const first = await openFixture();
  const second = await openFixture();
  first.store.dispatch(
    first.actions.setValue({ sessionKey: "singleton", value: "First window" })
  );
  second.store.dispatch(
    second.actions.setValue({ sessionKey: "singleton", value: "Second window" })
  );
  first.row.bindEventSession("singleton");
  second.row.bindEventSession("singleton");

  let disposeCalls = 0;
  let updateCountAfterDisposal;
  const dispose = first.row.dispose.bind(first.row);
  first.row.dispose = () => {
    dispose();
    disposeCalls++;

    // Dispatch during unload, before the document and its wrappers are destroyed.
    first.store.dispatch(
      first.actions.setValue({
        sessionKey: "singleton",
        value: "During unload",
      })
    );
    updateCountAfterDisposal = first.row.observedValues.length;
  };

  const unloaded = BrowserTestUtils.waitForEvent(first.view, "unload");
  tabmail.closeTab(first.tab);
  await unloaded;

  Assert.equal(disposeCalls, 1, "Window unload should dispose the row once");
  Assert.equal(
    updateCountAfterDisposal,
    1,
    "Disposal should stop store updates before the window finishes unloading"
  );

  second.row.dispatchSessionAction(second.actions.setValue, {
    value: "Still observing",
  });
  Assert.equal(
    second.row.querySelector("output").textContent,
    "Still observing",
    "Unloading one window should preserve the other window's subscription"
  );
});
