/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test DBViewWrapper against a virtual folder with a custom search term.
 *
 *  This test uses an imap message to specifically test the issues from
 *   bug 549336. The code is derived from test_viewWrapper_virtualFolder.js
 *
 *  Original author: Kent James
 */

/* import-globals-from resources/viewWrapperTestUtils.js */
load("resources/viewWrapperTestUtils.js");

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

initViewWrapperTestUtils({ mode: "imap", offline: false });

/**
 * A custom search term, that just does Subject Contains
 */
var gCustomSearchTermSubject = {
  id: "mailnews@mozilla.org#test",
  name: "Test-mailbase Subject",
  getEnabled(scope, op) {
    return true;
  },
  getAvailable(scope, op) {
    return true;
  },
  getAvailableOperators(scope) {
    return [Ci.nsMsgSearchOp.Contains];
  },
  match(aMsgHdr, aSearchValue, aSearchOp) {
    return aMsgHdr.subject.includes(aSearchValue);
  },
  needsBody: false,
};

MailServices.filters.addCustomTerm(gCustomSearchTermSubject);

/**
 * Make sure we open a virtual folder backed by a single underlying folder
 *  correctly, with a custom search term.
 */
add_task(async function test_virtual_folder_single_load_custom_pred() {
  const viewWrapper = make_view_wrapper();

  const [[folderOne], oneSubjFoo] = await messageInjection.makeFoldersWithSets(
    1,
    [{ subject: "foo" }, {}]
  );

  const virtFolder = messageInjection.makeVirtualFolder(folderOne, {
    custom: "foo",
  });

  await view_open(viewWrapper, virtFolder);

  verify_messages_in_view(oneSubjFoo, viewWrapper);
});
