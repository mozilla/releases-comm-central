/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSlice } from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";

const { XULStoreUtils } = ChromeUtils.importESModule(
  "resource:///modules/XULStoreUtils.sys.mjs"
);

/**
 * Create a slice for a XULStore attribute. Has a set reducer/action pair and
 * a selectValue selector.
 *
 * The slice is named to be unique based on the three input parameters.
 *
 * @param {string} documentLocation - Location of the document in the XUL store
 *   or a document identifier from XULStoreUtils.
 * @param {string} elementId - ID of the element in the XUL store.
 * @param {string} attribute - Name of the attribute in the XUL store.
 * @returns {object} A redux slice for a specific attribute in the xul store.
 */
export const createXULStoreSlice = (documentLocation, elementId, attribute) =>
  createSlice({
    name: `xulStore/${documentLocation}/${elementId}/${attribute}`,
    initialState: () =>
      XULStoreUtils.getValue(documentLocation, elementId, attribute),
    reducers: {
      set: (state, action) => {
        XULStoreUtils.setValue(
          documentLocation,
          elementId,
          attribute,
          action.payload
        );
        return action.payload;
      },
    },
    selectors: {
      selectValue: state => state,
    },
  });
