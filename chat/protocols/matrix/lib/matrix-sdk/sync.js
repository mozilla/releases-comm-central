"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SyncState = exports.SyncApi = exports.SetPresence = void 0;
exports._createAndReEmitRoom = _createAndReEmitRoom;
exports.defaultClientOpts = defaultClientOpts;
exports.defaultSyncApiOpts = defaultSyncApiOpts;
var _user = require("./models/user");
var _room = require("./models/room");
var _utils = require("./utils");
var _filter = require("./filter");
var _eventTimeline = require("./models/event-timeline");
var _logger = require("./logger");
var _errors = require("./errors");
var _client = require("./client");
var _httpApi = require("./http-api");
var _event = require("./@types/event");
var _roomState = require("./models/room-state");
var _roomMember = require("./models/room-member");
var _beacon = require("./models/beacon");
var _sync = require("./@types/sync");
var _feature = require("./feature");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2015 - 2023 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/ /*
 * TODO:
 * This class mainly serves to take all the syncing logic out of client.js and
 * into a separate file. It's all very fluid, and this class gut wrenches a lot
 * of MatrixClient props (e.g. http). Given we want to support WebSockets as
 * an alternative syncing API, we may want to have a proper syncing interface
 * for HTTP and WS at some point.
 */
const DEBUG = true;

// /sync requests allow you to set a timeout= but the request may continue
// beyond that and wedge forever, so we need to track how long we are willing
// to keep open the connection. This constant is *ADDED* to the timeout= value
// to determine the max time we're willing to wait.
const BUFFER_PERIOD_MS = 80 * 1000;

// Number of consecutive failed syncs that will lead to a syncState of ERROR as opposed
// to RECONNECTING. This is needed to inform the client of server issues when the
// keepAlive is successful but the server /sync fails.
const FAILED_SYNC_ERROR_THRESHOLD = 3;
let SyncState = exports.SyncState = /*#__PURE__*/function (SyncState) {
  SyncState["Error"] = "ERROR";
  SyncState["Prepared"] = "PREPARED";
  SyncState["Stopped"] = "STOPPED";
  SyncState["Syncing"] = "SYNCING";
  SyncState["Catchup"] = "CATCHUP";
  SyncState["Reconnecting"] = "RECONNECTING";
  return SyncState;
}({}); // Room versions where "insertion", "batch", and "marker" events are controlled
// by power-levels. MSC2716 is supported in existing room versions but they
// should only have special meaning when the room creator sends them.
const MSC2716_ROOM_VERSIONS = ["org.matrix.msc2716v3"];
function getFilterName(userId, suffix) {
  // scope this on the user ID because people may login on many accounts
  // and they all need to be stored!
  return `FILTER_SYNC_${userId}` + (suffix ? "_" + suffix : "");
}

/* istanbul ignore next */
function debuglog(...params) {
  if (!DEBUG) return;
  _logger.logger.log(...params);
}

/**
 * Options passed into the constructor of SyncApi by MatrixClient
 */
let SetPresence = exports.SetPresence = /*#__PURE__*/function (SetPresence) {
  SetPresence["Offline"] = "offline";
  SetPresence["Online"] = "online";
  SetPresence["Unavailable"] = "unavailable";
  return SetPresence;
}({});
/** add default settings to an IStoredClientOpts */
function defaultClientOpts(opts) {
  return _objectSpread({
    initialSyncLimit: 8,
    resolveInvitesToProfiles: false,
    pollTimeout: 30 * 1000,
    pendingEventOrdering: _client.PendingEventOrdering.Chronological,
    threadSupport: false
  }, opts);
}
function defaultSyncApiOpts(syncOpts) {
  return _objectSpread({
    canResetEntireTimeline: _roomId => false
  }, syncOpts);
}
class SyncApi {
  /**
   * Construct an entity which is able to sync with a homeserver.
   * @param client - The matrix client instance to use.
   * @param opts - client config options
   * @param syncOpts - sync-specific options passed by the client
   * @internal
   */
  constructor(client, opts, syncOpts) {
    this.client = client;
    _defineProperty(this, "opts", void 0);
    _defineProperty(this, "syncOpts", void 0);
    _defineProperty(this, "_peekRoom", null);
    _defineProperty(this, "currentSyncRequest", void 0);
    _defineProperty(this, "abortController", void 0);
    _defineProperty(this, "syncState", null);
    _defineProperty(this, "syncStateData", void 0);
    // additional data (eg. error object for failed sync)
    _defineProperty(this, "catchingUp", false);
    _defineProperty(this, "running", false);
    _defineProperty(this, "keepAliveTimer", void 0);
    _defineProperty(this, "connectionReturnedDefer", void 0);
    _defineProperty(this, "notifEvents", []);
    // accumulator of sync events in the current sync response
    _defineProperty(this, "failedSyncCount", 0);
    // Number of consecutive failed /sync requests
    _defineProperty(this, "storeIsInvalid", false);
    // flag set if the store needs to be cleared before we can start
    _defineProperty(this, "presence", void 0);
    _defineProperty(this, "getPushRules", async () => {
      try {
        debuglog("Getting push rules...");
        const result = await this.client.getPushRules();
        debuglog("Got push rules");
        this.client.pushRules = result;
      } catch (err) {
        _logger.logger.error("Getting push rules failed", err);
        if (this.shouldAbortSync(err)) return;
        // wait for saved sync to complete before doing anything else,
        // otherwise the sync state will end up being incorrect
        debuglog("Waiting for saved sync before retrying push rules...");
        await this.recoverFromSyncStartupError(this.savedSyncPromise, err);
        return this.getPushRules(); // try again
      }
    });
    _defineProperty(this, "buildDefaultFilter", () => {
      const filter = new _filter.Filter(this.client.credentials.userId);
      if (this.client.canSupport.get(_feature.Feature.ThreadUnreadNotifications) !== _feature.ServerSupport.Unsupported) {
        filter.setUnreadThreadNotifications(true);
      }
      return filter;
    });
    _defineProperty(this, "checkLazyLoadStatus", async () => {
      debuglog("Checking lazy load status...");
      if (this.opts.lazyLoadMembers && this.client.isGuest()) {
        this.opts.lazyLoadMembers = false;
      }
      if (this.opts.lazyLoadMembers) {
        debuglog("Enabling lazy load on sync filter...");
        if (!this.opts.filter) {
          this.opts.filter = this.buildDefaultFilter();
        }
        this.opts.filter.setLazyLoadMembers(true);
      }
      // need to vape the store when enabling LL and wasn't enabled before
      debuglog("Checking whether lazy loading has changed in store...");
      const shouldClear = await this.wasLazyLoadingToggled(this.opts.lazyLoadMembers);
      if (shouldClear) {
        this.storeIsInvalid = true;
        const error = new _errors.InvalidStoreError(_errors.InvalidStoreState.ToggledLazyLoading, !!this.opts.lazyLoadMembers);
        this.updateSyncState(SyncState.Error, {
          error
        });
        // bail out of the sync loop now: the app needs to respond to this error.
        // we leave the state as 'ERROR' which isn't great since this normally means
        // we're retrying. The client must be stopped before clearing the stores anyway
        // so the app should stop the client, clear the store and start it again.
        _logger.logger.warn("InvalidStoreError: store is not usable: stopping sync.");
        return;
      }
      if (this.opts.lazyLoadMembers) {
        this.syncOpts.crypto?.enableLazyLoading();
      }
      try {
        debuglog("Storing client options...");
        await this.client.storeClientOptions();
        debuglog("Stored client options");
      } catch (err) {
        _logger.logger.error("Storing client options failed", err);
        throw err;
      }
    });
    _defineProperty(this, "getFilter", async () => {
      debuglog("Getting filter...");
      let filter;
      if (this.opts.filter) {
        filter = this.opts.filter;
      } else {
        filter = this.buildDefaultFilter();
      }
      let filterId;
      try {
        filterId = await this.client.getOrCreateFilter(getFilterName(this.client.credentials.userId), filter);
      } catch (err) {
        _logger.logger.error("Getting filter failed", err);
        if (this.shouldAbortSync(err)) return {};
        // wait for saved sync to complete before doing anything else,
        // otherwise the sync state will end up being incorrect
        debuglog("Waiting for saved sync before retrying filter...");
        await this.recoverFromSyncStartupError(this.savedSyncPromise, err);
        return this.getFilter(); // try again
      }
      return {
        filter,
        filterId
      };
    });
    _defineProperty(this, "savedSyncPromise", void 0);
    /**
     * Event handler for the 'online' event
     * This event is generally unreliable and precise behaviour
     * varies between browsers, so we poll for connectivity too,
     * but this might help us reconnect a little faster.
     */
    _defineProperty(this, "onOnline", () => {
      debuglog("Browser thinks we are back online");
      this.startKeepAlives(0);
    });
    this.opts = defaultClientOpts(opts);
    this.syncOpts = defaultSyncApiOpts(syncOpts);
    if (client.getNotifTimelineSet()) {
      client.reEmitter.reEmit(client.getNotifTimelineSet(), [_room.RoomEvent.Timeline, _room.RoomEvent.TimelineReset]);
    }
  }
  createRoom(roomId) {
    const room = _createAndReEmitRoom(this.client, roomId, this.opts);
    room.on(_roomState.RoomStateEvent.Marker, (markerEvent, markerFoundOptions) => {
      this.onMarkerStateEvent(room, markerEvent, markerFoundOptions);
    });
    return room;
  }

