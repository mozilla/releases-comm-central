"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  setCryptoStoreFactory: true,
  createClient: true,
  createRoomWidgetClient: true,
  TypedEventEmitter: true,
  LocationAssetType: true,
  IdentityProviderBrand: true,
  SSOAction: true,
  ContentHelpers: true,
  SecretStorage: true,
  createNewMatrixCall: true,
  CallEvent: true,
  GroupCall: true,
  GroupCallEvent: true,
  GroupCallIntent: true,
  GroupCallState: true,
  GroupCallType: true,
  GroupCallStatsReportEvent: true,
  CryptoEvent: true,
  SyncState: true,
  SetPresence: true,
  SlidingSyncEvent: true,
  MediaHandlerEvent: true,
  CallFeedEvent: true,
  StatsReport: true,
  Relations: true,
  RelationsEvent: true,
  LocalStorageErrors: true,
  Crypto: true
};
Object.defineProperty(exports, "CallEvent", {
  enumerable: true,
  get: function () {
    return _call.CallEvent;
  }
});
Object.defineProperty(exports, "CallFeedEvent", {
  enumerable: true,
  get: function () {
    return _callFeed.CallFeedEvent;
  }
});
exports.Crypto = exports.ContentHelpers = void 0;
Object.defineProperty(exports, "CryptoEvent", {
  enumerable: true,
  get: function () {
    return _crypto2.CryptoEvent;
  }
});
Object.defineProperty(exports, "GroupCall", {
  enumerable: true,
  get: function () {
    return _groupCall.GroupCall;
  }
});
Object.defineProperty(exports, "GroupCallEvent", {
  enumerable: true,
  get: function () {
    return _groupCall.GroupCallEvent;
  }
});
Object.defineProperty(exports, "GroupCallIntent", {
  enumerable: true,
  get: function () {
    return _groupCall.GroupCallIntent;
  }
});
Object.defineProperty(exports, "GroupCallState", {
  enumerable: true,
  get: function () {
    return _groupCall.GroupCallState;
  }
});
Object.defineProperty(exports, "GroupCallStatsReportEvent", {
  enumerable: true,
  get: function () {
    return _groupCall.GroupCallStatsReportEvent;
  }
});
Object.defineProperty(exports, "GroupCallType", {
  enumerable: true,
  get: function () {
    return _groupCall.GroupCallType;
  }
});
Object.defineProperty(exports, "IdentityProviderBrand", {
  enumerable: true,
  get: function () {
    return _auth.IdentityProviderBrand;
  }
});
Object.defineProperty(exports, "LocalStorageErrors", {
  enumerable: true,
  get: function () {
    return _localStorageEventsEmitter.LocalStorageErrors;
  }
});
Object.defineProperty(exports, "LocationAssetType", {
  enumerable: true,
  get: function () {
    return _location.LocationAssetType;
  }
});
Object.defineProperty(exports, "MediaHandlerEvent", {
  enumerable: true,
  get: function () {
    return _mediaHandler.MediaHandlerEvent;
  }
});
Object.defineProperty(exports, "Relations", {
  enumerable: true,
  get: function () {
    return _relations.Relations;
  }
});
Object.defineProperty(exports, "RelationsEvent", {
  enumerable: true,
  get: function () {
    return _relations.RelationsEvent;
  }
});
Object.defineProperty(exports, "SSOAction", {
  enumerable: true,
  get: function () {
    return _auth.SSOAction;
  }
});
exports.SecretStorage = void 0;
Object.defineProperty(exports, "SetPresence", {
  enumerable: true,
  get: function () {
    return _sync.SetPresence;
  }
});
Object.defineProperty(exports, "SlidingSyncEvent", {
  enumerable: true,
  get: function () {
    return _slidingSync.SlidingSyncEvent;
  }
});
Object.defineProperty(exports, "StatsReport", {
  enumerable: true,
  get: function () {
    return _statsReport.StatsReport;
  }
});
Object.defineProperty(exports, "SyncState", {
  enumerable: true,
  get: function () {
    return _sync.SyncState;
  }
});
Object.defineProperty(exports, "TypedEventEmitter", {
  enumerable: true,
  get: function () {
    return _typedEventEmitter.TypedEventEmitter;
  }
});
exports.createClient = createClient;
Object.defineProperty(exports, "createNewMatrixCall", {
  enumerable: true,
  get: function () {
    return _call.createNewMatrixCall;
  }
});
exports.createRoomWidgetClient = createRoomWidgetClient;
exports.setCryptoStoreFactory = setCryptoStoreFactory;
var _memoryCryptoStore = require("./crypto/store/memory-crypto-store");
Object.keys(_memoryCryptoStore).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _memoryCryptoStore[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _memoryCryptoStore[key];
    }
  });
});
var _memory = require("./store/memory");
Object.keys(_memory).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _memory[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _memory[key];
    }
  });
});
var _scheduler = require("./scheduler");
Object.keys(_scheduler).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _scheduler[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _scheduler[key];
    }
  });
});
var _client = require("./client");
Object.keys(_client).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _client[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _client[key];
    }
  });
});
var _embedded = require("./embedded");
Object.keys(_embedded).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _embedded[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _embedded[key];
    }
  });
});
var _httpApi = require("./http-api");
Object.keys(_httpApi).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _httpApi[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _httpApi[key];
    }
  });
});
var _autodiscovery = require("./autodiscovery");
Object.keys(_autodiscovery).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _autodiscovery[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _autodiscovery[key];
    }
  });
});
var _syncAccumulator = require("./sync-accumulator");
Object.keys(_syncAccumulator).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _syncAccumulator[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _syncAccumulator[key];
    }
  });
});
var _errors = require("./errors");
Object.keys(_errors).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _errors[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _errors[key];
    }
  });
});
var _base = require("./base64");
Object.keys(_base).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _base[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _base[key];
    }
  });
});
var _beacon = require("./models/beacon");
Object.keys(_beacon).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _beacon[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _beacon[key];
    }
  });
});
var _event = require("./models/event");
Object.keys(_event).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _event[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _event[key];
    }
  });
});
var _room = require("./models/room");
Object.keys(_room).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _room[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _room[key];
    }
  });
});
var _eventTimeline = require("./models/event-timeline");
Object.keys(_eventTimeline).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _eventTimeline[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _eventTimeline[key];
    }
  });
});
var _eventTimelineSet = require("./models/event-timeline-set");
Object.keys(_eventTimelineSet).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _eventTimelineSet[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _eventTimelineSet[key];
    }
  });
});
var _poll = require("./models/poll");
Object.keys(_poll).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _poll[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _poll[key];
    }
  });
});
var _roomMember = require("./models/room-member");
Object.keys(_roomMember).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _roomMember[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _roomMember[key];
    }
  });
});
var _roomState = require("./models/room-state");
Object.keys(_roomState).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _roomState[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _roomState[key];
    }
  });
});
var _thread = require("./models/thread");
Object.keys(_thread).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _thread[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _thread[key];
    }
  });
});
var _typedEventEmitter = require("./models/typed-event-emitter");
Object.keys(_typedEventEmitter).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _typedEventEmitter[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _typedEventEmitter[key];
    }
  });
});
var _user = require("./models/user");
Object.keys(_user).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _user[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _user[key];
    }
  });
});
var _device = require("./models/device");
Object.keys(_device).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _device[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _device[key];
    }
  });
});
var _searchResult = require("./models/search-result");
Object.keys(_searchResult).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _searchResult[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _searchResult[key];
    }
  });
});
var _oidc = require("./oidc");
Object.keys(_oidc).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _oidc[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _oidc[key];
    }
  });
});
var _filter = require("./filter");
Object.keys(_filter).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _filter[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _filter[key];
    }
  });
});
var _timelineWindow = require("./timeline-window");
Object.keys(_timelineWindow).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _timelineWindow[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _timelineWindow[key];
    }
  });
});
var _interactiveAuth = require("./interactive-auth");
Object.keys(_interactiveAuth).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _interactiveAuth[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _interactiveAuth[key];
    }
  });
});
var _serviceTypes = require("./service-types");
Object.keys(_serviceTypes).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _serviceTypes[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _serviceTypes[key];
    }
  });
});
var _indexeddb = require("./store/indexeddb");
Object.keys(_indexeddb).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _indexeddb[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _indexeddb[key];
    }
  });
});
var _localStorageCryptoStore = require("./crypto/store/localStorage-crypto-store");
Object.keys(_localStorageCryptoStore).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _localStorageCryptoStore[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _localStorageCryptoStore[key];
    }
  });
});
var _indexeddbCryptoStore = require("./crypto/store/indexeddb-crypto-store");
Object.keys(_indexeddbCryptoStore).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _indexeddbCryptoStore[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _indexeddbCryptoStore[key];
    }
  });
});
var _contentRepo = require("./content-repo");
Object.keys(_contentRepo).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _contentRepo[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _contentRepo[key];
    }
  });
});
var _common = require("./@types/common");
Object.keys(_common).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _common[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _common[key];
    }
  });
});
var _uia = require("./@types/uia");
Object.keys(_uia).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _uia[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _uia[key];
    }
  });
});
var _event2 = require("./@types/event");
Object.keys(_event2).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _event2[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _event2[key];
    }
  });
});
var _PushRules = require("./@types/PushRules");
Object.keys(_PushRules).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _PushRules[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _PushRules[key];
    }
  });
});
var _partials = require("./@types/partials");
Object.keys(_partials).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _partials[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _partials[key];
    }
  });
});
var _requests = require("./@types/requests");
Object.keys(_requests).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _requests[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _requests[key];
    }
  });
});
var _search = require("./@types/search");
Object.keys(_search).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _search[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _search[key];
    }
  });
});
var _beacon2 = require("./@types/beacon");
Object.keys(_beacon2).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _beacon2[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _beacon2[key];
    }
  });
});
var _topic = require("./@types/topic");
Object.keys(_topic).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _topic[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _topic[key];
    }
  });
});
var _location = require("./@types/location");
Object.keys(_location).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _location[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _location[key];
    }
  });
});
var _threepids = require("./@types/threepids");
Object.keys(_threepids).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _threepids[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _threepids[key];
    }
  });
});
var _auth = require("./@types/auth");
Object.keys(_auth).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _auth[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _auth[key];
    }
  });
});
var _polls = require("./@types/polls");
Object.keys(_polls).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _polls[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _polls[key];
    }
  });
});
var _local_notifications = require("./@types/local_notifications");
Object.keys(_local_notifications).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _local_notifications[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _local_notifications[key];
    }
  });
});
var _registration = require("./@types/registration");
Object.keys(_registration).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _registration[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _registration[key];
    }
  });
});
var _read_receipts = require("./@types/read_receipts");
Object.keys(_read_receipts).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _read_receipts[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _read_receipts[key];
    }
  });
});
var _crypto = require("./@types/crypto");
Object.keys(_crypto).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _crypto[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _crypto[key];
    }
  });
});
var _extensible_events = require("./@types/extensible_events");
Object.keys(_extensible_events).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _extensible_events[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _extensible_events[key];
    }
  });
});
var _IIdentityServerProvider = require("./@types/IIdentityServerProvider");
Object.keys(_IIdentityServerProvider).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _IIdentityServerProvider[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _IIdentityServerProvider[key];
    }
  });
});
var _roomSummary = require("./models/room-summary");
Object.keys(_roomSummary).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _roomSummary[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _roomSummary[key];
    }
  });
});
var _eventStatus = require("./models/event-status");
Object.keys(_eventStatus).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _eventStatus[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _eventStatus[key];
    }
  });
});
var _ContentHelpers = _interopRequireWildcard(require("./content-helpers"));
exports.ContentHelpers = _ContentHelpers;
var _SecretStorage = _interopRequireWildcard(require("./secret-storage"));
exports.SecretStorage = _SecretStorage;
var _call = require("./webrtc/call");
var _groupCall = require("./webrtc/groupCall");
var _crypto2 = require("./crypto");
var _sync = require("./sync");
var _slidingSync = require("./sliding-sync");
var _mediaHandler = require("./webrtc/mediaHandler");
var _callFeed = require("./webrtc/callFeed");
var _statsReport = require("./webrtc/stats/statsReport");
var _relations = require("./models/relations");
var _localStorageEventsEmitter = require("./store/local-storage-events-emitter");
var _Crypto = _interopRequireWildcard(require("./crypto-api"));
exports.Crypto = _Crypto;
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
/*
Copyright 2015-2022 The Matrix.org Foundation C.I.C.

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

// used to be located here

/**
 * Types supporting cryptography.
 *
 * The most important is {@link Crypto.CryptoApi}, an instance of which can be retrieved via
 * {@link MatrixClient.getCrypto}.
 */

