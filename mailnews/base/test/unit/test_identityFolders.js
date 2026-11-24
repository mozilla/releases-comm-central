/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*eslint no-unused-vars: ["error", { "varsIgnorePattern": "^_" }]*/

const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

const folderTypes = [
  [
    "fccFolderURI",
    "getOrCreateFccFolderAsync",
    "fccFolderPickerMode",
    "Sent",
    Ci.nsMsgFolderFlags.SentMail,
  ],
  [
    "draftsFolderURI",
    "getOrCreateDraftsFolderAsync",
    "draftsFolderPickerMode",
    "Drafts",
    Ci.nsMsgFolderFlags.Drafts,
  ],
  [
    "archivesFolderURI",
    "getOrCreateArchivesFolderAsync",
    "archivesFolderPickerMode",
    "Archives",
    Ci.nsMsgFolderFlags.Archive,
  ],
  [
    "templatesFolderURI",
    "getOrCreateTemplatesFolderAsync",
    "templatesFolderPickerMode",
    "Templates",
    Ci.nsMsgFolderFlags.Templates,
  ],
];

async function runFoldersSubtest(type, callback) {
  const mockServer = await ServerTestUtils.createServer({
    ...ServerTestUtils.serverDefs[type].plain,
    options: {
      username: "oscar",
      password: "oscar",
    },
  });

  const account = MailServices.accounts.createAccount();
  const server = MailServices.accounts.createIncomingServer(
    "oscar",
    "localhost",
    type
  );
  server.port = mockServer.port;
  server.password = "oscar";
  if (type == "ews") {
    server.setStringValue(
      "ews_url",
      `http://localhost:${mockServer.port}/EWS/Exchange.asmx`
    );
  } else if (type == "graph") {
    server.setStringValue("ews_url", `http://localhost:${mockServer.port}/`);
  }
  account.incomingServer = server;
  const identity = MailServices.accounts.createIdentity();
  account.addIdentity(identity);
  const root = server.rootFolder;
  server.performBiff(false);
  await TestUtils.waitForCondition(() => root.containsChildNamed("INBOX"));

  await callback(type, server, identity);

  if (type == "pop3") {
    await TestUtils.waitForCondition(
      () => !server.wrappedJSObject.runningClient,
      "waiting for POP3 connection to become idle"
    );
  } else if (type == "imap") {
    server.QueryInterface(Ci.nsIImapIncomingServer);
    await TestUtils.waitForCondition(
      () => server.allConnectionsIdle,
      "waiting for IMAP connection to become idle"
    );
  }
  MailServices.accounts.removeAccount(account, false);
  mockServer.close?.();
  mockServer.stop?.();
}

/**
 * Tests identities where the folder properties are not set. Folders with the
 * hard-coded names and flags should be created as a subfolders of the root
 * folder on the server.
 */
async function subtestUnset(type, server, identity) {
  const root = server.rootFolder;

  for (const [attribute, func, _pickerMode, name, flag] of folderTypes) {
    info(`Testing ${name} folder on a ${type} account`);

    if (root.getFolderWithFlags(flag)) {
      info(`${type} server has a ${name} folder at the start of the test`);
    } else {
      info(`${type} server has no ${name} folder at the start of the test`);
    }
    Assert.equal(
      identity[attribute],
      null,
      `${attribute} should return no value`
    );

    const folder = await identity[func]();
    Assert.equal(folder.parent?.URI, root.URI);
    Assert.equal(folder.name, name);
    Assert.equal(folder.flags & flag, flag);
    Assert.equal(folder.URI, `${server.serverURI}/${name}`);
    Assert.equal(
      identity[attribute],
      folder.URI,
      `${attribute} should now return the folder's URI`
    );

    // Get the folders again, now that it exists and we've stored the URI,
    // to check getting existing folders works.
    Assert.equal(
      await identity[func](),
      folder,
      `${func} should return the same value as before`
    );
  }
}

add_task(async function testUnsetPOP3() {
  await runFoldersSubtest("pop3", subtestUnset);
});

add_task(async function testUnsetIMAP() {
  await runFoldersSubtest("imap", subtestUnset);
});

add_task(async function testUnsetEWS() {
  await runFoldersSubtest("ews", subtestUnset);
});

