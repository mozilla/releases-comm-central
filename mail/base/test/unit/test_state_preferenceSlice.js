/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { store, rootReducer } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/base/content/state/store.mjs"
);
const { createPreferenceSlice, createBoolPreferenceSlice } =
  ChromeUtils.importESModule(
    "moz-src:///comm/mail/base/content/state/preferenceSlice.mjs"
  );

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_task(function test_createPreferenceSlice_actions() {
  const slice = createPreferenceSlice("test.example.actions", "");

  const set = slice.actions.set("foo");
  Assert.deepEqual(
    set,
    { type: "prefs/test.example.actions/set", payload: "foo" },
    "Should generate set action with payload"
  );

  const reset = slice.actions.reset();
  Assert.deepEqual(
    reset,
    { type: "prefs/test.example.actions/reset", payload: undefined },
    "Should generate reset action"
  );
});

add_task(function test_createPreferenceSlice_reducers() {
  const slice = createPreferenceSlice("test.example.reducer", "", value =>
    value.toUpperCase()
  );

  const result = slice.reducer("", slice.actions.set("foo"));
  Assert.equal(
    result,
    "FOO",
    "Should return the payload but transformed for set"
  );

  const resetResult = slice.reducer("foo", slice.actions.reset());
  Assert.equal(resetResult, "", "Reset should reduce to the default value");
});

add_task(function test_createPreferenceSlice_selectValue() {
  const slice = createPreferenceSlice("test.example.selector", "");

  const value = slice.selectors.selectValue({
    "prefs/test.example.selector": "foo",
  });
  Assert.equal(value, "foo", "selectValue selector returns the value itself");
});

add_task(async function test_createPreferceSlice_integration() {
  const slice = createPreferenceSlice(
    "test.example",
    "foo",
    val => val.toLowerCase(),
    {
      baz() {
        return "baz";
      },
    }
  );
  const injectedSlice = slice.injectInto(rootReducer);
  Assert.equal(typeof injectedSlice, "object", "Slice should be an object");
  Assert.equal(
    typeof injectedSlice.actions.set,
    "function",
    "Generates set action"
  );
  Assert.equal(
    typeof injectedSlice.actions.reset,
    "function",
    "Generates reset action"
  );
  Assert.equal(
    typeof injectedSlice.actions.baz,
    "function",
    "Generates additional baz action"
  );
  Assert.equal(
    typeof injectedSlice.selectors.selectValue,
    "function",
    "Generates selectValue selector"
  );

  Assert.equal(
    injectedSlice.selectors.selectValue(store.getState()),
    "foo",
    "Should have initial value"
  );

  let prefChange = TestUtils.waitForPrefChange(
    "test.example",
    val => val === "lorem"
  );
  Services.prefs.setStringPref("test.example", "lorem");
  await prefChange;

  Assert.equal(
    injectedSlice.selectors.selectValue(store.getState()),
    "lorem",
    "Store should reflect updated pref value"
  );

  store.dispatch(injectedSlice.actions.baz());

  Assert.equal(
    injectedSlice.selectors.selectValue(store.getState()),
    "baz",
    "Should update to baz with baz action"
  );
  Assert.equal(
    Services.prefs.getStringPref("test.example"),
    "lorem",
    "Should not set pref value"
  );

  prefChange = TestUtils.waitForPrefChange("test.example", value => {
    console.log(value);
    return value === "BAR";
  });
  store.dispatch(injectedSlice.actions.set("BAR"));
  await prefChange;

  Assert.equal(
    injectedSlice.selectors.selectValue(store.getState()),
    "bar",
    "Should update to transformed value from action"
  );

  store.dispatch(injectedSlice.actions.reset());

  Assert.equal(
    injectedSlice.selectors.selectValue(store.getState()),
    "foo",
    "Should reset to the fallback value"
  );
  Assert.ok(
    !Services.prefs.prefHasUserValue("test.example"),
    "Should reset pref value"
  );
});

add_task(async function test_createBoolPreferenceSlice() {
  const slice = createBoolPreferenceSlice("test.example.bool", false);
  Assert.equal(typeof slice, "object", "Slice should be an object");
  Assert.equal(typeof slice.actions.set, "function", "Generates set action");
  Assert.equal(
    typeof slice.actions.reset,
    "function",
    "Generates reset action"
  );
  Assert.equal(
    typeof slice.actions.toggle,
    "function",
    "Generates toggle action"
  );
  Assert.equal(
    typeof slice.actions.setTrue,
    "function",
    "Generates setTrue action"
  );
  Assert.equal(
    typeof slice.actions.setFalse,
    "function",
    "Generates setFalse action"
  );
  Assert.equal(
    typeof slice.selectors.selectValue,
    "function",
    "Generates selectValue selector"
  );
  const injectedSlice = slice.injectInto(rootReducer);

  Assert.ok(
    !injectedSlice.selectors.selectValue(store.getState()),
    "Should have initial value"
  );

  let prefChange = TestUtils.waitForPrefChange(
    "test.example.bool",
    value => value
  );
  Services.prefs.setBoolPref("test.example.bool", true);
  await prefChange;

  Assert.ok(
    injectedSlice.selectors.selectValue(store.getState()),
    "Store should reflect updated pref value"
  );

  prefChange = TestUtils.waitForPrefChange(
    "test.example.bool",
    value => !value
  );
  store.dispatch(injectedSlice.actions.toggle());
  await prefChange;

  Assert.ok(
    !injectedSlice.selectors.selectValue(store.getState()),
    "Should toggle to false"
  );

  prefChange = TestUtils.waitForPrefChange("test.example.bool", value => value);
  store.dispatch(injectedSlice.actions.setTrue());
  await prefChange;

  Assert.ok(
    injectedSlice.selectors.selectValue(store.getState()),
    "Should set to true"
  );

  prefChange = TestUtils.waitForPrefChange(
    "test.example.bool",
    value => !value
  );
  store.dispatch(injectedSlice.actions.setFalse());
  await prefChange;

  Assert.ok(
    !injectedSlice.selectors.selectValue(store.getState()),
    "Should set to false"
  );

  store.dispatch(injectedSlice.actions.setTrue());
  store.dispatch(injectedSlice.actions.reset());

  Assert.ok(
    !injectedSlice.selectors.selectValue(store.getState()),
    "Should reset to the fallback value"
  );
  Assert.ok(
    !Services.prefs.prefHasUserValue("test.example.bool"),
    "Should reset pref value"
  );
});
