"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UNSTABLE_MSC3089_TREE_SUBTYPE = exports.UNSTABLE_MSC3089_LEAF = exports.UNSTABLE_MSC3089_BRANCH = exports.UNSTABLE_MSC3088_PURPOSE = exports.UNSTABLE_MSC3088_ENABLED = exports.UNSTABLE_MSC2716_MARKER = exports.UNSTABLE_ELEMENT_FUNCTIONAL_USERS = exports.UNSIGNED_THREAD_ID_FIELD = exports.ToDeviceMessageId = exports.RoomType = exports.RoomCreateTypeField = exports.RelationType = exports.PUSHER_ENABLED = exports.PUSHER_DEVICE_ID = exports.MsgType = exports.MSC3912_RELATION_BASED_REDACTIONS_PROP = exports.LOCAL_NOTIFICATION_SETTINGS_PREFIX = exports.EventType = exports.EVENT_VISIBILITY_CHANGE_TYPE = void 0;
var _NamespacedValue = require("../NamespacedValue");
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
let EventType = exports.EventType = /*#__PURE__*/function (EventType) {
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
  EventType["RoomPredecessor"] = "org.matrix.msc3946.room_predecessor";
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
  EventType["CallSDPStreamMetadataChanged"] = "m.call.sdp_stream_metadata_changed";
  EventType["CallSDPStreamMetadataChangedPrefix"] = "org.matrix.call.sdp_stream_metadata_changed";
  EventType["CallReplaces"] = "m.call.replaces";
  EventType["CallAssertedIdentity"] = "m.call.asserted_identity";
  EventType["CallAssertedIdentityPrefix"] = "org.matrix.call.asserted_identity";
  EventType["CallEncryptionKeysPrefix"] = "io.element.call.encryption_keys";
  EventType["KeyVerificationRequest"] = "m.key.verification.request";
  EventType["KeyVerificationStart"] = "m.key.verification.start";
  EventType["KeyVerificationCancel"] = "m.key.verification.cancel";
  EventType["KeyVerificationMac"] = "m.key.verification.mac";
  EventType["KeyVerificationDone"] = "m.key.verification.done";
  EventType["KeyVerificationKey"] = "m.key.verification.key";
  EventType["KeyVerificationAccept"] = "m.key.verification.accept";
  EventType["KeyVerificationReady"] = "m.key.verification.ready";
  EventType["RoomMessageFeedback"] = "m.room.message.feedback";
  EventType["Reaction"] = "m.reaction";
  EventType["PollStart"] = "org.matrix.msc3381.poll.start";
  EventType["Typing"] = "m.typing";
  EventType["Receipt"] = "m.receipt";
  EventType["Presence"] = "m.presence";
  EventType["FullyRead"] = "m.fully_read";
  EventType["Tag"] = "m.tag";
  EventType["SpaceOrder"] = "org.matrix.msc3230.space_order";
  EventType["PushRules"] = "m.push_rules";
  EventType["Direct"] = "m.direct";
  EventType["IgnoredUserList"] = "m.ignored_user_list";
  EventType["RoomKey"] = "m.room_key";
  EventType["RoomKeyRequest"] = "m.room_key_request";
  EventType["ForwardedRoomKey"] = "m.forwarded_room_key";
  EventType["Dummy"] = "m.dummy";
  EventType["GroupCallPrefix"] = "org.matrix.msc3401.call";
  EventType["GroupCallMemberPrefix"] = "org.matrix.msc3401.call.member";
  EventType["CallNotify"] = "org.matrix.msc4075.call.notify";
  return EventType;
}({});
let RelationType = exports.RelationType = /*#__PURE__*/function (RelationType) {
  RelationType["Annotation"] = "m.annotation";
  RelationType["Replace"] = "m.replace";
  RelationType["Reference"] = "m.reference";
  RelationType["Thread"] = "m.thread";
  return RelationType;
}({});
let MsgType = exports.MsgType = /*#__PURE__*/function (MsgType) {
  MsgType["Text"] = "m.text";
  MsgType["Emote"] = "m.emote";
  MsgType["Notice"] = "m.notice";
  MsgType["Image"] = "m.image";
  MsgType["File"] = "m.file";
  MsgType["Audio"] = "m.audio";
  MsgType["Location"] = "m.location";
  MsgType["Video"] = "m.video";
  MsgType["KeyVerificationRequest"] = "m.key.verification.request";
  return MsgType;
}({});
const RoomCreateTypeField = exports.RoomCreateTypeField = "type";
let RoomType = exports.RoomType = /*#__PURE__*/function (RoomType) {
  RoomType["Space"] = "m.space";
  RoomType["UnstableCall"] = "org.matrix.msc3417.call";
  RoomType["ElementVideo"] = "io.element.video";
  return RoomType;
}({});
const ToDeviceMessageId = exports.ToDeviceMessageId = "org.matrix.msgid";

/**
 * Identifier for an [MSC3088](https://github.com/matrix-org/matrix-doc/pull/3088)
 * room purpose. Note that this reference is UNSTABLE and subject to breaking changes,
 * including its eventual removal.
 */
