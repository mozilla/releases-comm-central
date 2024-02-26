/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test DBViewWrapper against a single local folder.  Try and test all the
 *  features we can without having a fake newsgroup.  (Some features are
 *  newsgroup specific.)
 */

/* import-globals-from resources/viewWrapperTestUtils.js */
load("resources/viewWrapperTestUtils.js");
initViewWrapperTestUtils({ mode: "local" });

var { SyntheticMessageSet } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

/* ===== Real Folder, no features ===== */

/**
 * Open a pre-populated real folder, make sure all the messages show up.
 */
add_task(async function test_real_folder_load() {
  const viewWrapper = make_view_wrapper();
  const [[msgFolder], msgSet] = await messageInjection.makeFoldersWithSets(1, [
    { count: 1 },
  ]);
  viewWrapper.open(msgFolder);
  verify_messages_in_view(msgSet, viewWrapper);
  Assert.ok("test ran to completion");
});

/**
 * Open a real folder, add some messages, make sure they show up, remove some
 *  messages, make sure they go away.
 */
add_task(async function test_real_folder_update() {
  const viewWrapper = make_view_wrapper();

  // start with an empty folder
  const msgFolder = await messageInjection.makeEmptyFolder();
  viewWrapper.open(msgFolder);
  verify_empty_view(viewWrapper);

  // add messages (none -> some)
  const [setOne] = await messageInjection.makeNewSetsInFolders(
    [msgFolder],
    [{}]
  );
  verify_messages_in_view(setOne, viewWrapper);

  // add more messages! (some -> more)
  const [setTwo] = await messageInjection.makeNewSetsInFolders(
    [msgFolder],
    [{}]
  );
  verify_messages_in_view([setOne, setTwo], viewWrapper);

  // remove the first set of messages (more -> some)
  await messageInjection.trashMessages(setOne);
  verify_messages_in_view(setTwo, viewWrapper);

  // remove the second set of messages (some -> none)
  await messageInjection.trashMessages(setTwo);
  verify_empty_view(viewWrapper);
});

/**
 * Open a real folder, verify, open another folder, verify.  We are testing
 *  ability to change folders without exploding.
 */
add_task(async function test_real_folder_load_after_real_folder_load() {
  const viewWrapper = make_view_wrapper();

  const [[folderOne], setOne] = await messageInjection.makeFoldersWithSets(1, [
    {},
  ]);
  viewWrapper.open(folderOne);
  verify_messages_in_view(setOne, viewWrapper);

  const [[folderTwo], setTwo] = await messageInjection.makeFoldersWithSets(1, [
    {},
  ]);
  viewWrapper.open(folderTwo);
  verify_messages_in_view(setTwo, viewWrapper);
});

/* ===== Real Folder, Threading Modes ==== */
/*
 * The first three tests that verify setting the threading flags has the
 *  expected outcome do this by creating the view from scratch with the view
 *  flags applied.  The view threading persistence test handles making sure
 *  that changes in threading on-the-fly work from the perspective of the
 *  bits and what not.  None of these are tests of the view implementation's
 *  threading/grouping logic, just sanity checking that we are doing the right
 *  thing.
 */

add_task(async function test_real_folder_threading_unthreaded() {
  const viewWrapper = make_view_wrapper();
  const folder = await messageInjection.makeEmptyFolder();

  // create a single maximally nested thread.
  const count = 10;
  const messageSet = new SyntheticMessageSet(
    gMessageScenarioFactory.directReply(count)
  );
  await messageInjection.addSetsToFolders([folder], [messageSet]);

  // verify that we are not threaded (or grouped)
  viewWrapper.open(folder);
  viewWrapper.beginViewUpdate();
  viewWrapper.showUnthreaded = true;
  // whitebox test view flags (we've gotten them wrong before...)
  assert_bit_not_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "View threaded bit should not be set."
  );
  assert_bit_not_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kGroupBySort,
    "View group-by-sort bit should not be set."
  );
  viewWrapper.endViewUpdate();
  verify_view_level_histogram({ 0: count }, viewWrapper);
});

