/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { action } from "@storybook/addon-actions";
import "mail/components/unifiedToolbar/content/search-bar.js";

export default {
  title: "Widgets/Search Bar",
};

export const SearchBar = () => html`
  <template id="search-bar-template">
    <form>
      <input type="search" placeholder="" required="required" />
      <div aria-hidden="true"><slot name="placeholder"></slot></div>
      <button><slot name="button"></slot></button>
    </form>
  </template>
  <search-bar
    @search="${action("search")}"
    @autocomplete="${action("autocomplete")}"
  >
    <span slot="placeholder"
      >Search Field Placeholder <kbd>Ctrl</kbd> + <kbd>K</kbd>
    </span>
    <img
      alt="Search"
      slot="button"
      class="search-button"
      src="chrome://messenger/skin/icons/new/compact/search.svg"
    />
  </search-bar>
`;