add_task(async function testUnsetGraph() {
  await runFoldersSubtest("graph", subtestUnset);
});

/**
 * Tests identities where the folder properties are set, but point to a folder
 * that doesn't exist. This could be caused by a folder that once existed but
 * no longer exists. Folders with the hard-coded names and flags should be
 * created as a subfolders of the root folder on the server.
 */
async function subtestSetButMissing(type, server, identity) {
  const root = server.rootFolder;

  identity.fccFolderURI = `${server.serverURI}/Anything`;
  identity.draftsFolderURI = `${server.serverURI}/Anything`;
  identity.archivesFolderURI = `${server.serverURI}/Anything`;
  identity.templatesFolderURI = `${server.serverURI}/Anything`;

  for (const [attribute, func, _pickerMode, name, flag] of folderTypes) {
    info(`Testing ${name} folder on ${type} account`);

    if (root.getFolderWithFlags(flag)) {
      info(`${type} server has a ${name} folder at the start of the test`);
    } else {
      info(`${type} server has no ${name} folder at the start of the test`);
    }

    const folder = await identity[func]();
    Assert.equal(folder.parent?.URI, root.URI);
    Assert.equal(folder.name, name);
    Assert.equal(folder.flags & flag, flag);
    Assert.equal(folder.URI, `${server.serverURI}/${name}`);
    Assert.equal(
      identity[attribute],
      folder.URI,
      `${attribute} should now return the folder's URI`
    );

    // Get the folder again, now that it exists and we've stored the URI,
    // to check getting existing folders works.
    Assert.equal(
      await identity[func](),
      folder,
      `${func} should return the same value as before`
    );
  }
}

add_task(async function testSetButMissingPOP3() {
  await runFoldersSubtest("pop3", subtestSetButMissing);
});

add_task(async function testSetButMissingIMAP() {
  await runFoldersSubtest("imap", subtestSetButMissing);
});

add_task(async function testSetButMissingEWS() {
  await runFoldersSubtest("ews", subtestSetButMissing);
});

add_task(async function testSetButMissingGraph() {
  await runFoldersSubtest("graph", subtestSetButMissing);
});

/**
 * Tests identities where the folder properties are set and point to a folder
 * that exists.
 */
async function subtestSet(type, server, identity) {
  const root = server.rootFolder;
  const parentFolder = await root.createSubfolderAsync("Parent");
  const targetFolder = await parentFolder.createSubfolderAsync("Child");

  identity.fccFolderURI = targetFolder.URI;
  identity.draftsFolderURI = targetFolder.URI;
  identity.archivesFolderURI = targetFolder.URI;
  identity.templatesFolderURI = targetFolder.URI;

  for (const [_attribute, func, _pickerMode, name, flag] of folderTypes) {
    info(`Testing ${name} folder on ${type} account`);

    if (root.getFolderWithFlags(flag)) {
      info(`${type} server has a ${name} folder at the start of the test`);
    } else {
      info(`${type} server has no ${name} folder at the start of the test`);
    }

    const folder = await identity[func]();
    Assert.equal(
      folder,
      targetFolder,
      "function should return the target folder"
    );
    Assert.equal(
      targetFolder.flags & flag,
      flag,
      "the target folder should now have the type flag"
    );
  }
}

add_task(async function testSetPOP3() {
  await runFoldersSubtest("pop3", subtestSet);
});

add_task(async function testSetIMAP() {
  await runFoldersSubtest("imap", subtestSet);
});

add_task(async function testSetEWS() {
  await runFoldersSubtest("ews", subtestSet);
});

add_task(async function testSetGraph() {
  await runFoldersSubtest("graph", subtestSet);
});

/**
 * IMAP namespace discovery should canonicalize special-folder URIs without
 * changing whether the user selected the account default or "Other". A
 * Templates folder created after discovery should be canonicalized when it is
 * first used too.
 */
