/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Instantbird messenging client, released
 * 2009.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var smileysPreview = {
  _loaded: false,
  buildThemeList: function() {
    let themeList =
      Components.classes["@mozilla.org/extensions/manager;1"]
                .getService(Components.interfaces.nsIExtensionManager)
                .getItemList(Components.interfaces.nsIUpdateItem.TYPE_EXTENSION, {})
                .filter(function(item) /^emoticons-/.test(item.id))
                .sort(function(item1, item2) {
                  let name1 = item1.name.toLowerCase();
                  let name2 = item2.name.toLowerCase();
                  return name1 < name2 ? -1 : name1 > name2 ? 1 : 0;
                });
    if (!themeList.length)
      return;

    document.getElementById("noemoticons-menuitem").setAttribute("hidden", "true");

    let menulist = document.getElementById("smileythemename");
    themeList.forEach(function(aItem) {
      menulist.appendItem(aItem.name,
                          aItem.id.replace(/^emoticons-([^@]+)@.*/, "$1"));
    });
  },
  load: function() {
    Components.utils.import("resource://app/modules/imSmileys.jsm");

    smileysPreview.buildThemeList();
    let themeName = document.getElementById("smileythemename");
    // force the setter to execute again now that the menuitem exists
    themeName.value = themeName.value;
    this._loaded = true;
    this.displayCurrentTheme();
  },

  displayCurrentTheme: function() {
    if (!this._loaded)
      return;

    let themeName = document.getElementById("smileythemename").value;
    this.smileyList = getSmileyList(themeName);
    let list = document.getElementById("smileysPreview");
    let item = list.firstChild.nextSibling;
    while (item) {
      let next = item.nextSibling;
      list.removeChild(item);
      item = next;
    }

    if (this.smileyList) {
      for each (let smiley in this.smileyList) {
        let item = document.createElement("smiley");
        item.setAttribute("smileyImage", smiley.src);
        item.setAttribute("smileyTextCodes", smiley.textCodes.join(" "));
        list.appendChild(item);
      }
    }
  }
};
