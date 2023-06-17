"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.eventMapperFor = eventMapperFor;
var _event = require("./models/event");
var _event2 = require("./@types/event");
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
                                                                                                                                                                                                                                                                                                                                                                                          Copyright 2021 The Matrix.org Foundation C.I.C.
                                                                                                                                                                                                                                                                                                                                                                                          
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
function eventMapperFor(client, options) {
  let preventReEmit = Boolean(options.preventReEmit);
  const decrypt = options.decrypt !== false;
  function mapper(plainOldJsObject) {
    if (options.toDevice) {
      delete plainOldJsObject.room_id;
    }
    const room = client.getRoom(plainOldJsObject.room_id);
    let event;
    // If the event is already known to the room, let's re-use the model rather than duplicating.
    // We avoid doing this to state events as they may be forward or backwards looking which tweaks behaviour.
    if (room && plainOldJsObject.state_key === undefined) {
      event = room.findEventById(plainOldJsObject.event_id);
    }
    if (!event || event.status) {
      event = new _event.MatrixEvent(plainOldJsObject);
    } else {
      // merge the latest unsigned data from the server
      event.setUnsigned(_objectSpread(_objectSpread({}, event.getUnsigned()), plainOldJsObject.unsigned));
      // prevent doubling up re-emitters
      preventReEmit = true;
    }

    // if there is a complete edit bundled alongside the event, perform the replacement.
    // (prior to MSC3925, events were automatically replaced on the server-side. MSC3925 proposes that that doesn't
    // happen automatically but the server does provide us with the whole content of the edit event.)
    const bundledEdit = event.getServerAggregatedRelation(_event2.RelationType.Replace);
    if (bundledEdit?.content) {
      const replacement = mapper(bundledEdit);
      // XXX: it's worth noting that the spec says we should only respect encrypted edits if, once decrypted, the
      //   replacement has a `m.new_content` property. The problem is that we haven't yet decrypted the replacement
      //   (it should be happening in the background), so we can't enforce this. Possibly we should for decryption
      //   to complete, but that sounds a bit racy. For now, we just assume it's ok.
      event.makeReplaced(replacement);
    }
    const thread = room?.findThreadForEvent(event);
    if (thread) {
      event.setThread(thread);
    }

    // TODO: once we get rid of the old libolm-backed crypto, we can restrict this to room events (rather than
    //   to-device events), because the rust implementation decrypts to-device messages at a higher level.
    //   Generally we probably want to use a different eventMapper implementation for to-device events because
    if (event.isEncrypted()) {
      if (!preventReEmit) {
        client.reEmitter.reEmit(event, [_event.MatrixEventEvent.Decrypted]);
      }
      if (decrypt) {
        client.decryptEventIfNeeded(event);
      }
    }
    if (!preventReEmit) {
      client.reEmitter.reEmit(event, [_event.MatrixEventEvent.Replaced, _event.MatrixEventEvent.VisibilityChange]);
      room?.reEmitter.reEmit(event, [_event.MatrixEventEvent.BeforeRedaction]);
    }
    return event;
  }
  return mapper;
}