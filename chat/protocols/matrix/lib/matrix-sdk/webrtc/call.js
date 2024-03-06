"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MatrixCall = exports.FALLBACK_ICE_SERVER = exports.CallType = exports.CallState = exports.CallParty = exports.CallEvent = exports.CallErrorCode = exports.CallError = exports.CallDirection = void 0;
exports.createNewMatrixCall = createNewMatrixCall;
exports.genCallID = genCallID;
exports.setTracksEnabled = setTracksEnabled;
exports.supportsMatrixCall = supportsMatrixCall;
var _uuid = require("uuid");
var _sdpTransform = require("sdp-transform");
var _logger = require("../logger");
var _utils = require("../utils");
var _event = require("../@types/event");
var _randomstring = require("../randomstring");
var _callEventTypes = require("./callEventTypes");
var _callFeed = require("./callFeed");
var _typedEventEmitter = require("../models/typed-event-emitter");
var _deviceinfo = require("../crypto/deviceinfo");
var _groupCall = require("./groupCall");
var _httpApi = require("../http-api");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
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
*/ /**
 * This is an internal module. See {@link createNewMatrixCall} for the public API.
 */
var MediaType = /*#__PURE__*/function (MediaType) {
  MediaType["AUDIO"] = "audio";
  MediaType["VIDEO"] = "video";
  return MediaType;
}(MediaType || {});
var CodecName = /*#__PURE__*/function (CodecName) {
  CodecName["OPUS"] = "opus";
  return CodecName;
}(CodecName || {}); // add more as needed
// Used internally to specify modifications to codec parameters in SDP
let CallState = exports.CallState = /*#__PURE__*/function (CallState) {
  CallState["Fledgling"] = "fledgling";
  CallState["InviteSent"] = "invite_sent";
  CallState["WaitLocalMedia"] = "wait_local_media";
  CallState["CreateOffer"] = "create_offer";
  CallState["CreateAnswer"] = "create_answer";
  CallState["Connecting"] = "connecting";
  CallState["Connected"] = "connected";
  CallState["Ringing"] = "ringing";
  CallState["Ended"] = "ended";
  return CallState;
}({});
let CallType = exports.CallType = /*#__PURE__*/function (CallType) {
  CallType["Voice"] = "voice";
  CallType["Video"] = "video";
  return CallType;
}({});
let CallDirection = exports.CallDirection = /*#__PURE__*/function (CallDirection) {
  CallDirection["Inbound"] = "inbound";
  CallDirection["Outbound"] = "outbound";
  return CallDirection;
}({});
let CallParty = exports.CallParty = /*#__PURE__*/function (CallParty) {
  CallParty["Local"] = "local";
  CallParty["Remote"] = "remote";
  return CallParty;
}({});
let CallEvent = exports.CallEvent = /*#__PURE__*/function (CallEvent) {
  CallEvent["Hangup"] = "hangup";
  CallEvent["State"] = "state";
  CallEvent["Error"] = "error";
  CallEvent["Replaced"] = "replaced";
  CallEvent["LocalHoldUnhold"] = "local_hold_unhold";
  CallEvent["RemoteHoldUnhold"] = "remote_hold_unhold";
  CallEvent["HoldUnhold"] = "hold_unhold";
  CallEvent["FeedsChanged"] = "feeds_changed";
  CallEvent["AssertedIdentityChanged"] = "asserted_identity_changed";
  CallEvent["LengthChanged"] = "length_changed";
  CallEvent["DataChannel"] = "datachannel";
  CallEvent["SendVoipEvent"] = "send_voip_event";
  CallEvent["PeerConnectionCreated"] = "peer_connection_created";
  return CallEvent;
}({});
let CallErrorCode = exports.CallErrorCode = /*#__PURE__*/function (CallErrorCode) {
  CallErrorCode["UserHangup"] = "user_hangup";
  CallErrorCode["LocalOfferFailed"] = "local_offer_failed";
  CallErrorCode["NoUserMedia"] = "no_user_media";
  CallErrorCode["UnknownDevices"] = "unknown_devices";
  CallErrorCode["SendInvite"] = "send_invite";
  CallErrorCode["CreateAnswer"] = "create_answer";
  CallErrorCode["CreateOffer"] = "create_offer";
  CallErrorCode["SendAnswer"] = "send_answer";
  CallErrorCode["SetRemoteDescription"] = "set_remote_description";
  CallErrorCode["SetLocalDescription"] = "set_local_description";
  CallErrorCode["AnsweredElsewhere"] = "answered_elsewhere";
  CallErrorCode["IceFailed"] = "ice_failed";
  CallErrorCode["InviteTimeout"] = "invite_timeout";
  CallErrorCode["Replaced"] = "replaced";
  CallErrorCode["SignallingFailed"] = "signalling_timeout";
  CallErrorCode["UserBusy"] = "user_busy";
  CallErrorCode["Transferred"] = "transferred";
  CallErrorCode["NewSession"] = "new_session";
  return CallErrorCode;
}({});
/**
 * The version field that we set in m.call.* events
 */
const VOIP_PROTO_VERSION = "1";

/** The fallback ICE server to use for STUN or TURN protocols. */
const FALLBACK_ICE_SERVER = exports.FALLBACK_ICE_SERVER = "stun:turn.matrix.org";

/** The length of time a call can be ringing for. */
const CALL_TIMEOUT_MS = 60 * 1000; // ms
/** The time after which we increment callLength */
const CALL_LENGTH_INTERVAL = 1000; // ms
/** The time after which we end the call, if ICE got disconnected */
const ICE_DISCONNECTED_TIMEOUT = 30 * 1000; // ms
/** The time after which we try a ICE restart, if ICE got disconnected */
const ICE_RECONNECTING_TIMEOUT = 2 * 1000; // ms
class CallError extends Error {
  constructor(code, msg, err) {
    // Still don't think there's any way to have proper nested errors
    super(msg + ": " + err);
    _defineProperty(this, "code", void 0);
    this.code = code;
  }
}
exports.CallError = CallError;
function genCallID() {
  return Date.now().toString() + (0, _randomstring.randomString)(16);
}
function getCodecParamMods(isPtt) {
  const mods = [{
    mediaType: "audio",
    codec: "opus",
    enableDtx: true,
    maxAverageBitrate: isPtt ? 12000 : undefined
  }];
  return mods;
}

/**
 * These now all have the call object as an argument. Why? Well, to know which call a given event is
 * about you have three options:
 *  1. Use a closure as the callback that remembers what call it's listening to. This can be
 *     a pain because you need to pass the listener function again when you remove the listener,
 *     which might be somewhere else.
 *  2. Use not-very-well-known fact that EventEmitter sets 'this' to the emitter object in the
 *     callback. This doesn't really play well with modern Typescript and eslint and doesn't work
 *     with our pattern of re-emitting events.
 *  3. Pass the object in question as an argument to the callback.
 *
 * Now that we have group calls which have to deal with multiple call objects, this will
 * become more important, and I think methods 1 and 2 are just going to cause issues.
 */

// The key of the transceiver map (purpose + media type, separated by ':')

