/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test DBViewWrapper against virtual folders.
 *
 * Things we do not test and our rationalizations:
 * - threading stuff.  This is not the view wrapper's problem.  That is the db
 *   view's problem!  (We test it in the real folder to make sure we are telling
 *   it to do things correctly.)
 * - view flags.  Again, it's a db view issue once we're sure we set the bits.
 * - special view with threads.  same deal.
 *
 * We could test all these things, but my patch is way behind schedule...
 */

/* import-globals-from resources/viewWrapperTestUtils.js */
load("resources/viewWrapperTestUtils.js");
initViewWrapperTestUtils({ mode: "local" });

// -- single-folder backed virtual folder

/**
 * Make sure we open a virtual folder backed by a single underlying folder
 *  correctly; no constraints.
 */
add_task(async function test_virtual_folder_single_load_no_pred() {
  const viewWrapper = make_view_wrapper();

  const [[folderOne], setOne] = await messageInjection.makeFoldersWithSets(1, [
    {},
  ]);

  const virtFolder = messageInjection.makeVirtualFolder([folderOne], {});
  await view_open(viewWrapper, virtFolder);

  Assert.ok(viewWrapper.isVirtual);

  assert_equals(
    gMockViewWrapperListener.allMessagesLoadedEventCount,
    1,
    "Should only have received a single all messages loaded notification!"
  );

  verify_messages_in_view(setOne, viewWrapper);
  virtFolder.parent.propagateDelete(virtFolder, true);
});

/**
 * Make sure we open a virtual folder backed by a single underlying folder
 *  correctly; one constraint.
 */
add_task(async function test_virtual_folder_single_load_simple_pred() {
  const viewWrapper = make_view_wrapper();

  const [[folderOne], oneSubjFoo] = await messageInjection.makeFoldersWithSets(
    1,
    [{ subject: "foo" }, {}]
  );

  const virtFolder = messageInjection.makeVirtualFolder([folderOne], {
    subject: "foo",
  });
  await view_open(viewWrapper, virtFolder);

  verify_messages_in_view(oneSubjFoo, viewWrapper);
  virtFolder.parent.propagateDelete(virtFolder, true);
});

/**
 * Make sure we open a virtual folder backed by a single underlying folder
 *  correctly; two constraints ANDed together.
 */
add_task(async function test_virtual_folder_single_load_complex_pred() {
  const viewWrapper = make_view_wrapper();

  const whoBar = make_person_with_word_in_name("bar");

  const [[folderOne], , , oneBoth] = await messageInjection.makeFoldersWithSets(
    1,
    [{ subject: "foo" }, { from: whoBar }, { subject: "foo", from: whoBar }, {}]
  );

  const virtFolder = messageInjection.makeVirtualFolder(
    [folderOne],
    { subject: "foo", from: "bar" },
    /* and? */ true
  );
  await view_open(viewWrapper, virtFolder);

  verify_messages_in_view(oneBoth, viewWrapper);
  virtFolder.parent.propagateDelete(virtFolder, true);
});

/**
 * Open a single-backed virtual folder, verify, open another single-backed
 *  virtual folder, verify.  We are testing our ability to change folders
 *  without exploding.
 */
add_task(async function test_virtual_folder_single_load_after_load() {
  const viewWrapper = make_view_wrapper();

  const [[folderOne], oneSubjFoo] = await messageInjection.makeFoldersWithSets(
    1,
    [{ subject: "foo" }, {}]
  );
  const virtOne = messageInjection.makeVirtualFolder([folderOne], {
    subject: "foo",
  });
  await view_open(viewWrapper, virtOne);
  verify_messages_in_view([oneSubjFoo], viewWrapper);

  // use "bar" instead of "foo" to make sure constraints are properly changing
  const [[folderTwo], twoSubjBar] = await messageInjection.makeFoldersWithSets(
    1,
    [{ subject: "bar" }, {}]
  );
  const virtTwo = messageInjection.makeVirtualFolder([folderTwo], {
    subject: "bar",
  });
  await view_open(viewWrapper, virtTwo);
  verify_messages_in_view([twoSubjBar], viewWrapper);
  virtOne.parent.propagateDelete(virtOne, true);
  virtTwo.parent.propagateDelete(virtTwo, true);
});

// -- multi-folder backed virtual folder

/**
 * Make sure we open a virtual folder backed by multiple underlying folders
 *  correctly; no constraints.
 */
add_task(async function test_virtual_folder_multi_load_no_pred() {
  const viewWrapper = make_view_wrapper();

  const [[folderOne], setOne] = await messageInjection.makeFoldersWithSets(1, [
    {},
  ]);
  const [[folderTwo], setTwo] = await messageInjection.makeFoldersWithSets(1, [
    {},
  ]);

  const virtFolder = messageInjection.makeVirtualFolder(
    [folderOne, folderTwo],
    {}
  );
  await view_open(viewWrapper, virtFolder);

  verify_messages_in_view([setOne, setTwo], viewWrapper);
  virtFolder.parent.propagateDelete(virtFolder, true);
});

