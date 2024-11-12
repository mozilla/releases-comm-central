"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OtherUserSpeakingError = exports.GroupCallUnknownDeviceError = exports.GroupCallType = exports.GroupCallTerminationReason = exports.GroupCallStatsReportEvent = exports.GroupCallState = exports.GroupCallIntent = exports.GroupCallEvent = exports.GroupCallErrorCode = exports.GroupCallError = exports.GroupCall = void 0;
var _typedEventEmitter = require("../models/typed-event-emitter.js");
var _callFeed = require("./callFeed.js");
var _call = require("./call.js");
var _roomState = require("../models/room-state.js");
var _logger = require("../logger.js");
var _ReEmitter = require("../ReEmitter.js");
var _callEventTypes = require("./callEventTypes.js");
var _event = require("../@types/event.js");
var _callEventHandler = require("./callEventHandler.js");
var _groupCallEventHandler = require("./groupCallEventHandler.js");
var _utils = require("../utils.js");
var _groupCallStats = require("./stats/groupCallStats.js");
var _statsReport = require("./stats/statsReport.js");
var _summaryStatsReportGatherer = require("./stats/summaryStatsReportGatherer.js");
var _callFeedStatsReporter = require("./stats/callFeedStatsReporter.js");
var _membership = require("../@types/membership.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
let GroupCallIntent = exports.GroupCallIntent = /*#__PURE__*/function (GroupCallIntent) {
  GroupCallIntent["Ring"] = "m.ring";
  GroupCallIntent["Prompt"] = "m.prompt";
  GroupCallIntent["Room"] = "m.room";
  return GroupCallIntent;
}({});
let GroupCallType = exports.GroupCallType = /*#__PURE__*/function (GroupCallType) {
  GroupCallType["Video"] = "m.video";
  GroupCallType["Voice"] = "m.voice";
  return GroupCallType;
}({});
let GroupCallTerminationReason = exports.GroupCallTerminationReason = /*#__PURE__*/function (GroupCallTerminationReason) {
  GroupCallTerminationReason["CallEnded"] = "call_ended";
  return GroupCallTerminationReason;
}({});
/**
 * Because event names are just strings, they do need
 * to be unique over all event types of event emitter.
 * Some objects could emit more then one set of events.
 */
let GroupCallEvent = exports.GroupCallEvent = /*#__PURE__*/function (GroupCallEvent) {
  GroupCallEvent["GroupCallStateChanged"] = "group_call_state_changed";
  GroupCallEvent["ActiveSpeakerChanged"] = "active_speaker_changed";
  GroupCallEvent["CallsChanged"] = "calls_changed";
  GroupCallEvent["UserMediaFeedsChanged"] = "user_media_feeds_changed";
  GroupCallEvent["ScreenshareFeedsChanged"] = "screenshare_feeds_changed";
  GroupCallEvent["LocalScreenshareStateChanged"] = "local_screenshare_state_changed";
  GroupCallEvent["LocalMuteStateChanged"] = "local_mute_state_changed";
  GroupCallEvent["ParticipantsChanged"] = "participants_changed";
  GroupCallEvent["Error"] = "group_call_error";
  return GroupCallEvent;
}({});
let GroupCallStatsReportEvent = exports.GroupCallStatsReportEvent = /*#__PURE__*/function (GroupCallStatsReportEvent) {
  GroupCallStatsReportEvent["ConnectionStats"] = "GroupCall.connection_stats";
  GroupCallStatsReportEvent["ByteSentStats"] = "GroupCall.byte_sent_stats";
  GroupCallStatsReportEvent["SummaryStats"] = "GroupCall.summary_stats";
  GroupCallStatsReportEvent["CallFeedStats"] = "GroupCall.call_feed_stats";
  return GroupCallStatsReportEvent;
}({});
/**
 * The final report-events that get consumed by client.
 */
let GroupCallErrorCode = exports.GroupCallErrorCode = /*#__PURE__*/function (GroupCallErrorCode) {
  GroupCallErrorCode["NoUserMedia"] = "no_user_media";
  GroupCallErrorCode["UnknownDevice"] = "unknown_device";
  GroupCallErrorCode["PlaceCallFailed"] = "place_call_failed";
  return GroupCallErrorCode;
}({});
class GroupCallError extends Error {
  constructor(code, msg, err) {
    // Still don't think there's any way to have proper nested errors
    if (err) {
      super(msg + ": " + err);
      _defineProperty(this, "code", void 0);
    } else {
      super(msg);
      _defineProperty(this, "code", void 0);
    }
    this.code = code;
  }
}
exports.GroupCallError = GroupCallError;
class GroupCallUnknownDeviceError extends GroupCallError {
  constructor(userId) {
    super(GroupCallErrorCode.UnknownDevice, "No device found for " + userId);
    this.userId = userId;
  }
}
exports.GroupCallUnknownDeviceError = GroupCallUnknownDeviceError;
class OtherUserSpeakingError extends Error {
  constructor() {
    super("Cannot unmute: another user is speaking");
  }
}

// XXX: this hasn't made it into the MSC yet
exports.OtherUserSpeakingError = OtherUserSpeakingError;
let GroupCallState = exports.GroupCallState = /*#__PURE__*/function (GroupCallState) {
  GroupCallState["LocalCallFeedUninitialized"] = "local_call_feed_uninitialized";
  GroupCallState["InitializingLocalCallFeed"] = "initializing_local_call_feed";
  GroupCallState["LocalCallFeedInitialized"] = "local_call_feed_initialized";
  GroupCallState["Entered"] = "entered";
  GroupCallState["Ended"] = "ended";
  return GroupCallState;
}({});
const DEVICE_TIMEOUT = 1000 * 60 * 60; // 1 hour

function getCallUserId(call) {
  return call.getOpponentMember()?.userId || call.invitee || null;
}
class GroupCall extends _typedEventEmitter.TypedEventEmitter {
  constructor(client, room, type, isPtt, intent, groupCallId, dataChannelsEnabled, dataChannelOptions, isCallWithoutVideoAndAudio,
  // this tells the js-sdk not to actually establish any calls to exchange media and just to
  // create the group call signaling events, with the intention that the actual media will be
  // handled using livekit. The js-sdk doesn't contain any code to do the actual livekit call though.
  useLivekit = false, livekitServiceURL) {
    super();
    this.client = client;
    this.room = room;
    this.type = type;
    this.isPtt = isPtt;
    this.intent = intent;
    this.dataChannelsEnabled = dataChannelsEnabled;
    this.dataChannelOptions = dataChannelOptions;
    this.useLivekit = useLivekit;
    // Config
    _defineProperty(this, "activeSpeakerInterval", 1000);
    _defineProperty(this, "retryCallInterval", 5000);
    _defineProperty(this, "participantTimeout", 1000 * 15);
    _defineProperty(this, "pttMaxTransmitTime", 1000 * 20);
    _defineProperty(this, "activeSpeaker", void 0);
    _defineProperty(this, "localCallFeed", void 0);
    _defineProperty(this, "localScreenshareFeed", void 0);
    _defineProperty(this, "localDesktopCapturerSourceId", void 0);
    _defineProperty(this, "userMediaFeeds", []);
    _defineProperty(this, "screenshareFeeds", []);
    _defineProperty(this, "groupCallId", void 0);
    _defineProperty(this, "allowCallWithoutVideoAndAudio", void 0);
    _defineProperty(this, "calls", new Map());
    // user_id -> device_id -> MatrixCall
    _defineProperty(this, "callHandlers", new Map());
    // user_id -> device_id -> ICallHandlers
    _defineProperty(this, "activeSpeakerLoopInterval", void 0);
    _defineProperty(this, "retryCallLoopInterval", void 0);
    _defineProperty(this, "retryCallCounts", new Map());
    // user_id -> device_id -> count
    _defineProperty(this, "reEmitter", void 0);
    _defineProperty(this, "transmitTimer", null);
    _defineProperty(this, "participantsExpirationTimer", null);
    _defineProperty(this, "resendMemberStateTimer", null);
    _defineProperty(this, "initWithAudioMuted", false);
    _defineProperty(this, "initWithVideoMuted", false);
    _defineProperty(this, "initCallFeedPromise", void 0);
    _defineProperty(this, "_livekitServiceURL", void 0);
    _defineProperty(this, "stats", void 0);
    /**
     * Configure default webrtc stats collection interval in ms
     * Disable collecting webrtc stats by setting interval to 0
     */
    _defineProperty(this, "statsCollectIntervalTime", 0);
    _defineProperty(this, "onConnectionStats", report => {
      // Final emit of the summary event, to be consumed by the client
      this.emit(GroupCallStatsReportEvent.ConnectionStats, {
        report
      });
    });
    _defineProperty(this, "onByteSentStats", report => {
      // Final emit of the summary event, to be consumed by the client
      this.emit(GroupCallStatsReportEvent.ByteSentStats, {
        report
      });
    });
    _defineProperty(this, "onSummaryStats", report => {
      _summaryStatsReportGatherer.SummaryStatsReportGatherer.extendSummaryReport(report, this.participants);
      // Final emit of the summary event, to be consumed by the client
      this.emit(GroupCallStatsReportEvent.SummaryStats, {
        report
      });
    });
    _defineProperty(this, "onCallFeedReport", report => {
      if (this.localCallFeed) {
        report = _callFeedStatsReporter.CallFeedStatsReporter.expandCallFeedReport(report, [this.localCallFeed], "from-local-feed");
      }
      const callFeeds = [];
      this.forEachCall(call => {
        if (call.callId === report.callId) {
          call.getFeeds().forEach(f => callFeeds.push(f));
        }
      });
      report = _callFeedStatsReporter.CallFeedStatsReporter.expandCallFeedReport(report, callFeeds, "from-call-feed");
      this.emit(GroupCallStatsReportEvent.CallFeedStats, {
        report
      });
    });
    _defineProperty(this, "_state", GroupCallState.LocalCallFeedUninitialized);
    _defineProperty(this, "_participants", new Map());
    _defineProperty(this, "_creationTs", null);
    _defineProperty(this, "_enteredViaAnotherSession", false);
    /*
     * Call Setup
     *
     * There are two different paths for calls to be created:
     * 1. Incoming calls triggered by the Call.incoming event.
     * 2. Outgoing calls to the initial members of a room or new members
     *    as they are observed by the RoomState.members event.
     */
    _defineProperty(this, "onIncomingCall", newCall => {
      // The incoming calls may be for another room, which we will ignore.
      if (newCall.roomId !== this.room.roomId) {
        return;
      }
      if (newCall.state !== _call.CallState.Ringing) {
        _logger.logger.warn(`GroupCall ${this.groupCallId} onIncomingCall() incoming call no longer in ringing state - ignoring`);
        return;
      }
      if (!newCall.groupCallId || newCall.groupCallId !== this.groupCallId) {
        _logger.logger.log(`GroupCall ${this.groupCallId} onIncomingCall() ignored because it doesn't match the current group call`);
        newCall.reject();
        return;
      }
      const opponentUserId = newCall.getOpponentMember()?.userId;
      if (opponentUserId === undefined) {
        _logger.logger.warn(`GroupCall ${this.groupCallId} onIncomingCall() incoming call with no member - ignoring`);
        return;
      }
      if (this.useLivekit) {
        _logger.logger.info("Received incoming call whilst in signaling-only mode! Ignoring.");
        return;
      }
      const deviceMap = this.calls.get(opponentUserId) ?? new Map();
      const prevCall = deviceMap.get(newCall.getOpponentDeviceId());
      if (prevCall?.callId === newCall.callId) return;
      _logger.logger.log(`GroupCall ${this.groupCallId} onIncomingCall() incoming call (userId=${opponentUserId}, callId=${newCall.callId})`);
      if (prevCall) prevCall.hangup(_call.CallErrorCode.Replaced, false);
      // We must do this before we start initialising / answering the call as we
      // need to know it is the active call for this user+deviceId and to not ignore
      // events from it.
      deviceMap.set(newCall.getOpponentDeviceId(), newCall);
      this.calls.set(opponentUserId, deviceMap);
      this.initCall(newCall);
      const feeds = this.getLocalFeeds().map(feed => feed.clone());
      if (!this.callExpected(newCall)) {
        // Disable our tracks for users not explicitly participating in the
        // call but trying to receive the feeds
        for (const feed of feeds) {
          (0, _call.setTracksEnabled)(feed.stream.getAudioTracks(), false);
          (0, _call.setTracksEnabled)(feed.stream.getVideoTracks(), false);
        }
      }
      newCall.answerWithCallFeeds(feeds);
      this.emit(GroupCallEvent.CallsChanged, this.calls);
    });
    _defineProperty(this, "onRetryCallLoop", () => {
      let needsRetry = false;
      for (const [{
        userId
      }, participantMap] of this.participants) {
        const callMap = this.calls.get(userId);
        let retriesMap = this.retryCallCounts.get(userId);
        for (const [deviceId, participant] of participantMap) {
          const call = callMap?.get(deviceId);
          const retries = retriesMap?.get(deviceId) ?? 0;
          if (call?.getOpponentSessionId() !== participant.sessionId && this.wantsOutgoingCall(userId, deviceId) && retries < 3) {
            if (retriesMap === undefined) {
              retriesMap = new Map();
              this.retryCallCounts.set(userId, retriesMap);
            }
            retriesMap.set(deviceId, retries + 1);
            needsRetry = true;
          }
        }
      }
      if (needsRetry) this.placeOutgoingCalls();
    });
    _defineProperty(this, "onCallFeedsChanged", call => {
      const opponentMemberId = getCallUserId(call);
      const opponentDeviceId = call.getOpponentDeviceId();
      if (!opponentMemberId) {
        throw new Error("Cannot change call feeds without user id");
      }
      const currentUserMediaFeed = this.getUserMediaFeed(opponentMemberId, opponentDeviceId);
      const remoteUsermediaFeed = call.remoteUsermediaFeed;
      const remoteFeedChanged = remoteUsermediaFeed !== currentUserMediaFeed;
      const deviceMap = this.calls.get(opponentMemberId);
      const currentCallForUserDevice = deviceMap?.get(opponentDeviceId);
      if (currentCallForUserDevice?.callId !== call.callId) {
        // the call in question is not the current call for this user/deviceId
        // so ignore feed events from it otherwise we'll remove our real feeds
        return;
      }
      if (remoteFeedChanged) {
        if (!currentUserMediaFeed && remoteUsermediaFeed) {
          this.addUserMediaFeed(remoteUsermediaFeed);
        } else if (currentUserMediaFeed && remoteUsermediaFeed) {
          this.replaceUserMediaFeed(currentUserMediaFeed, remoteUsermediaFeed);
        } else if (currentUserMediaFeed && !remoteUsermediaFeed) {
          this.removeUserMediaFeed(currentUserMediaFeed);
        }
      }
      const currentScreenshareFeed = this.getScreenshareFeed(opponentMemberId, opponentDeviceId);
      const remoteScreensharingFeed = call.remoteScreensharingFeed;
      const remoteScreenshareFeedChanged = remoteScreensharingFeed !== currentScreenshareFeed;
      if (remoteScreenshareFeedChanged) {
        if (!currentScreenshareFeed && remoteScreensharingFeed) {
          this.addScreenshareFeed(remoteScreensharingFeed);
        } else if (currentScreenshareFeed && remoteScreensharingFeed) {
          this.replaceScreenshareFeed(currentScreenshareFeed, remoteScreensharingFeed);
        } else if (currentScreenshareFeed && !remoteScreensharingFeed) {
          this.removeScreenshareFeed(currentScreenshareFeed);
        }
      }
    });
    _defineProperty(this, "onCallStateChanged", (call, state, _oldState) => {
      if (state === _call.CallState.Ended) return;
      const audioMuted = this.localCallFeed.isAudioMuted();
      if (call.localUsermediaStream && call.isMicrophoneMuted() !== audioMuted) {
        call.setMicrophoneMuted(audioMuted);
      }
      const videoMuted = this.localCallFeed.isVideoMuted();
      if (call.localUsermediaStream && call.isLocalVideoMuted() !== videoMuted) {
        call.setLocalVideoMuted(videoMuted);
      }
      const opponentUserId = call.getOpponentMember()?.userId;
      if (state === _call.CallState.Connected && opponentUserId) {
        const retriesMap = this.retryCallCounts.get(opponentUserId);
        retriesMap?.delete(call.getOpponentDeviceId());
        if (retriesMap?.size === 0) this.retryCallCounts.delete(opponentUserId);
      }
    });
    _defineProperty(this, "onCallHangup", call => {
      if (call.hangupReason === _call.CallErrorCode.Replaced) return;
      const opponentUserId = call.getOpponentMember()?.userId ?? this.room.getMember(call.invitee).userId;
      const deviceMap = this.calls.get(opponentUserId);

      // Sanity check that this call is in fact in the map
      if (deviceMap?.get(call.getOpponentDeviceId()) === call) {
        this.disposeCall(call, call.hangupReason);
        deviceMap.delete(call.getOpponentDeviceId());
        if (deviceMap.size === 0) this.calls.delete(opponentUserId);
        this.emit(GroupCallEvent.CallsChanged, this.calls);
      }
    });
    _defineProperty(this, "onCallReplaced", (prevCall, newCall) => {
      const opponentUserId = prevCall.getOpponentMember().userId;
      let deviceMap = this.calls.get(opponentUserId);
      if (deviceMap === undefined) {
        deviceMap = new Map();
        this.calls.set(opponentUserId, deviceMap);
      }
      prevCall.hangup(_call.CallErrorCode.Replaced, false);
      this.initCall(newCall);
      deviceMap.set(prevCall.getOpponentDeviceId(), newCall);
      this.emit(GroupCallEvent.CallsChanged, this.calls);
    });
    _defineProperty(this, "onActiveSpeakerLoop", () => {
      let topAvg = undefined;
      let nextActiveSpeaker = undefined;
      for (const callFeed of this.userMediaFeeds) {
        if (callFeed.isLocal() && this.userMediaFeeds.length > 1) continue;
        const total = callFeed.speakingVolumeSamples.reduce((acc, volume) => acc + Math.max(volume, _callFeed.SPEAKING_THRESHOLD));
        const avg = total / callFeed.speakingVolumeSamples.length;
        if (!topAvg || avg > topAvg) {
          topAvg = avg;
          nextActiveSpeaker = callFeed;
        }
      }
      if (nextActiveSpeaker && this.activeSpeaker !== nextActiveSpeaker && topAvg && topAvg > _callFeed.SPEAKING_THRESHOLD) {
        this.activeSpeaker = nextActiveSpeaker;
        this.emit(GroupCallEvent.ActiveSpeakerChanged, this.activeSpeaker);
      }
    });
    _defineProperty(this, "onRoomState", () => this.updateParticipants());
    _defineProperty(this, "onParticipantsChanged", () => {
      // Re-run setTracksEnabled on all calls, so that participants that just
      // left get denied access to our media, and participants that just
      // joined get granted access
      this.forEachCall(call => {
        const expected = this.callExpected(call);
        for (const feed of call.getLocalFeeds()) {
          (0, _call.setTracksEnabled)(feed.stream.getAudioTracks(), !feed.isAudioMuted() && expected);
          (0, _call.setTracksEnabled)(feed.stream.getVideoTracks(), !feed.isVideoMuted() && expected);
        }
      });
      if (this.state === GroupCallState.Entered && !this.useLivekit) this.placeOutgoingCalls();

      // Update the participants stored in the stats object
    });
    _defineProperty(this, "onStateChanged", (newState, oldState) => {
      if (newState === GroupCallState.Entered || oldState === GroupCallState.Entered || newState === GroupCallState.Ended) {
        // We either entered, left, or ended the call
        this.updateParticipants();
        this.updateMemberState().catch(e => _logger.logger.error(`GroupCall ${this.groupCallId} onStateChanged() failed to update member state devices"`, e));
      }
    });
    _defineProperty(this, "onLocalFeedsChanged", () => {
      if (this.state === GroupCallState.Entered) {
        this.updateMemberState().catch(e => _logger.logger.error(`GroupCall ${this.groupCallId} onLocalFeedsChanged() failed to update member state feeds`, e));
      }
    });
    this.reEmitter = new _ReEmitter.ReEmitter(this);
    this.groupCallId = groupCallId ?? (0, _call.genCallID)();
    this._livekitServiceURL = livekitServiceURL;
    this.creationTs = room.currentState.getStateEvents(_event.EventType.GroupCallPrefix, this.groupCallId)?.getTs() ?? null;
    this.updateParticipants();
    room.on(_roomState.RoomStateEvent.Update, this.onRoomState);
    this.on(GroupCallEvent.ParticipantsChanged, this.onParticipantsChanged);
    this.on(GroupCallEvent.GroupCallStateChanged, this.onStateChanged);
    this.on(GroupCallEvent.LocalScreenshareStateChanged, this.onLocalFeedsChanged);
    this.allowCallWithoutVideoAndAudio = !!isCallWithoutVideoAndAudio;
  }
  async create() {
    this.creationTs = Date.now();
    this.client.groupCallEventHandler.groupCalls.set(this.room.roomId, this);
    this.client.emit(_groupCallEventHandler.GroupCallEventHandlerEvent.Outgoing, this);
    await this.sendCallStateEvent();
    return this;
  }
  async sendCallStateEvent() {
    const groupCallState = {
      "m.intent": this.intent,
      "m.type": this.type,
      "io.element.ptt": this.isPtt,
      // TODO: Specify data-channels better
      "dataChannelsEnabled": this.dataChannelsEnabled,
      "dataChannelOptions": this.dataChannelsEnabled ? this.dataChannelOptions : undefined
    };
    if (this.livekitServiceURL) {
      groupCallState["io.element.livekit_service_url"] = this.livekitServiceURL;
    }
    await this.client.sendStateEvent(this.room.roomId, _event.EventType.GroupCallPrefix, groupCallState, this.groupCallId);
  }
  get livekitServiceURL() {
    return this._livekitServiceURL;
  }
  updateLivekitServiceURL(newURL) {
    this._livekitServiceURL = newURL;
    return this.sendCallStateEvent();
  }
  /**
   * The group call's state.
   */
  get state() {
    return this._state;
  }
  set state(value) {
    const prevValue = this._state;
    if (value !== prevValue) {
      this._state = value;
      this.emit(GroupCallEvent.GroupCallStateChanged, value, prevValue);
    }
  }
  /**
   * The current participants in the call, as a map from members to device IDs
   * to participant info.
   */
  get participants() {
    return this._participants;
  }
  set participants(value) {
    const prevValue = this._participants;
    const participantStateEqual = (x, y) => x.sessionId === y.sessionId && x.screensharing === y.screensharing;
    const deviceMapsEqual = (x, y) => (0, _utils.mapsEqual)(x, y, participantStateEqual);

    // Only update if the map actually changed
    if (!(0, _utils.mapsEqual)(value, prevValue, deviceMapsEqual)) {
      this._participants = value;
      this.emit(GroupCallEvent.ParticipantsChanged, value);
    }
  }
  /**
   * The timestamp at which the call was created, or null if it has not yet
   * been created.
   */
  get creationTs() {
    return this._creationTs;
  }
  set creationTs(value) {
    this._creationTs = value;
  }
  /**
   * Whether the local device has entered this call via another session, such
   * as a widget.
   */
  get enteredViaAnotherSession() {
    return this._enteredViaAnotherSession;
  }
  set enteredViaAnotherSession(value) {
    this._enteredViaAnotherSession = value;
    this.updateParticipants();
  }

  /**
   * Executes the given callback on all calls in this group call.
   * @param f - The callback.
   */
  forEachCall(f) {
    for (const deviceMap of this.calls.values()) {
      for (const call of deviceMap.values()) f(call);
    }
  }
  getLocalFeeds() {
    const feeds = [];
    if (this.localCallFeed) feeds.push(this.localCallFeed);
    if (this.localScreenshareFeed) feeds.push(this.localScreenshareFeed);
    return feeds;
  }
  hasLocalParticipant() {
    return this.participants.get(this.room.getMember(this.client.getUserId()))?.has(this.client.getDeviceId()) ?? false;
  }

  /**
   * Determines whether the given call is one that we were expecting to exist
   * given our knowledge of who is participating in the group call.
   */
  callExpected(call) {
    const userId = getCallUserId(call);
    const member = userId === null ? null : this.room.getMember(userId);
    const deviceId = call.getOpponentDeviceId();
    return member !== null && deviceId !== undefined && this.participants.get(member)?.get(deviceId) !== undefined;
  }
  async initLocalCallFeed() {
    if (this.useLivekit) {
      _logger.logger.info("Livekit group call: not starting local call feed.");
      return;
    }
    if (this.state !== GroupCallState.LocalCallFeedUninitialized) {
      throw new Error(`Cannot initialize local call feed in the "${this.state}" state.`);
    }
    this.state = GroupCallState.InitializingLocalCallFeed;

    // wraps the real method to serialise calls, because we don't want to try starting
    // multiple call feeds at once
    if (this.initCallFeedPromise) return this.initCallFeedPromise;
    try {
      this.initCallFeedPromise = this.initLocalCallFeedInternal();
      await this.initCallFeedPromise;
    } finally {
      this.initCallFeedPromise = undefined;
    }
  }
  async initLocalCallFeedInternal() {
    _logger.logger.log(`GroupCall ${this.groupCallId} initLocalCallFeedInternal() running`);
    let stream;
    try {
      stream = await this.client.getMediaHandler().getUserMediaStream(true, this.type === GroupCallType.Video);
    } catch (error) {
      // If is allowed to join a call without a media stream, then we
      // don't throw an error here. But we need an empty Local Feed to establish
      // a connection later.
      if (this.allowCallWithoutVideoAndAudio) {
        stream = new MediaStream();
      } else {
        this.state = GroupCallState.LocalCallFeedUninitialized;
        throw error;
      }
    }

    // The call could've been disposed while we were waiting, and could
    // also have been started back up again (hello, React 18) so if we're
    // still in this 'initializing' state, carry on, otherwise bail.
    if (this._state !== GroupCallState.InitializingLocalCallFeed) {
      this.client.getMediaHandler().stopUserMediaStream(stream);
      throw new Error("Group call disposed while gathering media stream");
    }
    const callFeed = new _callFeed.CallFeed({
      client: this.client,
      roomId: this.room.roomId,
      userId: this.client.getUserId(),
      deviceId: this.client.getDeviceId(),
      stream,
      purpose: _callEventTypes.SDPStreamMetadataPurpose.Usermedia,
      audioMuted: this.initWithAudioMuted || stream.getAudioTracks().length === 0 || this.isPtt,
      videoMuted: this.initWithVideoMuted || stream.getVideoTracks().length === 0
    });
    (0, _call.setTracksEnabled)(stream.getAudioTracks(), !callFeed.isAudioMuted());
    (0, _call.setTracksEnabled)(stream.getVideoTracks(), !callFeed.isVideoMuted());
    this.localCallFeed = callFeed;
    this.addUserMediaFeed(callFeed);
    this.state = GroupCallState.LocalCallFeedInitialized;
  }
  async updateLocalUsermediaStream(stream) {
    if (this.localCallFeed) {
      const oldStream = this.localCallFeed.stream;
      this.localCallFeed.setNewStream(stream);
      const micShouldBeMuted = this.localCallFeed.isAudioMuted();
      const vidShouldBeMuted = this.localCallFeed.isVideoMuted();
      _logger.logger.log(`GroupCall ${this.groupCallId} updateLocalUsermediaStream() (oldStreamId=${oldStream.id}, newStreamId=${stream.id}, micShouldBeMuted=${micShouldBeMuted}, vidShouldBeMuted=${vidShouldBeMuted})`);
      (0, _call.setTracksEnabled)(stream.getAudioTracks(), !micShouldBeMuted);
      (0, _call.setTracksEnabled)(stream.getVideoTracks(), !vidShouldBeMuted);
      this.client.getMediaHandler().stopUserMediaStream(oldStream);
    }
  }
  async enter() {
    if (this.state === GroupCallState.LocalCallFeedUninitialized) {
      await this.initLocalCallFeed();
    } else if (this.state !== GroupCallState.LocalCallFeedInitialized) {
      throw new Error(`Cannot enter call in the "${this.state}" state`);
    }
    _logger.logger.log(`GroupCall ${this.groupCallId} enter() running`);
    this.state = GroupCallState.Entered;
    this.client.on(_callEventHandler.CallEventHandlerEvent.Incoming, this.onIncomingCall);
    for (const call of this.client.callEventHandler.calls.values()) {
      this.onIncomingCall(call);
    }
    if (!this.useLivekit) {
      this.retryCallLoopInterval = setInterval(this.onRetryCallLoop, this.retryCallInterval);
      this.activeSpeaker = undefined;
      this.onActiveSpeakerLoop();
      this.activeSpeakerLoopInterval = setInterval(this.onActiveSpeakerLoop, this.activeSpeakerInterval);
    }
  }
  dispose() {
    if (this.localCallFeed) {
      this.removeUserMediaFeed(this.localCallFeed);
      this.localCallFeed = undefined;
    }
    if (this.localScreenshareFeed) {
      this.client.getMediaHandler().stopScreensharingStream(this.localScreenshareFeed.stream);
      this.removeScreenshareFeed(this.localScreenshareFeed);
      this.localScreenshareFeed = undefined;
      this.localDesktopCapturerSourceId = undefined;
    }
    this.client.getMediaHandler().stopAllStreams();
    if (this.transmitTimer !== null) {
      clearTimeout(this.transmitTimer);
      this.transmitTimer = null;
    }
    if (this.retryCallLoopInterval !== undefined) {
      clearInterval(this.retryCallLoopInterval);
      this.retryCallLoopInterval = undefined;
    }
    if (this.participantsExpirationTimer !== null) {
      clearTimeout(this.participantsExpirationTimer);
      this.participantsExpirationTimer = null;
    }
    if (this.state !== GroupCallState.Entered) {
      return;
    }
    this.forEachCall(call => call.hangup(_call.CallErrorCode.UserHangup, false));
    this.activeSpeaker = undefined;
    clearInterval(this.activeSpeakerLoopInterval);
    this.retryCallCounts.clear();
    clearInterval(this.retryCallLoopInterval);
    this.client.removeListener(_callEventHandler.CallEventHandlerEvent.Incoming, this.onIncomingCall);
    this.stats?.stop();
  }
  leave() {
    this.dispose();
    this.state = GroupCallState.LocalCallFeedUninitialized;
  }
  async terminate(emitStateEvent = true) {
    this.dispose();
    this.room.off(_roomState.RoomStateEvent.Update, this.onRoomState);
    this.client.groupCallEventHandler.groupCalls.delete(this.room.roomId);
    this.client.emit(_groupCallEventHandler.GroupCallEventHandlerEvent.Ended, this);
    this.state = GroupCallState.Ended;
    if (emitStateEvent) {
      const existingStateEvent = this.room.currentState.getStateEvents(_event.EventType.GroupCallPrefix, this.groupCallId);
      await this.client.sendStateEvent(this.room.roomId, _event.EventType.GroupCallPrefix, _objectSpread(_objectSpread({}, existingStateEvent.getContent()), {}, {
        "m.terminated": GroupCallTerminationReason.CallEnded
      }), this.groupCallId);
    }
  }

  /*
   * Local Usermedia
   */

  isLocalVideoMuted() {
    if (this.localCallFeed) {
      return this.localCallFeed.isVideoMuted();
    }
    return true;
  }
  isMicrophoneMuted() {
    if (this.localCallFeed) {
      return this.localCallFeed.isAudioMuted();
    }
    return true;
  }

  /**
   * Sets the mute state of the local participants's microphone.
   * @param muted - Whether to mute the microphone
   * @returns Whether muting/unmuting was successful
   */
  async setMicrophoneMuted(muted) {
    // hasAudioDevice can block indefinitely if the window has lost focus,
    // and it doesn't make much sense to keep a device from being muted, so
    // we always allow muted = true changes to go through
    if (!muted && !(await this.client.getMediaHandler().hasAudioDevice())) {
      return false;
    }
    const sendUpdatesBefore = !muted && this.isPtt;

    // set a timer for the maximum transmit time on PTT calls
    if (this.isPtt) {
      // Set or clear the max transmit timer
      if (!muted && this.isMicrophoneMuted()) {
        this.transmitTimer = setTimeout(() => {
          this.setMicrophoneMuted(true);
        }, this.pttMaxTransmitTime);
      } else if (muted && !this.isMicrophoneMuted()) {
        if (this.transmitTimer !== null) clearTimeout(this.transmitTimer);
        this.transmitTimer = null;
      }
    }
    this.forEachCall(call => call.localUsermediaFeed?.setAudioVideoMuted(muted, null));
    const sendUpdates = async () => {
      const updates = [];
      this.forEachCall(call => updates.push(call.sendMetadataUpdate()));
      await Promise.all(updates).catch(e => _logger.logger.info(`GroupCall ${this.groupCallId} setMicrophoneMuted() failed to send some metadata updates`, e));
    };
    if (sendUpdatesBefore) await sendUpdates();
    if (this.localCallFeed) {
      _logger.logger.log(`GroupCall ${this.groupCallId} setMicrophoneMuted() (streamId=${this.localCallFeed.stream.id}, muted=${muted})`);
      const hasPermission = await this.checkAudioPermissionIfNecessary(muted);
      if (!hasPermission) {
        return false;
      }
      this.localCallFeed.setAudioVideoMuted(muted, null);
      // I don't believe its actually necessary to enable these tracks: they
      // are the one on the GroupCall's own CallFeed and are cloned before being
      // given to any of the actual calls, so these tracks don't actually go
      // anywhere. Let's do it anyway to avoid confusion.
      (0, _call.setTracksEnabled)(this.localCallFeed.stream.getAudioTracks(), !muted);
    } else {
      _logger.logger.log(`GroupCall ${this.groupCallId} setMicrophoneMuted() no stream muted (muted=${muted})`);
      this.initWithAudioMuted = muted;
    }
    this.forEachCall(call => (0, _call.setTracksEnabled)(call.localUsermediaFeed.stream.getAudioTracks(), !muted && this.callExpected(call)));
    this.emit(GroupCallEvent.LocalMuteStateChanged, muted, this.isLocalVideoMuted());
    if (!sendUpdatesBefore) await sendUpdates();
    return true;
  }

  /**
   * If we allow entering a call without a camera and without video, it can happen that the access rights to the
   * devices have not yet been queried. If a stream does not yet have an audio track, we assume that the rights have
   * not yet been checked.
   *
   * `this.client.getMediaHandler().getUserMediaStream` clones the current stream, so it only wanted to be called when
   * not Audio Track exists.
   * As such, this is a compromise, because, the access rights should always be queried before the call.
   */
  async checkAudioPermissionIfNecessary(muted) {
    // We needed this here to avoid an error in case user join a call without a device.
    try {
      if (!muted && this.localCallFeed && !this.localCallFeed.hasAudioTrack) {
        const stream = await this.client.getMediaHandler().getUserMediaStream(true, !this.localCallFeed.isVideoMuted());
        if (stream?.getTracks().length === 0) {
          // if case permission denied to get a stream stop this here
          /* istanbul ignore next */
          _logger.logger.log(`GroupCall ${this.groupCallId} setMicrophoneMuted() no device to receive local stream, muted=${muted}`);
          return false;
        }
      }
    } catch {
      /* istanbul ignore next */
      _logger.logger.log(`GroupCall ${this.groupCallId} setMicrophoneMuted() no device or permission to receive local stream, muted=${muted}`);
      return false;
    }
    return true;
  }

  /**
   * Sets the mute state of the local participants's video.
   * @param muted - Whether to mute the video
   * @returns Whether muting/unmuting was successful
   */
  async setLocalVideoMuted(muted) {
    // hasAudioDevice can block indefinitely if the window has lost focus,
    // and it doesn't make much sense to keep a device from being muted, so
    // we always allow muted = true changes to go through
    if (!muted && !(await this.client.getMediaHandler().hasVideoDevice())) {
      return false;
    }
    if (this.localCallFeed) {
      /* istanbul ignore next */
      _logger.logger.log(`GroupCall ${this.groupCallId} setLocalVideoMuted() (stream=${this.localCallFeed.stream.id}, muted=${muted})`);
      try {
        const stream = await this.client.getMediaHandler().getUserMediaStream(true, !muted);
        await this.updateLocalUsermediaStream(stream);
        this.localCallFeed.setAudioVideoMuted(null, muted);
        (0, _call.setTracksEnabled)(this.localCallFeed.stream.getVideoTracks(), !muted);
      } catch {
        // No permission to video device
        /* istanbul ignore next */
        _logger.logger.log(`GroupCall ${this.groupCallId} setLocalVideoMuted() no device or permission to receive local stream, muted=${muted}`);
        return false;
      }
    } else {
      _logger.logger.log(`GroupCall ${this.groupCallId} setLocalVideoMuted() no stream muted (muted=${muted})`);
      this.initWithVideoMuted = muted;
    }
    const updates = [];
    this.forEachCall(call => updates.push(call.setLocalVideoMuted(muted)));
    await Promise.all(updates);

    // We setTracksEnabled again, independently from the call doing it
    // internally, since we might not be expecting the call
    this.forEachCall(call => (0, _call.setTracksEnabled)(call.localUsermediaFeed.stream.getVideoTracks(), !muted && this.callExpected(call)));
    this.emit(GroupCallEvent.LocalMuteStateChanged, this.isMicrophoneMuted(), muted);
    return true;
  }
  async setScreensharingEnabled(enabled, opts = {}) {
    if (enabled === this.isScreensharing()) {
      return enabled;
    }
    if (enabled) {
      try {
        _logger.logger.log(`GroupCall ${this.groupCallId} setScreensharingEnabled() is asking for screensharing permissions`);
        const stream = await this.client.getMediaHandler().getScreensharingStream(opts);
        for (const track of stream.getTracks()) {
          const onTrackEnded = () => {
            this.setScreensharingEnabled(false);
            track.removeEventListener("ended", onTrackEnded);
          };
          track.addEventListener("ended", onTrackEnded);
        }
        _logger.logger.log(`GroupCall ${this.groupCallId} setScreensharingEnabled() granted screensharing permissions. Setting screensharing enabled on all calls`);
        this.localDesktopCapturerSourceId = opts.desktopCapturerSourceId;
        this.localScreenshareFeed = new _callFeed.CallFeed({
          client: this.client,
          roomId: this.room.roomId,
          userId: this.client.getUserId(),
          deviceId: this.client.getDeviceId(),
          stream,
          purpose: _callEventTypes.SDPStreamMetadataPurpose.Screenshare,
          audioMuted: false,
          videoMuted: false
        });
        this.addScreenshareFeed(this.localScreenshareFeed);
        this.emit(GroupCallEvent.LocalScreenshareStateChanged, true, this.localScreenshareFeed, this.localDesktopCapturerSourceId);

        // TODO: handle errors
        this.forEachCall(call => call.pushLocalFeed(this.localScreenshareFeed.clone()));
        return true;
      } catch (error) {
        if (opts.throwOnFail) throw error;
        _logger.logger.error(`GroupCall ${this.groupCallId} setScreensharingEnabled() enabling screensharing error`, error);
        this.emit(GroupCallEvent.Error, new GroupCallError(GroupCallErrorCode.NoUserMedia, "Failed to get screen-sharing stream: ", error));
        return false;
      }
    } else {
      this.forEachCall(call => {
        if (call.localScreensharingFeed) call.removeLocalFeed(call.localScreensharingFeed);
      });
      this.client.getMediaHandler().stopScreensharingStream(this.localScreenshareFeed.stream);
      this.removeScreenshareFeed(this.localScreenshareFeed);
      this.localScreenshareFeed = undefined;
      this.localDesktopCapturerSourceId = undefined;
      this.emit(GroupCallEvent.LocalScreenshareStateChanged, false, undefined, undefined);
      return false;
    }
  }
  isScreensharing() {
    return !!this.localScreenshareFeed;
  }
  /**
   * Determines whether a given participant expects us to call them (versus
   * them calling us).
   * @param userId - The participant's user ID.
   * @param deviceId - The participant's device ID.
   * @returns Whether we need to place an outgoing call to the participant.
   */
  wantsOutgoingCall(userId, deviceId) {
    const localUserId = this.client.getUserId();
    const localDeviceId = this.client.getDeviceId();
    return (
      // If a user's ID is less than our own, they'll call us
      userId >= localUserId && (
      // If this is another one of our devices, compare device IDs to tell whether it'll call us
      userId !== localUserId || deviceId > localDeviceId)
    );
  }

  /**
   * Places calls to all participants that we're responsible for calling.
   */
  placeOutgoingCalls() {
    let callsChanged = false;
    for (const [{
      userId
    }, participantMap] of this.participants) {
      const callMap = this.calls.get(userId) ?? new Map();
      for (const [deviceId, participant] of participantMap) {
        const prevCall = callMap.get(deviceId);
        if (prevCall?.getOpponentSessionId() !== participant.sessionId && this.wantsOutgoingCall(userId, deviceId)) {
          callsChanged = true;
          if (prevCall !== undefined) {
            _logger.logger.debug(`GroupCall ${this.groupCallId} placeOutgoingCalls() replacing call (userId=${userId}, deviceId=${deviceId}, callId=${prevCall.callId})`);
            prevCall.hangup(_call.CallErrorCode.NewSession, false);
          }
          const newCall = (0, _call.createNewMatrixCall)(this.client, this.room.roomId, {
            invitee: userId,
            opponentDeviceId: deviceId,
            opponentSessionId: participant.sessionId,
            groupCallId: this.groupCallId
          });
          if (newCall === null) {
            _logger.logger.error(`GroupCall ${this.groupCallId} placeOutgoingCalls() failed to create call (userId=${userId}, device=${deviceId})`);
            callMap.delete(deviceId);
          } else {
            this.initCall(newCall);
            callMap.set(deviceId, newCall);
            _logger.logger.debug(`GroupCall ${this.groupCallId} placeOutgoingCalls() placing call (userId=${userId}, deviceId=${deviceId}, sessionId=${participant.sessionId})`);
            newCall.placeCallWithCallFeeds(this.getLocalFeeds().map(feed => feed.clone()), participant.screensharing).then(() => {
              if (this.dataChannelsEnabled) {
                newCall.createDataChannel("datachannel", this.dataChannelOptions);
              }
            }).catch(e => {
              _logger.logger.warn(`GroupCall ${this.groupCallId} placeOutgoingCalls() failed to place call (userId=${userId})`, e);
              if (e instanceof _call.CallError && e.code === GroupCallErrorCode.UnknownDevice) {
                this.emit(GroupCallEvent.Error, e);
              } else {
                this.emit(GroupCallEvent.Error, new GroupCallError(GroupCallErrorCode.PlaceCallFailed, `Failed to place call to ${userId}`));
              }
              newCall.hangup(_call.CallErrorCode.SignallingFailed, false);
              if (callMap.get(deviceId) === newCall) callMap.delete(deviceId);
            });
          }
        }
      }
      if (callMap.size > 0) {
        this.calls.set(userId, callMap);
      } else {
        this.calls.delete(userId);
      }
    }
    if (callsChanged) this.emit(GroupCallEvent.CallsChanged, this.calls);
  }

  /*
   * Room Member State
   */

  getMemberStateEvents(userId) {
    return userId === undefined ? this.room.currentState.getStateEvents(_event.EventType.GroupCallMemberPrefix) : this.room.currentState.getStateEvents(_event.EventType.GroupCallMemberPrefix, userId);
  }
  initCall(call) {
    const opponentMemberId = getCallUserId(call);
    if (!opponentMemberId) {
      throw new Error("Cannot init call without user id");
    }
    const onCallFeedsChanged = () => this.onCallFeedsChanged(call);
    const onCallStateChanged = (state, oldState) => this.onCallStateChanged(call, state, oldState);
    const onCallHangup = this.onCallHangup;
    const onCallReplaced = newCall => this.onCallReplaced(call, newCall);
    let deviceMap = this.callHandlers.get(opponentMemberId);
    if (deviceMap === undefined) {
      deviceMap = new Map();
      this.callHandlers.set(opponentMemberId, deviceMap);
    }
    deviceMap.set(call.getOpponentDeviceId(), {
      onCallFeedsChanged,
      onCallStateChanged,
      onCallHangup,
      onCallReplaced
    });
    call.on(_call.CallEvent.FeedsChanged, onCallFeedsChanged);
    call.on(_call.CallEvent.State, onCallStateChanged);
    call.on(_call.CallEvent.Hangup, onCallHangup);
    call.on(_call.CallEvent.Replaced, onCallReplaced);
    call.isPtt = this.isPtt;
    this.reEmitter.reEmit(call, Object.values(_call.CallEvent));
    call.initStats(this.getGroupCallStats());
    onCallFeedsChanged();
  }
  disposeCall(call, hangupReason) {
    const opponentMemberId = getCallUserId(call);
    const opponentDeviceId = call.getOpponentDeviceId();
    if (!opponentMemberId) {
      throw new Error("Cannot dispose call without user id");
    }
    const deviceMap = this.callHandlers.get(opponentMemberId);
    const {
      onCallFeedsChanged,
      onCallStateChanged,
      onCallHangup,
      onCallReplaced
    } = deviceMap.get(opponentDeviceId);
    call.removeListener(_call.CallEvent.FeedsChanged, onCallFeedsChanged);
    call.removeListener(_call.CallEvent.State, onCallStateChanged);
    call.removeListener(_call.CallEvent.Hangup, onCallHangup);
    call.removeListener(_call.CallEvent.Replaced, onCallReplaced);
    deviceMap.delete(opponentMemberId);
    if (deviceMap.size === 0) this.callHandlers.delete(opponentMemberId);
    if (call.hangupReason === _call.CallErrorCode.Replaced) {
      return;
    }
    const usermediaFeed = this.getUserMediaFeed(opponentMemberId, opponentDeviceId);
    if (usermediaFeed) {
      this.removeUserMediaFeed(usermediaFeed);
    }
    const screenshareFeed = this.getScreenshareFeed(opponentMemberId, opponentDeviceId);
    if (screenshareFeed) {
      this.removeScreenshareFeed(screenshareFeed);
    }
  }
  /*
   * UserMedia CallFeed Event Handlers
   */

  getUserMediaFeed(userId, deviceId) {
    return this.userMediaFeeds.find(f => f.userId === userId && f.deviceId === deviceId);
  }
  addUserMediaFeed(callFeed) {
    this.userMediaFeeds.push(callFeed);
    callFeed.measureVolumeActivity(true);
    this.emit(GroupCallEvent.UserMediaFeedsChanged, this.userMediaFeeds);
  }
  replaceUserMediaFeed(existingFeed, replacementFeed) {
    const feedIndex = this.userMediaFeeds.findIndex(f => f.userId === existingFeed.userId && f.deviceId === existingFeed.deviceId);
    if (feedIndex === -1) {
      throw new Error("Couldn't find user media feed to replace");
    }
    this.userMediaFeeds.splice(feedIndex, 1, replacementFeed);
    existingFeed.dispose();
    replacementFeed.measureVolumeActivity(true);
    this.emit(GroupCallEvent.UserMediaFeedsChanged, this.userMediaFeeds);
  }
  removeUserMediaFeed(callFeed) {
    const feedIndex = this.userMediaFeeds.findIndex(f => f.userId === callFeed.userId && f.deviceId === callFeed.deviceId);
    if (feedIndex === -1) {
      throw new Error("Couldn't find user media feed to remove");
    }
    this.userMediaFeeds.splice(feedIndex, 1);
    callFeed.dispose();
    this.emit(GroupCallEvent.UserMediaFeedsChanged, this.userMediaFeeds);
    if (this.activeSpeaker === callFeed) {
      this.activeSpeaker = this.userMediaFeeds[0];
      this.emit(GroupCallEvent.ActiveSpeakerChanged, this.activeSpeaker);
    }
  }
  /*
   * Screenshare Call Feed Event Handlers
   */

  getScreenshareFeed(userId, deviceId) {
    return this.screenshareFeeds.find(f => f.userId === userId && f.deviceId === deviceId);
  }
  addScreenshareFeed(callFeed) {
    this.screenshareFeeds.push(callFeed);
    this.emit(GroupCallEvent.ScreenshareFeedsChanged, this.screenshareFeeds);
  }
  replaceScreenshareFeed(existingFeed, replacementFeed) {
    const feedIndex = this.screenshareFeeds.findIndex(f => f.userId === existingFeed.userId && f.deviceId === existingFeed.deviceId);
    if (feedIndex === -1) {
      throw new Error("Couldn't find screenshare feed to replace");
    }
    this.screenshareFeeds.splice(feedIndex, 1, replacementFeed);
    existingFeed.dispose();
    this.emit(GroupCallEvent.ScreenshareFeedsChanged, this.screenshareFeeds);
  }
  removeScreenshareFeed(callFeed) {
    const feedIndex = this.screenshareFeeds.findIndex(f => f.userId === callFeed.userId && f.deviceId === callFeed.deviceId);
    if (feedIndex === -1) {
      throw new Error("Couldn't find screenshare feed to remove");
    }
    this.screenshareFeeds.splice(feedIndex, 1);
    callFeed.dispose();
    this.emit(GroupCallEvent.ScreenshareFeedsChanged, this.screenshareFeeds);
  }

  /**
   * Recalculates and updates the participant map to match the room state.
   */
  updateParticipants() {
    const localMember = this.room.getMember(this.client.getUserId());
    if (!localMember) {
      // The client hasn't fetched enough of the room state to get our own member
      // event. This probably shouldn't happen, but sanity check & exit for now.
      _logger.logger.warn(`GroupCall ${this.groupCallId} updateParticipants() tried to update participants before local room member is available`);
      return;
    }
    if (this.participantsExpirationTimer !== null) {
      clearTimeout(this.participantsExpirationTimer);
      this.participantsExpirationTimer = null;
    }
    if (this.state === GroupCallState.Ended) {
      this.participants = new Map();
      return;
    }
    const participants = new Map();
    const now = Date.now();
    const entered = this.state === GroupCallState.Entered || this.enteredViaAnotherSession;
    let nextExpiration = Infinity;
    for (const e of this.getMemberStateEvents()) {
      const member = this.room.getMember(e.getStateKey());
      const content = e.getContent();
      const calls = Array.isArray(content["m.calls"]) ? content["m.calls"] : [];
      const call = calls.find(call => call["m.call_id"] === this.groupCallId);
      const devices = Array.isArray(call?.["m.devices"]) ? call["m.devices"] : [];

      // Filter out invalid and expired devices
      let validDevices = devices.filter(d => typeof d.device_id === "string" && typeof d.session_id === "string" && typeof d.expires_ts === "number" && d.expires_ts > now && Array.isArray(d.feeds));

      // Apply local echo for the unentered case
      if (!entered && member?.userId === this.client.getUserId()) {
        validDevices = validDevices.filter(d => d.device_id !== this.client.getDeviceId());
      }

      // Must have a connected device and be joined to the room
      if (validDevices.length > 0 && member?.membership === _membership.KnownMembership.Join) {
        const deviceMap = new Map();
        participants.set(member, deviceMap);
        for (const d of validDevices) {
          deviceMap.set(d.device_id, {
            sessionId: d.session_id,
            screensharing: d.feeds.some(f => f.purpose === _callEventTypes.SDPStreamMetadataPurpose.Screenshare)
          });
          if (d.expires_ts < nextExpiration) nextExpiration = d.expires_ts;
        }
      }
    }

    // Apply local echo for the entered case
    if (entered) {
      let deviceMap = participants.get(localMember);
      if (deviceMap === undefined) {
        deviceMap = new Map();
        participants.set(localMember, deviceMap);
      }
      if (!deviceMap.has(this.client.getDeviceId())) {
        deviceMap.set(this.client.getDeviceId(), {
          sessionId: this.client.getSessionId(),
          screensharing: this.getLocalFeeds().some(f => f.purpose === _callEventTypes.SDPStreamMetadataPurpose.Screenshare)
        });
      }
    }
    this.participants = participants;
    if (nextExpiration < Infinity) {
      this.participantsExpirationTimer = setTimeout(() => this.updateParticipants(), nextExpiration - now);
    }
  }

  /**
   * Updates the local user's member state with the devices returned by the given function.
   * @param fn - A function from the current devices to the new devices. If it
   *   returns null, the update will be skipped.
   * @param keepAlive - Whether the request should outlive the window.
   */
  async updateDevices(fn, keepAlive = false) {
    const now = Date.now();
    const localUserId = this.client.getUserId();
    const event = this.getMemberStateEvents(localUserId);
    const content = event?.getContent() ?? {};
    const calls = Array.isArray(content["m.calls"]) ? content["m.calls"] : [];
    let call = null;
    const otherCalls = [];
    for (const c of calls) {
      if (c["m.call_id"] === this.groupCallId) {
        call = c;
      } else {
        otherCalls.push(c);
      }
    }
    if (call === null) call = {};
    const devices = Array.isArray(call["m.devices"]) ? call["m.devices"] : [];

    // Filter out invalid and expired devices
    const validDevices = devices.filter(d => typeof d.device_id === "string" && typeof d.session_id === "string" && typeof d.expires_ts === "number" && d.expires_ts > now && Array.isArray(d.feeds));
    const newDevices = fn(validDevices);
    if (newDevices === null) return;
    const newCalls = [...otherCalls];
    if (newDevices.length > 0) {
      newCalls.push(_objectSpread(_objectSpread({}, call), {}, {
        "m.call_id": this.groupCallId,
        "m.devices": newDevices
      }));
    }
    const newContent = {
      "m.calls": newCalls
    };
    await this.client.sendStateEvent(this.room.roomId, _event.EventType.GroupCallMemberPrefix, newContent, localUserId, {
      keepAlive
    });
  }
  async addDeviceToMemberState() {
    await this.updateDevices(devices => [...devices.filter(d => d.device_id !== this.client.getDeviceId()), {
      device_id: this.client.getDeviceId(),
      session_id: this.client.getSessionId(),
      expires_ts: Date.now() + DEVICE_TIMEOUT,
      feeds: this.getLocalFeeds().map(feed => ({
        purpose: feed.purpose
      }))
      // TODO: Add data channels
    }]);
  }
  async updateMemberState() {
    // Clear the old update interval before proceeding
    if (this.resendMemberStateTimer !== null) {
      clearInterval(this.resendMemberStateTimer);
      this.resendMemberStateTimer = null;
    }
    if (this.state === GroupCallState.Entered) {
      // Add the local device
      await this.addDeviceToMemberState();

      // Resend the state event every so often so it doesn't become stale
      this.resendMemberStateTimer = setInterval(async () => {
        _logger.logger.log(`GroupCall ${this.groupCallId} updateMemberState() resending call member state"`);
        try {
          await this.addDeviceToMemberState();
        } catch (e) {
          _logger.logger.error(`GroupCall ${this.groupCallId} updateMemberState() failed to resend call member state`, e);
        }
      }, DEVICE_TIMEOUT * 3 / 4);
    } else {
      // Remove the local device
      await this.updateDevices(devices => devices.filter(d => d.device_id !== this.client.getDeviceId()), true);
    }
  }

  /**
   * Cleans up our member state by filtering out logged out devices, inactive
   * devices, and our own device (if we know we haven't entered).
   */
  async cleanMemberState() {
    const {
      devices: myDevices
    } = await this.client.getDevices();
    const deviceMap = new Map(myDevices.map(d => [d.device_id, d]));

    // updateDevices takes care of filtering out inactive devices for us
    await this.updateDevices(devices => {
      const newDevices = devices.filter(d => {
        const device = deviceMap.get(d.device_id);
        return device?.last_seen_ts !== undefined && !(d.device_id === this.client.getDeviceId() && this.state !== GroupCallState.Entered && !this.enteredViaAnotherSession);
      });

      // Skip the update if the devices are unchanged
      return newDevices.length === devices.length ? null : newDevices;
    });
  }
  getGroupCallStats() {
    if (this.stats === undefined) {
      const userID = this.client.getUserId() || "unknown";
      this.stats = new _groupCallStats.GroupCallStats(this.groupCallId, userID, this.statsCollectIntervalTime);
      this.stats.reports.on(_statsReport.StatsReport.CONNECTION_STATS, this.onConnectionStats);
      this.stats.reports.on(_statsReport.StatsReport.BYTE_SENT_STATS, this.onByteSentStats);
      this.stats.reports.on(_statsReport.StatsReport.SUMMARY_STATS, this.onSummaryStats);
      this.stats.reports.on(_statsReport.StatsReport.CALL_FEED_REPORT, this.onCallFeedReport);
    }
    return this.stats;
  }
  setGroupCallStatsInterval(interval) {
    this.statsCollectIntervalTime = interval;
    if (this.stats !== undefined) {
      this.stats.stop();
      this.stats.setInterval(interval);
      if (interval > 0) {
        this.stats.start();
      }
    }
  }
}
exports.GroupCall = GroupCall;