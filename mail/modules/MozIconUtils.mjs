/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Format and escape a moz-icon URI for use in an img srcset attribute.
 *
 * @param {string} iconSource - A moz-icon source, with or without the
 *   moz-icon:// prefix.
 * @param {integer} size - The icon size.
 * @param {object} [options]
 * @param {string} [options.contentType] - The icon content type.
 * @param {integer[]} [options.scales] - The icon scales to include.
 * @returns {string} A srcset value.
 */
export function makeMozIconSrcSet(iconSource, size, options = {}) {
  return makeMozIconCandidates(iconSource, size, options)
    .map(({ url, scale }) => `${escapeSrcSetURL(url)} ${scale}x`)
    .join(", ");
}

/**
 * Format and escape a moz-icon URI for use in a CSS image-set value.
 *
 * @param {string} iconSource - A moz-icon source, with or without the
 *   moz-icon:// prefix.
 * @param {integer} size - The icon size.
 * @param {object} [options]
 * @param {string} [options.contentType] - The icon content type.
 * @param {integer[]} [options.scales] - The icon scales to include.
 * @returns {string} An image-set value.
 */
export function makeMozIconImageSet(iconSource, size, options = {}) {
  const candidates = makeMozIconCandidates(iconSource, size, options).map(
    ({ url, scale }) => `"${escapeCSSString(escapeSrcSetURL(url))}" ${scale}x`
  );
  return `image-set(${candidates.join(", ")})`;
}

function makeMozIconCandidates(iconSource, size, options) {
  const { contentType, scales = [1, 2, 3] } = options;
  const baseURL = iconSource.startsWith("moz-icon://")
    ? iconSource
    : `moz-icon://${iconSource}`;

  return scales.map(scale => ({
    url: appendQueryParameters(baseURL, { size, contentType, scale }),
    scale,
  }));
}

function appendQueryParameters(url, parameters) {
  const entries = Object.entries(parameters).filter(
    ([, value]) => value !== undefined && value !== null
  );
  if (!entries.length) {
    return url;
  }

  const query = entries
    .map(([key, value]) => `${key}=${escapeQueryParameterValue(value)}`)
    .join("&");
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

function escapeCSSString(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function escapeQueryParameterValue(value) {
  return `${value}`.replaceAll(/[&#?]/g, percentEncodeCharacter);
}

function escapeSrcSetURL(url) {
  return url.replaceAll(/[ \t\n\f\r,]/g, percentEncodeCharacter);
}

function percentEncodeCharacter(char) {
  return `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
}
