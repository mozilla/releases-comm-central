/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test about:downloads.
 */

"use strict";

var { gMockFilePicker, gMockFilePickReg } = ChromeUtils.import(
  "resource://testing-common/mozmill/AttachmentHelpers.jsm"
);
var { content_tab_e } = ChromeUtils.import(
  "resource://testing-common/mozmill/ContentTabHelpers.jsm"
);
var {
  be_in_folder,
  close_tab,
  create_folder,
  make_new_sets_in_folder,
  mc,
  select_click_row,
  switch_tab,
  wait_for_popup_to_open,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { wait_for_browser_load } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var downloads = ChromeUtils.import("resource://gre/modules/Downloads.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var downloadsTab;

var attachmentFileNames = [
  "Attachment#1.txt",
  "Attachment#2.txt",
  "Attachment#3.txt",
];

var downloadsView = {
  init() {
    this.items = new Map();
    this.removedItems = [];
  },

  get count() {
    return this.items.size;
  },

  onDownloadAdded(aDownload) {
    this.items.set(aDownload, aDownload.target.path);
  },

  onDownloadChanged(aDownload) {},

  onDownloadRemoved(aDownload) {
    this.removedItems.push(aDownload.target.path);
    this.items.delete(aDownload);
  },

  waitForFinish() {
    let succeededPromises = [];
    for (let download of this.items.keys()) {
      let succeededPromise = download.whenSucceeded();
      succeededPromises.push(succeededPromise);
    }
    let finished = false;
    Promise.all(succeededPromises).then(
      () => (finished = true),
      Cu.reportError
    );
    mc.waitFor(() => finished, "Timeout waiting for downloads to complete.");
  },
};

function prepare_messages() {
  let folder = create_folder("about:downloads");
  make_new_sets_in_folder(folder, [
    {
      count: 1,
      attachments: [
        {
          filename: attachmentFileNames[0],
          body: "Body",
        },
      ],
    },
    {
      count: 1,
      attachments: [
        {
          filename: attachmentFileNames[1],
          body: "Body",
        },
      ],
    },
    {
      count: 1,
      attachments: [
        {
          filename: attachmentFileNames[2],
          body: "Body",
        },
      ],
    },
  ]);
  be_in_folder(folder);
}

function prepare_downloads_view() {
  let success = false;
  downloads.Downloads.getList(downloads.Downloads.ALL)
    .then(list => list.addView(downloadsView))
    .then(() => (success = true), Cu.reportError);
  mc.waitFor(() => success, "Timeout waiting for attaching our download view.");
}

add_task(function setupModule(module) {
  gMockFilePickReg.register();

  prepare_messages();
  prepare_downloads_view();

  downloadsTab = open_about_downloads();
});

function setupTest(test) {
  downloadsView.init();
}

function open_about_downloads() {
  let preCount = mc.tabmail.tabContainer.allTabs.length;
  let newTab = mc.window.openSavedFilesWnd();
  mc.waitFor(
    () => mc.tabmail.tabContainer.allTabs.length == preCount + 1,
    "Timeout waiting for about:downloads tab"
  );

  wait_for_browser_load(newTab.browser, "about:downloads");
  // We append new tabs at the end, so check the last one.
  let expectedNewTab = mc.tabmail.tabInfo[preCount];
  return expectedNewTab;
}

/**
 * Test that there is no file in the list at first.
 */
add_task(function test_empty_list() {
  setupTest();
  switch_tab(downloadsTab);

  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  Assert.equal(list.children.length, 0, "Downloads list should be empty");
  teardownTest();
});

function save_attachment_files() {
  switch_tab(0);

  let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);

  let length = attachmentFileNames.length;
  for (let i = 0; i < length; i++) {
    let file = profileDir.clone();
    file.append(attachmentFileNames[i]);
    select_click_row(i);
    gMockFilePicker.returnFiles = [file];
    mc.click(mc.e("attachmentSaveAllSingle"));
  }
}

/**
 * Test that all downloaded files are showed up in the list.
 */
function subtest_save_attachment_files_in_list() {
  save_attachment_files();

  mc.tabmail.switchToTab(downloadsTab);
  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");

  let length = attachmentFileNames.length;
  mc.waitFor(
    () => downloadsView.count == length,
    () =>
      "Timeout waiting for saving three attachment files; " +
      "downloadsView.count=" +
      downloadsView.count
  );

  Assert.equal(length, list.children.length);
  Assert.equal(downloadsView.count, list.children.length);

  let actualNames = [];
  let child = list.firstElementChild;
  dump(child.querySelector(".fileName").getAttribute("value"));
  while (child) {
    actualNames.push(child.querySelector(".fileName").getAttribute("value"));
    child = child.nextElementSibling;
  }
  actualNames.sort();

  for (let i = 0; i < length; i++) {
    Assert.equal(attachmentFileNames[i], actualNames[i]);
  }
}
add_task(function test_save_attachment_files_in_list() {
  setupTest();
  subtest_save_attachment_files_in_list();
  teardownTest();
});

/**
 * Test that 'remove' in context menu removes surely the target file from
 * the list.
 */
add_task(async function test_remove_file() {
  setupTest();
  subtest_save_attachment_files_in_list();

  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  let firstElement = list.firstElementChild;
  let removingFileName = firstElement
    .querySelector(".fileName")
    .getAttribute("value");

  // select first element
  mc.click(firstElement);
  EventUtils.synthesizeMouseAtCenter(
    firstElement,
    { type: "contextmenu" },
    firstElement.ownerGlobal
  );

  let contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  await wait_for_popup_to_open(contextMenu);
  await mc.click_menus_in_sequence(contextMenu, [
    { command: "msgDownloadsCmd_remove" },
  ]);
  mc.waitFor(
    () => downloadsView.count == 2,
    "Timeout waiting for removing a saved attachment file."
  );

  let child = list.firstElementChild;
  while (child) {
    Assert.notEqual(
      removingFileName,
      child.querySelector(".fileName").getAttribute("value")
    );
    child = child.nextElementSibling;
  }
  teardownTest();
});

/**
 * Test that removing multiple files surely removes the files.
 */
add_task(async function test_remove_multiple_files() {
  setupTest();
  subtest_save_attachment_files_in_list();

  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  let firstElement = list.firstElementChild.nextElementSibling;
  let secondElement = firstElement.nextElementSibling;
  let removingFileNames = [];

  removingFileNames.push(
    firstElement.querySelector(".fileName").getAttribute("value")
  );
  removingFileNames.push(
    secondElement.querySelector(".fileName").getAttribute("value")
  );

  // select two elements
  mc.click(firstElement);
  list.selectItemRange(firstElement, secondElement);
  EventUtils.synthesizeMouseAtCenter(
    firstElement,
    { type: "contextmenu" },
    firstElement.ownerGlobal
  );

  let contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  await wait_for_popup_to_open(contextMenu);
  await mc.click_menus_in_sequence(contextMenu, [
    { command: "msgDownloadsCmd_remove" },
  ]);
  mc.waitFor(
    () => downloadsView.count == 1,
    "Timeout waiting for removing two saved attachment files."
  );

  let child = list.firstElementChild;
  while (child) {
    for (let name of removingFileNames) {
      Assert.notEqual(
        name,
        child.querySelector(".fileName").getAttribute("value")
      );
    }
    child = child.nextElementSibling;
  }
  teardownTest();
});

/**
 * Test that 'clearDownloads" in context menu purges all files in the list.
 */
add_task(async function test_clear_all_files() {
  setupTest();
  subtest_save_attachment_files_in_list();
  downloadsView.waitForFinish();

  let listbox = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  mc.click(listbox);
  EventUtils.synthesizeMouseAtCenter(
    listbox,
    { type: "contextmenu" },
    listbox.ownerGlobal
  );

  let contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  await wait_for_popup_to_open(contextMenu);
  await mc.click_menus_in_sequence(contextMenu, [
    { command: "msgDownloadsCmd_clearDownloads" },
  ]);
  mc.waitFor(
    () => downloadsView.count == 0,
    "Timeout waiting for clearing all saved attachment files."
  );

  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  Assert.equal(list.children.length, 0, "Downloads list should be empty");
  teardownTest();
});

function teardownTest() {
  downloads.Downloads.getList(downloads.Downloads.ALL)
    .then(function(list) {
      for (let download of downloadsView.items.keys()) {
        list.remove(download);
      }
    })
    .then(null, Cu.reportError);
  mc.waitFor(
    () => downloadsView.count == 0,
    "Timeout waiting for clearing all saved attachment files."
  );
}

registerCleanupFunction(function teardownModule(module) {
  close_tab(downloadsTab);
  gMockFilePickReg.unregister();
});
