"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GroupCallStats = void 0;
var _callStatsReportGatherer = require("./callStatsReportGatherer");
var _statsReportEmitter = require("./statsReportEmitter");
var _summaryStatsReportGatherer = require("./summaryStatsReportGatherer");
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
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
    Promise.all(summary).then(s => this.summaryStatsReportGatherer.build(s));
  }
  setInterval(interval) {
    this.interval = interval;
  }
}
exports.GroupCallStats = GroupCallStats;