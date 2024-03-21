/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * View and DOM related helper functions
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.sys.mjs under the cal.view namespace.

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
});
XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "gParserUtils",
  "@mozilla.org/parserutils;1",
  "nsIParserUtils"
);
XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "gTextToHtmlConverter",
  "@mozilla.org/txttohtmlconv;1",
  "mozITXTToHTMLConv"
);
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "calendarSortOrder",
  "calendar.list.sortOrder",
  null,
  null,
  val => (val ? val.split(" ") : [])
);

export var view = {
  /**
   * Returns a parentnode  - or the passed node -  with the given attribute
   * value for the given attributename by traversing up the DOM hierarchy.
   *
   * @param aChildNode      The childnode.
   * @param aAttibuteName   The name of the attribute that is to be compared with
   * @param aAttibuteValue  The value of the attribute that is to be compared with
   * @returns The parent with the given attributeName set that has
   *                          the same value as the given given attributevalue
   *                          'aAttributeValue'. If no appropriate
   *                          parent node can be retrieved it is returned 'null'.
   */
  getParentNodeOrThisByAttribute(aChildNode, aAttributeName, aAttributeValue) {
    let node = aChildNode;
    while (node && node.getAttribute(aAttributeName) != aAttributeValue) {
      node = node.parentNode;
      if (node.tagName == undefined) {
        return null;
      }
    }
    return node;
  },

  /**
   * Format the given string to work inside a CSS rule selector
   * (and as part of a non-unicode preference key).
   *
   * Replaces each space ' ' char with '_'.
   * Replaces each char other than ascii digits and letters, with '-uxHHH-'
   * where HHH is unicode in hexadecimal (variable length, terminated by the '-').
   *
   * Ensures: result only contains ascii digits, letters,'-', and '_'.
   * Ensures: result is invertible, so (f(a) = f(b)) implies (a = b).
   *   also means f is not idempotent, so (a != f(a)) implies (f(a) != f(f(a))).
   * Ensures: result must be lowercase.
   * Rationale: preference keys require 8bit chars, and ascii chars are legible
   *              in most fonts (in case user edits PROFILE/prefs.js).
   *            CSS class names in Gecko 1.8 seem to require lowercase,
   *              no punctuation, and of course no spaces.
   *   nmchar            [_a-zA-Z0-9-]|{nonascii}|{escape}
   *   name              {nmchar}+
   *   http://www.w3.org/TR/CSS21/grammar.html#scanner
   *
   * @param aString       The unicode string to format
   * @returns The formatted string using only chars [_a-zA-Z0-9-]
   */
  formatStringForCSSRule(aString) {
    function toReplacement(char) {
      // char code is natural number (positive integer)
      const nat = char.charCodeAt(0);
      switch (nat) {
        case 0x20: // space
          return "_";
        default:
          return "-ux" + nat.toString(16) + "-"; // lowercase
      }
    }
    // Result must be lowercase or style rule will not work.
    return aString.toLowerCase().replace(/[^a-zA-Z0-9]/g, toReplacement);
  },

  /**
   * Gets the cached instance of the composite calendar.
   *
   * @param aWindow       The window to get the composite calendar for.
   */
  getCompositeCalendar(aWindow) {
    if (typeof aWindow._compositeCalendar == "undefined") {
      const comp = (aWindow._compositeCalendar = Cc[
        "@mozilla.org/calendar/calendar;1?type=composite"
      ].createInstance(Ci.calICompositeCalendar));
      const prefix = "calendar-main";

      const calManagerObserver = {
        QueryInterface: ChromeUtils.generateQI([Ci.calICalendarManagerObserver]),

        onCalendarRegistered(calendar) {
          const inComposite = calendar.getProperty(prefix + "-in-composite");
          if (inComposite === null && !calendar.getProperty("disabled")) {
            comp.addCalendar(calendar);
          }
        },
        onCalendarUnregistering(calendar) {
          comp.removeCalendar(calendar);
          if (!comp.defaultCalendar || comp.defaultCalendar.id == calendar.id) {
            comp.defaultCalendar = comp.getCalendars()[0];
          }
        },
        onCalendarDeleting(calendar) {},
      };
      lazy.cal.manager.addObserver(calManagerObserver);
      aWindow.addEventListener("unload", () => lazy.cal.manager.removeObserver(calManagerObserver));

      comp.prefPrefix = prefix; // populate calendar from existing calendars

      if (typeof aWindow.gCalendarStatusFeedback != "undefined") {
        // If we are in a window that has calendar status feedback, set
        // up our status observer.
        comp.setStatusObserver(aWindow.gCalendarStatusFeedback, aWindow);
      }
    }
    return aWindow._compositeCalendar;
  },

  /**
   * Hash the given string into a color from the color palette of the standard
   * color picker.
   *
   * @param str           The string to hash into a color.
   * @returns The hashed color.
   */
  hashColor(str) {
    // This is the palette of colors in the current colorpicker implementation.
    // Unfortunately, there is no easy way to extract these colors from the
    // binding directly.
    const colorPalette = [
      "#FFFFFF",
      "#FFCCCC",
      "#FFCC99",
      "#FFFF99",
      "#FFFFCC",
      "#99FF99",
      "#99FFFF",
      "#CCFFFF",
      "#CCCCFF",
      "#FFCCFF",
      "#CCCCCC",
      "#FF6666",
      "#FF9966",
      "#FFFF66",
      "#FFFF33",
      "#66FF99",
      "#33FFFF",
      "#66FFFF",
      "#9999FF",
      "#FF99FF",
      "#C0C0C0",
      "#FF0000",
      "#FF9900",
      "#FFCC66",
      "#FFFF00",
      "#33FF33",
      "#66CCCC",
      "#33CCFF",
      "#6666CC",
      "#CC66CC",
      "#999999",
      "#CC0000",
      "#FF6600",
      "#FFCC33",
      "#FFCC00",
      "#33CC00",
      "#00CCCC",
      "#3366FF",
      "#6633FF",
      "#CC33CC",
      "#666666",
      "#990000",
      "#CC6600",
      "#CC9933",
      "#999900",
      "#009900",
      "#339999",
      "#3333FF",
      "#6600CC",
      "#993399",
      "#333333",
      "#660000",
      "#993300",
      "#996633",
      "#666600",
      "#006600",
      "#336666",
      "#000099",
      "#333399",
      "#663366",
      "#000000",
      "#330000",
      "#663300",
      "#663333",
      "#333300",
      "#003300",
      "#003333",
      "#000066",
      "#330099",
      "#330033",
    ];

    const sum = Array.from(str || " ", e => e.charCodeAt(0)).reduce((a, b) => a + b);
    return colorPalette[sum % colorPalette.length];
  },

  /**
   * Pick whichever of "black" or "white" will look better when used as a text
   * color against a background of bgColor.
   *
   * @param bgColor   the background color as a "#RRGGBB" string
   */
  getContrastingTextColor(bgColor) {
    const calcColor = bgColor.replace(/#/g, "");
    const red = parseInt(calcColor.substring(0, 2), 16);
    const green = parseInt(calcColor.substring(2, 4), 16);
    const blue = parseInt(calcColor.substring(4, 6), 16);

    // Calculate the brightness (Y) value using the YUV color system.
    const brightness = 0.299 * red + 0.587 * green + 0.114 * blue;

    // Consider all colors with less than 56% brightness as dark colors and
    // use white as the foreground color, otherwise use black.
    if (brightness < 144) {
      return "white";
    }

    return "#222";
  },

  /**
   * Item comparator for inserting items into dayboxes.
   *
   * @param a     The first item
   * @param b     The second item
   * @returns The usual -1, 0, 1
   */
  compareItems(a, b) {
    if (!a) {
      return -1;
    }
    if (!b) {
      return 1;
    }

    const aIsEvent = a.isEvent();
    const aIsTodo = a.isTodo();

    const bIsEvent = b.isEvent();
    const bIsTodo = b.isTodo();

    // sort todos before events
    if (aIsTodo && bIsEvent) {
      return -1;
    }
    if (aIsEvent && bIsTodo) {
      return 1;
    }

    // sort items of the same type according to date-time
    const aStartDate = a.startDate || a.entryDate || a.dueDate;
    const bStartDate = b.startDate || b.entryDate || b.dueDate;
    const aEndDate = a.endDate || a.dueDate || a.entryDate;
    const bEndDate = b.endDate || b.dueDate || b.entryDate;
    if (!aStartDate || !bStartDate) {
      return 0;
    }

    // sort all day events before events with a duration
    if (aStartDate.isDate && !bStartDate.isDate) {
      return -1;
    }
    if (!aStartDate.isDate && bStartDate.isDate) {
      return 1;
    }

    let cmp = aStartDate.compare(bStartDate);
    if (cmp != 0) {
      return cmp;
    }

    if (!aEndDate || !bEndDate) {
      return 0;
    }
    cmp = aEndDate.compare(bEndDate);
    if (cmp != 0) {
      return cmp;
    }

    if (a.calendar && b.calendar) {
      cmp =
        lazy.calendarSortOrder.indexOf(a.calendar.id) -
        lazy.calendarSortOrder.indexOf(b.calendar.id);
      if (cmp != 0) {
        return cmp;
      }
    }

    cmp = (a.title > b.title) - (a.title < b.title);
    return cmp;
  },

  get calendarSortOrder() {
    return lazy.calendarSortOrder;
  },

  /**
   * Converts plain or HTML text into an HTML document fragment.
   *
   * @param {string} text - The text to convert.
   * @param {Document} doc - The document where the fragment will be appended.
   * @param {string} html - HTML if it's already available.
   * @returns {DocumentFragment} An HTML document fragment.
   */
  textToHtmlDocumentFragment(text, doc, html) {
    if (!html) {
      const mode =
        Ci.mozITXTToHTMLConv.kStructPhrase |
        Ci.mozITXTToHTMLConv.kGlyphSubstitution |
        Ci.mozITXTToHTMLConv.kURLs;
      html = lazy.gTextToHtmlConverter.scanTXT(text, mode);
      html = html.replace(/\r?\n/g, "<br>");
    }

    // Sanitize and convert the HTML into a document fragment.
    const flags =
      lazy.gParserUtils.SanitizerLogRemovals |
      lazy.gParserUtils.SanitizerDropForms |
      lazy.gParserUtils.SanitizerDropMedia;

    const uri = Services.io.newURI(doc.baseURI);
    return lazy.gParserUtils.parseFragment(html, flags, false, uri, doc.createElement("div"));
  },

  /**
   * Correct the description of a Google Calendar item so that it will display
   * as intended.
   *
   * @param {calIItemBase} item - The item to correct.
   */
  fixGoogleCalendarDescription(item) {
    // Google Calendar inserts bare HTML into its description field instead of
    // using the standard Alternate Text Representation mechanism. However,
    // the HTML is a poor representation of how it displays descriptions on
    // the site: links may be included as bare URLs and line breaks may be
    // included as raw newlines, so in order to display descriptions as Google
    // intends, we need to make some corrections.
    if (item.descriptionText) {
      // Convert HTML entities which scanHTML won't handle into their standard
      // text representation.
      let description = item.descriptionText.replace(/&#?\w+;?/g, potentialEntity => {
        // Attempt to parse the pattern match as an HTML entity.
        const body = new DOMParser().parseFromString(potentialEntity, "text/html").body;

        // Don't replace text that didn't parse as an entity or that parsed as
        // an entity which could break HTML parsing below.
        return body.innerText.length == 1 && !'"&<>'.includes(body.innerText)
          ? body.innerText
          : potentialEntity;
      });

      // Replace bare URLs with links and convert remaining entities.
      description = lazy.gTextToHtmlConverter.scanHTML(description, Ci.mozITXTToHTMLConv.kURLs);

      // Setting the HTML description will mark the item dirty, but we want to
      // avoid unnecessary updates; preserve modification time.
      const stamp = item.stampTime;
      const lastModified = item.lastModifiedTime;

      item.descriptionHTML = description.replace(/\r?\n/g, "<br>");

      // Restore modification time.
      item.setProperty("DTSTAMP", stamp);
      item.setProperty("LAST-MODIFIED", lastModified);
    }
  },
};

