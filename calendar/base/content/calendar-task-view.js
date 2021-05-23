/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported taskDetailsView, sendMailToOrganizer, taskViewCopyLink */

/* import-globals-from ../../../mail/base/content/mailCore.js */
/* import-globals-from item-editing/calendar-item-editing.js */
/* import-globals-from calendar-ui-utils.js */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { recurrenceRule2String } = ChromeUtils.import(
  "resource:///modules/calendar/calRecurrenceUtils.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

var taskDetailsView = {
  /**
   * Task Details Events
   *
   * XXXberend Please document this function, possibly also consolidate since
   * its the only function in taskDetailsView.
   */
  onSelect(event) {
    function displayElement(id, flag) {
      document.getElementById(id).hidden = !flag;
      return flag;
    }

    let dateFormatter = cal.dtz.formatter;

    let item = document.getElementById("calendar-task-tree").currentTask;
    if (
      displayElement("calendar-task-details-container", item != null) &&
      displayElement("calendar-task-view-splitter", item != null)
    ) {
      document.getElementById("calendar-task-details-title-row").toggleAttribute("hidden", false);
      document.getElementById("calendar-task-details-title").textContent = item.title
        ? item.title.replace(/\n/g, " ")
        : "";

      let organizer = item.organizer;
      if (
        !document
          .getElementById("calendar-task-details-organizer-row")
          .toggleAttribute("hidden", !organizer)
      ) {
        let name = organizer.commonName;
        if (!name || name.length <= 0) {
          if (organizer.id && organizer.id.length) {
            name = organizer.id;
            let re = new RegExp("^mailto:(.*)", "i");
            let matches = re.exec(name);
            if (matches) {
              name = matches[1];
            }
          }
        }
        if (
          !document
            .getElementById("calendar-task-details-organizer-row")
            .toggleAttribute("hidden", !name)
        ) {
          document.getElementById("calendar-task-details-organizer").textContent = name;
        }
      }

      let priority = 0;
      if (item.calendar.getProperty("capabilities.priority.supported")) {
        priority = parseInt(item.priority, 10);
      }
      document
        .getElementById("calendar-task-details-priority-row")
        .toggleAttribute("hidden", priority == 0);
      displayElement("calendar-task-details-priority-low", priority >= 6 && priority <= 9);
      displayElement("calendar-task-details-priority-normal", priority == 5);
      displayElement("calendar-task-details-priority-high", priority >= 1 && priority <= 4);

      let status = item.getProperty("STATUS");
      if (
        !document
          .getElementById("calendar-task-details-status-row")
          .toggleAttribute("hidden", !status)
      ) {
        let statusDetails = document.getElementById("calendar-task-details-status");
        switch (status) {
          case "NEEDS-ACTION": {
            statusDetails.textContent = cal.l10n.getCalString("taskDetailsStatusNeedsAction");
            break;
          }
          case "IN-PROCESS": {
            let percent = 0;
            let property = item.getProperty("PERCENT-COMPLETE");
            if (property != null) {
              percent = parseInt(property, 10);
            }
            statusDetails.textContent = cal.l10n.getCalString("taskDetailsStatusInProgress", [
              percent,
            ]);
            break;
          }
          case "COMPLETED": {
            if (item.completedDate) {
              let completedDate = item.completedDate.getInTimezone(cal.dtz.defaultTimezone);
              statusDetails.textContent = cal.l10n.getCalString("taskDetailsStatusCompletedOn", [
                dateFormatter.formatDateTime(completedDate),
              ]);
            }
            break;
          }
          case "CANCELLED": {
            statusDetails.textContent = cal.l10n.getCalString("taskDetailsStatusCancelled");
            break;
          }
          default: {
            document
              .getElementById("calendar-task-details-status-row")
              .toggleAttribute("hidden", true);
            break;
          }
        }
      }
      let categories = item.getCategories();
      if (
        !document
          .getElementById("calendar-task-details-category-row")
          .toggleAttribute("hidden", categories.length == 0)
      ) {
        document.getElementById("calendar-task-details-category").textContent = categories.join(
          ", "
        );
      }

      let taskStartDate = item[cal.dtz.startDateProp(item)];
      if (taskStartDate) {
        document.getElementById("task-start-date").textContent = cal.dtz.getStringForDateTime(
          taskStartDate
        );
      }
      document.getElementById("task-start-row").toggleAttribute("hidden", !taskStartDate);

      let taskDueDate = item[cal.dtz.endDateProp(item)];
      if (taskDueDate) {
        document.getElementById("task-due-date").textContent = cal.dtz.getStringForDateTime(
          taskDueDate
        );
      }
      document.getElementById("task-due-row").toggleAttribute("hidden", !taskDueDate);

      let parentItem = item;
      if (parentItem.parentItem != parentItem) {
        // XXXdbo Didn't we want to get rid of these checks?
        parentItem = parentItem.parentItem;
      }
      let recurrenceInfo = parentItem.recurrenceInfo;
      let recurStart = parentItem.recurrenceStartDate;
      if (
        !document
          .getElementById("calendar-task-details-repeat-row")
          .toggleAttribute("hidden", !recurrenceInfo || !recurStart)
      ) {
        let kDefaultTimezone = cal.dtz.defaultTimezone;
        let startDate = recurStart.getInTimezone(kDefaultTimezone);
        let endDate = item.dueDate ? item.dueDate.getInTimezone(kDefaultTimezone) : null;
        let detailsString = recurrenceRule2String(
          recurrenceInfo,
          startDate,
          endDate,
          startDate.isDate
        );
        if (detailsString) {
          let rpv = document.getElementById("calendar-task-details-repeat");
          rpv.textContent = detailsString.split("\n").join(" ");
        }
      }
      let textbox = document.getElementById("calendar-task-details-description");
      let description = item.hasProperty("DESCRIPTION") ? item.getProperty("DESCRIPTION") : null;
      textbox.value = description;
      textbox.readOnly = true;
      let attachmentRows = document.getElementById("calendar-task-details-attachment-rows");
      while (attachmentRows.lastChild) {
        attachmentRows.lastChild.remove();
      }
      let attachments = item.getAttachments();
      if (displayElement("calendar-task-details-attachment-row", attachments.length > 0)) {
        displayElement("calendar-task-details-attachment-rows", true);
        for (let attachment of attachments) {
          let url = attachment.calIAttachment.uri.spec;
          let urlLabel = document.createXULElement("label");
          urlLabel.setAttribute("class", "text-link");
          urlLabel.setAttribute("value", url);
          urlLabel.setAttribute("tooltiptext", url);
          urlLabel.setAttribute("crop", "end");
          urlLabel.setAttribute("onclick", "if (event.button != 2) launchBrowser(this.value);");
          urlLabel.setAttribute("context", "taskview-link-context-menu");
          attachmentRows.appendChild(urlLabel);
        }
      }
    }
  },

  loadCategories() {
    let categoryPopup = document.getElementById("task-actions-category-popup");
    let item = document.getElementById("calendar-task-tree").currentTask;

    let itemCategories = item.getCategories();
    let categoryList = cal.category.fromPrefs();
    for (let cat of itemCategories) {
      if (!categoryList.includes(cat)) {
        categoryList.push(cat);
      }
    }
    cal.l10n.sortArrayByLocaleCollator(categoryList);

    let maxCount = item.calendar.getProperty("capabilities.categories.maxCount");

    while (categoryPopup.childElementCount > 2) {
      categoryPopup.lastChild.remove();
    }
    if (maxCount == 1) {
      let menuitem = document.createXULElement("menuitem");
      menuitem.setAttribute("class", "menuitem-iconic");
      menuitem.setAttribute("label", cal.l10n.getCalString("None"));
      menuitem.setAttribute("type", "radio");
      if (itemCategories.length === 0) {
        menuitem.setAttribute("checked", "true");
      }
      categoryPopup.appendChild(menuitem);
    }
    for (let cat of categoryList) {
      let menuitem = document.createXULElement("menuitem");
      menuitem.setAttribute("class", "menuitem-iconic calendar-category");
      menuitem.setAttribute("label", cat);
      menuitem.setAttribute("value", cat);
      menuitem.setAttribute("type", maxCount === null || maxCount > 1 ? "checkbox" : "radio");
      if (itemCategories.includes(cat)) {
        menuitem.setAttribute("checked", "true");
      }
      categoryPopup.appendChild(menuitem);
    }
  },

  saveCategories(event) {
    let categoryPopup = document.getElementById("task-actions-category-popup");
    let item = document.getElementById("calendar-task-tree").currentTask;

    let oldCategories = item.getCategories();
    let categories = Array.from(
      categoryPopup.querySelectorAll("menuitem.calendar-category[checked]"),
      menuitem => menuitem.value
    );
    let unchanged = oldCategories.length == categories.length;
    for (let i = 0; unchanged && i < categories.length; i++) {
      unchanged = oldCategories[i] == categories[i];
    }

    if (!unchanged) {
      let newItem = item.clone();
      newItem.setCategories(categories);
      doTransaction("modify", newItem, newItem.calendar, item, null);
      return false;
    }

    return true;
  },

  categoryTextboxKeypress(event) {
    let category = event.target.value;
    let categoryPopup = document.getElementById("task-actions-category-popup");

    switch (event.key) {
      case " ": {
        // The menu popup seems to eat this keypress.
        let start = event.target.selectionStart;
        event.target.value =
          category.substring(0, start) + " " + category.substring(event.target.selectionEnd);
        event.target.selectionStart = event.target.selectionEnd = start + 1;
        return;
      }
      case "Tab":
      case "ArrowDown":
      case "ArrowUp": {
        event.target.blur();
        event.preventDefault();

        let key = event.key == "ArrowUp" ? "ArrowUp" : "ArrowDown";
        categoryPopup.dispatchEvent(new KeyboardEvent("keydown", { key }));
        categoryPopup.dispatchEvent(new KeyboardEvent("keyup", { key }));
        return;
      }
      case "Escape":
        if (category) {
          event.target.value = "";
        } else {
          categoryPopup.hidePopup();
        }
        event.preventDefault();
        return;
      case "Enter":
        category = category.trim();
        if (category != "") {
          break;
        }
        return;
      default: {
        return;
      }
    }

    event.preventDefault();

    let categoryList = categoryPopup.querySelectorAll("menuitem.calendar-category");
    let categories = Array.from(categoryList, cat => cat.getAttribute("value"));

    let modified = false;
    let newIndex = categories.indexOf(category);
    if (newIndex > -1) {
      if (categoryList[newIndex].getAttribute("checked") != "true") {
        categoryList[newIndex].setAttribute("checked", "true");
        modified = true;
      }
    } else {
      const localeCollator = new Intl.Collator();
      let compare = localeCollator.compare;
      newIndex = cal.data.binaryInsert(categories, category, compare, true);

      let item = document.getElementById("calendar-task-tree").currentTask;
      let maxCount = item.calendar.getProperty("capabilities.categories.maxCount");

      let menuitem = document.createXULElement("menuitem");
      menuitem.setAttribute("class", "menuitem-iconic calendar-category");
      menuitem.setAttribute("label", category);
      menuitem.setAttribute("value", category);
      menuitem.setAttribute("type", maxCount === null || maxCount > 1 ? "checkbox" : "radio");
      menuitem.setAttribute("checked", true);
      categoryPopup.insertBefore(menuitem, categoryList[newIndex]);

      modified = true;
    }

    if (modified) {
      categoryList = categoryPopup.querySelectorAll("menuitem.calendar-category[checked]");
      categories = Array.from(categoryList, cat => cat.getAttribute("value"));

      let item = document.getElementById("calendar-task-tree").currentTask;
      let newItem = item.clone();
      newItem.setCategories(categories);
      doTransaction("modify", newItem, newItem.calendar, item, null);
    }

    event.target.value = "";
  },
};

/**
 * Updates the currently applied filter for the task view and refreshes the task
 * tree.
 *
 * @param {String} [filter] - The filter name to set.
 */
function taskViewUpdate(filter) {
  if (!filter) {
    let taskFilterGroup = document.getElementById("task-tree-filtergroup");
    filter = taskFilterGroup.value || "all";
  }

  let tree = document.getElementById("calendar-task-tree");
  let oldFilter = tree.getAttribute("filterValue");
  if (filter != oldFilter) {
    tree.setAttribute("filterValue", filter);
    document
      .querySelectorAll(
        `menuitem[command="calendar_task_filter_command"][type="radio"],
         toolbarbutton[command="calendar_task_filter_command"][type="radio"]`
      )
      .forEach(item => {
        if (item.getAttribute("value") == filter) {
          item.setAttribute("checked", "true");
        } else {
          item.removeAttribute("checked");
        }
      });
    let radio = document.querySelector(
      `radio[command="calendar_task_filter_command"][value="${filter}"]`
    );
    if (radio) {
      radio.radioGroup.selectedItem = radio;
    }
  }
  tree.updateFilter(filter);
}

/**
 * Prepares a dialog to send an email to the organizer of the currently selected
 * task in the task view.
 *
 * XXX We already have a function with this name in the event dialog. Either
 * consolidate or make name more clear.
 */
function sendMailToOrganizer() {
  let item = document.getElementById("calendar-task-tree").currentTask;
  if (item != null) {
    let organizer = item.organizer;
    let email = cal.email.getAttendeeEmail(organizer, true);
    let emailSubject = cal.l10n.getString("calendar-event-dialog", "emailSubjectReply", [
      item.title,
    ]);
    let identity = item.calendar.getProperty("imip.identity");
    cal.email.sendTo(email, emailSubject, null, identity);
  }
}

// Install event listeners for the display deck change and connect task tree to filter field
function taskViewOnLoad() {
  let calendarDisplayBox = document.getElementById("calendarDisplayBox");
  let tree = document.getElementById("calendar-task-tree");

  if (calendarDisplayBox && tree) {
    tree.textFilterField = "task-text-filter-field";

    // setup the platform-dependent placeholder for the text filter field
    let textFilter = document.getElementById("task-text-filter-field");
    if (textFilter) {
      let base = textFilter.getAttribute("emptytextbase");
      let keyLabel = textFilter.getAttribute(
        AppConstants.platform == "macosx" ? "keyLabelMac" : "keyLabelNonMac"
      );

      textFilter.setAttribute("placeholder", base.replace("#1", keyLabel));
      textFilter.value = "";
    }
    taskViewUpdate();
  }

  // Setup customizeDone handler for the task action toolbox.
  let toolbox = document.getElementById("task-actions-toolbox");
  toolbox.customizeDone = function(aEvent) {
    MailToolboxCustomizeDone(aEvent, "CustomizeTaskActionsToolbar");
  };

  Services.obs.notifyObservers(window, "calendar-taskview-startup-done");
}

/**
 * Copy the value of the given link node to the clipboard
 *
 * @param linkNode      The node containing the value to copy to the clipboard
 */
function taskViewCopyLink(linkNode) {
  if (linkNode) {
    let linkAddress = linkNode.value;
    let clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
    clipboard.copyString(linkAddress);
  }
}
