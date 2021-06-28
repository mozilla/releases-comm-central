/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["ThemeVariableMap", "ThemeContentPropertyList"];

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

// A cache of the current sidebar color to avoid unnecessary conditions and
// luminance calculations.
var kSidebarColorCache = null;

function parseRGB(aColorString) {
  let rgb = aColorString.match(/^rgba?\((\d+), (\d+), (\d+)/);
  rgb.shift();
  return rgb.map(x => parseInt(x));
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
      processColor(rgbaChannels, element) {
        if (!rgbaChannels) {
          Services.prefs.setBoolPref(
            "browser.theme.dark-toolbar-theme",
            element.ownerGlobal.matchMedia("(prefers-color-scheme: dark)")
              .matches
          );
          return null;
        }
        const { r, g, b, a } = rgbaChannels;
        Services.prefs.setBoolPref(
          "browser.theme.dark-toolbar-theme",
          _isColorDark(r, g, b)
        );
        return `rgba(${r}, ${g}, ${b}, ${a})`;
      },
    },
  ],
  [
    "--toolbar-color",
    {
      lwtProperty: "toolbar_text",
    },
  ],
  [
    "--tabs-border-color",
    {
      lwtProperty: "toolbar_top_separator",
    },
  ],
  [
    "--toolbarseparator-color",
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
    "--toolbarbutton-icon-fill",
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
    "--arrowpanel-border-color",
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
        if (!rgbaChannels) {
          element.removeAttribute("lwt-tree");
          element.removeAttribute("lwt-tree-brighttext");

          // On Linux, the default theme picks up the right colors from GTK
          // themes, but in the case of a dark GTK theme, we need to detect the
          // text luminance to properly update the attributes.
          if (
            AppConstants.platform == "linux" &&
            Services.prefs.getCharPref("extensions.activeThemeID", "") ==
              "default-theme@mozilla.org"
          ) {
            let sidebarColor = element.ownerGlobal.getComputedStyle(element)
              .color;

            // Interrupt if the sidebar color didn't change.
            if (sidebarColor == kSidebarColorCache) {
              return null;
            }

            kSidebarColorCache = sidebarColor;

            // We need to force a light theme before removing the pref in order
            // to deal with the issue of the Default Theme not triggering any
            // color update. We remove the pref to run our conditions on a
            // clean state.
            Services.prefs.setIntPref("ui.systemUsesDarkTheme", 0);
            Services.prefs.clearUserPref("ui.systemUsesDarkTheme");

            let [r, g, b] = parseRGB(sidebarColor);
            let luminance = 0.2125 * r + 0.7154 * g + 0.0721 * b;

            // If the sidebar text color is light, we need to force a dark UI.
            if (luminance > 110) {
              element.setAttribute("lwt-tree-brighttext", "true");
              Services.prefs.setIntPref("ui.systemUsesDarkTheme", 1);
            }
          }

          return null;
        }

        const { r, g, b } = rgbaChannels;
        let luminance = 0.2125 * r + 0.7154 * g + 0.0721 * b;

        element.setAttribute("lwt-tree", "true");

        if (luminance <= 110) {
          element.removeAttribute("lwt-tree-brighttext");
        } else {
          element.setAttribute("lwt-tree-brighttext", "true");
        }

        // Drop alpha channel.
        return `rgb(${r}, ${g}, ${b})`;
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
  [
    "--sidebar-highlight-border-color",
    {
      lwtProperty: "sidebar_highlight_border",
    },
  ],
];

const ThemeContentPropertyList = [
  "ntp_background",
  "ntp_text",
  "sidebar",
  "sidebar_highlight",
  "sidebar_highlight_text",
  "sidebar_text",
];

// This is copied from LightweightThemeConsumer.jsm.
function _isColorDark(r, g, b) {
  return 0.2125 * r + 0.7154 * g + 0.0721 * b <= 127;
}
