/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test about:downloads.
 */

"use strict";
var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");
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
  get_about_message,
  make_message_sets_in_folders,
  mc,
  select_click_row,
  switch_tab,
  wait_for_popup_to_open,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { click_menus_in_sequence, wait_for_browser_load } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var downloads = ChromeUtils.importESModule(
  "resource://gre/modules/Downloads.sys.mjs"
);
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
    Promise.all(succeededPromises).then(() => (finished = true), console.error);
    utils.waitFor(() => finished, "Timeout waiting for downloads to complete.");
  },
};

async function prepare_messages() {
  let folder = await create_folder("about:downloads");
  await make_message_sets_in_folders(
    [folder],
    [
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
    ]
  );
  await be_in_folder(folder);
}

function prepare_downloads_view() {
  let success = false;
  downloads.Downloads.getList(downloads.Downloads.ALL)
    .then(list => list.addView(downloadsView))
    .then(() => (success = true), console.error);
  utils.waitFor(
    () => success,
    "Timeout waiting for attaching our download view."
  );
}

add_setup(async function () {
  gMockFilePickReg.register();

  await prepare_messages();
  prepare_downloads_view();

  downloadsTab = open_about_downloads();
});

function setupTest(test) {
  downloadsView.init();
}

function open_about_downloads() {
  let preCount =
    mc.window.document.getElementById("tabmail").tabContainer.allTabs.length;
  let newTab = mc.window.openSavedFilesWnd();
  utils.waitFor(
    () =>
      mc.window.document.getElementById("tabmail").tabContainer.allTabs
        .length ==
      preCount + 1,
    "Timeout waiting for about:downloads tab"
  );

  wait_for_browser_load(newTab.browser, "about:downloads");
  // We append new tabs at the end, so check the last one.
  let expectedNewTab =
    mc.window.document.getElementById("tabmail").tabInfo[preCount];
  return expectedNewTab;
}

/**
 * Test that there is no file in the list at first.
 */
add_task(async function test_empty_list() {
  setupTest();
  await switch_tab(downloadsTab);

  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  Assert.equal(list.children.length, 0, "Downloads list should be empty");
  teardownTest();
});

async function save_attachment_files() {
  await switch_tab(0);

  let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);

  let aboutMessage = get_about_message();
  let length = attachmentFileNames.length;
  for (let i = 0; i < length; i++) {
    let file = profileDir.clone();
    file.append(attachmentFileNames[i]);
    select_click_row(i);
    gMockFilePicker.returnFiles = [file];
    EventUtils.synthesizeMouseAtCenter(
      aboutMessage.document.getElementById("attachmentSaveAllSingle"),
      { clickCount: 1 },
      aboutMessage
    );
  }
}

/**
 * Test that all downloaded files are showed up in the list.
 */
async function subtest_save_attachment_files_in_list() {
  await save_attachment_files();

  mc.window.document.getElementById("tabmail").switchToTab(downloadsTab);
  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");

  let length = attachmentFileNames.length;
  utils.waitFor(
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
add_task(async function test_save_attachment_files_in_list() {
  setupTest();
  await subtest_save_attachment_files_in_list();
  teardownTest();
});

/**
 * Test that 'remove' in context menu removes surely the target file from
 * the list.
 */
add_task(async function test_remove_file() {
  setupTest();
  await subtest_save_attachment_files_in_list();

  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  let firstElement = list.firstElementChild;
  let removingFileName = firstElement
    .querySelector(".fileName")
    .getAttribute("value");

  // select first element
  EventUtils.synthesizeMouseAtCenter(
    firstElement,
    { clickCount: 1 },
    firstElement.ownerGlobal
  );
  EventUtils.synthesizeMouseAtCenter(
    firstElement,
    { type: "contextmenu" },
    firstElement.ownerGlobal
  );

  let contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  await wait_for_popup_to_open(contextMenu);
  await click_menus_in_sequence(contextMenu, [
    { command: "msgDownloadsCmd_remove" },
  ]);
  utils.waitFor(
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
  await subtest_save_attachment_files_in_list();

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
  EventUtils.synthesizeMouseAtCenter(
    firstElement,
    { clickCount: 1 },
    firstElement.ownerGlobal
  );
  list.selectItemRange(firstElement, secondElement);
  EventUtils.synthesizeMouseAtCenter(
    firstElement,
    { type: "contextmenu" },
    firstElement.ownerGlobal
  );

  let contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  await wait_for_popup_to_open(contextMenu);
  await click_menus_in_sequence(contextMenu, [
    { command: "msgDownloadsCmd_remove" },
  ]);
  utils.waitFor(
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
  await subtest_save_attachment_files_in_list();
  downloadsView.waitForFinish();

  let listbox = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  EventUtils.synthesizeMouseAtCenter(
    listbox,
    { clickCount: 1 },
    listbox.ownerGlobal
  );
  EventUtils.synthesizeMouseAtCenter(
    listbox,
    { type: "contextmenu" },
    listbox.ownerGlobal
  );

  let contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  await wait_for_popup_to_open(contextMenu);
  await click_menus_in_sequence(contextMenu, [
    { command: "msgDownloadsCmd_clearDownloads" },
  ]);
  utils.waitFor(
    () => downloadsView.count == 0,
    "Timeout waiting for clearing all saved attachment files."
  );

  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  Assert.equal(list.children.length, 0, "Downloads list should be empty");
  teardownTest();
});

function teardownTest() {
  downloads.Downloads.getList(downloads.Downloads.ALL)
    .then(function (list) {
      for (let download of downloadsView.items.keys()) {
        list.remove(download);
      }
    })
    .catch(console.error);
  utils.waitFor(
    () => downloadsView.count == 0,
    "Timeout waiting for clearing all saved attachment files."
  );
}

registerCleanupFunction(function () {
  close_tab(downloadsTab);
  gMockFilePickReg.unregister();
});
