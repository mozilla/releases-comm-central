"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.eventMapperFor = eventMapperFor;

var _event = require("./models/event");

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function eventMapperFor(client, options) {
  let preventReEmit = Boolean(options.preventReEmit);
  const decrypt = options.decrypt !== false;

  function mapper(plainOldJsObject) {
    const room = client.getRoom(plainOldJsObject.room_id);
    let event; // If the event is already known to the room, let's re-use the model rather than duplicating.
    // We avoid doing this to state events as they may be forward or backwards looking which tweaks behaviour.

    if (room && plainOldJsObject.state_key === undefined) {
      event = room.findEventById(plainOldJsObject.event_id);
    }

    if (!event || event.status) {
      event = new _event.MatrixEvent(plainOldJsObject);
    } else {
      // merge the latest unsigned data from the server
      event.setUnsigned(_objectSpread(_objectSpread({}, event.getUnsigned()), plainOldJsObject.unsigned)); // prevent doubling up re-emitters

      preventReEmit = true;
    }

    const thread = room?.findThreadForEvent(event);

    if (thread) {
      event.setThread(thread);
    }

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