/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  createAction,
  createSlice,
} from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";
import { rootReducer } from "moz-src:///comm/mail/base/content/state/store.mjs";

export const testAction = createAction("test");

const testSlice = createSlice({
  name: "test",
  initialState: "lorem",
  reducers: {
    update(state, action) {
      return action.payload;
    },
  },
  selectors: {
    selectTest: (state, ...extraData) => [state, ...extraData],
  },
});
const injectedSlice = testSlice.injectInto(rootReducer);

export const testSelector = injectedSlice.selectors.selectTest;

/**
 * Returns the state unchanged for context and identity checks.
 *
 * @param {object} state - The state passed by the test helper.
 * @returns {object} The same state object.
 */
export function testStateSelector(state) {
  return state;
}

/**
 * Creates an async action that dispatches a test action and reads the state.
 *
 * @param {string} value - The test action's payload and extra selector argument.
 * @returns {function(function(object): object, function(): object): Promise<string[]>}
 *   The function that dispatches the action and returns the selector result.
 */
export function testThunk(value) {
  return async (dispatch, getState) => {
    // Dispatch after an await so the helper must wait for the function's result.
    await Promise.resolve();
    dispatch(testAction(value));

    return testSelector(getState(), value);
  };
}
