/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Convert an mbox file that uses classical MacOS bare CR line endings to
 * using LF line endings instead. mac2unix.
 *
 * @param {string} path - File path to convert.
 * @param {?function(integer):void} onProgress - Called with progress percentage.
 * @returns {Promise<object>} - Resolves when done. The object contains
 *   information about the repair.
 */
export async function repairMbox(path, onProgress) {
  const originalFile = await IOUtils.getFile(path);
  // Ensure we have space (and 1MiB extra).
  if (originalFile.diskSpaceAvailable < originalFile.fileSize + 1024 * 1024) {
    throw new Error(`Need at least ${originalFile.fileSize}b free disk space!`);
  }

  const worker = new ChromeWorker("resource:///modules/MboxRepair.worker.mjs");

  await new Promise((resolve, reject) => {
    // Handle exceptions thrown by the worker thread.
    worker.addEventListener("error", e => {
      worker.terminate();
      reject(e);
    });

    // Handle updates from the worker thread.
    worker.addEventListener("message", e => {
      const { msg, percent } = e.data;
      onProgress?.(parseInt(percent, 10));
      if (msg == "success") {
        resolve(e.data);
        worker.terminate();
      }
    });

    // Kick off the worker.
    worker.postMessage({ path });
  });
}
