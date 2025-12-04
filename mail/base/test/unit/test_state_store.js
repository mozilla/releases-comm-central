/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { storeObserver, store, rootReducer } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/base/content/state/store.mjs"
);
const { createSlice } = ChromeUtils.importESModule(
  "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

add_task(function test_rootReducer() {
  Assert.ok(rootReducer, "Should export something as a root reducer");
  Assert.equal(
    typeof rootReducer,
    "function",
    "Root reducer should be a function"
  );
  Assert.equal(
    typeof rootReducer.inject,
    "function",
    "Root reducer should allow injecting new slices"
  );
});

add_task(function test_store() {
  Assert.ok(store, "Should export something as store");
  Assert.equal(typeof store, "object", "Store should be an object");
  Assert.equal(
    typeof store.dispatch,
    "function",
    "Store should have a dispatch method"
  );
  Assert.equal(
    typeof store.subscribe,
    "function",
    "Store should have a subscribe method"
  );
  Assert.deepEqual(
    store.getState(),
    {},
    "Store should start with an empty state"
  );
});

add_task(function test_storeObserver() {
  class Base {
    constructor(...args) {
      this.args = args;
    }
  }
  const fooSlice = createSlice({
    name: "foo",
    initialState: () => "bar",
    reducers: {
      baz() {
        return "baz";
      },
    },
    selectors: {
      selectValue: state => state,
    },
  });
  const injectedFoo = fooSlice.injectInto(rootReducer);
  class Test extends storeObserver(Base) {
    constructor(...args) {
      super(
        {
          foo: injectedFoo.selectors.selectValue,
        },
        ...args
      );
      sinon.spy(this, "handleStateChange");
      this.applyInitialState();
    }

    handleStateChange(...args) {
      this.lastStateChange = args;
    }
  }
  const test = new Test("lorem", "ipsum");
  Assert.ok(test instanceof Base, "Should inherit the mixed base class");
  Assert.deepEqual(
    test.args,
    ["lorem", "ipsum"],
    "Consturctor args should be passed through to the base class"
  );
  Assert.equal(
    test.handleStateChange.callCount,
    1,
    "Initial state change from constructor"
  );
  Assert.deepEqual(test.lastStateChange, ["foo", undefined, "bar"]);
  Assert.equal(test.selectValue("foo"), "bar");

  test.dispatch(fooSlice.actions.baz());

  Assert.equal(test.handleStateChange.callCount, 2);
  Assert.deepEqual(test.handleStateChange.lastCall.args, ["foo", "bar", "baz"]);
  Assert.equal(test.selectValue("foo"), "baz");

  test.dispose();
});
