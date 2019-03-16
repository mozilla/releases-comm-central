/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

customElements.whenDefined("menulist").then(() => {
  const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

  /**
   * MozMenulistCharsetpicker is a menulist widget that is automatically
   * populated with charset selections.
   * - Setting subset="sending" will show the values applicable for sending
   * - Setting subset="viewing" will show the values applicable for viewing
   * - Setting preference="<name>" will set the selected value to that of the named preference value
   * @extends {MozMenuList}
   */
  class MozMenulistCharsetpicker extends customElements.get("menulist") {
    static get observedAttributes() {
      return ["subset", "preference"];
    }

    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback()) {
        return;
      }

      if (this.menupopup) {
        return;
      }

      this._setupCharsets();
      this._setupSelectedValueFromPref();
    }

    _setupCharsets() {
      let charsetValues;
      if (this.getAttribute("subset") == "sending") {
        charsetValues = [
          "UTF-8", "EUC-KR", "gbk", "gb18030", "ISO-2022-JP",
          "ISO-8859-1", "ISO-8859-7", "windows-1252",
        ];
      } else if (this.getAttribute("subset") == "viewing") {
        charsetValues = [
          "UTF-8", "Big5", "EUC-KR", "gbk", "ISO-2022-JP",
          "ISO-8859-1", "ISO-8859-2", "ISO-8859-7",
          "windows-874", "windows-1250", "windows-1251",
          "windows-1252", "windows-1255", "windows-1256",
          "windows-1257", "windows-1258",
        ];
      }

      let charsetBundle = Services.strings.createBundle(
        "chrome://messenger/locale/charsetTitles.properties");
      let menuLabels = charsetValues.map((item) => {
        let strCharset = charsetBundle.GetStringFromName(
          item.toLowerCase() + ".title");
        return { label: strCharset, value: item };
      });

      menuLabels.sort((a, b) => {
        if (a.value == "UTF-8" || a.label < b.label) {
          return -1;
        } else if (b.value == "UTF-8" || a.label > b.label) {
          return 1;
        }
        return 0;
      });

      menuLabels.forEach((item) => {
        this.appendItem(item.label, item.value);
      });
    }

    _setupSelectedValueFromPref() {
      // Set appropriate selected menu item based on preference value.
      if (this.hasAttribute("preference")) {
        let preference = Services.prefs.getComplexValue(
          this.getAttribute("preference"), Ci.nsIPrefLocalizedString);
        this.value = preference.data;
      }
    }

    attributeChangedCallback() {
      super.attributeChangedCallback();
      if (!this.isConnectedAndReady) {
        return;
      }
      this._updateAttributes();
    }

    _updateAttributes() {
      this.removeAllItems();
      this._setupCharsets();
      this._setupSelectedValueFromPref();
    }
  }
  customElements.define("menulist-charsetpicker", MozMenulistCharsetpicker, { extends: "menulist" });
});

// The menulist CE is defined lazily. Create one now to get menulist defined,
// allowing us to inherit from it.
if (!customElements.get("menulist")) {
  delete document.createElement("menulist");
}
