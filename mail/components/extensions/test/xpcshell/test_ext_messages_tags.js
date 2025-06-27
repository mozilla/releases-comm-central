/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);
var { ExtensionsUI } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionsUI.sys.mjs"
);

add_setup(
  {
    skip_if: () => IS_NNTP,
  },
  async function setup() {
    const account = await createAccount();
    const rootFolder = account.incomingServer.rootFolder;
    const testFolder = await createSubfolder(rootFolder, "test");
    await createMessages(testFolder, 1);

    // There are a couple of deprecated properties in MV3, which we still want to
    // test in MV2 but also report to the user. By default, tests throw when
    // deprecated properties are used.
    Services.prefs.setBoolPref(
      "extensions.webextensions.warnings-as-errors",
      false
    );
    registerCleanupFunction(async () => {
      Services.prefs.clearUserPref(
        "extensions.webextensions.warnings-as-errors"
      );
    });
    await new Promise(resolve => executeSoon(resolve));
  }
);

add_task(
  {
    skip_if: () => IS_NNTP,
  },
  async function test_tags() {
    const files = {
      "background.js": async () => {
        const [testFolder] = await browser.folders.query({ name: "test" });
        const { messages } = await browser.messages.list(testFolder);

        class OneTimeListener {
          constructor(type) {
            this.task = Promise.withResolvers();
            this.listener = (...args) => {
              browser.messages.tags[type].removeListener(this.listener);
              this.task.resolve([...args]);
            };
            browser.messages.tags[type].addListener(this.listener);
          }
          seen() {
            return this.task.promise;
          }
        }

        const tags1 = await browser.messages.listTags();
        window.assertDeepEqual(
          [
            {
              key: "$label1",
              tag: "Important",
              color: "#FF0000",
              ordinal: "",
            },
            {
              key: "$label2",
              tag: "Work",
              color: "#FF9900",
              ordinal: "",
            },
            {
              key: "$label3",
              tag: "Personal",
              color: "#009900",
              ordinal: "",
            },
            {
              key: "$label4",
              tag: "To Do",
              color: "#3333FF",
              ordinal: "",
            },
            {
              key: "$label5",
              tag: "Later",
              color: "#993399",
              ordinal: "",
            },
          ],
          tags1
        );

        // Test some allowed special chars and that the key is created as lower
        // case.
        const goodKeys = [
          "TestKey",
          "Test_Key",
          "Test\\Key",
          "Test}Key",
          "Test&Key",
          "Test!Key",
          "Test§Key",
          "Test$Key",
          "Test=Key",
          "Test?Key",
        ];
        for (const key of goodKeys) {
          await browser.messages.createTag(key, "Test Tag", "#cd3456");
          const goodTags = await browser.messages.listTags();
          window.assertDeepEqual(
            [
              {
                key: "$label1",
                tag: "Important",
                color: "#FF0000",
                ordinal: "",
              },
              {
                key: "$label2",
                tag: "Work",
                color: "#FF9900",
                ordinal: "",
              },
              {
                key: "$label3",
                tag: "Personal",
                color: "#009900",
                ordinal: "",
              },
              {
                key: "$label4",
                tag: "To Do",
                color: "#3333FF",
                ordinal: "",
              },
              {
                key: "$label5",
                tag: "Later",
                color: "#993399",
                ordinal: "",
              },
              {
                key: key.toLowerCase(),
                tag: "Test Tag",
                color: "#CD3456",
                ordinal: "",
              },
            ],
            goodTags
          );
          await browser.messages.deleteTag(key.toLowerCase());
        }

        await browser.messages.createTag(
          "custom:_tag",
          "Custom Tag",
          "#123456"
        );
        const tags2 = await browser.messages.listTags();
        window.assertDeepEqual(
          [
            {
              key: "$label1",
              tag: "Important",
              color: "#FF0000",
              ordinal: "",
            },
            {
              key: "$label2",
              tag: "Work",
              color: "#FF9900",
              ordinal: "",
            },
            {
              key: "$label3",
              tag: "Personal",
              color: "#009900",
              ordinal: "",
            },
            {
              key: "$label4",
              tag: "To Do",
              color: "#3333FF",
              ordinal: "",
            },
            {
              key: "$label5",
              tag: "Later",
              color: "#993399",
              ordinal: "",
            },
            {
              key: "custom:_tag",
              tag: "Custom Tag",
              color: "#123456",
              ordinal: "",
            },
          ],
          tags2
        );

        await browser.messages.tags.update("$label5", {
          tag: "A Bit Later",
          color: "#AB4488",
          ordinal: "1",
        });
        const tags3a = await browser.messages.listTags();
        window.assertDeepEqual(
          [
            {
              key: "$label1",
              tag: "Important",
              color: "#FF0000",
              ordinal: "",
            },
            {
              key: "$label2",
              tag: "Work",
              color: "#FF9900",
              ordinal: "",
            },
            {
              key: "$label3",
              tag: "Personal",
              color: "#009900",
              ordinal: "",
            },
            {
              key: "$label4",
              tag: "To Do",
              color: "#3333FF",
              ordinal: "",
            },
            {
              key: "$label5",
              tag: "A Bit Later",
              color: "#AB4488",
              ordinal: "1",
            },
            {
              key: "custom:_tag",
              tag: "Custom Tag",
              color: "#123456",
              ordinal: "",
            },
          ],
          tags3a
        );

        await browser.messages.updateTag("$label5", {
          tag: "Much Later",
          color: "#cd5599",
        });
        const tags3b = await browser.messages.listTags();
        window.assertDeepEqual(
          [
            {
              key: "$label1",
              tag: "Important",
              color: "#FF0000",
              ordinal: "",
            },
            {
              key: "$label2",
              tag: "Work",
              color: "#FF9900",
              ordinal: "",
            },
            {
              key: "$label3",
              tag: "Personal",
              color: "#009900",
              ordinal: "",
            },
            {
              key: "$label4",
              tag: "To Do",
              color: "#3333FF",
              ordinal: "",
            },
            {
              key: "$label5",
              tag: "Much Later",
              color: "#CD5599",
              ordinal: "1",
            },
            {
              key: "custom:_tag",
              tag: "Custom Tag",
              color: "#123456",
              ordinal: "",
            },
          ],
          tags3b
        );

        // Test rejects for createTag().
        const badKeys = [
          "Bad Key",
          "Bad%Key",
          "Bad/Key",
          "Bad*Key",
          'Bad"Key',
          "Bad{Key}",
          "Bad(Key)",
          "Bad<Key>",
        ];
        for (const badKey of badKeys) {
          await browser.test.assertThrows(
            () =>
              browser.messages.createTag(badKey, "Important Stuff", "#223344"),
            /Type error for parameter key/,
            `Should reject creating an invalid key: ${badKey}`
          );
        }

        await browser.test.assertThrows(
          () =>
            browser.messages.createTag(
              "GoodKeyBadColor",
              "Important Stuff",
              "#223"
            ),
          /Type error for parameter color /,
          "Should reject creating a key using an invalid short color"
        );

        await browser.test.assertThrows(
          () =>
            browser.messages.createTag(
              "GoodKeyBadColor",
              "Important Stuff",
              "123223"
            ),
          /Type error for parameter color /,
          "Should reject creating a key using an invalid color without leading #"
        );

        await browser.test.assertRejects(
          browser.messages.createTag("$label5", "Important Stuff", "#223344"),
          `Specified key already exists: $label5`,
          "Should reject creating a key which exists already"
        );

        await browser.test.assertRejects(
          browser.messages.createTag(
            "Custom:_Tag",
            "Important Stuff",
            "#223344"
          ),
          `Specified key already exists: custom:_tag`,
          "Should reject creating a key which exists already"
        );

        await browser.test.assertRejects(
          browser.messages.createTag("GoodKey", "Important", "#223344"),
          `Specified tag already exists: Important`,
          "Should reject creating a key using a tag which exists already"
        );

        // Test rejects for updateTag();
        await browser.test.assertThrows(
          () => browser.messages.updateTag("Bad Key", { tag: "Much Later" }),
          /Type error for parameter key/,
          "Should reject updating an invalid key"
        );

        await browser.test.assertThrows(
          () =>
            browser.messages.updateTag("GoodKeyBadColor", { color: "123223" }),
          /Error processing color/,
          "Should reject updating a key using an invalid color"
        );

        await browser.test.assertRejects(
          browser.messages.updateTag("$label50", { tag: "Much Later" }),
          `Specified key does not exist: $label50`,
          "Should reject updating an unknown key"
        );

        await browser.test.assertRejects(
          browser.messages.updateTag("$label5", { tag: "Important" }),
          `Specified tag already exists: Important`,
          "Should reject updating a key using a tag which exists already"
        );

        // Test rejects for deleteTag();
        await browser.test.assertThrows(
          () => browser.messages.deleteTag("Bad Key"),
          /Type error for parameter key/,
          "Should reject deleting an invalid key"
        );

        await browser.test.assertRejects(
          browser.messages.deleteTag("$label50"),
          `Specified key does not exist: $label50`,
          "Should reject deleting an unknown key"
        );

        // Test tagging messages, deleting tag and re-creating tag.
        await browser.messages.update(messages[0].id, {
          tags: ["custom:_tag"],
        });
        const message1 = await browser.messages.get(messages[0].id);
        window.assertDeepEqual(["custom:_tag"], message1.tags);

        await browser.messages.tags.delete("custom:_tag");
        const message2 = await browser.messages.get(messages[0].id);
        window.assertDeepEqual([], message2.tags);

        const onCreated = new OneTimeListener("onCreated");
        await browser.messages.tags.create(
          "custom:_tag",
          "Custom Tag",
          "#AB3456"
        );
        window.assertDeepEqual(
          [
            {
              key: "custom:_tag",
              tag: "Custom Tag",
              color: "#AB3456",
              ordinal: "",
            },
          ],
          await onCreated.seen(),
          "Return values of tags.onCreated should be correct",
          { strict: true }
        );

        const message3 = await browser.messages.get(messages[0].id);
        window.assertDeepEqual(["custom:_tag"], message3.tags);

        // Check if a tag with hashed folder uri component is correctly returned.
        const tagFolder = await browser.folders.getTagFolder("custom:_tag");
        window.assertDeepEqual(
          {
            id: "tag://custom2fe99f47",
            name: "Custom Tag",
            path: "/tag/custom2fe99f47",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: true,
            isUnified: false,
            isVirtual: true,
            accountId: "",
          },
          tagFolder,
          "Should find the correct tag folder."
        );

        // Test deleting built-in tag.
        const onDeleted = new OneTimeListener("onDeleted");
        await browser.messages.deleteTag("$label5");
        window.assertDeepEqual(
          ["$label5"],
          await onDeleted.seen(),
          "Return values of tags.onDeleted should be correct",
          { strict: true }
        );

        const tags4 = await browser.messages.listTags();
        window.assertDeepEqual(
          [
            {
              key: "$label1",
              tag: "Important",
              color: "#FF0000",
              ordinal: "",
            },
            {
              key: "$label2",
              tag: "Work",
              color: "#FF9900",
              ordinal: "",
            },
            {
              key: "$label3",
              tag: "Personal",
              color: "#009900",
              ordinal: "",
            },
            {
              key: "$label4",
              tag: "To Do",
              color: "#3333FF",
              ordinal: "",
            },
            {
              key: "custom:_tag",
              tag: "Custom Tag",
              color: "#AB3456",
              ordinal: "",
            },
          ],
          tags4
        );

        // Test creating a tag without providing a key, auto-generating one.
        const autoKey = await browser.messages.tags.create(
          "Auto Tag",
          "#3456CD"
        );
        browser.test.assertEq(
          "auto_tag",
          autoKey,
          "Auto-generated key should be correct"
        );

        // Rename the auto-created tag.
        const onUpdated = new OneTimeListener("onUpdated");
        await browser.messages.tags.update(autoKey, {
          tag: "Something very different",
        });
        window.assertDeepEqual(
          [
            "auto_tag",
            { tag: "Something very different" },
            { tag: "Auto Tag" },
          ],
          await onUpdated.seen(),
          "Return values of tags.onUpdated should be correct",
          { strict: true }
        );

        const autoTag = await browser.messages.tags
          .list()
          .then(rv => rv.find(t => t.key == autoKey));
        browser.test.assertEq(
          "Something very different",
          autoTag.tag,
          "The renamed tag should be correct"
        );

        // Test creating the same tag again and verify that a different auto-
        // generated key is returned.
        const autoKeyNr2 = await browser.messages.tags.create(
          "Auto Tag",
          "#1234AB"
        );
        browser.test.assertEq(
          "auto_taga",
          autoKeyNr2,
          "Auto-generated key should be correct the second time as well"
        );

        // Clean up.
        await browser.messages.update(messages[0].id, { tags: [] });
        await browser.messages.deleteTag("custom:_tag");
        await browser.messages.deleteTag(autoKey);
        await browser.messages.tags.create("$label5", "Later", "#993399");
        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    };
    const extension = ExtensionTestUtils.loadExtension({
      files,
      manifest: {
        manifest_version: 2,
        background: { scripts: ["utils.js", "background.js"] },
        permissions: [
          "messagesRead",
          "accountsRead",
          "messagesTags",
          "messagesUpdate",
          "messagesTagsList",
        ],
      },
    });

    await extension.startup();
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);

add_task(
  {
    skip_if: () => IS_NNTP,
  },
  async function test_tags_no_permission() {
    const files = {
      "background.js": async () => {
        await browser.test.assertThrows(
          () =>
            browser.messages.createTag(
              "custom:_tag",
              "Important Stuff",
              "#223344"
            ),
          /browser.messages.createTag is not a function/,
          "Should reject creating tags without messagesTags permission"
        );

        await browser.test.assertThrows(
          () => browser.messages.updateTag("$label5", { tag: "Much Later" }),
          /browser.messages.updateTag is not a function/,
          "Should reject updating tags without messagesTags permission"
        );

        await browser.test.assertThrows(
          () => browser.messages.deleteTag("$label5"),
          /browser.messages.deleteTag is not a function/,
          "Should reject deleting tags without messagesTags permission"
        );

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    };
    const extension = ExtensionTestUtils.loadExtension({
      files,
      manifest: {
        manifest_version: 2,
        background: { scripts: ["utils.js", "background.js"] },
        permissions: ["messagesRead", "accountsRead"],
      },
    });

    await extension.startup();
    await extension.awaitFinish("finished");
    await extension.unload();
  }
);
