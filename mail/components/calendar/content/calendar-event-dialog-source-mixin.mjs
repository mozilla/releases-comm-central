/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { storeObserver } from "moz-src:///comm/mail/base/content/state/store.mjs";

import {
  clearRetainedCalendarEvent,
  clearSession,
  getRetainedCalendarEvent,
  loadCalendarEventSnapshot,
  selectCalendarEventSourceSession,
  setRouteError,
} from "./state/calendar-event-source-state.mjs";
import { CalendarEventDialogRouteController } from "./calendar-event-dialog-route-controller.mjs";

/**
 * The attributes that select an event source.
 *
 * @type {string[]}
 */
const ROUTE_ATTRIBUTES = ["calendar-id", "event-id", "recurrence-id"];

/**
 * The number used to make a new dialog session key.
 *
 * @type {number}
 */
let nextSessionId = 0;

/**
 * Values for route attributes before the dialog validates them.
 *
 * @typedef {object} CalendarEventDialogRouteAttributes
 * @property {?string} [calendarId] - The calendar ID.
 * @property {?string} [eventId] - The event ID.
 * @property {?string} [recurrenceId] - The optional occurrence ID.
 */

/**
 * A controlled error that a route reports to a dialog.
 *
 * @typedef {object} CalendarEventDialogRouteError
 * @property {string} code - The error code.
 */

/**
 * Event data passed to a dialog after a source load.
 *
 * @typedef {object} CalendarEventDialogSource
 * @property {calIEvent} [event] - The raw event for a legacy dialog.
 * @property {CalendarEventSourceIdentity} identity - The source identity.
 * @property {CalendarEventSourceSnapshot} snapshot - The event snapshot.
 * @property {() => boolean} isCurrent - Checks whether the route is current.
 * @property {AbortSignal} signal - Aborted when the route is replaced.
 */

/**
 * Select one value from the Redux state.
 *
 * @callback CalendarEventDialogStateSelector
 * @param {object} state - The Redux state.
 * @returns {*} The selected value.
 */

/**
 * The source lifecycle that the mixin adds to a dialog instance.
 *
 * @typedef {object} CalendarEventDialogSourceLifecycle
 * @property {string} calendarEventSessionKey - The key for the source state.
 * @property {boolean} allowsEmptyCalendarEventRoute - True if an empty route
 *   opens create mode.
 * @property {boolean} retainsRawCalendarEvent - True if the dialog needs the
 *   raw event outside Redux.
 * @property {() => void} initializeCalendarEventRoute - Start route
 *   observation after the dialog creates its content.
 * @property {(route?: CalendarEventDialogRouteAttributes) => void} setCalendarEventRoute
 *   - Replace all event route attributes.
 * @property {(event?: ?Event) => Promise<boolean>} show - Wait for the route
 *   and show the dialog.
 * @property {() => void} close - Clear the route and source state.
 * @property {(route: CalendarEventDialogRouteRequest) => Promise<void>} onEmptyCalendarEventRoute
 *   - Show empty-route data for create mode.
 * @property {(identity: CalendarEventSourceIdentity, route: CalendarEventDialogRouteRequest) => Promise<void>} onCalendarEventSourceLoadStart
 *   - Prepare to show the event source.
 * @property {(source: CalendarEventDialogSource) => Promise<void>} onCalendarEventSourceLoaded
 *   - Show the loaded event source.
 * @property {() => void} onCalendarEventRouteCleared - Clear displayed event
 *   data.
 * @property {(error: CalendarEventDialogRouteError) => void} onCalendarEventRouteError
 *   - Show a controlled route error.
 */

/**
 * Add event loading to a positioned dialog.
 *
 * The mixin reads `calendar-id`, `event-id`, and `recurrence-id` attributes.
 * It stores an event snapshot in Redux and waits for the current route before
 * it shows the dialog. A legacy consumer can request its raw platform event
 * outside Redux.
 *
 * Subclasses use route hooks to show their data. This mixin does not define
 * read-dialog content, create/edit draft data, anchors, or position settings.
 *
 * @param {typeof HTMLElement} superClass - The positioned dialog base class.
 * @returns {typeof HTMLElement & {prototype: CalendarEventDialogSourceLifecycle}}
 *   A class extended with the source lifecycle.
 */
