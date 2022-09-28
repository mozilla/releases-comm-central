"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RoomVersionStability = exports.PendingEventOrdering = exports.MatrixClient = exports.ClientEvent = exports.CRYPTO_ENABLED = void 0;

var _matrixEventsSdk = require("matrix-events-sdk");

var _sync = require("./sync");

var _event = require("./models/event");

var _stub = require("./store/stub");

var _call = require("./webrtc/call");

var _filter = require("./filter");

var _callEventHandler = require("./webrtc/callEventHandler");

var utils = _interopRequireWildcard(require("./utils"));

var _eventTimeline = require("./models/event-timeline");

var _pushprocessor = require("./pushprocessor");

var _autodiscovery = require("./autodiscovery");

var olmlib = _interopRequireWildcard(require("./crypto/olmlib"));

var _ReEmitter = require("./ReEmitter");

var _RoomList = require("./crypto/RoomList");

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

var _matrix = require("./matrix");

var _api = require("./crypto/api");

var ContentHelpers = _interopRequireWildcard(require("./content-helpers"));

var _event2 = require("./@types/event");

var _partials = require("./@types/partials");

var _eventMapper = require("./event-mapper");

var _randomstring = require("./randomstring");

var _backup = require("./crypto/backup");

var _MSC3089TreeSpace = require("./models/MSC3089TreeSpace");

var _search = require("./@types/search");

var _PushRules = require("./@types/PushRules");

var _mediaHandler = require("./webrtc/mediaHandler");

var _typedEventEmitter = require("./models/typed-event-emitter");

var _read_receipts = require("./@types/read_receipts");

var _slidingSyncSdk = require("./sliding-sync-sdk");

var _thread = require("./models/thread");

var _beacon = require("./@types/beacon");

var _NamespacedValue = require("./NamespacedValue");

var _ToDeviceMessageQueue = require("./ToDeviceMessageQueue");

var _invitesIgnorer = require("./models/invites-ignorer");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const SCROLLBACK_DELAY_MS = 3000;
const CRYPTO_ENABLED = (0, _crypto.isCryptoAvailable)();
exports.CRYPTO_ENABLED = CRYPTO_ENABLED;
const CAPABILITIES_CACHE_MS = 21600000; // 6 hours - an arbitrary value

const TURN_CHECK_INTERVAL = 10 * 60 * 1000; // poll for turn credentials every 10 minutes

let PendingEventOrdering;
exports.PendingEventOrdering = PendingEventOrdering;

(function (PendingEventOrdering) {
  PendingEventOrdering["Chronological"] = "chronological";
  PendingEventOrdering["Detached"] = "detached";
})(PendingEventOrdering || (exports.PendingEventOrdering = PendingEventOrdering = {}));

let RoomVersionStability;
exports.RoomVersionStability = RoomVersionStability;

(function (RoomVersionStability) {
  RoomVersionStability["Stable"] = "stable";
  RoomVersionStability["Unstable"] = "unstable";
})(RoomVersionStability || (exports.RoomVersionStability = RoomVersionStability = {}));

var CrossSigningKeyType;

(function (CrossSigningKeyType) {
  CrossSigningKeyType["MasterKey"] = "master_key";
  CrossSigningKeyType["SelfSigningKey"] = "self_signing_key";
  CrossSigningKeyType["UserSigningKey"] = "user_signing_key";
})(CrossSigningKeyType || (CrossSigningKeyType = {}));

/* eslint-enable camelcase */
// We're using this constant for methods overloading and inspect whether a variable
// contains an eventId or not. This was required to ensure backwards compatibility
// of methods for threads
// Probably not the most graceful solution but does a good enough job for now
const EVENT_ID_PREFIX = "$";
let ClientEvent;
exports.ClientEvent = ClientEvent;

(function (ClientEvent) {
  ClientEvent["Sync"] = "sync";
  ClientEvent["Event"] = "event";
  ClientEvent["ToDeviceEvent"] = "toDeviceEvent";
  ClientEvent["AccountData"] = "accountData";
  ClientEvent["Room"] = "Room";
  ClientEvent["DeleteRoom"] = "deleteRoom";
  ClientEvent["SyncUnexpectedError"] = "sync.unexpectedError";
  ClientEvent["ClientWellKnown"] = "WellKnown.client";
  ClientEvent["TurnServers"] = "turnServers";
  ClientEvent["TurnServersError"] = "turnServers.error";
})(ClientEvent || (exports.ClientEvent = ClientEvent = {}));

const SSO_ACTION_PARAM = new _NamespacedValue.UnstableValue("action", "org.matrix.msc3824.action");
/**
 * Represents a Matrix Client. Only directly construct this if you want to use
 * custom modules. Normally, {@link createClient} should be used
 * as it specifies 'sensible' defaults for these modules.
 */

class MatrixClient extends _typedEventEmitter.TypedEventEmitter {
  // populated after initCrypto
  // XXX: Intended private, used in code.
  // XXX: Intended private, used in code.
  // XXX: Intended private, used in code.
  // XXX: Intended private, used in code.
  // XXX: Intended private, used in code.
  // XXX: Intended private, used in code.
  // XXX: Intended private, used in code.
  // Note: these are all `protected` to let downstream consumers make mistakes if they want to.
  // We don't technically support this usage, but have reasons to do this.
  // The pushprocessor caches useful things, so keep one and re-use it
  // Promise to a response of the server's /versions response
  // TODO: This should expire: https://github.com/matrix-org/matrix-js-sdk/issues/1020
  // A manager for determining which invites should be ignored.
  constructor(opts) {
    super();

    _defineProperty(this, "reEmitter", new _ReEmitter.TypedReEmitter(this));

    _defineProperty(this, "olmVersion", null);

    _defineProperty(this, "usingExternalCrypto", false);

    _defineProperty(this, "store", void 0);

    _defineProperty(this, "deviceId", void 0);

    _defineProperty(this, "credentials", void 0);

    _defineProperty(this, "pickleKey", void 0);

    _defineProperty(this, "scheduler", void 0);

    _defineProperty(this, "clientRunning", false);

    _defineProperty(this, "timelineSupport", false);

    _defineProperty(this, "urlPreviewCache", {});

    _defineProperty(this, "identityServer", void 0);

    _defineProperty(this, "http", void 0);

    _defineProperty(this, "crypto", void 0);

    _defineProperty(this, "cryptoCallbacks", void 0);

    _defineProperty(this, "callEventHandler", void 0);

    _defineProperty(this, "supportsCallTransfer", false);

    _defineProperty(this, "forceTURN", false);

    _defineProperty(this, "iceCandidatePoolSize", 0);

    _defineProperty(this, "idBaseUrl", void 0);

    _defineProperty(this, "baseUrl", void 0);

    _defineProperty(this, "canSupportVoip", false);

    _defineProperty(this, "peekSync", null);

    _defineProperty(this, "isGuestAccount", false);

    _defineProperty(this, "ongoingScrollbacks", {});

    _defineProperty(this, "notifTimelineSet", null);

    _defineProperty(this, "cryptoStore", void 0);

    _defineProperty(this, "verificationMethods", void 0);

    _defineProperty(this, "fallbackICEServerAllowed", false);

    _defineProperty(this, "roomList", void 0);

    _defineProperty(this, "syncApi", void 0);

    _defineProperty(this, "roomNameGenerator", void 0);

    _defineProperty(this, "pushRules", void 0);

    _defineProperty(this, "syncLeftRoomsPromise", void 0);

    _defineProperty(this, "syncedLeftRooms", false);

    _defineProperty(this, "clientOpts", void 0);

    _defineProperty(this, "clientWellKnownIntervalID", void 0);

    _defineProperty(this, "canResetTimelineCallback", void 0);

    _defineProperty(this, "pushProcessor", new _pushprocessor.PushProcessor(this));

    _defineProperty(this, "serverVersionsPromise", void 0);

    _defineProperty(this, "cachedCapabilities", void 0);

    _defineProperty(this, "clientWellKnown", void 0);

    _defineProperty(this, "clientWellKnownPromise", void 0);

    _defineProperty(this, "turnServers", []);

    _defineProperty(this, "turnServersExpiry", 0);

    _defineProperty(this, "checkTurnServersIntervalID", null);

    _defineProperty(this, "exportedOlmDeviceToImport", void 0);

    _defineProperty(this, "txnCtr", 0);

    _defineProperty(this, "mediaHandler", new _mediaHandler.MediaHandler(this));

    _defineProperty(this, "pendingEventEncryption", new Map());

    _defineProperty(this, "toDeviceMessageQueue", void 0);

    _defineProperty(this, "ignoredInvites", void 0);

    _defineProperty(this, "startCallEventHandler", () => {
      if (this.isInitialSyncComplete()) {
        this.callEventHandler.start();
        this.off(ClientEvent.Sync, this.startCallEventHandler);
      }
    });

    opts.baseUrl = utils.ensureNoTrailingSlash(opts.baseUrl);
    opts.idBaseUrl = utils.ensureNoTrailingSlash(opts.idBaseUrl);
    this.baseUrl = opts.baseUrl;
    this.idBaseUrl = opts.idBaseUrl;
    this.identityServer = opts.identityServer;
    this.usingExternalCrypto = opts.usingExternalCrypto;
    this.store = opts.store || new _stub.StubStore();
    this.deviceId = opts.deviceId || null;
    const userId = opts.userId || null;
    this.credentials = {
      userId
    };
    this.http = new _httpApi.MatrixHttpApi(this, {
      baseUrl: opts.baseUrl,
      idBaseUrl: opts.idBaseUrl,
      accessToken: opts.accessToken,
      request: opts.request,
      prefix: _httpApi.PREFIX_R0,
      onlyData: true,
      extraParams: opts.queryParams,
      localTimeoutMs: opts.localTimeoutMs,
      useAuthorizationHeader: opts.useAuthorizationHeader
    });

    if (opts.deviceToImport) {
      if (this.deviceId) {
        _logger.logger.warn('not importing device because device ID is provided to ' + 'constructor independently of exported data');
      } else if (this.credentials.userId) {
        _logger.logger.warn('not importing device because user ID is provided to ' + 'constructor independently of exported data');
      } else if (!opts.deviceToImport.deviceId) {
        _logger.logger.warn('not importing device because no device ID in exported data');
      } else {
        this.deviceId = opts.deviceToImport.deviceId;
        this.credentials.userId = opts.deviceToImport.userId; // will be used during async initialization of the crypto

        this.exportedOlmDeviceToImport = opts.deviceToImport.olmDevice;
      }
    } else if (opts.pickleKey) {
      this.pickleKey = opts.pickleKey;
    }

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
      this.canSupportVoip = true; // Start listening for calls after the initial sync is done
      // We do not need to backfill the call event buffer
      // with encrypted events that might never get decrypted

      this.on(ClientEvent.Sync, this.startCallEventHandler);
    }

    this.timelineSupport = Boolean(opts.timelineSupport);
    this.cryptoStore = opts.cryptoStore;
    this.verificationMethods = opts.verificationMethods;
    this.cryptoCallbacks = opts.cryptoCallbacks || {};
    this.forceTURN = opts.forceTURN || false;
    this.iceCandidatePoolSize = opts.iceCandidatePoolSize === undefined ? 0 : opts.iceCandidatePoolSize;
    this.supportsCallTransfer = opts.supportsCallTransfer || false;
    this.fallbackICEServerAllowed = opts.fallbackICEServerAllowed || false; // List of which rooms have encryption enabled: separate from crypto because
    // we still want to know which rooms are encrypted even if crypto is disabled:
    // we don't want to start sending unencrypted events to them.

    this.roomList = new _RoomList.RoomList(this.cryptoStore);
    this.roomNameGenerator = opts.roomNameGenerator;
    this.toDeviceMessageQueue = new _ToDeviceMessageQueue.ToDeviceMessageQueue(this); // The SDK doesn't really provide a clean way for events to recalculate the push
    // actions for themselves, so we have to kinda help them out when they are encrypted.
    // We do this so that push rules are correctly executed on events in their decrypted
    // state, such as highlights when the user's name is mentioned.

    this.on(_event.MatrixEventEvent.Decrypted, event => {
      const oldActions = event.getPushActions();
      const actions = this.getPushActionsForEvent(event, true);
      const room = this.getRoom(event.getRoomId());
      if (!room) return;
      const currentCount = room.getUnreadNotificationCount(_matrix.NotificationCountType.Highlight); // Ensure the unread counts are kept up to date if the event is encrypted
      // We also want to make sure that the notification count goes up if we already
      // have encrypted events to avoid other code from resetting 'highlight' to zero.

      const oldHighlight = !!oldActions?.tweaks?.highlight;
      const newHighlight = !!actions?.tweaks?.highlight;

      if (oldHighlight !== newHighlight || currentCount > 0) {
        // TODO: Handle mentions received while the client is offline
        // See also https://github.com/vector-im/element-web/issues/9069
        if (!room.hasUserReadEvent(this.getUserId(), event.getId())) {
          let newCount = currentCount;
          if (newHighlight && !oldHighlight) newCount++;
          if (!newHighlight && oldHighlight) newCount--;
          room.setUnreadNotificationCount(_matrix.NotificationCountType.Highlight, newCount); // Fix 'Mentions Only' rooms from not having the right badge count

          const totalCount = room.getUnreadNotificationCount(_matrix.NotificationCountType.Total);

          if (totalCount < newCount) {
            room.setUnreadNotificationCount(_matrix.NotificationCountType.Total, newCount);
          }
        }
      }
    }); // Like above, we have to listen for read receipts from ourselves in order to
    // correctly handle notification counts on encrypted rooms.
    // This fixes https://github.com/vector-im/element-web/issues/9421

