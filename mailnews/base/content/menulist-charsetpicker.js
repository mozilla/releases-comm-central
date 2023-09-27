/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The menulist CE is defined lazily. Create one now to get menulist defined,
// allowing us to inherit from it.
if (!customElements.get("menulist")) {
  delete document.createXULElement("menulist");
}

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * MozMenulistCharsetpicker is a menulist widget that is automatically
   * populated with charset selections.
   *
   * @augments {MozMenuList}
   */
  class MozMenulistCharsetpickerViewing extends customElements.get("menulist") {
    /**
     * Get the charset values to show in the list.
     *
     * @abstract
     * @returns {string[]} an array of character encoding names
     */
    get charsetValues() {
      return [
        "UTF-8",
        "Big5",
        "EUC-KR",
        "gbk",
        "KOI8-R",
        "ISO-2022-JP",
        "ISO-8859-1",
        "ISO-8859-2",
        "ISO-8859-7",
        "windows-874",
        "windows-1250",
        "windows-1251",
        "windows-1252",
        "windows-1255",
        "windows-1256",
        "windows-1257",
        "windows-1258",
      ];
    }

    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback()) {
        return;
      }

      if (this.menupopup) {
        return;
      }

      const charsetBundle = Services.strings.createBundle(
        "chrome://messenger/locale/charsetTitles.properties"
      );
      this.charsetValues
        .map(item => {
          const strCharset = charsetBundle.GetStringFromName(
            item.toLowerCase() + ".title"
          );
          return { label: strCharset, value: item };
        })
        .sort((a, b) => {
          if (a.value == "UTF-8" || a.label < b.label) {
            return -1;
          } else if (b.value == "UTF-8" || a.label > b.label) {
            return 1;
          }
          return 0;
        })
        .forEach(item => {
          this.appendItem(item.label, item.value);
        });
    }
  }
  customElements.define(
    "menulist-charsetpicker-viewing",
    MozMenulistCharsetpickerViewing,
    { extends: "menulist" }
  );
}
