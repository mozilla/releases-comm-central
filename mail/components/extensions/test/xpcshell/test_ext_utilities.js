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

add_task(async function test_parseMailboxString() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tests = [
          {
            addr: "user@invalid",
            keepGroups: [undefined, false, true],
            expected: [
              {
                email: "user@invalid",
              },
            ],
          },
          {
            addr: "User <user@invalid>",
            keepGroups: [undefined, false, true],
            expected: [
              {
                name: "User",
                email: "user@invalid",
              },
            ],
          },
          {
            addr: "User1 <user1@invalid>, User2 <user2@invalid>",
            keepGroups: [undefined, false, true],
            expected: [
              {
                name: "User1",
                email: "user1@invalid",
              },
              {
                name: "User2",
                email: "user2@invalid",
              },
            ],
          },
          {
            addr: `"User1" <user1@invalid>; "User 2" <user2@invalid>; `,
            keepGroups: [undefined, false, true],
            expected: [
              {
                name: "User1",
                email: "user1@invalid",
              },
              {
                name: "User 2",
                email: "user2@invalid",
              },
            ],
          },
          {
            addr: `"User1" <user1@invalid>; GroupName : G1 <g1@invalid>, g2@invalid; "User 2" <user2@invalid>; `,
            keepGroups: [true],
            expected: [
              {
                name: "User1",
                email: "user1@invalid",
              },
              {
                name: "GroupName",
                group: [
                  {
                    name: "G1",
                    email: "g1@invalid",
                  },
                  {
                    email: "g2@invalid",
                  },
                ],
              },
              {
                name: "User 2",
                email: "user2@invalid",
              },
            ],
          },
          {
            addr: `"User1" <user1@invalid>; GroupName : G1 <g1@invalid>, g2@invalid; "User 2" <user2@invalid>; `,
            keepGroups: [false, undefined],
            expected: [
              {
                name: "User1",
                email: "user1@invalid",
              },
              {
                name: "G1",
                email: "g1@invalid",
              },
              {
                email: "g2@invalid",
              },
              {
                name: "User 2",
                email: "user2@invalid",
              },
            ],
          },
        ];
        for (const { addr, keepGroups, expected } of tests) {
          for (const keep of keepGroups) {
            const result =
              keep == undefined
                ? await browser.messengerUtilities.parseMailboxString(addr)
                : await browser.messengerUtilities.parseMailboxString(
                    addr,
                    keep
                  );
            window.assertDeepEqual(
              expected,
              result,
              `The addr ${addr} should be parsed correctly.`
            );
          }
        }
        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 2,
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