add_task(async function test_real_folder_threading_threaded() {
  const viewWrapper = make_view_wrapper();
  const folder = await messageInjection.makeEmptyFolder();

  // create a single maximally nested thread.
  const count = 10;
  const messageSet = new SyntheticMessageSet(
    gMessageScenarioFactory.directReply(count)
  );
  await messageInjection.addSetsToFolders([folder], [messageSet]);

  // verify that we are threaded (in such a way that we can't be grouped)
  viewWrapper.open(folder);
  viewWrapper.beginViewUpdate();
  viewWrapper.showThreaded = true;
  // whitebox test view flags (we've gotten them wrong before...)
  assert_bit_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "View threaded bit should be set."
  );
  assert_bit_not_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kGroupBySort,
    "View group-by-sort bit should not be set."
  );
  // expand everything so our logic below works.
  view_expand_all(viewWrapper);
  viewWrapper.endViewUpdate();
  // blackbox test view flags: make sure IsContainer is true for the root
  verify_view_row_at_index_is_container(viewWrapper, 0);
  // do the histogram test to verify threading...
  const expectedHisto = {};
  for (let i = 0; i < count; i++) {
    expectedHisto[i] = 1;
  }
  verify_view_level_histogram(expectedHisto, viewWrapper);
});

add_task(async function test_real_folder_threading_grouped_by_sort() {
  const viewWrapper = make_view_wrapper();

  // create some messages that belong to the 'in this week' bucket when sorting
  //  by date and grouping by date.
  const count = 5;
  const [[folder]] = await messageInjection.makeFoldersWithSets(1, [
    { count, age: { days: 2 }, age_incr: { mins: 1 } },
  ]);

  // group-by-sort sorted by date
  viewWrapper.open(folder);
  viewWrapper.beginViewUpdate();
  viewWrapper.showGroupedBySort = true;
  // whitebox test view flags (we've gotten them wrong before...)
  assert_bit_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "View threaded bit should be set."
  );
  assert_bit_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kGroupBySort,
    "View group-by-sort bit should be set."
  );
  viewWrapper.sort(
    Ci.nsMsgViewSortType.byDate,
    Ci.nsMsgViewSortOrder.ascending
  );
  // expand everyone
  view_expand_all(viewWrapper);
  viewWrapper.endViewUpdate();

  // make sure the level depths are correct
  verify_view_level_histogram({ 0: 1, 1: count }, viewWrapper);
  // and make sure the first dude is a dummy
  verify_view_row_at_index_is_dummy(viewWrapper, 0);
});

/**
 * Verify that we the threading modes are persisted.  We are only checking
 *  flags here; we trust the previous tests to have done their job.
 */
add_task(async function test_real_folder_threading_persistence() {
  const viewWrapper = make_view_wrapper();
  const folder = await messageInjection.makeEmptyFolder();

  // create a single maximally nested thread.
  const count = 10;
  const messageSet = new SyntheticMessageSet(
    gMessageScenarioFactory.directReply(count)
  );
  await messageInjection.addSetsToFolders([folder], [messageSet]);

  // open the folder, set threaded mode, close it
  viewWrapper.open(folder);
  viewWrapper.showThreaded = true; // should be instantaneous
  verify_view_row_at_index_is_container(viewWrapper, 0);
  assert_bit_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "View threaded bit should be set."
  );
  assert_bit_not_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kGroupBySort,
    "View group-by-sort bit should not be set."
  );
  viewWrapper.close();

  // open it again, make sure we're threaded, go unthreaded, close
  viewWrapper.open(folder);
  assert_true(viewWrapper.showThreaded, "view should be threaded");
  assert_false(viewWrapper.showUnthreaded, "view is lying about threading");
  assert_false(viewWrapper.showGroupedBySort, "view is lying about threading");
  verify_view_row_at_index_is_container(viewWrapper, 0);
  assert_bit_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "View threaded bit should be set."
  );
  assert_bit_not_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kGroupBySort,
    "View group-by-sort bit should not be set."
  );

  viewWrapper.showUnthreaded = true;
  assert_bit_not_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "View threaded bit should not be set."
  );
  assert_bit_not_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kGroupBySort,
    "View group-by-sort bit should not be set."
  );
  viewWrapper.close();

  // open it again, make sure we're unthreaded, go grouped, close
  viewWrapper.open(folder);
  assert_true(viewWrapper.showUnthreaded, "view should be unthreaded");
  assert_false(viewWrapper.showThreaded, "view is lying about threading");
  assert_false(viewWrapper.showGroupedBySort, "view is lying about threading");
  assert_bit_not_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "View threaded bit should not be set."
  );
  assert_bit_not_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kGroupBySort,
    "View group-by-sort bit should not be set."
  );

  viewWrapper.showGroupedBySort = true;
  assert_bit_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "View threaded bit should be set."
  );
  assert_bit_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kGroupBySort,
    "View group-by-sort bit should be set."
  );
  viewWrapper.close();

  // open it again, make sure we're grouped.
  viewWrapper.open(folder);
  assert_true(viewWrapper.showGroupedBySort, "view should be grouped");
  assert_false(viewWrapper.showThreaded, "view is lying about threading");
  assert_false(viewWrapper.showUnthreaded, "view is lying about threading");
  assert_bit_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "View threaded bit should be set."
  );
  assert_bit_set(
    viewWrapper._viewFlags,
    Ci.nsMsgViewFlagsType.kGroupBySort,
    "View group-by-sort bit should be set."
  );
});

