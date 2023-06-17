"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WidgetDriver = void 0;
var _ = require("..");
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
                                                                                                                                                                                                                                                                                                                                                                                               * Copyright 2020 - 2021 The Matrix.org Foundation C.I.C.
                                                                                                                                                                                                                                                                                                                                                                                               *
                                                                                                                                                                                                                                                                                                                                                                                               * Licensed under the Apache License, Version 2.0 (the "License");
                                                                                                                                                                                                                                                                                                                                                                                               * you may not use this file except in compliance with the License.
                                                                                                                                                                                                                                                                                                                                                                                               * You may obtain a copy of the License at
                                                                                                                                                                                                                                                                                                                                                                                               *
                                                                                                                                                                                                                                                                                                                                                                                               *         http://www.apache.org/licenses/LICENSE-2.0
                                                                                                                                                                                                                                                                                                                                                                                               *
                                                                                                                                                                                                                                                                                                                                                                                               * Unless required by applicable law or agreed to in writing, software
                                                                                                                                                                                                                                                                                                                                                                                               * distributed under the License is distributed on an "AS IS" BASIS,
                                                                                                                                                                                                                                                                                                                                                                                               * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
                                                                                                                                                                                                                                                                                                                                                                                               * See the License for the specific language governing permissions and
                                                                                                                                                                                                                                                                                                                                                                                               * limitations under the License.
                                                                                                                                                                                                                                                                                                                                                                                               */
/**
 * Represents the functions and behaviour the widget-api is unable to
 * do, such as prompting the user for information or interacting with
 * the UI. Clients are expected to implement this class and override
 * any functions they need/want to support.
 *
 * This class assumes the client will have a context of a Widget
 * instance already.
 */
