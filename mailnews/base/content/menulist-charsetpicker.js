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
  const { Services } = ChromeUtils.import(
    "resource://gre/modules/Services.jsm"
  );

  /**
   * MozMenulistCharsetpicker is a menulist widget that is automatically
   * populated with charset selections.
   * Setting preference="<name>" will set the selected value to that of the
   * named preference value.
   * @abstract
   * @extends {MozMenuList}
   */
  class MozMenulistCharsetpickerBase extends customElements.get("menulist") {
    static get observedAttributes() {
      return super.observedAttributes.concat(["subset", "preference"]);
    }

    /**
     * Get the charset values to show in the list.
     * @abstract
     * @return {String[]} an array of character encoding names
     */
    get charsetValues() {
      return [];
    }

    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback()) {
        return;
      }

      if (this.menupopup) {
        return;
      }

      let charsetBundle = Services.strings.createBundle(
        "chrome://messenger/locale/charsetTitles.properties"
      );
      this.charsetValues
        .map(item => {
          let strCharset = charsetBundle.GetStringFromName(
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
      this._setupSelectedValueFromPref();
    }

    _setupSelectedValueFromPref() {
      // Set appropriate selected menu item based on preference value.
      if (this.hasAttribute("preference")) {
        let preference = Services.prefs.getComplexValue(
          this.getAttribute("preference"),
          Ci.nsIPrefLocalizedString
        );
        this.value = preference.data;
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      super.attributeChangedCallback(name, oldValue, newValue);
      // @see MozElementMixin.attributeChangedCallback()
      if (
        !this.isConnectedAndReady ||
        oldValue === newValue ||
        !this.inheritedAttributesCache
      ) {
        return;
      }
      if (name == "preference") {
        this._setupSelectedValueFromPref();
      }
    }
  }

  /**
   * Menulist widget that shows charset applicable for sending messages.
   * @extends MozMenulistCharsetpickerBase
   */
  class MozMenulistCharsetpickerSending extends MozMenulistCharsetpickerBase {
    get charsetValues() {
      return [
        "UTF-8",
        "EUC-KR",
        "gbk",
        "gb18030",
        "ISO-2022-JP",
        "ISO-8859-1",
        "ISO-8859-7",
        "windows-1252",
      ];
    }
  }
  customElements.define(
    "menulist-charsetpicker-sending",
    MozMenulistCharsetpickerSending,
    { extends: "menulist" }
  );

  /**
   * Menulist widget that shows charsets applicable for viewing messages.
   * @extends MozMenulistCharsetpickerBase
   */
  class MozMenulistCharsetpickerViewing extends MozMenulistCharsetpickerBase {
    get charsetValues() {
      return [
        "UTF-8",
        "Big5",
        "EUC-KR",
        "gbk",
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
  }
  customElements.define(
    "menulist-charsetpicker-viewing",
    MozMenulistCharsetpickerViewing,
    { extends: "menulist" }
  );
}
