"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isLivekitFocusConfig = exports.isLivekitFocusActive = exports.isLivekitFocus = void 0;
/*
Copyright 2023 New Vector Ltd

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

const isLivekitFocusConfig = object => object.type === "livekit" && "livekit_service_url" in object;
exports.isLivekitFocusConfig = isLivekitFocusConfig;
const isLivekitFocus = object => isLivekitFocusConfig(object) && "livekit_alias" in object;
exports.isLivekitFocus = isLivekitFocus;
const isLivekitFocusActive = object => object.type === "livekit" && "focus_selection" in object;
exports.isLivekitFocusActive = isLivekitFocusActive;