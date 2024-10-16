/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Custom elements already registered for lazy loading in this context.
 *
 * @type {Set<string>}
 */
const registeredTags = new Set();

/**
 * Promise to ensure the document is interactive.
 *
 * @type {Promise}
 */
const ensureDocumentLoaded = new Promise(resolve => {
  if (document.readyState !== "loading") {
    resolve();
    return;
  }
  document.addEventListener("DOMContentLoaded", resolve, { once: true });
});

/**
 * Helper function to lazily load a custom element once it is actually used.
 * Delays loading until the document is at least interactive.
 *
 * Consider using import() whenever possible to load custom element modules
 * lazily.
 *
 * This will not load the element when using customElements.upgrade.
 *
 * While this is an async function, it is only used for better control flow of
 * the lazy definition and it is not necessary to await the promise when calling
 * this function.
 *
 * @param {string} tagName - Tag name of the custom element.
 * @param {string} moduleURI - URI of module that defines the custom element.
 */
export const defineLazyCustomElement = async (tagName, moduleURI) => {
  await ensureDocumentLoaded;
  if (registeredTags.has(tagName) || customElements.get(tagName)) {
    return;
  }
  customElements.setElementCreationCallback(tagName, () => {
    ChromeUtils.importESModule(moduleURI, { global: "current" });
  });
  registeredTags.add(tagName);
};
