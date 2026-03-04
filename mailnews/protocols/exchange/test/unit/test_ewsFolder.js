/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

let ewsServer;
let incomingServer;

add_setup(async function () {
  [ewsServer, incomingServer] = setupBasicEwsTestServer({});
});

add_task(async function test_specialFolderNames() {
  // The two tests containing Unicode characters below are commented out because
  // our fake EWS server uses an nsIOutputStream to write text to the document,
  // but the XPCOM interface to nsIOutputStream only accepts XPCOM string input,
  // which in javascript is mapped to the regular javascript `string` type.
  // Since javascript strings are utf-16, this causes invalid bytes to be placed
  // in the XML document, which fails XML parsing. To fix this, we need to be
  // able to accept a byte array as input in `nsIOutputStream`.
  const folderNames = [
    "easypeasy",
    ".nameWithLeadingDot",
    "Input/Output",
    "COM1",
    //"グレープフルーツ",
    "/\\wibble/\\",
    // eslint-disable-next-line no-irregular-whitespace
    //"ZA̡͊͠͝LGΌ ISͮ̂҉̯͈͕̹̘̱ TO͇̹̺ͅƝ̴ȳ̳ TH̘Ë͖́̉ ͠P̯͍̭O̚​N̐Y̡ H̸̡̪̯ͨ͊̽̅̾̎Ȩ̬̩̾͛ͪ̈́̀́͘ ̶̧̨̱̹̭̯ͧ̾ͬC̷̙̲̝͖ͭ̏ͥͮ͟Oͮ͏̮̪̝͍M̲̖͊̒ͪͩͬ̚̚͜Ȇ̴̟̟͙̞ͩ͌͝S̨̥̫͎̭ͯ̿̔̀ͅ",
  ];

  for (const folderName of folderNames) {
    const folderId = folderName
      .split("")
      .map((c, i) => folderName.charCodeAt(i))
      .join("");
    ewsServer.appendRemoteFolder(
      new RemoteFolder(folderId, "root", folderName, folderId)
    );

    const rootFolder = incomingServer.rootFolder;
    await syncFolder(incomingServer, rootFolder);

    const folder = rootFolder.getChildNamed(folderName);
    Assert.ok(!!folder, `Folder "${folderName}" should exist.`);
    Assert.equal(
      folder.name,
      folderName,
      "Folder should have the correct name initially."
    );

    // Invalidate the folder lookup cache and configure a new EWS incoming server
    // to simulate a program restart.
    const folderLookupService = Cc[
      "@mozilla.org/mail/folder-lookup;1"
    ].getService(Ci.nsIFolderLookupService);
    folderLookupService.invalidateCache();
    const secondServer = localAccountUtils.create_incoming_server(
      "ews",
      ewsServer.port,
      "user",
      "password"
    );
    secondServer.setStringValue(
      "ews_url",
      `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
    );

    const secondRootFolder = secondServer.rootFolder;
    await syncFolder(secondServer, secondRootFolder);

    const folder2 = secondRootFolder.getChildNamed(folderName);
    Assert.ok(
      !!folder2,
      `Folder "${folderName}" should exist after "restart".`
    );
    Assert.equal(
      folder2.name,
      folderName,
      'Folder should have correct name after "restart".'
    );
  }
});
