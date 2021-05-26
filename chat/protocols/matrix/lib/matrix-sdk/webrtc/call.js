"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getDesktopCapturerSources = getDesktopCapturerSources;
exports.setAudioInput = setAudioInput;
exports.setVideoInput = setVideoInput;
exports.createNewMatrixCall = createNewMatrixCall;
exports.MatrixCall = exports.CallError = exports.CallErrorCode = exports.CallEvent = exports.CallParty = exports.CallDirection = exports.CallType = exports.CallState = void 0;

var _logger = require("../logger");

var _events = require("events");

var utils = _interopRequireWildcard(require("../utils"));

var _event = require("../@types/event");

var _randomstring = require("../randomstring");

var _callEventTypes = require("./callEventTypes");

var _callFeed = require("./callFeed");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

let CallState;
exports.CallState = CallState;

(function (CallState) {
  CallState["Fledgling"] = "fledgling";
  CallState["InviteSent"] = "invite_sent";
  CallState["WaitLocalMedia"] = "wait_local_media";
  CallState["CreateOffer"] = "create_offer";
  CallState["CreateAnswer"] = "create_answer";
  CallState["Connecting"] = "connecting";
  CallState["Connected"] = "connected";
  CallState["Ringing"] = "ringing";
  CallState["Ended"] = "ended";
})(CallState || (exports.CallState = CallState = {}));

let CallType;
exports.CallType = CallType;

(function (CallType) {
  CallType["Voice"] = "voice";
  CallType["Video"] = "video";
})(CallType || (exports.CallType = CallType = {}));

let CallDirection;
exports.CallDirection = CallDirection;

(function (CallDirection) {
  CallDirection["Inbound"] = "inbound";
  CallDirection["Outbound"] = "outbound";
})(CallDirection || (exports.CallDirection = CallDirection = {}));

let CallParty;
exports.CallParty = CallParty;

(function (CallParty) {
  CallParty["Local"] = "local";
  CallParty["Remote"] = "remote";
})(CallParty || (exports.CallParty = CallParty = {}));

let CallEvent;
exports.CallEvent = CallEvent;

(function (CallEvent) {
  CallEvent["Hangup"] = "hangup";
  CallEvent["State"] = "state";
  CallEvent["Error"] = "error";
  CallEvent["Replaced"] = "replaced";
  CallEvent["LocalHoldUnhold"] = "local_hold_unhold";
  CallEvent["RemoteHoldUnhold"] = "remote_hold_unhold";
  CallEvent["HoldUnhold"] = "hold_unhold";
  CallEvent["FeedsChanged"] = "feeds_changed";
  CallEvent["AssertedIdentityChanged"] = "asserted_identity_changed";
})(CallEvent || (exports.CallEvent = CallEvent = {}));

let CallErrorCode;
exports.CallErrorCode = CallErrorCode;

(function (CallErrorCode) {
  CallErrorCode["UserHangup"] = "user_hangup";
  CallErrorCode["LocalOfferFailed"] = "local_offer_failed";
  CallErrorCode["NoUserMedia"] = "no_user_media";
  CallErrorCode["UnknownDevices"] = "unknown_devices";
  CallErrorCode["SendInvite"] = "send_invite";
  CallErrorCode["CreateAnswer"] = "create_answer";
  CallErrorCode["SendAnswer"] = "send_answer";
  CallErrorCode["SetRemoteDescription"] = "set_remote_description";
  CallErrorCode["SetLocalDescription"] = "set_local_description";
  CallErrorCode["AnsweredElsewhere"] = "answered_elsewhere";
  CallErrorCode["IceFailed"] = "ice_failed";
  CallErrorCode["InviteTimeout"] = "invite_timeout";
  CallErrorCode["Replaced"] = "replaced";
  CallErrorCode["SignallingFailed"] = "signalling_timeout";
})(CallErrorCode || (exports.CallErrorCode = CallErrorCode = {}));

var ConstraintsType;
/**
 * The version field that we set in m.call.* events
 */

(function (ConstraintsType) {
  ConstraintsType["Audio"] = "audio";
  ConstraintsType["Video"] = "video";
})(ConstraintsType || (ConstraintsType = {}));

const VOIP_PROTO_VERSION = 1;
/** The fallback ICE server to use for STUN or TURN protocols. */

const FALLBACK_ICE_SERVER = 'stun:turn.matrix.org';
/** The length of time a call can be ringing for. */

const CALL_TIMEOUT_MS = 60000;
/** Retrieves sources from desktopCapturer */

function getDesktopCapturerSources() {
  const options = {
    thumbnailSize: {
      height: 176,
      width: 312
    },
    types: ["screen", "window"]
  };
  return window.electron.getDesktopCapturerSources(options);
}

class CallError extends Error {
  constructor(code, msg, err) {
    // Stil ldon't think there's any way to have proper nested errors
    super(msg + ": " + err);

    _defineProperty(this, "code", void 0);

    this.code = code;
  }

}

exports.CallError = CallError;

function genCallID() {
  return Date.now().toString() + (0, _randomstring.randomString)(16);
}
/**
 * Construct a new Matrix Call.
 * @constructor
 * @param {Object} opts Config options.
 * @param {string} opts.roomId The room ID for this call.
 * @param {Object} opts.webRtc The WebRTC globals from the browser.
 * @param {boolean} opts.forceTURN whether relay through TURN should be forced.
 * @param {Object} opts.URL The URL global.
 * @param {Array<Object>} opts.turnServers Optional. A list of TURN servers.
 * @param {MatrixClient} opts.client The Matrix Client instance to send events to.
 */


