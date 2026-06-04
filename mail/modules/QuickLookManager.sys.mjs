/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  DownloadPaths: "resource://gre/modules/DownloadPaths.sys.mjs",
});

/**
 * Manages macOS Quick Look preview of email attachments.
 */
export const QuickLookManager = {
  _service: null,
  _tempFiles: new Map(),
  _sessionId: 0,

  get isAvailable() {
    return (
      AppConstants.platform === "macosx" &&
      "@mozilla.org/mail/mac-quick-look;1" in Cc
    );
  },

  _getService() {
    if (!this._service) {
      this._service = Cc["@mozilla.org/mail/mac-quick-look;1"].createInstance(
        Ci.nsIMacQuickLook
      );
    }
    return this._service;
  },

  get isOpen() {
    if (!this.isAvailable) {
      return false;
    }
    return this._getService().isOpen;
  },

  async toggle(attachments, selectedIndex) {
    if (this.isOpen) {
      this.close();
    } else {
      await this.show(attachments, selectedIndex);
    }
  },

  /**
   * @param {AttachmentInfo[]} attachments - The attachments to preview.
   * @param {number} selectedIndex - Index of the initially selected attachment.
   */
  async show(attachments, selectedIndex) {
    const validAttachments = attachments.filter(
      a => !a.isDeleted && a.hasFile && a.size !== 0
    );
    if (!validAttachments.length) {
      return;
    }

    // Clamp selectedIndex to valid range. If the original index pointed to a
    // filtered-out attachment, default to 0.
    let adjustedIndex = 0;
    if (selectedIndex >= 0 && selectedIndex < attachments.length) {
      const selectedAttachment = attachments[selectedIndex];
      const idx = validAttachments.indexOf(selectedAttachment);
      if (idx >= 0) {
        adjustedIndex = idx;
      }
    }

    const sessionId = ++this._sessionId;
    const paths = [];
    const titles = [];

    for (const attachment of validAttachments) {
      if (sessionId !== this._sessionId) {
        return;
      }
      const path = await this._ensureTempFile(attachment);
      paths.push(path);
      titles.push(attachment.name);
    }

    if (sessionId !== this._sessionId) {
      return;
    }

    if (!paths.length) {
      return;
    }

    if (adjustedIndex >= paths.length) {
      adjustedIndex = 0;
    }

    this._getService().show(paths, titles, adjustedIndex);
  },

  close() {
    if (!this.isAvailable) {
      return;
    }
    try {
      this._getService().close();
    } catch (e) {}
    this._tempFiles.clear();
    this._sessionId++;
  },

  /**
   * Returns a file path for the given attachment, using cache when possible.
   * For file attachments, returns the existing local path directly.
   *
   * @param {AttachmentInfo} attachment
   * @returns {string} the file path.
   */
  async _ensureTempFile(attachment) {
    if (attachment.isFileAttachment) {
      const url = Services.io.newURI(attachment.url);
      if (url instanceof Ci.nsIFileURL) {
        return url.file.path;
      }
    }

    const cacheKey = attachment.url;
    if (this._tempFiles.has(cacheKey)) {
      return this._tempFiles.get(cacheKey);
    }

    const tempFile = await attachment.setupTempFile(
      lazy.DownloadPaths.sanitize(attachment.name)
    );
    await attachment.saveToFile(tempFile.path, true);
    this._tempFiles.set(cacheKey, tempFile.path);
    return tempFile.path;
  },
};