// generates keys for the map of transceivers
// kind is unfortunately a string rather than MediaType as this is the type of
// track.kind
function getTransceiverKey(purpose, kind) {
  return purpose + ":" + kind;
}
class MatrixCall extends _typedEventEmitter.TypedEventEmitter {
  /**
   * Construct a new Matrix Call.
   * @param opts - Config options.
   */
  constructor(opts) {
    super();
    _defineProperty(this, "roomId", void 0);
    _defineProperty(this, "callId", void 0);
    _defineProperty(this, "invitee", void 0);
    _defineProperty(this, "hangupParty", void 0);
    _defineProperty(this, "hangupReason", void 0);
    _defineProperty(this, "direction", void 0);
    _defineProperty(this, "ourPartyId", void 0);
    _defineProperty(this, "peerConn", void 0);
    _defineProperty(this, "toDeviceSeq", 0);
    // whether this call should have push-to-talk semantics
    // This should be set by the consumer on incoming & outgoing calls.
    _defineProperty(this, "isPtt", false);
    _defineProperty(this, "_state", CallState.Fledgling);
    _defineProperty(this, "client", void 0);
    _defineProperty(this, "forceTURN", void 0);
    _defineProperty(this, "turnServers", void 0);
    // A queue for candidates waiting to go out.
    // We try to amalgamate candidates into a single candidate message where
    // possible
    _defineProperty(this, "candidateSendQueue", []);
    _defineProperty(this, "candidateSendTries", 0);
    _defineProperty(this, "candidatesEnded", false);
    _defineProperty(this, "feeds", []);
    // our transceivers for each purpose and type of media
    _defineProperty(this, "transceivers", new Map());
    _defineProperty(this, "inviteOrAnswerSent", false);
    _defineProperty(this, "waitForLocalAVStream", false);
    _defineProperty(this, "successor", void 0);
    _defineProperty(this, "opponentMember", void 0);
    _defineProperty(this, "opponentVersion", void 0);
    // The party ID of the other side: undefined if we haven't chosen a partner
    // yet, null if we have but they didn't send a party ID.
    _defineProperty(this, "opponentPartyId", void 0);
    _defineProperty(this, "opponentCaps", void 0);
    _defineProperty(this, "iceDisconnectedTimeout", void 0);
    _defineProperty(this, "iceReconnectionTimeOut", void 0);
    _defineProperty(this, "inviteTimeout", void 0);
    _defineProperty(this, "removeTrackListeners", new Map());
    // The logic of when & if a call is on hold is nontrivial and explained in is*OnHold
    // This flag represents whether we want the other party to be on hold
    _defineProperty(this, "remoteOnHold", false);
    // the stats for the call at the point it ended. We can't get these after we
    // tear the call down, so we just grab a snapshot before we stop the call.
    // The typescript definitions have this type as 'any' :(
    _defineProperty(this, "callStatsAtEnd", void 0);
    // Perfect negotiation state: https://www.w3.org/TR/webrtc/#perfect-negotiation-example
    _defineProperty(this, "makingOffer", false);
    _defineProperty(this, "ignoreOffer", false);
    _defineProperty(this, "isSettingRemoteAnswerPending", false);
    _defineProperty(this, "responsePromiseChain", void 0);
    // If candidates arrive before we've picked an opponent (which, in particular,
    // will happen if the opponent sends candidates eagerly before the user answers
    // the call) we buffer them up here so we can then add the ones from the party we pick
    _defineProperty(this, "remoteCandidateBuffer", new Map());
    _defineProperty(this, "remoteAssertedIdentity", void 0);
    _defineProperty(this, "remoteSDPStreamMetadata", void 0);
    _defineProperty(this, "callLengthInterval", void 0);
    _defineProperty(this, "callStartTime", void 0);
    _defineProperty(this, "opponentDeviceId", void 0);
    _defineProperty(this, "opponentDeviceInfo", void 0);
    _defineProperty(this, "opponentSessionId", void 0);
    _defineProperty(this, "groupCallId", void 0);
    // Used to keep the timer for the delay before actually stopping our
    // video track after muting (see setLocalVideoMuted)
    _defineProperty(this, "stopVideoTrackTimer", void 0);
    // Used to allow connection without Video and Audio. To establish a webrtc connection without media a Data channel is
    // needed At the moment this property is true if we allow MatrixClient with isVoipWithNoMediaAllowed = true
    _defineProperty(this, "isOnlyDataChannelAllowed", void 0);
    _defineProperty(this, "stats", void 0);
    /**
     * Internal
     */
    _defineProperty(this, "gotLocalIceCandidate", event => {
      if (event.candidate) {
        if (this.candidatesEnded) {
          _logger.logger.warn(`Call ${this.callId} gotLocalIceCandidate() got candidate after candidates have ended!`);
        }
        _logger.logger.debug(`Call ${this.callId} got local ICE ${event.candidate.sdpMid} ${event.candidate.candidate}`);
        if (this.callHasEnded()) return;

        // As with the offer, note we need to make a copy of this object, not
        // pass the original: that broke in Chrome ~m43.
        if (event.candidate.candidate === "") {
          this.queueCandidate(null);
        } else {
          this.queueCandidate(event.candidate);
        }
      }
    });
    _defineProperty(this, "onIceGatheringStateChange", event => {
      _logger.logger.debug(`Call ${this.callId} onIceGatheringStateChange() ice gathering state changed to ${this.peerConn.iceGatheringState}`);
      if (this.peerConn?.iceGatheringState === "complete") {
        this.queueCandidate(null); // We should leave it to WebRTC to announce the end
        _logger.logger.debug(`Call ${this.callId} onIceGatheringStateChange() ice gathering state complete, set candidates have ended`);
      }
    });
    _defineProperty(this, "getLocalOfferFailed", err => {
      _logger.logger.error(`Call ${this.callId} getLocalOfferFailed() running`, err);
      this.emit(CallEvent.Error, new CallError(CallErrorCode.LocalOfferFailed, "Failed to get local offer!", err), this);
      this.terminate(CallParty.Local, CallErrorCode.LocalOfferFailed, false);
    });
    _defineProperty(this, "getUserMediaFailed", err => {
      if (this.successor) {
        this.successor.getUserMediaFailed(err);
        return;
      }
      _logger.logger.warn(`Call ${this.callId} getUserMediaFailed() failed to get user media - ending call`, err);
      this.emit(CallEvent.Error, new CallError(CallErrorCode.NoUserMedia, "Couldn't start capturing media! Is your microphone set up and does this app have permission?", err), this);
      this.terminate(CallParty.Local, CallErrorCode.NoUserMedia, false);
    });
    _defineProperty(this, "placeCallFailed", err => {
      if (this.successor) {
        this.successor.placeCallFailed(err);
        return;
      }
      _logger.logger.warn(`Call ${this.callId} placeCallWithCallFeeds() failed - ending call`, err);
      this.emit(CallEvent.Error, new CallError(CallErrorCode.IceFailed, "Couldn't start call! Invalid ICE server configuration.", err), this);
      this.terminate(CallParty.Local, CallErrorCode.IceFailed, false);
    });
    _defineProperty(this, "onIceConnectionStateChanged", () => {
      if (this.callHasEnded()) {
        return; // because ICE can still complete as we're ending the call
      }
      _logger.logger.debug(`Call ${this.callId} onIceConnectionStateChanged() running (state=${this.peerConn?.iceConnectionState}, conn=${this.peerConn?.connectionState})`);

      // ideally we'd consider the call to be connected when we get media but
      // chrome doesn't implement any of the 'onstarted' events yet
      if (["connected", "completed"].includes(this.peerConn?.iceConnectionState ?? "")) {
        clearTimeout(this.iceDisconnectedTimeout);
        this.iceDisconnectedTimeout = undefined;
        if (this.iceReconnectionTimeOut) {
          clearTimeout(this.iceReconnectionTimeOut);
        }
        this.state = CallState.Connected;
        if (!this.callLengthInterval && !this.callStartTime) {
          this.callStartTime = Date.now();
          this.callLengthInterval = setInterval(() => {
            this.emit(CallEvent.LengthChanged, Math.round((Date.now() - this.callStartTime) / 1000), this);
          }, CALL_LENGTH_INTERVAL);
        }
      } else if (this.peerConn?.iceConnectionState == "failed") {
        this.candidatesEnded = false;
        // Firefox for Android does not yet have support for restartIce()
        // (the types say it's always defined though, so we have to cast
        // to prevent typescript from warning).
        if (this.peerConn?.restartIce) {
          this.candidatesEnded = false;
          _logger.logger.debug(`Call ${this.callId} onIceConnectionStateChanged() ice restart (state=${this.peerConn?.iceConnectionState})`);
          this.peerConn.restartIce();
        } else {
          _logger.logger.info(`Call ${this.callId} onIceConnectionStateChanged() hanging up call (ICE failed and no ICE restart method)`);
          this.hangup(CallErrorCode.IceFailed, false);
        }
      } else if (this.peerConn?.iceConnectionState == "disconnected") {
        this.candidatesEnded = false;
        this.iceReconnectionTimeOut = setTimeout(() => {
          _logger.logger.info(`Call ${this.callId} onIceConnectionStateChanged() ICE restarting because of ICE disconnected, (state=${this.peerConn?.iceConnectionState}, conn=${this.peerConn?.connectionState})`);
          if (this.peerConn?.restartIce) {
            this.candidatesEnded = false;
            this.peerConn.restartIce();
          }
          this.iceReconnectionTimeOut = undefined;
        }, ICE_RECONNECTING_TIMEOUT);
        this.iceDisconnectedTimeout = setTimeout(() => {
          _logger.logger.info(`Call ${this.callId} onIceConnectionStateChanged() hanging up call (ICE disconnected for too long)`);
          this.hangup(CallErrorCode.IceFailed, false);
        }, ICE_DISCONNECTED_TIMEOUT);
        this.state = CallState.Connecting;
      }

      // In PTT mode, override feed status to muted when we lose connection to
      // the peer, since we don't want to block the line if they're not saying anything.
      // Experimenting in Chrome, this happens after 5 or 6 seconds, which is probably
      // fast enough.
      if (this.isPtt && ["failed", "disconnected"].includes(this.peerConn.iceConnectionState)) {
        for (const feed of this.getRemoteFeeds()) {
          feed.setAudioVideoMuted(true, true);
        }
      }
    });
    _defineProperty(this, "onSignallingStateChanged", () => {
      _logger.logger.debug(`Call ${this.callId} onSignallingStateChanged() running (state=${this.peerConn?.signalingState})`);
    });
    _defineProperty(this, "onTrack", ev => {
      if (ev.streams.length === 0) {
        _logger.logger.warn(`Call ${this.callId} onTrack() called with streamless track streamless (kind=${ev.track.kind})`);
        return;
      }
      const stream = ev.streams[0];
      this.pushRemoteFeed(stream);
      if (!this.removeTrackListeners.has(stream)) {
        const onRemoveTrack = () => {
          if (stream.getTracks().length === 0) {
            _logger.logger.info(`Call ${this.callId} onTrack() removing track (streamId=${stream.id})`);
            this.deleteFeedByStream(stream);
            stream.removeEventListener("removetrack", onRemoveTrack);
            this.removeTrackListeners.delete(stream);
          }
        };
        stream.addEventListener("removetrack", onRemoveTrack);
        this.removeTrackListeners.set(stream, onRemoveTrack);
      }
    });
    _defineProperty(this, "onDataChannel", ev => {
      this.emit(CallEvent.DataChannel, ev.channel, this);
    });
    _defineProperty(this, "onNegotiationNeeded", async () => {
      _logger.logger.info(`Call ${this.callId} onNegotiationNeeded() negotiation is needed!`);
      if (this.state !== CallState.CreateOffer && this.opponentVersion === 0) {
        _logger.logger.info(`Call ${this.callId} onNegotiationNeeded() opponent does not support renegotiation: ignoring negotiationneeded event`);
        return;
      }
      this.queueGotLocalOffer();
    });
    _defineProperty(this, "onHangupReceived", msg => {
      _logger.logger.debug(`Call ${this.callId} onHangupReceived() running`);

      // party ID must match (our chosen partner hanging up the call) or be undefined (we haven't chosen
      // a partner yet but we're treating the hangup as a reject as per VoIP v0)
      if (this.partyIdMatches(msg) || this.state === CallState.Ringing) {
        // default reason is user_hangup
        this.terminate(CallParty.Remote, msg.reason || CallErrorCode.UserHangup, true);
      } else {
        _logger.logger.info(`Call ${this.callId} onHangupReceived() ignoring message from party ID ${msg.party_id}: our partner is ${this.opponentPartyId}`);
      }
    });
    _defineProperty(this, "onRejectReceived", msg => {
      _logger.logger.debug(`Call ${this.callId} onRejectReceived() running`);

      // No need to check party_id for reject because if we'd received either
      // an answer or reject, we wouldn't be in state InviteSent

      const shouldTerminate =
      // reject events also end the call if it's ringing: it's another of
      // our devices rejecting the call.
      [CallState.InviteSent, CallState.Ringing].includes(this.state) ||
      // also if we're in the init state and it's an inbound call, since
      // this means we just haven't entered the ringing state yet
      this.state === CallState.Fledgling && this.direction === CallDirection.Inbound;
      if (shouldTerminate) {
        this.terminate(CallParty.Remote, msg.reason || CallErrorCode.UserHangup, true);
      } else {
        _logger.logger.debug(`Call ${this.callId} onRejectReceived() called in wrong state (state=${this.state})`);
      }
    });
    _defineProperty(this, "onAnsweredElsewhere", msg => {
      _logger.logger.debug(`Call ${this.callId} onAnsweredElsewhere() running`);
      this.terminate(CallParty.Remote, CallErrorCode.AnsweredElsewhere, true);
    });
    this.roomId = opts.roomId;
    this.invitee = opts.invitee;
    this.client = opts.client;
    if (!this.client.deviceId) throw new Error("Client must have a device ID to start calls");
    this.forceTURN = opts.forceTURN ?? false;
    this.ourPartyId = this.client.deviceId;
    this.opponentDeviceId = opts.opponentDeviceId;
    this.opponentSessionId = opts.opponentSessionId;
    this.groupCallId = opts.groupCallId;
    // Array of Objects with urls, username, credential keys
    this.turnServers = opts.turnServers || [];
    if (this.turnServers.length === 0 && this.client.isFallbackICEServerAllowed()) {
      this.turnServers.push({
        urls: [FALLBACK_ICE_SERVER]
      });
    }
    for (const server of this.turnServers) {
      (0, _utils.checkObjectHasKeys)(server, ["urls"]);
    }
    this.callId = genCallID();
    // If the Client provides calls without audio and video we need a datachannel for a webrtc connection
    this.isOnlyDataChannelAllowed = this.client.isVoipWithNoMediaAllowed;
  }

  /**
   * Place a voice call to this room.
   * @throws If you have not specified a listener for 'error' events.
   */
  async placeVoiceCall() {
    await this.placeCall(true, false);
  }

  /**
   * Place a video call to this room.
   * @throws If you have not specified a listener for 'error' events.
   */
  async placeVideoCall() {
    await this.placeCall(true, true);
  }

  /**
   * Create a datachannel using this call's peer connection.
   * @param label - A human readable label for this datachannel
   * @param options - An object providing configuration options for the data channel.
   */
  createDataChannel(label, options) {
    const dataChannel = this.peerConn.createDataChannel(label, options);
    this.emit(CallEvent.DataChannel, dataChannel, this);
    return dataChannel;
  }
  getOpponentMember() {
    return this.opponentMember;
  }
  getOpponentDeviceId() {
    return this.opponentDeviceId;
  }
  getOpponentSessionId() {
    return this.opponentSessionId;
  }
  opponentCanBeTransferred() {
    return Boolean(this.opponentCaps && this.opponentCaps["m.call.transferee"]);
  }
  opponentSupportsDTMF() {
    return Boolean(this.opponentCaps && this.opponentCaps["m.call.dtmf"]);
  }
  getRemoteAssertedIdentity() {
    return this.remoteAssertedIdentity;
  }
  get state() {
    return this._state;
  }
  set state(state) {
    const oldState = this._state;
    this._state = state;
    this.emit(CallEvent.State, state, oldState, this);
  }
  get type() {
    // we may want to look for a video receiver here rather than a track to match the
    // sender behaviour, although in practice they should be the same thing
    return this.hasUserMediaVideoSender || this.hasRemoteUserMediaVideoTrack ? CallType.Video : CallType.Voice;
  }
  get hasLocalUserMediaVideoTrack() {
    return !!this.localUsermediaStream?.getVideoTracks().length;
  }
  get hasRemoteUserMediaVideoTrack() {
    return this.getRemoteFeeds().some(feed => {
      return feed.purpose === _callEventTypes.SDPStreamMetadataPurpose.Usermedia && feed.stream?.getVideoTracks().length;
    });
  }
  get hasLocalUserMediaAudioTrack() {
    return !!this.localUsermediaStream?.getAudioTracks().length;
  }
  get hasRemoteUserMediaAudioTrack() {
    return this.getRemoteFeeds().some(feed => {
      return feed.purpose === _callEventTypes.SDPStreamMetadataPurpose.Usermedia && !!feed.stream?.getAudioTracks().length;
    });
  }
  get hasUserMediaAudioSender() {
    return Boolean(this.transceivers.get(getTransceiverKey(_callEventTypes.SDPStreamMetadataPurpose.Usermedia, "audio"))?.sender);
  }
  get hasUserMediaVideoSender() {
    return Boolean(this.transceivers.get(getTransceiverKey(_callEventTypes.SDPStreamMetadataPurpose.Usermedia, "video"))?.sender);
  }
  get localUsermediaFeed() {
    return this.getLocalFeeds().find(feed => feed.purpose === _callEventTypes.SDPStreamMetadataPurpose.Usermedia);
  }
  get localScreensharingFeed() {
    return this.getLocalFeeds().find(feed => feed.purpose === _callEventTypes.SDPStreamMetadataPurpose.Screenshare);
  }
  get localUsermediaStream() {
    return this.localUsermediaFeed?.stream;
  }
  get localScreensharingStream() {
    return this.localScreensharingFeed?.stream;
  }
  get remoteUsermediaFeed() {
    return this.getRemoteFeeds().find(feed => feed.purpose === _callEventTypes.SDPStreamMetadataPurpose.Usermedia);
  }
  get remoteScreensharingFeed() {
    return this.getRemoteFeeds().find(feed => feed.purpose === _callEventTypes.SDPStreamMetadataPurpose.Screenshare);
  }
  get remoteUsermediaStream() {
    return this.remoteUsermediaFeed?.stream;
  }
  get remoteScreensharingStream() {
    return this.remoteScreensharingFeed?.stream;
  }
  getFeedByStreamId(streamId) {
    return this.getFeeds().find(feed => feed.stream.id === streamId);
  }