class MatrixCall extends _events.EventEmitter {
  // Fix when client is TSified
  // XXX: I don't know why this is called 'config'.
  // The party ID of the other side: undefined if we haven't chosen a partner
  // yet, null if we have but they didn't send a party ID.
  // in the browser it's 'number'
  // The logic of when & if a call is on hold is nontrivial and explained in is*OnHold
  // This flag represents whether we want the other party to be on hold
  // and this one we set when we're transitioning out of the hold state because we
  // can't tell the difference between that and the other party holding us
  // the stats for the call at the point it ended. We can't get these after we
  // tear the call down, so we just grab a snapshot before we stop the call.
  // The typescript definitions have this type as 'any' :(
  // Perfect negotiation state: https://www.w3.org/TR/webrtc/#perfect-negotiation-example
  // If candidates arrive before we've picked an opponent (which, in particular,
  // will happen if the opponent sends candidates eagerly before the user answers
  // the call) we buffer them up here so we can then add the ones from the party we pick
  constructor(opts) {
    super();

    _defineProperty(this, "roomId", void 0);

    _defineProperty(this, "type", void 0);

    _defineProperty(this, "callId", void 0);

    _defineProperty(this, "state", void 0);

    _defineProperty(this, "hangupParty", void 0);

    _defineProperty(this, "hangupReason", void 0);

    _defineProperty(this, "direction", void 0);

    _defineProperty(this, "ourPartyId", void 0);

    _defineProperty(this, "client", void 0);

    _defineProperty(this, "forceTURN", void 0);

    _defineProperty(this, "turnServers", void 0);

    _defineProperty(this, "candidateSendQueue", void 0);

    _defineProperty(this, "candidateSendTries", void 0);

    _defineProperty(this, "sentEndOfCandidates", void 0);

    _defineProperty(this, "peerConn", void 0);

    _defineProperty(this, "feeds", void 0);

    _defineProperty(this, "screenSharingStream", void 0);

    _defineProperty(this, "localAVStream", void 0);

    _defineProperty(this, "inviteOrAnswerSent", void 0);

    _defineProperty(this, "waitForLocalAVStream", void 0);

    _defineProperty(this, "config", void 0);

    _defineProperty(this, "successor", void 0);

    _defineProperty(this, "opponentMember", void 0);

    _defineProperty(this, "opponentVersion", void 0);

    _defineProperty(this, "opponentPartyId", void 0);

    _defineProperty(this, "opponentCaps", void 0);

    _defineProperty(this, "inviteTimeout", void 0);

    _defineProperty(this, "remoteOnHold", void 0);

    _defineProperty(this, "unholdingRemote", void 0);

    _defineProperty(this, "micMuted", void 0);

    _defineProperty(this, "vidMuted", void 0);

    _defineProperty(this, "callStatsAtEnd", void 0);

    _defineProperty(this, "makingOffer", void 0);

    _defineProperty(this, "ignoreOffer", void 0);

    _defineProperty(this, "remoteCandidateBuffer", new Map());

    _defineProperty(this, "remoteAssertedIdentity", void 0);

    _defineProperty(this, "gotUserMediaForInvite", async stream => {
      if (this.successor) {
        this.successor.gotUserMediaForAnswer(stream);
        return;
      }

      if (this.callHasEnded()) {
        this.stopAllMedia();
        return;
      }

      this.localAVStream = stream;

      _logger.logger.info("Got local AV stream with id " + this.localAVStream.id);

      this.setState(CallState.CreateOffer);

      _logger.logger.debug("gotUserMediaForInvite -> " + this.type);

      if (this.screenSharingStream) {
        _logger.logger.debug("Setting screen sharing stream to the local video element");

        this.pushNewFeed(this.screenSharingStream, this.client.getUserId(), _callEventTypes.SDPStreamMetadataPurpose.Screenshare);
      } else {
        this.pushNewFeed(stream, this.client.getUserId(), _callEventTypes.SDPStreamMetadataPurpose.Usermedia);
      } // why do we enable audio (and only audio) tracks here? -- matthew


      setTracksEnabled(stream.getAudioTracks(), true);

      for (const audioTrack of stream.getAudioTracks()) {
        _logger.logger.info("Adding audio track with id " + audioTrack.id);

        this.peerConn.addTrack(audioTrack, stream);
      }

      for (const videoTrack of (this.screenSharingStream || stream).getVideoTracks()) {
        _logger.logger.info("Adding video track with id " + videoTrack.id);

        this.peerConn.addTrack(videoTrack, stream);
      } // Now we wait for the negotiationneeded event

    });

    _defineProperty(this, "gotUserMediaForAnswer", async stream => {
      if (this.callHasEnded()) {
        return;
      }

      this.pushNewFeed(stream, this.client.getUserId(), _callEventTypes.SDPStreamMetadataPurpose.Usermedia);
      this.localAVStream = stream;

      _logger.logger.info("Got local AV stream with id " + this.localAVStream.id);

      setTracksEnabled(stream.getAudioTracks(), true);

      for (const track of stream.getTracks()) {
        this.peerConn.addTrack(track, stream);
      }

      this.setState(CallState.CreateAnswer);
      let myAnswer;

      try {
        myAnswer = await this.peerConn.createAnswer();
      } catch (err) {
        _logger.logger.debug("Failed to create answer: ", err);

        this.terminate(CallParty.Local, CallErrorCode.CreateAnswer, true);
        return;
      }

      try {
        await this.peerConn.setLocalDescription(myAnswer);
        this.setState(CallState.Connecting); // Allow a short time for initial candidates to be gathered

        await new Promise(resolve => {
          setTimeout(resolve, 200);
        });
        this.sendAnswer();
      } catch (err) {
        _logger.logger.debug("Error setting local description!", err);

        this.terminate(CallParty.Local, CallErrorCode.SetLocalDescription, true);
        return;
      }
    });

    _defineProperty(this, "gotLocalIceCandidate", event => {
      if (event.candidate) {
        _logger.logger.debug("Call " + this.callId + " got local ICE " + event.candidate.sdpMid + " candidate: " + event.candidate.candidate);

        if (this.callHasEnded()) return; // As with the offer, note we need to make a copy of this object, not
        // pass the original: that broke in Chrome ~m43.

        if (event.candidate.candidate !== '' || !this.sentEndOfCandidates) {
          this.queueCandidate(event.candidate);
          if (event.candidate.candidate === '') this.sentEndOfCandidates = true;
        }
      }
    });

    _defineProperty(this, "onIceGatheringStateChange", event => {
      _logger.logger.debug("ice gathering state changed to " + this.peerConn.iceGatheringState);

      if (this.peerConn.iceGatheringState === 'complete' && !this.sentEndOfCandidates) {
        // If we didn't get an empty-string candidate to signal the end of candidates,
        // create one ourselves now gathering has finished.
        // We cast because the interface lists all the properties as required but we
        // only want to send 'candidate'
        // XXX: We probably want to send either sdpMid or sdpMLineIndex, as it's not strictly
        // correct to have a candidate that lacks both of these. We'd have to figure out what
        // previous candidates had been sent with and copy them.
        const c = {
          candidate: ''
        };
        this.queueCandidate(c);
        this.sentEndOfCandidates = true;
      }
    });

    _defineProperty(this, "gotLocalOffer", async description => {
      _logger.logger.debug("Created offer: ", description);

      if (this.callHasEnded()) {
        _logger.logger.debug("Ignoring newly created offer on call ID " + this.callId + " because the call has ended");

        return;
      }

      try {
        await this.peerConn.setLocalDescription(description);
      } catch (err) {
        _logger.logger.debug("Error setting local description!", err);

        this.terminate(CallParty.Local, CallErrorCode.SetLocalDescription, true);
        return;
      }

      if (this.peerConn.iceGatheringState === 'gathering') {
        // Allow a short time for initial candidates to be gathered
        await new Promise(resolve => {
          setTimeout(resolve, 200);
        });
      }

      if (this.callHasEnded()) return;
      const eventType = this.state === CallState.CreateOffer ? _event.EventType.CallInvite : _event.EventType.CallNegotiate;
      const content = {
        lifetime: CALL_TIMEOUT_MS
      }; // clunky because TypeScript can't folow the types through if we use an expression as the key

      if (this.state === CallState.CreateOffer) {
        content.offer = this.peerConn.localDescription;
      } else {
        content.description = this.peerConn.localDescription;
      }

      if (this.client._supportsCallTransfer) {
        content.capabilities = {
          'm.call.transferee': true
        };
      } // Get rid of any candidates waiting to be sent: they'll be included in the local
      // description we just got and will send in the offer.


      _logger.logger.info(`Discarding ${this.candidateSendQueue.length} candidates that will be sent in offer`);

      this.candidateSendQueue = [];

      try {
        await this.sendVoipEvent(eventType, content);
      } catch (error) {
        _logger.logger.error("Failed to send invite", error);

        if (error.event) this.client.cancelPendingEvent(error.event);
        let code = CallErrorCode.SignallingFailed;
        let message = "Signalling failed";

        if (this.state === CallState.CreateOffer) {
          code = CallErrorCode.SendInvite;
          message = "Failed to send invite";
        }

        if (error.name == 'UnknownDeviceError') {
          code = CallErrorCode.UnknownDevices;
          message = "Unknown devices present in the room";
        }

        this.emit(CallEvent.Error, new CallError(code, message, error));
        this.terminate(CallParty.Local, code, false); // no need to carry on & send the candidate queue, but we also
        // don't want to rethrow the error

        return;
      }

      this.sendCandidateQueue();

      if (this.state === CallState.CreateOffer) {
        this.inviteOrAnswerSent = true;
        this.setState(CallState.InviteSent);
        this.inviteTimeout = setTimeout(() => {
          this.inviteTimeout = null;

          if (this.state === CallState.InviteSent) {
            this.hangup(CallErrorCode.InviteTimeout, false);
          }
        }, CALL_TIMEOUT_MS);
      }
    });

    _defineProperty(this, "getLocalOfferFailed", err => {
      _logger.logger.error("Failed to get local offer", err);

      this.emit(CallEvent.Error, new CallError(CallErrorCode.LocalOfferFailed, "Failed to get local offer!", err));
      this.terminate(CallParty.Local, CallErrorCode.LocalOfferFailed, false);
    });

    _defineProperty(this, "getUserMediaFailed", err => {
      if (this.successor) {
        this.successor.getUserMediaFailed(err);
        return;
      }

      _logger.logger.warn("Failed to get user media - ending call", err);

      this.emit(CallEvent.Error, new CallError(CallErrorCode.NoUserMedia, "Couldn't start capturing media! Is your microphone set up and " + "does this app have permission?", err));
      this.terminate(CallParty.Local, CallErrorCode.NoUserMedia, false);
    });

    _defineProperty(this, "onIceConnectionStateChanged", () => {
      if (this.callHasEnded()) {
        return; // because ICE can still complete as we're ending the call
      }

      _logger.logger.debug("Call ID " + this.callId + ": ICE connection state changed to: " + this.peerConn.iceConnectionState); // ideally we'd consider the call to be connected when we get media but
      // chrome doesn't implement any of the 'onstarted' events yet


      if (this.peerConn.iceConnectionState == 'connected') {
        this.setState(CallState.Connected);
      } else if (this.peerConn.iceConnectionState == 'failed') {
        this.hangup(CallErrorCode.IceFailed, false);
      }
    });

    _defineProperty(this, "onSignallingStateChanged", () => {
      _logger.logger.debug("call " + this.callId + ": Signalling state changed to: " + this.peerConn.signalingState);
    });

    _defineProperty(this, "onTrack", ev => {
      if (ev.streams.length === 0) {
        _logger.logger.warn(`Streamless ${ev.track.kind} found: ignoring.`);

        return;
      }

      const oldRemoteStream = this.feeds.find(feed => {
        return !feed.isLocal();
      })?.stream; // If we already have a stream, check this track is from the same one
      // Note that we check by ID and always set the remote stream: Chrome appears
      // to make new stream objects when tranciever directionality is changed and the 'active'
      // status of streams change - Dave

      if (oldRemoteStream && ev.streams[0].id !== oldRemoteStream.id) {
        _logger.logger.warn(`Ignoring new stream ID ${ev.streams[0].id}: we already have stream ID ${oldRemoteStream.id}`);

        return;
      }

      if (!oldRemoteStream) {
        _logger.logger.info("Got remote stream with id " + ev.streams[0].id);
      }

      const newRemoteStream = ev.streams[0];

      _logger.logger.debug(`Track id ${ev.track.id} of kind ${ev.track.kind} added`);

      this.pushNewFeed(newRemoteStream, this.getOpponentMember().userId, _callEventTypes.SDPStreamMetadataPurpose.Usermedia);

      _logger.logger.info("playing remote. stream active? " + newRemoteStream.active);
    });

    _defineProperty(this, "onNegotiationNeeded", async () => {
      _logger.logger.info("Negotation is needed!");

      if (this.state !== CallState.CreateOffer && this.opponentVersion === 0) {
        _logger.logger.info("Opponent does not support renegotiation: ignoring negotiationneeded event");

        return;
      }

      this.makingOffer = true;

      try {
        const myOffer = await this.peerConn.createOffer();
        await this.gotLocalOffer(myOffer);
      } catch (e) {
        this.getLocalOfferFailed(e);
        return;
      } finally {
        this.makingOffer = false;
      }
    });

    _defineProperty(this, "onHangupReceived", msg => {
      _logger.logger.debug("Hangup received for call ID " + this.callId); // party ID must match (our chosen partner hanging up the call) or be undefined (we haven't chosen
      // a partner yet but we're treating the hangup as a reject as per VoIP v0)


      if (this.partyIdMatches(msg) || this.state === CallState.Ringing) {
        // default reason is user_hangup
        this.terminate(CallParty.Remote, msg.reason || CallErrorCode.UserHangup, true);
      } else {
        _logger.logger.info(`Ignoring message from party ID ${msg.party_id}: our partner is ${this.opponentPartyId}`);
      }
    });

    _defineProperty(this, "onRejectReceived", msg => {
      _logger.logger.debug("Reject received for call ID " + this.callId); // No need to check party_id for reject because if we'd received either
      // an answer or reject, we wouldn't be in state InviteSent


      const shouldTerminate = // reject events also end the call if it's ringing: it's another of
      // our devices rejecting the call.
      [CallState.InviteSent, CallState.Ringing].includes(this.state) || // also if we're in the init state and it's an inbound call, since
      // this means we just haven't entered the ringing state yet
      this.state === CallState.Fledgling && this.direction === CallDirection.Inbound;

      if (shouldTerminate) {
        this.terminate(CallParty.Remote, CallErrorCode.UserHangup, true);
      } else {
        _logger.logger.debug(`Call is in state: ${this.state}: ignoring reject`);
      }
    });

    _defineProperty(this, "onAnsweredElsewhere", msg => {
      _logger.logger.debug("Call ID " + this.callId + " answered elsewhere");

      this.terminate(CallParty.Remote, CallErrorCode.AnsweredElsewhere, true);
    });

    this.roomId = opts.roomId;
    this.client = opts.client;
    this.type = null;
    this.forceTURN = opts.forceTURN;
    this.ourPartyId = this.client.deviceId; // Array of Objects with urls, username, credential keys

    this.turnServers = opts.turnServers || [];

    if (this.turnServers.length === 0 && this.client.isFallbackICEServerAllowed()) {
      this.turnServers.push({
        urls: [FALLBACK_ICE_SERVER]
      });
    }

    for (const server of this.turnServers) {
      utils.checkObjectHasKeys(server, ["urls"]);
    }

    this.callId = genCallID();
    this.state = CallState.Fledgling; // A queue for candidates waiting to go out.
    // We try to amalgamate candidates into a single candidate message where
    // possible

    this.candidateSendQueue = [];
    this.candidateSendTries = 0;
    this.sentEndOfCandidates = false;
    this.inviteOrAnswerSent = false;
    this.makingOffer = false;
    this.remoteOnHold = false;
    this.unholdingRemote = false;
    this.micMuted = false;
    this.vidMuted = false;
    this.feeds = [];
  }
  /**
   * Place a voice call to this room.
   * @throws If you have not specified a listener for 'error' events.
   */


