"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MediaTrackStats = void 0;
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
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

class MediaTrackStats {
  constructor(trackId, type, kind) {
    this.trackId = trackId;
    this.type = type;
    this.kind = kind;
    _defineProperty(this, "loss", {
      packetsTotal: 0,
      packetsLost: 0,
      isDownloadStream: false
    });
    _defineProperty(this, "bitrate", {
      download: 0,
      upload: 0
    });
    _defineProperty(this, "resolution", {
      width: -1,
      height: -1
    });
    _defineProperty(this, "audioConcealment", {
      concealedAudio: 0,
      totalAudioDuration: 0
    });
    _defineProperty(this, "framerate", 0);
    _defineProperty(this, "jitter", 0);
    _defineProperty(this, "codec", "");
    _defineProperty(this, "isAlive", true);
    _defineProperty(this, "isMuted", false);
    _defineProperty(this, "isEnabled", true);
  }
  getType() {
    return this.type;
  }
  setLoss(loss) {
    this.loss = loss;
  }
  getLoss() {
    return this.loss;
  }
  setResolution(resolution) {
    this.resolution = resolution;
  }
  getResolution() {
    return this.resolution;
  }
  setFramerate(framerate) {
    this.framerate = framerate;
  }
  getFramerate() {
    return this.framerate;
  }
  setBitrate(bitrate) {
    this.bitrate = bitrate;
  }
  getBitrate() {
    return this.bitrate;
  }
  setCodec(codecShortType) {
    this.codec = codecShortType;
    return true;
  }
  getCodec() {
    return this.codec;
  }
  resetBitrate() {
    this.bitrate = {
      download: 0,
      upload: 0
    };
  }
  set alive(isAlive) {
    this.isAlive = isAlive;
  }

  /**
   * A MediaTrackState is alive if the corresponding MediaStreamTrack track bound to a transceiver and the
   * MediaStreamTrack is in state MediaStreamTrack.readyState === live
   */
  get alive() {
    return this.isAlive;
  }
  set muted(isMuted) {
    this.isMuted = isMuted;
  }

  /**
   * A MediaTrackState.isMuted corresponding to MediaStreamTrack.muted.
   * But these values only match if MediaTrackState.isAlive.
   */
  get muted() {
    return this.isMuted;
  }
  set enabled(isEnabled) {
    this.isEnabled = isEnabled;
  }

  /**
   * A MediaTrackState.isEnabled corresponding to MediaStreamTrack.enabled.
   * But these values only match if MediaTrackState.isAlive.
   */
  get enabled() {
    return this.isEnabled;
  }
  setJitter(jitter) {
    this.jitter = jitter;
  }

  /**
   * Jitter in milliseconds
   */
  getJitter() {
    return this.jitter;
  }

  /**
   * Audio concealment ration (conceled duration / total duration)
   */
  setAudioConcealment(concealedAudioDuration, totalAudioDuration) {
    this.audioConcealment.concealedAudio = concealedAudioDuration;
    this.audioConcealment.totalAudioDuration = totalAudioDuration;
  }
  getAudioConcealment() {
    return this.audioConcealment;
  }
}
exports.MediaTrackStats = MediaTrackStats;