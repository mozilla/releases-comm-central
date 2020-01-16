/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var mozmill = ChromeUtils.import("resource://testing-common/mozmill/mozmill.jsm");

var { helpersForController, openLightningPrefs, closeLightningPrefs } = ChromeUtils.import(
  "resource://testing-common/mozmill/CalendarUtils.jsm"
);
var { content_tab_e, content_tab_eid } = ChromeUtils.import(
  "resource://testing-common/mozmill/ContentTabHelpers.jsm"
);
var { wait_for_frame_load } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var controller = mozmill.getMail3PaneController();
var prefTab = null;

add_task(function testCategoryColors() {
  openLightningPrefs(tab => {
    prefTab = tab;

    let listBox = content_tab_e(tab, "categorieslist");
    listBox.scrollIntoView();
    Assert.equal(listBox.itemChildren.length, 22);

    for (let item of listBox.itemChildren) {
      dump(`${item.firstElementChild.value}: ${item.lastElementChild.style.backgroundColor}\n`);
      Assert.ok(item.lastElementChild.style.backgroundColor);
    }

    // Edit the name and colour of a built-in category.

    controller.click(content_tab_eid(tab, "categorieslist"), 5, 5);
    Assert.equal(listBox.selectedIndex, 0);
    controller.click(content_tab_eid(tab, "editCButton"));

    let editFrame = wait_for_frame_load(
      tab.browser.contentDocument.getElementById("dialogOverlay-0").querySelector("browser"),
      "chrome://calendar/content/preferences/editCategory.xhtml"
    );
    let { replaceText, lookup } = helpersForController(editFrame);
    let categoryName = editFrame.eid("categoryName");
    replaceText(categoryName, "ZZZ Mozmill");
    editFrame.e("categoryColor").value = "#00CC00";
    editFrame.click(
      lookup(`
            id("editCategoryWindow")/id("editCategory")/shadow/{"class":"dialog-button-box"}/{"dlgtype":"accept"}
        `)
    );

    let listItem = listBox.itemChildren[listBox.itemCount - 1];
    Assert.equal(listBox.selectedItem, listItem);
    Assert.equal(listItem.firstElementChild.value, "ZZZ Mozmill");
    Assert.equal(listItem.lastElementChild.style.backgroundColor, "rgb(0, 204, 0)");
    Assert.equal(Services.prefs.getCharPref("calendar.category.color.zzz_mozmill"), "#00cc00");

    // Remove the colour of a built-in category.

    controller.click(content_tab_eid(tab, "categorieslist"), 5, 5);
    controller.keypress(content_tab_eid(tab, "categorieslist"), "VK_HOME", {});
    Assert.equal(listBox.selectedIndex, 0);
    let itemName = listBox.itemChildren[0].firstElementChild.value;
    controller.click(content_tab_eid(tab, "editCButton"));

    editFrame = wait_for_frame_load(
      tab.browser.contentDocument.getElementById("dialogOverlay-0").querySelector("browser"),
      "chrome://calendar/content/preferences/editCategory.xhtml"
    );
    editFrame.click(editFrame.eid("useColor"));
    editFrame.click(
      lookup(`
            id("editCategoryWindow")/id("editCategory")/shadow/{"class":"dialog-button-box"}/{"dlgtype":"accept"}
        `)
    );

    listItem = listBox.itemChildren[0];
    Assert.equal(listBox.selectedItem, listItem);
    Assert.equal(listItem.firstElementChild.value, itemName);
    Assert.equal(listItem.lastElementChild.style.backgroundColor, "");
    Assert.equal(
      Services.prefs.getCharPref(`calendar.category.color.${itemName.toLowerCase()}`),
      ""
    );
  }, controller);
});

registerCleanupFunction(function teardownModule() {
  if (prefTab) {
    closeLightningPrefs(prefTab);
  }
});
