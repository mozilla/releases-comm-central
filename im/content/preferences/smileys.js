/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var smileysPreview = {
  _loaded: false,
  load: function() {
    Components.utils.import("resource:///modules/imSmileys.jsm");

    gThemePane.buildThemeList("emoticons");
    let themeName = document.getElementById("emoticons-themename");
    // force the setter to execute again now that the menuitem exists
    themeName.value = themeName.value;
    this._loaded = true;
    this.displayCurrentTheme();
  },

  displayCurrentTheme: function() {
    if (!this._loaded)
      return;

    let themeName = document.getElementById("emoticons-themename").value;
    this.smileyList = getSmileyList(themeName);
    let list = document.getElementById("smileysPreview");
    let item = list.firstChild.nextSibling;
    while (item) {
      let next = item.nextSibling;
      item.remove();
      item = next;
    }

    if (this.smileyList) {
      for (let smiley of this.smileyList) {
        let item = document.createElement("smiley");
        item.setAttribute("smileyImage", smiley.src);
        item.setAttribute("smileyTextCodes", smiley.textCodes.join(" "));
        list.appendChild(item);
      }
    }
  }
};
