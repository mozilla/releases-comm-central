/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function testCategoryColors() {
  let { prefsWindow, prefsDocument } = await openNewPrefsTab("paneLightning", "categorieslist");

  let listBox = prefsDocument.getElementById("categorieslist");
  Assert.equal(listBox.itemChildren.length, 22);

  for (let item of listBox.itemChildren) {
    info(`${item.firstElementChild.value}: ${item.lastElementChild.style.backgroundColor}`);
    Assert.ok(item.lastElementChild.style.backgroundColor);
  }

  // Edit the name and colour of a built-in category.

  EventUtils.synthesizeMouse(listBox, 5, 5, {}, prefsWindow);
  Assert.equal(listBox.selectedIndex, 0);
  EventUtils.synthesizeMouseAtCenter(prefsDocument.getElementById("editCButton"), {}, prefsWindow);

  let subDialogBrowser = prefsDocument.getElementById("dialogOverlay-0").querySelector("browser");
  await BrowserTestUtils.waitForEvent(subDialogBrowser, "load");
  if (subDialogBrowser.contentWindow.location.href == "about:blank") {
    await BrowserTestUtils.waitForEvent(subDialogBrowser, "load");
  }
  await new Promise(subDialogBrowser.contentWindow.setTimeout);
  let subDialogDocument = subDialogBrowser.contentDocument;
  subDialogDocument.getElementById("categoryName").value = "ZZZ Mochitest";
  subDialogDocument.getElementById("categoryColor").value = "#00CC00";
  subDialogDocument.documentElement.firstElementChild.getButton("accept").click();

  let listItem = listBox.itemChildren[listBox.itemCount - 1];
  Assert.equal(listBox.selectedItem, listItem);
  Assert.equal(listItem.firstElementChild.value, "ZZZ Mochitest");
  Assert.equal(listItem.lastElementChild.style.backgroundColor, "rgb(0, 204, 0)");
  Assert.equal(Services.prefs.getCharPref("calendar.category.color.zzz_mochitest"), "#00cc00");

  // Remove the colour of a built-in category.

  EventUtils.synthesizeMouse(listBox, 5, 5, {}, prefsWindow);
  EventUtils.synthesizeKey("VK_HOME", {}, prefsWindow);
  Assert.equal(listBox.selectedIndex, 0);
  let itemName = listBox.itemChildren[0].firstElementChild.value;
  EventUtils.synthesizeMouseAtCenter(prefsDocument.getElementById("editCButton"), {}, prefsWindow);

  subDialogBrowser = prefsDocument.getElementById("dialogOverlay-0").querySelector("browser");
  await BrowserTestUtils.waitForEvent(subDialogBrowser, "load");
  if (subDialogBrowser.contentWindow.location.href == "about:blank") {
    await BrowserTestUtils.waitForEvent(subDialogBrowser, "load");
  }
  await new Promise(subDialogBrowser.contentWindow.setTimeout);
  subDialogDocument = subDialogBrowser.contentDocument;
  subDialogDocument.getElementById("useColor").checked = false;
  subDialogDocument.documentElement.firstElementChild.getButton("accept").click();

  listItem = listBox.itemChildren[0];
  Assert.equal(listBox.selectedItem, listItem);
  Assert.equal(listItem.firstElementChild.value, itemName);
  Assert.equal(listItem.lastElementChild.style.backgroundColor, "");
  Assert.equal(Services.prefs.getCharPref(`calendar.category.color.${itemName.toLowerCase()}`), "");

  // Remove the added category.

  EventUtils.synthesizeMouse(listBox, 5, 5, {}, prefsWindow);
  EventUtils.synthesizeKey("VK_END", {}, prefsWindow);
  Assert.equal(listBox.selectedIndex, listBox.itemCount - 1);
  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("deleteCButton"),
    {},
    prefsWindow
  );
});