    this.on(_matrix.RoomEvent.Receipt, (event, room) => {
      if (room && this.isRoomEncrypted(room.roomId)) {
        // Figure out if we've read something or if it's just informational
        const content = event.getContent();
        const isSelf = Object.keys(content).filter(eid => {
          for (const [key, value] of Object.entries(content[eid])) {
            if (!utils.isSupportedReceiptType(key)) continue;
            if (!value) continue;
            if (Object.keys(value).includes(this.getUserId())) return true;
          }

          return false;
        }).length > 0;
        if (!isSelf) return; // Work backwards to determine how many events are unread. We also set
        // a limit for how back we'll look to avoid spinning CPU for too long.
        // If we hit the limit, we assume the count is unchanged.

        const maxHistory = 20;
        const events = room.getLiveTimeline().getEvents();
        let highlightCount = 0;

        for (let i = events.length - 1; i >= 0; i--) {
          if (i === events.length - maxHistory) return; // limit reached

          const event = events[i];

          if (room.hasUserReadEvent(this.getUserId(), event.getId())) {
            // If the user has read the event, then the counting is done.
            break;
          }

          const pushActions = this.getPushActionsForEvent(event);
          highlightCount += pushActions.tweaks && pushActions.tweaks.highlight ? 1 : 0;
        } // Note: we don't need to handle 'total' notifications because the counts
        // will come from the server.


        room.setUnreadNotificationCount(_matrix.NotificationCountType.Highlight, highlightCount);
      }
    });
    this.ignoredInvites = new _invitesIgnorer.IgnoredInvites(this);
  }
  /**
   * High level helper method to begin syncing and poll for new events. To listen for these
   * events, add a listener for {@link module:client~MatrixClient#event:"event"}
   * via {@link module:client~MatrixClient#on}. Alternatively, listen for specific
   * state change events.
   * @param {Object=} opts Options to apply when syncing.
   */


  async startClient(opts) {
    if (this.clientRunning) {
      // client is already running.
      return;
    }

    this.clientRunning = true; // backwards compat for when 'opts' was 'historyLen'.

    if (typeof opts === "number") {
      opts = {
        initialSyncLimit: opts
      };
    } // Create our own user object artificially (instead of waiting for sync)
    // so it's always available, even if the user is not in any rooms etc.


    const userId = this.getUserId();

    if (userId) {
      this.store.storeUser(new _user.User(userId));
    }

    if (this.crypto) {
      this.crypto.uploadDeviceKeys();
      this.crypto.start();
    } // periodically poll for turn servers if we support voip


    if (this.canSupportVoip) {
      this.checkTurnServersIntervalID = setInterval(() => {
        this.checkTurnServers();
      }, TURN_CHECK_INTERVAL); // noinspection ES6MissingAwait

      this.checkTurnServers();
    }

    if (this.syncApi) {
      // This shouldn't happen since we thought the client was not running
      _logger.logger.error("Still have sync object whilst not running: stopping old one");

      this.syncApi.stop();
    }

    try {
      const {
        serverSupport,
        stable
      } = await this.doesServerSupportThread();

      _thread.Thread.setServerSideSupport(serverSupport, stable);
    } catch (e) {
      // Most likely cause is that `doesServerSupportThread` returned `null` (as it
      // is allowed to do) and thus we enter "degraded mode" on threads.
      _thread.Thread.setServerSideSupport(false, true);
    } // shallow-copy the opts dict before modifying and storing it


    this.clientOpts = Object.assign({}, opts);
    this.clientOpts.crypto = this.crypto;

    this.clientOpts.canResetEntireTimeline = roomId => {
      if (!this.canResetTimelineCallback) {
        return false;
      }

      return this.canResetTimelineCallback(roomId);
    };

    if (this.clientOpts.slidingSync) {
      this.syncApi = new _slidingSyncSdk.SlidingSyncSdk(this.clientOpts.slidingSync, this, this.clientOpts);
    } else {
      this.syncApi = new _sync.SyncApi(this, this.clientOpts);
    }

    this.syncApi.sync();

    if (this.clientOpts.clientWellKnownPollPeriod !== undefined) {
      this.clientWellKnownIntervalID = setInterval(() => {
        this.fetchClientWellKnown();
      }, 1000 * this.clientOpts.clientWellKnownPollPeriod);
      this.fetchClientWellKnown();
    }

    this.toDeviceMessageQueue.start();
  }
  /**
   * High level helper method to stop the client from polling and allow a
   * clean shutdown.
   */


  stopClient() {
    this.crypto?.stop(); // crypto might have been initialised even if the client wasn't fully started

    if (!this.clientRunning) return; // already stopped

    _logger.logger.log('stopping MatrixClient');

    this.clientRunning = false;
    this.syncApi?.stop();
    this.syncApi = null;
    this.peekSync?.stopPeeking();
    this.callEventHandler?.stop();
    this.callEventHandler = null;
    global.clearInterval(this.checkTurnServersIntervalID);
    this.checkTurnServersIntervalID = null;

    if (this.clientWellKnownIntervalID !== undefined) {
      global.clearInterval(this.clientWellKnownIntervalID);
    }

    this.toDeviceMessageQueue.stop();
  }
  /**
   * Try to rehydrate a device if available.  The client must have been
   * initialized with a `cryptoCallback.getDehydrationKey` option, and this
   * function must be called before initCrypto and startClient are called.
   *
   * @return {Promise<string>} Resolves to undefined if a device could not be dehydrated, or
   *     to the new device ID if the dehydration was successful.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
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
      _logger.logger.info("no dehydrated device found");

      return;
    }

    const account = new global.Olm.Account();

    try {
      const deviceData = getDeviceResult.device_data;

      if (deviceData.algorithm !== _dehydration.DEHYDRATION_ALGORITHM) {
        _logger.logger.warn("Wrong algorithm for dehydrated device");

        return;
      }

      _logger.logger.log("unpickling dehydrated device");

      const key = await this.cryptoCallbacks.getDehydrationKey(deviceData, k => {
        // copy the key so that it doesn't get clobbered
        account.unpickle(new Uint8Array(k), deviceData.account);
      });
      account.unpickle(key, deviceData.account);

      _logger.logger.log("unpickled device");

      const rehydrateResult = await this.http.authedRequest(undefined, _httpApi.Method.Post, "/dehydrated_device/claim", undefined, {
        device_id: getDeviceResult.device_id
      }, {
        prefix: "/_matrix/client/unstable/org.matrix.msc2697.v2"
      });

      if (rehydrateResult.success === true) {
        this.deviceId = getDeviceResult.device_id;

        _logger.logger.info("using dehydrated device");

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

        _logger.logger.info("not using dehydrated device");

        return;
      }
    } catch (e) {
      account.free();

      _logger.logger.warn("could not unpickle", e);
    }
  }
  /**
   * Get the current dehydrated device, if any
   * @return {Promise} A promise of an object containing the dehydrated device
   */


  async getDehydratedDevice() {
    try {
      return await this.http.authedRequest(undefined, _httpApi.Method.Get, "/dehydrated_device", undefined, undefined, {
        prefix: "/_matrix/client/unstable/org.matrix.msc2697.v2"
      });
    } catch (e) {
      _logger.logger.info("could not get dehydrated device", e.toString());

      return;
    }
  }
  /**
   * Set the dehydration key.  This will also periodically dehydrate devices to
   * the server.
   *
   * @param {Uint8Array} key the dehydration key
   * @param {IDehydratedDeviceKeyInfo} [keyInfo] Information about the key.  Primarily for
   *     information about how to generate the key from a passphrase.
   * @param {string} [deviceDisplayName] The device display name for the
   *     dehydrated device.
   * @return {Promise} A promise that resolves when the dehydrated device is stored.
   */


  setDehydrationKey(key, keyInfo, deviceDisplayName) {
    if (!this.crypto) {
      _logger.logger.warn('not dehydrating device if crypto is not enabled');

      return;
    }

    return this.crypto.dehydrationManager.setKeyAndQueueDehydration(key, keyInfo, deviceDisplayName);
  }
  /**
   * Creates a new dehydrated device (without queuing periodic dehydration)
   * @param {Uint8Array} key the dehydration key
   * @param {IDehydratedDeviceKeyInfo} [keyInfo] Information about the key.  Primarily for
   *     information about how to generate the key from a passphrase.
   * @param {string} [deviceDisplayName] The device display name for the
   *     dehydrated device.
   * @return {Promise<String>} the device id of the newly created dehydrated device
   */


  async createDehydratedDevice(key, keyInfo, deviceDisplayName) {
    if (!this.crypto) {
      _logger.logger.warn('not dehydrating device if crypto is not enabled');

      return;
    }

    await this.crypto.dehydrationManager.setKey(key, keyInfo, deviceDisplayName);
    return this.crypto.dehydrationManager.dehydrateDevice();
  }

  async exportDevice() {
    if (!this.crypto) {
      _logger.logger.warn('not exporting device if crypto is not enabled');

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
   * @returns {Promise} Promise which resolves when the stores have been cleared.
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

    return Promise.all(promises).then(); // .then to fix types
  }
  /**
   * Get the user-id of the logged-in user
   *
   * @return {?string} MXID for the logged-in user, or null if not logged in
   */


  getUserId() {
    if (this.credentials && this.credentials.userId) {
      return this.credentials.userId;
    }

    return null;
  }
  /**
   * Get the domain for this client's MXID
   * @return {?string} Domain of this MXID
   */


  getDomain() {
    if (this.credentials && this.credentials.userId) {
      return this.credentials.userId.replace(/^.*?:/, '');
    }

    return null;
  }
  /**
   * Get the local part of the current user ID e.g. "foo" in "@foo:bar".
   * @return {?string} The user ID localpart or null.
   */


  getUserIdLocalpart() {
    if (this.credentials && this.credentials.userId) {
      return this.credentials.userId.split(":")[0].substring(1);
    }

    return null;
  }
  /**
   * Get the device ID of this client
   * @return {?string} device ID
   */


  getDeviceId() {
    return this.deviceId;
  }
  /**
   * Check if the runtime environment supports VoIP calling.
   * @return {boolean} True if VoIP is supported.
   */


  supportsVoip() {
    return this.canSupportVoip;
  }
  /**
   * @returns {MediaHandler}
   */


  getMediaHandler() {
    return this.mediaHandler;
  }
  /**
   * Set whether VoIP calls are forced to use only TURN
   * candidates. This is the same as the forceTURN option
   * when creating the client.
   * @param {boolean} force True to force use of TURN servers
   */


  setForceTURN(force) {
    this.forceTURN = force;
  }
  /**
   * Set whether to advertise transfer support to other parties on Matrix calls.
   * @param {boolean} support True to advertise the 'm.call.transferee' capability
   */


  setSupportsCallTransfer(support) {
    this.supportsCallTransfer = support;
  }
  /**
   * Creates a new call.
   * The place*Call methods on the returned call can be used to actually place a call
   *
   * @param {string} roomId The room the call is to be placed in.
   * @return {MatrixCall} the call or null if the browser doesn't support calling.
   */


  createCall(roomId) {
    return (0, _call.createNewMatrixCall)(this, roomId);
  }
  /**
   * Get the current sync state.
   * @return {?SyncState} the sync state, which may be null.
   * @see module:client~MatrixClient#event:"sync"
   */


  getSyncState() {
    if (!this.syncApi) {
      return null;
    }

    return this.syncApi.getSyncState();
  }
  /**
   * Returns the additional data object associated with
   * the current sync state, or null if there is no
   * such data.
   * Sync errors, if available, are put in the 'error' key of
   * this object.
   * @return {?Object}
   */


  getSyncStateData() {
    if (!this.syncApi) {
      return null;
    }

    return this.syncApi.getSyncStateData();
  }
  /**
   * Whether the initial sync has completed.
   * @return {boolean} True if at least one sync has happened.
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
   * @return {boolean} True if this is a guest access_token (or no token is supplied).
   */


  isGuest() {
    return this.isGuestAccount;
  }
  /**
   * Set whether this client is a guest account. <b>This method is experimental
   * and may change without warning.</b>
   * @param {boolean} guest True if this is a guest account.
   */


  setGuest(guest) {
    // EXPERIMENTAL:
    // If the token is a macaroon, it should be encoded in it that it is a 'guest'
    // access token, which means that the SDK can determine this entirely without
    // the dev manually flipping this flag.
    this.isGuestAccount = guest;
  }
  /**
   * Return the provided scheduler, if any.
   * @return {?module:scheduler~MatrixScheduler} The scheduler or null
   */


  getScheduler() {
    return this.scheduler;
  }
  /**
   * Retry a backed off syncing request immediately. This should only be used when
   * the user <b>explicitly</b> attempts to retry their lost connection.
   * Will also retry any outbound to-device messages currently in the queue to be sent
   * (retries of regular outgoing events are handled separately, per-event).
   * @return {boolean} True if this resulted in a request being retried.
   */


  retryImmediately() {
    // don't await for this promise: we just want to kick it off
    this.toDeviceMessageQueue.sendQueue();
    return this.syncApi.retryImmediately();
  }
  /**
   * Return the global notification EventTimelineSet, if any
   *
   * @return {EventTimelineSet} the globl notification EventTimelineSet
   */


  getNotifTimelineSet() {
    return this.notifTimelineSet;
  }
  /**
   * Set the global notification EventTimelineSet
   *
   * @param {EventTimelineSet} set
   */


  setNotifTimelineSet(set) {
    this.notifTimelineSet = set;
  }
  /**
   * Gets the capabilities of the homeserver. Always returns an object of
   * capability keys and their options, which may be empty.
   * @param {boolean} fresh True to ignore any cached values.
   * @return {Promise} Resolves to the capabilities of the homeserver
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getCapabilities(fresh = false) {
    const now = new Date().getTime();

    if (this.cachedCapabilities && !fresh) {
      if (now < this.cachedCapabilities.expiration) {
        _logger.logger.log("Returning cached capabilities");

        return Promise.resolve(this.cachedCapabilities.capabilities);
      }
    }

    return this.http.authedRequest(undefined, _httpApi.Method.Get, "/capabilities").catch(e => {
      // We swallow errors because we need a default object anyhow
      _logger.logger.error(e);
    }).then((r = {}) => {
      const capabilities = r["capabilities"] || {}; // If the capabilities missed the cache, cache it for a shorter amount
      // of time to try and refresh them later.

      const cacheMs = Object.keys(capabilities).length ? CAPABILITIES_CACHE_MS : 60000 + Math.random() * 5000;
      this.cachedCapabilities = {
        capabilities,
        expiration: now + cacheMs
      };

      _logger.logger.log("Caching capabilities: ", capabilities);

      return capabilities;
    });
  }
  /**
   * Initialise support for end-to-end encryption in this client
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

    if (this.crypto) {
      _logger.logger.warn("Attempt to re-initialise e2e encryption on MatrixClient");

      return;
    }

    if (!this.cryptoStore) {
      // the cryptostore is provided by sdk.createClient, so this shouldn't happen
      throw new Error(`Cannot enable encryption: no cryptoStore provided`);
    }

    _logger.logger.log("Crypto: Starting up crypto store...");

    await this.cryptoStore.startup(); // initialise the list of encrypted rooms (whether or not crypto is enabled)

    _logger.logger.log("Crypto: initialising roomlist...");

    await this.roomList.init();
    const userId = this.getUserId();

    if (userId === null) {
      throw new Error(`Cannot enable encryption on MatrixClient with unknown userId: ` + `ensure userId is passed in createClient().`);
    }

    if (this.deviceId === null) {
      throw new Error(`Cannot enable encryption on MatrixClient with unknown deviceId: ` + `ensure deviceId is passed in createClient().`);
    }

    const crypto = new _crypto.Crypto(this, userId, this.deviceId, this.store, this.cryptoStore, this.roomList, this.verificationMethods);
    this.reEmitter.reEmit(crypto, [_crypto.CryptoEvent.KeyBackupFailed, _crypto.CryptoEvent.KeyBackupSessionsRemaining, _crypto.CryptoEvent.RoomKeyRequest, _crypto.CryptoEvent.RoomKeyRequestCancellation, _crypto.CryptoEvent.Warning, _crypto.CryptoEvent.DevicesUpdated, _crypto.CryptoEvent.WillUpdateDevices, _crypto.CryptoEvent.DeviceVerificationChanged, _crypto.CryptoEvent.UserTrustStatusChanged, _crypto.CryptoEvent.KeysChanged]);

    _logger.logger.log("Crypto: initialising crypto object...");

    await crypto.init({
      exportedOlmDevice: this.exportedOlmDeviceToImport,
      pickleKey: this.pickleKey
    });
    delete this.exportedOlmDeviceToImport;
    this.olmVersion = _crypto.Crypto.getOlmVersion(); // if crypto initialisation was successful, tell it to attach its event handlers.

    crypto.registerEventHandlers(this);
    this.crypto = crypto;
  }
  /**
   * Is end-to-end crypto enabled for this client.
   * @return {boolean} True if end-to-end is enabled.
   */


  isCryptoEnabled() {
    return !!this.crypto;
  }
  /**
   * Get the Ed25519 key for this device
   *
   * @return {?string} base64-encoded ed25519 key. Null if crypto is
   *    disabled.
   */


  getDeviceEd25519Key() {
    if (!this.crypto) return null;
    return this.crypto.getDeviceEd25519Key();
  }
  /**
   * Get the Curve25519 key for this device
   *
   * @return {?string} base64-encoded curve25519 key. Null if crypto is
   *    disabled.
   */


  getDeviceCurve25519Key() {
    if (!this.crypto) return null;
    return this.crypto.getDeviceCurve25519Key();
  }
  /**
   * Upload the device keys to the homeserver.
   * @return {Promise<void>} A promise that will resolve when the keys are uploaded.
   */


  async uploadKeys() {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    await this.crypto.uploadDeviceKeys();
  }
  /**
   * Download the keys for a list of users and stores the keys in the session
   * store.
   * @param {Array} userIds The users to fetch.
   * @param {boolean} forceDownload Always download the keys even if cached.
   *
   * @return {Promise} A promise which resolves to a map userId->deviceId->{@link
      * module:crypto~DeviceInfo|DeviceInfo}.
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
   * @param {string} userId the user to list keys for.
   *
   * @return {module:crypto/deviceinfo[]} list of devices
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
   * @param {string} userId the user to list keys for.
   * @param {string} deviceId unique identifier for the device
   *
   * @return {module:crypto/deviceinfo} device or null
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
   * @param {string} userId owner of the device
   * @param {string} deviceId unique identifier for the device or user's
   * cross-signing public key ID.
   *
   * @param {boolean=} verified whether to mark the device as verified. defaults
   *   to 'true'.
   *
   * @returns {Promise}
   *
   * @fires module:client~event:MatrixClient"deviceVerificationChanged"
   */


  setDeviceVerified(userId, deviceId, verified = true) {
    const prom = this.setDeviceVerification(userId, deviceId, verified, null, null); // if one of the user's own devices is being marked as verified / unverified,
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
   * @param {string} userId owner of the device
   * @param {string} deviceId unique identifier for the device or user's
   * cross-signing public key ID.
   *
   * @param {boolean=} blocked whether to mark the device as blocked. defaults
   *   to 'true'.
   *
   * @returns {Promise}
   *
   * @fires module:client~event:MatrixClient"deviceVerificationChanged"
   */


  setDeviceBlocked(userId, deviceId, blocked = true) {
    return this.setDeviceVerification(userId, deviceId, null, blocked, null);
  }
  /**
   * Mark the given device as known/unknown
   *
   * @param {string} userId owner of the device
   * @param {string} deviceId unique identifier for the device or user's
   * cross-signing public key ID.
   *
   * @param {boolean=} known whether to mark the device as known. defaults
   *   to 'true'.
   *
   * @returns {Promise}
   *
   * @fires module:client~event:MatrixClient"deviceVerificationChanged"
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
   * @param {string} userId the user to request verification with
   * @param {string} roomId the room to use for verification
   *
   * @returns {Promise<module:crypto/verification/request/VerificationRequest>} resolves to a VerificationRequest
   *    when the request has been sent to the other party.
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
   * @param {string} roomId the room to use for verification
   *
   * @returns {module:crypto/verification/request/VerificationRequest?} the VerificationRequest that is in progress, if any
   */


  findVerificationRequestDMInProgress(roomId) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.findVerificationRequestDMInProgress(roomId);
  }
  /**
   * Returns all to-device verification requests that are already in progress for the given user id
   *
   * @param {string} userId the ID of the user to query
   *
   * @returns {module:crypto/verification/request/VerificationRequest[]} the VerificationRequests that are in progress
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
   * @param {string} userId the user to request verification with
   * @param {Array} devices array of device IDs to send requests to.  Defaults to
   *    all devices owned by the user
   *
   * @returns {Promise<module:crypto/verification/request/VerificationRequest>} resolves to a VerificationRequest
   *    when the request has been sent to the other party.
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
   * @param {string} method the verification method to use
   * @param {string} userId the user to verify keys with
   * @param {string} deviceId the device to verify
   *
   * @returns {Verification} a verification object
   * @deprecated Use `requestVerification` instead.
   */


  beginKeyVerification(method, userId, deviceId) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.beginKeyVerification(method, userId, deviceId);
  }

  checkSecretStorageKey(key, info) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.checkSecretStorageKey(key, info);
  }
  /**
   * Set the global override for whether the client should ever send encrypted
   * messages to unverified devices.  This provides the default for rooms which
   * do not specify a value.
   *
   * @param {boolean} value whether to blacklist all unverified devices by default
   */


  setGlobalBlacklistUnverifiedDevices(value) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.setGlobalBlacklistUnverifiedDevices(value);
  }
  /**
   * @return {boolean} whether to blacklist all unverified devices by default
   */


  getGlobalBlacklistUnverifiedDevices() {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.getGlobalBlacklistUnverifiedDevices();
  }
  /**
   * Set whether sendMessage in a room with unknown and unverified devices
   * should throw an error and not send them message. This has 'Global' for
   * symmetry with setGlobalBlacklistUnverifiedDevices but there is currently
   * no room-level equivalent for this setting.
   *
   * This API is currently UNSTABLE and may change or be removed without notice.
   *
   * @param {boolean} value whether error on unknown devices
   */


  setGlobalErrorOnUnknownDevices(value) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.setGlobalErrorOnUnknownDevices(value);
  }
  /**
   * @return {boolean} whether to error on unknown devices
   *
   * This API is currently UNSTABLE and may change or be removed without notice.
   */


  getGlobalErrorOnUnknownDevices() {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.getGlobalErrorOnUnknownDevices();
  }
  /**
   * Get the user's cross-signing key ID.
   *
   * The cross-signing API is currently UNSTABLE and may change without notice.
   *
   * @param {CrossSigningKey} [type=master] The type of key to get the ID of.  One of
   *     "master", "self_signing", or "user_signing".  Defaults to "master".
   *
   * @returns {string} the key ID
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
   * @param {string} userId the user ID to get the cross-signing info for.
   *
   * @returns {CrossSigningInfo} the cross signing information for the user.
   */


  getStoredCrossSigningForUser(userId) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.getStoredCrossSigningForUser(userId);
  }
  /**
   * Check whether a given user is trusted.
   *
   * The cross-signing API is currently UNSTABLE and may change without notice.
   *
   * @param {string} userId The ID of the user to check.
   *
   * @returns {UserTrustLevel}
   */


  checkUserTrust(userId) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.checkUserTrust(userId);
  }
  /**
   * Check whether a given device is trusted.
   *
   * The cross-signing API is currently UNSTABLE and may change without notice.
   *
   * @function module:client~MatrixClient#checkDeviceTrust
   * @param {string} userId The ID of the user whose devices is to be checked.
   * @param {string} deviceId The ID of the device to check
   *
   * @returns {DeviceTrustLevel}
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
   * @param {string} deviceId The ID of the device to check
   *
   * @returns {boolean} true if the device is cross-signed
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
   * @param {Object} opts ICheckOwnCrossSigningTrustOpts object
   */


  checkOwnCrossSigningTrust(opts) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.checkOwnCrossSigningTrust(opts);
  }
  /**
   * Checks that a given cross-signing private key matches a given public key.
   * This can be used by the getCrossSigningKey callback to verify that the
   * private key it is about to supply is the one that was requested.
   * @param {Uint8Array} privateKey The private key
   * @param {string} expectedPublicKey The public key
   * @returns {boolean} true if the key matches, otherwise false
   */


  checkCrossSigningPrivateKey(privateKey, expectedPublicKey) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.checkCrossSigningPrivateKey(privateKey, expectedPublicKey);
  } // deprecated: use requestVerification instead


  legacyDeviceVerification(userId, deviceId, method) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.legacyDeviceVerification(userId, deviceId, method);
  }
  /**
   * Perform any background tasks that can be done before a message is ready to
   * send, in order to speed up sending of the message.
   * @param {module:models/room} room the room the event is in
   */


  prepareToEncrypt(room) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.prepareToEncrypt(room);
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
   * @return {boolean} True if cross-signing is ready to be used on this device
   */


  isCrossSigningReady() {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.isCrossSigningReady();
  }
  /**
   * Bootstrap cross-signing by creating keys if needed. If everything is already
   * set up, then no changes are made, so this is safe to run to ensure
   * cross-signing is ready for use.
   *
   * This function:
   * - creates new cross-signing keys if they are not found locally cached nor in
   *   secret storage (if it has been setup)
   *
   * The cross-signing API is currently UNSTABLE and may change without notice.
   *
   * @param {function} opts.authUploadDeviceSigningKeys Function
   * called to await an interactive auth flow when uploading device signing keys.
   * @param {boolean} [opts.setupNewCrossSigning] Optional. Reset even if keys
   * already exist.
   * Args:
   *     {function} A function that makes the request requiring auth. Receives the
   *     auth data as an object. Can be called multiple times, first with an empty
   *     authDict, to obtain the flows.
   */


  bootstrapCrossSigning(opts) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.bootstrapCrossSigning(opts);
  }
  /**
   * Whether to trust a others users signatures of their devices.
   * If false, devices will only be considered 'verified' if we have
   * verified that device individually (effectively disabling cross-signing).
   *
   * Default: true
   *
   * @return {boolean} True if trusting cross-signed devices
   */


  getCryptoTrustCrossSignedDevices() {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.getCryptoTrustCrossSignedDevices();
  }
  /**
   * See getCryptoTrustCrossSignedDevices
    * This may be set before initCrypto() is called to ensure no races occur.
   *
   * @param {boolean} val True to trust cross-signed devices
   */


  setCryptoTrustCrossSignedDevices(val) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.setCryptoTrustCrossSignedDevices(val);
  }
  /**
   * Counts the number of end to end session keys that are waiting to be backed up
   * @returns {Promise<int>} Resolves to the number of sessions requiring backup
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
   * @param {module:models/event.MatrixEvent} event event to be checked
   * @returns {IEncryptedEventInfo} The event information.
   */


  getEventEncryptionInfo(event) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.getEventEncryptionInfo(event);
  }
  /**
   * Create a recovery key from a user-supplied passphrase.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param {string} password Passphrase string that can be entered by the user
   *     when restoring the backup as an alternative to entering the recovery key.
   *     Optional.
   * @returns {Promise<Object>} Object with public key metadata, encoded private
   *     recovery key which should be disposed of after displaying to the user,
   *     and raw private key to avoid round tripping if needed.
   */


  createRecoveryKeyFromPassphrase(password) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.createRecoveryKeyFromPassphrase(password);
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
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @return {boolean} True if secret storage is ready to be used on this device
   */


  isSecretStorageReady() {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.isSecretStorageReady();
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
   * @param opts
   */


  bootstrapSecretStorage(opts) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.bootstrapSecretStorage(opts);
  }
  /**
   * Add a key for encrypting secrets.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param {string} algorithm the algorithm used by the key
   * @param {object} opts the options for the algorithm.  The properties used
   *     depend on the algorithm given.
   * @param {string} [keyName] the name of the key.  If not given, a random name will be generated.
   *
   * @return {object} An object with:
   *     keyId: {string} the ID of the key
   *     keyInfo: {object} details about the key (iv, mac, passphrase)
   */


  addSecretStorageKey(algorithm, opts, keyName) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.addSecretStorageKey(algorithm, opts, keyName);
  }
  /**
   * Check whether we have a key with a given ID.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param {string} [keyId = default key's ID] The ID of the key to check
   *     for. Defaults to the default key ID if not provided.
   * @return {boolean} Whether we have the key.
   */


  hasSecretStorageKey(keyId) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.hasSecretStorageKey(keyId);
  }
  /**
   * Store an encrypted secret on the server.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param {string} name The name of the secret
   * @param {string} secret The secret contents.
   * @param {Array} keys The IDs of the keys to use to encrypt the secret or null/undefined
   *     to use the default (will throw if no default key is set).
   */


  storeSecret(name, secret, keys) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.storeSecret(name, secret, keys);
  }
  /**
   * Get a secret from storage.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param {string} name the name of the secret
   *
   * @return {string} the contents of the secret
   */


  getSecret(name) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.getSecret(name);
  }
  /**
   * Check if a secret is stored on the server.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param {string} name the name of the secret
   * @return {object?} map of key name to key info the secret is encrypted
   *     with, or null if it is not present or not encrypted with a trusted
   *     key
   */


  isSecretStored(name) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.isSecretStored(name);
  }
  /**
   * Request a secret from another device.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param {string} name the name of the secret to request
   * @param {string[]} devices the devices to request the secret from
   *
   * @return {ISecretRequest} the secret request object
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
   * @return {string} The default key ID or null if no default key ID is set
   */


  getDefaultSecretStorageKeyId() {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.getDefaultSecretStorageKeyId();
  }
  /**
   * Set the current default key ID for encrypting secrets.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param {string} keyId The new default key ID
   */


  setDefaultSecretStorageKeyId(keyId) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.setDefaultSecretStorageKeyId(keyId);
  }
  /**
   * Checks that a given secret storage private key matches a given public key.
   * This can be used by the getSecretStorageKey callback to verify that the
   * private key it is about to supply is the one that was requested.
   *
   * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
   *
   * @param {Uint8Array} privateKey The private key
   * @param {string} expectedPublicKey The public key
   * @returns {boolean} true if the key matches, otherwise false
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
   * @param {MatrixEvent} event event to be checked
   *
   * @return {Promise<module:crypto/deviceinfo?>}
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
   * @param {MatrixEvent} event event to be checked
   *
   * @return {boolean} true if the sender of this event has been verified using
   * {@link module:client~MatrixClient#setDeviceVerified|setDeviceVerified}.
   */


  async isEventSenderVerified(event) {
    const device = await this.getEventSenderDeviceInfo(event);

    if (!device) {
      return false;
    }

    return device.isVerified();
  }
  /**
   * Cancel a room key request for this event if one is ongoing and resend the
   * request.
   * @param  {MatrixEvent} event event of which to cancel and resend the room
   *                            key request.
   * @return {Promise} A promise that will resolve when the key request is queued
   */


  cancelAndResendEventRoomKeyRequest(event) {
    return event.cancelAndResendKeyRequest(this.crypto, this.getUserId());
  }
  /**
   * Enable end-to-end encryption for a room. This does not modify room state.
   * Any messages sent before the returned promise resolves will be sent unencrypted.
   * @param {string} roomId The room ID to enable encryption in.
   * @param {object} config The encryption config for the room.
   * @return {Promise} A promise that will resolve when encryption is set up.
   */


  setRoomEncryption(roomId, config) {
    if (!this.crypto) {
      throw new Error("End-to-End encryption disabled");
    }

    return this.crypto.setRoomEncryption(roomId, config);
  }
  /**
   * Whether encryption is enabled for a room.
   * @param {string} roomId the room id to query.
   * @return {boolean} whether encryption is enabled.
   */


  isRoomEncrypted(roomId) {
    const room = this.getRoom(roomId);

    if (!room) {
      // we don't know about this room, so can't determine if it should be
      // encrypted. Let's assume not.
      return false;
    } // if there is an 'm.room.encryption' event in this room, it should be
    // encrypted (independently of whether we actually support encryption)


    const ev = room.currentState.getStateEvents(_event2.EventType.RoomEncryption, "");

    if (ev) {
      return true;
    } // we don't have an m.room.encrypted event, but that might be because
    // the server is hiding it from us. Check the store to see if it was
    // previously encrypted.


    return this.roomList.isRoomEncrypted(roomId);
  }
  /**
   * Encrypts and sends a given object via Olm to-device messages to a given
   * set of devices.
   *
   * @param {object[]} userDeviceInfoArr
   *   mapping from userId to deviceInfo
   *
   * @param {object} payload fields to include in the encrypted payload
   *      *
   * @return {Promise<{contentMap, deviceInfoByDeviceId}>} Promise which
   *     resolves once the message has been encrypted and sent to the given
   *     userDeviceMap, and returns the { contentMap, deviceInfoByDeviceId }
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
   * @param {string} roomId The ID of the room to discard the session for
   *
   * This should not normally be necessary.
   */


  forceDiscardSession(roomId) {
    if (!this.crypto) {
      throw new Error("End-to-End encryption disabled");
    }

    this.crypto.forceDiscardSession(roomId);
  }
  /**
   * Get a list containing all of the room keys
   *
   * This should be encrypted before returning it to the user.
   *
   * @return {Promise} a promise which resolves to a list of
   *    session export objects
   */


  exportRoomKeys() {
    if (!this.crypto) {
      return Promise.reject(new Error("End-to-end encryption disabled"));
    }

    return this.crypto.exportRoomKeys();
  }
  /**
   * Import a list of room keys previously exported by exportRoomKeys
   *
   * @param {Object[]} keys a list of session export objects
   * @param {Object} opts
   * @param {Function} opts.progressCallback called with an object that has a "stage" param
   *
   * @return {Promise} a promise which resolves when the keys
   *    have been imported
   */


  importRoomKeys(keys, opts) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.importRoomKeys(keys, opts);
  }
  /**
   * Force a re-check of the local key backup status against
   * what's on the server.
   *
   * @returns {Object} Object with backup info (as returned by
   *     getKeyBackupVersion) in backupInfo and
   *     trust information (as returned by isKeyBackupTrusted)
   *     in trustInfo.
   */


  checkKeyBackup() {
    return this.crypto.backupManager.checkKeyBackup();
  }
  /**
   * Get information about the current key backup.
   * @returns {Promise<IKeyBackupInfo | null>} Information object from API or null
   */


  async getKeyBackupVersion() {
    let res;

    try {
      res = await this.http.authedRequest(undefined, _httpApi.Method.Get, "/room_keys/version", undefined, undefined, {
        prefix: _httpApi.PREFIX_UNSTABLE
      });
    } catch (e) {
      if (e.errcode === 'M_NOT_FOUND') {
        return null;
      } else {
        throw e;
      }
    }

    _backup.BackupManager.checkBackupVersion(res);

    return res;
  }
  /**
   * @param {object} info key backup info dict from getKeyBackupVersion()
   * @return {object} {
   *     usable: [bool], // is the backup trusted, true iff there is a sig that is valid & from a trusted device
   *     sigs: [
   *         valid: [bool],
   *         device: [DeviceInfo],
   *     ]
   * }
   */


  isKeyBackupTrusted(info) {
    return this.crypto.backupManager.isKeyBackupTrusted(info);
  }
  /**
   * @returns {boolean} true if the client is configured to back up keys to
   *     the server, otherwise false. If we haven't completed a successful check
   *     of key backup status yet, returns null.
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
   * @param {object} info Backup information object as returned by getKeyBackupVersion
   * @returns {Promise<void>} Resolves when complete.
   */


  enableKeyBackup(info) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    return this.crypto.backupManager.enableKeyBackup(info);
  }
  /**
   * Disable backing up of keys.
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
   * @param {string} password Passphrase string that can be entered by the user
   *     when restoring the backup as an alternative to entering the recovery key.
   *     Optional.
   * @param {boolean} [opts.secureSecretStorage = false] Whether to use Secure
   *     Secret Storage to store the key encrypting key backups.
   *     Optional, defaults to false.
   *
   * @returns {Promise<object>} Object that can be passed to createKeyBackupVersion and
   *     additionally has a 'recovery_key' member with the user-facing recovery key string.
   */
  // TODO: Verify types


  async prepareKeyBackupVersion(password, opts = {
    secureSecretStorage: false
  }) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    } // eslint-disable-next-line camelcase


    const {
      algorithm,
      auth_data,
      recovery_key,
      privateKey
    } = await this.crypto.backupManager.prepareKeyBackupVersion(password);

    if (opts.secureSecretStorage) {
      await this.storeSecret("m.megolm_backup.v1", (0, olmlib.encodeBase64)(privateKey));

      _logger.logger.info("Key backup private key stored in secret storage");
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
   * @return {Promise<object?>} map of key name to key info the secret is
   *     encrypted with, or null if it is not present or not encrypted with a
   *     trusted key
   */


  isKeyBackupKeyStored() {
    return Promise.resolve(this.isSecretStored("m.megolm_backup.v1"));
  }
  /**
   * Create a new key backup version and enable it, using the information return
   * from prepareKeyBackupVersion.
   *
   * @param {object} info Info object from prepareKeyBackupVersion
   * @returns {Promise<object>} Object with 'version' param indicating the version created
   */


  async createKeyBackupVersion(info) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    await this.crypto.backupManager.createKeyBackupVersion(info);
    const data = {
      algorithm: info.algorithm,
      auth_data: info.auth_data
    }; // Sign the backup auth data with the device key for backwards compat with
    // older devices with cross-signing. This can probably go away very soon in
    // favour of just signing with the cross-singing master key.
    // XXX: Private member access

    await this.crypto.signObject(data.auth_data);

    if (this.cryptoCallbacks.getCrossSigningKey && // XXX: Private member access
    this.crypto.crossSigningInfo.getId()) {
      // now also sign the auth data with the cross-signing master key
      // we check for the callback explicitly here because we still want to be able
      // to create an un-cross-signed key backup if there is a cross-signing key but
      // no callback supplied.
      // XXX: Private member access
      await this.crypto.crossSigningInfo.signObject(data.auth_data, "master");
    }

    const res = await this.http.authedRequest(undefined, _httpApi.Method.Post, "/room_keys/version", undefined, data, {
      prefix: _httpApi.PREFIX_UNSTABLE
    }); // We could assume everything's okay and enable directly, but this ensures
    // we run the same signature verification that will be used for future
    // sessions.

    await this.checkKeyBackup();

    if (!this.getKeyBackupEnabled()) {
      _logger.logger.error("Key backup not usable even though we just created it");
    }

    return res;
  }

  deleteKeyBackupVersion(version) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    } // If we're currently backing up to this backup... stop.
    // (We start using it automatically in createKeyBackupVersion
    // so this is symmetrical).


    if (this.crypto.backupManager.version) {
      this.crypto.backupManager.disableKeyBackup();
    }

    const path = utils.encodeUri("/room_keys/version/$version", {
      $version: version
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Delete, path, undefined, undefined, {
      prefix: _httpApi.PREFIX_UNSTABLE
    });
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
   * @param {string} roomId ID of the room that the keys are for Optional.
   * @param {string} sessionId ID of the session that the keys are for Optional.
   * @param {number} version backup version Optional.
   * @param {object} data Object keys to send
   * @return {Promise} a promise that will resolve when the keys
   * are uploaded
   */


  sendKeyBackup(roomId, sessionId, version, data) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    const path = this.makeKeyBackupPath(roomId, sessionId, version);
    return this.http.authedRequest(undefined, _httpApi.Method.Put, path.path, path.queryData, data, {
      prefix: _httpApi.PREFIX_UNSTABLE
    });
  }
  /**
   * Marks all group sessions as needing to be backed up and schedules them to
   * upload in the background as soon as possible.
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
   * @returns {Promise<int>} Resolves to the number of sessions requiring a backup.
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
   * @param {string} password Passphrase
   * @param {object} backupInfo Backup metadata from `checkKeyBackup`
   * @return {Promise<Uint8Array>} key backup key
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
   * @param {string} recoveryKey The recovery key
   * @return {Uint8Array} key backup key
   */


  keyBackupKeyFromRecoveryKey(recoveryKey) {
    return (0, _recoverykey.decodeRecoveryKey)(recoveryKey);
  }
  /**
   * Restore from an existing key backup via a passphrase.
   *
   * @param {string} password Passphrase
   * @param {string} [targetRoomId] Room ID to target a specific room.
   * Restores all rooms if omitted.
   * @param {string} [targetSessionId] Session ID to target a specific session.
   * Restores all sessions if omitted.
   * @param {object} backupInfo Backup metadata from `checkKeyBackup`
   * @param {object} opts Optional params such as callbacks
   * @return {Promise<object>} Status of restoration with `total` and `imported`
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
   * @param {object} backupInfo Backup metadata from `checkKeyBackup`
   * @param {string} [targetRoomId] Room ID to target a specific room.
   * Restores all rooms if omitted.
   * @param {string} [targetSessionId] Session ID to target a specific session.
   * Restores all sessions if omitted.
   * @param {object} opts Optional params such as callbacks
   * @return {Promise<object>} Status of restoration with `total` and `imported`
   * key counts.
   */


  async restoreKeyBackupWithSecretStorage(backupInfo, targetRoomId, targetSessionId, opts) {
    const storedKey = await this.getSecret("m.megolm_backup.v1"); // ensure that the key is in the right format.  If not, fix the key and
    // store the fixed version

    const fixedKey = (0, _crypto.fixBackupKey)(storedKey);

    if (fixedKey) {
      const [keyId] = await this.crypto.getSecretStorageKey();
      await this.storeSecret("m.megolm_backup.v1", fixedKey, [keyId]);
    }

    const privKey = (0, olmlib.decodeBase64)(fixedKey || storedKey);
    return this.restoreKeyBackup(privKey, targetRoomId, targetSessionId, backupInfo, opts);
  }
  /**
   * Restore from an existing key backup via an encoded recovery key.
   *
   * @param {string} recoveryKey Encoded recovery key
   * @param {string} [targetRoomId] Room ID to target a specific room.
   * Restores all rooms if omitted.
   * @param {string} [targetSessionId] Session ID to target a specific session.
   * Restores all sessions if omitted.
   * @param {object} backupInfo Backup metadata from `checkKeyBackup`
   * @param {object} opts Optional params such as callbacks
    * @return {Promise<object>} Status of restoration with `total` and `imported`
   * key counts.
   */


  restoreKeyBackupWithRecoveryKey(recoveryKey, targetRoomId, targetSessionId, backupInfo, opts) {
    const privKey = (0, _recoverykey.decodeRecoveryKey)(recoveryKey);
    return this.restoreKeyBackup(privKey, targetRoomId, targetSessionId, backupInfo, opts);
  }

  async restoreKeyBackupWithCache(targetRoomId, targetSessionId, backupInfo, opts) {
    const privKey = await this.crypto.getSessionBackupPrivateKey();

    if (!privKey) {
      throw new Error("Couldn't get key");
    }

    return this.restoreKeyBackup(privKey, targetRoomId, targetSessionId, backupInfo, opts);
  }

  async restoreKeyBackup(privKey, targetRoomId, targetSessionId, backupInfo, opts) {
    const cacheCompleteCallback = opts?.cacheCompleteCallback;
    const progressCallback = opts?.progressCallback;

    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    let totalKeyCount = 0;
    let keys = [];
    const path = this.makeKeyBackupPath(targetRoomId, targetSessionId, backupInfo.version);
    const algorithm = await _backup.BackupManager.makeAlgorithm(backupInfo, async () => {
      return privKey;
    });
    const untrusted = algorithm.untrusted;

    try {
      // If the pubkey computed from the private data we've been given
      // doesn't match the one in the auth_data, the user has entered
      // a different recovery key / the wrong passphrase.
      if (!(await algorithm.keyMatches(privKey))) {
        return Promise.reject(new _httpApi.MatrixError({
          errcode: MatrixClient.RESTORE_BACKUP_ERROR_BAD_KEY
        }));
      } // Cache the key, if possible.
      // This is async.


      this.crypto.storeSessionBackupPrivateKey(privKey).catch(e => {
        _logger.logger.warn("Error caching session backup key:", e);
      }).then(cacheCompleteCallback);

      if (progressCallback) {
        progressCallback({
          stage: "fetch"
        });
      }

      const res = await this.http.authedRequest(undefined, _httpApi.Method.Get, path.path, path.queryData, undefined, {
        prefix: _httpApi.PREFIX_UNSTABLE
      });

      if (res.rooms) {
        const rooms = res.rooms;

        for (const [roomId, roomData] of Object.entries(rooms)) {
          if (!roomData.sessions) continue;
          totalKeyCount += Object.keys(roomData.sessions).length;
          const roomKeys = await algorithm.decryptSessions(roomData.sessions);

          for (const k of roomKeys) {
            k.room_id = roomId;
            keys.push(k);
          }
        }
      } else if (res.sessions) {
        const sessions = res.sessions;
        totalKeyCount = Object.keys(sessions).length;
        keys = await algorithm.decryptSessions(sessions);

        for (const k of keys) {
          k.room_id = targetRoomId;
        }
      } else {
        totalKeyCount = 1;

        try {
          const [key] = await algorithm.decryptSessions({
            [targetSessionId]: res
          });
          key.room_id = targetRoomId;
          key.session_id = targetSessionId;
          keys.push(key);
        } catch (e) {
          _logger.logger.log("Failed to decrypt megolm session from backup", e);
        }
      }
    } finally {
      algorithm.free();
    }

    await this.importRoomKeys(keys, {
      progressCallback,
      untrusted,
      source: "backup"
    });
    await this.checkKeyBackup();
    return {
      total: totalKeyCount,
      imported: keys.length
    };
  }

  deleteKeysFromBackup(roomId, sessionId, version) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    const path = this.makeKeyBackupPath(roomId, sessionId, version);
    return this.http.authedRequest(undefined, _httpApi.Method.Delete, path.path, path.queryData, undefined, {
      prefix: _httpApi.PREFIX_UNSTABLE
    });
  }
  /**
   * Share shared-history decryption keys with the given users.
   *
   * @param {string} roomId the room for which keys should be shared.
   * @param {array} userIds a list of users to share with.  The keys will be sent to
   *     all of the user's current devices.
   */


  async sendSharedHistoryKeys(roomId, userIds) {
    if (!this.crypto) {
      throw new Error("End-to-end encryption disabled");
    }

    const roomEncryption = this.roomList.getRoomEncryption(roomId);

    if (!roomEncryption) {
      // unknown room, or unencrypted room
      _logger.logger.error("Unknown room.  Not sharing decryption keys");

      return;
    }

    const deviceInfos = await this.crypto.downloadKeys(userIds);
    const devicesByUser = {};

    for (const [userId, devices] of Object.entries(deviceInfos)) {
      devicesByUser[userId] = Object.values(devices);
    } // XXX: Private member access


    const alg = this.crypto.getRoomDecryptor(roomId, roomEncryption.algorithm);

    if (alg.sendSharedHistoryInboundSessions) {
      await alg.sendSharedHistoryInboundSessions(devicesByUser);
    } else {
      _logger.logger.warn("Algorithm does not support sharing previous keys", roomEncryption.algorithm);
    }
  }
  /**
   * Get the config for the media repository.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves with an object containing the config.
   */


  getMediaConfig(callback) {
    return this.http.authedRequest(callback, _httpApi.Method.Get, "/config", undefined, undefined, {
      prefix: _httpApi.PREFIX_MEDIA_R0
    });
  }
  /**
   * Get the room for the given room ID.
   * This function will return a valid room for any room for which a Room event
   * has been emitted. Note in particular that other events, eg. RoomState.members
   * will be emitted for a room before this function will return the given room.
   * @param {string} roomId The room ID
   * @return {Room|null} The Room or null if it doesn't exist or there is no data store.
   */


  getRoom(roomId) {
    return this.store.getRoom(roomId);
  }
  /**
   * Retrieve all known rooms.
   * @return {Room[]} A list of rooms, or an empty list if there is no data store.
   */


  getRooms() {
    return this.store.getRooms();
  }
  /**
   * Retrieve all rooms that should be displayed to the user
   * This is essentially getRooms() with some rooms filtered out, eg. old versions
   * of rooms that have been replaced or (in future) other rooms that have been
   * marked at the protocol level as not to be displayed to the user.
   * @return {Room[]} A list of rooms, or an empty list if there is no data store.
   */


  getVisibleRooms() {
    const allRooms = this.store.getRooms();
    const replacedRooms = new Set();

    for (const r of allRooms) {
      const createEvent = r.currentState.getStateEvents(_event2.EventType.RoomCreate, ''); // invites are included in this list and we don't know their create events yet

      if (createEvent) {
        const predecessor = createEvent.getContent()['predecessor'];

        if (predecessor && predecessor['room_id']) {
          replacedRooms.add(predecessor['room_id']);
        }
      }
    }

    return allRooms.filter(r => {
      const tombstone = r.currentState.getStateEvents(_event2.EventType.RoomTombstone, '');

      if (tombstone && replacedRooms.has(r.roomId)) {
        return false;
      }

      return true;
    });
  }
  /**
   * Retrieve a user.
   * @param {string} userId The user ID to retrieve.
   * @return {?User} A user or null if there is no data store or the user does
   * not exist.
   */


  getUser(userId) {
    return this.store.getUser(userId);
  }
  /**
   * Retrieve all known users.
   * @return {User[]} A list of users, or an empty list if there is no data store.
   */


  getUsers() {
    return this.store.getUsers();
  }
  /**
   * Set account data event for the current user.
   * It will retry the request up to 5 times.
   * @param {string} eventType The event type
   * @param {Object} content the contents object for the event
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: an empty object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setAccountData(eventType, content, callback) {
    const path = utils.encodeUri("/user/$userId/account_data/$type", {
      $userId: this.credentials.userId,
      $type: eventType
    });
    const promise = (0, _httpApi.retryNetworkOperation)(5, () => {
      return this.http.authedRequest(undefined, _httpApi.Method.Put, path, undefined, content);
    });

    if (callback) {
      promise.then(result => callback(null, result), callback);
    }

    return promise;
  }
  /**
   * Get account data event of given type for the current user.
   * @param {string} eventType The event type
   * @return {?object} The contents of the given account data event
   */


  getAccountData(eventType) {
    return this.store.getAccountData(eventType);
  }
  /**
   * Get account data event of given type for the current user. This variant
   * gets account data directly from the homeserver if the local store is not
   * ready, which can be useful very early in startup before the initial sync.
   * @param {string} eventType The event type
   * @return {Promise} Resolves: The contents of the given account
   * data event.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  async getAccountDataFromServer(eventType) {
    if (this.isInitialSyncComplete()) {
      const event = this.store.getAccountData(eventType);

      if (!event) {
        return null;
      } // The network version below returns just the content, so this branch
      // does the same to match.


      return event.getContent();
    }

    const path = utils.encodeUri("/user/$userId/account_data/$type", {
      $userId: this.credentials.userId,
      $type: eventType
    });

    try {
      return await this.http.authedRequest(undefined, _httpApi.Method.Get, path);
    } catch (e) {
      if (e.data?.errcode === 'M_NOT_FOUND') {
        return null;
      }

      throw e;
    }
  }
  /**
   * Gets the users that are ignored by this client
   * @returns {string[]} The array of users that are ignored (empty if none)
   */


  getIgnoredUsers() {
    const event = this.getAccountData("m.ignored_user_list");
    if (!event || !event.getContent() || !event.getContent()["ignored_users"]) return [];
    return Object.keys(event.getContent()["ignored_users"]);
  }
  /**
   * Sets the users that the current user should ignore.
   * @param {string[]} userIds the user IDs to ignore
   * @param {module:client.callback} [callback] Optional.
   * @return {Promise} Resolves: an empty object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setIgnoredUsers(userIds, callback) {
    const content = {
      ignored_users: {}
    };
    userIds.forEach(u => {
      content.ignored_users[u] = {};
    });
    return this.setAccountData("m.ignored_user_list", content, callback);
  }
  /**
   * Gets whether or not a specific user is being ignored by this client.
   * @param {string} userId the user ID to check
   * @returns {boolean} true if the user is ignored, false otherwise
   */


  isUserIgnored(userId) {
    return this.getIgnoredUsers().includes(userId);
  }
  /**
   * Join a room. If you have already joined the room, this will no-op.
   * @param {string} roomIdOrAlias The room ID or room alias to join.
   * @param {Object} opts Options when joining the room.
   * @param {boolean} opts.syncRoom True to do a room initial sync on the resulting
   * room. If false, the <strong>returned Room object will have no current state.
   * </strong> Default: true.
   * @param {boolean} opts.inviteSignUrl If the caller has a keypair 3pid invite, the signing URL is passed in this parameter.
   * @param {string[]} opts.viaServers The server names to try and join through in addition to those that are automatically chosen.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: Room object.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  async joinRoom(roomIdOrAlias, opts, callback) {
    // to help people when upgrading..
    if (utils.isFunction(opts)) {
      throw new Error("Expected 'opts' object, got function.");
    }

    opts = opts || {};

    if (opts.syncRoom === undefined) {
      opts.syncRoom = true;
    }

    const room = this.getRoom(roomIdOrAlias);

    if (room && room.hasMembershipState(this.credentials.userId, "join")) {
      return Promise.resolve(room);
    }

    let signPromise = Promise.resolve();

    if (opts.inviteSignUrl) {
      signPromise = this.http.requestOtherUrl(undefined, _httpApi.Method.Post, opts.inviteSignUrl, {
        mxid: this.credentials.userId
      });
    }

    const queryString = {};

    if (opts.viaServers) {
      queryString["server_name"] = opts.viaServers;
    }

    const reqOpts = {
      qsStringifyOptions: {
        arrayFormat: 'repeat'
      }
    };

    try {
      const data = {};
      const signedInviteObj = await signPromise;

      if (signedInviteObj) {
        data.third_party_signed = signedInviteObj;
      }

      const path = utils.encodeUri("/join/$roomid", {
        $roomid: roomIdOrAlias
      });
      const res = await this.http.authedRequest(undefined, _httpApi.Method.Post, path, queryString, data, reqOpts);
      const roomId = res['room_id'];
      const syncApi = new _sync.SyncApi(this, this.clientOpts);
      const room = syncApi.createRoom(roomId);

      if (opts.syncRoom) {// v2 will do this for us
        // return syncApi.syncRoom(room);
      }

      callback?.(null, room);
      return room;
    } catch (e) {
      callback?.(e);
      throw e; // rethrow for reject
    }
  }
  /**
   * Resend an event. Will also retry any to-device messages waiting to be sent.
   * @param {MatrixEvent} event The event to resend.
   * @param {Room} room Optional. The room the event is in. Will update the
   * timeline entry if provided.
   * @return {Promise} Resolves: to an ISendEventResponse object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
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
   * @param {MatrixEvent} event   Event to cancel
   * @throws Error if the event is not in QUEUED, NOT_SENT or ENCRYPTING state
   */


  cancelPendingEvent(event) {
    if (![_event.EventStatus.QUEUED, _event.EventStatus.NOT_SENT, _event.EventStatus.ENCRYPTING].includes(event.status)) {
      throw new Error("cannot cancel an event with status " + event.status);
    } // if the event is currently being encrypted then


    if (event.status === _event.EventStatus.ENCRYPTING) {
      this.pendingEventEncryption.delete(event.getId());
    } else if (this.scheduler && event.status === _event.EventStatus.QUEUED) {
      // tell the scheduler to forget about it, if it's queued
      this.scheduler.removeEventFromQueue(event);
    } // then tell the room about the change of state, which will remove it
    // from the room's list of pending events.


    const room = this.getRoom(event.getRoomId());
    this.updatePendingEventStatus(room, event, _event.EventStatus.CANCELLED);
  }
  /**
   * @param {string} roomId
   * @param {string} name
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setRoomName(roomId, name, callback) {
    return this.sendStateEvent(roomId, _event2.EventType.RoomName, {
      name: name
    }, undefined, callback);
  }
  /**
   * @param {string} roomId
   * @param {string} topic
   * @param {string} htmlTopic Optional.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setRoomTopic(roomId, topic, htmlTopicOrCallback) {
    const isCallback = typeof htmlTopicOrCallback === 'function';
    const htmlTopic = isCallback ? undefined : htmlTopicOrCallback;
    const callback = isCallback ? htmlTopicOrCallback : undefined;
    const content = ContentHelpers.makeTopicContent(topic, htmlTopic);
    return this.sendStateEvent(roomId, _event2.EventType.RoomTopic, content, undefined, callback);
  }
  /**
   * @param {string} roomId
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: to an object keyed by tagId with objects containing a numeric order field.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getRoomTags(roomId, callback) {
    const path = utils.encodeUri("/user/$userId/rooms/$roomId/tags", {
      $userId: this.credentials.userId,
      $roomId: roomId
    });
    return this.http.authedRequest(callback, _httpApi.Method.Get, path);
  }
  /**
   * @param {string} roomId
   * @param {string} tagName name of room tag to be set
   * @param {object} metadata associated with that tag to be stored
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: to an empty object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setRoomTag(roomId, tagName, metadata, callback) {
    const path = utils.encodeUri("/user/$userId/rooms/$roomId/tags/$tag", {
      $userId: this.credentials.userId,
      $roomId: roomId,
      $tag: tagName
    });
    return this.http.authedRequest(callback, _httpApi.Method.Put, path, undefined, metadata);
  }
  /**
   * @param {string} roomId
   * @param {string} tagName name of room tag to be removed
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: void
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  deleteRoomTag(roomId, tagName, callback) {
    const path = utils.encodeUri("/user/$userId/rooms/$roomId/tags/$tag", {
      $userId: this.credentials.userId,
      $roomId: roomId,
      $tag: tagName
    });
    return this.http.authedRequest(callback, _httpApi.Method.Delete, path);
  }
  /**
   * @param {string} roomId
   * @param {string} eventType event type to be set
   * @param {object} content event content
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setRoomAccountData(roomId, eventType, content, callback) {
    const path = utils.encodeUri("/user/$userId/rooms/$roomId/account_data/$type", {
      $userId: this.credentials.userId,
      $roomId: roomId,
      $type: eventType
    });
    return this.http.authedRequest(callback, _httpApi.Method.Put, path, undefined, content);
  }
  /**
   * Set a user's power level.
   * @param {string} roomId
   * @param {string} userId
   * @param {Number} powerLevel
   * @param {MatrixEvent} event
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: to an ISendEventResponse object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setPowerLevel(roomId, userId, powerLevel, event, callback) {
    let content = {
      users: {}
    };

    if (event?.getType() === _event2.EventType.RoomPowerLevels) {
      // take a copy of the content to ensure we don't corrupt
      // existing client state with a failed power level change
      content = utils.deepCopy(event.getContent());
    }

    content.users[userId] = powerLevel;
    const path = utils.encodeUri("/rooms/$roomId/state/m.room.power_levels", {
      $roomId: roomId
    });
    return this.http.authedRequest(callback, _httpApi.Method.Put, path, undefined, content);
  }
  /**
   * Create an m.beacon_info event
   * @param {string} roomId
   * @param {MBeaconInfoEventContent} beaconInfoContent
   * @returns {ISendEventResponse}
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention


  async unstable_createLiveBeacon(roomId, beaconInfoContent) {
    return this.unstable_setLiveBeacon(roomId, beaconInfoContent);
  }
  /**
   * Upsert a live beacon event
   * using a specific m.beacon_info.* event variable type
   * @param {string} roomId string
   * @param {MBeaconInfoEventContent} beaconInfoContent
   * @returns {ISendEventResponse}
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention


  async unstable_setLiveBeacon(roomId, beaconInfoContent) {
    const userId = this.getUserId();
    return this.sendStateEvent(roomId, _beacon.M_BEACON_INFO.name, beaconInfoContent, userId);
  }
  /**
   * @param {string} roomId
   * @param {string} threadId
   * @param {string} eventType
   * @param {Object} content
   * @param {string} txnId Optional.
   * @param {module:client.callback} callback Optional. Deprecated
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  sendEvent(roomId, threadId, eventType, content, txnId, callback) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      callback = txnId;
      txnId = content;
      content = eventType;
      eventType = threadId;
      threadId = null;
    } // If we expect that an event is part of a thread but is missing the relation
    // we need to add it manually, as well as the reply fallback


    if (threadId && !content["m.relates_to"]?.rel_type) {
      const isReply = !!content["m.relates_to"]?.["m.in_reply_to"];
      content["m.relates_to"] = _objectSpread(_objectSpread({}, content["m.relates_to"]), {}, {
        "rel_type": _thread.THREAD_RELATION_TYPE.name,
        "event_id": threadId,
        // Set is_falling_back to true unless this is actually intended to be a reply
        "is_falling_back": !isReply
      });
      const thread = this.getRoom(roomId)?.getThread(threadId);

      if (thread && !isReply) {
        content["m.relates_to"]["m.in_reply_to"] = {
          "event_id": thread.lastReply(ev => {
            return ev.isRelation(_thread.THREAD_RELATION_TYPE.name) && !ev.status;
          })?.getId() ?? threadId
        };
      }
    }

    return this.sendCompleteEvent(roomId, threadId, {
      type: eventType,
      content
    }, txnId, callback);
  }
  /**
   * @param {string} roomId
   * @param {string} threadId
   * @param {object} eventObject An object with the partial structure of an event, to which event_id, user_id, room_id and origin_server_ts will be added.
   * @param {string} txnId Optional.
   * @param {module:client.callback} callback Optional. Deprecated
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  sendCompleteEvent(roomId, threadId, eventObject, txnId, callback) {
    if (utils.isFunction(txnId)) {
      callback = txnId; // convert for legacy

      txnId = undefined;
    }

    if (!txnId) {
      txnId = this.makeTxnId();
    } // We always construct a MatrixEvent when sending because the store and scheduler use them.
    // We'll extract the params back out if it turns out the client has no scheduler or store.


    const localEvent = new _event.MatrixEvent(Object.assign(eventObject, {
      event_id: "~" + roomId + ":" + txnId,
      user_id: this.credentials.userId,
      sender: this.credentials.userId,
      room_id: roomId,
      origin_server_ts: new Date().getTime()
    }));
    const room = this.getRoom(roomId);
    const thread = room?.getThread(threadId);

    if (thread) {
      localEvent.setThread(thread);
    } // set up re-emitter for this new event - this is normally the job of EventMapper but we don't use it here


    this.reEmitter.reEmit(localEvent, [_event.MatrixEventEvent.Replaced, _event.MatrixEventEvent.VisibilityChange]);
    room?.reEmitter.reEmit(localEvent, [_event.MatrixEventEvent.BeforeRedaction]); // if this is a relation or redaction of an event
    // that hasn't been sent yet (e.g. with a local id starting with a ~)
    // then listen for the remote echo of that event so that by the time
    // this event does get sent, we have the correct event_id

    const targetId = localEvent.getAssociatedId();

    if (targetId?.startsWith("~")) {
      const target = room.getPendingEvents().find(e => e.getId() === targetId);
      target.once(_event.MatrixEventEvent.LocalEventIdReplaced, () => {
        localEvent.updateAssociatedId(target.getId());
      });
    }

    const type = localEvent.getType();

    _logger.logger.log(`sendEvent of type ${type} in ${roomId} with txnId ${txnId}`);

    localEvent.setTxnId(txnId);
    localEvent.setStatus(_event.EventStatus.SENDING); // add this event immediately to the local store as 'sending'.

    room?.addPendingEvent(localEvent, txnId); // addPendingEvent can change the state to NOT_SENT if it believes
    // that there's other events that have failed. We won't bother to
    // try sending the event if the state has changed as such.

    if (localEvent.status === _event.EventStatus.NOT_SENT) {
      return Promise.reject(new Error("Event blocked by other events not yet sent"));
    }

    return this.encryptAndSendEvent(room, localEvent, callback);
  }
  /**
   * encrypts the event if necessary; adds the event to the queue, or sends it; marks the event as sent/unsent
   * @param room
   * @param event
   * @param callback
   * @returns {Promise} returns a promise which resolves with the result of the send request
   * @private
   */


  encryptAndSendEvent(room, event, callback) {
    let cancelled = false; // Add an extra Promise.resolve() to turn synchronous exceptions into promise rejections,
    // so that we can handle synchronous and asynchronous exceptions with the
    // same code path.

    return Promise.resolve().then(() => {
      const encryptionPromise = this.encryptEventIfNeeded(event, room);
      if (!encryptionPromise) return null; // doesn't need encryption

      this.pendingEventEncryption.set(event.getId(), encryptionPromise);
      this.updatePendingEventStatus(room, event, _event.EventStatus.ENCRYPTING);
      return encryptionPromise.then(() => {
        if (!this.pendingEventEncryption.has(event.getId())) {
          // cancelled via MatrixClient::cancelPendingEvent
          cancelled = true;
          return;
        }

        this.updatePendingEventStatus(room, event, _event.EventStatus.SENDING);
      });
    }).then(() => {
      if (cancelled) return {};
      let promise;

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
            room.updatePendingEvent(event, _event.EventStatus.SENT, res['event_id']);
            return res;
          });
        }
      }

      return promise;
    }).then(res => {
      callback?.(null, res);
      return res;
    }).catch(err => {
      _logger.logger.error("Error sending event", err.stack || err);

      try {
        // set the error on the event before we update the status:
        // updating the status emits the event, so the state should be
        // consistent at that point.
        event.error = err;
        this.updatePendingEventStatus(room, event, _event.EventStatus.NOT_SENT); // also put the event object on the error: the caller will need this
        // to resend or cancel the event

        err.event = event;
        callback?.(err);
      } catch (e) {
        _logger.logger.error("Exception in error handler!", e.stack || err);
      }

      throw err;
    });
  }

  encryptEventIfNeeded(event, room) {
    if (event.isEncrypted()) {
      // this event has already been encrypted; this happens if the
      // encryption step succeeded, but the send step failed on the first
      // attempt.
      return null;
    }

    if (event.isRedaction()) {
      // Redactions do not support encryption in the spec at this time,
      // whilst it mostly worked in some clients, it wasn't compliant.
      return null;
    }

    if (!this.isRoomEncrypted(event.getRoomId())) {
      return null;
    }

    if (!this.crypto && this.usingExternalCrypto) {
      // The client has opted to allow sending messages to encrypted
      // rooms even if the room is encrypted, and we haven't setup
      // crypto. This is useful for users of matrix-org/pantalaimon
      return null;
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
      return null;
    }

    if (!this.crypto) {
      throw new Error("This room is configured to use encryption, but your client does " + "not support encryption.");
    }

    return this.crypto.encryptEvent(event, room);
  }
  /**
   * Returns the eventType that should be used taking encryption into account
   * for a given eventType.
   * @param {string} roomId the room for the events `eventType` relates to
   * @param {string} eventType the event type
   * @return {string} the event type taking encryption into account
   */


  getEncryptedIfNeededEventType(roomId, eventType) {
    if (eventType === _event2.EventType.Reaction) return eventType;
    return this.isRoomEncrypted(roomId) ? _event2.EventType.RoomMessageEncrypted : eventType;
  }

  updatePendingEventStatus(room, event, newStatus) {
    if (room) {
      room.updatePendingEvent(event, newStatus);
    } else {
      event.setStatus(newStatus);
    }
  }

  sendEventHttpRequest(event) {
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
    } else if (event.isRedaction()) {
      const pathTemplate = `/rooms/$roomId/redact/$redactsEventId/$txnId`;
      path = utils.encodeUri(pathTemplate, Object.assign({
        $redactsEventId: event.event.redacts
      }, pathParams));
    } else {
      path = utils.encodeUri("/rooms/$roomId/send/$eventType/$txnId", pathParams);
    }

    return this.http.authedRequest(undefined, _httpApi.Method.Put, path, undefined, event.getWireContent()).then(res => {
      _logger.logger.log(`Event sent to ${event.getRoomId()} with event id ${res.event_id}`);

      return res;
    });
  }
  /**
   * @param {string} roomId
   * @param {string} eventId
   * @param {string} [txnId]  transaction id. One will be made up if not
   *    supplied.
   * @param {object|module:client.callback} cbOrOpts
   *    Options to pass on, may contain `reason`.
   *    Can be callback for backwards compatibility. Deprecated
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  redactEvent(roomId, threadId, eventId, txnId, cbOrOpts) {
    if (!eventId?.startsWith(EVENT_ID_PREFIX)) {
      cbOrOpts = txnId;
      txnId = eventId;
      eventId = threadId;
      threadId = null;
    }

    const opts = typeof cbOrOpts === 'object' ? cbOrOpts : {};
    const reason = opts.reason;
    const callback = typeof cbOrOpts === 'function' ? cbOrOpts : undefined;
    return this.sendCompleteEvent(roomId, threadId, {
      type: _event2.EventType.RoomRedaction,
      content: {
        reason
      },
      redacts: eventId
    }, txnId, callback);
  }
  /**
   * @param {string} roomId
   * @param {string} threadId
   * @param {Object} content
   * @param {string} txnId Optional.
   * @param {module:client.callback} callback Optional. Deprecated
   * @return {Promise} Resolves: to an ISendEventResponse object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  sendMessage(roomId, threadId, content, txnId, callback) {
    if (typeof threadId !== "string" && threadId !== null) {
      callback = txnId;
      txnId = content;
      content = threadId;
      threadId = null;
    }

    if (utils.isFunction(txnId)) {
      callback = txnId; // for legacy

      txnId = undefined;
    } // Populate all outbound events with Extensible Events metadata to ensure there's a
    // reasonably large pool of messages to parse.


    let eventType = _event2.EventType.RoomMessage;
    let sendContent = content;

    const makeContentExtensible = (content = {}, recurse = true) => {
      let newEvent = null;

      if (content['msgtype'] === _event2.MsgType.Text) {
        newEvent = _matrixEventsSdk.MessageEvent.from(content['body'], content['formatted_body']).serialize();
      } else if (content['msgtype'] === _event2.MsgType.Emote) {
        newEvent = _matrixEventsSdk.EmoteEvent.from(content['body'], content['formatted_body']).serialize();
      } else if (content['msgtype'] === _event2.MsgType.Notice) {
        newEvent = _matrixEventsSdk.NoticeEvent.from(content['body'], content['formatted_body']).serialize();
      }

      if (newEvent && content['m.new_content'] && recurse) {
        const newContent = makeContentExtensible(content['m.new_content'], false);

        if (newContent) {
          newEvent.content['m.new_content'] = newContent.content;
        }
      }

      if (newEvent) {
        // copy over all other fields we don't know about
        for (const [k, v] of Object.entries(content)) {
          if (!newEvent.content.hasOwnProperty(k)) {
            newEvent.content[k] = v;
          }
        }
      }

      return newEvent;
    };

    const result = makeContentExtensible(sendContent);

    if (result) {
      eventType = result.type;
      sendContent = result.content;
    }

    return this.sendEvent(roomId, threadId, eventType, sendContent, txnId, callback);
  }
  /**
   * @param {string} roomId
   * @param {string} threadId
   * @param {string} body
   * @param {string} txnId Optional.
   * @param {module:client.callback} callback Optional. Deprecated
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  sendTextMessage(roomId, threadId, body, txnId, callback) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      callback = txnId;
      txnId = body;
      body = threadId;
      threadId = null;
    }

    const content = ContentHelpers.makeTextMessage(body);
    return this.sendMessage(roomId, threadId, content, txnId, callback);
  }
  /**
   * @param {string} roomId
   * @param {string} threadId
   * @param {string} body
   * @param {string} txnId Optional.
   * @param {module:client.callback} callback Optional. Deprecated
   * @return {Promise} Resolves: to a ISendEventResponse object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  sendNotice(roomId, threadId, body, txnId, callback) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      callback = txnId;
      txnId = body;
      body = threadId;
      threadId = null;
    }

    const content = ContentHelpers.makeNotice(body);
    return this.sendMessage(roomId, threadId, content, txnId, callback);
  }
  /**
   * @param {string} roomId
   * @param {string} threadId
   * @param {string} body
   * @param {string} txnId Optional.
   * @param {module:client.callback} callback Optional. Deprecated
   * @return {Promise} Resolves: to a ISendEventResponse object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  sendEmoteMessage(roomId, threadId, body, txnId, callback) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      callback = txnId;
      txnId = body;
      body = threadId;
      threadId = null;
    }

    const content = ContentHelpers.makeEmoteMessage(body);
    return this.sendMessage(roomId, threadId, content, txnId, callback);
  }
  /**
   * @param {string} roomId
   * @param {string} threadId
   * @param {string} url
   * @param {Object} info
   * @param {string} text
   * @param {module:client.callback} callback Optional. Deprecated
   * @return {Promise} Resolves: to a ISendEventResponse object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  sendImageMessage(roomId, threadId, url, info, text = "Image", callback) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      callback = text;
      text = info || "Image";
      info = url;
      url = threadId;
      threadId = null;
    }

    if (utils.isFunction(text)) {
      callback = text; // legacy

      text = undefined;
    }

    const content = {
      msgtype: _event2.MsgType.Image,
      url: url,
      info: info,
      body: text
    };
    return this.sendMessage(roomId, threadId, content, undefined, callback);
  }
  /**
   * @param {string} roomId
   * @param {string} threadId
   * @param {string} url
   * @param {Object} info
   * @param {string} text
   * @param {module:client.callback} callback Optional. Deprecated
   * @return {Promise} Resolves: to a ISendEventResponse object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  sendStickerMessage(roomId, threadId, url, info, text = "Sticker", callback) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      callback = text;
      text = info || "Sticker";
      info = url;
      url = threadId;
      threadId = null;
    }

    if (utils.isFunction(text)) {
      callback = text; // legacy

      text = undefined;
    }

    const content = {
      url: url,
      info: info,
      body: text
    };
    return this.sendEvent(roomId, threadId, _event2.EventType.Sticker, content, undefined, callback);
  }
  /**
   * @param {string} roomId
   * @param {string} threadId
   * @param {string} body
   * @param {string} htmlBody
   * @param {module:client.callback} callback Optional. Deprecated
   * @return {Promise} Resolves: to a ISendEventResponse object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  sendHtmlMessage(roomId, threadId, body, htmlBody, callback) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      callback = htmlBody;
      htmlBody = body;
      body = threadId;
      threadId = null;
    }

    const content = ContentHelpers.makeHtmlMessage(body, htmlBody);
    return this.sendMessage(roomId, threadId, content, undefined, callback);
  }
  /**
   * @param {string} roomId
   * @param {string} body
   * @param {string} htmlBody
   * @param {module:client.callback} callback Optional. Deprecated
   * @return {Promise} Resolves: to a ISendEventResponse object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  sendHtmlNotice(roomId, threadId, body, htmlBody, callback) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      callback = htmlBody;
      htmlBody = body;
      body = threadId;
      threadId = null;
    }

    const content = ContentHelpers.makeHtmlNotice(body, htmlBody);
    return this.sendMessage(roomId, threadId, content, undefined, callback);
  }
  /**
   * @param {string} roomId
   * @param {string} threadId
   * @param {string} body
   * @param {string} htmlBody
   * @param {module:client.callback} callback Optional. Deprecated
   * @return {Promise} Resolves: to a ISendEventResponse object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  sendHtmlEmote(roomId, threadId, body, htmlBody, callback) {
    if (!threadId?.startsWith(EVENT_ID_PREFIX) && threadId !== null) {
      callback = htmlBody;
      htmlBody = body;
      body = threadId;
      threadId = null;
    }

    const content = ContentHelpers.makeHtmlEmote(body, htmlBody);
    return this.sendMessage(roomId, threadId, content, undefined, callback);
  }
  /**
   * Send a receipt.
   * @param {Event} event The event being acknowledged
   * @param {ReceiptType} receiptType The kind of receipt e.g. "m.read". Other than
   * ReceiptType.Read are experimental!
   * @param {object} body Additional content to send alongside the receipt.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  sendReceipt(event, receiptType, body, callback) {
    if (typeof body === 'function') {
      callback = body; // legacy

      body = {};
    }

    if (this.isGuest()) {
      return Promise.resolve({}); // guests cannot send receipts so don't bother.
    }

    const path = utils.encodeUri("/rooms/$roomId/receipt/$receiptType/$eventId", {
      $roomId: event.getRoomId(),
      $receiptType: receiptType,
      $eventId: event.getId()
    });
    const promise = this.http.authedRequest(callback, _httpApi.Method.Post, path, undefined, body || {});
    const room = this.getRoom(event.getRoomId());

    if (room) {
      room.addLocalEchoReceipt(this.credentials.userId, event, receiptType);
    }

    return promise;
  }
  /**
   * Send a read receipt.
   * @param {Event} event The event that has been read.
   * @param {ReceiptType} receiptType other than ReceiptType.Read are experimental! Optional.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  async sendReadReceipt(event, receiptType = _read_receipts.ReceiptType.Read, callback) {
    const eventId = event.getId();
    const room = this.getRoom(event.getRoomId());

    if (room && room.hasPendingEvent(eventId)) {
      throw new Error(`Cannot set read receipt to a pending event (${eventId})`);
    }

    return this.sendReceipt(event, receiptType, {}, callback);
  }
  /**
   * Set a marker to indicate the point in a room before which the user has read every
   * event. This can be retrieved from room account data (the event type is `m.fully_read`)
   * and displayed as a horizontal line in the timeline that is visually distinct to the
   * position of the user's own read receipt.
   * @param {string} roomId ID of the room that has been read
   * @param {string} rmEventId ID of the event that has been read
   * @param {MatrixEvent} rrEvent the event tracked by the read receipt. This is here for
   * convenience because the RR and the RM are commonly updated at the same time as each
   * other. The local echo of this receipt will be done if set. Optional.
   * @param {MatrixEvent} rpEvent the m.read.private read receipt event for when we don't
   * want other users to see the read receipts. This is experimental. Optional.
   * @return {Promise} Resolves: the empty object, {}.
   */


  async setRoomReadMarkers(roomId, rmEventId, rrEvent, rpEvent) {
    const room = this.getRoom(roomId);

    if (room && room.hasPendingEvent(rmEventId)) {
      throw new Error(`Cannot set read marker to a pending event (${rmEventId})`);
    } // Add the optional RR update, do local echo like `sendReceipt`


    let rrEventId;

    if (rrEvent) {
      rrEventId = rrEvent.getId();

      if (room?.hasPendingEvent(rrEventId)) {
        throw new Error(`Cannot set read receipt to a pending event (${rrEventId})`);
      }

      room?.addLocalEchoReceipt(this.credentials.userId, rrEvent, _read_receipts.ReceiptType.Read);
    } // Add the optional private RR update, do local echo like `sendReceipt`


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
   * @param {string} url The URL to get preview data for
   * @param {Number} ts The preferred point in time that the preview should
   * describe (ms since epoch).  The preview returned will either be the most
   * recent one preceding this timestamp if available, or failing that the next
   * most recent available preview.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: Object of OG metadata.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   * May return synthesized attributes if the URL lacked OG meta.
   */


  getUrlPreview(url, ts, callback) {
    // bucket the timestamp to the nearest minute to prevent excessive spam to the server
    // Surely 60-second accuracy is enough for anyone.
    ts = Math.floor(ts / 60000) * 60000;
    const parsed = new URL(url);
    parsed.hash = ""; // strip the hash as it won't affect the preview

    url = parsed.toString();
    const key = ts + "_" + url; // If there's already a request in flight (or we've handled it), return that instead.

    const cachedPreview = this.urlPreviewCache[key];

    if (cachedPreview) {
      if (callback) {
        cachedPreview.then(callback).catch(callback);
      }

      return cachedPreview;
    }

    const resp = this.http.authedRequest(callback, _httpApi.Method.Get, "/preview_url", {
      url,
      ts: ts.toString()
    }, undefined, {
      prefix: _httpApi.PREFIX_MEDIA_R0
    }); // TODO: Expire the URL preview cache sometimes

    this.urlPreviewCache[key] = resp;
    return resp;
  }
  /**
   * @param {string} roomId
   * @param {boolean} isTyping
   * @param {Number} timeoutMs
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  sendTyping(roomId, isTyping, timeoutMs, callback) {
    if (this.isGuest()) {
      return Promise.resolve({}); // guests cannot send typing notifications so don't bother.
    }

    const path = utils.encodeUri("/rooms/$roomId/typing/$userId", {
      $roomId: roomId,
      $userId: this.credentials.userId
    });
    const data = {
      typing: isTyping
    };

    if (isTyping) {
      data.timeout = timeoutMs ? timeoutMs : 20000;
    }

    return this.http.authedRequest(callback, _httpApi.Method.Put, path, undefined, data);
  }
  /**
   * Determines the history of room upgrades for a given room, as far as the
   * client can see. Returns an array of Rooms where the first entry is the
   * oldest and the last entry is the newest (likely current) room. If the
   * provided room is not found, this returns an empty list. This works in
   * both directions, looking for older and newer rooms of the given room.
   * @param {string} roomId The room ID to search from
   * @param {boolean} verifyLinks If true, the function will only return rooms
   * which can be proven to be linked. For example, rooms which have a create
   * event pointing to an old room which the client is not aware of or doesn't
   * have a matching tombstone would not be returned.
   * @return {Room[]} An array of rooms representing the upgrade
   * history.
   */


  getRoomUpgradeHistory(roomId, verifyLinks = false) {
    let currentRoom = this.getRoom(roomId);
    if (!currentRoom) return [];
    const upgradeHistory = [currentRoom]; // Work backwards first, looking at create events.

    let createEvent = currentRoom.currentState.getStateEvents(_event2.EventType.RoomCreate, "");

    while (createEvent) {
      const predecessor = createEvent.getContent()['predecessor'];

      if (predecessor && predecessor['room_id']) {
        const refRoom = this.getRoom(predecessor['room_id']);
        if (!refRoom) break; // end of the chain

        if (verifyLinks) {
          const tombstone = refRoom.currentState.getStateEvents(_event2.EventType.RoomTombstone, "");

          if (!tombstone || tombstone.getContent()['replacement_room'] !== refRoom.roomId) {
            break;
          }
        } // Insert at the front because we're working backwards from the currentRoom


        upgradeHistory.splice(0, 0, refRoom);
        createEvent = refRoom.currentState.getStateEvents(_event2.EventType.RoomCreate, "");
      } else {
        // No further create events to look at
        break;
      }
    } // Work forwards next, looking at tombstone events


    let tombstoneEvent = currentRoom.currentState.getStateEvents(_event2.EventType.RoomTombstone, "");

    while (tombstoneEvent) {
      const refRoom = this.getRoom(tombstoneEvent.getContent()['replacement_room']);
      if (!refRoom) break; // end of the chain

      if (refRoom.roomId === currentRoom.roomId) break; // Tombstone is referencing it's own room

      if (verifyLinks) {
        createEvent = refRoom.currentState.getStateEvents(_event2.EventType.RoomCreate, "");
        if (!createEvent || !createEvent.getContent()['predecessor']) break;
        const predecessor = createEvent.getContent()['predecessor'];
        if (predecessor['room_id'] !== currentRoom.roomId) break;
      } // Push to the end because we're looking forwards


      upgradeHistory.push(refRoom);
      const roomIds = new Set(upgradeHistory.map(ref => ref.roomId));

      if (roomIds.size < upgradeHistory.length) {
        // The last room added to the list introduced a previous roomId
        // To avoid recursion, return the last rooms - 1
        return upgradeHistory.slice(0, upgradeHistory.length - 1);
      } // Set the current room to the reference room so we know where we're at


      currentRoom = refRoom;
      tombstoneEvent = currentRoom.currentState.getStateEvents(_event2.EventType.RoomTombstone, "");
    }

    return upgradeHistory;
  }
  /**
   * @param {string} roomId
   * @param {string} userId
   * @param {module:client.callback} callback Optional.
   * @param {string} reason Optional.
   * @return {Promise} Resolves: {} an empty object.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  invite(roomId, userId, callback, reason) {
    return this.membershipChange(roomId, userId, "invite", reason, callback);
  }
  /**
   * Invite a user to a room based on their email address.
   * @param {string} roomId The room to invite the user to.
   * @param {string} email The email address to invite.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: {} an empty object.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  inviteByEmail(roomId, email, callback) {
    return this.inviteByThreePid(roomId, "email", email, callback);
  }
  /**
   * Invite a user to a room based on a third-party identifier.
   * @param {string} roomId The room to invite the user to.
   * @param {string} medium The medium to invite the user e.g. "email".
   * @param {string} address The address for the specified medium.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: {} an empty object.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  async inviteByThreePid(roomId, medium, address, callback) {
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

    if (this.identityServer?.getAccessToken && (await this.doesServerAcceptIdentityAccessToken())) {
      const identityAccessToken = await this.identityServer.getAccessToken();

      if (identityAccessToken) {
        params['id_access_token'] = identityAccessToken;
      }
    }

    return this.http.authedRequest(callback, _httpApi.Method.Post, path, undefined, params);
  }
  /**
   * @param {string} roomId
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: {} an empty object.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  leave(roomId, callback) {
    return this.membershipChange(roomId, undefined, "leave", undefined, callback);
  }
  /**
   * Leaves all rooms in the chain of room upgrades based on the given room. By
   * default, this will leave all the previous and upgraded rooms, including the
   * given room. To only leave the given room and any previous rooms, keeping the
   * upgraded (modern) rooms untouched supply `false` to `includeFuture`.
   * @param {string} roomId The room ID to start leaving at
   * @param {boolean} includeFuture If true, the whole chain (past and future) of
   * upgraded rooms will be left.
   * @return {Promise} Resolves when completed with an object keyed
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
        populationResults[roomId] = null;
      }).catch(err => {
        populationResults[roomId] = err;
        return null; // suppress error
      });
    };

    for (const room of eligibleToLeave) {
      promises.push(doLeave(room.roomId));
    }

    return Promise.all(promises).then(() => populationResults);
  }
  /**
   * @param {string} roomId
   * @param {string} userId
   * @param {string} reason Optional.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  ban(roomId, userId, reason, callback) {
    return this.membershipChange(roomId, userId, "ban", reason, callback);
  }
  /**
   * @param {string} roomId
   * @param {boolean} deleteRoom True to delete the room from the store on success.
   * Default: true.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: {} an empty object.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  forget(roomId, deleteRoom, callback) {
    if (deleteRoom === undefined) {
      deleteRoom = true;
    }

    const promise = this.membershipChange(roomId, undefined, "forget", undefined, callback);

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
   * @param {string} roomId
   * @param {string} userId
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: Object (currently empty)
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  unban(roomId, userId, callback) {
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
    return this.http.authedRequest(callback, _httpApi.Method.Post, path, undefined, data);
  }
  /**
   * @param {string} roomId
   * @param {string} userId
   * @param {string} reason Optional.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: {} an empty object.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  kick(roomId, userId, reason, callback) {
    const path = utils.encodeUri("/rooms/$roomId/kick", {
      $roomId: roomId
    });
    const data = {
      user_id: userId,
      reason: reason
    };
    return this.http.authedRequest(callback, _httpApi.Method.Post, path, undefined, data);
  }

  membershipChange(roomId, userId, membership, reason, callback) {
    // API returns an empty object
    if (utils.isFunction(reason)) {
      callback = reason; // legacy

      reason = undefined;
    }

    const path = utils.encodeUri("/rooms/$room_id/$membership", {
      $room_id: roomId,
      $membership: membership
    });
    return this.http.authedRequest(callback, _httpApi.Method.Post, path, undefined, {
      user_id: userId,
      // may be undefined e.g. on leave
      reason: reason
    });
  }
  /**
   * Obtain a dict of actions which should be performed for this event according
   * to the push rules for this user.  Caches the dict on the event.
   * @param {MatrixEvent} event The event to get push actions for.
   * @param {boolean} forceRecalculate forces to recalculate actions for an event
   * Useful when an event just got decrypted
   * @return {module:pushprocessor~PushAction} A dict of actions to perform.
   */


  getPushActionsForEvent(event, forceRecalculate = false) {
    if (!event.getPushActions() || forceRecalculate) {
      event.setPushActions(this.pushProcessor.actionsForEvent(event));
    }

    return event.getPushActions();
  }
  /**
   * @param {string} info The kind of info to set (e.g. 'avatar_url')
   * @param {Object} data The JSON object to set.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */
  // eslint-disable-next-line camelcase


  setProfileInfo(info, data, callback) {
    const path = utils.encodeUri("/profile/$userId/$info", {
      $userId: this.credentials.userId,
      $info: info
    });
    return this.http.authedRequest(callback, _httpApi.Method.Put, path, undefined, data);
  }
  /**
   * @param {string} name
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: {} an empty object.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  async setDisplayName(name, callback) {
    const prom = await this.setProfileInfo("displayname", {
      displayname: name
    }, callback); // XXX: synthesise a profile update for ourselves because Synapse is broken and won't

    const user = this.getUser(this.getUserId());

    if (user) {
      user.displayName = name;
      user.emit(_user.UserEvent.DisplayName, user.events.presence, user);
    }

    return prom;
  }
  /**
   * @param {string} url
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: {} an empty object.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  async setAvatarUrl(url, callback) {
    const prom = await this.setProfileInfo("avatar_url", {
      avatar_url: url
    }, callback); // XXX: synthesise a profile update for ourselves because Synapse is broken and won't

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
   * @param {string} mxcUrl The MXC URL
   * @param {Number} width The desired width of the thumbnail.
   * @param {Number} height The desired height of the thumbnail.
   * @param {string} resizeMethod The thumbnail resize method to use, either
   * "crop" or "scale".
   * @param {Boolean} allowDirectLinks If true, return any non-mxc URLs
   * directly. Fetching such URLs will leak information about the user to
   * anyone they share a room with. If false, will return null for such URLs.
   * @return {?string} the avatar URL or null.
   */


  mxcUrlToHttp(mxcUrl, width, height, resizeMethod, allowDirectLinks) {
    return (0, _contentRepo.getHttpUriForMxc)(this.baseUrl, mxcUrl, width, height, resizeMethod, allowDirectLinks);
  }
  /**
   * @param {Object} opts Options to apply
   * @param {string} opts.presence One of "online", "offline" or "unavailable"
   * @param {string} opts.status_msg The status message to attach.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   * @throws If 'presence' isn't a valid presence enum value.
   */


  setPresence(opts, callback) {
    const path = utils.encodeUri("/presence/$userId/status", {
      $userId: this.credentials.userId
    });

    if (typeof opts === "string") {
      opts = {
        presence: opts
      }; // legacy
    }

    const validStates = ["offline", "online", "unavailable"];

    if (validStates.indexOf(opts.presence) === -1) {
      throw new Error("Bad presence value: " + opts.presence);
    }

    return this.http.authedRequest(callback, _httpApi.Method.Put, path, undefined, opts);
  }
  /**
   * @param {string} userId The user to get presence for
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: The presence state for this user.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getPresence(userId, callback) {
    const path = utils.encodeUri("/presence/$userId/status", {
      $userId: userId
    });
    return this.http.authedRequest(callback, _httpApi.Method.Get, path);
  }
  /**
   * Retrieve older messages from the given room and put them in the timeline.
   *
   * If this is called multiple times whilst a request is ongoing, the <i>same</i>
   * Promise will be returned. If there was a problem requesting scrollback, there
   * will be a small delay before another request can be made (to prevent tight-looping
   * when there is no connection).
   *
   * @param {Room} room The room to get older messages in.
   * @param {number} limit Optional. The maximum number of previous events to
   * pull in. Default: 30.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: Room. If you are at the beginning
   * of the timeline, <code>Room.oldState.paginationToken</code> will be
   * <code>null</code>.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  scrollback(room, limit = 30, callback) {
    if (utils.isFunction(limit)) {
      callback = limit; // legacy

      limit = undefined;
    }

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
    } // attempt to grab more events from the store first


    const numAdded = this.store.scrollback(room, limit).length;

    if (numAdded === limit) {
      // store contained everything we needed.
      return Promise.resolve(room);
    } // reduce the required number of events appropriately


    limit = limit - numAdded;
    const prom = new Promise((resolve, reject) => {
      // wait for a time before doing this request
      // (which may be 0 in order not to special case the code paths)
      (0, utils.sleep)(timeToWaitMs).then(() => {
        return this.createMessagesRequest(room.roomId, room.oldState.paginationToken, limit, _eventTimeline.Direction.Backward);
      }).then(res => {
        const matrixEvents = res.chunk.map(this.getEventMapper());

        if (res.state) {
          const stateEvents = res.state.map(this.getEventMapper());
          room.currentState.setUnknownStateEvents(stateEvents);
        }

        const [timelineEvents, threadedEvents] = room.partitionThreadedEvents(matrixEvents);
        this.processBeaconEvents(room, timelineEvents);
        room.addEventsToTimeline(timelineEvents, true, room.getLiveTimeline());
        this.processThreadEvents(room, threadedEvents, true);
        room.oldState.paginationToken = res.end;

        if (res.chunk.length === 0) {
          room.oldState.paginationToken = null;
        }

        this.store.storeEvents(room, matrixEvents, res.end, true);
        this.ongoingScrollbacks[room.roomId] = null;
        callback?.(null, room);
        resolve(room);
      }).catch(err => {
        this.ongoingScrollbacks[room.roomId] = {
          errorTs: Date.now()
        };
        callback?.(err);
        reject(err);
      });
    });
    info = {
      promise: prom,
      errorTs: null
    };
    this.ongoingScrollbacks[room.roomId] = info;
    return prom;
  }
  /**
   * @param {object} [options]
   * @param {boolean} options.preventReEmit don't re-emit events emitted on an event mapped by this mapper on the client
   * @param {boolean} options.decrypt decrypt event proactively
   * @param {boolean} options.toDevice the event is a to_device event
   * @return {Function}
   */


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
   * @param {EventTimelineSet} timelineSet  The timelineSet to look for the event in, must be bound to a room
   * @param {string} eventId  The ID of the event to look for
   *
   * @return {Promise} Resolves:
   *    {@link module:models/event-timeline~EventTimeline} including the given event
   */


  async getEventTimeline(timelineSet, eventId) {
    // don't allow any timeline support unless it's been enabled.
    if (!this.timelineSupport) {
      throw new Error("timeline support is disabled. Set the 'timelineSupport'" + " parameter to true when creating MatrixClient to enable it.");
    }

    if (timelineSet.getTimelineForEvent(eventId)) {
      return timelineSet.getTimelineForEvent(eventId);
    }

    const path = utils.encodeUri("/rooms/$roomId/context/$eventId", {
      $roomId: timelineSet.room.roomId,
      $eventId: eventId
    });
    let params = undefined;

    if (this.clientOpts.lazyLoadMembers) {
      params = {
        filter: JSON.stringify(_filter.Filter.LAZY_LOADING_MESSAGES_FILTER)
      };
    } // TODO: we should implement a backoff (as per scrollback()) to deal more nicely with HTTP errors.


    const res = await this.http.authedRequest(undefined, _httpApi.Method.Get, path, params);

    if (!res.event) {
      throw new Error("'event' not in '/context' result - homeserver too old?");
    } // by the time the request completes, the event might have ended up in the timeline.


    if (timelineSet.getTimelineForEvent(eventId)) {
      return timelineSet.getTimelineForEvent(eventId);
    }

    const mapper = this.getEventMapper();
    const event = mapper(res.event);
    const events = [// Order events from most recent to oldest (reverse-chronological).
    // We start with the last event, since that's the point at which we have known state.
    // events_after is already backwards; events_before is forwards.
    ...res.events_after.reverse().map(mapper), event, ...res.events_before.map(mapper)];

    if (this.supportsExperimentalThreads()) {
      if (!timelineSet.canContain(event)) {
        return undefined;
      } // Where the event is a thread reply (not a root) and running in MSC-enabled mode the Thread timeline only
      // functions contiguously, so we have to jump through some hoops to get our target event in it.
      // XXX: workaround for https://github.com/vector-im/element-meta/issues/150


      if (_thread.Thread.hasServerSideSupport && timelineSet.thread) {
        const thread = timelineSet.thread;
        const opts = {
          direction: _eventTimeline.Direction.Backward,
          limit: 50
        };
        await thread.fetchInitialEvents();
        let nextBatch = thread.liveTimeline.getPaginationToken(_eventTimeline.Direction.Backward); // Fetch events until we find the one we were asked for, or we run out of pages

        while (!thread.findEventById(eventId)) {
          if (nextBatch) {
            opts.from = nextBatch;
          }

          ({
            nextBatch
          } = await thread.fetchEvents(opts));
          if (!nextBatch) break;
        }

        return thread.liveTimeline;
      }
    } // Here we handle non-thread timelines only, but still process any thread events to populate thread summaries.


    let timeline = timelineSet.getTimelineForEvent(events[0].getId());

    if (timeline) {
      timeline.getState(_eventTimeline.EventTimeline.BACKWARDS).setUnknownStateEvents(res.state.map(mapper));
    } else {
      timeline = timelineSet.addTimeline();
      timeline.initialiseState(res.state.map(mapper));
      timeline.getState(_eventTimeline.EventTimeline.FORWARDS).paginationToken = res.end;
    }

    const [timelineEvents, threadedEvents] = timelineSet.room.partitionThreadedEvents(events);
    timelineSet.addEventsToTimeline(timelineEvents, true, timeline, res.start); // The target event is not in a thread but process the contextual events, so we can show any threads around it.

    this.processThreadEvents(timelineSet.room, threadedEvents, true);
    this.processBeaconEvents(timelineSet.room, timelineEvents); // There is no guarantee that the event ended up in "timeline" (we might have switched to a neighbouring
    // timeline) - so check the room's index again. On the other hand, there's no guarantee the event ended up
    // anywhere, if it was later redacted, so we just return the timeline we first thought of.

    return timelineSet.getTimelineForEvent(eventId) ?? timelineSet.room.findThreadForEvent(event)?.liveTimeline // for Threads degraded support
    ?? timeline;
  }
  /**
   * Get an EventTimeline for the latest events in the room. This will just
   * call `/messages` to get the latest message in the room, then use
   * `client.getEventTimeline(...)` to construct a new timeline from it.
   *
   * @param {EventTimelineSet} timelineSet  The timelineSet to find or add the timeline to
   *
   * @return {Promise} Resolves:
   *    {@link module:models/event-timeline~EventTimeline} timeline with the latest events in the room
   */


  async getLatestTimeline(timelineSet) {
    // don't allow any timeline support unless it's been enabled.
    if (!this.timelineSupport) {
      throw new Error("timeline support is disabled. Set the 'timelineSupport'" + " parameter to true when creating MatrixClient to enable it.");
    }

    const messagesPath = utils.encodeUri("/rooms/$roomId/messages", {
      $roomId: timelineSet.room.roomId
    });
    const params = {
      dir: 'b'
    };

    if (this.clientOpts.lazyLoadMembers) {
      params.filter = JSON.stringify(_filter.Filter.LAZY_LOADING_MESSAGES_FILTER);
    }

    const res = await this.http.authedRequest(undefined, _httpApi.Method.Get, messagesPath, params);
    const event = res.chunk?.[0];

    if (!event) {
      throw new Error("No message returned from /messages when trying to construct getLatestTimeline");
    }

    return this.getEventTimeline(timelineSet, event.event_id);
  }
  /**
   * Makes a request to /messages with the appropriate lazy loading filter set.
   * XXX: if we do get rid of scrollback (as it's not used at the moment),
   * we could inline this method again in paginateEventTimeline as that would
   * then be the only call-site
   * @param {string} roomId
   * @param {string} fromToken
   * @param {number} limit the maximum amount of events the retrieve
   * @param {string} dir 'f' or 'b'
   * @param {Filter} timelineFilter the timeline filter to pass
   * @return {Promise}
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

    if (this.clientOpts.lazyLoadMembers) {
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

    return this.http.authedRequest(undefined, _httpApi.Method.Get, path, params);
  }
  /**
   * Take an EventTimeline, and back/forward-fill results.
   *
   * @param {module:models/event-timeline~EventTimeline} eventTimeline timeline
   *    object to be updated
   * @param {Object}   [opts]
   * @param {boolean}     [opts.backwards = false]  true to fill backwards,
   *    false to go forwards
   * @param {number}   [opts.limit = 30]         number of events to request
   *
   * @return {Promise} Resolves to a boolean: false if there are no
   *    events and we reached either end of the timeline; else true.
   */


  paginateEventTimeline(eventTimeline, opts) {
    const isNotifTimeline = eventTimeline.getTimelineSet() === this.notifTimelineSet; // TODO: we should implement a backoff (as per scrollback()) to deal more
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
        only: 'highlight'
      };

      if (token !== "end") {
        params.from = token;
      }

      promise = this.http.authedRequest(undefined, _httpApi.Method.Get, path, params).then(async res => {
        const token = res.next_token;
        const matrixEvents = [];

        for (let i = 0; i < res.notifications.length; i++) {
          const notification = res.notifications[i];
          const event = this.getEventMapper()(notification.event);
          event.setPushActions(_pushprocessor.PushProcessor.actionListToActionsObject(notification.actions));
          event.event.room_id = notification.room_id; // XXX: gutwrenching

          matrixEvents[i] = event;
        } // No need to partition events for threads here, everything lives
        // in the notification timeline set


        const timelineSet = eventTimeline.getTimelineSet();
        timelineSet.addEventsToTimeline(matrixEvents, backwards, eventTimeline, token);
        this.processBeaconEvents(timelineSet.room, matrixEvents); // if we've hit the end of the timeline, we need to stop trying to
        // paginate. We need to keep the 'forwards' token though, to make sure
        // we can recover from gappy syncs.

        if (backwards && !res.next_token) {
          eventTimeline.setPaginationToken(null, dir);
        }

        return res.next_token ? true : false;
      }).finally(() => {
        eventTimeline.paginationRequests[dir] = null;
      });
      eventTimeline.paginationRequests[dir] = promise;
    } else {
      const room = this.getRoom(eventTimeline.getRoomId());

      if (!room) {
        throw new Error("Unknown room " + eventTimeline.getRoomId());
      }

      promise = this.createMessagesRequest(eventTimeline.getRoomId(), token, opts.limit, dir, eventTimeline.getFilter()).then(res => {
        if (res.state) {
          const roomState = eventTimeline.getState(dir);
          const stateEvents = res.state.map(this.getEventMapper());
          roomState.setUnknownStateEvents(stateEvents);
        }

        const token = res.end;
        const matrixEvents = res.chunk.map(this.getEventMapper());
        const timelineSet = eventTimeline.getTimelineSet();
        const [timelineEvents, threadedEvents] = timelineSet.room.partitionThreadedEvents(matrixEvents);
        timelineSet.addEventsToTimeline(timelineEvents, backwards, eventTimeline, token);
        this.processBeaconEvents(timelineSet.room, timelineEvents);
        this.processThreadEvents(room, threadedEvents, backwards); // if we've hit the end of the timeline, we need to stop trying to
        // paginate. We need to keep the 'forwards' token though, to make sure
        // we can recover from gappy syncs.

        if (backwards && res.end == res.start) {
          eventTimeline.setPaginationToken(null, dir);
        }

        return res.end != res.start;
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
    } // FIXME: This thing is a total hack, and results in duplicate events being
    // added to the timeline both from /sync and /notifications, and lots of
    // slow and wasteful processing and pagination.  The correct solution is to
    // extend /messages or /search or something to filter on notifications.
    // use the fictitious token 'end'. in practice we would ideally give it
    // the oldest backwards pagination token from /sync, but /sync doesn't
    // know about /notifications, so we have no choice but to start paginating
    // from the current point in time.  This may well overlap with historical
    // notifs which are then inserted into the timeline by /sync responses.


    this.notifTimelineSet.resetLiveTimeline('end', null); // we could try to paginate a single event at this point in order to get
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
   * @param {String} roomId The room to attempt to peek into.
   * @return {Promise} Resolves: Room object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  peekInRoom(roomId) {
    if (this.peekSync) {
      this.peekSync.stopPeeking();
    }

    this.peekSync = new _sync.SyncApi(this, this.clientOpts);
    return this.peekSync.peek(roomId);
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
   * @param {string} roomId The room to configure guest access in.
   * @param {Object} opts Options
   * @param {boolean} opts.allowJoin True to allow guests to join this room. This
   * implicitly gives guests write access. If false or not given, guests are
   * explicitly forbidden from joining the room.
   * @param {boolean} opts.allowRead True to set history visibility to
   * be world_readable. This gives guests read access *from this point forward*.
   * If false or not given, history visibility is not modified.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setGuestAccess(roomId, opts) {
    const writePromise = this.sendStateEvent(roomId, _event2.EventType.RoomGuestAccess, {
      guest_access: opts.allowJoin ? "can_join" : "forbidden"
    }, "");
    let readPromise = Promise.resolve(undefined);

    if (opts.allowRead) {
      readPromise = this.sendStateEvent(roomId, _event2.EventType.RoomHistoryVisibility, {
        history_visibility: "world_readable"
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
    * @param {string} email As requestEmailToken
   * @param {string} clientSecret As requestEmailToken
   * @param {number} sendAttempt As requestEmailToken
   * @param {string} nextLink As requestEmailToken
   * @return {Promise} Resolves: As requestEmailToken
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
   * @param {string} phoneCountry The ISO 3166-1 alpha-2 code for the country in which
   *    phoneNumber should be parsed relative to.
   * @param {string} phoneNumber The phone number, in national or international format
   * @param {string} clientSecret As requestEmailToken
   * @param {number} sendAttempt As requestEmailToken
   * @param {string} nextLink As requestEmailToken
   * @return {Promise} Resolves: As requestEmailToken
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
   * @param {string} email As requestEmailToken
   * @param {string} clientSecret As requestEmailToken
   * @param {number} sendAttempt As requestEmailToken
   * @param {string} nextLink As requestEmailToken
   * @return {Promise} Resolves: As requestEmailToken
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
   * @param {string} phoneCountry As requestRegisterMsisdnToken
   * @param {string} phoneNumber As requestRegisterMsisdnToken
   * @param {string} clientSecret As requestEmailToken
   * @param {number} sendAttempt As requestEmailToken
   * @param {string} nextLink As requestEmailToken
   * @return {Promise} Resolves: As requestEmailToken
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
   * @param {string} email As requestEmailToken
   * @param {string} clientSecret As requestEmailToken
   * @param {number} sendAttempt As requestEmailToken
   * @param {string} nextLink As requestEmailToken
   * @param {module:client.callback} callback Optional. As requestEmailToken
   * @return {Promise} Resolves: As requestEmailToken
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
   * @param {string} phoneCountry As requestRegisterMsisdnToken
   * @param {string} phoneNumber As requestRegisterMsisdnToken
   * @param {string} clientSecret As requestEmailToken
   * @param {number} sendAttempt As requestEmailToken
   * @param {string} nextLink As requestEmailToken
   * @return {Promise} Resolves: As requestEmailToken
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
   * @param {string} endpoint The endpoint to send the request to
   * @param {object} params Parameters for the POST request
   * @return {Promise} Resolves: As requestEmailToken
   */


  async requestTokenFromEndpoint(endpoint, params) {
    const postParams = Object.assign({}, params); // If the HS supports separate add and bind, then requestToken endpoints
    // don't need an IS as they are all validated by the HS directly.

    if (!(await this.doesServerSupportSeparateAddAndBind()) && this.idBaseUrl) {
      const idServerUrl = new URL(this.idBaseUrl);
      postParams.id_server = idServerUrl.host;

      if (this.identityServer?.getAccessToken && (await this.doesServerAcceptIdentityAccessToken())) {
        const identityAccessToken = await this.identityServer.getAccessToken();

        if (identityAccessToken) {
          postParams.id_access_token = identityAccessToken;
        }
      }
    }

    return this.http.request(undefined, _httpApi.Method.Post, endpoint, undefined, postParams);
  }
  /**
   * Get the room-kind push rule associated with a room.
   * @param {string} scope "global" or device-specific.
   * @param {string} roomId the id of the room.
   * @return {object} the rule or undefined.
   */


  getRoomPushRule(scope, roomId) {
    // There can be only room-kind push rule per room
    // and its id is the room id.
    if (this.pushRules) {
      if (!this.pushRules[scope] || !this.pushRules[scope].room) {
        return;
      }

      for (let i = 0; i < this.pushRules[scope].room.length; i++) {
        const rule = this.pushRules[scope].room[i];

        if (rule.rule_id === roomId) {
          return rule;
        }
      }
    } else {
      throw new Error("SyncApi.sync() must be done before accessing to push rules.");
    }
  }
  /**
   * Set a room-kind muting push rule in a room.
   * The operation also updates MatrixClient.pushRules at the end.
   * @param {string} scope "global" or device-specific.
   * @param {string} roomId the id of the room.
   * @param {boolean} mute the mute state.
   * @return {Promise} Resolves: result object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setRoomMutePushRule(scope, roomId, mute) {
    let promise;
    let hasDontNotifyRule = false; // Get the existing room-kind push rule if any

    const roomPushRule = this.getRoomPushRule(scope, roomId);

    if (roomPushRule?.actions.includes(_matrix.PushRuleActionName.DontNotify)) {
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
          actions: [_matrix.PushRuleActionName.DontNotify]
        });
      } else if (!hasDontNotifyRule) {
        // Remove the existing one before setting the mute push rule
        // This is a workaround to SYN-590 (Push rule update fails)
        const deferred = utils.defer();
        this.deletePushRule(scope, _PushRules.PushRuleKind.RoomSpecific, roomPushRule.rule_id).then(() => {
          this.addPushRule(scope, _PushRules.PushRuleKind.RoomSpecific, roomId, {
            actions: [_matrix.PushRuleActionName.DontNotify]
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

  searchMessageText(opts, callback) {
    const roomEvents = {
      search_term: opts.query
    };

    if ('keys' in opts) {
      roomEvents.keys = opts.keys;
    }

    return this.search({
      body: {
        search_categories: {
          room_events: roomEvents
        }
      }
    }, callback);
  }
  /**
   * Perform a server-side search for room events.
   *
   * The returned promise resolves to an object containing the fields:
   *
   *  * {number}  count:       estimate of the number of results
   *  * {string}  next_batch:  token for back-pagination; if undefined, there are
   *                           no more results
   *  * {Array}   highlights:  a list of words to highlight from the stemming
   *                           algorithm
   *  * {Array}   results:     a list of results
   *
   * Each entry in the results list is a {module:models/search-result.SearchResult}.
   *
   * @param {Object} opts
   * @param {string} opts.term     the term to search for
   * @param {Object} opts.filter   a JSON filter object to pass in the request
   * @return {Promise} Resolves: result object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
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
   * @param  {object} searchResults  the results object to be updated
   * @return {Promise} Resolves: updated result object
   * @return {Error} Rejects: with an error response.
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
    const promise = this.search(searchOpts).then(res => this.processRoomEventsSearch(searchResults, res)).finally(() => {
      searchResults.pendingRequest = null;
    });
    searchResults.pendingRequest = promise;
    return promise;
  }
  /**
   * helper for searchRoomEvents and backPaginateRoomEventsSearch. Processes the
   * response from the API call and updates the searchResults
   *
   * @param {Object} searchResults
   * @param {Object} response
   * @return {Object} searchResults
   * @private
   */
  // XXX: Intended private, used in code


  processRoomEventsSearch(searchResults, response) {
    const roomEvents = response.search_categories.room_events;
    searchResults.count = roomEvents.count;
    searchResults.next_batch = roomEvents.next_batch; // combine the highlight list with our existing list;

    const highlights = new Set(roomEvents.highlights);
    searchResults.highlights.forEach(hl => {
      highlights.add(hl);
    }); // turn it back into a list.

    searchResults.highlights = Array.from(highlights);
    const mapper = this.getEventMapper(); // append the new results to our existing results

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
   * @return {Promise} Resolves: TODO - Resolved when the rooms have
   * been added to the data store.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  syncLeftRooms() {
    // Guard against multiple calls whilst ongoing and multiple calls post success
    if (this.syncedLeftRooms) {
      return Promise.resolve([]); // don't call syncRooms again if it succeeded.
    }

    if (this.syncLeftRoomsPromise) {
      return this.syncLeftRoomsPromise; // return the ongoing request
    }

    const syncApi = new _sync.SyncApi(this, this.clientOpts);
    this.syncLeftRoomsPromise = syncApi.syncLeftRooms(); // cleanup locks

    this.syncLeftRoomsPromise.then(() => {
      _logger.logger.log("Marking success of sync left room request");

      this.syncedLeftRooms = true; // flip the bit on success
    }).finally(() => {
      this.syncLeftRoomsPromise = null; // cleanup ongoing request state
    });
    return this.syncLeftRoomsPromise;
  }
  /**
   * Create a new filter.
   * @param {Object} content The HTTP body for the request
   * @return {Filter} Resolves to a Filter object.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  createFilter(content) {
    const path = utils.encodeUri("/user/$userId/filter", {
      $userId: this.credentials.userId
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Post, path, undefined, content).then(response => {
      // persist the filter
      const filter = _filter.Filter.fromJson(this.credentials.userId, response.filter_id, content);

      this.store.storeFilter(filter);
      return filter;
    });
  }
  /**
   * Retrieve a filter.
   * @param {string} userId The user ID of the filter owner
   * @param {string} filterId The filter ID to retrieve
   * @param {boolean} allowCached True to allow cached filters to be returned.
   * Default: True.
   * @return {Promise} Resolves: a Filter object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
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
    return this.http.authedRequest(undefined, _httpApi.Method.Get, path).then(response => {
      // persist the filter
      const filter = _filter.Filter.fromJson(userId, filterId, response);

      this.store.storeFilter(filter);
      return filter;
    });
  }
  /**
   * @param {string} filterName
   * @param {Filter} filter
   * @return {Promise<String>} Filter ID
   */


  async getOrCreateFilter(filterName, filter) {
    const filterId = this.store.getFilterIdByName(filterName);
    let existingId = undefined;

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
      } // if the filter doesn't exist anymore on the server, remove from store


      if (!existingId) {
        this.store.setFilterIdByName(filterName, undefined);
      }
    }

    if (existingId) {
      return existingId;
    } // create a new filter


    const createdFilter = await this.createFilter(filter.getDefinition()); // debuglog("Created new filter ID %s: %s", createdFilter.filterId,
    //          JSON.stringify(createdFilter.getDefinition()));

    this.store.setFilterIdByName(filterName, createdFilter.filterId);
    return createdFilter.filterId;
  }
  /**
   * Gets a bearer token from the homeserver that the user can
   * present to a third party in order to prove their ownership
   * of the Matrix account they are logged into.
   * @return {Promise} Resolves: Token object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getOpenIdToken() {
    const path = utils.encodeUri("/user/$userId/openid/request_token", {
      $userId: this.credentials.userId
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Post, path, undefined, {});
  }

  /**
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: ITurnServerResponse object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */
  turnServer(callback) {
    return this.http.authedRequest(callback, _httpApi.Method.Get, "/voip/turnServer");
  }
  /**
   * Get the TURN servers for this homeserver.
   * @return {Array<Object>} The servers or an empty list.
   */


  getTurnServers() {
    return this.turnServers || [];
  }
  /**
   * Get the unix timestamp (in milliseconds) at which the current
   * TURN credentials (from getTurnServers) expire
   * @return {number} The expiry timestamp, in milliseconds, or null if no credentials
   */


  getTurnServersExpiry() {
    return this.turnServersExpiry;
  }

  get pollingTurnServers() {
    return this.checkTurnServersIntervalID !== null;
  } // XXX: Intended private, used in code.


  async checkTurnServers() {
    if (!this.canSupportVoip) {
      return;
    }

    let credentialsGood = false;
    const remainingTime = this.turnServersExpiry - Date.now();

    if (remainingTime > TURN_CHECK_INTERVAL) {
      _logger.logger.debug("TURN creds are valid for another " + remainingTime + " ms: not fetching new ones.");

      credentialsGood = true;
    } else {
      _logger.logger.debug("Fetching new TURN credentials");

      try {
        const res = await this.turnServer();

        if (res.uris) {
          _logger.logger.log("Got TURN URIs: " + res.uris + " refresh in " + res.ttl + " secs"); // map the response to a format that can be fed to RTCPeerConnection


          const servers = {
            urls: res.uris,
            username: res.username,
            credential: res.password
          };
          this.turnServers = [servers]; // The TTL is in seconds but we work in ms

          this.turnServersExpiry = Date.now() + res.ttl * 1000;
          credentialsGood = true;
          this.emit(ClientEvent.TurnServers, this.turnServers);
        }
      } catch (err) {
        _logger.logger.error("Failed to get TURN URIs", err);

        if (err.httpStatus === 403) {
          // We got a 403, so there's no point in looping forever.
          _logger.logger.info("TURN access unavailable for this account: stopping credentials checks");

          if (this.checkTurnServersIntervalID !== null) global.clearInterval(this.checkTurnServersIntervalID);
          this.checkTurnServersIntervalID = null;
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
   * @param {boolean} allow
   */


  setFallbackICEServerAllowed(allow) {
    this.fallbackICEServerAllowed = allow;
  }
  /**
   * Get whether to allow a fallback ICE server should be used for negotiating a
   * WebRTC connection if the homeserver doesn't provide any servers. Defaults to
   * false.
   *
   * @returns {boolean}
   */


  isFallbackICEServerAllowed() {
    return this.fallbackICEServerAllowed;
  }
  /**
   * Determines if the current user is an administrator of the Synapse homeserver.
   * Returns false if untrue or the homeserver does not appear to be a Synapse
   * homeserver. <strong>This function is implementation specific and may change
   * as a result.</strong>
   * @return {boolean} true if the user appears to be a Synapse administrator.
   */


  isSynapseAdministrator() {
    const path = utils.encodeUri("/_synapse/admin/v1/users/$userId/admin", {
      $userId: this.getUserId()
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Get, path, undefined, undefined, {
      prefix: ''
    }).then(r => r['admin']); // pull out the specific boolean we want
  }
  /**
   * Performs a whois lookup on a user using Synapse's administrator API.
   * <strong>This function is implementation specific and may change as a
   * result.</strong>
   * @param {string} userId the User ID to look up.
   * @return {object} the whois response - see Synapse docs for information.
   */


  whoisSynapseUser(userId) {
    const path = utils.encodeUri("/_synapse/admin/v1/whois/$userId", {
      $userId: userId
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Get, path, undefined, undefined, {
      prefix: ''
    });
  }
  /**
   * Deactivates a user using Synapse's administrator API. <strong>This
   * function is implementation specific and may change as a result.</strong>
   * @param {string} userId the User ID to deactivate.
   * @return {object} the deactivate response - see Synapse docs for information.
   */


  deactivateSynapseUser(userId) {
    const path = utils.encodeUri("/_synapse/admin/v1/deactivate/$userId", {
      $userId: userId
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Post, path, undefined, undefined, {
      prefix: ''
    });
  }

  async fetchClientWellKnown() {
    // `getRawClientConfig` does not throw or reject on network errors, instead
    // it absorbs errors and returns `{}`.
    this.clientWellKnownPromise = _autodiscovery.AutoDiscovery.getRawClientConfig(this.getDomain());
    this.clientWellKnown = await this.clientWellKnownPromise;
    this.emit(ClientEvent.ClientWellKnown, this.clientWellKnown);
  }

  getClientWellKnown() {
    return this.clientWellKnown;
  }

  waitForClientWellKnown() {
    return this.clientWellKnownPromise;
  }
  /**
   * store client options with boolean/string/numeric values
   * to know in the next session what flags the sync data was
   * created with (e.g. lazy loading)
   * @param {object} opts the complete set of client options
   * @return {Promise} for store operation
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
   * Gets a set of room IDs in common with another user
   * @param {string} userId The userId to check.
   * @return {Promise<string[]>} Resolves to a set of rooms
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  async _unstable_getSharedRooms(userId) {
    // eslint-disable-line
    const sharedRoomsSupport = await this.doesServerSupportUnstableFeature("uk.half-shot.msc2666");
    const mutualRoomsSupport = await this.doesServerSupportUnstableFeature("uk.half-shot.msc2666.mutual_rooms");

    if (!sharedRoomsSupport && !mutualRoomsSupport) {
      throw Error('Server does not support mutual_rooms API');
    }

    const path = utils.encodeUri(`/uk.half-shot.msc2666/user/${mutualRoomsSupport ? 'mutual_rooms' : 'shared_rooms'}/$userId`, {
      $userId: userId
    });
    const res = await this.http.authedRequest(undefined, _httpApi.Method.Get, path, undefined, undefined, {
      prefix: _httpApi.PREFIX_UNSTABLE
    });
    return res.joined;
  }
  /**
   * Get the API versions supported by the server, along with any
   * unstable APIs it supports
   * @return {Promise<object>} The server /versions response
   */


  getVersions() {
    if (this.serverVersionsPromise) {
      return this.serverVersionsPromise;
    }

    this.serverVersionsPromise = this.http.request(undefined, // callback
    _httpApi.Method.Get, "/_matrix/client/versions", undefined, // queryParams
    undefined, // data
    {
      prefix: ''
    }).catch(e => {
      // Need to unset this if it fails, otherwise we'll never retry
      this.serverVersionsPromise = null; // but rethrow the exception to anything that was waiting

      throw e;
    });
    return this.serverVersionsPromise;
  }
  /**
   * Check if a particular spec version is supported by the server.
   * @param {string} version The spec version (such as "r0.5.0") to check for.
   * @return {Promise<boolean>} Whether it is supported
   */


  async isVersionSupported(version) {
    const {
      versions
    } = await this.getVersions();
    return versions && versions.includes(version);
  }
  /**
   * Query the server to see if it supports members lazy loading
   * @return {Promise<boolean>} true if server supports lazy loading
   */


  async doesServerSupportLazyLoading() {
    const response = await this.getVersions();
    if (!response) return false;
    const versions = response["versions"];
    const unstableFeatures = response["unstable_features"];
    return versions && versions.includes("r0.5.0") || unstableFeatures && unstableFeatures["m.lazy_load_members"];
  }
  /**
   * Query the server to see if the `id_server` parameter is required
   * when registering with an 3pid, adding a 3pid or resetting password.
   * @return {Promise<boolean>} true if id_server parameter is required
   */


  async doesServerRequireIdServerParam() {
    const response = await this.getVersions();
    if (!response) return true;
    const versions = response["versions"]; // Supporting r0.6.0 is the same as having the flag set to false

    if (versions && versions.includes("r0.6.0")) {
      return false;
    }

    const unstableFeatures = response["unstable_features"];
    if (!unstableFeatures) return true;

    if (unstableFeatures["m.require_identity_server"] === undefined) {
      return true;
    } else {
      return unstableFeatures["m.require_identity_server"];
    }
  }
  /**
   * Query the server to see if the `id_access_token` parameter can be safely
   * passed to the homeserver. Some homeservers may trigger errors if they are not
   * prepared for the new parameter.
   * @return {Promise<boolean>} true if id_access_token can be sent
   */


  async doesServerAcceptIdentityAccessToken() {
    const response = await this.getVersions();
    if (!response) return false;
    const versions = response["versions"];
    const unstableFeatures = response["unstable_features"];
    return versions && versions.includes("r0.6.0") || unstableFeatures && unstableFeatures["m.id_access_token"];
  }
  /**
   * Query the server to see if it supports separate 3PID add and bind functions.
   * This affects the sequence of API calls clients should use for these operations,
   * so it's helpful to be able to check for support.
   * @return {Promise<boolean>} true if separate functions are supported
   */


  async doesServerSupportSeparateAddAndBind() {
    const response = await this.getVersions();
    if (!response) return false;
    const versions = response["versions"];
    const unstableFeatures = response["unstable_features"];
    return versions?.includes("r0.6.0") || unstableFeatures?.["m.separate_add_and_bind"];
  }
  /**
   * Query the server to see if it lists support for an unstable feature
   * in the /versions response
   * @param {string} feature the feature name
   * @return {Promise<boolean>} true if the feature is supported
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
   * @param {Preset} presetName The name of the preset to check.
   * @returns {Promise<boolean>} true if the server is forcing encryption
   * for the preset.
   */


  async doesServerForceEncryptionForPreset(presetName) {
    const response = await this.getVersions();
    if (!response) return false;
    const unstableFeatures = response["unstable_features"]; // The preset name in the versions response will be without the _chat suffix.

    const versionsPresetName = presetName.includes("_chat") ? presetName.substring(0, presetName.indexOf("_chat")) : presetName;
    return unstableFeatures && !!unstableFeatures[`io.element.e2ee_forced.${versionsPresetName}`];
  }

  async doesServerSupportThread() {
    try {
      const hasUnstableSupport = await this.doesServerSupportUnstableFeature("org.matrix.msc3440");
      const hasStableSupport = await this.doesServerSupportUnstableFeature("org.matrix.msc3440.stable"); // TODO: Use `this.isVersionSupported("v1.3")` for whatever spec version includes MSC3440 formally.

      return {
        serverSupport: hasUnstableSupport || hasStableSupport,
        stable: hasStableSupport
      };
    } catch (e) {
      // Assume server support and stability aren't available: null/no data return.
      // XXX: This should just return an object with `false` booleans instead.
      return null;
    }
  }
  /**
   * Query the server to see if it supports the MSC2457 `logout_devices` parameter when setting password
   * @return {Promise<boolean>} true if server supports the `logout_devices` parameter
   */


  doesServerSupportLogoutDevices() {
    return this.isVersionSupported("r0.6.1");
  }
  /**
   * Get if lazy loading members is being used.
   * @return {boolean} Whether or not members are lazy loaded by this client
   */


  hasLazyLoadMembersEnabled() {
    return !!this.clientOpts.lazyLoadMembers;
  }
  /**
   * Set a function which is called when /sync returns a 'limited' response.
   * It is called with a room ID and returns a boolean. It should return 'true' if the SDK
   * can SAFELY remove events from this room. It may not be safe to remove events if there
   * are other references to the timelines for this room, e.g because the client is
   * actively viewing events in this room.
   * Default: returns false.
   * @param {Function} cb The callback which will be invoked.
   */


  setCanResetTimelineCallback(cb) {
    this.canResetTimelineCallback = cb;
  }
  /**
   * Get the callback set via `setCanResetTimelineCallback`.
   * @return {?Function} The callback or null
   */


  getCanResetTimelineCallback() {
    return this.canResetTimelineCallback;
  }
  /**
   * Returns relations for a given event. Handles encryption transparently,
   * with the caveat that the amount of events returned might be 0, even though you get a nextBatch.
   * When the returned promise resolves, all messages should have finished trying to decrypt.
   * @param {string} roomId the room of the event
   * @param {string} eventId the id of the event
   * @param {string} relationType the rel_type of the relations requested
   * @param {string} eventType the event type of the relations requested
   * @param {Object} opts options with optional values for the request.
   * @return {Object} an object with `events` as `MatrixEvent[]` and optionally `nextBatch` if more relations are available.
   */


  async relations(roomId, eventId, relationType, eventType, opts = {
    direction: _eventTimeline.Direction.Backward
  }) {
    const fetchedEventType = this.getEncryptedIfNeededEventType(roomId, eventType);
    const result = await this.fetchRelations(roomId, eventId, relationType, fetchedEventType, opts);
    const mapper = this.getEventMapper();
    const originalEvent = result.original_event ? mapper(result.original_event) : undefined;
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
      originalEvent,
      events,
      nextBatch: result.next_batch,
      prevBatch: result.prev_batch
    };
  }
  /**
   * The app may wish to see if we have a key cached without
   * triggering a user interaction.
   * @return {object}
   */


  getCrossSigningCacheCallbacks() {
    // XXX: Private member access
    return this.crypto?.crossSigningInfo.getCacheCallbacks();
  }
  /**
   * Generates a random string suitable for use as a client secret. <strong>This
   * method is experimental and may change.</strong>
   * @return {string} A new client secret
   */


  generateClientSecret() {
    return (0, _randomstring.randomString)(32);
  }
  /**
   * Attempts to decrypt an event
   * @param {MatrixEvent} event The event to decrypt
   * @returns {Promise<void>} A decryption promise
   * @param {object} options
   * @param {boolean} options.isRetry True if this is a retry (enables more logging)
   * @param {boolean} options.emit Emits "event.decrypted" if set to true
   */


  decryptEventIfNeeded(event, options) {
    if (event.shouldAttemptDecryption()) {
      event.attemptDecryption(this.crypto, options);
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
        return baseUrl + _httpApi.PREFIX_IDENTITY_V2 + '/terms';

      case _serviceTypes.SERVICE_TYPES.IM:
        return baseUrl + '/_matrix/integrations/v1/terms';

      default:
        throw new Error('Unsupported service type');
    }
  }
  /**
   * Get the Homeserver URL of this client
   * @return {string} Homeserver URL of this client
   */


  getHomeserverUrl() {
    return this.baseUrl;
  }
  /**
   * Get the identity server URL of this client
   * @param {boolean} stripProto whether or not to strip the protocol from the URL
   * @return {string} Identity server URL of this client
   */


  getIdentityServerUrl(stripProto = false) {
    if (stripProto && (this.idBaseUrl.startsWith("http://") || this.idBaseUrl.startsWith("https://"))) {
      return this.idBaseUrl.split("://")[1];
    }

    return this.idBaseUrl;
  }
  /**
   * Set the identity server URL of this client
   * @param {string} url New identity server URL
   */


  setIdentityServerUrl(url) {
    this.idBaseUrl = utils.ensureNoTrailingSlash(url);
    this.http.setIdBaseUrl(this.idBaseUrl);
  }
  /**
   * Get the access token associated with this account.
   * @return {?String} The access_token or null
   */


  getAccessToken() {
    return this.http.opts.accessToken || null;
  }
  /**
   * Set the access token associated with this account.
   * @param {string} token The new access token.
   */


  setAccessToken(token) {
    this.http.opts.accessToken = token;
  }
  /**
   * @return {boolean} true if there is a valid access_token for this client.
   */


  isLoggedIn() {
    return this.http.opts.accessToken !== undefined;
  }
  /**
   * Make up a new transaction id
   *
   * @return {string} a new, unique, transaction id
   */


  makeTxnId() {
    return "m" + new Date().getTime() + "." + this.txnCtr++;
  }
  /**
   * Check whether a username is available prior to registration. An error response
   * indicates an invalid/unavailable username.
   * @param {string} username The username to check the availability of.
   * @return {Promise} Resolves: to boolean of whether the username is available.
   */


  isUsernameAvailable(username) {
    return this.http.authedRequest(undefined, _httpApi.Method.Get, '/register/available', {
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
   * @param {string} username
   * @param {string} password
   * @param {string} sessionId
   * @param {Object} auth
   * @param {Object} bindThreepids Set key 'email' to true to bind any email
   *     threepid uses during registration in the identity server. Set 'msisdn' to
   *     true to bind msisdn.
   * @param {string} guestAccessToken
   * @param {string} inhibitLogin
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  register(username, password, sessionId, auth, bindThreepids, guestAccessToken, inhibitLogin, callback) {
    // backwards compat
    if (bindThreepids === true) {
      bindThreepids = {
        email: true
      };
    } else if (bindThreepids === null || bindThreepids === undefined || bindThreepids === false) {
      bindThreepids = {};
    }

    if (typeof inhibitLogin === 'function') {
      callback = inhibitLogin;
      inhibitLogin = undefined;
    }

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

    if (bindThreepids.email) {
      params.bind_email = true;
    }

    if (bindThreepids.msisdn) {
      params.bind_msisdn = true;
    }

    if (guestAccessToken !== undefined && guestAccessToken !== null) {
      params.guest_access_token = guestAccessToken;
    }

    if (inhibitLogin !== undefined && inhibitLogin !== null) {
      params.inhibit_login = inhibitLogin;
    } // Temporary parameter added to make the register endpoint advertise
    // msisdn flows. This exists because there are clients that break
    // when given stages they don't recognise. This parameter will cease
    // to be necessary once these old clients are gone.
    // Only send it if we send any params at all (the password param is
    // mandatory, so if we send any params, we'll send the password param)


    if (password !== undefined && password !== null) {
      params.x_show_msisdn = true;
    }

    return this.registerRequest(params, undefined, callback);
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
   * @param {Object=} opts Registration options
   * @param {Object} opts.body JSON HTTP body to provide.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: JSON object that contains:
   *                   { user_id, device_id, access_token, home_server }
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  registerGuest(opts, callback) {
    // TODO: Types
    opts = opts || {};
    opts.body = opts.body || {};
    return this.registerRequest(opts.body, "guest", callback);
  }
  /**
   * @param {Object} data   parameters for registration request
   * @param {string=} kind  type of user to register. may be "guest"
   * @param {module:client.callback=} callback
   * @return {Promise} Resolves: to the /register response
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  registerRequest(data, kind, callback) {
    const params = {};

    if (kind) {
      params.kind = kind;
    }

    return this.http.request(callback, _httpApi.Method.Post, "/register", params, data);
  }
  /**
   * Refreshes an access token using a provided refresh token. The refresh token
   * must be valid for the current access token known to the client instance.
   *
   * Note that this function will not cause a logout if the token is deemed
   * unknown by the server - the caller is responsible for managing logout
   * actions on error.
   * @param {string} refreshToken The refresh token.
   * @return {Promise<IRefreshTokenResponse>} Resolves to the new token.
   * @return {module:http-api.MatrixError} Rejects with an error response.
   */


  refreshToken(refreshToken) {
    return this.http.authedRequest(undefined, _httpApi.Method.Post, "/refresh", undefined, {
      refresh_token: refreshToken
    }, {
      prefix: _httpApi.PREFIX_V1,
      inhibitLogoutEmit: true // we don't want to cause logout loops

    });
  }
  /**
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  loginFlows(callback) {
    // TODO: Types
    return this.http.request(callback, _httpApi.Method.Get, "/login");
  }
  /**
   * @param {string} loginType
   * @param {Object} data
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  login(loginType, data, callback) {
    // TODO: Types
    const loginData = {
      type: loginType
    }; // merge data into loginData

    Object.assign(loginData, data);
    return this.http.authedRequest((error, response) => {
      if (response && response.access_token && response.user_id) {
        this.http.opts.accessToken = response.access_token;
        this.credentials = {
          userId: response.user_id
        };
      }

      if (callback) {
        callback(error, response);
      }
    }, _httpApi.Method.Post, "/login", undefined, loginData);
  }
  /**
   * @param {string} user
   * @param {string} password
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  loginWithPassword(user, password, callback) {
    // TODO: Types
    return this.login("m.login.password", {
      user: user,
      password: password
    }, callback);
  }
  /**
   * @param {string} relayState URL Callback after SAML2 Authentication
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  loginWithSAML2(relayState, callback) {
    // TODO: Types
    return this.login("m.login.saml2", {
      relay_state: relayState
    }, callback);
  }
  /**
   * @param {string} redirectUrl The URL to redirect to after the HS
   * authenticates with CAS.
   * @return {string} The HS URL to hit to begin the CAS login process.
   */


  getCasLoginUrl(redirectUrl) {
    return this.getSsoLoginUrl(redirectUrl, "cas");
  }
  /**
   * @param {string} redirectUrl The URL to redirect to after the HS
   *     authenticates with the SSO.
   * @param {string} loginType The type of SSO login we are doing (sso or cas).
   *     Defaults to 'sso'.
   * @param {string} idpId The ID of the Identity Provider being targeted, optional.
   * @param {SSOAction} action the SSO flow to indicate to the IdP, optional.
   * @return {string} The HS URL to hit to begin the SSO login process.
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
    return this.http.getUrl(url, params, _httpApi.PREFIX_R0);
  }
  /**
   * @param {string} token Login token previously received from homeserver
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  loginWithToken(token, callback) {
    // TODO: Types
    return this.login("m.login.token", {
      token: token
    }, callback);
  }
  /**
   * Logs out the current session.
   * Obviously, further calls that require authorisation should fail after this
   * method is called. The state of the MatrixClient object is not affected:
   * it is up to the caller to either reset or destroy the MatrixClient after
   * this method succeeds.
   * @param {module:client.callback} callback Optional.
   * @param {boolean} stopClient whether to stop the client before calling /logout to prevent invalid token errors.
   * @return {Promise} Resolves: On success, the empty object {}
   */


  async logout(callback, stopClient = false) {
    if (this.crypto?.backupManager?.getKeyBackupEnabled()) {
      try {
        while ((await this.crypto.backupManager.backupPendingKeys(200)) > 0);
      } catch (err) {
        _logger.logger.error("Key backup request failed when logging out. Some keys may be missing from backup", err);
      }
    }

    if (stopClient) {
      this.stopClient();
    }

    return this.http.authedRequest(callback, _httpApi.Method.Post, '/logout');
  }
  /**
   * Deactivates the logged-in account.
   * Obviously, further calls that require authorisation should fail after this
   * method is called. The state of the MatrixClient object is not affected:
   * it is up to the caller to either reset or destroy the MatrixClient after
   * this method succeeds.
   * @param {object} auth Optional. Auth data to supply for User-Interactive auth.
   * @param {boolean} erase Optional. If set, send as `erase` attribute in the
   * JSON request body, indicating whether the account should be erased. Defaults
   * to false.
   * @return {Promise} Resolves: On success, the empty object
   */


  deactivateAccount(auth, erase) {
    if (typeof erase === 'function') {
      throw new Error('deactivateAccount no longer accepts a callback parameter');
    }

    const body = {};

    if (auth) {
      body.auth = auth;
    }

    if (erase !== undefined) {
      body.erase = erase;
    }

    return this.http.authedRequest(undefined, _httpApi.Method.Post, '/account/deactivate', undefined, body);
  }
  /**
   * Get the fallback URL to use for unknown interactive-auth stages.
   *
   * @param {string} loginType     the type of stage being attempted
   * @param {string} authSessionId the auth session ID provided by the homeserver
   *
   * @return {string} HS URL to hit to for the fallback interface
   */


  getFallbackAuthUrl(loginType, authSessionId) {
    const path = utils.encodeUri("/auth/$loginType/fallback/web", {
      $loginType: loginType
    });
    return this.http.getUrl(path, {
      session: authSessionId
    }, _httpApi.PREFIX_R0);
  }
  /**
   * Create a new room.
   * @param {Object} options a list of options to pass to the /createRoom API.
   * @param {string} options.room_alias_name The alias localpart to assign to
   * this room.
   * @param {string} options.visibility Either 'public' or 'private'.
   * @param {string[]} options.invite A list of user IDs to invite to this room.
   * @param {string} options.name The name to give this room.
   * @param {string} options.topic The topic to give this room.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: <code>{room_id: {string}}</code>
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  async createRoom(options, callback) {
    // eslint-disable-line camelcase
    // some valid options include: room_alias_name, visibility, invite
    // inject the id_access_token if inviting 3rd party addresses
    const invitesNeedingToken = (options.invite_3pid || []).filter(i => !i.id_access_token);

    if (invitesNeedingToken.length > 0 && this.identityServer?.getAccessToken && (await this.doesServerAcceptIdentityAccessToken())) {
      const identityAccessToken = await this.identityServer.getAccessToken();

      if (identityAccessToken) {
        for (const invite of invitesNeedingToken) {
          invite.id_access_token = identityAccessToken;
        }
      }
    }

    return this.http.authedRequest(callback, _httpApi.Method.Post, "/createRoom", undefined, options);
  }
  /**
   * Fetches relations for a given event
   * @param {string} roomId the room of the event
   * @param {string} eventId the id of the event
   * @param {string} [relationType] the rel_type of the relations requested
   * @param {string} [eventType] the event type of the relations requested
   * @param {Object} [opts] options with optional values for the request.
  * @return {Object} the response, with chunk, prev_batch and, next_batch.
   */


  fetchRelations(roomId, eventId, relationType, eventType, opts = {
    direction: _eventTimeline.Direction.Backward
  }) {
    const queryString = utils.encodeParams(opts);
    let templatedUrl = "/rooms/$roomId/relations/$eventId";

    if (relationType !== null) {
      templatedUrl += "/$relationType";

      if (eventType !== null) {
        templatedUrl += "/$eventType";
      }
    } else if (eventType !== null) {
      _logger.logger.warn(`eventType: ${eventType} ignored when fetching
            relations as relationType is null`);

      eventType = null;
    }

    const path = utils.encodeUri(templatedUrl + "?" + queryString, {
      $roomId: roomId,
      $eventId: eventId,
      $relationType: relationType,
      $eventType: eventType
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Get, path, null, null, {
      prefix: _httpApi.PREFIX_UNSTABLE
    });
  }
  /**
   * @param {string} roomId
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  roomState(roomId, callback) {
    const path = utils.encodeUri("/rooms/$roomId/state", {
      $roomId: roomId
    });
    return this.http.authedRequest(callback, _httpApi.Method.Get, path);
  }
  /**
   * Get an event in a room by its event id.
   * @param {string} roomId
   * @param {string} eventId
   * @param {module:client.callback} callback Optional.
   *
   * @return {Promise} Resolves to an object containing the event.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  fetchRoomEvent(roomId, eventId, callback) {
    const path = utils.encodeUri("/rooms/$roomId/event/$eventId", {
      $roomId: roomId,
      $eventId: eventId
    });
    return this.http.authedRequest(callback, _httpApi.Method.Get, path);
  }
  /**
   * @param {string} roomId
   * @param {string} includeMembership the membership type to include in the response
   * @param {string} excludeMembership the membership type to exclude from the response
   * @param {string} atEventId the id of the event for which moment in the timeline the members should be returned for
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: dictionary of userid to profile information
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  members(roomId, includeMembership, excludeMembership, atEventId, callback) {
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
    return this.http.authedRequest(callback, _httpApi.Method.Get, path);
  }
  /**
   * Upgrades a room to a new protocol version
   * @param {string} roomId
   * @param {string} newVersion The target version to upgrade to
   * @return {Promise} Resolves: Object with key 'replacement_room'
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  upgradeRoom(roomId, newVersion) {
    // eslint-disable-line camelcase
    const path = utils.encodeUri("/rooms/$roomId/upgrade", {
      $roomId: roomId
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Post, path, undefined, {
      new_version: newVersion
    });
  }
  /**
   * Retrieve a state event.
   * @param {string} roomId
   * @param {string} eventType
   * @param {string} stateKey
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getStateEvent(roomId, eventType, stateKey, callback) {
    const pathParams = {
      $roomId: roomId,
      $eventType: eventType,
      $stateKey: stateKey
    };
    let path = utils.encodeUri("/rooms/$roomId/state/$eventType", pathParams);

    if (stateKey !== undefined) {
      path = utils.encodeUri(path + "/$stateKey", pathParams);
    }

    return this.http.authedRequest(callback, _httpApi.Method.Get, path);
  }
  /**
   * @param {string} roomId
   * @param {string} eventType
   * @param {Object} content
   * @param {string} stateKey
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  sendStateEvent(roomId, eventType, content, stateKey = "", callback) {
    const pathParams = {
      $roomId: roomId,
      $eventType: eventType,
      $stateKey: stateKey
    };
    let path = utils.encodeUri("/rooms/$roomId/state/$eventType", pathParams);

    if (stateKey !== undefined) {
      path = utils.encodeUri(path + "/$stateKey", pathParams);
    }

    return this.http.authedRequest(callback, _httpApi.Method.Put, path, undefined, content);
  }
  /**
   * @param {string} roomId
   * @param {Number} limit
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  roomInitialSync(roomId, limit, callback) {
    if (utils.isFunction(limit)) {
      callback = limit; // legacy

      limit = undefined;
    }

    const path = utils.encodeUri("/rooms/$roomId/initialSync", {
      $roomId: roomId
    });
    return this.http.authedRequest(callback, _httpApi.Method.Get, path, {
      limit: limit?.toString() ?? "30"
    });
  }
  /**
   * Set a marker to indicate the point in a room before which the user has read every
   * event. This can be retrieved from room account data (the event type is `m.fully_read`)
   * and displayed as a horizontal line in the timeline that is visually distinct to the
   * position of the user's own read receipt.
   * @param {string} roomId ID of the room that has been read
   * @param {string} rmEventId ID of the event that has been read
   * @param {string} rrEventId ID of the event tracked by the read receipt. This is here
   * for convenience because the RR and the RM are commonly updated at the same time as
   * each other. Optional.
   * @param {string} rpEventId rpEvent the m.read.private read receipt event for when we
   * don't want other users to see the read receipts. This is experimental. Optional.
   * @return {Promise} Resolves: the empty object, {}.
   */


  async setRoomReadMarkersHttpRequest(roomId, rmEventId, rrEventId, rpEventId) {
    const path = utils.encodeUri("/rooms/$roomId/read_markers", {
      $roomId: roomId
    });
    const content = {
      [_read_receipts.ReceiptType.FullyRead]: rmEventId,
      [_read_receipts.ReceiptType.Read]: rrEventId
    };

    if (await this.doesServerSupportUnstableFeature("org.matrix.msc2285.stable")) {
      content[_read_receipts.ReceiptType.ReadPrivate] = rpEventId;
    }

    return this.http.authedRequest(undefined, _httpApi.Method.Post, path, undefined, content);
  }
  /**
   * @return {Promise} Resolves: A list of the user's current rooms
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getJoinedRooms() {
    const path = utils.encodeUri("/joined_rooms", {});
    return this.http.authedRequest(undefined, _httpApi.Method.Get, path);
  }
  /**
   * Retrieve membership info. for a room.
   * @param {string} roomId ID of the room to get membership for
   * @return {Promise} Resolves: A list of currently joined users
   *                                 and their profile data.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getJoinedRoomMembers(roomId) {
    const path = utils.encodeUri("/rooms/$roomId/joined_members", {
      $roomId: roomId
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Get, path);
  }
  /**
   * @param {Object} options Options for this request
   * @param {string} options.server The remote server to query for the room list.
   *                                Optional. If unspecified, get the local home
   *                                server's public room list.
   * @param {number} options.limit Maximum number of entries to return
   * @param {string} options.since Token to paginate from
   * @param {object} options.filter Filter parameters
   * @param {string} options.filter.generic_search_term String to search for
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  publicRooms(options, callback) {
    if (typeof options == 'function') {
      callback = options;
      options = {};
    }

    if (options === undefined) {
      options = {};
    }

    const queryParams = {};

    if (options.server) {
      queryParams.server = options.server;
      delete options.server;
    }

    if (Object.keys(options).length === 0 && Object.keys(queryParams).length === 0) {
      return this.http.authedRequest(callback, _httpApi.Method.Get, "/publicRooms");
    } else {
      return this.http.authedRequest(callback, _httpApi.Method.Post, "/publicRooms", queryParams, options);
    }
  }
  /**
   * Create an alias to room ID mapping.
   * @param {string} alias The room alias to create.
   * @param {string} roomId The room ID to link the alias to.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  createAlias(alias, roomId, callback) {
    const path = utils.encodeUri("/directory/room/$alias", {
      $alias: alias
    });
    const data = {
      room_id: roomId
    };
    return this.http.authedRequest(callback, _httpApi.Method.Put, path, undefined, data);
  }
  /**
   * Delete an alias to room ID mapping. This alias must be on your local server,
   * and you must have sufficient access to do this operation.
   * @param {string} alias The room alias to delete.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: an empty object {}.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  deleteAlias(alias, callback) {
    const path = utils.encodeUri("/directory/room/$alias", {
      $alias: alias
    });
    return this.http.authedRequest(callback, _httpApi.Method.Delete, path);
  }
  /**
   * Gets the local aliases for the room. Note: this includes all local aliases, unlike the
   * curated list from the m.room.canonical_alias state event.
   * @param {string} roomId The room ID to get local aliases for.
   * @return {Promise} Resolves: an object with an `aliases` property, containing an array of local aliases
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getLocalAliases(roomId) {
    const path = utils.encodeUri("/rooms/$roomId/aliases", {
      $roomId: roomId
    });
    const prefix = _httpApi.PREFIX_V3;
    return this.http.authedRequest(undefined, _httpApi.Method.Get, path, null, null, {
      prefix
    });
  }
  /**
   * Get room info for the given alias.
   * @param {string} alias The room alias to resolve.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: Object with room_id and servers.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getRoomIdForAlias(alias, callback) {
    // eslint-disable-line camelcase
    // TODO: deprecate this or resolveRoomAlias
    const path = utils.encodeUri("/directory/room/$alias", {
      $alias: alias
    });
    return this.http.authedRequest(callback, _httpApi.Method.Get, path);
  }
  /**
   * @param {string} roomAlias
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: Object with room_id and servers.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */
  // eslint-disable-next-line camelcase


  resolveRoomAlias(roomAlias, callback) {
    // TODO: deprecate this or getRoomIdForAlias
    const path = utils.encodeUri("/directory/room/$alias", {
      $alias: roomAlias
    });
    return this.http.request(callback, _httpApi.Method.Get, path);
  }
  /**
   * Get the visibility of a room in the current HS's room directory
   * @param {string} roomId
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getRoomDirectoryVisibility(roomId, callback) {
    const path = utils.encodeUri("/directory/list/room/$roomId", {
      $roomId: roomId
    });
    return this.http.authedRequest(callback, _httpApi.Method.Get, path);
  }
  /**
   * Set the visbility of a room in the current HS's room directory
   * @param {string} roomId
   * @param {string} visibility "public" to make the room visible
   *                 in the public directory, or "private" to make
   *                 it invisible.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setRoomDirectoryVisibility(roomId, visibility, callback) {
    const path = utils.encodeUri("/directory/list/room/$roomId", {
      $roomId: roomId
    });
    return this.http.authedRequest(callback, _httpApi.Method.Put, path, undefined, {
      visibility
    });
  }
  /**
   * Set the visbility of a room bridged to a 3rd party network in
   * the current HS's room directory.
   * @param {string} networkId the network ID of the 3rd party
   *                 instance under which this room is published under.
   * @param {string} roomId
   * @param {string} visibility "public" to make the room visible
   *                 in the public directory, or "private" to make
   *                 it invisible.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: result object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setRoomDirectoryVisibilityAppService(networkId, roomId, visibility, callback) {
    // TODO: Types
    const path = utils.encodeUri("/directory/list/appservice/$networkId/$roomId", {
      $networkId: networkId,
      $roomId: roomId
    });
    return this.http.authedRequest(callback, _httpApi.Method.Put, path, undefined, {
      "visibility": visibility
    });
  }
  /**
   * Query the user directory with a term matching user IDs, display names and domains.
   * @param {object} opts options
   * @param {string} opts.term the term with which to search.
   * @param {number} opts.limit the maximum number of results to return. The server will
   *                 apply a limit if unspecified.
   * @return {Promise} Resolves: an array of results.
   */


  searchUserDirectory(opts) {
    const body = {
      search_term: opts.term
    };

    if (opts.limit !== undefined) {
      body.limit = opts.limit;
    }

    return this.http.authedRequest(undefined, _httpApi.Method.Post, "/user_directory/search", undefined, body);
  }
  /**
   * Upload a file to the media repository on the homeserver.
   *
   * @param {object} file The object to upload. On a browser, something that
   *   can be sent to XMLHttpRequest.send (typically a File).  Under node.js,
   *   a a Buffer, String or ReadStream.
   *
   * @param {object} opts  options object
   *
   * @param {string=} opts.name   Name to give the file on the server. Defaults
   *   to <tt>file.name</tt>.
   *
   * @param {boolean=} opts.includeFilename if false will not send the filename,
   *   e.g for encrypted file uploads where filename leaks are undesirable.
   *   Defaults to true.
   *
   * @param {string=} opts.type   Content-type for the upload. Defaults to
   *   <tt>file.type</tt>, or <tt>applicaton/octet-stream</tt>.
   *
   * @param {boolean=} opts.rawResponse Return the raw body, rather than
   *   parsing the JSON. Defaults to false (except on node.js, where it
   *   defaults to true for backwards compatibility).
   *
   * @param {boolean=} opts.onlyContentUri Just return the content URI,
   *   rather than the whole body. Defaults to false (except on browsers,
   *   where it defaults to true for backwards compatibility). Ignored if
   *   opts.rawResponse is true.
   *
   * @param {Function=} opts.callback Deprecated. Optional. The callback to
   *    invoke on success/failure. See the promise return values for more
   *    information.
   *
   * @param {Function=} opts.progressHandler Optional. Called when a chunk of
   *    data has been uploaded, with an object containing the fields `loaded`
   *    (number of bytes transferred) and `total` (total size, if known).
   *
   * @return {Promise} Resolves to response object, as
   *    determined by this.opts.onlyData, opts.rawResponse, and
   *    opts.onlyContentUri.  Rejects with an error (usually a MatrixError).
   */


  uploadContent(file, opts) {
    return this.http.uploadContent(file, opts);
  }
  /**
   * Cancel a file upload in progress
   * @param {Promise} promise The promise returned from uploadContent
   * @return {boolean} true if canceled, otherwise false
   */


  cancelUpload(promise) {
    return this.http.cancelUpload(promise);
  }
  /**
   * Get a list of all file uploads in progress
   * @return {array} Array of objects representing current uploads.
   * Currently in progress is element 0. Keys:
   *  - promise: The promise associated with the upload
   *  - loaded: Number of bytes uploaded
   *  - total: Total number of bytes to upload
   */


  getCurrentUploads() {
    return this.http.getCurrentUploads();
  }
  /**
   * @param {string} userId
   * @param {string} info The kind of info to retrieve (e.g. 'displayname',
   * 'avatar_url').
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getProfileInfo(userId, info, callback // eslint-disable-next-line camelcase
  ) {
    if (utils.isFunction(info)) {
      callback = info; // legacy

      info = undefined;
    }

    const path = info ? utils.encodeUri("/profile/$userId/$info", {
      $userId: userId,
      $info: info
    }) : utils.encodeUri("/profile/$userId", {
      $userId: userId
    });
    return this.http.authedRequest(callback, _httpApi.Method.Get, path);
  }
  /**
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves to a list of the user's threepids.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getThreePids(callback) {
    return this.http.authedRequest(callback, _httpApi.Method.Get, "/account/3pid");
  }
  /**
   * Add a 3PID to your homeserver account and optionally bind it to an identity
   * server as well. An identity server is required as part of the `creds` object.
   *
   * This API is deprecated, and you should instead use `addThreePidOnly`
   * for homeservers that support it.
   *
   * @param {Object} creds
   * @param {boolean} bind
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: on success
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  addThreePid(creds, bind, callback) {
    // TODO: Types
    const path = "/account/3pid";
    const data = {
      'threePidCreds': creds,
      'bind': bind
    };
    return this.http.authedRequest(callback, _httpApi.Method.Post, path, null, data);
  }
  /**
   * Add a 3PID to your homeserver account. This API does not use an identity
   * server, as the homeserver is expected to handle 3PID ownership validation.
   *
   * You can check whether a homeserver supports this API via
   * `doesServerSupportSeparateAddAndBind`.
   *
   * @param {Object} data A object with 3PID validation data from having called
   * `account/3pid/<medium>/requestToken` on the homeserver.
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  async addThreePidOnly(data) {
    const path = "/account/3pid/add";
    const prefix = (await this.isVersionSupported("r0.6.0")) ? _httpApi.PREFIX_R0 : _httpApi.PREFIX_UNSTABLE;
    return this.http.authedRequest(undefined, _httpApi.Method.Post, path, null, data, {
      prefix
    });
  }
  /**
   * Bind a 3PID for discovery onto an identity server via the homeserver. The
   * identity server handles 3PID ownership validation and the homeserver records
   * the new binding to track where all 3PIDs for the account are bound.
   *
   * You can check whether a homeserver supports this API via
   * `doesServerSupportSeparateAddAndBind`.
   *
   * @param {Object} data A object with 3PID validation data from having called
   * `validate/<medium>/requestToken` on the identity server. It should also
   * contain `id_server` and `id_access_token` fields as well.
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  async bindThreePid(data) {
    const path = "/account/3pid/bind";
    const prefix = (await this.isVersionSupported("r0.6.0")) ? _httpApi.PREFIX_R0 : _httpApi.PREFIX_UNSTABLE;
    return this.http.authedRequest(undefined, _httpApi.Method.Post, path, null, data, {
      prefix
    });
  }
  /**
   * Unbind a 3PID for discovery on an identity server via the homeserver. The
   * homeserver removes its record of the binding to keep an updated record of
   * where all 3PIDs for the account are bound.
   *
   * @param {string} medium The threepid medium (eg. 'email')
   * @param {string} address The threepid address (eg. 'bob@example.com')
   *        this must be as returned by getThreePids.
   * @return {Promise} Resolves: on success
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  async unbindThreePid(medium, address // eslint-disable-next-line camelcase
  ) {
    const path = "/account/3pid/unbind";
    const data = {
      medium,
      address,
      id_server: this.getIdentityServerUrl(true)
    };
    const prefix = (await this.isVersionSupported("r0.6.0")) ? _httpApi.PREFIX_R0 : _httpApi.PREFIX_UNSTABLE;
    return this.http.authedRequest(undefined, _httpApi.Method.Post, path, null, data, {
      prefix
    });
  }
  /**
   * @param {string} medium The threepid medium (eg. 'email')
   * @param {string} address The threepid address (eg. 'bob@example.com')
   *        this must be as returned by getThreePids.
   * @return {Promise} Resolves: The server response on success
   *     (generally the empty JSON object)
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  deleteThreePid(medium, address // eslint-disable-next-line camelcase
  ) {
    const path = "/account/3pid/delete";
    return this.http.authedRequest(undefined, _httpApi.Method.Post, path, null, {
      medium,
      address
    });
  }
  /**
   * Make a request to change your password.
   * @param {Object} authDict
   * @param {string} newPassword The new desired password.
   * @param {boolean} logoutDevices Should all sessions be logged out after the password change. Defaults to true.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setPassword(authDict, newPassword, logoutDevices, callback) {
    if (typeof logoutDevices === 'function') {
      callback = logoutDevices;
    }

    if (typeof logoutDevices !== 'boolean') {
      // Use backwards compatible behaviour of not specifying logout_devices
      // This way it is left up to the server:
      logoutDevices = undefined;
    }

    const path = "/account/password";
    const data = {
      'auth': authDict,
      'new_password': newPassword,
      'logout_devices': logoutDevices
    };
    return this.http.authedRequest(callback, _httpApi.Method.Post, path, null, data);
  }
  /**
   * Gets all devices recorded for the logged-in user
   * @return {Promise} Resolves: result object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getDevices() {
    return this.http.authedRequest(undefined, _httpApi.Method.Get, "/devices");
  }
  /**
   * Gets specific device details for the logged-in user
   * @param {string} deviceId  device to query
   * @return {Promise} Resolves: result object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getDevice(deviceId) {
    const path = utils.encodeUri("/devices/$device_id", {
      $device_id: deviceId
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Get, path);
  }
  /**
   * Update the given device
   *
   * @param {string} deviceId  device to update
   * @param {Object} body       body of request
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */
  // eslint-disable-next-line camelcase


  setDeviceDetails(deviceId, body) {
    const path = utils.encodeUri("/devices/$device_id", {
      $device_id: deviceId
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Put, path, undefined, body);
  }
  /**
   * Delete the given device
   *
   * @param {string} deviceId  device to delete
   * @param {object} auth Optional. Auth data to supply for User-Interactive auth.
   * @return {Promise} Resolves: result object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  deleteDevice(deviceId, auth) {
    const path = utils.encodeUri("/devices/$device_id", {
      $device_id: deviceId
    });
    const body = {};

    if (auth) {
      body.auth = auth;
    }

    return this.http.authedRequest(undefined, _httpApi.Method.Delete, path, undefined, body);
  }
  /**
   * Delete multiple device
   *
   * @param {string[]} devices IDs of the devices to delete
   * @param {object} auth Optional. Auth data to supply for User-Interactive auth.
   * @return {Promise} Resolves: result object
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  deleteMultipleDevices(devices, auth) {
    const body = {
      devices
    };

    if (auth) {
      body.auth = auth;
    }

    const path = "/delete_devices";
    return this.http.authedRequest(undefined, _httpApi.Method.Post, path, undefined, body);
  }
  /**
   * Gets all pushers registered for the logged-in user
   *
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: Array of objects representing pushers
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getPushers(callback) {
    return this.http.authedRequest(callback, _httpApi.Method.Get, "/pushers");
  }
  /**
   * Adds a new pusher or updates an existing pusher
   *
   * @param {IPusherRequest} pusher Object representing a pusher
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: Empty json object on success
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setPusher(pusher, callback) {
    const path = "/pushers/set";
    return this.http.authedRequest(callback, _httpApi.Method.Post, path, null, pusher);
  }
  /**
   * Get the push rules for the account from the server.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves to the push rules.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getPushRules(callback) {
    return this.http.authedRequest(callback, _httpApi.Method.Get, "/pushrules/").then(rules => {
      return _pushprocessor.PushProcessor.rewriteDefaultRules(rules);
    });
  }
  /**
   * @param {string} scope
   * @param {string} kind
   * @param {string} ruleId
   * @param {Object} body
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  addPushRule(scope, kind, ruleId, body, callback) {
    // NB. Scope not uri encoded because devices need the '/'
    const path = utils.encodeUri("/pushrules/" + scope + "/$kind/$ruleId", {
      $kind: kind,
      $ruleId: ruleId
    });
    return this.http.authedRequest(callback, _httpApi.Method.Put, path, undefined, body);
  }
  /**
   * @param {string} scope
   * @param {string} kind
   * @param {string} ruleId
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  deletePushRule(scope, kind, ruleId, callback) {
    // NB. Scope not uri encoded because devices need the '/'
    const path = utils.encodeUri("/pushrules/" + scope + "/$kind/$ruleId", {
      $kind: kind,
      $ruleId: ruleId
    });
    return this.http.authedRequest(callback, _httpApi.Method.Delete, path);
  }
  /**
   * Enable or disable a push notification rule.
   * @param {string} scope
   * @param {string} kind
   * @param {string} ruleId
   * @param {boolean} enabled
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setPushRuleEnabled(scope, kind, ruleId, enabled, callback) {
    const path = utils.encodeUri("/pushrules/" + scope + "/$kind/$ruleId/enabled", {
      $kind: kind,
      $ruleId: ruleId
    });
    return this.http.authedRequest(callback, _httpApi.Method.Put, path, undefined, {
      "enabled": enabled
    });
  }
  /**
   * Set the actions for a push notification rule.
   * @param {string} scope
   * @param {string} kind
   * @param {string} ruleId
   * @param {array} actions
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: to an empty object {}
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  setPushRuleActions(scope, kind, ruleId, actions, callback) {
    const path = utils.encodeUri("/pushrules/" + scope + "/$kind/$ruleId/actions", {
      $kind: kind,
      $ruleId: ruleId
    });
    return this.http.authedRequest(callback, _httpApi.Method.Put, path, undefined, {
      "actions": actions
    });
  }
  /**
   * Perform a server-side search.
   * @param {Object} opts
   * @param {string} opts.next_batch the batch token to pass in the query string
   * @param {Object} opts.body the JSON object to pass to the request body.
   * @param {module:client.callback} callback Optional.
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  search(opts, // eslint-disable-line camelcase
  callback) {
    const queryParams = {};

    if (opts.next_batch) {
      queryParams.next_batch = opts.next_batch;
    }

    return this.http.authedRequest(callback, _httpApi.Method.Post, "/search", queryParams, opts.body);
  }
  /**
   * Upload keys
   *
   * @param {Object} content  body of upload request
   *
   * @param {Object=} opts this method no longer takes any opts,
   *  used to take opts.device_id but this was not removed from the spec as a redundant parameter
   *
   * @param {module:client.callback=} callback
   *
   * @return {Promise} Resolves: result object. Rejects: with
   *     an error response ({@link module:http-api.MatrixError}).
   */


  uploadKeysRequest(content, opts, callback) {
    return this.http.authedRequest(callback, _httpApi.Method.Post, "/keys/upload", undefined, content);
  }

  uploadKeySignatures(content) {
    return this.http.authedRequest(undefined, _httpApi.Method.Post, '/keys/signatures/upload', undefined, content, {
      prefix: _httpApi.PREFIX_UNSTABLE
    });
  }
  /**
   * Download device keys
   *
   * @param {string[]} userIds  list of users to get keys for
   *
   * @param {Object=} opts
   *
   * @param {string=} opts.token   sync token to pass in the query request, to help
   *   the HS give the most recent results
   *
   * @return {Promise} Resolves: result object. Rejects: with
   *     an error response ({@link module:http-api.MatrixError}).
   */


  downloadKeysForUsers(userIds, opts) {
    if (utils.isFunction(opts)) {
      // opts used to be 'callback'.
      throw new Error('downloadKeysForUsers no longer accepts a callback parameter');
    }

    opts = opts || {};
    const content = {
      device_keys: {}
    };

    if ('token' in opts) {
      content.token = opts.token;
    }

    userIds.forEach(u => {
      content.device_keys[u] = [];
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Post, "/keys/query", undefined, content);
  }
  /**
   * Claim one-time keys
   *
   * @param {string[]} devices  a list of [userId, deviceId] pairs
   *
   * @param {string} [keyAlgorithm = signed_curve25519]  desired key type
   *
   * @param {number} [timeout] the time (in milliseconds) to wait for keys from remote
   *     servers
   *
   * @return {Promise} Resolves: result object. Rejects: with
   *     an error response ({@link module:http-api.MatrixError}).
   */


  claimOneTimeKeys(devices, keyAlgorithm = "signed_curve25519", timeout) {
    const queries = {};

    if (keyAlgorithm === undefined) {
      keyAlgorithm = "signed_curve25519";
    }

    for (let i = 0; i < devices.length; ++i) {
      const userId = devices[i][0];
      const deviceId = devices[i][1];
      const query = queries[userId] || {};
      queries[userId] = query;
      query[deviceId] = keyAlgorithm;
    }

    const content = {
      one_time_keys: queries
    };

    if (timeout) {
      content.timeout = timeout;
    }

    const path = "/keys/claim";
    return this.http.authedRequest(undefined, _httpApi.Method.Post, path, undefined, content);
  }
  /**
   * Ask the server for a list of users who have changed their device lists
   * between a pair of sync tokens
   *
   * @param {string} oldToken
   * @param {string} newToken
   *
   * @return {Promise} Resolves: result object. Rejects: with
   *     an error response ({@link module:http-api.MatrixError}).
   */


  getKeyChanges(oldToken, newToken) {
    const qps = {
      from: oldToken,
      to: newToken
    };
    return this.http.authedRequest(undefined, _httpApi.Method.Get, "/keys/changes", qps);
  }

  uploadDeviceSigningKeys(auth, keys) {
    // API returns empty object
    const data = Object.assign({}, keys);
    if (auth) Object.assign(data, {
      auth
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Post, "/keys/device_signing/upload", undefined, data, {
      prefix: _httpApi.PREFIX_UNSTABLE
    });
  }
  /**
   * Register with an identity server using the OpenID token from the user's
   * Homeserver, which can be retrieved via
   * {@link module:client~MatrixClient#getOpenIdToken}.
   *
   * Note that the `/account/register` endpoint (as well as IS authentication in
   * general) was added as part of the v2 API version.
   *
   * @param {object} hsOpenIdToken
   * @return {Promise} Resolves: with object containing an Identity
   * Server access token.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  registerWithIdentityServer(hsOpenIdToken) {
    // TODO: Types
    if (!this.idBaseUrl) {
      throw new Error("No identity server base URL set");
    }

    const uri = this.idBaseUrl + _httpApi.PREFIX_IDENTITY_V2 + "/account/register";
    return this.http.requestOtherUrl(undefined, _httpApi.Method.Post, uri, null, hsOpenIdToken);
  }
  /**
   * Requests an email verification token directly from an identity server.
   *
   * This API is used as part of binding an email for discovery on an identity
   * server. The validation data that results should be passed to the
   * `bindThreePid` method to complete the binding process.
   *
   * @param {string} email The email address to request a token for
   * @param {string} clientSecret A secret binary string generated by the client.
   *                 It is recommended this be around 16 ASCII characters.
   * @param {number} sendAttempt If an identity server sees a duplicate request
   *                 with the same sendAttempt, it will not send another email.
   *                 To request another email to be sent, use a larger value for
   *                 the sendAttempt param as was used in the previous request.
   * @param {string} nextLink Optional If specified, the client will be redirected
   *                 to this link after validation.
   * @param {module:client.callback} callback Optional.
   * @param {string} identityAccessToken The `access_token` field of the identity
   * server `/account/register` response (see {@link registerWithIdentityServer}).
   *
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   * @throws Error if no identity server is set
   */


  requestEmailToken(email, clientSecret, sendAttempt, nextLink, callback, identityAccessToken) {
    // TODO: Types
    const params = {
      client_secret: clientSecret,
      email: email,
      send_attempt: sendAttempt?.toString(),
      next_link: nextLink
    };
    return this.http.idServerRequest(callback, _httpApi.Method.Post, "/validate/email/requestToken", params, _httpApi.PREFIX_IDENTITY_V2, identityAccessToken);
  }
  /**
   * Requests a MSISDN verification token directly from an identity server.
   *
   * This API is used as part of binding a MSISDN for discovery on an identity
   * server. The validation data that results should be passed to the
   * `bindThreePid` method to complete the binding process.
   *
   * @param {string} phoneCountry The ISO 3166-1 alpha-2 code for the country in
   *                 which phoneNumber should be parsed relative to.
   * @param {string} phoneNumber The phone number, in national or international
   *                 format
   * @param {string} clientSecret A secret binary string generated by the client.
   *                 It is recommended this be around 16 ASCII characters.
   * @param {number} sendAttempt If an identity server sees a duplicate request
   *                 with the same sendAttempt, it will not send another SMS.
   *                 To request another SMS to be sent, use a larger value for
   *                 the sendAttempt param as was used in the previous request.
   * @param {string} nextLink Optional If specified, the client will be redirected
   *                 to this link after validation.
   * @param {module:client.callback} callback Optional.
   * @param {string} identityAccessToken The `access_token` field of the Identity
   * Server `/account/register` response (see {@link registerWithIdentityServer}).
   *
   * @return {Promise} Resolves: TODO
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   * @throws Error if no identity server is set
   */


  requestMsisdnToken(phoneCountry, phoneNumber, clientSecret, sendAttempt, nextLink, callback, identityAccessToken) {
    // TODO: Types
    const params = {
      client_secret: clientSecret,
      country: phoneCountry,
      phone_number: phoneNumber,
      send_attempt: sendAttempt?.toString(),
      next_link: nextLink
    };
    return this.http.idServerRequest(callback, _httpApi.Method.Post, "/validate/msisdn/requestToken", params, _httpApi.PREFIX_IDENTITY_V2, identityAccessToken);
  }
  /**
   * Submits a MSISDN token to the identity server
   *
   * This is used when submitting the code sent by SMS to a phone number.
   * The identity server has an equivalent API for email but the js-sdk does
   * not expose this, since email is normally validated by the user clicking
   * a link rather than entering a code.
   *
   * @param {string} sid The sid given in the response to requestToken
   * @param {string} clientSecret A secret binary string generated by the client.
   *                 This must be the same value submitted in the requestToken call.
   * @param {string} msisdnToken The MSISDN token, as enetered by the user.
   * @param {string} identityAccessToken The `access_token` field of the Identity
   * Server `/account/register` response (see {@link registerWithIdentityServer}).
   *
   * @return {Promise} Resolves: Object, currently with no parameters.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   * @throws Error if No identity server is set
   */


  submitMsisdnToken(sid, clientSecret, msisdnToken, identityAccessToken) {
    // TODO: Types
    const params = {
      sid: sid,
      client_secret: clientSecret,
      token: msisdnToken
    };
    return this.http.idServerRequest(undefined, _httpApi.Method.Post, "/validate/msisdn/submitToken", params, _httpApi.PREFIX_IDENTITY_V2, identityAccessToken);
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
   * @param {string} url The URL to submit the token to
   * @param {string} sid The sid given in the response to requestToken
   * @param {string} clientSecret A secret binary string generated by the client.
   *                 This must be the same value submitted in the requestToken call.
   * @param {string} msisdnToken The MSISDN token, as enetered by the user.
   *
   * @return {Promise} Resolves: Object, currently with no parameters.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  submitMsisdnTokenOtherUrl(url, sid, clientSecret, msisdnToken) {
    // TODO: Types
    const params = {
      sid: sid,
      client_secret: clientSecret,
      token: msisdnToken
    };
    return this.http.requestOtherUrl(undefined, _httpApi.Method.Post, url, undefined, params);
  }
  /**
   * Gets the V2 hashing information from the identity server. Primarily useful for
   * lookups.
   * @param {string} identityAccessToken The access token for the identity server.
   * @returns {Promise<object>} The hashing information for the identity server.
   */


  getIdentityHashDetails(identityAccessToken) {
    // TODO: Types
    return this.http.idServerRequest(undefined, _httpApi.Method.Get, "/hash_details", null, _httpApi.PREFIX_IDENTITY_V2, identityAccessToken);
  }
  /**
   * Performs a hashed lookup of addresses against the identity server. This is
   * only supported on identity servers which have at least the version 2 API.
   * @param {Array<Array<string,string>>} addressPairs An array of 2 element arrays.
   * The first element of each pair is the address, the second is the 3PID medium.
   * Eg: ["email@example.org", "email"]
   * @param {string} identityAccessToken The access token for the identity server.
   * @returns {Promise<Array<{address, mxid}>>} A collection of address mappings to
   * found MXIDs. Results where no user could be found will not be listed.
   */


  async identityHashedLookup(addressPairs, identityAccessToken) {
    const params = {// addresses: ["email@example.org", "10005550000"],
      // algorithm: "sha256",
      // pepper: "abc123"
    }; // Get hash information first before trying to do a lookup

    const hashes = await this.getIdentityHashDetails(identityAccessToken);

    if (!hashes || !hashes['lookup_pepper'] || !hashes['algorithms']) {
      throw new Error("Unsupported identity server: bad response");
    }

    params['pepper'] = hashes['lookup_pepper'];
    const localMapping = {// hashed identifier => plain text address
      // For use in this function's return format
    }; // When picking an algorithm, we pick the hashed over no hashes

    if (hashes['algorithms'].includes('sha256')) {
      // Abuse the olm hashing
      const olmutil = new global.Olm.Utility();
      params["addresses"] = addressPairs.map(p => {
        const addr = p[0].toLowerCase(); // lowercase to get consistent hashes

        const med = p[1].toLowerCase();
        const hashed = olmutil.sha256(`${addr} ${med} ${params['pepper']}`).replace(/\+/g, '-').replace(/\//g, '_'); // URL-safe base64
        // Map the hash to a known (case-sensitive) address. We use the case
        // sensitive version because the caller might be expecting that.

        localMapping[hashed] = p[0];
        return hashed;
      });
      params["algorithm"] = "sha256";
    } else if (hashes['algorithms'].includes('none')) {
      params["addresses"] = addressPairs.map(p => {
        const addr = p[0].toLowerCase(); // lowercase to get consistent hashes

        const med = p[1].toLowerCase();
        const unhashed = `${addr} ${med}`; // Map the unhashed values to a known (case-sensitive) address. We use
        // the case sensitive version because the caller might be expecting that.

        localMapping[unhashed] = p[0];
        return unhashed;
      });
      params["algorithm"] = "none";
    } else {
      throw new Error("Unsupported identity server: unknown hash algorithm");
    }

    const response = await this.http.idServerRequest(undefined, _httpApi.Method.Post, "/lookup", params, _httpApi.PREFIX_IDENTITY_V2, identityAccessToken);
    if (!response || !response['mappings']) return []; // no results

    const foundAddresses = [
      /* {address: "plain@example.org", mxid} */
    ];

    for (const hashed of Object.keys(response['mappings'])) {
      const mxid = response['mappings'][hashed];
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
   * @param {string} medium The medium of the threepid, eg. 'email'
   * @param {string} address The textual address of the threepid
   * @param {module:client.callback} callback Optional.
   * @param {string} identityAccessToken The `access_token` field of the Identity
   * Server `/account/register` response (see {@link registerWithIdentityServer}).
   *
   * @return {Promise} Resolves: A threepid mapping
   *                                 object or the empty object if no mapping
   *                                 exists
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  async lookupThreePid(medium, address, callback, identityAccessToken) {
    // TODO: Types
    // Note: we're using the V2 API by calling this function, but our
    // function contract requires a V1 response. We therefore have to
    // convert it manually.
    const response = await this.identityHashedLookup([[address, medium]], identityAccessToken);
    const result = response.find(p => p.address === address);

    if (!result) {
      if (callback) callback(null, {});
      return {};
    }

    const mapping = {
      address,
      medium,
      mxid: result.mxid // We can't reasonably fill these parameters:
      // not_before
      // not_after
      // ts
      // signatures

    };
    if (callback) callback(null, mapping);
    return mapping;
  }
  /**
   * Looks up the public Matrix ID mappings for multiple 3PIDs.
   *
   * @param {Array.<Array.<string>>} query Array of arrays containing
   * [medium, address]
   * @param {string} identityAccessToken The `access_token` field of the Identity
   * Server `/account/register` response (see {@link registerWithIdentityServer}).
   *
   * @return {Promise} Resolves: Lookup results from IS.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  async bulkLookupThreePids(query, identityAccessToken) {
    // TODO: Types
    // Note: we're using the V2 API by calling this function, but our
    // function contract requires a V1 response. We therefore have to
    // convert it manually.
    const response = await this.identityHashedLookup( // We have to reverse the query order to get [address, medium] pairs
    query.map(p => [p[1], p[0]]), identityAccessToken);
    const v1results = [];

    for (const mapping of response) {
      const originalQuery = query.find(p => p[1] === mapping.address);

      if (!originalQuery) {
        throw new Error("Identity sever returned unexpected results");
      }

      v1results.push([originalQuery[0], // medium
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
   * @param {string} identityAccessToken The `access_token` field of the Identity
   * Server `/account/register` response (see {@link registerWithIdentityServer}).
   *
   * @return {Promise} Resolves: an object with account info.
   * @return {module:http-api.MatrixError} Rejects: with an error response.
   */


  getIdentityAccount(identityAccessToken) {
    // TODO: Types
    return this.http.idServerRequest(undefined, _httpApi.Method.Get, "/account", undefined, _httpApi.PREFIX_IDENTITY_V2, identityAccessToken);
  }
  /**
   * Send an event to a specific list of devices.
   * This is a low-level API that simply wraps the HTTP API
   * call to send to-device messages. We recommend using
   * queueToDevice() which is a higher level API.
   *
   * @param {string} eventType  type of event to send
   * @param {Object.<string, Object<string, Object>>} contentMap
   *    content to send. Map from user_id to device_id to content object.
   * @param {string=} txnId     transaction id. One will be made up if not
   *    supplied.
   * @return {Promise} Resolves: to an empty object {}
   */


  sendToDevice(eventType, contentMap, txnId) {
    const path = utils.encodeUri("/sendToDevice/$eventType/$txnId", {
      $eventType: eventType,
      $txnId: txnId ? txnId : this.makeTxnId()
    });
    const body = {
      messages: contentMap
    };
    const targets = Object.keys(contentMap).reduce((obj, key) => {
      obj[key] = Object.keys(contentMap[key]);
      return obj;
    }, {});

    _logger.logger.log(`PUT ${path}`, targets);

    return this.http.authedRequest(undefined, _httpApi.Method.Put, path, undefined, body);
  }
  /**
   * Sends events directly to specific devices using Matrix's to-device
   * messaging system. The batch will be split up into appropriately sized
   * batches for sending and stored in the store so they can be retried
   * later if they fail to send. Retries will happen automatically.
   * @param batch The to-device messages to send
   */


  queueToDevice(batch) {
    return this.toDeviceMessageQueue.queueBatch(batch);
  }
  /**
   * Get the third party protocols that can be reached using
   * this HS
   * @return {Promise} Resolves to the result object
   */


  getThirdpartyProtocols() {
    return this.http.authedRequest(undefined, _httpApi.Method.Get, "/thirdparty/protocols").then(response => {
      // sanity check
      if (!response || typeof response !== 'object') {
        throw new Error(`/thirdparty/protocols did not return an object: ${response}`);
      }

      return response;
    });
  }
  /**
   * Get information on how a specific place on a third party protocol
   * may be reached.
   * @param {string} protocol The protocol given in getThirdpartyProtocols()
   * @param {object} params Protocol-specific parameters, as given in the
   *                        response to getThirdpartyProtocols()
   * @return {Promise} Resolves to the result object
   */


  getThirdpartyLocation(protocol, params) {
    const path = utils.encodeUri("/thirdparty/location/$protocol", {
      $protocol: protocol
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Get, path, params);
  }
  /**
   * Get information on how a specific user on a third party protocol
   * may be reached.
   * @param {string} protocol The protocol given in getThirdpartyProtocols()
   * @param {object} params Protocol-specific parameters, as given in the
   *                        response to getThirdpartyProtocols()
   * @return {Promise} Resolves to the result object
   */


  getThirdpartyUser(protocol, params) {
    // TODO: Types
    const path = utils.encodeUri("/thirdparty/user/$protocol", {
      $protocol: protocol
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Get, path, params);
  }

  getTerms(serviceType, baseUrl) {
    // TODO: Types
    const url = this.termsUrlForService(serviceType, baseUrl);
    return this.http.requestOtherUrl(undefined, _httpApi.Method.Get, url);
  }

  agreeToTerms(serviceType, baseUrl, accessToken, termsUrls) {
    // TODO: Types
    const url = this.termsUrlForService(serviceType, baseUrl);
    const headers = {
      Authorization: "Bearer " + accessToken
    };
    return this.http.requestOtherUrl(undefined, _httpApi.Method.Post, url, null, {
      user_accepts: termsUrls
    }, {
      headers
    });
  }
  /**
   * Reports an event as inappropriate to the server, which may then notify the appropriate people.
   * @param {string} roomId The room in which the event being reported is located.
   * @param {string} eventId The event to report.
   * @param {number} score The score to rate this content as where -100 is most offensive and 0 is inoffensive.
   * @param {string} reason The reason the content is being reported. May be blank.
   * @returns {Promise} Resolves to an empty object if successful
   */


  reportEvent(roomId, eventId, score, reason) {
    const path = utils.encodeUri("/rooms/$roomId/report/$eventId", {
      $roomId: roomId,
      $eventId: eventId
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Post, path, null, {
      score,
      reason
    });
  }
  /**
   * Fetches or paginates a room hierarchy as defined by MSC2946.
   * Falls back gracefully to sourcing its data from `getSpaceSummary` if this API is not yet supported by the server.
   * @param {string} roomId The ID of the space-room to use as the root of the summary.
   * @param {number?} limit The maximum number of rooms to return per page.
   * @param {number?} maxDepth The maximum depth in the tree from the root room to return.
   * @param {boolean?} suggestedOnly Whether to only return rooms with suggested=true.
   * @param {string?} fromToken The opaque token to paginate a previous request.
   * @returns {Promise} the response, with next_batch & rooms fields.
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
    return this.http.authedRequest(undefined, _httpApi.Method.Get, path, queryParams, undefined, {
      prefix: _httpApi.PREFIX_V1
    }).catch(e => {
      if (e.errcode === "M_UNRECOGNIZED") {
        // fall back to the prefixed hierarchy API.
        return this.http.authedRequest(undefined, _httpApi.Method.Get, path, queryParams, undefined, {
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
   * @param {string} name The name of the tree space.
   * @returns {Promise<MSC3089TreeSpace>} Resolves to the created space.
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
   * @param {string} roomId The room ID to get a tree space reference for.
   * @returns {MSC3089TreeSpace} The tree space, or null if not a tree space.
   */


  unstableGetFileTreeSpace(roomId) {
    const room = this.getRoom(roomId);
    if (room?.getMyMembership() !== 'join') return null;
    const createEvent = room.currentState.getStateEvents(_event2.EventType.RoomCreate, "");
    const purposeEvent = room.currentState.getStateEvents(_event2.UNSTABLE_MSC3088_PURPOSE.name, _event2.UNSTABLE_MSC3089_TREE_SUBTYPE.name);
    if (!createEvent) throw new Error("Expected single room create event");
    if (!purposeEvent?.getContent()?.[_event2.UNSTABLE_MSC3088_ENABLED.name]) return null;
    if (createEvent.getContent()?.[_event2.RoomCreateTypeField] !== _event2.RoomType.Space) return null;
    return new _MSC3089TreeSpace.MSC3089TreeSpace(this, roomId);
  }
  /**
   * Perform a single MSC3575 sliding sync request.
   * @param {MSC3575SlidingSyncRequest} req The request to make.
   * @param {string} proxyBaseUrl The base URL for the sliding sync proxy.
   * @returns {MSC3575SlidingSyncResponse} The sliding sync response, or a standard error.
   * @throws on non 2xx status codes with an object with a field "httpStatus":number.
   */


  slidingSync(req, proxyBaseUrl) {
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
    return this.http.authedRequest(undefined, _httpApi.Method.Post, "/sync", qps, req, {
      prefix: "/_matrix/client/unstable/org.matrix.msc3575",
      baseUrl: proxyBaseUrl,
      localTimeoutMs: clientTimeout
    });
  }
  /**
   * @experimental
   */


  supportsExperimentalThreads() {
    return this.clientOpts?.experimentalThreadSupport || false;
  }
  /**
   * Fetches the summary of a room as defined by an initial version of MSC3266 and implemented in Synapse
   * Proposed at https://github.com/matrix-org/matrix-doc/pull/3266
   * @param {string} roomIdOrAlias The ID or alias of the room to get the summary of.
   * @param {string[]?} via The list of servers which know about the room if only an ID was provided.
   */


  async getRoomSummary(roomIdOrAlias, via) {
    const path = utils.encodeUri("/rooms/$roomid/summary", {
      $roomid: roomIdOrAlias
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Get, path, {
      via
    }, null, {
      qsStringifyOptions: {
        arrayFormat: 'repeat'
      },
      prefix: "/_matrix/client/unstable/im.nheko.summary"
    });
  }
  /**
   * @experimental
   */


  processThreadEvents(room, threadedEvents, toStartOfTimeline) {
    room.processThreadedEvents(threadedEvents, toStartOfTimeline);
  }

  processBeaconEvents(room, events) {
    if (!events?.length) return;
    if (!room) return;
    room.currentState.processBeaconEvents(events, this);
  }
  /**
   * Fetches the user_id of the configured access token.
   */


  async whoami() {
    // eslint-disable-line camelcase
    return this.http.authedRequest(undefined, _httpApi.Method.Get, "/account/whoami");
  }
  /**
   * Find the event_id closest to the given timestamp in the given direction.
   * @return {Promise} A promise of an object containing the event_id and
   *    origin_server_ts of the closest event to the timestamp in the given
   *    direction
   */


  timestampToEvent(roomId, timestamp, dir) {
    const path = utils.encodeUri("/rooms/$roomId/timestamp_to_event", {
      $roomId: roomId
    });
    return this.http.authedRequest(undefined, _httpApi.Method.Get, path, {
      ts: timestamp.toString(),
      dir: dir
    }, undefined, {
      prefix: "/_matrix/client/unstable/org.matrix.msc3030"
    });
  }

}
/**
 * Fires whenever the SDK receives a new event.
 * <p>
 * This is only fired for live events received via /sync - it is not fired for
 * events received over context, search, or pagination APIs.
 *
 * @event module:client~MatrixClient#"event"
 * @param {MatrixEvent} event The matrix event which caused this event to fire.
 * @example
 * matrixClient.on("event", function(event){
 *   var sender = event.getSender();
 * });
 */

/**
 * Fires whenever the SDK receives a new to-device event.
 * @event module:client~MatrixClient#"toDeviceEvent"
 * @param {MatrixEvent} event The matrix event which caused this event to fire.
 * @example
 * matrixClient.on("toDeviceEvent", function(event){
 *   var sender = event.getSender();
 * });
 */

/**
 * Fires whenever the SDK's syncing state is updated. The state can be one of:
 * <ul>
 *
 * <li>PREPARED: The client has synced with the server at least once and is
 * ready for methods to be called on it. This will be immediately followed by
 * a state of SYNCING. <i>This is the equivalent of "syncComplete" in the
 * previous API.</i></li>
 *
 * <li>CATCHUP: The client has detected the connection to the server might be
 * available again and will now try to do a sync again. As this sync might take
 * a long time (depending how long ago was last synced, and general server
 * performance) the client is put in this mode so the UI can reflect trying
 * to catch up with the server after losing connection.</li>
 *
 * <li>SYNCING : The client is currently polling for new events from the server.
 * This will be called <i>after</i> processing latest events from a sync.</li>
 *
 * <li>ERROR : The client has had a problem syncing with the server. If this is
 * called <i>before</i> PREPARED then there was a problem performing the initial
 * sync. If this is called <i>after</i> PREPARED then there was a problem polling
 * the server for updates. This may be called multiple times even if the state is
 * already ERROR. <i>This is the equivalent of "syncError" in the previous
 * API.</i></li>
 *
 * <li>RECONNECTING: The sync connection has dropped, but not (yet) in a way that
 * should be considered erroneous.
 * </li>
 *
 * <li>STOPPED: The client has stopped syncing with server due to stopClient
 * being called.
 * </li>
 * </ul>
 * State transition diagram:
 * <pre>
 *                                          +---->STOPPED
 *                                          |
 *              +----->PREPARED -------> SYNCING <--+
 *              |                        ^  |  ^    |
 *              |      CATCHUP ----------+  |  |    |
 *              |        ^                  V  |    |
 *   null ------+        |  +------- RECONNECTING   |
 *              |        V  V                       |
 *              +------->ERROR ---------------------+
 *
 * NB: 'null' will never be emitted by this event.
 *
 * </pre>
 * Transitions:
 * <ul>
 *
 * <li><code>null -> PREPARED</code> : Occurs when the initial sync is completed
 * first time. This involves setting up filters and obtaining push rules.
 *
 * <li><code>null -> ERROR</code> : Occurs when the initial sync failed first time.
 *
 * <li><code>ERROR -> PREPARED</code> : Occurs when the initial sync succeeds
 * after previously failing.
 *
 * <li><code>PREPARED -> SYNCING</code> : Occurs immediately after transitioning
 * to PREPARED. Starts listening for live updates rather than catching up.
 *
 * <li><code>SYNCING -> RECONNECTING</code> : Occurs when the live update fails.
 *
 * <li><code>RECONNECTING -> RECONNECTING</code> : Can occur if the update calls
 * continue to fail, but the keepalive calls (to /versions) succeed.
 *
 * <li><code>RECONNECTING -> ERROR</code> : Occurs when the keepalive call also fails
 *
 * <li><code>ERROR -> SYNCING</code> : Occurs when the client has performed a
 * live update after having previously failed.
 *
 * <li><code>ERROR -> ERROR</code> : Occurs when the client has failed to keepalive
 * for a second time or more.</li>
 *
 * <li><code>SYNCING -> SYNCING</code> : Occurs when the client has performed a live
 * update. This is called <i>after</i> processing.</li>
 *
 * <li><code>* -> STOPPED</code> : Occurs once the client has stopped syncing or
 * trying to sync after stopClient has been called.</li>
 * </ul>
 *
 * @event module:client~MatrixClient#"sync"
 *
 * @param {string} state An enum representing the syncing state. One of "PREPARED",
 * "SYNCING", "ERROR", "STOPPED".
 *
 * @param {?string} prevState An enum representing the previous syncing state.
 * One of "PREPARED", "SYNCING", "ERROR", "STOPPED" <b>or null</b>.
 *
 * @param {?Object} data Data about this transition.
 *
 * @param {MatrixError} data.error The matrix error if <code>state=ERROR</code>.
 *
 * @param {String} data.oldSyncToken The 'since' token passed to /sync.
 *    <code>null</code> for the first successful sync since this client was
 *    started. Only present if <code>state=PREPARED</code> or
 *    <code>state=SYNCING</code>.
 *
 * @param {String} data.nextSyncToken The 'next_batch' result from /sync, which
 *    will become the 'since' token for the next call to /sync. Only present if
 *    <code>state=PREPARED</code> or <code>state=SYNCING</code>.
 *
 * @param {boolean} data.catchingUp True if we are working our way through a
 *    backlog of events after connecting. Only present if <code>state=SYNCING</code>.
 *
 * @example
 * matrixClient.on("sync", function(state, prevState, data) {
 *   switch (state) {
 *     case "ERROR":
 *       // update UI to say "Connection Lost"
 *       break;
 *     case "SYNCING":
 *       // update UI to remove any "Connection Lost" message
 *       break;
 *     case "PREPARED":
 *       // the client instance is ready to be queried.
 *       var rooms = matrixClient.getRooms();
 *       break;
 *   }
 * });
 */

/**
 * Fires whenever a new Room is added. This will fire when you are invited to a
 * room, as well as when you join a room. <strong>This event is experimental and
 * may change.</strong>
 * @event module:client~MatrixClient#"Room"
 * @param {Room} room The newly created, fully populated room.
 * @example
 * matrixClient.on("Room", function(room){
 *   var roomId = room.roomId;
 * });
 */

/**
 * Fires whenever a Room is removed. This will fire when you forget a room.
 * <strong>This event is experimental and may change.</strong>
 * @event module:client~MatrixClient#"deleteRoom"
 * @param {string} roomId The deleted room ID.
 * @example
 * matrixClient.on("deleteRoom", function(roomId){
 *   // update UI from getRooms()
 * });
 */

/**
 * Fires whenever an incoming call arrives.
 * @event module:client~MatrixClient#"Call.incoming"
 * @param {module:webrtc/call~MatrixCall} call The incoming call.
 * @example
 * matrixClient.on("Call.incoming", function(call){
 *   call.answer(); // auto-answer
 * });
 */

/**
 * Fires whenever the login session the JS SDK is using is no
 * longer valid and the user must log in again.
 * NB. This only fires when action is required from the user, not
 * when then login session can be renewed by using a refresh token.
 * @event module:client~MatrixClient#"Session.logged_out"
 * @example
 * matrixClient.on("Session.logged_out", function(errorObj){
 *   // show the login screen
 * });
 */

/**
 * Fires when the JS SDK receives a M_CONSENT_NOT_GIVEN error in response
 * to a HTTP request.
 * @event module:client~MatrixClient#"no_consent"
 * @example
 * matrixClient.on("no_consent", function(message, contentUri) {
 *     console.info(message + ' Go to ' + contentUri);
 * });
 */

/**
 * Fires when a device is marked as verified/unverified/blocked/unblocked by
 * {@link module:client~MatrixClient#setDeviceVerified|MatrixClient.setDeviceVerified} or
 * {@link module:client~MatrixClient#setDeviceBlocked|MatrixClient.setDeviceBlocked}.
 *
 * @event module:client~MatrixClient#"deviceVerificationChanged"
 * @param {string} userId the owner of the verified device
 * @param {string} deviceId the id of the verified device
 * @param {module:crypto/deviceinfo} deviceInfo updated device information
 */

/**
 * Fires when the trust status of a user changes
 * If userId is the userId of the logged in user, this indicated a change
 * in the trust status of the cross-signing data on the account.
 *
 * The cross-signing API is currently UNSTABLE and may change without notice.
 *
 * @event module:client~MatrixClient#"userTrustStatusChanged"
 * @param {string} userId the userId of the user in question
 * @param {UserTrustLevel} trustLevel The new trust level of the user
 */

/**
 * Fires when the user's cross-signing keys have changed or cross-signing
 * has been enabled/disabled. The client can use getStoredCrossSigningForUser
 * with the user ID of the logged in user to check if cross-signing is
 * enabled on the account. If enabled, it can test whether the current key
 * is trusted using with checkUserTrust with the user ID of the logged
 * in user. The checkOwnCrossSigningTrust function may be used to reconcile
 * the trust in the account key.
 *
 * The cross-signing API is currently UNSTABLE and may change without notice.
 *
 * @event module:client~MatrixClient#"crossSigning.keysChanged"
 */

/**
 * Fires whenever new user-scoped account_data is added.
 * @event module:client~MatrixClient#"accountData"
 * @param {MatrixEvent} event The event describing the account_data just added
 * @param {MatrixEvent} event The previous account data, if known.
 * @example
 * matrixClient.on("accountData", function(event, oldEvent){
 *   myAccountData[event.type] = event.content;
 * });
 */

/**
 * Fires whenever the stored devices for a user have changed
 * @event module:client~MatrixClient#"crypto.devicesUpdated"
 * @param {String[]} users A list of user IDs that were updated
 * @param {boolean} initialFetch If true, the store was empty (apart
 *     from our own device) and has been seeded.
 */

/**
 * Fires whenever the stored devices for a user will be updated
 * @event module:client~MatrixClient#"crypto.willUpdateDevices"
 * @param {String[]} users A list of user IDs that will be updated
 * @param {boolean} initialFetch If true, the store is empty (apart
 *     from our own device) and is being seeded.
 */

/**
 * Fires whenever the status of e2e key backup changes, as returned by getKeyBackupEnabled()
 * @event module:client~MatrixClient#"crypto.keyBackupStatus"
 * @param {boolean} enabled true if key backup has been enabled, otherwise false
 * @example
 * matrixClient.on("crypto.keyBackupStatus", function(enabled){
 *   if (enabled) {
 *     [...]
 *   }
 * });
 */

/**
 * Fires when we want to suggest to the user that they restore their megolm keys
 * from backup or by cross-signing the device.
 *
 * @event module:client~MatrixClient#"crypto.suggestKeyRestore"
 */

/**
 * Fires when a key verification is requested.
 * @event module:client~MatrixClient#"crypto.verification.request"
 * @param {object} data
 * @param {MatrixEvent} data.event the original verification request message
 * @param {Array} data.methods the verification methods that can be used
 * @param {Number} data.timeout the amount of milliseconds that should be waited
 *                 before cancelling the request automatically.
 * @param {Function} data.beginKeyVerification a function to call if a key
 *     verification should be performed.  The function takes one argument: the
 *     name of the key verification method (taken from data.methods) to use.
 * @param {Function} data.cancel a function to call if the key verification is
 *     rejected.
 */

/**
 * Fires when a key verification is requested with an unknown method.
 * @event module:client~MatrixClient#"crypto.verification.request.unknown"
 * @param {string} userId the user ID who requested the key verification
 * @param {Function} cancel a function that will send a cancellation message to
 *     reject the key verification.
 */

/**
 * Fires when a secret request has been cancelled.  If the client is prompting
 * the user to ask whether they want to share a secret, the prompt can be
 * dismissed.
 *
 * The Secure Secret Storage API is currently UNSTABLE and may change without notice.
 *
 * @event module:client~MatrixClient#"crypto.secrets.requestCancelled"
 * @param {object} data
 * @param {string} data.user_id The user ID of the client that had requested the secret.
 * @param {string} data.device_id The device ID of the client that had requested the
 *     secret.
 * @param {string} data.request_id The ID of the original request.
 */

/**
 * Fires when the client .well-known info is fetched.
 *
 * @event module:client~MatrixClient#"WellKnown.client"
 * @param {object} data The JSON object returned by the server
 */


exports.MatrixClient = MatrixClient;

_defineProperty(MatrixClient, "RESTORE_BACKUP_ERROR_BAD_KEY", 'RESTORE_BACKUP_ERROR_BAD_KEY');