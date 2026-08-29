/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "isDarkReaderEnabled",
  "mail.dark-reader.enabled",
  false
);

const LUMINANCE_THRESHOLD = 200;
export const CONTRAST_THRESHOLD = 3.5;
const VARIABLE_COLOR_PROPERTIES = [
  "color",
  "background",
  "background-color",
  "background-image",
];

/**
 * Convert a color string into an RGB array and returns the luminance value.
 *
 * @param {string} color - The color string that needs to be turned into RGB.
 * @returns {number}
 */
export const luminance = color => {
  if (!InspectorUtils.isValidCSSColor(color)) {
    return 0;
  }

  const rgba = InspectorUtils.colorToRGBA(color);
  if (!rgba) {
    return 0;
  }

  const { r, g, b } = rgba;
  return 0.2125 * r + 0.7154 * g + 0.0721 * b;
};

/**
 * Return the contrast ratio between a background and foreground color for
 * readability validation.
 *
 * @param {string} background - The background color.
 * @param {string} foreground - The foreground color.
 * @returns {number}
 */
export const contrast = (background, foreground) => {
  var bgLuminance = luminance(background);
  var fgLuminance = luminance(foreground);
  var brightest = Math.max(bgLuminance, fgLuminance);
  var darkest = Math.min(bgLuminance, fgLuminance);
  return (brightest + 0.05) / (darkest + 0.05);
};

/**
 * Check if a color has an alpha level that makes it transparent.
 *
 * @param {string} color - The color to evaluate for transparency.
 * @returns {boolean}
 */
export const isTransparent = color => {
  const rgba = InspectorUtils.colorToRGBA(color);
  if (!rgba) {
    return true;
  }
  // We consider an alpha level below 20% to be transparent.
  return rgba.a <= 0.2;
};

/**
 * Check if the various color customization for the current style are suitable
 * for dark mode, and sanitize them if not.
 *
 * @param {CSSStyleDeclaration} style - The style to sanitize.
 * @param {object} [resolvedStyle=style] - Resolved style values.
 */
function sanitizeStyle(style, resolvedStyle = style) {
  const { color, background, backgroundColor, backgroundImage } = resolvedStyle;
  // A blend mode is written for the backdrop the sender had in mind. Against a
  // dark one it may blend the content away, and we cannot inspect what it will
  // end up blending with, so drop it.
  if (style.mixBlendMode && style.mixBlendMode !== "normal") {
    style.removeProperty("mix-blend-mode");
  }

  if (
    !style.color &&
    !style.background &&
    !style.backgroundColor &&
    !style.backgroundImage
  ) {
    // Ignore this node if there's no manipulation of colors.
    return;
  }

  // Strip background images that assume a light context since we cannot
  // inspect their luminance.
  if (
    style.backgroundImage &&
    backgroundImage !== "none" &&
    !backgroundImage.includes("gradient")
  ) {
    style.removeProperty("background-image");
  }

  // Clear text color.
  if (
    (!style.background || style.background == "none") &&
    (!style.backgroundColor || isTransparent(backgroundColor))
  ) {
    // If no background color is specified, test the color luminance.
    if (luminance(color) <= LUMINANCE_THRESHOLD) {
      style.removeProperty("color");
    }
    return;
  }

  // Clear background color.
  if (
    style.backgroundColor &&
    InspectorUtils.isValidCSSColor(backgroundColor)
  ) {
    // Check if the background color luminance is too bright or if the color
    // contrast with foreground is not enough if we have a style color.
    if (
      luminance(backgroundColor) > LUMINANCE_THRESHOLD ||
      (style.color && contrast(color, backgroundColor) < CONTRAST_THRESHOLD)
    ) {
      style.removeProperty("background-color");
      style.removeProperty("background");

      // Check for color luminance after we removed the background.
      if (style.color && luminance(color) <= LUMINANCE_THRESHOLD) {
        style.removeProperty("color");
      }
    }
  }

  // Clear background style.
  if (style.background && InspectorUtils.isValidCSSColor(background)) {
    // If there's only background color manipulation, check that its
    // luminance is not too bright.
    if (
      luminance(background) > LUMINANCE_THRESHOLD ||
      (style.color && contrast(color, background) < CONTRAST_THRESHOLD)
    ) {
      style.removeProperty("background");

      // Check for color luminance after we removed the background.
      if (style.color && luminance(color) <= LUMINANCE_THRESHOLD) {
        style.removeProperty("color");
      }
    }
  }

  // Let's not take any chance that a gradient background could impact
  // readability.
  if (
    style.background.includes("gradient") ||
    style.backgroundImage.includes("gradient")
  ) {
    style.removeProperty("background");
    style.removeProperty("background-image");
  }
}