/* ===== Real Folder, View Flags ===== */

/*
 * We cannot test the ignored flag for a local folder because we cannot ignore
 *  threads in a local folder.  Only newsgroups can do that and that's not
 *  easily testable at this time.
 *  XXX ^^^ ignoring now works on mail as well.
 */

/**
 * Test the kUnreadOnly flag usage.  This functionality is equivalent to the
 *  mailview kViewItemUnread case, so it uses roughly the same test as
 *  test_real_folder_mail_views_unread.
 */
add_task(async function test_real_folder_flags_show_unread() {
  const viewWrapper = make_view_wrapper();

  const [[folder], setOne, setTwo] = await messageInjection.makeFoldersWithSets(
    1,
    [{}, {}]
  );

  // everything is unread to start with! #1
  viewWrapper.open(folder);
  viewWrapper.beginViewUpdate();
  viewWrapper.showUnreadOnly = true;
  viewWrapper.endViewUpdate();
  verify_messages_in_view([setOne, setTwo], viewWrapper);

  // add some more things (unread!), make sure they appear. #2
  const [setThree] = await messageInjection.makeNewSetsInFolders(
    [folder],
    [{}]
  );
  verify_messages_in_view([setOne, setTwo, setThree], viewWrapper);

  // make some things read, make sure they disappear. #3 (after refresh)
  setTwo.setRead(true);
  viewWrapper.refresh(); // refresh to get the messages to disappear

  verify_messages_in_view([setOne, setThree], viewWrapper);

  // make those things un-read again. #2
  setTwo.setRead(false);
  viewWrapper.refresh(); // QUICKSEARCH-VIEW-LIMITATION-REMOVE or not?
  verify_messages_in_view([setOne, setTwo, setThree], viewWrapper);
});

/* ===== Real Folder, Mail Views ===== */

/*
 * For these tests, we are testing the filtering logic, not grouping or sorting
 *  logic.  The view tests are responsible for that stuff.  We test that:
 *
 * 1) The view is populated correctly on open.
 * 2) The view adds things that become relevant.
 * 3) The view removes things that are no longer relevant.  Because views like
 *    to be stable (read: messages don't disappear as you look at them), this
 *    requires refreshing the view (unless the message has been deleted).
 */

/**
 * Test the kViewItemUnread mail-view case.  This functionality is equivalent
 *  to the kUnreadOnly view flag case, so it uses roughly the same test as
 *  test_real_folder_flags_show_unread.
 */
add_task(async function test_real_folder_mail_views_unread() {
  const viewWrapper = make_view_wrapper();

  const [[folder], setOne, setTwo] = await messageInjection.makeFoldersWithSets(
    1,
    [{}, {}]
  );

  // everything is unread to start with! #1
  viewWrapper.open(folder);
  await new Promise(resolve => setTimeout(resolve));
  viewWrapper.setMailView(MailViewConstants.kViewItemUnread, null);
  verify_messages_in_view([setOne, setTwo], viewWrapper);

  // add some more things (unread!), make sure they appear. #2
  const [setThree] = await messageInjection.makeNewSetsInFolders(
    [folder],
    [{}]
  );
  verify_messages_in_view([setOne, setTwo, setThree], viewWrapper);

  // make some things read, make sure they disappear. #3 (after refresh)
  setTwo.setRead(true);
  viewWrapper.refresh(); // refresh to get the messages to disappear
  verify_messages_in_view([setOne, setThree], viewWrapper);

  // make those things un-read again. #2
  setTwo.setRead(false);
  viewWrapper.refresh(); // QUICKSEARCH-VIEW-LIMITATION-REMOVE
  verify_messages_in_view([setOne, setTwo, setThree], viewWrapper);
});

