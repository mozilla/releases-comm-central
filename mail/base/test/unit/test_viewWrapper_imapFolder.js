/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test DBViewWrapper against a single imap folder.  Try and test all the
 *  features we can without having a fake newsgroup.  (Some features are
 *  newsgroup specific.)
 */

/* import-globals-from resources/viewWrapperTestUtils.js */
load("resources/viewWrapperTestUtils.js");
initViewWrapperTestUtils({ mode: "imap", offline: false });

/**
 * Create an empty folder, inject messages into it without triggering an
 *  updateFolder, sanity check that we believe there are no messages in the
 *  folder, then enter, making sure we immediately enter and that the view
 *  properly updates to reflect there being the right set of messages.
 * (It will fail to update if the db change listener ended up detaching itself
 *  and not reattaching correctly when the updateFolder completes.)
 */
add_task(
  async function test_enter_imap_folder_requiring_update_folder_immediately() {
    // - create the folder and wait for the IMAP op to complete
    const folderHandle = await messageInjection.makeEmptyFolder();
    const msgFolder = messageInjection.getRealInjectionFolder(folderHandle);

    // - add the messages
    const [msgSet] = await messageInjection.makeNewSetsInFolders(
      [folderHandle],
      [{ count: 1 }],
      true
    );

    const viewWrapper = make_view_wrapper();

    // - make sure we don't know about the message!
    Assert.equal(msgFolder.getTotalMessages(false), 0);

    // - sync open the folder, verify we claim we entered, and make sure it has
    //  nothing in it!
    viewWrapper.listener.pendingLoad = true;
    viewWrapper.open(msgFolder);
    Assert.ok(viewWrapper._enteredFolder);
    verify_empty_view(viewWrapper);

    // Wait for all the messages to load.
    await gMockViewWrapperListener.promise;
    gMockViewWrapperListener.resetPromise();

    // - make sure the view sees the message though...
    verify_messages_in_view(msgSet, viewWrapper);
  }
);
