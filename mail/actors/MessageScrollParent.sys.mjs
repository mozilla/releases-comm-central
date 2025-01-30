/* -*- mode: js; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 sw=2 sts=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Parent actor for controlling the scrolling of a child page
 */
export class MessageScrollParent extends JSWindowActorParent {
  /**
   * Scrolls the child window by a given number of pages.
   *
   * @type {number} The number of pages that the
   * child window should be scrolled by
   */
  scrollByPages(pages) {
    this.sendAsyncMessage("scrollByPages", pages);
  }

  /**
   * Gets the x and y scroll position and max scroll of the child window
   *
   * @returns Promise<{
   *    scrollX: number;
   *    scrollY: number;
   *    scrollMaxX: number;
   *    scrollMaxY: number;
   *  }>;
   */
  async getSize() {
    return this.sendQuery("getSize");
  }
}
