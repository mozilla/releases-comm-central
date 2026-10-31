/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_setup(function () {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  registerCleanupFunction(() =>
    Services.prefs.clearUserPref("mail.server.default.autosync_offline_stores")
  );
  localAccountUtils.loadLocalMailAccount();
});

add_task(async function test_defaultTrashWithNamespace() {
  await checkTrashDiscovery({});
});

add_task(async function test_relativeTrashWithNamespace() {
  await checkTrashDiscovery({ trashPref: "Trash" });
});

add_task(async function test_fullTrashPath() {
  await checkTrashDiscovery({ trashPref: "INBOX/Trash" });
});

add_task(async function test_caseInsensitiveInboxPrefix() {
  await checkTrashDiscovery({ trashPref: "inbox/Trash" });
});

add_task(async function test_unsubscribedTrash() {
  await checkTrashDiscovery({ prefix: "", subscribed: false });
});

add_task(async function test_unsubscribedTrashWithNamespace() {
  await checkTrashDiscovery({ subscribed: false });
});

add_task(async function test_emptyNamespace() {
  await checkTrashDiscovery({ prefix: "" });
});

add_task(async function test_otherNamespacePrefix() {
  await checkTrashDiscovery({ prefix: "Mail/", delimiter: "/" });
});

add_task(async function test_serverDirectory() {
  await checkTrashDiscovery({ serverDirectory: "INBOX" });
});

add_task(async function test_nestedTrash() {
  await checkTrashDiscovery({
    name: "Deleted/Items",
    trashPref: "Deleted/Items",
  });
});

add_task(async function test_fullNestedTrashPath() {
  await checkTrashDiscovery({
    name: "Deleted/Items",
    trashPref: "INBOX/Deleted/Items",
  });
});

add_task(async function test_caseInsensitiveTrash() {
  await checkTrashDiscovery({ name: "TRASH" });
});

add_task(async function test_nonAsciiTrash() {
  await checkTrashDiscovery({
    name: "Corbeille é",
    trashPref: "Corbeille é",
  });
});

add_task(async function test_specialUseTrash() {
  await checkTrashDiscovery({ name: "Deleted", specialUse: true });
});

add_task(async function test_missingTrash() {
  await checkTrashDiscovery({ exists: false });
});

/**
 * Discovers and selects Trash twice, and checks the CREATE and SELECT commands.
 *
 * @param {object} options
 * @param {string} [options.prefix="INBOX."] - The personal namespace prefix.
 * @param {string} [options.delimiter="."] - The server's hierarchy delimiter.
 * @param {string} [options.name="Trash"] - The namespace-relative mailbox path,
 *   with slashes for hierarchy delimiters.
 * @param {string} [options.trashPref] - The UTF-8 Trash path preference, if set.
 * @param {boolean} [options.subscribed=true] - Whether Trash is subscribed.
 * @param {boolean} [options.exists=true] - Whether Trash already exists.
 * @param {boolean} [options.specialUse=false] - Whether LIST returns a Trash flag.
 * @param {string} [options.serverDirectory=""] - The configured server directory.
 */
async function checkTrashDiscovery({
  prefix = "INBOX.",
  delimiter = ".",
  name = "Trash",
  trashPref,
  subscribed = true,
  exists = true,
  specialUse = false,
  serverDirectory = "",
}) {
  const daemon = new ImapDaemon();
  daemon.root.delimiter = delimiter;
  daemon.inbox.delimiter = delimiter;
  const onlineName = prefix + name.replaceAll("/", delimiter);
  const mailboxNames = [
    prefix + "Other" + delimiter + "Trash",
    prefix + "Trashcan",
    ...(exists ? [onlineName] : []),
  ];
  for (const mailboxName of mailboxNames) {
    const parts = mailboxName.split(delimiter);
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join(delimiter);
      if (!daemon.getMailbox(path)) {
        daemon.createMailbox(path, { subscribed: true, delimiter });
      }
    }
  }
  if (exists) {
    const trash = daemon.getMailbox(onlineName);
    trash.subscribed = subscribed;
    trash.flags = specialUse ? ["\\Trash"] : [];
  }

  const creates = [];
  const server = makeServer(daemon, "RFC2342", {
    NAMESPACE() {
      return `* NAMESPACE (("${prefix}" "${delimiter}")) NIL NIL\0OK NAMESPACE completed`;
    },
    CREATE(args) {
      creates.push(args[0]);
      const response = IMAP_RFC3501_handler.prototype.CREATE.call(this, args);
      const mailbox = daemon.getMailbox(args[0]);
      if (mailbox) {
        // Fake mailboxes otherwise default to "/", even in a "." namespace.
        mailbox.delimiter = delimiter;
      }
      return response;
    },
  });
  const incomingServer = createLocalIMAPServer(server.port);
  incomingServer.maximumConnectionsNumber = 1;
  // Issue SELECT on each update, even if Trash is already selected.
  incomingServer.forceSelect = true;
  incomingServer.allowUTF8Accept = false;
  incomingServer.serverDirectory = serverDirectory;
  if (trashPref !== undefined) {
    incomingServer.setStringValue("trash_folder_name", trashPref);
  }
  const account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  account.addIdentity(identity);
  account.defaultIdentity = identity;
  account.incomingServer = incomingServer;

  try {
    for (let discovery = 0; discovery < 2; discovery++) {
      const listener = new PromiseTestUtils.PromiseUrlListener();
      MailServices.imap.discoverAllFolders(
        incomingServer.rootFolder,
        listener,
        null
      );
      await listener.promise;
      Assert.deepEqual(
        creates,
        exists ? [] : [onlineName],
        "Discovery should only create Trash if it does not exist yet"
      );
      const trashFolders = incomingServer.rootFolder.getFoldersWithFlags(
        Ci.nsMsgFolderFlags.Trash
      );
      Assert.equal(
        trashFolders.length,
        1,
        "Exactly one folder should be Trash"
      );
      const updateListener = new PromiseTestUtils.PromiseUrlListener();
      trashFolders[0]
        .QueryInterface(Ci.nsIMsgImapMailFolder)
        .updateFolderWithListener(false, updateListener);
      await updateListener.promise;
      const mailbox = daemon.getMailbox(onlineName);
      Assert.ok(mailbox, "The server should have the Trash mailbox");
      Assert.equal(
        server
          .playTransaction()
          .them.filter(line =>
            line.endsWith(` select "${mailbox.displayName}"`)
          ).length,
        discovery + 1,
        "Each update should select Trash using the existing mailbox's server name"
      );
    }
  } finally {
    incomingServer.closeCachedConnections();
    server.stop();
    MailServices.accounts.removeAccount(account, false);
  }
}
