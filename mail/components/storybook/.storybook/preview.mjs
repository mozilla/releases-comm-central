/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { setCustomElementsManifest } from "@storybook/web-components";
import customElementsManifest from "../custom-elements.json";
import { insertFTLIfNeeded, connectFluent } from "./fluent-utils.mjs";

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
  importESModule(path) {
    return window.AppConstants;
  },
};
