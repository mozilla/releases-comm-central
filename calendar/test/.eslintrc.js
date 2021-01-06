/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Calendar tests run with the pref calendar.timezone.local set to UTC. This
// works fine on the CI, where the system clock is also UTC, but on developers'
// machines the time difference causes some problems. If you have to use the
// Date object, make sure that you use UTC methods.

module.exports = {
  rules: {
    "no-restricted-properties": [
      "error",
      {
        property: "getFullYear",
        message: "These tests run in UTC. Use 'getUTCFullYear' instead.",
      },
      {
        property: "getMonth",
        message: "These tests run in UTC. Use 'getUTCMonth' instead.",
      },
      {
        property: "getDay",
        message: "These tests run in UTC. Use 'getUTCDay' instead.",
      },
      {
        property: "getDate",
        message: "These tests run in UTC. Use 'getUTCDate' instead.",
      },
      {
        property: "getHours",
        message: "These tests run in UTC. Use 'getUTCHours' instead.",
      },
      {
        property: "getMinutes",
        message: "These tests run in UTC. Use 'getUTCMinutes' instead.",
      },
      {
        property: "setFullYear",
        message: "These tests run in UTC. Use 'setUTCFullYear' instead.",
      },
      {
        property: "setMonth",
        message: "These tests run in UTC. Use 'setUTCMonth' instead.",
      },
      {
        property: "setDay",
        message: "These tests run in UTC. Use 'setUTCDay' instead.",
      },
      {
        property: "setDate",
        message: "These tests run in UTC. Use 'setUTCDate' instead.",
      },
      {
        property: "setHours",
        message: "These tests run in UTC. Use 'setUTCHours' instead.",
      },
      {
        property: "setMinutes",
        message: "These tests run in UTC. Use 'setUTCMinutes' instead.",
      },
    ],
    "no-restricted-syntax": [
      "error",
      {
        selector: "[callee.name='Date'][arguments.length>=2]",
        message:
          "These tests run in UTC. Use 'new Date(Date.UTC(...))' to construct a Date with arguments.",
      },
    ],
  },
};
