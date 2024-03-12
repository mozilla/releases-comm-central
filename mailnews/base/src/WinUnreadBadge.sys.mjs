/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Based on https://github.com/bstreiff/unread-badge.
 *
 * Copyright (c) 2013-2020 Brandon Streiff
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

XPCOMUtils.defineLazyServiceGetters(lazy, {
  imgTools: ["@mozilla.org/image/tools;1", "imgITools"],
  taskbar: ["@mozilla.org/windows-taskbar;1", "nsIWinTaskbar"],
});

/**
 * Get an imgIContainer instance from a canvas element.
 *
 * @param {HTMLCanvasElement} canvas - The canvas element.
 * @param {number} width - The width of the canvas to use.
 * @param {number} height - The height of the canvas to use.
 * @returns {imgIContainer}
 */
function getCanvasAsImgContainer(canvas, width, height) {
  const imageData = canvas.getContext("2d").getImageData(0, 0, width, height);

  // Create an imgIEncoder so we can turn the image data into a PNG stream.
  const imgEncoder = Cc[
    "@mozilla.org/image/encoder;2?type=image/png"
  ].getService(Ci.imgIEncoder);
  imgEncoder.initFromData(
    imageData.data,
    imageData.data.length,
    imageData.width,
    imageData.height,
    imageData.width * 4,
    imgEncoder.INPUT_FORMAT_RGBA,
    ""
  );

  // Now turn the PNG stream into an imgIContainer.
  const imgBuffer = lazy.NetUtil.readInputStreamToString(
    imgEncoder,
    imgEncoder.available()
  );
  const iconImage = lazy.imgTools.decodeImageFromBuffer(
    imgBuffer,
    imgBuffer.length,
    "image/png"
  );

  // Close the PNG stream.
  imgEncoder.close();
  return iconImage;
}

/**
 * Draw text centered in the middle of a CanvasRenderingContext2D.
 *
 * @param {CanvasRenderingContext2D} cxt - The canvas context to operate on.
 * @param {string} text - The text to draw.
 */
function drawUnreadCountText(cxt, text) {
  cxt.save();

  const imageSize = cxt.canvas.width;

  // Use smaller fonts for longer text to try and squeeze it in.
  const fontSize = imageSize * (0.95 - 0.15 * text.length);

  cxt.font = "500 " + fontSize + "px Calibri";
  cxt.fillStyle = "#ffffff";
  cxt.textAlign = "center";

  // TODO: There isn't a textBaseline for accurate vertical centering ('middle' is the
  // middle of the 'em block', and digits extend higher than 'm'), and the Mozilla core
  // does not currently support computation of ascenders and descenters in measureText().
  // So, we just assume that the font is 70% of the 'px' height we requested, then
  // compute where the baseline ought to be located.
  const approximateHeight = fontSize * 0.7;

  cxt.textBaseline = "alphabetic";
  cxt.fillText(
    text,
    imageSize / 2,
    imageSize - (imageSize - approximateHeight) / 2
  );

  cxt.restore();
}

/**
 * Create a flat badge, as is the Windows 8/10 style.
 *
 * @param {HTMLCanvasElement} canvas - The canvas element to draw the badge.
 * @param {string} text - The text to draw in the badge.
 */
function createModernBadgeStyle(canvas, text) {
  const cxt = canvas.getContext("2d");
  const iconSize = canvas.width;

  // Draw the background.
  cxt.save();
  // Solid color first.
  cxt.fillStyle = "#ff0039";
  cxt.shadowOffsetX = 0;
  cxt.shadowOffsetY = 0;
  cxt.shadowColor = "rgba(0,0,0,0.7)";
  cxt.shadowBlur = iconSize / 10;
  cxt.beginPath();
  cxt.arc(iconSize / 2, iconSize / 2, iconSize / 2.25, 0, Math.PI * 2, true);
  cxt.fill();
  cxt.clip();
  cxt.closePath();
  cxt.restore();

  drawUnreadCountText(cxt, text);
}

