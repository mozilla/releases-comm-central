/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../../toolkit/components/prompts/content/selectDialog.js */

function cloudfileDialogOnLoad() {
  let icons = propBag.getProperty("icons");
  let listItems = listBox.itemChildren;
  for (let i = 0; i < listItems.length; i++) {
    listItems[i].setAttribute("align", "center");
    let image = document.createElement("img");
    image.setAttribute("src", icons[i]);
    image.setAttribute("alt", "");
    listItems[i].insertBefore(image, listItems[i].firstElementChild);
  }
}
