"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MediaTrackStatsHandler = void 0;
var _mediaTrackStats = require("./mediaTrackStats");
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
class MediaTrackStatsHandler {
  constructor(mediaSsrcHandler, mediaTrackHandler) {
    this.mediaSsrcHandler = mediaSsrcHandler;
    this.mediaTrackHandler = mediaTrackHandler;
    _defineProperty(this, "track2stats", new Map());
  }

  /**
   * Find tracks by rtc stats
   * Argument report is any because the stats api is not consistent:
   * For example `trackIdentifier`, `mid` not existing in every implementations
   * https://www.w3.org/TR/webrtc-stats/#dom-rtcinboundrtpstreamstats
   * https://developer.mozilla.org/en-US/docs/Web/API/RTCInboundRtpStreamStats
   */
  findTrack2Stats(report, type) {
    let trackID;
    if (report.trackIdentifier) {
      trackID = report.trackIdentifier;
    } else if (report.mid) {
      trackID = type === "remote" ? this.mediaTrackHandler.getRemoteTrackIdByMid(report.mid) : this.mediaTrackHandler.getLocalTrackIdByMid(report.mid);
    } else if (report.ssrc) {
      const mid = this.mediaSsrcHandler.findMidBySsrc(report.ssrc, type);
      if (!mid) {
        return undefined;
      }
      trackID = type === "remote" ? this.mediaTrackHandler.getRemoteTrackIdByMid(report.mid) : this.mediaTrackHandler.getLocalTrackIdByMid(report.mid);
    }
    if (!trackID) {
      return undefined;
    }
    let trackStats = this.track2stats.get(trackID);
    if (!trackStats) {
      const track = this.mediaTrackHandler.getTackById(trackID);
      if (track !== undefined) {
        const kind = track.kind === "audio" ? track.kind : "video";
        trackStats = new _mediaTrackStats.MediaTrackStats(trackID, type, kind);
        this.track2stats.set(trackID, trackStats);
      } else {
        return undefined;
      }
    }
    return trackStats;
  }
  findLocalVideoTrackStats(report) {
    const localVideoTracks = this.mediaTrackHandler.getLocalTracks("video");
    if (localVideoTracks.length === 0) {
      return undefined;
    }
    return this.findTrack2Stats(report, "local");
  }
  getTrack2stats() {
    return this.track2stats;
  }
  findTransceiverByTrackId(trackID) {
    return this.mediaTrackHandler.getTransceiverByTrackId(trackID);
  }
}
exports.MediaTrackStatsHandler = MediaTrackStatsHandler;