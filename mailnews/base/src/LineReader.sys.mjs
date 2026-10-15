/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

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
 * - Breaking up a response into lines, accepting both CRLF and bare LF line
 *   endings, and normalizing them to CRLF
 * - Removing a possible stuffed dot (.. at the beginning of a line). POP3 and
 *   NNTP servers add a dot to lines starting with a dot, so that they can't be
 *   mistaken for the terminating "." line.
 * - Passing each line to a processing function, lineCallback.
 * - Calling a finalization function, doneCallback, when all lines are processed
 */
export class LineReader {
  /**
   * Goes true only when more than one call to read() occurs to handle the
   * complete multi-line response. Used by NNTP and POP3 response parsers.
   *
   * @type {boolean}
   */
  receivingMultiLineResponse = false;

  /**
   * Accumulates the response data over one or more calls to read().
   *
   * @type {string}
   */
  #data = "";

  /**
   * This can get called multiple times to handle a complete multi-line server
   * response, appending data to #data on each call. When the full response
   * is stored in #data (over one or more calls), each "line" of #data
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
  async read(data, lineCallback, doneCallback) {
    this.#data += data;
    // The response ends with a "." line terminated by CRLF (RFC 1939, RFC 3977).
    // A "." line ending in a bare LF doesn't count: servers don't dot-stuff lines
    // following a bare LF, so it can be message content.
    if (this.#data == ".\r\n" || this.#data.endsWith("\r\n.\r\n")) {
      // Have received the complete multi-line response.
      this.receivingMultiLineResponse = false;
    } else {
      // Received a response but more to come.
      this.receivingMultiLineResponse = true;
      return;
    }
    // Take the response out of #data, so that data received while it's being
    // processed below is kept for the next call instead.
    const response = this.#data.slice(0, -3);
    this.#data = "";

    let start = 0;
    let afterCRLF = true;
    let i = 0;
    while (start < response.length) {
      // Servers should only send CRLF, but message data may contain bare LF.
      // Treat that as a line break too, so that e.g. a bare LF empty line
      // still ends the message headers.
      const end = response.indexOf("\n", start);
      // Note: end should never be -1 since response ends with "\r\n".
      let line = response.slice(start, end);
      const isCRLF = line.endsWith("\r");
      if (isCRLF) {
        line = line.slice(0, -1);
      }
      // Servers only stuff dots at the start of lines following a CRLF.
      if (afterCRLF && line.startsWith("..")) {
        // Remove stuffed dot.
        line = line.slice(1);
      }
      lineCallback(line + "\r\n");
      afterCRLF = isCRLF;
      start = end + 1;
      if (++i % 1000 == 0) {
        // Prevent blocking main process for too long.
        await new Promise(resolve => setTimeout(resolve));
      }
    }
    doneCallback();
  }
}