  /**
   * Returns an array of all CallFeeds
   * @returns CallFeeds
   */
  getFeeds() {
    return this.feeds;
  }

  /**
   * Returns an array of all local CallFeeds
   * @returns local CallFeeds
   */
  getLocalFeeds() {
    return this.feeds.filter(feed => feed.isLocal());
  }

  /**
   * Returns an array of all remote CallFeeds
   * @returns remote CallFeeds
   */
  getRemoteFeeds() {
    return this.feeds.filter(feed => !feed.isLocal());
  }
  async initOpponentCrypto() {
    if (!this.opponentDeviceId) return;
    if (!this.client.getUseE2eForGroupCall()) return;
    // It's possible to want E2EE and yet not have the means to manage E2EE
    // ourselves (for example if the client is a RoomWidgetClient)
    if (!this.client.isCryptoEnabled()) {
      // All we know is the device ID
      this.opponentDeviceInfo = new _deviceinfo.DeviceInfo(this.opponentDeviceId);
      return;
    }
    // if we've got to this point, we do want to init crypto, so throw if we can't
    if (!this.client.crypto) throw new Error("Crypto is not initialised.");
    const userId = this.invitee || this.getOpponentMember()?.userId;
    if (!userId) throw new Error("Couldn't find opponent user ID to init crypto");
    const deviceInfoMap = await this.client.crypto.deviceList.downloadKeys([userId], false);
    this.opponentDeviceInfo = deviceInfoMap.get(userId)?.get(this.opponentDeviceId);
    if (this.opponentDeviceInfo === undefined) {
      throw new _groupCall.GroupCallUnknownDeviceError(userId);
    }
  }

  /**
   * Generates and returns localSDPStreamMetadata
   * @returns localSDPStreamMetadata
   */
  getLocalSDPStreamMetadata(updateStreamIds = false) {
    const metadata = {};
    for (const localFeed of this.getLocalFeeds()) {
      if (updateStreamIds) {
        localFeed.sdpMetadataStreamId = localFeed.stream.id;
      }
      metadata[localFeed.sdpMetadataStreamId] = {
        purpose: localFeed.purpose,
        audio_muted: localFeed.isAudioMuted(),
        video_muted: localFeed.isVideoMuted()
      };
    }
    return metadata;
  }

  /**
   * Returns true if there are no incoming feeds,
   * otherwise returns false
   * @returns no incoming feeds
   */
  noIncomingFeeds() {
    return !this.feeds.some(feed => !feed.isLocal());
  }
  pushRemoteFeed(stream) {
    // Fallback to old behavior if the other side doesn't support SDPStreamMetadata
    if (!this.opponentSupportsSDPStreamMetadata()) {
      this.pushRemoteFeedWithoutMetadata(stream);
      return;
    }
    const userId = this.getOpponentMember().userId;
    const purpose = this.remoteSDPStreamMetadata[stream.id].purpose;
    const audioMuted = this.remoteSDPStreamMetadata[stream.id].audio_muted;
    const videoMuted = this.remoteSDPStreamMetadata[stream.id].video_muted;
    if (!purpose) {
      _logger.logger.warn(`Call ${this.callId} pushRemoteFeed() ignoring stream because we didn't get any metadata about it (streamId=${stream.id})`);
      return;
    }
    if (this.getFeedByStreamId(stream.id)) {
      _logger.logger.warn(`Call ${this.callId} pushRemoteFeed() ignoring stream because we already have a feed for it (streamId=${stream.id})`);
      return;
    }
    this.feeds.push(new _callFeed.CallFeed({
      client: this.client,
      call: this,
      roomId: this.roomId,
      userId,
      deviceId: this.getOpponentDeviceId(),
      stream,
      purpose,
      audioMuted,
      videoMuted
    }));
    this.emit(CallEvent.FeedsChanged, this.feeds, this);
    _logger.logger.info(`Call ${this.callId} pushRemoteFeed() pushed stream (streamId=${stream.id}, active=${stream.active}, purpose=${purpose})`);
  }

  /**
   * This method is used ONLY if the other client doesn't support sending SDPStreamMetadata
   */
  pushRemoteFeedWithoutMetadata(stream) {
    const userId = this.getOpponentMember().userId;
    // We can guess the purpose here since the other client can only send one stream
    const purpose = _callEventTypes.SDPStreamMetadataPurpose.Usermedia;
    const oldRemoteStream = this.feeds.find(feed => !feed.isLocal())?.stream;

    // Note that we check by ID and always set the remote stream: Chrome appears
    // to make new stream objects when transceiver directionality is changed and the 'active'
    // status of streams change - Dave
    // If we already have a stream, check this stream has the same id
    if (oldRemoteStream && stream.id !== oldRemoteStream.id) {
      _logger.logger.warn(`Call ${this.callId} pushRemoteFeedWithoutMetadata() ignoring new stream because we already have stream (streamId=${stream.id})`);
      return;
    }
    if (this.getFeedByStreamId(stream.id)) {
      _logger.logger.warn(`Call ${this.callId} pushRemoteFeedWithoutMetadata() ignoring stream because we already have a feed for it (streamId=${stream.id})`);
      return;
    }
    this.feeds.push(new _callFeed.CallFeed({
      client: this.client,
      call: this,
      roomId: this.roomId,
      audioMuted: false,
      videoMuted: false,
      userId,
      deviceId: this.getOpponentDeviceId(),
      stream,
      purpose
    }));
    this.emit(CallEvent.FeedsChanged, this.feeds, this);
    _logger.logger.info(`Call ${this.callId} pushRemoteFeedWithoutMetadata() pushed stream (streamId=${stream.id}, active=${stream.active})`);
  }
  pushNewLocalFeed(stream, purpose, addToPeerConnection = true) {
    const userId = this.client.getUserId();

    // Tracks don't always start off enabled, eg. chrome will give a disabled
    // audio track if you ask for user media audio and already had one that
    // you'd set to disabled (presumably because it clones them internally).
    setTracksEnabled(stream.getAudioTracks(), true);
    setTracksEnabled(stream.getVideoTracks(), true);
    if (this.getFeedByStreamId(stream.id)) {
      _logger.logger.warn(`Call ${this.callId} pushNewLocalFeed() ignoring stream because we already have a feed for it (streamId=${stream.id})`);
      return;
    }
    this.pushLocalFeed(new _callFeed.CallFeed({
      client: this.client,
      roomId: this.roomId,
      audioMuted: false,
      videoMuted: false,
      userId,
      deviceId: this.getOpponentDeviceId(),
      stream,
      purpose
    }), addToPeerConnection);
  }

  /**
   * Pushes supplied feed to the call
   * @param callFeed - to push
   * @param addToPeerConnection - whether to add the tracks to the peer connection
   */
  pushLocalFeed(callFeed, addToPeerConnection = true) {
    if (this.feeds.some(feed => callFeed.stream.id === feed.stream.id)) {
      _logger.logger.info(`Call ${this.callId} pushLocalFeed() ignoring duplicate local stream (streamId=${callFeed.stream.id})`);
      return;
    }
    this.feeds.push(callFeed);
    if (addToPeerConnection) {
      for (const track of callFeed.stream.getTracks()) {
        _logger.logger.info(`Call ${this.callId} pushLocalFeed() adding track to peer connection (id=${track.id}, kind=${track.kind}, streamId=${callFeed.stream.id}, streamPurpose=${callFeed.purpose}, enabled=${track.enabled})`);
        const tKey = getTransceiverKey(callFeed.purpose, track.kind);
        if (this.transceivers.has(tKey)) {
          // we already have a sender, so we re-use it. We try to re-use transceivers as much
          // as possible because they can't be removed once added, so otherwise they just
          // accumulate which makes the SDP very large very quickly: in fact it only takes
          // about 6 video tracks to exceed the maximum size of an Olm-encrypted
          // Matrix event.
          const transceiver = this.transceivers.get(tKey);
          transceiver.sender.replaceTrack(track);
          // set the direction to indicate we're going to start sending again
          // (this will trigger the re-negotiation)
          transceiver.direction = transceiver.direction === "inactive" ? "sendonly" : "sendrecv";
        } else {
          // create a new one. We need to use addTrack rather addTransceiver for this because firefox
          // doesn't yet implement RTCRTPSender.setStreams()
          // (https://bugzilla.mozilla.org/show_bug.cgi?id=1510802) so we'd have no way to group the
          // two tracks together into a stream.
          const newSender = this.peerConn.addTrack(track, callFeed.stream);

          // now go & fish for the new transceiver
          const newTransceiver = this.peerConn.getTransceivers().find(t => t.sender === newSender);
          if (newTransceiver) {
            this.transceivers.set(tKey, newTransceiver);
          } else {
            _logger.logger.warn(`Call ${this.callId} pushLocalFeed() didn't find a matching transceiver after adding track!`);
          }
        }
      }
    }
    _logger.logger.info(`Call ${this.callId} pushLocalFeed() pushed stream (id=${callFeed.stream.id}, active=${callFeed.stream.active}, purpose=${callFeed.purpose})`);
    this.emit(CallEvent.FeedsChanged, this.feeds, this);
  }

  /**
   * Removes local call feed from the call and its tracks from the peer
   * connection
   * @param callFeed - to remove
   */
  removeLocalFeed(callFeed) {
    const audioTransceiverKey = getTransceiverKey(callFeed.purpose, "audio");
    const videoTransceiverKey = getTransceiverKey(callFeed.purpose, "video");
    for (const transceiverKey of [audioTransceiverKey, videoTransceiverKey]) {
      // this is slightly mixing the track and transceiver API but is basically just shorthand.
      // There is no way to actually remove a transceiver, so this just sets it to inactive
      // (or recvonly) and replaces the source with nothing.
      if (this.transceivers.has(transceiverKey)) {
        const transceiver = this.transceivers.get(transceiverKey);
        if (transceiver.sender) this.peerConn.removeTrack(transceiver.sender);
      }
    }
    if (callFeed.purpose === _callEventTypes.SDPStreamMetadataPurpose.Screenshare) {
      this.client.getMediaHandler().stopScreensharingStream(callFeed.stream);
    }
    this.deleteFeed(callFeed);
  }
  deleteAllFeeds() {
    for (const feed of this.feeds) {
      if (!feed.isLocal() || !this.groupCallId) {
        feed.dispose();
      }
    }
    this.feeds = [];
    this.emit(CallEvent.FeedsChanged, this.feeds, this);
  }
  deleteFeedByStream(stream) {
    const feed = this.getFeedByStreamId(stream.id);
    if (!feed) {
      _logger.logger.warn(`Call ${this.callId} deleteFeedByStream() didn't find the feed to delete (streamId=${stream.id})`);
      return;
    }
    this.deleteFeed(feed);
  }
  deleteFeed(feed) {
    feed.dispose();
    this.feeds.splice(this.feeds.indexOf(feed), 1);
    this.emit(CallEvent.FeedsChanged, this.feeds, this);
  }

  // The typescript definitions have this type as 'any' :(
  async getCurrentCallStats() {
    if (this.callHasEnded()) {
      return this.callStatsAtEnd;
    }
    return this.collectCallStats();
  }
  async collectCallStats() {
    // This happens when the call fails before it starts.
    // For example when we fail to get capture sources
    if (!this.peerConn) return;
    const statsReport = await this.peerConn.getStats();
    const stats = [];
    statsReport.forEach(item => {
      stats.push(item);
    });
    return stats;
  }

