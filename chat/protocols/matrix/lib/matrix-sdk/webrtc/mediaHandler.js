"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MediaHandlerEvent = exports.MediaHandler = void 0;
var _typedEventEmitter = require("../models/typed-event-emitter");
var _groupCall = require("../webrtc/groupCall");
var _logger = require("../logger");
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2017 New Vector Ltd
Copyright 2019, 2020 The Matrix.org Foundation C.I.C.
Copyright 2021 - 2022 Šimon Brandner <simon.bra.ag@gmail.com>

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
let MediaHandlerEvent = exports.MediaHandlerEvent = /*#__PURE__*/function (MediaHandlerEvent) {
  MediaHandlerEvent["LocalStreamsChanged"] = "local_streams_changed";
  return MediaHandlerEvent;
}({});
class MediaHandler extends _typedEventEmitter.TypedEventEmitter {
  constructor(client) {
    super();
    this.client = client;
    _defineProperty(this, "audioInput", void 0);
    _defineProperty(this, "audioSettings", void 0);
    _defineProperty(this, "videoInput", void 0);
    _defineProperty(this, "localUserMediaStream", void 0);
    _defineProperty(this, "userMediaStreams", []);
    _defineProperty(this, "screensharingStreams", []);
    // Promise chain to serialise calls to getMediaStream
    _defineProperty(this, "getMediaStreamPromise", void 0);
  }
  restoreMediaSettings(audioInput, videoInput) {
    this.audioInput = audioInput;
    this.videoInput = videoInput;
  }

  /**
   * Set an audio input device to use for MatrixCalls
   * @param deviceId - the identifier for the device
   * undefined treated as unset
   */
  async setAudioInput(deviceId) {
    _logger.logger.info(`MediaHandler setAudioInput() running (deviceId=${deviceId})`);
    if (this.audioInput === deviceId) return;
    this.audioInput = deviceId;
    await this.updateLocalUsermediaStreams();
  }

  /**
   * Set audio settings for MatrixCalls
   * @param opts - audio options to set
   */
  async setAudioSettings(opts) {
    _logger.logger.info(`MediaHandler setAudioSettings() running (opts=${JSON.stringify(opts)})`);
    this.audioSettings = Object.assign({}, opts);
    await this.updateLocalUsermediaStreams();
  }

  /**
   * Set a video input device to use for MatrixCalls
   * @param deviceId - the identifier for the device
   * undefined treated as unset
   */
  async setVideoInput(deviceId) {
    _logger.logger.info(`MediaHandler setVideoInput() running (deviceId=${deviceId})`);
    if (this.videoInput === deviceId) return;
    this.videoInput = deviceId;
    await this.updateLocalUsermediaStreams();
  }

  /**
   * Set media input devices to use for MatrixCalls
   * @param audioInput - the identifier for the audio device
   * @param videoInput - the identifier for the video device
   * undefined treated as unset
   */
  async setMediaInputs(audioInput, videoInput) {
    _logger.logger.log(`MediaHandler setMediaInputs() running (audioInput: ${audioInput} videoInput: ${videoInput})`);
    this.audioInput = audioInput;
    this.videoInput = videoInput;
    await this.updateLocalUsermediaStreams();
  }

