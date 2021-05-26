"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SDPStreamMetadataPurpose = void 0;
// allow camelcase as these are events type that go onto the wire

/* eslint-disable camelcase */
let SDPStreamMetadataPurpose;
exports.SDPStreamMetadataPurpose = SDPStreamMetadataPurpose;

(function (SDPStreamMetadataPurpose) {
  SDPStreamMetadataPurpose["Usermedia"] = "m.usermedia";
  SDPStreamMetadataPurpose["Screenshare"] = "m.screenshare";
})(SDPStreamMetadataPurpose || (exports.SDPStreamMetadataPurpose = SDPStreamMetadataPurpose = {}));
/* eslint-enable camelcase */