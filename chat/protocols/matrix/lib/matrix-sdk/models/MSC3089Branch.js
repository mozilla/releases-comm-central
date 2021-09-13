"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MSC3089Branch = void 0;

var _event = require("../@types/event");

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

/**
 * Represents a [MSC3089](https://github.com/matrix-org/matrix-doc/pull/3089) branch - a reference
 * to a file (leaf) in the tree. Note that this is UNSTABLE and subject to breaking changes
 * without notice.
 */
class MSC3089Branch {
  constructor(client, indexEvent) {// Nothing to do

    this.client = client;
    this.indexEvent = indexEvent;
  }
  /**
   * The file ID.
   */


  get id() {
    return this.indexEvent.getStateKey();
  }
  /**
   * Whether this branch is active/valid.
   */


  get isActive() {
    return this.indexEvent.getContent()["active"] === true;
  }

  get roomId() {
    return this.indexEvent.getRoomId();
  }
  /**
   * Deletes the file from the tree.
   * @returns {Promise<void>} Resolves when complete.
   */


  async delete() {
    await this.client.sendStateEvent(this.roomId, _event.UNSTABLE_MSC3089_BRANCH.name, {}, this.id);
    await this.client.redactEvent(this.roomId, this.id); // TODO: Delete edit history as well
  }
  /**
   * Gets the name for this file.
   * @returns {string} The name, or "Unnamed File" if unknown.
   */


  getName() {
    return this.indexEvent.getContent()['name'] || "Unnamed File";
  }
  /**
   * Sets the name for this file.
   * @param {string} name The new name for this file.
   * @returns {Promise<void>} Resolves when complete.
   */


  async setName(name) {
    await this.client.sendStateEvent(this.roomId, _event.UNSTABLE_MSC3089_BRANCH.name, _objectSpread(_objectSpread({}, this.indexEvent.getContent()), {}, {
      name: name
    }), this.id);
  }
  /**
   * Gets information about the file needed to download it.
   * @returns {Promise<{info: IEncryptedFile, httpUrl: string}>} Information about the file.
   */


  async getFileInfo() {
    const event = await this.getFileEvent();
    const file = event.getContent()['file'];
    const httpUrl = this.client.mxcUrlToHttp(file['url']);
    return {
      info: file,
      httpUrl: httpUrl
    };
  }
  /**
   * Gets the event the file points to.
   * @returns {Promise<MatrixEvent>} Resolves to the file's event.
   */


  async getFileEvent() {
    const room = this.client.getRoom(this.roomId);
    if (!room) throw new Error("Unknown room");
    const timeline = await this.client.getEventTimeline(room.getUnfilteredTimelineSet(), this.id);
    if (!timeline) throw new Error("Failed to get timeline for room event");
    const event = timeline.getEvents().find(e => e.getId() === this.id);
    if (!event) throw new Error("Failed to find event"); // Sometimes the event context doesn't decrypt for us, so do that.

    await this.client.decryptEventIfNeeded(event, {
      emit: false,
      isRetry: false
    });
    return event;
  }

}

exports.MSC3089Branch = MSC3089Branch;