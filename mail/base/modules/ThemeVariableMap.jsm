/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

var EXPORTED_SYMBOLS = ["ThemeVariableMap", "ThemeContentPropertyList"];

function _isTextColorDark(r, g, b) {
  return 0.2125 * r + 0.7154 * g + 0.0721 * b <= 110;
}

const ThemeVariableMap = [
  [
    "--lwt-accent-color-inactive",
    {
      lwtProperty: "accentcolorInactive",
    },
  ],
  [
    "--lwt-background-alignment",
    {
      isColor: false,
      lwtProperty: "backgroundsAlignment",
    },
  ],
  [
    "--lwt-background-tiling",
    {
      isColor: false,
      lwtProperty: "backgroundsTiling",
    },
  ],
  [
    "--tab-loading-fill",
    {
      lwtProperty: "tab_loading",
    },
  ],
  [
    "--lwt-tab-text",
    {
      lwtProperty: "tab_text",
    },
  ],
  [
    "--tab-line-color",
    {
      lwtProperty: "tab_line",
    },
  ],
  [
    "--lwt-background-tab-separator-color",
    {
      lwtProperty: "tab_background_separator",
    },
  ],
  [
    "--toolbar-bgcolor",
    {
      lwtProperty: "toolbarColor",
    },
  ],
  [
    "--toolbar-color",
    {
      lwtProperty: "toolbar_text",
    },
  ],
  [
    "--urlbar-separator-color",
    {
      lwtProperty: "toolbar_field_separator",
    },
  ],
  [
    "--tabs-border-color",
    {
      lwtProperty: "toolbar_top_separator",
    },
  ],
  [
    "--lwt-toolbar-vertical-separator",
    {
      lwtProperty: "toolbar_vertical_separator",
    },
  ],
  [
    "--chrome-content-separator-color",
    {
      lwtProperty: "toolbar_bottom_separator",
    },
  ],
  [
    "--lwt-toolbarbutton-icon-fill",
    {
      lwtProperty: "icon_color",
    },
  ],
  [
    "--lwt-toolbarbutton-icon-fill-attention",
    {
      lwtProperty: "icon_attention_color",
    },
  ],
  [
    "--lwt-toolbarbutton-hover-background",
    {
      lwtProperty: "button_background_hover",
    },
  ],
  [
    "--lwt-toolbarbutton-active-background",
    {
      lwtProperty: "button_background_active",
    },
  ],
  [
    "--lwt-selected-tab-background-color",
    {
      lwtProperty: "tab_selected",
    },
  ],
  [
    "--autocomplete-popup-background",
    {
      lwtProperty: "popup",
    },
  ],
  [
    "--autocomplete-popup-color",
    {
      lwtProperty: "popup_text",
    },
  ],
  [
    "--autocomplete-popup-border-color",
    {
      lwtProperty: "popup_border",
    },
  ],
  [
    "--autocomplete-popup-highlight-background",
    {
      lwtProperty: "popup_highlight",
    },
  ],
  [
    "--autocomplete-popup-highlight-color",
    {
      lwtProperty: "popup_highlight_text",
    },
  ],
  [
    "--sidebar-background-color",
    {
      lwtProperty: "sidebar",
    },
  ],
  [
    "--sidebar-text-color",
    {
      lwtProperty: "sidebar_text",
      processColor(rgbaChannels, element) {
        // Enable the ui.systemUsesDarkTheme only if one of these cases is true:
        // 1. We're on Linux.
        // 2. The current TB theme is not the default.
        let forceDarkUI =
          AppConstants.platform == "linux" ||
          Services.prefs.getCharPref("extensions.activeThemeID") !=
            "default-theme@mozilla.org";

        if (!rgbaChannels) {
          element.removeAttribute("lwt-tree");

          // We use the #tabmail element to determine the color contrast.
          // If the element is not present, it means a dialog or an unkown tab
          // is currently opened, and we shouldn't do anything.
          let tabmail = element.ownerDocument.getElementById("tabmail");
          if (!tabmail) {
            return null;
          }

          let rgb = tabmail.ownerGlobal
            .getComputedStyle(tabmail)
            .color.match(/^rgba?\((\d+), (\d+), (\d+)/);
          rgb.shift();
          let [r, g, b] = rgb.map(x => parseInt(x));

          if (!_isTextColorDark(r, g, b) && forceDarkUI) {
            element.setAttribute("lwt-tree-brighttext", "true");
            Services.prefs.setIntPref("ui.systemUsesDarkTheme", 1);

            return `rgba(${r}, ${g}, ${b}, 1)`;
          }

          element.removeAttribute("lwt-tree-brighttext");
          Services.prefs.setIntPref("ui.systemUsesDarkTheme", 0);

          return null;
        }

        element.setAttribute("lwt-tree", "true");
        let { r, g, b, a } = rgbaChannels;
        if (!_isTextColorDark(r, g, b) && forceDarkUI) {
          element.setAttribute("lwt-tree-brighttext", "true");
          Services.prefs.setIntPref("ui.systemUsesDarkTheme", 1);
        } else {
          element.removeAttribute("lwt-tree-brighttext");
          Services.prefs.setIntPref("ui.systemUsesDarkTheme", 0);
        }

        return `rgba(${r}, ${g}, ${b}, ${a})`;
      },
    },
  ],
  [
    "--sidebar-highlight-background-color",
    {
      lwtProperty: "sidebar_highlight",
    },
  ],
  [
    "--sidebar-highlight-text-color",
    {
      lwtProperty: "sidebar_highlight_text",
    },
  ],
  [
    "--sidebar-border-color",
    {
      lwtProperty: "sidebar_border",
    },
  ],
];

const ThemeContentPropertyList = [];