  /**
   * Configure this call from an invite event. Used by MatrixClient.
   * @param event - The m.call.invite event
   */
  async initWithInvite(event) {
    const invite = event.getContent();
    this.direction = CallDirection.Inbound;

    // make sure we have valid turn creds. Unless something's gone wrong, it should
    // poll and keep the credentials valid so this should be instant.
    const haveTurnCreds = await this.client.checkTurnServers();
    if (!haveTurnCreds) {
      _logger.logger.warn(`Call ${this.callId} initWithInvite() failed to get TURN credentials! Proceeding with call anyway...`);
    }
    const sdpStreamMetadata = invite[_callEventTypes.SDPStreamMetadataKey];
    if (sdpStreamMetadata) {
      this.updateRemoteSDPStreamMetadata(sdpStreamMetadata);
    } else {
      _logger.logger.debug(`Call ${this.callId} initWithInvite() did not get any SDPStreamMetadata! Can not send/receive multiple streams`);
    }
    this.peerConn = this.createPeerConnection();
    this.emit(CallEvent.PeerConnectionCreated, this.peerConn, this);
    // we must set the party ID before await-ing on anything: the call event
    // handler will start giving us more call events (eg. candidates) so if
    // we haven't set the party ID, we'll ignore them.
    this.chooseOpponent(event);
    await this.initOpponentCrypto();
    try {
      await this.peerConn.setRemoteDescription(invite.offer);
      _logger.logger.debug(`Call ${this.callId} initWithInvite() set remote description: ${invite.offer.type}`);
      await this.addBufferedIceCandidates();
    } catch (e) {
      _logger.logger.debug(`Call ${this.callId} initWithInvite() failed to set remote description`, e);
      this.terminate(CallParty.Local, CallErrorCode.SetRemoteDescription, false);
      return;
    }
    const remoteStream = this.feeds.find(feed => !feed.isLocal())?.stream;

    // According to previous comments in this file, firefox at some point did not
    // add streams until media started arriving on them. Testing latest firefox
    // (81 at time of writing), this is no longer a problem, so let's do it the correct way.
    //
    // For example in case of no media webrtc connections like screen share only call we have to allow webrtc
    // connections without remote media. In this case we always use a data channel. At the moment we allow as well
    // only data channel as media in the WebRTC connection with this setup here.
    if (!this.isOnlyDataChannelAllowed && (!remoteStream || remoteStream.getTracks().length === 0)) {
      _logger.logger.error(`Call ${this.callId} initWithInvite() no remote stream or no tracks after setting remote description!`);
      this.terminate(CallParty.Local, CallErrorCode.SetRemoteDescription, false);
      return;
    }
    this.state = CallState.Ringing;
    if (event.getLocalAge()) {
      // Time out the call if it's ringing for too long
      const ringingTimer = setTimeout(() => {
        if (this.state == CallState.Ringing) {
          _logger.logger.debug(`Call ${this.callId} initWithInvite() invite has expired. Hanging up.`);
          this.hangupParty = CallParty.Remote; // effectively
          this.state = CallState.Ended;
          this.stopAllMedia();
          if (this.peerConn.signalingState != "closed") {
            this.peerConn.close();
          }
          this.stats?.removeStatsReportGatherer(this.callId);
          this.emit(CallEvent.Hangup, this);
        }
      }, invite.lifetime - event.getLocalAge());
      const onState = state => {
        if (state !== CallState.Ringing) {
          clearTimeout(ringingTimer);
          this.off(CallEvent.State, onState);
        }
      };
      this.on(CallEvent.State, onState);
    }
  }

  /**
   * Configure this call from a hangup or reject event. Used by MatrixClient.
   * @param event - The m.call.hangup event
   */
  initWithHangup(event) {
    // perverse as it may seem, sometimes we want to instantiate a call with a
    // hangup message (because when getting the state of the room on load, events
    // come in reverse order and we want to remember that a call has been hung up)
    this.state = CallState.Ended;
  }
  shouldAnswerWithMediaType(wantedValue, valueOfTheOtherSide, type) {
    if (wantedValue && !valueOfTheOtherSide) {
      // TODO: Figure out how to do this
      _logger.logger.warn(`Call ${this.callId} shouldAnswerWithMediaType() unable to answer with ${type} because the other side isn't sending it either.`);
      return false;
    } else if (!(0, _utils.isNullOrUndefined)(wantedValue) && wantedValue !== valueOfTheOtherSide && !this.opponentSupportsSDPStreamMetadata()) {
      _logger.logger.warn(`Call ${this.callId} shouldAnswerWithMediaType() unable to answer with ${type}=${wantedValue} because the other side doesn't support it. Answering with ${type}=${valueOfTheOtherSide}.`);
      return valueOfTheOtherSide;
    }
    return wantedValue ?? valueOfTheOtherSide;
  }

  /**
   * Answer a call.
   */
  async answer(audio, video) {
    if (this.inviteOrAnswerSent) return;
    // TODO: Figure out how to do this
    if (audio === false && video === false) throw new Error("You CANNOT answer a call without media");
    if (!this.localUsermediaStream && !this.waitForLocalAVStream) {
      const prevState = this.state;
      const answerWithAudio = this.shouldAnswerWithMediaType(audio, this.hasRemoteUserMediaAudioTrack, "audio");
      const answerWithVideo = this.shouldAnswerWithMediaType(video, this.hasRemoteUserMediaVideoTrack, "video");
      this.state = CallState.WaitLocalMedia;
      this.waitForLocalAVStream = true;
      try {
        const stream = await this.client.getMediaHandler().getUserMediaStream(answerWithAudio, answerWithVideo);
        this.waitForLocalAVStream = false;
        const usermediaFeed = new _callFeed.CallFeed({
          client: this.client,
          roomId: this.roomId,
          userId: this.client.getUserId(),
          deviceId: this.client.getDeviceId() ?? undefined,
          stream,
          purpose: _callEventTypes.SDPStreamMetadataPurpose.Usermedia,
          audioMuted: false,
          videoMuted: false
        });
        const feeds = [usermediaFeed];
        if (this.localScreensharingFeed) {
          feeds.push(this.localScreensharingFeed);
        }
        this.answerWithCallFeeds(feeds);
      } catch (e) {
        if (answerWithVideo) {
          // Try to answer without video
          _logger.logger.warn(`Call ${this.callId} answer() failed to getUserMedia(), trying to getUserMedia() without video`);
          this.state = prevState;
          this.waitForLocalAVStream = false;
          await this.answer(answerWithAudio, false);
        } else {
          this.getUserMediaFailed(e);
          return;
        }
      }
    } else if (this.waitForLocalAVStream) {
      this.state = CallState.WaitLocalMedia;
    }
  }
  answerWithCallFeeds(callFeeds) {
    if (this.inviteOrAnswerSent) return;
    this.queueGotCallFeedsForAnswer(callFeeds);
  }

  /**
   * Replace this call with a new call, e.g. for glare resolution. Used by
   * MatrixClient.
   * @param newCall - The new call.
   */
  replacedBy(newCall) {
    _logger.logger.debug(`Call ${this.callId} replacedBy() running (newCallId=${newCall.callId})`);
    if (this.state === CallState.WaitLocalMedia) {
      _logger.logger.debug(`Call ${this.callId} replacedBy() telling new call to wait for local media (newCallId=${newCall.callId})`);
      newCall.waitForLocalAVStream = true;
    } else if ([CallState.CreateOffer, CallState.InviteSent].includes(this.state)) {
      if (newCall.direction === CallDirection.Outbound) {
        newCall.queueGotCallFeedsForAnswer([]);
      } else {
        _logger.logger.debug(`Call ${this.callId} replacedBy() handing local stream to new call(newCallId=${newCall.callId})`);
        newCall.queueGotCallFeedsForAnswer(this.getLocalFeeds().map(feed => feed.clone()));
      }
    }
    this.successor = newCall;
    this.emit(CallEvent.Replaced, newCall, this);
    this.hangup(CallErrorCode.Replaced, true);
  }

  /**
   * Hangup a call.
   * @param reason - The reason why the call is being hung up.
   * @param suppressEvent - True to suppress emitting an event.
   */
  hangup(reason, suppressEvent) {
    if (this.callHasEnded()) return;
    _logger.logger.debug(`Call ${this.callId} hangup() ending call (reason=${reason})`);
    this.terminate(CallParty.Local, reason, !suppressEvent);
    // We don't want to send hangup here if we didn't even get to sending an invite
    if ([CallState.Fledgling, CallState.WaitLocalMedia].includes(this.state)) return;
    const content = {};
    // Don't send UserHangup reason to older clients
    if (this.opponentVersion && this.opponentVersion !== 0 || reason !== CallErrorCode.UserHangup) {
      content["reason"] = reason;
    }
    this.sendVoipEvent(_event.EventType.CallHangup, content);
  }

  /**
   * Reject a call
   * This used to be done by calling hangup, but is a separate method and protocol
   * event as of MSC2746.
   */
  reject() {
    if (this.state !== CallState.Ringing) {
      throw Error("Call must be in 'ringing' state to reject!");
    }
    if (this.opponentVersion === 0) {
      _logger.logger.info(`Call ${this.callId} reject() opponent version is less than 1: sending hangup instead of reject (opponentVersion=${this.opponentVersion})`);
      this.hangup(CallErrorCode.UserHangup, true);
      return;
    }
    _logger.logger.debug("Rejecting call: " + this.callId);
    this.terminate(CallParty.Local, CallErrorCode.UserHangup, true);
    this.sendVoipEvent(_event.EventType.CallReject, {});
  }

  /**
   * Adds an audio and/or video track - upgrades the call
   * @param audio - should add an audio track
   * @param video - should add an video track
   */
  async upgradeCall(audio, video) {
    // We don't do call downgrades
    if (!audio && !video) return;
    if (!this.opponentSupportsSDPStreamMetadata()) return;
    try {
      _logger.logger.debug(`Call ${this.callId} upgradeCall() upgrading call (audio=${audio}, video=${video})`);
      const getAudio = audio || this.hasLocalUserMediaAudioTrack;
      const getVideo = video || this.hasLocalUserMediaVideoTrack;

      // updateLocalUsermediaStream() will take the tracks, use them as
      // replacement and throw the stream away, so it isn't reusable
      const stream = await this.client.getMediaHandler().getUserMediaStream(getAudio, getVideo, false);
      await this.updateLocalUsermediaStream(stream, audio, video);
    } catch (error) {
      _logger.logger.error(`Call ${this.callId} upgradeCall() failed to upgrade the call`, error);
      this.emit(CallEvent.Error, new CallError(CallErrorCode.NoUserMedia, "Failed to get camera access: ", error), this);
    }
  }

  /**
   * Returns true if this.remoteSDPStreamMetadata is defined, otherwise returns false
   * @returns can screenshare
   */
  opponentSupportsSDPStreamMetadata() {
    return Boolean(this.remoteSDPStreamMetadata);
  }

  /**
   * If there is a screensharing stream returns true, otherwise returns false
   * @returns is screensharing
   */
  isScreensharing() {
    return Boolean(this.localScreensharingStream);
  }

  /**
   * Starts/stops screensharing
   * @param enabled - the desired screensharing state
   * @param desktopCapturerSourceId - optional id of the desktop capturer source to use
   * @returns new screensharing state
   */
  async setScreensharingEnabled(enabled, opts) {
    // Skip if there is nothing to do
    if (enabled && this.isScreensharing()) {
      _logger.logger.warn(`Call ${this.callId} setScreensharingEnabled() there is already a screensharing stream - there is nothing to do!`);
      return true;
    } else if (!enabled && !this.isScreensharing()) {
      _logger.logger.warn(`Call ${this.callId} setScreensharingEnabled() there already isn't a screensharing stream - there is nothing to do!`);
      return false;
    }

    // Fallback to replaceTrack()
    if (!this.opponentSupportsSDPStreamMetadata()) {
      return this.setScreensharingEnabledWithoutMetadataSupport(enabled, opts);
    }
    _logger.logger.debug(`Call ${this.callId} setScreensharingEnabled() running (enabled=${enabled})`);
    if (enabled) {
      try {
        const stream = await this.client.getMediaHandler().getScreensharingStream(opts);
        if (!stream) return false;
        this.pushNewLocalFeed(stream, _callEventTypes.SDPStreamMetadataPurpose.Screenshare);
        return true;
      } catch (err) {
        _logger.logger.error(`Call ${this.callId} setScreensharingEnabled() failed to get screen-sharing stream:`, err);
        return false;
      }
    } else {
      const audioTransceiver = this.transceivers.get(getTransceiverKey(_callEventTypes.SDPStreamMetadataPurpose.Screenshare, "audio"));
      const videoTransceiver = this.transceivers.get(getTransceiverKey(_callEventTypes.SDPStreamMetadataPurpose.Screenshare, "video"));
      for (const transceiver of [audioTransceiver, videoTransceiver]) {
        // this is slightly mixing the track and transceiver API but is basically just shorthand
        // for removing the sender.
        if (transceiver && transceiver.sender) this.peerConn.removeTrack(transceiver.sender);
      }
      this.client.getMediaHandler().stopScreensharingStream(this.localScreensharingStream);
      this.deleteFeedByStream(this.localScreensharingStream);
      return false;
    }
  }