  /*
   * Requests new usermedia streams and replace the old ones
   */
  async updateLocalUsermediaStreams() {
    if (this.userMediaStreams.length === 0) return;
    const callMediaStreamParams = new Map();
    for (const call of this.client.callEventHandler.calls.values()) {
      callMediaStreamParams.set(call.callId, {
        audio: call.hasLocalUserMediaAudioTrack,
        video: call.hasLocalUserMediaVideoTrack
      });
    }
    for (const stream of this.userMediaStreams) {
      _logger.logger.log(`MediaHandler updateLocalUsermediaStreams() stopping all tracks (streamId=${stream.id})`);
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    this.userMediaStreams = [];
    this.localUserMediaStream = undefined;
    for (const call of this.client.callEventHandler.calls.values()) {
      if (call.callHasEnded() || !callMediaStreamParams.has(call.callId)) {
        continue;
      }
      const {
        audio,
        video
      } = callMediaStreamParams.get(call.callId);
      _logger.logger.log(`MediaHandler updateLocalUsermediaStreams() calling getUserMediaStream() (callId=${call.callId})`);
      const stream = await this.getUserMediaStream(audio, video);
      if (call.callHasEnded()) {
        continue;
      }
      await call.updateLocalUsermediaStream(stream);
    }
    for (const groupCall of this.client.groupCallEventHandler.groupCalls.values()) {
      if (!groupCall.localCallFeed) {
        continue;
      }
      _logger.logger.log(`MediaHandler updateLocalUsermediaStreams() calling getUserMediaStream() (groupCallId=${groupCall.groupCallId})`);
      const stream = await this.getUserMediaStream(true, groupCall.type === _groupCall.GroupCallType.Video);
      if (groupCall.state === _groupCall.GroupCallState.Ended) {
        continue;
      }
      await groupCall.updateLocalUsermediaStream(stream);
    }
    this.emit(MediaHandlerEvent.LocalStreamsChanged);
  }
  async hasAudioDevice() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === "audioinput").length > 0;
    } catch (err) {
      _logger.logger.log(`MediaHandler hasAudioDevice() calling navigator.mediaDevices.enumerateDevices with error`, err);
      return false;
    }
  }
  async hasVideoDevice() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === "videoinput").length > 0;
    } catch (err) {
      _logger.logger.log(`MediaHandler hasVideoDevice() calling navigator.mediaDevices.enumerateDevices with error`, err);
      return false;
    }
  }

  /**
   * @param audio - should have an audio track
   * @param video - should have a video track
   * @param reusable - is allowed to be reused by the MediaHandler
   * @returns based on passed parameters
   */
  async getUserMediaStream(audio, video, reusable = true) {
    // Serialise calls, othertwise we can't sensibly re-use the stream
    if (this.getMediaStreamPromise) {
      this.getMediaStreamPromise = this.getMediaStreamPromise.then(() => {
        return this.getUserMediaStreamInternal(audio, video, reusable);
      });
    } else {
      this.getMediaStreamPromise = this.getUserMediaStreamInternal(audio, video, reusable);
    }
    return this.getMediaStreamPromise;
  }
  async getUserMediaStreamInternal(audio, video, reusable) {
    const shouldRequestAudio = audio && (await this.hasAudioDevice());
    const shouldRequestVideo = video && (await this.hasVideoDevice());
    let stream;
    let canReuseStream = true;
    if (this.localUserMediaStream) {
      // This figures out if we can reuse the current localUsermediaStream
      // based on whether or not the "mute state" (presence of tracks of a
      // given kind) matches what is being requested
      if (shouldRequestAudio !== this.localUserMediaStream.getAudioTracks().length > 0) {
        canReuseStream = false;
      }
      if (shouldRequestVideo !== this.localUserMediaStream.getVideoTracks().length > 0) {
        canReuseStream = false;
      }

      // This code checks that the device ID is the same as the localUserMediaStream stream, but we update
      // the localUserMediaStream whenever the device ID changes (apart from when restoring) so it's not
      // clear why this would ever be different, unless there's a race.
      if (shouldRequestAudio && this.localUserMediaStream.getAudioTracks()[0]?.getSettings()?.deviceId !== this.audioInput) {
        canReuseStream = false;
      }
      if (shouldRequestVideo && this.localUserMediaStream.getVideoTracks()[0]?.getSettings()?.deviceId !== this.videoInput) {
        canReuseStream = false;
      }
    } else {
      canReuseStream = false;
    }
    if (!canReuseStream) {
      const constraints = this.getUserMediaContraints(shouldRequestAudio, shouldRequestVideo);
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      _logger.logger.log(`MediaHandler getUserMediaStreamInternal() calling getUserMediaStream (streamId=${stream.id}, shouldRequestAudio=${shouldRequestAudio}, shouldRequestVideo=${shouldRequestVideo}, constraints=${JSON.stringify(constraints)})`);
      for (const track of stream.getTracks()) {
        const settings = track.getSettings();
        if (track.kind === "audio") {
          this.audioInput = settings.deviceId;
        } else if (track.kind === "video") {
          this.videoInput = settings.deviceId;
        }
      }
      if (reusable) {
        this.localUserMediaStream = stream;
      }
    } else {
      stream = this.localUserMediaStream.clone();
      _logger.logger.log(`MediaHandler getUserMediaStreamInternal() cloning (oldStreamId=${this.localUserMediaStream?.id} newStreamId=${stream.id} shouldRequestAudio=${shouldRequestAudio} shouldRequestVideo=${shouldRequestVideo})`);
      if (!shouldRequestAudio) {
        for (const track of stream.getAudioTracks()) {
          stream.removeTrack(track);
        }
      }
      if (!shouldRequestVideo) {
        for (const track of stream.getVideoTracks()) {
          stream.removeTrack(track);
        }
      }
    }
    if (reusable) {
      this.userMediaStreams.push(stream);
    }
    this.emit(MediaHandlerEvent.LocalStreamsChanged);
    return stream;
  }

  /**
   * Stops all tracks on the provided usermedia stream
   */
  stopUserMediaStream(mediaStream) {
    _logger.logger.log(`MediaHandler stopUserMediaStream() stopping (streamId=${mediaStream.id})`);
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    const index = this.userMediaStreams.indexOf(mediaStream);
    if (index !== -1) {
      _logger.logger.debug(`MediaHandler stopUserMediaStream() splicing usermedia stream out stream array (streamId=${mediaStream.id})`, mediaStream.id);
      this.userMediaStreams.splice(index, 1);
    }
    this.emit(MediaHandlerEvent.LocalStreamsChanged);
    if (this.localUserMediaStream === mediaStream) {
      // if we have this stream cahced, remove it, because we've stopped it
      this.localUserMediaStream = undefined;
    } else {
      // If it's not the same stream. remove any tracks from the cached stream that
      // we have just stopped, and if we do stop any, call the same method on the
      // cached stream too in order to stop all its tracks (in case they are different)
      // and un-cache it.
      for (const track of mediaStream.getTracks()) {
        if (this.localUserMediaStream?.getTrackById(track.id)) {
          this.stopUserMediaStream(this.localUserMediaStream);
          break;
        }
      }
    }
  }

  /**
   * @param opts - screensharing stream options
   * @param reusable - is allowed to be reused by the MediaHandler
   * @returns based on passed parameters
   */
  async getScreensharingStream(opts = {}, reusable = true) {
    let stream;
    if (this.screensharingStreams.length === 0) {
      const screenshareConstraints = this.getScreenshareContraints(opts);
      if (opts.desktopCapturerSourceId) {
        // We are using Electron
        _logger.logger.debug(`MediaHandler getScreensharingStream() calling getUserMedia() (opts=${JSON.stringify(opts)})`);
        stream = await navigator.mediaDevices.getUserMedia(screenshareConstraints);
      } else {
        // We are not using Electron
        _logger.logger.debug(`MediaHandler getScreensharingStream() calling getDisplayMedia() (opts=${JSON.stringify(opts)})`);
        stream = await navigator.mediaDevices.getDisplayMedia(screenshareConstraints);
      }
    } else {
      const matchingStream = this.screensharingStreams[this.screensharingStreams.length - 1];
      _logger.logger.log(`MediaHandler getScreensharingStream() cloning (streamId=${matchingStream.id})`);
      stream = matchingStream.clone();
    }
    if (reusable) {
      this.screensharingStreams.push(stream);
    }
    this.emit(MediaHandlerEvent.LocalStreamsChanged);
    return stream;
  }

  /**
   * Stops all tracks on the provided screensharing stream
   */
  stopScreensharingStream(mediaStream) {
    _logger.logger.debug(`MediaHandler stopScreensharingStream() stopping stream (streamId=${mediaStream.id})`);
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    const index = this.screensharingStreams.indexOf(mediaStream);
    if (index !== -1) {
      _logger.logger.debug(`MediaHandler stopScreensharingStream() splicing stream out (streamId=${mediaStream.id})`);
      this.screensharingStreams.splice(index, 1);
    }
    this.emit(MediaHandlerEvent.LocalStreamsChanged);
  }

  /**
   * Stops all local media tracks
   */
  stopAllStreams() {
    for (const stream of this.userMediaStreams) {
      _logger.logger.log(`MediaHandler stopAllStreams() stopping (streamId=${stream.id})`);
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    for (const stream of this.screensharingStreams) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    this.userMediaStreams = [];
    this.screensharingStreams = [];
    this.localUserMediaStream = undefined;
    this.emit(MediaHandlerEvent.LocalStreamsChanged);
  }
  getUserMediaContraints(audio, video) {
    const isWebkit = !!navigator.webkitGetUserMedia;
    return {
      audio: audio ? {
        deviceId: this.audioInput ? {
          ideal: this.audioInput
        } : undefined,
        autoGainControl: this.audioSettings ? {
          ideal: this.audioSettings.autoGainControl
        } : undefined,
        echoCancellation: this.audioSettings ? {
          ideal: this.audioSettings.echoCancellation
        } : undefined,
        noiseSuppression: this.audioSettings ? {
          ideal: this.audioSettings.noiseSuppression
        } : undefined
      } : false,
      video: video ? {
        deviceId: this.videoInput ? {
          ideal: this.videoInput
        } : undefined,
        /* We want 640x360.  Chrome will give it only if we ask exactly,
        FF refuses entirely if we ask exactly, so have to ask for ideal
        instead
        XXX: Is this still true?
        */
        width: isWebkit ? {
          exact: 640
        } : {
          ideal: 640
        },
        height: isWebkit ? {
          exact: 360
        } : {
          ideal: 360
        }
      } : false
    };
  }
  getScreenshareContraints(opts) {
    const {
      desktopCapturerSourceId,
      audio
    } = opts;
    if (desktopCapturerSourceId) {
      return {
        audio: audio ?? false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: desktopCapturerSourceId
          }
        }
      };
    } else {
      return {
        audio: audio ?? false,
        video: true
      };
    }
  }
}
exports.MediaHandler = MediaHandler;