  /** When we see the marker state change in the room, we know there is some
   * new historical messages imported by MSC2716 `/batch_send` somewhere in
   * the room and we need to throw away the timeline to make sure the
   * historical messages are shown when we paginate `/messages` again.
   * @param room - The room where the marker event was sent
   * @param markerEvent - The new marker event
   * @param setStateOptions - When `timelineWasEmpty` is set
   * as `true`, the given marker event will be ignored
   */
  onMarkerStateEvent(room, markerEvent, {
    timelineWasEmpty
  } = {}) {
    // We don't need to refresh the timeline if it was empty before the
    // marker arrived. This could be happen in a variety of cases:
    //  1. From the initial sync
    //  2. If it's from the first state we're seeing after joining the room
    //  3. Or whether it's coming from `syncFromCache`
    if (timelineWasEmpty) {
      _logger.logger.debug(`MarkerState: Ignoring markerEventId=${markerEvent.getId()} in roomId=${room.roomId} ` + `because the timeline was empty before the marker arrived which means there is nothing to refresh.`);
      return;
    }
    const isValidMsc2716Event =
    // Check whether the room version directly supports MSC2716, in
    // which case, "marker" events are already auth'ed by
    // power_levels
    MSC2716_ROOM_VERSIONS.includes(room.getVersion()) ||
    // MSC2716 is also supported in all existing room versions but
    // special meaning should only be given to "insertion", "batch",
    // and "marker" events when they come from the room creator
    markerEvent.getSender() === room.getCreator();

    // It would be nice if we could also specifically tell whether the
    // historical messages actually affected the locally cached client
    // timeline or not. The problem is we can't see the prev_events of
    // the base insertion event that the marker was pointing to because
    // prev_events aren't available in the client API's. In most cases,
    // the history won't be in people's locally cached timelines in the
    // client, so we don't need to bother everyone about refreshing
    // their timeline. This works for a v1 though and there are use
    // cases like initially bootstrapping your bridged room where people
    // are likely to encounter the historical messages affecting their
    // current timeline (think someone signing up for Beeper and
    // importing their Whatsapp history).
    if (isValidMsc2716Event) {
      // Saw new marker event, let's let the clients know they should
      // refresh the timeline.
      _logger.logger.debug(`MarkerState: Timeline needs to be refreshed because ` + `a new markerEventId=${markerEvent.getId()} was sent in roomId=${room.roomId}`);
      room.setTimelineNeedsRefresh(true);
      room.emit(_room.RoomEvent.HistoryImportedWithinTimeline, markerEvent, room);
    } else {
      _logger.logger.debug(`MarkerState: Ignoring markerEventId=${markerEvent.getId()} in roomId=${room.roomId} because ` + `MSC2716 is not supported in the room version or for any room version, the marker wasn't sent ` + `by the room creator.`);
    }
  }

  /**
   * Sync rooms the user has left.
   * @returns Resolved when they've been added to the store.
   */
  async syncLeftRooms() {
    const client = this.client;

    // grab a filter with limit=1 and include_leave=true
    const filter = new _filter.Filter(this.client.credentials.userId);
    filter.setTimelineLimit(1);
    filter.setIncludeLeaveRooms(true);
    const localTimeoutMs = this.opts.pollTimeout + BUFFER_PERIOD_MS;
    const filterId = await client.getOrCreateFilter(getFilterName(client.credentials.userId, "LEFT_ROOMS"), filter);
    const qps = {
      timeout: 0,
      // don't want to block since this is a single isolated req
      filter: filterId
    };
    const data = await client.http.authedRequest(_httpApi.Method.Get, "/sync", qps, undefined, {
      localTimeoutMs
    });
    let leaveRooms = [];
    if (data.rooms?.leave) {
      leaveRooms = this.mapSyncResponseToRoomArray(data.rooms.leave);
    }
    const rooms = await Promise.all(leaveRooms.map(async leaveObj => {
      const room = leaveObj.room;
      if (!leaveObj.isBrandNewRoom) {
        // the intention behind syncLeftRooms is to add in rooms which were
        // *omitted* from the initial /sync. Rooms the user were joined to
        // but then left whilst the app is running will appear in this list
        // and we do not want to bother with them since they will have the
        // current state already (and may get dupe messages if we add
        // yet more timeline events!), so skip them.
        // NB: When we persist rooms to localStorage this will be more
        //     complicated...
        return;
      }
      leaveObj.timeline = leaveObj.timeline || {
        prev_batch: null,
        events: []
      };
      const events = this.mapSyncEventsFormat(leaveObj.timeline, room);
      const stateEvents = this.mapSyncEventsFormat(leaveObj.state, room);

      // set the back-pagination token. Do this *before* adding any
      // events so that clients can start back-paginating.
      room.getLiveTimeline().setPaginationToken(leaveObj.timeline.prev_batch, _eventTimeline.EventTimeline.BACKWARDS);
      await this.injectRoomEvents(room, stateEvents, events);
      room.recalculate();
      client.store.storeRoom(room);
      client.emit(_client.ClientEvent.Room, room);
      this.processEventsForNotifs(room, events);
      return room;
    }));
    return rooms.filter(Boolean);
  }

