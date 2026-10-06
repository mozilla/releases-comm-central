/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A route request that a dialog uses while it loads an event.
 *
 * @typedef {object} CalendarEventDialogRouteRequest
 * @property {number} generation - The ID of this route request.
 * @property {() => boolean} isCurrent - True while this route is current.
 * @property {AbortSignal} signal - Aborted when this route is replaced.
 */

/**
 * A state returned when a dialog route ends.
 *
 * @typedef {"error"|"idle"|"ready"|"stale"} CalendarEventDialogRouteStatus
 */

/**
 * The result for one dialog route.
 *
 * @typedef {object} CalendarEventDialogRouteResult
 * @property {number} generation - The ID of the completed route.
 * @property {CalendarEventDialogRouteStatus} status - The route result.
 * @property {{ code: string }} [error] - The error for a failed route.
 */

/**
 * Schedule and cancel route callbacks.
 *
 * @typedef {object} CalendarEventDialogFrameScheduler
 * @property {(callback: () => void) => number} requestAnimationFrame - Queue a
 *   callback.
 * @property {(frame: number) => void} cancelAnimationFrame - Cancel a queued
 *   callback.
 */

/**
 * Control one dialog route at a time.
 *
 * This class schedules route work, replaces old routes, and waits for the
 * current route to be ready. It does not access dialog elements, calendar
 * data, or Redux state. The source mixin supplies the route work.
 */
export class CalendarEventDialogRouteController {
  /**
   * Cancels the current route when a new route replaces it.
   *
   * @type {?AbortController}
   */
  #abortController = null;

  /**
   * The scheduled animation-frame callback, if one exists.
   *
   * @type {?number}
   */
  #frame = null;

  /**
   * Schedules and cancels route callbacks.
   *
   * @type {CalendarEventDialogFrameScheduler}
   */
  #frameScheduler;

  /**
   * The ID of the current route.
   *
   * @type {number}
   */
  #generation = 0;

  /**
   * The function that loads a scheduled route.
   *
   * @type {(route: CalendarEventDialogRouteRequest) => (void|Promise<void>)}
   */
  #loadRoute;

  /**
   * True when the next show operation must load the route.
   *
   * @type {boolean}
   */
  #needsLoad = false;

  /**
   * Resolves when the current route becomes ready, idle, or stale.
   *
   * @type {?Promise<CalendarEventDialogRouteResult>}
   */
  #showPromise = null;

  /**
   * Resolves #showPromise for the current route.
   *
   * @type {?((result: CalendarEventDialogRouteResult) => void)}
   */
  #showResolver = null;

  /**
   * Create a route controller.
   *
   * @param {(route: CalendarEventDialogRouteRequest) => (void|Promise<void>)} loadRoute
   * @param {CalendarEventDialogFrameScheduler} frameScheduler
   */
  constructor(loadRoute, frameScheduler) {
    this.#loadRoute = loadRoute;
    this.#frameScheduler = frameScheduler;
    this.#replaceShowPromise();
  }

  /**
   * The current route request, or null when no route is running.
   *
   * @returns {?CalendarEventDialogRouteRequest}
   */
  get currentRoute() {
    if (!this.#abortController) {
      return null;
    }

    const controller = this.#abortController;
    const generation = this.#generation;
    return {
      generation,
      isCurrent: () =>
        generation == this.#generation &&
        controller == this.#abortController &&
        !controller.signal.aborted,
      signal: controller.signal,
    };
  }

  /**
   * Replace the current route and start the replacement on the next frame.
   */
  restart() {
    this.reset();
    this.#scheduleRouteUpdate();
  }

  /**
   * Clear the current route. The next show operation loads a new route.
   */
  reset() {
    this.#cancelFrame();
    this.#abortRoute();
    this.#needsLoad = true;
    this.#replaceShowPromise();
  }

  /**
   * Clear the current route without scheduling another route.
   */
  disconnect() {
    this.#cancelFrame();
    this.#abortRoute();
    this.#needsLoad = false;
    this.#replaceShowPromise();
  }

  /**
   * Wait until the current route is ready to show the dialog.
   *
   * @returns {Promise<boolean>} True if the current route is ready.
   */
  async waitForReady() {
    this.#scheduleRouteUpdate();

    const generation = this.#generation;
    const routeResult = await this.#showPromise;
    return (
      routeResult.generation == generation && routeResult.status == "ready"
    );
  }

  /**
   * Set the result for the current route.
   *
   * @param {CalendarEventDialogRouteRequest} route
   * @param {"error"|"idle"|"ready"} resultStatus
   * @param {?{ code: string }} [error]
   */
  finish(route, resultStatus, error = null) {
    if (!route.isCurrent()) {
      return;
    }
    this.#showResolver({
      ...(error ? { error } : {}),
      generation: route.generation,
      status: resultStatus,
    });
  }

  /**
   * Abort the current route and remove its controller.
   */
  #abortRoute() {
    this.#abortController?.abort();
    this.#abortController = null;
  }

  /**
   * Cancel a scheduled route update.
   */
  #cancelFrame() {
    if (this.#frame) {
      this.#frameScheduler.cancelAnimationFrame(this.#frame);
      this.#frame = null;
    }
  }

  /**
   * Replace the show promise and mark the prior route as stale.
   */
  #replaceShowPromise() {
    this.#showResolver?.({
      generation: this.#generation,
      status: "stale",
    });
    this.#generation++;
    const { promise, resolve } = Promise.withResolvers();
    this.#showPromise = promise;
    this.#showResolver = resolve;
  }

  /**
   * Schedule the required route load on the next animation frame.
   */
  #scheduleRouteUpdate() {
    if (!this.#needsLoad || this.#frame) {
      return;
    }
    this.#frame = this.#frameScheduler.requestAnimationFrame(() => {
      this.#frame = null;
      this.#needsLoad = false;
      this.#abortController = new AbortController();
      this.#loadRoute(this.currentRoute);
    });
  }
}
