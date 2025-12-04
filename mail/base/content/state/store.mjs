/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Redux store base
import {
  configureStore,
  combineSlices,
  createListenerMiddleware,
} from "moz-src:///comm/third_party/redux/redux-toolkit/redux-toolkit.mjs";

export const rootReducer = combineSlices().withLazyLoadedSlices();
const listenerMiddleware = createListenerMiddleware();
//if not release, add action creator middleware
export const store = configureStore({
  reducer: rootReducer,
  devTools: false,
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware().prepend(listenerMiddleware.middleware),
});

/**
 * Mixin to add redux store state change handling. Will leak the listener,
 * unless dispose is called.
 *
 * Selectors are configured by the element extending this. Updates are detected
 * by only passing the current state to selectors, so for selectors that need
 * external arguments the update detection may be incorrect.
 *
 * @mixin
 * @param {Function} superClass - The super class this mixin extends, usually
 *   HTMLElement or one of its decendants.
 * @returns {Function}
 */
export const storeObserver = superClass =>
  class StoreObserver extends superClass {
    /**
     * Callback to stop receiving updates from the store.
     */
    #unsubscribe = null;

    /**
     * Cache of the last retrieved values from the store for each selector.
     *
     * @type {Record<string, any>}
     */
    #currentValues = {};

    /**
     * A map of selector names to selectors. Used when the state updates.
     *
     * @type {Record<string, Function>}
     */
    #selectors = {};

    constructor(selectors, ...args) {
      super(...args);
      this.#selectors = selectors;
      //TODO consider debouncing state change.
      this.#unsubscribe = store.subscribe(() => this.#stateChange());
    }

    /**
     * Called by the subclass to initialize its state after everything is
     * set up. We can't call this from the constructor here, since the subclass
     * won't be ready to handle things yet.
     */
    applyInitialState() {
      this.#stateChange();
    }

    /**
     * Handle a new state in the store. Compare the newly selected values against
     * the cached values in #currentValues, and if appropriate update the cached
     * value and call handleStateChange.
     */
    #stateChange() {
      const state = store.getState();
      for (const [fieldName, selector] of Object.entries(this.#selectors)) {
        const newValue = selector(state);
        const oldValue = this.#currentValues[fieldName];
        if (newValue === oldValue) {
          continue;
        }
        this.#currentValues[fieldName] = newValue;
        this.handleStateChange(fieldName, oldValue, newValue);
      }
    }

    /**
     * Callback for state changes. Only called when the computed value for a
     * selector changes.
     *
     * @param {string} _fieldName - The name of the selector for the changed value.
     * @param {any} _oldValue
     * @param {any} _newValue
     * @abstract
     */
    handleStateChange(_fieldName, _oldValue, _newValue) {
      // Implement state change handling in your class without calling the super.
      throw new Error("Should implement handleStateChange");
    }

    /**
     * Get the current value of a specific selector.
     *
     * @param {string} fieldName - Name of the selector.
     * @param {any} [args] - Extra arguments for the selector.
     * @returns {any}
     */
    selectValue(fieldName, ...args) {
      if (!args) {
        return this.#currentValues[fieldName];
      }
      return this.#selectors[fieldName](store.getState(), ...args);
    }

    /**
     * Dispatch an action on the store.
     *
     * @param {object} action
     */
    dispatch(action) {
      store.dispatch(action);
    }

    /**
     * Stop observing the redux store for changes.
     */
    dispose() {
      this.#unsubscribe();
    }
  };
