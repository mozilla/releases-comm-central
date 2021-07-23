/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file is loaded into the printing options page by calPrintUtils.jsm if
 * we are printing the calendar. It injects a new form (from
 * calendar-tab-panels.inc.xhtml) for choosing the print output. It also
 * contains the javascript for the form.
 */

/* import-globals-from ../../../../toolkit/components/printing/content/print.js */

// In a block to avoid polluting the global scope.
{
  const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

  let ownerWindow = window.browsingContext.topChromeWindow;
  let ownerDocument = ownerWindow.document;

  let otherForm = document.querySelector("form");
  otherForm.hidden = true;

  let form = document.importNode(
    ownerDocument.getElementById("calendarPrintForm").content.firstElementChild,
    true
  );
  form.addEventListener("submit", event => {
    event.preventDefault();
    form.hidden = true;
    otherForm.hidden = false;
  });
  otherForm.parentNode.insertBefore(form, otherForm);

  let eventsCheckbox = form.querySelector("input#events");
  let tasksCheckbox = form.querySelector("input#tasks");
  let tasksNotDueCheckbox = form.querySelector("input#tasks-with-no-due-date");
  let tasksCompletedCheckbox = form.querySelector("input#completed-tasks");

  let layout = form.querySelector("select#layout");
  let fromDate = form.querySelector("select#from-date");
  let toDate = form.querySelector("select#to-date");

  eventsCheckbox.addEventListener("change", updatePreview);
  tasksCheckbox.addEventListener("change", function() {
    tasksNotDueCheckbox.disabled = !this.checked;
    tasksCompletedCheckbox.disabled = !this.checked;
    updatePreview();
  });
  tasksNotDueCheckbox.addEventListener("change", updatePreview);
  tasksCompletedCheckbox.addEventListener("change", updatePreview);

  layout.addEventListener("change", onLayoutChange);
  fromDate.addEventListener("change", function() {
    let fromValue = parseInt(fromDate.value, 10);
    for (let option of toDate.options) {
      option.hidden = option.value < fromValue;
    }
    if (toDate.value < fromValue) {
      toDate.value = fromValue;
    }

    updatePreview();
  });
  toDate.addEventListener("change", updatePreview);

  // Ensure the layout selector is focussed and has a focus ring to make it
  // more obvious. The ring won't be added if already focussed, so blur first.
  requestAnimationFrame(() => {
    layout.blur();
    Services.focus.setFocus(layout, Services.focus.FLAG_SHOWRING);
  });

  /** Show something in the preview as soon as it is ready. */
  function updateWhenReady() {
    document.removeEventListener("page-count", updateWhenReady);
    onLayoutChange();
  }
  document.addEventListener("page-count", updateWhenReady);

  /**
   * Update the available date options to sensible ones for the selected layout.
   * It would be nice to use HTML date inputs here but the browser this form is
   * loaded into won't allow it. Instead use lists of the most likely values,
   * which actually fits better for some print layouts.
   */
  function onLayoutChange() {
    while (fromDate.lastChild) {
      fromDate.lastChild.remove();
    }
    while (toDate.lastChild) {
      toDate.lastChild.remove();
    }

    if (layout.value == "weekPlanner") {
      const FIRST_WEEK = -6;
      const LAST_WEEK = 53;

      // Always use Monday - Sunday week, regardless of prefs, because the layout requires it.
      let monday = cal.dtz.now();
      monday.isDate = true;
      monday.day = monday.day - monday.weekday + 1 + FIRST_WEEK * 7;

      for (let i = FIRST_WEEK; i < LAST_WEEK; i++) {
        let option = document.createElement("option");
        option.value = i;
        option.label = cal.dtz.formatter.formatDateLong(monday);
        fromDate.appendChild(option.cloneNode(false));

        let sunday = monday.clone();
        sunday.day += 6;
        option.label = cal.dtz.formatter.formatDateLong(sunday);
        option.hidden = i < 0;
        toDate.appendChild(option);

        monday.day += 7;
      }
    } else {
      const FIRST_MONTH = -3;
      const LAST_MONTH = 12;

      let first = cal.dtz.now();
      first.isDate = true;
      first.day = 1;
      first.month += FIRST_MONTH;

      for (let i = FIRST_MONTH; i < LAST_MONTH; i++) {
        let option = document.createElement("option");
        option.value = i;
        let monthName = cal.l10n.formatMonth(first.month + 1, "calendar", "monthInYear");
        option.label = cal.l10n.getCalString("monthInYear", [monthName, first.year]);
        fromDate.appendChild(option.cloneNode(false));

        option.hidden = i < 0;
        toDate.appendChild(option);

        first.month++;
      }
    }

    fromDate.value = toDate.value = 0;

    updatePreview();
  }

  /**
   * Read the selected options and update the preview document.
   */
  async function updatePreview() {
    let startDate = cal.dtz.now();
    startDate.isDate = true;
    let endDate = cal.dtz.now();
    endDate.isDate = true;

    if (layout.value == "weekPlanner") {
      startDate.day = startDate.day - startDate.weekday + 1;
      startDate.day += parseInt(fromDate.value, 10) * 7;
      endDate.day = endDate.day - endDate.weekday + 1;
      endDate.day += parseInt(toDate.value, 10) * 7 + 7;
    } else {
      startDate.day = 1;
      startDate.month += parseInt(fromDate.value, 10);
      endDate.day = 1;
      endDate.month += parseInt(toDate.value, 10) + 1;
    }

    let filter = 0;
    if (tasksCheckbox.checked) {
      filter |= Ci.calICalendar.ITEM_FILTER_TYPE_TODO;
      if (tasksCompletedCheckbox.checked) {
        filter |= Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL;
      } else {
        filter |= Ci.calICalendar.ITEM_FILTER_COMPLETED_NO;
      }
    }

    if (eventsCheckbox.checked) {
      filter |=
        Ci.calICalendar.ITEM_FILTER_TYPE_EVENT | Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES;
    }

    await cal.print.draw(
      PrintEventHandler.printPreviewEl.querySelector("browser").contentDocument,
      layout.value,
      startDate,
      endDate,
      filter,
      tasksNotDueCheckbox.checked
    );
    PrintEventHandler._updatePrintPreview();
  }
}
