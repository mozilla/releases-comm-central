/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["LineReader"];

/**
 * For a single request, mail servers may return several multi-line responses. A
 * definition of multi-line responses can be found at rfc3977#section-3.1.1.
 *
 * This class helps dealing with multi-line responses by:
 * - Break up a response to lines
 * - Join incomplete line from a previous response with the current response
 * - Remove stuffed dot (.. at the beginning of a line)
 * - Detect the end of the response (\r\n.\r\n)
 */
class LineReader {
  processingMultiLineResponse = false;

  /**
   * Read a multi-line response, emit each line through a callback.
   * @param {string} data - A multi-line response received from the server.
   * @param {Function} lineCallback - A line will be passed to the callback each
   *   time.
   * @param {Function} doneCallback - A function to be called when data is ended.
   */
  read(data, lineCallback, doneCallback) {
    if (this._leftoverData) {
      // For a single request, the response can span multiple responses.
      // Concatenate the leftover from the last data to the current data.
      data = this._leftoverData + data;
      this._leftoverData = null;
    }
    this.processingMultiLineResponse = true;
    if (data == ".\r\n" || data.endsWith("\r\n.\r\n")) {
      this.processingMultiLineResponse = false;
      data = data.slice(0, -3);
    }
    while (data) {
      let index = data.indexOf("\r\n");
      if (index == -1) {
        // Not enough data, save it for the next round.
        this._leftoverData = data;
        break;
      }
      let line = data.slice(0, index + 2);
      if (line.startsWith("..")) {
        // Remove stuffed dot.
        line = line.slice(1);
      }
      lineCallback(line);
      data = data.slice(index + 2);
    }
    if (!this.processingMultiLineResponse) {
      doneCallback();
    }
  }
}
