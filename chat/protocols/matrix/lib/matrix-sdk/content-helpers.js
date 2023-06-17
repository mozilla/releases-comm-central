"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.makeBeaconInfoContent = exports.makeBeaconContent = exports.getTextForLocationEvent = void 0;
exports.makeEmoteMessage = makeEmoteMessage;
exports.makeHtmlEmote = makeHtmlEmote;
exports.makeHtmlMessage = makeHtmlMessage;
exports.makeHtmlNotice = makeHtmlNotice;
exports.makeLocationContent = void 0;
exports.makeNotice = makeNotice;
exports.makeTextMessage = makeTextMessage;
exports.parseTopicContent = exports.parseLocationEvent = exports.parseBeaconInfoContent = exports.parseBeaconContent = exports.makeTopicContent = void 0;
var _event = require("./@types/event");
var _extensible_events = require("./@types/extensible_events");
var _utilities = require("./extensible_events_v1/utilities");
var _location = require("./@types/location");
var _topic = require("./@types/topic");
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
                                                                                                                                                                                                                                                                                                                                                                                          Copyright 2018 - 2022 The Matrix.org Foundation C.I.C.
                                                                                                                                                                                                                                                                                                                                                                                          
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
 * Generates the content for a HTML Message event
 * @param body - the plaintext body of the message
 * @param htmlBody - the HTML representation of the message
 * @returns
 */
function makeHtmlMessage(body, htmlBody) {
  return {
    msgtype: _event.MsgType.Text,
    format: "org.matrix.custom.html",
    body: body,
    formatted_body: htmlBody
  };
}

/**
 * Generates the content for a HTML Notice event
 * @param body - the plaintext body of the notice
 * @param htmlBody - the HTML representation of the notice
 * @returns
 */
function makeHtmlNotice(body, htmlBody) {
  return {
    msgtype: _event.MsgType.Notice,
    format: "org.matrix.custom.html",
    body: body,
    formatted_body: htmlBody
  };
}

/**
 * Generates the content for a HTML Emote event
 * @param body - the plaintext body of the emote
 * @param htmlBody - the HTML representation of the emote
 * @returns
 */
function makeHtmlEmote(body, htmlBody) {
  return {
    msgtype: _event.MsgType.Emote,
    format: "org.matrix.custom.html",
    body: body,
    formatted_body: htmlBody
  };
}

/**
 * Generates the content for a Plaintext Message event
 * @param body - the plaintext body of the emote
 * @returns
 */
function makeTextMessage(body) {
  return {
    msgtype: _event.MsgType.Text,
    body: body
  };
}

/**
 * Generates the content for a Plaintext Notice event
 * @param body - the plaintext body of the notice
 * @returns
 */
function makeNotice(body) {
  return {
    msgtype: _event.MsgType.Notice,
    body: body
  };
}

/**
 * Generates the content for a Plaintext Emote event
 * @param body - the plaintext body of the emote
 * @returns
 */
function makeEmoteMessage(body) {
  return {
    msgtype: _event.MsgType.Emote,
    body: body
  };
}

/** Location content helpers */

const getTextForLocationEvent = (uri, assetType, timestamp, description) => {
  const date = `at ${new Date(timestamp).toISOString()}`;
  const assetName = assetType === _location.LocationAssetType.Self ? "User" : undefined;
  const quotedDescription = description ? `"${description}"` : undefined;
  return [assetName, "Location", quotedDescription, uri, date].filter(Boolean).join(" ");
};

/**
 * Generates the content for a Location event
 * @param uri - a geo:// uri for the location
 * @param timestamp - the timestamp when the location was correct (milliseconds since the UNIX epoch)
 * @param description - the (optional) label for this location on the map
 * @param assetType - the (optional) asset type of this location e.g. "m.self"
 * @param text - optional. A text for the location
 */