/**
 * Make sure the sort order of a virtual folder backed by multiple underlying
 * folders is persistent.
 */
add_task(async function test_virtual_folder_multi_sortorder_persistence() {
  const viewWrapper = make_view_wrapper();

  const [[folderOne], setOne] = await messageInjection.makeFoldersWithSets(1, [
    {},
  ]);
  const [[folderTwo], setTwo] = await messageInjection.makeFoldersWithSets(1, [
    {},
  ]);

  const virtFolder = messageInjection.makeVirtualFolder(
    [folderOne, folderTwo],
    {}
  );
  await view_open(viewWrapper, virtFolder);

  verify_messages_in_view([setOne, setTwo], viewWrapper);
  viewWrapper.showThreaded = true;
  viewWrapper.sort("subjectCol", Ci.nsMsgViewSortOrder.ascending);

  viewWrapper.close();
  await view_open(viewWrapper, virtFolder);
  assert_equals(
    viewWrapper.primarySortType,
    Ci.nsMsgViewSortType.bySubject,
    "should have remembered sort type."
  );
  assert_equals(
    viewWrapper.primarySortOrder,
    Ci.nsMsgViewSortOrder.ascending,
    "should have remembered sort order."
  );
  virtFolder.parent.propagateDelete(virtFolder, true);
});

/**
 * Make sure we open a virtual folder backed by multiple underlying folders
 *  correctly; one constraint.
 */
add_task(async function test_virtual_folder_multi_load_simple_pred() {
  const viewWrapper = make_view_wrapper();

  const [[folderOne], oneSubjFoo] = await messageInjection.makeFoldersWithSets(
    1,
    [{ subject: "foo" }, {}]
  );
  const [[folderTwo], twoSubjFoo] = await messageInjection.makeFoldersWithSets(
    1,
    [{ subject: "foo" }, {}]
  );

  const virtFolder = messageInjection.makeVirtualFolder(
    [folderOne, folderTwo],
    {
      subject: "foo",
    }
  );
  await view_open(viewWrapper, virtFolder);

  verify_messages_in_view([oneSubjFoo, twoSubjFoo], viewWrapper);
  virtFolder.parent.propagateDelete(virtFolder, true);
});

/**
 * Make sure we open a virtual folder backed by multiple underlying folders
 *  correctly; two constraints ANDed together.
 */
add_task(async function test_virtual_folder_multi_load_complex_pred() {
  const viewWrapper = make_view_wrapper();

  const whoBar = make_person_with_word_in_name("bar");

  const [[folderOne], , , oneBoth] = await messageInjection.makeFoldersWithSets(
    1,
    [{ subject: "foo" }, { from: whoBar }, { subject: "foo", from: whoBar }, {}]
  );
  const [[folderTwo], , , twoBoth] = await messageInjection.makeFoldersWithSets(
    1,
    [{ subject: "foo" }, { from: whoBar }, { subject: "foo", from: whoBar }, {}]
  );

  const virtFolder = messageInjection.makeVirtualFolder(
    [folderOne, folderTwo],
    { subject: "foo", from: "bar" },
    /* and? */ true
  );
  await view_open(viewWrapper, virtFolder);

  verify_messages_in_view([oneBoth, twoBoth], viewWrapper);
  virtFolder.parent.propagateDelete(virtFolder, true);
});

add_task(
  async function test_virtual_folder_multi_load_alotta_folders_no_pred() {
    const viewWrapper = make_view_wrapper();

    const folderCount = 4;
    const messageCount = 64;

    const [folders, setOne] = await messageInjection.makeFoldersWithSets(
      folderCount,
      [{ count: messageCount }]
    );

    const virtFolder = messageInjection.makeVirtualFolder(folders, {});
    await view_open(viewWrapper, virtFolder);

    verify_messages_in_view([setOne], viewWrapper);
    virtFolder.parent.propagateDelete(virtFolder, true);
  }
);

add_task(
  async function test_virtual_folder_multi_load_alotta_folders_simple_pred() {
    const viewWrapper = make_view_wrapper();

    const folderCount = 16;
    const messageCount = 256;

    const [folders, setOne] = await messageInjection.makeFoldersWithSets(
      folderCount,
      [{ subject: "foo", count: messageCount }]
    );

    const virtFolder = messageInjection.makeVirtualFolder(folders, {
      subject: "foo",
    });
    await view_open(viewWrapper, virtFolder);

    verify_messages_in_view([setOne], viewWrapper);
    virtFolder.parent.propagateDelete(virtFolder, true);
  }
);

