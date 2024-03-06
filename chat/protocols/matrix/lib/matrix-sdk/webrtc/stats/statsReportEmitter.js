"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.StatsReportEmitter = void 0;
var _typedEventEmitter = require("../../models/typed-event-emitter");
var _statsReport = require("./statsReport");
/*
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

class StatsReportEmitter extends _typedEventEmitter.TypedEventEmitter {
  emitByteSendReport(byteSentStats) {
    this.emit(_statsReport.StatsReport.BYTE_SENT_STATS, byteSentStats);
  }
  emitConnectionStatsReport(report) {
    this.emit(_statsReport.StatsReport.CONNECTION_STATS, report);
  }
  emitCallFeedReport(report) {
    this.emit(_statsReport.StatsReport.CALL_FEED_REPORT, report);
  }
  emitSummaryStatsReport(report) {
    this.emit(_statsReport.StatsReport.SUMMARY_STATS, report);
  }
}
exports.StatsReportEmitter = StatsReportEmitter;