  /**
   * Peek into a room. This will result in the room in question being synced so it
   * is accessible via getRooms(). Live updates for the room will be provided.
   * @param roomId - The room ID to peek into.
   * @returns A promise which resolves once the room has been added to the
   * store.
   */
  peek(roomId) {
    if (this._peekRoom?.roomId === roomId) {
      return Promise.resolve(this._peekRoom);
    }
    const client = this.client;
    this._peekRoom = this.createRoom(roomId);
    return this.client.roomInitialSync(roomId, 20).then(response => {
      if (this._peekRoom?.roomId !== roomId) {
        throw new Error("Peeking aborted");
      }

      // make sure things are init'd
      response.messages = response.messages || {
        chunk: []
      };
      response.messages.chunk = response.messages.chunk || [];
      response.state = response.state || [];

      // FIXME: Mostly duplicated from injectRoomEvents but not entirely
      // because "state" in this API is at the BEGINNING of the chunk
      const oldStateEvents = (0, _utils.deepCopy)(response.state).map(client.getEventMapper());
      const stateEvents = response.state.map(client.getEventMapper());
      const messages = response.messages.chunk.map(client.getEventMapper());

      // XXX: copypasted from /sync until we kill off this minging v1 API stuff)
      // handle presence events (User objects)
      if (Array.isArray(response.presence)) {
        response.presence.map(client.getEventMapper()).forEach(function (presenceEvent) {
          let user = client.store.getUser(presenceEvent.getContent().user_id);
          if (user) {
            user.setPresenceEvent(presenceEvent);
          } else {
            user = _user.User.createUser(presenceEvent.getContent().user_id, client);
            user.setPresenceEvent(presenceEvent);
            client.store.storeUser(user);
          }
          client.emit(_client.ClientEvent.Event, presenceEvent);
        });
      }

      // set the pagination token before adding the events in case people
      // fire off pagination requests in response to the Room.timeline
      // events.
      if (response.messages.start) {
        this._peekRoom.oldState.paginationToken = response.messages.start;
      }

      // set the state of the room to as it was after the timeline executes
      this._peekRoom.oldState.setStateEvents(oldStateEvents);
      this._peekRoom.currentState.setStateEvents(stateEvents);
      this.resolveInvites(this._peekRoom);
      this._peekRoom.recalculate();

      // roll backwards to diverge old state. addEventsToTimeline
      // will overwrite the pagination token, so make sure it overwrites
      // it with the right thing.
      this._peekRoom.addEventsToTimeline(messages.reverse(), true, this._peekRoom.getLiveTimeline(), response.messages.start);
      client.store.storeRoom(this._peekRoom);
      client.emit(_client.ClientEvent.Room, this._peekRoom);
      this.peekPoll(this._peekRoom);
      return this._peekRoom;
    });
  }

  /**
   * Stop polling for updates in the peeked room. NOPs if there is no room being
   * peeked.
   */
  stopPeeking() {
    this._peekRoom = null;
  }

  /**
   * Do a peek room poll.
   * @param token - from= token
   */
  peekPoll(peekRoom, token) {
    if (this._peekRoom !== peekRoom) {
      debuglog("Stopped peeking in room %s", peekRoom.roomId);
      return;
    }

    // FIXME: gut wrenching; hard-coded timeout values
    this.client.http.authedRequest(_httpApi.Method.Get, "/events", {
      room_id: peekRoom.roomId,
      timeout: String(30 * 1000),
      from: token
    }, undefined, {
      localTimeoutMs: 50 * 1000,
      abortSignal: this.abortController?.signal
    }).then(async res => {
      if (this._peekRoom !== peekRoom) {
        debuglog("Stopped peeking in room %s", peekRoom.roomId);
        return;
      }
      // We have a problem that we get presence both from /events and /sync
      // however, /sync only returns presence for users in rooms
      // you're actually joined to.
      // in order to be sure to get presence for all of the users in the
      // peeked room, we handle presence explicitly here. This may result
      // in duplicate presence events firing for some users, which is a
      // performance drain, but such is life.
      // XXX: copypasted from /sync until we can kill this minging v1 stuff.

      res.chunk.filter(function (e) {
        return e.type === "m.presence";
      }).map(this.client.getEventMapper()).forEach(presenceEvent => {
        let user = this.client.store.getUser(presenceEvent.getContent().user_id);
        if (user) {
          user.setPresenceEvent(presenceEvent);
        } else {
          user = _user.User.createUser(presenceEvent.getContent().user_id, this.client);
          user.setPresenceEvent(presenceEvent);
          this.client.store.storeUser(user);
        }
        this.client.emit(_client.ClientEvent.Event, presenceEvent);
      });

      // strip out events which aren't for the given room_id (e.g presence)
      // and also ephemeral events (which we're assuming is anything without
      // and event ID because the /events API doesn't separate them).
      const events = res.chunk.filter(function (e) {
        return e.room_id === peekRoom.roomId && e.event_id;
      }).map(this.client.getEventMapper());
      await peekRoom.addLiveEvents(events);
      this.peekPoll(peekRoom, res.end);
    }, err => {
      _logger.logger.error("[%s] Peek poll failed: %s", peekRoom.roomId, err);
      setTimeout(() => {
        this.peekPoll(peekRoom, token);
      }, 30 * 1000);
    });
  }

  /**
   * Returns the current state of this sync object
   * @see MatrixClient#event:"sync"
   */
  getSyncState() {
    return this.syncState;
  }

  /**
   * Returns the additional data object associated with
   * the current sync state, or null if there is no
   * such data.
   * Sync errors, if available, are put in the 'error' key of
   * this object.
   */
  getSyncStateData() {
    return this.syncStateData ?? null;
  }
  async recoverFromSyncStartupError(savedSyncPromise, error) {
    // Wait for the saved sync to complete - we send the pushrules and filter requests
    // before the saved sync has finished so they can run in parallel, but only process
    // the results after the saved sync is done. Equivalently, we wait for it to finish
    // before reporting failures from these functions.
    await savedSyncPromise;
    const keepaliveProm = this.startKeepAlives();
    this.updateSyncState(SyncState.Error, {
      error
    });
    await keepaliveProm;
  }

  /**
   * Is the lazy loading option different than in previous session?
   * @param lazyLoadMembers - current options for lazy loading
   * @returns whether or not the option has changed compared to the previous session */
  async wasLazyLoadingToggled(lazyLoadMembers = false) {
    // assume it was turned off before
    // if we don't know any better
    let lazyLoadMembersBefore = false;
    const isStoreNewlyCreated = await this.client.store.isNewlyCreated();
    if (!isStoreNewlyCreated) {
      const prevClientOptions = await this.client.store.getClientOptions();
      if (prevClientOptions) {
        lazyLoadMembersBefore = !!prevClientOptions.lazyLoadMembers;
      }
      return lazyLoadMembersBefore !== lazyLoadMembers;
    }
    return false;
  }
  shouldAbortSync(error) {
    if (error.errcode === "M_UNKNOWN_TOKEN") {
      // The logout already happened, we just need to stop.
      _logger.logger.warn("Token no longer valid - assuming logout");
      this.stop();
      this.updateSyncState(SyncState.Error, {
        error
      });
      return true;
    }
    return false;
  }
  /**
   * Main entry point
   */
  async sync() {
    this.running = true;
    this.abortController = new AbortController();
    global.window?.addEventListener?.("online", this.onOnline, false);
    if (this.client.isGuest()) {
      // no push rules for guests, no access to POST filter for guests.
      return this.doSync({});
    }

    // Pull the saved sync token out first, before the worker starts sending
    // all the sync data which could take a while. This will let us send our
    // first incremental sync request before we've processed our saved data.
    debuglog("Getting saved sync token...");
    const savedSyncTokenPromise = this.client.store.getSavedSyncToken().then(tok => {
      debuglog("Got saved sync token");
      return tok;
    });
    this.savedSyncPromise = this.client.store.getSavedSync().then(savedSync => {
      debuglog(`Got reply from saved sync, exists? ${!!savedSync}`);
      if (savedSync) {
        return this.syncFromCache(savedSync);
      }
    }).catch(err => {
      _logger.logger.error("Getting saved sync failed", err);
    });

    // We need to do one-off checks before we can begin the /sync loop.
    // These are:
    //   1) We need to get push rules so we can check if events should bing as we get
    //      them from /sync.
    //   2) We need to get/create a filter which we can use for /sync.
    //   3) We need to check the lazy loading option matches what was used in the
    //       stored sync. If it doesn't, we can't use the stored sync.

    // Now start the first incremental sync request: this can also
    // take a while so if we set it going now, we can wait for it
    // to finish while we process our saved sync data.
    await this.getPushRules();
    await this.checkLazyLoadStatus();
    const {
      filterId,
      filter
    } = await this.getFilter();
    if (!filter) return; // bail, getFilter failed

    // reset the notifications timeline to prepare it to paginate from
    // the current point in time.
    // The right solution would be to tie /sync pagination tokens into
    // /notifications API somehow.
    this.client.resetNotifTimelineSet();
    if (!this.currentSyncRequest) {
      let firstSyncFilter = filterId;
      const savedSyncToken = await savedSyncTokenPromise;
      if (savedSyncToken) {
        debuglog("Sending first sync request...");
      } else {
        debuglog("Sending initial sync request...");
        const initialFilter = this.buildDefaultFilter();
        initialFilter.setDefinition(filter.getDefinition());
        initialFilter.setTimelineLimit(this.opts.initialSyncLimit);
        // Use an inline filter, no point uploading it for a single usage
        firstSyncFilter = JSON.stringify(initialFilter.getDefinition());
      }

      // Send this first sync request here so we can then wait for the saved
      // sync data to finish processing before we process the results of this one.
      this.currentSyncRequest = this.doSyncRequest({
        filter: firstSyncFilter
      }, savedSyncToken);
    }

    // Now wait for the saved sync to finish...
    debuglog("Waiting for saved sync before starting sync processing...");
    await this.savedSyncPromise;
    // process the first sync request and continue syncing with the normal filterId
    return this.doSync({
      filter: filterId
    });
  }