  /**
   * Starts/stops screensharing
   * Should be used ONLY if the opponent doesn't support SDPStreamMetadata
   * @param enabled - the desired screensharing state
   * @param desktopCapturerSourceId - optional id of the desktop capturer source to use
   * @returns new screensharing state
   */
  async setScreensharingEnabledWithoutMetadataSupport(enabled, opts) {
    _logger.logger.debug(`Call ${this.callId} setScreensharingEnabledWithoutMetadataSupport() running (enabled=${enabled})`);
    if (enabled) {
      try {
        const stream = await this.client.getMediaHandler().getScreensharingStream(opts);
        if (!stream) return false;
        const track = stream.getTracks().find(track => track.kind === "video");
        const sender = this.transceivers.get(getTransceiverKey(_callEventTypes.SDPStreamMetadataPurpose.Usermedia, "video"))?.sender;
        sender?.replaceTrack(track ?? null);
        this.pushNewLocalFeed(stream, _callEventTypes.SDPStreamMetadataPurpose.Screenshare, false);
        return true;
      } catch (err) {
        _logger.logger.error(`Call ${this.callId} setScreensharingEnabledWithoutMetadataSupport() failed to get screen-sharing stream:`, err);
        return false;
      }
    } else {
      const track = this.localUsermediaStream?.getTracks().find(track => track.kind === "video");
      const sender = this.transceivers.get(getTransceiverKey(_callEventTypes.SDPStreamMetadataPurpose.Usermedia, "video"))?.sender;
      sender?.replaceTrack(track ?? null);
      this.client.getMediaHandler().stopScreensharingStream(this.localScreensharingStream);
      this.deleteFeedByStream(this.localScreensharingStream);
      return false;
    }
  }

  /**
   * Replaces/adds the tracks from the passed stream to the localUsermediaStream
   * @param stream - to use a replacement for the local usermedia stream
   */
  async updateLocalUsermediaStream(stream, forceAudio = false, forceVideo = false) {
    const callFeed = this.localUsermediaFeed;
    const audioEnabled = forceAudio || !callFeed.isAudioMuted() && !this.remoteOnHold;
    const videoEnabled = forceVideo || !callFeed.isVideoMuted() && !this.remoteOnHold;
    _logger.logger.log(`Call ${this.callId} updateLocalUsermediaStream() running (streamId=${stream.id}, audio=${audioEnabled}, video=${videoEnabled})`);
    setTracksEnabled(stream.getAudioTracks(), audioEnabled);
    setTracksEnabled(stream.getVideoTracks(), videoEnabled);

    // We want to keep the same stream id, so we replace the tracks rather
    // than the whole stream.

    // Firstly, we replace the tracks in our localUsermediaStream.
    for (const track of this.localUsermediaStream.getTracks()) {
      this.localUsermediaStream.removeTrack(track);
      track.stop();
    }
    for (const track of stream.getTracks()) {
      this.localUsermediaStream.addTrack(track);
    }

    // Then replace the old tracks, if possible.
    for (const track of stream.getTracks()) {
      const tKey = getTransceiverKey(_callEventTypes.SDPStreamMetadataPurpose.Usermedia, track.kind);
      const transceiver = this.transceivers.get(tKey);
      const oldSender = transceiver?.sender;
      let added = false;
      if (oldSender) {
        try {
          _logger.logger.info(`Call ${this.callId} updateLocalUsermediaStream() replacing track (id=${track.id}, kind=${track.kind}, streamId=${stream.id}, streamPurpose=${callFeed.purpose})`);
          await oldSender.replaceTrack(track);
          // Set the direction to indicate we're going to be sending.
          // This is only necessary in the cases where we're upgrading
          // the call to video after downgrading it.
          transceiver.direction = transceiver.direction === "inactive" ? "sendonly" : "sendrecv";
          added = true;
        } catch (error) {
          _logger.logger.warn(`Call ${this.callId} updateLocalUsermediaStream() replaceTrack failed: adding new transceiver instead`, error);
        }
      }
      if (!added) {
        _logger.logger.info(`Call ${this.callId} updateLocalUsermediaStream() adding track to peer connection (id=${track.id}, kind=${track.kind}, streamId=${stream.id}, streamPurpose=${callFeed.purpose})`);
        const newSender = this.peerConn.addTrack(track, this.localUsermediaStream);
        const newTransceiver = this.peerConn.getTransceivers().find(t => t.sender === newSender);
        if (newTransceiver) {
          this.transceivers.set(tKey, newTransceiver);
        } else {
          _logger.logger.warn(`Call ${this.callId} updateLocalUsermediaStream() couldn't find matching transceiver for newly added track!`);
        }
      }
    }
  }

  /**
   * Set whether our outbound video should be muted or not.
   * @param muted - True to mute the outbound video.
   * @returns the new mute state
   */
  async setLocalVideoMuted(muted) {
    _logger.logger.log(`Call ${this.callId} setLocalVideoMuted() running ${muted}`);

    // if we were still thinking about stopping and removing the video
    // track: don't, because we want it back.
    if (!muted && this.stopVideoTrackTimer !== undefined) {
      clearTimeout(this.stopVideoTrackTimer);
      this.stopVideoTrackTimer = undefined;
    }
    if (!(await this.client.getMediaHandler().hasVideoDevice())) {
      return this.isLocalVideoMuted();
    }
    if (!this.hasUserMediaVideoSender && !muted) {
      this.localUsermediaFeed?.setAudioVideoMuted(null, muted);
      await this.upgradeCall(false, true);
      return this.isLocalVideoMuted();
    }

    // we may not have a video track - if not, re-request usermedia
    if (!muted && this.localUsermediaStream.getVideoTracks().length === 0) {
      const stream = await this.client.getMediaHandler().getUserMediaStream(true, true);
      await this.updateLocalUsermediaStream(stream);
    }
    this.localUsermediaFeed?.setAudioVideoMuted(null, muted);
    this.updateMuteStatus();
    await this.sendMetadataUpdate();

    // if we're muting video, set a timeout to stop & remove the video track so we release
    // the camera. We wait a short time to do this because when we disable a track, WebRTC
    // will send black video for it. If we just stop and remove it straight away, the video
    // will just freeze which means that when we unmute video, the other side will briefly
    // get a static frame of us from before we muted. This way, the still frame is just black.
    // A very small delay is not always enough so the theory here is that it needs to be long
    // enough for WebRTC to encode a frame: 120ms should be long enough even if we're only
    // doing 10fps.
    if (muted) {
      this.stopVideoTrackTimer = setTimeout(() => {
        for (const t of this.localUsermediaStream.getVideoTracks()) {
          t.stop();
          this.localUsermediaStream.removeTrack(t);
        }
      }, 120);
    }
    return this.isLocalVideoMuted();
  }

  /**
   * Check if local video is muted.
   *
   * If there are multiple video tracks, <i>all</i> of the tracks need to be muted
   * for this to return true. This means if there are no video tracks, this will
   * return true.
   * @returns True if the local preview video is muted, else false
   * (including if the call is not set up yet).
   */
  isLocalVideoMuted() {
    return this.localUsermediaFeed?.isVideoMuted() ?? false;
  }

  /**
   * Set whether the microphone should be muted or not.
   * @param muted - True to mute the mic.
   * @returns the new mute state
   */
  async setMicrophoneMuted(muted) {
    _logger.logger.log(`Call ${this.callId} setMicrophoneMuted() running ${muted}`);
    if (!(await this.client.getMediaHandler().hasAudioDevice())) {
      return this.isMicrophoneMuted();
    }
    if (!muted && (!this.hasUserMediaAudioSender || !this.hasLocalUserMediaAudioTrack)) {
      await this.upgradeCall(true, false);
      return this.isMicrophoneMuted();
    }
    this.localUsermediaFeed?.setAudioVideoMuted(muted, null);
    this.updateMuteStatus();
    await this.sendMetadataUpdate();
    return this.isMicrophoneMuted();
  }

  /**
   * Check if the microphone is muted.
   *
   * If there are multiple audio tracks, <i>all</i> of the tracks need to be muted
   * for this to return true. This means if there are no audio tracks, this will
   * return true.
   * @returns True if the mic is muted, else false (including if the call
   * is not set up yet).
   */
  isMicrophoneMuted() {
    return this.localUsermediaFeed?.isAudioMuted() ?? false;
  }

  /**
   * @returns true if we have put the party on the other side of the call on hold
   * (that is, we are signalling to them that we are not listening)
   */
  isRemoteOnHold() {
    return this.remoteOnHold;
  }
  setRemoteOnHold(onHold) {
    if (this.isRemoteOnHold() === onHold) return;
    this.remoteOnHold = onHold;
    for (const transceiver of this.peerConn.getTransceivers()) {
      // We don't send hold music or anything so we're not actually
      // sending anything, but sendrecv is fairly standard for hold and
      // it makes it a lot easier to figure out who's put who on hold.
      transceiver.direction = onHold ? "sendonly" : "sendrecv";
    }
    this.updateMuteStatus();
    this.sendMetadataUpdate();
    this.emit(CallEvent.RemoteHoldUnhold, this.remoteOnHold, this);
  }

  /**
   * Indicates whether we are 'on hold' to the remote party (ie. if true,
   * they cannot hear us).
   * @returns true if the other party has put us on hold
   */
  isLocalOnHold() {
    if (this.state !== CallState.Connected) return false;
    let callOnHold = true;

    // We consider a call to be on hold only if *all* the tracks are on hold
    // (is this the right thing to do?)
    for (const transceiver of this.peerConn.getTransceivers()) {
      const trackOnHold = ["inactive", "recvonly"].includes(transceiver.currentDirection);
      if (!trackOnHold) callOnHold = false;
    }
    return callOnHold;
  }

  /**
   * Sends a DTMF digit to the other party
   * @param digit - The digit (nb. string - '#' and '*' are dtmf too)
   */
  sendDtmfDigit(digit) {
    for (const sender of this.peerConn.getSenders()) {
      if (sender.track?.kind === "audio" && sender.dtmf) {
        sender.dtmf.insertDTMF(digit);
        return;
      }
    }
    throw new Error("Unable to find a track to send DTMF on");
  }
  updateMuteStatus() {
    const micShouldBeMuted = this.isMicrophoneMuted() || this.remoteOnHold;
    const vidShouldBeMuted = this.isLocalVideoMuted() || this.remoteOnHold;
    _logger.logger.log(`Call ${this.callId} updateMuteStatus stream ${this.localUsermediaStream.id} micShouldBeMuted ${micShouldBeMuted} vidShouldBeMuted ${vidShouldBeMuted}`);
    setTracksEnabled(this.localUsermediaStream.getAudioTracks(), !micShouldBeMuted);
    setTracksEnabled(this.localUsermediaStream.getVideoTracks(), !vidShouldBeMuted);
  }
  async sendMetadataUpdate() {
    await this.sendVoipEvent(_event.EventType.CallSDPStreamMetadataChangedPrefix, {
      [_callEventTypes.SDPStreamMetadataKey]: this.getLocalSDPStreamMetadata()
    });
  }
  gotCallFeedsForInvite(callFeeds, requestScreenshareFeed = false) {
    if (this.successor) {
      this.successor.queueGotCallFeedsForAnswer(callFeeds);
      return;
    }
    if (this.callHasEnded()) {
      this.stopAllMedia();
      return;
    }
    for (const feed of callFeeds) {
      this.pushLocalFeed(feed);
    }
    if (requestScreenshareFeed) {
      this.peerConn.addTransceiver("video", {
        direction: "recvonly"
      });
    }
    this.state = CallState.CreateOffer;
    _logger.logger.debug(`Call ${this.callId} gotUserMediaForInvite() run`);
    // Now we wait for the negotiationneeded event
  }
  async sendAnswer() {
    const answerContent = {
      answer: {
        sdp: this.peerConn.localDescription.sdp,
        // type is now deprecated as of Matrix VoIP v1, but
        // required to still be sent for backwards compat
        type: this.peerConn.localDescription.type
      },
      [_callEventTypes.SDPStreamMetadataKey]: this.getLocalSDPStreamMetadata(true)
    };
    answerContent.capabilities = {
      "m.call.transferee": this.client.supportsCallTransfer,
      "m.call.dtmf": false
    };

    // We have just taken the local description from the peerConn which will
    // contain all the local candidates added so far, so we can discard any candidates
    // we had queued up because they'll be in the answer.
    const discardCount = this.discardDuplicateCandidates();
    _logger.logger.info(`Call ${this.callId} sendAnswer() discarding ${discardCount} candidates that will be sent in answer`);
    try {
      await this.sendVoipEvent(_event.EventType.CallAnswer, answerContent);
      // If this isn't the first time we've tried to send the answer,
      // we may have candidates queued up, so send them now.
      this.inviteOrAnswerSent = true;
    } catch (error) {
      // We've failed to answer: back to the ringing state
      this.state = CallState.Ringing;
      if (error instanceof _httpApi.MatrixError && error.event) this.client.cancelPendingEvent(error.event);
      let code = CallErrorCode.SendAnswer;
      let message = "Failed to send answer";
      if (error.name == "UnknownDeviceError") {
        code = CallErrorCode.UnknownDevices;
        message = "Unknown devices present in the room";
      }
      this.emit(CallEvent.Error, new CallError(code, message, error), this);
      throw error;
    }

    // error handler re-throws so this won't happen on error, but
    // we don't want the same error handling on the candidate queue
    this.sendCandidateQueue();
  }
  queueGotCallFeedsForAnswer(callFeeds) {
    // Ensure only one negotiate/answer event is being processed at a time.
    if (this.responsePromiseChain) {
      this.responsePromiseChain = this.responsePromiseChain.then(() => this.gotCallFeedsForAnswer(callFeeds));
    } else {
      this.responsePromiseChain = this.gotCallFeedsForAnswer(callFeeds);
    }
  }