const UNSTABLE_MSC3088_PURPOSE = exports.UNSTABLE_MSC3088_PURPOSE = new _NamespacedValue.UnstableValue("m.room.purpose", "org.matrix.msc3088.purpose");

/**
 * Enabled flag for an [MSC3088](https://github.com/matrix-org/matrix-doc/pull/3088)
 * room purpose. Note that this reference is UNSTABLE and subject to breaking changes,
 * including its eventual removal.
 */
const UNSTABLE_MSC3088_ENABLED = exports.UNSTABLE_MSC3088_ENABLED = new _NamespacedValue.UnstableValue("m.enabled", "org.matrix.msc3088.enabled");

/**
 * Subtype for an [MSC3089](https://github.com/matrix-org/matrix-doc/pull/3089) space-room.
 * Note that this reference is UNSTABLE and subject to breaking changes, including its
 * eventual removal.
 */
const UNSTABLE_MSC3089_TREE_SUBTYPE = exports.UNSTABLE_MSC3089_TREE_SUBTYPE = new _NamespacedValue.UnstableValue("m.data_tree", "org.matrix.msc3089.data_tree");

/**
 * Leaf type for an event in a [MSC3089](https://github.com/matrix-org/matrix-doc/pull/3089) space-room.
 * Note that this reference is UNSTABLE and subject to breaking changes, including its
 * eventual removal.
 */
const UNSTABLE_MSC3089_LEAF = exports.UNSTABLE_MSC3089_LEAF = new _NamespacedValue.UnstableValue("m.leaf", "org.matrix.msc3089.leaf");

/**
 * Branch (Leaf Reference) type for the index approach in a
 * [MSC3089](https://github.com/matrix-org/matrix-doc/pull/3089) space-room. Note that this reference is
 * UNSTABLE and subject to breaking changes, including its eventual removal.
 */
const UNSTABLE_MSC3089_BRANCH = exports.UNSTABLE_MSC3089_BRANCH = new _NamespacedValue.UnstableValue("m.branch", "org.matrix.msc3089.branch");

/**
 * Marker event type to point back at imported historical content in a room. See
 * [MSC2716](https://github.com/matrix-org/matrix-spec-proposals/pull/2716).
 * Note that this reference is UNSTABLE and subject to breaking changes,
 * including its eventual removal.
 */
const UNSTABLE_MSC2716_MARKER = exports.UNSTABLE_MSC2716_MARKER = new _NamespacedValue.UnstableValue("m.room.marker", "org.matrix.msc2716.marker");

/**
 * Name of the request property for relation based redactions.
 * {@link https://github.com/matrix-org/matrix-spec-proposals/pull/3912}
 */
const MSC3912_RELATION_BASED_REDACTIONS_PROP = exports.MSC3912_RELATION_BASED_REDACTIONS_PROP = new _NamespacedValue.UnstableValue("with_rel_types", "org.matrix.msc3912.with_relations");

/**
 * Functional members type for declaring a purpose of room members (e.g. helpful bots).
 * Note that this reference is UNSTABLE and subject to breaking changes, including its
 * eventual removal.
 *
 * Schema (TypeScript):
 * ```
 * {
 *   service_members?: string[]
 * }
 * ```
 *
 * @example
 * ```
 * {
 *   "service_members": [
 *     "@helperbot:localhost",
 *     "@reminderbot:alice.tdl"
 *   ]
 * }
 * ```
 */
const UNSTABLE_ELEMENT_FUNCTIONAL_USERS = exports.UNSTABLE_ELEMENT_FUNCTIONAL_USERS = new _NamespacedValue.UnstableValue("io.element.functional_members", "io.element.functional_members");

/**
 * A type of message that affects visibility of a message,
 * as per https://github.com/matrix-org/matrix-doc/pull/3531
 *
 * @experimental
 */
const EVENT_VISIBILITY_CHANGE_TYPE = exports.EVENT_VISIBILITY_CHANGE_TYPE = new _NamespacedValue.UnstableValue("m.visibility", "org.matrix.msc3531.visibility");

/**
 * https://github.com/matrix-org/matrix-doc/pull/3881
 *
 * @experimental
 */
const PUSHER_ENABLED = exports.PUSHER_ENABLED = new _NamespacedValue.UnstableValue("enabled", "org.matrix.msc3881.enabled");

/**
 * https://github.com/matrix-org/matrix-doc/pull/3881
 *
 * @experimental
 */
const PUSHER_DEVICE_ID = exports.PUSHER_DEVICE_ID = new _NamespacedValue.UnstableValue("device_id", "org.matrix.msc3881.device_id");

/**
 * https://github.com/matrix-org/matrix-doc/pull/3890
 *
 * @experimental
 */
const LOCAL_NOTIFICATION_SETTINGS_PREFIX = exports.LOCAL_NOTIFICATION_SETTINGS_PREFIX = new _NamespacedValue.UnstableValue("m.local_notification_settings", "org.matrix.msc3890.local_notification_settings");

/**
 * https://github.com/matrix-org/matrix-doc/pull/4023
 *
 * @experimental
 */
const UNSIGNED_THREAD_ID_FIELD = exports.UNSIGNED_THREAD_ID_FIELD = new _NamespacedValue.UnstableValue("thread_id", "org.matrix.msc4023.thread_id");