let cryptoStoreFactory = () => new _memoryCryptoStore.MemoryCryptoStore();

/**
 * Configure a different factory to be used for creating crypto stores
 *
 * @param fac - a function which will return a new `CryptoStore`
 */
function setCryptoStoreFactory(fac) {
  cryptoStoreFactory = fac;
}
function amendClientOpts(opts) {
  opts.store = opts.store ?? new _memory.MemoryStore({
    localStorage: global.localStorage
  });
  opts.scheduler = opts.scheduler ?? new _scheduler.MatrixScheduler();
  opts.cryptoStore = opts.cryptoStore ?? cryptoStoreFactory();
  return opts;
}

/**
 * Construct a Matrix Client. Similar to {@link MatrixClient}
 * except that the 'request', 'store' and 'scheduler' dependencies are satisfied.
 * @param opts - The configuration options for this client. These configuration
 * options will be passed directly to {@link MatrixClient}.
 *
 * @returns A new matrix client.
 * @see {@link MatrixClient} for the full list of options for
 * `opts`.
 */
function createClient(opts) {
  return new _client.MatrixClient(amendClientOpts(opts));
}

/**
 * Construct a Matrix Client that works in a widget.
 * This client has a subset of features compared to a full client.
 * It uses the widget-api to communicate with matrix. (widget \<-\> client \<-\> homeserver)
 * @returns A new matrix client with a subset of features.
 * @param opts - The configuration options for this client. These configuration
 * options will be passed directly to {@link MatrixClient}.
 * @param widgetApi - The widget api to use for communication.
 * @param capabilities - The capabilities the widget client will request.
 * @param roomId - The room id the widget is associated with.
 * @param sendContentLoaded - Whether to send a content loaded widget action immediately after initial setup.
 *   Set to `false` if the widget uses `waitForIFrameLoad=true` (in this case the client does not expect a content loaded action at all),
 *   or if the the widget wants to send the `ContentLoaded` action at a later point in time after the initial setup.
 */
function createRoomWidgetClient(widgetApi, capabilities, roomId, opts, sendContentLoaded = true) {
  return new _embedded.RoomWidgetClient(widgetApi, capabilities, roomId, amendClientOpts(opts), sendContentLoaded);
}