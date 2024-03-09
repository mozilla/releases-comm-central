/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {
  assert_messages_in_view,
  be_in_folder,
  create_folder,
  make_message_sets_in_folders,
  wait_for_all_messages_to_load,
  get_about_3pane,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
var { promise_modal_dialog } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/WindowHelpers.sys.mjs"
);

var { MailViewConstants } = ChromeUtils.importESModule(
  "resource:///modules/MailViewManager.sys.mjs"
);

const { storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);

var baseFolder, savedFolder;
var setTagged;

add_setup(async function () {
  // Create a folder with some messages that have no tags and some that are
  //  tagged Important ($label1).
  baseFolder = await create_folder("MailViewA");
  [, setTagged] = await make_message_sets_in_folders([baseFolder], [{}, {}]);
  setTagged.addTag("$label1"); // Important, by default
  storeState({
    mail: ["view-picker"],
  });
  await BrowserTestUtils.waitForMutationCondition(
    document.getElementById("unifiedToolbarContent"),
    {
      subtree: true,
      childList: true,
    },
    () => document.querySelector("#unifiedToolbarContent .view-picker")
  );

  registerCleanupFunction(() => {
    storeState({});
  });
});

add_task(function test_put_view_picker_on_toolbar() {
  Assert.ok(
    window.ViewPickerBinding.isVisible,
    "View picker is registered as visible"
  );
});

/**
 * https://bugzilla.mozilla.org/show_bug.cgi?id=474701#c97
 */
add_task(async function test_save_view_as_folder() {
  // - enter the folder
  await be_in_folder(baseFolder);

  // - apply the mail view
  // okay, mozmill is just not ready to click on the view picker...
  // just call the ViewChange global.  it's sad, but it has the same effects.
  // at least, it does once we've caused the popups to get refreshed.
  window.RefreshAllViewPopups(
    document.getElementById("toolbarViewPickerPopup")
  );
  window.ViewChange(":$label1");
  await wait_for_all_messages_to_load();

  // - save it
  const dialogPromise = promise_modal_dialog(
    "mailnews:virtualFolderProperties",
    subtest_save_mail_view
  );
  // we have to use value here because the option mechanism is not sophisticated
  //  enough.
  window.ViewChange(MailViewConstants.kViewItemVirtual);
  await dialogPromise;
});

function subtest_save_mail_view(savc) {
  // - make sure the name is right
  Assert.equal(
    savc.document.getElementById("name").value,
    baseFolder.prettyName + "-Important"
  );

  const selector = savc.document.querySelector("#searchVal0 menulist");
  Assert.ok(selector, "Should have a tag selector");

  // Check the value of the search-value.
  Assert.equal(selector.value, "$label1");

  // - save it
  savc.document.querySelector("dialog").acceptDialog();
}

add_task(async function test_verify_saved_mail_view() {
  // - make sure the folder got created
  savedFolder = baseFolder.getChildNamed(baseFolder.prettyName + "-Important");
  Assert.ok(savedFolder, "MailViewA-Important was not created!");

  // - go in the folder and make sure the right messages are displayed
  await be_in_folder(savedFolder);
  assert_messages_in_view(setTagged, window);
});
