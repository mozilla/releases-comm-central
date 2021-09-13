"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CallFeed = exports.CallFeedEvent = void 0;

var _events = _interopRequireDefault(require("events"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/*
Copyright 2021 Šimon Brandner <simon.bra.ag@gmail.com>

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
let CallFeedEvent;
exports.CallFeedEvent = CallFeedEvent;

(function (CallFeedEvent) {
  CallFeedEvent["NewStream"] = "new_stream";
})(CallFeedEvent || (exports.CallFeedEvent = CallFeedEvent = {}));

class CallFeed extends _events.default {
  constructor(stream, userId, purpose, client, roomId) {
    super();
    this.stream = stream;
    this.userId = userId;
    this.purpose = purpose;
    this.client = client;
    this.roomId = roomId;
  }
  /**
   * Returns callRoom member
   * @returns member of the callRoom
   */


  getMember() {
    const callRoom = this.client.getRoom(this.roomId);
    return callRoom.getMember(this.userId);
  }
  /**
   * Returns true if CallFeed is local, otherwise returns false
   * @returns {boolean} is local?
   */


  isLocal() {
    return this.userId === this.client.getUserId();
  } // TODO: The two following methods should be later replaced
  // by something that will also check if the remote is muted

  /**
   * Returns true if audio is muted or if there are no audio
   * tracks, otherwise returns false
   * @returns {boolean} is audio muted?
   */


  isAudioMuted() {
    return this.stream.getAudioTracks().length === 0;
  }
  /**
   * Returns true video is muted or if there are no video
   * tracks, otherwise returns false
   * @returns {boolean} is video muted?
   */


  isVideoMuted() {
    // We assume only one video track
    return this.stream.getVideoTracks().length === 0;
  }
  /**
   * Replaces the current MediaStream with a new one.
   * This method should be only used by MatrixCall.
   * @param newStream new stream with which to replace the current one
   */


  setNewStream(newStream) {
    this.stream = newStream;
    this.emit(CallFeedEvent.NewStream, this.stream);
  }

}

exports.CallFeed = CallFeed;