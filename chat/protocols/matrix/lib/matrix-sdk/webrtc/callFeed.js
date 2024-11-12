"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SPEAKING_THRESHOLD = exports.CallFeedEvent = exports.CallFeed = void 0;
var _callEventTypes = require("./callEventTypes.js");
var _audioContext = require("./audioContext.js");
var _logger = require("../logger.js");
var _typedEventEmitter = require("../models/typed-event-emitter.js");
var _call = require("./call.js");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2021 Šimon Brandner <simon.bra.ag@gmail.com>

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
const POLLING_INTERVAL = 200; // ms
const SPEAKING_THRESHOLD = exports.SPEAKING_THRESHOLD = -60; // dB
const SPEAKING_SAMPLE_COUNT = 8; // samples
let CallFeedEvent = exports.CallFeedEvent = /*#__PURE__*/function (CallFeedEvent) {
  CallFeedEvent["NewStream"] = "new_stream";
  CallFeedEvent["MuteStateChanged"] = "mute_state_changed";
  CallFeedEvent["LocalVolumeChanged"] = "local_volume_changed";
  CallFeedEvent["VolumeChanged"] = "volume_changed";
  CallFeedEvent["ConnectedChanged"] = "connected_changed";
  CallFeedEvent["Speaking"] = "speaking";
  CallFeedEvent["Disposed"] = "disposed";
  return CallFeedEvent;
}({});
class CallFeed extends _typedEventEmitter.TypedEventEmitter {
  constructor(opts) {
    super();
    _defineProperty(this, "stream", void 0);
    _defineProperty(this, "sdpMetadataStreamId", void 0);
    _defineProperty(this, "userId", void 0);
    _defineProperty(this, "deviceId", void 0);
    _defineProperty(this, "purpose", void 0);
    _defineProperty(this, "speakingVolumeSamples", void 0);
    _defineProperty(this, "client", void 0);
    _defineProperty(this, "call", void 0);
    _defineProperty(this, "roomId", void 0);
    _defineProperty(this, "audioMuted", void 0);
    _defineProperty(this, "videoMuted", void 0);
    _defineProperty(this, "localVolume", 1);
    _defineProperty(this, "measuringVolumeActivity", false);
    _defineProperty(this, "audioContext", void 0);
    _defineProperty(this, "analyser", void 0);
    _defineProperty(this, "frequencyBinCount", void 0);
    _defineProperty(this, "speakingThreshold", SPEAKING_THRESHOLD);
    _defineProperty(this, "speaking", false);
    _defineProperty(this, "volumeLooperTimeout", void 0);
    _defineProperty(this, "_disposed", false);
    _defineProperty(this, "_connected", false);
    _defineProperty(this, "onAddTrack", () => {
      this.emit(CallFeedEvent.NewStream, this.stream);
    });
    _defineProperty(this, "onCallState", state => {
      if (state === _call.CallState.Connected) {
        this.connected = true;
      } else if (state === _call.CallState.Connecting) {
        this.connected = false;
      }
    });
    _defineProperty(this, "volumeLooper", () => {
      if (!this.analyser) return;
      if (!this.measuringVolumeActivity) return;
      this.analyser.getFloatFrequencyData(this.frequencyBinCount);
      let maxVolume = -Infinity;
      for (const volume of this.frequencyBinCount) {
        if (volume > maxVolume) {
          maxVolume = volume;
        }
      }
      this.speakingVolumeSamples.shift();
      this.speakingVolumeSamples.push(maxVolume);
      this.emit(CallFeedEvent.VolumeChanged, maxVolume);
      let newSpeaking = false;
      for (const volume of this.speakingVolumeSamples) {
        if (volume > this.speakingThreshold) {
          newSpeaking = true;
          break;
        }
      }
      if (this.speaking !== newSpeaking) {
        this.speaking = newSpeaking;
        this.emit(CallFeedEvent.Speaking, this.speaking);
      }
      this.volumeLooperTimeout = setTimeout(this.volumeLooper, POLLING_INTERVAL);
    });
    this.client = opts.client;
    this.call = opts.call;
    this.roomId = opts.roomId;
    this.userId = opts.userId;
    this.deviceId = opts.deviceId;
    this.purpose = opts.purpose;
    this.audioMuted = opts.audioMuted;
    this.videoMuted = opts.videoMuted;
    this.speakingVolumeSamples = new Array(SPEAKING_SAMPLE_COUNT).fill(-Infinity);
    this.sdpMetadataStreamId = opts.stream.id;
    this.updateStream(null, opts.stream);
    this.stream = opts.stream; // updateStream does this, but this makes TS happier

    if (this.hasAudioTrack) {
      this.initVolumeMeasuring();
    }
    if (opts.call) {
      opts.call.addListener(_call.CallEvent.State, this.onCallState);
      this.onCallState(opts.call.state);
    }
  }
  get connected() {
    // Local feeds are always considered connected
    return this.isLocal() || this._connected;
  }
  set connected(connected) {
    this._connected = connected;
    this.emit(CallFeedEvent.ConnectedChanged, this.connected);
  }
  get hasAudioTrack() {
    return this.stream.getAudioTracks().length > 0;
  }
  updateStream(oldStream, newStream) {
    if (newStream === oldStream) return;
    const wasMeasuringVolumeActivity = this.measuringVolumeActivity;
    if (oldStream) {
      oldStream.removeEventListener("addtrack", this.onAddTrack);
      this.measureVolumeActivity(false);
    }
    this.stream = newStream;
    newStream.addEventListener("addtrack", this.onAddTrack);
    if (this.hasAudioTrack) {
      this.initVolumeMeasuring();
      if (wasMeasuringVolumeActivity) this.measureVolumeActivity(true);
    } else {
      this.measureVolumeActivity(false);
    }
    this.emit(CallFeedEvent.NewStream, this.stream);
  }
  initVolumeMeasuring() {
    if (!this.hasAudioTrack) return;
    if (!this.audioContext) this.audioContext = (0, _audioContext.acquireContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.1;
    const mediaStreamAudioSourceNode = this.audioContext.createMediaStreamSource(this.stream);
    mediaStreamAudioSourceNode.connect(this.analyser);
    this.frequencyBinCount = new Float32Array(this.analyser.frequencyBinCount);
  }
  /**
   * Returns callRoom member
   * @returns member of the callRoom
   */
  getMember() {
    const callRoom = this.client.getRoom(this.roomId);
    return callRoom?.getMember(this.userId) ?? null;
  }

  /**
   * Returns true if CallFeed is local, otherwise returns false
   * @returns is local?
   */
  isLocal() {
    return this.userId === this.client.getUserId() && (this.deviceId === undefined || this.deviceId === this.client.getDeviceId());
  }

  /**
   * Returns true if audio is muted or if there are no audio
   * tracks, otherwise returns false
   * @returns is audio muted?
   */
  isAudioMuted() {
    return this.stream.getAudioTracks().length === 0 || this.audioMuted;
  }

  /**
   * Returns true video is muted or if there are no video
   * tracks, otherwise returns false
   * @returns is video muted?
   */
  isVideoMuted() {
    // We assume only one video track
    return this.stream.getVideoTracks().length === 0 || this.videoMuted;
  }
  isSpeaking() {
    return this.speaking;
  }

  /**
   * Replaces the current MediaStream with a new one.
   * The stream will be different and new stream as remote parties are
   * concerned, but this can be used for convenience locally to set up
   * volume listeners automatically on the new stream etc.
   * @param newStream - new stream with which to replace the current one
   */
  setNewStream(newStream) {
    this.updateStream(this.stream, newStream);
  }

  /**
   * Set one or both of feed's internal audio and video video mute state
   * Either value may be null to leave it as-is
   * @param audioMuted - is the feed's audio muted?
   * @param videoMuted - is the feed's video muted?
   */
  setAudioVideoMuted(audioMuted, videoMuted) {
    if (audioMuted !== null) {
      if (this.audioMuted !== audioMuted) {
        this.speakingVolumeSamples.fill(-Infinity);
      }
      this.audioMuted = audioMuted;
    }
    if (videoMuted !== null) this.videoMuted = videoMuted;
    this.emit(CallFeedEvent.MuteStateChanged, this.audioMuted, this.videoMuted);
  }

  /**
   * Starts emitting volume_changed events where the emitter value is in decibels
   * @param enabled - emit volume changes
   */
  measureVolumeActivity(enabled) {
    if (enabled) {
      if (!this.analyser || !this.frequencyBinCount || !this.hasAudioTrack) return;
      this.measuringVolumeActivity = true;
      this.volumeLooper();
    } else {
      this.measuringVolumeActivity = false;
      this.speakingVolumeSamples.fill(-Infinity);
      this.emit(CallFeedEvent.VolumeChanged, -Infinity);
    }
  }
  setSpeakingThreshold(threshold) {
    this.speakingThreshold = threshold;
  }
  clone() {
    const mediaHandler = this.client.getMediaHandler();
    const stream = this.stream.clone();
    _logger.logger.log(`CallFeed clone() cloning stream (originalStreamId=${this.stream.id}, newStreamId${stream.id})`);
    if (this.purpose === _callEventTypes.SDPStreamMetadataPurpose.Usermedia) {
      mediaHandler.userMediaStreams.push(stream);
    } else {
      mediaHandler.screensharingStreams.push(stream);
    }
    return new CallFeed({
      client: this.client,
      roomId: this.roomId,
      userId: this.userId,
      deviceId: this.deviceId,
      stream,
      purpose: this.purpose,
      audioMuted: this.audioMuted,
      videoMuted: this.videoMuted
    });
  }
  dispose() {
    clearTimeout(this.volumeLooperTimeout);
    this.stream?.removeEventListener("addtrack", this.onAddTrack);
    this.call?.removeListener(_call.CallEvent.State, this.onCallState);
    if (this.audioContext) {
      this.audioContext = undefined;
      this.analyser = undefined;
      (0, _audioContext.releaseContext)();
    }
    this._disposed = true;
    this.emit(CallFeedEvent.Disposed);
  }
  get disposed() {
    return this._disposed;
  }
  set disposed(value) {
    this._disposed = value;
  }
  getLocalVolume() {
    return this.localVolume;
  }
  setLocalVolume(localVolume) {
    this.localVolume = localVolume;
    this.emit(CallFeedEvent.LocalVolumeChanged, localVolume);
  }
}
exports.CallFeed = CallFeed;