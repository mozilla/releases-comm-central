"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isSessionMembershipData = exports.isLegacyCallMembershipData = exports.CallMembership = void 0;
var _utils = require("../utils.js");
var _LivekitFocus = require("./LivekitFocus.js");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2023 The Matrix.org Foundation C.I.C.

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
// Represents an entry in the memberships section of an m.call.member event as it is on the wire

// There are two different data interfaces. One for the Legacy types and one compliant with MSC4143

// MSC4143 (MatrixRTC) session membership data

const isSessionMembershipData = data => "focus_active" in data;
exports.isSessionMembershipData = isSessionMembershipData;
const checkSessionsMembershipData = (data, errors) => {
  const prefix = "Malformed session membership event: ";
  if (typeof data.device_id !== "string") errors.push(prefix + "device_id must be string");
  if (typeof data.call_id !== "string") errors.push(prefix + "call_id must be string");
  if (typeof data.application !== "string") errors.push(prefix + "application must be a string");
  if (typeof data.focus_active?.type !== "string") errors.push(prefix + "focus_active.type must be a string");
  if (!Array.isArray(data.foci_preferred)) errors.push(prefix + "foci_preferred must be an array");
  // optional parameters
  if (data.created_ts && typeof data.created_ts !== "number") errors.push(prefix + "created_ts must be number");

  // application specific data (we first need to check if they exist)
  if (data.scope && typeof data.scope !== "string") errors.push(prefix + "scope must be string");
  return errors.length === 0;
};

// Legacy session membership data

const isLegacyCallMembershipData = data => "membershipID" in data;
exports.isLegacyCallMembershipData = isLegacyCallMembershipData;
const checkCallMembershipDataLegacy = (data, errors) => {
  const prefix = "Malformed legacy rtc membership event: ";
  if (!("expires" in data || "expires_ts" in data)) {
    errors.push(prefix + "expires_ts or expires must be present");
  }
  if ("expires" in data) {
    if (typeof data.expires !== "number") {
      errors.push(prefix + "expires must be numeric");
    }
  }
  if ("expires_ts" in data) {
    if (typeof data.expires_ts !== "number") {
      errors.push(prefix + "expires_ts must be numeric");
    }
  }
  if (typeof data.device_id !== "string") errors.push(prefix + "device_id must be string");
  if (typeof data.call_id !== "string") errors.push(prefix + "call_id must be string");
  if (typeof data.application !== "string") errors.push(prefix + "application must be a string");
  if (typeof data.membershipID !== "string") errors.push(prefix + "membershipID must be a string");
  // optional elements
  if (data.created_ts && typeof data.created_ts !== "number") errors.push(prefix + "created_ts must be number");
  // application specific data (we first need to check if they exist)
  if (data.scope && typeof data.scope !== "string") errors.push(prefix + "scope must be string");
  return errors.length === 0;
};
class CallMembership {
  static equal(a, b) {
    return (0, _utils.deepCompare)(a.membershipData, b.membershipData);
  }
  constructor(parentEvent, data) {
    this.parentEvent = parentEvent;
    _defineProperty(this, "membershipData", void 0);
    const sessionErrors = [];
    const legacyErrors = [];
    if (!checkSessionsMembershipData(data, sessionErrors) && !checkCallMembershipDataLegacy(data, legacyErrors)) {
      throw Error(`unknown CallMembership data. Does not match legacy call.member (${legacyErrors.join(" & ")}) events nor MSC4143 (${sessionErrors.join(" & ")})`);
    } else {
      this.membershipData = data;
    }
  }
  get sender() {
    return this.parentEvent.getSender();
  }
  get eventId() {
    return this.parentEvent.getId();
  }
  get callId() {
    return this.membershipData.call_id;
  }
  get deviceId() {
    return this.membershipData.device_id;
  }
  get application() {
    return this.membershipData.application;
  }
  get scope() {
    return this.membershipData.scope;
  }
  get membershipID() {
    if (isLegacyCallMembershipData(this.membershipData)) return this.membershipData.membershipID;
    // the createdTs behaves equivalent to the membershipID.
    // we only need the field for the legacy member envents where we needed to update them
    // synapse ignores sending state events if they have the same content.
    else return this.createdTs().toString();
  }
  createdTs() {
    return this.membershipData.created_ts ?? this.parentEvent.getTs();
  }

  /**
   * Gets the absolute expiry time of the membership if applicable to this membership type.
   * @returns The absolute expiry time of the membership as a unix timestamp in milliseconds or undefined if not applicable
   */
  getAbsoluteExpiry() {
    // if the membership is not a legacy membership, we assume it is MSC4143
    if (!isLegacyCallMembershipData(this.membershipData)) return undefined;
    if ("expires" in this.membershipData) {
      // we know createdTs exists since we already do the isLegacyCallMembershipData check
      return this.createdTs() + this.membershipData.expires;
    } else {
      // We know it exists because we checked for this in the constructor.
      return this.membershipData.expires_ts;
    }
  }

  /**
   * Gets the expiry time of the event, converted into the device's local time.
   * @deprecated This function has been observed returning bad data and is no longer used by MatrixRTC.
   * @returns The local expiry time of the membership as a unix timestamp in milliseconds or undefined if not applicable
   */
  getLocalExpiry() {
    // if the membership is not a legacy membership, we assume it is MSC4143
    if (!isLegacyCallMembershipData(this.membershipData)) return undefined;
    if ("expires" in this.membershipData) {
      // we know createdTs exists since we already do the isLegacyCallMembershipData check
      const relativeCreationTime = this.parentEvent.getTs() - this.createdTs();
      const localCreationTs = this.parentEvent.localTimestamp - relativeCreationTime;
      return localCreationTs + this.membershipData.expires;
    } else {
      // With expires_ts we cannot convert to local time.
      // TODO: Check the server timestamp and compute a diff to local time.
      return this.membershipData.expires_ts;
    }
  }

  /**
   * @returns The number of milliseconds until the membership expires or undefined if applicable
   */
  getMsUntilExpiry() {
    if (isLegacyCallMembershipData(this.membershipData)) {
      // Assume that local clock is sufficiently in sync with other clocks in the distributed system.
      // We used to try and adjust for the local clock being skewed, but there are cases where this is not accurate.
      // The current implementation allows for the local clock to be -infinity to +MatrixRTCSession.MEMBERSHIP_EXPIRY_TIME/2
      return this.getAbsoluteExpiry() - Date.now();
    }

    // Assumed to be MSC4143
    return undefined;
  }

  /**
   * @returns true if the membership has expired, otherwise false
   */
  isExpired() {
    if (isLegacyCallMembershipData(this.membershipData)) return this.getMsUntilExpiry() <= 0;

    // MSC4143 events expire by being updated. So if the event exists, its not expired.
    return false;
  }
  getPreferredFoci() {
    // To support both, the new and the old MatrixRTC memberships have two cases based
    // on the availablitiy of `foci_preferred`
    if (isLegacyCallMembershipData(this.membershipData)) return this.membershipData.foci_active ?? [];

    // MSC4143 style membership
    return this.membershipData.foci_preferred;
  }
  getFocusSelection() {
    if (isLegacyCallMembershipData(this.membershipData)) {
      return "oldest_membership";
    } else {
      const focusActive = this.membershipData.focus_active;
      if ((0, _LivekitFocus.isLivekitFocusActive)(focusActive)) {
        return focusActive.focus_selection;
      }
    }
  }
}
exports.CallMembership = CallMembership;