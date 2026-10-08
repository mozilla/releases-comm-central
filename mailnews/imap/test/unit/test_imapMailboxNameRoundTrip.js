/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests that every mailbox the server lists is selected under the name the
 * server gave it. AllocateCanonicalPath() maps that name into the folder
 * tree and AllocateServerPath() maps it back; each keeps its own rules about
 * namespace prefixes and the server directory, and nothing else checks that
 * they agree (bug 2005701).
 */

add_task(async function testNamespaces() {
  // Like Dovecot or Cyrus, advertise the prefixes with their trailing
  // delimiter.
  await checkRoundTrip({
    mailboxes: ["shared", "shared/sub", "folder"],
    namespaces: '(("" "/")) (("other/user/" "/")) (("shared/" "/"))',
  });
});

add_task(async function testServerDirectory() {
  await checkRoundTrip({
    mailboxes: ["Mail", "Mail/Mail", "Mail/folder"],
    serverDirectory: "Mail",
  });
});

/**
 * Lets Thunderbird discover the mailboxes, selects every folder it shows, and
 * compares the selected names with the selectable mailboxes on the server.
 *
 * @param {object} options
 * @param {string[]} options.mailboxes - Mailboxes to create on the server.
 * @param {string} [options.namespaces] - The NAMESPACE response, if any.
 * @param {string} [options.serverDirectory] - The server directory to set.
 */
async function checkRoundTrip({ mailboxes, namespaces, serverDirectory }) {
  const daemon = new ImapDaemon();
  for (const name of mailboxes) {
    daemon.createMailbox(name, { subscribed: true });
  }
  const server = makeServer(
    daemon,
    "RFC2342",
    namespaces && {
      NAMESPACE() {
        return `* NAMESPACE ${namespaces}\0OK NAMESPACE completed`;
      },
    }
  );
  const incomingServer = createLocalIMAPServer(server.port);
  incomingServer.maximumConnectionsNumber = 1;
  if (serverDirectory) {
    incomingServer.serverDirectory = serverDirectory;
  }
  const account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  account.addIdentity(identity);
  account.defaultIdentity = identity;
  account.incomingServer = incomingServer;

  const root = incomingServer.rootFolder;
  await updateFolder(root.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox));

  const selected = [];
  for (const folder of root.descendants) {
    if (folder.getFlag(Ci.nsMsgFolderFlags.ImapNoselect)) {
      continue;
    }
    await updateFolder(folder).catch(() => {});
    const commands = server.playTransaction().them;
    const select = commands.findLast(line => line.includes(" select "));
    selected.push(
      select.substring(select.indexOf(" select ") + 9, select.length - 1)
    );
  }

  const listed = serverMailboxes(daemon.root).filter(
    name =>
      !serverDirectory ||
      name == "INBOX" ||
      name.startsWith(serverDirectory + "/")
  );
  Assert.deepEqual(selected.sort(), listed.sort());

  incomingServer.closeCachedConnections();
  server.stop();
  MailServices.accounts.removeAccount(account, false);
}

function serverMailboxes(parent) {
  return parent._children.flatMap(mailbox => [
    ...(mailbox.flags.includes("\\Noselect") ? [] : [mailbox.fullName]),
    ...serverMailboxes(mailbox),
  ]);
}

async function updateFolder(folder) {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  folder
    .QueryInterface(Ci.nsIMsgImapMailFolder)
    .updateFolderWithListener(null, listener);
  await listener.promise;
}
