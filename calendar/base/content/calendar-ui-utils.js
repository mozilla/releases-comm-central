/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported disableElementWithLock,
 *          enableElementWithLock,
 *          appendCalendarItems, checkRadioControl,
 *          checkRadioControlAppmenu,
 *          updateUnitLabelPlural, updateMenuLabelsPlural,
 *          getOptimalMinimumWidth, getOptimalMinimumHeight,
 *          setupAttendanceMenu
 */

/* import-globals-from ../../../mail/base/content/globalOverlay.js */
/* import-globals-from ../../../mail/base/content/utilityOverlay.js */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");
var lazy = {};
ChromeUtils.defineLazyGetter(lazy, "l10n", () => new Localization(["calendar/calendar.ftl"], true));

/**
 * This function unconditionally disables the element for
 * which the id has been passed as argument. Furthermore, it
 * remembers who was responsible for this action by using
 * the given key (lockId). In case the control should be
 * enabled again the lock gets removed, but the control only
 * gets enabled if *all* possibly held locks have been removed.
 *
 * @param elementId     The element ID of the element to disable.
 * @param lockId        The ID of the lock to set.
 */
function disableElementWithLock(elementId, lockId) {
  // unconditionally disable the element.
  document.getElementById(elementId).setAttribute("disabled", "true");

  // remember that this element has been locked with
  // the key passed as argument. we keep a primitive
  // form of ref-count in the attribute 'lock'.
  const element = document.getElementById(elementId);
  if (element) {
    if (!element.hasAttribute(lockId)) {
      element.setAttribute(lockId, "true");
      const n = parseInt(element.getAttribute("lock") || 0, 10);
      element.setAttribute("lock", n + 1);
    }
  }
}

/**
 * This function is intended to be used in tandem with the
 * above defined function 'disableElementWithLock()'.
 * See the respective comment for further details.
 *
 * @see disableElementWithLock
 * @param elementId     The element ID of the element to enable.
 * @param lockId        The ID of the lock to set.
 */
function enableElementWithLock(elementId, lockId) {
  const element = document.getElementById(elementId);
  if (!element) {
    dump("unable to find " + elementId + "\n");
    return;
  }

  if (element.hasAttribute(lockId)) {
    element.removeAttribute(lockId);
    const n = parseInt(element.getAttribute("lock") || 0, 10) - 1;
    if (n > 0) {
      element.setAttribute("lock", n);
    } else {
      element.removeAttribute("lock");
    }
    if (n <= 0) {
      element.removeAttribute("disabled");
    }
  }
}

/**
 * Sorts a sorted array of calendars by pref |calendar.list.sortOrder|.
 * Repairs that pref if dangling entries exist.
 *
 * @param calendars     An array of calendars to sort.
 */
function sortCalendarArray(calendars) {
  const ret = calendars.concat([]);
  const sortOrder = {};
  const sortOrderPref = Services.prefs.getStringPref("calendar.list.sortOrder", "").split(" ");
  for (let i = 0; i < sortOrderPref.length; ++i) {
    sortOrder[sortOrderPref[i]] = i;
  }
  function sortFunc(cal1, cal2) {
    const orderIdx1 = sortOrder[cal1.id] || -1;
    const orderIdx2 = sortOrder[cal2.id] || -1;
    if (orderIdx1 < orderIdx2) {
      return -1;
    }
    if (orderIdx1 > orderIdx2) {
      return 1;
    }
    return 0;
  }
  ret.sort(sortFunc);

  // check and repair pref when an array of all calendars has been passed:
  const sortOrderString = Services.prefs.getStringPref("calendar.list.sortOrder", "");
  const wantedOrderString = ret.map(calendar => calendar.id).join(" ");
  if (wantedOrderString != sortOrderString && cal.manager.getCalendars().length == ret.length) {
    Services.prefs.setStringPref("calendar.list.sortOrder", wantedOrderString);
  }

  return ret;
}

/**
 * Fills up a menu - either a menupopup or a menulist - with menuitems that refer
 * to calendars.
 *
 * @param aItem                 The event or task
 * @param aCalendarMenuParent   The direct parent of the menuitems - either a
 *                                menupopup or a menulist
 * @param aCalendarToUse        The default-calendar
 * @param aOnCommand            A string that is applied to the "oncommand"
 *                                attribute of each menuitem
 * @returns The index of the calendar that matches the
 *                                default-calendar. By default 0 is returned.
 */
