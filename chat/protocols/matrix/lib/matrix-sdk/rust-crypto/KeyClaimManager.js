"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KeyClaimManager = void 0;
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
/*
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
 * KeyClaimManager: linearises calls to OlmMachine.getMissingSessions to avoid races
 *
 * We have one of these per `RustCrypto` (and hence per `MatrixClient`).
 */
class KeyClaimManager {
  constructor(olmMachine, outgoingRequestProcessor) {
    this.olmMachine = olmMachine;
    this.outgoingRequestProcessor = outgoingRequestProcessor;
    _defineProperty(this, "currentClaimPromise", void 0);
    _defineProperty(this, "stopped", false);
    this.currentClaimPromise = Promise.resolve();
  }

  /**
   * Tell the KeyClaimManager to immediately stop processing requests.
   *
   * Any further calls, and any still in the queue, will fail with an error.
   */
  stop() {
    this.stopped = true;
  }

  /**
   * Given a list of users, attempt to ensure that we have Olm Sessions active with each of their devices
   *
   * If we don't have an active olm session, we will claim a one-time key and start one.
   *
   * @param userList - list of userIDs to claim
   */
  ensureSessionsForUsers(userList) {
    // The Rust-SDK requires that we only have one getMissingSessions process in flight at once. This little dance
    // ensures that, by only having one call to ensureSessionsForUsersInner active at once (and making them
    // queue up in order).
    const prom = this.currentClaimPromise.catch(() => {
      // any errors in the previous claim will have been reported already, so there is nothing to do here.
      // we just throw away the error and start anew.
    }).then(() => this.ensureSessionsForUsersInner(userList));
    this.currentClaimPromise = prom;
    return prom;
  }
  async ensureSessionsForUsersInner(userList) {
    // bail out quickly if we've been stopped.
    if (this.stopped) {
      throw new Error(`Cannot ensure Olm sessions: shutting down`);
    }
    const claimRequest = await this.olmMachine.getMissingSessions(userList);
    if (claimRequest) {
      await this.outgoingRequestProcessor.makeOutgoingRequest(claimRequest);
    }
  }
}
exports.KeyClaimManager = KeyClaimManager;