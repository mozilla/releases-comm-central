/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);
var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);
add_setup(async () => {
  const _account = createAccount();
  const _folder = await createSubfolder(
    _account.incomingServer.rootFolder,
    "test1"
  );

  await createMessageFromFile(_folder, do_get_file("messages/invite.eml").path);
});

add_task(async function test_messages_getFullTextParts() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [folder] = await browser.folders.query({ name: "test1" });
        const { messages } = await browser.messages.list(folder.id);
        browser.test.assertEq(1, messages.length);

        const TEST_MESSAGES = [
          {
            contentType: "multipart/mixed",
            headers: {
              "content-language": ["en-US"],
              "content-type": [
                'multipart/mixed; boundary="=_mixed_36138BFC6A7B03EFC2258776003DB5C5_="',
              ],
            },
            size: 714,
            partName: "1",
            parts: [
              {
                contentType: "multipart/related",
                headers: {
                  "content-type": [
                    'multipart/related; boundary="=_related_36138BFC6A7B03EFC2258776003DB5C5_="',
                  ],
                },
                size: 468,
                partName: "1.1",
                parts: [
                  {
                    contentType: "multipart/alternative",
                    headers: {
                      "content-type": [
                        'multipart/alternative; boundary="=_alternative 36138BFC6A7B03EFC2258776003DB5C5_="',
                      ],
                    },
                    size: 377,
                    partName: "1.1.1",
                    parts: [
                      {
                        contentType: "text/plain",
                        headers: {
                          "content-type": ["text/plain; charset=windows-1257"],
                        },
                        size: 43,
                        partName: "1.1.1.1",
                        body: "You have been invited to a meeting (TEXT)\r\n",
                      },
                      {
                        contentType: "text/html",
                        headers: {
                          "content-type": ["text/html; charset=windows-1257"],
                          "content-disposition": ["inline"],
                        },
                        size: 88,
                        partName: "1.1.1.2",
                        body: "<html>\r\n <body>\r\n  <p>You have been invited to a meeting (HTML)</p>\r\n </body>\r\n</html>\r\n",
                      },
                      {
                        contentType: "text/calendar",
                        headers: {
                          "content-type": [
                            'text/calendar; method="REQUEST"; charset="UTF-8"',
                          ],
                        },
                        size: 246,
                        partName: "1.1.1.3",
                        body: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART;TZID="FLE":20211026T090000\r\nDTEND;TZID="FLE":20211026T100000\r\nTRANSP:OPAQUE\r\nDTSTAMP:20211022T111520Z\r\nSEQUENCE:0\r\nCLASS:PUBLIC\r\nUID:36138BFC6A7B03EFC2258776003DB5C5\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
                      },
                    ],
                  },
                  {
                    contentType: "text/html",
                    headers: {
                      "content-type": ["text/html; charset=windows-1257"],
                      "content-disposition": ["inline"],
                      "content-id": [
                        "<FFFF__=4DBB0DE5DFAE33558f9e8a93df938690918c4DB@>",
                      ],
                    },
                    size: 91,
                    partName: "1.1.2",
                    name: "",
                  },
                ],
              },
              {
                contentType: "text/plain",
                headers: {
                  "content-type": [
                    'text/plain; charset="UTF-8"; name="c141520.ics"',
                  ],
                  "content-disposition": ['attachment; filename="c141520.ics"'],
                },
                size: 246,
                partName: "1.2",
                name: "c141520.ics",
              },
            ],
          },
        ];

        for (let i = 0; i < TEST_MESSAGES.length; i++) {
          window.assertDeepEqual(
            TEST_MESSAGES[i],
            (await browser.messages.getFull(messages[i].id)).parts[0],
            `Should find the correct parts for message #${i}`,
            {
              strict: true,
            }
          );
        }

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
