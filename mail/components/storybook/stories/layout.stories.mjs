/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/themes/shared/mail/layout.css"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Design System/Layout Colors",
};

function createColor(colorName) {
  const cssVariableName = `--layout-${colorName}`;
  const color = document.createElement("div");
  const preview = document.createElement("div");
  preview.style.width = "200px";
  preview.style.height = "50px";
  preview.style.background = `var(${cssVariableName})`;
  const legend = document.createElement("code");
  legend.textContent = cssVariableName;
  color.append(preview, legend);
  return color;
}

export const LayoutColors = () => html`
  <h1>
    CSS variables provided by <code>chrome://messenger/skin/layout.css</code>:
  </h1>

  <p>
    These colors should be used for the main layout of the application,
    primarily as colors for backgrounds of containers or as text colors.
  </p>
  <p>All colors have variants for light, dark and high contrast.</p>
`;

export const BackgroundColors = () => html`
  ${createColor("background-0")}
  <p>To be used for the main content or page background.</p>

  ${createColor("background-1")}
  <p>To be used for center panes and secondary sidebars.</p>

  ${createColor("background-2")}
  <p>To be used for primary sidebars.</p>

  ${createColor("background-3")}
  <p>To be used for blocks of content inside the main content.</p>

  ${createColor("background-4")}
  <p>To be used for elements inside the main content.</p>
`;

export const TextColors = () => html`
  ${createColor("color-0")}
  <p>To be used when the text needs more emphasis.</p>

  ${createColor("color-1")}
  <p>To be used for the main text color.</p>

  ${createColor("color-2")}
  <p>To be used when the text needs less emphasis.</p>

  ${createColor("color-3")}
  <p>To be used when the text need even less emphasis.</p>
`;

export const BorderColors = () => html`
  ${createColor("border-0")}
  <p>To be used for separation from main layout sections.</p>

  ${createColor("border-1")}
  <p>To be used when the separation is part of the element.</p>

  ${createColor("border-2")}
</section>
`;

export const ExampleUsage = () => html`
  <section style="display: flex; color: var(--layout-color-1);">
    <aside
      style="background: var(--layout-background-2); flex-grow: 1; padding: 1em; border-right: 1px solid var(--layout-border-0);"
    >
      Sidebar.
    </aside>
    <aside
      style="background: var(--layout-background-1); flex-grow: 1; padding: 1em; border-right: 1px solid var(--layout-border-0);"
    >
      Secondary sidebar.
    </aside>
    <section
      style="background: var(--layout-background-0); flex-grow: 2; padding: 1em"
    >
      <h1>Main content</h1>
      <hr style="border-color: var(--layout-border-1);" />
      <p style="color: var(--layout-color2);">
        P.S.: These variables adapt to dark mode and high contrast mode.
      </p>
    </section>
  </section>
`;
