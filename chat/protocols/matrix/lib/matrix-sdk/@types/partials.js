"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Visibility = exports.RestrictedAllowType = exports.Preset = exports.JoinRule = exports.HistoryVisibility = exports.GuestAccess = void 0;
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
let Visibility = exports.Visibility = /*#__PURE__*/function (Visibility) {
  Visibility["Public"] = "public";
  Visibility["Private"] = "private";
  return Visibility;
}({});
let Preset = exports.Preset = /*#__PURE__*/function (Preset) {
  Preset["PrivateChat"] = "private_chat";
  Preset["TrustedPrivateChat"] = "trusted_private_chat";
  Preset["PublicChat"] = "public_chat";
  return Preset;
}({});
// Knock and private are reserved keywords which are not yet implemented.
let JoinRule = exports.JoinRule = /*#__PURE__*/function (JoinRule) {
  JoinRule["Public"] = "public";
  JoinRule["Invite"] = "invite";
  JoinRule["Private"] = "private";
  JoinRule["Knock"] = "knock";
  JoinRule["Restricted"] = "restricted";
  return JoinRule;
}({});
let RestrictedAllowType = exports.RestrictedAllowType = /*#__PURE__*/function (RestrictedAllowType) {
  RestrictedAllowType["RoomMembership"] = "m.room_membership";
  return RestrictedAllowType;
}({});
let GuestAccess = exports.GuestAccess = /*#__PURE__*/function (GuestAccess) {
  GuestAccess["CanJoin"] = "can_join";
  GuestAccess["Forbidden"] = "forbidden";
  return GuestAccess;
}({});
let HistoryVisibility = exports.HistoryVisibility = /*#__PURE__*/function (HistoryVisibility) {
  HistoryVisibility["Invited"] = "invited";
  HistoryVisibility["Joined"] = "joined";
  HistoryVisibility["Shared"] = "shared";
  HistoryVisibility["WorldReadable"] = "world_readable";
  return HistoryVisibility;
}({});