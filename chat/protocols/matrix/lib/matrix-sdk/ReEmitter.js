"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TypedReEmitter = exports.ReEmitter = void 0;
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2017 Vector Creations Ltd
Copyright 2017 New Vector Ltd

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

class ReEmitter {
  constructor(target) {
    this.target = target;
    // Map from emitter to event name to re-emitter
    _defineProperty(this, "reEmitters", new WeakMap());
  }
  reEmit(source, eventNames) {
    let reEmittersByEvent = this.reEmitters.get(source);
    if (!reEmittersByEvent) {
      reEmittersByEvent = new Map();
      this.reEmitters.set(source, reEmittersByEvent);
    }
    for (const eventName of eventNames) {
      if (reEmittersByEvent.has(eventName)) continue;

      // We include the source as the last argument for event handlers which may need it,
      // such as read receipt listeners on the client class which won't have the context
      // of the room.
      const forSource = (...args) => {
        // EventEmitter special cases 'error' to make the emit function throw if no
        // handler is attached, which sort of makes sense for making sure that something
        // handles an error, but for re-emitting, there could be a listener on the original
        // source object so the test doesn't really work. We *could* try to replicate the
        // same logic and throw if there is no listener on either the source or the target,
        // but this behaviour is fairly undesireable for us anyway: the main place we throw
        // 'error' events is for calls, where error events are usually emitted some time
        // later by a different part of the code where 'emit' throwing because the app hasn't
        // added an error handler isn't terribly helpful. (A better fix in retrospect may
        // have been to just avoid using the event name 'error', but backwards compat...)
        if (eventName === "error" && this.target.listenerCount("error") === 0) return;
        this.target.emit(eventName, ...args, source);
      };
      source.on(eventName, forSource);
      reEmittersByEvent.set(eventName, forSource);
    }
  }
  stopReEmitting(source, eventNames) {
    const reEmittersByEvent = this.reEmitters.get(source);
    if (!reEmittersByEvent) return; // We were never re-emitting these events in the first place

    for (const eventName of eventNames) {
      source.off(eventName, reEmittersByEvent.get(eventName));
      reEmittersByEvent.delete(eventName);
    }
    if (reEmittersByEvent.size === 0) this.reEmitters.delete(source);
  }
}
exports.ReEmitter = ReEmitter;
class TypedReEmitter extends ReEmitter {
  constructor(target) {
    super(target);
  }
  reEmit(source, eventNames) {
    super.reEmit(source, eventNames);
  }
  stopReEmitting(source, eventNames) {
    super.stopReEmitting(source, eventNames);
  }
}
exports.TypedReEmitter = TypedReEmitter;