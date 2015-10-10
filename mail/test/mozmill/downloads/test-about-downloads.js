/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test about:downloads.
 */

var MODULE_NAME = 'test-about-download';

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [ 'attachment-helpers',
                        'content-tab-helpers',
                        'dom-helpers',
                        'folder-display-helpers',
                        'prompt-helpers',
                        'window-helpers' ];

var mozmill = {}; Components.utils.import('resource://mozmill/modules/mozmill.js', mozmill);
var elementslib = {}; Components.utils.import('resource://mozmill/modules/elementslib.js', elementslib);
var downloads = {}; Components.utils.import("resource://gre/modules/Downloads.jsm", downloads);

var ah;

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

  onDownloadChanged(aDownload) {
  },

  onDownloadRemoved(aDownload) {
    this.removedItems.push(aDownload.target.path);
    this.items.delete(aDownload);
  },

  waitForFinish() {
    for (let download of this.items.keys()) {
      let succeededPromise = download.whenSucceeded();
      yield succeededPromise;
    }
  }
};

function prepare_messages() {
  let folder = create_folder("about:downloads");
  let msgSet = make_new_sets_in_folder(folder, [
    {
      count: 1,
      attachments: [{
        filename: attachmentFileNames[0],
        body: "Body"
      }]
    },
    {
      count: 1,
      attachments: [{
        filename: attachmentFileNames[1],
        body: "Body"
      }]
    },
    {
      count: 1,
      attachments: [{
        filename: attachmentFileNames[2],
        body: "Body"
      }]
    }
  ]);
  be_in_folder(folder);
}

function prepare_downloads_view() {
  let success = false;
  downloads.Downloads.getList(downloads.Downloads.ALL)
                     .then(list => list.addView(downloadsView))
                     .then(() => success = true, Cu.reportError);
  mc.waitFor(() => success, "Timeout waiting for attaching our download view.");
}

function setupModule(module) {
  let fdh = collector.getModule("folder-display-helpers");
  fdh.installInto(module);
  let wh = collector.getModule('window-helpers');
  wh.installInto(module);
  let cth = collector.getModule("content-tab-helpers");
  cth.installInto(module);
  let dh = collector.getModule('dom-helpers');
  dh.installInto(module);
  ah = collector.getModule('attachment-helpers');
  ah.installInto(module);
  ah.gMockFilePickReg.register();

  prepare_messages();
  prepare_downloads_view();
}

function setupTest(test) {
  downloadsView.init();
}

function open_about_downloads() {
  let preCount = mc.tabmail.tabContainer.childNodes.length;
  let newTab = mc.tabmail.openTab("chromeTab", { chromePage: "about:downloads",
                                                 clickHandler: "specialTabs.aboutClickHandler(event);" });
  mc.waitFor(() => mc.tabmail.tabContainer.childNodes.length == preCount + 1,
             "Timeout waiting for about:downloads tab");

  wait_for_browser_load(newTab.browser, "about:downloads");
  // We append new tabs at the end, so check the last one.
  let expectedNewTab = mc.tabmail.tabInfo[preCount];
  return expectedNewTab;
}

/**
 * Test that there is no file in the list at first.
 */
function test_empty_list() {
  downloadsTab = open_about_downloads();

  switch_tab(downloadsTab);

  let empty = content_tab_e(downloadsTab, "msgDownloadsListEmptyDescription");
  assert_false(empty.hidden, "msgDownloadsListEmptyDescription is not visible");
}

function save_attachment_files() {
  switch_tab(0);

  let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);

  let length = attachmentFileNames.length;
  for (let i = 0; i < length; i++) {
    let file = profileDir.clone();
    file.append(attachmentFileNames[i]);
    select_click_row(i);
    gMockFilePicker.returnFiles = [ file ];
    mc.click(mc.eid("attachmentSaveAllSingle",
                    {"class": "toolbarbutton-menubutton-button"}));
  }
}

/**
 * Test that all downloaded files are showed up in the list.
 */
