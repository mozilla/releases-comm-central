"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OutgoingRequestsManager = void 0;
var _utils = require("../utils.js");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2023 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
/**
 * OutgoingRequestsManager: responsible for processing outgoing requests from the OlmMachine.
 * Ensure that only one loop is going on at once, and that the requests are processed in order.
 */
class OutgoingRequestsManager {
  constructor(logger, olmMachine, outgoingRequestProcessor) {
    this.logger = logger;
    this.olmMachine = olmMachine;
    this.outgoingRequestProcessor = outgoingRequestProcessor;
    /** whether {@link stop} has been called */
    _defineProperty(this, "stopped", false);
    /** whether {@link outgoingRequestLoop} is currently running */
    _defineProperty(this, "outgoingRequestLoopRunning", false);
    /**
     * If there are additional calls to doProcessOutgoingRequests() while there is a current call running
     * we need to remember in order to call `doProcessOutgoingRequests` again (as there could be new requests).
     *
     * If this is defined, it is an indication that we need to do another iteration; in this case the deferred
     * will resolve once that next iteration completes. If it is undefined, there have been no new calls
     * to `doProcessOutgoingRequests` since the current iteration started.
     */
    _defineProperty(this, "nextLoopDeferred", void 0);
  }

  /**
   * Shut down as soon as possible the current loop of outgoing requests processing.
   */
  stop() {
    this.stopped = true;
  }

  /**
   * Process the OutgoingRequests from the OlmMachine.
   *
   * This should be called at the end of each sync, to process any OlmMachine OutgoingRequests created by the rust sdk.
   * In some cases if OutgoingRequests need to be sent immediately, this can be called directly.
   *
   * Calls to doProcessOutgoingRequests() are processed synchronously, one after the other, in order.
   * If doProcessOutgoingRequests() is called while another call is still being processed, it will be queued.
   * Multiple calls to doProcessOutgoingRequests() when a call is already processing will be batched together.
   */
  doProcessOutgoingRequests() {
    // Flag that we need at least one more iteration of the loop.
    //
    // It is important that we do this even if the loop is currently running. There is potential for a race whereby
    // a request is added to the queue *after* `OlmMachine.outgoingRequests` checks the queue, but *before* it
    // returns. In such a case, the item could sit there unnoticed for some time.
    //
    // In order to circumvent the race, we set a flag which tells the loop to go round once again even if the
    // queue appears to be empty.
    if (!this.nextLoopDeferred) {
      this.nextLoopDeferred = (0, _utils.defer)();
    }

    // ... and wait for it to complete.
    const result = this.nextLoopDeferred.promise;

    // set the loop going if it is not already.
    if (!this.outgoingRequestLoopRunning) {
      this.outgoingRequestLoop().catch(e => {
        // this should not happen; outgoingRequestLoop should return any errors via `nextLoopDeferred`.
        /* istanbul ignore next */
        this.logger.error("Uncaught error in outgoing request loop", e);
      });
    }
    return result;
  }
  async outgoingRequestLoop() {
    /* istanbul ignore if */
    if (this.outgoingRequestLoopRunning) {
      throw new Error("Cannot run two outgoing request loops");
    }
    this.outgoingRequestLoopRunning = true;
    try {
      while (!this.stopped && this.nextLoopDeferred) {
        const deferred = this.nextLoopDeferred;

        // reset `nextLoopDeferred` so that any future calls to `doProcessOutgoingRequests` are queued
        // for another additional iteration.
        this.nextLoopDeferred = undefined;

        // make the requests and feed the results back to the `nextLoopDeferred`
        await this.processOutgoingRequests().then(deferred.resolve, deferred.reject);
      }
    } finally {
      this.outgoingRequestLoopRunning = false;
    }
    if (this.nextLoopDeferred) {
      // the loop was stopped, but there was a call to `doProcessOutgoingRequests`. Make sure that
      // we reject the promise in case anything is waiting for it.
      this.nextLoopDeferred.reject(new Error("OutgoingRequestsManager was stopped"));
    }
  }

  /**
   * Make a single request to `olmMachine.outgoingRequests` and do the corresponding requests.
   */
  async processOutgoingRequests() {
    if (this.stopped) return;
    const outgoingRequests = await this.olmMachine.outgoingRequests();
    for (const request of outgoingRequests) {
      if (this.stopped) return;
      try {
        await (0, _utils.logDuration)(this.logger, `Make outgoing request ${request.type}`, async () => {
          await this.outgoingRequestProcessor.makeOutgoingRequest(request);
        });
      } catch (e) {
        // as part of the loop we silently ignore errors, but log them.
        // The rust sdk will retry the request later as it won't have been marked as sent.
        this.logger.error(`Failed to process outgoing request ${request.type}: ${e}`);
      }
    }
  }
}
exports.OutgoingRequestsManager = OutgoingRequestsManager;