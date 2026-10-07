/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @typedef {object} dialogProperties
 * @property {number} height - The height of the dialog.
 * @property {number} width - The width of the dialog.
 * @property {number} margin - The margin to maintain around the dialog.
 * @property {"ltr"|"rtl"} [direction="ltr"] - The container's text direction.
 * @property {number} [triggerTopOffset=0] - The amount to place the dialog
 *  above a target when it is displayed alongside it.
 */

/**
 * @typedef {object} dialogPosition
 * @property {number} x - The height of the dialog.
 * @property {number} y - The width of the dialog.
 */

/**
 * Calculates the ideal coordinates to position a dialog relative to a trigger:
 * element within a container, based on the following logic.
 *
 * Horizontal:
 * 1. If the trigger is not visible center in the container.
 * 2. If there is space next to the trigger place the dialog next to it:
 *    Place on the side with more space if space is equal favor start.
 * 3. If not possible center the dialog with the trigger.
 * 4. If not possible Center the dialog in the container.
 *
 * Vertical:
 * 1. If the trigger is not visible center in the container.
 * 2. If positioning next to the trigger:
 *    Attempt to align the top of the dialog with the top of the trigger.
 *    The dialog should always maintain dialog.margin px space between the
 *    trigger or the container and the dialog edges.
 *   If the trigger is too close to the top, position dialog.margin px from the
 *    top.
 *   If the trigger is too close to the bottom, position dialog.margin px from
 *    the bottom.
 * 3. If positioning in a narrow viewport with space above or below for dialog:
 *    Position above or below trigger where there is the most room,
 *     if space is equal favoring below.
 * 4. If the viewport is narrow and there is not space above or below:
 *    Center the dialog in the viewport.
 *
 * @param {object} options
 * @param {?DOMRect} options.trigger - The trigger element's DOMRect for
 *  positioning relative to, if there is one.
 * @param {DOMRect} options.container - The container element's DOMRect for
 *  positioning within.
 * @param {dialogProperties} options.dialog - The size of the dialog element to position.
 *
 * @returns {dialogPosition}
 */
export function getIdealDialogPosition({ trigger, container, dialog }) {
  const notVisible = !trigger || trigger.width === 0 || trigger.height === 0;

  const clampToContainer = (value, size, start, end) => {
    const minimum = start + dialog.margin;
    const maximum = end - dialog.margin - size;

    // A dialog wider or taller than its container cannot keep the requested
    // margin. Preserve centering in that constrained case instead of pinning
    // it to one edge.
    if (maximum < minimum) {
      return value;
    }
    return Math.min(Math.max(value, minimum), maximum);
  };

  const viewportCenter = {
    x: `${clampToContainer(
      container.left + container.width / 2 - dialog.width / 2,
      dialog.width,
      container.left,
      container.right
    )}px`,
    y: `${clampToContainer(
      container.top + container.height / 2 - dialog.height / 2,
      dialog.height,
      container.top,
      container.bottom
    )}px`,
  };

  if (notVisible) {
    return viewportCenter;
  }

  const fullMargin = dialog.margin * 2;
  const fullDialogWidth = dialog.width + fullMargin;
  const fullDialogHeight = dialog.height + fullMargin;
  const isRTL = dialog.direction == "rtl";
  const startSpace = isRTL
    ? container.right - trigger.right
    : trigger.left - container.left;
  const endSpace = isRTL
    ? trigger.left - container.left
    : container.right - trigger.right;
  const bottomSpace = container.bottom - trigger.bottom;
  const topSpace = trigger.top - container.top;
  const hasSpaceTop = topSpace >= fullDialogHeight;
  const hasSpaceBottom = bottomSpace >= fullDialogHeight;
  const hasSpaceStart = startSpace >= fullDialogWidth;
  const hasSpaceEnd = endSpace >= fullDialogWidth;
  const hasHorizontalSpace = hasSpaceEnd || hasSpaceStart;
  const hasVerticalSpace = hasSpaceTop || hasSpaceBottom;
  const hasVerticalSpaceNextTo =
    bottomSpace + trigger.height >= dialog.height + dialog.margin &&
    trigger.top > container.top &&
    trigger.top - container.top >= dialog.margin;
  const triggerCenter = trigger.left + trigger.width / 2;
  const halfDialogAffordance = dialog.width / 2 + dialog.margin;
  const canCenterOnTarget =
    triggerCenter - container.left >= halfDialogAffordance &&
    container.right - triggerCenter >= halfDialogAffordance;

  let y;
  let x;

  // If we have more end space and have enough end space position at the end.
  if (endSpace > startSpace && hasSpaceEnd) {
    x = `${clampToContainer(
      isRTL
        ? trigger.left - dialog.margin - dialog.width
        : trigger.right + dialog.margin,
      dialog.width,
      container.left,
      container.right
    )}px`;
  } else if (hasSpaceStart) {
    x = `${clampToContainer(
      isRTL
        ? trigger.right + dialog.margin
        : trigger.left - dialog.margin - dialog.width,
      dialog.width,
      container.left,
      container.right
    )}px`;
  } else if (canCenterOnTarget) {
    x = `${triggerCenter - dialog.width / 2}px`;
  } else {
    // Center in Viewport
    x = viewportCenter.x;
  }

  if (hasHorizontalSpace) {
    if (hasVerticalSpaceNextTo) {
      y = `${Math.max(
        trigger.top - (dialog.triggerTopOffset ?? 0),
        container.top + dialog.margin
      )}px`;
    } else if (
      container.bottom <= trigger.top &&
      container.height >= fullDialogHeight
    ) {
      y = `${container.bottom - dialog.height - dialog.margin}px`;
    } else if (trigger.top - container.top <= dialog.margin) {
      y = `${container.top + dialog.margin}px`;
    } else if (container.height >= fullDialogHeight) {
      y = `${container.bottom - dialog.height - dialog.margin}px`;
    }
  } else if (hasVerticalSpace) {
    if (
      container.bottom <= trigger.top &&
      container.height >= fullDialogHeight
    ) {
      y = `${container.bottom - dialog.height - dialog.margin}px`;
    } else if (trigger.top - container.top <= dialog.margin) {
      y = `${container.top + dialog.margin}px`;
    } else if (hasSpaceBottom) {
      y = `${trigger.bottom + dialog.margin}px`;
    } else {
      y = `${trigger.top - dialog.margin - dialog.height}px`;
    }
  } else {
    y = viewportCenter.y;
  }

  return { x, y };
}