export const CalendarEventDialogSourceMixin = superClass =>
  class CalendarEventDialogSource extends storeObserver(superClass) {
    /**
     * The attributes that restart this dialog's route.
     *
     * @returns {string[]}
     */
    static get observedAttributes() {
      return [
        ...new Set([...(super.observedAttributes ?? []), ...ROUTE_ATTRIBUTES]),
      ];
    }

    /**
     * True after this element starts to observe its route.
     *
     * @type {boolean}
     */
    #routeInitialized = false;

    /**
     * Prevent route attribute changes from starting more than one route.
     *
     * @type {boolean}
     */
    #settingCalendarEventRoute = false;

    /**
     * The fixed key for this dialog's source state.
     *
     * @type {string}
     */
    #sessionKey;

    /**
     * Controls the route for this dialog.
     *
     * @type {CalendarEventDialogRouteController}
     */
    #routeController;

    /**
     * The generation that started the present route hook.
     *
     * @type {?number}
     */
    #routeStartGeneration = null;

    /**
     * The promise returned by the present route-start hook.
     *
     * @type {?Promise<boolean>}
     */
    #routeStartPromise = null;

    /**
     * Create a source session for this dialog.
     *
     * `selectors` adds selectors that a subclass needs for its own state.
     * The mixin adds the source-session selector.
     *
     * @param {Record<string, CalendarEventDialogStateSelector>} [selectors]
     * @param {...*} args
     */
    constructor(selectors = {}, ...args) {
      const sessionKey = `calendar-event-dialog-${++nextSessionId}`;
      super(
        {
          ...selectors,
          sourceSession: state =>
            selectCalendarEventSourceSession(state, sessionKey),
        },
        ...args
      );
      this.#sessionKey = sessionKey;
      this.#routeController = new CalendarEventDialogRouteController(
        route => this.#loadRoute(route),
        window
      );
    }

    /**
     * Restart the route after a route attribute changes.
     *
     * @param {string} attribute
     * @param {?string} oldValue
     * @param {?string} newValue
     */
    attributeChangedCallback(attribute, oldValue, newValue) {
      super.attributeChangedCallback?.(attribute, oldValue, newValue);
      if (
        this.#routeInitialized &&
        !this.#settingCalendarEventRoute &&
        ROUTE_ATTRIBUTES.includes(attribute)
      ) {
        this.#restartCalendarEventRoute();
      }
    }

    /**
     * Stop route work and clear source data when this element disconnects.
     */
    disconnectedCallback() {
      super.disconnectedCallback?.();
      this.#routeInitialized = false;
      this.#routeController.disconnect();
      this.#routeStartGeneration = null;
      this.#routeStartPromise = null;
      this.#clearCalendarEventRoute();
    }

    /**
     * Start route observation after a subclass creates the elements used by its
     * route hooks. This applies the initial state after those elements exist.
     * Subclasses do not call `applyInitialState()`.
     */
    initializeCalendarEventRoute() {
      if (this.#routeInitialized) {
        return;
      }
      this.#routeInitialized = true;
      this.applyInitialState();
      this.#restartCalendarEventRoute();
    }

    /**
     * Replace all attributes that identify a calendar event.
     *
     * This avoids an incomplete route while attributes change. It also removes
     * an old recurrence ID from a new non-recurring route.
     *
     * @param {CalendarEventDialogRouteAttributes} [route]
     */
    setCalendarEventRoute({
      calendarId = null,
      eventId = null,
      recurrenceId = null,
    } = {}) {
      this.#settingCalendarEventRoute = true;
      this.#setRouteAttribute("calendar-id", calendarId);
      this.#setRouteAttribute("event-id", eventId);
      this.#setRouteAttribute("recurrence-id", recurrenceId);
      this.#settingCalendarEventRoute = false;

      if (this.#routeInitialized) {
        this.#restartCalendarEventRoute();
      }
    }

    /**
     * The fixed key for this dialog's source state.
     *
     * A child dialog uses this key for its own selectors and state actions. The
     * key is not Redux state.
     *
     * @returns {string}
     */
    get calendarEventSessionKey() {
      return this.#sessionKey;
    }

    /**
     * Wait for the current source route before showing the dialog.
     *
     * A source failure or cancelled route returns false. It does not throw, so
     * a notification can call this method without waiting for it.
     *
     * TODO(Bug 2061192, Bug 2061194): Create/edit must set its container,
     * anchor, and size before `super.show()` runs. Keep this wait so the dialog
     * does not position before its first layout is ready.
     *
     * @param {?Event} [event]
     * @returns {Promise<boolean>} True if the dialog was shown.
     */
    async show(event) {
      if (!(await this.#routeController.waitForReady())) {
        return false;
      }

      if (this.open) {
        return true;
      }
      super.show(event);
      return true;
    }

    /**
     * Close the dialog and clear its source session.
     */
    close() {
      super.close();
      this.#clearCalendarEventRoute();
      this.#routeStartGeneration = null;
      this.#routeStartPromise = null;
      this.#routeController.reset();
    }

    /**
     * Whether an empty route is valid create mode.
     *
     * @returns {boolean}
     */
    get allowsEmptyCalendarEventRoute() {
      return false;
    }

    /**
     * Whether a legacy consumer needs the raw event and the source snapshot.
     * New Redux consumers keep this false.
     *
     * @returns {boolean}
     */
    get retainsRawCalendarEvent() {
      return false;
    }

    /**
     * Run this hook for an empty create route.
     *
     * @param {CalendarEventDialogRouteRequest} _route
     */
    async onEmptyCalendarEventRoute(_route) {}

    /**
     * Run this hook before an event source starts to load.
     *
     * @param {CalendarEventSourceIdentity} _identity
     * @param {CalendarEventDialogRouteRequest} _route
     */
    async onCalendarEventSourceLoadStart(_identity, _route) {}

    /**
     * Run this hook after the current event source loads.
     *
     * @param {CalendarEventDialogSource} _source
     */
    async onCalendarEventSourceLoaded(_source) {}

    /**
     * Run this hook when a source route is cleared, including on close.
     */
    onCalendarEventRouteCleared() {}

    /**
     * Run this hook when the current route cannot load.
     *
     * @param {CalendarEventDialogRouteError} _error
     */
    onCalendarEventRouteError(_error) {}

    /**
     * Process a changed selector value.
     *
     * This mixin processes `sourceSession`. It ignores other selector values.
     *
     * The constructor sets the fixed session key. Selectors do not use route
     * attributes that can change later.
     *
     * @param {string} fieldName - The changed selector name.
     * @param {*} _oldValue - The old selector value.
     * @param {*} value - The new selector value.
     */
    handleStateChange(fieldName, _oldValue, value) {
      if (fieldName == "sourceSession" && this.#routeInitialized) {
        void this.#handleSourceSessionChange(value);
      }
    }

    /**
     * Set or remove one route attribute.
     *
     * @param {string} attribute
     * @param {?string} value
     */
    #setRouteAttribute(attribute, value) {
      if (value === null || value === undefined) {
        this.removeAttribute(attribute);
      } else {
        this.setAttribute(attribute, value);
      }
    }

    /**
     * Clear the raw-event cache, Redux session, trigger, and displayed data.
     */
    #clearCalendarEventRoute() {
      clearRetainedCalendarEvent(this.#sessionKey);
      this.dispatch(clearSession({ sessionKey: this.#sessionKey }));
      this.trigger = null;
      this.onCalendarEventRouteCleared();
    }

    /**
     * Clear the current route and start a replacement route.
     */
    #restartCalendarEventRoute() {
      this.#routeStartGeneration = null;
      this.#routeStartPromise = null;
      this.#clearCalendarEventRoute();
      this.#routeController.restart();
    }

    /**
     * Store a controlled error for the current route.
     *
     * @param {CalendarEventDialogRouteRequest} route
     * @param {?CalendarEventSourceIdentity} identity
     * @param {CalendarEventDialogRouteError} error
     */
    #failRoute(route, identity, error) {
      if (!route.isCurrent()) {
        return;
      }
      this.#clearCalendarEventRoute();
      this.dispatch(
        setRouteError({
          error,
          identity,
          sessionKey: this.#sessionKey,
        })
      );
    }

    /**
     * Run the route hooks for a source-session state change.
     *
     * @param {?CalendarEventSourceSession} session
     */
    async #handleSourceSessionChange(session) {
      const route = this.#routeController.currentRoute;
      if (!session || !route || !route.isCurrent()) {
        return;
      }

      try {
        if (session.status == "loading") {
          this.#routeStartGeneration = route.generation;
          this.#routeStartPromise = Promise.resolve(
            this.onCalendarEventSourceLoadStart(session.identity, route)
          ).then(
            () => true,
            error => {
              if (route.isCurrent()) {
                console.error(
                  "Could not start calendar event dialog source route",
                  error
                );
                this.#failRoute(route, session.identity, {
                  code: "event-render-failed",
                });
              }
              return false;
            }
          );
          await this.#routeStartPromise;
          return;
        }

        const routeStartPromise =
          this.#routeStartGeneration === route.generation &&
          this.#routeStartPromise
            ? this.#routeStartPromise
            : null;

        if (session.status == "error") {
          await routeStartPromise;
          if (!route.isCurrent()) {
            return;
          }
          this.onCalendarEventRouteError(session.error);
          this.#routeController.finish(route, "error", session.error);
          return;
        }

        if (session.status != "ready") {
          return;
        }

        if (routeStartPromise && !(await routeStartPromise)) {
          return;
        }
        if (!route.isCurrent()) {
          return;
        }

        /** @type {CalendarEventDialogSource} */
        const source = {
          identity: session.identity,
          isCurrent: route.isCurrent,
          signal: route.signal,
          snapshot: session.snapshot,
        };
        if (this.retainsRawCalendarEvent) {
          const event = getRetainedCalendarEvent(this.#sessionKey);
          if (!event) {
            this.#failRoute(route, session.identity, {
              code: "source-not-retained",
            });
            return;
          }
          source.event = event;
        }

        await this.onCalendarEventSourceLoaded(source);
      } catch (error) {
        if (!route.isCurrent()) {
          return;
        }
        console.error("Could not render calendar event dialog source", error);
        this.#failRoute(route, session.identity, {
          code: "event-render-failed",
        });
        return;
      }

      if (route.isCurrent()) {
        this.#routeController.finish(route, "ready");
      }
    }

    /**
     * Load the route that the current attributes identify.
     *
     * @param {CalendarEventDialogRouteRequest} route
     */
    async #loadRoute(route) {
      const calendarId = this.getAttribute("calendar-id");
      const eventId = this.getAttribute("event-id");
      const recurrenceId = this.getAttribute("recurrence-id");

      try {
        if (!calendarId && !eventId && !recurrenceId) {
          if (!this.allowsEmptyCalendarEventRoute) {
            this.#routeController.finish(route, "idle");
            return;
          }
          await this.onEmptyCalendarEventRoute(route);
          if (route.isCurrent()) {
            this.#routeController.finish(route, "ready");
          }
          return;
        }

        if (!calendarId || !eventId) {
          this.#failRoute(route, null, { code: "incomplete-identity" });
          return;
        }

        this.dispatch(
          loadCalendarEventSnapshot({
            identity: { calendarId, eventId, recurrenceId },
            retainRawEvent: this.retainsRawCalendarEvent,
            sessionKey: this.#sessionKey,
          })
        );
      } catch (error) {
        if (!route.isCurrent()) {
          return;
        }
        console.error("Could not render calendar event dialog source", error);
        this.#failRoute(
          route,
          { calendarId, eventId, recurrenceId },
          {
            code: "event-render-failed",
          }
        );
      }
    }
  };
