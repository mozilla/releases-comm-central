/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * DownloadProgressListener "class" is used to help update download items shown
 * in the Download Manager UI such as displaying amount transferred, transfer
 * rate, and time left for each download.
 */
function DownloadProgressListener() {}

DownloadProgressListener.prototype = {
  onDownloadAdded: function(aDownload) {
    gDownloadTreeView.addDownload(aDownload);

    // Update window title in-case we don't get all progress notifications
    onUpdateProgress();
  },

  onDownloadChanged: function(aDownload) {
    gDownloadTreeView.updateDownload(aDownload);

    // Update window title
    onUpdateProgress();
  },

  onDownloadRemoved: function(aDownload) {
    gDownloadTreeView.removeDownload(aDownload);
  }
};
