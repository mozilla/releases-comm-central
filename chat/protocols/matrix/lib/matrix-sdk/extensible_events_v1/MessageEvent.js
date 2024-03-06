"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MessageEvent = void 0;
var _ExtensibleEvent = require("./ExtensibleEvent");
var _extensible_events = require("../@types/extensible_events");
var _utilities = require("./utilities");
var _InvalidEventError = require("./InvalidEventError");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2022 - 2023 The Matrix.org Foundation C.I.C.

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
/**
 * Represents a message event. Message events are the simplest form of event with
 * just text (optionally of different mimetypes, like HTML).
 *
 * Message events can additionally be an Emote or Notice, though typically those
 * are represented as EmoteEvent and NoticeEvent respectively.
 */
class MessageEvent extends _ExtensibleEvent.ExtensibleEvent {
  /**
   * Creates a new MessageEvent from a pure format. Note that the event is
   * *not* parsed here: it will be treated as a literal m.message primary
   * typed event.
   * @param wireFormat - The event.
   */
  constructor(wireFormat) {
    super(wireFormat);
    /**
     * The default text for the event.
     */
    _defineProperty(this, "text", void 0);
    /**
     * The default HTML for the event, if provided.
     */
    _defineProperty(this, "html", void 0);
    /**
     * All the different renderings of the message. Note that this is the same
     * format as an m.message body but may contain elements not found directly
     * in the event content: this is because this is interpreted based off the
     * other information available in the event.
     */
    _defineProperty(this, "renderings", void 0);
    const mmessage = _extensible_events.M_MESSAGE.findIn(this.wireContent);
    const mtext = _extensible_events.M_TEXT.findIn(this.wireContent);
    const mhtml = _extensible_events.M_HTML.findIn(this.wireContent);
    if ((0, _utilities.isProvided)(mmessage)) {
      if (!Array.isArray(mmessage)) {
        throw new _InvalidEventError.InvalidEventError("m.message contents must be an array");
      }
      const text = mmessage.find(r => !(0, _utilities.isProvided)(r.mimetype) || r.mimetype === "text/plain");
      const html = mmessage.find(r => r.mimetype === "text/html");
      if (!text) throw new _InvalidEventError.InvalidEventError("m.message is missing a plain text representation");
      this.text = text.body;
      this.html = html?.body;
      this.renderings = mmessage;
    } else if ((0, _utilities.isOptionalAString)(mtext)) {
      this.text = mtext;
      this.html = mhtml;
      this.renderings = [{
        body: mtext,
        mimetype: "text/plain"
      }];
      if (this.html) {
        this.renderings.push({
          body: this.html,
          mimetype: "text/html"
        });
      }
    } else {
      throw new _InvalidEventError.InvalidEventError("Missing textual representation for event");
    }
  }
  isEquivalentTo(primaryEventType) {
    return (0, _extensible_events.isEventTypeSame)(primaryEventType, _extensible_events.M_MESSAGE);
  }
  serializeMMessageOnly() {
    let messageRendering = {
      [_extensible_events.M_MESSAGE.name]: this.renderings
    };

    // Use the shorthand if it's just a simple text event
    if (this.renderings.length === 1) {
      const mime = this.renderings[0].mimetype;
      if (mime === undefined || mime === "text/plain") {
        messageRendering = {
          [_extensible_events.M_TEXT.name]: this.renderings[0].body
        };
      }
    }
    return messageRendering;
  }
  serialize() {
    return {
      type: "m.room.message",
      content: _objectSpread(_objectSpread({}, this.serializeMMessageOnly()), {}, {
        body: this.text,
        msgtype: "m.text",
        format: this.html ? "org.matrix.custom.html" : undefined,
        formatted_body: this.html ?? undefined
      })
    };
  }

  /**
   * Creates a new MessageEvent from text and HTML.
   * @param text - The text.
   * @param html - Optional HTML.
   * @returns The representative message event.
   */
  static from(text, html) {
    return new MessageEvent({
      type: _extensible_events.M_MESSAGE.name,
      content: {
        [_extensible_events.M_TEXT.name]: text,
        [_extensible_events.M_HTML.name]: html
      }
    });
  }
}
exports.MessageEvent = MessageEvent;