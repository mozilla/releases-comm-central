"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.BuiltInModalButtonID = void 0;
/*
 * Copyright 2020 The Matrix.org Foundation C.I.C.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var BuiltInModalButtonID = /*#__PURE__*/function (BuiltInModalButtonID) {
  BuiltInModalButtonID["Close"] = "m.close";
  return BuiltInModalButtonID;
}({}); // Types for a normal modal requesting the opening a modal widget
// Types for a modal widget receiving notifications that its buttons have been pressed
// Types for a modal widget requesting close
// Types for a normal widget being notified that the modal widget it opened has been closed
exports.BuiltInModalButtonID = BuiltInModalButtonID;
//# sourceMappingURL=ModalWidgetActions.js.map