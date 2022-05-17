"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TypedEventEmitter = exports.EventEmitterEvents = void 0;

var _events = require("events");

/*
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
// eslint-disable-next-line no-restricted-imports
let EventEmitterEvents;
exports.EventEmitterEvents = EventEmitterEvents;

(function (EventEmitterEvents) {
  EventEmitterEvents["NewListener"] = "newListener";
  EventEmitterEvents["RemoveListener"] = "removeListener";
  EventEmitterEvents["Error"] = "error";
})(EventEmitterEvents || (exports.EventEmitterEvents = EventEmitterEvents = {}));

/**
 * Typed Event Emitter class which can act as a Base Model for all our model
 * and communication events.
 * This makes it much easier for us to distinguish between events, as we now need
 * to properly type this, so that our events are not stringly-based and prone
 * to silly typos.
 */
class TypedEventEmitter extends _events.EventEmitter {
  addListener(event, listener) {
    return super.addListener(event, listener);
  }

  emit(event, ...args) {
    return super.emit(event, ...args);
  }

  eventNames() {
    return super.eventNames();
  }

  listenerCount(event) {
    return super.listenerCount(event);
  }

  listeners(event) {
    return super.listeners(event);
  }

  off(event, listener) {
    return super.off(event, listener);
  }

  on(event, listener) {
    return super.on(event, listener);
  }

  once(event, listener) {
    return super.once(event, listener);
  }

  prependListener(event, listener) {
    return super.prependListener(event, listener);
  }

  prependOnceListener(event, listener) {
    return super.prependOnceListener(event, listener);
  }

  removeAllListeners(event) {
    return super.removeAllListeners(event);
  }

  removeListener(event, listener) {
    return super.removeListener(event, listener);
  }

  rawListeners(event) {
    return super.rawListeners(event);
  }

}

exports.TypedEventEmitter = TypedEventEmitter;