add_task(async function testIMAPNamespaceCanonicalization() {
  const mockServer = await ServerTestUtils.createServer({
    ...ServerTestUtils.serverDefs.imap.plain,
    options: {
      extensions: ["RFC2195", "RFC2342", "RFC5258"],
      username: "oscar",
      password: "oscar",
    },
  });

  const { daemon } = mockServer;
  daemon.inbox.type = 0;
  daemon.inbox.subscribed = true;
  Object.defineProperty(daemon.inbox, "displayName", { value: "INBOX/" });
  daemon.namespaces = [daemon.inbox];
  for (const [name, specialUseFlag] of [
    ["Sent", "\\Sent"],
    ["Drafts", "\\Drafts"],
    ["Archives", "\\Archive"],
  ]) {
    daemon.createMailbox(`INBOX/${name}`, {
      specialUseFlag,
      subscribed: true,
    });
  }
  daemon.createMailbox("INBOX/ExplicitTemplates", { subscribed: true });

  const account = MailServices.accounts.createAccount();
  const server = MailServices.accounts.createIncomingServer(
    "oscar",
    "localhost",
    "imap"
  );
  server.port = mockServer.port;
  server.password = "oscar";
  account.incomingServer = server;

  const identity = MailServices.accounts.createIdentity();
  account.addIdentity(identity);
  identity.fccFolderPickerMode = "0";
  identity.fccFolderURI = `${server.serverURI}/Sent`;
  identity.draftsFolderPickerMode = "0";
  identity.draftsFolderURI = `${server.serverURI}/Drafts`;
  identity.archiveEnabled = true;
  identity.archivesFolderPickerMode = "0";
  identity.archivesFolderURI = `${server.serverURI}/Archives`;
  identity.templatesFolderPickerMode = "0";
  identity.templatesFolderURI = `${server.serverURI}/Templates`;

  try {
    server.performBiff(false);
    server.QueryInterface(Ci.nsIImapIncomingServer);
    await TestUtils.waitForCondition(
      () => server.allConnectionsIdle,
      "waiting for initial IMAP discovery to finish"
    );

    for (const [attribute, _func, pickerMode, name] of folderTypes.slice(
      0,
      3
    )) {
      Assert.equal(
        identity[attribute],
        `${server.serverURI}/INBOX/${name}`,
        `${attribute} should contain the canonical namespace URI`
      );
      Assert.equal(
        identity[pickerMode],
        "0",
        `${pickerMode} should remain account-default`
      );
    }

    Assert.equal(
      identity.templatesFolderURI,
      `${server.serverURI}/Templates`,
      "a missing Templates folder cannot be repaired during discovery"
    );
    const templatesFolder = await identity.getOrCreateTemplatesFolderAsync();
    Assert.equal(
      templatesFolder.URI,
      `${server.serverURI}/INBOX/Templates`,
      "creating Templates should use the personal namespace"
    );
    Assert.equal(
      identity.templatesFolderURI,
      templatesFolder.URI,
      "creating Templates should immediately repair its preference"
    );
    Assert.equal(
      identity.templatesFolderPickerMode,
      "0",
      "creating Templates should preserve account-default mode"
    );
    Assert.equal(
      identity.getTemplatesFolder(),
      templatesFolder,
      "the non-creating lookup should find the canonical Templates folder"
    );

    Assert.equal(
      server.getFolderFromURI(server.rootFolder.URI),
      server.rootFolder,
      "the lookup should return the server root for its URI"
    );
    Assert.equal(
      server.getFolderFromURI(`${server.serverURI}/ExplicitTemplates`)?.URI,
      `${server.serverURI}/INBOX/ExplicitTemplates`,
      "the server lookup should resolve a personal namespace"
    );
    Assert.equal(
      server.getFolderFromURI(`${server.serverURI}/inbox/ExplicitTemplates`)
        ?.URI,
      `${server.serverURI}/INBOX/ExplicitTemplates`,
      "the server lookup should normalize only INBOX casing"
    );
    Assert.equal(
      server.getFolderFromURI(`${server.serverURI}/explicittemplates`),
      null,
      "the server lookup should preserve mailbox name case sensitivity"
    );
    const childrenBeforeLookup = server.rootFolder.descendants.length;
    for (const uri of [
      `${server.serverURI}/MissingFolder`,
      `${server.serverURI}/INBOX/MissingFolder`,
      "imap://other@localhost/INBOX/ExplicitTemplates",
    ]) {
      Assert.equal(
        server.getFolderFromURI(uri),
        null,
        "the server lookup should return null for unknown folders"
      );
    }
    Assert.equal(
      server.rootFolder.descendants.length,
      childrenBeforeLookup,
      "the server lookup should leave the folder tree unchanged"
    );

    const explicitIdentity = MailServices.accounts.createIdentity();
    account.addIdentity(explicitIdentity);
    explicitIdentity.templatesFolderPickerMode = "1";
    explicitIdentity.templatesFolderURI = `${server.serverURI}/ExplicitTemplates`;
    Assert.equal(
      explicitIdentity.getTemplatesFolder()?.URI,
      `${server.serverURI}/INBOX/ExplicitTemplates`,
      "the non-creating lookup should resolve the namespace"
    );
    Assert.equal(
      explicitIdentity.templatesFolderURI,
      `${server.serverURI}/ExplicitTemplates`,
      "the non-creating lookup should leave the preference unchanged"
    );
    explicitIdentity.reconcileSpecialFolders();
    Assert.equal(
      explicitIdentity.templatesFolderURI,
      `${server.serverURI}/INBOX/ExplicitTemplates`,
      "an explicit existing URI should also be canonicalized"
    );
    Assert.equal(
      explicitIdentity.templatesFolderPickerMode,
      "1",
      "canonicalization should preserve an explicit Other selection"
    );

    const caseSensitiveURI = `${server.serverURI}/explicittemplates`;
    explicitIdentity.templatesFolderURI = caseSensitiveURI;
    Assert.equal(
      explicitIdentity.getTemplatesFolder(),
      null,
      "an explicit IMAP URI must not match a differently cased mailbox"
    );
    Assert.equal(
      explicitIdentity.templatesFolderURI,
      caseSensitiveURI,
      "a missing explicit folder should keep its configured URI"
    );

    explicitIdentity.templatesFolderURI = `${server.serverURI}/inbox/ExplicitTemplates`;
    Assert.equal(
      explicitIdentity.getTemplatesFolder()?.URI,
      `${server.serverURI}/INBOX/ExplicitTemplates`,
      "the INBOX component should remain case-insensitive"
    );

    await TestUtils.waitForCondition(
      () => server.allConnectionsIdle,
      "waiting for IMAP connections to become idle"
    );
  } finally {
    MailServices.accounts.removeAccount(account, false);
    mockServer.close();
  }
});

