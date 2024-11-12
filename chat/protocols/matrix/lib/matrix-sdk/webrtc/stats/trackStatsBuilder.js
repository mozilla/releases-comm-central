"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TrackStatsBuilder = void 0;
var _valueFormatter = require("./valueFormatter.js");
class TrackStatsBuilder {
  static buildFramerateResolution(trackStats, now) {
    const resolution = {
      height: now.frameHeight,
      width: now.frameWidth
    };
    const frameRate = now.framesPerSecond;
    if (resolution.height && resolution.width) {
      trackStats.setResolution(resolution);
    }
    trackStats.setFramerate(Math.round(frameRate || 0));
  }
  static calculateSimulcastFramerate(trackStats, now, before, layer) {
    let frameRate = trackStats.getFramerate();
    if (!frameRate) {
      if (before) {
        const timeMs = now.timestamp - before.timestamp;
        if (timeMs > 0 && now.framesSent) {
          const numberOfFramesSinceBefore = now.framesSent - before.framesSent;
          frameRate = numberOfFramesSinceBefore / timeMs * 1000;
        }
      }
      if (!frameRate) {
        return;
      }
    }

    // Reset frame rate to 0 when video is suspended as a result of endpoint falling out of last-n.
    frameRate = layer ? Math.round(frameRate / layer) : 0;
    trackStats.setFramerate(frameRate);
  }
  static buildCodec(report, trackStats, now) {
    const codec = report?.get(now.codecId);
    if (codec) {
      /**
       * The mime type has the following form: video/VP8 or audio/ISAC,
       * so we what to keep just the type after the '/', audio and video
       * keys will be added on the processing side.
       */
      const codecShortType = codec.mimeType.split("/")[1];
      if (codecShortType) trackStats.setCodec(codecShortType);
    }
  }
  static buildBitrateReceived(trackStats, now, before) {
    trackStats.setBitrate({
      download: TrackStatsBuilder.calculateBitrate(now.bytesReceived, before.bytesReceived, now.timestamp, before.timestamp),
      upload: 0
    });
  }
  static buildBitrateSend(trackStats, now, before) {
    trackStats.setBitrate({
      download: 0,
      upload: this.calculateBitrate(now.bytesSent, before.bytesSent, now.timestamp, before.timestamp)
    });
  }
  static buildPacketsLost(trackStats, now, before) {
    const key = now.type === "outbound-rtp" ? "packetsSent" : "packetsReceived";
    let packetsNow = now[key];
    if (!packetsNow || packetsNow < 0) {
      packetsNow = 0;
    }
    const packetsBefore = _valueFormatter.ValueFormatter.getNonNegativeValue(before[key]);
    const packetsDiff = Math.max(0, packetsNow - packetsBefore);
    const packetsLostNow = _valueFormatter.ValueFormatter.getNonNegativeValue(now.packetsLost);
    const packetsLostBefore = _valueFormatter.ValueFormatter.getNonNegativeValue(before.packetsLost);
    const packetsLostDiff = Math.max(0, packetsLostNow - packetsLostBefore);
    trackStats.setLoss({
      packetsTotal: packetsDiff + packetsLostDiff,
      packetsLost: packetsLostDiff,
      isDownloadStream: now.type !== "outbound-rtp"
    });
  }
  static calculateBitrate(bytesNowAny, bytesBeforeAny, nowTimestamp, beforeTimestamp) {
    const bytesNow = _valueFormatter.ValueFormatter.getNonNegativeValue(bytesNowAny);
    const bytesBefore = _valueFormatter.ValueFormatter.getNonNegativeValue(bytesBeforeAny);
    const bytesProcessed = Math.max(0, bytesNow - bytesBefore);
    const timeMs = nowTimestamp - beforeTimestamp;
    let bitrateKbps = 0;
    if (timeMs > 0) {
      bitrateKbps = Math.round(bytesProcessed * 8 / timeMs);
    }
    return bitrateKbps;
  }
  static setTrackStatsState(trackStats, transceiver) {
    if (transceiver === undefined) {
      trackStats.alive = false;
      return;
    }
    const track = trackStats.getType() === "remote" ? transceiver.receiver.track : transceiver?.sender?.track;
    if (track === undefined || track === null) {
      trackStats.alive = false;
      return;
    }
    if (track.readyState === "ended") {
      trackStats.alive = false;
      return;
    }
    trackStats.muted = track.muted;
    trackStats.enabled = track.enabled;
    trackStats.alive = true;
  }
  static buildTrackSummary(trackStatsList) {
    const videoTrackSummary = {
      count: 0,
      muted: 0,
      maxJitter: 0,
      maxPacketLoss: 0,
      concealedAudio: 0,
      totalAudio: 0
    };
    const audioTrackSummary = {
      count: 0,
      muted: 0,
      maxJitter: 0,
      maxPacketLoss: 0,
      concealedAudio: 0,
      totalAudio: 0
    };
    const remoteTrackList = trackStatsList.filter(t => t.getType() === "remote");
    const audioTrackList = remoteTrackList.filter(t => t.kind === "audio");
    remoteTrackList.forEach(stats => {
      const trackSummary = stats.kind === "video" ? videoTrackSummary : audioTrackSummary;
      trackSummary.count++;
      if (stats.alive && stats.muted) {
        trackSummary.muted++;
      }
      if (trackSummary.maxJitter < stats.getJitter()) {
        trackSummary.maxJitter = stats.getJitter();
      }
      if (trackSummary.maxPacketLoss < stats.getLoss().packetsLost) {
        trackSummary.maxPacketLoss = stats.getLoss().packetsLost;
      }
      if (audioTrackList.length > 0) {
        trackSummary.concealedAudio += stats.getAudioConcealment()?.concealedAudio;
        trackSummary.totalAudio += stats.getAudioConcealment()?.totalAudioDuration;
      }
    });
    return {
      audioTrackSummary,
      videoTrackSummary
    };
  }
  static buildJitter(trackStats, statsReport) {
    if (statsReport.type !== "inbound-rtp") {
      return;
    }
    const jitterStr = statsReport?.jitter;
    if (jitterStr !== undefined) {
      const jitter = _valueFormatter.ValueFormatter.getNonNegativeValue(jitterStr);
      trackStats.setJitter(Math.round(jitter * 1000));
    } else {
      trackStats.setJitter(-1);
    }
  }
  static buildAudioConcealment(trackStats, statsReport) {
    if (statsReport.type !== "inbound-rtp") {
      return;
    }
    const msPerSample = 1000 * statsReport?.totalSamplesDuration / statsReport?.totalSamplesReceived;
    const concealedAudioDuration = msPerSample * statsReport?.concealedSamples;
    const totalAudioDuration = 1000 * statsReport?.totalSamplesDuration;
    trackStats.setAudioConcealment(concealedAudioDuration, totalAudioDuration);
  }
}
exports.TrackStatsBuilder = TrackStatsBuilder;