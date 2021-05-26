"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RoomType = exports.RoomCreateTypeField = exports.MsgType = exports.EventType = void 0;

/*
Copyright 2020 The Matrix.org Foundation C.I.C.

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
let EventType;
exports.EventType = EventType;

(function (EventType) {
  EventType["RoomCanonicalAlias"] = "m.room.canonical_alias";
  EventType["RoomCreate"] = "m.room.create";
  EventType["RoomJoinRules"] = "m.room.join_rules";
  EventType["RoomMember"] = "m.room.member";
  EventType["RoomThirdPartyInvite"] = "m.room.third_party_invite";
  EventType["RoomPowerLevels"] = "m.room.power_levels";
  EventType["RoomName"] = "m.room.name";
  EventType["RoomTopic"] = "m.room.topic";
  EventType["RoomAvatar"] = "m.room.avatar";
  EventType["RoomPinnedEvents"] = "m.room.pinned_events";
  EventType["RoomEncryption"] = "m.room.encryption";
  EventType["RoomHistoryVisibility"] = "m.room.history_visibility";
  EventType["RoomGuestAccess"] = "m.room.guest_access";
  EventType["RoomServerAcl"] = "m.room.server_acl";
  EventType["RoomTombstone"] = "m.room.tombstone";
  EventType["RoomAliases"] = "m.room.aliases";
  EventType["SpaceChild"] = "m.space.child";
  EventType["SpaceParent"] = "m.space.parent";
  EventType["RoomRedaction"] = "m.room.redaction";
  EventType["RoomMessage"] = "m.room.message";
  EventType["RoomMessageEncrypted"] = "m.room.encrypted";
  EventType["Sticker"] = "m.sticker";
  EventType["CallInvite"] = "m.call.invite";
  EventType["CallCandidates"] = "m.call.candidates";
  EventType["CallAnswer"] = "m.call.answer";
  EventType["CallHangup"] = "m.call.hangup";
  EventType["CallReject"] = "m.call.reject";
  EventType["CallSelectAnswer"] = "m.call.select_answer";
  EventType["CallNegotiate"] = "m.call.negotiate";
  EventType["CallReplaces"] = "m.call.replaces";
  EventType["CallAssertedIdentity"] = "m.call.asserted_identity";
  EventType["CallAssertedIdentityPrefix"] = "org.matrix.call.asserted_identity";
  EventType["KeyVerificationRequest"] = "m.key.verification.request";
  EventType["KeyVerificationStart"] = "m.key.verification.start";
  EventType["KeyVerificationCancel"] = "m.key.verification.cancel";
  EventType["KeyVerificationMac"] = "m.key.verification.mac";
  EventType["KeyVerificationDone"] = "m.key.verification.done";
  EventType["RoomMessageFeedback"] = "m.room.message.feedback";
  EventType["Reaction"] = "m.reaction";
  EventType["Typing"] = "m.typing";
  EventType["Receipt"] = "m.receipt";
  EventType["Presence"] = "m.presence";
  EventType["FullyRead"] = "m.fully_read";
  EventType["Tag"] = "m.tag";
  EventType["PushRules"] = "m.push_rules";
  EventType["Direct"] = "m.direct";
  EventType["IgnoredUserList"] = "m.ignored_user_list";
  EventType["RoomKey"] = "m.room_key";
  EventType["RoomKeyRequest"] = "m.room_key_request";
  EventType["ForwardedRoomKey"] = "m.forwarded_room_key";
  EventType["Dummy"] = "m.dummy";
})(EventType || (exports.EventType = EventType = {}));

let MsgType;
exports.MsgType = MsgType;

(function (MsgType) {
  MsgType["Text"] = "m.text";
  MsgType["Emote"] = "m.emote";
  MsgType["Notice"] = "m.notice";
  MsgType["Image"] = "m.image";
  MsgType["File"] = "m.file";
  MsgType["Audio"] = "m.audio";
  MsgType["Location"] = "m.location";
  MsgType["Video"] = "m.video";
})(MsgType || (exports.MsgType = MsgType = {}));

const RoomCreateTypeField = "type";
exports.RoomCreateTypeField = RoomCreateTypeField;
let RoomType;
exports.RoomType = RoomType;

(function (RoomType) {
  RoomType["Space"] = "m.space";
})(RoomType || (exports.RoomType = RoomType = {}));