/**
 * Discovery should flag configured folders even when their stored URIs already
 * match, without relying on placeholders or server-provided special-use flags.
 */
add_task(async function test_discoveryFlagsConfiguredFolders() {
  const mockServer = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.imap.plain
  );
  const account = MailServices.accounts.createAccount();
  const server = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  account.incomingServer = server;
  server.port = mockServer.port;
  server.password = "password";
  const identity = MailServices.accounts.createIdentity();
  account.addIdentity(identity);
  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    mockServer.close();
  });

  identity.archiveEnabled = true;
  for (const [attribute, _func, pickerMode, name] of folderTypes) {
    mockServer.daemon.createMailbox(`Custom${name}`, { subscribed: true });
    identity[pickerMode] = "1";
    identity.setCharAttribute(
      {
        fccFolderURI: "fcc_folder",
        draftsFolderURI: "draft_folder",
        archivesFolderURI: "archive_folder",
        templatesFolderURI: "stationery_folder",
      }[attribute],
      `${server.serverURI}/Custom${name}`
    );
  }
  server.performBiff(false);
  await TestUtils.waitForCondition(
    () => server.rootFolder.containsChildNamed("CustomTemplates"),
    "discovery should find the configured folders"
  );
  await TestUtils.waitForCondition(
    () => server.QueryInterface(Ci.nsIImapIncomingServer).allConnectionsIdle,
    "discovery should finish"
  );

  for (const [attribute, func, pickerMode, name, flag] of folderTypes) {
    const uri = `${server.serverURI}/Custom${name}`;
    const folder = server.getFolderFromURI(uri);
    Assert.ok(folder, "the configured folder should exist after discovery");
    Assert.ok(
      folder.getFlag(flag),
      "discovery should set the special-folder flag"
    );
    Assert.equal(
      identity[attribute],
      uri,
      "discovery should preserve the configured URI"
    );
    Assert.equal(
      identity[pickerMode],
      "1",
      "discovery should preserve the picker mode"
    );
    folder.clearFlag(flag);
    if (name == "Templates") {
      Assert.equal(
        identity.getTemplatesFolder(),
        folder,
        "the non-creating lookup should return the configured folder"
      );
      Assert.ok(
        !folder.getFlag(flag),
        "lookup should leave special-folder flags unchanged"
      );
    }
    Assert.equal(
      await identity[func](),
      folder,
      "destination preparation should return the configured folder"
    );
    Assert.ok(
      folder.getFlag(flag),
      "destination preparation should establish the special-folder flag"
    );
    folder.clearFlag(flag);
  }
  identity.reconcileSpecialFolders();
  for (const [_attribute, _func, _pickerMode, name, flag] of folderTypes) {
    Assert.ok(
      server
        .getFolderFromURI(`${server.serverURI}/Custom${name}`)
        .getFlag(flag),
      "reconciliation should restore flags without rewriting URIs"
    );
  }
});