function appendCalendarItems(aItem, aCalendarMenuParent, aCalendarToUse, aOnCommand) {
  const calendarToUse = aCalendarToUse || aItem.calendar;
  const calendars = sortCalendarArray(cal.manager.getCalendars());
  let indexToSelect = 0;
  let index = -1;
  for (let i = 0; i < calendars.length; ++i) {
    const calendar = calendars[i];
    if (
      calendar.id == calendarToUse.id ||
      (calendar &&
        cal.acl.isCalendarWritable(calendar) &&
        (cal.acl.userCanAddItemsToCalendar(calendar) ||
          (calendar == aItem.calendar && cal.acl.userCanModifyItem(aItem))) &&
        cal.item.isItemSupported(aItem, calendar))
    ) {
      const menuitem = addMenuItem(aCalendarMenuParent, calendar.name, calendar.name);
      menuitem.calendar = calendar;
      index++;
      if (aOnCommand) {
        menuitem.setAttribute("oncommand", aOnCommand);
      }
      if (calendarToUse && calendarToUse.id == calendar.id) {
        indexToSelect = index;
      }
      const cssSafeId = cal.view.formatStringForCSSRule(calendar.id);
      menuitem.style.setProperty("--item-color", `var(--calendar-${cssSafeId}-backcolor)`);
      menuitem.classList.add("menuitem-iconic");
    }
  }
  return indexToSelect;
}

/**
 * Helper function to add a menuitem to a menulist or similar.
 *
 * @param aParent     The XUL node to add the menuitem to.
 * @param aLabel      The label string of the menuitem.
 * @param aValue      The value attribute of the menuitem.
 * @param aCommand    The oncommand attribute of the menuitem.
 * @returns The newly created menuitem
 */
function addMenuItem(aParent, aLabel, aValue, aCommand) {
  let item = null;
  if (aParent.localName == "menupopup") {
    item = document.createXULElement("menuitem");
    item.setAttribute("type", "checkbox");
    item.setAttribute("label", aLabel);
    if (aValue) {
      item.setAttribute("value", aValue);
    }
    if (aCommand) {
      item.command = aCommand;
    }
    aParent.appendChild(item);
  } else if (aParent.localName == "menulist") {
    item = aParent.appendItem(aLabel, aValue);
  }
  return item;
}

/**
 * Gets the correct plural form of a given unit.
 *
 * @param aLength         The number to use to determine the plural form
 * @param aUnit           The unit to find the plural form of
 * @param aIncludeLength  (optional) If true, the length will be included in the
 *                          result. If false, only the pluralized unit is returned.
 * @returns A string containing the pluralized version of the unit
 */
function unitPluralForm(aLength, aUnit, aIncludeLength = true) {
  const unitProp =
    {
      minutes: "event-duration-unit-minutes",
      hours: "event-duration-unit-hours",
      days: "event-duration-unit-days",
      weeks: "event-duration-unit-weeks",
    }[aUnit] || "event-duration-unit-minutes";
  const unitString = lazy.l10n.formatValueSync(unitProp, { count: aLength });
  if (aIncludeLength) {
    return unitString;
  }
  return unitString.replace(aLength, "").trim();
}

/**
 * Update the given unit label to show the correct plural form.
 *
 * @param aLengthFieldId     The ID of the element containing the number
 * @param aLabelId           The ID of the label to update.
 * @param aUnit              The unit to use for the label.
 */
function updateUnitLabelPlural(aLengthFieldId, aLabelId, aUnit) {
  const label = document.getElementById(aLabelId);
  const length = Number(document.getElementById(aLengthFieldId).value);

  label.value = unitPluralForm(length, aUnit, false);
}

/**
 * Update the given menu to show the correct plural form in the list.
 *
 * @param aLengthFieldId    The ID of the element containing the number
 * @param aMenuId           The menu to update labels in.
 */
function updateMenuLabelsPlural(aLengthFieldId, aMenuId) {
  const menu = document.getElementById(aMenuId);
  const length = Number(document.getElementById(aLengthFieldId).value);

  // update the menu items
  const items = menu.getElementsByTagName("menuitem");
  for (const menuItem of items) {
    menuItem.label = unitPluralForm(length, menuItem.value, false);
  }

  // force the menu selection to redraw
  const saveSelectedIndex = menu.selectedIndex;
  menu.selectedIndex = -1;
  menu.selectedIndex = saveSelectedIndex;
}

