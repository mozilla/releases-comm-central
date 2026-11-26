/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that virtualFolders.dat entries aren't lost when the storage of a
 * server isn't available, e.g. because it's on a drive that isn't connected.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

const UNLOADED_ENTRIES = [
  `uri=mailbox://nobody@Local%20Folders/vf-inbox
scope=mailbox://nobody@Local%20Folders/Inbox
terms=ALL
searchOnline=false
`,
  `uri=mailbox://nobody@Local%20Folders/%24label1
searchFolderFlag=1000
scope=*
terms=AND (tag,contains,$label1)
searchOnline=false
`,
];

const LOADED_ENTRY = `uri=mailbox://nobody@other.invalid/vf-other
scope=mailbox://nobody@Local%20Folders/Inbox|mailbox://nobody@other.invalid/Scoped|mailbox://nobody@other.invalid/non-existent
terms=ALL
searchOnline=false
`;

let datPath;
let otherServer;

function splitEntries(data) {
  return data
    .split(/^(?=uri=)/m)
    .filter(entry => entry.startsWith("uri="))
    .sort();
}

add_task(async function test_unavailableStorage() {
  const profile = do_get_profile();
  datPath = PathUtils.join(profile.path, "virtualFolders.dat");
  await IOUtils.writeUTF8(
    datPath,
    `version=1\n${UNLOADED_ENTRIES.join("")}${LOADED_ENTRY}`
  );

  const localServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "Local Folders",
    "none"
  );
  MailServices.accounts.createAccount().incomingServer = localServer;
  MailServices.accounts.localFoldersServer = localServer;

  otherServer = MailServices.accounts.createIncomingServer(
    "nobody",
    "other.invalid",
    "none"
  );
  MailServices.accounts.createAccount().incomingServer = otherServer;
  const otherDir = otherServer.localPath;
  otherDir.append("vf-other");
  otherDir.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
  otherServer.rootFolder.createSubfolder("Scoped", null);

  // Point Local Folders below a regular file, so its directory can't exist or
  // be created, like a drive that isn't connected.
  const blocker = PathUtils.join(profile.path, "blocker");
  await IOUtils.writeUTF8(blocker, "");
  Services.prefs.setStringPref(
    `mail.server.${localServer.key}.directory`,
    PathUtils.join(blocker, "Local Folders")
  );
  Services.prefs.setStringPref(
    `mail.server.${localServer.key}.directory-rel`,
    ""
  );

  MailServices.accounts.loadVirtualFolders();

  const otherVirtualFolder = otherServer.rootFolder.getChildNamed("vf-other");
  Assert.equal(
    otherVirtualFolder.msgDatabase.dBFolderInfo.getCharProperty(
      "searchFolderUri"
    ),
    "mailbox://nobody@other.invalid/Scoped",
    "search scope in use should only contain the available folders"
  );

  MailServices.accounts.saveVirtualFolders();
  const saved = await IOUtils.readUTF8(datPath);
  Assert.ok(saved.startsWith("version=1\n"), "version should be kept");
  Assert.deepEqual(
    splitEntries(saved),
    [
      ...UNLOADED_ENTRIES,
      `uri=mailbox://nobody@other.invalid/vf-other
scope=mailbox://nobody@other.invalid/Scoped|mailbox://nobody@Local%20Folders/Inbox
terms=ALL
searchOnline=false
`,
    ].sort(),
    "entries for unavailable storage should be kept, and non-existent folders should be dropped"
  );
});

add_task(async function test_renameVirtualFolder() {
  const virtualFolder = otherServer.rootFolder.getChildNamed("vf-other");
  virtualFolder.rename("vf-renamed", null);

  const saved = await IOUtils.readUTF8(datPath);
  Assert.deepEqual(
    splitEntries(saved),
    [
      ...UNLOADED_ENTRIES,
      `uri=mailbox://nobody@other.invalid/vf-renamed
scope=mailbox://nobody@other.invalid/Scoped|mailbox://nobody@Local%20Folders/Inbox
terms=ALL
searchOnline=false
`,
    ].sort(),
    "unavailable scope folders should be kept when renaming"
  );
});

add_task(async function test_removeLastAvailableScopeFolder() {
  const root = otherServer.rootFolder;
  root.propagateDelete(root.getChildNamed("Scoped"), true);

  Assert.ok(
    root.getChildNamed("vf-renamed"),
    "virtual folder with unavailable scope folders should not be deleted"
  );
  MailServices.accounts.saveVirtualFolders();
  const saved = await IOUtils.readUTF8(datPath);
  Assert.deepEqual(
    splitEntries(saved),
    [
      ...UNLOADED_ENTRIES,
      `uri=mailbox://nobody@other.invalid/vf-renamed
scope=mailbox://nobody@Local%20Folders/Inbox
terms=ALL
searchOnline=false
`,
    ].sort(),
    "unavailable scope folders should be kept when the available ones are removed"
  );
});

add_task(async function test_editWithoutChangingScope() {
  const wrapper = VirtualFolderHelper.wrapVirtualFolder(
    otherServer.rootFolder.getChildNamed("vf-renamed")
  );
  const { searchTerms, searchFolders } = wrapper;
  wrapper.searchTerms = searchTerms;
  wrapper.searchFolders = searchFolders;

  MailServices.accounts.saveVirtualFolders();
  const saved = await IOUtils.readUTF8(datPath);
  Assert.deepEqual(
    splitEntries(saved),
    [
      ...UNLOADED_ENTRIES,
      `uri=mailbox://nobody@other.invalid/vf-renamed
scope=mailbox://nobody@Local%20Folders/Inbox
terms=ALL
searchOnline=false
`,
    ].sort(),
    "unavailable scope folders should be kept when the scope isn't changed"
  );
});

add_task(async function test_addScopeFolder() {
  const root = otherServer.rootFolder;
  root.createSubfolder("Work", null);
  root.createSubfolder("Archive", null);
  const wrapper = VirtualFolderHelper.wrapVirtualFolder(
    root.getChildNamed("vf-renamed")
  );
  for (const name of ["Work", "Archive"]) {
    wrapper.searchFolders = [
      ...wrapper.searchFolders,
      root.getChildNamed(name),
    ];
  }

  MailServices.accounts.saveVirtualFolders();
  const saved = await IOUtils.readUTF8(datPath);
  Assert.deepEqual(
    splitEntries(saved),
    [
      ...UNLOADED_ENTRIES,
      `uri=mailbox://nobody@other.invalid/vf-renamed
scope=mailbox://nobody@other.invalid/Work|mailbox://nobody@other.invalid/Archive|mailbox://nobody@Local%20Folders/Inbox
terms=ALL
searchOnline=false
`,
    ].sort(),
    "unavailable scope folders should be kept when only adding folders"
  );
});

add_task(async function test_changeScope() {
  const root = otherServer.rootFolder;
  const wrapper = VirtualFolderHelper.wrapVirtualFolder(
    root.getChildNamed("vf-renamed")
  );
  wrapper.searchFolders = [root.getChildNamed("Archive")];

  MailServices.accounts.saveVirtualFolders();
  const saved = await IOUtils.readUTF8(datPath);
  Assert.deepEqual(
    splitEntries(saved),
    [
      ...UNLOADED_ENTRIES,
      `uri=mailbox://nobody@other.invalid/vf-renamed
scope=mailbox://nobody@other.invalid/Archive
terms=ALL
searchOnline=false
`,
    ].sort(),
    "unavailable scope folders should be dropped when the scope is changed"
  );
});
