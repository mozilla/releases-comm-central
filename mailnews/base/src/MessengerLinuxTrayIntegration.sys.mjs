/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getCanvasAsImgContainer } from "resource:///modules/SystemTrayBadgeManager.sys.mjs";

/**
 * TODO: https://bugzilla.mozilla.org/show_bug.cgi?id=2078843
 * This interface provides a tool to merge the tray icon with unread
 * badge on Linux. It's here to circumvent incorrectly or not at all
 * implemented org.freedesktop.StatusNotifierItem.OverlayIconPixmap
 * API on KDE and AppIndicator.
 */
export class MessengerLinuxTrayIntegration {
  QueryInterface = ChromeUtils.generateQI(["nsIMessengerLinuxTrayIntegration"]);

  /**
   * @param {number[]} iconRgbaData Pixel data of the tray icon
   * @param {number} iconWidth Tray icon width
   * @param {number} iconHeight Tray icon height
   * @param {number[]} badgeRgbaData Pixel data of the unread mail badge in ARGB format
   * @param {number} badgeWidth Badge width
   * @param {number} badgeHeight Badge height
   * @returns {null|imgIContainer}
   */
  mergeTrayIconBadge(
    iconRgbaData,
    iconWidth,
    iconHeight,
    badgeRgbaData,
    badgeWidth,
    badgeHeight
  ) {
    const window = Services.wm.getMostRecentBrowserWindow();
    if (!window) {
      return null;
    }

    // putImageData() doesn't have parameters to resize an image so we need to first
    // draw the image on a seperate canvas in plain size then leverage drawImage() parameters
    // to resize it.
    const badgeCanvas = window.document.createElement("canvas");
    badgeCanvas.width = badgeWidth;
    badgeCanvas.height = badgeHeight;
    badgeCanvas.style.width = `${badgeCanvas.width}px`;
    badgeCanvas.style.height = `${badgeCanvas.height}px`;
    const badgeCtx = badgeCanvas.getContext("2d");
    badgeCtx.save();
    badgeCtx.putImageData(
      new ImageData(
        new Uint8ClampedArray(badgeRgbaData),
        badgeWidth,
        badgeHeight
      ),
      0,
      0
    );
    badgeCtx.restore();

    const canvas = window.document.createElement("canvas");
    canvas.width = iconWidth;
    canvas.height = iconHeight;
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.width}px`;
    const ctx = canvas.getContext("2d");
    ctx.save();

    // Draw tray icon
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(iconRgbaData), iconWidth, iconHeight),
      0,
      0
    );

    // Compute badge sizes and offsets before drawing on the final canvas and draw badge
    const dWidth = Math.ceil(0.6 * badgeCanvas.width);
    const dHeight = Math.ceil(0.6 * badgeCanvas.height);
    const dx = Math.ceil(iconWidth - dWidth);
    const dy = Math.ceil(iconHeight - dHeight);
    ctx.drawImage(badgeCanvas, dx, dy, dWidth, dHeight);

    ctx.restore();

    return getCanvasAsImgContainer(canvas, iconWidth, iconHeight);
  }
}