/**
 * A helper function to calculate and add up certain css-values of a box.
 * It is required, that all css values can be converted to integers
 * see also
 * http://www.w3.org/TR/DOM-Level-2-Style/css.html#CSS-CSSview-getComputedStyle
 *
 * @param aXULElement   The xul element to be inspected.
 * @param aStyleProps   The css style properties for which values are to be retrieved
 *                        e.g. 'font-size', 'min-width" etc.
 * @returns An integer value denoting the optimal minimum width
 */
function getSummarizedStyleValues(aXULElement, aStyleProps) {
  let retValue = 0;
  const cssStyleDeclares = document.defaultView.getComputedStyle(aXULElement);
  for (const prop of aStyleProps) {
    retValue += parseInt(cssStyleDeclares.getPropertyValue(prop), 10);
  }
  return retValue;
}

/**
 * Calculates the optimal minimum width based on the set css style-rules
 * by considering the css rules for the min-width, padding, border, margin
 * and border of the box.
 *
 * @param aXULElement   The xul element to be inspected.
 * @returns An integer value denoting the optimal minimum width
 */
function getOptimalMinimumWidth(aXULElement) {
  return getSummarizedStyleValues(aXULElement, [
    "min-width",
    "padding-left",
    "padding-right",
    "margin-left",
    "margin-top",
    "border-left-width",
    "border-right-width",
  ]);
}

/**
 * Calculates the optimal minimum height based on the set css style-rules
 * by considering the css rules for the font-size, padding, border, margin
 * and border of the box. In its current state the line-height is considered
 * by assuming that it's size is about one third of the size of the font-size
 *
 * @param aXULElement   The xul-element to be inspected.
 * @returns An integer value denoting the optimal minimum height
 */
function getOptimalMinimumHeight(aXULElement) {
  // the following line of code presumes that the line-height is set to "normal"
  // which is supposed to be a "reasonable distance" between the lines
  const firstEntity = parseInt(1.35 * getSummarizedStyleValues(aXULElement, ["font-size"]), 10);
  const secondEntity = getSummarizedStyleValues(aXULElement, [
    "padding-bottom",
    "padding-top",
    "margin-bottom",
    "margin-top",
    "border-bottom-width",
    "border-top-width",
  ]);
  return firstEntity + secondEntity;
}

/**
 * Sets up the attendance context menu, based on the given items
 *
 * @param {Node}  aMenu   The context menu item containing the required
 *                          menu or menuitem elements
 * @param {Array} aItems - An array of the selected calEvent or calTodo
 *                          items to display the context menu for
 */