  /**
   * Stops the sync object from syncing.
   */
  stop() {
    debuglog("SyncApi.stop");
    // It is necessary to check for the existance of
    // global.window AND global.window.removeEventListener.
    // Some platforms (e.g. React Native) register global.window,
    // but do not have global.window.removeEventListener.
    global.window?.removeEventListener?.("online", this.onOnline, false);
    this.running = false;
    this.abortController?.abort();
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
  }

  /**
   * Retry a backed off syncing request immediately. This should only be used when
   * the user <b>explicitly</b> attempts to retry their lost connection.
   * @returns True if this resulted in a request being retried.
   */
  retryImmediately() {
    if (!this.connectionReturnedDefer) {
      return false;
    }
    this.startKeepAlives(0);
    return true;
  }
  /**
   * Process a single set of cached sync data.
   * @param savedSync - a saved sync that was persisted by a store. This
   * should have been acquired via client.store.getSavedSync().
   */
  async syncFromCache(savedSync) {
    debuglog("sync(): not doing HTTP hit, instead returning stored /sync data");
    const nextSyncToken = savedSync.nextBatch;

    // Set sync token for future incremental syncing
    this.client.store.setSyncToken(nextSyncToken);

    // No previous sync, set old token to null
    const syncEventData = {
      nextSyncToken,
      catchingUp: false,
      fromCache: true
    };
    const data = {
      next_batch: nextSyncToken,
      rooms: savedSync.roomsData,
      account_data: {
        events: savedSync.accountData
      }
    };
    try {
      await this.processSyncResponse(syncEventData, data);
    } catch (e) {
      _logger.logger.error("Error processing cached sync", e);
    }

    // Don't emit a prepared if we've bailed because the store is invalid:
    // in this case the client will not be usable until stopped & restarted
    // so this would be useless and misleading.
    if (!this.storeIsInvalid) {
      this.updateSyncState(SyncState.Prepared, syncEventData);
    }
  }

  /**
   * Invoke me to do /sync calls
   */
  async doSync(syncOptions) {
    while (this.running) {
      const syncToken = this.client.store.getSyncToken();
      let data;
      try {
        if (!this.currentSyncRequest) {
          this.currentSyncRequest = this.doSyncRequest(syncOptions, syncToken);
        }
        data = await this.currentSyncRequest;
      } catch (e) {
        const abort = await this.onSyncError(e);
        if (abort) return;
        continue;
      } finally {
        this.currentSyncRequest = undefined;
      }

      // set the sync token NOW *before* processing the events. We do this so
      // if something barfs on an event we can skip it rather than constantly
      // polling with the same token.
      this.client.store.setSyncToken(data.next_batch);

      // Reset after a successful sync
      this.failedSyncCount = 0;
      const syncEventData = {
        oldSyncToken: syncToken ?? undefined,
        nextSyncToken: data.next_batch,
        catchingUp: this.catchingUp
      };
      if (this.syncOpts.crypto) {
        // tell the crypto module we're about to process a sync
        // response
        await this.syncOpts.crypto.onSyncWillProcess(syncEventData);
      }
      try {
        await this.processSyncResponse(syncEventData, data);
      } catch (e) {
        // log the exception with stack if we have it, else fall back
        // to the plain description
        _logger.logger.error("Caught /sync error", e);

        // Emit the exception for client handling
        this.client.emit(_client.ClientEvent.SyncUnexpectedError, e);
      }

      // Persist after processing as `unsigned` may get mutated
      // with an `org.matrix.msc4023.thread_id`
      await this.client.store.setSyncData(data);

      // update this as it may have changed
      syncEventData.catchingUp = this.catchingUp;

      // emit synced events
      if (!syncOptions.hasSyncedBefore) {
        this.updateSyncState(SyncState.Prepared, syncEventData);
        syncOptions.hasSyncedBefore = true;
      }

      // tell the crypto module to do its processing. It may block (to do a
      // /keys/changes request).
      if (this.syncOpts.cryptoCallbacks) {
        await this.syncOpts.cryptoCallbacks.onSyncCompleted(syncEventData);
      }

      // keep emitting SYNCING -> SYNCING for clients who want to do bulk updates
      this.updateSyncState(SyncState.Syncing, syncEventData);
      if (this.client.store.wantsSave()) {
        // We always save the device list (if it's dirty) before saving the sync data:
        // this means we know the saved device list data is at least as fresh as the
        // stored sync data which means we don't have to worry that we may have missed
        // device changes. We can also skip the delay since we're not calling this very
        // frequently (and we don't really want to delay the sync for it).
        if (this.syncOpts.crypto) {
          await this.syncOpts.crypto.saveDeviceList(0);
        }

        // tell databases that everything is now in a consistent state and can be saved.
        await this.client.store.save();
      }
    }
    if (!this.running) {
      debuglog("Sync no longer running: exiting.");
      if (this.connectionReturnedDefer) {
        this.connectionReturnedDefer.reject();
        this.connectionReturnedDefer = undefined;
      }
      this.updateSyncState(SyncState.Stopped);
    }
  }
  doSyncRequest(syncOptions, syncToken) {
    const qps = this.getSyncParams(syncOptions, syncToken);
    return this.client.http.authedRequest(_httpApi.Method.Get, "/sync", qps, undefined, {
      localTimeoutMs: qps.timeout + BUFFER_PERIOD_MS,
      abortSignal: this.abortController?.signal
    });
  }
  getSyncParams(syncOptions, syncToken) {
    let timeout = this.opts.pollTimeout;
    if (this.getSyncState() !== SyncState.Syncing || this.catchingUp) {
      // unless we are happily syncing already, we want the server to return
      // as quickly as possible, even if there are no events queued. This
      // serves two purposes:
      //
      // * When the connection dies, we want to know asap when it comes back,
      //   so that we can hide the error from the user. (We don't want to
      //   have to wait for an event or a timeout).
      //
      // * We want to know if the server has any to_device messages queued up
      //   for us. We do that by calling it with a zero timeout until it
      //   doesn't give us any more to_device messages.
      this.catchingUp = true;
      timeout = 0;
    }
    let filter = syncOptions.filter;
    if (this.client.isGuest() && !filter) {
      filter = this.getGuestFilter();
    }
    const qps = {
      filter,
      timeout
    };
    if (this.opts.disablePresence) {
      qps.set_presence = SetPresence.Offline;
    } else if (this.presence !== undefined) {
      qps.set_presence = this.presence;
    }
    if (syncToken) {
      qps.since = syncToken;
    } else {
      // use a cachebuster for initialsyncs, to make sure that
      // we don't get a stale sync
      // (https://github.com/vector-im/vector-web/issues/1354)
      qps._cacheBuster = Date.now();
    }
    if ([SyncState.Reconnecting, SyncState.Error].includes(this.getSyncState())) {
      // we think the connection is dead. If it comes back up, we won't know
      // about it till /sync returns. If the timeout= is high, this could
      // be a long time. Set it to 0 when doing retries so we don't have to wait
      // for an event or a timeout before emiting the SYNCING event.
      qps.timeout = 0;
    }
    return qps;
  }

