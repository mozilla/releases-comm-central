"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RoomSummary = void 0;
/*
Copyright 2015 - 2021 The Matrix.org Foundation C.I.C.

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
 * Construct a new Room Summary. A summary can be used for display on a recent
 * list, without having to load the entire room list into memory.
 * @param roomId - Required. The ID of this room.
 * @param info - Optional. The summary info. Additional keys are supported.
 */
class RoomSummary {
  constructor(roomId, info) {
    this.roomId = roomId;
  }
}
exports.RoomSummary = RoomSummary;