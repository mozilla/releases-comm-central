/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let account, rootFolder, subFolders;

/**
 * This file contains unit test for the different pagination options of the
 * MessageList implementation.
 */

add_setup(async function setup() {
  account = await createAccount();
  rootFolder = account.incomingServer.rootFolder;
  subFolders = {
    test1: await createSubfolder(rootFolder, "test1"),
  };
  await createMessages(subFolders.test1, 99);

  registerCleanupFunction(() => {
    // Cleanup the mocked functions of the messageListTracker.
    const {
      Management: {
        global: { messageListTracker },
      },
    } = ChromeUtils.importESModule("resource://gre/modules/Extension.sys.mjs");
    messageListTracker.approvePageFnForTests = null;
    messageListTracker.checkSearchCriteriaFnForTests = null;
  });

  // Cleanup messagesPerPage preference, which is modified by the last test in
  // this file.
  Services.prefs.clearUserPref("extensions.webextensions.messagesPerPage");
});

/**
 * Test messages.query() to return pages as soon as they are filled, and not after
 * all messages have been processed and all pages have been filled. Also tests
 * messages.abortList().
 */
add_task(async function test_query_auto_early_page_return() {
  const {
    Management: {
      global: { messageListTracker },
    },
  } = ChromeUtils.importESModule("resource://gre/modules/Extension.sys.mjs");
  // Reset mocked functions of the messageListTracker.
  messageListTracker.approvePageFnForTests = null;
  messageListTracker.checkSearchCriteriaFnForTests = null;

  const files = {
    "background.js": async () => {
      const [folder] = await browser.folders.query({ name: "test1" });

      // Pre-emptive approve the first page to be completed, otherwise the Promise
      // returned by brower.messages.query() will not resolve.
      await window.sendMessage("approve-page-1");

      let page = await browser.messages.query({
        folderId: folder.id,
        messagesPerPage: 10,
      });
      const listId = page.id;

      // This test uses 10 messages per page and intercepts the creation of pages,
      // preventing the 2nd to be completed. The first page should have been
      // returned as soon as it has been completely filled.
      browser.test.assertEq(
        36,
        listId.length,
        "The listId should have the correct length"
      );
      browser.test.assertEq(
        10,
        page.messages.length,
        "The page should have the correct number of messages"
      );

      // Aborting before the second page has been completed prevents further
      // messages from being added. Therefore, we should not be able to receive
      // all 10 pages, but only 2, and the second page should not include a listId.
      browser.messages.abortList(listId);

      // Search for the last page.
      let pageCount = 1;
      while (page.id) {
        pageCount++;
        browser.test.assertEq(listId, page.id, "The listId should be correct");
        page = await browser.messages.continueList(listId);
      }

      browser.test.assertEq(2, pageCount, "Should have received only 2 pages.");
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };

  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 2,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  // Intercept the creation of pages. The second page is never approved, because
  // its Promise is never resolved.
  const pages = new Map();
  pages.set(1, Promise.withResolvers());
  pages.set(2, Promise.withResolvers());
  messageListTracker.approvePageFnForTests = async page => {
    await pages.get(page).promise;
  };

  await extension.startup();

  await extension.awaitMessage("approve-page-1");
  pages.get(1).resolve();
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

async function subtest_query_auto_pagination_timeout(subTestPaginationTimeout) {
  const {
    Management: {
      global: { messageListTracker },
    },
  } = ChromeUtils.importESModule("resource://gre/modules/Extension.sys.mjs");
  // Reset mocked functions of the messageListTracker.
  messageListTracker.approvePageFnForTests = null;
  messageListTracker.checkSearchCriteriaFnForTests = null;

  const files = {
    "background.js": async () => {
      const [paginationTimeout] = await window.sendMessage(
        "get-pagination-timeout"
      );
      const [folder] = await browser.folders.query({ name: "test1" });
      // Used for logging and timing verification, not in QueryDetails.
      const PAGINATION_TIMEOUT = paginationTimeout ?? 1000;

      // This test will search 99 messages, but will delay adding the 3rd, 7th,
      // 12th and 31th message until a pagination timeout occured, creating early
      // pages after the custom pagination timeout.
      let startTime = Date.now();

      const queryDetails = {
        folderId: folder.id,
      };
      // Specify a autoPaginationTimeout only if one is given.
      if (paginationTimeout) {
        queryDetails.autoPaginationTimeout = paginationTimeout;
      }
      // The first page should have message #1 and #2.
      const firstPage = await browser.messages.query(queryDetails);
      const firstPageCreationTime = Date.now();

      const listId = firstPage.id;
      browser.test.assertEq(
        36,
        listId.length,
        "The listId should have the correct length"
      );
      browser.test.assertEq(
        2,
        firstPage.messages.length,
        "The 1st page should be correct"
      );
      browser.test.assertTrue(
        firstPageCreationTime - startTime >= PAGINATION_TIMEOUT,
        `The 1st page should have been created after pagination timeout of ${PAGINATION_TIMEOUT}: ${
          firstPageCreationTime - startTime
        }`
      );

      // Resume test by approving message #3.
      startTime = Date.now();
      await window.sendMessage("approve-message-3");

      // The 2nd page should have message #3. #4, #5 and #6.
      const secondPage = await browser.messages.continueList(listId);
      const secondPageCreationTime = Date.now();

      browser.test.assertEq(
        listId,
        secondPage.id,
        "The listId should be correct"
      );
      browser.test.assertEq(
        4,
        secondPage.messages.length,
        "The 2nd page should be correct"
      );
      browser.test.assertTrue(
        secondPageCreationTime - startTime >= PAGINATION_TIMEOUT,
        `The 2st page should have been created after pagination timeout of ${PAGINATION_TIMEOUT}: ${
          secondPageCreationTime - startTime
        }`
      );

      // Resume test by approving message #7.
      startTime = Date.now();
      await window.sendMessage("approve-message-7");

      // The 3rd page should have messages #7. #8, #9, #10 and #11.
      const thirdPage = await browser.messages.continueList(listId);
      const thirdPageCreationTime = Date.now();

      browser.test.assertEq(
        listId,
        thirdPage.id,
        "The listId should be correct"
      );
      browser.test.assertEq(
        5,
        thirdPage.messages.length,
        "The 3rd page should be correct"
      );
      browser.test.assertTrue(
        thirdPageCreationTime - startTime >= PAGINATION_TIMEOUT,
        `The 3rd page should have been created after pagination timeout of ${PAGINATION_TIMEOUT}: ${
          thirdPageCreationTime - startTime
        }`
      );

      // Resume test by approving message #12.
      startTime = Date.now();
      await window.sendMessage("approve-message-12");

      // The 4th page should have message #12 till #30.
      const fourthPage = await browser.messages.continueList(listId);
      const fourthPageCreationTime = Date.now();

      browser.test.assertEq(
        listId,
        fourthPage.id,
        "The listId should be correct"
      );
      browser.test.assertEq(
        19,
        fourthPage.messages.length,
        "The 4th page should be correct"
      );
      browser.test.assertTrue(
        fourthPageCreationTime - startTime >= PAGINATION_TIMEOUT,
        `The 4th page should have been created after pagination timeout of ${PAGINATION_TIMEOUT}: ${
          fourthPageCreationTime - startTime
        }`
      );

      // Resume test by approving message #31.
      await window.sendMessage("approve-message-31");

      // The 5th page should have message #31 till #99. The page is filled without
      // further interuption and will not be forced to exceed the pagination timeout.
      const fifthPage = await browser.messages.continueList(listId);

      browser.test.assertEq(
        null,
        fifthPage.id,
        "The listId of the final page should be null"
      );
      browser.test.assertEq(
        69,
        fifthPage.messages.length,
        "The 5th page should be correct"
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };

  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 2,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  const messages = new Map();
  messages.set(3, Promise.withResolvers());
  messages.set(7, Promise.withResolvers());
  messages.set(12, Promise.withResolvers());
  messages.set(31, Promise.withResolvers());

  let msgCounter = 1;
  // Mock the function which checks the search criteria to intercept the addition
  // of some messages.
  messageListTracker.checkSearchCriteriaFnForTests = async () => {
    if (messages.has(msgCounter)) {
      console.log(
        `Simulating a prolonged asynchronous search for message #${msgCounter}`
      );
      await messages.get(msgCounter).promise;
    }
    msgCounter++;
    return true;
  };

  await extension.startup();

  await extension.awaitMessage("get-pagination-timeout");
  extension.sendMessage(subTestPaginationTimeout);

  await extension.awaitMessage("approve-message-3");
  messages.get(3).resolve();
  extension.sendMessage();

  await extension.awaitMessage("approve-message-7");
  messages.get(7).resolve();
  extension.sendMessage();

  await extension.awaitMessage("approve-message-12");
  messages.get(12).resolve();
  extension.sendMessage();

  await extension.awaitMessage("approve-message-31");
  messages.get(31).resolve();
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
}

/**
 * Test the default auto-pagination mechanism and the ability to retrieve pages
 * as soon as they have been created. Auto pagination will cause pages to be
 * created after 1000ms, even if pages are not yet full.
 */
add_task(async function test_query_auto_pagination() {
  await subtest_query_auto_pagination_timeout();
});

/**
 * Test the auto-pagination mechanism with a custom pagination timeout of 1500ms.
 */
add_task(async function test_query_auto_pagination_custom_timeout() {
  await subtest_query_auto_pagination_timeout(1500);
});

/**
 * Test that the default pagination can be disabled.
 */
add_task(async function test_query_disabled_auto_pagination() {
  const {
    Management: {
      global: { messageListTracker },
    },
  } = ChromeUtils.importESModule("resource://gre/modules/Extension.sys.mjs");
  // Reset mocked functions of the messageListTracker.
  messageListTracker.approvePageFnForTests = null;
  messageListTracker.checkSearchCriteriaFnForTests = null;

  const files = {
    "background.js": async () => {
      const [folder] = await browser.folders.query({ name: "test1" });

      // This test will return 99 messages, but will need 700ms to find the 2nd,
      // 6th, 10th and 30th message. Since auto-pagination is disabled, the query
      // should return a single page with all messages after the query has finished,
      // ignoring the default pagination timeout of 1000ms.
      const now = Date.now();
      const firstPage = await browser.messages.query({
        folderId: folder.id,
        autoPaginationTimeout: 0,
      });
      const firstPageCreationTime = Date.now();

      browser.test.assertEq(
        null,
        firstPage.id,
        "The listId should not be present"
      );
      browser.test.assertEq(
        99,
        firstPage.messages.length,
        "The first page should be correct"
      );

      browser.test.assertTrue(
        firstPageCreationTime - now > 1000,
        `Should create only one page even if creation time is longer than default pagination timeout of 1000ms: ${
          firstPageCreationTime - now
        }`
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };

  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 2,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  // This test will delay the retrieval of 4 messages to prolong the search time
  // beyond twice the auto-pagination timeout.
  const messageDelays = new Map();
  messageDelays.set(2, 700);
  messageDelays.set(6, 700);
  messageDelays.set(10, 700);
  messageDelays.set(30, 700);
  let msgCounter = 1;
  // Mock the function which checks the search criteria to delay the addition of
  // some messages.
  messageListTracker.checkSearchCriteriaFnForTests = async () => {
    const delay = messageDelays.get(msgCounter) || 0;
    if (delay) {
      console.log(
        `Simulating a prolonged asynchronous search for message #${msgCounter}`
      );
      const start = Date.now();
      while (Date.now() - start < delay) {
        // No Op.
      }
    }
    msgCounter++;
    return true;
  };

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

/**
 * Test the returnMessageListId option, which should return the list Id
 * immediately, even before the first page has been completed.
 */
add_task(async function test_query_returnMessageListId() {
  const {
    Management: {
      global: { messageListTracker },
    },
  } = ChromeUtils.importESModule("resource://gre/modules/Extension.sys.mjs");
  // Reset mocked functions of the messageListTracker.
  messageListTracker.approvePageFnForTests = null;
  messageListTracker.checkSearchCriteriaFnForTests = null;

  const files = {
    "background.js": async () => {
      const [folder] = await browser.folders.query({ name: "test1" });

      // This test intercepts the completion of pages. Since returnMessageListId
      // is requested, the query should return directly, before even the first
      // page is completed.
      const now = Date.now();
      const listId = await browser.messages.query({
        folderId: folder.id,
        autoPaginationTimeout: 0,
        returnMessageListId: true,
      });
      browser.test.assertEq(
        36,
        listId.length,
        "The listId should have the correct length"
      );

      // This test will return 2 messages, but will need 700ms to check the 2nd,
      // 6th, 10th and 30th message. Since auto-pagination is disabled, the query
      // will return a single page with all messages after the query has finished,
      // ignoring the default pagination timeout of 1000ms.
      // Note: The approve-page-1 message is not waiting for the page to be
      //       completed, it just *approves* the first page, *whenever* that will
      //       be.
      await window.sendMessage("approve-page-1");

      const firstPage = await browser.messages.continueList(listId);
      const firstPageCreationTime = Date.now();

      browser.test.assertEq(null, firstPage.id, "The listId should be correct");
      browser.test.assertEq(
        2,
        firstPage.messages.length,
        "The page should be correct"
      );

      browser.test.assertTrue(
        firstPageCreationTime - now > 1000,
        `Should create only one page even if creation time is longer than default pagination timeout of 1000ms: ${
          firstPageCreationTime - now
        }`
      );

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };

  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 2,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  // In this test we expect at most 1 page to ask for approval to be completed.
  const pages = new Map();
  pages.set(1, Promise.withResolvers());
  messageListTracker.approvePageFnForTests = async page => {
    await pages.get(page).promise;
  };

  // This test will delay the retrieval of 4 messages to prolong the search time
  // beyond twice the auto-pagination timeout of 1000ms. Only 2 messages will be
  // "found".
  const messageDelays = new Map();
  messageDelays.set(2, 700);
  messageDelays.set(6, 700);
  messageDelays.set(10, 700);
  messageDelays.set(30, 700);
  const searchResults = new Map();
  searchResults.set(6, true);
  searchResults.set(55, true);
  let msgCounter = 1;
  // Mock the function which checks the search criteria to delay and supress the
  // addition of some messages.
  messageListTracker.checkSearchCriteriaFnForTests = async () => {
    const delay = messageDelays.get(msgCounter) || 0;
    if (delay) {
      console.log(
        `Simulating a prolonged asynchronous search for message #${msgCounter}`
      );
      const start = Date.now();
      while (Date.now() - start < delay) {
        // No Op.
      }
    }
    msgCounter++;
    return searchResults.has(msgCounter);
  };

  await extension.startup();

  await extension.awaitMessage("approve-page-1");
  pages.get(1).resolve();
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

/**
 * Test messages.list() to return pages as soon as they are filled, and not after
 * all messages have been processed and all pages have been filled. Also tests
 * messages.abortList().
 *
 * Note: Run this test last.
 */
add_task(async function test_list_auto_early_page_return() {
  Services.prefs.setIntPref("extensions.webextensions.messagesPerPage", 10);

  const {
    Management: {
      global: { messageListTracker },
    },
  } = ChromeUtils.importESModule("resource://gre/modules/Extension.sys.mjs");
  // Reset mocked functions of the messageListTracker.
  messageListTracker.approvePageFnForTests = null;
  messageListTracker.checkSearchCriteriaFnForTests = null;

  const files = {
    "background.js": async () => {
      const [folder] = await browser.folders.query({ name: "test1" });

      // Pre-emptive approve the first page to be completed, otherwise the Promise
      // returned by brower.messages.list() will not resolve.
      await window.sendMessage("approve-page-1");

      let page = await browser.messages.list(folder.id);
      const listId = page.id;
      // This test uses 10 messages per page and intercepts the creation of pages,
      // preventing the 2nd to be completed. The first page should have been
      // returned as soon as it has been completely filled.
      browser.test.assertEq(
        36,
        listId.length,
        "The listId should have the correct length"
      );
      browser.test.assertEq(
        10,
        page.messages.length,
        "The page should have the correct number of messages"
      );

      // Aborting before the second page has been completed prevents further
      // messages from being added. Therefore, we should not be able to receive
      // all 10 pages, but only 2, and the second page should not include a listId.
      browser.messages.abortList(listId);

      // Search for the last page.
      let pageCount = 1;
      while (page.id) {
        pageCount++;
        browser.test.assertEq(listId, page.id, "The listId should be correct");
        page = await browser.messages.continueList(listId);
      }

      browser.test.assertEq(2, pageCount, "Should have received only 2 pages.");
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };

  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 2,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  // Intercept the creation of pages. The second page is never approved, because
  // its Promise is never resolved.
  const pages = new Map();
  pages.set(1, Promise.withResolvers());
  pages.set(2, Promise.withResolvers());
  messageListTracker.approvePageFnForTests = async page => {
    await pages.get(page).promise;
  };

  await extension.startup();

  await extension.awaitMessage("approve-page-1");
  pages.get(1).resolve();
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();

  Services.prefs.clearUserPref("extensions.webextensions.messagesPerPage");
});