add_task(async function test_real_folder_mail_views_tags() {
  const viewWrapper = make_view_wrapper();

  // setup the initial set with the tag
  const [[folder], setOne, setTwo] = await messageInjection.makeFoldersWithSets(
    1,
    [{}, {}]
  );
  setOne.addTag("$label1");

  // open, apply mail view constraint, see those messages
  viewWrapper.open(folder);
  await new Promise(resolve => setTimeout(resolve));
  viewWrapper.setMailView(MailViewConstants.kViewItemTags, "$label1");
  verify_messages_in_view(setOne, viewWrapper);

  // add some more with the tag
  setTwo.addTag("$label1");

  // make sure they showed up
  viewWrapper.refresh(); // QUICKSEARCH-VIEW-LIMITATION-REMOVE
  verify_messages_in_view([setOne, setTwo], viewWrapper);

  // remove them all
  setOne.removeTag("$label1");
  setTwo.removeTag("$label1");

  // make sure they all disappeared. #3
  viewWrapper.refresh();
  verify_empty_view(viewWrapper);
});

/*
add_task(async function test_real_folder_mail_views_not_deleted() {
  // not sure how to test this in the absence of an IMAP account with the IMAP
  //  deletion model...
});

add_task(async function test_real_folder_mail_views_custom_people_i_know() {
  // blurg. address book.
});
*/

// recent mail = less than 1 day
add_task(async function test_real_folder_mail_views_custom_recent_mail() {
  const viewWrapper = make_view_wrapper();

  // create a set that meets the threshold and a set that does not
  const [[folder], setRecent] = await messageInjection.makeFoldersWithSets(1, [
    { age: { mins: 0 } },
    { age: { days: 2 }, age_incr: { mins: 1 } },
  ]);

  // open the folder, ensure only the recent guys show. #1
  viewWrapper.open(folder);
  await new Promise(resolve => setTimeout(resolve));
  viewWrapper.setMailView("Recent Mail", null);
  verify_messages_in_view(setRecent, viewWrapper);

  // add two more sets, one that meets, and one that doesn't. #2
  const [setMoreRecent] = await messageInjection.makeNewSetsInFolders(
    [folder],
    [
      { age: { mins: 0 } },
      { age: { days: 2, hours: 1 }, age_incr: { mins: 1 } },
    ]
  );
  // make sure that all we see is our previous recent set and our new recent set
  verify_messages_in_view([setRecent, setMoreRecent], viewWrapper);

  // we aren't going to mess with the system clock, so no #3.
  // (we are assuming that the underlying code handles message deletion.  also,
  //  we are taking the position that message timestamps should not change.)
});

add_task(async function test_real_folder_mail_views_custom_last_5_days() {
  const viewWrapper = make_view_wrapper();

  // create a set that meets the threshold and a set that does not
  const [[folder], setRecent] = await messageInjection.makeFoldersWithSets(1, [
    { age: { days: 2 }, age_incr: { mins: 1 } },
    { age: { days: 6 }, age_incr: { mins: 1 } },
  ]);

  // open the folder, ensure only the recent guys show. #1
  viewWrapper.open(folder);
  await new Promise(resolve => setTimeout(resolve));
  viewWrapper.setMailView("Last 5 Days", null);
  verify_messages_in_view(setRecent, viewWrapper);

  // add two more sets, one that meets, and one that doesn't. #2
  const [setMoreRecent] = await messageInjection.makeNewSetsInFolders(
    [folder],
    [
      { age: { mins: 0 } },
      { age: { days: 5, hours: 1 }, age_incr: { mins: 1 } },
    ]
  );
  // make sure that all we see is our previous recent set and our new recent set
  verify_messages_in_view([setRecent, setMoreRecent], viewWrapper);

  // we aren't going to mess with the system clock, so no #3.
  // (we are assuming that the underlying code handles message deletion.  also,
  //  we are taking the position that message timestamps should not change.)
});

add_task(async function test_real_folder_mail_views_custom_not_junk() {
  const viewWrapper = make_view_wrapper();

  const [[folder], setJunk, setNotJunk] =
    await messageInjection.makeFoldersWithSets(1, [{}, {}]);
  setJunk.setJunk(true);
  setNotJunk.setJunk(false);

  // open, see non-junk messages. #1
  viewWrapper.open(folder);
  await new Promise(resolve => setTimeout(resolve));
  viewWrapper.setMailView("Not Junk", null);
  verify_messages_in_view(setNotJunk, viewWrapper);

  // add some more messages, have them be non-junk for now. #2
  const [setFlippy] = await messageInjection.makeNewSetsInFolders(
    [folder],
    [{}]
  );
  setFlippy.setJunk(false);
  viewWrapper.refresh(); // QUICKSEARCH-VIEW-LIMITATION-REMOVE
  verify_messages_in_view([setNotJunk, setFlippy], viewWrapper);

  // oops! they should be junk! #3
  setFlippy.setJunk(true);
  viewWrapper.refresh();
  verify_messages_in_view(setNotJunk, viewWrapper);
});