  /**
   * Specify the set_presence value to be used for subsequent calls to the Sync API.
   * @param presence - the presence to specify to set_presence of sync calls
   */
  setPresence(presence) {
    this.presence = presence;
  }
  async onSyncError(err) {
    if (!this.running) {
      debuglog("Sync no longer running: exiting");
      if (this.connectionReturnedDefer) {
        this.connectionReturnedDefer.reject();
        this.connectionReturnedDefer = undefined;
      }
      this.updateSyncState(SyncState.Stopped);
      return true; // abort
    }
    _logger.logger.error("/sync error %s", err);
    if (this.shouldAbortSync(err)) {
      return true; // abort
    }
    this.failedSyncCount++;
    _logger.logger.log("Number of consecutive failed sync requests:", this.failedSyncCount);
    debuglog("Starting keep-alive");
    // Note that we do *not* mark the sync connection as
    // lost yet: we only do this if a keepalive poke
    // fails, since long lived HTTP connections will
    // go away sometimes and we shouldn't treat this as
    // erroneous. We set the state to 'reconnecting'
    // instead, so that clients can observe this state
    // if they wish.
    const keepAlivePromise = this.startKeepAlives();
    this.currentSyncRequest = undefined;
    // Transition from RECONNECTING to ERROR after a given number of failed syncs
    this.updateSyncState(this.failedSyncCount >= FAILED_SYNC_ERROR_THRESHOLD ? SyncState.Error : SyncState.Reconnecting, {
      error: err
    });
    const connDidFail = await keepAlivePromise;

    // Only emit CATCHUP if we detected a connectivity error: if we didn't,
    // it's quite likely the sync will fail again for the same reason and we
    // want to stay in ERROR rather than keep flip-flopping between ERROR
    // and CATCHUP.
    if (connDidFail && this.getSyncState() === SyncState.Error) {
      this.updateSyncState(SyncState.Catchup, {
        catchingUp: true
      });
    }
    return false;
  }