/**
 * Make sure that opening a virtual folder backed by multiple real folders, then
 *  opening another virtual folder of the same variety works without explosions.
 */
add_task(async function test_virtual_folder_multi_load_after_load() {
  const viewWrapper = make_view_wrapper();

  const [foldersOne, oneSubjFoo] = await messageInjection.makeFoldersWithSets(
    2,
    [{ subject: "foo" }, {}]
  );
  const virtOne = messageInjection.makeVirtualFolder(foldersOne, {
    subject: "foo",
  });
  await view_open(viewWrapper, virtOne);
  verify_messages_in_view([oneSubjFoo], viewWrapper);

  // use "bar" instead of "foo" to make sure constraints are properly changing
  const [foldersTwo, twoSubjBar] = await messageInjection.makeFoldersWithSets(
    3,
    [{ subject: "bar" }, {}]
  );
  const virtTwo = messageInjection.makeVirtualFolder(foldersTwo, {
    subject: "bar",
  });
  await view_open(viewWrapper, virtTwo);
  verify_messages_in_view([twoSubjBar], viewWrapper);

  await view_open(viewWrapper, virtOne);
  verify_messages_in_view([oneSubjFoo], viewWrapper);
  virtOne.parent.propagateDelete(virtOne, true);
  virtTwo.parent.propagateDelete(virtTwo, true);
});

// -- mixture of single-backed and multi-backed

/**
 * Make sure that opening a virtual folder backed by a single real folder, then
 *  a multi-backed one, then the single-backed one again doesn't explode.
 *
 * This is just test_virtual_folder_multi_load_after_load with foldersOne told
 *  to create just a single folder.
 */
add_task(async function test_virtual_folder_combo_load_after_load() {
  const viewWrapper = make_view_wrapper();

  const [foldersOne, oneSubjFoo] = await messageInjection.makeFoldersWithSets(
    1,
    [{ subject: "foo" }, {}]
  );
  const virtOne = messageInjection.makeVirtualFolder(foldersOne, {
    subject: "foo",
  });
  await view_open(viewWrapper, virtOne);
  verify_messages_in_view([oneSubjFoo], viewWrapper);

  // use "bar" instead of "foo" to make sure constraints are properly changing
  const [foldersTwo, twoSubjBar] = await messageInjection.makeFoldersWithSets(
    3,
    [{ subject: "bar" }, {}]
  );
  const virtTwo = messageInjection.makeVirtualFolder(foldersTwo, {
    subject: "bar",
  });
  await view_open(viewWrapper, virtTwo);
  verify_messages_in_view([twoSubjBar], viewWrapper);

  await view_open(viewWrapper, virtOne);
  verify_messages_in_view([oneSubjFoo], viewWrapper);
  virtOne.parent.propagateDelete(virtOne, true);
  virtTwo.parent.propagateDelete(virtTwo, true);
});

// -- ignore things we should ignore

/**
 * Make sure that if a server is listed in a virtual folder's search Uris that
 *  it does not get into our list of _underlyingFolders.
 */
add_task(async function test_virtual_folder_filters_out_servers() {
  const viewWrapper = make_view_wrapper();

  const [folders] = await messageInjection.makeFoldersWithSets(2, []);
  folders.push(folders[0].rootFolder);
  const virtFolder = messageInjection.makeVirtualFolder(folders, {});
  await view_open(viewWrapper, virtFolder);

  assert_equals(
    viewWrapper._underlyingFolders.length,
    2,
    "Server folder should have been filtered out."
  );
  virtFolder.parent.propagateDelete(virtFolder, true);
});

// -- rare/edge cases!

/**
 * Verify that if one of the folders backing our virtual folder is deleted that
 *  we do not explode.  Then verify that if we remove the rest of them that the
 *  view wrapper closes itself.
 */
add_task(async function test_virtual_folder_underlying_folder_deleted() {
  const viewWrapper = make_view_wrapper();

  const [[folderOne]] = await messageInjection.makeFoldersWithSets(1, [
    { subject: "foo" },
    {},
  ]);
  const [[folderTwo], twoSubjFoo] = await messageInjection.makeFoldersWithSets(
    1,
    [{ subject: "foo" }, {}]
  );

  const virtFolder = messageInjection.makeVirtualFolder(
    [folderOne, folderTwo],
    {
      subject: "foo",
    }
  );
  await view_open(viewWrapper, virtFolder);

  // this triggers the search (under the view's hood), so it's async
  await delete_folder(folderOne, viewWrapper);

  // only messages from the surviving folder should be present
  verify_messages_in_view([twoSubjFoo], viewWrapper);

  // this one is not async though, because we are expecting to close the wrapper
  //  and ignore the view entirely, no resolving action.
  delete_folder(folderTwo);

  // now the view wrapper should have closed itself.
  Assert.equal(null, viewWrapper.displayedFolder);
  // This fails because virtFolder.parent is null, not sure why
  // virtFolder.parent.propagateDelete(virtFolder, true);
});