  // Enables DTX (discontinuous transmission) on the given session to reduce
  // bandwidth when transmitting silence
  mungeSdp(description, mods) {
    // The only way to enable DTX at this time is through SDP munging
    const sdp = (0, _sdpTransform.parse)(description.sdp);
    sdp.media.forEach(media => {
      const payloadTypeToCodecMap = new Map();
      const codecToPayloadTypeMap = new Map();
      for (const rtp of media.rtp) {
        payloadTypeToCodecMap.set(rtp.payload, rtp.codec);
        codecToPayloadTypeMap.set(rtp.codec, rtp.payload);
      }
      for (const mod of mods) {
        if (mod.mediaType !== media.type) continue;
        if (!codecToPayloadTypeMap.has(mod.codec)) {
          _logger.logger.info(`Call ${this.callId} mungeSdp() ignoring SDP modifications for ${mod.codec} as it's not present.`);
          continue;
        }
        const extraConfig = [];
        if (mod.enableDtx !== undefined) {
          extraConfig.push(`usedtx=${mod.enableDtx ? "1" : "0"}`);
        }
        if (mod.maxAverageBitrate !== undefined) {
          extraConfig.push(`maxaveragebitrate=${mod.maxAverageBitrate}`);
        }
        let found = false;
        for (const fmtp of media.fmtp) {
          if (payloadTypeToCodecMap.get(fmtp.payload) === mod.codec) {
            found = true;
            fmtp.config += ";" + extraConfig.join(";");
          }
        }
        if (!found) {
          media.fmtp.push({
            payload: codecToPayloadTypeMap.get(mod.codec),
            config: extraConfig.join(";")
          });
        }
      }
    });
    description.sdp = (0, _sdpTransform.write)(sdp);
  }
  async createOffer() {
    const offer = await this.peerConn.createOffer();
    this.mungeSdp(offer, getCodecParamMods(this.isPtt));
    return offer;
  }
  async createAnswer() {
    const answer = await this.peerConn.createAnswer();
    this.mungeSdp(answer, getCodecParamMods(this.isPtt));
    return answer;
  }
  async gotCallFeedsForAnswer(callFeeds) {
    if (this.callHasEnded()) return;
    this.waitForLocalAVStream = false;
    for (const feed of callFeeds) {
      this.pushLocalFeed(feed);
    }
    this.state = CallState.CreateAnswer;
    let answer;
    try {
      this.getRidOfRTXCodecs();
      answer = await this.createAnswer();
    } catch (err) {
      _logger.logger.debug(`Call ${this.callId} gotCallFeedsForAnswer() failed to create answer: `, err);
      this.terminate(CallParty.Local, CallErrorCode.CreateAnswer, true);
      return;
    }
    try {
      await this.peerConn.setLocalDescription(answer);

      // make sure we're still going
      if (this.callHasEnded()) return;
      this.state = CallState.Connecting;

      // Allow a short time for initial candidates to be gathered
      await new Promise(resolve => {
        setTimeout(resolve, 200);
      });

      // make sure the call hasn't ended before we continue
      if (this.callHasEnded()) return;
      this.sendAnswer();
    } catch (err) {
      _logger.logger.debug(`Call ${this.callId} gotCallFeedsForAnswer() error setting local description!`, err);
      this.terminate(CallParty.Local, CallErrorCode.SetLocalDescription, true);
      return;
    }
  }
  async onRemoteIceCandidatesReceived(ev) {
    if (this.callHasEnded()) {
      //debuglog("Ignoring remote ICE candidate because call has ended");
      return;
    }
    const content = ev.getContent();
    const candidates = content.candidates;
    if (!candidates) {
      _logger.logger.info(`Call ${this.callId} onRemoteIceCandidatesReceived() ignoring candidates event with no candidates!`);
      return;
    }
    const fromPartyId = content.version === 0 ? null : content.party_id || null;
    if (this.opponentPartyId === undefined) {
      // we haven't picked an opponent yet so save the candidates
      if (fromPartyId) {
        _logger.logger.info(`Call ${this.callId} onRemoteIceCandidatesReceived() buffering ${candidates.length} candidates until we pick an opponent`);
        const bufferedCandidates = this.remoteCandidateBuffer.get(fromPartyId) || [];
        bufferedCandidates.push(...candidates);
        this.remoteCandidateBuffer.set(fromPartyId, bufferedCandidates);
      }
      return;
    }
    if (!this.partyIdMatches(content)) {
      _logger.logger.info(`Call ${this.callId} onRemoteIceCandidatesReceived() ignoring candidates from party ID ${content.party_id}: we have chosen party ID ${this.opponentPartyId}`);
      return;
    }
    await this.addIceCandidates(candidates);
  }

  /**
   * Used by MatrixClient.
   */
  async onAnswerReceived(event) {
    const content = event.getContent();
    _logger.logger.debug(`Call ${this.callId} onAnswerReceived() running (hangupParty=${content.party_id})`);
    if (this.callHasEnded()) {
      _logger.logger.debug(`Call ${this.callId} onAnswerReceived() ignoring answer because call has ended`);
      return;
    }
    if (this.opponentPartyId !== undefined) {
      _logger.logger.info(`Call ${this.callId} onAnswerReceived() ignoring answer from party ID ${content.party_id}: we already have an answer/reject from ${this.opponentPartyId}`);
      return;
    }
    this.chooseOpponent(event);
    await this.addBufferedIceCandidates();
    this.state = CallState.Connecting;
    const sdpStreamMetadata = content[_callEventTypes.SDPStreamMetadataKey];
    if (sdpStreamMetadata) {
      this.updateRemoteSDPStreamMetadata(sdpStreamMetadata);
    } else {
      _logger.logger.warn(`Call ${this.callId} onAnswerReceived() did not get any SDPStreamMetadata! Can not send/receive multiple streams`);
    }
    try {
      this.isSettingRemoteAnswerPending = true;
      await this.peerConn.setRemoteDescription(content.answer);
      this.isSettingRemoteAnswerPending = false;
      _logger.logger.debug(`Call ${this.callId} onAnswerReceived() set remote description: ${content.answer.type}`);
    } catch (e) {
      this.isSettingRemoteAnswerPending = false;
      _logger.logger.debug(`Call ${this.callId} onAnswerReceived() failed to set remote description`, e);
      this.terminate(CallParty.Local, CallErrorCode.SetRemoteDescription, false);
      return;
    }

    // If the answer we selected has a party_id, send a select_answer event
    // We do this after setting the remote description since otherwise we'd block
    // call setup on it
    if (this.opponentPartyId !== null) {
      try {
        await this.sendVoipEvent(_event.EventType.CallSelectAnswer, {
          selected_party_id: this.opponentPartyId
        });
      } catch (err) {
        // This isn't fatal, and will just mean that if another party has raced to answer
        // the call, they won't know they got rejected, so we carry on & don't retry.
        _logger.logger.warn(`Call ${this.callId} onAnswerReceived() failed to send select_answer event`, err);
      }
    }
  }
  async onSelectAnswerReceived(event) {
    if (this.direction !== CallDirection.Inbound) {
      _logger.logger.warn(`Call ${this.callId} onSelectAnswerReceived() got select_answer for an outbound call: ignoring`);
      return;
    }
    const selectedPartyId = event.getContent().selected_party_id;
    if (selectedPartyId === undefined || selectedPartyId === null) {
      _logger.logger.warn(`Call ${this.callId} onSelectAnswerReceived() got nonsensical select_answer with null/undefined selected_party_id: ignoring`);
      return;
    }
    if (selectedPartyId !== this.ourPartyId) {
      _logger.logger.info(`Call ${this.callId} onSelectAnswerReceived() got select_answer for party ID ${selectedPartyId}: we are party ID ${this.ourPartyId}.`);
      // The other party has picked somebody else's answer
      await this.terminate(CallParty.Remote, CallErrorCode.AnsweredElsewhere, true);
    }
  }
  async onNegotiateReceived(event) {
    const content = event.getContent();
    const description = content.description;
    if (!description || !description.sdp || !description.type) {
      _logger.logger.info(`Call ${this.callId} onNegotiateReceived() ignoring invalid m.call.negotiate event`);
      return;
    }
    // Politeness always follows the direction of the call: in a glare situation,
    // we pick either the inbound or outbound call, so one side will always be
    // inbound and one outbound
    const polite = this.direction === CallDirection.Inbound;

    // Here we follow the perfect negotiation logic from
    // https://w3c.github.io/webrtc-pc/#perfect-negotiation-example
    const readyForOffer = !this.makingOffer && (this.peerConn.signalingState === "stable" || this.isSettingRemoteAnswerPending);
    const offerCollision = description.type === "offer" && !readyForOffer;
    this.ignoreOffer = !polite && offerCollision;
    if (this.ignoreOffer) {
      _logger.logger.info(`Call ${this.callId} onNegotiateReceived() ignoring colliding negotiate event because we're impolite`);
      return;
    }
    const prevLocalOnHold = this.isLocalOnHold();
    const sdpStreamMetadata = content[_callEventTypes.SDPStreamMetadataKey];
    if (sdpStreamMetadata) {
      this.updateRemoteSDPStreamMetadata(sdpStreamMetadata);
    } else {
      _logger.logger.warn(`Call ${this.callId} onNegotiateReceived() received negotiation event without SDPStreamMetadata!`);
    }
    try {
      this.isSettingRemoteAnswerPending = description.type == "answer";
      await this.peerConn.setRemoteDescription(description); // SRD rolls back as needed
      this.isSettingRemoteAnswerPending = false;
      _logger.logger.debug(`Call ${this.callId} onNegotiateReceived() set remote description: ${description.type}`);
      if (description.type === "offer") {
        let answer;
        try {
          this.getRidOfRTXCodecs();
          answer = await this.createAnswer();
        } catch (err) {
          _logger.logger.debug(`Call ${this.callId} onNegotiateReceived() failed to create answer: `, err);
          this.terminate(CallParty.Local, CallErrorCode.CreateAnswer, true);
          return;
        }
        await this.peerConn.setLocalDescription(answer);
        _logger.logger.debug(`Call ${this.callId} onNegotiateReceived() create an answer`);
        this.sendVoipEvent(_event.EventType.CallNegotiate, {
          description: this.peerConn.localDescription?.toJSON(),
          [_callEventTypes.SDPStreamMetadataKey]: this.getLocalSDPStreamMetadata(true)
        });
      }
    } catch (err) {
      this.isSettingRemoteAnswerPending = false;
      _logger.logger.warn(`Call ${this.callId} onNegotiateReceived() failed to complete negotiation`, err);
    }
    const newLocalOnHold = this.isLocalOnHold();
    if (prevLocalOnHold !== newLocalOnHold) {
      this.emit(CallEvent.LocalHoldUnhold, newLocalOnHold, this);
      // also this one for backwards compat
      this.emit(CallEvent.HoldUnhold, newLocalOnHold);
    }
  }
  updateRemoteSDPStreamMetadata(metadata) {
    this.remoteSDPStreamMetadata = (0, _utils.recursivelyAssign)(this.remoteSDPStreamMetadata || {}, metadata, true);
    for (const feed of this.getRemoteFeeds()) {
      const streamId = feed.stream.id;
      const metadata = this.remoteSDPStreamMetadata[streamId];
      feed.setAudioVideoMuted(metadata?.audio_muted, metadata?.video_muted);
      feed.purpose = this.remoteSDPStreamMetadata[streamId]?.purpose;
    }
  }
  onSDPStreamMetadataChangedReceived(event) {
    const content = event.getContent();
    const metadata = content[_callEventTypes.SDPStreamMetadataKey];
    this.updateRemoteSDPStreamMetadata(metadata);
  }
  async onAssertedIdentityReceived(event) {
    const content = event.getContent();
    if (!content.asserted_identity) return;
    this.remoteAssertedIdentity = {
      id: content.asserted_identity.id,
      displayName: content.asserted_identity.display_name
    };
    this.emit(CallEvent.AssertedIdentityChanged, this);
  }
  callHasEnded() {
    // This exists as workaround to typescript trying to be clever and erroring
    // when putting if (this.state === CallState.Ended) return; twice in the same
    // function, even though that function is async.
    return this.state === CallState.Ended;
  }
  queueGotLocalOffer() {
    // Ensure only one negotiate/answer event is being processed at a time.
    if (this.responsePromiseChain) {
      this.responsePromiseChain = this.responsePromiseChain.then(() => this.wrappedGotLocalOffer());
    } else {
      this.responsePromiseChain = this.wrappedGotLocalOffer();
    }
  }
  async wrappedGotLocalOffer() {
    this.makingOffer = true;
    try {
      // XXX: in what situations do we believe gotLocalOffer actually throws? It appears
      // to handle most of its exceptions itself and terminate the call. I'm not entirely
      // sure it would ever throw, so I can't add a test for these lines.
      // Also the tense is different between "gotLocalOffer" and "getLocalOfferFailed" so
      // it's not entirely clear whether getLocalOfferFailed is just misnamed or whether
      // they've been cross-polinated somehow at some point.
      await this.gotLocalOffer();
    } catch (e) {
      this.getLocalOfferFailed(e);
      return;
    } finally {
      this.makingOffer = false;
    }
  }
  async gotLocalOffer() {
    _logger.logger.debug(`Call ${this.callId} gotLocalOffer() running`);
    if (this.callHasEnded()) {
      _logger.logger.debug(`Call ${this.callId} gotLocalOffer() ignoring newly created offer because the call has ended"`);
      return;
    }
    let offer;
    try {
      this.getRidOfRTXCodecs();
      offer = await this.createOffer();
    } catch (err) {
      _logger.logger.debug(`Call ${this.callId} gotLocalOffer() failed to create offer: `, err);
      this.terminate(CallParty.Local, CallErrorCode.CreateOffer, true);
      return;
    }
    try {
      await this.peerConn.setLocalDescription(offer);
    } catch (err) {
      _logger.logger.debug(`Call ${this.callId} gotLocalOffer() error setting local description!`, err);
      this.terminate(CallParty.Local, CallErrorCode.SetLocalDescription, true);
      return;
    }
    if (this.peerConn.iceGatheringState === "gathering") {
      // Allow a short time for initial candidates to be gathered
      await new Promise(resolve => {
        setTimeout(resolve, 200);
      });
    }
    if (this.callHasEnded()) return;
    const eventType = this.state === CallState.CreateOffer ? _event.EventType.CallInvite : _event.EventType.CallNegotiate;
    const content = {
      lifetime: CALL_TIMEOUT_MS
    };
    if (eventType === _event.EventType.CallInvite && this.invitee) {
      content.invitee = this.invitee;
    }

    // clunky because TypeScript can't follow the types through if we use an expression as the key
    if (this.state === CallState.CreateOffer) {
      content.offer = this.peerConn.localDescription?.toJSON();
    } else {
      content.description = this.peerConn.localDescription?.toJSON();
    }
    content.capabilities = {
      "m.call.transferee": this.client.supportsCallTransfer,
      "m.call.dtmf": false
    };
    content[_callEventTypes.SDPStreamMetadataKey] = this.getLocalSDPStreamMetadata(true);

    // Get rid of any candidates waiting to be sent: they'll be included in the local
    // description we just got and will send in the offer.
    const discardCount = this.discardDuplicateCandidates();
    _logger.logger.info(`Call ${this.callId} gotLocalOffer() discarding ${discardCount} candidates that will be sent in offer`);
    try {
      await this.sendVoipEvent(eventType, content);
    } catch (error) {
      _logger.logger.error(`Call ${this.callId} gotLocalOffer() failed to send invite`, error);
      if (error instanceof _httpApi.MatrixError && error.event) this.client.cancelPendingEvent(error.event);
      let code = CallErrorCode.SignallingFailed;
      let message = "Signalling failed";
      if (this.state === CallState.CreateOffer) {
        code = CallErrorCode.SendInvite;
        message = "Failed to send invite";
      }
      if (error.name == "UnknownDeviceError") {
        code = CallErrorCode.UnknownDevices;
        message = "Unknown devices present in the room";
      }
      this.emit(CallEvent.Error, new CallError(code, message, error), this);
      this.terminate(CallParty.Local, code, false);

      // no need to carry on & send the candidate queue, but we also
      // don't want to rethrow the error
      return;
    }
    this.sendCandidateQueue();
    if (this.state === CallState.CreateOffer) {
      this.inviteOrAnswerSent = true;
      this.state = CallState.InviteSent;
      this.inviteTimeout = setTimeout(() => {
        this.inviteTimeout = undefined;
        if (this.state === CallState.InviteSent) {
          this.hangup(CallErrorCode.InviteTimeout, false);
        }
      }, CALL_TIMEOUT_MS);
    }
  }
  /**
   * This method removes all video/rtx codecs from screensharing video
   * transceivers. This is necessary since they can cause problems. Without
   * this the following steps should produce an error:
   *   Chromium calls Firefox
   *   Firefox answers
   *   Firefox starts screen-sharing
   *   Chromium starts screen-sharing
   *   Call crashes for Chromium with:
   *       [96685:23:0518/162603.933321:ERROR:webrtc_video_engine.cc(3296)] RTX codec (PT=97) mapped to PT=96 which is not in the codec list.
   *       [96685:23:0518/162603.933377:ERROR:webrtc_video_engine.cc(1171)] GetChangedRecvParameters called without any video codecs.
   *       [96685:23:0518/162603.933430:ERROR:sdp_offer_answer.cc(4302)] Failed to set local video description recv parameters for m-section with mid='2'. (INVALID_PARAMETER)
   */
  getRidOfRTXCodecs() {
    // RTCRtpReceiver.getCapabilities and RTCRtpSender.getCapabilities don't seem to be supported on FF before v113
    if (!RTCRtpReceiver.getCapabilities || !RTCRtpSender.getCapabilities) return;
    const recvCodecs = RTCRtpReceiver.getCapabilities("video").codecs;
    const sendCodecs = RTCRtpSender.getCapabilities("video").codecs;
    const codecs = [...sendCodecs, ...recvCodecs];
    for (const codec of codecs) {
      if (codec.mimeType === "video/rtx") {
        const rtxCodecIndex = codecs.indexOf(codec);
        codecs.splice(rtxCodecIndex, 1);
      }
    }
    const screenshareVideoTransceiver = this.transceivers.get(getTransceiverKey(_callEventTypes.SDPStreamMetadataPurpose.Screenshare, "video"));
    // setCodecPreferences isn't supported on FF (as of v113)
    screenshareVideoTransceiver?.setCodecPreferences?.(codecs);
  }
  /**
   * @internal
   */
  async sendVoipEvent(eventType, content) {
    const realContent = Object.assign({}, content, {
      version: VOIP_PROTO_VERSION,
      call_id: this.callId,
      party_id: this.ourPartyId,
      conf_id: this.groupCallId
    });
    if (this.opponentDeviceId) {
      const toDeviceSeq = this.toDeviceSeq++;
      const content = _objectSpread(_objectSpread({}, realContent), {}, {
        device_id: this.client.deviceId,
        sender_session_id: this.client.getSessionId(),
        dest_session_id: this.opponentSessionId,
        seq: toDeviceSeq,
        [_event.ToDeviceMessageId]: (0, _uuid.v4)()
      });
      this.emit(CallEvent.SendVoipEvent, {
        type: "toDevice",
        eventType,
        userId: this.invitee || this.getOpponentMember()?.userId,
        opponentDeviceId: this.opponentDeviceId,
        content
      }, this);
      const userId = this.invitee || this.getOpponentMember().userId;
      if (this.client.getUseE2eForGroupCall()) {
        if (!this.opponentDeviceInfo) {
          _logger.logger.warn(`Call ${this.callId} sendVoipEvent() failed: we do not have opponentDeviceInfo`);
          return;
        }
        await this.client.encryptAndSendToDevices([{
          userId,
          deviceInfo: this.opponentDeviceInfo
        }], {
          type: eventType,
          content
        });
      } else {
        await this.client.sendToDevice(eventType, new Map([[userId, new Map([[this.opponentDeviceId, content]])]]));
      }
    } else {
      this.emit(CallEvent.SendVoipEvent, {
        type: "sendEvent",
        eventType,
        roomId: this.roomId,
        content: realContent,
        userId: this.invitee || this.getOpponentMember()?.userId
      }, this);
      await this.client.sendEvent(this.roomId, eventType, realContent);
    }
  }

