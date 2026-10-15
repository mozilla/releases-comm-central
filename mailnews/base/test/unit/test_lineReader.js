/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { LineReader } = ChromeUtils.importESModule(
  "resource:///modules/LineReader.sys.mjs"
);

/**
 * Feed chunks of a multi-line response to a LineReader.
 *
 * @param {string[]} chunks - The response, split into data events.
 * @returns {Promise<string[]>} The lines passed to the line callback.
 */
async function readLines(chunks) {
  const reader = new LineReader();
  const lines = [];
  const { promise, resolve } = Promise.withResolvers();
  for (const chunk of chunks) {
    await reader.read(chunk, line => lines.push(line), resolve);
  }
  await promise;
  Assert.ok(
    !reader.receivingMultiLineResponse,
    "the response should be complete"
  );
  return lines;
}

add_task(async function test_crlf() {
  Assert.deepEqual(
    await readLines(["a\r\nb\r", "\nc\r\n.\r\n"]),
    ["a\r\n", "b\r\n", "c\r\n"],
    "CRLF lines should be passed on as they are"
  );
});

add_task(async function test_empty() {
  Assert.deepEqual(
    await readLines([".\r\n"]),
    [],
    "an empty response should have no lines"
  );
});

add_task(async function test_bareLF() {
  Assert.deepEqual(
    await readLines(["Subject: a\r\n\nFrom: b\nc\r\n", "\r\n.\r\n"]),
    ["Subject: a\r\n", "\r\n", "From: b\r\n", "c\r\n", "\r\n"],
    "bare LF should end a line, and be normalized to CRLF"
  );
});

add_task(async function test_bareCR() {
  Assert.deepEqual(
    await readLines(["a\rb\r\n.\r\n"]),
    ["a\rb\r\n"],
    "a bare CR should not end a line"
  );
});

add_task(async function test_dotStuffing() {
  Assert.deepEqual(
    await readLines(["..a\r\n..\n..b\r\n.\r\n"]),
    [".a\r\n", ".\r\n", "..b\r\n"],
    "stuffed dots should be removed, but only from lines following a CRLF"
  );
});

add_task(async function test_dataDuringProcessing() {
  const reader = new LineReader();
  const firstLines = [];
  const lineCount = 2500;
  const firstDone = Promise.withResolvers();
  const firstRead = reader.read(
    "line\r\n".repeat(lineCount) + ".\r\n",
    line => firstLines.push(line),
    firstDone.resolve
  );
  // The first response is processed in batches, so this arrives in between.
  const secondLines = [];
  await reader.read("next\r\npartial", line => secondLines.push(line));
  await firstRead;
  await firstDone.promise;
  Assert.equal(
    firstLines.length,
    lineCount,
    "the first response should only contain its own lines"
  );
  Assert.ok(
    firstLines.every(line => line == "line\r\n"),
    "the first response lines should be unchanged"
  );

  const secondDone = Promise.withResolvers();
  await reader.read(
    "\r\n.\r\n",
    line => secondLines.push(line),
    secondDone.resolve
  );
  await secondDone.promise;
  Assert.deepEqual(
    secondLines,
    ["next\r\n", "partial\r\n"],
    "data received during processing should be kept for the next response"
  );
});