  /**
   * Process data returned from a sync response and propagate it
   * into the model objects
   *
   * @param syncEventData - Object containing sync tokens associated with this sync
   * @param data - The response from /sync
   */
  async processSyncResponse(syncEventData, data) {
    const client = this.client;

    // data looks like:
    // {
    //    next_batch: $token,
    //    presence: { events: [] },
    //    account_data: { events: [] },
    //    device_lists: { changed: ["@user:server", ... ]},
    //    to_device: { events: [] },
    //    device_one_time_keys_count: { signed_curve25519: 42 },
    //    rooms: {
    //      invite: {
    //        $roomid: {
    //          invite_state: { events: [] }
    //        }
    //      },
    //      join: {
    //        $roomid: {
    //          state: { events: [] },
    //          timeline: { events: [], prev_batch: $token, limited: true },
    //          ephemeral: { events: [] },
    //          summary: {
    //             m.heroes: [ $user_id ],
    //             m.joined_member_count: $count,
    //             m.invited_member_count: $count
    //          },
    //          account_data: { events: [] },
    //          unread_notifications: {
    //              highlight_count: 0,
    //              notification_count: 0,
    //          }
    //        }
    //      },
    //      leave: {
    //        $roomid: {
    //          state: { events: [] },
    //          timeline: { events: [], prev_batch: $token }
    //        }
    //      }
    //    }
    // }

    // TODO-arch:
    // - Each event we pass through needs to be emitted via 'event', can we
    //   do this in one place?
    // - The isBrandNewRoom boilerplate is boilerplatey.

    // handle presence events (User objects)
    if (Array.isArray(data.presence?.events)) {
      data.presence.events.filter(_utils.noUnsafeEventProps).map(client.getEventMapper()).forEach(function (presenceEvent) {
        let user = client.store.getUser(presenceEvent.getSender());
        if (user) {
          user.setPresenceEvent(presenceEvent);
        } else {
          user = _user.User.createUser(presenceEvent.getSender(), client);
          user.setPresenceEvent(presenceEvent);
          client.store.storeUser(user);
        }
        client.emit(_client.ClientEvent.Event, presenceEvent);
      });
    }

    // handle non-room account_data
    if (Array.isArray(data.account_data?.events)) {
      const events = data.account_data.events.filter(_utils.noUnsafeEventProps).map(client.getEventMapper());
      const prevEventsMap = events.reduce((m, c) => {
        m[c.getType()] = client.store.getAccountData(c.getType());
        return m;
      }, {});
      client.store.storeAccountDataEvents(events);
      events.forEach(function (accountDataEvent) {
        // Honour push rules that come down the sync stream but also
        // honour push rules that were previously cached. Base rules
        // will be updated when we receive push rules via getPushRules
        // (see sync) before syncing over the network.
        if (accountDataEvent.getType() === _event.EventType.PushRules) {
          const rules = accountDataEvent.getContent();
          client.setPushRules(rules);
        }
        const prevEvent = prevEventsMap[accountDataEvent.getType()];
        client.emit(_client.ClientEvent.AccountData, accountDataEvent, prevEvent);
        return accountDataEvent;
      });
    }

    // handle to-device events
    if (data.to_device && Array.isArray(data.to_device.events) && data.to_device.events.length > 0) {
      let toDeviceMessages = data.to_device.events.filter(_utils.noUnsafeEventProps);
      if (this.syncOpts.cryptoCallbacks) {
        toDeviceMessages = await this.syncOpts.cryptoCallbacks.preprocessToDeviceMessages(toDeviceMessages);
      }
      const cancelledKeyVerificationTxns = [];
      toDeviceMessages.map(client.getEventMapper({
        toDevice: true
      })).map(toDeviceEvent => {
        // map is a cheap inline forEach
        // We want to flag m.key.verification.start events as cancelled
        // if there's an accompanying m.key.verification.cancel event, so
        // we pull out the transaction IDs from the cancellation events
        // so we can flag the verification events as cancelled in the loop
        // below.
        if (toDeviceEvent.getType() === "m.key.verification.cancel") {
          const txnId = toDeviceEvent.getContent()["transaction_id"];
          if (txnId) {
            cancelledKeyVerificationTxns.push(txnId);
          }
        }

        // as mentioned above, .map is a cheap inline forEach, so return
        // the unmodified event.
        return toDeviceEvent;
      }).forEach(function (toDeviceEvent) {
        const content = toDeviceEvent.getContent();
        if (toDeviceEvent.getType() == "m.room.message" && content.msgtype == "m.bad.encrypted") {
          // the mapper already logged a warning.
          _logger.logger.log("Ignoring undecryptable to-device event from " + toDeviceEvent.getSender());
          return;
        }
        if (toDeviceEvent.getType() === "m.key.verification.start" || toDeviceEvent.getType() === "m.key.verification.request") {
          const txnId = content["transaction_id"];
          if (cancelledKeyVerificationTxns.includes(txnId)) {
            toDeviceEvent.flagCancelled();
          }
        }
        client.emit(_client.ClientEvent.ToDeviceEvent, toDeviceEvent);
      });
    } else {
      // no more to-device events: we can stop polling with a short timeout.
      this.catchingUp = false;
    }

    // the returned json structure is a bit crap, so make it into a
    // nicer form (array) after applying sanity to make sure we don't fail
    // on missing keys (on the off chance)
    let inviteRooms = [];
    let joinRooms = [];
    let leaveRooms = [];
    let knockRooms = [];
    if (data.rooms) {
      if (data.rooms.invite) {
        inviteRooms = this.mapSyncResponseToRoomArray(data.rooms.invite);
      }
      if (data.rooms.join) {
        joinRooms = this.mapSyncResponseToRoomArray(data.rooms.join);
      }
      if (data.rooms.leave) {
        leaveRooms = this.mapSyncResponseToRoomArray(data.rooms.leave);
      }
      if (data.rooms.knock) {
        knockRooms = this.mapSyncResponseToRoomArray(data.rooms.knock);
      }
    }
    this.notifEvents = [];

    // Handle invites
    await (0, _utils.promiseMapSeries)(inviteRooms, async inviteObj => {
      const room = inviteObj.room;
      const stateEvents = this.mapSyncEventsFormat(inviteObj.invite_state, room);
      await this.injectRoomEvents(room, stateEvents);
      const inviter = room.currentState.getStateEvents(_event.EventType.RoomMember, client.getUserId())?.getSender();
      const crypto = client.crypto;
      if (crypto) {
        const parkedHistory = await crypto.cryptoStore.takeParkedSharedHistory(room.roomId);
        for (const parked of parkedHistory) {
          if (parked.senderId === inviter) {
            await crypto.olmDevice.addInboundGroupSession(room.roomId, parked.senderKey, parked.forwardingCurve25519KeyChain, parked.sessionId, parked.sessionKey, parked.keysClaimed, true, {
              sharedHistory: true,
              untrusted: true
            });
          }
        }
      }
      if (inviteObj.isBrandNewRoom) {
        room.recalculate();
        client.store.storeRoom(room);
        client.emit(_client.ClientEvent.Room, room);
      } else {
        // Update room state for invite->reject->invite cycles
        room.recalculate();
      }
      stateEvents.forEach(function (e) {
        client.emit(_client.ClientEvent.Event, e);
      });
    });

    // Handle joins
    await (0, _utils.promiseMapSeries)(joinRooms, async joinObj => {
      const room = joinObj.room;
      const stateEvents = this.mapSyncEventsFormat(joinObj.state, room);
      // Prevent events from being decrypted ahead of time
      // this helps large account to speed up faster
      // room::decryptCriticalEvent is in charge of decrypting all the events
      // required for a client to function properly
      const events = this.mapSyncEventsFormat(joinObj.timeline, room, false);
      const ephemeralEvents = this.mapSyncEventsFormat(joinObj.ephemeral);
      const accountDataEvents = this.mapSyncEventsFormat(joinObj.account_data);
      const encrypted = this.isRoomEncrypted(room, stateEvents, events);
      // We store the server-provided value first so it's correct when any of the events fire.
      if (joinObj.unread_notifications) {
        /**
         * We track unread notifications ourselves in encrypted rooms, so don't
         * bother setting it here. We trust our calculations better than the
         * server's for this case, and therefore will assume that our non-zero
         * count is accurate.
         * XXX: this is known faulty as the push rule for `.m.room.encrypted` may be disabled so server
         * may issue notification counts of 0 which we wrongly trust.
         * https://github.com/matrix-org/matrix-spec-proposals/pull/2654 would fix this
         *
         * @see import("./client").fixNotificationCountOnDecryption
         */
        if (!encrypted || joinObj.unread_notifications.notification_count === 0) {
          // In an encrypted room, if the room has notifications enabled then it's typical for
          // the server to flag all new messages as notifying. However, some push rules calculate
          // events as ignored based on their event contents (e.g. ignoring msgtype=m.notice messages)
          // so we want to calculate this figure on the client in all cases.
          room.setUnreadNotificationCount(_room.NotificationCountType.Total, joinObj.unread_notifications.notification_count ?? 0);
        }
        if (!encrypted || room.getUnreadNotificationCount(_room.NotificationCountType.Highlight) <= 0) {
          // If the locally stored highlight count is zero, use the server provided value.
          room.setUnreadNotificationCount(_room.NotificationCountType.Highlight, joinObj.unread_notifications.highlight_count ?? 0);
        }
      }
      const unreadThreadNotifications = joinObj[_sync.UNREAD_THREAD_NOTIFICATIONS.name] ?? joinObj[_sync.UNREAD_THREAD_NOTIFICATIONS.altName];
      if (unreadThreadNotifications) {
        // Only partially reset unread notification
        // We want to keep the client-generated count. Particularly important
        // for encrypted room that refresh their notification count on event
        // decryption
        room.resetThreadUnreadNotificationCount(Object.keys(unreadThreadNotifications));
        for (const [threadId, unreadNotification] of Object.entries(unreadThreadNotifications)) {
          if (!encrypted || unreadNotification.notification_count === 0) {
            room.setThreadUnreadNotificationCount(threadId, _room.NotificationCountType.Total, unreadNotification.notification_count ?? 0);
          }
          const hasNoNotifications = room.getThreadUnreadNotificationCount(threadId, _room.NotificationCountType.Highlight) <= 0;
          if (!encrypted || encrypted && hasNoNotifications) {
            room.setThreadUnreadNotificationCount(threadId, _room.NotificationCountType.Highlight, unreadNotification.highlight_count ?? 0);
          }
        }
      } else {
        room.resetThreadUnreadNotificationCount();
      }
      joinObj.timeline = joinObj.timeline || {};
      if (joinObj.isBrandNewRoom) {
        // set the back-pagination token. Do this *before* adding any
        // events so that clients can start back-paginating.
        if (joinObj.timeline.prev_batch !== null) {
          room.getLiveTimeline().setPaginationToken(joinObj.timeline.prev_batch, _eventTimeline.EventTimeline.BACKWARDS);
        }
      } else if (joinObj.timeline.limited) {
        let limited = true;

        // we've got a limited sync, so we *probably* have a gap in the
        // timeline, so should reset. But we might have been peeking or
        // paginating and already have some of the events, in which
        // case we just want to append any subsequent events to the end
        // of the existing timeline.
        //
        // This is particularly important in the case that we already have
        // *all* of the events in the timeline - in that case, if we reset
        // the timeline, we'll end up with an entirely empty timeline,
        // which we'll try to paginate but not get any new events (which
        // will stop us linking the empty timeline into the chain).
        //
        for (let i = events.length - 1; i >= 0; i--) {
          const eventId = events[i].getId();
          if (room.getTimelineForEvent(eventId)) {
            debuglog(`Already have event ${eventId} in limited sync - not resetting`);
            limited = false;

            // we might still be missing some of the events before i;
            // we don't want to be adding them to the end of the
            // timeline because that would put them out of order.
            events.splice(0, i);

            // XXX: there's a problem here if the skipped part of the
            // timeline modifies the state set in stateEvents, because
            // we'll end up using the state from stateEvents rather
            // than the later state from timelineEvents. We probably
            // need to wind stateEvents forward over the events we're
            // skipping.

            break;
          }
        }
        if (limited) {
          room.resetLiveTimeline(joinObj.timeline.prev_batch, this.syncOpts.canResetEntireTimeline(room.roomId) ? null : syncEventData.oldSyncToken ?? null);

          // We have to assume any gap in any timeline is
          // reason to stop incrementally tracking notifications and
          // reset the timeline.
          client.resetNotifTimelineSet();
        }
      }

      // process any crypto events *before* emitting the RoomStateEvent events. This
      // avoids a race condition if the application tries to send a message after the
      // state event is processed, but before crypto is enabled, which then causes the
      // crypto layer to complain.
      if (this.syncOpts.cryptoCallbacks) {
        for (const e of stateEvents.concat(events)) {
          if (e.isState() && e.getType() === _event.EventType.RoomEncryption && e.getStateKey() === "") {
            await this.syncOpts.cryptoCallbacks.onCryptoEvent(room, e);
          }
        }
      }
      try {
        await this.injectRoomEvents(room, stateEvents, events, syncEventData.fromCache);
      } catch (e) {
        _logger.logger.error(`Failed to process events on room ${room.roomId}:`, e);
      }

      // set summary after processing events,
      // because it will trigger a name calculation
      // which needs the room state to be up to date
      if (joinObj.summary) {
        room.setSummary(joinObj.summary);
      }

      // we deliberately don't add ephemeral events to the timeline
      room.addEphemeralEvents(ephemeralEvents);

      // we deliberately don't add accountData to the timeline
      room.addAccountData(accountDataEvents);
      room.recalculate();
      if (joinObj.isBrandNewRoom) {
        client.store.storeRoom(room);
        client.emit(_client.ClientEvent.Room, room);
      }
      this.processEventsForNotifs(room, events);
      const emitEvent = e => client.emit(_client.ClientEvent.Event, e);
      stateEvents.forEach(emitEvent);
      events.forEach(emitEvent);
      ephemeralEvents.forEach(emitEvent);
      accountDataEvents.forEach(emitEvent);

      // Decrypt only the last message in all rooms to make sure we can generate a preview
      // And decrypt all events after the recorded read receipt to ensure an accurate
      // notification count
      room.decryptCriticalEvents();
    });

    // Handle leaves (e.g. kicked rooms)
    await (0, _utils.promiseMapSeries)(leaveRooms, async leaveObj => {
      const room = leaveObj.room;
      const stateEvents = this.mapSyncEventsFormat(leaveObj.state, room);
      const events = this.mapSyncEventsFormat(leaveObj.timeline, room);
      const accountDataEvents = this.mapSyncEventsFormat(leaveObj.account_data);
      await this.injectRoomEvents(room, stateEvents, events);
      room.addAccountData(accountDataEvents);
      room.recalculate();
      if (leaveObj.isBrandNewRoom) {
        client.store.storeRoom(room);
        client.emit(_client.ClientEvent.Room, room);
      }
      this.processEventsForNotifs(room, events);
      stateEvents.forEach(function (e) {
        client.emit(_client.ClientEvent.Event, e);
      });
      events.forEach(function (e) {
        client.emit(_client.ClientEvent.Event, e);
      });
      accountDataEvents.forEach(function (e) {
        client.emit(_client.ClientEvent.Event, e);
      });
    });

    // Handle knocks
    await (0, _utils.promiseMapSeries)(knockRooms, async knockObj => {
      const room = knockObj.room;
      const stateEvents = this.mapSyncEventsFormat(knockObj.knock_state, room);
      await this.injectRoomEvents(room, stateEvents);
      if (knockObj.isBrandNewRoom) {
        room.recalculate();
        client.store.storeRoom(room);
        client.emit(_client.ClientEvent.Room, room);
      } else {
        // Update room state for knock->leave->knock cycles
        room.recalculate();
      }
      stateEvents.forEach(function (e) {
        client.emit(_client.ClientEvent.Event, e);
      });
    });

    // update the notification timeline, if appropriate.
    // we only do this for live events, as otherwise we can't order them sanely
    // in the timeline relative to ones paginated in by /notifications.
    // XXX: we could fix this by making EventTimeline support chronological
    // ordering... but it doesn't, right now.
    if (syncEventData.oldSyncToken && this.notifEvents.length) {
      this.notifEvents.sort(function (a, b) {
        return a.getTs() - b.getTs();
      });
      this.notifEvents.forEach(function (event) {
        client.getNotifTimelineSet()?.addLiveEvent(event);
      });
    }

    // Handle device list updates
    if (data.device_lists) {
      if (this.syncOpts.cryptoCallbacks) {
        await this.syncOpts.cryptoCallbacks.processDeviceLists(data.device_lists);
      } else {
        // FIXME if we *don't* have a crypto module, we still need to
        // invalidate the device lists. But that would require a
        // substantial bit of rework :/.
      }
    }

    // Handle one_time_keys_count and unused fallback keys
    await this.syncOpts.cryptoCallbacks?.processKeyCounts(data.device_one_time_keys_count, data.device_unused_fallback_key_types ?? data["org.matrix.msc2732.device_unused_fallback_key_types"]);
  }

