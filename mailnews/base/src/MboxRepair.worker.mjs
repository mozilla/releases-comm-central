/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

self.onmessage = async event => {
  const fixed = await mac2unix(event.data.path, percent => {
    self.postMessage({ msg: "progress", percent });
  });
  self.postMessage({ msg: "success", percent: 100, fixed });
  self.close();
};

/**
 * Convert bare CR line (classic MacOS) line endings to LF line endings,
 * for the provided input file. If the data doesn't contain bare CR lines, the
 * input data will remain untouched.
 *
 * @param {string} inputPath - Path to the mbox file to convert.
 * @param {?function(number):void} onProgress - Called with progress percentage.
 * @returns {boolean} whether repair was needed or not.
 */
async function mac2unix(inputPath, onProgress) {
  const CHUNK_SIZE = 1024 * 1024; // 1 MiB.
  const totalSize = (await IOUtils.stat(inputPath)).size;
  let offset = 0;

  const outputPath = await IOUtils.createUniqueFile(
    PathUtils.parent(inputPath),
    PathUtils.filename(inputPath) + ".tmp"
  );

  const CR = 0x0d;
  const LF = 0x0a;
  let changed = false;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const chunk = await IOUtils.read(inputPath, {
      offset,
      maxBytes: CHUNK_SIZE,
    });
    if (!chunk.byteLength) {
      break; // End of file
    }
    offset += chunk.byteLength;

    // Modify data in-place (convert CR to LF, but preserve CRLF).
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] === CR) {
        if (i + 1 >= chunk.length) {
          // CR was the last byte in chunk.
          const nextByte = await IOUtils.read(inputPath, {
            offset,
            maxBytes: 1,
          });
          if (nextByte.byteLength === 0 || nextByte[0] !== LF) {
            chunk[i] = LF; // CR not followed by LF; convert CR -> LF!
            changed = true;
          }
        } else if (chunk[i + 1] !== LF) {
          chunk[i] = LF; // CR not followed by LF; convert CR -> LF!
          changed = true;
        }
      }
    }
    await IOUtils.write(outputPath, chunk, { mode: "append" });
    onProgress?.((offset / totalSize) * 100);
  }
  if (changed) {
    await IOUtils.move(outputPath, inputPath);
  } else {
    // Line endings repair not needed. Just remove the temp file.
    await IOUtils.remove(outputPath);
  }
  return offset;
}
