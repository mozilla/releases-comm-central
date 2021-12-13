"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MediaHandler = void 0;

var _logger = require("../logger");

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class MediaHandler {
  constructor() {
    _defineProperty(this, "audioInput", void 0);

    _defineProperty(this, "videoInput", void 0);

    _defineProperty(this, "userMediaStreams", []);

    _defineProperty(this, "screensharingStreams", []);
  }

  /**
   * Set an audio input device to use for MatrixCalls
   * @param {string} deviceId the identifier for the device
   * undefined treated as unset
   */
  setAudioInput(deviceId) {
    this.audioInput = deviceId;
  }
  /**
   * Set a video input device to use for MatrixCalls
   * @param {string} deviceId the identifier for the device
   * undefined treated as unset
   */


  setVideoInput(deviceId) {
    this.videoInput = deviceId;
  }

  async hasAudioDevice() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === "audioinput").length > 0;
  }

  async hasVideoDevice() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === "videoinput").length > 0;
  }
  /**
   * @returns {MediaStream} based on passed parameters
   */


  async getUserMediaStream(audio, video) {
    const shouldRequestAudio = audio && (await this.hasAudioDevice());
    const shouldRequestVideo = video && (await this.hasVideoDevice());
    let stream; // Find a stream with matching tracks

    const matchingStream = this.userMediaStreams.find(stream => {
      if (shouldRequestAudio !== stream.getAudioTracks().length > 0) return false;
      if (shouldRequestVideo !== stream.getVideoTracks().length > 0) return false;
      return true;
    });

    if (matchingStream) {
      _logger.logger.log("Cloning user media stream", matchingStream.id);

      stream = matchingStream.clone();
    } else {
      const constraints = this.getUserMediaContraints(shouldRequestAudio, shouldRequestVideo);

      _logger.logger.log("Getting user media with constraints", constraints);

      stream = await navigator.mediaDevices.getUserMedia(constraints);
    }

    this.userMediaStreams.push(stream);
    return stream;
  }
  /**
   * Stops all tracks on the provided usermedia stream
   */


  stopUserMediaStream(mediaStream) {
    _logger.logger.debug("Stopping usermedia stream", mediaStream.id);

    for (const track of mediaStream.getTracks()) {
      track.stop();
    }

    const index = this.userMediaStreams.indexOf(mediaStream);

    if (index !== -1) {
      _logger.logger.debug("Splicing usermedia stream out stream array", mediaStream.id);

      this.userMediaStreams.splice(index, 1);
    }
  }
  /**
   * @returns {MediaStream} based on passed parameters
   */


  async getScreensharingStream(desktopCapturerSourceId) {
    let stream;

    if (this.screensharingStreams.length === 0) {
      const screenshareConstraints = this.getScreenshareContraints(desktopCapturerSourceId);
      if (!screenshareConstraints) return null;

      if (desktopCapturerSourceId) {
        // We are using Electron
        _logger.logger.debug("Getting screensharing stream using getUserMedia()", desktopCapturerSourceId);

        stream = await navigator.mediaDevices.getUserMedia(screenshareConstraints);
      } else {
        // We are not using Electron
        _logger.logger.debug("Getting screensharing stream using getDisplayMedia()");

        stream = await navigator.mediaDevices.getDisplayMedia(screenshareConstraints);
      }
    } else {
      const matchingStream = this.screensharingStreams[this.screensharingStreams.length - 1];

      _logger.logger.log("Cloning screensharing stream", matchingStream.id);

      stream = matchingStream.clone();
    }

    this.screensharingStreams.push(stream);
    return stream;
  }
  /**
   * Stops all tracks on the provided screensharing stream
   */


  stopScreensharingStream(mediaStream) {
    _logger.logger.debug("Stopping screensharing stream", mediaStream.id);

    for (const track of mediaStream.getTracks()) {
      track.stop();
    }

    const index = this.screensharingStreams.indexOf(mediaStream);

    if (index !== -1) {
      _logger.logger.debug("Splicing screensharing stream out stream array", mediaStream.id);

      this.screensharingStreams.splice(index, 1);
    }
  }
  /**
   * Stops all local media tracks
   */


  stopAllStreams() {
    for (const stream of this.userMediaStreams) {
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
  }

  getUserMediaContraints(audio, video) {
    const isWebkit = !!navigator.webkitGetUserMedia;
    return {
      audio: audio ? {
        deviceId: this.audioInput ? {
          ideal: this.audioInput
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

  getScreenshareContraints(desktopCapturerSourceId) {
    if (desktopCapturerSourceId) {
      _logger.logger.debug("Using desktop capturer source", desktopCapturerSourceId);

      return {
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: desktopCapturerSourceId
          }
        }
      };
    } else {
      _logger.logger.debug("Not using desktop capturer source");

      return {
        audio: false,
        video: true
      };
    }
  }

}

exports.MediaHandler = MediaHandler;