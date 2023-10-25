/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { DOMLocalization } from "@fluent/dom";
import { FluentBundle, FluentResource } from "@fluent/bundle";
import { setCustomElementsManifest } from "@storybook/web-components";
import customElementsManifest from "../custom-elements.json";

// Base Fluent set up.
let storybookBundle = new FluentBundle("en-US");
let loadedResources = new Set();
function* generateBundles() {
  yield* [storybookBundle];
}
document.l10n = new DOMLocalization([], generateBundles);
document.l10n.connectRoot(document.documentElement);

// Any fluent imports should go through MozXULElement.insertFTLIfNeeded.
window.MozXULElement = {
  async insertFTLIfNeeded(name) {
    if (loadedResources.has(name)) {
      return;
    }
    //TODO might have to dynamically change this depending on where a component
    // lives in the tree (for example for calendar or mailnews).
    // eslint-disable-next-line no-unsanitized/method
    let imported = await import(
      /* webpackInclude: /.*[\/\\].*\.ftl/ */
      `mail/locales/en-US/${name}`
    );
    let ftlContents = imported.default;

    if (loadedResources.has(name)) {
      // Seems possible we've attempted to load this twice before the first call
      // resolves, so once the first load is complete we can abandon the others.
      return;
    }

    let ftlResource = new FluentResource(ftlContents);
    storybookBundle.addResource(ftlResource);
    loadedResources.add(name);
    document.l10n.translateRoots();
  },
};

// Enable props tables documentation.
setCustomElementsManifest(customElementsManifest);

// Stop typing on a keyboard inside the sandbox from messing with the storybook
// UI
const stopEvent = event => {
  event.stopPropagation();
};
document.addEventListener("keydown", stopEvent);
document.addEventListener("keypress", stopEvent);
document.addEventListener("keyup", stopEvent);
