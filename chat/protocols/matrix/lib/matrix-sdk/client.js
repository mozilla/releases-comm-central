"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UNSTABLE_MSC4140_DELAYED_EVENTS = exports.UNSTABLE_MSC3852_LAST_SEEN_UA = exports.UNSTABLE_MSC2666_SHARED_ROOMS = exports.UNSTABLE_MSC2666_QUERY_MUTUAL_ROOMS = exports.UNSTABLE_MSC2666_MUTUAL_ROOMS = exports.PendingEventOrdering = exports.MatrixClient = exports.GET_LOGIN_TOKEN_CAPABILITY = exports.ClientEvent = exports.CRYPTO_ENABLED = void 0;
exports.fixNotificationCountOnDecryption = fixNotificationCountOnDecryption;
exports.inMainTimelineForReceipt = inMainTimelineForReceipt;
exports.threadIdForReceipt = threadIdForReceipt;
var _sync = require("./sync");
var _event = require("./models/event");
var _stub = require("./store/stub");
var _call = require("./webrtc/call");
var _filter = require("./filter");
var _callEventHandler = require("./webrtc/callEventHandler");
var _groupCallEventHandler = require("./webrtc/groupCallEventHandler");
var _utils = _interopRequireWildcard(require("./utils"));
var utils = _utils;
var _eventTimeline = require("./models/event-timeline");
var _pushprocessor = require("./pushprocessor");
var _autodiscovery = require("./autodiscovery");
var olmlib = _interopRequireWildcard(require("./crypto/olmlib"));
var _base = require("./base64");
var _ReEmitter = require("./ReEmitter");
var _logger = require("./logger");
var _serviceTypes = require("./service-types");
var _httpApi = require("./http-api");
var _crypto = require("./crypto");
var _recoverykey = require("./crypto/recoverykey");
var _key_passphrase = require("./crypto/key_passphrase");
var _user = require("./models/user");
var _contentRepo = require("./content-repo");
var _searchResult = require("./models/search-result");
var _dehydration = require("./crypto/dehydration");
var _api = require("./crypto/api");
var ContentHelpers = _interopRequireWildcard(require("./content-helpers"));
var _room = require("./models/room");
var _roomMember = require("./models/room-member");
var _event2 = require("./@types/event");
var _partials = require("./@types/partials");
var _eventMapper = require("./event-mapper");
var _randomstring = require("./randomstring");
var _backup = require("./crypto/backup");
var _MSC3089TreeSpace = require("./models/MSC3089TreeSpace");
var _search = require("./@types/search");
var _PushRules = require("./@types/PushRules");
var _groupCall = require("./webrtc/groupCall");
var _mediaHandler = require("./webrtc/mediaHandler");
var _typedEventEmitter = require("./models/typed-event-emitter");
var _read_receipts = require("./@types/read_receipts");
var _slidingSyncSdk = require("./sliding-sync-sdk");
var _thread = require("./models/thread");
var _beacon = require("./@types/beacon");
var _NamespacedValue = require("./NamespacedValue");
var _ToDeviceMessageQueue = require("./ToDeviceMessageQueue");
var _invitesIgnorer = require("./models/invites-ignorer");
var _feature = require("./feature");
var _constants = require("./rust-crypto/constants");
var _secretStorage = require("./secret-storage");
var _MatrixRTCSessionManager = require("./matrixrtc/MatrixRTCSessionManager");
var _threadUtils = require("./thread-utils");
var _membership = require("./@types/membership");
var _serverCapabilities = require("./serverCapabilities");
var _digest = require("./digest");
const _excluded = ["server", "limit", "since"];
function _objectWithoutProperties(e, t) { if (null == e) return {}; var o, r, i = _objectWithoutPropertiesLoose(e, t); if (Object.getOwnPropertySymbols) { var n = Object.getOwnPropertySymbols(e); for (r = 0; r < n.length; r++) o = n[r], t.indexOf(o) >= 0 || {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]); } return i; }
function _objectWithoutPropertiesLoose(r, e) { if (null == r) return {}; var t = {}; for (var n in r) if ({}.hasOwnProperty.call(r, n)) { if (e.indexOf(n) >= 0) continue; t[n] = r[n]; } return t; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2015-2023 The Matrix.org Foundation C.I.C.

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
 * This is an internal module. See {@link MatrixClient} for the public class.
 */
const SCROLLBACK_DELAY_MS = 3000;
const CRYPTO_ENABLED = exports.CRYPTO_ENABLED = (0, _crypto.isCryptoAvailable)();
const TURN_CHECK_INTERVAL = 10 * 60 * 1000; // poll for turn credentials every 10 minutes

const UNSTABLE_MSC3852_LAST_SEEN_UA = exports.UNSTABLE_MSC3852_LAST_SEEN_UA = new _NamespacedValue.UnstableValue("last_seen_user_agent", "org.matrix.msc3852.last_seen_user_agent");
let PendingEventOrdering = exports.PendingEventOrdering = /*#__PURE__*/function (PendingEventOrdering) {
  PendingEventOrdering["Chronological"] = "chronological";
  PendingEventOrdering["Detached"] = "detached";
  return PendingEventOrdering;
}({});
const GET_LOGIN_TOKEN_CAPABILITY = exports.GET_LOGIN_TOKEN_CAPABILITY = new _NamespacedValue.NamespacedValue("m.get_login_token", "org.matrix.msc3882.get_login_token");
const UNSTABLE_MSC2666_SHARED_ROOMS = exports.UNSTABLE_MSC2666_SHARED_ROOMS = "uk.half-shot.msc2666";
const UNSTABLE_MSC2666_MUTUAL_ROOMS = exports.UNSTABLE_MSC2666_MUTUAL_ROOMS = "uk.half-shot.msc2666.mutual_rooms";
const UNSTABLE_MSC2666_QUERY_MUTUAL_ROOMS = exports.UNSTABLE_MSC2666_QUERY_MUTUAL_ROOMS = "uk.half-shot.msc2666.query_mutual_rooms";
const UNSTABLE_MSC4140_DELAYED_EVENTS = exports.UNSTABLE_MSC4140_DELAYED_EVENTS = "org.matrix.msc4140";
var CrossSigningKeyType = /*#__PURE__*/function (CrossSigningKeyType) {
  CrossSigningKeyType["MasterKey"] = "master_key";
  CrossSigningKeyType["SelfSigningKey"] = "self_signing_key";
  CrossSigningKeyType["UserSigningKey"] = "user_signing_key";
  return CrossSigningKeyType;
}(CrossSigningKeyType || {}); // Re-export for backwards compatibility
/**
 * The summary of a room as defined by an initial version of MSC3266 and implemented in Synapse
 * Proposed at https://github.com/matrix-org/matrix-doc/pull/3266
 */
/* eslint-enable camelcase */

// We're using this constant for methods overloading and inspect whether a variable
// contains an eventId or not. This was required to ensure backwards compatibility
// of methods for threads
// Probably not the most graceful solution but does a good enough job for now
const EVENT_ID_PREFIX = "$";
let ClientEvent = exports.ClientEvent = /*#__PURE__*/function (ClientEvent) {
  ClientEvent["Sync"] = "sync";
  ClientEvent["Event"] = "event";
  ClientEvent["ToDeviceEvent"] = "toDeviceEvent";
  ClientEvent["AccountData"] = "accountData";
  ClientEvent["Room"] = "Room";
  ClientEvent["DeleteRoom"] = "deleteRoom";
  ClientEvent["SyncUnexpectedError"] = "sync.unexpectedError";
  ClientEvent["ClientWellKnown"] = "WellKnown.client";
  ClientEvent["ReceivedVoipEvent"] = "received_voip_event";
  ClientEvent["UndecryptableToDeviceEvent"] = "toDeviceEvent.undecryptable";
  ClientEvent["TurnServers"] = "turnServers";
  ClientEvent["TurnServersError"] = "turnServers.error";
  return ClientEvent;
}({});
const SSO_ACTION_PARAM = new _NamespacedValue.UnstableValue("action", "org.matrix.msc3824.action");

/**
 * Represents a Matrix Client. Only directly construct this if you want to use
 * custom modules. Normally, {@link createClient} should be used
 * as it specifies 'sensible' defaults for these modules.
 */
class MatrixClient extends _typedEventEmitter.TypedEventEmitter {
  constructor(opts) {
    super();

    // If a custom logger is provided, use it. Otherwise, default to the global
    // one in logger.ts.
    _defineProperty(this, "logger", void 0);
    _defineProperty(this, "reEmitter", new _ReEmitter.TypedReEmitter(this));
    _defineProperty(this, "olmVersion", null);
    // populated after initCrypto
    _defineProperty(this, "usingExternalCrypto", false);
    _defineProperty(this, "_store", void 0);
    _defineProperty(this, "deviceId", void 0);
    _defineProperty(this, "credentials", void 0);
    /**
     * Encryption key used for encrypting sensitive data (such as e2ee keys) in storage.
     *
     * As supplied in the constructor via {@link IMatrixClientCreateOpts#pickleKey}.
     *
     * If unset, either a hardcoded key or no encryption at all is used, depending on the Crypto implementation.
     *
     * @deprecated this should be a private property.
     */
    _defineProperty(this, "pickleKey", void 0);
    _defineProperty(this, "scheduler", void 0);
    _defineProperty(this, "clientRunning", false);
    _defineProperty(this, "timelineSupport", false);
    _defineProperty(this, "urlPreviewCache", {});
    _defineProperty(this, "identityServer", void 0);
    _defineProperty(this, "http", void 0);
    // XXX: Intended private, used in code.
    /**
     * The libolm crypto implementation, if it is in use.
     *
     * @deprecated This should not be used. Instead, use the methods exposed directly on this class or
     * (where they are available) via {@link getCrypto}.
     */
    _defineProperty(this, "crypto", void 0);
    // XXX: Intended private, used in code. Being replaced by cryptoBackend
    _defineProperty(this, "cryptoBackend", void 0);
    // one of crypto or rustCrypto
    _defineProperty(this, "cryptoCallbacks", void 0);
    // XXX: Intended private, used in code.
    _defineProperty(this, "callEventHandler", void 0);
    // XXX: Intended private, used in code.
    _defineProperty(this, "groupCallEventHandler", void 0);
    _defineProperty(this, "supportsCallTransfer", false);
    // XXX: Intended private, used in code.
    _defineProperty(this, "forceTURN", false);
    // XXX: Intended private, used in code.
    _defineProperty(this, "iceCandidatePoolSize", 0);
    // XXX: Intended private, used in code.
    _defineProperty(this, "idBaseUrl", void 0);
    _defineProperty(this, "baseUrl", void 0);
    _defineProperty(this, "isVoipWithNoMediaAllowed", void 0);
    _defineProperty(this, "useLivekitForGroupCalls", void 0);
    // Note: these are all `protected` to let downstream consumers make mistakes if they want to.
    // We don't technically support this usage, but have reasons to do this.
    _defineProperty(this, "canSupportVoip", false);
    _defineProperty(this, "peekSync", null);
    _defineProperty(this, "isGuestAccount", false);
    _defineProperty(this, "ongoingScrollbacks", {});
    _defineProperty(this, "notifTimelineSet", null);
    _defineProperty(this, "cryptoStore", void 0);
    _defineProperty(this, "verificationMethods", void 0);
    _defineProperty(this, "fallbackICEServerAllowed", false);
    _defineProperty(this, "syncApi", void 0);
    _defineProperty(this, "roomNameGenerator", void 0);
    _defineProperty(this, "pushRules", void 0);
    _defineProperty(this, "syncLeftRoomsPromise", void 0);
    _defineProperty(this, "syncedLeftRooms", false);
    _defineProperty(this, "clientOpts", void 0);
    _defineProperty(this, "clientWellKnownIntervalID", void 0);
    _defineProperty(this, "canResetTimelineCallback", void 0);
    _defineProperty(this, "canSupport", new Map());
    // The pushprocessor caches useful things, so keep one and re-use it
    _defineProperty(this, "pushProcessor", new _pushprocessor.PushProcessor(this));
    // Promise to a response of the server's /versions response
    // TODO: This should expire: https://github.com/matrix-org/matrix-js-sdk/issues/1020
    _defineProperty(this, "serverVersionsPromise", void 0);
    _defineProperty(this, "clientWellKnown", void 0);
    _defineProperty(this, "clientWellKnownPromise", void 0);
    _defineProperty(this, "turnServers", []);
    _defineProperty(this, "turnServersExpiry", 0);
    _defineProperty(this, "checkTurnServersIntervalID", void 0);
    _defineProperty(this, "exportedOlmDeviceToImport", void 0);
    _defineProperty(this, "txnCtr", 0);
    _defineProperty(this, "mediaHandler", new _mediaHandler.MediaHandler(this));
    _defineProperty(this, "sessionId", void 0);
    /** IDs of events which are currently being encrypted.
     *
     * This is part of the cancellation mechanism: if the event is no longer listed here when encryption completes,
     * that tells us that it has been cancelled, and we should not send it.
     */
    _defineProperty(this, "eventsBeingEncrypted", new Set());
    _defineProperty(this, "useE2eForGroupCall", true);
    _defineProperty(this, "toDeviceMessageQueue", void 0);
    _defineProperty(this, "livekitServiceURL", void 0);
    _defineProperty(this, "_secretStorage", void 0);
    // A manager for determining which invites should be ignored.
    _defineProperty(this, "ignoredInvites", void 0);
    _defineProperty(this, "matrixRTC", void 0);
    _defineProperty(this, "serverCapabilitiesService", void 0);
    _defineProperty(this, "startCallEventHandler", () => {
      if (this.isInitialSyncComplete()) {
        if ((0, _call.supportsMatrixCall)()) {
          this.callEventHandler.start();
          this.groupCallEventHandler.start();
        }
        this.off(ClientEvent.Sync, this.startCallEventHandler);
      }
    });
    _defineProperty(this, "startMatrixRTC", () => {
      if (this.isInitialSyncComplete()) {
        this.matrixRTC.start();
        this.off(ClientEvent.Sync, this.startMatrixRTC);
      }
    });
    /**
     * Once the client has been initialised, we want to clear notifications we
     * know for a fact should be here.
     * This issue should also be addressed on synapse's side and is tracked as part
     * of https://github.com/matrix-org/synapse/issues/14837
     *
     * We consider a room or a thread as fully read if the current user has sent
     * the last event in the live timeline of that context and if the read receipt
     * we have on record matches.
     */
    _defineProperty(this, "fixupRoomNotifications", () => {
      if (this.isInitialSyncComplete()) {
        const unreadRooms = (this.getRooms() ?? []).filter(room => {
          return room.getUnreadNotificationCount(_room.NotificationCountType.Total) > 0;
        });
        for (const room of unreadRooms) {
          const currentUserId = this.getSafeUserId();
          room.fixupNotifications(currentUserId);
        }
        this.off(ClientEvent.Sync, this.fixupRoomNotifications);
      }
    });
    this.logger = opts.logger ?? _logger.logger;
    opts.baseUrl = utils.ensureNoTrailingSlash(opts.baseUrl);
    opts.idBaseUrl = utils.ensureNoTrailingSlash(opts.idBaseUrl);
    this.baseUrl = opts.baseUrl;
    this.idBaseUrl = opts.idBaseUrl;
    this.identityServer = opts.identityServer;
    this.usingExternalCrypto = opts.usingExternalCrypto ?? false;
    this.store = opts.store || new _stub.StubStore();
    this.deviceId = opts.deviceId || null;
    this.sessionId = (0, _randomstring.randomString)(10);
    const userId = opts.userId || null;
    this.credentials = {
      userId
    };
    this.http = new _httpApi.MatrixHttpApi(this, {
      fetchFn: opts.fetchFn,
      baseUrl: opts.baseUrl,
      idBaseUrl: opts.idBaseUrl,
      accessToken: opts.accessToken,
      refreshToken: opts.refreshToken,
      tokenRefreshFunction: opts.tokenRefreshFunction,
      prefix: _httpApi.ClientPrefix.V3,
      onlyData: true,
      extraParams: opts.queryParams,
      localTimeoutMs: opts.localTimeoutMs,
      useAuthorizationHeader: opts.useAuthorizationHeader,
      logger: this.logger
    });
    if (opts.deviceToImport) {
      if (this.deviceId) {
        this.logger.warn("not importing device because device ID is provided to " + "constructor independently of exported data");
      } else if (this.credentials.userId) {
        this.logger.warn("not importing device because user ID is provided to " + "constructor independently of exported data");
      } else if (!opts.deviceToImport.deviceId) {
        this.logger.warn("not importing device because no device ID in exported data");
      } else {
        this.deviceId = opts.deviceToImport.deviceId;
        this.credentials.userId = opts.deviceToImport.userId;
        // will be used during async initialization of the crypto
        this.exportedOlmDeviceToImport = opts.deviceToImport.olmDevice;
      }
    } else if (opts.pickleKey) {
      this.pickleKey = opts.pickleKey;
    }
    this.useLivekitForGroupCalls = Boolean(opts.useLivekitForGroupCalls);
    this.scheduler = opts.scheduler;
    if (this.scheduler) {
      this.scheduler.setProcessFunction(async eventToSend => {
        const room = this.getRoom(eventToSend.getRoomId());
        if (eventToSend.status !== _event.EventStatus.SENDING) {
          this.updatePendingEventStatus(room, eventToSend, _event.EventStatus.SENDING);
        }
        const res = await this.sendEventHttpRequest(eventToSend);
        if (room) {
          // ensure we update pending event before the next scheduler run so that any listeners to event id
          // updates on the synchronous event emitter get a chance to run first.
          room.updatePendingEvent(eventToSend, _event.EventStatus.SENT, res.event_id);
        }
        return res;
      });
    }
    if ((0, _call.supportsMatrixCall)()) {
      this.callEventHandler = new _callEventHandler.CallEventHandler(this);
      this.groupCallEventHandler = new _groupCallEventHandler.GroupCallEventHandler(this);
      this.canSupportVoip = true;
      // Start listening for calls after the initial sync is done
      // We do not need to backfill the call event buffer
      // with encrypted events that might never get decrypted
      this.on(ClientEvent.Sync, this.startCallEventHandler);
    }

    // NB. We initialise MatrixRTC whether we have call support or not: this is just
    // the underlying session management and doesn't use any actual media capabilities
    this.matrixRTC = new _MatrixRTCSessionManager.MatrixRTCSessionManager(this);
    this.serverCapabilitiesService = new _serverCapabilities.ServerCapabilities(this.http);
    this.on(ClientEvent.Sync, this.fixupRoomNotifications);
    this.timelineSupport = Boolean(opts.timelineSupport);
    this.cryptoStore = opts.cryptoStore;
    this.verificationMethods = opts.verificationMethods;
    this.cryptoCallbacks = opts.cryptoCallbacks || {};
    this.forceTURN = opts.forceTURN || false;
    this.iceCandidatePoolSize = opts.iceCandidatePoolSize === undefined ? 0 : opts.iceCandidatePoolSize;
    this.supportsCallTransfer = opts.supportsCallTransfer || false;
    this.fallbackICEServerAllowed = opts.fallbackICEServerAllowed || false;
    this.isVoipWithNoMediaAllowed = opts.isVoipWithNoMediaAllowed || false;
    if (opts.useE2eForGroupCall !== undefined) this.useE2eForGroupCall = opts.useE2eForGroupCall;
    this.livekitServiceURL = opts.livekitServiceURL;
    this.roomNameGenerator = opts.roomNameGenerator;
    this.toDeviceMessageQueue = new _ToDeviceMessageQueue.ToDeviceMessageQueue(this);

    // The SDK doesn't really provide a clean way for events to recalculate the push
    // actions for themselves, so we have to kinda help them out when they are encrypted.
    // We do this so that push rules are correctly executed on events in their decrypted
    // state, such as highlights when the user's name is mentioned.
    this.on(_event.MatrixEventEvent.Decrypted, event => {
      fixNotificationCountOnDecryption(this, event);
    });
    this.ignoredInvites = new _invitesIgnorer.IgnoredInvites(this);
    this._secretStorage = new _secretStorage.ServerSideSecretStorageImpl(this, opts.cryptoCallbacks ?? {});

    // having lots of event listeners is not unusual. 0 means "unlimited".
    this.setMaxListeners(0);
  }
  set store(newStore) {
    this._store = newStore;
    this._store.setUserCreator(userId => _user.User.createUser(userId, this));
  }
  get store() {
    return this._store;
  }

  /**
   * High level helper method to begin syncing and poll for new events. To listen for these
   * events, add a listener for {@link ClientEvent.Event}
   * via {@link MatrixClient#on}. Alternatively, listen for specific
   * state change events.
   * @param opts - Options to apply when syncing.
   */
  async startClient(opts) {
    if (this.clientRunning) {
      // client is already running.
      return;
    }
    this.clientRunning = true;
    this.on(ClientEvent.Sync, this.startMatrixRTC);

    // Create our own user object artificially (instead of waiting for sync)
    // so it's always available, even if the user is not in any rooms etc.
    const userId = this.getUserId();
    if (userId) {
      this.store.storeUser(new _user.User(userId));
    }

    // periodically poll for turn servers if we support voip
    if (this.canSupportVoip) {
      this.checkTurnServersIntervalID = setInterval(() => {
        this.checkTurnServers();
      }, TURN_CHECK_INTERVAL);
      // noinspection ES6MissingAwait
      this.checkTurnServers();
    }
    if (this.syncApi) {
      // This shouldn't happen since we thought the client was not running
      this.logger.error("Still have sync object whilst not running: stopping old one");
      this.syncApi.stop();
    }
    try {
      await this.getVersions();

      // This should be done with `canSupport`
      // TODO: https://github.com/vector-im/element-web/issues/23643
      const {
        threads,
        list,
        fwdPagination
      } = await this.doesServerSupportThread();
      _thread.Thread.setServerSideSupport(threads);
      _thread.Thread.setServerSideListSupport(list);
      _thread.Thread.setServerSideFwdPaginationSupport(fwdPagination);
    } catch (e) {
      this.logger.error("Can't fetch server versions, continuing to initialise sync, this will be retried later", e);
    }
    this.clientOpts = opts ?? {};
    if (this.clientOpts.slidingSync) {
      this.syncApi = new _slidingSyncSdk.SlidingSyncSdk(this.clientOpts.slidingSync, this, this.clientOpts, this.buildSyncApiOptions());
    } else {
      this.syncApi = new _sync.SyncApi(this, this.clientOpts, this.buildSyncApiOptions());
    }
    this.syncApi.sync().catch(e => this.logger.info("Sync startup aborted with an error:", e));
    if (this.clientOpts.clientWellKnownPollPeriod !== undefined) {
      this.clientWellKnownIntervalID = setInterval(() => {
        this.fetchClientWellKnown();
      }, 1000 * this.clientOpts.clientWellKnownPollPeriod);
      this.fetchClientWellKnown();
    }
    this.toDeviceMessageQueue.start();
    this.serverCapabilitiesService.start();
  }

  /**
   * Construct a SyncApiOptions for this client, suitable for passing into the SyncApi constructor
   */
  buildSyncApiOptions() {
    return {
      crypto: this.crypto,
      cryptoCallbacks: this.cryptoBackend,
      canResetEntireTimeline: roomId => {
        if (!this.canResetTimelineCallback) {
          return false;
        }
        return this.canResetTimelineCallback(roomId);
      }
    };
  }

  /**
   * High level helper method to stop the client from polling and allow a
   * clean shutdown.
   */
  stopClient() {
    this.cryptoBackend?.stop(); // crypto might have been initialised even if the client wasn't fully started

    this.off(ClientEvent.Sync, this.startMatrixRTC);
    if (!this.clientRunning) return; // already stopped

    this.logger.debug("stopping MatrixClient");
    this.clientRunning = false;
    this.syncApi?.stop();
    this.syncApi = undefined;
    this.peekSync?.stopPeeking();
    this.callEventHandler?.stop();
    this.groupCallEventHandler?.stop();
    this.callEventHandler = undefined;
    this.groupCallEventHandler = undefined;
    global.clearInterval(this.checkTurnServersIntervalID);
    this.checkTurnServersIntervalID = undefined;
    if (this.clientWellKnownIntervalID !== undefined) {
      global.clearInterval(this.clientWellKnownIntervalID);
    }
    this.toDeviceMessageQueue.stop();
    this.matrixRTC.stop();
    this.serverCapabilitiesService.stop();
  }

  /**
   * Try to rehydrate a device if available.  The client must have been
   * initialized with a `cryptoCallback.getDehydrationKey` option, and this
   * function must be called before initCrypto and startClient are called.
   *
   * @returns Promise which resolves to undefined if a device could not be dehydrated, or
   *     to the new device ID if the dehydration was successful.
   * @returns Rejects: with an error response.
   */
  async rehydrateDevice() {
    if (this.crypto) {
      throw new Error("Cannot rehydrate device after crypto is initialized");
    }
    if (!this.cryptoCallbacks.getDehydrationKey) {
      return;
    }
    const getDeviceResult = await this.getDehydratedDevice();
    if (!getDeviceResult) {
      return;
    }
    if (!getDeviceResult.device_data || !getDeviceResult.device_id) {
      this.logger.info("no dehydrated device found");
      return;
    }
    const account = new global.Olm.Account();
    try {
      const deviceData = getDeviceResult.device_data;
      if (deviceData.algorithm !== _dehydration.DEHYDRATION_ALGORITHM) {
        this.logger.warn("Wrong algorithm for dehydrated device");
        return;
      }
      this.logger.debug("unpickling dehydrated device");
      const key = await this.cryptoCallbacks.getDehydrationKey(deviceData, k => {
        // copy the key so that it doesn't get clobbered
        account.unpickle(new Uint8Array(k), deviceData.account);
      });
      account.unpickle(key, deviceData.account);
      this.logger.debug("unpickled device");
      const rehydrateResult = await this.http.authedRequest(_httpApi.Method.Post, "/dehydrated_device/claim", undefined, {
        device_id: getDeviceResult.device_id
      }, {
        prefix: "/_matrix/client/unstable/org.matrix.msc2697.v2"
      });
      if (rehydrateResult.success) {
        this.deviceId = getDeviceResult.device_id;
        this.logger.info("using dehydrated device");
        const pickleKey = this.pickleKey || "DEFAULT_KEY";
        this.exportedOlmDeviceToImport = {
          pickledAccount: account.pickle(pickleKey),
          sessions: [],
          pickleKey: pickleKey
        };
        account.free();
        return this.deviceId;
      } else {
        account.free();
        this.logger.info("not using dehydrated device");
        return;
      }
    } catch (e) {
      account.free();
      this.logger.warn("could not unpickle", e);
    }
  }

  /**
   * Get the current dehydrated device, if any
   * @returns A promise of an object containing the dehydrated device
   */
  async getDehydratedDevice() {
    try {
      return await this.http.authedRequest(_httpApi.Method.Get, "/dehydrated_device", undefined, undefined, {
        prefix: "/_matrix/client/unstable/org.matrix.msc2697.v2"
      });
    } catch (e) {
      this.logger.info("could not get dehydrated device", e);
      return;
    }
  }

  /**
   * Set the dehydration key.  This will also periodically dehydrate devices to
   * the server.
   *
   * @param key - the dehydration key
   * @param keyInfo - Information about the key.  Primarily for
   *     information about how to generate the key from a passphrase.
   * @param deviceDisplayName - The device display name for the
   *     dehydrated device.
   * @returns A promise that resolves when the dehydrated device is stored.
   */
  async setDehydrationKey(key, keyInfo, deviceDisplayName) {
    if (!this.crypto) {
      this.logger.warn("not dehydrating device if crypto is not enabled");
      return;
    }
    return this.crypto.dehydrationManager.setKeyAndQueueDehydration(key, keyInfo, deviceDisplayName);
  }

  /**
   * Creates a new dehydrated device (without queuing periodic dehydration)
   * @param key - the dehydration key
   * @param keyInfo - Information about the key.  Primarily for
   *     information about how to generate the key from a passphrase.
   * @param deviceDisplayName - The device display name for the
   *     dehydrated device.
   * @returns the device id of the newly created dehydrated device
   */
  async createDehydratedDevice(key, keyInfo, deviceDisplayName) {
    if (!this.crypto) {
      this.logger.warn("not dehydrating device if crypto is not enabled");
      return;
    }
    await this.crypto.dehydrationManager.setKey(key, keyInfo, deviceDisplayName);
    return this.crypto.dehydrationManager.dehydrateDevice();
  }
  async exportDevice() {
    if (!this.crypto) {
      this.logger.warn("not exporting device if crypto is not enabled");
      return;
    }
    return {
      userId: this.credentials.userId,
      deviceId: this.deviceId,
      // XXX: Private member access.
      olmDevice: await this.crypto.olmDevice.export()
    };
  }

  /**
   * Clear any data out of the persistent stores used by the client.
   *
   * @returns Promise which resolves when the stores have been cleared.
   */
  clearStores() {
    if (this.clientRunning) {
      throw new Error("Cannot clear stores while client is running");
    }
    const promises = [];
    promises.push(this.store.deleteAllData());
    if (this.cryptoStore) {
      promises.push(this.cryptoStore.deleteAllData());
    }

    // delete the stores used by the rust matrix-sdk-crypto, in case they were used
    const deleteRustSdkStore = async () => {
      let indexedDB;
      try {
        indexedDB = global.indexedDB;
        if (!indexedDB) return; // No indexedDB support
      } catch (e) {
        // No indexedDB support
        return;
      }
      for (const dbname of [`${_constants.RUST_SDK_STORE_PREFIX}::matrix-sdk-crypto`, `${_constants.RUST_SDK_STORE_PREFIX}::matrix-sdk-crypto-meta`]) {
        const prom = new Promise((resolve, reject) => {
          this.logger.info(`Removing IndexedDB instance ${dbname}`);
          const req = indexedDB.deleteDatabase(dbname);
          req.onsuccess = _ => {
            this.logger.info(`Removed IndexedDB instance ${dbname}`);
            resolve(0);
          };
          req.onerror = e => {
            // In private browsing, Firefox has a global.indexedDB, but attempts to delete an indexeddb
            // (even a non-existent one) fail with "DOMException: A mutation operation was attempted on a
            // database that did not allow mutations."
            //
            // it seems like the only thing we can really do is ignore the error.
            this.logger.warn(`Failed to remove IndexedDB instance ${dbname}:`, e);
            resolve(0);
          };
          req.onblocked = e => {
            this.logger.info(`cannot yet remove IndexedDB instance ${dbname}`);
          };
        });
        await prom;
      }
    };
    promises.push(deleteRustSdkStore());
    return Promise.all(promises).then(); // .then to fix types
  }

  /**
   * Get the user-id of the logged-in user
   *
   * @returns MXID for the logged-in user, or null if not logged in
   */
  getUserId() {
    if (this.credentials && this.credentials.userId) {
      return this.credentials.userId;
    }
    return null;
  }

  /**
   * Get the user-id of the logged-in user
   *
   * @returns MXID for the logged-in user
   * @throws Error if not logged in
   */
  getSafeUserId() {
    const userId = this.getUserId();
    if (!userId) {
      throw new Error("Expected logged in user but found none.");
    }
    return userId;
  }

  /**
   * Get the domain for this client's MXID
   * @returns Domain of this MXID
   */
  getDomain() {
    if (this.credentials && this.credentials.userId) {
      return this.credentials.userId.replace(/^.*?:/, "");
    }
    return null;
  }

  /**
   * Get the local part of the current user ID e.g. "foo" in "\@foo:bar".
   * @returns The user ID localpart or null.
   */
  getUserIdLocalpart() {
    if (this.credentials && this.credentials.userId) {
      return this.credentials.userId.split(":")[0].substring(1);
    }
    return null;
  }

  /**
   * Get the device ID of this client
   * @returns device ID
   */
  getDeviceId() {
    return this.deviceId;
  }

  /**
   * Get the session ID of this client
   * @returns session ID
   */
  getSessionId() {
    return this.sessionId;
  }

  /**
   * Check if the runtime environment supports VoIP calling.
   * @returns True if VoIP is supported.
   */
  supportsVoip() {
    return this.canSupportVoip;
  }

  /**
   * @returns
   */
  getMediaHandler() {
    return this.mediaHandler;
  }

  /**
   * Set whether VoIP calls are forced to use only TURN
   * candidates. This is the same as the forceTURN option
   * when creating the client.
   * @param force - True to force use of TURN servers
   */
  setForceTURN(force) {
    this.forceTURN = force;
  }

  /**
   * Set whether to advertise transfer support to other parties on Matrix calls.
   * @param support - True to advertise the 'm.call.transferee' capability
   */
  setSupportsCallTransfer(support) {
    this.supportsCallTransfer = support;
  }

  /**
   * Returns true if to-device signalling for group calls will be encrypted with Olm.
   * If false, it will be sent unencrypted.
   * @returns boolean Whether group call signalling will be encrypted
   */
  getUseE2eForGroupCall() {
    return this.useE2eForGroupCall;
  }

  /**
   * Creates a new call.
   * The place*Call methods on the returned call can be used to actually place a call
   *
   * @param roomId - The room the call is to be placed in.
   * @returns the call or null if the browser doesn't support calling.
   */
  createCall(roomId) {
    return (0, _call.createNewMatrixCall)(this, roomId);
  }

  /**
   * Creates a new group call and sends the associated state event
   * to alert other members that the room now has a group call.
   *
   * @param roomId - The room the call is to be placed in.
   */
  async createGroupCall(roomId, type, isPtt, intent, dataChannelsEnabled, dataChannelOptions) {
    if (this.getGroupCallForRoom(roomId)) {
      throw new Error(`${roomId} already has an existing group call`);
    }
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error(`Cannot find room ${roomId}`);
    }

    // Because without Media section a WebRTC connection is not possible, so need a RTCDataChannel to set up a
    // no media WebRTC connection anyway.
    return new _groupCall.GroupCall(this, room, type, isPtt, intent, undefined, dataChannelsEnabled || this.isVoipWithNoMediaAllowed, dataChannelOptions, this.isVoipWithNoMediaAllowed, this.useLivekitForGroupCalls, this.livekitServiceURL).create();
  }
  getLivekitServiceURL() {
    return this.livekitServiceURL;
  }

  // This shouldn't need to exist, but the widget API has startup ordering problems that
  // mean it doesn't know the livekit URL fast enough: remove this once this is fixed.
  setLivekitServiceURL(newURL) {
    this.livekitServiceURL = newURL;
  }

  /**
   * Wait until an initial state for the given room has been processed by the
   * client and the client is aware of any ongoing group calls. Awaiting on
   * the promise returned by this method before calling getGroupCallForRoom()
   * avoids races where getGroupCallForRoom is called before the state for that
   * room has been processed. It does not, however, fix other races, eg. two
   * clients both creating a group call at the same time.
   * @param roomId - The room ID to wait for
   * @returns A promise that resolves once existing group calls in the room
   *          have been processed.
   */
  waitUntilRoomReadyForGroupCalls(roomId) {
    return this.groupCallEventHandler.waitUntilRoomReadyForGroupCalls(roomId);
  }

  /**
   * Get an existing group call for the provided room.
   * @returns The group call or null if it doesn't already exist.
   */
  getGroupCallForRoom(roomId) {
    return this.groupCallEventHandler.groupCalls.get(roomId) || null;
  }

  /**
   * Get the current sync state.
   * @returns the sync state, which may be null.
   * @see MatrixClient#event:"sync"
   */
  getSyncState() {
    return this.syncApi?.getSyncState() ?? null;
  }

  /**
   * Returns the additional data object associated with
   * the current sync state, or null if there is no
   * such data.
   * Sync errors, if available, are put in the 'error' key of
   * this object.
   */
  getSyncStateData() {
    if (!this.syncApi) {
      return null;
    }
    return this.syncApi.getSyncStateData();
  }

  /**
   * Whether the initial sync has completed.
   * @returns True if at least one sync has happened.
   */
  isInitialSyncComplete() {
    const state = this.getSyncState();
    if (!state) {
      return false;
    }
    return state === _sync.SyncState.Prepared || state === _sync.SyncState.Syncing;
  }

  /**
   * Return whether the client is configured for a guest account.
   * @returns True if this is a guest access_token (or no token is supplied).
   */
  isGuest() {
    return this.isGuestAccount;
  }

  /**
   * Set whether this client is a guest account. <b>This method is experimental
   * and may change without warning.</b>
   * @param guest - True if this is a guest account.
   * @experimental if the token is a macaroon, it should be encoded in it that it is a 'guest'
   * access token, which means that the SDK can determine this entirely without
   * the dev manually flipping this flag.
   */
  setGuest(guest) {
    this.isGuestAccount = guest;
  }

  /**
   * Return the provided scheduler, if any.
   * @returns The scheduler or undefined
   */
  getScheduler() {
    return this.scheduler;
  }

  /**
   * Retry a backed off syncing request immediately. This should only be used when
   * the user <b>explicitly</b> attempts to retry their lost connection.
   * Will also retry any outbound to-device messages currently in the queue to be sent
   * (retries of regular outgoing events are handled separately, per-event).
   * @returns True if this resulted in a request being retried.
   */
  retryImmediately() {
    // don't await for this promise: we just want to kick it off
    this.toDeviceMessageQueue.sendQueue();
    return this.syncApi?.retryImmediately() ?? false;
  }

  /**
   * Return the global notification EventTimelineSet, if any
   *
   * @returns the globl notification EventTimelineSet
   */
  getNotifTimelineSet() {
    return this.notifTimelineSet;
  }

  /**
   * Set the global notification EventTimelineSet
   *
   */
  setNotifTimelineSet(set) {
    this.notifTimelineSet = set;
  }

  /**
   * Gets the cached capabilities of the homeserver, returning cached ones if available.
   * If there are no cached capabilities and none can be fetched, throw an exception.
   *
   * @returns Promise resolving with The capabilities of the homeserver
   */
  async getCapabilities() {
    const caps = this.serverCapabilitiesService.getCachedCapabilities();
    if (caps) return caps;
    return this.serverCapabilitiesService.fetchCapabilities();
  }

  /**
   * Gets the cached capabilities of the homeserver. If none have been fetched yet,
   * return undefined.
   *
   * @returns The capabilities of the homeserver
   */
  getCachedCapabilities() {
    return this.serverCapabilitiesService.getCachedCapabilities();
  }

  /**
   * Fetches the latest capabilities from the homeserver, ignoring any cached
   * versions. The newly returned version is cached.
   *
   * @returns A promise which resolves to the capabilities of the homeserver
   */
  fetchCapabilities() {
    return this.serverCapabilitiesService.fetchCapabilities();
  }

  /**
   * Initialise support for end-to-end encryption in this client, using libolm.
   *
   * You should call this method after creating the matrixclient, but *before*
   * calling `startClient`, if you want to support end-to-end encryption.
   *
   * It will return a Promise which will resolve when the crypto layer has been
   * successfully initialised.
   */
  async initCrypto() {
    if (!(0, _crypto.isCryptoAvailable)()) {
      throw new Error(`End-to-end encryption not supported in this js-sdk build: did ` + `you remember to load the olm library?`);
    }
    if (this.cryptoBackend) {
      this.logger.warn("Attempt to re-initialise e2e encryption on MatrixClient");
      return;
    }
    if (!this.cryptoStore) {
      // the cryptostore is provided by sdk.createClient, so this shouldn't happen
      throw new Error(`Cannot enable encryption: no cryptoStore provided`);
    }
    this.logger.debug("Crypto: Starting up crypto store...");
    await this.cryptoStore.startup();
    const userId = this.getUserId();
    if (userId === null) {
      throw new Error(`Cannot enable encryption on MatrixClient with unknown userId: ` + `ensure userId is passed in createClient().`);
    }
    if (this.deviceId === null) {
      throw new Error(`Cannot enable encryption on MatrixClient with unknown deviceId: ` + `ensure deviceId is passed in createClient().`);
    }
    const crypto = new _crypto.Crypto(this, userId, this.deviceId, this.store, this.cryptoStore, this.verificationMethods);
    this.reEmitter.reEmit(crypto, [_crypto.CryptoEvent.KeyBackupFailed, _crypto.CryptoEvent.KeyBackupSessionsRemaining, _crypto.CryptoEvent.RoomKeyRequest, _crypto.CryptoEvent.RoomKeyRequestCancellation, _crypto.CryptoEvent.Warning, _crypto.CryptoEvent.DevicesUpdated, _crypto.CryptoEvent.WillUpdateDevices, _crypto.CryptoEvent.DeviceVerificationChanged, _crypto.CryptoEvent.UserTrustStatusChanged, _crypto.CryptoEvent.KeysChanged]);
    this.logger.debug("Crypto: initialising crypto object...");
    await crypto.init({
      exportedOlmDevice: this.exportedOlmDeviceToImport,
      pickleKey: this.pickleKey
    });
    delete this.exportedOlmDeviceToImport;
    this.olmVersion = _crypto.Crypto.getOlmVersion();

    // if crypto initialisation was successful, tell it to attach its event handlers.
    crypto.registerEventHandlers(this);
    this.cryptoBackend = this.crypto = crypto;

    // upload our keys in the background
    this.crypto.uploadDeviceKeys().catch(e => {
      // TODO: throwing away this error is a really bad idea.
      this.logger.error("Error uploading device keys", e);
    });
  }

  /**
   * Initialise support for end-to-end encryption in this client, using the rust matrix-sdk-crypto.
   *
   * An alternative to {@link initCrypto}.
   *
   * @param args.useIndexedDB - True to use an indexeddb store, false to use an in-memory store. Defaults to 'true'.
   * @param args.storageKey - A key with which to encrypt the indexeddb store. If provided, it must be exactly
   *    32 bytes of data, and must be the same each time the client is initialised for a given device.
   *    If both this and `storagePassword` are unspecified, the store will be unencrypted.
   * @param args.storagePassword - An alternative to `storageKey`. A password which will be used to derive a key to
   *    encrypt the store with. Deriving a key from a password is (deliberately) a slow operation, so prefer
   *    to pass a `storageKey` directly where possible.
   *
   * @returns a Promise which will resolve when the crypto layer has been
   *    successfully initialised.
   */
  async initRustCrypto(args = {}) {
    if (this.cryptoBackend) {
      this.logger.warn("Attempt to re-initialise e2e encryption on MatrixClient");
      return;
    }
    const userId = this.getUserId();
    if (userId === null) {
      throw new Error(`Cannot enable encryption on MatrixClient with unknown userId: ` + `ensure userId is passed in createClient().`);
    }
    const deviceId = this.getDeviceId();
    if (deviceId === null) {
      throw new Error(`Cannot enable encryption on MatrixClient with unknown deviceId: ` + `ensure deviceId is passed in createClient().`);
    }

    // importing rust-crypto will download the webassembly, so we delay it until we know it will be
    // needed.
    this.logger.debug("Downloading Rust crypto library");
    const RustCrypto = await Promise.resolve().then(() => _interopRequireWildcard(require("./rust-crypto")));
    const rustCrypto = await RustCrypto.initRustCrypto({
      logger: this.logger,
      http: this.http,
      userId: userId,
      deviceId: deviceId,
      secretStorage: this.secretStorage,
      cryptoCallbacks: this.cryptoCallbacks,
      storePrefix: args.useIndexedDB === false ? null : _constants.RUST_SDK_STORE_PREFIX,
      storeKey: args.storageKey,
      storePassphrase: args.storagePassword,
      legacyCryptoStore: this.cryptoStore,
      legacyPickleKey: this.pickleKey ?? "DEFAULT_KEY",
      legacyMigrationProgressListener: (progress, total) => {
        this.emit(_crypto.CryptoEvent.LegacyCryptoStoreMigrationProgress, progress, total);
      }
    });
    rustCrypto.setSupportedVerificationMethods(this.verificationMethods);
    this.cryptoBackend = rustCrypto;

    // attach the event listeners needed by RustCrypto
    this.on(_roomMember.RoomMemberEvent.Membership, rustCrypto.onRoomMembership.bind(rustCrypto));
    this.on(ClientEvent.Event, event => {
      rustCrypto.onLiveEventFromSync(event);
    });

    // re-emit the events emitted by the crypto impl
    this.reEmitter.reEmit(rustCrypto, [_crypto.CryptoEvent.VerificationRequestReceived, _crypto.CryptoEvent.UserTrustStatusChanged, _crypto.CryptoEvent.KeyBackupStatus, _crypto.CryptoEvent.KeyBackupSessionsRemaining, _crypto.CryptoEvent.KeyBackupFailed, _crypto.CryptoEvent.KeyBackupDecryptionKeyCached, _crypto.CryptoEvent.KeysChanged, _crypto.CryptoEvent.DevicesUpdated, _crypto.CryptoEvent.WillUpdateDevices]);
  }

  /**
   * Access the server-side secret storage API for this client.
   */
  get secretStorage() {
    return this._secretStorage;
  }

  /**
   * Access the crypto API for this client.
   *
   * If end-to-end encryption has been enabled for this client (via {@link initCrypto} or {@link initRustCrypto}),
   * returns an object giving access to the crypto API. Otherwise, returns `undefined`.
   */
  getCrypto() {
    return this.cryptoBackend;
  }

  /**
   * Is end-to-end crypto enabled for this client.
   * @returns True if end-to-end is enabled.
   * @deprecated prefer {@link getCrypto}
   */
  isCryptoEnabled() {
    return !!this.cryptoBackend;
  }

  /**
   * Get the Ed25519 key for this device
   *
   * @returns base64-encoded ed25519 key. Null if crypto is
   *    disabled.
   *
   * @deprecated Prefer {@link CryptoApi.getOwnDeviceKeys}
   */
  getDeviceEd25519Key() {
    return this.crypto?.getDeviceEd25519Key() ?? null;
  }

  /**
   * Get the Curve25519 key for this device
   *
   * @returns base64-encoded curve25519 key. Null if crypto is
   *    disabled.
   *
   * @deprecated Use {@link CryptoApi.getOwnDeviceKeys}
   */
  getDeviceCurve25519Key() {
    return this.crypto?.getDeviceCurve25519Key() ?? null;
  }

  /**
   * @deprecated Does nothing.
   */
  async uploadKeys() {
    this.logger.warn("MatrixClient.uploadKeys is deprecated");
  }

  /**
   * Download the keys for a list of users and stores the keys in the session
   * store.
   * @param userIds - The users to fetch.
   * @param forceDownload - Always download the keys even if cached.
   *
   * @returns A promise which resolves to a map userId-\>deviceId-\>`DeviceInfo`
   *
   * @deprecated Prefer {@link CryptoApi.getUserDeviceInfo}
   */
  downloadKeys(userIds, forceDownload) {
    if (!this.crypto) {
      return Promise.reject(new Error("End-to-end encryption disabled"));
    }
    return this.crypto.downloadKeys(userIds, forceDownload);
  }

  /**
   * Get the stored device keys for a user id
   *
   * @param userId - the user to list keys for.
   *
   * @returns list of devices
   * @deprecated Prefer {@link CryptoApi.getUserDeviceInfo}
   */
  getStoredDevicesForUser(userId) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.getStoredDevicesForUser(userId) || [];
  }

  /**
   * Get the stored device key for a user id and device id
   *
   * @param userId - the user to list keys for.
   * @param deviceId - unique identifier for the device
   *
   * @returns device or null
   * @deprecated Prefer {@link CryptoApi.getUserDeviceInfo}
   */
  getStoredDevice(userId, deviceId) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.getStoredDevice(userId, deviceId) || null;
  }

  /**
   * Mark the given device as verified
   *
   * @param userId - owner of the device
   * @param deviceId - unique identifier for the device or user's
   * cross-signing public key ID.
   *
   * @param verified - whether to mark the device as verified. defaults
   *   to 'true'.
   *
   * @returns
   *
   * @remarks
   * Fires {@link CryptoEvent#DeviceVerificationChanged}
   */
  setDeviceVerified(userId, deviceId, verified = true) {
    const prom = this.setDeviceVerification(userId, deviceId, verified, null, null);

    // if one of the user's own devices is being marked as verified / unverified,
    // check the key backup status, since whether or not we use this depends on
    // whether it has a signature from a verified device
    if (userId == this.credentials.userId) {
      this.checkKeyBackup();
    }
    return prom;
  }

  /**
   * Mark the given device as blocked/unblocked
   *
   * @param userId - owner of the device
   * @param deviceId - unique identifier for the device or user's
   * cross-signing public key ID.
   *
   * @param blocked - whether to mark the device as blocked. defaults
   *   to 'true'.
   *
   * @returns
   *
   * @remarks
   * Fires {@link CryptoEvent.DeviceVerificationChanged}
   */
  setDeviceBlocked(userId, deviceId, blocked = true) {
    return this.setDeviceVerification(userId, deviceId, null, blocked, null);
  }

  /**
   * Mark the given device as known/unknown
   *
   * @param userId - owner of the device
   * @param deviceId - unique identifier for the device or user's
   * cross-signing public key ID.
   *
   * @param known - whether to mark the device as known. defaults
   *   to 'true'.
   *
   * @returns
   *
   * @remarks
   * Fires {@link CryptoEvent#DeviceVerificationChanged}
   */
  setDeviceKnown(userId, deviceId, known = true) {
    return this.setDeviceVerification(userId, deviceId, null, null, known);
  }
  async setDeviceVerification(userId, deviceId, verified, blocked, known) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    await this.crypto.setDeviceVerification(userId, deviceId, verified, blocked, known);
  }

  /**
   * Request a key verification from another user, using a DM.
   *
   * @param userId - the user to request verification with
   * @param roomId - the room to use for verification
   *
   * @returns resolves to a VerificationRequest
   *    when the request has been sent to the other party.
   *
   * @deprecated Prefer {@link CryptoApi.requestVerificationDM}.
   */
  requestVerificationDM(userId, roomId) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.requestVerificationDM(userId, roomId);
  }

  /**
   * Finds a DM verification request that is already in progress for the given room id
   *
   * @param roomId - the room to use for verification
   *
   * @returns the VerificationRequest that is in progress, if any
   * @deprecated Prefer {@link CryptoApi.findVerificationRequestDMInProgress}.
   */
  findVerificationRequestDMInProgress(roomId) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    } else if (!this.crypto) {
      // Hack for element-R to avoid breaking the cypress tests. We can get rid of this once the react-sdk is
      // updated to use CryptoApi.findVerificationRequestDMInProgress.
      return undefined;
    }
    return this.crypto.findVerificationRequestDMInProgress(roomId);
  }

  /**
   * Returns all to-device verification requests that are already in progress for the given user id
   *
   * @param userId - the ID of the user to query
   *
   * @returns the VerificationRequests that are in progress
   * @deprecated Prefer {@link CryptoApi.getVerificationRequestsToDeviceInProgress}.
   */
  getVerificationRequestsToDeviceInProgress(userId) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.getVerificationRequestsToDeviceInProgress(userId);
  }

  /**
   * Request a key verification from another user.
   *
   * @param userId - the user to request verification with
   * @param devices - array of device IDs to send requests to.  Defaults to
   *    all devices owned by the user
   *
   * @returns resolves to a VerificationRequest
   *    when the request has been sent to the other party.
   *
   * @deprecated Prefer {@link CryptoApi#requestOwnUserVerification} or {@link CryptoApi#requestDeviceVerification}.
   */
  requestVerification(userId, devices) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.requestVerification(userId, devices);
  }

  /**
   * Begin a key verification.
   *
   * @param method - the verification method to use
   * @param userId - the user to verify keys with
   * @param deviceId - the device to verify
   *
   * @returns a verification object
   * @deprecated Use `requestVerification` instead.
   */
  beginKeyVerification(method, userId, deviceId) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.beginKeyVerification(method, userId, deviceId);
  }

  /**
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#checkKey}.
   */
  checkSecretStorageKey(key, info) {
    return this.secretStorage.checkKey(key, info);
  }

  /**
   * Set the global override for whether the client should ever send encrypted
   * messages to unverified devices.  This provides the default for rooms which
   * do not specify a value.
   *
   * @param value - whether to blacklist all unverified devices by default
   *
   * @deprecated Prefer direct access to {@link CryptoApi.globalBlacklistUnverifiedDevices}:
   *
   * ```javascript
   * client.getCrypto().globalBlacklistUnverifiedDevices = value;
   * ```
   */
  setGlobalBlacklistUnverifiedDevices(value) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    this.cryptoBackend.globalBlacklistUnverifiedDevices = value;
    return value;
  }

  /**
   * @returns whether to blacklist all unverified devices by default
   *
   * @deprecated Prefer direct access to {@link CryptoApi.globalBlacklistUnverifiedDevices}:
   *
   * ```javascript
   * value = client.getCrypto().globalBlacklistUnverifiedDevices;
   * ```
   */
  getGlobalBlacklistUnverifiedDevices() {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.cryptoBackend.globalBlacklistUnverifiedDevices;
  }

  /**
   * Set whether sendMessage in a room with unknown and unverified devices
   * should throw an error and not send them message. This has 'Global' for
   * symmetry with setGlobalBlacklistUnverifiedDevices but there is currently
   * no room-level equivalent for this setting.
   *
   * This API is currently UNSTABLE and may change or be removed without notice.
   *
   * It has no effect with the Rust crypto implementation.
   *
   * @param value - whether error on unknown devices
   *
   * ```ts
   * client.getCrypto().globalErrorOnUnknownDevices = value;
   * ```
   */
  setGlobalErrorOnUnknownDevices(value) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    this.cryptoBackend.globalErrorOnUnknownDevices = value;
  }

  /**
   * @returns whether to error on unknown devices
   *
   * This API is currently UNSTABLE and may change or be removed without notice.
   */
  getGlobalErrorOnUnknownDevices() {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.cryptoBackend.globalErrorOnUnknownDevices;
  }

  /**
   * Get the ID of one of the user's cross-signing keys
   *
   * @param type - The type of key to get the ID of.  One of
   *     "master", "self_signing", or "user_signing".  Defaults to "master".
   *
   * @returns the key ID
   * @deprecated prefer {@link Crypto.CryptoApi#getCrossSigningKeyId}
   */
  getCrossSigningId(type = _api.CrossSigningKey.Master) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.getCrossSigningId(type);
  }

  /**
   * Get the cross signing information for a given user.
   *
   * The cross-signing API is currently UNSTABLE and may change without notice.
   *
   * @param userId - the user ID to get the cross-signing info for.
   *
   * @returns the cross signing information for the user.
   * @deprecated Prefer {@link CryptoApi#userHasCrossSigningKeys}
   */
  getStoredCrossSigningForUser(userId) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.cryptoBackend.getStoredCrossSigningForUser(userId);
  }

  /**
   * Check whether a given user is trusted.
   *
   * The cross-signing API is currently UNSTABLE and may change without notice.
   *
   * @param userId - The ID of the user to check.
   *
   * @deprecated Use {@link Crypto.CryptoApi.getUserVerificationStatus | `CryptoApi.getUserVerificationStatus`}
   */
  checkUserTrust(userId) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.cryptoBackend.checkUserTrust(userId);
  }

  /**
   * Check whether a given device is trusted.
   *
   * The cross-signing API is currently UNSTABLE and may change without notice.
   *
   * @param userId - The ID of the user whose devices is to be checked.
   * @param deviceId - The ID of the device to check
   *
   * @deprecated Use {@link Crypto.CryptoApi.getDeviceVerificationStatus | `CryptoApi.getDeviceVerificationStatus`}
   */
  checkDeviceTrust(userId, deviceId) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.checkDeviceTrust(userId, deviceId);
  }

  /**
   * Check whether one of our own devices is cross-signed by our
   * user's stored keys, regardless of whether we trust those keys yet.
   *
   * @param deviceId - The ID of the device to check
   *
   * @returns true if the device is cross-signed
   */
  checkIfOwnDeviceCrossSigned(deviceId) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.checkIfOwnDeviceCrossSigned(deviceId);
  }

  /**
   * Check the copy of our cross-signing key that we have in the device list and
   * see if we can get the private key. If so, mark it as trusted.
   * @param opts - ICheckOwnCrossSigningTrustOpts object
   *
   * @deprecated Unneeded for the new crypto
   */
  checkOwnCrossSigningTrust(opts) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.cryptoBackend.checkOwnCrossSigningTrust(opts);
  }

  /**
   * Checks that a given cross-signing private key matches a given public key.
   * This can be used by the getCrossSigningKey callback to verify that the
   * private key it is about to supply is the one that was requested.
   * @param privateKey - The private key
   * @param expectedPublicKey - The public key
   * @returns true if the key matches, otherwise false
   */
  checkCrossSigningPrivateKey(privateKey, expectedPublicKey) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.checkCrossSigningPrivateKey(privateKey, expectedPublicKey);
  }

  // deprecated: use requestVerification instead
  legacyDeviceVerification(userId, deviceId, method) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.legacyDeviceVerification(userId, deviceId, method);
  }

  /**
   * Perform any background tasks that can be done before a message is ready to
   * send, in order to speed up sending of the message.
   * @param room - the room the event is in
   *
   * @deprecated Prefer {@link CryptoApi.prepareToEncrypt | `CryptoApi.prepareToEncrypt`}:
   *
   * ```javascript
   * client.getCrypto().prepareToEncrypt(room);
   * ```
   */
  prepareToEncrypt(room) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    this.cryptoBackend.prepareToEncrypt(room);
  }

  /**
   * Checks if the user has previously published cross-signing keys
   *
   * This means downloading the devicelist for the user and checking if the list includes
   * the cross-signing pseudo-device.
   *
   * @deprecated Prefer {@link CryptoApi.userHasCrossSigningKeys | `CryptoApi.userHasCrossSigningKeys`}:
   *
   * ```javascript
   * result = client.getCrypto().userHasCrossSigningKeys();
   * ```
   */
  userHasCrossSigningKeys() {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.cryptoBackend.userHasCrossSigningKeys();
  }

  /**
   * Checks whether cross signing:
   * - is enabled on this account and trusted by this device
   * - has private keys either cached locally or stored in secret storage
   *
   * If this function returns false, bootstrapCrossSigning() can be used
   * to fix things such that it returns true. That is to say, after
   * bootstrapCrossSigning() completes successfully, this function should
   * return true.
   * @returns True if cross-signing is ready to be used on this device
   * @deprecated Prefer {@link CryptoApi.isCrossSigningReady | `CryptoApi.isCrossSigningReady`}:
   */
  isCrossSigningReady() {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.cryptoBackend.isCrossSigningReady();
  }

  /**
   * Bootstrap cross-signing by creating keys if needed. If everything is already
   * set up, then no changes are made, so this is safe to run to ensure
   * cross-signing is ready for use.
   *
   * This function:
   * - creates new cross-signing keys if they are not found locally cached nor in
   *   secret storage (if it has been set up)
   *
   * @deprecated Prefer {@link CryptoApi.bootstrapCrossSigning | `CryptoApi.bootstrapCrossSigning`}.
   */
  bootstrapCrossSigning(opts) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.cryptoBackend.bootstrapCrossSigning(opts);
  }

  /**
   * Whether to trust a others users signatures of their devices.
   * If false, devices will only be considered 'verified' if we have
   * verified that device individually (effectively disabling cross-signing).
   *
   * Default: true
   *
   * @returns True if trusting cross-signed devices
   *
   * @deprecated Prefer {@link CryptoApi.getTrustCrossSignedDevices | `CryptoApi.getTrustCrossSignedDevices`}.
   */
  getCryptoTrustCrossSignedDevices() {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.cryptoBackend.getTrustCrossSignedDevices();
  }

  /**
   * See getCryptoTrustCrossSignedDevices
   *
   * @param val - True to trust cross-signed devices
   *
   * @deprecated Prefer {@link CryptoApi.setTrustCrossSignedDevices | `CryptoApi.setTrustCrossSignedDevices`}.
   */
  setCryptoTrustCrossSignedDevices(val) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    this.cryptoBackend.setTrustCrossSignedDevices(val);
  }

  /**
   * Counts the number of end to end session keys that are waiting to be backed up
   * @returns Promise which resolves to the number of sessions requiring backup
   */
  countSessionsNeedingBackup() {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.countSessionsNeedingBackup();
  }

  /**
   * Get information about the encryption of an event
   *
   * @param event - event to be checked
   * @returns The event information.
   * @deprecated Prefer {@link Crypto.CryptoApi.getEncryptionInfoForEvent | `CryptoApi.getEncryptionInfoForEvent`}.
   */
  getEventEncryptionInfo(event) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.cryptoBackend.getEventEncryptionInfo(event);
  }

  /**
   * Create a recovery key from a user-supplied passphrase.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param password - Passphrase string that can be entered by the user
   *     when restoring the backup as an alternative to entering the recovery key.
   *     Optional.
   * @returns Object with public key metadata, encoded private
   *     recovery key which should be disposed of after displaying to the user,
   *     and raw private key to avoid round tripping if needed.
   *
   * @deprecated Prefer {@link CryptoApi.createRecoveryKeyFromPassphrase | `CryptoApi.createRecoveryKeyFromPassphrase`}.
   */
  createRecoveryKeyFromPassphrase(password) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.cryptoBackend.createRecoveryKeyFromPassphrase(password);
  }

  /**
   * Checks whether secret storage:
   * - is enabled on this account
   * - is storing cross-signing private keys
   * - is storing session backup key (if enabled)
   *
   * If this function returns false, bootstrapSecretStorage() can be used
   * to fix things such that it returns true. That is to say, after
   * bootstrapSecretStorage() completes successfully, this function should
   * return true.
   *
   * @returns True if secret storage is ready to be used on this device
   * @deprecated Prefer {@link CryptoApi.isSecretStorageReady | `CryptoApi.isSecretStorageReady`}.
   */
  isSecretStorageReady() {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.cryptoBackend.isSecretStorageReady();
  }

  /**
   * Bootstrap Secure Secret Storage if needed by creating a default key. If everything is
   * already set up, then no changes are made, so this is safe to run to ensure secret
   * storage is ready for use.
   *
   * This function
   * - creates a new Secure Secret Storage key if no default key exists
   *   - if a key backup exists, it is migrated to store the key in the Secret
   *     Storage
   * - creates a backup if none exists, and one is requested
   * - migrates Secure Secret Storage to use the latest algorithm, if an outdated
   *   algorithm is found
   *
   * @deprecated Use {@link CryptoApi.bootstrapSecretStorage | `CryptoApi.bootstrapSecretStorage`}.
   */
  bootstrapSecretStorage(opts) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.cryptoBackend.bootstrapSecretStorage(opts);
  }

  /**
   * Add a key for encrypting secrets.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param algorithm - the algorithm used by the key
   * @param opts - the options for the algorithm.  The properties used
   *     depend on the algorithm given.
   * @param keyName - the name of the key.  If not given, a random name will be generated.
   *
   * @returns An object with:
   *     keyId: the ID of the key
   *     keyInfo: details about the key (iv, mac, passphrase)
   *
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#addKey}.
   */
  addSecretStorageKey(algorithm, opts, keyName) {
    return this.secretStorage.addKey(algorithm, opts, keyName);
  }

  /**
   * Check whether we have a key with a given ID.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param keyId - The ID of the key to check
   *     for. Defaults to the default key ID if not provided.
   * @returns Whether we have the key.
   *
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#hasKey}.
   */
  hasSecretStorageKey(keyId) {
    return this.secretStorage.hasKey(keyId);
  }

  /**
   * Store an encrypted secret on the server.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param name - The name of the secret
   * @param secret - The secret contents.
   * @param keys - The IDs of the keys to use to encrypt the secret or null/undefined
   *     to use the default (will throw if no default key is set).
   *
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#store}.
   */
  storeSecret(name, secret, keys) {
    return this.secretStorage.store(name, secret, keys);
  }

  /**
   * Get a secret from storage.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param name - the name of the secret
   *
   * @returns the contents of the secret
   *
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#get}.
   */
  getSecret(name) {
    return this.secretStorage.get(name);
  }

  /**
   * Check if a secret is stored on the server.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param name - the name of the secret
   * @returns map of key name to key info the secret is encrypted
   *     with, or null if it is not present or not encrypted with a trusted
   *     key
   *
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#isStored}.
   */
  isSecretStored(name) {
    return this.secretStorage.isStored(name);
  }

  /**
   * Request a secret from another device.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param name - the name of the secret to request
   * @param devices - the devices to request the secret from
   *
   * @returns the secret request object
   */
  requestSecret(name, devices) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.requestSecret(name, devices);
  }

  /**
   * Get the current default key ID for encrypting secrets.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @returns The default key ID or null if no default key ID is set
   *
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#getDefaultKeyId}.
   */
  getDefaultSecretStorageKeyId() {
    return this.secretStorage.getDefaultKeyId();
  }

  /**
   * Set the current default key ID for encrypting secrets.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param keyId - The new default key ID
   *
   * @deprecated Use {@link MatrixClient#secretStorage} and {@link SecretStorage.ServerSideSecretStorage#setDefaultKeyId}.
   */
  setDefaultSecretStorageKeyId(keyId) {
    return this.secretStorage.setDefaultKeyId(keyId);
  }

  /**
   * Checks that a given secret storage private key matches a given public key.
   * This can be used by the getSecretStorageKey callback to verify that the
   * private key it is about to supply is the one that was requested.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param privateKey - The private key
   * @param expectedPublicKey - The public key
   * @returns true if the key matches, otherwise false
   *
   * @deprecated The use of asymmetric keys for SSSS is deprecated.
   *     Use {@link SecretStorage.ServerSideSecretStorage#checkKey} for symmetric keys.
   */
  checkSecretStoragePrivateKey(privateKey, expectedPublicKey) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.checkSecretStoragePrivateKey(privateKey, expectedPublicKey);
  }

  /**
   * Get e2e information on the device that sent an event
   *
   * @param event - event to be checked
   */
  async getEventSenderDeviceInfo(event) {
    if (!this.crypto) {
      return null;
    }
    return this.crypto.getEventSenderDeviceInfo(event);
  }

  /**
   * Check if the sender of an event is verified
   *
   * @param event - event to be checked
   *
   * @returns true if the sender of this event has been verified using
   * {@link MatrixClient#setDeviceVerified}.
   */
  async isEventSenderVerified(event) {
    const device = await this.getEventSenderDeviceInfo(event);
    if (!device) {
      return false;
    }
    return device.isVerified();
  }

  /**
   * Get outgoing room key request for this event if there is one.
   * @param event - The event to check for
   *
   * @returns A room key request, or null if there is none
   */
  getOutgoingRoomKeyRequest(event) {
    if (!this.crypto) {
      throw new Error("End-to-End encryption disabled");
    }
    const wireContent = event.getWireContent();
    const requestBody = {
      session_id: wireContent.session_id,
      sender_key: wireContent.sender_key,
      algorithm: wireContent.algorithm,
      room_id: event.getRoomId()
    };
    if (!requestBody.session_id || !requestBody.sender_key || !requestBody.algorithm || !requestBody.room_id) {
      return Promise.resolve(null);
    }
    return this.crypto.cryptoStore.getOutgoingRoomKeyRequest(requestBody);
  }

  /**
   * Cancel a room key request for this event if one is ongoing and resend the
   * request.
   * @param event - event of which to cancel and resend the room
   *                            key request.
   * @returns A promise that will resolve when the key request is queued
   */
  cancelAndResendEventRoomKeyRequest(event) {
    if (!this.crypto) {
      throw new Error("End-to-End encryption disabled");
    }
    return event.cancelAndResendKeyRequest(this.crypto, this.getUserId());
  }

  /**
   * Enable end-to-end encryption for a room. This does not modify room state.
   * Any messages sent before the returned promise resolves will be sent unencrypted.
   * @param roomId - The room ID to enable encryption in.
   * @param config - The encryption config for the room.
   * @returns A promise that will resolve when encryption is set up.
   *
   * @deprecated Not supported for Rust Cryptography. To enable encryption in a room, send an `m.room.encryption`
   * state event.
   */
  setRoomEncryption(roomId, config) {
    if (!this.crypto) {
      throw new Error("End-to-End encryption disabled");
    }
    return this.crypto.setRoomEncryption(roomId, config);
  }

  /**
   * Whether encryption is enabled for a room.
   * @param roomId - the room id to query.
   * @returns whether encryption is enabled.
   *
   * @deprecated Not correctly supported for Rust Cryptography. Use {@link CryptoApi.isEncryptionEnabledInRoom} and/or
   *    {@link Room.hasEncryptionStateEvent}.
   */
  isRoomEncrypted(roomId) {
    const room = this.getRoom(roomId);
    if (!room) {
      // we don't know about this room, so can't determine if it should be
      // encrypted. Let's assume not.
      return false;
    }

    // if there is an 'm.room.encryption' event in this room, it should be
    // encrypted (independently of whether we actually support encryption)
    if (room.hasEncryptionStateEvent()) {
      return true;
    }

    // we don't have an m.room.encrypted event, but that might be because
    // the server is hiding it from us. Check the store to see if it was
    // previously encrypted.
    return this.crypto?.isRoomEncrypted(roomId) ?? false;
  }

  /**
   * Encrypts and sends a given object via Olm to-device messages to a given
   * set of devices.
   *
   * @param userDeviceInfoArr - list of deviceInfo objects representing the devices to send to
   *
   * @param payload - fields to include in the encrypted payload
   *
   * @returns Promise which
   *     resolves once the message has been encrypted and sent to the given
   *     userDeviceMap, and returns the `{ contentMap, deviceInfoByDeviceId }`
   *     of the successfully sent messages.
   */
  encryptAndSendToDevices(userDeviceInfoArr, payload) {
    if (!this.crypto) {
      throw new Error("End-to-End encryption disabled");
    }
    return this.crypto.encryptAndSendToDevices(userDeviceInfoArr, payload);
  }

  /**
   * Forces the current outbound group session to be discarded such
   * that another one will be created next time an event is sent.
   *
   * @param roomId - The ID of the room to discard the session for
   *
   * @deprecated Prefer {@link CryptoApi.forceDiscardSession | `CryptoApi.forceDiscardSession`}:
   *
   */
  forceDiscardSession(roomId) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-End encryption disabled");
    }
    this.cryptoBackend.forceDiscardSession(roomId);
  }

  /**
   * Get a list containing all of the room keys
   *
   * This should be encrypted before returning it to the user.
   *
   * @returns a promise which resolves to a list of session export objects
   *
   * @deprecated Prefer {@link CryptoApi.exportRoomKeys | `CryptoApi.exportRoomKeys`}:
   *
   * ```javascript
   * sessionData = await client.getCrypto().exportRoomKeys();
   * ```
   */
  exportRoomKeys() {
    if (!this.cryptoBackend) {
      return Promise.reject(new Error("End-to-end encryption disabled"));
    }
    return this.cryptoBackend.exportRoomKeys();
  }

  /**
   * Import a list of room keys previously exported by exportRoomKeys
   *
   * @param keys - a list of session export objects
   * @param opts - options object
   *
   * @returns a promise which resolves when the keys have been imported
   *
   * @deprecated Prefer {@link CryptoApi.importRoomKeys | `CryptoApi.importRoomKeys`}:
   * ```javascript
   *  await client.getCrypto()?.importRoomKeys([..]);
   * ```
   */
  importRoomKeys(keys, opts) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.cryptoBackend.importRoomKeys(keys, opts);
  }

  /**
   * Force a re-check of the local key backup status against
   * what's on the server.
   *
   * @returns Object with backup info (as returned by
   *     getKeyBackupVersion) in backupInfo and
   *     trust information (as returned by isKeyBackupTrusted)
   *     in trustInfo.
   *
   * @deprecated Prefer {@link Crypto.CryptoApi.checkKeyBackupAndEnable}.
   */
  checkKeyBackup() {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.backupManager.checkKeyBackup();
  }

  /**
   * Get information about the current key backup from the server.
   *
   * Performs some basic validity checks on the shape of the result, and raises an error if it is not as expected.
   *
   * **Note**: there is no (supported) way to distinguish between "failure to talk to the server" and "another client
   * uploaded a key backup version using an algorithm I don't understand.
   *
   * @returns Information object from API, or null if no backup is present on the server.
   */
  async getKeyBackupVersion() {
    let res;
    try {
      res = await this.http.authedRequest(_httpApi.Method.Get, "/room_keys/version", undefined, undefined, {
        prefix: _httpApi.ClientPrefix.V3
      });
    } catch (e) {
      if (e.errcode === "M_NOT_FOUND") {
        return null;
      } else {
        throw e;
      }
    }
    _backup.BackupManager.checkBackupVersion(res);
    return res;
  }

  /**
   * @param info - key backup info dict from getKeyBackupVersion()
   *
   * @deprecated Prefer {@link CryptoApi.isKeyBackupTrusted | `CryptoApi.isKeyBackupTrusted`}.
   */
  isKeyBackupTrusted(info) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.backupManager.isKeyBackupTrusted(info);
  }

  /**
   * @returns true if the client is configured to back up keys to
   *     the server, otherwise false. If we haven't completed a successful check
   *     of key backup status yet, returns null.
   *
   * @deprecated Prefer direct access to {@link Crypto.CryptoApi.getActiveSessionBackupVersion}:
   *
   * ```javascript
   * let enabled = (await client.getCrypto().getActiveSessionBackupVersion()) !== null;
   * ```
   */
  getKeyBackupEnabled() {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.backupManager.getKeyBackupEnabled();
  }

  /**
   * Enable backing up of keys, using data previously returned from
   * getKeyBackupVersion.
   *
   * @param info - Backup information object as returned by getKeyBackupVersion
   * @returns Promise which resolves when complete.
   *
   * @deprecated Do not call this directly. Instead call {@link Crypto.CryptoApi.checkKeyBackupAndEnable}.
   */
  enableKeyBackup(info) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.backupManager.enableKeyBackup(info);
  }

  /**
   * Disable backing up of keys.
   *
   * @deprecated It should be unnecessary to disable key backup.
   */
  disableKeyBackup() {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    this.crypto.backupManager.disableKeyBackup();
  }

  /**
   * Set up the data required to create a new backup version.  The backup version
   * will not be created and enabled until createKeyBackupVersion is called.
   *
   * @param password - Passphrase string that can be entered by the user
   *     when restoring the backup as an alternative to entering the recovery key.
   *     Optional.
   *
   * @returns Object that can be passed to createKeyBackupVersion and
   *     additionally has a 'recovery_key' member with the user-facing recovery key string.
   *
   * @deprecated Use {@link Crypto.CryptoApi.resetKeyBackup | `CryptoApi.resetKeyBackup`}.
   */
  async prepareKeyBackupVersion(password, opts = {
    secureSecretStorage: false
  }) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    // eslint-disable-next-line camelcase
    const {
      algorithm,
      auth_data,
      recovery_key,
      privateKey
    } = await this.crypto.backupManager.prepareKeyBackupVersion(password);
    if (opts.secureSecretStorage) {
      await this.secretStorage.store("m.megolm_backup.v1", (0, _base.encodeBase64)(privateKey));
      this.logger.info("Key backup private key stored in secret storage");
    }
    return {
      algorithm,
      /* eslint-disable camelcase */
      auth_data,
      recovery_key
      /* eslint-enable camelcase */
    };
  }

  /**
   * Check whether the key backup private key is stored in secret storage.
   * @returns map of key name to key info the secret is
   *     encrypted with, or null if it is not present or not encrypted with a
   *     trusted key
   */
  isKeyBackupKeyStored() {
    return Promise.resolve(this.secretStorage.isStored("m.megolm_backup.v1"));
  }

  /**
   * Create a new key backup version and enable it, using the information return
   * from prepareKeyBackupVersion.
   *
   * @param info - Info object from prepareKeyBackupVersion
   * @returns Object with 'version' param indicating the version created
   *
   * @deprecated Use {@link Crypto.CryptoApi.resetKeyBackup | `CryptoApi.resetKeyBackup`}.
   */
  async createKeyBackupVersion(info) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    await this.crypto.backupManager.createKeyBackupVersion(info);
    const data = {
      algorithm: info.algorithm,
      auth_data: info.auth_data
    };

    // Sign the backup auth data with the device key for backwards compat with
    // older devices with cross-signing. This can probably go away very soon in
    // favour of just signing with the cross-singing master key.
    // XXX: Private member access
    await this.crypto.signObject(data.auth_data);
    if (this.cryptoCallbacks.getCrossSigningKey &&
    // XXX: Private member access
    this.crypto.crossSigningInfo.getId()) {
      // now also sign the auth data with the cross-signing master key
      // we check for the callback explicitly here because we still want to be able
      // to create an un-cross-signed key backup if there is a cross-signing key but
      // no callback supplied.
      // XXX: Private member access
      await this.crypto.crossSigningInfo.signObject(data.auth_data, "master");
    }
    const res = await this.http.authedRequest(_httpApi.Method.Post, "/room_keys/version", undefined, data);

    // We could assume everything's okay and enable directly, but this ensures
    // we run the same signature verification that will be used for future
    // sessions.
    await this.checkKeyBackup();
    if (!this.getKeyBackupEnabled()) {
      this.logger.error("Key backup not usable even though we just created it");
    }
    return res;
  }

  /**
   * @deprecated Use {@link Crypto.CryptoApi.deleteKeyBackupVersion | `CryptoApi.deleteKeyBackupVersion`}.
   */
  async deleteKeyBackupVersion(version) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    await this.cryptoBackend.deleteKeyBackupVersion(version);
  }
  makeKeyBackupPath(roomId, sessionId, version) {
    let path;
    if (sessionId !== undefined) {
      path = utils.encodeUri("/room_keys/keys/$roomId/$sessionId", {
        $roomId: roomId,
        $sessionId: sessionId
      });
    } else if (roomId !== undefined) {
      path = utils.encodeUri("/room_keys/keys/$roomId", {
        $roomId: roomId
      });
    } else {
      path = "/room_keys/keys";
    }
    const queryData = version === undefined ? undefined : {
      version
    };
    return {
      path,
      queryData
    };
  }

  /**
   * Back up session keys to the homeserver.
   * @param roomId - ID of the room that the keys are for Optional.
   * @param sessionId - ID of the session that the keys are for Optional.
   * @param version - backup version Optional.
   * @param data - Object keys to send
   * @returns a promise that will resolve when the keys
   * are uploaded
   */

  async sendKeyBackup(roomId, sessionId, version, data) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    const path = this.makeKeyBackupPath(roomId, sessionId, version);
    await this.http.authedRequest(_httpApi.Method.Put, path.path, path.queryData, data, {
      prefix: _httpApi.ClientPrefix.V3
    });
  }

  /**
   * Marks all group sessions as needing to be backed up and schedules them to
   * upload in the background as soon as possible.
   *
   * (This is done automatically as part of {@link CryptoApi.resetKeyBackup},
   * so there is probably no need to call this manually.)
   */
  async scheduleAllGroupSessionsForBackup() {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    await this.crypto.backupManager.scheduleAllGroupSessionsForBackup();
  }

  /**
   * Marks all group sessions as needing to be backed up without scheduling
   * them to upload in the background.
   *
   * (This is done automatically as part of {@link CryptoApi.resetKeyBackup},
   * so there is probably no need to call this manually.)
   *
   * @returns Promise which resolves to the number of sessions requiring a backup.
   */
  flagAllGroupSessionsForBackup() {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    return this.crypto.backupManager.flagAllGroupSessionsForBackup();
  }
  isValidRecoveryKey(recoveryKey) {
    try {
      (0, _recoverykey.decodeRecoveryKey)(recoveryKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get the raw key for a key backup from the password
   * Used when migrating key backups into SSSS
   *
   * The cross-signing API is currently UNSTABLE and may change without notice.
   *
   * @param password - Passphrase
   * @param backupInfo - Backup metadata from `checkKeyBackup`
   * @returns key backup key
   */
  keyBackupKeyFromPassword(password, backupInfo) {
    return (0, _key_passphrase.keyFromAuthData)(backupInfo.auth_data, password);
  }

  /**
   * Get the raw key for a key backup from the recovery key
   * Used when migrating key backups into SSSS
   *
   * The cross-signing API is currently UNSTABLE and may change without notice.
   *
   * @param recoveryKey - The recovery key
   * @returns key backup key
   */
  keyBackupKeyFromRecoveryKey(recoveryKey) {
    return (0, _recoverykey.decodeRecoveryKey)(recoveryKey);
  }

  /**
   * Restore from an existing key backup via a passphrase.
   *
   * @param password - Passphrase
   * @param targetRoomId - Room ID to target a specific room.
   * Restores all rooms if omitted.
   * @param targetSessionId - Session ID to target a specific session.
   * Restores all sessions if omitted.
   * @param backupInfo - Backup metadata from `getKeyBackupVersion` or `checkKeyBackup`.`backupInfo`
   * @param opts - Optional params such as callbacks
   * @returns Status of restoration with `total` and `imported`
   * key counts.
   */

  async restoreKeyBackupWithPassword(password, targetRoomId, targetSessionId, backupInfo, opts) {
    const privKey = await (0, _key_passphrase.keyFromAuthData)(backupInfo.auth_data, password);
    return this.restoreKeyBackup(privKey, targetRoomId, targetSessionId, backupInfo, opts);
  }

  /**
   * Restore from an existing key backup via a private key stored in secret
   * storage.
   *
   * @param backupInfo - Backup metadata from `checkKeyBackup`
   * @param targetRoomId - Room ID to target a specific room.
   * Restores all rooms if omitted.
   * @param targetSessionId - Session ID to target a specific session.
   * Restores all sessions if omitted.
   * @param opts - Optional params such as callbacks
   * @returns Status of restoration with `total` and `imported`
   * key counts.
   */
  async restoreKeyBackupWithSecretStorage(backupInfo, targetRoomId, targetSessionId, opts) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    const storedKey = await this.secretStorage.get("m.megolm_backup.v1");

    // ensure that the key is in the right format.  If not, fix the key and
    // store the fixed version
    const fixedKey = (0, _crypto.fixBackupKey)(storedKey);
    if (fixedKey) {
      const keys = await this.secretStorage.getKey();
      await this.secretStorage.store("m.megolm_backup.v1", fixedKey, [keys[0]]);
    }
    const privKey = (0, _base.decodeBase64)(fixedKey || storedKey);
    return this.restoreKeyBackup(privKey, targetRoomId, targetSessionId, backupInfo, opts);
  }

  /**
   * Restore from an existing key backup via an encoded recovery key.
   *
   * @param recoveryKey - Encoded recovery key
   * @param targetRoomId - Room ID to target a specific room.
   * Restores all rooms if omitted.
   * @param targetSessionId - Session ID to target a specific session.
   * Restores all sessions if omitted.
   * @param backupInfo - Backup metadata from `checkKeyBackup`
   * @param opts - Optional params such as callbacks
    * @returns Status of restoration with `total` and `imported`
   * key counts.
   */

  restoreKeyBackupWithRecoveryKey(recoveryKey, targetRoomId, targetSessionId, backupInfo, opts) {
    const privKey = (0, _recoverykey.decodeRecoveryKey)(recoveryKey);
    return this.restoreKeyBackup(privKey, targetRoomId, targetSessionId, backupInfo, opts);
  }
  async restoreKeyBackupWithCache(targetRoomId, targetSessionId, backupInfo, opts) {
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    const privKey = await this.cryptoBackend.getSessionBackupPrivateKey();
    if (!privKey) {
      throw new Error("Couldn't get key");
    }
    return this.restoreKeyBackup(privKey, targetRoomId, targetSessionId, backupInfo, opts);
  }
  async restoreKeyBackup(privKey, targetRoomId, targetSessionId, backupInfo, opts) {
    const cacheCompleteCallback = opts?.cacheCompleteCallback;
    const progressCallback = opts?.progressCallback;
    if (!this.cryptoBackend) {
      throw new Error("End-to-end encryption disabled");
    }
    if (!backupInfo.version) {
      throw new Error("Backup version must be defined");
    }
    const backupVersion = backupInfo.version;
    let totalKeyCount = 0;
    let totalFailures = 0;
    let totalImported = 0;
    const path = this.makeKeyBackupPath(targetRoomId, targetSessionId, backupVersion);
    const backupDecryptor = await this.cryptoBackend.getBackupDecryptor(backupInfo, privKey);
    const untrusted = !backupDecryptor.sourceTrusted;
    try {
      if (!(privKey instanceof Uint8Array)) {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        throw new Error(`restoreKeyBackup expects Uint8Array, got ${privKey}`);
      }
      // Cache the key, if possible.
      // This is async.
      this.cryptoBackend.storeSessionBackupPrivateKey(privKey, backupVersion).catch(e => {
        this.logger.warn("Error caching session backup key:", e);
      }).then(cacheCompleteCallback);
      if (progressCallback) {
        progressCallback({
          stage: "fetch"
        });
      }
      const res = await this.http.authedRequest(_httpApi.Method.Get, path.path, path.queryData, undefined, {
        prefix: _httpApi.ClientPrefix.V3
      });

      // We have finished fetching the backup, go to next step
      if (progressCallback) {
        progressCallback({
          stage: "load_keys"
        });
      }
      if (res.rooms) {
        // We have a full backup here, it can get quite big, so we need to decrypt and import it in chunks.

        // Get the total count as a first pass
        totalKeyCount = this.getTotalKeyCount(res);
        // Now decrypt and import the keys in chunks
        await this.handleDecryptionOfAFullBackup(res, backupDecryptor, 200, async chunk => {
          // We have a chunk of decrypted keys: import them
          try {
            const backupVersion = backupInfo.version;
            await this.cryptoBackend.importBackedUpRoomKeys(chunk, backupVersion, {
              untrusted
            });
            totalImported += chunk.length;
          } catch (e) {
            totalFailures += chunk.length;
            // We failed to import some keys, but we should still try to import the rest?
            // Log the error and continue
            _logger.logger.error("Error importing keys from backup", e);
          }
          if (progressCallback) {
            progressCallback({
              total: totalKeyCount,
              successes: totalImported,
              stage: "load_keys",
              failures: totalFailures
            });
          }
        });
      } else if (res.sessions) {
        // For now we don't chunk for a single room backup, but we could in the future.
        // Currently it is not used by the application.
        const sessions = res.sessions;
        totalKeyCount = Object.keys(sessions).length;
        const keys = await backupDecryptor.decryptSessions(sessions);
        for (const k of keys) {
          k.room_id = targetRoomId;
        }
        await this.cryptoBackend.importBackedUpRoomKeys(keys, backupVersion, {
          progressCallback,
          untrusted
        });
        totalImported = keys.length;
      } else {
        totalKeyCount = 1;
        try {
          const [key] = await backupDecryptor.decryptSessions({
            [targetSessionId]: res
          });
          key.room_id = targetRoomId;
          key.session_id = targetSessionId;
          await this.cryptoBackend.importBackedUpRoomKeys([key], backupVersion, {
            progressCallback,
            untrusted
          });
          totalImported = 1;
        } catch (e) {
          this.logger.debug("Failed to decrypt megolm session from backup", e);
        }
      }
    } finally {
      backupDecryptor.free();
    }

    /// in case entering the passphrase would add a new signature?
    await this.cryptoBackend.checkKeyBackupAndEnable();
    return {
      total: totalKeyCount,
      imported: totalImported
    };
  }

  /**
   * This method calculates the total number of keys present in the response of a `/room_keys/keys` call.
   *
   * @param res - The response from the server containing the keys to be counted.
   *
   * @returns The total number of keys in the backup.
   */
  getTotalKeyCount(res) {
    const rooms = res.rooms;
    let totalKeyCount = 0;
    for (const roomData of Object.values(rooms)) {
      if (!roomData.sessions) continue;
      totalKeyCount += Object.keys(roomData.sessions).length;
    }
    return totalKeyCount;
  }

  /**
   * This method handles the decryption of a full backup, i.e a call to `/room_keys/keys`.
   * It will decrypt the keys in chunks and call the `block` callback for each chunk.
   *
   * @param res - The response from the server containing the keys to be decrypted.
   * @param backupDecryptor - An instance of the BackupDecryptor class used to decrypt the keys.
   * @param chunkSize - The size of the chunks to be processed at a time.
   * @param block - A callback function that is called for each chunk of keys.
   *
   * @returns A promise that resolves when the decryption is complete.
   */
  async handleDecryptionOfAFullBackup(res, backupDecryptor, chunkSize, block) {
    const rooms = res.rooms;
    let groupChunkCount = 0;
    let chunkGroupByRoom = new Map();
    const handleChunkCallback = async roomChunks => {
      const currentChunk = [];
      for (const roomId of roomChunks.keys()) {
        const decryptedSessions = await backupDecryptor.decryptSessions(roomChunks.get(roomId));
        for (const sessionId in decryptedSessions) {
          const k = decryptedSessions[sessionId];
          k.room_id = roomId;
          currentChunk.push(k);
        }
      }
      await block(currentChunk);
    };
    for (const [roomId, roomData] of Object.entries(rooms)) {
      if (!roomData.sessions) continue;
      chunkGroupByRoom.set(roomId, {});
      for (const [sessionId, session] of Object.entries(roomData.sessions)) {
        const sessionsForRoom = chunkGroupByRoom.get(roomId);
        sessionsForRoom[sessionId] = session;
        groupChunkCount += 1;
        if (groupChunkCount >= chunkSize) {
          // We have enough chunks to decrypt
          await handleChunkCallback(chunkGroupByRoom);
          chunkGroupByRoom = new Map();
          // There might be remaining keys for that room, so add back an entry for the current room.
          chunkGroupByRoom.set(roomId, {});
          groupChunkCount = 0;
        }
      }
    }

    // Handle remaining chunk if needed
    if (groupChunkCount > 0) {
      await handleChunkCallback(chunkGroupByRoom);
    }
  }
  async deleteKeysFromBackup(roomId, sessionId, version) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    const path = this.makeKeyBackupPath(roomId, sessionId, version);
    await this.http.authedRequest(_httpApi.Method.Delete, path.path, path.queryData, undefined, {
      prefix: _httpApi.ClientPrefix.V3
    });
  }

  /**
   * Share shared-history decryption keys with the given users.
   *
   * @param roomId - the room for which keys should be shared.
   * @param userIds - a list of users to share with.  The keys will be sent to
   *     all of the user's current devices.
   */
  async sendSharedHistoryKeys(roomId, userIds) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }
    const roomEncryption = this.crypto?.getRoomEncryption(roomId);
    if (!roomEncryption) {
      // unknown room, or unencrypted room
      this.logger.error("Unknown room.  Not sharing decryption keys");
      return;
    }
    const deviceInfos = await this.crypto.downloadKeys(userIds);
    const devicesByUser = new Map();
    for (const [userId, devices] of deviceInfos) {
      devicesByUser.set(userId, Array.from(devices.values()));
    }

    // XXX: Private member access
    const alg = this.crypto.getRoomDecryptor(roomId, roomEncryption.algorithm);
    if (alg.sendSharedHistoryInboundSessions) {
      await alg.sendSharedHistoryInboundSessions(devicesByUser);
    } else {
      this.logger.warn("Algorithm does not support sharing previous keys", roomEncryption.algorithm);
    }
  }

  /**
   * Get the config for the media repository.
   * @returns Promise which resolves with an object containing the config.
   */
  getMediaConfig() {
    return this.http.authedRequest(_httpApi.Method.Get, "/config", undefined, undefined, {
      prefix: _httpApi.MediaPrefix.V3
    });
  }

  /**
   * Get the room for the given room ID.
   * This function will return a valid room for any room for which a Room event
   * has been emitted. Note in particular that other events, eg. RoomState.members
   * will be emitted for a room before this function will return the given room.
   * @param roomId - The room ID
   * @returns The Room or null if it doesn't exist or there is no data store.
   */
  getRoom(roomId) {
    if (!roomId) {
      return null;
    }
    return this.store.getRoom(roomId);
  }

  /**
   * Retrieve all known rooms.
   * @returns A list of rooms, or an empty list if there is no data store.
   */
  getRooms() {
    return this.store.getRooms();
  }

  /**
   * Retrieve all rooms that should be displayed to the user
   * This is essentially getRooms() with some rooms filtered out, eg. old versions
   * of rooms that have been replaced or (in future) other rooms that have been
   * marked at the protocol level as not to be displayed to the user.
   *
   * @param msc3946ProcessDynamicPredecessor - if true, look for an
   *                                           m.room.predecessor state event and
   *                                           use it if found (MSC3946).
   * @returns A list of rooms, or an empty list if there is no data store.
   */
  getVisibleRooms(msc3946ProcessDynamicPredecessor = false) {
    const allRooms = this.store.getRooms();
    const replacedRooms = new Set();
    for (const r of allRooms) {
      const predecessor = r.findPredecessor(msc3946ProcessDynamicPredecessor)?.roomId;
      if (predecessor) {
        replacedRooms.add(predecessor);
      }
    }
    return allRooms.filter(r => {
      const tombstone = r.currentState.getStateEvents(_event2.EventType.RoomTombstone, "");
      if (tombstone && replacedRooms.has(r.roomId)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Retrieve a user.
   * @param userId - The user ID to retrieve.
   * @returns A user or null if there is no data store or the user does
   * not exist.
   */
  getUser(userId) {
    return this.store.getUser(userId);
  }

  /**
   * Retrieve all known users.
   * @returns A list of users, or an empty list if there is no data store.
   */
  getUsers() {
    return this.store.getUsers();
  }

  /**
   * Set account data event for the current user.
   * It will retry the request up to 5 times.
   * @param eventType - The event type
   * @param content - the contents object for the event
   * @returns Promise which resolves: an empty object
   * @returns Rejects: with an error response.
   */
  setAccountData(eventType, content) {
    const path = utils.encodeUri("/user/$userId/account_data/$type", {
      $userId: this.credentials.userId,
      $type: eventType
    });
    return (0, _httpApi.retryNetworkOperation)(5, () => {
      return this.http.authedRequest(_httpApi.Method.Put, path, undefined, content);
    });
  }

  /**
   * Get account data event of given type for the current user.
   * @param eventType - The event type
   * @returns The contents of the given account data event
   */
  getAccountData(eventType) {
    return this.store.getAccountData(eventType);
  }

  /**
   * Get account data event of given type for the current user. This variant
   * gets account data directly from the homeserver if the local store is not
   * ready, which can be useful very early in startup before the initial sync.
   * @param eventType - The event type
   * @returns Promise which resolves: The contents of the given account data event.
   * @returns Rejects: with an error response.
   */
  async getAccountDataFromServer(eventType) {
    if (this.isInitialSyncComplete()) {
      const event = this.store.getAccountData(eventType);
      if (!event) {
        return null;
      }
      // The network version below returns just the content, so this branch
      // does the same to match.
      return event.getContent();
    }
    const path = utils.encodeUri("/user/$userId/account_data/$type", {
      $userId: this.credentials.userId,
      $type: eventType
    });
    try {
      return await this.http.authedRequest(_httpApi.Method.Get, path);
    } catch (e) {
      if (e.data?.errcode === "M_NOT_FOUND") {
        return null;
      }
      throw e;
    }
  }
  async deleteAccountData(eventType) {
    const msc3391DeleteAccountDataServerSupport = this.canSupport.get(_feature.Feature.AccountDataDeletion);
    // if deletion is not supported overwrite with empty content
    if (msc3391DeleteAccountDataServerSupport === _feature.ServerSupport.Unsupported) {
      await this.setAccountData(eventType, {});
      return;
    }
    const path = utils.encodeUri("/user/$userId/account_data/$type", {
      $userId: this.getSafeUserId(),
      $type: eventType
    });
    const options = msc3391DeleteAccountDataServerSupport === _feature.ServerSupport.Unstable ? {
      prefix: "/_matrix/client/unstable/org.matrix.msc3391"
    } : undefined;
    return await this.http.authedRequest(_httpApi.Method.Delete, path, undefined, undefined, options);
  }

  /**
   * Gets the users that are ignored by this client
   * @returns The array of users that are ignored (empty if none)
   */
  getIgnoredUsers() {
    const event = this.getAccountData("m.ignored_user_list");
    if (!event || !event.getContent() || !event.getContent()["ignored_users"]) return [];
    return Object.keys(event.getContent()["ignored_users"]);
  }

  /**
   * Sets the users that the current user should ignore.
   * @param userIds - the user IDs to ignore
   * @returns Promise which resolves: an empty object
   * @returns Rejects: with an error response.
   */
  setIgnoredUsers(userIds) {
    const content = {
      ignored_users: {}
    };
    userIds.forEach(u => {
      content.ignored_users[u] = {};
    });
    return this.setAccountData("m.ignored_user_list", content);
  }

  /**
   * Gets whether or not a specific user is being ignored by this client.
   * @param userId - the user ID to check
   * @returns true if the user is ignored, false otherwise
   */
  isUserIgnored(userId) {
    return this.getIgnoredUsers().includes(userId);
  }

  /**
   * Join a room. If you have already joined the room, this will no-op.
   * @param roomIdOrAlias - The room ID or room alias to join.
   * @param opts - Options when joining the room.
   * @returns Promise which resolves: Room object.
   * @returns Rejects: with an error response.
   */
  async joinRoom(roomIdOrAlias, opts = {}) {
    if (opts.syncRoom === undefined) {
      opts.syncRoom = true;
    }
    const room = this.getRoom(roomIdOrAlias);
    if (room?.hasMembershipState(this.credentials.userId, _membership.KnownMembership.Join)) return room;
    let signPromise = Promise.resolve();
    if (opts.inviteSignUrl) {
      const url = new URL(opts.inviteSignUrl);
      url.searchParams.set("mxid", this.credentials.userId);
      signPromise = this.http.requestOtherUrl(_httpApi.Method.Post, url);
    }
    let queryParams = {};
    if (opts.viaServers) {
      queryParams.server_name = opts.viaServers;
      queryParams.via = opts.viaServers;
      if (this.canSupport.get(_feature.Feature.MigrateServerNameToVia) === _feature.ServerSupport.Unstable) {
        queryParams = (0, _utils.replaceParam)("via", "org.matrix.msc4156.via", queryParams);
      }
    }
    const data = {};
    const signedInviteObj = await signPromise;
    if (signedInviteObj) {
      data.third_party_signed = signedInviteObj;
    }
    const path = utils.encodeUri("/join/$roomid", {
      $roomid: roomIdOrAlias
    });
    const res = await this.http.authedRequest(_httpApi.Method.Post, path, queryParams, data);
    const roomId = res.room_id;
    // In case we were originally given an alias, check the room cache again
    // with the resolved ID - this method is supposed to no-op if we already
    // were in the room, after all.
    const resolvedRoom = this.getRoom(roomId);
    if (resolvedRoom?.hasMembershipState(this.credentials.userId, _membership.KnownMembership.Join)) return resolvedRoom;
    const syncApi = new _sync.SyncApi(this, this.clientOpts, this.buildSyncApiOptions());
    const syncRoom = syncApi.createRoom(roomId);
    if (opts.syncRoom) {
      // v2 will do this for us
      // return syncApi.syncRoom(room);
    }
    return syncRoom;
  }

  /**
   * Knock a room. If you have already knocked the room, this will no-op.
   * @param roomIdOrAlias - The room ID or room alias to knock.
   * @param opts - Options when knocking the room.
   * @returns Promise which resolves: `{room_id: {string}}`
   * @returns Rejects: with an error response.
   */
  knockRoom(roomIdOrAlias, opts = {}) {
    const room = this.getRoom(roomIdOrAlias);
    if (room?.hasMembershipState(this.credentials.userId, _membership.KnownMembership.Knock)) {
      return Promise.resolve({
        room_id: room.roomId
      });
    }
    const path = utils.encodeUri("/knock/$roomIdOrAlias", {
      $roomIdOrAlias: roomIdOrAlias
    });
    let queryParams = {};
    if (opts.viaServers) {
      queryParams.server_name = opts.viaServers;
      queryParams.via = opts.viaServers;
      if (this.canSupport.get(_feature.Feature.MigrateServerNameToVia) === _feature.ServerSupport.Unstable) {
        queryParams = (0, _utils.replaceParam)("via", "org.matrix.msc4156.via", queryParams);
      }
    }
    const body = {};
    if (opts.reason) {
      body.reason = opts.reason;
    }
    return this.http.authedRequest(_httpApi.Method.Post, path, queryParams, body);
  }

  /**
   * Resend an event. Will also retry any to-device messages waiting to be sent.
   * @param event - The event to resend.
   * @param room - Optional. The room the event is in. Will update the
   * timeline entry if provided.
   * @returns Promise which resolves: to an ISendEventResponse object
   * @returns Rejects: with an error response.
   */
  resendEvent(event, room) {
    // also kick the to-device queue to retry
    this.toDeviceMessageQueue.sendQueue();
    this.updatePendingEventStatus(room, event, _event.EventStatus.SENDING);
    return this.encryptAndSendEvent(room, event);
  }

  /**
   * Cancel a queued or unsent event.
   *
   * @param event -   Event to cancel
   * @throws Error if the event is not in QUEUED, NOT_SENT or ENCRYPTING state
   */
  cancelPendingEvent(event) {
    if (![_event.EventStatus.QUEUED, _event.EventStatus.NOT_SENT, _event.EventStatus.ENCRYPTING].includes(event.status)) {
      throw new Error("cannot cancel an event with status " + event.status);
    }

    // If the event is currently being encrypted then remove it from the pending list, to indicate that it should
    // not be sent.
    if (event.status === _event.EventStatus.ENCRYPTING) {
      this.eventsBeingEncrypted.delete(event.getId());
    } else if (this.scheduler && event.status === _event.EventStatus.QUEUED) {
      // tell the scheduler to forget about it, if it's queued
      this.scheduler.removeEventFromQueue(event);
    }

    // then tell the room about the change of state, which will remove it
    // from the room's list of pending events.
    const room = this.getRoom(event.getRoomId());
    this.updatePendingEventStatus(room, event, _event.EventStatus.CANCELLED);
  }

  /**
   * @returns Promise which resolves: TODO
   * @returns Rejects: with an error response.
   */
  setRoomName(roomId, name) {
    return this.sendStateEvent(roomId, _event2.EventType.RoomName, {
      name: name
    });
  }

  /**
   * @param htmlTopic - Optional.
   * @returns Promise which resolves: TODO
   * @returns Rejects: with an error response.
   */
  setRoomTopic(roomId, topic, htmlTopic) {
    const content = ContentHelpers.makeTopicContent(topic, htmlTopic);
    return this.sendStateEvent(roomId, _event2.EventType.RoomTopic, content);
  }

  /**
   * @returns Promise which resolves: to an object keyed by tagId with objects containing a numeric order field.
   * @returns Rejects: with an error response.
   */
  getRoomTags(roomId) {
    const path = utils.encodeUri("/user/$userId/rooms/$roomId/tags", {
      $userId: this.credentials.userId,
      $roomId: roomId
    });
    return this.http.authedRequest(_httpApi.Method.Get, path);
  }

  /**
   * @param tagName - name of room tag to be set
   * @param metadata - associated with that tag to be stored
   * @returns Promise which resolves: to an empty object
   * @returns Rejects: with an error response.
   */
  setRoomTag(roomId, tagName, metadata = {}) {
    const path = utils.encodeUri("/user/$userId/rooms/$roomId/tags/$tag", {
      $userId: this.credentials.userId,
      $roomId: roomId,
      $tag: tagName
    });
    return this.http.authedRequest(_httpApi.Method.Put, path, undefined, metadata);
  }

  /**
   * @param tagName - name of room tag to be removed
   * @returns Promise which resolves: to an empty object
   * @returns Rejects: with an error response.
   */
  deleteRoomTag(roomId, tagName) {
    const path = utils.encodeUri("/user/$userId/rooms/$roomId/tags/$tag", {
      $userId: this.credentials.userId,
      $roomId: roomId,
      $tag: tagName
    });
    return this.http.authedRequest(_httpApi.Method.Delete, path);
  }

  /**
   * @param eventType - event type to be set
   * @param content - event content
   * @returns Promise which resolves: to an empty object `{}`
   * @returns Rejects: with an error response.
   */
  setRoomAccountData(roomId, eventType, content) {
    const path = utils.encodeUri("/user/$userId/rooms/$roomId/account_data/$type", {
      $userId: this.credentials.userId,
      $roomId: roomId,
      $type: eventType
    });
    return this.http.authedRequest(_httpApi.Method.Put, path, undefined, content);
  }

  /**
   * Set a power level to one or multiple users.
   * Will apply changes atop of current power level event from local state if running & synced, falling back
   * to fetching latest from the `/state/` API.
   * @param roomId - the room to update power levels in
   * @param userId - the ID of the user or users to update power levels of
   * @param powerLevel - the numeric power level to update given users to
   * @returns Promise which resolves: to an ISendEventResponse object
   * @returns Rejects: with an error response.
   */
  async setPowerLevel(roomId, userId, powerLevel) {
    let content;
    if (this.clientRunning && this.isInitialSyncComplete()) {
      content = this.getRoom(roomId)?.currentState?.getStateEvents(_event2.EventType.RoomPowerLevels, "")?.getContent();
    }
    if (!content) {
      try {
        content = await this.getStateEvent(roomId, _event2.EventType.RoomPowerLevels, "");
      } catch (e) {
        // It is possible for a Matrix room to not have a power levels event
        if (e instanceof _httpApi.MatrixError && e.errcode === "M_NOT_FOUND") {
          content = {};
        } else {
          throw e;
        }
      }
    }

    // take a copy of the content to ensure we don't corrupt
    // existing client state with a failed power level change
    content = utils.deepCopy(content);
    if (!content?.users) {
      content.users = {};
    }
    const users = Array.isArray(userId) ? userId : [userId];
    for (const user of users) {
      if (powerLevel == null) {
        delete content.users[user];
      } else {
        content.users[user] = powerLevel;
      }
    }
    return this.sendStateEvent(roomId, _event2.EventType.RoomPowerLevels, content, "");
  }

  /**
   * Create an m.beacon_info event
   * @returns
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  async unstable_createLiveBeacon(roomId, beaconInfoContent) {
    return this.unstable_setLiveBeacon(roomId, beaconInfoContent);
  }

  /**
   * Upsert a live beacon event
   * using a specific m.beacon_info.* event variable type
   * @param roomId - string
   * @returns
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  async unstable_setLiveBeacon(roomId, beaconInfoContent) {
    return this.sendStateEvent(roomId, _beacon.M_BEACON_INFO.name, beaconInfoContent, this.getUserId());
  }
  sendEvent(roomId, threadIdOrEventType, eventTypeOrContent, contentOrTxnId, txnIdOrVoid) {
    let threadId;
    let eventType;
    let content;
    let txnId;
    if (!threadIdOrEventType?.startsWith(EVENT_ID_PREFIX) && threadIdOrEventType !== null) {
      txnId = contentOrTxnId;
      content = eventTypeOrContent;
      eventType = threadIdOrEventType;
      threadId = null;
    } else {
      txnId = txnIdOrVoid;
      content = contentOrTxnId;
      eventType = eventTypeOrContent;
      threadId = threadIdOrEventType;
    }
    this.addThreadRelationIfNeeded(content, threadId, roomId);
    return this.sendCompleteEvent(roomId, threadId, {
      type: eventType,
      content
    }, txnId);
  }

  /**
   * If we expect that an event is part of a thread but is missing the relation
   * we need to add it manually, as well as the reply fallback
   */
  addThreadRelationIfNeeded(content, threadId, roomId) {
    if (threadId && !content["m.relates_to"]?.rel_type) {
      const isReply = !!content["m.relates_to"]?.["m.in_reply_to"];
      content["m.relates_to"] = _objectSpread(_objectSpread({}, content["m.relates_to"]), {}, {
        rel_type: _thread.THREAD_RELATION_TYPE.name,
        event_id: threadId,
        // Set is_falling_back to true unless this is actually intended to be a reply
        is_falling_back: !isReply
      });
      const thread = this.getRoom(roomId)?.getThread(threadId);
      if (thread && !isReply) {
        content["m.relates_to"]["m.in_reply_to"] = {
          event_id: thread.lastReply(ev => {
            return ev.isRelation(_thread.THREAD_RELATION_TYPE.name) && !ev.status;
          })?.getId() ?? threadId
        };
      }
    }
  }

  /**
   * @param eventObject - An object with the partial structure of an event, to which event_id, user_id, room_id and origin_server_ts will be added.
   * @param txnId - Optional.
   * @returns Promise which resolves: to an empty object `{}`
   * @returns Rejects: with an error response.
   */

  /**
   * Sends a delayed event (MSC4140).
   * @param eventObject - An object with the partial structure of an event, to which event_id, user_id, room_id and origin_server_ts will be added.
   * @param delayOpts - Properties of the delay for this event.
   * @param txnId - Optional.
   * @returns Promise which resolves: to an empty object `{}`
   * @returns Rejects: with an error response.
   */

  sendCompleteEvent(roomId, threadId, eventObject, delayOptsOrTxnId, txnIdOrVoid) {
    let delayOpts;
    let txnId;
    if (typeof delayOptsOrTxnId === "string") {
      txnId = delayOptsOrTxnId;
    } else {
      delayOpts = delayOptsOrTxnId;
      txnId = txnIdOrVoid;
    }
    if (!txnId) {
      txnId = this.makeTxnId();
    }

    // We always construct a MatrixEvent when sending because the store and scheduler use them.
    // We'll extract the params back out if it turns out the client has no scheduler or store.
    const localEvent = new _event.MatrixEvent(Object.assign(eventObject, {
      event_id: "~" + roomId + ":" + txnId,
      user_id: this.credentials.userId,
      sender: this.credentials.userId,
      room_id: roomId,
      origin_server_ts: new Date().getTime()
    }));
    const room = this.getRoom(roomId);
    const thread = threadId ? room?.getThread(threadId) : undefined;
    if (thread) {
      localEvent.setThread(thread);
    }
    if (!delayOpts) {
      // set up re-emitter for this new event - this is normally the job of EventMapper but we don't use it here
      this.reEmitter.reEmit(localEvent, [_event.MatrixEventEvent.Replaced, _event.MatrixEventEvent.VisibilityChange]);
      room?.reEmitter.reEmit(localEvent, [_event.MatrixEventEvent.BeforeRedaction]);
    }

    // if this is a relation or redaction of an event
    // that hasn't been sent yet (e.g. with a local id starting with a ~)
    // then listen for the remote echo of that event so that by the time
    // this event does get sent, we have the correct event_id
    const targetId = localEvent.getAssociatedId();
    if (targetId?.startsWith("~")) {
      const target = room?.getPendingEvents().find(e => e.getId() === targetId);
      target?.once(_event.MatrixEventEvent.LocalEventIdReplaced, () => {
        localEvent.updateAssociatedId(target.getId());
      });
    }
    const type = localEvent.getType();
    this.logger.debug(`sendEvent of type ${type} in ${roomId} with txnId ${txnId}${delayOpts ? " (delayed event)" : ""}`);
    localEvent.setTxnId(txnId);
    localEvent.setStatus(_event.EventStatus.SENDING);

    // TODO: separate store for delayed events?
    if (!delayOpts) {
      // add this event immediately to the local store as 'sending'.
      room?.addPendingEvent(localEvent, txnId);

      // addPendingEvent can change the state to NOT_SENT if it believes
      // that there's other events that have failed. We won't bother to
      // try sending the event if the state has changed as such.
      if (localEvent.status === _event.EventStatus.NOT_SENT) {
        return Promise.reject(new Error("Event blocked by other events not yet sent"));
      }
      return this.encryptAndSendEvent(room, localEvent);
    } else {
      return this.encryptAndSendEvent(room, localEvent, delayOpts);
    }
  }

  /**
   * encrypts the event if necessary; adds the event to the queue, or sends it; marks the event as sent/unsent
   * @returns returns a promise which resolves with the result of the send request
   */

  /**
   * Simply sends a delayed event without encrypting it.
   * TODO: Allow encrypted delayed events, and encrypt them properly
   * @param delayOpts - Properties of the delay for this event.
   * @returns returns a promise which resolves with the result of the delayed send request
   */

  async encryptAndSendEvent(room, event, delayOpts) {
    if (delayOpts) {
      return this.sendEventHttpRequest(event, delayOpts);
    }
    try {
      let cancelled;
      this.eventsBeingEncrypted.add(event.getId());
      try {
        await this.encryptEventIfNeeded(event, room ?? undefined);
      } finally {
        cancelled = !this.eventsBeingEncrypted.delete(event.getId());
      }
      if (cancelled) {
        // cancelled via MatrixClient::cancelPendingEvent
        return {};
      }

      // encryptEventIfNeeded may have updated the status from SENDING to ENCRYPTING. If so, we need
      // to put it back.
      if (event.status === _event.EventStatus.ENCRYPTING) {
        this.updatePendingEventStatus(room, event, _event.EventStatus.SENDING);
      }
      let promise = null;
      if (this.scheduler) {
        // if this returns a promise then the scheduler has control now and will
        // resolve/reject when it is done. Internally, the scheduler will invoke
        // processFn which is set to this._sendEventHttpRequest so the same code
        // path is executed regardless.
        promise = this.scheduler.queueEvent(event);
        if (promise && this.scheduler.getQueueForEvent(event).length > 1) {
          // event is processed FIFO so if the length is 2 or more we know
          // this event is stuck behind an earlier event.
          this.updatePendingEventStatus(room, event, _event.EventStatus.QUEUED);
        }
      }
      if (!promise) {
        promise = this.sendEventHttpRequest(event);
        if (room) {
          promise = promise.then(res => {
            room.updatePendingEvent(event, _event.EventStatus.SENT, res["event_id"]);
            return res;
          });
        }
      }
      return await promise;
    } catch (err) {
      this.logger.error("Error sending event", err);
      try {
        // set the error on the event before we update the status:
        // updating the status emits the event, so the state should be
        // consistent at that point.
        event.error = err;
        this.updatePendingEventStatus(room, event, _event.EventStatus.NOT_SENT);
      } catch (e) {
        this.logger.error("Exception in error handler!", e);
      }
      if (err instanceof _httpApi.MatrixError) {
        err.event = event;
      }
      throw err;
    }
  }
  async encryptEventIfNeeded(event, room) {
    // If the room is unknown, we cannot encrypt for it
    if (!room) return;
    if (!(await this.shouldEncryptEventForRoom(event, room))) return;
    if (!this.cryptoBackend && this.usingExternalCrypto) {
      // The client has opted to allow sending messages to encrypted
      // rooms even if the room is encrypted, and we haven't set up
      // crypto. This is useful for users of matrix-org/pantalaimon
      return;
    }
    if (!this.cryptoBackend) {
      throw new Error("This room is configured to use encryption, but your client does not support encryption.");
    }
    this.updatePendingEventStatus(room, event, _event.EventStatus.ENCRYPTING);
    await this.cryptoBackend.encryptEvent(event, room);
  }

  /**
   * Determine whether a given event should be encrypted when we send it to the given room.
   *
   * This takes into account event type and room configuration.
   */
  async shouldEncryptEventForRoom(event, room) {
    if (event.isEncrypted()) {
      // this event has already been encrypted; this happens if the
      // encryption step succeeded, but the send step failed on the first
      // attempt.
      return false;
    }
    if (event.getType() === _event2.EventType.Reaction) {
      // For reactions, there is a very little gained by encrypting the entire
      // event, as relation data is already kept in the clear. Event
      // encryption for a reaction effectively only obscures the event type,
      // but the purpose is still obvious from the relation data, so nothing
      // is really gained. It also causes quite a few problems, such as:
      //   * triggers notifications via default push rules
      //   * prevents server-side bundling for reactions
      // The reaction key / content / emoji value does warrant encrypting, but
      // this will be handled separately by encrypting just this value.
      // See https://github.com/matrix-org/matrix-doc/pull/1849#pullrequestreview-248763642
      return false;
    }
    if (event.isRedaction()) {
      // Redactions do not support encryption in the spec at this time.
      // Whilst it mostly worked in some clients, it wasn't compliant.
      return false;
    }

    // If the room has an m.room.encryption event, we should encrypt.
    if (room.hasEncryptionStateEvent()) return true;

    // If we have a crypto impl, and *it* thinks we should encrypt, then we should.
    if (await this.cryptoBackend?.isEncryptionEnabledInRoom(room.roomId)) return true;

    // Otherwise, no need to encrypt.
    return false;
  }

  /**
   * Returns the eventType that should be used taking encryption into account
   * for a given eventType.
   * @param roomId - the room for the events `eventType` relates to
   * @param eventType - the event type
   * @returns the event type taking encryption into account
   */
  getEncryptedIfNeededEventType(roomId, eventType) {
    if (eventType === _event2.EventType.Reaction) return eventType;
    return this.getRoom(roomId)?.hasEncryptionStateEvent() ? _event2.EventType.RoomMessageEncrypted : eventType;
  }
  updatePendingEventStatus(room, event, newStatus) {
    if (room) {
      room.updatePendingEvent(event, newStatus);
    } else {
      event.setStatus(newStatus);
    }
  }
  sendEventHttpRequest(event, delayOpts) {
    let txnId = event.getTxnId();
    if (!txnId) {
      txnId = this.makeTxnId();
      event.setTxnId(txnId);
    }
    const pathParams = {
      $roomId: event.getRoomId(),
      $eventType: event.getWireType(),
      $stateKey: event.getStateKey(),
      $txnId: txnId
    };
    let path;
    if (event.isState()) {
      let pathTemplate = "/rooms/$roomId/state/$eventType";
      if (event.getStateKey() && event.getStateKey().length > 0) {
        pathTemplate = "/rooms/$roomId/state/$eventType/$stateKey";
      }
      path = utils.encodeUri(pathTemplate, pathParams);
    } else if (event.isRedaction() && event.event.redacts) {
      const pathTemplate = `/rooms/$roomId/redact/$redactsEventId/$txnId`;
      path = utils.encodeUri(pathTemplate, _objectSpread({
        $redactsEventId: event.event.redacts
      }, pathParams));
    } else {
      path = utils.encodeUri("/rooms/$roomId/send/$eventType/$txnId", pathParams);
    }
    const content = event.getWireContent();
    if (!delayOpts) {
      return this.http.authedRequest(_httpApi.Method.Put, path, undefined, content).then(res => {
        this.logger.debug(`Event sent to ${event.getRoomId()} with event id ${res.event_id}`);
        return res;
      });
    } else {
      return this.http.authedRequest(_httpApi.Method.Put, path, getUnstableDelayQueryOpts(delayOpts), content);
    }
  }

  /**
   * @param txnId -  transaction id. One will be made up if not supplied.
   * @param opts - Redact options
   * @returns Promise which resolves: TODO
   * @returns Rejects: with an error response.
   * @throws Error if called with `with_rel_types` (MSC3912) but the server does not support it.
   *         Callers should check whether the server supports MSC3912 via `MatrixClient.canSupport`.
   */

  redactEvent(roomId, threadId, eventId, txnId, opts) {
    if (!eventId?.startsWith(EVENT_ID_PREFIX)) {
      opts = txnId;
      txnId = eventId;
      eventId = threadId;
      threadId = null;
    }
    const reason = opts?.reason;
    const content = {
      reason
    };
    if (opts?.with_rel_types !== undefined) {
      if (this.canSupport.get(_feature.Feature.RelationBasedRedactions) === _feature.ServerSupport.Unsupported) {
        throw new Error("Server does not support relation based redactions " + `roomId ${roomId} eventId ${eventId} txnId: ${txnId} threadId ${threadId}`);
      }
      const withRelTypesPropName = this.canSupport.get(_feature.Feature.RelationBasedRedactions) === _feature.ServerSupport.Stable ? _event2.MSC3912_RELATION_BASED_REDACTIONS_PROP.stable : _event2.MSC3912_RELATION_BASED_REDACTIONS_PROP.unstable;
      content[withRelTypesPropName] = opts.with_rel_types;
    }
    return this.sendCompleteEvent(roomId, threadId, {
      type: _event2.EventType.RoomRedaction,
      content,
      redacts: eventId
    }, txnId);
  }

  /**
   * @param txnId - Optional.
   * @returns Promise which resolves: to an ISendEventResponse object
   * @returns Rejects: with an error response.
   */

  sendMessage(roomId, threadId, content, txnId) {
    if (typeof threadId !== "string" && threadId !== null) {
      txnId = content;
      content = threadId;
      threadId = null;
    }
    const eventType = _event2.EventType.RoomMessage;
    const sendContent = content;
    return this.sendEvent(roomId, threadId, eventType, sendContent, txnId);
  }

  /**
   * @param txnId - Optional.
   * @returns
   * @returns Rejects: with an error response.
   */

  sendTextMessage(roomId, threadId, body, txnId) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      txnId = body;
      body = threadId;
      threadId = null;
    }
    const content = ContentHelpers.makeTextMessage(body);
    return this.sendMessage(roomId, threadId, content, txnId);
  }

  /**
   * @param txnId - Optional.
   * @returns Promise which resolves: to a ISendEventResponse object
   * @returns Rejects: with an error response.
   */

  sendNotice(roomId, threadId, body, txnId) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      txnId = body;
      body = threadId;
      threadId = null;
    }
    const content = ContentHelpers.makeNotice(body);
    return this.sendMessage(roomId, threadId, content, txnId);
  }

  /**
   * @param txnId - Optional.
   * @returns Promise which resolves: to a ISendEventResponse object
   * @returns Rejects: with an error response.
   */

  sendEmoteMessage(roomId, threadId, body, txnId) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      txnId = body;
      body = threadId;
      threadId = null;
    }
    const content = ContentHelpers.makeEmoteMessage(body);
    return this.sendMessage(roomId, threadId, content, txnId);
  }

  /**
   * @returns Promise which resolves: to a ISendEventResponse object
   * @returns Rejects: with an error response.
   */

  sendImageMessage(roomId, threadId, url, info, text = "Image") {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      text = info || "Image";
      info = url;
      url = threadId;
      threadId = null;
    }
    const content = {
      msgtype: _event2.MsgType.Image,
      url: url,
      info: info,
      body: text
    };
    return this.sendMessage(roomId, threadId, content);
  }

  /**
   * @returns Promise which resolves: to a ISendEventResponse object
   * @returns Rejects: with an error response.
   */

  sendStickerMessage(roomId, threadId, url, info, text = "Sticker") {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      text = info || "Sticker";
      info = url;
      url = threadId;
      threadId = null;
    }
    const content = {
      url: url,
      info: info,
      body: text
    };
    return this.sendEvent(roomId, threadId, _event2.EventType.Sticker, content);
  }

  /**
   * @returns Promise which resolves: to a ISendEventResponse object
   * @returns Rejects: with an error response.
   */

  sendHtmlMessage(roomId, threadId, body, htmlBody) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      htmlBody = body;
      body = threadId;
      threadId = null;
    }
    const content = ContentHelpers.makeHtmlMessage(body, htmlBody);
    return this.sendMessage(roomId, threadId, content);
  }

  /**
   * @returns Promise which resolves: to a ISendEventResponse object
   * @returns Rejects: with an error response.
   */

  sendHtmlNotice(roomId, threadId, body, htmlBody) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      htmlBody = body;
      body = threadId;
      threadId = null;
    }
    const content = ContentHelpers.makeHtmlNotice(body, htmlBody);
    return this.sendMessage(roomId, threadId, content);
  }

  /**
   * @returns Promise which resolves: to a ISendEventResponse object
   * @returns Rejects: with an error response.
   */

  sendHtmlEmote(roomId, threadId, body, htmlBody) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      htmlBody = body;
      body = threadId;
      threadId = null;
    }
    const content = ContentHelpers.makeHtmlEmote(body, htmlBody);
    return this.sendMessage(roomId, threadId, content);
  }

  /**
   * Send a delayed timeline event.
   *
   * Note: This endpoint is unstable, and can throw an `Error`.
   *   Check progress on [MSC4140](https://github.com/matrix-org/matrix-spec-proposals/pull/4140) for more details.
   */
  // eslint-disable-next-line
  async _unstable_sendDelayedEvent(roomId, delayOpts, threadId, eventType, content, txnId) {
    if (!(await this.doesServerSupportUnstableFeature(UNSTABLE_MSC4140_DELAYED_EVENTS))) {
      throw Error("Server does not support the delayed events API");
    }
    this.addThreadRelationIfNeeded(content, threadId, roomId);
    return this.sendCompleteEvent(roomId, threadId, {
      type: eventType,
      content
    }, delayOpts, txnId);
  }

  /**
   * Send a delayed state event.
   *
   * Note: This endpoint is unstable, and can throw an `Error`.
   *   Check progress on [MSC4140](https://github.com/matrix-org/matrix-spec-proposals/pull/4140) for more details.
   */
  // eslint-disable-next-line
  async _unstable_sendDelayedStateEvent(roomId, delayOpts, eventType, content, stateKey = "", opts = {}) {
    if (!(await this.doesServerSupportUnstableFeature(UNSTABLE_MSC4140_DELAYED_EVENTS))) {
      throw Error("Server does not support the delayed events API");
    }
    const pathParams = {
      $roomId: roomId,
      $eventType: eventType,
      $stateKey: stateKey
    };
    let path = utils.encodeUri("/rooms/$roomId/state/$eventType", pathParams);
    if (stateKey !== undefined) {
      path = utils.encodeUri(path + "/$stateKey", pathParams);
    }
    return this.http.authedRequest(_httpApi.Method.Put, path, getUnstableDelayQueryOpts(delayOpts), content, opts);
  }

  /**
   * Get all pending delayed events for the calling user.
   *
   * Note: This endpoint is unstable, and can throw an `Error`.
   *   Check progress on [MSC4140](https://github.com/matrix-org/matrix-spec-proposals/pull/4140) for more details.
   */
  // eslint-disable-next-line
  async _unstable_getDelayedEvents(fromToken) {
    if (!(await this.doesServerSupportUnstableFeature(UNSTABLE_MSC4140_DELAYED_EVENTS))) {
      throw Error("Server does not support the delayed events API");
    }
    const queryDict = fromToken ? {
      from: fromToken
    } : undefined;
    return await this.http.authedRequest(_httpApi.Method.Get, "/delayed_events", queryDict, undefined, {
      prefix: `${_httpApi.ClientPrefix.Unstable}/${UNSTABLE_MSC4140_DELAYED_EVENTS}`
    });
  }

  /**
   * Manage a delayed event associated with the given delay_id.
   *
   * Note: This endpoint is unstable, and can throw an `Error`.
   *   Check progress on [MSC4140](https://github.com/matrix-org/matrix-spec-proposals/pull/4140) for more details.
   */
  // eslint-disable-next-line
  async _unstable_updateDelayedEvent(delayId, action) {
    if (!(await this.doesServerSupportUnstableFeature(UNSTABLE_MSC4140_DELAYED_EVENTS))) {
      throw Error("Server does not support the delayed events API");
    }
    const path = utils.encodeUri("/delayed_events/$delayId", {
      $delayId: delayId
    });
    const data = {
      action
    };
    return await this.http.authedRequest(_httpApi.Method.Post, path, undefined, data, {
      prefix: `${_httpApi.ClientPrefix.Unstable}/${UNSTABLE_MSC4140_DELAYED_EVENTS}`
    });
  }

  /**
   * Send a receipt.
   * @param event - The event being acknowledged
   * @param receiptType - The kind of receipt e.g. "m.read". Other than
   * ReceiptType.Read are experimental!
   * @param body - Additional content to send alongside the receipt.
   * @param unthreaded - An unthreaded receipt will clear room+thread notifications
   * @returns Promise which resolves: to an empty object `{}`
   * @returns Rejects: with an error response.
   */
  async sendReceipt(event, receiptType, body, unthreaded = false) {
    if (this.isGuest()) {
      return Promise.resolve({}); // guests cannot send receipts so don't bother.
    }
    const path = utils.encodeUri("/rooms/$roomId/receipt/$receiptType/$eventId", {
      $roomId: event.getRoomId(),
      $receiptType: receiptType,
      $eventId: event.getId()
    });

    // Unless we're explicitly making an unthreaded receipt or we don't
    // support threads, include the `thread_id` property in the body.
    const shouldAddThreadId = !unthreaded && this.supportsThreads();
    const fullBody = shouldAddThreadId ? _objectSpread(_objectSpread({}, body), {}, {
      thread_id: threadIdForReceipt(event)
    }) : body;
    const promise = this.http.authedRequest(_httpApi.Method.Post, path, undefined, fullBody || {});
    const room = this.getRoom(event.getRoomId());
    if (room && this.credentials.userId) {
      room.addLocalEchoReceipt(this.credentials.userId, event, receiptType, unthreaded);
    }
    return promise;
  }

  /**
   * Send a read receipt.
   * @param event - The event that has been read.
   * @param receiptType - other than ReceiptType.Read are experimental! Optional.
   * @returns Promise which resolves: to an empty object `{}`
   * @returns Rejects: with an error response.
   */
  async sendReadReceipt(event, receiptType = _read_receipts.ReceiptType.Read, unthreaded = false) {
    if (!event) return;
    const eventId = event.getId();
    const room = this.getRoom(event.getRoomId());
    if (room?.hasPendingEvent(eventId)) {
      throw new Error(`Cannot set read receipt to a pending event (${eventId})`);
    }
    return this.sendReceipt(event, receiptType, {}, unthreaded);
  }

  /**
   * Set a marker to indicate the point in a room before which the user has read every
   * event. This can be retrieved from room account data (the event type is `m.fully_read`)
   * and displayed as a horizontal line in the timeline that is visually distinct to the
   * position of the user's own read receipt.
   * @param roomId - ID of the room that has been read
   * @param rmEventId - ID of the event that has been read
   * @param rrEvent - the event tracked by the read receipt. This is here for
   * convenience because the RR and the RM are commonly updated at the same time as each
   * other. The local echo of this receipt will be done if set. Optional.
   * @param rpEvent - the m.read.private read receipt event for when we don't
   * want other users to see the read receipts. This is experimental. Optional.
   * @returns Promise which resolves: the empty object, `{}`.
   */
  async setRoomReadMarkers(roomId, rmEventId, rrEvent, rpEvent) {
    const room = this.getRoom(roomId);
    if (room?.hasPendingEvent(rmEventId)) {
      throw new Error(`Cannot set read marker to a pending event (${rmEventId})`);
    }

    // Add the optional RR update, do local echo like `sendReceipt`
    let rrEventId;
    if (rrEvent) {
      rrEventId = rrEvent.getId();
      if (room?.hasPendingEvent(rrEventId)) {
        throw new Error(`Cannot set read receipt to a pending event (${rrEventId})`);
      }
      room?.addLocalEchoReceipt(this.credentials.userId, rrEvent, _read_receipts.ReceiptType.Read);
    }

    // Add the optional private RR update, do local echo like `sendReceipt`
    let rpEventId;
    if (rpEvent) {
      rpEventId = rpEvent.getId();
      if (room?.hasPendingEvent(rpEventId)) {
        throw new Error(`Cannot set read receipt to a pending event (${rpEventId})`);
      }
      room?.addLocalEchoReceipt(this.credentials.userId, rpEvent, _read_receipts.ReceiptType.ReadPrivate);
    }
    return await this.setRoomReadMarkersHttpRequest(roomId, rmEventId, rrEventId, rpEventId);
  }

  /**
   * Get a preview of the given URL as of (roughly) the given point in time,
   * described as an object with OpenGraph keys and associated values.
   * Attributes may be synthesized where actual OG metadata is lacking.
   * Caches results to prevent hammering the server.
   * @param url - The URL to get preview data for
   * @param ts - The preferred point in time that the preview should
   * describe (ms since epoch).  The preview returned will either be the most
   * recent one preceding this timestamp if available, or failing that the next
   * most recent available preview.
   * @returns Promise which resolves: Object of OG metadata.
   * @returns Rejects: with an error response.
   * May return synthesized attributes if the URL lacked OG meta.
   */
  getUrlPreview(url, ts) {
    // bucket the timestamp to the nearest minute to prevent excessive spam to the server
    // Surely 60-second accuracy is enough for anyone.
    ts = Math.floor(ts / 60000) * 60000;
    const parsed = new URL(url);
    parsed.hash = ""; // strip the hash as it won't affect the preview
    url = parsed.toString();
    const key = ts + "_" + url;

    // If there's already a request in flight (or we've handled it), return that instead.
    if (key in this.urlPreviewCache) {
      return this.urlPreviewCache[key];
    }
    const resp = this.http.authedRequest(_httpApi.Method.Get, "/preview_url", {
      url,
      ts: ts.toString()
    }, undefined, {
      prefix: _httpApi.MediaPrefix.V3,
      priority: "low"
    });
    // TODO: Expire the URL preview cache sometimes
    this.urlPreviewCache[key] = resp;
    return resp;
  }

  /**
   * @returns Promise which resolves: to an empty object `{}`
   * @returns Rejects: with an error response.
   */
  sendTyping(roomId, isTyping, timeoutMs) {
    if (this.isGuest()) {
      return Promise.resolve({}); // guests cannot send typing notifications so don't bother.
    }
    const path = utils.encodeUri("/rooms/$roomId/typing/$userId", {
      $roomId: roomId,
      $userId: this.getUserId()
    });
    const data = {
      typing: isTyping
    };
    if (isTyping) {
      data.timeout = timeoutMs ? timeoutMs : 20000;
    }
    return this.http.authedRequest(_httpApi.Method.Put, path, undefined, data);
  }

  /**
   * Determines the history of room upgrades for a given room, as far as the
   * client can see. Returns an array of Rooms where the first entry is the
   * oldest and the last entry is the newest (likely current) room. If the
   * provided room is not found, this returns an empty list. This works in
   * both directions, looking for older and newer rooms of the given room.
   * @param roomId - The room ID to search from
   * @param verifyLinks - If true, the function will only return rooms
   * which can be proven to be linked. For example, rooms which have a create
   * event pointing to an old room which the client is not aware of or doesn't
   * have a matching tombstone would not be returned.
   * @param msc3946ProcessDynamicPredecessor - if true, look for
   * m.room.predecessor state events as well as create events, and prefer
   * predecessor events where they exist (MSC3946).
   * @returns An array of rooms representing the upgrade
   * history.
   */
  getRoomUpgradeHistory(roomId, verifyLinks = false, msc3946ProcessDynamicPredecessor = false) {
    const currentRoom = this.getRoom(roomId);
    if (!currentRoom) return [];
    const before = this.findPredecessorRooms(currentRoom, verifyLinks, msc3946ProcessDynamicPredecessor);
    const after = this.findSuccessorRooms(currentRoom, verifyLinks, msc3946ProcessDynamicPredecessor);
    return [...before, currentRoom, ...after];
  }
  findPredecessorRooms(room, verifyLinks, msc3946ProcessDynamicPredecessor) {
    const ret = [];
    const seenRoomIDs = new Set([room.roomId]);

    // Work backwards from newer to older rooms
    let predecessorRoomId = room.findPredecessor(msc3946ProcessDynamicPredecessor)?.roomId;
    while (predecessorRoomId !== null) {
      if (predecessorRoomId) {
        if (seenRoomIDs.has(predecessorRoomId)) break;
        seenRoomIDs.add(predecessorRoomId);
      }
      const predecessorRoom = this.getRoom(predecessorRoomId);
      if (predecessorRoom === null) {
        break;
      }
      if (verifyLinks) {
        const tombstone = predecessorRoom.currentState.getStateEvents(_event2.EventType.RoomTombstone, "");
        if (!tombstone || tombstone.getContent()["replacement_room"] !== room.roomId) {
          break;
        }
      }

      // Insert at the front because we're working backwards from the currentRoom
      ret.splice(0, 0, predecessorRoom);
      room = predecessorRoom;
      predecessorRoomId = room.findPredecessor(msc3946ProcessDynamicPredecessor)?.roomId;
    }
    return ret;
  }
  findSuccessorRooms(room, verifyLinks, msc3946ProcessDynamicPredecessor) {
    const ret = [];

    // Work forwards, looking at tombstone events
    let tombstoneEvent = room.currentState.getStateEvents(_event2.EventType.RoomTombstone, "");
    while (tombstoneEvent) {
      const successorRoom = this.getRoom(tombstoneEvent.getContent()["replacement_room"]);
      if (!successorRoom) break; // end of the chain
      if (successorRoom.roomId === room.roomId) break; // Tombstone is referencing its own room

      if (verifyLinks) {
        const predecessorRoomId = successorRoom.findPredecessor(msc3946ProcessDynamicPredecessor)?.roomId;
        if (!predecessorRoomId || predecessorRoomId !== room.roomId) {
          break;
        }
      }

      // Push to the end because we're looking forwards
      ret.push(successorRoom);
      const roomIds = new Set(ret.map(ref => ref.roomId));
      if (roomIds.size < ret.length) {
        // The last room added to the list introduced a previous roomId
        // To avoid recursion, return the last rooms - 1
        return ret.slice(0, ret.length - 1);
      }

      // Set the current room to the reference room so we know where we're at
      room = successorRoom;
      tombstoneEvent = room.currentState.getStateEvents(_event2.EventType.RoomTombstone, "");
    }
    return ret;
  }

  /**
   * @param reason - Optional.
   * @returns Promise which resolves: `{}` an empty object.
   * @returns Rejects: with an error response.
   */
  invite(roomId, userId, reason) {
    return this.membershipChange(roomId, userId, _membership.KnownMembership.Invite, reason);
  }

  /**
   * Invite a user to a room based on their email address.
   * @param roomId - The room to invite the user to.
   * @param email - The email address to invite.
   * @returns Promise which resolves: `{}` an empty object.
   * @returns Rejects: with an error response.
   */
  inviteByEmail(roomId, email) {
    return this.inviteByThreePid(roomId, "email", email);
  }

  /**
   * Invite a user to a room based on a third-party identifier.
   * @param roomId - The room to invite the user to.
   * @param medium - The medium to invite the user e.g. "email".
   * @param address - The address for the specified medium.
   * @returns Promise which resolves: `{}` an empty object.
   * @returns Rejects: with an error response.
   */
  async inviteByThreePid(roomId, medium, address) {
    const path = utils.encodeUri("/rooms/$roomId/invite", {
      $roomId: roomId
    });
    const identityServerUrl = this.getIdentityServerUrl(true);
    if (!identityServerUrl) {
      return Promise.reject(new _httpApi.MatrixError({
        error: "No supplied identity server URL",
        errcode: "ORG.MATRIX.JSSDK_MISSING_PARAM"
      }));
    }
    const params = {
      id_server: identityServerUrl,
      medium: medium,
      address: address
    };
    if (this.identityServer?.getAccessToken) {
      const identityAccessToken = await this.identityServer.getAccessToken();
      if (identityAccessToken) {
        params["id_access_token"] = identityAccessToken;
      }
    }
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, params);
  }

  /**
   * @returns Promise which resolves: `{}` an empty object.
   * @returns Rejects: with an error response.
   */
  leave(roomId) {
    return this.membershipChange(roomId, undefined, _membership.KnownMembership.Leave);
  }

  /**
   * Leaves all rooms in the chain of room upgrades based on the given room. By
   * default, this will leave all the previous and upgraded rooms, including the
   * given room. To only leave the given room and any previous rooms, keeping the
   * upgraded (modern) rooms untouched supply `false` to `includeFuture`.
   * @param roomId - The room ID to start leaving at
   * @param includeFuture - If true, the whole chain (past and future) of
   * upgraded rooms will be left.
   * @returns Promise which resolves when completed with an object keyed
   * by room ID and value of the error encountered when leaving or null.
   */
  leaveRoomChain(roomId, includeFuture = true) {
    const upgradeHistory = this.getRoomUpgradeHistory(roomId);
    let eligibleToLeave = upgradeHistory;
    if (!includeFuture) {
      eligibleToLeave = [];
      for (const room of upgradeHistory) {
        eligibleToLeave.push(room);
        if (room.roomId === roomId) {
          break;
        }
      }
    }
    const populationResults = {};
    const promises = [];
    const doLeave = roomId => {
      return this.leave(roomId).then(() => {
        delete populationResults[roomId];
      }).catch(err => {
        // suppress error
        populationResults[roomId] = err;
      });
    };
    for (const room of eligibleToLeave) {
      promises.push(doLeave(room.roomId));
    }
    return Promise.all(promises).then(() => populationResults);
  }

  /**
   * @param reason - Optional.
   * @returns Promise which resolves: TODO
   * @returns Rejects: with an error response.
   */
  ban(roomId, userId, reason) {
    return this.membershipChange(roomId, userId, _membership.KnownMembership.Ban, reason);
  }

  /**
   * @param deleteRoom - True to delete the room from the store on success.
   * Default: true.
   * @returns Promise which resolves: `{}` an empty object.
   * @returns Rejects: with an error response.
   */
  forget(roomId, deleteRoom = true) {
    const promise = this.membershipChange(roomId, undefined, "forget");
    if (!deleteRoom) {
      return promise;
    }
    return promise.then(response => {
      this.store.removeRoom(roomId);
      this.emit(ClientEvent.DeleteRoom, roomId);
      return response;
    });
  }

  /**
   * @returns Promise which resolves: Object (currently empty)
   * @returns Rejects: with an error response.
   */
  unban(roomId, userId) {
    // unbanning != set their state to leave: this used to be
    // the case, but was then changed so that leaving was always
    // a revoking of privilege, otherwise two people racing to
    // kick / ban someone could end up banning and then un-banning
    // them.
    const path = utils.encodeUri("/rooms/$roomId/unban", {
      $roomId: roomId
    });
    const data = {
      user_id: userId
    };
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, data);
  }

  /**
   * @param reason - Optional.
   * @returns Promise which resolves: `{}` an empty object.
   * @returns Rejects: with an error response.
   */
  kick(roomId, userId, reason) {
    const path = utils.encodeUri("/rooms/$roomId/kick", {
      $roomId: roomId
    });
    const data = {
      user_id: userId,
      reason: reason
    };
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, data);
  }
  membershipChange(roomId, userId, membership, reason) {
    // API returns an empty object
    const path = utils.encodeUri("/rooms/$room_id/$membership", {
      $room_id: roomId,
      $membership: membership
    });
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, {
      user_id: userId,
      // may be undefined e.g. on leave
      reason: reason
    });
  }

  /**
   * Obtain a dict of actions which should be performed for this event according
   * to the push rules for this user.  Caches the dict on the event.
   * @param event - The event to get push actions for.
   * @param forceRecalculate - forces to recalculate actions for an event
   * Useful when an event just got decrypted
   * @returns A dict of actions to perform.
   */
  getPushActionsForEvent(event, forceRecalculate = false) {
    if (!event.getPushActions() || forceRecalculate) {
      const {
        actions,
        rule
      } = this.pushProcessor.actionsAndRuleForEvent(event);
      event.setPushDetails(actions, rule);
    }
    return event.getPushActions();
  }

  /**
   * Obtain a dict of actions which should be performed for this event according
   * to the push rules for this user.  Caches the dict on the event.
   * @param event - The event to get push actions for.
   * @param forceRecalculate - forces to recalculate actions for an event
   * Useful when an event just got decrypted
   * @returns A dict of actions to perform.
   */
  getPushDetailsForEvent(event, forceRecalculate = false) {
    if (!event.getPushDetails() || forceRecalculate) {
      const {
        actions,
        rule
      } = this.pushProcessor.actionsAndRuleForEvent(event);
      event.setPushDetails(actions, rule);
    }
    return event.getPushDetails();
  }

  /**
   * @param info - The kind of info to set (e.g. 'avatar_url')
   * @param data - The JSON object to set.
   * @returns
   * @returns Rejects: with an error response.
   */
  // eslint-disable-next-line camelcase

  setProfileInfo(info, data) {
    const path = utils.encodeUri("/profile/$userId/$info", {
      $userId: this.credentials.userId,
      $info: info
    });
    return this.http.authedRequest(_httpApi.Method.Put, path, undefined, data);
  }

  /**
   * @returns Promise which resolves: `{}` an empty object.
   * @returns Rejects: with an error response.
   */
  async setDisplayName(name) {
    const prom = await this.setProfileInfo("displayname", {
      displayname: name
    });
    // XXX: synthesise a profile update for ourselves because Synapse is broken and won't
    const user = this.getUser(this.getUserId());
    if (user) {
      user.displayName = name;
      user.emit(_user.UserEvent.DisplayName, user.events.presence, user);
    }
    return prom;
  }

  /**
   * @returns Promise which resolves: `{}` an empty object.
   * @returns Rejects: with an error response.
   */
  async setAvatarUrl(url) {
    const prom = await this.setProfileInfo("avatar_url", {
      avatar_url: url
    });
    // XXX: synthesise a profile update for ourselves because Synapse is broken and won't
    const user = this.getUser(this.getUserId());
    if (user) {
      user.avatarUrl = url;
      user.emit(_user.UserEvent.AvatarUrl, user.events.presence, user);
    }
    return prom;
  }

  /**
   * Turn an MXC URL into an HTTP one. <strong>This method is experimental and
   * may change.</strong>
   * @param mxcUrl - The MXC URL
   * @param width - The desired width of the thumbnail.
   * @param height - The desired height of the thumbnail.
   * @param resizeMethod - The thumbnail resize method to use, either
   * "crop" or "scale".
   * @param allowDirectLinks - If true, return any non-mxc URLs
   * directly. Fetching such URLs will leak information about the user to
   * anyone they share a room with. If false, will return null for such URLs.
   * @param allowRedirects - If true, the caller supports the URL being 307 or
   * 308 redirected to another resource upon request. If false, redirects
   * are not expected. Implied `true` when `useAuthentication` is `true`.
   * @param useAuthentication - If true, the caller supports authenticated
   * media and wants an authentication-required URL. Note that server support
   * for authenticated media will *not* be checked - it is the caller's responsibility
   * to do so before calling this function. Note also that `useAuthentication`
   * implies `allowRedirects`. Defaults to false (unauthenticated endpoints).
   * @returns the avatar URL or null.
   */
  mxcUrlToHttp(mxcUrl, width, height, resizeMethod, allowDirectLinks, allowRedirects, useAuthentication) {
    return (0, _contentRepo.getHttpUriForMxc)(this.baseUrl, mxcUrl, width, height, resizeMethod, allowDirectLinks, allowRedirects, useAuthentication);
  }

  /**
   * Specify the set_presence value to be used for subsequent calls to the Sync API.
   * This has an advantage over calls to the PUT /presence API in that it
   * doesn't clobber status_msg set by other devices.
   * @param presence - the presence to specify to set_presence of sync calls
   */
  async setSyncPresence(presence) {
    this.syncApi?.setPresence(presence);
  }

  /**
   * @param opts - Options to apply
   * @returns Promise which resolves
   * @returns Rejects: with an error response.
   * @throws If 'presence' isn't a valid presence enum value.
   */
  async setPresence(opts) {
    const path = utils.encodeUri("/presence/$userId/status", {
      $userId: this.credentials.userId
    });
    const validStates = ["offline", "online", "unavailable"];
    if (validStates.indexOf(opts.presence) === -1) {
      throw new Error("Bad presence value: " + opts.presence);
    }
    await this.http.authedRequest(_httpApi.Method.Put, path, undefined, opts);
  }

  /**
   * @param userId - The user to get presence for
   * @returns Promise which resolves: The presence state for this user.
   * @returns Rejects: with an error response.
   */
  getPresence(userId) {
    const path = utils.encodeUri("/presence/$userId/status", {
      $userId: userId
    });
    return this.http.authedRequest(_httpApi.Method.Get, path);
  }

  /**
   * Retrieve older messages from the given room and put them in the timeline.
   *
   * If this is called multiple times whilst a request is ongoing, the <i>same</i>
   * Promise will be returned. If there was a problem requesting scrollback, there
   * will be a small delay before another request can be made (to prevent tight-looping
   * when there is no connection).
   *
   * @param room - The room to get older messages in.
   * @param limit - Optional. The maximum number of previous events to
   * pull in. Default: 30.
   * @returns Promise which resolves: Room. If you are at the beginning
   * of the timeline, `Room.oldState.paginationToken` will be
   * `null`.
   * @returns Rejects: with an error response.
   */
  scrollback(room, limit = 30) {
    let timeToWaitMs = 0;
    let info = this.ongoingScrollbacks[room.roomId] || {};
    if (info.promise) {
      return info.promise;
    } else if (info.errorTs) {
      const timeWaitedMs = Date.now() - info.errorTs;
      timeToWaitMs = Math.max(SCROLLBACK_DELAY_MS - timeWaitedMs, 0);
    }
    if (room.oldState.paginationToken === null) {
      return Promise.resolve(room); // already at the start.
    }
    // attempt to grab more events from the store first
    const numAdded = this.store.scrollback(room, limit).length;
    if (numAdded === limit) {
      // store contained everything we needed.
      return Promise.resolve(room);
    }
    // reduce the required number of events appropriately
    limit = limit - numAdded;
    const promise = new Promise((resolve, reject) => {
      // wait for a time before doing this request
      // (which may be 0 in order not to special case the code paths)
      (0, _utils.sleep)(timeToWaitMs).then(() => {
        return this.createMessagesRequest(room.roomId, room.oldState.paginationToken, limit, _eventTimeline.Direction.Backward);
      }).then(res => {
        const matrixEvents = res.chunk.map(this.getEventMapper());
        if (res.state) {
          const stateEvents = res.state.map(this.getEventMapper());
          room.currentState.setUnknownStateEvents(stateEvents);
        }
        const [timelineEvents, threadedEvents, unknownRelations] = room.partitionThreadedEvents(matrixEvents);
        this.processAggregatedTimelineEvents(room, timelineEvents);
        room.addEventsToTimeline(timelineEvents, true, room.getLiveTimeline());
        this.processThreadEvents(room, threadedEvents, true);
        unknownRelations.forEach(event => room.relations.aggregateChildEvent(event));
        room.oldState.paginationToken = res.end ?? null;
        if (res.chunk.length === 0) {
          room.oldState.paginationToken = null;
        }
        this.store.storeEvents(room, matrixEvents, res.end ?? null, true);
        delete this.ongoingScrollbacks[room.roomId];
        resolve(room);
      }).catch(err => {
        this.ongoingScrollbacks[room.roomId] = {
          errorTs: Date.now()
        };
        reject(err);
      });
    });
    info = {
      promise
    };
    this.ongoingScrollbacks[room.roomId] = info;
    return promise;
  }
  getEventMapper(options) {
    return (0, _eventMapper.eventMapperFor)(this, options || {});
  }

  /**
   * Get an EventTimeline for the given event
   *
   * <p>If the EventTimelineSet object already has the given event in its store, the
   * corresponding timeline will be returned. Otherwise, a /context request is
   * made, and used to construct an EventTimeline.
   * If the event does not belong to this EventTimelineSet then undefined will be returned.
   *
   * @param timelineSet -  The timelineSet to look for the event in, must be bound to a room
   * @param eventId -  The ID of the event to look for
   *
   * @returns Promise which resolves:
   *    {@link EventTimeline} including the given event
   */
  async getEventTimeline(timelineSet, eventId) {
    // don't allow any timeline support unless it's been enabled.
    if (!this.timelineSupport) {
      throw new Error("timeline support is disabled. Set the 'timelineSupport'" + " parameter to true when creating MatrixClient to enable it.");
    }
    if (!timelineSet?.room) {
      throw new Error("getEventTimeline only supports room timelines");
    }
    if (timelineSet.getTimelineForEvent(eventId)) {
      return timelineSet.getTimelineForEvent(eventId);
    }
    if (timelineSet.thread && this.supportsThreads()) {
      return this.getThreadTimeline(timelineSet, eventId);
    }
    const path = utils.encodeUri("/rooms/$roomId/context/$eventId", {
      $roomId: timelineSet.room.roomId,
      $eventId: eventId
    });
    let params = undefined;
    if (this.clientOpts?.lazyLoadMembers) {
      params = {
        filter: JSON.stringify(_filter.Filter.LAZY_LOADING_MESSAGES_FILTER)
      };
    }

    // TODO: we should implement a backoff (as per scrollback()) to deal more nicely with HTTP errors.
    const res = await this.http.authedRequest(_httpApi.Method.Get, path, params);
    if (!res.event) {
      throw new Error("'event' not in '/context' result - homeserver too old?");
    }

    // by the time the request completes, the event might have ended up in the timeline.
    if (timelineSet.getTimelineForEvent(eventId)) {
      return timelineSet.getTimelineForEvent(eventId);
    }
    const mapper = this.getEventMapper();
    const event = mapper(res.event);
    if (event.isRelation(_thread.THREAD_RELATION_TYPE.name)) {
      this.logger.warn("Tried loading a regular timeline at the position of a thread event");
      return undefined;
    }
    const events = [
    // Order events from most recent to oldest (reverse-chronological).
    // We start with the last event, since that's the point at which we have known state.
    // events_after is already backwards; events_before is forwards.
    ...res.events_after.reverse().map(mapper), event, ...res.events_before.map(mapper)];

    // Here we handle non-thread timelines only, but still process any thread events to populate thread summaries.
    let timeline = timelineSet.getTimelineForEvent(events[0].getId());
    if (timeline) {
      timeline.getState(_eventTimeline.EventTimeline.BACKWARDS).setUnknownStateEvents(res.state.map(mapper));
    } else {
      timeline = timelineSet.addTimeline();
      timeline.initialiseState(res.state.map(mapper));
      timeline.getState(_eventTimeline.EventTimeline.FORWARDS).paginationToken = res.end;
    }
    const [timelineEvents, threadedEvents, unknownRelations] = timelineSet.room.partitionThreadedEvents(events);
    timelineSet.addEventsToTimeline(timelineEvents, true, timeline, res.start);
    // The target event is not in a thread but process the contextual events, so we can show any threads around it.
    this.processThreadEvents(timelineSet.room, threadedEvents, true);
    this.processAggregatedTimelineEvents(timelineSet.room, timelineEvents);
    unknownRelations.forEach(event => timelineSet.relations.aggregateChildEvent(event));

    // There is no guarantee that the event ended up in "timeline" (we might have switched to a neighbouring
    // timeline) - so check the room's index again. On the other hand, there's no guarantee the event ended up
    // anywhere, if it was later redacted, so we just return the timeline we first thought of.
    return timelineSet.getTimelineForEvent(eventId) ?? timelineSet.room.findThreadForEvent(event)?.liveTimeline ??
    // for Threads degraded support
    timeline;
  }
  async getThreadTimeline(timelineSet, eventId) {
    if (!this.supportsThreads()) {
      throw new Error("could not get thread timeline: no client support");
    }
    if (!timelineSet.room) {
      throw new Error("could not get thread timeline: not a room timeline");
    }
    if (!timelineSet.thread) {
      throw new Error("could not get thread timeline: not a thread timeline");
    }
    const path = utils.encodeUri("/rooms/$roomId/context/$eventId", {
      $roomId: timelineSet.room.roomId,
      $eventId: eventId
    });
    const params = {
      limit: "0"
    };
    if (this.clientOpts?.lazyLoadMembers) {
      params.filter = JSON.stringify(_filter.Filter.LAZY_LOADING_MESSAGES_FILTER);
    }

    // TODO: we should implement a backoff (as per scrollback()) to deal more nicely with HTTP errors.
    const res = await this.http.authedRequest(_httpApi.Method.Get, path, params);
    const mapper = this.getEventMapper();
    const event = mapper(res.event);
    if (!timelineSet.canContain(event)) {
      return undefined;
    }
    const recurse = this.canSupport.get(_feature.Feature.RelationsRecursion) !== _feature.ServerSupport.Unsupported;
    if (_thread.Thread.hasServerSideSupport) {
      if (_thread.Thread.hasServerSideFwdPaginationSupport) {
        if (!timelineSet.thread) {
          throw new Error("could not get thread timeline: not a thread timeline");
        }
        const thread = timelineSet.thread;
        const resOlder = await this.fetchRelations(timelineSet.room.roomId, thread.id, null, null, {
          dir: _eventTimeline.Direction.Backward,
          from: res.start,
          recurse: recurse || undefined
        });
        const resNewer = await this.fetchRelations(timelineSet.room.roomId, thread.id, null, null, {
          dir: _eventTimeline.Direction.Forward,
          from: res.end,
          recurse: recurse || undefined
        });
        const events = [
        // Order events from most recent to oldest (reverse-chronological).
        // We start with the last event, since that's the point at which we have known state.
        // events_after is already backwards; events_before is forwards.
        ...resNewer.chunk.reverse().filter((0, _threadUtils.getRelationsThreadFilter)(thread.id)).map(mapper), event, ...resOlder.chunk.filter((0, _threadUtils.getRelationsThreadFilter)(thread.id)).map(mapper)];
        for (const event of events) {
          await timelineSet.thread?.processEvent(event);
        }

        // Here we handle non-thread timelines only, but still process any thread events to populate thread summaries.
        let timeline = timelineSet.getTimelineForEvent(event.getId());
        if (timeline) {
          timeline.getState(_eventTimeline.EventTimeline.BACKWARDS).setUnknownStateEvents(res.state.map(mapper));
        } else {
          timeline = timelineSet.addTimeline();
          timeline.initialiseState(res.state.map(mapper));
        }
        timelineSet.addEventsToTimeline(events, true, timeline, resNewer.next_batch);
        if (!resOlder.next_batch) {
          const originalEvent = await this.fetchRoomEvent(timelineSet.room.roomId, thread.id);
          timelineSet.addEventsToTimeline([mapper(originalEvent)], true, timeline, null);
        }
        timeline.setPaginationToken(resOlder.next_batch ?? null, _eventTimeline.Direction.Backward);
        timeline.setPaginationToken(resNewer.next_batch ?? null, _eventTimeline.Direction.Forward);
        this.processAggregatedTimelineEvents(timelineSet.room, events);

        // There is no guarantee that the event ended up in "timeline" (we might have switched to a neighbouring
        // timeline) - so check the room's index again. On the other hand, there's no guarantee the event ended up
        // anywhere, if it was later redacted, so we just return the timeline we first thought of.
        return timelineSet.getTimelineForEvent(eventId) ?? timeline;
      } else {
        // Where the event is a thread reply (not a root) and running in MSC-enabled mode the Thread timeline only
        // functions contiguously, so we have to jump through some hoops to get our target event in it.
        // XXX: workaround for https://github.com/vector-im/element-meta/issues/150

        const thread = timelineSet.thread;
        const resOlder = await this.fetchRelations(timelineSet.room.roomId, thread.id, _thread.THREAD_RELATION_TYPE.name, null, {
          dir: _eventTimeline.Direction.Backward,
          from: res.start,
          recurse: recurse || undefined
        });
        const eventsNewer = [];
        let nextBatch = res.end;
        while (nextBatch) {
          const resNewer = await this.fetchRelations(timelineSet.room.roomId, thread.id, _thread.THREAD_RELATION_TYPE.name, null, {
            dir: _eventTimeline.Direction.Forward,
            from: nextBatch,
            recurse: recurse || undefined
          });
          nextBatch = resNewer.next_batch ?? null;
          eventsNewer.push(...resNewer.chunk);
        }
        const events = [
        // Order events from most recent to oldest (reverse-chronological).
        // We start with the last event, since that's the point at which we have known state.
        // events_after is already backwards; events_before is forwards.
        ...eventsNewer.reverse().map(mapper), event, ...resOlder.chunk.map(mapper)];
        for (const event of events) {
          await timelineSet.thread?.processEvent(event);
        }

        // Here we handle non-thread timelines only, but still process any thread events to populate thread
        // summaries.
        const timeline = timelineSet.getLiveTimeline();
        timeline.getState(_eventTimeline.EventTimeline.BACKWARDS).setUnknownStateEvents(res.state.map(mapper));
        timelineSet.addEventsToTimeline(events, true, timeline, null);
        if (!resOlder.next_batch) {
          const originalEvent = await this.fetchRoomEvent(timelineSet.room.roomId, thread.id);
          timelineSet.addEventsToTimeline([mapper(originalEvent)], true, timeline, null);
        }
        timeline.setPaginationToken(resOlder.next_batch ?? null, _eventTimeline.Direction.Backward);
        timeline.setPaginationToken(null, _eventTimeline.Direction.Forward);
        this.processAggregatedTimelineEvents(timelineSet.room, events);
        return timeline;
      }
    }
  }

  /**
   * Get an EventTimeline for the latest events in the room. This will just
   * call `/messages` to get the latest message in the room, then use
   * `client.getEventTimeline(...)` to construct a new timeline from it.
   *
   * @param timelineSet -  The timelineSet to find or add the timeline to
   *
   * @returns Promise which resolves:
   *    {@link EventTimeline} timeline with the latest events in the room
   */
  async getLatestTimeline(timelineSet) {
    // don't allow any timeline support unless it's been enabled.
    if (!this.timelineSupport) {
      throw new Error("timeline support is disabled. Set the 'timelineSupport'" + " parameter to true when creating MatrixClient to enable it.");
    }
    if (!timelineSet.room) {
      throw new Error("getLatestTimeline only supports room timelines");
    }
    let event;
    if (timelineSet.threadListType !== null) {
      const res = await this.createThreadListMessagesRequest(timelineSet.room.roomId, null, 1, _eventTimeline.Direction.Backward, timelineSet.threadListType, timelineSet.getFilter());
      event = res.chunk?.[0];
    } else if (timelineSet.thread && _thread.Thread.hasServerSideSupport) {
      const recurse = this.canSupport.get(_feature.Feature.RelationsRecursion) !== _feature.ServerSupport.Unsupported;
      const res = await this.fetchRelations(timelineSet.room.roomId, timelineSet.thread.id, _thread.THREAD_RELATION_TYPE.name, null, {
        dir: _eventTimeline.Direction.Backward,
        limit: 1,
        recurse: recurse || undefined
      });
      event = res.chunk?.[0];
    } else {
      const messagesPath = utils.encodeUri("/rooms/$roomId/messages", {
        $roomId: timelineSet.room.roomId
      });
      const params = {
        dir: "b"
      };
      if (this.clientOpts?.lazyLoadMembers) {
        params.filter = JSON.stringify(_filter.Filter.LAZY_LOADING_MESSAGES_FILTER);
      }
      const res = await this.http.authedRequest(_httpApi.Method.Get, messagesPath, params);
      event = res.chunk?.[0];
    }
    if (!event) {
      throw new Error("No message returned when trying to construct getLatestTimeline");
    }
    return this.getEventTimeline(timelineSet, event.event_id);
  }

  /**
   * Makes a request to /messages with the appropriate lazy loading filter set.
   * XXX: if we do get rid of scrollback (as it's not used at the moment),
   * we could inline this method again in paginateEventTimeline as that would
   * then be the only call-site
   * @param limit - the maximum amount of events the retrieve
   * @param dir - 'f' or 'b'
   * @param timelineFilter - the timeline filter to pass
   */
  // XXX: Intended private, used in code.
  createMessagesRequest(roomId, fromToken, limit = 30, dir, timelineFilter) {
    const path = utils.encodeUri("/rooms/$roomId/messages", {
      $roomId: roomId
    });
    const params = {
      limit: limit.toString(),
      dir: dir
    };
    if (fromToken) {
      params.from = fromToken;
    }
    let filter = null;
    if (this.clientOpts?.lazyLoadMembers) {
      // create a shallow copy of LAZY_LOADING_MESSAGES_FILTER,
      // so the timelineFilter doesn't get written into it below
      filter = Object.assign({}, _filter.Filter.LAZY_LOADING_MESSAGES_FILTER);
    }
    if (timelineFilter) {
      // XXX: it's horrific that /messages' filter parameter doesn't match
      // /sync's one - see https://matrix.org/jira/browse/SPEC-451
      filter = filter || {};
      Object.assign(filter, timelineFilter.getRoomTimelineFilterComponent()?.toJSON());
    }
    if (filter) {
      params.filter = JSON.stringify(filter);
    }
    return this.http.authedRequest(_httpApi.Method.Get, path, params);
  }

  /**
   * Makes a request to /messages with the appropriate lazy loading filter set.
   * XXX: if we do get rid of scrollback (as it's not used at the moment),
   * we could inline this method again in paginateEventTimeline as that would
   * then be the only call-site
   * @param limit - the maximum amount of events the retrieve
   * @param dir - 'f' or 'b'
   * @param timelineFilter - the timeline filter to pass
   */
  // XXX: Intended private, used by room.fetchRoomThreads
  createThreadListMessagesRequest(roomId, fromToken, limit = 30, dir = _eventTimeline.Direction.Backward, threadListType = _thread.ThreadFilterType.All, timelineFilter) {
    const path = utils.encodeUri("/rooms/$roomId/threads", {
      $roomId: roomId
    });
    const params = {
      limit: limit.toString(),
      dir: dir,
      include: (0, _thread.threadFilterTypeToFilter)(threadListType)
    };
    if (fromToken) {
      params.from = fromToken;
    }
    let filter = {};
    if (this.clientOpts?.lazyLoadMembers) {
      // create a shallow copy of LAZY_LOADING_MESSAGES_FILTER,
      // so the timelineFilter doesn't get written into it below
      filter = _objectSpread({}, _filter.Filter.LAZY_LOADING_MESSAGES_FILTER);
    }
    if (timelineFilter) {
      // XXX: it's horrific that /messages' filter parameter doesn't match
      // /sync's one - see https://matrix.org/jira/browse/SPEC-451
      filter = _objectSpread(_objectSpread({}, filter), timelineFilter.getRoomTimelineFilterComponent()?.toJSON());
    }
    if (Object.keys(filter).length) {
      params.filter = JSON.stringify(filter);
    }
    const opts = {
      prefix: _thread.Thread.hasServerSideListSupport === _thread.FeatureSupport.Stable ? _httpApi.ClientPrefix.V1 : "/_matrix/client/unstable/org.matrix.msc3856"
    };
    return this.http.authedRequest(_httpApi.Method.Get, path, params, undefined, opts).then(res => _objectSpread(_objectSpread({}, res), {}, {
      chunk: res.chunk?.reverse(),
      start: res.prev_batch,
      end: res.next_batch
    }));
  }

  /**
   * Take an EventTimeline, and back/forward-fill results.
   *
   * @param eventTimeline - timeline object to be updated
   *
   * @returns Promise which resolves to a boolean: false if there are no
   *    events and we reached either end of the timeline; else true.
   */
  paginateEventTimeline(eventTimeline, opts) {
    const isNotifTimeline = eventTimeline.getTimelineSet() === this.notifTimelineSet;
    const room = this.getRoom(eventTimeline.getRoomId());
    const threadListType = eventTimeline.getTimelineSet().threadListType;
    const thread = eventTimeline.getTimelineSet().thread;

    // TODO: we should implement a backoff (as per scrollback()) to deal more
    // nicely with HTTP errors.
    opts = opts || {};
    const backwards = opts.backwards || false;
    if (isNotifTimeline) {
      if (!backwards) {
        throw new Error("paginateNotifTimeline can only paginate backwards");
      }
    }
    const dir = backwards ? _eventTimeline.EventTimeline.BACKWARDS : _eventTimeline.EventTimeline.FORWARDS;
    const token = eventTimeline.getPaginationToken(dir);
    const pendingRequest = eventTimeline.paginationRequests[dir];
    if (pendingRequest) {
      // already a request in progress - return the existing promise
      return pendingRequest;
    }
    let path;
    let params;
    let promise;
    if (isNotifTimeline) {
      path = "/notifications";
      params = {
        limit: (opts.limit ?? 30).toString(),
        only: "highlight"
      };
      if (token && token !== "end") {
        params.from = token;
      }
      promise = this.http.authedRequest(_httpApi.Method.Get, path, params).then(async res => {
        const token = res.next_token;
        const matrixEvents = [];
        res.notifications = res.notifications.filter(_utils.noUnsafeEventProps);
        for (let i = 0; i < res.notifications.length; i++) {
          const notification = res.notifications[i];
          const event = this.getEventMapper()(notification.event);

          // @TODO(kerrya) reprocessing every notification is ugly
          // remove if we get server MSC3994 support
          this.getPushDetailsForEvent(event, true);
          event.event.room_id = notification.room_id; // XXX: gutwrenching
          matrixEvents[i] = event;
        }

        // No need to partition events for threads here, everything lives
        // in the notification timeline set
        const timelineSet = eventTimeline.getTimelineSet();
        timelineSet.addEventsToTimeline(matrixEvents, backwards, eventTimeline, token);
        this.processAggregatedTimelineEvents(timelineSet.room, matrixEvents);

        // if we've hit the end of the timeline, we need to stop trying to
        // paginate. We need to keep the 'forwards' token though, to make sure
        // we can recover from gappy syncs.
        if (backwards && !res.next_token) {
          eventTimeline.setPaginationToken(null, dir);
        }
        return Boolean(res.next_token);
      }).finally(() => {
        eventTimeline.paginationRequests[dir] = null;
      });
      eventTimeline.paginationRequests[dir] = promise;
    } else if (threadListType !== null) {
      if (!room) {
        throw new Error("Unknown room " + eventTimeline.getRoomId());
      }
      if (!_thread.Thread.hasServerSideFwdPaginationSupport && dir === _eventTimeline.Direction.Forward) {
        throw new Error("Cannot paginate threads forwards without server-side support for MSC 3715");
      }
      promise = this.createThreadListMessagesRequest(eventTimeline.getRoomId(), token, opts.limit, dir, threadListType, eventTimeline.getFilter()).then(res => {
        if (res.state) {
          const roomState = eventTimeline.getState(dir);
          const stateEvents = res.state.filter(_utils.noUnsafeEventProps).map(this.getEventMapper());
          roomState.setUnknownStateEvents(stateEvents);
        }
        const token = res.end;
        const matrixEvents = res.chunk.filter(_utils.noUnsafeEventProps).map(this.getEventMapper());
        const timelineSet = eventTimeline.getTimelineSet();
        timelineSet.addEventsToTimeline(matrixEvents, backwards, eventTimeline, token);
        this.processAggregatedTimelineEvents(room, matrixEvents);
        this.processThreadRoots(room, matrixEvents, backwards);

        // if we've hit the end of the timeline, we need to stop trying to
        // paginate. We need to keep the 'forwards' token though, to make sure
        // we can recover from gappy syncs.
        if (backwards && res.end == res.start) {
          eventTimeline.setPaginationToken(null, dir);
        }
        return res.end !== res.start;
      }).finally(() => {
        eventTimeline.paginationRequests[dir] = null;
      });
      eventTimeline.paginationRequests[dir] = promise;
    } else if (thread) {
      const room = this.getRoom(eventTimeline.getRoomId() ?? undefined);
      if (!room) {
        throw new Error("Unknown room " + eventTimeline.getRoomId());
      }
      const recurse = this.canSupport.get(_feature.Feature.RelationsRecursion) !== _feature.ServerSupport.Unsupported;
      promise = this.fetchRelations(eventTimeline.getRoomId() ?? "", thread.id, null, null, {
        dir,
        limit: opts.limit,
        from: token ?? undefined,
        recurse: recurse || undefined
      }).then(async res => {
        const mapper = this.getEventMapper();
        const matrixEvents = res.chunk.filter(_utils.noUnsafeEventProps).filter((0, _threadUtils.getRelationsThreadFilter)(thread.id)).map(mapper);

        // Process latest events first
        for (const event of matrixEvents.slice().reverse()) {
          await thread?.processEvent(event);
          const sender = event.getSender();
          if (!backwards || thread?.getEventReadUpTo(sender) === null) {
            room.addLocalEchoReceipt(sender, event, _read_receipts.ReceiptType.Read);
          }
        }
        const newToken = res.next_batch;
        const timelineSet = eventTimeline.getTimelineSet();
        timelineSet.addEventsToTimeline(matrixEvents, backwards, eventTimeline, newToken ?? null);
        if (!newToken && backwards) {
          const originalEvent = thread.rootEvent ?? mapper(await this.fetchRoomEvent(eventTimeline.getRoomId() ?? "", thread.id));
          timelineSet.addEventsToTimeline([originalEvent], true, eventTimeline, null);
        }
        this.processAggregatedTimelineEvents(timelineSet.room, matrixEvents);

        // if we've hit the end of the timeline, we need to stop trying to
        // paginate. We need to keep the 'forwards' token though, to make sure
        // we can recover from gappy syncs.
        if (backwards && !newToken) {
          eventTimeline.setPaginationToken(null, dir);
        }
        return Boolean(newToken);
      }).finally(() => {
        eventTimeline.paginationRequests[dir] = null;
      });
      eventTimeline.paginationRequests[dir] = promise;
    } else {
      if (!room) {
        throw new Error("Unknown room " + eventTimeline.getRoomId());
      }
      promise = this.createMessagesRequest(eventTimeline.getRoomId(), token, opts.limit, dir, eventTimeline.getFilter()).then(res => {
        if (res.state) {
          const roomState = eventTimeline.getState(dir);
          const stateEvents = res.state.filter(_utils.noUnsafeEventProps).map(this.getEventMapper());
          roomState.setUnknownStateEvents(stateEvents);
        }
        const token = res.end;
        const matrixEvents = res.chunk.filter(_utils.noUnsafeEventProps).map(this.getEventMapper());
        const timelineSet = eventTimeline.getTimelineSet();
        const [timelineEvents,, unknownRelations] = room.partitionThreadedEvents(matrixEvents);
        timelineSet.addEventsToTimeline(timelineEvents, backwards, eventTimeline, token);
        this.processAggregatedTimelineEvents(room, timelineEvents);
        this.processThreadRoots(room, timelineEvents.filter(it => it.getServerAggregatedRelation(_thread.THREAD_RELATION_TYPE.name)), false);
        unknownRelations.forEach(event => room.relations.aggregateChildEvent(event));
        const atEnd = res.end === undefined || res.end === res.start;

        // if we've hit the end of the timeline, we need to stop trying to
        // paginate. We need to keep the 'forwards' token though, to make sure
        // we can recover from gappy syncs.
        if (backwards && atEnd) {
          eventTimeline.setPaginationToken(null, dir);
        }
        return !atEnd;
      }).finally(() => {
        eventTimeline.paginationRequests[dir] = null;
      });
      eventTimeline.paginationRequests[dir] = promise;
    }
    return promise;
  }

  /**
   * Reset the notifTimelineSet entirely, paginating in some historical notifs as
   * a starting point for subsequent pagination.
   */
  resetNotifTimelineSet() {
    if (!this.notifTimelineSet) {
      return;
    }

    // FIXME: This thing is a total hack, and results in duplicate events being
    // added to the timeline both from /sync and /notifications, and lots of
    // slow and wasteful processing and pagination.  The correct solution is to
    // extend /messages or /search or something to filter on notifications.

    // use the fictitious token 'end'. in practice we would ideally give it
    // the oldest backwards pagination token from /sync, but /sync doesn't
    // know about /notifications, so we have no choice but to start paginating
    // from the current point in time.  This may well overlap with historical
    // notifs which are then inserted into the timeline by /sync responses.
    this.notifTimelineSet.resetLiveTimeline("end");

    // we could try to paginate a single event at this point in order to get
    // a more valid pagination token, but it just ends up with an out of order
    // timeline. given what a mess this is and given we're going to have duplicate
    // events anyway, just leave it with the dummy token for now.
    /*
    this.paginateNotifTimeline(this._notifTimelineSet.getLiveTimeline(), {
        backwards: true,
        limit: 1
    });
    */
  }

  /**
   * Peek into a room and receive updates about the room. This only works if the
   * history visibility for the room is world_readable.
   * @param roomId - The room to attempt to peek into.
   * @param limit - The number of timeline events to initially retrieve.
   * @returns Promise which resolves: Room object
   * @returns Rejects: with an error response.
   */
  peekInRoom(roomId, limit = 20) {
    this.peekSync?.stopPeeking();
    this.peekSync = new _sync.SyncApi(this, this.clientOpts, this.buildSyncApiOptions());
    return this.peekSync.peek(roomId, limit);
  }

  /**
   * Stop any ongoing room peeking.
   */
  stopPeeking() {
    if (this.peekSync) {
      this.peekSync.stopPeeking();
      this.peekSync = null;
    }
  }

  /**
   * Set r/w flags for guest access in a room.
   * @param roomId - The room to configure guest access in.
   * @param opts - Options
   * @returns Promise which resolves
   * @returns Rejects: with an error response.
   */
  setGuestAccess(roomId, opts) {
    const writePromise = this.sendStateEvent(roomId, _event2.EventType.RoomGuestAccess, {
      guest_access: opts.allowJoin ? _partials.GuestAccess.CanJoin : _partials.GuestAccess.Forbidden
    }, "");
    let readPromise = Promise.resolve();
    if (opts.allowRead) {
      readPromise = this.sendStateEvent(roomId, _event2.EventType.RoomHistoryVisibility, {
        history_visibility: _partials.HistoryVisibility.WorldReadable
      }, "");
    }
    return Promise.all([readPromise, writePromise]).then(); // .then() to hide results for contract
  }

  /**
   * Requests an email verification token for the purposes of registration.
   * This API requests a token from the homeserver.
   * The doesServerRequireIdServerParam() method can be used to determine if
   * the server requires the id_server parameter to be provided.
   *
   * Parameters and return value are as for requestEmailToken
    * @param email - As requestEmailToken
   * @param clientSecret - As requestEmailToken
   * @param sendAttempt - As requestEmailToken
   * @param nextLink - As requestEmailToken
   * @returns Promise which resolves: As requestEmailToken
   */
  requestRegisterEmailToken(email, clientSecret, sendAttempt, nextLink) {
    return this.requestTokenFromEndpoint("/register/email/requestToken", {
      email: email,
      client_secret: clientSecret,
      send_attempt: sendAttempt,
      next_link: nextLink
    });
  }

  /**
   * Requests a text message verification token for the purposes of registration.
   * This API requests a token from the homeserver.
   * The doesServerRequireIdServerParam() method can be used to determine if
   * the server requires the id_server parameter to be provided.
   *
   * @param phoneCountry - The ISO 3166-1 alpha-2 code for the country in which
   *    phoneNumber should be parsed relative to.
   * @param phoneNumber - The phone number, in national or international format
   * @param clientSecret - As requestEmailToken
   * @param sendAttempt - As requestEmailToken
   * @param nextLink - As requestEmailToken
   * @returns Promise which resolves: As requestEmailToken
   */
  requestRegisterMsisdnToken(phoneCountry, phoneNumber, clientSecret, sendAttempt, nextLink) {
    return this.requestTokenFromEndpoint("/register/msisdn/requestToken", {
      country: phoneCountry,
      phone_number: phoneNumber,
      client_secret: clientSecret,
      send_attempt: sendAttempt,
      next_link: nextLink
    });
  }

  /**
   * Requests an email verification token for the purposes of adding a
   * third party identifier to an account.
   * This API requests a token from the homeserver.
   * The doesServerRequireIdServerParam() method can be used to determine if
   * the server requires the id_server parameter to be provided.
   * If an account with the given email address already exists and is
   * associated with an account other than the one the user is authed as,
   * it will either send an email to the address informing them of this
   * or return M_THREEPID_IN_USE (which one is up to the homeserver).
   *
   * @param email - As requestEmailToken
   * @param clientSecret - As requestEmailToken
   * @param sendAttempt - As requestEmailToken
   * @param nextLink - As requestEmailToken
   * @returns Promise which resolves: As requestEmailToken
   */
  requestAdd3pidEmailToken(email, clientSecret, sendAttempt, nextLink) {
    return this.requestTokenFromEndpoint("/account/3pid/email/requestToken", {
      email: email,
      client_secret: clientSecret,
      send_attempt: sendAttempt,
      next_link: nextLink
    });
  }

  /**
   * Requests a text message verification token for the purposes of adding a
   * third party identifier to an account.
   * This API proxies the identity server /validate/email/requestToken API,
   * adding specific behaviour for the addition of phone numbers to an
   * account, as requestAdd3pidEmailToken.
   *
   * @param phoneCountry - As requestRegisterMsisdnToken
   * @param phoneNumber - As requestRegisterMsisdnToken
   * @param clientSecret - As requestEmailToken
   * @param sendAttempt - As requestEmailToken
   * @param nextLink - As requestEmailToken
   * @returns Promise which resolves: As requestEmailToken
   */
  requestAdd3pidMsisdnToken(phoneCountry, phoneNumber, clientSecret, sendAttempt, nextLink) {
    return this.requestTokenFromEndpoint("/account/3pid/msisdn/requestToken", {
      country: phoneCountry,
      phone_number: phoneNumber,
      client_secret: clientSecret,
      send_attempt: sendAttempt,
      next_link: nextLink
    });
  }

  /**
   * Requests an email verification token for the purposes of resetting
   * the password on an account.
   * This API proxies the identity server /validate/email/requestToken API,
   * adding specific behaviour for the password resetting. Specifically,
   * if no account with the given email address exists, it may either
   * return M_THREEPID_NOT_FOUND or send an email
   * to the address informing them of this (which one is up to the homeserver).
   *
   * requestEmailToken calls the equivalent API directly on the identity server,
   * therefore bypassing the password reset specific logic.
   *
   * @param email - As requestEmailToken
   * @param clientSecret - As requestEmailToken
   * @param sendAttempt - As requestEmailToken
   * @param nextLink - As requestEmailToken
   * @returns Promise which resolves: As requestEmailToken
   */
  requestPasswordEmailToken(email, clientSecret, sendAttempt, nextLink) {
    return this.requestTokenFromEndpoint("/account/password/email/requestToken", {
      email: email,
      client_secret: clientSecret,
      send_attempt: sendAttempt,
      next_link: nextLink
    });
  }

  /**
   * Requests a text message verification token for the purposes of resetting
   * the password on an account.
   * This API proxies the identity server /validate/email/requestToken API,
   * adding specific behaviour for the password resetting, as requestPasswordEmailToken.
   *
   * @param phoneCountry - As requestRegisterMsisdnToken
   * @param phoneNumber - As requestRegisterMsisdnToken
   * @param clientSecret - As requestEmailToken
   * @param sendAttempt - As requestEmailToken
   * @param nextLink - As requestEmailToken
   * @returns Promise which resolves: As requestEmailToken
   */
  requestPasswordMsisdnToken(phoneCountry, phoneNumber, clientSecret, sendAttempt, nextLink) {
    return this.requestTokenFromEndpoint("/account/password/msisdn/requestToken", {
      country: phoneCountry,
      phone_number: phoneNumber,
      client_secret: clientSecret,
      send_attempt: sendAttempt,
      next_link: nextLink
    });
  }

  /**
   * Internal utility function for requesting validation tokens from usage-specific
   * requestToken endpoints.
   *
   * @param endpoint - The endpoint to send the request to
   * @param params - Parameters for the POST request
   * @returns Promise which resolves: As requestEmailToken
   */
  async requestTokenFromEndpoint(endpoint, params) {
    const postParams = Object.assign({}, params);
    return this.http.request(_httpApi.Method.Post, endpoint, undefined, postParams);
  }

  /**
   * Get the room-kind push rule associated with a room.
   * @param scope - "global" or device-specific.
   * @param roomId - the id of the room.
   * @returns the rule or undefined.
   */
  getRoomPushRule(scope, roomId) {
    // There can be only room-kind push rule per room
    // and its id is the room id.
    if (this.pushRules) {
      return this.pushRules[scope]?.room?.find(rule => rule.rule_id === roomId);
    } else {
      throw new Error("SyncApi.sync() must be done before accessing to push rules.");
    }
  }

  /**
   * Set a room-kind muting push rule in a room.
   * The operation also updates MatrixClient.pushRules at the end.
   * @param scope - "global" or device-specific.
   * @param roomId - the id of the room.
   * @param mute - the mute state.
   * @returns Promise which resolves: result object
   * @returns Rejects: with an error response.
   */
  setRoomMutePushRule(scope, roomId, mute) {
    let promise;
    let hasDontNotifyRule = false;

    // Get the existing room-kind push rule if any
    const roomPushRule = this.getRoomPushRule(scope, roomId);
    if (roomPushRule?.actions.includes(_PushRules.PushRuleActionName.DontNotify)) {
      hasDontNotifyRule = true;
    }
    if (!mute) {
      // Remove the rule only if it is a muting rule
      if (hasDontNotifyRule) {
        promise = this.deletePushRule(scope, _PushRules.PushRuleKind.RoomSpecific, roomPushRule.rule_id);
      }
    } else {
      if (!roomPushRule) {
        promise = this.addPushRule(scope, _PushRules.PushRuleKind.RoomSpecific, roomId, {
          actions: [_PushRules.PushRuleActionName.DontNotify]
        });
      } else if (!hasDontNotifyRule) {
        // Remove the existing one before setting the mute push rule
        // This is a workaround to SYN-590 (Push rule update fails)
        const deferred = utils.defer();
        this.deletePushRule(scope, _PushRules.PushRuleKind.RoomSpecific, roomPushRule.rule_id).then(() => {
          this.addPushRule(scope, _PushRules.PushRuleKind.RoomSpecific, roomId, {
            actions: [_PushRules.PushRuleActionName.DontNotify]
          }).then(() => {
            deferred.resolve();
          }).catch(err => {
            deferred.reject(err);
          });
        }).catch(err => {
          deferred.reject(err);
        });
        promise = deferred.promise;
      }
    }
    if (promise) {
      return new Promise((resolve, reject) => {
        // Update this.pushRules when the operation completes
        promise.then(() => {
          this.getPushRules().then(result => {
            this.pushRules = result;
            resolve();
          }).catch(err => {
            reject(err);
          });
        }).catch(err => {
          // Update it even if the previous operation fails. This can help the
          // app to recover when push settings has been modified from another client
          this.getPushRules().then(result => {
            this.pushRules = result;
            reject(err);
          }).catch(err2 => {
            reject(err);
          });
        });
      });
    }
  }
  searchMessageText(opts) {
    const roomEvents = {
      search_term: opts.query
    };
    if ("keys" in opts) {
      roomEvents.keys = opts.keys;
    }
    return this.search({
      body: {
        search_categories: {
          room_events: roomEvents
        }
      }
    });
  }

  /**
   * Perform a server-side search for room events.
   *
   * The returned promise resolves to an object containing the fields:
   *
   *  * count:       estimate of the number of results
   *  * next_batch:  token for back-pagination; if undefined, there are no more results
   *  * highlights:  a list of words to highlight from the stemming algorithm
   *  * results:     a list of results
   *
   * Each entry in the results list is a SearchResult.
   *
   * @returns Promise which resolves: result object
   * @returns Rejects: with an error response.
   */
  searchRoomEvents(opts) {
    // TODO: support search groups

    const body = {
      search_categories: {
        room_events: {
          search_term: opts.term,
          filter: opts.filter,
          order_by: _search.SearchOrderBy.Recent,
          event_context: {
            before_limit: 1,
            after_limit: 1,
            include_profile: true
          }
        }
      }
    };
    const searchResults = {
      _query: body,
      results: [],
      highlights: []
    };
    return this.search({
      body: body
    }).then(res => this.processRoomEventsSearch(searchResults, res));
  }

  /**
   * Take a result from an earlier searchRoomEvents call, and backfill results.
   *
   * @param searchResults -  the results object to be updated
   * @returns Promise which resolves: updated result object
   * @returns Rejects: with an error response.
   */
  backPaginateRoomEventsSearch(searchResults) {
    // TODO: we should implement a backoff (as per scrollback()) to deal more
    // nicely with HTTP errors.

    if (!searchResults.next_batch) {
      return Promise.reject(new Error("Cannot backpaginate event search any further"));
    }
    if (searchResults.pendingRequest) {
      // already a request in progress - return the existing promise
      return searchResults.pendingRequest;
    }
    const searchOpts = {
      body: searchResults._query,
      next_batch: searchResults.next_batch
    };
    const promise = this.search(searchOpts, searchResults.abortSignal).then(res => this.processRoomEventsSearch(searchResults, res)).finally(() => {
      searchResults.pendingRequest = undefined;
    });
    searchResults.pendingRequest = promise;
    return promise;
  }

  /**
   * helper for searchRoomEvents and backPaginateRoomEventsSearch. Processes the
   * response from the API call and updates the searchResults
   *
   * @returns searchResults
   * @internal
   */
  // XXX: Intended private, used in code
  processRoomEventsSearch(searchResults, response) {
    const roomEvents = response.search_categories.room_events;
    searchResults.count = roomEvents.count;
    searchResults.next_batch = roomEvents.next_batch;

    // combine the highlight list with our existing list;
    const highlights = new Set(roomEvents.highlights);
    searchResults.highlights.forEach(hl => {
      highlights.add(hl);
    });

    // turn it back into a list.
    searchResults.highlights = Array.from(highlights);
    const mapper = this.getEventMapper();

    // append the new results to our existing results
    const resultsLength = roomEvents.results?.length ?? 0;
    for (let i = 0; i < resultsLength; i++) {
      const sr = _searchResult.SearchResult.fromJson(roomEvents.results[i], mapper);
      const room = this.getRoom(sr.context.getEvent().getRoomId());
      if (room) {
        // Copy over a known event sender if we can
        for (const ev of sr.context.getTimeline()) {
          const sender = room.getMember(ev.getSender());
          if (!ev.sender && sender) ev.sender = sender;
        }
      }
      searchResults.results.push(sr);
    }
    return searchResults;
  }

  /**
   * Populate the store with rooms the user has left.
   * @returns Promise which resolves: TODO - Resolved when the rooms have
   * been added to the data store.
   * @returns Rejects: with an error response.
   */
  syncLeftRooms() {
    // Guard against multiple calls whilst ongoing and multiple calls post success
    if (this.syncedLeftRooms) {
      return Promise.resolve([]); // don't call syncRooms again if it succeeded.
    }
    if (this.syncLeftRoomsPromise) {
      return this.syncLeftRoomsPromise; // return the ongoing request
    }
    const syncApi = new _sync.SyncApi(this, this.clientOpts, this.buildSyncApiOptions());
    this.syncLeftRoomsPromise = syncApi.syncLeftRooms();

    // cleanup locks
    this.syncLeftRoomsPromise.then(() => {
      this.logger.debug("Marking success of sync left room request");
      this.syncedLeftRooms = true; // flip the bit on success
    }).finally(() => {
      this.syncLeftRoomsPromise = undefined; // cleanup ongoing request state
    });
    return this.syncLeftRoomsPromise;
  }

  /**
   * Create a new filter.
   * @param content - The HTTP body for the request
   * @returns Promise which resolves to a Filter object.
   * @returns Rejects: with an error response.
   */
  createFilter(content) {
    const path = utils.encodeUri("/user/$userId/filter", {
      $userId: this.credentials.userId
    });
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, content).then(response => {
      // persist the filter
      const filter = _filter.Filter.fromJson(this.credentials.userId, response.filter_id, content);
      this.store.storeFilter(filter);
      return filter;
    });
  }

  /**
   * Retrieve a filter.
   * @param userId - The user ID of the filter owner
   * @param filterId - The filter ID to retrieve
   * @param allowCached - True to allow cached filters to be returned.
   * Default: True.
   * @returns Promise which resolves: a Filter object
   * @returns Rejects: with an error response.
   */
  getFilter(userId, filterId, allowCached) {
    if (allowCached) {
      const filter = this.store.getFilter(userId, filterId);
      if (filter) {
        return Promise.resolve(filter);
      }
    }
    const path = utils.encodeUri("/user/$userId/filter/$filterId", {
      $userId: userId,
      $filterId: filterId
    });
    return this.http.authedRequest(_httpApi.Method.Get, path).then(response => {
      // persist the filter
      const filter = _filter.Filter.fromJson(userId, filterId, response);
      this.store.storeFilter(filter);
      return filter;
    });
  }

  /**
   * @returns Filter ID
   */
  async getOrCreateFilter(filterName, filter) {
    const filterId = this.store.getFilterIdByName(filterName);
    let existingId;
    if (filterId) {
      // check that the existing filter matches our expectations
      try {
        const existingFilter = await this.getFilter(this.credentials.userId, filterId, true);
        if (existingFilter) {
          const oldDef = existingFilter.getDefinition();
          const newDef = filter.getDefinition();
          if (utils.deepCompare(oldDef, newDef)) {
            // super, just use that.
            // debuglog("Using existing filter ID %s: %s", filterId,
            //          JSON.stringify(oldDef));
            existingId = filterId;
          }
        }
      } catch (error) {
        // Synapse currently returns the following when the filter cannot be found:
        // {
        //     errcode: "M_UNKNOWN",
        //     name: "M_UNKNOWN",
        //     message: "No row found",
        // }
        if (error.errcode !== "M_UNKNOWN" && error.errcode !== "M_NOT_FOUND") {
          throw error;
        }
      }
      // if the filter doesn't exist anymore on the server, remove from store
      if (!existingId) {
        this.store.setFilterIdByName(filterName, undefined);
      }
    }
    if (existingId) {
      return existingId;
    }

    // create a new filter
    const createdFilter = await this.createFilter(filter.getDefinition());
    this.store.setFilterIdByName(filterName, createdFilter.filterId);
    return createdFilter.filterId;
  }

  /**
   * Gets a bearer token from the homeserver that the user can
   * present to a third party in order to prove their ownership
   * of the Matrix account they are logged into.
   * @returns Promise which resolves: Token object
   * @returns Rejects: with an error response.
   */
  getOpenIdToken() {
    const path = utils.encodeUri("/user/$userId/openid/request_token", {
      $userId: this.credentials.userId
    });
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, {});
  }
  /**
   * @returns Promise which resolves: ITurnServerResponse object
   * @returns Rejects: with an error response.
   */
  turnServer() {
    return this.http.authedRequest(_httpApi.Method.Get, "/voip/turnServer");
  }

  /**
   * Get the TURN servers for this homeserver.
   * @returns The servers or an empty list.
   */
  getTurnServers() {
    return this.turnServers || [];
  }

  /**
   * Get the unix timestamp (in milliseconds) at which the current
   * TURN credentials (from getTurnServers) expire
   * @returns The expiry timestamp in milliseconds
   */
  getTurnServersExpiry() {
    return this.turnServersExpiry;
  }
  get pollingTurnServers() {
    return this.checkTurnServersIntervalID !== undefined;
  }

  // XXX: Intended private, used in code.
  async checkTurnServers() {
    if (!this.canSupportVoip) {
      return;
    }
    let credentialsGood = false;
    const remainingTime = this.turnServersExpiry - Date.now();
    if (remainingTime > TURN_CHECK_INTERVAL) {
      this.logger.debug("TURN creds are valid for another " + remainingTime + " ms: not fetching new ones.");
      credentialsGood = true;
    } else {
      this.logger.debug("Fetching new TURN credentials");
      try {
        const res = await this.turnServer();
        if (res.uris) {
          this.logger.debug("Got TURN URIs: " + res.uris + " refresh in " + res.ttl + " secs");
          // map the response to a format that can be fed to RTCPeerConnection
          const servers = {
            urls: res.uris,
            username: res.username,
            credential: res.password
          };
          this.turnServers = [servers];
          // The TTL is in seconds but we work in ms
          this.turnServersExpiry = Date.now() + res.ttl * 1000;
          credentialsGood = true;
          this.emit(ClientEvent.TurnServers, this.turnServers);
        }
      } catch (err) {
        this.logger.error("Failed to get TURN URIs", err);
        if (err.httpStatus === 403) {
          // We got a 403, so there's no point in looping forever.
          this.logger.info("TURN access unavailable for this account: stopping credentials checks");
          if (this.checkTurnServersIntervalID !== null) global.clearInterval(this.checkTurnServersIntervalID);
          this.checkTurnServersIntervalID = undefined;
          this.emit(ClientEvent.TurnServersError, err, true); // fatal
        } else {
          // otherwise, if we failed for whatever reason, try again the next time we're called.
          this.emit(ClientEvent.TurnServersError, err, false); // non-fatal
        }
      }
    }
    return credentialsGood;
  }

  /**
   * Set whether to allow a fallback ICE server should be used for negotiating a
   * WebRTC connection if the homeserver doesn't provide any servers. Defaults to
   * false.
   *
   */
  setFallbackICEServerAllowed(allow) {
    this.fallbackICEServerAllowed = allow;
  }

  /**
   * Get whether to allow a fallback ICE server should be used for negotiating a
   * WebRTC connection if the homeserver doesn't provide any servers. Defaults to
   * false.
   *
   * @returns
   */
  isFallbackICEServerAllowed() {
    return this.fallbackICEServerAllowed;
  }

  /**
   * Determines if the current user is an administrator of the Synapse homeserver.
   * Returns false if untrue or the homeserver does not appear to be a Synapse
   * homeserver. <strong>This function is implementation specific and may change
   * as a result.</strong>
   * @returns true if the user appears to be a Synapse administrator.
   */
  isSynapseAdministrator() {
    const path = utils.encodeUri("/_synapse/admin/v1/users/$userId/admin", {
      $userId: this.getUserId()
    });
    return this.http.authedRequest(_httpApi.Method.Get, path, undefined, undefined, {
      prefix: ""
    }).then(r => r.admin); // pull out the specific boolean we want
  }

  /**
   * Performs a whois lookup on a user using Synapse's administrator API.
   * <strong>This function is implementation specific and may change as a
   * result.</strong>
   * @param userId - the User ID to look up.
   * @returns the whois response - see Synapse docs for information.
   */
  whoisSynapseUser(userId) {
    const path = utils.encodeUri("/_synapse/admin/v1/whois/$userId", {
      $userId: userId
    });
    return this.http.authedRequest(_httpApi.Method.Get, path, undefined, undefined, {
      prefix: ""
    });
  }

  /**
   * Deactivates a user using Synapse's administrator API. <strong>This
   * function is implementation specific and may change as a result.</strong>
   * @param userId - the User ID to deactivate.
   * @returns the deactivate response - see Synapse docs for information.
   */
  deactivateSynapseUser(userId) {
    const path = utils.encodeUri("/_synapse/admin/v1/deactivate/$userId", {
      $userId: userId
    });
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, undefined, {
      prefix: ""
    });
  }
  async fetchClientWellKnown() {
    // `getRawClientConfig` does not throw or reject on network errors, instead
    // it absorbs errors and returns `{}`.
    this.clientWellKnownPromise = _autodiscovery.AutoDiscovery.getRawClientConfig(this.getDomain() ?? undefined);
    this.clientWellKnown = await this.clientWellKnownPromise;
    this.emit(ClientEvent.ClientWellKnown, this.clientWellKnown);
  }
  getClientWellKnown() {
    return this.clientWellKnown;
  }
  waitForClientWellKnown() {
    if (!this.clientRunning) {
      throw new Error("Client is not running");
    }
    return this.clientWellKnownPromise;
  }

  /**
   * store client options with boolean/string/numeric values
   * to know in the next session what flags the sync data was
   * created with (e.g. lazy loading)
   * @returns for store operation
   */
  storeClientOptions() {
    // XXX: Intended private, used in code
    const primTypes = ["boolean", "string", "number"];
    const serializableOpts = Object.entries(this.clientOpts).filter(([key, value]) => {
      return primTypes.includes(typeof value);
    }).reduce((obj, [key, value]) => {
      obj[key] = value;
      return obj;
    }, {});
    return this.store.storeClientOptions(serializableOpts);
  }

  /**
   * Gets a set of room IDs in common with another user.
   *
   * Note: This endpoint is unstable, and can throw an `Error`.
   *   Check progress on [MSC2666](https://github.com/matrix-org/matrix-spec-proposals/pull/2666) for more details.
   *
   * @param userId - The userId to check.
   * @returns Promise which resolves to an array of rooms
   * @returns Rejects: with an error response.
   */
  // TODO: on spec release, rename this to getMutualRooms
  // eslint-disable-next-line
  async _unstable_getSharedRooms(userId) {
    // Initial variant of the MSC
    const sharedRoomsSupport = await this.doesServerSupportUnstableFeature(UNSTABLE_MSC2666_SHARED_ROOMS);

    // Newer variant that renamed shared rooms to mutual rooms
    const mutualRoomsSupport = await this.doesServerSupportUnstableFeature(UNSTABLE_MSC2666_MUTUAL_ROOMS);

    // Latest variant that changed from path elements to query elements
    const queryMutualRoomsSupport = await this.doesServerSupportUnstableFeature(UNSTABLE_MSC2666_QUERY_MUTUAL_ROOMS);
    if (!sharedRoomsSupport && !mutualRoomsSupport && !queryMutualRoomsSupport) {
      throw Error("Server does not support the Mutual Rooms API");
    }
    let path;
    let query;

    // Cascading unstable support switching.
    if (queryMutualRoomsSupport) {
      path = "/uk.half-shot.msc2666/user/mutual_rooms";
      query = {
        user_id: userId
      };
    } else {
      path = utils.encodeUri(`/uk.half-shot.msc2666/user/${mutualRoomsSupport ? "mutual_rooms" : "shared_rooms"}/$userId`, {
        $userId: userId
      });
      query = {};
    }

    // Accumulated rooms
    const rooms = [];
    let token = null;
    do {
      const tokenQuery = {};
      if (token != null && queryMutualRoomsSupport) {
        tokenQuery["batch_token"] = token;
      }
      const res = await this.http.authedRequest(_httpApi.Method.Get, path, _objectSpread(_objectSpread({}, query), tokenQuery), undefined, {
        prefix: _httpApi.ClientPrefix.Unstable
      });
      rooms.push(...res.joined);
      if (res.next_batch_token !== undefined) {
        token = res.next_batch_token;
      } else {
        token = null;
      }
    } while (token != null);
    return rooms;
  }

  /**
   * Get the API versions supported by the server, along with any
   * unstable APIs it supports
   * @returns The server /versions response
   */
  async getVersions() {
    if (this.serverVersionsPromise) {
      return this.serverVersionsPromise;
    }

    // We send an authenticated request as of MSC4026
    this.serverVersionsPromise = this.http.authedRequest(_httpApi.Method.Get, "/_matrix/client/versions", undefined, undefined, {
      prefix: ""
    }).catch(e => {
      // Need to unset this if it fails, otherwise we'll never retry
      this.serverVersionsPromise = undefined;
      // but rethrow the exception to anything that was waiting
      throw e;
    });
    const serverVersions = await this.serverVersionsPromise;
    this.canSupport = await (0, _feature.buildFeatureSupportMap)(serverVersions);
    return this.serverVersionsPromise;
  }

  /**
   * Check if a particular spec version is supported by the server.
   * @param version - The spec version (such as "r0.5.0") to check for.
   * @returns Whether it is supported
   */
  async isVersionSupported(version) {
    const {
      versions
    } = await this.getVersions();
    return versions && versions.includes(version);
  }

  /**
   * Query the server to see if it lists support for an unstable feature
   * in the /versions response
   * @param feature - the feature name
   * @returns true if the feature is supported
   */
  async doesServerSupportUnstableFeature(feature) {
    const response = await this.getVersions();
    if (!response) return false;
    const unstableFeatures = response["unstable_features"];
    return unstableFeatures && !!unstableFeatures[feature];
  }

  /**
   * Query the server to see if it is forcing encryption to be enabled for
   * a given room preset, based on the /versions response.
   * @param presetName - The name of the preset to check.
   * @returns true if the server is forcing encryption
   * for the preset.
   */
  async doesServerForceEncryptionForPreset(presetName) {
    const response = await this.getVersions();
    if (!response) return false;
    const unstableFeatures = response["unstable_features"];

    // The preset name in the versions response will be without the _chat suffix.
    const versionsPresetName = presetName.includes("_chat") ? presetName.substring(0, presetName.indexOf("_chat")) : presetName;
    return unstableFeatures && !!unstableFeatures[`io.element.e2ee_forced.${versionsPresetName}`];
  }
  async doesServerSupportThread() {
    if (await this.isVersionSupported("v1.4")) {
      return {
        threads: _thread.FeatureSupport.Stable,
        list: _thread.FeatureSupport.Stable,
        fwdPagination: _thread.FeatureSupport.Stable
      };
    }
    try {
      const [threadUnstable, threadStable, listUnstable, listStable, fwdPaginationUnstable, fwdPaginationStable] = await Promise.all([this.doesServerSupportUnstableFeature("org.matrix.msc3440"), this.doesServerSupportUnstableFeature("org.matrix.msc3440.stable"), this.doesServerSupportUnstableFeature("org.matrix.msc3856"), this.doesServerSupportUnstableFeature("org.matrix.msc3856.stable"), this.doesServerSupportUnstableFeature("org.matrix.msc3715"), this.doesServerSupportUnstableFeature("org.matrix.msc3715.stable")]);
      return {
        threads: (0, _thread.determineFeatureSupport)(threadStable, threadUnstable),
        list: (0, _thread.determineFeatureSupport)(listStable, listUnstable),
        fwdPagination: (0, _thread.determineFeatureSupport)(fwdPaginationStable, fwdPaginationUnstable)
      };
    } catch (e) {
      return {
        threads: _thread.FeatureSupport.None,
        list: _thread.FeatureSupport.None,
        fwdPagination: _thread.FeatureSupport.None
      };
    }
  }

  /**
   * Get if lazy loading members is being used.
   * @returns Whether or not members are lazy loaded by this client
   */
  hasLazyLoadMembersEnabled() {
    return !!this.clientOpts?.lazyLoadMembers;
  }

  /**
   * Set a function which is called when /sync returns a 'limited' response.
   * It is called with a room ID and returns a boolean. It should return 'true' if the SDK
   * can SAFELY remove events from this room. It may not be safe to remove events if there
   * are other references to the timelines for this room, e.g because the client is
   * actively viewing events in this room.
   * Default: returns false.
   * @param cb - The callback which will be invoked.
   */
  setCanResetTimelineCallback(cb) {
    this.canResetTimelineCallback = cb;
  }

  /**
   * Get the callback set via `setCanResetTimelineCallback`.
   * @returns The callback or null
   */
  getCanResetTimelineCallback() {
    return this.canResetTimelineCallback;
  }

  /**
   * Returns relations for a given event. Handles encryption transparently,
   * with the caveat that the amount of events returned might be 0, even though you get a nextBatch.
   * When the returned promise resolves, all messages should have finished trying to decrypt.
   * @param roomId - the room of the event
   * @param eventId - the id of the event
   * @param relationType - the rel_type of the relations requested
   * @param eventType - the event type of the relations requested
   * @param opts - options with optional values for the request.
   * @returns an object with `events` as `MatrixEvent[]` and optionally `nextBatch` if more relations are available.
   */
  async relations(roomId, eventId, relationType, eventType, opts = {
    dir: _eventTimeline.Direction.Backward
  }) {
    const fetchedEventType = eventType ? this.getEncryptedIfNeededEventType(roomId, eventType) : null;
    const [eventResult, result] = await Promise.all([this.fetchRoomEvent(roomId, eventId), this.fetchRelations(roomId, eventId, relationType, fetchedEventType, opts)]);
    const mapper = this.getEventMapper();
    const originalEvent = eventResult ? mapper(eventResult) : undefined;
    let events = result.chunk.map(mapper);
    if (fetchedEventType === _event2.EventType.RoomMessageEncrypted) {
      const allEvents = originalEvent ? events.concat(originalEvent) : events;
      await Promise.all(allEvents.map(e => this.decryptEventIfNeeded(e)));
      if (eventType !== null) {
        events = events.filter(e => e.getType() === eventType);
      }
    }
    if (originalEvent && relationType === _event2.RelationType.Replace) {
      events = events.filter(e => e.getSender() === originalEvent.getSender());
    }
    return {
      originalEvent: originalEvent ?? null,
      events,
      nextBatch: result.next_batch ?? null,
      prevBatch: result.prev_batch ?? null
    };
  }

  /**
   * The app may wish to see if we have a key cached without
   * triggering a user interaction.
   */
  getCrossSigningCacheCallbacks() {
    // XXX: Private member access
    return this.crypto?.crossSigningInfo.getCacheCallbacks();
  }

  /**
   * Generates a random string suitable for use as a client secret. <strong>This
   * method is experimental and may change.</strong>
   * @returns A new client secret
   */
  generateClientSecret() {
    return (0, _randomstring.randomString)(32);
  }

  /**
   * Attempts to decrypt an event
   * @param event - The event to decrypt
   * @returns A decryption promise
   */
  decryptEventIfNeeded(event, options) {
    if (event.shouldAttemptDecryption() && this.isCryptoEnabled()) {
      event.attemptDecryption(this.cryptoBackend, options);
    }
    if (event.isBeingDecrypted()) {
      return event.getDecryptionPromise();
    } else {
      return Promise.resolve();
    }
  }
  termsUrlForService(serviceType, baseUrl) {
    switch (serviceType) {
      case _serviceTypes.SERVICE_TYPES.IS:
        return this.http.getUrl("/terms", undefined, _httpApi.IdentityPrefix.V2, baseUrl);
      case _serviceTypes.SERVICE_TYPES.IM:
        return this.http.getUrl("/terms", undefined, "/_matrix/integrations/v1", baseUrl);
      default:
        throw new Error("Unsupported service type");
    }
  }

  /**
   * Get the Homeserver URL of this client
   * @returns Homeserver URL of this client
   */
  getHomeserverUrl() {
    return this.baseUrl;
  }

  /**
   * Get the identity server URL of this client
   * @param stripProto - whether or not to strip the protocol from the URL
   * @returns Identity server URL of this client
   */
  getIdentityServerUrl(stripProto = false) {
    if (stripProto && (this.idBaseUrl?.startsWith("http://") || this.idBaseUrl?.startsWith("https://"))) {
      return this.idBaseUrl.split("://")[1];
    }
    return this.idBaseUrl;
  }

  /**
   * Set the identity server URL of this client
   * @param url - New identity server URL
   */
  setIdentityServerUrl(url) {
    this.idBaseUrl = utils.ensureNoTrailingSlash(url);
    this.http.setIdBaseUrl(this.idBaseUrl);
  }

  /**
   * Get the access token associated with this account.
   * @returns The access_token or null
   */
  getAccessToken() {
    return this.http.opts.accessToken || null;
  }

  /**
   * Get the refresh token associated with this account.
   * @returns The refresh_token or null
   */
  getRefreshToken() {
    return this.http.opts.refreshToken ?? null;
  }

  /**
   * Set the access token associated with this account.
   * @param token - The new access token.
   */
  setAccessToken(token) {
    this.http.opts.accessToken = token;
    // The /versions response can vary for different users so clear the cache
    this.serverVersionsPromise = undefined;
  }

  /**
   * @returns true if there is a valid access_token for this client.
   */
  isLoggedIn() {
    return this.http.opts.accessToken !== undefined;
  }

  /**
   * Make up a new transaction id
   *
   * @returns a new, unique, transaction id
   */
  makeTxnId() {
    return "m" + new Date().getTime() + "." + this.txnCtr++;
  }

  /**
   * Check whether a username is available prior to registration. An error response
   * indicates an invalid/unavailable username.
   * @param username - The username to check the availability of.
   * @returns Promise which resolves: to boolean of whether the username is available.
   */
  isUsernameAvailable(username) {
    return this.http.authedRequest(_httpApi.Method.Get, "/register/available", {
      username
    }).then(response => {
      return response.available;
    }).catch(response => {
      if (response.errcode === "M_USER_IN_USE") {
        return false;
      }
      return Promise.reject(response);
    });
  }

  /**
   * @param bindThreepids - Set key 'email' to true to bind any email
   *     threepid uses during registration in the identity server. Set 'msisdn' to
   *     true to bind msisdn.
   * @returns Promise which resolves to a RegisterResponse object
   * @returns Rejects: with an error response.
   */
  register(username, password, sessionId, auth, bindThreepids, guestAccessToken, inhibitLogin) {
    if (sessionId) {
      auth.session = sessionId;
    }
    const params = {
      auth: auth,
      refresh_token: true // always ask for a refresh token - does nothing if unsupported
    };
    if (username !== undefined && username !== null) {
      params.username = username;
    }
    if (password !== undefined && password !== null) {
      params.password = password;
    }
    if (guestAccessToken !== undefined && guestAccessToken !== null) {
      params.guest_access_token = guestAccessToken;
    }
    if (inhibitLogin !== undefined && inhibitLogin !== null) {
      params.inhibit_login = inhibitLogin;
    }
    return this.registerRequest(params);
  }

  /**
   * Register a guest account.
   * This method returns the auth info needed to create a new authenticated client,
   * Remember to call `setGuest(true)` on the (guest-)authenticated client, e.g:
   * ```javascript
   * const tmpClient = await sdk.createClient(MATRIX_INSTANCE);
   * const { user_id, device_id, access_token } = tmpClient.registerGuest();
   * const client = createClient({
   *   baseUrl: MATRIX_INSTANCE,
   *   accessToken: access_token,
   *   userId: user_id,
   *   deviceId: device_id,
   * })
   * client.setGuest(true);
   * ```
   *
   * @param body - JSON HTTP body to provide.
   * @returns Promise which resolves: JSON object that contains:
   *                   `{ user_id, device_id, access_token, home_server }`
   * @returns Rejects: with an error response.
   */
  registerGuest({
    body
  } = {}) {
    return this.registerRequest(body || {}, "guest");
  }

  /**
   * @param data - parameters for registration request
   * @param kind - type of user to register. may be "guest"
   * @returns Promise which resolves: to the /register response
   * @returns Rejects: with an error response.
   */
  registerRequest(data, kind) {
    const params = {};
    if (kind) {
      params.kind = kind;
    }
    return this.http.request(_httpApi.Method.Post, "/register", params, data);
  }

  /**
   * Refreshes an access token using a provided refresh token. The refresh token
   * must be valid for the current access token known to the client instance.
   *
   * Note that this function will not cause a logout if the token is deemed
   * unknown by the server - the caller is responsible for managing logout
   * actions on error.
   * @param refreshToken - The refresh token.
   * @returns Promise which resolves to the new token.
   * @returns Rejects with an error response.
   */
  refreshToken(refreshToken) {
    const performRefreshRequestWithPrefix = prefix => this.http.authedRequest(_httpApi.Method.Post, "/refresh", undefined, {
      refresh_token: refreshToken
    }, {
      prefix,
      inhibitLogoutEmit: true // we don't want to cause logout loops
    });

    // First try with the (specced) /v3/ prefix.
    // However, before Synapse 1.72.0, Synapse incorrectly required a /v1/ prefix, so we fall
    // back to that if the request fails, for backwards compatibility.
    return performRefreshRequestWithPrefix(_httpApi.ClientPrefix.V3).catch(e => {
      if (e.errcode === "M_UNRECOGNIZED") {
        return performRefreshRequestWithPrefix(_httpApi.ClientPrefix.V1);
      }
      throw e;
    });
  }

  /**
   * @returns Promise which resolves to the available login flows
   * @returns Rejects: with an error response.
   */
  loginFlows() {
    return this.http.request(_httpApi.Method.Get, "/login");
  }

  /**
   * @returns Promise which resolves to a LoginResponse object
   * @returns Rejects: with an error response.
   */
  login(loginType, data) {
    return this.http.authedRequest(_httpApi.Method.Post, "/login", undefined, _objectSpread(_objectSpread({}, data), {}, {
      type: loginType
    })).then(response => {
      if (response.access_token && response.user_id) {
        this.http.opts.accessToken = response.access_token;
        this.credentials = {
          userId: response.user_id
        };
      }
      return response;
    });
  }

  /**
   * @returns Promise which resolves to a LoginResponse object
   * @returns Rejects: with an error response.
   */
  loginWithPassword(user, password) {
    return this.login("m.login.password", {
      user: user,
      password: password
    });
  }

  /**
   * @param redirectUrl - The URL to redirect to after the HS
   * authenticates with CAS.
   * @returns The HS URL to hit to begin the CAS login process.
   */
  getCasLoginUrl(redirectUrl) {
    return this.getSsoLoginUrl(redirectUrl, "cas");
  }

  /**
   * @param redirectUrl - The URL to redirect to after the HS
   *     authenticates with the SSO.
   * @param loginType - The type of SSO login we are doing (sso or cas).
   *     Defaults to 'sso'.
   * @param idpId - The ID of the Identity Provider being targeted, optional.
   * @param action - the SSO flow to indicate to the IdP, optional.
   * @returns The HS URL to hit to begin the SSO login process.
   */
  getSsoLoginUrl(redirectUrl, loginType = "sso", idpId, action) {
    let url = "/login/" + loginType + "/redirect";
    if (idpId) {
      url += "/" + idpId;
    }
    const params = {
      redirectUrl,
      [SSO_ACTION_PARAM.unstable]: action
    };
    return this.http.getUrl(url, params).href;
  }

  /**
   * @param token - Login token previously received from homeserver
   * @returns Promise which resolves to a LoginResponse object
   * @returns Rejects: with an error response.
   */
  loginWithToken(token) {
    return this.login("m.login.token", {
      token: token
    });
  }

  /**
   * Logs out the current session.
   * Obviously, further calls that require authorisation should fail after this
   * method is called. The state of the MatrixClient object is not affected:
   * it is up to the caller to either reset or destroy the MatrixClient after
   * this method succeeds.
   * @param stopClient - whether to stop the client before calling /logout to prevent invalid token errors.
   * @returns Promise which resolves: On success, the empty object `{}`
   */
  async logout(stopClient = false) {
    if (this.crypto?.backupManager?.getKeyBackupEnabled()) {
      try {
        while ((await this.crypto.backupManager.backupPendingKeys(200)) > 0);
      } catch (err) {
        this.logger.error("Key backup request failed when logging out. Some keys may be missing from backup", err);
      }
    }
    if (stopClient) {
      this.stopClient();
      this.http.abort();
    }
    return this.http.authedRequest(_httpApi.Method.Post, "/logout");
  }

  /**
   * Deactivates the logged-in account.
   * Obviously, further calls that require authorisation should fail after this
   * method is called. The state of the MatrixClient object is not affected:
   * it is up to the caller to either reset or destroy the MatrixClient after
   * this method succeeds.
   * @param auth - Optional. Auth data to supply for User-Interactive auth.
   * @param erase - Optional. If set, send as `erase` attribute in the
   * JSON request body, indicating whether the account should be erased. Defaults
   * to false.
   * @returns Promise which resolves: On success, the empty object
   */
  deactivateAccount(auth, erase) {
    const body = {};
    if (auth) {
      body.auth = auth;
    }
    if (erase !== undefined) {
      body.erase = erase;
    }
    return this.http.authedRequest(_httpApi.Method.Post, "/account/deactivate", undefined, body);
  }

  /**
   * Make a request for an `m.login.token` to be issued as per
   * https://spec.matrix.org/v1.7/client-server-api/#post_matrixclientv1loginget_token
   *
   * The server may require User-Interactive auth.
   *
   * @param auth - Optional. Auth data to supply for User-Interactive auth.
   * @returns Promise which resolves: On success, the token response
   * or UIA auth data.
   */
  async requestLoginToken(auth) {
    const body = {
      auth
    };
    return this.http.authedRequest(_httpApi.Method.Post, "/login/get_token", undefined,
    // no query params
    body, {
      prefix: _httpApi.ClientPrefix.V1
    });
  }

  /**
   * Get the fallback URL to use for unknown interactive-auth stages.
   *
   * @param loginType -     the type of stage being attempted
   * @param authSessionId - the auth session ID provided by the homeserver
   *
   * @returns HS URL to hit to for the fallback interface
   */
  getFallbackAuthUrl(loginType, authSessionId) {
    const path = utils.encodeUri("/auth/$loginType/fallback/web", {
      $loginType: loginType
    });
    return this.http.getUrl(path, {
      session: authSessionId
    }).href;
  }

  /**
   * Create a new room.
   * @param options - a list of options to pass to the /createRoom API.
   * @returns Promise which resolves: `{room_id: {string}}`
   * @returns Rejects: with an error response.
   */
  async createRoom(options) {
    // eslint-disable-line camelcase
    // some valid options include: room_alias_name, visibility, invite

    // inject the id_access_token if inviting 3rd party addresses
    const invitesNeedingToken = (options.invite_3pid || []).filter(i => !i.id_access_token);
    if (invitesNeedingToken.length > 0 && this.identityServer?.getAccessToken) {
      const identityAccessToken = await this.identityServer.getAccessToken();
      if (identityAccessToken) {
        for (const invite of invitesNeedingToken) {
          invite.id_access_token = identityAccessToken;
        }
      }
    }
    return this.http.authedRequest(_httpApi.Method.Post, "/createRoom", undefined, options);
  }

  /**
   * Fetches relations for a given event
   * @param roomId - the room of the event
   * @param eventId - the id of the event
   * @param relationType - the rel_type of the relations requested
   * @param eventType - the event type of the relations requested
   * @param opts - options with optional values for the request.
   * @returns the response, with chunk, prev_batch and, next_batch.
   */
  fetchRelations(roomId, eventId, relationType, eventType, opts = {
    dir: _eventTimeline.Direction.Backward
  }) {
    let params = opts;
    if (_thread.Thread.hasServerSideFwdPaginationSupport === _thread.FeatureSupport.Experimental) {
      params = (0, _utils.replaceParam)("dir", "org.matrix.msc3715.dir", params);
    }
    if (this.canSupport.get(_feature.Feature.RelationsRecursion) === _feature.ServerSupport.Unstable) {
      params = (0, _utils.replaceParam)("recurse", "org.matrix.msc3981.recurse", params);
    }
    const queryString = utils.encodeParams(params);
    let templatedUrl = "/rooms/$roomId/relations/$eventId";
    if (relationType !== null) {
      templatedUrl += "/$relationType";
      if (eventType !== null) {
        templatedUrl += "/$eventType";
      }
    } else if (eventType !== null) {
      this.logger.warn(`eventType: ${eventType} ignored when fetching
            relations as relationType is null`);
      eventType = null;
    }
    const path = utils.encodeUri(templatedUrl + "?" + queryString, {
      $roomId: roomId,
      $eventId: eventId,
      $relationType: relationType,
      $eventType: eventType
    });
    return this.http.authedRequest(_httpApi.Method.Get, path, undefined, undefined, {
      prefix: _httpApi.ClientPrefix.V1
    });
  }

  /**
   * @returns Promise which resolves: TODO
   * @returns Rejects: with an error response.
   */
  roomState(roomId) {
    const path = utils.encodeUri("/rooms/$roomId/state", {
      $roomId: roomId
    });
    return this.http.authedRequest(_httpApi.Method.Get, path);
  }

  /**
   * Get an event in a room by its event id.
   *
   * @returns Promise which resolves to an object containing the event.
   * @returns Rejects: with an error response.
   */
  fetchRoomEvent(roomId, eventId) {
    const path = utils.encodeUri("/rooms/$roomId/event/$eventId", {
      $roomId: roomId,
      $eventId: eventId
    });
    return this.http.authedRequest(_httpApi.Method.Get, path);
  }

  /**
   * @param includeMembership - the membership type to include in the response
   * @param excludeMembership - the membership type to exclude from the response
   * @param atEventId - the id of the event for which moment in the timeline the members should be returned for
   * @returns Promise which resolves: dictionary of userid to profile information
   * @returns Rejects: with an error response.
   */
  members(roomId, includeMembership, excludeMembership, atEventId) {
    const queryParams = {};
    if (includeMembership) {
      queryParams.membership = includeMembership;
    }
    if (excludeMembership) {
      queryParams.not_membership = excludeMembership;
    }
    if (atEventId) {
      queryParams.at = atEventId;
    }
    const queryString = utils.encodeParams(queryParams);
    const path = utils.encodeUri("/rooms/$roomId/members?" + queryString, {
      $roomId: roomId
    });
    return this.http.authedRequest(_httpApi.Method.Get, path);
  }

  /**
   * Upgrades a room to a new protocol version
   * @param newVersion - The target version to upgrade to
   * @returns Promise which resolves: Object with key 'replacement_room'
   * @returns Rejects: with an error response.
   */
  upgradeRoom(roomId, newVersion) {
    // eslint-disable-line camelcase
    const path = utils.encodeUri("/rooms/$roomId/upgrade", {
      $roomId: roomId
    });
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, {
      new_version: newVersion
    });
  }

  /**
   * Retrieve a state event.
   * @returns Promise which resolves: TODO
   * @returns Rejects: with an error response.
   */
  getStateEvent(roomId, eventType, stateKey) {
    const pathParams = {
      $roomId: roomId,
      $eventType: eventType,
      $stateKey: stateKey
    };
    let path = utils.encodeUri("/rooms/$roomId/state/$eventType", pathParams);
    if (stateKey !== undefined) {
      path = utils.encodeUri(path + "/$stateKey", pathParams);
    }
    return this.http.authedRequest(_httpApi.Method.Get, path);
  }

  /**
   * Send a state event into a room
   * @param roomId - ID of the room to send the event into
   * @param eventType - type of the state event to send
   * @param content - content of the event to send
   * @param stateKey - the stateKey to send into the room
   * @param opts - Options for the request function.
   * @returns Promise which resolves: TODO
   * @returns Rejects: with an error response.
   */
  sendStateEvent(roomId, eventType, content, stateKey = "", opts = {}) {
    const pathParams = {
      $roomId: roomId,
      $eventType: eventType,
      $stateKey: stateKey
    };
    let path = utils.encodeUri("/rooms/$roomId/state/$eventType", pathParams);
    if (stateKey !== undefined) {
      path = utils.encodeUri(path + "/$stateKey", pathParams);
    }
    return this.http.authedRequest(_httpApi.Method.Put, path, undefined, content, opts);
  }

  /**
   * @returns Promise which resolves: TODO
   * @returns Rejects: with an error response.
   */
  roomInitialSync(roomId, limit) {
    const path = utils.encodeUri("/rooms/$roomId/initialSync", {
      $roomId: roomId
    });
    return this.http.authedRequest(_httpApi.Method.Get, path, {
      limit: limit?.toString() ?? "30"
    });
  }

  /**
   * Set a marker to indicate the point in a room before which the user has read every
   * event. This can be retrieved from room account data (the event type is `m.fully_read`)
   * and displayed as a horizontal line in the timeline that is visually distinct to the
   * position of the user's own read receipt.
   * @param roomId - ID of the room that has been read
   * @param rmEventId - ID of the event that has been read
   * @param rrEventId - ID of the event tracked by the read receipt. This is here
   * for convenience because the RR and the RM are commonly updated at the same time as
   * each other. Optional.
   * @param rpEventId - rpEvent the m.read.private read receipt event for when we
   * don't want other users to see the read receipts. This is experimental. Optional.
   * @returns Promise which resolves: the empty object, `{}`.
   */
  async setRoomReadMarkersHttpRequest(roomId, rmEventId, rrEventId, rpEventId) {
    const path = utils.encodeUri("/rooms/$roomId/read_markers", {
      $roomId: roomId
    });
    const content = {
      [_read_receipts.ReceiptType.FullyRead]: rmEventId,
      [_read_receipts.ReceiptType.Read]: rrEventId
    };
    if ((await this.doesServerSupportUnstableFeature("org.matrix.msc2285.stable")) || (await this.isVersionSupported("v1.4"))) {
      content[_read_receipts.ReceiptType.ReadPrivate] = rpEventId;
    }
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, content);
  }

  /**
   * @returns Promise which resolves: A list of the user's current rooms
   * @returns Rejects: with an error response.
   */
  getJoinedRooms() {
    const path = utils.encodeUri("/joined_rooms", {});
    return this.http.authedRequest(_httpApi.Method.Get, path);
  }

  /**
   * Retrieve membership info. for a room.
   * @param roomId - ID of the room to get membership for
   * @returns Promise which resolves: A list of currently joined users
   *                                 and their profile data.
   * @returns Rejects: with an error response.
   */
  getJoinedRoomMembers(roomId) {
    const path = utils.encodeUri("/rooms/$roomId/joined_members", {
      $roomId: roomId
    });
    return this.http.authedRequest(_httpApi.Method.Get, path);
  }

  /**
   * @param params - Options for this request
   * @returns Promise which resolves: IPublicRoomsResponse
   * @returns Rejects: with an error response.
   */
  publicRooms(_ref = {}) {
    let {
        server,
        limit,
        since
      } = _ref,
      options = _objectWithoutProperties(_ref, _excluded);
    if (Object.keys(options).length === 0) {
      const queryParams = {
        server,
        limit,
        since
      };
      return this.http.authedRequest(_httpApi.Method.Get, "/publicRooms", queryParams);
    } else {
      const queryParams = {
        server
      };
      const body = _objectSpread({
        limit,
        since
      }, options);
      return this.http.authedRequest(_httpApi.Method.Post, "/publicRooms", queryParams, body);
    }
  }

  /**
   * Create an alias to room ID mapping.
   * @param alias - The room alias to create.
   * @param roomId - The room ID to link the alias to.
   * @returns Promise which resolves: an empty object `{}`
   * @returns Rejects: with an error response.
   */
  createAlias(alias, roomId) {
    const path = utils.encodeUri("/directory/room/$alias", {
      $alias: alias
    });
    const data = {
      room_id: roomId
    };
    return this.http.authedRequest(_httpApi.Method.Put, path, undefined, data);
  }

  /**
   * Delete an alias to room ID mapping. This alias must be on your local server,
   * and you must have sufficient access to do this operation.
   * @param alias - The room alias to delete.
   * @returns Promise which resolves: an empty object `{}`.
   * @returns Rejects: with an error response.
   */
  deleteAlias(alias) {
    const path = utils.encodeUri("/directory/room/$alias", {
      $alias: alias
    });
    return this.http.authedRequest(_httpApi.Method.Delete, path);
  }

  /**
   * Gets the local aliases for the room. Note: this includes all local aliases, unlike the
   * curated list from the m.room.canonical_alias state event.
   * @param roomId - The room ID to get local aliases for.
   * @returns Promise which resolves: an object with an `aliases` property, containing an array of local aliases
   * @returns Rejects: with an error response.
   */
  getLocalAliases(roomId) {
    const path = utils.encodeUri("/rooms/$roomId/aliases", {
      $roomId: roomId
    });
    const prefix = _httpApi.ClientPrefix.V3;
    return this.http.authedRequest(_httpApi.Method.Get, path, undefined, undefined, {
      prefix
    });
  }

  /**
   * Get room info for the given alias.
   * @param alias - The room alias to resolve.
   * @returns Promise which resolves: Object with room_id and servers.
   * @returns Rejects: with an error response.
   */
  getRoomIdForAlias(alias) {
    // eslint-disable-line camelcase
    const path = utils.encodeUri("/directory/room/$alias", {
      $alias: alias
    });
    return this.http.authedRequest(_httpApi.Method.Get, path);
  }

  /**
   * Get the visibility of a room in the current HS's room directory
   * @returns Promise which resolves: TODO
   * @returns Rejects: with an error response.
   */
  getRoomDirectoryVisibility(roomId) {
    const path = utils.encodeUri("/directory/list/room/$roomId", {
      $roomId: roomId
    });
    return this.http.authedRequest(_httpApi.Method.Get, path);
  }

  /**
   * Set the visibility of a room in the current HS's room directory
   * @param visibility - "public" to make the room visible
   *                 in the public directory, or "private" to make
   *                 it invisible.
   * @returns Promise which resolves: to an empty object `{}`
   * @returns Rejects: with an error response.
   */
  setRoomDirectoryVisibility(roomId, visibility) {
    const path = utils.encodeUri("/directory/list/room/$roomId", {
      $roomId: roomId
    });
    return this.http.authedRequest(_httpApi.Method.Put, path, undefined, {
      visibility
    });
  }

  /**
   * Query the user directory with a term matching user IDs, display names and domains.
   * @param options
   * @param options.term - the term with which to search.
   * @param options.limit - the maximum number of results to return. The server will apply a limit if unspecified.
   * @returns Promise which resolves: an array of results.
   */
  searchUserDirectory({
    term,
    limit
  }) {
    const body = {
      search_term: term
    };
    if (limit !== undefined) {
      body.limit = limit;
    }
    return this.http.authedRequest(_httpApi.Method.Post, "/user_directory/search", undefined, body);
  }

  /**
   * Upload a file to the media repository on the homeserver.
   *
   * @param file - The object to upload. On a browser, something that
   *   can be sent to XMLHttpRequest.send (typically a File).  Under node.js,
   *   a a Buffer, String or ReadStream.
   *
   * @param opts -  options object
   *
   * @returns Promise which resolves to response object, as
   *    determined by this.opts.onlyData, opts.rawResponse, and
   *    opts.onlyContentUri.  Rejects with an error (usually a MatrixError).
   */
  uploadContent(file, opts) {
    return this.http.uploadContent(file, opts);
  }

  /**
   * Cancel a file upload in progress
   * @param upload - The object returned from uploadContent
   * @returns true if canceled, otherwise false
   */
  cancelUpload(upload) {
    return this.http.cancelUpload(upload);
  }

  /**
   * Get a list of all file uploads in progress
   * @returns Array of objects representing current uploads.
   * Currently in progress is element 0. Keys:
   *  - promise: The promise associated with the upload
   *  - loaded: Number of bytes uploaded
   *  - total: Total number of bytes to upload
   */
  getCurrentUploads() {
    return this.http.getCurrentUploads();
  }

  /**
   * @param info - The kind of info to retrieve (e.g. 'displayname',
   * 'avatar_url').
   * @returns Promise which resolves: TODO
   * @returns Rejects: with an error response.
   */
  getProfileInfo(userId, info
  // eslint-disable-next-line camelcase
  ) {
    const path = info ? utils.encodeUri("/profile/$userId/$info", {
      $userId: userId,
      $info: info
    }) : utils.encodeUri("/profile/$userId", {
      $userId: userId
    });
    return this.http.authedRequest(_httpApi.Method.Get, path);
  }

  /**
   * @returns Promise which resolves to a list of the user's threepids.
   * @returns Rejects: with an error response.
   */
  getThreePids() {
    return this.http.authedRequest(_httpApi.Method.Get, "/account/3pid");
  }

  /**
   * Add a 3PID to your homeserver account. This API does not use an identity
   * server, as the homeserver is expected to handle 3PID ownership validation.
   *
   * @param data - A object with 3PID validation data from having called
   * `account/3pid/<medium>/requestToken` on the homeserver.
   * @returns Promise which resolves: to an empty object `{}`
   * @returns Rejects: with an error response.
   */
  async addThreePidOnly(data) {
    const path = "/account/3pid/add";
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, data);
  }

  /**
   * Bind a 3PID for discovery onto an identity server via the homeserver. The
   * identity server handles 3PID ownership validation and the homeserver records
   * the new binding to track where all 3PIDs for the account are bound.
   *
   * @param data - A object with 3PID validation data from having called
   * `validate/<medium>/requestToken` on the identity server. It should also
   * contain `id_server` and `id_access_token` fields as well.
   * @returns Promise which resolves: to an empty object `{}`
   * @returns Rejects: with an error response.
   */
  async bindThreePid(data) {
    const path = "/account/3pid/bind";
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, data);
  }

  /**
   * Unbind a 3PID for discovery on an identity server via the homeserver. The
   * homeserver removes its record of the binding to keep an updated record of
   * where all 3PIDs for the account are bound.
   *
   * @param medium - The threepid medium (eg. 'email')
   * @param address - The threepid address (eg. 'bob\@example.com')
   *        this must be as returned by getThreePids.
   * @returns Promise which resolves: on success
   * @returns Rejects: with an error response.
   */
  async unbindThreePid(medium, address
  // eslint-disable-next-line camelcase
  ) {
    const path = "/account/3pid/unbind";
    const data = {
      medium,
      address,
      id_server: this.getIdentityServerUrl(true)
    };
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, data);
  }

  /**
   * @param medium - The threepid medium (eg. 'email')
   * @param address - The threepid address (eg. 'bob\@example.com')
   *        this must be as returned by getThreePids.
   * @returns Promise which resolves: The server response on success
   *     (generally the empty JSON object)
   * @returns Rejects: with an error response.
   */
  deleteThreePid(medium, address
  // eslint-disable-next-line camelcase
  ) {
    const path = "/account/3pid/delete";
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, {
      medium,
      address
    });
  }

  /**
   * Make a request to change your password.
   * @param newPassword - The new desired password.
   * @param logoutDevices - Should all sessions be logged out after the password change. Defaults to true.
   * @returns Promise which resolves: to an empty object `{}`
   * @returns Rejects: with an error response.
   */
  setPassword(authDict, newPassword, logoutDevices) {
    const path = "/account/password";
    const data = {
      auth: authDict,
      new_password: newPassword,
      logout_devices: logoutDevices
    };
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, data);
  }

  /**
   * Gets all devices recorded for the logged-in user
   * @returns Promise which resolves: result object
   * @returns Rejects: with an error response.
   */
  getDevices() {
    return this.http.authedRequest(_httpApi.Method.Get, "/devices");
  }

  /**
   * Gets specific device details for the logged-in user
   * @param deviceId -  device to query
   * @returns Promise which resolves: result object
   * @returns Rejects: with an error response.
   */
  getDevice(deviceId) {
    const path = utils.encodeUri("/devices/$device_id", {
      $device_id: deviceId
    });
    return this.http.authedRequest(_httpApi.Method.Get, path);
  }

  /**
   * Update the given device
   *
   * @param deviceId -  device to update
   * @param body -       body of request
   * @returns Promise which resolves: to an empty object `{}`
   * @returns Rejects: with an error response.
   */
  // eslint-disable-next-line camelcase
  setDeviceDetails(deviceId, body) {
    const path = utils.encodeUri("/devices/$device_id", {
      $device_id: deviceId
    });
    return this.http.authedRequest(_httpApi.Method.Put, path, undefined, body);
  }

  /**
   * Delete the given device
   *
   * @param deviceId -  device to delete
   * @param auth - Optional. Auth data to supply for User-Interactive auth.
   * @returns Promise which resolves: result object
   * @returns Rejects: with an error response.
   */
  deleteDevice(deviceId, auth) {
    const path = utils.encodeUri("/devices/$device_id", {
      $device_id: deviceId
    });
    const body = {};
    if (auth) {
      body.auth = auth;
    }
    return this.http.authedRequest(_httpApi.Method.Delete, path, undefined, body);
  }

  /**
   * Delete multiple device
   *
   * @param devices - IDs of the devices to delete
   * @param auth - Optional. Auth data to supply for User-Interactive auth.
   * @returns Promise which resolves: result object
   * @returns Rejects: with an error response.
   */
  deleteMultipleDevices(devices, auth) {
    const body = {
      devices
    };
    if (auth) {
      body.auth = auth;
    }
    const path = "/delete_devices";
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, body);
  }

  /**
   * Gets all pushers registered for the logged-in user
   *
   * @returns Promise which resolves: Array of objects representing pushers
   * @returns Rejects: with an error response.
   */
  async getPushers() {
    const response = await this.http.authedRequest(_httpApi.Method.Get, "/pushers");

    // Migration path for clients that connect to a homeserver that does not support
    // MSC3881 yet, see https://github.com/matrix-org/matrix-spec-proposals/blob/kerry/remote-push-toggle/proposals/3881-remote-push-notification-toggling.md#migration
    if (!(await this.doesServerSupportUnstableFeature("org.matrix.msc3881"))) {
      response.pushers = response.pushers.map(pusher => {
        if (!pusher.hasOwnProperty(_event2.PUSHER_ENABLED.name)) {
          pusher[_event2.PUSHER_ENABLED.name] = true;
        }
        return pusher;
      });
    }
    return response;
  }

  /**
   * Adds a new pusher or updates an existing pusher
   *
   * @param pusher - Object representing a pusher
   * @returns Promise which resolves: Empty json object on success
   * @returns Rejects: with an error response.
   */
  setPusher(pusher) {
    const path = "/pushers/set";
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, pusher);
  }

  /**
   * Removes an existing pusher
   * @param pushKey - pushkey of pusher to remove
   * @param appId - app_id of pusher to remove
   * @returns Promise which resolves: Empty json object on success
   * @returns Rejects: with an error response.
   */
  removePusher(pushKey, appId) {
    const path = "/pushers/set";
    const body = {
      pushkey: pushKey,
      app_id: appId,
      kind: null // marks pusher for removal
    };
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, body);
  }

  /**
   * Persists local notification settings
   * @returns Promise which resolves: an empty object
   * @returns Rejects: with an error response.
   */
  setLocalNotificationSettings(deviceId, notificationSettings) {
    const key = `${_event2.LOCAL_NOTIFICATION_SETTINGS_PREFIX.name}.${deviceId}`;
    return this.setAccountData(key, notificationSettings);
  }

  /**
   * Get the push rules for the account from the server.
   * @returns Promise which resolves to the push rules.
   * @returns Rejects: with an error response.
   */
  getPushRules() {
    return this.http.authedRequest(_httpApi.Method.Get, "/pushrules/").then(rules => {
      this.setPushRules(rules);
      return this.pushRules;
    });
  }

  /**
   * Update the push rules for the account. This should be called whenever
   * updated push rules are available.
   */
  setPushRules(rules) {
    // Fix-up defaults, if applicable.
    this.pushRules = _pushprocessor.PushProcessor.rewriteDefaultRules(rules, this.getUserId());
    // Pre-calculate any necessary caches.
    this.pushProcessor.updateCachedPushRuleKeys(this.pushRules);
  }

  /**
   * @returns Promise which resolves: an empty object `{}`
   * @returns Rejects: with an error response.
   */
  addPushRule(scope, kind, ruleId, body) {
    // NB. Scope not uri encoded because devices need the '/'
    const path = utils.encodeUri("/pushrules/" + scope + "/$kind/$ruleId", {
      $kind: kind,
      $ruleId: ruleId
    });
    return this.http.authedRequest(_httpApi.Method.Put, path, undefined, body);
  }

  /**
   * @returns Promise which resolves: an empty object `{}`
   * @returns Rejects: with an error response.
   */
  deletePushRule(scope, kind, ruleId) {
    // NB. Scope not uri encoded because devices need the '/'
    const path = utils.encodeUri("/pushrules/" + scope + "/$kind/$ruleId", {
      $kind: kind,
      $ruleId: ruleId
    });
    return this.http.authedRequest(_httpApi.Method.Delete, path);
  }

  /**
   * Enable or disable a push notification rule.
   * @returns Promise which resolves: to an empty object `{}`
   * @returns Rejects: with an error response.
   */
  setPushRuleEnabled(scope, kind, ruleId, enabled) {
    const path = utils.encodeUri("/pushrules/" + scope + "/$kind/$ruleId/enabled", {
      $kind: kind,
      $ruleId: ruleId
    });
    return this.http.authedRequest(_httpApi.Method.Put, path, undefined, {
      enabled: enabled
    });
  }

  /**
   * Set the actions for a push notification rule.
   * @returns Promise which resolves: to an empty object `{}`
   * @returns Rejects: with an error response.
   */
  setPushRuleActions(scope, kind, ruleId, actions) {
    const path = utils.encodeUri("/pushrules/" + scope + "/$kind/$ruleId/actions", {
      $kind: kind,
      $ruleId: ruleId
    });
    return this.http.authedRequest(_httpApi.Method.Put, path, undefined, {
      actions: actions
    });
  }

  /**
   * Perform a server-side search.
   * @param params
   * @param params.next_batch - the batch token to pass in the query string
   * @param params.body - the JSON object to pass to the request body.
   * @param abortSignal - optional signal used to cancel the http request.
   * @returns Promise which resolves to the search response object.
   * @returns Rejects: with an error response.
   */
  search({
    body,
    next_batch: nextBatch
  }, abortSignal) {
    const queryParams = {};
    if (nextBatch) {
      queryParams.next_batch = nextBatch;
    }
    return this.http.authedRequest(_httpApi.Method.Post, "/search", queryParams, body, {
      abortSignal
    });
  }

  /**
   * Upload keys
   *
   * @param content -  body of upload request
   *
   * @param opts - this method no longer takes any opts,
   *  used to take opts.device_id but this was not removed from the spec as a redundant parameter
   *
   * @returns Promise which resolves: result object. Rejects: with
   *     an error response ({@link MatrixError}).
   */
  uploadKeysRequest(content, opts) {
    return this.http.authedRequest(_httpApi.Method.Post, "/keys/upload", undefined, content);
  }
  uploadKeySignatures(content) {
    return this.http.authedRequest(_httpApi.Method.Post, "/keys/signatures/upload", undefined, content);
  }

  /**
   * Download device keys
   *
   * @param userIds -  list of users to get keys for
   *
   * @param token - sync token to pass in the query request, to help
   *   the HS give the most recent results
   *
   * @returns Promise which resolves: result object. Rejects: with
   *     an error response ({@link MatrixError}).
   */
  downloadKeysForUsers(userIds, {
    token
  } = {}) {
    const content = {
      device_keys: {}
    };
    if (token !== undefined) {
      content.token = token;
    }
    userIds.forEach(u => {
      content.device_keys[u] = [];
    });
    return this.http.authedRequest(_httpApi.Method.Post, "/keys/query", undefined, content);
  }

  /**
   * Claim one-time keys
   *
   * @param devices -  a list of [userId, deviceId] pairs
   *
   * @param keyAlgorithm -  desired key type
   *
   * @param timeout - the time (in milliseconds) to wait for keys from remote
   *     servers
   *
   * @returns Promise which resolves: result object. Rejects: with
   *     an error response ({@link MatrixError}).
   */
  claimOneTimeKeys(devices, keyAlgorithm = "signed_curve25519", timeout) {
    const queries = {};
    if (keyAlgorithm === undefined) {
      keyAlgorithm = "signed_curve25519";
    }
    for (const [userId, deviceId] of devices) {
      const query = queries[userId] || {};
      (0, _utils.safeSet)(queries, userId, query);
      (0, _utils.safeSet)(query, deviceId, keyAlgorithm);
    }
    const content = {
      one_time_keys: queries
    };
    if (timeout) {
      content.timeout = timeout;
    }
    const path = "/keys/claim";
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, content);
  }

  /**
   * Ask the server for a list of users who have changed their device lists
   * between a pair of sync tokens
   *
   *
   * @returns Promise which resolves: result object. Rejects: with
   *     an error response ({@link MatrixError}).
   */
  getKeyChanges(oldToken, newToken) {
    const qps = {
      from: oldToken,
      to: newToken
    };
    return this.http.authedRequest(_httpApi.Method.Get, "/keys/changes", qps);
  }
  uploadDeviceSigningKeys(auth, keys) {
    // API returns empty object
    const data = Object.assign({}, keys);
    if (auth) Object.assign(data, {
      auth
    });
    return this.http.authedRequest(_httpApi.Method.Post, "/keys/device_signing/upload", undefined, data, {
      prefix: _httpApi.ClientPrefix.Unstable
    });
  }

  /**
   * Register with an identity server using the OpenID token from the user's
   * Homeserver, which can be retrieved via
   * {@link MatrixClient#getOpenIdToken}.
   *
   * Note that the `/account/register` endpoint (as well as IS authentication in
   * general) was added as part of the v2 API version.
   *
   * @returns Promise which resolves: with object containing an Identity
   * Server access token.
   * @returns Rejects: with an error response.
   */
  registerWithIdentityServer(hsOpenIdToken) {
    if (!this.idBaseUrl) {
      throw new Error("No identity server base URL set");
    }
    const uri = this.http.getUrl("/account/register", undefined, _httpApi.IdentityPrefix.V2, this.idBaseUrl);
    return this.http.requestOtherUrl(_httpApi.Method.Post, uri, hsOpenIdToken);
  }

  /**
   * Requests an email verification token directly from an identity server.
   *
   * This API is used as part of binding an email for discovery on an identity
   * server. The validation data that results should be passed to the
   * `bindThreePid` method to complete the binding process.
   *
   * @param email - The email address to request a token for
   * @param clientSecret - A secret binary string generated by the client.
   *                 It is recommended this be around 16 ASCII characters.
   * @param sendAttempt - If an identity server sees a duplicate request
   *                 with the same sendAttempt, it will not send another email.
   *                 To request another email to be sent, use a larger value for
   *                 the sendAttempt param as was used in the previous request.
   * @param nextLink - Optional If specified, the client will be redirected
   *                 to this link after validation.
   * @param identityAccessToken - The `access_token` field of the identity
   * server `/account/register` response (see {@link registerWithIdentityServer}).
   *
   * @returns Promise which resolves: TODO
   * @returns Rejects: with an error response.
   * @throws Error if no identity server is set
   */
  requestEmailToken(email, clientSecret, sendAttempt, nextLink, identityAccessToken) {
    const params = {
      client_secret: clientSecret,
      email: email,
      send_attempt: sendAttempt?.toString()
    };
    if (nextLink) {
      params.next_link = nextLink;
    }
    return this.http.idServerRequest(_httpApi.Method.Post, "/validate/email/requestToken", params, _httpApi.IdentityPrefix.V2, identityAccessToken);
  }

  /**
   * Requests a MSISDN verification token directly from an identity server.
   *
   * This API is used as part of binding a MSISDN for discovery on an identity
   * server. The validation data that results should be passed to the
   * `bindThreePid` method to complete the binding process.
   *
   * @param phoneCountry - The ISO 3166-1 alpha-2 code for the country in
   *                 which phoneNumber should be parsed relative to.
   * @param phoneNumber - The phone number, in national or international
   *                 format
   * @param clientSecret - A secret binary string generated by the client.
   *                 It is recommended this be around 16 ASCII characters.
   * @param sendAttempt - If an identity server sees a duplicate request
   *                 with the same sendAttempt, it will not send another SMS.
   *                 To request another SMS to be sent, use a larger value for
   *                 the sendAttempt param as was used in the previous request.
   * @param nextLink - Optional If specified, the client will be redirected
   *                 to this link after validation.
   * @param identityAccessToken - The `access_token` field of the Identity
   * Server `/account/register` response (see {@link registerWithIdentityServer}).
   *
   * @returns Promise which resolves to an object with a sid string
   * @returns Rejects: with an error response.
   * @throws Error if no identity server is set
   */
  requestMsisdnToken(phoneCountry, phoneNumber, clientSecret, sendAttempt, nextLink, identityAccessToken) {
    const params = {
      client_secret: clientSecret,
      country: phoneCountry,
      phone_number: phoneNumber,
      send_attempt: sendAttempt?.toString()
    };
    if (nextLink) {
      params.next_link = nextLink;
    }
    return this.http.idServerRequest(_httpApi.Method.Post, "/validate/msisdn/requestToken", params, _httpApi.IdentityPrefix.V2, identityAccessToken);
  }

  /**
   * Submits a MSISDN token to the identity server
   *
   * This is used when submitting the code sent by SMS to a phone number.
   * The identity server has an equivalent API for email but the js-sdk does
   * not expose this, since email is normally validated by the user clicking
   * a link rather than entering a code.
   *
   * @param sid - The sid given in the response to requestToken
   * @param clientSecret - A secret binary string generated by the client.
   *                 This must be the same value submitted in the requestToken call.
   * @param msisdnToken - The MSISDN token, as enetered by the user.
   * @param identityAccessToken - The `access_token` field of the Identity
   * Server `/account/register` response (see {@link registerWithIdentityServer}).
   * Some legacy identity servers had no authentication here.
   *
   * @returns Promise which resolves: Object, containing success boolean.
   * @returns Rejects: with an error response.
   * @throws Error if No identity server is set
   */
  submitMsisdnToken(sid, clientSecret, msisdnToken, identityAccessToken) {
    const params = {
      sid: sid,
      client_secret: clientSecret,
      token: msisdnToken
    };
    return this.http.idServerRequest(_httpApi.Method.Post, "/validate/msisdn/submitToken", params, _httpApi.IdentityPrefix.V2, identityAccessToken ?? undefined);
  }

  /**
   * Submits a MSISDN token to an arbitrary URL.
   *
   * This is used when submitting the code sent by SMS to a phone number in the
   * newer 3PID flow where the homeserver validates 3PID ownership (as part of
   * `requestAdd3pidMsisdnToken`). The homeserver response may include a
   * `submit_url` to specify where the token should be sent, and this helper can
   * be used to pass the token to this URL.
   *
   * @param url - The URL to submit the token to
   * @param sid - The sid given in the response to requestToken
   * @param clientSecret - A secret binary string generated by the client.
   *                 This must be the same value submitted in the requestToken call.
   * @param msisdnToken - The MSISDN token, as enetered by the user.
   *
   * @returns Promise which resolves: Object, containing success boolean.
   * @returns Rejects: with an error response.
   */
  submitMsisdnTokenOtherUrl(url, sid, clientSecret, msisdnToken) {
    const params = {
      sid: sid,
      client_secret: clientSecret,
      token: msisdnToken
    };
    return this.http.requestOtherUrl(_httpApi.Method.Post, url, params);
  }

  /**
   * Gets the V2 hashing information from the identity server. Primarily useful for
   * lookups.
   * @param identityAccessToken - The access token for the identity server.
   * @returns The hashing information for the identity server.
   */
  getIdentityHashDetails(identityAccessToken) {
    return this.http.idServerRequest(_httpApi.Method.Get, "/hash_details", undefined, _httpApi.IdentityPrefix.V2, identityAccessToken);
  }

  /**
   * Performs a hashed lookup of addresses against the identity server. This is
   * only supported on identity servers which have at least the version 2 API.
   * @param addressPairs - An array of 2 element arrays.
   * The first element of each pair is the address, the second is the 3PID medium.
   * Eg: `["email@example.org", "email"]`
   * @param identityAccessToken - The access token for the identity server.
   * @returns A collection of address mappings to
   * found MXIDs. Results where no user could be found will not be listed.
   */
  async identityHashedLookup(addressPairs, identityAccessToken) {
    const params = {
      // addresses: ["email@example.org", "10005550000"],
      // algorithm: "sha256",
      // pepper: "abc123"
    };

    // Get hash information first before trying to do a lookup
    const hashes = await this.getIdentityHashDetails(identityAccessToken);
    if (!hashes || !hashes["lookup_pepper"] || !hashes["algorithms"]) {
      throw new Error("Unsupported identity server: bad response");
    }
    params["pepper"] = hashes["lookup_pepper"];
    const localMapping = {
      // hashed identifier => plain text address
      // For use in this function's return format
    };

    // When picking an algorithm, we pick the hashed over no hashes
    if (hashes["algorithms"].includes("sha256")) {
      params["addresses"] = await Promise.all(addressPairs.map(async p => {
        const addr = p[0].toLowerCase(); // lowercase to get consistent hashes
        const med = p[1].toLowerCase();
        const hashBuffer = await (0, _digest.sha256)(`${addr} ${med} ${params["pepper"]}`);
        const hashed = (0, _base.encodeUnpaddedBase64Url)(hashBuffer);

        // Map the hash to a known (case-sensitive) address. We use the case
        // sensitive version because the caller might be expecting that.
        localMapping[hashed] = p[0];
        return hashed;
      }));
      params["algorithm"] = "sha256";
    } else if (hashes["algorithms"].includes("none")) {
      params["addresses"] = addressPairs.map(p => {
        const addr = p[0].toLowerCase(); // lowercase to get consistent hashes
        const med = p[1].toLowerCase();
        const unhashed = `${addr} ${med}`;
        // Map the unhashed values to a known (case-sensitive) address. We use
        // the case-sensitive version because the caller might be expecting that.
        localMapping[unhashed] = p[0];
        return unhashed;
      });
      params["algorithm"] = "none";
    } else {
      throw new Error("Unsupported identity server: unknown hash algorithm");
    }
    const response = await this.http.idServerRequest(_httpApi.Method.Post, "/lookup", params, _httpApi.IdentityPrefix.V2, identityAccessToken);
    if (!response?.["mappings"]) return []; // no results

    const foundAddresses = [];
    for (const hashed of Object.keys(response["mappings"])) {
      const mxid = response["mappings"][hashed];
      const plainAddress = localMapping[hashed];
      if (!plainAddress) {
        throw new Error("Identity server returned more results than expected");
      }
      foundAddresses.push({
        address: plainAddress,
        mxid
      });
    }
    return foundAddresses;
  }

  /**
   * Looks up the public Matrix ID mapping for a given 3rd party
   * identifier from the identity server
   *
   * @param medium - The medium of the threepid, eg. 'email'
   * @param address - The textual address of the threepid
   * @param identityAccessToken - The `access_token` field of the Identity
   * Server `/account/register` response (see {@link registerWithIdentityServer}).
   *
   * @returns Promise which resolves: A threepid mapping
   *                                 object or the empty object if no mapping
   *                                 exists
   * @returns Rejects: with an error response.
   */
  async lookupThreePid(medium, address, identityAccessToken) {
    // Note: we're using the V2 API by calling this function, but our
    // function contract requires a V1 response. We therefore have to
    // convert it manually.
    const response = await this.identityHashedLookup([[address, medium]], identityAccessToken);
    const result = response.find(p => p.address === address);
    if (!result) {
      return {};
    }
    const mapping = {
      address,
      medium,
      mxid: result.mxid

      // We can't reasonably fill these parameters:
      // not_before
      // not_after
      // ts
      // signatures
    };
    return mapping;
  }

  /**
   * Looks up the public Matrix ID mappings for multiple 3PIDs.
   *
   * @param query - Array of arrays containing
   * [medium, address]
   * @param identityAccessToken - The `access_token` field of the Identity
   * Server `/account/register` response (see {@link registerWithIdentityServer}).
   *
   * @returns Promise which resolves: Lookup results from IS.
   * @returns Rejects: with an error response.
   */
  async bulkLookupThreePids(query, identityAccessToken) {
    // Note: we're using the V2 API by calling this function, but our
    // function contract requires a V1 response. We therefore have to
    // convert it manually.
    const response = await this.identityHashedLookup(
    // We have to reverse the query order to get [address, medium] pairs
    query.map(p => [p[1], p[0]]), identityAccessToken);
    const v1results = [];
    for (const mapping of response) {
      const originalQuery = query.find(p => p[1] === mapping.address);
      if (!originalQuery) {
        throw new Error("Identity sever returned unexpected results");
      }
      v1results.push([originalQuery[0],
      // medium
      mapping.address, mapping.mxid]);
    }
    return {
      threepids: v1results
    };
  }

  /**
   * Get account info from the identity server. This is useful as a neutral check
   * to verify that other APIs are likely to approve access by testing that the
   * token is valid, terms have been agreed, etc.
   *
   * @param identityAccessToken - The `access_token` field of the Identity
   * Server `/account/register` response (see {@link registerWithIdentityServer}).
   *
   * @returns Promise which resolves: an object with account info.
   * @returns Rejects: with an error response.
   */
  getIdentityAccount(identityAccessToken) {
    return this.http.idServerRequest(_httpApi.Method.Get, "/account", undefined, _httpApi.IdentityPrefix.V2, identityAccessToken);
  }

  /**
   * Send an event to a specific list of devices.
   * This is a low-level API that simply wraps the HTTP API
   * call to send to-device messages. We recommend using
   * queueToDevice() which is a higher level API.
   *
   * @param eventType -  type of event to send
   *    content to send. Map from user_id to device_id to content object.
   * @param txnId -     transaction id. One will be made up if not
   *    supplied.
   * @returns Promise which resolves: to an empty object `{}`
   */
  sendToDevice(eventType, contentMap, txnId) {
    const path = utils.encodeUri("/sendToDevice/$eventType/$txnId", {
      $eventType: eventType,
      $txnId: txnId ? txnId : this.makeTxnId()
    });
    const body = {
      messages: utils.recursiveMapToObject(contentMap)
    };
    const targets = new Map();
    for (const [userId, deviceMessages] of contentMap) {
      targets.set(userId, Array.from(deviceMessages.keys()));
    }
    this.logger.debug(`PUT ${path}`, targets);
    return this.http.authedRequest(_httpApi.Method.Put, path, undefined, body);
  }

  /**
   * Sends events directly to specific devices using Matrix's to-device
   * messaging system. The batch will be split up into appropriately sized
   * batches for sending and stored in the store so they can be retried
   * later if they fail to send. Retries will happen automatically.
   * @param batch - The to-device messages to send
   */
  queueToDevice(batch) {
    return this.toDeviceMessageQueue.queueBatch(batch);
  }

  /**
   * Get the third party protocols that can be reached using
   * this HS
   * @returns Promise which resolves to the result object
   */
  getThirdpartyProtocols() {
    return this.http.authedRequest(_httpApi.Method.Get, "/thirdparty/protocols").then(response => {
      // sanity check
      if (!response || typeof response !== "object") {
        throw new Error(`/thirdparty/protocols did not return an object: ${response}`);
      }
      return response;
    });
  }

  /**
   * Get information on how a specific place on a third party protocol
   * may be reached.
   * @param protocol - The protocol given in getThirdpartyProtocols()
   * @param params - Protocol-specific parameters, as given in the
   *                        response to getThirdpartyProtocols()
   * @returns Promise which resolves to the result object
   */
  getThirdpartyLocation(protocol, params) {
    const path = utils.encodeUri("/thirdparty/location/$protocol", {
      $protocol: protocol
    });
    return this.http.authedRequest(_httpApi.Method.Get, path, params);
  }

  /**
   * Get information on how a specific user on a third party protocol
   * may be reached.
   * @param protocol - The protocol given in getThirdpartyProtocols()
   * @param params - Protocol-specific parameters, as given in the
   *                        response to getThirdpartyProtocols()
   * @returns Promise which resolves to the result object
   */
  getThirdpartyUser(protocol, params) {
    const path = utils.encodeUri("/thirdparty/user/$protocol", {
      $protocol: protocol
    });
    return this.http.authedRequest(_httpApi.Method.Get, path, params);
  }
  getTerms(serviceType, baseUrl) {
    // TODO: Types
    const url = this.termsUrlForService(serviceType, baseUrl);
    return this.http.requestOtherUrl(_httpApi.Method.Get, url);
  }
  agreeToTerms(serviceType, baseUrl, accessToken, termsUrls) {
    const url = this.termsUrlForService(serviceType, baseUrl);
    const headers = {
      Authorization: "Bearer " + accessToken
    };
    return this.http.requestOtherUrl(_httpApi.Method.Post, url, {
      user_accepts: termsUrls
    }, {
      headers
    });
  }

  /**
   * Reports an event as inappropriate to the server, which may then notify the appropriate people.
   * @param roomId - The room in which the event being reported is located.
   * @param eventId - The event to report.
   * @param score - The score to rate this content as where -100 is most offensive and 0 is inoffensive.
   * @param reason - The reason the content is being reported. May be blank.
   * @returns Promise which resolves to an empty object if successful
   */
  reportEvent(roomId, eventId, score, reason) {
    const path = utils.encodeUri("/rooms/$roomId/report/$eventId", {
      $roomId: roomId,
      $eventId: eventId
    });
    return this.http.authedRequest(_httpApi.Method.Post, path, undefined, {
      score,
      reason
    });
  }

  /**
   * Fetches or paginates a room hierarchy as defined by MSC2946.
   * Falls back gracefully to sourcing its data from `getSpaceSummary` if this API is not yet supported by the server.
   * @param roomId - The ID of the space-room to use as the root of the summary.
   * @param limit - The maximum number of rooms to return per page.
   * @param maxDepth - The maximum depth in the tree from the root room to return.
   * @param suggestedOnly - Whether to only return rooms with suggested=true.
   * @param fromToken - The opaque token to paginate a previous request.
   * @returns the response, with next_batch & rooms fields.
   */
  getRoomHierarchy(roomId, limit, maxDepth, suggestedOnly = false, fromToken) {
    const path = utils.encodeUri("/rooms/$roomId/hierarchy", {
      $roomId: roomId
    });
    const queryParams = {
      suggested_only: String(suggestedOnly),
      max_depth: maxDepth?.toString(),
      from: fromToken,
      limit: limit?.toString()
    };
    return this.http.authedRequest(_httpApi.Method.Get, path, queryParams, undefined, {
      prefix: _httpApi.ClientPrefix.V1
    }).catch(e => {
      if (e.errcode === "M_UNRECOGNIZED") {
        // fall back to the prefixed hierarchy API.
        return this.http.authedRequest(_httpApi.Method.Get, path, queryParams, undefined, {
          prefix: "/_matrix/client/unstable/org.matrix.msc2946"
        });
      }
      throw e;
    });
  }

  /**
   * Creates a new file tree space with the given name. The client will pick
   * defaults for how it expects to be able to support the remaining API offered
   * by the returned class.
   *
   * Note that this is UNSTABLE and may have breaking changes without notice.
   * @param name - The name of the tree space.
   * @returns Promise which resolves to the created space.
   */
  async unstableCreateFileTree(name) {
    const {
      room_id: roomId
    } = await this.createRoom({
      name: name,
      preset: _partials.Preset.PrivateChat,
      power_level_content_override: _objectSpread(_objectSpread({}, _MSC3089TreeSpace.DEFAULT_TREE_POWER_LEVELS_TEMPLATE), {}, {
        users: {
          [this.getUserId()]: 100
        }
      }),
      creation_content: {
        [_event2.RoomCreateTypeField]: _event2.RoomType.Space
      },
      initial_state: [{
        type: _event2.UNSTABLE_MSC3088_PURPOSE.name,
        state_key: _event2.UNSTABLE_MSC3089_TREE_SUBTYPE.name,
        content: {
          [_event2.UNSTABLE_MSC3088_ENABLED.name]: true
        }
      }, {
        type: _event2.EventType.RoomEncryption,
        state_key: "",
        content: {
          algorithm: olmlib.MEGOLM_ALGORITHM
        }
      }]
    });
    return new _MSC3089TreeSpace.MSC3089TreeSpace(this, roomId);
  }

  /**
   * Gets a reference to a tree space, if the room ID given is a tree space. If the room
   * does not appear to be a tree space then null is returned.
   *
   * Note that this is UNSTABLE and may have breaking changes without notice.
   * @param roomId - The room ID to get a tree space reference for.
   * @returns The tree space, or null if not a tree space.
   */
  unstableGetFileTreeSpace(roomId) {
    const room = this.getRoom(roomId);
    if (room?.getMyMembership() !== _membership.KnownMembership.Join) return null;
    const createEvent = room.currentState.getStateEvents(_event2.EventType.RoomCreate, "");
    const purposeEvent = room.currentState.getStateEvents(_event2.UNSTABLE_MSC3088_PURPOSE.name, _event2.UNSTABLE_MSC3089_TREE_SUBTYPE.name);
    if (!createEvent) throw new Error("Expected single room create event");
    if (!purposeEvent?.getContent()?.[_event2.UNSTABLE_MSC3088_ENABLED.name]) return null;
    if (createEvent.getContent()?.[_event2.RoomCreateTypeField] !== _event2.RoomType.Space) return null;
    return new _MSC3089TreeSpace.MSC3089TreeSpace(this, roomId);
  }

  /**
   * Perform a single MSC3575 sliding sync request.
   * @param req - The request to make.
   * @param proxyBaseUrl - The base URL for the sliding sync proxy.
   * @param abortSignal - Optional signal to abort request mid-flight.
   * @returns The sliding sync response, or a standard error.
   * @throws on non 2xx status codes with an object with a field "httpStatus":number.
   */
  slidingSync(req, proxyBaseUrl, abortSignal) {
    const qps = {};
    if (req.pos) {
      qps.pos = req.pos;
      delete req.pos;
    }
    if (req.timeout) {
      qps.timeout = req.timeout;
      delete req.timeout;
    }
    const clientTimeout = req.clientTimeout;
    delete req.clientTimeout;
    return this.http.authedRequest(_httpApi.Method.Post, "/sync", qps, req, {
      prefix: "/_matrix/client/unstable/org.matrix.msc3575",
      baseUrl: proxyBaseUrl,
      localTimeoutMs: clientTimeout,
      abortSignal
    });
  }

  /**
   * A helper to determine thread support
   * @returns a boolean to determine if threads are enabled
   */
  supportsThreads() {
    return this.clientOpts?.threadSupport || false;
  }

  /**
   * A helper to determine intentional mentions support
   * @returns a boolean to determine if intentional mentions are enabled on the server
   * @experimental
   */
  supportsIntentionalMentions() {
    return this.canSupport.get(_feature.Feature.IntentionalMentions) !== _feature.ServerSupport.Unsupported;
  }

  /**
   * Fetches the summary of a room as defined by an initial version of MSC3266 and implemented in Synapse
   * Proposed at https://github.com/matrix-org/matrix-doc/pull/3266
   * @param roomIdOrAlias - The ID or alias of the room to get the summary of.
   * @param via - The list of servers which know about the room if only an ID was provided.
   */
  async getRoomSummary(roomIdOrAlias, via) {
    const paramOpts = {
      prefix: "/_matrix/client/unstable/im.nheko.summary"
    };
    try {
      const path = utils.encodeUri("/summary/$roomid", {
        $roomid: roomIdOrAlias
      });
      return await this.http.authedRequest(_httpApi.Method.Get, path, {
        via
      }, undefined, paramOpts);
    } catch (e) {
      if (e instanceof _httpApi.MatrixError && e.errcode === "M_UNRECOGNIZED") {
        const path = utils.encodeUri("/rooms/$roomid/summary", {
          $roomid: roomIdOrAlias
        });
        return await this.http.authedRequest(_httpApi.Method.Get, path, {
          via
        }, undefined, paramOpts);
      } else {
        throw e;
      }
    }
  }

  /**
   * Processes a list of threaded events and adds them to their respective timelines
   * @param room - the room the adds the threaded events
   * @param threadedEvents - an array of the threaded events
   * @param toStartOfTimeline - the direction in which we want to add the events
   */
  processThreadEvents(room, threadedEvents, toStartOfTimeline) {
    room.processThreadedEvents(threadedEvents, toStartOfTimeline);
  }

  /**
   * Processes a list of thread roots and creates a thread model
   * @param room - the room to create the threads in
   * @param threadedEvents - an array of thread roots
   * @param toStartOfTimeline - the direction
   */
  processThreadRoots(room, threadedEvents, toStartOfTimeline) {
    if (!this.supportsThreads()) return;
    room.processThreadRoots(threadedEvents, toStartOfTimeline);
  }
  processBeaconEvents(room, events) {
    this.processAggregatedTimelineEvents(room, events);
  }

  /**
   * Calls aggregation functions for event types that are aggregated
   * Polls and location beacons
   * @param room - room the events belong to
   * @param events - timeline events to be processed
   * @returns
   */
  processAggregatedTimelineEvents(room, events) {
    if (!events?.length) return;
    if (!room) return;
    room.currentState.processBeaconEvents(events, this);
    room.processPollEvents(events);
  }

  /**
   * Fetches information about the user for the configured access token.
   */
  async whoami() {
    return this.http.authedRequest(_httpApi.Method.Get, "/account/whoami");
  }

  /**
   * Find the event_id closest to the given timestamp in the given direction.
   * @returns Resolves: A promise of an object containing the event_id and
   *    origin_server_ts of the closest event to the timestamp in the given direction
   * @returns Rejects: when the request fails (module:http-api.MatrixError)
   */
  async timestampToEvent(roomId, timestamp, dir) {
    const path = utils.encodeUri("/rooms/$roomId/timestamp_to_event", {
      $roomId: roomId
    });
    const queryParams = {
      ts: timestamp.toString(),
      dir: dir
    };
    try {
      return await this.http.authedRequest(_httpApi.Method.Get, path, queryParams, undefined, {
        prefix: _httpApi.ClientPrefix.V1
      });
    } catch (err) {
      // Fallback to the prefixed unstable endpoint. Since the stable endpoint is
      // new, we should also try the unstable endpoint before giving up. We can
      // remove this fallback request in a year (remove after 2023-11-28).
      if (err.errcode === "M_UNRECOGNIZED" && (
      // XXX: The 400 status code check should be removed in the future
      // when Synapse is compliant with MSC3743.
      err.httpStatus === 400 ||
      // This the correct standard status code for an unsupported
      // endpoint according to MSC3743. Not Found and Method Not Allowed
      // both indicate that this endpoint+verb combination is
      // not supported.
      err.httpStatus === 404 || err.httpStatus === 405)) {
        return await this.http.authedRequest(_httpApi.Method.Get, path, queryParams, undefined, {
          prefix: "/_matrix/client/unstable/org.matrix.msc3030"
        });
      }
      throw err;
    }
  }

  /**
   * Get the OIDC issuer responsible for authentication on this server, if any
   * @returns Resolves: A promise of an object containing the OIDC issuer if configured
   * @returns Rejects: when the request fails (module:http-api.MatrixError)
   * @experimental - part of MSC2965
   */
  async getAuthIssuer() {
    return this.http.request(_httpApi.Method.Get, "/auth_issuer", undefined, undefined, {
      prefix: _httpApi.ClientPrefix.Unstable + "/org.matrix.msc2965"
    });
  }
}
exports.MatrixClient = MatrixClient;
_defineProperty(MatrixClient, "RESTORE_BACKUP_ERROR_BAD_KEY", "RESTORE_BACKUP_ERROR_BAD_KEY");
function getUnstableDelayQueryOpts(delayOpts) {
  return Object.fromEntries(Object.entries(delayOpts).map(([k, v]) => [`${UNSTABLE_MSC4140_DELAYED_EVENTS}.${k}`, v]));
}

