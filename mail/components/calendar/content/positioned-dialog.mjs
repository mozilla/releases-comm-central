/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { getIdealDialogPosition } from "./dialog-position.mjs";

/**
 * Base class for a dialog positioned relative to a trigger and restrained by a
 * container. The position is determined by the logic in dialog-position.mjs.
 * The position and height of the dialog are constrained by the container
 * element.
 *
 * @tagname positioned-dialog
 * @attribute {number} margin - See margin property.
 * @attribute {string} trigger-selector - See triggerSelector property.
 */
export class PositionedDialog extends HTMLDialogElement {
  /**
   * The container in which the dialog should be visually contained.
   *
   * @type {HTMLElement}
   */
  container;

  /**
   *  Margin in pixels the dialog should be positioned with.
   *
   * @type {number}
   */
  margin;

  /**
   * Selector passed to `closest` on the event.target to determine the element
   * which the dialog should be positioned relative to.
   *
   * @type {string}
   */
  triggerSelector;

  /**
   * Modifies the default `show` method of the dialog to absolutely position the
   * dialog relative to a trigger element, restricted by a container element.
   *
   * The trigger element is determined by passing the trigger-selector to the
   * `event.target.closest`.
   *
   * Position is determined by `getIdealDialogPosition`
   *
   * The container restrains both the position and height of the dialog. The
   * width is not constrained because in ultra narrow viewports it's best to
   * overflow things like the today pane.
   *
   * @param {MouseEvent} [event] - The dblClick event that triggered the dialog.
   */
  show(event) {
    if (!event) {
      super.show();
      return;
    }

    //  If we have not yet stored a reference to the container element do so.
    if (!this.container) {
      this.container = document.getElementById(
        this.getAttribute("container-id")
      );
    }

    // If we have not yet read and stored the margin and size attributes do so.
    // We do this here because we don't support changing them and want to keep
    // this self contained for easy extension.
    if (!Number.isInteger(this.margin)) {
      this.margin = parseInt(this.getAttribute("margin"));
    }

    if (!this.triggerSelector) {
      this.triggerSelector = this.getAttribute("trigger-selector");
    }

    // Visibly hide the dialog but show it, this allows us to get the true
    // dimensions.
    this.style.visibility = "hidden";

    super.show();

    // Pass the DomRects and dialog information to
    const dialogRect = this.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    const trigger = event.target.closest(this.triggerSelector);
    const position = getIdealDialogPosition({
      container: containerRect,
      dialog: {
        height: dialogRect.height,
        margin: this.margin,
        width: dialogRect.width,
      },
      trigger: trigger.getBoundingClientRect(),
    });

    this.style.visibility = "visible";
    this.style.left = position.x;
    this.style.top = position.y;

    // Don't allow the dialog to exceed the height of the container.
    this.style.maxHeight = `${Math.floor(containerRect.height - this.margin * 2)}px`;
  }
}

customElements.define("positioned-dialog", PositionedDialog, {
  extends: "dialog",
});