function setupAttendanceMenu(aMenu, aItems) {
  /**
   * For menu items in scope, a check mark will be annotated corresponding to
   * the partstat and removed for all others
   *
   * The user always selected single items or occurrences of series but never
   * the master event of a series. That said, for the items in aItems, one of
   * following scenarios applies:
   *
   * A. one none-recurring item which have attendees
   * B. multiple none-recurring items which have attendees
   * C. one occurrence of a series which has attendees
   * D. multiple occurrences of the same series which have attendees
   * E. multiple occurrences of different series which have attendees
   * F. mixture of non-recurring and occurrences of one or more series which
   *    have attendees
   * G. any mixture including a single item or an occurrence which doesn't
   *    have any attendees
   *
   * For scenarios A and B, the user will be  prompted with a single set of
   * available partstats and the according options to change it.
   *
   * For C, D and E the user was prompted with a set of partstats for both,
   * the occurrence and the master. In case of E, no partstat information
   * was annotated.
   *
   * For F, only a single set of available partstat options was prompted
   * without annotating any partstat.
   *
   * For G, no context menu would be displayed, so we don't need to deal with
   * that scenario here.
   *
   * Now the following matrix applies to take action of the users choice for
   * the relevant participant (for columns, see explanation below):
   * +---+------------------+-------------+--------+-----------------+
   * | # |     SELECTED     |  DISPLAYED  | STATUS | MENU ACTION     |
   * |   |    CAL ITEMS     |   SUBMENU   | PRESET | APPLIES ON      |
   * +---+------------------+-------------+--------+-----------------+
   * |   |                  |  this-occ*  |   yes  |  selected item  |
   * | A |       one        +-------------+--------+-----------------+
   * |   |   single item    |  all-occ    |           n/a            |
   * |   |                  |             |   menu not displayed     |
   * +---+------------------+-------------+--------+-----------------+
   * |   |                  |  this-occ*  |   no   | selected items  |
   * | B |      multiple    +-------------+--------+-----------------+
   * |   |   single items   |  all-occ    |           n/a            |
   * |   |                  |             |   menu not displayed     |
   * +---+------------------+-------------+--------+-----------------+
   * |   |                  |  this-occ   |   yes  |       sel.      |
   * |   |      one         |             |        |   occurrences   |
   * | C |   occurrence     +-------------+--------+-----------------+
   * |   |   of a master    |  all-occ    |   yes  |  master of sel. |
   * |   |                  |             |        |   occurrence    |
   * +---+------------------+-------------+--------+-----------------+
   * |   |                  |  this-occ   |   no   |       sel.      |
   * |   |     multiple     |             |        |   occurrences   |
   * | D |   occurrences    +-------------+--------+-----------------+
   * |   |  of one master   |  all-occ    |   yes  |  master of sel. |
   * |   |                  |             |        |   occurrences   |
   * +---+------------------+-------------+--------+-----------------+
   * |   |                  |  this-occ   |   no   |       sel.      |
   * |   |     multiple     |             |        |   occurrences   |
   * | E |  occurrences of  +-------------+--------+-----------------+
   * |   | multiple masters |  all-occ    |   no   | masters of sel. |
   * |   |                  |             |        |   occurrences   |
   * +---+------------------+-------------+--------+-----------------+
   * |   | multiple single  |  this-occ*  |   no   | selected items  |
   * |   | and occurrences  |             |        | and occurrences |
   * | F |   of multiple    +-------------+--------+-----------------+
   * |   |     masters      |  all-occ    |           n/a            |
   * |   |                  |             |   menu not displayed     |
   * +---+------------------+-------------+--------------------------+
   * |   | any combination  |                                        |
   * | G | including at     |                  n/a                   |
   * |   | least one items  |       no attendance menu displayed     |
   * |   | or occurrence    |                                        |
   * |   | w/o attendees    |                                        |
   * +---+------------------+----------------------------------------+
   *
   * #:                      scenario as described above
   * SELECTED CAL ITEMS:     item types the user selected to prompt the context
   *                           menu for
   * DISPLAYED SUBMENU:      the subbmenu displayed
   * STATUS PRESET:          whether or not a partstat is annotated to the menu
   *                           items, if the respective submenu is displayed
   * MENU ACTION APPLIES ON: the cal item, the respective partstat should be
   *                           applied on, if the respective submenu is
   *                           displayed
   *
   * this-occ* means that in this cases the submenu label is not displayed -
   * additionally, if status is not preset the menu item for 'NEEDS-ACTIONS'
   * will not be displayed, if the status is already different (consistent
   * how we deal with that case at other places)
   *
   * @param {NodeList}  aMenuItems    A list of DOM nodes
   * @param {string}    aScope        Either 'this-occurrence' or
   *                                    'all-occurrences'
   * @param {string}    aPartStat     A valid participation status
   *                                    as per RfC 5545
   */
  function checkMenuItem(aMenuItems, aScope, aPartStat) {
    const toRemove = [];
    const toAdd = [];
    for (const item of aMenuItems) {
      if (item.getAttribute("scope") == aScope && item.nodeName != "label") {
        if (item.getAttribute("value") == aPartStat) {
          switch (item.nodeName) {
            case "menu": {
              // Since menu elements cannot have checkmarks,
              // we add a menuitem for this partstat and hide
              // the menu element instead
              const checkedId = "checked-" + item.getAttribute("id");
              if (!document.getElementById(checkedId)) {
                const checked = item.ownerDocument.createXULElement("menuitem");
                checked.setAttribute("type", "checkbox");
                checked.setAttribute("checked", "true");
                checked.setAttribute("label", item.getAttribute("label"));
                checked.setAttribute("value", item.getAttribute("value"));
                checked.setAttribute("scope", item.getAttribute("scope"));
                checked.setAttribute("id", checkedId);
                item.setAttribute("hidden", "true");
                toAdd.push([item, checked]);
              }
              break;
            }
            case "menuitem": {
              item.removeAttribute("hidden");
              item.setAttribute("checked", "true");
              break;
            }
          }
        } else if (item.nodeName == "menuitem") {
          if (item.getAttribute("id").startsWith("checked-")) {
            // we inserted a menuitem before for this partstat, so
            // we revert that now
            const menu = document.getElementById(item.getAttribute("id").substr(8));
            menu.removeAttribute("hidden");
            toRemove.push(item);
          } else {
            item.removeAttribute("checked");
          }
        } else if (item.nodeName == "menu") {
          item.removeAttribute("hidden");
        }
      }
    }
    for (const [item, checked] of toAdd) {
      item.before(checked);
    }
    for (const item of toRemove) {
      item.remove();
    }
  }

  /**
   * Hides the items from the provided node list. If a partstat is provided,
   * only the matching item will be hidden
   *
   * @param {NodeList}  aMenuItems    A list of DOM nodes
   * @param {string}    aPartStat     [optional] A valid participation
   *                                    status as per RfC 5545
   */
  function hideItems(aNodeList, aPartStat = null) {
    for (const item of aNodeList) {
      if (aPartStat && aPartStat != item.getAttribute("value")) {
        continue;
      }
      item.setAttribute("hidden", "true");
    }
  }

  /**
   * Provides the user's participation status for a provided item
   *
   * @param   {calEvent|calTodo}  aItem  The calendar item to inspect
   * @returns {?string} The participation status string
   *                                       as per RfC 5545 or null if no
   *                                       participant was detected
   */
  function getInvitationStatus(aItem) {
    let party = null;
    if (cal.itip.isInvitation(aItem)) {
      party = cal.itip.getInvitedAttendee(aItem);
    } else if (aItem.organizer && aItem.getAttendees().length) {
      const calOrgId = aItem.calendar.getProperty("organizerId");
      if (calOrgId && calOrgId.toLowerCase() == aItem.organizer.id.toLowerCase()) {
        party = aItem.organizer;
      }
    }
    return party && (party.participationStatus || "NEEDS-ACTION");
  }

  goUpdateCommand("calendar_attendance_command");

  const singleMenuItems = aMenu.getElementsByAttribute("scope", "this-occurrence");
  const seriesMenuItems = aMenu.getElementsByAttribute("scope", "all-occurrences");
  const labels = aMenu.getElementsByAttribute("class", "calendar-context-heading-label");

  if (aItems.length == 1) {
    // we offer options for both single and recurring items. In case of the
    // latter and the item is an occurrence, we offer status information and
    // actions for both, the occurrence and the series
    const thisPartStat = getInvitationStatus(aItems[0]);

    if (aItems[0].recurrenceId) {
      // we get the partstat - if this is null, no participant could
      // be identified, so we bail out
      const seriesPartStat = getInvitationStatus(aItems[0].parentItem);
      if (seriesPartStat) {
        // let's make sure we display the labels to distinguish series
        // and occurrence
        for (const label of labels) {
          label.removeAttribute("hidden");
        }

        checkMenuItem(seriesMenuItems, "all-occurrences", seriesPartStat);

        if (seriesPartStat != "NEEDS-ACTION") {
          hideItems(seriesMenuItems, "NEEDS-ACTION");
        }
        // until we support actively delegating items, we also only
        // display this status if it is already set
        if (seriesPartStat != "DELEGATED") {
          hideItems(seriesMenuItems, "DELEGATED");
        }
      } else {
        hideItems(seriesMenuItems);
      }
    } else {
      // here we don't need the all-occurrences scope, so let's hide all
      // labels and related menu items
      hideItems(labels);
      hideItems(seriesMenuItems);
    }

    // also for the single occurrence we check whether there's a partstat
    // available and bail out otherwise - we also make sure to not display
    // the NEEDS-ACTION menu item if the current status is already different
    if (thisPartStat) {
      checkMenuItem(singleMenuItems, "this-occurrence", thisPartStat);
      if (thisPartStat != "NEEDS-ACTION") {
        hideItems(singleMenuItems, "NEEDS-ACTION");
      }
      // until we support actively delegating items, we also only display
      // this status if it is already set (by another client or the server)
      if (thisPartStat != "DELEGATED") {
        hideItems(singleMenuItems, "DELEGATED");
      }
    } else {
      // in this case, we hide the entire attendance menu
      aMenu.setAttribute("hidden", "true");
    }
  } else if (aItems.length > 1) {
    // the user displayed a context menu for multiple selected items.
    // The selection might comprise single and recurring events, so we need
    // to deal here with any combination thereof. To do so, we don't display
    // a partstat control for the entire series but only for the selected
    // occurrences. As we have a potential mixture of partstat, we also don't
    // display the current status and no action towards NEEDS-ACTIONS.
    hideItems(labels);
    hideItems(seriesMenuItems);
    hideItems(singleMenuItems, "NEEDS-ACTION");
  } else {
    // there seems to be no item passed in, so we don't display anything
    hideItems(labels);
    hideItems(seriesMenuItems);
    hideItems(singleMenuItems);
  }
}

/**
 * Open the calendar settings to define the weekdays.
 */
function showCalendarWeekPreferences() {
  openPreferencesTab("paneCalendar", "calendarPaneCategory");
}