/**
 * recalculates an accurate notifications count on event decryption.
 * Servers do not have enough knowledge about encrypted events to calculate an
 * accurate notification_count
 */
function fixNotificationCountOnDecryption(cli, event) {
  const ourUserId = cli.getUserId();
  const eventId = event.getId();
  const room = cli.getRoom(event.getRoomId());
  if (!room || !ourUserId || !eventId) return;

  // Due to threads, we can get relation events (eg. edits & reactions) that never get
  // added to a timeline and so cannot be found in their own room (their edit / reaction
  // still applies to the event it needs to, so it doesn't matter too much). However, if
  // we try to process notification about this event, we'll get very confused because we
  // won't be able to find the event in the room, so will assume it must be unread, even
  // if it's actually read. We therefore skip anything that isn't in the room. This isn't
  // *great*, so if we can fix the homeless events (eg. with MSC4023) then we should probably
  // remove this workaround.
  if (!room.findEventById(eventId)) {
    _logger.logger.info(`Decrypted event ${event.getId()} is not in room ${room.roomId}: ignoring`);
    return;
  }
  const isThreadEvent = !!event.threadRootId && !event.isThreadRoot;
  let hasReadEvent;
  if (isThreadEvent) {
    const thread = room.getThread(event.threadRootId);
    hasReadEvent = thread ? thread.hasUserReadEvent(ourUserId, eventId) :
    // If the thread object does not exist in the room yet, we don't
    // want to calculate notification for this event yet. We have not
    // restored the read receipts yet and can't accurately calculate
    // notifications at this stage.
    //
    // This issue can likely go away when MSC3874 is implemented
    true;
  } else {
    hasReadEvent = room.hasUserReadEvent(ourUserId, eventId);
  }
  if (hasReadEvent) {
    // If the event has been read, ignore it.
    return;
  }
  const actions = cli.getPushActionsForEvent(event, true);

  // Ensure the unread counts are kept up to date if the event is encrypted
  // We also want to make sure that the notification count goes up if we already
  // have encrypted events to avoid other code from resetting 'highlight' to zero.
  const newHighlight = !!actions?.tweaks?.highlight;
  if (newHighlight) {
    // TODO: Handle mentions received while the client is offline
    // See also https://github.com/vector-im/element-web/issues/9069
    const newCount = room.getUnreadCountForEventContext(_room.NotificationCountType.Highlight, event) + 1;
    if (isThreadEvent) {
      room.setThreadUnreadNotificationCount(event.threadRootId, _room.NotificationCountType.Highlight, newCount);
    } else {
      room.setUnreadNotificationCount(_room.NotificationCountType.Highlight, newCount);
    }
  }

  // `notify` is used in practice for incrementing the total count
  const newNotify = !!actions?.notify;

  // The room total count is NEVER incremented by the server for encrypted rooms. We basically ignore
  // the server here as it's always going to tell us to increment for encrypted events.
  if (newNotify) {
    // Total count is used to typically increment a room notification counter, but not loudly highlight it.
    const newCount = room.getUnreadCountForEventContext(_room.NotificationCountType.Total, event) + 1;
    if (isThreadEvent) {
      room.setThreadUnreadNotificationCount(event.threadRootId, _room.NotificationCountType.Total, newCount);
    } else {
      room.setUnreadNotificationCount(_room.NotificationCountType.Total, newCount);
    }
  }
}

