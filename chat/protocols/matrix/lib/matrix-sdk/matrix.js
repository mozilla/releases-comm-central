"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  setCryptoStoreFactory: true,
  createClient: true,
  createRoomWidgetClient: true,
  ContentHelpers: true,
  SecretStorage: true,
  createNewMatrixCall: true,
  GroupCallEvent: true,
  GroupCallIntent: true,
  GroupCallState: true,
  GroupCallType: true,
  CryptoEvent: true,
  DeviceVerificationStatus: true,
  Crypto: true
};
exports.Crypto = exports.ContentHelpers = void 0;
Object.defineProperty(exports, "CryptoEvent", {
  enumerable: true,
  get: function () {
    return _crypto.CryptoEvent;
  }
});
Object.defineProperty(exports, "DeviceVerificationStatus", {
  enumerable: true,
  get: function () {
    return _Crypto.DeviceVerificationStatus;
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
Object.defineProperty(exports, "GroupCallType", {
  enumerable: true,
  get: function () {
    return _groupCall.GroupCallType;
  }
});
exports.SecretStorage = void 0;
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
var _ContentHelpers = _interopRequireWildcard(require("./content-helpers"));
exports.ContentHelpers = _ContentHelpers;
var _SecretStorage = _interopRequireWildcard(require("./secret-storage"));
exports.SecretStorage = _SecretStorage;
var _call = require("./webrtc/call");
var _groupCall = require("./webrtc/groupCall");
var _crypto = require("./crypto");
var _Crypto = _interopRequireWildcard(require("./crypto-api"));
exports.Crypto = _Crypto;
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
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

/**
 * Backwards compatibility re-export
 * @internal
 * @deprecated use {@link Crypto.CryptoApi}
 */

/**
 * Backwards compatibility re-export
 * @internal
 * @deprecated use {@link Crypto.DeviceVerificationStatus}
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
function createRoomWidgetClient(widgetApi, capabilities, roomId, opts) {
  return new _embedded.RoomWidgetClient(widgetApi, capabilities, roomId, amendClientOpts(opts));
}