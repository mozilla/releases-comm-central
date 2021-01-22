/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This tests that nsIFolderLookupService works according to specification.
 */
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var kRootURI = "mailbox://nobody@Local%20Folders";

add_task(async function test_fls_basics() {
  let fls = Cc["@mozilla.org/mail/folder-lookup;1"].getService(
    Ci.nsIFolderLookupService
  );

  // Make sure that the local mail account exists.
  localAccountUtils.loadLocalMailAccount();

  // There should exist an inbox.
  Assert.equal(
    fls.getFolderForURL(kRootURI + "/Inbox"),
    localAccountUtils.inboxFolder
  );

  // Can we get the root folder?
  let root = localAccountUtils.rootFolder;
  Assert.equal(fls.getFolderForURL(kRootURI), root);

  // The child folder Child doesn't exist yet... make sure that fls doesn't
  // return it yet
  Assert.equal(fls.getFolderForURL(kRootURI + "/Child"), null);

  // Create the Child folder, and test we can find it.
  // (NOTE: createSubFolder() can be async for IMAP folders. But for now
  // we know we're using local folders and it'll happen right away).
  root.createSubfolder("Child", null);
  Assert.equal(
    fls.getFolderForURL(kRootURI + "/Child"),
    root.getChildNamed("Child")
  );

  // Try it again... it should load from cache this time.
  Assert.equal(
    fls.getFolderForURL(kRootURI + "/Child"),
    root.getChildNamed("Child")
  );

  // Now delete the folder; we should be unable to find it
  root.propagateDelete(root.getChildNamed("Child"), true, null);
  Assert.equal(fls.getFolderForURL(kRootURI + "/Child"), null);

  Assert.equal(fls.getFolderForURL(kRootURI + "/"), null);
  Assert.equal(
    fls.getFolderForURL("mailbox://idonotexist@Local%20Folders"),
    null
  );
});

add_task(async function test_unicode_uris() {
  let fls = Cc["@mozilla.org/mail/folder-lookup;1"].getService(
    Ci.nsIFolderLookupService
  );
  localAccountUtils.loadLocalMailAccount();
  let root = localAccountUtils.rootFolder;

  // Create a folder with non-ASCII characters.
  // Unicode abuse - dotless letter i and a metal umlaut over the n.
  let tapName = "Sp\u0131n\u0308al Tap";
  root.createSubfolder(tapName, null);

  // Make sure we can find it.
  // (URI is percent-escaped utf-8)
  let tapNameEscaped = "Sp%C4%B1n%CC%88al%20Tap";
  if (AppConstants.platform == "win") {
    // For !ConvertibleToNative(), folder name is hashed on Windows.
    tapNameEscaped = "a2d874f7";
  }
  let tapURI = kRootURI + "/" + tapNameEscaped;
  let tap = fls.getFolderForURL(tapURI);
  Assert.equal(tap.URI, tapURI);
});