  async placeVoiceCall() {
    _logger.logger.debug("placeVoiceCall");

    this.checkForErrorListener();
    const constraints = getUserMediaContraints(ConstraintsType.Audio);
    this.type = CallType.Voice;
    await this.placeCallWithConstraints(constraints);
  }
  /**
   * Place a video call to this room.
   * @throws If you have not specified a listener for 'error' events.
   */


  async placeVideoCall() {
    _logger.logger.debug("placeVideoCall");

    this.checkForErrorListener();
    const constraints = getUserMediaContraints(ConstraintsType.Video);
    this.type = CallType.Video;
    await this.placeCallWithConstraints(constraints);
  }
  /**
   * Place a screen-sharing call to this room. This includes audio.
   * <b>This method is EXPERIMENTAL and subject to change without warning. It
   * only works in Google Chrome and Firefox >= 44.</b>
   * @throws If you have not specified a listener for 'error' events.
   */


  async placeScreenSharingCall(selectDesktopCapturerSource) {
    _logger.logger.debug("placeScreenSharingCall");

    this.checkForErrorListener();

    try {
      const screenshareConstraints = await getScreenshareContraints(selectDesktopCapturerSource);

      if (!screenshareConstraints) {
        this.terminate(CallParty.Local, CallErrorCode.NoUserMedia, false);
        return;
      }

      if (window.electron?.getDesktopCapturerSources) {
        // We are using Electron
        _logger.logger.debug("Getting screen stream using getUserMedia()...");

        this.screenSharingStream = await navigator.mediaDevices.getUserMedia(screenshareConstraints);
      } else {
        // We are not using Electron
        _logger.logger.debug("Getting screen stream using getDisplayMedia()...");

        this.screenSharingStream = await navigator.mediaDevices.getDisplayMedia(screenshareConstraints);
      }

      _logger.logger.debug("Got screen stream, requesting audio stream...");

      const audioConstraints = getUserMediaContraints(ConstraintsType.Audio);
      this.placeCallWithConstraints(audioConstraints);
    } catch (err) {
      this.emit(CallEvent.Error, new CallError(CallErrorCode.NoUserMedia, "Failed to get screen-sharing stream: ", err));
      this.terminate(CallParty.Local, CallErrorCode.NoUserMedia, false);
    }

    this.type = CallType.Video;
  }

