/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { store } from "moz-src:///comm/mail/base/content/state/store.mjs";
import { addListener } from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Assert: "resource://testing-common/Assert.sys.mjs",
});

/**
 * Get a specific export from a module.
 *
 * @param {string} moduleUri - The URI for the module to load.
 * @param {string} exportName - The identifier of the export to return. The
 *   default export can be retrieved with "default".
 * @returns {Promise<any>} The value exported by the module under the given
 *   name.
 */
const getModuleExport = async (moduleUri, exportName) => {
  const moduleExports = await import(moduleUri);
  return moduleExports[exportName];
};

/**
 * Test utils for web contexts with Redux. Useful when the tested document is
 * inside a browser, but the test runs in the browser chrome.
 */
const ReduxTestUtils = {
  /**
   * Wait until an action has been dispatched to the store. Must be called
   * before the action is dispatched. This waits until after the store reducer
   * has processed the action, but asynchronous effects from the change might
   * still be pending by the time this resolves.
   *
   * @param {string|Function} actionTypeOrCreator - Either the action type
   *   string (path) or the action creator function to wait for.
   * @param {function(object): boolean} [checkFunction] - A function that can
   *   check if the observed action is the one this should wait for.
   * @returns {Promise<object>} Resolves with the action that was dispatched to
   *   the store.
   */
  waitForAction(actionTypeOrCreator, checkFunction) {
    return new Promise((resolve, reject) => {
      // This can't be const due to the TDZ.
      // eslint-disable-next-line prefer-const
      let unsubscribe;
      const options = {
        effect(action) {
          try {
            if (!checkFunction || checkFunction(action)) {
              resolve(action);
            }
          } catch (error) {
            reject(error);
          } finally {
            unsubscribe();
          }
        },
      };
      if (typeof actionTypeOrCreator == "string") {
        options.type = actionTypeOrCreator;
      } else {
        options.actionCreator = actionTypeOrCreator;
      }
      unsubscribe = store.dispatch(addListener(options));
    });
  },
  /**
   * Dispatch an action to the Redux store in this context. Waits until the
   * action has reached the listener middleware at least, not necessarily until
   * it has been applied to the store.
   *
   * @param {string} moduleUri - The URI of the module that exports the action
   *   creator.
   * @param {string} exportName - The name of the action creator as exported
   *   from the module.
   * @param {*} [actionArgument] - The value to pass to the action creator, if any.
   * @returns {Promise<object>} Resolves to the action as dispatched to the
   *   store.
   */
  async dispatchAction(moduleUri, exportName, actionArgument) {
    const actionCreator = await getModuleExport(moduleUri, exportName);
    const action = actionCreator(actionArgument);
    const actionDispatched = this.waitForAction(
      actionCreator,
      dispatchedAction => dispatchedAction === action
    );
    store.dispatch(action);
    return actionDispatched;
  },
  /**
   * Assert that the result of a selector is deep equal to an expected value.
   *
   * @param {string} moduleUri - The URI of the module that exports the
   *   selector.
   * @param {string} exportName - The name of the selector as exported from the
   *   module.
   * @param {*} expectedResult - The expected result from the selector. Compared
   *   using Assert.deepEqual.
   * @param {string} [message] - Assertion message for the check.
   * @param  {...any} [extraSelectorArguments] - Additional arguments to pass to
   *   the selector.
   * @returns {Promise<void>} Resolves once the assertion has run.
   */
  async assertSelector(
    moduleUri,
    exportName,
    expectedResult,
    message,
    ...extraSelectorArguments
  ) {
    const selector = await getModuleExport(moduleUri, exportName);
    const state = store.getState();
    const result = selector(state, ...extraSelectorArguments);
    lazy.Assert.deepEqual(result, expectedResult, message);
  },
};

globalThis.ReduxTestUtils = ReduxTestUtils;
