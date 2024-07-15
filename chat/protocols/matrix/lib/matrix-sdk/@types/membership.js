"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KnownMembership = void 0;
/*
Copyright 2024 The Matrix.org Foundation C.I.C.

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
 * Well-known values (from the spec or MSCs) that are allowed in the
 * {@link Membership} type.
 */
let KnownMembership = exports.KnownMembership = /*#__PURE__*/function (KnownMembership) {
  KnownMembership["Ban"] = "ban";
  KnownMembership["Invite"] = "invite";
  KnownMembership["Join"] = "join";
  KnownMembership["Knock"] = "knock";
  KnownMembership["Leave"] = "leave";
  return KnownMembership;
}({});
/**
 * The membership state for a user in a room [1]. A value from
 * {@link KnownMembership} should be used where available, but all string values
 * are allowed to provide flexibility for upcoming spec changes or proposals.
 *
 * [1] https://spec.matrix.org/latest/client-server-api/#mroommember
 */