  getOpponentMember() {
    return this.opponentMember;
  }

  opponentCanBeTransferred() {
    return Boolean(this.opponentCaps && this.opponentCaps["m.call.transferee"]);
  }

  getRemoteAssertedIdentity() {
    return this.remoteAssertedIdentity;
  }
  /**
   * Returns an array of all CallFeeds
   * @returns {Array<CallFeed>} CallFeeds
   */


  getFeeds() {
    return this.feeds;
  }
  /**
   * Returns an array of all local CallFeeds
   * @returns {Array<CallFeed>} local CallFeeds
   */


  getLocalFeeds() {
    return this.feeds.filter(feed => {
      return feed.isLocal();
    });
  }
  /**
   * Returns an array of all remote CallFeeds
   * @returns {Array<CallFeed>} remote CallFeeds
   */


  getRemoteFeeds() {
    return this.feeds.filter(feed => {
      return !feed.isLocal();
    });
  }
  /**
   * Returns true if there are no incoming feeds,
   * otherwise returns false
   * @returns {boolean} no incoming feeds
   */


  noIncomingFeeds() {
    return !this.feeds.some(feed => !feed.isLocal());
  }

  pushNewFeed(stream, userId, purpose) {
    // Try to find a feed with the same stream id as the new stream,
    // if we find it replace the old stream with the new one
    const feed = this.feeds.find(feed => feed.stream.id === stream.id);

    if (feed) {
      feed.setNewStream(stream);
    } else {
      this.feeds.push(new _callFeed.CallFeed(stream, userId, purpose, this.client, this.roomId));
      this.emit(CallEvent.FeedsChanged, this.feeds);
    }
  }

  deleteAllFeeds() {
    this.feeds = [];
    this.emit(CallEvent.FeedsChanged, this.feeds);
  } // The typescript definitions have this type as 'any' :(


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

    for (const item of statsReport) {
      stats.push(item[1]);
    }

