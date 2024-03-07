/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["LineReader"];

/**
 * For certain requests, mail servers return a multi-line response that are
 * handled by this class. The definitions of multi-line responses can be found
 * for NNTP at
 * https://datatracker.ietf.org/doc/html/rfc3977#section-3.1.1
 * and for POP3 at
 * https://datatracker.ietf.org/doc/html/rfc1939#section-3
 *
 *
 * This class deals with multi-line responses by:
 * - Receiving each response segment and appending them all together.
 * - Detecting the end of the response by seeing "\r\n.\r\n" in the last segment
 * - Breaking up a response into lines
 * - Removing a possible stuffed dot (.. at the beginning of a line)
 * - Passing each line to a processing function, lineCallback.
 * - Calling a finalization function, doneCallback, when all lines are processed
 */
class LineReader {
  // Goes true only when more than one call to read() occurs to handle the
  // complete multi-line response. Used by NNTP and POP3 response parsers.
  receivingMultiLineResponse = false;

  // Accumulates the response data over one or more calls to read().
  _data = "";

  /**
   * This can get called multiple times to handle a complete multi-line server
   * response, appending data to _data on each call. When the full response
   * is stored in _data (over one or more calls), each "line" of _data
   * is then passed to lineCallback() in a loop. Once all lines are processed,
   * doneCallback() is called.
   *
   * @param {string} data - A full or partial multi-line response received
   *   from the server.
   * @param {Function} lineCallback - data will be separated into lines and each
   *   line will be processed by this callback.
   * @param {Function} doneCallback - A function to be called when all the lines
   *   for the complete response have been processed in lineCallback.
   */
  read(data, lineCallback, doneCallback) {
    this._data += data;
    if (this._data == ".\r\n" || this._data.endsWith("\r\n.\r\n")) {
      // Have received the complete multi-line response.
      this.receivingMultiLineResponse = false;
      this._data = this._data.slice(0, -3);
    } else {
      // Received a response but more to come.
      this.receivingMultiLineResponse = true;
      return;
    }

    let i = 0;
    while (this._data) {
      const index = this._data.indexOf("\r\n");
      // Note: index should never be -1 since "\r\n" already found above.
      let line = this._data.slice(0, index + 2);
      if (line.startsWith("..")) {
        // Remove stuffed dot.
        line = line.slice(1);
      }
      lineCallback(line);
      this._data = this._data.slice(index + 2);
      if (++i % 100 == 0) {
        // Prevent blocking main process for too long.
        Services.tm.spinEventLoopUntilEmpty();
      }
    }
    // Note: _data will be empty and receivingMultiLineResponse will be false
    // at this point.
    doneCallback();
  }
}