/**
 * A server named by an account-default preference remains authoritative even
 * if the identity's own server has folders carrying the same special flags.
 */
add_task(async function testConfiguredServerTakesPriority() {
  await runFoldersSubtest("pop3", async (_type, sourceServer, identity) => {
    const sourceParent =
      await sourceServer.rootFolder.createSubfolderAsync("SourceSpecial");

    const targetAccount = MailServices.accounts.createAccount();
    const targetServer = MailServices.accounts.createIncomingServer(
      "juliet",
      "target.invalid",
      "pop3"
    );
    targetAccount.incomingServer = targetServer;
    const targetParent =
      await targetServer.rootFolder.createSubfolderAsync("TargetSpecial");

    try {
      for (const [attribute, func, pickerMode, name, flag] of folderTypes) {
        const sourceFolder = await sourceParent.createSubfolderAsync(name);
        sourceFolder.setFlag(flag);
        const targetFolder = await targetParent.createSubfolderAsync(name);
        targetFolder.setFlag(flag);

        identity[pickerMode] = "0";
        identity[attribute] = `${targetServer.serverURI}/Missing${name}`;

        if (attribute == "templatesFolderURI") {
          Assert.equal(
            identity.getTemplatesFolder(),
            targetFolder,
            "non-creating lookup should use the configured server"
          );
          Assert.equal(
            identity[attribute],
            `${targetServer.serverURI}/Missing${name}`,
            "non-creating lookup should not repair the preference"
          );
        }
        Assert.equal(
          await identity[func](),
          targetFolder,
          `${name} should be resolved on the configured server`
        );
        Assert.equal(
          identity[attribute],
          targetFolder.URI,
          `${attribute} should be repaired on the configured server`
        );
      }
    } finally {
      MailServices.accounts.removeAccount(targetAccount, false);
    }
  });
});

/**
 * An existing Local Folders special folder is not a reason to bypass folder
 * creation on the server selected by an account-default preference.
 */
add_task(async function testLocalFolderIsOnlyCreationFallback() {
  await runFoldersSubtest("pop3", async (_type, server, identity) => {
    const localAccount = MailServices.accounts.createLocalMailAccount();
    const localParent =
      await localAccount.incomingServer.rootFolder.createSubfolderAsync(
        "LocalSpecial"
      );

    try {
      for (const [attribute, func, pickerMode, name, flag] of folderTypes) {
        const localFolder = await localParent.createSubfolderAsync(name);
        localFolder.setFlag(flag);

        identity[pickerMode] = "0";
        identity[attribute] = `${server.serverURI}/Missing${name}`;
        const folder = await identity[func]();

        Assert.equal(
          folder.server,
          server,
          `${name} should be created on the configured server`
        );
        Assert.notEqual(
          folder,
          localFolder,
          `${name} should not reuse the Local Folders folder`
        );
      }
    } finally {
      MailServices.accounts.removeAccount(localAccount, false);
    }
  });
});

/**
 * Tests what happens if creating a folder on the remote server fails (in this
 * case because there is no remote server). Folders with the hard-coded names
 * and flags should be created as a subfolders of the Local Folders root.
 *
 * Note this test isn't run for POP3 because it doesn't create folders on a
 * remote server.
 */