  /**
   * Queue a candidate to be sent
   * @param content - The candidate to queue up, or null if candidates have finished being generated
   *                and end-of-candidates should be signalled
   */
  queueCandidate(content) {
    // We partially de-trickle candidates by waiting for `delay` before sending them
    // amalgamated, in order to avoid sending too many m.call.candidates events and hitting
    // rate limits in Matrix.
    // In practice, it'd be better to remove rate limits for m.call.*

    // N.B. this deliberately lets you queue and send blank candidates, which MSC2746
    // currently proposes as the way to indicate that candidate gathering is complete.
    // This will hopefully be changed to an explicit rather than implicit notification
    // shortly.
    if (content) {
      this.candidateSendQueue.push(content);
    } else {
      this.candidatesEnded = true;
    }

    // Don't send the ICE candidates yet if the call is in the ringing state: this
    // means we tried to pick (ie. started generating candidates) and then failed to
    // send the answer and went back to the ringing state. Queue up the candidates
    // to send if we successfully send the answer.
    // Equally don't send if we haven't yet sent the answer because we can send the
    // first batch of candidates along with the answer
    if (this.state === CallState.Ringing || !this.inviteOrAnswerSent) return;

    // MSC2746 recommends these values (can be quite long when calling because the
    // callee will need a while to answer the call)
    const delay = this.direction === CallDirection.Inbound ? 500 : 2000;
    if (this.candidateSendTries === 0) {
      setTimeout(() => {
        this.sendCandidateQueue();
      }, delay);
    }
  }

  // Discard all non-end-of-candidates messages
  // Return the number of candidate messages that were discarded.
  // Call this method before sending an invite or answer message
  discardDuplicateCandidates() {
    let discardCount = 0;
    const newQueue = [];
    for (let i = 0; i < this.candidateSendQueue.length; i++) {
      const candidate = this.candidateSendQueue[i];
      if (candidate.candidate === "") {
        newQueue.push(candidate);
      } else {
        discardCount++;
      }
    }
    this.candidateSendQueue = newQueue;
    return discardCount;
  }

  /*
   * Transfers this call to another user
   */
  async transfer(targetUserId) {
    // Fetch the target user's global profile info: their room avatar / displayname
    // could be different in whatever room we share with them.
    const profileInfo = await this.client.getProfileInfo(targetUserId);
    const replacementId = genCallID();
    const body = {
      replacement_id: genCallID(),
      target_user: {
        id: targetUserId,
        display_name: profileInfo.displayname,
        avatar_url: profileInfo.avatar_url
      },
      create_call: replacementId
    };
    await this.sendVoipEvent(_event.EventType.CallReplaces, body);
    await this.terminate(CallParty.Local, CallErrorCode.Transferred, true);
  }