exports.getTextForLocationEvent = getTextForLocationEvent;
const makeLocationContent = (text, uri, timestamp, description, assetType) => {
  const defaultedText = text ?? getTextForLocationEvent(uri, assetType || _location.LocationAssetType.Self, timestamp, description);
  const timestampEvent = timestamp ? {
    [_location.M_TIMESTAMP.name]: timestamp
  } : {};
  return _objectSpread({
    msgtype: _event.MsgType.Location,
    body: defaultedText,
    geo_uri: uri,
    [_location.M_LOCATION.name]: {
      description,
      uri
    },
    [_location.M_ASSET.name]: {
      type: assetType || _location.LocationAssetType.Self
    },
    [_extensible_events.M_TEXT.name]: defaultedText
  }, timestampEvent);
};

/**
 * Parse location event content and transform to
 * a backwards compatible modern m.location event format
 */
exports.makeLocationContent = makeLocationContent;
const parseLocationEvent = wireEventContent => {
  const location = _location.M_LOCATION.findIn(wireEventContent);
  const asset = _location.M_ASSET.findIn(wireEventContent);
  const timestamp = _location.M_TIMESTAMP.findIn(wireEventContent);
  const text = _extensible_events.M_TEXT.findIn(wireEventContent);
  const geoUri = location?.uri ?? wireEventContent?.geo_uri;
  const description = location?.description;
  const assetType = asset?.type ?? _location.LocationAssetType.Self;
  const fallbackText = text ?? wireEventContent.body;
  return makeLocationContent(fallbackText, geoUri, timestamp ?? undefined, description, assetType);
};

/**
 * Topic event helpers
 */
exports.parseLocationEvent = parseLocationEvent;
const makeTopicContent = (topic, htmlTopic) => {
  const renderings = [{
    body: topic,
    mimetype: "text/plain"
  }];
  if ((0, _utilities.isProvided)(htmlTopic)) {
    renderings.push({
      body: htmlTopic,
      mimetype: "text/html"
    });
  }
  return {
    topic,
    [_topic.M_TOPIC.name]: renderings
  };
};
exports.makeTopicContent = makeTopicContent;
const parseTopicContent = content => {
  const mtopic = _topic.M_TOPIC.findIn(content);
  if (!Array.isArray(mtopic)) {
    return {
      text: content.topic
    };
  }
  const text = mtopic?.find(r => !(0, _utilities.isProvided)(r.mimetype) || r.mimetype === "text/plain")?.body ?? content.topic;
  const html = mtopic?.find(r => r.mimetype === "text/html")?.body;
  return {
    text,
    html
  };
};

/**
 * Beacon event helpers
 */
exports.parseTopicContent = parseTopicContent;
const makeBeaconInfoContent = (timeout, isLive, description, assetType, timestamp) => ({
  description,
  timeout,
  live: isLive,
  [_location.M_TIMESTAMP.name]: timestamp || Date.now(),
  [_location.M_ASSET.name]: {
    type: assetType ?? _location.LocationAssetType.Self
  }
});
exports.makeBeaconInfoContent = makeBeaconInfoContent;
/**
 * Flatten beacon info event content
 */
const parseBeaconInfoContent = content => {
  const {
    description,
    timeout,
    live
  } = content;
  const timestamp = _location.M_TIMESTAMP.findIn(content) ?? undefined;
  const asset = _location.M_ASSET.findIn(content);
  return {
    description,
    timeout,
    live,
    assetType: asset?.type,
    timestamp
  };
};
exports.parseBeaconInfoContent = parseBeaconInfoContent;
const makeBeaconContent = (uri, timestamp, beaconInfoEventId, description) => ({
  [_location.M_LOCATION.name]: {
    description,
    uri
  },
  [_location.M_TIMESTAMP.name]: timestamp,
  "m.relates_to": {
    rel_type: _extensible_events.REFERENCE_RELATION.name,
    event_id: beaconInfoEventId
  }
});
exports.makeBeaconContent = makeBeaconContent;
const parseBeaconContent = content => {
  const location = _location.M_LOCATION.findIn(content);
  const timestamp = _location.M_TIMESTAMP.findIn(content) ?? undefined;
  return {
    description: location?.description,
    uri: location?.uri,
    timestamp
  };
};
exports.parseBeaconContent = parseBeaconContent;