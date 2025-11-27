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

add_task(async function test_get_headers() {
  const _account = await createAccount();
  const _folder = await createSubfolder(
    _account.incomingServer.rootFolder,
    "test1"
  );

  // Main body with disposition inline, base64 encoded,
  // subject is UTF-8 encoded word.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample01.eml").path
  );
  // A multipart/mixed mime message, to header is iso-8859-1 encoded word,
  // body is quoted printable with iso-8859-1, attachments with different names
  // and filenames.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample02.eml").path
  );
  // Message with attachment only, From header is iso-8859-1 encoded word.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample03.eml").path
  );
  // Message with koi8-r + base64 encoded body, subject is koi8-r encoded word.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample04.eml").path
  );
  // Message with windows-1251 + base64 encoded body, subject is windows-1251
  // encoded word.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample05.eml").path
  );
  // Message without plain/text content-type.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample06.eml").path
  );
  // A multipart/alternative message without plain/text content-type.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample07.eml").path
  );
  // A multipart/related message with an embedded image.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample08.eml").path
  );
  // A message with utf-8 encoded from and to header, which have an encoded comma
  // and should be quoted after RFC2047 decoding.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/utf8MailboxStrings.eml").path
  );
  await createMessageFromFile(
    _folder,
    do_get_file("messages/attachedMessageWithMissingHeaders.eml").path
  );

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const accounts = await browser.accounts.list();
        browser.test.assertEq(1, accounts.length);
        const account = accounts[0];
        const folder = account.folders.find(f => f.name == "test1");
        const { messages } = await browser.messages.list(folder.id);
        browser.test.assertEq(10, messages.length);

        const expectedData = {
          "01.eml@mime.sample": {
            decoded: {
              from: ["Bug Reporter <new@thunderbird.bug>"],
              newsgroups: ["gmane.comp.mozilla.thunderbird.user"],
              subject: ["αλφάβητο"],
              date: ["Thu, 27 May 2021 21:23:35 +0100"],
              "message-id": ["<01.eml@mime.sample>"],
              "mime-version": ["1.0"],
              "content-type": ["text/plain; charset=utf-8;"],
              "content-transfer-encoding": ["base64"],
              "content-disposition": ["inline"],
            },
            raw: {
              from: ["Bug Reporter <new@thunderbird.bug>"],
              newsgroups: ["gmane.comp.mozilla.thunderbird.user"],
              subject: ["=?UTF-8?B?zrHOu8+GzqzOss63z4TOvw==?="],
              date: ["Thu, 27 May 2021 21:23:35 +0100"],
              "message-id": ["<01.eml@mime.sample>"],
              "mime-version": ["1.0"],
              "content-type": ["text/plain; charset=utf-8;"],
              "content-transfer-encoding": ["base64"],
              "content-disposition": ["inline"],
            },
          },
          "02.eml@mime.sample": {
            decoded: {
              from: ["Doug Sauder <doug@example.com>"],
              to: ["Heinz Müller <mueller@example.com>"],
              subject: ["Test message from Microsoft Outlook 00"],
              date: ["Wed, 17 May 2000 19:32:47 -0400"],
              "message-id": ["<02.eml@mime.sample>"],
              "mime-version": ["1.0"],
              "content-type": [
                'multipart/mixed;\tboundary="----=_NextPart_000_0002_01BFC036.AE309650"',
              ],
              "x-priority": ["3 (Normal)"],
              "x-msmail-priority": ["Normal"],
              "x-mailer": [
                "Microsoft Outlook IMO, Build 9.0.2416 (9.0.2910.0)",
              ],
              importance: ["Normal"],
              "x-mimeole": ["Produced By Microsoft MimeOLE V5.00.2314.1300"],
            },
            raw: {
              from: ['"Doug Sauder" <doug@example.com>'],
              to: ["=?iso-8859-1?Q?Heinz_M=FCller?= <mueller@example.com>"],
              subject: ["Test message from Microsoft Outlook 00"],
              date: ["Wed, 17 May 2000 19:32:47 -0400"],
              "message-id": ["<02.eml@mime.sample>"],
              "mime-version": ["1.0"],
              "content-type": [
                'multipart/mixed;\r\n\tboundary="----=_NextPart_000_0002_01BFC036.AE309650"',
              ],
              "x-priority": ["3 (Normal)"],
              "x-msmail-priority": ["Normal"],
              "x-mailer": [
                "Microsoft Outlook IMO, Build 9.0.2416 (9.0.2910.0)",
              ],
              importance: ["Normal"],
              "x-mimeole": ["Produced By Microsoft MimeOLE V5.00.2314.1300"],
            },
          },
          "03.eml@mime.sample": {
            decoded: {
              from: ["Heinz Müller <mueller@example.com>"],
              to: ["Joe Blow <jblow@example.com>"],
              subject: ["Test message from Microsoft Outlook 00"],
              date: ["Wed, 17 May 2000 19:35:05 -0400"],
              "message-id": ["<03.eml@mime.sample>"],
              "mime-version": ["1.0"],
              "content-type": ['image/png;\tname="doubelspace  ball.png"'],
              "content-transfer-encoding": ["base64"],
              "content-disposition": [
                'attachment;\tfilename="doubelspace  ball.png"',
              ],
              "x-priority": ["3 (Normal)"],
              "x-msmail-priority": ["Normal"],
              "x-mailer": [
                "Microsoft Outlook IMO, Build 9.0.2416 (9.0.2910.0)",
              ],
              importance: ["Normal"],
              "x-mimeole": ["Produced By Microsoft MimeOLE V5.00.2314.1300"],
            },
            raw: {
              from: ["=?iso-8859-1?Q?Heinz_M=FCller?= <mueller@example.com>"],
              to: ['"Joe Blow" <jblow@example.com>'],
              subject: ["Test message from Microsoft Outlook 00"],
              date: ["Wed, 17 May 2000 19:35:05 -0400"],
              "message-id": ["<03.eml@mime.sample>"],
              "mime-version": ["1.0"],
              "content-type": ['image/png;\r\n\tname="doubelspace  ball.png"'],
              "content-transfer-encoding": ["base64"],
              "content-disposition": [
                'attachment;\r\n\tfilename="doubelspace  ball.png"',
              ],
              "x-priority": ["3 (Normal)"],
              "x-msmail-priority": ["Normal"],
              "x-mailer": [
                "Microsoft Outlook IMO, Build 9.0.2416 (9.0.2910.0)",
              ],
              importance: ["Normal"],
              "x-mimeole": ["Produced By Microsoft MimeOLE V5.00.2314.1300"],
            },
          },
          "04.eml@mime.sample": {
            decoded: {
              newsgroups: ["gmane.comp.mozilla.thunderbird.user"],
              from: ["Bug Reporter <new@thunderbird.bug>"],
              subject: ["Алфавит"],
              date: ["Sun, 27 May 2001 21:23:35 +0100"],
              "mime-version": ["1.0"],
              "message-id": ["<04.eml@mime.sample>"],
              "content-type": ["text/plain; charset=koi8-r;"],
              "content-transfer-encoding": ["base64"],
            },
            raw: {
              newsgroups: ["gmane.comp.mozilla.thunderbird.user"],
              from: ["Bug Reporter <new@thunderbird.bug>"],
              subject: ["=?koi8-r?B?4czGwdfJ1Ao=?="],
              date: ["Sun, 27 May 2001 21:23:35 +0100"],
              "mime-version": ["1.0"],
              "message-id": ["<04.eml@mime.sample>"],
              "content-type": ["text/plain; charset=koi8-r;"],
              "content-transfer-encoding": ["base64"],
            },
          },
          "05.eml@mime.sample": {
            decoded: {
              newsgroups: ["gmane.comp.mozilla.thunderbird.user"],
              from: ["Bug Reporter <new@thunderbird.bug>"],
              subject: ["Алфавит"],
              date: ["Sun, 27 May 2001 21:23:35 +0100"],
              "mime-version": ["1.0"],
              "message-id": ["<05.eml@mime.sample>"],
              "content-type": ["text/plain; charset=windows-1251;"],
              "content-transfer-encoding": ["base64"],
            },
            raw: {
              newsgroups: ["gmane.comp.mozilla.thunderbird.user"],
              from: ["Bug Reporter <new@thunderbird.bug>"],
              subject: ["=?windows-1251?B?wOv04OLo8go=?="],
              date: ["Sun, 27 May 2001 21:23:35 +0100"],
              "mime-version": ["1.0"],
              "message-id": ["<05.eml@mime.sample>"],
              "content-type": ["text/plain; charset=windows-1251;"],
              "content-transfer-encoding": ["base64"],
            },
          },
          "06.eml@mime.sample": {
            decoded: {
              newsgroups: ["gmane.comp.mozilla.thunderbird.user"],
              from: ["Bug Reporter <new@thunderbird.bug>"],
              subject: ["I have no content type"],
              date: ["Sun, 27 May 2001 21:23:35 +0100"],
              "mime-version": ["1.0"],
              "message-id": ["<06.eml@mime.sample>"],
            },
            raw: {
              newsgroups: ["gmane.comp.mozilla.thunderbird.user"],
              from: ["Bug Reporter <new@thunderbird.bug>"],
              subject: ["I have no content type"],
              date: ["Sun, 27 May 2001 21:23:35 +0100"],
              "mime-version": ["1.0"],
              "message-id": ["<06.eml@mime.sample>"],
            },
          },
          "07.eml@mime.sample": {
            decoded: {
              "message-id": ["<07.eml@mime.sample>"],
              date: ["Fri, 19 May 2000 00:29:55 -0400"],
              to: ["Heinz <mueller@example.com>"],
              from: ["Doug Sauder <dwsauder@example.com>"],
              subject: ["Default content-types"],
              "mime-version": ["1.0"],
              "content-type": [
                'multipart/alternative;\tboundary="=====================_714967308==_.ALT"',
              ],
            },
            raw: {
              "message-id": ["<07.eml@mime.sample>"],
              date: ["Fri, 19 May 2000 00:29:55 -0400"],
              to: ["Heinz <mueller@example.com>"],
              from: ["Doug Sauder <dwsauder@example.com>"],
              subject: ["Default content-types"],
              "mime-version": ["1.0"],
              "content-type": [
                'multipart/alternative;\r\n\tboundary="=====================_714967308==_.ALT"',
              ],
            },
          },
          "08.eml@mime.sample": {
            decoded: {
              "message-id": ["<08.eml@mime.sample>"],
              date: ["Wed, 29 May 2024 15:26:47 +0200"],
              "mime-version": ["1.0"],
              from: ["John <john@example.com>"],
              "content-language": ["en-US"],
              to: ["user@invalid"],
              subject: ["Embedded Image"],
              "content-type": [
                'multipart/related; boundary="------------XDhTrqqN5B126r5Y7JBH0YyJ"',
              ],
            },
            raw: {
              "message-id": ["<08.eml@mime.sample>"],
              date: ["Wed, 29 May 2024 15:26:47 +0200"],
              "mime-version": ["1.0"],
              from: ["John <john@example.com>"],
              "content-language": ["en-US"],
              to: ["user@invalid"],
              subject: ["Embedded Image"],
              "content-type": [
                'multipart/related;\r\n boundary="------------XDhTrqqN5B126r5Y7JBH0YyJ"',
              ],
            },
          },
          "1919244@thunderbird.bug": {
            decoded: {
              "message-id": ["<1919244@thunderbird.bug>"],
              date: ["Mon, 23 Sep 2024 16:16:47 +0200"],
              "mime-version": ["1.0"],
              from: ['"Hörst, Kenny" <K.Hoerst@invalid>'],
              to: [
                '"Hörst, Kenny" <K.Hoerst@invalid>, Bug Reporter <new@thunderbird.bug>',
              ],
              subject: ["Message for Bug 1919244"],
              "content-type": ["text/plain; charset=UTF-8; format=flowed"],
              "content-transfer-encoding": ["7bit"],
            },
            raw: {
              "message-id": ["<1919244@thunderbird.bug>"],
              date: ["Mon, 23 Sep 2024 16:16:47 +0200"],
              "mime-version": ["1.0"],
              from: ["=?UTF-8?Q?H=C3=B6rst=2C_Kenny?= <K.Hoerst@invalid>"],
              to: [
                "=?UTF-8?Q?H=C3=B6rst=2C_Kenny?= <K.Hoerst@invalid>, Bug Reporter <new@thunderbird.bug>",
              ],
              subject: ["Message for Bug 1919244"],
              "content-type": ["text/plain; charset=UTF-8; format=flowed"],
              "content-transfer-encoding": ["7bit"],
            },
          },
          "sample.eml@mime.sample": {
            decoded: {
              "message-id": ["<sample.eml@mime.sample>"],
              date: ["Fri, 20 May 2000 00:29:55 -0400"],
              to: ["Heinz <mueller@example.com>"],
              from: ["Batman <bruce@example.com>"],
              subject: ["Attached message without subject"],
              "mime-version": ["1.0"],
              "content-type": [
                'multipart/mixed;  boundary="------------49CVLb1N6p6Spdka4qq7Naeg"',
              ],
            },
            raw: {
              "message-id": ["<sample.eml@mime.sample>"],
              date: ["Fri, 20 May 2000 00:29:55 -0400"],
              to: ["Heinz <mueller@example.com>"],
              from: ["Batman <bruce@example.com>"],
              subject: ["Attached message without subject"],
              "mime-version": ["1.0"],
              "content-type": [
                'multipart/mixed;\r\n  boundary="------------49CVLb1N6p6Spdka4qq7Naeg"',
              ],
            },
          },
        };

        for (const message of messages) {
          const defaultHeaders = await browser.messages.getHeaders(message.id);
          window.assertDeepEqual(
            expectedData[message.headerMessageId].decoded,
            defaultHeaders,
            `Return value of getHeaders() with default header decoding for message ${message.headerMessageId} should be correct`
          );

          const decodedHeaders = await browser.messages.getHeaders(message.id, {
            decodeHeaders: true,
          });
          window.assertDeepEqual(
            expectedData[message.headerMessageId].decoded,
            decodedHeaders,
            `Return value of getHeaders() with enforced header decoding for message ${message.headerMessageId} should be correct`
          );

          const rawHeaders = await browser.messages.getHeaders(message.id, {
            decodeHeaders: false,
          });
          window.assertDeepEqual(
            expectedData[message.headerMessageId].raw,
            rawHeaders,
            `Return value of getHeaders() with enforced disabled header decoding for message ${message.headerMessageId} should be correct`
          );
        }

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 2,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(_account);
});
