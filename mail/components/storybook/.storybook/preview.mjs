/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { setCustomElementsManifest } from "@storybook/web-components";
import customElementsManifest from "../custom-elements.json";
import { insertFTLIfNeeded, connectFluent } from "./fluent-utils.mjs";
// eslint-disable-next-line import-x/no-unassigned-import -- Load global CSS through Vite.
import "chrome://global/skin/global.css";
// eslint-disable-next-line import-x/no-unassigned-import
import "mail/themes/shared/mail/colors.css";

// Ensure both individual stories and doc preview boxes have a background
// suitable for the active color scheme by default.
document.body.style.backgroundColor = "var(--color-surface-base)";
const style = document.createElement("style");
style.innerHTML = `
.docs-story {
  background-color: var(--color-surface-base);
}`;
document.head.append(style);

// Base Fluent set up.
connectFluent();

// Any fluent imports should go through MozXULElement.insertFTLIfNeeded.
window.MozXULElement = {
  insertFTLIfNeeded,
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

// ChromeUtils mock

window.AppConstants = {
  platform: "storybook",
};

window.ChromeUtils = {
  importESModule(_path) {
    return window.AppConstants;
  },
};

// Stories use complete URLs, so no application values need expansion.
window.Services = {
  urlFormatter: {
    formatURL(url) {
      return url;
    },
  },
};
