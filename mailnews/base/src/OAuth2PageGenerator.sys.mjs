/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () =>
    new Localization(
      ["branding/brand.ftl", "messenger/oauthResultPage.ftl"],
      false
    )
);

// We can cache these resources, since they don't change during runtime of this
// script.
ChromeUtils.defineLazyGetter(lazy, "brandLogo", () =>
  getSVG("chrome://branding/content/about-logo.svg")
);
ChromeUtils.defineLazyGetter(lazy, "brandWordmark", () =>
  getSVG("chrome://branding/content/about-wordmark.svg")
);
ChromeUtils.defineLazyGetter(lazy, "favicon", () =>
  getImage("chrome://branding/content/icon32.png")
);
ChromeUtils.defineLazyGetter(lazy, "htmlTemplate", () =>
  getTextContent("chrome://messenger/content/oauthResult.html")
);

/**
 * Escape a string for display in raw HTML. String shouldn't already contain
 * entity encoding. Converts only characters used for HTML markup into entities:
 * - &: used to start an entity
 * - >: ending a tag
 * - <: starting a tag
 * - ": attribute value start/end
 * - ': attribute value start/end
 *
 * @param {string} str - Raw string to display in HTML.
 * @returns {string} HTML-safe presentation of the string.
 */
function htmlEscape(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll(">", "&gt;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Format a fluent string to include an <a> element, linking to a specific URL
 * without allowing the string to modify the actual link. This passes a
 * linkStart and linkEnd parameter to the string. New lines (\n) in the string
 * are preserved by converting them into <br> elements.
 *
 * @param {string} stringId - ID of the fluent string.
 * @param {string} url - The URL to embed as link.
 * @returns {string} The translated string.
 */
async function formatTranslationWithLink(stringId, url) {
  const formattedString = await lazy.l10n.formatValue(stringId, {
    linkStart: `<a href="${htmlEscape(url)}" target="_blank">`,
    linkEnd: "</a>",
  });
  return formattedString.replaceAll("\n", "<br>");
}

/**
 * Convert an image into a data: URL to embed.
 *
 * @param {string} url - The URL of the image.
 * @returns {string} data: URL representation of the string.
 */
async function getImage(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  const dataURL = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return dataURL;
}

/**
 * Get the contents of a stylesheet.
 *
 * @param {string} url - URL of the stylesheet.
 * @returns {string} Raw CSS text of the stylehseet.
 */
async function getTextContent(url) {
  const response = await fetch(url);
  const content = await response.text();
  return content;
}

/**
 * Get the SVG element from an SVG file.
 *
 * @param {string} url
 * @returns {SVGElement}
 */
async function getSVG(url) {
  const source = await getTextContent(url);
  const parser = new DOMParser();
  const svgDocument = parser.parseFromString(source, "image/svg+xml");
  return svgDocument.documentElement;
}

/**
 * Uses the oauthResult.html template to generate a page with the given content.
 * Also adds the brand SVGs, a bunch of metadata and footer content that isn't
 * contained in the template.
 *
 * @param {string} title - The title of the page.
 * @param {string} subtitle - The subtitle of the page.
 * @param {string} body - The body of the page. If this contains raw HTML, pass
 * rawBody as true.
 * @param {boolean} [rawBody=false] - Whether the body parameter is expected to
 * contain raw HTML.
 * @returns {string} HTML markup for the entire page.
 */
async function getBasePage(title, subtitle, body, rawBody = false) {
  const [wordmarkAlt, footerContent] = await lazy.l10n.formatValues([
    { id: "oauth-result-wordmark-alt" },
    { id: "oauth-result-footer-text" },
  ]);
  const parser = new DOMParser();
  const doc = parser.parseFromString(await lazy.htmlTemplate, "text/html");

  doc.title = title;
  doc.dir = Services.locale.isAppLocaleRTL ? "rtl" : "ltr";
  doc.documentElement.lang = Services.locale.appLocaleAsBCP47;
  const favicon = doc.createElement("link");
  favicon.rel = "icon";
  favicon.setAttribute("sizes", "32");
  favicon.type = "image/png";
  favicon.href = await lazy.favicon;
  doc.head.append(favicon);

  // These SVGs have to be inserted here, inlining at build time would mean
  // knowing branding-specific things during pre-processing.
  const brandSvg = (await lazy.brandLogo).cloneNode(true);
  brandSvg.role = "image";
  doc.getElementById("brandLogo").append(brandSvg);
  const wordmarkSvg = (await lazy.brandWordmark).cloneNode(true);
  wordmarkSvg.role = "image";
  wordmarkSvg.ariaLabel = wordmarkAlt;
  doc.getElementById("wordmark").append(wordmarkSvg);

  doc.getElementById("title").textContent = title;
  doc.getElementById("subtitle").textContent = subtitle;
  if (!rawBody) {
    doc.getElementById("body").textContent = body;
  } else {
    // This is safe, since body is a value we control in the caller, and should
    // typically be a fluent string.
    // eslint-disable-next-line no-unsanitized/property
    doc.getElementById("body").innerHTML = body;
  }

  doc.getElementById("footerLink").textContent = footerContent;

  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

export const OAuth2PageGenerator = {
  /**
   * Generate HTML for a success page after OAuth. The result shouldn't be
   * cached, in case localization details change between calls.
   *
   * @returns {string} HTML for a self-contained success page.
   */
  async generateSuccessPage() {
    const [title, subtitle, body] = await lazy.l10n.formatValues([
      { id: "oauth-success-title" },
      { id: "oauth-success-subtitle" },
      { id: "oauth-success-body" },
    ]);
    return getBasePage(title, subtitle, body);
  },
  /**
   * Generate HTML for an error page after OAuth. The result shouldn't be
   * cached, in case localization details change between calls.
   *
   * @returns {string} HTML for a self-contained error page.
   */
  async generateErrorPage() {
    const [title, subtitle] = await lazy.l10n.formatValues([
      { id: "oauth-error-title" },
      { id: "oauth-error-subtitle" },
    ]);
    const body = await formatTranslationWithLink(
      "oauth-error-body",
      "https://support.thunderbird.net/kb/tb-oauth"
    );
    return getBasePage(title, subtitle, body, true);
  },
};