    return stats;
  }
  /**
   * Configure this call from an invite event. Used by MatrixClient.
   * @param {MatrixEvent} event The m.call.invite event
   */


  async initWithInvite(event) {
    const invite = event.getContent();
    this.direction = CallDirection.Inbound; // make sure we have valid turn creds. Unless something's gone wrong, it should
    // poll and keep the credentials valid so this should be instant.

    const haveTurnCreds = await this.client._checkTurnServers();

    if (!haveTurnCreds) {
      _logger.logger.warn("Failed to get TURN credentials! Proceeding with call anyway...");
    }

    this.peerConn = this.createPeerConnection(); // we must set the party ID before await-ing on anything: the call event
    // handler will start giving us more call events (eg. candidates) so if
    // we haven't set the party ID, we'll ignore them.

    this.chooseOpponent(event);

    try {
      await this.peerConn.setRemoteDescription(invite.offer);
      await this.addBufferedIceCandidates();
    } catch (e) {
      _logger.logger.debug("Failed to set remote description", e);

      this.terminate(CallParty.Local, CallErrorCode.SetRemoteDescription, false);
      return;
    }

    const remoteStream = this.feeds.find(feed => {
      return !feed.isLocal();
    })?.stream; // According to previous comments in this file, firefox at some point did not
    // add streams until media started ariving on them. Testing latest firefox
    // (81 at time of writing), this is no longer a problem, so let's do it the correct way.

    if (!remoteStream || remoteStream.getTracks().length === 0) {
      _logger.logger.error("No remote stream or no tracks after setting remote description!");

      this.terminate(CallParty.Local, CallErrorCode.SetRemoteDescription, false);
      return;
    }

    this.type = remoteStream.getTracks().some(t => t.kind === 'video') ? CallType.Video : CallType.Voice;
    this.setState(CallState.Ringing);

    if (event.getLocalAge()) {
      setTimeout(() => {
        if (this.state == CallState.Ringing) {
          _logger.logger.debug("Call invite has expired. Hanging up.");

          this.hangupParty = CallParty.Remote; // effectively

          this.setState(CallState.Ended);
          this.stopAllMedia();

          if (this.peerConn.signalingState != 'closed') {
            this.peerConn.close();
          }

          this.emit(CallEvent.Hangup);
        }
      }, invite.lifetime - event.getLocalAge());
    }
  }
  /**
   * Configure this call from a hangup or reject event. Used by MatrixClient.
   * @param {MatrixEvent} event The m.call.hangup event
   */


  initWithHangup(event) {
    // perverse as it may seem, sometimes we want to instantiate a call with a
    // hangup message (because when getting the state of the room on load, events
    // come in reverse order and we want to remember that a call has been hung up)
    this.setState(CallState.Ended);
  }
  /**
   * Answer a call.
   */


  async answer() {
    if (this.inviteOrAnswerSent) {
      return;
    }

    _logger.logger.debug(`Answering call ${this.callId} of type ${this.type}`);

    if (!this.localAVStream && !this.waitForLocalAVStream) {
      const constraints = getUserMediaContraints(this.type == CallType.Video ? ConstraintsType.Video : ConstraintsType.Audio);

      _logger.logger.log("Getting user media with constraints", constraints);

      this.setState(CallState.WaitLocalMedia);
      this.waitForLocalAVStream = true;

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        this.waitForLocalAVStream = false;
        this.gotUserMediaForAnswer(mediaStream);
      } catch (e) {
        this.getUserMediaFailed(e);
        return;
      }
    } else if (this.localAVStream) {
      this.gotUserMediaForAnswer(this.localAVStream);
    } else if (this.waitForLocalAVStream) {
      this.setState(CallState.WaitLocalMedia);
    }
  }
  /**
   * Replace this call with a new call, e.g. for glare resolution. Used by
   * MatrixClient.
   * @param {MatrixCall} newCall The new call.
   */


  replacedBy(newCall) {
    _logger.logger.debug(this.callId + " being replaced by " + newCall.callId);

    if (this.state === CallState.WaitLocalMedia) {
      _logger.logger.debug("Telling new call to wait for local media");

      newCall.waitForLocalAVStream = true;
    } else if (this.state === CallState.CreateOffer) {
      _logger.logger.debug("Handing local stream to new call");

      newCall.gotUserMediaForAnswer(this.localAVStream);
      delete this.localAVStream;
    } else if (this.state === CallState.InviteSent) {
      _logger.logger.debug("Handing local stream to new call");

      newCall.gotUserMediaForAnswer(this.localAVStream);
      delete this.localAVStream;
    }

    this.successor = newCall;
    this.emit(CallEvent.Replaced, newCall);
    this.hangup(CallErrorCode.Replaced, true);
  }
  /**
   * Hangup a call.
   * @param {string} reason The reason why the call is being hung up.
   * @param {boolean} suppressEvent True to suppress emitting an event.
   */


  hangup(reason, suppressEvent) {
    if (this.callHasEnded()) return;

    _logger.logger.debug("Ending call " + this.callId);

    this.terminate(CallParty.Local, reason, !suppressEvent); // We don't want to send hangup here if we didn't even get to sending an invite

    if (this.state === CallState.WaitLocalMedia) return;
    const content = {}; // Continue to send no reason for user hangups temporarily, until
    // clients understand the user_hangup reason (voip v1)

    if (reason !== CallErrorCode.UserHangup) content['reason'] = reason;
    this.sendVoipEvent(_event.EventType.CallHangup, {});
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

    if (this.opponentVersion < 1) {
      _logger.logger.info(`Opponent version is less than 1 (${this.opponentVersion}): sending hangup instead of reject`);

      this.hangup(CallErrorCode.UserHangup, true);
      return;
    }

    _logger.logger.debug("Rejecting call: " + this.callId);

    this.terminate(CallParty.Local, CallErrorCode.UserHangup, true);
    this.sendVoipEvent(_event.EventType.CallReject, {});
  }
  /**
   * Set whether our outbound video should be muted or not.
   * @param {boolean} muted True to mute the outbound video.
   */


  setLocalVideoMuted(muted) {
    this.vidMuted = muted;
    this.updateMuteStatus();
  }
  /**
   * Check if local video is muted.
   *
   * If there are multiple video tracks, <i>all</i> of the tracks need to be muted
   * for this to return true. This means if there are no video tracks, this will
   * return true.
   * @return {Boolean} True if the local preview video is muted, else false
   * (including if the call is not set up yet).
   */


  isLocalVideoMuted() {
    return this.vidMuted;
  }
  /**
   * Set whether the microphone should be muted or not.
   * @param {boolean} muted True to mute the mic.
   */


  setMicrophoneMuted(muted) {
    this.micMuted = muted;
    this.updateMuteStatus();
  }
  /**
   * Check if the microphone is muted.
   *
   * If there are multiple audio tracks, <i>all</i> of the tracks need to be muted
   * for this to return true. This means if there are no audio tracks, this will
   * return true.
   * @return {Boolean} True if the mic is muted, else false (including if the call
   * is not set up yet).
   */


  isMicrophoneMuted() {
    return this.micMuted;
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
    if (!onHold) this.unholdingRemote = true;

    for (const tranceiver of this.peerConn.getTransceivers()) {
      // We set 'inactive' rather than 'sendonly' because we're not planning on
      // playing music etc. to the other side.
      tranceiver.direction = onHold ? 'inactive' : 'sendrecv';
    }

    this.updateMuteStatus();
    this.emit(CallEvent.RemoteHoldUnhold, this.remoteOnHold);
  }
  /**
   * Indicates whether we are 'on hold' to the remote party (ie. if true,
   * they cannot hear us). Note that this will return true when we put the
   * remote on hold too due to the way hold is implemented (since we don't
   * wish to play hold music when we put a call on hold, we use 'inactive'
   * rather than 'sendonly')
   * @returns true if the other party has put us on hold
   */


  isLocalOnHold() {
    if (this.state !== CallState.Connected) return false;
    if (this.unholdingRemote) return false;
    let callOnHold = true; // We consider a call to be on hold only if *all* the tracks are on hold
    // (is this the right thing to do?)

    for (const tranceiver of this.peerConn.getTransceivers()) {
      const trackOnHold = ['inactive', 'recvonly'].includes(tranceiver.currentDirection);
      if (!trackOnHold) callOnHold = false;
    }

    return callOnHold;
  }
  /**
   * Sends a DTMF digit to the other party
   * @param digit The digit (nb. string - '#' and '*' are dtmf too)
   */


  sendDtmfDigit(digit) {
    for (const sender of this.peerConn.getSenders()) {
      if (sender.track.kind === 'audio' && sender.dtmf) {
        sender.dtmf.insertDTMF(digit);
        return;
      }
    }

    throw new Error("Unable to find a track to send DTMF on");
  }

  updateMuteStatus() {
    if (!this.localAVStream) {
      return;
    }

    const micShouldBeMuted = this.micMuted || this.remoteOnHold;
    setTracksEnabled(this.localAVStream.getAudioTracks(), !micShouldBeMuted);
    const vidShouldBeMuted = this.vidMuted || this.remoteOnHold;
    setTracksEnabled(this.localAVStream.getVideoTracks(), !vidShouldBeMuted);
  }
  /**
   * Internal
   * @param {Object} stream
   */


  async sendAnswer() {
    const answerContent = {
      answer: {
        sdp: this.peerConn.localDescription.sdp,
        // type is now deprecated as of Matrix VoIP v1, but
        // required to still be sent for backwards compat
        type: this.peerConn.localDescription.type
      }
    };

    if (this.client._supportsCallTransfer) {
      answerContent.capabilities = {
        'm.call.transferee': true
      };
    } // We have just taken the local description from the peerconnection which will
    // contain all the local candidates added so far, so we can discard any candidates
    // we had queued up because they'll be in the answer.


    _logger.logger.info(`Discarding ${this.candidateSendQueue.length} candidates that will be sent in answer`);

    this.candidateSendQueue = [];

    try {
      await this.sendVoipEvent(_event.EventType.CallAnswer, answerContent); // If this isn't the first time we've tried to send the answer,
      // we may have candidates queued up, so send them now.

      this.inviteOrAnswerSent = true;
    } catch (error) {
      // We've failed to answer: back to the ringing state
      this.setState(CallState.Ringing);
      this.client.cancelPendingEvent(error.event);
      let code = CallErrorCode.SendAnswer;
      let message = "Failed to send answer";

      if (error.name == 'UnknownDeviceError') {
        code = CallErrorCode.UnknownDevices;
        message = "Unknown devices present in the room";
      }

      this.emit(CallEvent.Error, new CallError(code, message, error));
      throw error;
    } // error handler re-throws so this won't happen on error, but
    // we don't want the same error handling on the candidate queue


    this.sendCandidateQueue();
  }

  async onRemoteIceCandidatesReceived(ev) {
    if (this.callHasEnded()) {
      //debuglog("Ignoring remote ICE candidate because call has ended");
      return;
    }

    const cands = ev.getContent().candidates;

    if (!cands) {
      _logger.logger.info("Ignoring candidates event with no candidates!");

      return;
    }

    const fromPartyId = ev.getContent().version === 0 ? null : ev.getContent().party_id || null;

    if (this.opponentPartyId === undefined) {
      // we haven't picked an opponent yet so save the candidates
      _logger.logger.info(`Bufferring ${cands.length} candidates until we pick an opponent`);

      const bufferedCands = this.remoteCandidateBuffer.get(fromPartyId) || [];
      bufferedCands.push(...cands);
      this.remoteCandidateBuffer.set(fromPartyId, bufferedCands);
      return;
    }

    if (!this.partyIdMatches(ev.getContent())) {
      _logger.logger.info(`Ignoring candidates from party ID ${ev.getContent().party_id}: ` + `we have chosen party ID ${this.opponentPartyId}`);

      return;
    }

    await this.addIceCandidates(cands);
  }
  /**
   * Used by MatrixClient.
   * @param {Object} msg
   */


  async onAnswerReceived(event) {
    _logger.logger.debug(`Got answer for call ID ${this.callId} from party ID ${event.getContent().party_id}`);

    if (this.callHasEnded()) {
      _logger.logger.debug(`Ignoring answer because call ID ${this.callId} has ended`);

      return;
    }

    if (this.opponentPartyId !== undefined) {
      _logger.logger.info(`Ignoring answer from party ID ${event.getContent().party_id}: ` + `we already have an answer/reject from ${this.opponentPartyId}`);

      return;
    }

    this.chooseOpponent(event);
    await this.addBufferedIceCandidates();
    this.setState(CallState.Connecting);

    try {
      await this.peerConn.setRemoteDescription(event.getContent().answer);
    } catch (e) {
      _logger.logger.debug("Failed to set remote description", e);

      this.terminate(CallParty.Local, CallErrorCode.SetRemoteDescription, false);
      return;
    } // If the answer we selected has a party_id, send a select_answer event
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
        _logger.logger.warn("Failed to send select_answer event", err);
      }
    }
  }

  async onSelectAnswerReceived(event) {
    if (this.direction !== CallDirection.Inbound) {
      _logger.logger.warn("Got select_answer for an outbound call: ignoring");

      return;
    }

    const selectedPartyId = event.getContent().selected_party_id;

    if (selectedPartyId === undefined || selectedPartyId === null) {
      _logger.logger.warn("Got nonsensical select_answer with null/undefined selected_party_id: ignoring");

      return;
    }

    if (selectedPartyId !== this.ourPartyId) {
      _logger.logger.info(`Got select_answer for party ID ${selectedPartyId}: we are party ID ${this.ourPartyId}.`); // The other party has picked somebody else's answer


      this.terminate(CallParty.Remote, CallErrorCode.AnsweredElsewhere, true);
    }
  }

  async onNegotiateReceived(event) {
    const description = event.getContent().description;

    if (!description || !description.sdp || !description.type) {
      _logger.logger.info("Ignoring invalid m.call.negotiate event");

      return;
    } // Politeness always follows the direction of the call: in a glare situation,
    // we pick either the inbound or outbound call, so one side will always be
    // inbound and one outbound


    const polite = this.direction === CallDirection.Inbound; // Here we follow the perfect negotiation logic from
    // https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation

    const offerCollision = description.type === 'offer' && (this.makingOffer || this.peerConn.signalingState != 'stable');
    this.ignoreOffer = !polite && offerCollision;

    if (this.ignoreOffer) {
      _logger.logger.info("Ignoring colliding negotiate event because we're impolite");

      return;
    }

    const prevLocalOnHold = this.isLocalOnHold();

    if (description.type === 'answer') {
      // whenever we get an answer back, clear the flag we set whilst trying to un-hold
      // the other party: the state of the channels now reflects reality
      this.unholdingRemote = false;
    }

    try {
      await this.peerConn.setRemoteDescription(description);

      if (description.type === 'offer') {
        // First we sent the direction of the tranciever to what we'd like it to be,
        // irresepective of whether the other side has us on hold - so just whether we
        // want the call to be on hold or not. This is necessary because in a few lines,
        // we'll adjust the direction and unless we do this too, we'll never come off hold.
        for (const tranceiver of this.peerConn.getTransceivers()) {
          tranceiver.direction = this.isRemoteOnHold() ? 'inactive' : 'sendrecv';
        }

        const localDescription = await this.peerConn.createAnswer();
        await this.peerConn.setLocalDescription(localDescription); // Now we've got our answer, set the direction to the outcome of the negotiation.
        // We need to do this otherwise Firefox will notice that the direction is not the
        // currentDirection and try to negotiate itself off hold again.

        for (const tranceiver of this.peerConn.getTransceivers()) {
          tranceiver.direction = tranceiver.currentDirection;
        }

        this.sendVoipEvent(_event.EventType.CallNegotiate, {
          description: this.peerConn.localDescription
        });
      }
    } catch (err) {
      _logger.logger.warn("Failed to complete negotiation", err);
    }

    const newLocalOnHold = this.isLocalOnHold();

    if (prevLocalOnHold !== newLocalOnHold) {
      this.emit(CallEvent.LocalHoldUnhold, newLocalOnHold); // also this one for backwards compat

      this.emit(CallEvent.HoldUnhold, newLocalOnHold);
    }
  }

  async onAssertedIdentityReceived(event) {
    if (!event.getContent().asserted_identity) return;
    this.remoteAssertedIdentity = {
      id: event.getContent().asserted_identity.id,
      displayName: event.getContent().asserted_identity.display_name
    };
    this.emit(CallEvent.AssertedIdentityChanged);
  }

  callHasEnded() {
    // This exists as workaround to typescript trying to be clever and erroring
    // when putting if (this.state === CallState.Ended) return; twice in the same
    // function, even though that function is async.
    return this.state === CallState.Ended;
  }

  setState(state) {
    const oldState = this.state;
    this.state = state;
    this.emit(CallEvent.State, state, oldState);
  }
  /**
   * Internal
   * @param {string} eventType
   * @param {Object} content
   * @return {Promise}
   */


  sendVoipEvent(eventType, content) {
    return this.client.sendEvent(this.roomId, eventType, Object.assign({}, content, {
      version: VOIP_PROTO_VERSION,
      call_id: this.callId,
      party_id: this.ourPartyId
    }));
  }

  queueCandidate(content) {
    // Sends candidates with are sent in a special way because we try to amalgamate
    // them into one message
    this.candidateSendQueue.push(content); // Don't send the ICE candidates yet if the call is in the ringing state: this
    // means we tried to pick (ie. started generating candidates) and then failed to
    // send the answer and went back to the ringing state. Queue up the candidates
    // to send if we sucessfully send the answer.
    // Equally don't send if we haven't yet sent the answer because we can send the
    // first batch of candidates along with the answer

    if (this.state === CallState.Ringing || !this.inviteOrAnswerSent) return; // MSC2746 reccomends these values (can be quite long when calling because the
    // callee will need a while to answer the call)

    const delay = this.direction === CallDirection.Inbound ? 500 : 2000;

    if (this.candidateSendTries === 0) {
      setTimeout(() => {
        this.sendCandidateQueue();
      }, delay);
    }
  }
  /*
   * Transfers this call to another user
   */


  async transfer(targetUserId) {
    // Fetch the target user's global profile info: their room avatar / displayname
    // could be different in whatever room we shae with them.
    const profileInfo = await this.client.getProfileInfo(targetUserId);
    const replacementId = genCallID();
    const body = {
      replacement_id: genCallID(),
      target_user: {
        id: targetUserId,
        display_name: profileInfo.display_name,
        avatar_url: profileInfo.avatar_url
      },
      create_call: replacementId
    };
    await this.sendVoipEvent(_event.EventType.CallReplaces, body);
    await this.terminate(CallParty.Local, CallErrorCode.Replaced, true);
  }
  /*
   * Transfers this call to the target call, effectively 'joining' the
   * two calls (so the remote parties on each call are connected together).
   */


  async transferToCall(transferTargetCall) {
    const targetProfileInfo = await this.client.getProfileInfo(transferTargetCall.getOpponentMember().userId);
    const transfereeProfileInfo = await this.client.getProfileInfo(this.getOpponentMember().userId);
    const newCallId = genCallID();
    const bodyToTransferTarget = {
      // the replacements on each side have their own ID, and it's distinct from the
      // ID of the new call (but we can use the same function to generate it)
      replacement_id: genCallID(),
      target_user: {
        id: this.getOpponentMember().userId,
        display_name: transfereeProfileInfo.display_name,
        avatar_url: transfereeProfileInfo.avatar_url
      },
      await_call: newCallId
    };
    await transferTargetCall.sendVoipEvent(_event.EventType.CallReplaces, bodyToTransferTarget);
    const bodyToTransferee = {
      replacement_id: genCallID(),
      target_user: {
        id: transferTargetCall.getOpponentMember().userId,
        display_name: targetProfileInfo.display_name,
        avatar_url: targetProfileInfo.avatar_url
      },
      create_call: newCallId
    };
    await this.sendVoipEvent(_event.EventType.CallReplaces, bodyToTransferee);
    await this.terminate(CallParty.Local, CallErrorCode.Replaced, true);
    await transferTargetCall.terminate(CallParty.Local, CallErrorCode.Replaced, true);
  }

  async terminate(hangupParty, hangupReason, shouldEmit) {
    if (this.callHasEnded()) return;
    this.callStatsAtEnd = await this.collectCallStats();

    if (this.inviteTimeout) {
      clearTimeout(this.inviteTimeout);
      this.inviteTimeout = null;
    } // Order is important here: first we stopAllMedia() and only then we can deleteAllFeeds()
    // We don't stop media if the call was replaced as we want to re-use streams in the successor


    if (hangupReason !== CallErrorCode.Replaced) this.stopAllMedia();
    this.deleteAllFeeds();
    this.hangupParty = hangupParty;
    this.hangupReason = hangupReason;
    this.setState(CallState.Ended);

    if (this.peerConn && this.peerConn.signalingState !== 'closed') {
      this.peerConn.close();
    }

    if (shouldEmit) {
      this.emit(CallEvent.Hangup, this);
    }
  }

  stopAllMedia() {
    _logger.logger.debug(`stopAllMedia (stream=${this.localAVStream})`);

    for (const feed of this.feeds) {
      for (const track of feed.stream.getTracks()) {
        track.stop();
      }
    }
  }

  checkForErrorListener() {
    if (this.listeners("error").length === 0) {
      throw new Error("You MUST attach an error listener using call.on('error', function() {})");
    }
  }

  async sendCandidateQueue() {
    if (this.candidateSendQueue.length === 0) {
      return;
    }

    const cands = this.candidateSendQueue;
    this.candidateSendQueue = [];
    ++this.candidateSendTries;
    const content = {
      candidates: cands
    };

    _logger.logger.debug("Attempting to send " + cands.length + " candidates");

    try {
      await this.sendVoipEvent(_event.EventType.CallCandidates, content);
    } catch (error) {
      // don't retry this event: we'll send another one later as we might
      // have more candidates by then.
      if (error.event) this.client.cancelPendingEvent(error.event); // put all the candidates we failed to send back in the queue

      this.candidateSendQueue.push(...cands);

      if (this.candidateSendTries > 5) {
        _logger.logger.debug("Failed to send candidates on attempt " + this.candidateSendTries + ". Giving up on this call.", error);

        const code = CallErrorCode.SignallingFailed;
        const message = "Signalling failed";
        this.emit(CallEvent.Error, new CallError(code, message, error));
        this.hangup(code, false);
        return;
      }

      const delayMs = 500 * Math.pow(2, this.candidateSendTries);
      ++this.candidateSendTries;

      _logger.logger.debug("Failed to send candidates. Retrying in " + delayMs + "ms", error);

      setTimeout(() => {
        this.sendCandidateQueue();
      }, delayMs);
    }
  }

  async placeCallWithConstraints(constraints) {
    _logger.logger.log("Getting user media with constraints", constraints); // XXX Find a better way to do this


    this.client._callEventHandler.calls.set(this.callId, this);

    this.setState(CallState.WaitLocalMedia);
    this.direction = CallDirection.Outbound;
    this.config = constraints; // make sure we have valid turn creds. Unless something's gone wrong, it should
    // poll and keep the credentials valid so this should be instant.

    const haveTurnCreds = await this.client._checkTurnServers();

    if (!haveTurnCreds) {
      _logger.logger.warn("Failed to get TURN credentials! Proceeding with call anyway...");
    } // create the peer connection now so it can be gathering candidates while we get user
    // media (assuming a candidate pool size is configured)


    this.peerConn = this.createPeerConnection();

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.gotUserMediaForInvite(mediaStream);
    } catch (e) {
      this.getUserMediaFailed(e);
      return;
    }
  }

  createPeerConnection() {
    const pc = new window.RTCPeerConnection({
      iceTransportPolicy: this.forceTURN ? 'relay' : undefined,
      iceServers: this.turnServers,
      iceCandidatePoolSize: this.client._iceCandidatePoolSize
    }); // 'connectionstatechange' would be better, but firefox doesn't implement that.

    pc.addEventListener('iceconnectionstatechange', this.onIceConnectionStateChanged);
    pc.addEventListener('signalingstatechange', this.onSignallingStateChanged);
    pc.addEventListener('icecandidate', this.gotLocalIceCandidate);
    pc.addEventListener('icegatheringstatechange', this.onIceGatheringStateChange);
    pc.addEventListener('track', this.onTrack);
    pc.addEventListener('negotiationneeded', this.onNegotiationNeeded);
    return pc;
  }

  partyIdMatches(msg) {
    // They must either match or both be absent (in which case opponentPartyId will be null)
    // Also we ignore party IDs on the invite/offer if the version is 0, so we must do the same
    // here and use null if the version is 0 (woe betide any opponent sending messages in the
    // same call with different versions)
    const msgPartyId = msg.version === 0 ? null : msg.party_id || null;
    return msgPartyId === this.opponentPartyId;
  } // Commits to an opponent for the call
  // ev: An invite or answer event


  chooseOpponent(ev) {
    // I choo-choo-choose you
    const msg = ev.getContent();

    _logger.logger.debug(`Choosing party ID ${msg.party_id} for call ID ${this.callId}`);

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
    this.opponentMember = ev.sender;
  }

  async addBufferedIceCandidates() {
    const bufferedCands = this.remoteCandidateBuffer.get(this.opponentPartyId);

    if (bufferedCands) {
      _logger.logger.info(`Adding ${bufferedCands.length} buffered candidates for opponent ${this.opponentPartyId}`);

      await this.addIceCandidates(bufferedCands);
    }

    this.remoteCandidateBuffer = null;
  }

  async addIceCandidates(cands) {
    for (const cand of cands) {
      if ((cand.sdpMid === null || cand.sdpMid === undefined) && (cand.sdpMLineIndex === null || cand.sdpMLineIndex === undefined)) {
        _logger.logger.debug("Ignoring remote ICE candidate with no sdpMid or sdpMLineIndex");

        continue;
      }

      _logger.logger.debug("Call " + this.callId + " got remote ICE " + cand.sdpMid + " candidate: " + cand.candidate);

      try {
        await this.peerConn.addIceCandidate(cand);
      } catch (err) {
        if (!this.ignoreOffer) {
          _logger.logger.info("Failed to add remote ICE candidate", err);
        }
      }
    }
  }

}