/**
 * Downsample by 4X with simple averaging.
 *
 * Drawing at 4X and then downscaling like this gives us better results than
 * using either CanvasRenderingContext2D.drawImage() to resize or letting
 * the Windows taskbar service handle the resize, both of which seem to just
 * give us a simple point resize.
 *
 * @param {Window} window - The DOM window.
 * @param {HTMLCanvasElement} canvas - The input canvas element to resize.
 * @returns {HTMLCanvasElement} The resized canvas element.
 */
function downsampleBy4X(window, canvas) {
  const resizedCanvas = window.document.createElement("canvas");
  resizedCanvas.width = resizedCanvas.height = canvas.width / 4;
  resizedCanvas.style.width = resizedCanvas.style.height =
    resizedCanvas.width + "px";

  const source = canvas
    .getContext("2d")
    .getImageData(0, 0, canvas.width, canvas.height);
  const downsampled = resizedCanvas
    .getContext("2d")
    .createImageData(resizedCanvas.width, resizedCanvas.height);

  for (let y = 0; y < resizedCanvas.height; ++y) {
    for (let x = 0; x < resizedCanvas.width; ++x) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      let index;

      for (let i = 0; i < 4; ++i) {
        for (let j = 0; j < 4; ++j) {
          index = ((y * 4 + i) * source.width + (x * 4 + j)) * 4;
          r += source.data[index];
          g += source.data[index + 1];
          b += source.data[index + 2];
          a += source.data[index + 3];
        }
      }

      index = (y * downsampled.width + x) * 4;
      downsampled.data[index] = Math.round(r / 16);
      downsampled.data[index + 1] = Math.round(g / 16);
      downsampled.data[index + 2] = Math.round(b / 16);
      downsampled.data[index + 3] = Math.round(a / 16);
    }
  }

  resizedCanvas.getContext("2d").putImageData(downsampled, 0, 0);

  return resizedCanvas;
}

/**
 * A module to manage the unread badge icon on Windows.
 */
export var WinUnreadBadge = {
  /**
   * Keeping an instance of nsITaskbarOverlayIconController alive
   * to show a taskbar icon after the updateUnreadCount method exits.
   */
  _controller: null,

  /**
   * Update the unread badge.
   *
   * @param {number} unreadCount - Unread message count.
   * @param {number} unreadTooltip - Unread message count tooltip.
   */
  async updateUnreadCount(unreadCount, unreadTooltip) {
    const window = Services.wm.getMostRecentBrowserWindow();
    if (!window) {
      return;
    }
    if (!this._controller) {
      this._controller = lazy.taskbar.getOverlayIconController(window.docShell);
    }
    if (unreadCount == 0) {
      // Remove the badge if no unread.
      this._controller.setOverlayIcon(null, "");
      return;
    }

    // Draw the badge in a canvas.
    const smallIconSize = Cc["@mozilla.org/windows-ui-utils;1"].getService(
      Ci.nsIWindowsUIUtils
    ).systemSmallIconSize;
    const iconSize = Math.floor(
      (window.windowUtils.displayDPI / 96) * smallIconSize
    );
    const iconSize4X = iconSize * 4;
    let badge = window.document.createElement("canvas");
    badge.width = badge.height = iconSize4X;
    badge.style.width = badge.style.height = badge.width + "px";

    createModernBadgeStyle(
      badge,
      unreadCount < 100 ? unreadCount.toString() : "99+"
    );

    badge = downsampleBy4X(window, badge);
    const icon = getCanvasAsImgContainer(badge, iconSize, iconSize);
    // Purge image from cache to force encodeImage() to not be lazy
    icon.requestDiscard();
    // Side effect of encodeImage() is that it decodes original image
    lazy.imgTools.encodeImage(icon, "image/png");
    // Somehow this is needed to prevent NS_ERROR_NOT_AVAILABLE error in
    // setOverlayIcon.
    await new Promise(resolve => window.setTimeout(resolve));

    this._controller.setOverlayIcon(icon, unreadTooltip);
  },
};
