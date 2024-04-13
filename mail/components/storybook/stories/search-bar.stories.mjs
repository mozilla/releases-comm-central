/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { action } from "@storybook/addon-actions";
/* eslint-disable import/no-unassigned-import */
import "mail/base/content/widgets/search-bar.mjs";
import "mail/themes/shared/mail/colors.css";
import "mail/themes/shared/mail/layout.css";
import "mail/themes/shared/mail/widgets.css";
/* eslint-enable import/no-unassigned-import */

export default {
  title: "Widgets/Search Bar",
  component: "search-bar",
  argTypes: {
    disabled: {
      control: "boolean",
    },
  },
};

const Template = ({ label, disabled }) => html`
  <!-- #include mail/base/content/widgets/search-bar.inc.xhtml -->
  <template id="searchBarTemplate">
    <form>
      <input type="search" placeholder="" required="required" />
      <div aria-hidden="true"><slot name="placeholder"></slot></div>
      <div class="search-button-group">
        <button id="clear-button" class="button button-flat icon-button" hidden="true" tabindex="-1" type="reset">
          <slot name="clear-button"></slot>
        </button>
        <button id="search-button" class="button button-flat icon-button">
          <slot name="search-button"></slot>
        </button>
      <div>
    </form>
  </template>
  <search-bar
    @search="${action("search")}"
    @autocomplete="${action("autocomplete")}"
    label="${label}"
    ?disabled="${disabled}"
  >
    <span slot="placeholder" class="kbd-container"
      >Search Field Placeholder <kbd>Ctrl</kbd> + <kbd>K</kbd>
    </span>
    <img
      alt="Clear"
      slot="clear-button"
      class="clear-button"
      src="chrome://messenger/skin/icons/new/compact/close.svg"
    />
    <img
      alt="Search"
      slot="search-button"
      class="search-button"
      src="chrome://messenger/skin/icons/new/compact/search.svg"
    />
  </search-bar>
`;
export const SearchBar = Template.bind({});
SearchBar.args = {
  label: "",
  disabled: false,
};