  /*
   * Transfers this call to the target call, effectively 'joining' the
   * two calls (so the remote parties on each call are connected together).
   */
  async transferToCall(transferTargetCall) {
    const targetUserId = transferTargetCall.getOpponentMember()?.userId;
    const targetProfileInfo = targetUserId ? await this.client.getProfileInfo(targetUserId) : undefined;
    const opponentUserId = this.getOpponentMember()?.userId;
    const transfereeProfileInfo = opponentUserId ? await this.client.getProfileInfo(opponentUserId) : undefined;
    const newCallId = genCallID();
    const bodyToTransferTarget = {
      // the replacements on each side have their own ID, and it's distinct from the
      // ID of the new call (but we can use the same function to generate it)
      replacement_id: genCallID(),
      target_user: {
        id: opponentUserId,
        display_name: transfereeProfileInfo?.displayname,
        avatar_url: transfereeProfileInfo?.avatar_url
      },
      await_call: newCallId
    };
    await transferTargetCall.sendVoipEvent(_event.EventType.CallReplaces, bodyToTransferTarget);
    const bodyToTransferee = {
      replacement_id: genCallID(),
      target_user: {
        id: targetUserId,
        display_name: targetProfileInfo?.displayname,
        avatar_url: targetProfileInfo?.avatar_url
      },
      create_call: newCallId
    };
    await this.sendVoipEvent(_event.EventType.CallReplaces, bodyToTransferee);
    await this.terminate(CallParty.Local, CallErrorCode.Transferred, true);
    await transferTargetCall.terminate(CallParty.Local, CallErrorCode.Transferred, true);
  }
  async terminate(hangupParty, hangupReason, shouldEmit) {
    if (this.callHasEnded()) return;
    this.hangupParty = hangupParty;
    this.hangupReason = hangupReason;
    this.state = CallState.Ended;
    if (this.inviteTimeout) {
      clearTimeout(this.inviteTimeout);
      this.inviteTimeout = undefined;
    }
    if (this.iceDisconnectedTimeout !== undefined) {
      clearTimeout(this.iceDisconnectedTimeout);
      this.iceDisconnectedTimeout = undefined;
    }
    if (this.callLengthInterval) {
      clearInterval(this.callLengthInterval);
      this.callLengthInterval = undefined;
    }
    if (this.stopVideoTrackTimer !== undefined) {
      clearTimeout(this.stopVideoTrackTimer);
      this.stopVideoTrackTimer = undefined;
    }
    for (const [stream, listener] of this.removeTrackListeners) {
      stream.removeEventListener("removetrack", listener);
    }
    this.removeTrackListeners.clear();
    this.callStatsAtEnd = await this.collectCallStats();

    // Order is important here: first we stopAllMedia() and only then we can deleteAllFeeds()
    this.stopAllMedia();
    this.deleteAllFeeds();
    if (this.peerConn && this.peerConn.signalingState !== "closed") {
      this.peerConn.close();
    }
    this.stats?.removeStatsReportGatherer(this.callId);
    if (shouldEmit) {
      this.emit(CallEvent.Hangup, this);
    }
    this.client.callEventHandler.calls.delete(this.callId);
  }
  stopAllMedia() {
    _logger.logger.debug(`Call ${this.callId} stopAllMedia() running`);
    for (const feed of this.feeds) {
      // Slightly awkward as local feed need to go via the correct method on
      // the MediaHandler so they get removed from MediaHandler (remote tracks
      // don't)
      // NB. We clone local streams when passing them to individual calls in a group
      // call, so we can (and should) stop the clones once we no longer need them:
      // the other clones will continue fine.
      if (feed.isLocal() && feed.purpose === _callEventTypes.SDPStreamMetadataPurpose.Usermedia) {
        this.client.getMediaHandler().stopUserMediaStream(feed.stream);
      } else if (feed.isLocal() && feed.purpose === _callEventTypes.SDPStreamMetadataPurpose.Screenshare) {
        this.client.getMediaHandler().stopScreensharingStream(feed.stream);
      } else if (!feed.isLocal()) {
        _logger.logger.debug(`Call ${this.callId} stopAllMedia() stopping stream (streamId=${feed.stream.id})`);
        for (const track of feed.stream.getTracks()) {
          track.stop();
        }
      }
    }
  }
  checkForErrorListener() {
    if (this.listeners(_typedEventEmitter.EventEmitterEvents.Error).length === 0) {
      throw new Error("You MUST attach an error listener using call.on('error', function() {})");
    }
  }
  async sendCandidateQueue() {
    if (this.candidateSendQueue.length === 0 || this.callHasEnded()) {
      return;
    }
    const candidates = this.candidateSendQueue;
    this.candidateSendQueue = [];
    ++this.candidateSendTries;
    const content = {
      candidates: candidates.map(candidate => candidate.toJSON())
    };
    if (this.candidatesEnded) {
      // If there are no more candidates, signal this by adding an empty string candidate
      content.candidates.push({
        candidate: ""
      });
    }
    _logger.logger.debug(`Call ${this.callId} sendCandidateQueue() attempting to send ${candidates.length} candidates`);
    try {
      await this.sendVoipEvent(_event.EventType.CallCandidates, content);
      // reset our retry count if we have successfully sent our candidates
      // otherwise queueCandidate() will refuse to try to flush the queue
      this.candidateSendTries = 0;

      // Try to send candidates again just in case we received more candidates while sending.
      this.sendCandidateQueue();
    } catch (error) {
      // don't retry this event: we'll send another one later as we might
      // have more candidates by then.
      if (error instanceof _httpApi.MatrixError && error.event) this.client.cancelPendingEvent(error.event);

      // put all the candidates we failed to send back in the queue
      this.candidateSendQueue.push(...candidates);
      if (this.candidateSendTries > 5) {
        _logger.logger.debug(`Call ${this.callId} sendCandidateQueue() failed to send candidates on attempt ${this.candidateSendTries}. Giving up on this call.`, error);
        const code = CallErrorCode.SignallingFailed;
        const message = "Signalling failed";
        this.emit(CallEvent.Error, new CallError(code, message, error), this);
        this.hangup(code, false);
        return;
      }
      const delayMs = 500 * Math.pow(2, this.candidateSendTries);
      ++this.candidateSendTries;
      _logger.logger.debug(`Call ${this.callId} sendCandidateQueue() failed to send candidates. Retrying in ${delayMs}ms`, error);
      setTimeout(() => {
        this.sendCandidateQueue();
      }, delayMs);
    }
  }

  /**
   * Place a call to this room.
   * @throws if you have not specified a listener for 'error' events.
   * @throws if have passed audio=false.
   */
  async placeCall(audio, video) {
    if (!audio) {
      throw new Error("You CANNOT start a call without audio");
    }
    this.state = CallState.WaitLocalMedia;
    let callFeed;
    try {
      const stream = await this.client.getMediaHandler().getUserMediaStream(audio, video);

      // make sure all the tracks are enabled (same as pushNewLocalFeed -
      // we probably ought to just have one code path for adding streams)
      setTracksEnabled(stream.getAudioTracks(), true);
      setTracksEnabled(stream.getVideoTracks(), true);
      callFeed = new _callFeed.CallFeed({
        client: this.client,
        roomId: this.roomId,
        userId: this.client.getUserId(),
        deviceId: this.client.getDeviceId() ?? undefined,
        stream,
        purpose: _callEventTypes.SDPStreamMetadataPurpose.Usermedia,
        audioMuted: false,
        videoMuted: false
      });
    } catch (e) {
      this.getUserMediaFailed(e);
      return;
    }
    try {
      await this.placeCallWithCallFeeds([callFeed]);
    } catch (e) {
      this.placeCallFailed(e);
      return;
    }
  }

  /**
   * Place a call to this room with call feed.
   * @param callFeeds - to use
   * @throws if you have not specified a listener for 'error' events.
   * @throws if have passed audio=false.
   */
  async placeCallWithCallFeeds(callFeeds, requestScreenshareFeed = false) {
    this.checkForErrorListener();
    this.direction = CallDirection.Outbound;
    await this.initOpponentCrypto();

    // XXX Find a better way to do this
    this.client.callEventHandler.calls.set(this.callId, this);

    // make sure we have valid turn creds. Unless something's gone wrong, it should
    // poll and keep the credentials valid so this should be instant.
    const haveTurnCreds = await this.client.checkTurnServers();
    if (!haveTurnCreds) {
      _logger.logger.warn(`Call ${this.callId} placeCallWithCallFeeds() failed to get TURN credentials! Proceeding with call anyway...`);
    }

    // create the peer connection now so it can be gathering candidates while we get user
    // media (assuming a candidate pool size is configured)
    this.peerConn = this.createPeerConnection();
    this.emit(CallEvent.PeerConnectionCreated, this.peerConn, this);
    this.gotCallFeedsForInvite(callFeeds, requestScreenshareFeed);
  }
  createPeerConnection() {
    const pc = new window.RTCPeerConnection({
      iceTransportPolicy: this.forceTURN ? "relay" : undefined,
      iceServers: this.turnServers.length ? this.turnServers : undefined,
      iceCandidatePoolSize: this.client.iceCandidatePoolSize,
      bundlePolicy: "max-bundle"
    });

    // 'connectionstatechange' would be better, but firefox doesn't implement that.
    pc.addEventListener("iceconnectionstatechange", this.onIceConnectionStateChanged);
    pc.addEventListener("signalingstatechange", this.onSignallingStateChanged);
    pc.addEventListener("icecandidate", this.gotLocalIceCandidate);
    pc.addEventListener("icegatheringstatechange", this.onIceGatheringStateChange);
    pc.addEventListener("track", this.onTrack);
    pc.addEventListener("negotiationneeded", this.onNegotiationNeeded);
    pc.addEventListener("datachannel", this.onDataChannel);
    const opponentMember = this.getOpponentMember();
    const opponentMemberId = opponentMember ? opponentMember.userId : "unknown";
    this.stats?.addStatsReportGatherer(this.callId, opponentMemberId, pc);
    return pc;
  }
  partyIdMatches(msg) {
    // They must either match or both be absent (in which case opponentPartyId will be null)
    // Also we ignore party IDs on the invite/offer if the version is 0, so we must do the same
    // here and use null if the version is 0 (woe betide any opponent sending messages in the
    // same call with different versions)
    const msgPartyId = msg.version === 0 ? null : msg.party_id || null;
    return msgPartyId === this.opponentPartyId;
  }

  // Commits to an opponent for the call
  // ev: An invite or answer event
  chooseOpponent(ev) {
    // I choo-choo-choose you
    const msg = ev.getContent();
    _logger.logger.debug(`Call ${this.callId} chooseOpponent() running (partyId=${msg.party_id})`);
    this.opponentVersion = msg.version;
    if (this.opponentVersion === 0) {
      // set to null to indicate that we've chosen an opponent, but because
      // they're v0 they have no party ID (even if they sent one, we're ignoring it)
      this.opponentPartyId = null;
    } else {
      // set to their party ID, or if they're naughty and didn't send one despite
      // not being v0, set it to null to indicate we picked an opponent with no
      // party ID
      this.opponentPartyId = msg.party_id || null;
    }
    this.opponentCaps = msg.capabilities || {};
    this.opponentMember = this.client.getRoom(this.roomId).getMember(ev.getSender()) ?? undefined;
    if (this.opponentMember) {
      this.stats?.updateOpponentMember(this.callId, this.opponentMember.userId);
    }
  }
  async addBufferedIceCandidates() {
    const bufferedCandidates = this.remoteCandidateBuffer.get(this.opponentPartyId);
    if (bufferedCandidates) {
      _logger.logger.info(`Call ${this.callId} addBufferedIceCandidates() adding ${bufferedCandidates.length} buffered candidates for opponent ${this.opponentPartyId}`);
      await this.addIceCandidates(bufferedCandidates);
    }
    this.remoteCandidateBuffer.clear();
  }
  async addIceCandidates(candidates) {
    for (const candidate of candidates) {
      if ((candidate.sdpMid === null || candidate.sdpMid === undefined) && (candidate.sdpMLineIndex === null || candidate.sdpMLineIndex === undefined)) {
        _logger.logger.debug(`Call ${this.callId} addIceCandidates() got remote ICE end-of-candidates`);
      } else {
        _logger.logger.debug(`Call ${this.callId} addIceCandidates() got remote ICE candidate (sdpMid=${candidate.sdpMid}, candidate=${candidate.candidate})`);
      }
      try {
        await this.peerConn.addIceCandidate(candidate);
      } catch (err) {
        if (!this.ignoreOffer) {
          _logger.logger.info(`Call ${this.callId} addIceCandidates() failed to add remote ICE candidate`, err);
        } else {
          _logger.logger.debug(`Call ${this.callId} addIceCandidates() failed to add remote ICE candidate because ignoring offer`, err);
        }
      }
    }
  }
  get hasPeerConnection() {
    return Boolean(this.peerConn);
  }
  initStats(stats, peerId = "unknown") {
    this.stats = stats;
    this.stats.start();
  }
}
exports.MatrixCall = MatrixCall;
function setTracksEnabled(tracks, enabled) {
  for (const track of tracks) {
    track.enabled = enabled;
  }
}
function supportsMatrixCall() {
  // typeof prevents Node from erroring on an undefined reference
  if (typeof window === "undefined" || typeof document === "undefined") {
    // NB. We don't log here as apps try to create a call object as a test for
    // whether calls are supported, so we shouldn't fill the logs up.
    return false;
  }

  // Firefox throws on so little as accessing the RTCPeerConnection when operating in a secure mode.
  // There's some information at https://bugzilla.mozilla.org/show_bug.cgi?id=1542616 though the concern
  // is that the browser throwing a SecurityError will brick the client creation process.
  try {
    const supported = Boolean(window.RTCPeerConnection || window.RTCSessionDescription || window.RTCIceCandidate || navigator.mediaDevices);
    if (!supported) {
      /* istanbul ignore if */ // Adds a lot of noise to test runs, so disable logging there.
      if (process.env.NODE_ENV !== "test") {
        _logger.logger.error("WebRTC is not supported in this browser / environment");
      }
      return false;
    }
  } catch (e) {
    _logger.logger.error("Exception thrown when trying to access WebRTC", e);
    return false;
  }
  return true;
}

/**
 * DEPRECATED
 * Use client.createCall()
 *
 * Create a new Matrix call for the browser.
 * @param client - The client instance to use.
 * @param roomId - The room the call is in.
 * @param options - DEPRECATED optional options map.
 * @returns the call or null if the browser doesn't support calling.
 */
function createNewMatrixCall(client, roomId, options) {
  if (!supportsMatrixCall()) return null;
  const optionsForceTURN = options ? options.forceTURN : false;
  const opts = {
    client: client,
    roomId: roomId,
    invitee: options?.invitee,
    turnServers: client.getTurnServers(),
    // call level options
    forceTURN: client.forceTURN || optionsForceTURN,
    opponentDeviceId: options?.opponentDeviceId,
    opponentSessionId: options?.opponentSessionId,
    groupCallId: options?.groupCallId
  };
  const call = new MatrixCall(opts);
  client.reEmitter.reEmit(call, Object.values(CallEvent));
  return call;
}