/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Tests that folders.delete() deletes a folder in a shared IMAP namespace on
// the server instead of moving it into the personal trash, which servers
// refuse.

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);
var { IMAP_RFC3501_handler } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Imapd.sys.mjs"
);

/**
 * @param {string} name - A mailbox name.
 * @returns {boolean} Whether the mailbox is in the shared namespace.
 */
function isShared(name) {
  return name == "shared" || name.startsWith("shared/");
}

add_task(async function test_delete_shared_folder() {
  const account = await createAccount("imap", {
    extensions: ["RFC2342"],
    overrides: {
      NAMESPACE() {
        return '* NAMESPACE (("" "/")) NIL (("shared/" "/"))\0OK NAMESPACE completed';
      },
      // Like Dovecot, refuse to rename across namespaces.
      RENAME(args) {
        if (isShared(args[0]) != isShared(args[1])) {
          return "NO [CANNOT] Renaming not supported across non-private namespaces";
        }
        return IMAP_RFC3501_handler.prototype.RENAME.call(this, args);
      },
      DELETE(args) {
        if (args[0] == "shared/refused") {
          return "NO [NOPERM] Permission denied";
        }
        return IMAP_RFC3501_handler.prototype.DELETE.call(this, args);
      },
    },
  });
  const server = account.incomingServer.QueryInterface(
    Ci.nsIImapIncomingServer
  );
  server.maximumConnectionsNumber = 1;
  const daemon = gIMAPServers.get(server.key).daemon;
  for (const name of ["Trash", "shared", "shared/sub", "shared/refused"]) {
    daemon.createMailbox(name, { subscribed: true });
  }
  const listener = new MailPromiseTestUtils.PromiseUrlListener();
  MailServices.imap.discoverAllFolders(server.rootFolder, listener, false);
  await listener.promise;
  const shared = server.rootFolder.getChildNamed("shared");
  Assert.ok(
    shared.getChildNamed("sub").getFlag(Ci.nsMsgFolderFlags.ImapPublic),
    "shared/sub should be flagged as shared"
  );

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const [accountId] = await window.waitForMessage();
        const [folder] = await browser.folders.query({
          accountId,
          path: "/shared/sub",
        });
        await browser.folders.delete(folder.id);

        const [refused] = await browser.folders.query({
          accountId,
          path: "/shared/refused",
        });
        await browser.test.assertRejects(
          browser.folders.delete(refused.id),
          /folders.delete\(\) failed/,
          "folders.delete() should fail when the server refuses the DELETE"
        );
        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "accountsFolders", "messagesDelete"],
    },
  });
  await extension.startup();
  extension.sendMessage(account.key);
  await extension.awaitFinish("finished");
  await extension.unload();

  Assert.ok(
    !daemon.getMailbox("shared/sub"),
    "shared/sub should be deleted on the server"
  );
  Assert.ok(
    !daemon.getMailbox("Trash/sub"),
    "shared/sub should not be in the trash"
  );
  Assert.ok(
    !shared.containsChildNamed("sub"),
    "shared/sub should be gone from the folder tree"
  );
  Assert.ok(
    daemon.getMailbox("shared/refused"),
    "shared/refused should still be on the server"
  );
  Assert.ok(
    shared.containsChildNamed("refused"),
    "shared/refused should stay in the folder tree"
  );
});
