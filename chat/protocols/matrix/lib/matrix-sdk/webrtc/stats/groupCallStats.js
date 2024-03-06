"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GroupCallStats = void 0;
var _callStatsReportGatherer = require("./callStatsReportGatherer");
var _statsReportEmitter = require("./statsReportEmitter");
var _summaryStatsReportGatherer = require("./summaryStatsReportGatherer");
var _logger = require("../../logger");
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
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
class GroupCallStats {
  constructor(groupCallId, userId, interval = 10000) {
    this.groupCallId = groupCallId;
    this.userId = userId;
    this.interval = interval;
    _defineProperty(this, "timer", void 0);
    _defineProperty(this, "gatherers", new Map());
    _defineProperty(this, "reports", new _statsReportEmitter.StatsReportEmitter());
    _defineProperty(this, "summaryStatsReportGatherer", new _summaryStatsReportGatherer.SummaryStatsReportGatherer(this.reports));
  }
  start() {
    if (this.timer === undefined && this.interval > 0) {
      this.timer = setInterval(() => {
        this.processStats();
      }, this.interval);
    }
  }
  stop() {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.gatherers.forEach(c => c.stopProcessingStats());
    }
  }
  hasStatsReportGatherer(callId) {
    return this.gatherers.has(callId);
  }
  addStatsReportGatherer(callId, opponentMemberId, peerConnection) {
    if (this.hasStatsReportGatherer(callId)) {
      return false;
    }
    this.gatherers.set(callId, new _callStatsReportGatherer.CallStatsReportGatherer(callId, opponentMemberId, peerConnection, this.reports));
    return true;
  }
  removeStatsReportGatherer(callId) {
    return this.gatherers.delete(callId);
  }
  getStatsReportGatherer(callId) {
    return this.hasStatsReportGatherer(callId) ? this.gatherers.get(callId) : undefined;
  }
  updateOpponentMember(callId, opponentMember) {
    this.getStatsReportGatherer(callId)?.setOpponentMemberId(opponentMember);
  }
  processStats() {
    const summary = [];
    this.gatherers.forEach(c => {
      summary.push(c.processStats(this.groupCallId, this.userId));
    });
    Promise.all(summary).then(s => this.summaryStatsReportGatherer.build(s)).catch(err => {
      _logger.logger.error("Could not build summary stats report", err);
    });
  }
  setInterval(interval) {
    this.interval = interval;
  }
}
exports.GroupCallStats = GroupCallStats;