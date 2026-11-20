/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const HTML_NS = "http://www.w3.org/1999/xhtml";

/**
 * Returns the contents of the HTML template in trusted static markup.
 *
 * Use trusted markup from a static template file. Templates use HTML parsing
 * unless the template declares
 * `xmlns:xul="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"`.
 * These templates require well-formed XML and must declare
 * `xmlns="http://www.w3.org/1999/xhtml"`. This does not sanitize the markup.
 * Leave the returned fragment unchanged.
 * Use `ownerDocument.importNode(fragment, true)` for each instance.
 *
 * @param {string} rawTemplateMarkup - The template source.
 * @returns {DocumentFragment} The reusable template contents.
 * @throws {Error} If the XML is malformed or the parsed document does not contain
 *   exactly one HTML template.
 */
export function getTemplate(rawTemplateMarkup) {
  const parser = new DOMParser();
  const htmlDocument = parser.parseFromString(rawTemplateMarkup, "text/html");
  const htmlTemplates = htmlDocument.getElementsByTagNameNS(
    HTML_NS,
    "template"
  );
  const htmlContent = getSingleTemplate(htmlTemplates);

  if (
    htmlTemplates[0].getAttribute("xmlns:xul") !==
    "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"
  ) {
    return htmlContent;
  }

  // Enable XUL elements in the parsed XML document.
  parser.forceEnableXULXBL();
  const xmlDocument = parser.parseFromSafeString(
    rawTemplateMarkup,
    "application/xml"
  );

  if (xmlDocument.documentElement.localName === "parsererror") {
    throw new Error("Template markup must be well-formed XML.");
  }

  const xmlTemplates = xmlDocument.getElementsByTagNameNS(HTML_NS, "template");

  return getSingleTemplate(xmlTemplates);
}

/**
 * Defines `target.template` and parses the markup on the first read.
 *
 * If the markup is invalid, the first read throws. Later reads of a valid
 * template return the same fragment.
 *
 * Import a copy into the destination document for each instance.
 *
 * @param {object} target - The object that will hold the getter.
 * @param {string} rawTemplateMarkup - Trusted markup from a static template file.
 * @see getTemplate
 * @example
 * class MyElement extends HTMLElement {
 *   static template;
 *   static {
 *     getLazyTemplate(this, templateMarkup);
 *   }
 * }
 */
export function getLazyTemplate(target, rawTemplateMarkup) {
  ChromeUtils.defineLazyGetter(target, "template", () =>
    getTemplate(rawTemplateMarkup)
  );
}

/**
 * Returns the contents of the document's only HTML template.
 *
 * @param {HTMLCollectionOf<HTMLTemplateElement>} templates - The HTML
 *   templates in the parsed document.
 * @returns {DocumentFragment} The template contents.
 * @throws {Error} If the document does not contain exactly one HTML template.
 */
function getSingleTemplate(templates) {
  if (templates.length !== 1) {
    throw new Error(
      "Template markup must contain exactly one HTML <template> element."
    );
  }

  return templates[0].content;
}
