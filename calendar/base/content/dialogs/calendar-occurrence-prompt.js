/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

window.addEventListener("DOMContentLoaded", onLoad);

document.addEventListener("dialogaccept", () => exitOccurrenceDialog(1));
document.addEventListener("dialogcancel", () => exitOccurrenceDialog(0));

function exitOccurrenceDialog(aReturnValue) {
  window.arguments[0].value = aReturnValue;
  window.close();
}

function onLoad() {
  const action = window.arguments[0].action || "edit";
  // the calling code prevents sending no items
  const multiple = window.arguments[0].items.length == 1 ? "single" : "multiple";
  let itemType;
  for (const item of window.arguments[0].items) {
    const type = item.isEvent() ? "event" : "task";
    if (itemType != type) {
      itemType = itemType ? "mixed" : type;
    }
  }

  // Set up title and type label
  document.l10n.setAttributes(
    document.head.querySelector("title"),
    `windowtitle-${itemType}-${action}`
  );
  const title = document.getElementById("title-label");
  if (multiple == "multiple") {
    document.l10n.setAttributes(title, "windowtitle-multipleitems");
    document.l10n.setAttributes(
      document.getElementById("isrepeating-label"),
      `header-containsrepeating-${itemType}`
    );
  } else {
    title.value = window.arguments[0].items[0].title;
    document.l10n.setAttributes(
      document.getElementById("isrepeating-label"),
      `header-isrepeating-${itemType}`
    );
  }

  // Set up buttons
  document.getElementById("accept-buttons-box").setAttribute("action", action);
  document.getElementById("accept-buttons-box").setAttribute("type", itemType);

  document.l10n.setAttributes(
    document.getElementById("accept-occurrence-button"),
    `buttons-${multiple}-occurrence-${action}`
  );
  document.l10n.setAttributes(
    document.getElementById("accept-allfollowing-button"),
    `buttons-${multiple}-allfollowing-${action}`
  );
  document.l10n.setAttributes(
    document.getElementById("accept-parent-button"),
    `buttons-${multiple}-parent-${action}`
  );
}
