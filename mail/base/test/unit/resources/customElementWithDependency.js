/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// We need to explicitly declare the customElements as globals, since this
// script doesn't have the full DOM window environment by default.
/* globals customElements */

{
  class CustomElementWithDependency extends HTMLElement {
    static get REQUIRED_CUSTOM_ELEMENTS() {
      return {
        "pane-splitter": "chrome://messenger/content/pane-splitter.js",
      };
    }
  }
  customElements.define(
    "custom-element-with-dependency",
    CustomElementWithDependency
  );
}
