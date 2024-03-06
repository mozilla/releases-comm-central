"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.M_TIMESTAMP = exports.M_LOCATION = exports.M_ASSET = exports.LocationAssetType = void 0;
var _NamespacedValue = require("../NamespacedValue");
var _extensible_events = require("./extensible_events");
/*
Copyright 2021 The Matrix.org Foundation C.I.C.

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
// Types for MSC3488 - m.location: Extending events with location data
let LocationAssetType = exports.LocationAssetType = /*#__PURE__*/function (LocationAssetType) {
  LocationAssetType["Self"] = "m.self";
  LocationAssetType["Pin"] = "m.pin";
  return LocationAssetType;
}({});
const M_ASSET = exports.M_ASSET = new _NamespacedValue.UnstableValue("m.asset", "org.matrix.msc3488.asset");

/**
 * The event definition for an m.asset event (in content)
 */

const M_TIMESTAMP = exports.M_TIMESTAMP = new _NamespacedValue.UnstableValue("m.ts", "org.matrix.msc3488.ts");
/**
 * The event definition for an m.ts event (in content)
 */

const M_LOCATION = exports.M_LOCATION = new _NamespacedValue.UnstableValue("m.location", "org.matrix.msc3488.location");

/* From the spec at:
 * https://github.com/matrix-org/matrix-doc/blob/matthew/location/proposals/3488-location.md
{
    "type": "m.room.message",
    "content": {
        "body": "Matthew was at geo:51.5008,0.1247;u=35 as of Sat Nov 13 18:50:58 2021",
        "msgtype": "m.location",
        "geo_uri": "geo:51.5008,0.1247;u=35",
        "m.location": {
            "uri": "geo:51.5008,0.1247;u=35",
            "description": "Matthew's whereabouts",
        },
        "m.asset": {
            "type": "m.self"
        },
        "m.text": "Matthew was at geo:51.5008,0.1247;u=35 as of Sat Nov 13 18:50:58 2021",
        "m.ts": 1636829458432,
    }
}
*/

/**
 * The content for an m.location event
 */

/**
 * Possible content for location events as sent over the wire
 */