var WidgetDriver = /*#__PURE__*/function () {
  function WidgetDriver() {
    _classCallCheck(this, WidgetDriver);
  }
  _createClass(WidgetDriver, [{
    key: "validateCapabilities",
    value:
    /**
     * Verifies the widget's requested capabilities, returning the ones
     * it is approved to use. Mutating the requested capabilities will
     * have no effect.
     *
     * This SHOULD result in the user being prompted to approve/deny
     * capabilities.
     *
     * By default this rejects all capabilities (returns an empty set).
     * @param {Set<Capability>} requested The set of requested capabilities.
     * @returns {Promise<Set<Capability>>} Resolves to the allowed capabilities.
     */
    function validateCapabilities(requested) {
      return Promise.resolve(new Set());
    }

    /**
     * Sends an event into a room. If `roomId` is falsy, the client should send the event
     * into the room the user is currently looking at. The widget API will have already
     * verified that the widget is capable of sending the event to that room.
     * @param {string} eventType The event type to be sent.
     * @param {*} content The content for the event.
     * @param {string|null} stateKey The state key if this is a state event, otherwise null.
     * May be an empty string.
     * @param {string|null} roomId The room ID to send the event to. If falsy, the room the
     * user is currently looking at.
     * @returns {Promise<ISendEventDetails>} Resolves when the event has been sent with
     * details of that event.
     * @throws Rejected when the event could not be sent.
     */
  }, {
    key: "sendEvent",
    value: function sendEvent(eventType, content) {
      var stateKey = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
      var roomId = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;
      return Promise.reject(new Error("Failed to override function"));
    }

    /**
     * Sends a to-device event. The widget API will have already verified that the widget
     * is capable of sending the event.
     * @param {string} eventType The event type to be sent.
     * @param {boolean} encrypted Whether to encrypt the message contents.
     * @param {Object} contentMap A map from user ID and device ID to event content.
     * @returns {Promise<void>} Resolves when the event has been sent.
     * @throws Rejected when the event could not be sent.
     */
  }, {
    key: "sendToDevice",
    value: function sendToDevice(eventType, encrypted, contentMap) {
      return Promise.reject(new Error("Failed to override function"));
    }

    /**
     * Reads all events of the given type, and optionally `msgtype` (if applicable/defined),
     * the user has access to. The widget API will have already verified that the widget is
     * capable of receiving the events. Less events than the limit are allowed to be returned,
     * but not more. If `roomIds` is supplied, it may contain `Symbols.AnyRoom` to denote that
     * `limit` in each of the client's known rooms should be returned. When `null`, only the
     * room the user is currently looking at should be considered.
     * @param eventType The event type to be read.
     * @param msgtype The msgtype of the events to be read, if applicable/defined.
     * @param limit The maximum number of events to retrieve per room. Will be zero to denote "as many
     * as possible".
     * @param roomIds When null, the user's currently viewed room. Otherwise, the list of room IDs
     * to look within, possibly containing Symbols.AnyRoom to denote all known rooms.
     * @returns {Promise<IRoomEvent[]>} Resolves to the room events, or an empty array.
     */
  }, {
    key: "readRoomEvents",
    value: function readRoomEvents(eventType, msgtype, limit) {
      var roomIds = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;
      return Promise.resolve([]);
    }

    /**
     * Reads all events of the given type, and optionally state key (if applicable/defined),
     * the user has access to. The widget API will have already verified that the widget is
     * capable of receiving the events. Less events than the limit are allowed to be returned,
     * but not more. If `roomIds` is supplied, it may contain `Symbols.AnyRoom` to denote that
     * `limit` in each of the client's known rooms should be returned. When `null`, only the
     * room the user is currently looking at should be considered.
     * @param eventType The event type to be read.
     * @param stateKey The state key of the events to be read, if applicable/defined.
     * @param limit The maximum number of events to retrieve. Will be zero to denote "as many
     * as possible".
     * @param roomIds When null, the user's currently viewed room. Otherwise, the list of room IDs
     * to look within, possibly containing Symbols.AnyRoom to denote all known rooms.
     * @returns {Promise<IRoomEvent[]>} Resolves to the state events, or an empty array.
     */
  }, {
    key: "readStateEvents",
    value: function readStateEvents(eventType, stateKey, limit) {
      var roomIds = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;
      return Promise.resolve([]);
    }

    /**
     * Reads all events that are related to a given event. The widget API will
     * have already verified that the widget is capable of receiving the event,
     * or will make sure to reject access to events which are returned from this
     * function, but are not capable of receiving. If `relationType` or `eventType`
     * are set, the returned events should already be filtered. Less events than
     * the limit are allowed to be returned, but not more.
     * @param eventId The id of the parent event to be read.
     * @param roomId The room to look within. When undefined, the user's
     * currently viewed room.
     * @param relationType The relationship type of child events to search for.
     * When undefined, all relations are returned.
     * @param eventType The event type of child events to search for. When undefined,
     * all related events are returned.
     * @param from The pagination token to start returning results from, as
     * received from a previous call. If not supplied, results start at the most
     * recent topological event known to the server.
     * @param to The pagination token to stop returning results at. If not
     * supplied, results continue up to limit or until there are no more events.
     * @param limit The maximum number of events to retrieve per room. If not
     * supplied, the server will apply a default limit.
     * @param direction The direction to search for according to MSC3715
     * @returns Resolves to the room relations.
     */
  }, {
    key: "readEventRelations",
    value: function readEventRelations(eventId, roomId, relationType, eventType, from, to, limit, direction) {
      return Promise.resolve({
        chunk: []
      });
    }

    /**
     * Asks the user for permission to validate their identity through OpenID Connect. The
     * interface for this function is an observable which accepts the state machine of the
     * OIDC exchange flow. For example, if the client/user blocks the request then it would
     * feed back a `{state: Blocked}` into the observable. Similarly, if the user already
     * approved the widget then a `{state: Allowed}` would be fed into the observable alongside
     * the token itself. If the client is asking for permission, it should feed in a
     * `{state: PendingUserConfirmation}` followed by the relevant Allowed or Blocked state.
     *
     * The widget API will reject the widget's request with an error if this contract is not
     * met properly. By default, the widget driver will block all OIDC requests.
     * @param {SimpleObservable<IOpenIDUpdate>} observer The observable to feed updates into.
     */
  }, {
    key: "askOpenID",
    value: function askOpenID(observer) {
      observer.update({
        state: _.OpenIDRequestState.Blocked
      });
    }

    /**
     * Navigates the client with a matrix.to URI. In future this function will also be provided
     * with the Matrix URIs once matrix.to is replaced. The given URI will have already been
     * lightly checked to ensure it looks like a valid URI, though the implementation is recommended
     * to do further checks on the URI.
     * @param {string} uri The URI to navigate to.
     * @returns {Promise<void>} Resolves when complete.
     * @throws Throws if there's a problem with the navigation, such as invalid format.
     */
  }, {
    key: "navigate",
    value: function navigate(uri) {
      throw new Error("Navigation is not implemented");
    }

    /**
     * Polls for TURN server data, yielding an initial set of credentials as soon as possible, and
     * thereafter yielding new credentials whenever the previous ones expire. The widget API will
     * have already verified that the widget has permission to access TURN servers.
     * @yields {ITurnServer} The TURN server URIs and credentials currently available to the client.
     */
  }, {
    key: "getTurnServers",
    value: function getTurnServers() {
      throw new Error("TURN server support is not implemented");
    }

    /**
     * Search for users in the user directory.
     * @param searchTerm The term to search for.
     * @param limit The maximum number of results to return. If not supplied, the
     * @returns Resolves to the search results.
     */
  }, {
    key: "searchUserDirectory",
    value: function searchUserDirectory(searchTerm, limit) {
      return Promise.resolve({
        limited: false,
        results: []
      });
    }
  }]);
  return WidgetDriver;
}();
exports.WidgetDriver = WidgetDriver;
//# sourceMappingURL=WidgetDriver.js.map