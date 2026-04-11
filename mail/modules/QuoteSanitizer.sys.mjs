/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const LUMINANCE_THRESHOLD = 200;
const CONTRAST_THRESHOLD = 3.5;

/**
 * Bug 1967725 - Sanitize color-related styles from quoted content in
 * reply/forward compose windows to prevent the original message's colors
 * from bleeding into the compose area, and adapt quoted content for dark
 * mode to match the reader pane appearance.
 */
export var QuoteSanitizer = {
  /**
   * Sanitize quoted content styles in a compose document.
   *
   * @param {Document} doc - The compose editor document.
   * @param {boolean} isDarkMode - Whether dark mode is active.
   */
  sanitize(doc, isDarkMode) {
    const { body } = doc;

    // Phase 1: Strip body-level color attributes and styles. When
    // forwarding inline, the original message's <body bgcolor=...
    // text=...> attributes are copied onto the compose document's body,
    // suppressing the user's own color preferences.
    for (const attr of [
      "bgcolor",
      "text",
      "background",
      "link",
      "vlink",
      "alink",
    ]) {
      body.removeAttribute(attr);
    }
    body.style.removeProperty("background-color");
    body.style.removeProperty("background");
    body.style.removeProperty("color");

    // Phase 2: Scope <style> elements so their rules only apply within
    // the quoted/forwarded content.
    for (const style of doc.querySelectorAll(
      'blockquote[type="cite"] style, .moz-forward-container style'
    )) {
      style.textContent = `@scope { ${style.textContent} }`;
    }

    for (const style of doc.querySelectorAll("head style")) {
      style.textContent =
        '@scope (blockquote[type="cite"], .moz-forward-container) ' +
        `{ ${style.textContent} }`;
    }

    // Phase 3: In dark mode, sanitize inline color/background styles
    // within quoted content so they don't fight the compose window's
    // dark theme. This mirrors what DarkReader does in the reader pane.
    if (isDarkMode) {
      const selector =
        'blockquote[type="cite"] :is([style*="color"],[style*="background"],[bgcolor],[color]),' +
        ' .moz-forward-container :is([style*="color"],[style*="background"],[bgcolor],[color])';
      for (const node of doc.querySelectorAll(selector)) {
        node.removeAttribute("bgcolor");
        node.removeAttribute("color");
        if (node.hasAttribute("style")) {
          this._sanitizeStyleForDarkMode(node.style);
        }
      }

      // Also sanitize CSS rules in all <style> elements that have been
      // scoped to quoted content (both inline and head styles).
      for (const style of doc.querySelectorAll("style")) {
        if (!HTMLStyleElement.isInstance(style)) {
          continue;
        }
        this._sanitizeStyleSheetForDarkMode(style.sheet);
      }
    }
  },

  /**
   * Recursively sanitize all rules in a stylesheet for dark mode,
   * handling nested rules like @scope and @media.
   *
   * @param {CSSStyleSheet|CSSGroupingRule} sheet
   */
  _sanitizeStyleSheetForDarkMode(sheet) {
    for (const rule of sheet.cssRules) {
      if (rule.style) {
        this._sanitizeStyleForDarkMode(rule.style);
      }
      if (rule.cssRules) {
        this._sanitizeStyleSheetForDarkMode(rule);
      }
    }
  },

  /**
   * Sanitize a style declaration for dark mode readability. Strips bright
   * backgrounds and dark text colors so the dark theme defaults apply.
   *
   * @param {CSSStyleDeclaration} style
   */
  _sanitizeStyleForDarkMode(style) {
    if (!style.color && !style.background && !style.backgroundColor) {
      return;
    }

    if (
      (!style.background || style.background == "none") &&
      (!style.backgroundColor || this._isTransparent(style.backgroundColor))
    ) {
      if (style.color && this._luminance(style.color) <= LUMINANCE_THRESHOLD) {
        style.removeProperty("color");
      }
      return;
    }

    if (
      style.backgroundColor &&
      InspectorUtils.isValidCSSColor(style.backgroundColor)
    ) {
      const bgLum = this._luminance(style.backgroundColor);
      const fgContrast = style.color
        ? this._contrast(style.color, style.backgroundColor)
        : Infinity;
      if (bgLum > LUMINANCE_THRESHOLD || fgContrast < CONTRAST_THRESHOLD) {
        style.removeProperty("background-color");
        if (
          style.color &&
          this._luminance(style.color) <= LUMINANCE_THRESHOLD
        ) {
          style.removeProperty("color");
        }
      }
    }

    if (style.background && InspectorUtils.isValidCSSColor(style.background)) {
      const bgLum = this._luminance(style.background);
      const fgContrast = style.color
        ? this._contrast(style.color, style.background)
        : Infinity;
      if (bgLum > LUMINANCE_THRESHOLD || fgContrast < CONTRAST_THRESHOLD) {
        style.removeProperty("background");
        if (
          style.color &&
          this._luminance(style.color) <= LUMINANCE_THRESHOLD
        ) {
          style.removeProperty("color");
        }
      }
    }

    if (style.background.includes("gradient")) {
      style.removeProperty("background");
    }
  },

  _luminance(color) {
    if (!InspectorUtils.isValidCSSColor(color)) {
      return 0;
    }
    const rgba = InspectorUtils.colorToRGBA(color);
    if (!rgba) {
      return 0;
    }
    return 0.2125 * rgba.r + 0.7154 * rgba.g + 0.0721 * rgba.b;
  },

  _contrast(background, foreground) {
    const bgLum = this._luminance(background);
    const fgLum = this._luminance(foreground);
    const brightest = Math.max(bgLum, fgLum);
    const darkest = Math.min(bgLum, fgLum);
    return (brightest + 0.05) / (darkest + 0.05);
  },

  _isTransparent(color) {
    const rgba = InspectorUtils.colorToRGBA(color);
    if (!rgba) {
      return true;
    }
    return rgba.a <= 0.2;
  },
};
