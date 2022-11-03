/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Makes sure a custom element is available for use in the given window.
 * The element can declare other custom elements it needs to work properly on a
 * static REQUIRED_CUSTOM_ELEMENTS property. The property should be an object,
 * where the key is the custom element tag name, and the value is the path of
 * the file that defines the custom element. All these required custom elements
 * (and their respective dependencies) are also loaded.
 * Circular dependencies are avoided by the early return that makes sure we do
 * nothing if the element is already defined and by waiting when loading until
 * the element is defined.
 *
 * @param {string} customElementTagName - Tag name of the custom element that is
 *   needed.
 * @param {string} path - URI of the js file defining the custom element.
 * @param {Window} window - The window the custom element is needed in.
 * @returns {Promise<void>} The custom element and its requirements have been
 *   loaded.
 */
export async function loadCustomElement(customElementTagName, path, window) {
  if (window.customElements.get(customElementTagName)) {
    return;
  }
  Services.scriptloader.loadSubScript(path, window);
  const customElementConstructor = await window.customElements.whenDefined(
    customElementTagName
  );
  const requiredCustomElements =
    customElementConstructor.REQUIRED_CUSTOM_ELEMENTS;
  if (
    typeof requiredCustomElements === "object" &&
    requiredCustomElements !== null
  ) {
    for (const [tagName, elementPath] of Object.entries(
      requiredCustomElements
    )) {
      await loadCustomElement(tagName, elementPath, window);
    }
  }
}
