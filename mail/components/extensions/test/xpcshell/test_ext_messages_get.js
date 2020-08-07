/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.import(
  "resource://testing-common/ExtensionXPCShellUtils.jsm"
);

/**
 * Create a mail account and add a message.
 */
add_task(async function setup() {
  let account = createAccount();
  let folder = await createSubfolder(
    account.incomingServer.rootFolder,
    "test1"
  );
  await createMessages(folder, 1);
});

/**
 * Test the messages.getRaw and messages.getFull functions. Since each message
 * is unique and there are minor differences between the account
 * implementations, we don't compare exactly with a reference message.
 */
add_task(async function() {
  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      let accounts = await browser.accounts.list();
      browser.test.assertEq(1, accounts.length);

      for (let account of accounts) {
        let folder = account.folders.find(f => f.name == "test1");
        let { messages } = await browser.messages.list(folder);
        browser.test.assertEq(1, messages.length);

        let [message] = messages;
        browser.test.assertEq("Big Meeting Today", message.subject);
        browser.test.assertEq(
          '"Andy Anway" <andy@anway.invalid>',
          message.author
        );
        browser.test.assertEq(
          "Bob Bell <bob@bell.invalid>",
          message.recipients[0]
        );

        // From andy@anway.invalid
        // Content-Type: text/plain; charset=ISO-8859-1; format=flowed
        // Subject: Big Meeting Today
        // From: "Andy Anway" <andy@anway.invalid>
        // To: "Bob Bell" <bob@bell.invalid>
        // Message-Id: <0@made.up.invalid>
        // Date: Wed, 06 Nov 2019 22:37:40 +1300
        //
        // Hello Bob Bell!
        //

        let rawMessage = await browser.messages.getRaw(message.id);
        browser.test.log(rawMessage);
        browser.test.assertEq("string", typeof rawMessage);
        browser.test.assertTrue(
          rawMessage.includes("Subject: Big Meeting Today\r\n")
        );
        browser.test.assertTrue(
          rawMessage.includes('From: "Andy Anway" <andy@anway.invalid>\r\n')
        );
        browser.test.assertTrue(
          rawMessage.includes('To: "Bob Bell" <bob@bell.invalid>\r\n')
        );
        browser.test.assertTrue(rawMessage.includes("Hello Bob Bell!\r\n"));

        // {
        //   "contentType": "message/rfc822",
        //   "headers": {
        //     "content-type": ["text/plain; charset=ISO-8859-1; format=flowed"],
        //     "subject": ["Big Meeting Today"],
        //     "from": ["\"Andy Anway\" <andy@anway.invalid>"],
        //     "to": ["\"Bob Bell\" <bob@bell.invalid>"],
        //     "message-id": ["<0@made.up.invalid>"],
        //     "date": ["Wed, 06 Nov 2019 22:37:40 +1300"]
        //   },
        //   "partName": "",
        //   "size": 17,
        //   "parts": [
        //     {
        //       "body": "Hello Bob Bell!\n\n",
        //       "contentType": "text/plain",
        //       "headers": {
        //         "content-type": ["text/plain; charset=ISO-8859-1; format=flowed"]
        //       },
        //       "partName": "1",
        //       "size": 17
        //     }
        //   ]
        // }

        let fullMessage = await browser.messages.getFull(message.id);
        browser.test.log(JSON.stringify(fullMessage));
        browser.test.assertEq("object", typeof fullMessage);
        browser.test.assertEq("message/rfc822", fullMessage.contentType);

        browser.test.assertEq("object", typeof fullMessage.headers);
        for (let header of [
          "content-type",
          "date",
          "from",
          "message-id",
          "subject",
          "to",
        ]) {
          browser.test.assertTrue(Array.isArray(fullMessage.headers[header]));
          browser.test.assertEq(1, fullMessage.headers[header].length);
        }
        browser.test.assertEq(
          "Big Meeting Today",
          fullMessage.headers.subject[0]
        );
        browser.test.assertEq(
          '"Andy Anway" <andy@anway.invalid>',
          fullMessage.headers.from[0]
        );
        browser.test.assertEq(
          '"Bob Bell" <bob@bell.invalid>',
          fullMessage.headers.to[0]
        );

        browser.test.assertTrue(Array.isArray(fullMessage.parts));
        browser.test.assertEq(1, fullMessage.parts.length);
        browser.test.assertEq("object", typeof fullMessage.parts[0]);
        browser.test.assertEq(
          "Hello Bob Bell!",
          fullMessage.parts[0].body.trimRight()
        );
      }

      browser.test.notifyPass("finished");
    },
    manifest: { permissions: ["accountsRead", "messagesRead"] },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
