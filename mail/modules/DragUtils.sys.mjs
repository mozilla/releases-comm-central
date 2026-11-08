/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AttachmentInfo: "resource:///modules/AttachmentInfo.sys.mjs",
});

/** Helpers for exporting dragged attachments and drawing drag feedback. */
export const DragUtils = {
  /**
   * Export attachments from the reader or composer and set a count preview
   * for multiple items. Skip attachments without a URL or name, and stop at
   * deleted attachments. File promises retain the exported attachments for
   * the lifetime of this drag.
   *
   * @param {DragEvent} event - The dragstart event.
   * @param {Array<AttachmentInfo|nsIMsgAttachment>} attachments - The selected
   *   attachments to export.
   */
  setupAttachmentDataTransfer(event, attachments) {
    const attachmentsByURL = new Map();
    const provider = new AttachmentFlavorDataProvider(attachmentsByURL);
    let index = 0;
    for (const attachment of attachments) {
      if (attachment.contentType == "text/x-moz-deleted") {
        break;
      }

      const name = attachment.name || attachment.displayName;

      if (!attachment.url || !name) {
        continue;
      }

      const filename = name.replace(/^(.{60}).{4,}(.{22})$/su, "$1...$2");
      attachmentsByURL.set(
        attachment.url,
        attachment instanceof lazy.AttachmentInfo
          ? attachment
          : new lazy.AttachmentInfo({
              contentType: attachment.contentType,
              url: attachment.url,
              name,
              uri: attachment.msgUri,
              isExternalAttachment: /^(?:file|https?):/.test(attachment.url),
            })
      );

      // Only add type/filename info for non-file URLs that don't already
      // have it.
      const info = [];
      if (/(^file:|&filename=)/.test(attachment.url)) {
        info.push(attachment.url);
      } else {
        info.push(
          attachment.url +
            "&type=" +
            attachment.contentType +
            "&filename=" +
            encodeURIComponent(name)
        );
      }
      info.push(name, attachment.size, attachment.contentType, attachment.uri);
      if (attachment.sendViaCloud) {
        info.push(
          attachment.cloudFileAccountKey,
          attachment.cloudPartHeaderData
        );
      }

      // The file location of a detached attachment comes from the message
      // itself and can't be trusted, so don't offer it for attaching
      // elsewhere, e.g. to a message being composed.
      if (!attachment.isFileAttachment) {
        event.dataTransfer.mozSetDataAt(
          "text/x-moz-url",
          info.join("\n"),
          index
        );
      }
      event.dataTransfer.mozSetDataAt(
        "text/x-moz-url-data",
        attachment.url,
        index
      );
      event.dataTransfer.mozSetDataAt("text/x-moz-url-desc", name, index);
      event.dataTransfer.mozSetDataAt(
        "application/x-moz-file-promise-url",
        attachment.url,
        index
      );
      event.dataTransfer.mozSetDataAt(
        "application/x-moz-file-promise",
        provider,
        index
      );
      event.dataTransfer.mozSetDataAt(
        "application/x-moz-file-promise-dest-filename",
        filename,
        index
      );
      index++;
    }
    this.setMultiDragImage(event, index);
  },

  /**
   * Set a stack of documents with a count badge as the drag image when more
   * than one item is exported. Single-item drags keep their existing image.
   *
   * @param {DragEvent} event - The dragstart event.
   * @param {number} count - The number of exported items.
   * @returns {boolean} Whether a custom drag image was set.
   */
  setMultiDragImage(event, count) {
    if (count < 2) {
      return false;
    }

    const document = event.target.ownerDocument;
    const scale = document.defaultView.devicePixelRatio;
    const canvas = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "canvas"
    );
    const context = canvas.getContext("2d");
    const font = "bold 12px sans-serif";
    const label = count.toLocaleString();
    context.font = font;
    const badgeWidth = Math.max(
      24,
      Math.ceil(context.measureText(label).width) + 12
    );
    const width = 28 + badgeWidth;
    // Gecko uses device pixels for canvas drag images and CSS pixels for offsets.
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(48 * scale);
    context.scale(scale, scale);

    context.lineWidth = 1;
    for (const offset of [8, 4, 0]) {
      context.beginPath();
      context.roundRect(2.5 + offset, 2.5 + offset, 26, 32, 3);
      context.fillStyle = "Canvas";
      context.fill();
      context.strokeStyle = "CanvasText";
      context.stroke();
    }
    context.beginPath();
    for (const y of [11.5, 17.5, 23.5]) {
      context.moveTo(8, y);
      context.lineTo(23, y);
    }
    context.stroke();

    context.beginPath();
    context.roundRect(26, 26, badgeWidth, 20, 10);
    context.fillStyle = "SelectedItem";
    context.fill();
    context.strokeStyle = "CanvasText";
    context.stroke();
    context.font = font;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "SelectedItemText";
    context.fillText(label, 26 + badgeWidth / 2, 36);

    event.dataTransfer.setDragImage(canvas, 12, 12);
    return true;
  },
};

/**
 * Save promised attachment files using the attachments captured for one drag.
 *
 * @implements {nsIFlavorDataProvider}
 */
class AttachmentFlavorDataProvider {
  QueryInterface = ChromeUtils.generateQI(["nsIFlavorDataProvider"]);

  /** @type {Map<string, AttachmentInfo>} */
  #attachments;

  /** @type {Map<string, nsIFile>} */
  #savedFiles = new Map();

  /**
   * @param {Map<string, AttachmentInfo>} attachments - The exported attachments,
   *   keyed by source URL.
   */
  constructor(attachments) {
    this.#attachments = attachments;
  }

  /**
   * Reserve a unique destination file and start saving its attachment.
   * On macOS, reuse the file for repeated requests within this drag.
   *
   * @param {nsITransferable} transferable - The source URL, destination filename,
   *   and destination folder.
   * @param {string} flavor - The requested transfer flavor.
   * @param {{value?: nsISupports}} data - Receives the reserved destination file.
   */
  getFlavorData(transferable, flavor, data) {
    if (flavor != "application/x-moz-file-promise") {
      return;
    }

    const source = {};
    transferable.getTransferData("application/x-moz-file-promise-url", source);
    const url = source.value.QueryInterface(Ci.nsISupportsString).data;
    const attachment = this.#attachments.get(url);
    if (!attachment) {
      return;
    }

    const filename = {};
    transferable.getTransferData(
      "application/x-moz-file-promise-dest-filename",
      filename
    );
    const directory = {};
    transferable.getTransferData(
      "application/x-moz-file-promise-dir",
      directory
    );
    const file = directory.value.QueryInterface(Ci.nsIFile).clone();
    file.append(filename.value.QueryInterface(Ci.nsISupportsString).data);
    const key = JSON.stringify([url, file.path]);

    // macOS can request the same file repeatedly while processing a multi-item
    // drag. Share these reservations across all items, but only for this drag.
    if (AppConstants.platform == "macosx" && this.#savedFiles.has(key)) {
      data.value = this.#savedFiles.get(key);
      return;
    }

    file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
    data.value = file;
    if (AppConstants.platform == "macosx") {
      this.#savedFiles.set(key, file);
    }
    attachment.saveToFile(file.path).catch(error => {
      this.#savedFiles.delete(key);
      console.error(error);
    });
  }
}
