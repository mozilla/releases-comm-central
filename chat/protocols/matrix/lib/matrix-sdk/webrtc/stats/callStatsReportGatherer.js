"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CallStatsReportGatherer = void 0;
var _connectionStats = require("./connectionStats");
var _connectionStatsBuilder = require("./connectionStatsBuilder");
var _transportStatsBuilder = require("./transportStatsBuilder");
var _mediaSsrcHandler = require("./media/mediaSsrcHandler");
var _mediaTrackHandler = require("./media/mediaTrackHandler");
var _mediaTrackStatsHandler = require("./media/mediaTrackStatsHandler");
var _trackStatsBuilder = require("./trackStatsBuilder");
var _connectionStatsReportBuilder = require("./connectionStatsReportBuilder");
var _valueFormatter = require("./valueFormatter");
var _logger = require("../../logger");
var _callFeedStatsReporter = require("./callFeedStatsReporter");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
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
class CallStatsReportGatherer {
  constructor(callId, opponentMemberId, pc, emitter, isFocus = true) {
    this.callId = callId;
    this.opponentMemberId = opponentMemberId;
    this.pc = pc;
    this.emitter = emitter;
    this.isFocus = isFocus;
    _defineProperty(this, "isActive", true);
    _defineProperty(this, "previousStatsReport", void 0);
    _defineProperty(this, "currentStatsReport", void 0);
    _defineProperty(this, "connectionStats", new _connectionStats.ConnectionStats());
    _defineProperty(this, "trackStats", void 0);
    pc.addEventListener("signalingstatechange", this.onSignalStateChange.bind(this));
    this.trackStats = new _mediaTrackStatsHandler.MediaTrackStatsHandler(new _mediaSsrcHandler.MediaSsrcHandler(), new _mediaTrackHandler.MediaTrackHandler(pc));
  }
  async processStats(groupCallId, localUserId) {
    const summary = {
      isFirstCollection: this.previousStatsReport === undefined,
      receivedMedia: 0,
      receivedAudioMedia: 0,
      receivedVideoMedia: 0,
      audioTrackSummary: {
        count: 0,
        muted: 0,
        maxPacketLoss: 0,
        maxJitter: 0,
        concealedAudio: 0,
        totalAudio: 0
      },
      videoTrackSummary: {
        count: 0,
        muted: 0,
        maxPacketLoss: 0,
        maxJitter: 0,
        concealedAudio: 0,
        totalAudio: 0
      }
    };
    if (this.isActive) {
      const statsPromise = this.pc.getStats();
      if (typeof statsPromise?.then === "function") {
        return statsPromise.then(report => {
          // @ts-ignore
          this.currentStatsReport = typeof report?.result === "function" ? report.result() : report;
          try {
            this.processStatsReport(groupCallId, localUserId);
          } catch (error) {
            this.handleError(error);
            return summary;
          }
          this.previousStatsReport = this.currentStatsReport;
          summary.receivedMedia = this.connectionStats.bitrate.download;
          summary.receivedAudioMedia = this.connectionStats.bitrate.audio?.download || 0;
          summary.receivedVideoMedia = this.connectionStats.bitrate.video?.download || 0;
          const trackSummary = _trackStatsBuilder.TrackStatsBuilder.buildTrackSummary(Array.from(this.trackStats.getTrack2stats().values()));
          return _objectSpread(_objectSpread({}, summary), {}, {
            audioTrackSummary: trackSummary.audioTrackSummary,
            videoTrackSummary: trackSummary.videoTrackSummary
          });
        }).catch(error => {
          this.handleError(error);
          return summary;
        });
      }
      this.isActive = false;
    }
    return Promise.resolve(summary);
  }
  processStatsReport(groupCallId, localUserId) {
    const byteSentStatsReport = new Map();
    byteSentStatsReport.callId = this.callId;
    byteSentStatsReport.opponentMemberId = this.opponentMemberId;
    this.currentStatsReport?.forEach(now => {
      const before = this.previousStatsReport ? this.previousStatsReport.get(now.id) : null;
      // RTCIceCandidatePairStats - https://w3c.github.io/webrtc-stats/#candidatepair-dict*
      if (now.type === "candidate-pair" && now.nominated && now.state === "succeeded") {
        this.connectionStats.bandwidth = _connectionStatsBuilder.ConnectionStatsBuilder.buildBandwidthReport(now);
        this.connectionStats.transport = _transportStatsBuilder.TransportStatsBuilder.buildReport(this.currentStatsReport, now, this.connectionStats.transport, this.isFocus);

        // RTCReceivedRtpStreamStats
        // https://w3c.github.io/webrtc-stats/#receivedrtpstats-dict*
        // RTCSentRtpStreamStats
        // https://w3c.github.io/webrtc-stats/#sentrtpstats-dict*
      } else if (now.type === "inbound-rtp" || now.type === "outbound-rtp") {
        const trackStats = this.trackStats.findTrack2Stats(now, now.type === "inbound-rtp" ? "remote" : "local");
        if (!trackStats) {
          return;
        }
        if (before) {
          _trackStatsBuilder.TrackStatsBuilder.buildPacketsLost(trackStats, now, before);
        }

        // Get the resolution and framerate for only remote video sources here. For the local video sources,
        // 'track' stats will be used since they have the updated resolution based on the simulcast streams
        // currently being sent. Promise based getStats reports three 'outbound-rtp' streams and there will be
        // more calculations needed to determine what is the highest resolution stream sent by the client if the
        // 'outbound-rtp' stats are used.
        if (now.type === "inbound-rtp") {
          _trackStatsBuilder.TrackStatsBuilder.buildFramerateResolution(trackStats, now);
          if (before) {
            _trackStatsBuilder.TrackStatsBuilder.buildBitrateReceived(trackStats, now, before);
          }
          const ts = this.trackStats.findTransceiverByTrackId(trackStats.trackId);
          _trackStatsBuilder.TrackStatsBuilder.setTrackStatsState(trackStats, ts);
          _trackStatsBuilder.TrackStatsBuilder.buildJitter(trackStats, now);
          _trackStatsBuilder.TrackStatsBuilder.buildAudioConcealment(trackStats, now);
        } else if (before) {
          byteSentStatsReport.set(trackStats.trackId, _valueFormatter.ValueFormatter.getNonNegativeValue(now.bytesSent));
          _trackStatsBuilder.TrackStatsBuilder.buildBitrateSend(trackStats, now, before);
        }
        _trackStatsBuilder.TrackStatsBuilder.buildCodec(this.currentStatsReport, trackStats, now);
      } else if (now.type === "track" && now.kind === "video" && !now.remoteSource) {
        const trackStats = this.trackStats.findLocalVideoTrackStats(now);
        if (!trackStats) {
          return;
        }
        _trackStatsBuilder.TrackStatsBuilder.buildFramerateResolution(trackStats, now);
        _trackStatsBuilder.TrackStatsBuilder.calculateSimulcastFramerate(trackStats, now, before, this.trackStats.mediaTrackHandler.getActiveSimulcastStreams());
      }
    });
    this.emitter.emitByteSendReport(byteSentStatsReport);
    this.emitter.emitCallFeedReport(_callFeedStatsReporter.CallFeedStatsReporter.buildCallFeedReport(this.callId, this.opponentMemberId, this.pc));
    this.processAndEmitConnectionStatsReport();
  }
  setActive(isActive) {
    this.isActive = isActive;
  }
  getActive() {
    return this.isActive;
  }
  handleError(error) {
    this.isActive = false;
    _logger.logger.warn(`CallStatsReportGatherer ${this.callId} processStatsReport fails and set to inactive ${error}`);
  }
  processAndEmitConnectionStatsReport() {
    const report = _connectionStatsReportBuilder.ConnectionStatsReportBuilder.build(this.trackStats.getTrack2stats());
    report.callId = this.callId;
    report.opponentMemberId = this.opponentMemberId;
    this.connectionStats.bandwidth = report.bandwidth;
    this.connectionStats.bitrate = report.bitrate;
    this.connectionStats.packetLoss = report.packetLoss;
    this.emitter.emitConnectionStatsReport(_objectSpread(_objectSpread({}, report), {}, {
      transport: this.connectionStats.transport
    }));
    this.connectionStats.transport = [];
  }
  stopProcessingStats() {}
  onSignalStateChange() {
    if (this.pc.signalingState === "stable") {
      if (this.pc.currentRemoteDescription) {
        this.trackStats.mediaSsrcHandler.parse(this.pc.currentRemoteDescription.sdp, "remote");
      }
      if (this.pc.currentLocalDescription) {
        this.trackStats.mediaSsrcHandler.parse(this.pc.currentLocalDescription.sdp, "local");
      }
    }
  }
  setOpponentMemberId(id) {
    this.opponentMemberId = id;
  }
}
exports.CallStatsReportGatherer = CallStatsReportGatherer;