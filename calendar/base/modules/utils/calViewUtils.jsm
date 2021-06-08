/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

ChromeUtils.defineModuleGetter(this, "cal", "resource:///modules/calendar/calUtils.jsm");

XPCOMUtils.defineLazyServiceGetter(
  this,
  "gParserUtils",
  "@mozilla.org/parserutils;1",
  "nsIParserUtils"
);
XPCOMUtils.defineLazyServiceGetter(
  this,
  "gTextToHtmlConverter",
  "@mozilla.org/txttohtmlconv;1",
  "mozITXTToHTMLConv"
);
XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "calendarSortOrder",
  "calendar.list.sortOrder",
  null,
  null,
  val => (val ? val.split(" ") : [])
);

/**
 * View and DOM related helper functions
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.view namespace.

const EXPORTED_SYMBOLS = ["calview"]; /* exported calview */

var calview = {
  /**
   * Checks if the mousepointer of an event resides over a XULBox during an event
   *
   * @param aMouseEvent   The event eg. a 'mouseout' or 'mousedown' event
   * @param aXULBox       The xul element
   * @return              true or false depending on whether the mouse pointer
   *                      resides over the xulelement
   */
  isMouseOverBox(aMouseEvent, aXULElement) {
    let boundingRect = aXULElement.getBoundingClientRect();
    let boxWidth = boundingRect.width;
    let boxHeight = boundingRect.height;
    let boxScreenX = aXULElement.screenX;
    let boxScreenY = aXULElement.screenY;
    let mouseX = aMouseEvent.screenX;
    let mouseY = aMouseEvent.screenY;
    let xIsWithin = mouseX >= boxScreenX && mouseX <= boxScreenX + boxWidth;
    let yIsWithin = mouseY >= boxScreenY && mouseY <= boxScreenY + boxHeight;
    return xIsWithin && yIsWithin;
  },

  /**
   * Returns a parentnode - or the passed node - with the given localName, by
   * traversing up the DOM hierarchy.
   *
   * @param aChildNode  The childnode.
   * @param aLocalName  The localName of the to-be-returned parent
   *                      that is looked for.
   * @return            The parent with the given localName or the
   *                      given childNode 'aChildNode'. If no appropriate
   *                      parent node with aLocalName could be
   *                      retrieved it is returned 'null'.
   */
  getParentNodeOrThis(aChildNode, aLocalName) {
    let node = aChildNode;
    while (node && node.localName != aLocalName) {
      node = node.parentNode;
      if (node.tagName == undefined) {
        return null;
      }
    }
    return node;
  },

  /**
   * Returns a parentnode  - or the passed node -  with the given attribute
   * value for the given attributename by traversing up the DOM hierarchy.
   *
   * @param aChildNode      The childnode.
   * @param aAttibuteName   The name of the attribute that is to be compared with
   * @param aAttibuteValue  The value of the attribute that is to be compared with
   * @return                The parent with the given attributeName set that has
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
   * @return              The formatted string using only chars [_a-zA-Z0-9-]
   */
  formatStringForCSSRule(aString) {
    function toReplacement(char) {
      // char code is natural number (positive integer)
      let nat = char.charCodeAt(0);
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
      let comp = (aWindow._compositeCalendar = Cc[
        "@mozilla.org/calendar/calendar;1?type=composite"
      ].createInstance(Ci.calICompositeCalendar));
      const prefix = "calendar-main";

      const calManagerObserver = {
        QueryInterface: ChromeUtils.generateQI([Ci.calICalendarManagerObserver]),

        onCalendarRegistered(calendar) {
          let inComposite = calendar.getProperty(prefix + "-in-composite");
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
      const calManager = cal.getCalendarManager();
      calManager.addObserver(calManagerObserver);
      aWindow.addEventListener("unload", () => calManager.removeObserver(calManagerObserver));

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
   * @return              The hashed color.
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

    let sum = Array.from(str || " ", e => e.charCodeAt(0)).reduce((a, b) => a + b);
    return colorPalette[sum % colorPalette.length];
  },

  /**
   * Pick whichever of "black" or "white" will look better when used as a text
   * color against a background of bgColor.
   *
   * @param bgColor   the background color as a "#RRGGBB" string
   */
  getContrastingTextColor(bgColor) {
    let calcColor = bgColor.replace(/#/g, "");
    let red = parseInt(calcColor.substring(0, 2), 16);
    let green = parseInt(calcColor.substring(2, 4), 16);
    let blue = parseInt(calcColor.substring(4, 6), 16);

    // Calculate the brightness (Y) value using the YUV color system.
    let brightness = 0.299 * red + 0.587 * green + 0.114 * blue;

    // Consider all colors with less than 56% brightness as dark colors and
    // use white as the foreground color, otherwise use black.
    if (brightness < 144) {
      return "white";
    }

    return "black";
  },

  /**
   * Item comparator for inserting items into dayboxes.
   *
   * @param a     The first item
   * @param b     The second item
   * @return      The usual -1, 0, 1
   */
  compareItems(a, b) {
    if (!a) {
      return -1;
    }
    if (!b) {
      return 1;
    }

    let aIsEvent = a.isEvent();
    let aIsTodo = a.isTodo();

    let bIsEvent = b.isEvent();
    let bIsTodo = b.isTodo();

    // sort todos before events
    if (aIsTodo && bIsEvent) {
      return -1;
    }
    if (aIsEvent && bIsTodo) {
      return 1;
    }

    // sort items of the same type according to date-time
    let aStartDate = a.startDate || a.entryDate || a.dueDate;
    let bStartDate = b.startDate || b.entryDate || b.dueDate;
    let aEndDate = a.endDate || a.dueDate || a.entryDate;
    let bEndDate = b.endDate || b.dueDate || b.entryDate;
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
      cmp = calendarSortOrder.indexOf(a.calendar.id) - calendarSortOrder.indexOf(b.calendar.id);
      if (cmp != 0) {
        return cmp;
      }
    }

    cmp = (a.title > b.title) - (a.title < b.title);
    return cmp;
  },

  get calendarSortOrder() {
    return calendarSortOrder;
  },

  /**
   * Converts plain or HTML text into an HTML document fragment.
   *
   * @param {string} text - The text to convert.
   * @param {Document} doc - The document where the fragment will be appended.
   * @param {string} html - HTML if it's already available.
   * @return {DocumentFragment} An HTML document fragment.
   */
  textToHtmlDocumentFragment(text, doc, html) {
    if (!html) {
      let mode =
        Ci.mozITXTToHTMLConv.kStructPhrase |
        Ci.mozITXTToHTMLConv.kGlyphSubstitution |
        Ci.mozITXTToHTMLConv.kURLs;
      html = gTextToHtmlConverter.scanTXT(text, mode);
      html = html.replace(/\r?\n/g, "<br>");
    }

    // Sanitize and convert the HTML into a document fragment.
    let flags =
      gParserUtils.SanitizerLogRemovals |
      gParserUtils.SanitizerDropForms |
      gParserUtils.SanitizerDropMedia;

    let uri = Services.io.newURI(doc.baseURI);
    return gParserUtils.parseFragment(html, flags, false, uri, doc.createElement("div"));
  },

  /**
   * Fixes up a description of a Google Calendar item
   *
   * @param item      The item to check
   */
  fixGoogleCalendarDescription(item) {
    let description = item.descriptionText;
    if (description) {
      // Google Calendar descriptions are actually HTML,
      // but they contain bare URLs and newlines, so fix those up here.
      let mode = Ci.mozITXTToHTMLConv.kURLs;
      // scanHTML only allows &lt; &gt; and &amp; so decode other entities now
      description = description.replace(/&#?\w+;?/g, entity => {
        let body = new DOMParser().parseFromString(entity, "text/html").body;
        return body.innerText.length == 1 && !'"&<>'.includes(body.innerText)
          ? body.innerText
          : entity; // Entity didn't decode to a character, so leave it
      });
      description = gTextToHtmlConverter.scanHTML(description, mode);
      let stamp = item.stampTime;
      let lastModified = item.lastModifiedTime;
      item.descriptionHTML = description.replace(/\r?\n/g, "<br>");
      item.setProperty("DTSTAMP", stamp);
      item.setProperty("LAST-MODIFIED", lastModified); // undirty the item
    }
  },
};

/**
 * Adds CSS variables for each calendar to registered windows for coloring
 * UI elements. Automatically tracks calendar creation, changes, and deletion.
 */
calview.colorTracker = {
  calendars: null,
  categoryBranch: null,
  windows: new Set(),
  QueryInterface: ChromeUtils.generateQI(["calICalendarManagerObserver", "calIObserver"]),

  // Deregistration is not required.
  registerWindow(aWindow) {
    if (this.calendars === null) {
      let manager = cal.getCalendarManager();
      this.calendars = new Set(manager.getCalendars());
      manager.addObserver(this);
      manager.addCalendarObserver(this);
      this.categoryBranch = Services.prefs.getBranch("calendar.category.color.");
      this.categoryBranch.addObserver("", this);
      Services.obs.addObserver(this, "xpcom-shutdown");
    }

    this.windows.add(aWindow);
    aWindow.addEventListener("unload", () => this.windows.delete(aWindow));
    this.addColorsToDocument(aWindow.document);
  },
  addColorsToDocument(aDocument) {
    for (let calendar of this.calendars) {
      this._addCalendarToDocument(aDocument, calendar);
    }
    this._addAllCategoriesToDocument(aDocument);
  },

  _addCalendarToDocument(aDocument, aCalendar) {
    let cssSafeId = calview.formatStringForCSSRule(aCalendar.id);
    let style = aDocument.documentElement.style;
    let backColor = aCalendar.getProperty("color") || "#a8c2e1";
    let foreColor = calview.getContrastingTextColor(backColor);
    style.setProperty(`--calendar-${cssSafeId}-backcolor`, backColor);
    style.setProperty(`--calendar-${cssSafeId}-forecolor`, foreColor);
  },
  _removeCalendarFromDocument(aDocument, aCalendar) {
    let cssSafeId = calview.formatStringForCSSRule(aCalendar.id);
    let style = aDocument.documentElement.style;
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

    let style = aDocument.documentElement.style;
    let color = this.categoryBranch.getStringPref(aCategoryName, "");
    if (color == "") {
      // Don't use the getStringPref default, the value might actually be ""
      // and we don't want that.
      color = "transparent";
    }
    style.setProperty(`--category-${aCategoryName}-color`, color);
  },
  _addAllCategoriesToDocument(aDocument) {
    for (let categoryName of this.categoryBranch.getChildList("")) {
      this._addCategoryToDocument(aDocument, categoryName);
    }
  },

  // calICalendarManagerObserver methods
  onCalendarRegistered(aCalendar) {
    this.calendars.add(aCalendar);
    for (let window of this.windows) {
      this._addCalendarToDocument(window.document, aCalendar);
    }
  },
  onCalendarUnregistering(aCalendar) {
    this.calendars.delete(aCalendar);
    for (let window of this.windows) {
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
      for (let window of this.windows) {
        this._addCalendarToDocument(window.document, aCalendar);
      }
    }
  },
  onPropertyDeleting(aCalendar, aName) {},

  // nsIObserver method
  observe(aSubject, aTopic, aData) {
    if (aTopic == "nsPref:changed") {
      for (let window of this.windows) {
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