/* ===== Virtual Folder, Mail Views ===== */

/*
 * We do not need to test all of the mail view permutations, realFolder
 *  already did that.  We just need to make sure it works at all.
 */

add_task(
  async function test_virtual_folder_mail_views_unread_with_one_folder() {
    const viewWrapper = make_view_wrapper();

    const [folders, fooOne, fooTwo] =
      await messageInjection.makeFoldersWithSets(1, [
        { subject: "foo 1" },
        { subject: "foo 2" },
        {},
        {},
      ]);
    const virtFolder = messageInjection.makeVirtualFolder(folders, {
      subject: "foo",
    });

    // everything is unread to start with!
    await view_open(viewWrapper, virtFolder);
    await view_set_mail_view(viewWrapper, MailViewConstants.kViewItemUnread);
    verify_messages_in_view([fooOne, fooTwo], viewWrapper);

    // add some more things (unread!), make sure they appear.
    const [fooThree] = await messageInjection.makeNewSetsInFolders(folders, [
      { subject: "foo 3" },
      {},
    ]);
    verify_messages_in_view([fooOne, fooTwo, fooThree], viewWrapper);

    // make some things read, make sure they disappear. (after a refresh)
    fooTwo.setRead(true);
    await view_refresh(viewWrapper);
    verify_messages_in_view([fooOne, fooThree], viewWrapper);

    // make those things un-read again.
    fooTwo.setRead(false);
    // I thought this was a quick search limitation, but XFVF needs it to, at
    //  least for the unread case.
    await view_refresh(viewWrapper);
    verify_messages_in_view([fooOne, fooTwo, fooThree], viewWrapper);
    virtFolder.parent.propagateDelete(virtFolder, true);
  }
);

// -- mail views

add_task(
  async function test_virtual_folder_mail_views_unread_with_four_folders() {
    const viewWrapper = make_view_wrapper();

    const [folders, fooOne, fooTwo] =
      await messageInjection.makeFoldersWithSets(4, [
        { subject: "foo 1" },
        { subject: "foo 2" },
        {},
        {},
      ]);
    const virtFolder = messageInjection.makeVirtualFolder(folders, {
      subject: "foo",
    });

    // everything is unread to start with!
    await view_open(viewWrapper, virtFolder);
    await view_set_mail_view(viewWrapper, MailViewConstants.kViewItemUnread);
    verify_messages_in_view([fooOne, fooTwo], viewWrapper);

    // add some more things (unread!), make sure they appear.
    const [fooThree] = await messageInjection.makeNewSetsInFolders(folders, [
      { subject: "foo 3" },
      {},
    ]);
    verify_messages_in_view([fooOne, fooTwo, fooThree], viewWrapper);

    // make some things read, make sure they disappear. (after a refresh)
    fooTwo.setRead(true);
    await view_refresh(viewWrapper);
    verify_messages_in_view([fooOne, fooThree], viewWrapper);

    // make those things un-read again.
    fooTwo.setRead(false);
    // I thought this was a quick search limitation, but XFVF needs it to, at
    //  least for the unread case.
    await view_refresh(viewWrapper);
    verify_messages_in_view([fooOne, fooTwo, fooThree], viewWrapper);
    virtFolder.parent.propagateDelete(virtFolder, true);
  }
);

// This tests that clearing the new messages in a folder also clears the
// new flag on saved search folders based on the real folder. This could be a
// core view test, or a mozmill test, but I think the view wrapper stuff
// is involved in some of the issues here, so this is a compromise.
add_task(async function test_virtual_folder_mail_new_handling() {
  const viewWrapper = make_view_wrapper();

  const [folders] = await messageInjection.makeFoldersWithSets(1, [
    { subject: "foo 1" },
    { subject: "foo 2" },
  ]);
  const folder = folders[0];
  const virtFolder = messageInjection.makeVirtualFolder(folders, {
    subject: "foo",
  });

  await view_open(viewWrapper, folder);

  await messageInjection.makeNewSetsInFolders(folders, [
    { subject: "foo 3" },
    {},
  ]);

  if (!virtFolder.hasNewMessages) {
    do_throw("saved search should have new messages!");
  }

  if (!folder.hasNewMessages) {
    do_throw("folder should have new messages!");
  }

  viewWrapper.close();
  folder.msgDatabase = null;
  folder.clearNewMessages();
  if (virtFolder.hasNewMessages) {
    do_throw("saved search should not have new messages!");
  }
  virtFolder.parent.propagateDelete(virtFolder, true);
});
