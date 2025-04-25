/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-disable import/no-unassigned-import */
import "mail/components/calendar/content/calendar-dialog-categories.mjs";
import "mail/themes/shared/mail/calendar/calendarDialog.css";
/* eslint-enable import/no-unassigned-import */

export default {
  title: "Widgets/Calendar/Categories",
  component: "calendar-dialog-categories",
  tags: ["autodocs"],
};

export const calendarDialogCateogries = {
  render({ categories }) {
    const container = document.createElement("div");
    container.insertAdjacentHTML(
      "beforeend",
      `<template id="calendarDialogCategoriesTemplate">
        <ul class="categories-list"></ul>
        <span class="overflow-label" hidden="hidden"></span>
      </template>
      <calendar-dialog-categories></calendar-dialog-categories>`
    );

    const categoryElement = container.querySelector(
      "calendar-dialog-categories"
    );
    // We need to delay to let the custom element connect and create its shadow
    // root.
    Promise.resolve().then(() => {
      categoryElement.setCategories(categories.split(","));
    });
    return container;
  },
  args: {
    categories: "Lorem,ipsum,dolor,sit,amet",
  },
};
