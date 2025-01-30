/* -*- mode: js; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 sw=2 sts=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Child actor for getting scroll information and scrolling a child
 * window by a number of pages.
 */

export class MessageScrollChild extends JSWindowActorChild {
  /**
   * @param {{
   *   name: 'getSize' | 'scrollByPages';
   *   data: number | null;
   *   json: number | null;
   *   sync: Boolean;
   *   target: Record<unknown, any>;
   * }} args
   * @returns Promise<{
   *    scrollX: number;
   *    scrollY: number;
   *    scrollMaxX: number;
   *    scrollMaxY: number;
   *  } | null>
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