  /**
   * Starts polling the connectivity check endpoint
   * @param delay - How long to delay until the first poll.
   *        defaults to a short, randomised interval (to prevent
   *        tight-looping if /versions succeeds but /sync etc. fail).
   * @returns which resolves once the connection returns
   */
  startKeepAlives(delay) {
    if (delay === undefined) {
      delay = 2000 + Math.floor(Math.random() * 5000);
    }
    if (this.keepAliveTimer !== null) {
      clearTimeout(this.keepAliveTimer);
    }
    if (delay > 0) {
      this.keepAliveTimer = setTimeout(this.pokeKeepAlive.bind(this), delay);
    } else {
      this.pokeKeepAlive();
    }
    if (!this.connectionReturnedDefer) {
      this.connectionReturnedDefer = (0, _utils.defer)();
    }
    return this.connectionReturnedDefer.promise;
  }

  /**
   * Make a dummy call to /_matrix/client/versions, to see if the HS is
   * reachable.
   *
   * On failure, schedules a call back to itself. On success, resolves
   * this.connectionReturnedDefer.
   *
   * @param connDidFail - True if a connectivity failure has been detected. Optional.
   */
  pokeKeepAlive(connDidFail = false) {
    if (!this.running) {
      // we are in a keepAlive, retrying to connect, but the syncronization
      // was stopped, so we are stopping the retry.
      clearTimeout(this.keepAliveTimer);
      if (this.connectionReturnedDefer) {
        this.connectionReturnedDefer.reject("SyncApi.stop() was called");
        this.connectionReturnedDefer = undefined;
      }
      return;
    }
    const success = () => {
      clearTimeout(this.keepAliveTimer);
      if (this.connectionReturnedDefer) {
        this.connectionReturnedDefer.resolve(connDidFail);
        this.connectionReturnedDefer = undefined;
      }
    };
    this.client.http.request(_httpApi.Method.Get, "/_matrix/client/versions", undefined,
    // queryParams
    undefined,
    // data
    {
      prefix: "",
      localTimeoutMs: 15 * 1000,
      abortSignal: this.abortController?.signal
    }).then(() => {
      success();
    }, err => {
      if (err.httpStatus == 400 || err.httpStatus == 404) {
        // treat this as a success because the server probably just doesn't
        // support /versions: point is, we're getting a response.
        // We wait a short time though, just in case somehow the server
        // is in a mode where it 400s /versions responses and sync etc.
        // responses fail, this will mean we don't hammer in a loop.
        this.keepAliveTimer = setTimeout(success, 2000);
      } else {
        connDidFail = true;
        this.keepAliveTimer = setTimeout(this.pokeKeepAlive.bind(this, connDidFail), 5000 + Math.floor(Math.random() * 5000));
        // A keepalive has failed, so we emit the
        // error state (whether or not this is the
        // first failure).
        // Note we do this after setting the timer:
        // this lets the unit tests advance the mock
        // clock when they get the error.
        this.updateSyncState(SyncState.Error, {
          error: err
        });
      }
    });
  }
  mapSyncResponseToRoomArray(obj) {
    // Maps { roomid: {stuff}, roomid: {stuff} }
    // to
    // [{stuff+Room+isBrandNewRoom}, {stuff+Room+isBrandNewRoom}]
    const client = this.client;
    return Object.keys(obj).filter(k => !(0, _utils.unsafeProp)(k)).map(roomId => {
      let room = client.store.getRoom(roomId);
      let isBrandNewRoom = false;
      if (!room) {
        room = this.createRoom(roomId);
        isBrandNewRoom = true;
      }
      return _objectSpread(_objectSpread({}, obj[roomId]), {}, {
        room,
        isBrandNewRoom
      });
    });
  }
  mapSyncEventsFormat(obj, room, decrypt = true) {
    if (!obj || !Array.isArray(obj.events)) {
      return [];
    }
    const mapper = this.client.getEventMapper({
      decrypt
    });
    return obj.events.filter(_utils.noUnsafeEventProps).map(function (e) {
      if (room) {
        e.room_id = room.roomId;
      }
      return mapper(e);
    });
  }

