/*
 * Test suite for checking correctly saved as draft with unread.
 */

add_task(async function checkDraft() {
  await createMessage();
  Assert.equal(gDraftFolder.getTotalMessages(false), 1);
  Assert.equal(gDraftFolder.getNumUnread(false), 1);
});

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  run_next_test();
}
