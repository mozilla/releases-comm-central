/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const registeredWindows = new Set();

/**
 * Loop through all registered windows and update the font size.
 */
function updateAllWindows() {
  for (const win of registeredWindows) {
    UIFontSize.updateWindow(win);
  }
  // After we've updated all the windows we can update isEdited.
  UIFontSize.isEdited = !UIFontSize.isDefault;
}

/**
 * The object controlling the global font size.
 */
export const UIFontSize = {
  /**
   * Default value is 0 so we know the font wasn't changed.
   */
  DEFAULT: 0,
  /**
   * Font size limit to avoid unusable UI.
   */
  MIN_VALUE: 9,
  MAX_VALUE: 30,
  /**
   * The default font size of the user's OS, rounded to integer. We use this in
   * order to prevent issues in case the user has a float default font size
   * (e.g.: 14.345px). By rounding to an INT, we can always go back the original
   * default font size and the rounding doesn't affect the actual sizing but
   * only the value shown to the user.
   */
  osValue: 0,

  /**
   * Keep track of the state of the custom font size. We use this instead of the
   * size attribute because we need to keep track of when things changed back to
   * a default state, and using the size attribute wouldn't be accurate.
   */
  isEdited: false,

  /**
   * Set the font size.
   *
   * @param {integer} size - The new size value.
   */
  set size(size) {
    this.isEdited = true;
    if (Services.appinfo.inSafeMode) {
      this.prefValue = size;
      updateAllWindows();
      return;
    }
    Services.prefs.setIntPref("mail.uifontsize", size);
  },

  /**
   * Get the font size.
   *
   * @returns {integer} - The current font size defined in the pref or the value
   *   defined by the OS, extracted from the messenger window computed style.
   */
  get size() {
    // If the pref is set to 0, it means the user never changed font size so we
    // should use the default OS font size.
    const size = this.prefValue || this.osValue;

    // Fail safe to avoid UI lockdown in case the OS value is wrongly calculated
    // and the value returned is smaller or bigger than the defined thresholds.
    if (size < this.MIN_VALUE) {
      return this.MIN_VALUE;
    }
    if (size > this.MAX_VALUE) {
      return this.MAX_VALUE;
    }

    return size;
  },

  /**
   * True if the current font size matches the default value or the actual OS
   * size.
   *
   * @type {boolean}
   */
  get isDefault() {
    return this.prefValue === this.DEFAULT || this.prefValue === this.osValue;
  },

  /**
   * Get the font size to be applied to the message browser.
   *
   * @param {boolean} isPlainText - If the current message is in plain text.
   * @returns {int} - The font size to apply to the message, changed relative to
   *   the default preferences.
   */
  browserSize(isPlainText) {
    const langGroup = Services.prefs.getComplexValue(
      "font.language.group",
      Ci.nsIPrefLocalizedString
    ).data;
    if (isPlainText) {
      const monospaceSize = Services.prefs.getIntPref(
        "font.size.monospace." + langGroup,
        this.size
      );
      return Math.max(
        Math.min(monospaceSize, this.size),
        monospaceSize + (this.size - this.osValue)
      );
    }
    const variableSize = Services.prefs.getIntPref(
      "font.size.variable." + langGroup,
      this.size
    );
    return Math.max(
      Math.min(variableSize, this.size),
      variableSize + (this.size - this.osValue)
    );
  },

  /**
   * Register a window to be updated if the size ever changes. The current
   * value is applied to the window. Deregistration is automatic.
   *
   * @param {Window} win - The window to be registered.
   */
  registerWindow(win) {
    // Fetch the default font size defined by the OS as soon as we register the
    // first window. Don't do it again if we already have a value.
    if (!this.osValue) {
      const style = win
        .getComputedStyle(win.document.documentElement)
        .getPropertyValue("font-size");

      // Store the rounded default value.
      this.osValue = Math.round(parseFloat(style));

      if (!this.isDefault) {
        this.isEdited = true;
      }
    }

    registeredWindows.add(win);
    win.addEventListener(
      "unload",
      () => {
        registeredWindows.delete(win);
      },
      { once: true }
    );
    this.updateWindow(win);
  },

  /**
   * Update the font size of the registered window.
   *
   * @param {Window} win - The window to be updated.
   */
  updateWindow(win) {
    const tabmail = win.document.getElementById("tabmail");
    const browser =
      tabmail?.getBrowserForSelectedTab() ||
      win.document.getElementById("messagepane");

    if (this.isDefault) {
      win.document.documentElement.style.removeProperty("font-size");
      this.updateMessageBrowser(browser);
      this.updateAppMenuButton(win);
      win.dispatchEvent(new win.CustomEvent("uifontsizechange"));
      return;
    }

    // Add the font size to the HTML document element.
    win.document.documentElement.style.setProperty(
      "font-size",
      `${this.size}px`
    );

    this.updateMessageBrowser(browser);
    this.updateAppMenuButton(win);

    win.dispatchEvent(new win.CustomEvent("uifontsizechange"));
  },

  /**
   * Update the label of the PanelUI app menu to reflect the current font size.
   *
   * @param {Window} win - The window from where the app menu is visible.
   */
  updateAppMenuButton(win) {
    const panelButton = win.document.getElementById(
      "appMenu-fontSizeReset-button"
    );
    if (panelButton) {
      win.document.l10n.setAttributes(
        panelButton,
        "appmenuitem-font-size-reset",
        {
          size: this.size,
        }
      );
    }

    win.document
      .getElementById("appMenu-fontSizeReduce-button")
      ?.toggleAttribute("disabled", this.size <= this.MIN_VALUE);
    win.document
      .getElementById("appMenu-fontSizeEnlarge-button")
      ?.toggleAttribute("disabled", this.size >= this.MAX_VALUE);
  },

  reduceSize() {
    if (this.size <= this.MIN_VALUE) {
      return;
    }
    this.size--;
  },

  resetSize() {
    this.size = this.DEFAULT;
  },

  increaseSize() {
    if (this.size >= this.MAX_VALUE) {
      return;
    }
    this.size++;
  },

  /**
   * Update the font size of the document body element of a browser content.
   * This is used primarily for each loaded message in the message pane.
   *
   * @param {XULElement} browser - The message browser element.
   */
  updateMessageBrowser(browser) {
    // Bail out if the font size wasn't changed, or we don't have a browser.
    // This might happen if the method is called before the message browser is
    // available in the DOM.
    if (!this.isEdited || !browser) {
      return;
    }

    if (this.isDefault) {
      browser.contentDocument?.body?.style.removeProperty("font-size");
      return;
    }

    // Check if the current message is in plain text.
    const isPlainText = browser.contentDocument?.querySelector(
      ".moz-text-plain, .moz-text-flowed"
    );

    browser.contentDocument?.body?.style.setProperty(
      "font-size",
      `${UIFontSize.browserSize(isPlainText)}px`
    );

    // We need to remove the inline font size written in the div wrapper of the
    // body content in order to let our inline style take effect.
    if (isPlainText) {
      isPlainText.style.removeProperty("font-size");
    }
  },

  /**
   * Ensure the subdialogs are properly resized to fit larger font size
   * variations.
   * This is copied from SubDialog.sys.mjs:resizeDialog(), and we need to do that
   * because that method triggers again the `resizeCallback` and `dialogopen`
   * Event, which we use to detect the opening of a dialog, therefore calling
   * the `resizeDialog()` method would cause an infinite loop.
   *
   * @param {SubDialog} dialog - The dialog prototype.
   */
  resizeSubDialog(dialog) {
    // No need to update the dialog size if the font size wasn't changed.
    if (this.isDefault) {
      return;
    }
    const docEl = dialog._frame.contentDocument.documentElement;

    // These are deduced from styles which we don't change, so it's safe to get
    // them now:
    const boxHorizontalBorder =
      2 *
      parseFloat(dialog._window.getComputedStyle(dialog._box).borderLeftWidth);
    const frameHorizontalMargin =
      2 * parseFloat(dialog._window.getComputedStyle(dialog._frame).marginLeft);

    // Then determine and set a bunch of width stuff:
    const { scrollWidth } = docEl.ownerDocument.body || docEl;
    const frameMinWidth = docEl.style.width || scrollWidth + "px";
    const frameWidth = docEl.getAttribute("width")
      ? docEl.getAttribute("width") + "px"
      : frameMinWidth;

    if (dialog._box.getAttribute("sizeto") != "available") {
      dialog._frame.style.width = frameWidth;
    }

    let boxMinWidth = `calc(${
      boxHorizontalBorder + frameHorizontalMargin
    }px + ${frameMinWidth})`;

    // Temporary fix to allow parent chrome to collapse properly to min width.
    // See Bug 1658722.
    if (dialog._window.isChromeWindow) {
      boxMinWidth = `min(80vw, ${boxMinWidth})`;
    }
    dialog._box.style.minWidth = boxMinWidth;

    dialog.resizeVertically();
  },
};

if (Services.appinfo.inSafeMode) {
  UIFontSize.prefValue = UIFontSize.DEFAULT;
} else {
  /**
   * Bind the font size pref change to the updateAllWindows method.
   */
  XPCOMUtils.defineLazyPreferenceGetter(
    UIFontSize,
    "prefValue",
    "mail.uifontsize",
    UIFontSize.DEFAULT,
    updateAllWindows
  );
}
