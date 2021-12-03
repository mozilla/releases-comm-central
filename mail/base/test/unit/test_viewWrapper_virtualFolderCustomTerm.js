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

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
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
function* test_virtual_folder_single_load_custom_pred() {
  let viewWrapper = make_view_wrapper();

  let [folderOne, oneSubjFoo] = make_folder_with_sets([{ subject: "foo" }, {}]);

  yield wait_for_message_injection();

  let virtFolder = make_virtual_folder(folderOne, { custom: "foo" });

  yield async_view_open(viewWrapper, virtFolder);

  verify_messages_in_view(oneSubjFoo, viewWrapper);
}

var tests = [test_virtual_folder_single_load_custom_pred];

function run_test() {
  async_run_tests(tests);
}
