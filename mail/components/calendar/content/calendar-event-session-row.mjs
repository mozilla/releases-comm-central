/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { storeObserver } from "moz-src:///comm/mail/base/content/state/store.mjs";

/** @import {CalendarDialogRow} from "./calendar-dialog-row.mjs" */

/** @typedef {function(object, ...*): *} CalendarRowSelector */
/**
 * @typedef {function(function(object, string, ...*): *): CalendarRowSelector}
 *   CalendarSessionSelectorWrapper
 */

/**
 * Observes selected values for a row in the window's singleton dialog.
 * The row supplies named selectors and implements `handleStateChange()`.
 * The dialog binds its session key once. Window unload ends the subscription.
 *
 * @mixin
 * @param {typeof CalendarDialogRow} superClass - The row base class.
 * @param {function(CalendarSessionSelectorWrapper): Record<string, CalendarRowSelector>}
 *   createSelectors - Creates the row's selector map. Receives
 *   `forSession(selector)`. The wrapper supplies the bound key as the selector's
 *   second argument and forwards extra arguments.
 *   Wrapped selectors return undefined before binding. Unwrapped selectors can
 *   receive updates before binding.
 * @returns {Function} The row class with session observation and dispatch.
 */
export const calendarEventSessionRow = (superClass, createSelectors) =>
  class CalendarEventSessionRow extends storeObserver(superClass) {
    /** @type {?string} The session key, fixed after the first binding. */
    #sessionKey = null;

    constructor(...args) {
      // The observer evaluates these selectors after construction.
      const forSession =
        selector =>
        (state, ...selectorArgs) => {
          if (this.#sessionKey === null) {
            return undefined;
          }

          return selector(state, this.#sessionKey, ...selectorArgs);
        };

      super(createSelectors(forSession), ...args);

      // Hiding the singleton dialog keeps the row's subscription active.
      this.documentGlobal.addEventListener("unload", () => this.dispose(), {
        once: true,
      });
    }

    /**
     * Binds the dialog's session and reads its current values.
     * Repeating the same binding has no effect.
     *
     * @param {string} sessionKey - The dialog's fixed session key.
     * @throws {Error} If the row is already bound to another session.
     */
    bindEventSession(sessionKey) {
      if (this.#sessionKey !== null && this.#sessionKey !== sessionKey) {
        throw new Error("A row must keep its original dialog session key.");
      }

      if (this.#sessionKey === sessionKey) {
        return;
      }

      this.#sessionKey = sessionKey;
      this.applyInitialState();
    }

    /**
     * Dispatches a row action with the bound session key.
     * If the session is not bound yet, skips the action.
     *
     * @param {function(object): (object|Function)} createAction - Creates an
     *   action or thunk from the details and session key.
     * @param {object} details - The row's action details.
     */
    dispatchSessionAction(createAction, details) {
      if (this.#sessionKey === null) {
        return;
      }

      this.dispatch(createAction({ ...details, sessionKey: this.#sessionKey }));
    }
  };