add_task(async function test_real_folder_mail_views_custom_has_attachments() {
  const viewWrapper = make_view_wrapper();

  const attachSetDef = {
    attachments: [
      {
        filename: "foo.png",
        contentType: "image/png",
        encoding: "base64",
        charset: null,
        body: "YWJj\n",
        format: null,
      },
    ],
  };
  const noAttachSetDef = {};

  const [[folder], , setAttach] = await messageInjection.makeFoldersWithSets(
    1,
    [noAttachSetDef, attachSetDef]
  );
  viewWrapper.open(folder);
  await new Promise(resolve => setTimeout(resolve));
  viewWrapper.setMailView("Has Attachments", null);
  verify_messages_in_view(setAttach, viewWrapper);

  const [setMoreAttach] = await messageInjection.makeNewSetsInFolders(
    [folder],
    [attachSetDef, noAttachSetDef]
  );
  verify_messages_in_view([setAttach, setMoreAttach], viewWrapper);
});

/* ===== Real Folder, Special Views ===== */

add_task(async function test_real_folder_special_views_threads_with_unread() {
  const viewWrapper = make_view_wrapper();
  const folder = await messageInjection.makeEmptyFolder();

  // create two maximally nested threads and add them to the folder.
  const count = 10;
  const setThreadOne = new SyntheticMessageSet(
    gMessageScenarioFactory.directReply(count)
  );
  const setThreadTwo = new SyntheticMessageSet(
    gMessageScenarioFactory.directReply(count)
  );
  await messageInjection.addSetsToFolders(
    [folder],
    [setThreadOne, setThreadTwo]
  );

  // open the view, set it to this special view
  viewWrapper.open(folder);
  viewWrapper.beginViewUpdate();
  viewWrapper.specialViewThreadsWithUnread = true;
  view_expand_all(viewWrapper);
  viewWrapper.endViewUpdate();

  // no one is read at this point, make sure both threads show up.
  verify_messages_in_view([setThreadOne, setThreadTwo], viewWrapper);

  // mark both threads read, make sure they disappear (after a refresh)
  setThreadOne.setRead(true);
  setThreadTwo.setRead(true);
  viewWrapper.refresh();
  verify_empty_view(viewWrapper);

  // make the first thread visible by marking his last message unread
  setThreadOne.slice(-1).setRead(false);

  view_expand_all(viewWrapper);
  viewWrapper.refresh();
  verify_messages_in_view(setThreadOne, viewWrapper);

  // make the second thread visible by marking some message in the middle
  setThreadTwo.slice(5, 6).setRead(false);
  view_expand_all(viewWrapper);
  viewWrapper.refresh();
  verify_messages_in_view([setThreadOne, setThreadTwo], viewWrapper);
});

/**
 * Make sure that we restore special views from their persisted state when
 *  opening the view.
 */
add_task(async function test_real_folder_special_views_persist() {
  const viewWrapper = make_view_wrapper();
  const folder = await messageInjection.makeEmptyFolder();

  viewWrapper.open(folder);
  viewWrapper.beginViewUpdate();
  viewWrapper.specialViewThreadsWithUnread = true;
  viewWrapper.endViewUpdate();
  viewWrapper.close();

  viewWrapper.open(folder);
  assert_true(
    viewWrapper.specialViewThreadsWithUnread,
    "We should be in threads-with-unread special view mode."
  );
});

add_task(async function test_real_folder_mark_read_on_exit() {
  // set a pref so that the local folders account will think we should
  // mark messages read when leaving the folder.
  Services.prefs.setBoolPref("mailnews.mark_message_read.none", true);

  const viewWrapper = make_view_wrapper();
  const folder = await messageInjection.makeEmptyFolder();
  viewWrapper.open(folder);

  // add some unread messages.
  const [setOne] = await messageInjection.makeNewSetsInFolders([folder], [{}]);
  setOne.setRead(false);
  // verify that we have unread messages.
  assert_equals(
    folder.getNumUnread(false),
    setOne.synMessages.length,
    "all messages should have been added as unread"
  );
  viewWrapper.close(false);
  // verify that closing the view does the expected marking of the messages
  // as read.
  assert_equals(
    folder.getNumUnread(false),
    0,
    "messages should have been marked read on view close"
  );
  Services.prefs.clearUserPref("mailnews.mark_message_read.none");
});
