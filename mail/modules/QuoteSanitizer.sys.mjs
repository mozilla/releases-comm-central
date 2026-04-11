/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Bug 1967725 - Sanitize color-related styles from quoted content in
 * reply/forward compose windows to prevent the original message's colors
 * from bleeding into the compose area.
 */
export var QuoteSanitizer = {
  /**
   * Strip color-related styles from quoted content in a compose document.
   *
   * @param {Document} doc - The compose editor document.
   */
  sanitize(doc) {
    // Phase 1: Strip body-level color attributes. When forwarding inline,
    // the original message's <body bgcolor=... text=...> attributes are
    // copied onto the compose document's body. These suppress the user's
    // own color preferences applied later by loadHTMLMsgPrefs().
    const { body } = doc;
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
    // the quoted/forwarded content. Quoted newsletters often contain
    // <style> blocks with rules that would otherwise override
    // compose-window styles. Using @scope keeps the quoted content's
    // internal styling intact while preventing it from leaking out.

    // Styles already inside a quote or forward container: use implicit
    // @scope (scopes to the <style> element's parent).
    for (const style of doc.querySelectorAll(
      'blockquote[type="cite"] style, .moz-forward-container style'
    )) {
      style.textContent = `@scope { ${style.textContent} }`;
    }

    // Styles in <head> came from the original message's HTML. Scope
    // them explicitly to quoted/forwarded containers.
    for (const style of doc.querySelectorAll("head style")) {
      style.textContent =
        '@scope (blockquote[type="cite"], .moz-forward-container) ' +
        `{ ${style.textContent} }`;
    }

    // Phase 3: Strip background-color from top-level wrapper elements
    // inside quoted content. Full-width colored containers create jarring
    // contrast against the compose area, especially in dark mode.
    for (const el of doc.querySelectorAll(
      'blockquote[type="cite"] > :is(div, section, article, table, header, footer, main)[style*="background"],' +
        ' .moz-forward-container > :is(div, section, article, table, header, footer, main)[style*="background"]'
    )) {
      el.style.removeProperty("background-color");
      el.style.removeProperty("background");
    }
  },
};
