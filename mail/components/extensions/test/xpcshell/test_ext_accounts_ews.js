/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

add_task(async function test_folders() {
  const files = {
    "background.js": async () => {
      const accounts = await browser.accounts.list();
      window.assertDeepEqual(
        [
          {
            id: "account1",
            name: "user on localhost",
            type: "ews",
            rootFolder: {
              id: "account1://",
              name: "Root",
              path: "/",
              specialUse: [],
              isFavorite: false,
              isRoot: true,
              isTag: false,
              isUnified: false,
              isVirtual: false,
              accountId: "account1",
            },
            identities: [],
          },
        ],
        accounts,
        { strict: true }
      );

      const folders = await browser.folders.getSubFolders("account1://", true);
      window.assertDeepEqual(
        [
          {
            id: "account1://Inbox",
            name: "Inbox",
            path: "/Inbox",
            specialUse: ["inbox"],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            accountId: "account1",
            subFolders: [],
          },
          {
            id: "account1://Drafts",
            name: "Drafts",
            path: "/Drafts",
            specialUse: ["drafts"],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            accountId: "account1",
            subFolders: [],
          },
          {
            id: "account1://Sent",
            name: "Sent",
            path: "/Sent",
            specialUse: ["sent"],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            accountId: "account1",
            subFolders: [],
          },
          {
            id: "account1://Archives",
            name: "Archives",
            path: "/Archives",
            specialUse: ["archives"],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            accountId: "account1",
            subFolders: [],
          },
          {
            id: "account1://Junk",
            name: "Junk",
            path: "/Junk",
            specialUse: ["junk"],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            accountId: "account1",
            subFolders: [],
          },
          {
            id: "account1://Deleted Items",
            name: "Deleted Items",
            path: "/Deleted Items",
            specialUse: ["trash"],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            accountId: "account1",
            subFolders: [],
          },
          {
            id: "account1://Outbox",
            name: "Outbox",
            path: "/Outbox",
            specialUse: ["outbox"],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            accountId: "account1",
            subFolders: [],
          },
          {
            id: "account1://test1",
            name: "test1",
            path: "/test1",
            specialUse: [],
            isFavorite: false,
            isRoot: false,
            isTag: false,
            isUnified: false,
            isVirtual: false,
            accountId: "account1",
            subFolders: [],
          },
        ],
        folders,
        { strict: true }
      );
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "accountsFolders", "messagesDelete"],
    },
  });

  // Create an account.
  const account = await createAccount();

  // Create a folder.
  await createSubfolder(account.incomingServer.rootFolder, "test1");

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
