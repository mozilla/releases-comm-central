/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "mail/themes/shared/mail/icons.css"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Design System/Icons",
};

export const Icons = {
  render: () => {
    const container = document.createElement("div");
    container.insertAdjacentHTML(
      "afterbegin",
      `<h1>Icon variables provided by <code>chrome://messenger/skin/icons.css</code>:</h1>
      <style>
img {
  -moz-context-properties: fill, stroke, stroke-opacity;
  fill: color-mix(in srgb, currentColor 20%, transparent);
  stroke: currentColor;
  fill-opacity: 1;
  max-width: 64px;
  max-height: 64px;
}

.loading {
  animation: activity-indicator-throbber 1.05s steps(30) infinite;
  object-fit: cover;
  object-position: 0 0;
  height: 16px;
  width: 16px;
}
@keyframes activity-indicator-throbber {
  100% { object-position: -480px 0; }
}
      </style>`
    );
    const computed = window.getComputedStyle(document.documentElement);
    const properties = Array.from(computed)
      .filter(property => {
        // Only list custom properties
        if (!property.startsWith("--")) {
          return false;
        }
        // Only list properties with an image URL as value.
        const value = computed.getPropertyValue(property);
        return (
          value.startsWith("url(") &&
          (value.endsWith('.svg")') ||
            value.endsWith('.png")') ||
            value.endsWith('.gif")') ||
            value.endsWith('.webp")'))
        );
      })
      .sort();
    for (const property of properties) {
      const item = document.createElement("figure");
      const preview = document.createElement("img");
      preview.style.content = `var(${property})`;
      if (property == "--icon-loading") {
        preview.classList.add("loading");
      }
      const figcap = document.createElement("figcaption");
      const legend = document.createElement("code");
      legend.textContent = property;
      figcap.append(legend);
      item.append(preview, figcap);
      container.append(item);
    }
    return container;
  },
};