/**
 * Adapt the message content for dark mode, trying to strip away all inline
 * styles that might interfere.
 *
 * @param {XULBrowser} browser - The browser the message is loaded in.
 */
export function adaptMessageForDarkMode(browser) {
  if (!lazy.isDarkReaderEnabled) {
    return;
  }

  const browserDocument = browser.contentDocument;
  if (!browserDocument?.documentElement) {
    // Bail out if for whatever reason we arrive here and we don't have a
    // document ready to consume.
    return;
  }

  const documentStyle = browser.contentWindow.getComputedStyle(
    browserDocument.documentElement
  );

  // Don't do anything if the email already comes with dark mode support.
  if (
    documentStyle.filter.includes("invert(1)") ||
    documentStyle.filter.includes("prefers-color-scheme: dark")
  ) {
    return;
  }

  // Remove hardcoded body attributes.
  for (const attribute of ["bgcolor", "text", "link", "vlink"]) {
    browserDocument.body?.removeAttribute(attribute);
  }

  // Remove inline style from the main body.
  for (const property of ["background-color", "color"]) {
    browserDocument.body?.style?.removeProperty(property);
  }

  // Loop through all child elements that have inline style that might break in
  // dark mode and check if the contrast is not enough for readability.
  for (const node of browserDocument.querySelectorAll(
    `:not(button):is([style*="color"],[style*="background"],[style*="blend"],[bgcolor],[color])`
  )) {
    // Clear inline attributes, usually in tables.
    node.removeAttribute("bgcolor");
    node.removeAttribute("color");

    // Bail out if the node doesn't have any inline style.
    if (!node.hasAttribute("style")) {
      continue;
    }

    sanitizeStyle(node.style);
  }

  // SVG text with hardcoded fill attribute.
  for (const node of browserDocument.getElementsByTagName("text")) {
    if (!node.hasAttribute("fill")) {
      continue;
    }
    if (luminance(node.getAttribute("fill")) <= LUMINANCE_THRESHOLD) {
      node.setAttribute("fill", "currentColor");
    }
  }

  // Collect resolved embedded styles before mutating any stylesheets, so Gecko
  // only needs to flush styles once.
  const stylesToSanitize = [];
  for (const node of browserDocument.getElementsByTagName("style")) {
    // Bail out if for whatever reason we don't have the right element.
    if (!HTMLStyleElement.isInstance(node)) {
      continue;
    }

    for (const rule of node.sheet.cssRules) {
      if (!CSSStyleRule.isInstance(rule)) {
        continue;
      }

      const usesVariables = VARIABLE_COLOR_PROPERTIES.some(property =>
        rule.style.getPropertyValue(property).includes("var(")
      );
      const element = usesVariables
        ? browserDocument.querySelector(rule.selectorText)
        : null;
      let resolvedStyle;
      if (element) {
        // We ask Gecko to resolve variables for us when needed.
        const { color, background, backgroundColor, backgroundImage } =
          browser.contentWindow.getComputedStyle(element);
        resolvedStyle = {
          color,
          background,
          backgroundColor,
          backgroundImage,
        };
      }
      stylesToSanitize.push([rule.style, resolvedStyle]);
    }
  }

  // Remove any unsuitable embedded styles after all resolved values are read.
  for (const [style, resolvedStyle] of stylesToSanitize) {
    sanitizeStyle(style, resolvedStyle);
  }
}
