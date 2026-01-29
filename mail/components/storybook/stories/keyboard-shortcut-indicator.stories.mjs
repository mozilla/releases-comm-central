/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/base/content/widgets/search-bar.mjs";
import "mail/themes/shared/mail/colors.css";
import "mail/themes/shared/mail/variables.css";
import "mail/themes/shared/mail/widgets.css";

export default {
  title: "Design System/Keyboard Shortcut Indicator",
  tags: ["autodocs"],
};

export const KeyboardShortcutIndicator = () => html`
  <h1>
    CSS variables provided by <code>chrome://messenger/skin/widgets.css</code>:
  </h1>

  <p>
    These indicators should be used to visualize keyboard shortcuts inside a
    SearchBar custom element placeholder, or inline labels and actionable
    options.
  </p>
  <p>
    The background colors use have variants for light, dark and high contrast
    modes, while the text color is inherited from the parent element.
  </p>
`;

export const StandaloneIndicator = () => html`
  <span class="kbd-container"
    >Type something… <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd></span
  >
`;

export const SearchBarIndicator = () =>
  html` <!-- #include mail/base/content/widgets/search-bar.inc.xhtml -->
    <template id="searchBarTemplate">
      <form>
        <input type="search" placeholder="" required="required" />
        <div aria-hidden="hidden"><slot name="placeholder"></slot></div>
        <button id="search-button" class="button button-flat icon-button">
          <slot name="search-button"></slot>
        </button>
      </form>
    </template>
    <search-bar label="Search something…">
      <span slot="placeholder" class="kbd-container"
        >Type something… <kbd>Ctrl</kbd> + <kbd>K</kbd>
      </span>
      <img
        alt="Search"
        slot="search-button"
        class="search-button"
        src="chrome://messenger/skin/icons/new/compact/search.svg"
      />
    </search-bar>`;
