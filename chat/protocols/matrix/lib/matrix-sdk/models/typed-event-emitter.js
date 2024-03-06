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
/** Events emitted by EventEmitter itself */
let EventEmitterEvents = exports.EventEmitterEvents = /*#__PURE__*/function (EventEmitterEvents) {
  EventEmitterEvents["NewListener"] = "newListener";
  EventEmitterEvents["RemoveListener"] = "removeListener";
  EventEmitterEvents["Error"] = "error";
  return EventEmitterEvents;
}({});
/** Base class for types mapping from event name to the type of listeners to that event */
/**
 * The expected type of a listener function for a particular event.
 *
 * Type parameters:
 *   * `E` - List of all events emitted by the `TypedEventEmitter`. Normally an enum type.
 *   * `A` - A type providing mappings from event names to listener types.
 *   * `T` - The name of the actual event that this listener is for. Normally one of the types in `E` or
 *           {@link EventEmitterEvents}.
 */
/**
 * Typed Event Emitter class which can act as a Base Model for all our model
 * and communication events.
 * This makes it much easier for us to distinguish between events, as we now need
 * to properly type this, so that our events are not stringly-based and prone
 * to silly typos.
 *
 * Type parameters:
 *  * `Events` - List of all events emitted by this `TypedEventEmitter`. Normally an enum type.
 *  * `Arguments` - A {@link ListenerMap} type providing mappings from event names to listener types.
 *  * `SuperclassArguments` - TODO: not really sure. Alternative listener mappings, I think? But only honoured for `.emit`?
 */
class TypedEventEmitter extends _events.EventEmitter {
  /**
   * Alias for {@link TypedEventEmitter#on}.
   */
  addListener(event, listener) {
    return super.addListener(event, listener);
  }

  /**
   * Synchronously calls each of the listeners registered for the event named
   * `event`, in the order they were registered, passing the supplied arguments
   * to each.
   *
   * @param event - The name of the event to emit
   * @param args - Arguments to pass to the listener
   * @returns `true` if the event had listeners, `false` otherwise.
   */

  emit(event, ...args) {
    return super.emit(event, ...args);
  }

  /**
   * Similar to `emit` but calls all listeners within a `Promise.all` and returns the promise chain
   * @param event - The name of the event to emit
   * @param args - Arguments to pass to the listener
   * @returns `true` if the event had listeners, `false` otherwise.
   */

  async emitPromised(event, ...args) {
    const listeners = this.listeners(event);
    return Promise.allSettled(listeners.map(l => l(...args))).then(() => {
      return listeners.length > 0;
    });
  }

  /**
   * Returns the number of listeners listening to the event named `event`.
   *
   * @param event - The name of the event being listened for
   */
  listenerCount(event) {
    return super.listenerCount(event);
  }

  /**
   * Returns a copy of the array of listeners for the event named `event`.
   */
  listeners(event) {
    return super.listeners(event);
  }

  /**
   * Alias for {@link TypedEventEmitter#removeListener}
   */
  off(event, listener) {
    return super.off(event, listener);
  }

  /**
   * Adds the `listener` function to the end of the listeners array for the
   * event named `event`.
   *
   * No checks are made to see if the `listener` has already been added. Multiple calls
   * passing the same combination of `event` and `listener` will result in the `listener`
   * being added, and called, multiple times.
   *
   * By default, event listeners are invoked in the order they are added. The
   * {@link TypedEventEmitter#prependListener} method can be used as an alternative to add the
   * event listener to the beginning of the listeners array.
   *
   * @param event - The name of the event.
   * @param listener - The callback function
   *
   * @returns a reference to the `EventEmitter`, so that calls can be chained.
   */
  on(event, listener) {
    return super.on(event, listener);
  }

  /**
   * Adds a **one-time** `listener` function for the event named `event`. The
   * next time `event` is triggered, this listener is removed and then invoked.
   *
   * Returns a reference to the `EventEmitter`, so that calls can be chained.
   *
   * By default, event listeners are invoked in the order they are added.
   * The {@link TypedEventEmitter#prependOnceListener} method can be used as an alternative to add the
   * event listener to the beginning of the listeners array.
   *
   * @param event - The name of the event.
   * @param listener - The callback function
   *
   * @returns a reference to the `EventEmitter`, so that calls can be chained.
   */
  once(event, listener) {
    return super.once(event, listener);
  }

  /**
   * Adds the `listener` function to the _beginning_ of the listeners array for the
   * event named `event`.
   *
   * No checks are made to see if the `listener` has already been added. Multiple calls
   * passing the same combination of `event` and `listener` will result in the `listener`
   * being added, and called, multiple times.
   *
   * @param event - The name of the event.
   * @param listener - The callback function
   *
   * @returns a reference to the `EventEmitter`, so that calls can be chained.
   */
  prependListener(event, listener) {
    return super.prependListener(event, listener);
  }

  /**
   * Adds a **one-time**`listener` function for the event named `event` to the _beginning_ of the listeners array.
   * The next time `event` is triggered, this listener is removed, and then invoked.
   *
   * @param event - The name of the event.
   * @param listener - The callback function
   *
   * @returns a reference to the `EventEmitter`, so that calls can be chained.
   */
  prependOnceListener(event, listener) {
    return super.prependOnceListener(event, listener);
  }

  /**
   * Removes all listeners, or those of the specified `event`.
   *
   * It is bad practice to remove listeners added elsewhere in the code,
   * particularly when the `EventEmitter` instance was created by some other
   * component or module (e.g. sockets or file streams).
   *
   * @param event - The name of the event. If undefined, all listeners everywhere are removed.
   * @returns a reference to the `EventEmitter`, so that calls can be chained.
   */
  removeAllListeners(event) {
    // EventEmitter::removeAllListeners uses `arguments.length` to determine undefined case
    if (event === undefined) {
      return super.removeAllListeners();
    }
    return super.removeAllListeners(event);
  }

  /**
   * Removes the specified `listener` from the listener array for the event named `event`.
   *
   * @returns a reference to the `EventEmitter`, so that calls can be chained.
   */
  removeListener(event, listener) {
    return super.removeListener(event, listener);
  }

  /**
   * Returns a copy of the array of listeners for the event named `eventName`,
   * including any wrappers (such as those created by `.once()`).
   */
  rawListeners(event) {
    return super.rawListeners(event);
  }
}
exports.TypedEventEmitter = TypedEventEmitter;