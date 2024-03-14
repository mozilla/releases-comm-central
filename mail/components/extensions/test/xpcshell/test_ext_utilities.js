/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

add_task(async function test_formatFileSize() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tests = [
          { sizeInBytes: 12, expectedFormat: "12 bytes" },
          { sizeInBytes: 2454, expectedFormat: "2,4 KB" },
          { sizeInBytes: 312312, expectedFormat: "305 KB" },
          { sizeInBytes: 12312331, expectedFormat: "11,7 MB" },
          { sizeInBytes: 2344234234, expectedFormat: "2,2 GB" },
        ];
        for (const { sizeInBytes, expectedFormat } of tests) {
          browser.test.assertEq(
            await browser.messengerUtilities.formatFileSize(sizeInBytes),
            expectedFormat,
            `Formated file size for ${sizeInBytes} bytes should show correctly`
          );
        }
        browser.test.notifyPass("finished");
      },
    },
    manifest: {
      manifest_version: 2,
      background: { scripts: ["background.js"] },
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