exports.MatrixCall = MatrixCall;

function setTracksEnabled(tracks, enabled) {
  for (let i = 0; i < tracks.length; i++) {
    tracks[i].enabled = enabled;
  }
}

function getUserMediaContraints(type) {
  const isWebkit = !!navigator.webkitGetUserMedia;

  switch (type) {
    case ConstraintsType.Audio:
      {
        return {
          audio: {
            deviceId: audioInput ? {
              ideal: audioInput
            } : undefined
          },
          video: false
        };
      }

    case ConstraintsType.Video:
      {
        return {
          audio: {
            deviceId: audioInput ? {
              ideal: audioInput
            } : undefined
          },
          video: {
            deviceId: videoInput ? {
              ideal: videoInput
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
          }
        };
      }
  }
}

async function getScreenshareContraints(selectDesktopCapturerSource) {
  if (window.electron?.getDesktopCapturerSources && selectDesktopCapturerSource) {
    // We have access to getDesktopCapturerSources()
    _logger.logger.debug("Electron getDesktopCapturerSources() is available...");

    const selectedSource = await selectDesktopCapturerSource();
    if (!selectedSource) return null;
    return {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: selectedSource.id
        }
      }
    };
  } else {
    // We do not have access to the Electron desktop capturer,
    // therefore we can assume we are on the web
    _logger.logger.debug("Electron desktopCapturer is not available...");

    return {
      audio: false,
      video: true
    };
  }
}

