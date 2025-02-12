/* -*- mode: js; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 sw=2 sts=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * An object containing the scroll state of the window.
 *
 * @typedef {object} ScrollState
 * @property {number} scrollX
 * @property {number} scrollY
 * @property {number} scrollMaxX
 * @property {boolean} scrollMaxY
 */

/**
 * Child actor for getting scroll information about a child window and scrolling
 * the child window by a number of pages.
 */
export class MessageScrollChild extends JSWindowActorChild {
  /**
   * @param {object} args
   * @param {"getSize"|"scrollByPages"} args.name
   * @param {?number} args.data
   * @param {?number} args.json
   * @param {boolean} args.sync
   * @param {object} args.target
   * @returns {Promise<?ScrollState>}
   */
  async receiveMessage(args) {
    if (args.name === "getSize") {
      return {
        scrollX: this.contentWindow.scrollX,
        scrollY: this.contentWindow.scrollY,
        scrollMaxX: this.contentWindow.scrollMaxX,
        scrollMaxY: this.contentWindow.scrollMaxY,
      };
    } else if (args.name === "scrollByPages") {
      this.contentWindow.scrollByPages(args.data);
      return null;
    }

    throw new Error("Unknown Message");
  }
}
