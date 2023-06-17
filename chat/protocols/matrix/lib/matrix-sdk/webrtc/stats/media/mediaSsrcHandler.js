"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MediaSsrcHandler = void 0;
var _sdpTransform = require("sdp-transform");
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
                                                                                                                                                                                                                                                                                                                                                                                          Copyright 2023 The Matrix.org Foundation C.I.C.
                                                                                                                                                                                                                                                                                                                                                                                          
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
class MediaSsrcHandler {
  constructor() {
    _defineProperty(this, "ssrcToMid", {
      local: new Map(),
      remote: new Map()
    });
  }
  findMidBySsrc(ssrc, type) {
    let mid;
    this.ssrcToMid[type].forEach((ssrcs, m) => {
      if (ssrcs.find(s => s == ssrc)) {
        mid = m;
        return;
      }
    });
    return mid;
  }
  parse(description, type) {
    const sdp = (0, _sdpTransform.parse)(description);
    const ssrcToMid = new Map();
    sdp.media.forEach(m => {
      if (!!m.mid && m.type === "video" || m.type === "audio") {
        const ssrcs = [];
        m.ssrcs?.forEach(ssrc => {
          if (ssrc.attribute === "cname") {
            ssrcs.push(`${ssrc.id}`);
          }
        });
        ssrcToMid.set(`${m.mid}`, ssrcs);
      }
    });
    this.ssrcToMid[type] = ssrcToMid;
  }
  getSsrcToMidMap(type) {
    return this.ssrcToMid[type];
  }
}
exports.MediaSsrcHandler = MediaSsrcHandler;