async function subtestCreateErrorFallback(type) {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  const localServer = localAccount.incomingServer;
  const localRoot = localServer.rootFolder;

  const account = MailServices.accounts.createAccount();
  const server = MailServices.accounts.createIncomingServer(
    "romeo",
    "localhost",
    type
  );
  account.incomingServer = server;
  const identity = MailServices.accounts.createIdentity();
  account.addIdentity(identity);
  const root = server.rootFolder;
  // Cheeky hack to avoid an assertion on a not-really-initialised folder.
  root.setStringProperty("ewsId", "root");

  for (const [attribute, func, _pickerMode, name, flag] of folderTypes) {
    info(`Testing ${name} folder on a ${type} account`);

    Assert.ok(
      !localRoot.getFolderWithFlags(flag),
      `local folders should start with no ${name} folder`
    );
    Assert.ok(
      !root.getFolderWithFlags(flag),
      `${type} server should start with no ${name} folder`
    );
    Assert.equal(
      identity[attribute],
      null,
      `${attribute} should start with no value`
    );

    const folder = await identity[func]();
    Assert.equal(folder.parent?.URI, localRoot.URI);
    Assert.equal(folder.name, name);
    Assert.equal(folder.flags & flag, flag);
    Assert.equal(folder.URI, `${localServer.serverURI}/${name}`);
    Assert.equal(
      identity[attribute],
      folder.URI,
      `${attribute} should now return the folder's URI`
    );

    // Get the folders again, now that it exists and we've stored the URI,
    // to check getting existing folders works.
    Assert.equal(
      await identity[func](),
      folder,
      `${func} should return the same value as before`
    );
  }

  MailServices.accounts.removeAccount(account, false);
  MailServices.accounts.removeAccount(localAccount, false);
}

add_task(async function testCreateErrorFallbackIMAP() {
  await subtestCreateErrorFallback("imap");
});

add_task(async function testCreateErrorFallbackEWS() {
  await subtestCreateErrorFallback("ews");
});

add_task(async function testCreateErrorFallbackGraph() {
  await subtestCreateErrorFallback("graph");
});

/**
 * Tests that folders created on a deferred POP3 account are created on the
 * target server, not the deferred server.
 */
add_task(async function testDeferredPOP3() {
  // This target server is another POP3 server to avoid accidentally passing
  // if folder creation falls back to Local Folders.
  const targetAccount = MailServices.accounts.createAccount();
  const targetServer = MailServices.accounts.createIncomingServer(
    "mike",
    "localhost",
    "pop3"
  );
  targetAccount.incomingServer = targetServer;
  const targetRoot = targetServer.rootFolder;

  const sourceAccount = MailServices.accounts.createAccount();
  const sourceServer = MailServices.accounts.createIncomingServer(
    "victor",
    "localhost",
    "pop3"
  );
  sourceServer.QueryInterface(Ci.nsIPop3IncomingServer);
  sourceServer.deferredToAccount = targetAccount.key;
  sourceAccount.incomingServer = sourceServer;
  const sourceIdentity = MailServices.accounts.createIdentity();
  sourceAccount.addIdentity(sourceIdentity);
  const sourceRoot = sourceServer.rootFolder;

  for (const [attribute, func, _pickerMode, name, flag] of folderTypes) {
    info(`Testing ${name} folder on a deferred POP3 account`);

    Assert.ok(
      !targetRoot.getFolderWithFlags(flag),
      `target server should start with no ${name} folder`
    );
    Assert.ok(
      !sourceRoot.getFolderWithFlags(flag),
      `source server should start with no ${name} folder`
    );
    Assert.equal(
      sourceIdentity[attribute],
      null,
      `${attribute} should start with no value`
    );

    const folder = await sourceIdentity[func]();
    Assert.equal(folder.parent?.URI, targetRoot.URI);
    Assert.equal(folder.name, name);
    Assert.equal(folder.flags & flag, flag);
    Assert.equal(folder.URI, `${targetServer.serverURI}/${name}`);
    Assert.equal(
      sourceIdentity[attribute],
      folder.URI,
      `${attribute} should now return the folder's URI`
    );

    // Get the folders again, now that it exists and we've stored the URI,
    // to check getting existing folders works.
    Assert.equal(
      await sourceIdentity[func](),
      folder,
      `${func} should return the same value as before`
    );
  }

  MailServices.accounts.removeAccount(sourceAccount, false);
  MailServices.accounts.removeAccount(targetAccount, false);
});
