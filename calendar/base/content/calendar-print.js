/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file is loaded into the printing options page by calPrintUtils.sys.mjs if
 * we are printing the calendar. It injects a new form (from
 * calendar-tab-panels.inc.xhtml) for choosing the print output. It also
 * contains the javascript for the form.
 */

/* import-globals-from ../../../../toolkit/components/printing/content/print.js */

const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

// In a block to avoid polluting the global scope.
{
  const ownerWindow = window.browsingContext.topChromeWindow;
  const ownerDocument = ownerWindow.document;

  for (const href of [
    "chrome://messenger/skin/icons.css",
    "chrome://messenger/skin/variables.css",
    "chrome://messenger/skin/widgets.css",
    "chrome://calendar/skin/shared/widgets/minimonth.css",
  ]) {
    const link = document.head.appendChild(document.createElement("link"));
    link.rel = "stylesheet";
    link.href = href;
  }

  document.l10n.addResourceIds(["calendar/calendar.ftl"]);

  const otherForm = document.querySelector("form");
  otherForm.hidden = true;

  const form = document.importNode(
    ownerDocument.getElementById("calendarPrintForm").content.firstElementChild,
    true
  );
  if (AppConstants.platform != "win") {
    // Move the Next button to the end if this isn't Windows.
    const nextButton = form.querySelector("#next-button");
    nextButton.parentElement.append(nextButton);
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    form.hidden = true;
    otherForm.hidden = false;
  });
  otherForm.parentNode.insertBefore(form, otherForm);

  const backButton = form.querySelector("#back-button");
  backButton.addEventListener("click", () => {
    otherForm.hidden = true;
    form.hidden = false;
  });
  const backButtonContainer = form.querySelector("#back-button-container");
  const printButtonContainer = otherForm.querySelector("#button-container");
  printButtonContainer.parentNode.insertBefore(backButtonContainer, printButtonContainer);

  const eventsCheckbox = form.querySelector("input#events");
  const tasksCheckbox = form.querySelector("input#tasks");
  const tasksNotDueCheckbox = form.querySelector("input#tasks-with-no-due-date");
  const tasksCompletedCheckbox = form.querySelector("input#completed-tasks");

  const layout = form.querySelector("select#layout");

  const fromMinimonth = form.querySelector("calendar-minimonth#from-minimonth");
  const fromMonth = form.querySelector("select#from-month");
  const fromYear = form.querySelector("input#from-year");
  const fromDate = form.querySelector("select#from-date");

  const toMinimonth = form.querySelector("calendar-minimonth#to-minimonth");
  const toMonth = form.querySelector("select#to-month");
  const toYear = form.querySelector("input#to-year");
  const toDate = form.querySelector("select#to-date");

  for (let i = 0; i < 12; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.label = cal.dtz.formatter.monthNames[i];
    fromMonth.appendChild(option.cloneNode(false));
    toMonth.appendChild(option);
  }

  eventsCheckbox.addEventListener("change", updatePreview);
  tasksCheckbox.addEventListener("change", function () {
    tasksNotDueCheckbox.disabled = !this.checked;
    tasksCompletedCheckbox.disabled = !this.checked;
    updatePreview();
  });
  tasksNotDueCheckbox.addEventListener("change", updatePreview);
  tasksCompletedCheckbox.addEventListener("change", updatePreview);

  layout.addEventListener("change", onLayoutChange);

  fromMinimonth.addEventListener("change", function () {
    if (toMinimonth.value < fromMinimonth.value) {
      toMinimonth.value = fromMinimonth.value;
    }

    updatePreview();
  });
  toMinimonth.addEventListener("change", updatePreview);

  fromMonth.addEventListener("keydown", function (event) {
    if (event.key == "ArrowDown" && fromMonth.selectedIndex == 11) {
      fromMonth.selectedIndex = 0;
      fromYear.value++;
      onMonthChange();
      event.preventDefault();
    } else if (event.key == "ArrowUp" && fromMonth.selectedIndex == 0) {
      fromMonth.selectedIndex = 11;
      fromYear.value--;
      onMonthChange();
      event.preventDefault();
    }
  });
  fromMonth.addEventListener("change", onMonthChange);
  fromYear.addEventListener("change", onMonthChange);
  toMonth.addEventListener("keydown", function (event) {
    if (event.key == "ArrowDown" && toMonth.selectedIndex == 11) {
      toMonth.selectedIndex = 0;
      toYear.value++;
      onMonthChange();
      event.preventDefault();
    } else if (event.key == "ArrowUp" && toMonth.selectedIndex == 0) {
      toMonth.selectedIndex = 11;
      toYear.value--;
      onMonthChange();
      event.preventDefault();
    }
  });
  toMonth.addEventListener("change", onMonthChange);
  toYear.addEventListener("change", onMonthChange);

  fromDate.addEventListener("change", function () {
    const fromValue = parseInt(fromDate.value, 10);
    for (const option of toDate.options) {
      option.hidden = option.value < fromValue;
    }
    if (toDate.value < fromValue) {
      toDate.value = fromValue;
    }

    updatePreview();
  });
  toDate.addEventListener("change", updatePreview);

  // Ensure the layout selector is focused and has a focus ring to make it
  // more obvious. The ring won't be added if already focused, so blur first.
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
    if (layout.value == "list") {
      fromMinimonth.hidden = toMinimonth.hidden = false;
      fromMonth.hidden = fromYear.hidden = toMonth.hidden = toYear.hidden = true;
      fromDate.hidden = toDate.hidden = true;
    } else if (layout.value == "monthGrid") {
      const today = new Date();
      fromMonth.value = toMonth.value = today.getMonth();
      fromYear.value = toYear.value = today.getFullYear();

      fromMinimonth.hidden = toMinimonth.hidden = true;
      fromMonth.hidden = fromYear.hidden = toMonth.hidden = toYear.hidden = false;
      fromDate.hidden = toDate.hidden = true;
    } else {
      const FIRST_WEEK = -53;
      const LAST_WEEK = 53;

      while (fromDate.lastChild) {
        fromDate.lastChild.remove();
      }
      while (toDate.lastChild) {
        toDate.lastChild.remove();
      }

      // Always use Monday - Sunday week, regardless of prefs, because the layout requires it.
      const monday = cal.dtz.now();
      monday.isDate = true;
      monday.day = monday.day - monday.weekday + 1 + FIRST_WEEK * 7;

      for (let i = FIRST_WEEK; i < LAST_WEEK; i++) {
        const option = document.createElement("option");
        option.value = i;
        option.label = cal.dtz.formatter.formatDateLong(monday);
        fromDate.appendChild(option.cloneNode(false));

        const sunday = monday.clone();
        sunday.day += 6;
        option.label = cal.dtz.formatter.formatDateLong(sunday);
        option.hidden = i < 0;
        toDate.appendChild(option);

        monday.day += 7;
      }

      fromDate.value = toDate.value = 0;

      fromMinimonth.hidden = toMinimonth.hidden = true;
      fromMonth.hidden = fromYear.hidden = toMonth.hidden = toYear.hidden = true;
      fromDate.hidden = toDate.hidden = false;
    }

    updatePreview();
  }

  function onMonthChange() {
    if (parseInt(toYear.value, 10) < fromYear.value) {
      toYear.value = fromYear.value;
      toMonth.value = fromMonth.value;
    } else if (toYear.value == fromYear.value && parseInt(toMonth.value, 10) < fromMonth.value) {
      toMonth.value = fromMonth.value;
    }
    updatePreview();
  }

  /**
   * Read the selected options and update the preview document.
   */
  async function updatePreview() {
    const startDate = cal.dtz.now();
    startDate.isDate = true;
    let endDate = cal.dtz.now();
    endDate.isDate = true;

    if (layout.value == "list") {
      const fromValue = fromMinimonth.value;
      const toValue = toMinimonth.value;

      startDate.resetTo(
        fromValue.getFullYear(),
        fromValue.getMonth(),
        fromValue.getDate(),
        0,
        0,
        0,
        cal.dtz.floating
      );
      startDate.isDate = true;
      if (toValue > fromValue) {
        endDate.resetTo(
          toValue.getFullYear(),
          toValue.getMonth(),
          toValue.getDate(),
          0,
          0,
          0,
          cal.dtz.floating
        );
        endDate.isDate = true;
      } else {
        endDate = startDate.clone();
      }
      endDate.day++;
    } else if (layout.value == "monthGrid") {
      startDate.day = 1;
      startDate.month = parseInt(fromMonth.value, 10);
      startDate.year = parseInt(fromYear.value, 10);
      endDate.day = 1;
      endDate.month = parseInt(toMonth.value, 10);
      endDate.year = parseInt(toYear.value, 10);
      endDate.month++;
    } else {
      startDate.day = startDate.day - startDate.weekday + 1;
      startDate.day += parseInt(fromDate.value, 10) * 7;
      endDate.day = endDate.day - endDate.weekday + 1;
      endDate.day += parseInt(toDate.value, 10) * 7 + 7;
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
