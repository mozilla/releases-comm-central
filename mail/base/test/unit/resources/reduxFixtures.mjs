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
