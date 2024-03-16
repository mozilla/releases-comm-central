/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for cal.iterate.*
 */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { CalReadableStreamFactory } = ChromeUtils.importESModule(
  "resource:///modules/CalReadableStreamFactory.sys.mjs"
);

/**
 * Test streamValues() iterates over all values found in a stream.
 */
add_task(async function testStreamValues() {
  const src = Array(10)
    .fill(null)
    .map((_, i) => i + 1);
  const stream = CalReadableStreamFactory.createReadableStream({
    start(controller) {
      for (let i = 0; i < src.length; i++) {
        controller.enqueue(src[i]);
      }
      controller.close();
    },
  });

  const dest = [];
  for await (const value of cal.iterate.streamValues(stream)) {
    dest.push(value);
  }
  Assert.ok(
    src.every((val, idx) => (dest[idx] = val)),
    "all values were read from the stream"
  );
});
