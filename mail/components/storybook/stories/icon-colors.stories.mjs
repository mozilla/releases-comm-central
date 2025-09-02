/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/themes/shared/mail/icons.css";
import "mail/themes/shared/mail/colors.css";
import "mail/themes/shared/mail/folderColors.css";

export default {
  title: "Design System/Icons/Colored",
};

const FolderIconsTemplate = () =>
  html` <style>
      img {
        -moz-context-properties: fill, stroke, stroke-opacity;
        fill: color-mix(in srgb, currentColor 20%, transparent);
        stroke: currentColor;
        fill-opacity: 1;
        max-width: 64px;
        max-height: 64px;
      }

      .inbox {
        content: var(--icon-inbox);
        color: var(--folder-color-inbox);
      }

      .draft {
        content: var(--icon-draft);
        color: var(--folder-color-draft);
      }

      .sent {
        content: var(--icon-sent);
        color: var(--folder-color-sent);
      }

      .archive {
        content: var(--icon-archive);
        color: var(--folder-color-archive);
      }

      .spam {
        content: var(--icon-spam);
        color: var(--folder-color-spam);
      }

      .trash {
        content: var(--icon-trash);
        color: var(--folder-color-trash);
      }

      .template {
        content: var(--icon-template);
        color: var(--folder-color-template);
      }

      .newsletter {
        content: var(--icon-newsletter);
        color: var(--folder-color-newsletter);
      }

      .rss {
        content: var(--icon-rss);
        color: var(--folder-color-rss);
      }

      .outbox {
        content: var(--icon-outbox);
        color: var(--folder-color-outbox);
      }

      .folder {
        content: var(--icon-folder);
        color: var(--folder-color-folder);
      }

      .folder-filter {
        content: var(--icon-folder-filter);
        color: var(--folder-color-folder-filter);
      }

      .folder-rss {
        content: var(--icon-folder-rss);
        color: var(--folder-color-folder-rss);
      }

      .folder-warning {
        content: var(--icon-warning);
        color: var(--folder-color-warning);
      }
    </style>
    <img class="inbox" />
    <img class="draft" />
    <img class="sent" />
    <img class="archive" />
    <img class="spam" />
    <img class="trash" />
    <img class="template" />
    <img class="newsletter" />
    <img class="rss" />
    <img class="outbox" />
    <img class="folder" />
    <img class="folder-filter" />
    <img class="folder-rss" />
    <img class="folder-warning" />`;

export const FolderIconColors = FolderIconsTemplate.bind({});
