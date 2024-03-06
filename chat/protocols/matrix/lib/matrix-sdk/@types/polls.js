"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.M_POLL_START = exports.M_POLL_RESPONSE = exports.M_POLL_KIND_UNDISCLOSED = exports.M_POLL_KIND_DISCLOSED = exports.M_POLL_END = void 0;
var _matrixEventsSdk = require("matrix-events-sdk");
/*
Copyright 2022 - 2023 The Matrix.org Foundation C.I.C.

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
 * Identifier for a disclosed poll.
 */
const M_POLL_KIND_DISCLOSED = exports.M_POLL_KIND_DISCLOSED = new _matrixEventsSdk.UnstableValue("m.poll.disclosed", "org.matrix.msc3381.poll.disclosed");

/**
 * Identifier for an undisclosed poll.
 */
const M_POLL_KIND_UNDISCLOSED = exports.M_POLL_KIND_UNDISCLOSED = new _matrixEventsSdk.UnstableValue("m.poll.undisclosed", "org.matrix.msc3381.poll.undisclosed");

/**
 * Any poll kind.
 */

/**
 * Known poll kind namespaces.
 */

/**
 * The namespaced value for m.poll.start
 */
const M_POLL_START = exports.M_POLL_START = new _matrixEventsSdk.UnstableValue("m.poll.start", "org.matrix.msc3381.poll.start");

/**
 * The m.poll.start type within event content
 */

/**
 * A poll answer.
 */

/**
 * The event definition for an m.poll.start event (in content)
 */

/**
 * The content for an m.poll.start event
 */

/**
 * The namespaced value for m.poll.response
 */
const M_POLL_RESPONSE = exports.M_POLL_RESPONSE = new _matrixEventsSdk.UnstableValue("m.poll.response", "org.matrix.msc3381.poll.response");

/**
 * The m.poll.response type within event content
 */

/**
 * The event definition for an m.poll.response event (in content)
 */

/**
 * The content for an m.poll.response event
 */

/**
 * The namespaced value for m.poll.end
 */
const M_POLL_END = exports.M_POLL_END = new _matrixEventsSdk.UnstableValue("m.poll.end", "org.matrix.msc3381.poll.end");

/**
 * The event definition for an m.poll.end event (in content)
 */

/**
 * The content for an m.poll.end event
 */