/**
 * Adds CSS variables for each calendar to registered windows for coloring
 * UI elements. Automatically tracks calendar creation, changes, and deletion.
 */
view.colorTracker = {
  calendars: null,
  categoryBranch: null,
  windows: new Set(),
  QueryInterface: ChromeUtils.generateQI(["calICalendarManagerObserver", "calIObserver"]),

  // Deregistration is not required.
  registerWindow(aWindow) {
    if (this.calendars === null) {
      this.calendars = new Set(lazy.cal.manager.getCalendars());
      lazy.cal.manager.addObserver(this);
      lazy.cal.manager.addCalendarObserver(this);

      this.categoryBranch = Services.prefs.getBranch("calendar.category.color.");
      this.categoryBranch.addObserver("", this);
      Services.obs.addObserver(this, "xpcom-shutdown");
    }

    this.windows.add(aWindow);
    aWindow.addEventListener("unload", () => this.windows.delete(aWindow));

    this.addColorsToDocument(aWindow.document);
  },
  addColorsToDocument(aDocument) {
    for (const calendar of this.calendars) {
      this._addCalendarToDocument(aDocument, calendar);
    }
    this._addAllCategoriesToDocument(aDocument);
  },

  _addCalendarToDocument(aDocument, aCalendar) {
    const cssSafeId = view.formatStringForCSSRule(aCalendar.id);
    const style = aDocument.documentElement.style;
    const backColor = aCalendar.getProperty("color") || "#a8c2e1";
    const foreColor = view.getContrastingTextColor(backColor);
    style.setProperty(`--calendar-${cssSafeId}-backcolor`, backColor);
    style.setProperty(`--calendar-${cssSafeId}-forecolor`, foreColor);
  },
  _removeCalendarFromDocument(aDocument, aCalendar) {
    const cssSafeId = view.formatStringForCSSRule(aCalendar.id);
    const style = aDocument.documentElement.style;
    style.removeProperty(`--calendar-${cssSafeId}-backcolor`);
    style.removeProperty(`--calendar-${cssSafeId}-forecolor`);
  },
  _addCategoryToDocument(aDocument, aCategoryName) {
    // aCategoryName should already be formatted for CSS, because that's
    // what is stored in the prefs, and this function is only called with
    // arguments that come from the prefs.
    if (/[^\w-]/.test(aCategoryName)) {
      return;
    }

    const style = aDocument.documentElement.style;
    let color = this.categoryBranch.getStringPref(aCategoryName, "");
    if (color == "") {
      // Don't use the getStringPref default, the value might actually be ""
      // and we don't want that.
      color = "transparent";
    }
    style.setProperty(`--category-${aCategoryName}-color`, color);
  },
  _addAllCategoriesToDocument(aDocument) {
    for (const categoryName of this.categoryBranch.getChildList("")) {
      this._addCategoryToDocument(aDocument, categoryName);
    }
  },

  // calICalendarManagerObserver methods
  onCalendarRegistered(aCalendar) {
    this.calendars.add(aCalendar);
    for (const window of this.windows) {
      this._addCalendarToDocument(window.document, aCalendar);
    }
  },
  onCalendarUnregistering(aCalendar) {
    this.calendars.delete(aCalendar);
    for (const window of this.windows) {
      this._removeCalendarFromDocument(window.document, aCalendar);
    }
  },
  onCalendarDeleting(aCalendar) {},

  // calIObserver methods
  onStartBatch() {},
  onEndBatch() {},
  onLoad() {},
  onAddItem(aItem) {},
  onModifyItem(aNewItem, aOldItem) {},
  onDeleteItem(aDeletedItem) {},
  onError(aCalendar, aErrNo, aMessage) {},
  onPropertyChanged(aCalendar, aName, aValue, aOldValue) {
    if (aName == "color") {
      for (const window of this.windows) {
        this._addCalendarToDocument(window.document, aCalendar);
      }
    }
  },
  onPropertyDeleting(aCalendar, aName) {},

  // nsIObserver method
  observe(aSubject, aTopic, aData) {
    if (aTopic == "nsPref:changed") {
      for (const window of this.windows) {
        this._addCategoryToDocument(window.document, aData);
      }
      // TODO Currently, the only way to find out if categories are removed is
      // to initially grab the calendar.categories.names preference and then
      // observe changes to it. It would be better if we had hooks for this.
    } else if (aTopic == "xpcom-shutdown") {
      this.categoryBranch.removeObserver("", this);
      Services.obs.removeObserver(this, "xpcom-shutdown");
    }
  },
};
