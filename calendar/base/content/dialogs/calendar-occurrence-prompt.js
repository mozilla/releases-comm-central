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

function getDString(aKey) {
  return cal.l10n.getString("calendar-occurrence-prompt", aKey);
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
  document.title = getDString(`windowtitle.${itemType}.${action}`);
  const title = document.getElementById("title-label");
  if (multiple == "multiple") {
    title.value = getDString("windowtitle.multipleitems");
    document.getElementById("isrepeating-label").value = getDString(
      `header.containsrepeating.${itemType}.label`
    );
  } else {
    title.value = window.arguments[0].items[0].title;
    document.getElementById("isrepeating-label").value = getDString(
      `header.isrepeating.${itemType}.label`
    );
  }

  // Set up buttons
  document.getElementById("accept-buttons-box").setAttribute("action", action);
  document.getElementById("accept-buttons-box").setAttribute("type", itemType);

  document.getElementById("accept-occurrence-button").label = getDString(
    `buttons.${multiple}.occurrence.${action}.label`
  );

  document.getElementById("accept-allfollowing-button").label = getDString(
    `buttons.${multiple}.allfollowing.${action}.label`
  );
  document.getElementById("accept-parent-button").label = getDString(
    `buttons.${multiple}.parent.${action}.label`
  );
}
