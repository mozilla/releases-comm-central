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

    async connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback()) {
        return;
      }

      if (this.menupopup) {
        return;
      }

      window.MozXULElement.insertFTLIfNeeded(
        "messenger/menulist-charsetpicker.ftl"
      );

      // Map values to our new Fluent IDs. Generated IDs are:
      // charset-utf-8, charset-big5, charset-euc-kr, charset-gbk,
      // charset-koi8-r, charset-iso-2022-jp, charset-iso-8859-1,
      // charset-iso-8859-2, charset-iso-8859-7, charset-windows-874,
      // charset-windows-1250, charset-windows-1251, charset-windows-1252,
      // charset-windows-1255, charset-windows-1256, charset-windows-1257,
      // charset-windows-1258
      const l10nIds = this.charsetValues.map(item => ({
        id: `charset-${item.toLowerCase()}`,
      }));

      // Fetch all translated strings asynchronously.
      const translatedLabels = await document.l10n.formatValues(l10nIds);

      this.charsetValues
        .map((item, index) => {
          return { label: translatedLabels[index], value: item };
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