/**
 * Given an event, figure out the thread ID we should use for it in a receipt.
 *
 * This will either be "main", or event.threadRootId. For the thread root, or
 * e.g. reactions to the thread root, this will be main. For events inside the
 * thread, or e.g. reactions to them, this will be event.threadRootId.
 *
 * (Exported for test.)
 */
function threadIdForReceipt(event) {
  return inMainTimelineForReceipt(event) ? _read_receipts.MAIN_ROOM_TIMELINE : event.threadRootId;
}

/**
 * a) True for non-threaded messages, thread roots and non-thread relations to thread roots.
 * b) False for messages with thread relations to the thread root.
 * c) False for messages with any kind of relation to a message from case b.
 *
 * Note: true for redactions of messages that are in threads. Redacted messages
 * are not really in threads (because their relations are gone), so if they look
 * like they are in threads, that is a sign of a bug elsewhere. (At time of
 * writing, this bug definitely exists - messages are not moved to another
 * thread when they are redacted.)
 *
 * @returns true if this event is considered to be in the main timeline as far
 *               as receipts are concerned.
 */
function inMainTimelineForReceipt(event) {
  if (!event.threadRootId) {
    // Not in a thread: then it is in the main timeline
    return true;
  }
  if (event.isThreadRoot) {
    // Thread roots are in the main timeline. Note: the spec is ambiguous (or
    // wrong) on this - see
    // https://github.com/matrix-org/matrix-spec-proposals/pull/4037
    return true;
  }
  if (!event.isRelation()) {
    // If it's not related to anything, it can't be related via a chain of
    // relations to a thread root.
    //
    // Note: this is a bug, because how does it have a threadRootId if it is
    // neither a thread root, nor related to one?
    _logger.logger.warn(`Event is not a relation or a thread root, but still has a threadRootId! id=${event.getId()}`);
    return true;
  }
  if (event.isRelation(_thread.THREAD_RELATION_TYPE.name)) {
    // It's a message in a thread - definitely not in the main timeline.
    return false;
  }
  const isRelatedToRoot = event.relationEventId === event.threadRootId;

  // If it's related to the thread root (and we already know it's not a thread
  // relation) then it's in the main timeline. If it's related to something
  // else, then it's in the thread (because it has a thread ID).
  return isRelatedToRoot;
}