function test_save_attachment_files_in_list() {
  save_attachment_files();

  mc.tabmail.switchToTab(downloadsTab);
  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");

  let length = attachmentFileNames.length;
  mc.waitFor(() => downloadsView.count == length,
             "Timeout waiting for saving three attachment files.");

  assert_equals(length, list.childNodes.length);
  assert_equals(downloadsView.count, list.childNodes.length);

  let actualNames = [];
  let child = list.firstChild;
  while (child) {
    actualNames.push(child.getAttribute("displayName"));
    child = child.nextSibling;
  }
  actualNames.sort();

  for (let i = 0; i < length; i++) {
    assert_equals(attachmentFileNames[i], actualNames[i]);
  }
}

/**
 * Test that 'remove' in context menu removes surely the target file from
 * the list.
 */
function test_remove_file() {
  test_save_attachment_files_in_list();

  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  let firstElement = list.firstChild;
  let removingFileName = firstElement.getAttribute("displayName");

  // select first element
  mc.click(new elementslib.Elem(firstElement));
  mc.rightClick(new elementslib.Elem(firstElement));

  let contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  wait_for_popup_to_open(contextMenu);
  mc.click_menus_in_sequence(contextMenu, [
                               { command: "msgDownloadsCmd_remove" }
                             ]);
  mc.waitFor(() => downloadsView.count == 2,
             "Timeout waiting for removing a saved attachment file.");

  child = list.firstChild;
  while (child) {
    assert_not_equals(removingFileName, child.getAttribute("displayName"));
    child = child.nextSibling;
  }
}

/**
 * Test that removing multiple files surely removes the files.
 */
function test_remove_multiple_files() {
  test_save_attachment_files_in_list();

  let list = content_tab_e(downloadsTab, "msgDownloadsRichListBox");
  let firstElement = list.firstChild;
  let secondElement = firstElement.nextSibling;
  let removingFileNames = [];

  removingFileNames.push(firstElement.getAttribute("displayName"));
  removingFileNames.push(secondElement.getAttribute("displayName"));

  // select two elements
  mc.click(new elementslib.Elem(firstElement));
  list.selectItemRange(firstElement, secondElement);
  mc.rightClick(new elementslib.Elem(firstElement));

  let contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  wait_for_popup_to_open(contextMenu);
  mc.click_menus_in_sequence(contextMenu, [
                               { command: "msgDownloadsCmd_remove" }
                             ]);
  mc.waitFor(() => downloadsView.count == 1,
             "Timeout waiting for removing two saved attachment files.");

  child = list.firstChild;
  while (child) {
    for (let [, name] in Iterator(removingFileNames)) {
      assert_not_equals(name, child.getAttribute("displayName"));
    }
    child = child.nextSibling;
  }
}

/**
 * Test that 'clearDownloads" in context menu purges all files in the list.
 */
function test_clear_all_files() {
  test_save_attachment_files_in_list();
  downloadsView.waitForFinish();

  mc.click(content_tab_eid(downloadsTab, "msgDownloadsRichListBox"));
  mc.rightClick(content_tab_eid(downloadsTab, "msgDownloadsRichListBox"));

  let contextMenu = content_tab_e(downloadsTab, "msgDownloadsContextMenu");
  wait_for_popup_to_open(contextMenu);
  mc.click_menus_in_sequence(contextMenu, [
                               { command: "msgDownloadsCmd_clearDownloads" }
                             ]);
  mc.waitFor(() => downloadsView.count == 0,
             "Timeout waiting for clearing all saved attachment files.");

  let empty = content_tab_e(downloadsTab, "msgDownloadsListEmptyDescription");
  assert_false(empty.hidden, "msgDownloadsListEmptyDescription is not visible");
}

function teardownTest() {
  downloads.Downloads.getList(downloads.Downloads.ALL)
                     .then(function(list) {
                       for (let download of downloadsView.items.keys()) {
                         list.remove(download);
                       }
                     })
                     .then(null, Cu.reportError);
  mc.waitFor(() => downloadsView.count == 0,
             "Timeout waiting for clearing all saved attachment files.");
  let empty = content_tab_e(downloadsTab, "msgDownloadsListEmptyDescription");
  mc.waitFor(() => empty.hidden == false,
             "Timeout waiting for msgDownloadsListEmptyDescription is visible.");
}

function teardownModule(module) {
  close_tab(downloadsTab);
  ah.gMockFilePickReg.unregister();
}
