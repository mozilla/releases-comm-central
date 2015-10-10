/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This tests that nsIFolderLookupService works acording to specification.
 */
Components.utils.import("resource:///modules/mailServices.js");

var kRootURI = "mailbox://nobody@Local%20Folders";

function run_test() {
  let fls = Components.classes["@mozilla.org/mail/folder-lookup;1"]
                      .getService(Components.interfaces.nsIFolderLookupService);

  // Make sure that the local mail account exists.
  localAccountUtils.loadLocalMailAccount();

  // There should exist an inbox.
  do_check_eq(fls.getFolderForURL(kRootURI + "/Inbox"),
    localAccountUtils.inboxFolder);

  // Can we get the root folder?
  let root = localAccountUtils.rootFolder;
  do_check_eq(fls.getFolderForURL(kRootURI), root);

  // The child folder Child doesn't exist yet... make sure that fls doesn't
  // return it yet
  do_check_eq(fls.getFolderForURL(kRootURI + "/Child"), null);

  // Create the folder, and then it should exist.
  root.createSubfolder("Child", null);
  do_check_eq(fls.getFolderForURL(kRootURI + "/Child"),
    root.getChildNamed("Child"));

  // Try it again... it should load from cache this time.
  do_check_eq(fls.getFolderForURL(kRootURI + "/Child"),
    root.getChildNamed("Child"));

  // Now delete the folder; we should be unable to find it
  root.propagateDelete(root.getChildNamed("Child"), true, null);
  do_check_eq(fls.getFolderForURL(kRootURI + "/Child"), null);

  do_check_eq(fls.getFolderForURL(kRootURI + "/"), null);
  do_check_eq(fls.getFolderForURL("mailbox://idonotexist@Local%20Folders"),
    null);
}
