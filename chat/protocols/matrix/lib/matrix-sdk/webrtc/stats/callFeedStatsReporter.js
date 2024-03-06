"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CallFeedStatsReporter = void 0;
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

class CallFeedStatsReporter {
  static buildCallFeedReport(callId, opponentMemberId, pc) {
    const rtpTransceivers = pc.getTransceivers();
    const transceiver = [];
    const callFeeds = [];
    rtpTransceivers.forEach(t => {
      const sender = t.sender?.track ? CallFeedStatsReporter.buildTrackStats(t.sender.track, "sender") : null;
      const receiver = CallFeedStatsReporter.buildTrackStats(t.receiver.track, "receiver");
      transceiver.push({
        mid: t.mid == null ? "null" : t.mid,
        direction: t.direction,
        currentDirection: t.currentDirection == null ? "null" : t.currentDirection,
        sender,
        receiver
      });
    });
    return {
      callId,
      opponentMemberId,
      transceiver,
      callFeeds
    };
  }
  static buildTrackStats(track, label = "--") {
    const settingDeviceId = track.getSettings()?.deviceId;
    const constrainDeviceId = track.getConstraints()?.deviceId;
    return {
      id: track.id,
      kind: track.kind,
      settingDeviceId: settingDeviceId ? settingDeviceId : "unknown",
      constrainDeviceId: constrainDeviceId ? constrainDeviceId : "unknown",
      muted: track.muted,
      enabled: track.enabled,
      readyState: track.readyState,
      label
    };
  }
  static expandCallFeedReport(report, callFeeds, prefix = "unknown") {
    if (!report.callFeeds) {
      report.callFeeds = [];
    }
    callFeeds.forEach(feed => {
      const audioTracks = feed.stream.getAudioTracks();
      const videoTracks = feed.stream.getVideoTracks();
      const audio = audioTracks.length > 0 ? CallFeedStatsReporter.buildTrackStats(feed.stream.getAudioTracks()[0], feed.purpose) : null;
      const video = videoTracks.length > 0 ? CallFeedStatsReporter.buildTrackStats(feed.stream.getVideoTracks()[0], feed.purpose) : null;
      const feedStats = {
        stream: feed.stream.id,
        type: feed.isLocal() ? "local" : "remote",
        audio,
        video,
        purpose: feed.purpose,
        prefix,
        isVideoMuted: feed.isVideoMuted(),
        isAudioMuted: feed.isAudioMuted()
      };
      report.callFeeds.push(feedStats);
    });
    return report;
  }
}
exports.CallFeedStatsReporter = CallFeedStatsReporter;