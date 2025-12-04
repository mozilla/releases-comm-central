/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { store, rootReducer } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/base/content/state/store.mjs"
);
const { createXULStoreSlice } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/base/content/state/xulStoreSlice.mjs"
);

const { XULStoreUtils } = ChromeUtils.importESModule(
  "resource:///modules/XULStoreUtils.sys.mjs"
);

add_task(function test_createXULStoreSlice_action() {
  const slice = createXULStoreSlice("messenger", "test", "action");

  const action = slice.actions.set("lorem ipsum");

  Assert.deepEqual(
    action,
    { type: "xulStore/messenger/test/action/set", payload: "lorem ipsum" },
    "Should generate set action"
  );
});

add_task(function test_createXULStoreSlice_reducer() {
  const slice = createXULStoreSlice("messenger", "test", "reduce");

  const setResult = slice.reducer("", slice.actions.set("lorem ipsum"));
  Assert.equal(setResult, "lorem ipsum", "Should return new value");
  Assert.equal(
    XULStoreUtils.getValue("messenger", "test", "reduce"),
    "lorem ipsum",
    "Reducer should update XUL store"
  );

  XULStoreUtils.removeValue("messenger", "test", "reduce");
});

add_task(function test_createXULStoreSlice_selectValue() {
  const slice = createXULStoreSlice("messenger", "test", "selector");

  const value = slice.selectors.selectValue({
    "xulStore/messenger/test/selector": "foo",
  });
  Assert.equal(value, "foo", "Selector should select value");
});

add_task(function test_createXULStoreSlice_integration() {
  XULStoreUtils.setValue("messenger", "test", "example", "foo");
  const slice = createXULStoreSlice("messenger", "test", "example");

  const injectedSlice = slice.injectInto(rootReducer);
  Assert.equal(
    typeof injectedSlice.actions.set,
    "function",
    "Should generate set action"
  );
  Assert.equal(
    typeof injectedSlice.selectors.selectValue,
    "function",
    "Should generate selectValue selector"
  );

  Assert.equal(
    injectedSlice.selectors.selectValue(store.getState()),
    "foo",
    "Should initialize value from XUL store"
  );

  store.dispatch(injectedSlice.actions.set("bar"));

  Assert.equal(
    injectedSlice.selectors.selectValue(store.getState()),
    "bar",
    "Set action should update state"
  );
  Assert.equal(
    XULStoreUtils.getValue("messenger", "test", "example"),
    "bar",
    "Should also update XUL store value"
  );

  XULStoreUtils.removeValue("messenger", "test", "example");
});
