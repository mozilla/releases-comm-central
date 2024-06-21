/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/themes/shared/mail/variables.css"; //eslint-disable-line import/no-unassigned-import
import "mail/themes/shared/mail/widgets.css"; //eslint-disable-line import/no-unassigned-import
import "mail/themes/shared/mail/icons.css"; //eslint-disable-line import/no-unassigned-import
import "mail/themes/shared/mail/containers.css"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Design System/Containers",
  tags: ["autodocs"],
};

export const Containers = () => html`
  <h1>
    Each of these containers shown off are based on CSS classes provided by
    <code>chrome://messenger/skin/containers.css</code>
  </h1>
`;

export const SidebarPanelHeader = () => html`
  <div style="display: flex">
    <aside style="flex-grow: 1; background-color: var(--layout-background-2)">
      <header class="sidebar-panel-header">
        <button class="button button-flat icon-button icon-only" type="button" style="background-image: var(--icon-clock)" title="Second most common action around here"></button>
        <button class="button button-primary icon-button" type="button" style="background-image: var(--icon-add);" title="Do the most common thing you'd do here, usually creating something new">Primary Action</button>
        <button class="button button-flat icon-button icon-only" type="button" style="background-image: var(--icon-more)" title="Menu"></button>
      </header>
    </aside>
    <main style="flex-grow: 9; background-color: var(--layout-background-0); padding: 1em; height: 300px">The header on the left side is created using the <code>sidebar-panel-header</code> class. It expects multiple buttons.</code>.</main>
  </div>
`;

export const SidebarPanelScroll = () => html`
  <div
    class="sidebar-panel-scroll"
    style="--sidebar-background: var(--layout-background-2); height: 200px; overflow-y: auto; background: var(--sidebar-background);"
  >
    <div style="height: 500px; padding-inline: 1em">
      This scroll container has the <code>sidebar-panel-scroll</code> class,
      adding a slight shadow effect when the container is scrolled. It relies on
      the <code>--sidebar-background</code> variable to match the color of the
      scrolling content.
    </div>
  </div>
`;