let audioInput;
let videoInput;
/**
 * Set an audio input device to use for MatrixCalls
 * @function
 * @param {string=} deviceId the identifier for the device
 * undefined treated as unset
 */

function setAudioInput(deviceId) {
  audioInput = deviceId;
}
/**
 * Set a video input device to use for MatrixCalls
 * @function
 * @param {string=} deviceId the identifier for the device
 * undefined treated as unset
 */


function setVideoInput(deviceId) {
  videoInput = deviceId;
}
/**
 * DEPRECATED
 * Use client.createCall()
 *
 * Create a new Matrix call for the browser.
 * @param {MatrixClient} client The client instance to use.
 * @param {string} roomId The room the call is in.
 * @param {Object?} options DEPRECATED optional options map.
 * @param {boolean} options.forceTURN DEPRECATED whether relay through TURN should be
 * forced. This option is deprecated - use opts.forceTURN when creating the matrix client
 * since it's only possible to set this option on outbound calls.
 * @return {MatrixCall} the call or null if the browser doesn't support calling.
 */


function createNewMatrixCall(client, roomId, options) {
  // typeof prevents Node from erroring on an undefined reference
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // NB. We don't log here as apps try to create a call object as a test for
    // whether calls are supported, so we shouldn't fill the logs up.
    return null;
  } // Firefox throws on so little as accessing the RTCPeerConnection when operating in
  // a secure mode. There's some information at https://bugzilla.mozilla.org/show_bug.cgi?id=1542616
  // though the concern is that the browser throwing a SecurityError will brick the
  // client creation process.


  try {
    const supported = Boolean(window.RTCPeerConnection || window.RTCSessionDescription || window.RTCIceCandidate || navigator.mediaDevices);

    if (!supported) {
      _logger.logger.error("WebRTC is not supported in this browser / environment");

      return null;
    }
  } catch (e) {
    _logger.logger.error("Exception thrown when trying to access WebRTC", e);

    return null;
  }

  const optionsForceTURN = options ? options.forceTURN : false;
  const opts = {
    client: client,
    roomId: roomId,
    turnServers: client.getTurnServers(),
    // call level options
    forceTURN: client._forceTURN || optionsForceTURN
  };
  const call = new MatrixCall(opts);
  client.reEmitter.reEmit(call, Object.values(CallEvent));
  return call;
}