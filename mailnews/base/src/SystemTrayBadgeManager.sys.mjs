/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import { NetUtil } from "resource://gre/modules/NetUtil.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyServiceGetters(lazy, {
  imgTools: ["@mozilla.org/image/tools;1", Ci.imgITools],
});

/**
 * Get an imgIContainer instance from a canvas element.
 *
 * @param {HTMLCanvasElement} canvas - The canvas element.
 * @param {number} width - The width of the canvas to use.
 * @param {number} height - The height of the canvas to use.
 * @returns {imgIContainer}
 * @protected
 */
export function getCanvasAsImgContainer(canvas, width, height) {
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
    "", // outputOptions
    null // randomizationKey
  );

  // Now turn the PNG stream into an imgIContainer.
  const imgBuffer = NetUtil.readInputStreamToString(
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

  // Purge image from cache to force encodeImage() to not be lazy
  iconImage.requestDiscard();
  // Side effect of encodeImage() is that it decodes original image
  lazy.imgTools.encodeImage(iconImage, "image/png");

  return iconImage;
}

class SystemTrayBadgeManagerImpl {
  /** @protected */
  _getCurrentWindow() {
    return Services.wm.getMostRecentBrowserWindow();
  }

  /** @protected */
  _getBadgeSize(_window) {
    return 256;
  }

  /** @protected */
  get _badgeRatio() {
    return 1;
  }

  /** @protected */
  get _badgeArcRatio() {
    return 2.2;
  }

  /** @protected */
  _computeFontSize(iconSize, text) {
    return iconSize * (1 - 0.15 * text.length);
  }

  /**
   * Create a flat badge
   *
   * @param {HTMLCanvasElement} canvas - The canvas element to draw the badge.
   * @param {string} text - The text to draw in the badge.
   * @protected
   */
  _createModernBadgeStyle(canvas, text) {
    const ctx = canvas.getContext("2d");
    const iconSize = canvas.width;

    // Draw the background.
    ctx.save();
    // Solid color first.
    ctx.fillStyle = "#b40000";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = iconSize / 2 - iconSize / this._badgeArcRatio;
    ctx.beginPath();
    ctx.arc(
      iconSize / 2,
      iconSize / 2,
      iconSize / this._badgeArcRatio,
      0,
      Math.PI * 2,
      true
    );
    ctx.fill();
    ctx.clip();
    ctx.closePath();

    // Use smaller fonts for longer text to try and squeeze it in.
    const fontSize = this._computeFontSize(iconSize, text);

    ctx.font = `bolder ${fontSize}px Calibri`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";

    // TODO: There isn't a textBaseline for accurate vertical centering ('middle' is the
    // middle of the 'em block', and digits extend higher than 'm'), and the Mozilla core
    // does not currently support computation of ascenders and descenters in measureText().
    // So, we just assume that the font is 70% of the 'px' height we requested, then
    // compute where the baseline ought to be located.
    const approximateHeight = fontSize * 0.7;

    ctx.textBaseline = "alphabetic";
    ctx.fillText(
      text,
      iconSize / 2,
      iconSize - (iconSize - approximateHeight) / 2
    );

    ctx.restore();
  }

  /** @protected */
  _postProcess(window, canvas) {
    return canvas;
  }

  /**
   * Returns the generated badge
   *
   * @param {number} unreadCount - Unread message count.
   * @returns {imgIContainer | null}
   */
  getBadge(unreadCount) {
    const window = this._getCurrentWindow();
    if (!window) {
      return null;
    }

    // Prevent negative values; sometimes, TB doesn't seem to correctly compute
    // the number of unread items and can produce a negative value
    unreadCount = Math.max(unreadCount, 0);
    let badge = window.document.createElement("canvas");

    const iconSize = this._getBadgeSize(window);
    badge.width = badge.height = iconSize * this._badgeRatio;
    badge.style.width = badge.style.height = `${badge.width}px`;

    this._createModernBadgeStyle(
      badge,
      unreadCount < 100 ? `${unreadCount}` : "99+"
    );
    badge = this._postProcess(window, badge);
    return getCanvasAsImgContainer(badge, iconSize, iconSize);
  }
}

class SystemTrayBadgeManagerImplWindows extends SystemTrayBadgeManagerImpl {
  get _badgeRatio() {
    return 4;
  }

  get _badgeArcRatio() {
    return 2.5;
  }

  _getBadgeSize(window) {
    const smallIconSize = Cc["@mozilla.org/windows-ui-utils;1"].getService(
      Ci.nsIWindowsUIUtils
    ).systemSmallIconSize;
    return Math.floor((window.windowUtils.displayDPI / 96) * smallIconSize);
  }

  _computeFontSize(iconSize, text) {
    return iconSize * (0.95 - 0.15 * text.length);
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
  _postProcess(window, canvas) {
    const resizedCanvas = window.document.createElement("canvas");
    resizedCanvas.width = resizedCanvas.height =
      canvas.width / this._badgeRatio;
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
}

/**
 * @property {imgITools} imgTools "@mozilla.org/image/tools;1" service
 */
export const SystemTrayBadgeManager = new (class SystemTrayBadgeManager {
  #controller = null;

  getBadge(unreadCount) {
    if (this.#controller === null) {
      if (AppConstants.platform === "linux") {
        this.#controller = new SystemTrayBadgeManagerImpl();
      } else if (AppConstants.platform === "win") {
        this.#controller = new SystemTrayBadgeManagerImplWindows();
      }
    }
    return this.#controller?.getBadge(unreadCount);
  }
})();