  /**
   */
  resolveInvites(room) {
    if (!room || !this.opts.resolveInvitesToProfiles) {
      return;
    }
    const client = this.client;
    // For each invited room member we want to give them a displayname/avatar url
    // if they have one (the m.room.member invites don't contain this).
    room.getMembersWithMembership("invite").forEach(function (member) {
      if (member.requestedProfileInfo) return;
      member.requestedProfileInfo = true;
      // try to get a cached copy first.
      const user = client.getUser(member.userId);
      let promise;
      if (user) {
        promise = Promise.resolve({
          avatar_url: user.avatarUrl,
          displayname: user.displayName
        });
      } else {
        promise = client.getProfileInfo(member.userId);
      }
      promise.then(function (info) {
        // slightly naughty by doctoring the invite event but this means all
        // the code paths remain the same between invite/join display name stuff
        // which is a worthy trade-off for some minor pollution.
        const inviteEvent = member.events.member;
        if (inviteEvent?.getContent().membership !== "invite") {
          // between resolving and now they have since joined, so don't clobber
          return;
        }
        inviteEvent.getContent().avatar_url = info.avatar_url;
        inviteEvent.getContent().displayname = info.displayname;
        // fire listeners
        member.setMembershipEvent(inviteEvent, room.currentState);
      }, function (err) {
        // OH WELL.
      });
    });
  }
  findEncryptionEvent(events) {
    return events?.find(e => e.getType() === _event.EventType.RoomEncryption && e.getStateKey() === "");
  }

  // When processing the sync response we cannot rely on Room.hasEncryptionStateEvent we actually
  // inject the events into the room object, so we have to inspect the events themselves.
  isRoomEncrypted(room, stateEventList, timelineEventList) {
    return room.hasEncryptionStateEvent() || !!this.findEncryptionEvent(stateEventList) || !!this.findEncryptionEvent(timelineEventList);
  }

  /**
   * Injects events into a room's model.
   * @param stateEventList - A list of state events. This is the state
   * at the *START* of the timeline list if it is supplied.
   * @param timelineEventList - A list of timeline events, including threaded. Lower index
   * is earlier in time. Higher index is later.
   * @param fromCache - whether the sync response came from cache
   */
  async injectRoomEvents(room, stateEventList, timelineEventList, fromCache = false) {
    // If there are no events in the timeline yet, initialise it with
    // the given state events
    const liveTimeline = room.getLiveTimeline();
    const timelineWasEmpty = liveTimeline.getEvents().length == 0;
    if (timelineWasEmpty) {
      // Passing these events into initialiseState will freeze them, so we need
      // to compute and cache the push actions for them now, otherwise sync dies
      // with an attempt to assign to read only property.
      // XXX: This is pretty horrible and is assuming all sorts of behaviour from
      // these functions that it shouldn't be. We should probably either store the
      // push actions cache elsewhere so we can freeze MatrixEvents, or otherwise
      // find some solution where MatrixEvents are immutable but allow for a cache
      // field.
      for (const ev of stateEventList) {
        this.client.getPushActionsForEvent(ev);
      }
      liveTimeline.initialiseState(stateEventList, {
        timelineWasEmpty
      });
    }
    this.resolveInvites(room);

    // recalculate the room name at this point as adding events to the timeline
    // may make notifications appear which should have the right name.
    // XXX: This looks suspect: we'll end up recalculating the room once here
    // and then again after adding events (processSyncResponse calls it after
    // calling us) even if no state events were added. It also means that if
    // one of the room events in timelineEventList is something that needs
    // a recalculation (like m.room.name) we won't recalculate until we've
    // finished adding all the events, which will cause the notification to have
    // the old room name rather than the new one.
    room.recalculate();

    // If the timeline wasn't empty, we process the state events here: they're
    // defined as updates to the state before the start of the timeline, so this
    // starts to roll the state forward.
    // XXX: That's what we *should* do, but this can happen if we were previously
    // peeking in a room, in which case we obviously do *not* want to add the
    // state events here onto the end of the timeline. Historically, the js-sdk
    // has just set these new state events on the old and new state. This seems
    // very wrong because there could be events in the timeline that diverge the
    // state, in which case this is going to leave things out of sync. However,
    // for now I think it;s best to behave the same as the code has done previously.
    if (!timelineWasEmpty) {
      // XXX: As above, don't do this...
      //room.addLiveEvents(stateEventList || []);
      // Do this instead...
      room.oldState.setStateEvents(stateEventList || []);
      room.currentState.setStateEvents(stateEventList || []);
    }

    // Execute the timeline events. This will continue to diverge the current state
    // if the timeline has any state events in it.
    // This also needs to be done before running push rules on the events as they need
    // to be decorated with sender etc.
    await room.addLiveEvents(timelineEventList || [], {
      fromCache,
      timelineWasEmpty
    });
    this.client.processBeaconEvents(room, timelineEventList);
  }

  /**
   * Takes a list of timelineEvents and adds and adds to notifEvents
   * as appropriate.
   * This must be called after the room the events belong to has been stored.
   *
   * @param timelineEventList - A list of timeline events. Lower index
   * is earlier in time. Higher index is later.
   */
  processEventsForNotifs(room, timelineEventList) {
    // gather our notifications into this.notifEvents
    if (this.client.getNotifTimelineSet()) {
      for (const event of timelineEventList) {
        const pushActions = this.client.getPushActionsForEvent(event);
        if (pushActions?.notify && pushActions.tweaks?.highlight) {
          this.notifEvents.push(event);
        }
      }
    }
  }
  getGuestFilter() {
    // Dev note: This used to be conditional to return a filter of 20 events maximum, but
    // the condition never went to the other branch. This is now hardcoded.
    return "{}";
  }

  /**
   * Sets the sync state and emits an event to say so
   * @param newState - The new state string
   * @param data - Object of additional data to emit in the event
   */
  updateSyncState(newState, data) {
    const old = this.syncState;
    this.syncState = newState;
    this.syncStateData = data;
    this.client.emit(_client.ClientEvent.Sync, this.syncState, old, data);
  }
}

// /!\ This function is not intended for public use! It's only exported from
// here in order to share some common logic with sliding-sync-sdk.ts.
exports.SyncApi = SyncApi;
function _createAndReEmitRoom(client, roomId, opts) {
  const {
    timelineSupport
  } = client;
  const room = new _room.Room(roomId, client, client.getUserId(), {
    lazyLoadMembers: opts.lazyLoadMembers,
    pendingEventOrdering: opts.pendingEventOrdering,
    timelineSupport
  });
  client.reEmitter.reEmit(room, [_room.RoomEvent.Name, _room.RoomEvent.Redaction, _room.RoomEvent.RedactionCancelled, _room.RoomEvent.Receipt, _room.RoomEvent.Tags, _room.RoomEvent.LocalEchoUpdated, _room.RoomEvent.AccountData, _room.RoomEvent.MyMembership, _room.RoomEvent.Timeline, _room.RoomEvent.TimelineReset, _roomState.RoomStateEvent.Events, _roomState.RoomStateEvent.Members, _roomState.RoomStateEvent.NewMember, _roomState.RoomStateEvent.Update, _beacon.BeaconEvent.New, _beacon.BeaconEvent.Update, _beacon.BeaconEvent.Destroy, _beacon.BeaconEvent.LivenessChange]);

  // We need to add a listener for RoomState.members in order to hook them
  // correctly.
  room.on(_roomState.RoomStateEvent.NewMember, (event, state, member) => {
    member.user = client.getUser(member.userId) ?? undefined;
    client.reEmitter.reEmit(member, [_roomMember.RoomMemberEvent.Name, _roomMember.RoomMemberEvent.Typing, _roomMember.RoomMemberEvent.PowerLevel, _roomMember.RoomMemberEvent.Membership]);
  });
  return room;
}