"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TweakName = exports.RuleId = exports.PushRuleKind = exports.PushRuleActionName = exports.DMMemberCountCondition = exports.ConditionOperator = exports.ConditionKind = void 0;
exports.isDmMemberCountCondition = isDmMemberCountCondition;
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
// allow camelcase as these are things that go onto the wire
/* eslint-disable camelcase */
let PushRuleActionName = exports.PushRuleActionName = /*#__PURE__*/function (PushRuleActionName) {
  PushRuleActionName["DontNotify"] = "dont_notify";
  PushRuleActionName["Notify"] = "notify";
  PushRuleActionName["Coalesce"] = "coalesce";
  return PushRuleActionName;
}({});
let TweakName = exports.TweakName = /*#__PURE__*/function (TweakName) {
  TweakName["Highlight"] = "highlight";
  TweakName["Sound"] = "sound";
  return TweakName;
}({});
let ConditionOperator = exports.ConditionOperator = /*#__PURE__*/function (ConditionOperator) {
  ConditionOperator["ExactEquals"] = "==";
  ConditionOperator["LessThan"] = "<";
  ConditionOperator["GreaterThan"] = ">";
  ConditionOperator["GreaterThanOrEqual"] = ">=";
  ConditionOperator["LessThanOrEqual"] = "<=";
  return ConditionOperator;
}({});
const DMMemberCountCondition = exports.DMMemberCountCondition = "2";
function isDmMemberCountCondition(condition) {
  return condition === "==2" || condition === "2";
}
let ConditionKind = exports.ConditionKind = /*#__PURE__*/function (ConditionKind) {
  ConditionKind["EventMatch"] = "event_match";
  ConditionKind["EventPropertyIs"] = "event_property_is";
  ConditionKind["EventPropertyContains"] = "event_property_contains";
  ConditionKind["ContainsDisplayName"] = "contains_display_name";
  ConditionKind["RoomMemberCount"] = "room_member_count";
  ConditionKind["SenderNotificationPermission"] = "sender_notification_permission";
  ConditionKind["CallStarted"] = "call_started";
  ConditionKind["CallStartedPrefix"] = "org.matrix.msc3914.call_started";
  return ConditionKind;
}({}); // XXX: custom conditions are possible but always fail, and break the typescript discriminated union so ignore them here
// IPushRuleCondition<Exclude<string, ConditionKind>> unfortunately does not resolve this at the time of writing.
let PushRuleKind = exports.PushRuleKind = /*#__PURE__*/function (PushRuleKind) {
  PushRuleKind["Override"] = "override";
  PushRuleKind["ContentSpecific"] = "content";
  PushRuleKind["RoomSpecific"] = "room";
  PushRuleKind["SenderSpecific"] = "sender";
  PushRuleKind["Underride"] = "underride";
  return PushRuleKind;
}({});
let RuleId = exports.RuleId = /*#__PURE__*/function (RuleId) {
  RuleId["Master"] = ".m.rule.master";
  RuleId["IsUserMention"] = ".m.rule.is_user_mention";
  RuleId["IsRoomMention"] = ".m.rule.is_room_mention";
  RuleId["ContainsDisplayName"] = ".m.rule.contains_display_name";
  RuleId["ContainsUserName"] = ".m.rule.contains_user_name";
  RuleId["AtRoomNotification"] = ".m.rule.roomnotif";
  RuleId["DM"] = ".m.rule.room_one_to_one";
  RuleId["EncryptedDM"] = ".m.rule.encrypted_room_one_to_one";
  RuleId["Message"] = ".m.rule.message";
  RuleId["EncryptedMessage"] = ".m.rule.encrypted";
  RuleId["InviteToSelf"] = ".m.rule.invite_for_me";
  RuleId["MemberEvent"] = ".m.rule.member_event";
  RuleId["IncomingCall"] = ".m.rule.call";
  RuleId["SuppressNotices"] = ".m.rule.suppress_notices";
  RuleId["Tombstone"] = ".m.rule.tombstone";
  RuleId["PollStart"] = ".m.rule.poll_start";
  RuleId["PollStartUnstable"] = ".org.matrix.msc3930.rule.poll_start";
  RuleId["PollEnd"] = ".m.rule.poll_end";
  RuleId["PollEndUnstable"] = ".org.matrix.msc3930.rule.poll_end";
  RuleId["PollStartOneToOne"] = ".m.rule.poll_start_one_to_one";
  RuleId["PollStartOneToOneUnstable"] = ".org.matrix.msc3930.rule.poll_start_one_to_one";
  RuleId["PollEndOneToOne"] = ".m.rule.poll_end_one_to_one";
  RuleId["PollEndOneToOneUnstable"] = ".org.matrix.msc3930.rule.poll_end_one_to_one";
  return RuleId;
}({});
/* eslint-enable camelcase */