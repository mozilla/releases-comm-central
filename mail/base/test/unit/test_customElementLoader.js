/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { loadCustomElement } = ChromeUtils.importESModule(
  "resource:///modules/CustomElementLoader.sys.mjs"
);

ChromeUtils.defineModuleGetter(
  this,
  "NetUtil",
  "resource://gre/modules/NetUtil.jsm"
);

add_task(async function test_doesNothingWhenElementLoaded() {
  const window = getMockWindowWithCustomElementRegistry();
  window.customElements.elements.set("pane-splitter", "foo");
  await loadCustomElement(
    "pane-splitter",
    "chrome://messenger/content/pane-splitter.js",
    window
  );
  equal(
    window.customElements.get("pane-splitter"),
    "foo",
    "Custom element not defined again"
  );
});

add_task(async function test_loadCustomElement() {
  const window = getMockWindowWithCustomElementRegistry();
  await loadCustomElement(
    "pane-splitter",
    "chrome://messenger/content/pane-splitter.js",
    window
  );
  ok(
    Boolean(window.customElements.get("pane-splitter")),
    "Custom element loaded"
  );
});

add_task(async function test_loadCustomElementWithDependency() {
  const window = getMockWindowWithCustomElementRegistry();
  await loadCustomElement(
    "custom-element-with-dependency",
    NetUtil.newURI(do_get_file("resources/customElementWithDependency.js"))
      .spec,
    window
  );
  ok(
    Boolean(window.customElements.get("custom-element-with-dependency")),
    "Main custom element loaded"
  );
  ok(
    Boolean(window.customElements.get("pane-splitter")),
    "Dependency custom element loaded"
  );
});

function getMockWindowWithCustomElementRegistry() {
  const customElements = {
    elements: new Map(),
    get(tagName) {
      return this.elements.get(tagName);
    },
    whenDefined(tagName) {
      if (this.elements.has(tagName)) {
        return Promise.resolve(this.elements.get(tagName));
      }
      return Promise.reject(
        new Error(
          "Mock custom element registry doesn't support waiting for definition"
        )
      );
    },
    define(tagName, constructorFunction, options) {
      // This explicitly allows overriding so we can easily detect when loading
      // leads to a redefinition.
      this.elements.set(tagName, constructorFunction);
    },
  };
  return {
    customElements,
  };
}
