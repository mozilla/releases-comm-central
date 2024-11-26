/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals getMessagePaneBrowser, addMenuItem, getSelectedCalendar
   createEventWithDialog*/

var { Extractor } = ChromeUtils.importESModule("resource:///modules/calendar/calExtract.sys.mjs");
var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
  CalTodo: "resource:///modules/CalTodo.sys.mjs",
});

ChromeUtils.defineLazyGetter(this, "extractService", () => {
  const { CalExtractParserService } = ChromeUtils.importESModule(
    "resource:///modules/calendar/extract/CalExtractParserService.sys.mjs"
  );
  return new CalExtractParserService();
});

var calendarExtract = {
  onShowLocaleMenu(target) {
    const localeList = document.getElementById(target.id);
    const langs = [];
    const chrome = Cc["@mozilla.org/chrome/chrome-registry;1"]
      .getService(Ci.nsIXULChromeRegistry)
      .QueryInterface(Ci.nsIToolkitChromeRegistry);
    const langRegex = /^(([^-]+)-*(.*))$/;

    for (const locale of chrome.getLocalesForPackage("calendar")) {
      const localeParts = langRegex.exec(locale);
      let langName = localeParts[2];

      try {
        langName = cal.l10n.getAnyString("global", "languageNames", langName);
      } catch (ex) {
        // If no language name is found that is ok, keep the technical term
      }

      let label = calendarExtract.l10n.formatValueSync("extract-using", { languageName: langName });
      if (localeParts[3] != "") {
        label = calendarExtract.l10n.formatValueSync("extract-using-region", {
          languageName: langName,
          region: localeParts[3],
        });
      }

      langs.push([label, localeParts[1]]);
    }

    // sort
    const pref = "calendar.patterns.last.used.languages";
    const lastUsedLangs = Services.prefs.getStringPref(pref, "");

    langs.sort((a, b) => {
      const idx_a = lastUsedLangs.indexOf(a[1]);
      const idx_b = lastUsedLangs.indexOf(b[1]);

      if (idx_a == -1 && idx_b == -1) {
        return a[0].localeCompare(b[0]);
      } else if (idx_a != -1 && idx_b != -1) {
        return idx_a - idx_b;
      } else if (idx_a == -1) {
        return 1;
      }
      return -1;
    });
    while (localeList.lastChild) {
      localeList.lastChild.remove();
    }

    for (const lang of langs) {
      addMenuItem(localeList, lang[0], lang[1], null);
    }
  },

  extractWithLocale(event, isEvent) {
    event.stopPropagation();
    const locale = event.target.value;
    this.extractFromEmail(null, isEvent, true, locale);
  },

  async extractFromEmail(message, isEvent, fixedLang, fixedLocale) {
    const folder = message.folder;
    const title = message.mime2DecodedSubject;

    let content = "";
    await new Promise((resolve, reject) => {
      const listener = {
        QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
        onDataAvailable(request, inputStream, offset, count) {
          const text = folder.getMsgTextFromStream(
            inputStream,
            message.charset,
            count, // bytesToRead
            32768, // maxOutputLen
            false, // compressQuotes
            true, // stripHTMLTags
            {} // out contentType
          );
          // If we ever got text, we're good. Ignore further chunks.
          content ||= text;
        },
        onStartRequest() {},
        onStopRequest(request, statusCode) {
          if (!Components.isSuccessCode(statusCode)) {
            reject(new Error(statusCode));
          }
          resolve();
        },
      };
      const uri = message.folder.getUriForMsg(message);
      MailServices.messageServiceFromURI(uri).streamMessage(uri, listener, null, null, false, "");
    });

    cal.LOG("[calExtract] Original email content: \n" + title + "\r\n" + content);
    const date = new Date(message.date / 1000);
    const time = new Date().getTime();

    const item = isEvent ? new CalEvent() : new CalTodo();
    item.title = message.mime2DecodedSubject;
    item.calendar = getSelectedCalendar();
    item.descriptionText = content;
    item.setProperty("URL", `mid:${message.messageId}`);
    cal.dtz.setDefaultStartEndHour(item);
    cal.alarms.setDefaultValues(item);
    const tabmail = document.getElementById("tabmail");
    const messagePaneBrowser =
      tabmail?.currentTabInfo.chromeBrowser.contentWindow.messagePane.visibleMessagePaneBrowser?.() ||
      tabmail?.currentAboutMessage?.getMessagePaneBrowser() ||
      document.getElementById("messageBrowser")?.contentWindow?.getMessagePaneBrowser();
    let sel = messagePaneBrowser?.contentWindow?.getSelection();
    // Check if there's an iframe with a selection (e.g. Thunderbird Conversations)
    if (sel && sel.type !== "Range") {
      try {
        sel = messagePaneBrowser?.contentDocument
          .querySelector("iframe")
          .contentDocument.getSelection();
      } catch (ex) {
        // If Thunderbird Conversations is not installed that is fine,
        // we will just have an empty or null selection.
      }
    }

    let guessed;
    let endGuess;
    let extractor;
    let collected = [];
    let useService = Services.prefs.getBoolPref("calendar.extract.service.enabled");
    if (useService) {
      const result = extractService.extract(content, { now: date });
      if (!result) {
        useService = false;
      } else {
        guessed = result.startTime;
        endGuess = result.endTime;
      }
    }

    if (!useService) {
      const locale = Services.locale.requestedLocale;
      const dayStart = Services.prefs.getIntPref("calendar.view.daystarthour", 6);
      if (fixedLang) {
        extractor = new Extractor(fixedLocale, dayStart);
      } else {
        extractor = new Extractor(locale, dayStart, false);
      }
      collected = extractor.extract(title, content, date, sel);
    }

    // if we only have email date then use default start and end
    if (!useService && collected.length <= 1) {
      cal.LOG("[calExtract] Date and time information was not found in email/selection.");
      createEventWithDialog(null, null, null, null, item);
    } else {
      if (!useService) {
        guessed = extractor.guessStart(!isEvent);
        endGuess = extractor.guessEnd(guessed, !isEvent);
      }
      const allDay = (guessed.hour == null || guessed.minute == null) && isEvent;

      if (isEvent) {
        if (guessed.year != null) {
          item.startDate.year = guessed.year;
        }
        if (guessed.month != null) {
          item.startDate.month = guessed.month - 1;
        }
        if (guessed.day != null) {
          item.startDate.day = guessed.day;
        }
        if (guessed.hour != null) {
          item.startDate.hour = guessed.hour;
        }
        if (guessed.minute != null) {
          item.startDate.minute = guessed.minute;
        }

        item.endDate = item.startDate.clone();
        item.endDate.minute += Services.prefs.getIntPref("calendar.event.defaultlength", 60);

        if (endGuess.year != null) {
          item.endDate.year = endGuess.year;
        }
        if (endGuess.month != null) {
          item.endDate.month = endGuess.month - 1;
        }
        if (endGuess.day != null) {
          item.endDate.day = endGuess.day;
          if (allDay) {
            item.endDate.day++;
          }
        }
        if (endGuess.hour != null) {
          item.endDate.hour = endGuess.hour;
        }
        if (endGuess.minute != null) {
          item.endDate.minute = endGuess.minute;
        }
      } else {
        const dtz = cal.dtz.defaultTimezone;
        const dueDate = new Date();
        // set default
        dueDate.setHours(0);
        dueDate.setMinutes(0);
        dueDate.setSeconds(0);

        if (endGuess.year != null) {
          dueDate.setYear(endGuess.year);
        }
        if (endGuess.month != null) {
          dueDate.setMonth(endGuess.month - 1);
        }
        if (endGuess.day != null) {
          dueDate.setDate(endGuess.day);
        }
        if (endGuess.hour != null) {
          dueDate.setHours(endGuess.hour);
        }
        if (endGuess.minute != null) {
          dueDate.setMinutes(endGuess.minute);
        }

        cal.item.setItemProperty(item, "entryDate", cal.dtz.jsDateToDateTime(date, dtz));
        if (endGuess.year != null) {
          cal.item.setItemProperty(item, "dueDate", cal.dtz.jsDateToDateTime(dueDate, dtz));
        }
      }

      // if time not guessed set allday for events
      if (allDay) {
        createEventWithDialog(null, null, null, null, item, true);
      } else {
        createEventWithDialog(null, null, null, null, item);
      }
    }

    const timeSpent = new Date().getTime() - time;
    cal.LOG(
      "[calExtract] Total time spent for conversion (including loading of dictionaries): " +
        timeSpent +
        "ms"
    );
  },
};
ChromeUtils.defineLazyGetter(
  calendarExtract,
  "l10n",
  () => new Localization(["calendar/calendar.ftl"], true)
);
