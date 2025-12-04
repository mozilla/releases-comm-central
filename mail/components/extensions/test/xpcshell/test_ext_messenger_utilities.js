/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

add_setup(async () => {
  // This test uses messengerUtilities.parseMailboxString() with the deprecated
  // boolean value as second parameter. Since we need to ensure this is still
  // working, even if deprecated, we need to disable fails on schema warnings.
  ExtensionTestUtils.failOnSchemaWarnings(false);
  registerCleanupFunction(async () => {
    ExtensionTestUtils.failOnSchemaWarnings(true);
  });
});

add_task(async function test_formatFileSize() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tests = [
          { sizeInBytes: 12, expectedFormat: "12 bytes" },
          { sizeInBytes: 2454, expectedFormat: "2.4 KB" },
          { sizeInBytes: 312312, expectedFormat: "305 KB" },
          { sizeInBytes: 12312331, expectedFormat: "11.7 MB" },
          { sizeInBytes: 2344234234, expectedFormat: "2.2 GB" },
        ];
        for (const { sizeInBytes, expectedFormat } of tests) {
          const formatted =
            await browser.messengerUtilities.formatFileSize(sizeInBytes);
          // On some systems we get a , separator.
          browser.test.assertEq(
            formatted.replaceAll(",", "."),
            expectedFormat,
            `Formatted file size for ${sizeInBytes} bytes should show correctly`
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

add_task(async function test_parseMailboxString_expand_mailing_lists() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const book_id = await browser.addressBooks.create({ name: "book1" });
        const book_contacts = [
          { firstName: "charlie", primaryEmail: "charlie@invalid" },
          { firstName: "juliet", primaryEmail: "juliet@invalid" },
          { firstName: "mike", primaryEmail: "mike@invalid" },
          { firstName: "oscar", primaryEmail: "oscar@invalid" },
          { firstName: "papa", primaryEmail: "papa@invalid" },
          { firstName: "romeo", primaryEmail: "romeo@invalid" },
        ];
        const list_id = await browser.addressBooks.mailingLists.create(
          book_id,
          { name: "TestList" }
        );
        for (const contact of book_contacts) {
          const contact_id = await browser.addressBooks.contacts.create(
            book_id,
            `BEGIN:VCARD\r\nVERSION:4.0\r\nFN:${contact.firstName}\r\nEMAIL;PREF=1:${contact.primaryEmail}\r\nEND:VCARD\r\n`
          );
          await browser.addressBooks.mailingLists.addMember(
            list_id,
            contact_id
          );
        }

        const tests = [
          {
            addr: "TestList <TestList>",
            options: undefined,
            expected: [{ name: "TestList", email: "TestList" }],
          },
          {
            addr: "TestList <TestList>",
            options: {},
            expected: [{ name: "TestList", email: "TestList" }],
          },
          {
            addr: "TestList <TestList>",
            options: { expandMailingLists: true },
            expected: [
              { name: "charlie", email: "charlie@invalid" },
              { name: "juliet", email: "juliet@invalid" },
              { name: "mike", email: "mike@invalid" },
              { name: "oscar", email: "oscar@invalid" },
              { name: "papa", email: "papa@invalid" },
              { name: "romeo", email: "romeo@invalid" },
            ],
          },
          {
            addr: "TestList <TestList>",
            options: { expandMailingLists: true, preserveGroups: true },
            expected: [
              {
                name: "TestList",
                group: [
                  { name: "charlie", email: "charlie@invalid" },
                  { name: "juliet", email: "juliet@invalid" },
                  { name: "mike", email: "mike@invalid" },
                  { name: "oscar", email: "oscar@invalid" },
                  { name: "papa", email: "papa@invalid" },
                  { name: "romeo", email: "romeo@invalid" },
                ],
              },
            ],
          },
          {
            addr: "TestList <TestList>",
            options: { expandMailingLists: false, preserveGroups: true },
            // There is no mailing list check done and since preserveGroups does
            // not require the addressBooks permission, no lookup is done - this
            // does not add an empty group array just because TestList is a actual
            // mailing list.
            expected: [{ name: "TestList", email: "TestList" }],
          },
          {
            addr: "TestList <TestList>",
            options: { expandMailingLists: false, preserveGroups: false },
            expected: [{ name: "TestList", email: "TestList" }],
          },
          {
            addr: "NoTestList <NoTestList>",
            options: { expandMailingLists: true, preserveGroups: true },
            expected: [{ name: "NoTestList", email: "NoTestList" }],
          },
        ];
        for (const { addr, options, expected } of tests) {
          const result = await browser.messengerUtilities.parseMailboxString(
            addr,
            options
          );
          window.assertDeepEqual(
            expected,
            result,
            `The addr ${addr} should be parsed correctly.`
          );
        }
        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["addressBooks"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function test_convertToPlainText() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const lorem =
          "Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet.";

        const tests = [
          {
            body: "\r\n<html><body><p>This is <b>some</b> html content,<br><br>Good night!<br></p>\r\n</body></html>",
            expectedPlain: "This is some html content,\n\nGood night!",
          },
          {
            body: `\r\n<html><body><p>This is <b>random</b> html content,<br>${lorem}<br>${lorem}</p></body></html>`,
            expectedPlain: `This is random html content,\n${lorem}\n${lorem}`,
          },
          {
            body: `\r\n<html><body><p>This is <i>flowed</i> html content,<br>${lorem}<br>${lorem}</p></body></html>`,
            options: { flowed: true },
            // Flowed output is wrapping lines to 72 chars length. The enforced
            // line breaks have a trailing space, allowing the client to reflow
            // the text and only honor the line breaks added by the user.
            expectedPlain: `This is /flowed/ html content,
Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy 
eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam 
voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet 
clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit 
amet. Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam 
nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, 
sed diam voluptua. At vero eos et accusam et justo duo dolores et ea 
rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem 
ipsum dolor sit amet.
Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy 
eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam 
voluptua. At vero eos et accusam et justo duo dolores et ea rebum. Stet 
clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit 
amet. Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam 
nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, 
sed diam voluptua. At vero eos et accusam et justo duo dolores et ea 
rebum. Stet clita kasd gubergren, no sea takimata sanctus est Lorem 
ipsum dolor sit amet.`,
          },
        ];
        for (let i = 0; i < tests.length; i++) {
          const { body, options, expectedPlain } = tests[i];
          const actual = await browser.messengerUtilities.convertToPlainText(
            body,
            options
          );
          browser.test.assertEq(
            expectedPlain,
            actual,
            `Converted plain text for test #${i} should be correct`
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

add_task(async function test_decodeMimeHeader() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const value =
          "=?UTF-8?Q?H=C3=B6rst=2C_Kenny?= <K.Hoerst@invalid>, new@thunderbird.bug";

        // Test default mailbox handling.
        window.assertDeepEqual(
          [`"Hörst, Kenny" <K.Hoerst@invalid>, new@thunderbird.bug`],
          await browser.messengerUtilities.decodeMimeHeader("TO", value),
          `The mailbox header should be decoded correctly.`
        );

        // Test enforced mailbox handling.
        window.assertDeepEqual(
          [`"Hörst, Kenny" <K.Hoerst@invalid>, new@thunderbird.bug`],
          await browser.messengerUtilities.decodeMimeHeader("TO", value, true),
          `The mailbox header should be decoded correctly.`
        );

        // Test enforced non-mailbox handling.
        window.assertDeepEqual(
          [`Hörst, Kenny <K.Hoerst@invalid>, new@thunderbird.bug`],
          await browser.messengerUtilities.decodeMimeHeader("TO", value, false),
          `The mailbox header should be decoded as expected (wrongly).`
        );

        // Test multi-line subject header provided as string and not as array.
        const encoded_subject = `=?UTF-8?B?c2RzYWQgw7bDpMO8IGFzZGEgZCAiw7zDtsOkInNkZsOkIGRzaiBhbGRq?=
 =?UTF-8?B?IGFzamQgaiBkaiDDtsO8IMO8w7bDpCBkaiBrYWRqcyDDtsO8w6Qgc2tsamQgYXNs?=
 =?UTF-8?B?ZGtqIGFscyBkasO2w7zDpCBzamRsYXNqZCBsYXNkaiBsYXPDvMO2w6RsIGFkaiBs?=
 =?UTF-8?B?YWTDvMO2w6TDvCBsYXNkaiBsYXMgZGrDvMO2w6Q=?=`;
        const decoded_subject = `sdsad öäü asda d "üöä"sdfä dsj aldj asjd j dj öü üöä dj kadjs öüä skljd asldkj als djöüä sjdlasjd lasdj lasüöäl adj ladüöäü lasdj las djüöä`;
        window.assertDeepEqual(
          [decoded_subject],
          await browser.messengerUtilities.decodeMimeHeader(
            "Subject",
            encoded_subject
          ),
          `The subject header should be decoded correctly.`
        );

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

add_task(async function test_encodeMimeHeader() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        // Test default mailbox handling.
        window.assertDeepEqual(
          [
            "=?UTF-8?Q?H=C3=B6rst=2C_Kenny?= <K.Hoerst@invalid>,\r\n new@thunderbird.bug",
          ],
          await browser.messengerUtilities.encodeMimeHeader(
            "TO",
            `"Hörst, Kenny" <K.Hoerst@invalid>, new@thunderbird.bug`
          ),
          `The mailbox header should be encoded correctly, including auto-folding.`
        );

        // Test enforced mailbox handling.
        window.assertDeepEqual(
          [
            "=?UTF-8?Q?H=C3=B6rst=2C_Kenny?= <K.Hoerst@invalid>,\r\n new@thunderbird.bug",
          ],
          await browser.messengerUtilities.encodeMimeHeader(
            "TO",
            `"Hörst, Kenny" <K.Hoerst@invalid>, new@thunderbird.bug`,
            true
          ),
          `The mailbox header should be encoded correctly, including auto-folding.`
        );

        // Test enforced non-mailbox handling.
        window.assertDeepEqual(
          [
            "=?UTF-8?B?IkjDtnJzdCwgS2VubnkiIDxLLkhvZXJzdEBpbnZhbGlkPiwgbmV3?=\r\n =?UTF-8?Q?=40thunderbird=2Ebug?=",
          ],
          await browser.messengerUtilities.encodeMimeHeader(
            "TO",
            `"Hörst, Kenny" <K.Hoerst@invalid>, new@thunderbird.bug`,
            false
          ),
          `The mailbox header should be encoded as expected (wrongly).`
        );

        // Test multiline subject.
        window.assertDeepEqual(
          [
            "=?UTF-8?B?c2RzYWQgw7bDpMO8IGFzZGEgZCAiw7zDtsOkInNkZsOkIGRz?=\r\n =?UTF-8?B?aiBhbGRqIGFzamQgaiBkaiDDtsO8IMO8w7bDpCBkaiBrYWRqcyDDtsO8?=\r\n =?UTF-8?Q?=C3=A4_skljd_asldkj_als_dj=C3=B6=C3=BC=C3=A4_sjdlasjd_lasdj?=\r\n =?UTF-8?B?IGxhc8O8w7bDpGwgYWRqIGxhZMO8w7bDpMO8IGxhc2RqIGxhcyBkasO8?=\r\n =?UTF-8?B?w7bDpA==?=",
          ],
          await browser.messengerUtilities.encodeMimeHeader(
            "Subject",
            `sdsad öäü asda d "üöä"sdfä dsj aldj asjd j dj öü üöä dj kadjs öüä skljd asldkj als djöüä sjdlasjd lasdj lasüöäl adj ladüöäü lasdj las djüöä`
          ),
          `The subject header should be encode correctly, including auto-folding.`
        );

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
