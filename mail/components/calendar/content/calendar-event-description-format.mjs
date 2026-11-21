/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const parser = Cc["@mozilla.org/parserutils;1"].getService(Ci.nsIParserUtils);

/**
 * Returns sanitized description markup with inline formatting.
 *
 * @param {string} html - The description HTML.
 * @param {Document} doc - The document that will receive the fragment.
 * @returns {DocumentFragment} The sanitized description.
 */
export function parseDescriptionHTML(html, doc) {
  const fragment = parser.parseFragment(
    html,
    parser.SanitizerDropForms |
      parser.SanitizerDropMedia |
      parser.SanitizerAllowStyle,
    false,
    null,
    doc.createElement("div")
  );

  // Remove stylesheets so description rules cannot style the editor controls.
  for (const style of fragment.querySelectorAll("style")) {
    style.remove();
  }

  return fragment;
}

/**
 * Returns the link address if the HTML sanitizer keeps it.
 *
 * @param {string} value - The address entered in the link form.
 * @returns {string} The accepted address, or an empty string.
 */
export function descriptionLinkURL(value) {
  const address = value.trim();

  if (!address) {
    return "";
  }

  const doc = new DOMParser().parseFromString("", "text/html");
  const link = doc.createElement("a");

  link.setAttribute("href", address);

  return (
    parseDescriptionHTML(link.outerHTML, doc).firstElementChild?.getAttribute(
      "href"
    ) ?? ""
  );
}

/**
 * Returns the HTML string to store in the draft. If the stored HTML has no
 * text after sanitizing, escape and use the plain description.
 *
 * @param {string} html - The stored formatted description.
 * @param {string} text - The stored plain description.
 * @returns {string} Safe HTML for the draft.
 */
export function descriptionFromSource(html, text) {
  const doc = new DOMParser().parseFromString("", "text/html");

  if (html) {
    const fragment = parseDescriptionHTML(html, doc);

    if (fragment.textContent.trim()) {
      doc.body.append(fragment);

      return doc.body.innerHTML;
    }
  }

  doc.body.textContent = text;

  return doc.body.innerHTML.replace(/\r?\n/g, "<br>");
}
