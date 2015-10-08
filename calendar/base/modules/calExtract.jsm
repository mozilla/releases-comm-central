/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["Extractor"];
Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");

/**
* Initializes extraction
*
* @param fallbackLocale  locale to use when others are not found or
*                            detection is disabled
* @param dayStart        ambiguous hours earlier than this are considered to
*                            be in the afternoon, when null then by default
*                            set to 6
* @param fixedLang       whether to use only fallbackLocale for extraction
*/
function Extractor(fallbackLocale, dayStart, fixedLang) {
    // url for multi locale AMO build
    this.bundleUrl = "resource://calendar/chrome/calendar-LOCALE/locale/LOCALE/calendar/calendar-extract.properties";
    // url for single locale python packaged build
    this.packagedUrl = "jar:resource://calendar/chrome.jar!/calendar-LOCALE/locale/LOCALE/calendar/calendar-extract.properties";
    this.fallbackLocale = fallbackLocale;
    this.email = "";
    this.marker = "--MARK--";
    // this should never be found in an email
    this.defPattern = "061dc19c-719f-47f3-b2b5-e767e6f02b7a";
    this.collected = [];
    this.numbers = [];
    this.hourlyNumbers = [];
    this.dailyNumbers = [];
    this.allMonths = "";
    this.months = [];
    this.dayStart = 6;
    this.now = new Date();
    this.bundle = "";
    this.overrides = {};
    this.fixedLang = true;

    if (dayStart != null) {
        this.dayStart = dayStart;
    }

    if (fixedLang != null) {
        this.fixedLang = fixedLang;
    }

    if (!this.checkBundle(fallbackLocale)) {
        this.bundleUrl = this.packagedUrl;
        cal.WARN("Your installed Lightning only includes a single locale, extracting event info from other languages is likely inaccurate. You can install Lightning from addons.mozilla.org manually for multiple locale support.")
    }
}

Extractor.prototype = {
    /**
    * Removes confusing data like urls, timezones and phone numbers from email
    * Also removes standard signatures and quoted content from previous emails
    */
    cleanup: function cleanup() {
        // XXX remove earlier correspondence
        // ideally this should be considered with lower certainty to fill in
        // missing information

        // remove last line preceeding quoted message and first line of the quote
        this.email = this.email.replace(/\r?\n[^>].*\r?\n>+.*$/m, "");
        // remove the rest of quoted content
        this.email = this.email.replace(/^>+.*$/gm, "");

        // urls often contain dates dates that can confuse extraction
        this.email = this.email.replace(/https?:\/\/[^\s]+\s/gm, "");
        this.email = this.email.replace(/www\.[^\s]+\s/gm, "");

        // remove phone numbers
        // TODO allow locale specific configuration of formats
        this.email = this.email.replace(/\d-\d\d\d-\d\d\d-\d\d\d\d/gm, "");

        // remove standard signature
        this.email = this.email.replace(/\r?\n-- \r?\n[\S\s]+$/, "");

        // XXX remove timezone info, for now
        this.email = this.email.replace(/gmt[+-]\d{2}:\d{2}/gi, "");
    },

    checkBundle: function checkBundle(locale) {
        let path = this.bundleUrl.replace(/LOCALE/g, locale);
        let bundle = Services.strings.createBundle(path);

        try {
            bundle.GetStringFromName("from.today");
            return true;
        } catch (ex) {
            return false;
        }
    },

    avgNonAsciiCharCode: function avgNonAsciiCharCode() {
        let sum = 0;
        let cnt = 0;

        for (let i = 0; i < this.email.length; i++) {
            let ch = this.email.charCodeAt(i);
            if (ch > 128) {
                sum += ch;
                cnt++;
            }
        }

        let nonAscii = sum/cnt || 0;
        cal.LOG("[calExtract] Average non-ascii charcode: " + nonAscii);
        return nonAscii;
    },

    setLanguage: function setLanguage() {
        let path;

        if (this.fixedLang == true) {
            if (this.checkBundle(this.fallbackLocale)) {
                cal.LOG("[calExtract] Fixed locale was used to choose " +
                        this.fallbackLocale + " patterns.");
            } else {
                cal.LOG("[calExtract] " + this.fallbackLocale +
                        " patterns were not found. Using en-US instead");
                this.fallbackLocale = "en-US";
            }

            path = this.bundleUrl.replace(/LOCALE/g, this.fallbackLocale);

            let pref = "calendar.patterns.last.used.languages";
            let lastUsedLangs = Preferences.get(pref, "");
            if (lastUsedLangs == "") {
                Preferences.set(pref, this.fallbackLocale);
            } else {
                let langs = lastUsedLangs.split(",");
                let idx = langs.indexOf(this.fallbackLocale);
                if (idx == -1) {
                    Preferences.set(pref, this.fallbackLocale + "," + lastUsedLangs);
                } else {
                    langs.splice(idx, 1);
                    Preferences.set(pref, this.fallbackLocale + "," + langs.join(","));
                }
            }
        } else {
            let spellclass = "@mozilla.org/spellchecker/engine;1";
            let mozISpellCheckingEngine = Components.interfaces.mozISpellCheckingEngine;
            let sp = Components.classes[spellclass]
                               .getService(mozISpellCheckingEngine);

            let arr = {};
            let cnt = {};
            sp.getDictionaryList(arr, cnt);
            let dicts = arr["value"];

            if (dicts.length == 0) {
                cal.LOG("[calExtract] There are no dictionaries installed and " +
                        "enabled. You might want to add some if date and time " +
                        "extraction from emails seems inaccurate.");
            }

            let patterns;
            let words = this.email.split(/\s+/);
            let most = 0;
            let mostLocale;
            for (let dict in dicts) {
                // dictionary locale and patterns locale match
                if (this.checkBundle(dicts[dict])) {
                    let t1 = (new Date()).getTime();
                    sp.dictionary = dicts[dict];
                    let dur = (new Date()).getTime() - t1;
                    cal.LOG("[calExtract] Loading " + dicts[dict] +
                            " dictionary took " + dur + "ms");
                    patterns = dicts[dict];
                // beginning of dictionary locale matches patterns locale
                } else if (this.checkBundle(dicts[dict].substring(0, 2))) {
                    let t1 = (new Date()).getTime();
                    sp.dictionary = dicts[dict];
                    let dur = (new Date()).getTime() - t1;
                    cal.LOG("[calExtract] Loading " + dicts[dict] +
                            " dictionary took " + dur + "ms");
                    patterns = dicts[dict].substring(0, 2);
                // dictionary for which patterns aren't present
                } else {
                    cal.LOG("[calExtract] Dictionary present, rules missing: " + dicts[dict]);
                    continue;
                }

                let correct = 0;
                let total = 0;
                for (let word in words) {
                    words[word] = words[word].replace(/[()\d,;:?!#\.]/g, "");
                    if (words[word].length >= 2) {
                        total++;
                        if (sp.check(words[word])) {
                            correct++;
                        }
                    }
                }

                let percentage = correct/total * 100.0;
                cal.LOG("[calExtract] " + dicts[dict] + " dictionary matches " +
                        percentage + "% of words");

                if (percentage > 50.0 && percentage > most) {
                    mostLocale = patterns;
                    most = percentage;
                }
            }

            let avgCharCode = this.avgNonAsciiCharCode();

            // using dictionaries for language recognition with non-latin letters doesn't work
            // very well, possibly because of bug 471799
            if (avgCharCode > 48000 && avgCharCode < 50000) {
                cal.LOG("[calExtract] Using ko patterns based on charcodes");
                path = this.bundleUrl.replace(/LOCALE/g, "ko");
            // is it possible to differentiate zh-TW and zh-CN?
            } else if (avgCharCode > 24000 && avgCharCode < 32000) {
                cal.LOG("[calExtract] Using zh-TW patterns based on charcodes");
                path = this.bundleUrl.replace(/LOCALE/g, "zh-TW");
            } else if (avgCharCode > 14000 && avgCharCode < 24000) {
                cal.LOG("[calExtract] Using ja patterns based on charcodes");
                path = this.bundleUrl.replace(/LOCALE/g, "ja");
            // Bulgarian also looks like that
            } else if (avgCharCode > 1000 && avgCharCode < 1200) {
                cal.LOG("[calExtract] Using ru patterns based on charcodes");
                path = this.bundleUrl.replace(/LOCALE/g, "ru");
            // dictionary based
            } else if (most > 0) {
                cal.LOG("[calExtract] Using " + mostLocale + " patterns based on dictionary");
                path = this.bundleUrl.replace(/LOCALE/g, mostLocale);
            // fallbackLocale matches patterns exactly
            } else if (this.checkBundle(this.fallbackLocale)) {
                cal.LOG("[calExtract] Falling back to " + this.fallbackLocale);
                path = this.bundleUrl.replace(/LOCALE/g, this.fallbackLocale);
            // beginning of fallbackLocale matches patterns
            } else if (this.checkBundle(this.fallbackLocale.substring(0, 2))) {
                this.fallbackLocale = this.fallbackLocale.substring(0, 2);
                cal.LOG("[calExtract] Falling back to " + this.fallbackLocale);
                path = this.bundleUrl.replace(/LOCALE/g, this.fallbackLocale);
            } else {
                cal.LOG("[calExtract] Using en-US");
                path = this.bundleUrl.replace(/LOCALE/g, "en-US");
            }
        }
        this.bundle = Services.strings.createBundle(path);
    },

    /**
    * Extracts dates, times and durations from email
    *
    * @param body  email body
    * @param now   reference time against which relative times are interpreted,
    *                  when null current time is used
    * @param sel   selection object of email content, when defined times
    *                  outside selection are disgarded
    * @param title email title
    * @return      sorted list of extracted datetime objects
    */
    extract: function extract(title, body, now, sel) {
        let initial = {};
        this.collected = [];
        this.email = title + "\r\n" + body;
        if (now != null) {
            this.now = now;
        }

        initial.year = now.getFullYear();
        initial.month = now.getMonth() + 1;
        initial.day = now.getDate();
        initial.hour = now.getHours();
        initial.minute = now.getMinutes();

        this.collected.push({year: initial.year,
                             month: initial.month,
                             day: initial.day,
                             hour: initial.hour,
                             minute: initial.minute,
                             relation: "start"
        });

        this.cleanup();
        cal.LOG("[calExtract] Email after processing for extraction: \n" + this.email);

        this.overrides = JSON.parse(Preferences.get("calendar.patterns.override", "{}"));
        this.setLanguage();

        for (let i = 0; i <= 31; i++) {
            this.numbers[i] = this.getPatterns("number." + i);
        }
        this.dailyNumbers = this.numbers.join(this.marker);

        this.hourlyNumbers = this.numbers[0] + this.marker;
        for (let i = 1; i <= 22; i++) {
            this.hourlyNumbers += this.numbers[i] + this.marker;
        }
        this.hourlyNumbers += this.numbers[23];

        this.hourlyNumbers = this.hourlyNumbers.replace(/\|/g, this.marker);
        this.dailyNumbers = this.dailyNumbers.replace(/\|/g, this.marker);

        for (let i = 0; i < 12; i++) {
            this.months[i] = this.getPatterns("month." + (i + 1));
        }
        this.allMonths = this.months.join(this.marker).replace(/\|/g, this.marker);

        // time
        this.extractTime("from.noon", "start", 12, 0);
        this.extractTime("until.noon", "end", 12, 0);

        this.extractHour("from.hour", "start", "none");
        this.extractHour("from.hour.am", "start", "ante");
        this.extractHour("from.hour.pm", "start", "post");
        this.extractHour("until.hour", "end", "none");
        this.extractHour("until.hour.am", "end", "ante");
        this.extractHour("until.hour.pm", "end", "post");

        this.extractHalfHour("from.half.hour.before", "start", "ante");
        this.extractHalfHour("until.half.hour.before", "end", "ante");
        this.extractHalfHour("from.half.hour.after", "start", "post");
        this.extractHalfHour("until.half.hour.after", "end", "post");

        this.extractHourMinutes("from.hour.minutes", "start", "none");
        this.extractHourMinutes("from.hour.minutes.am", "start", "ante");
        this.extractHourMinutes("from.hour.minutes.pm", "start", "post");
        this.extractHourMinutes("until.hour.minutes", "end", "none");
        this.extractHourMinutes("until.hour.minutes.am", "end", "ante");
        this.extractHourMinutes("until.hour.minutes.pm", "end", "post");

        // date
        this.extractRelativeDay("from.today", "start", 0);
        this.extractRelativeDay("from.tomorrow", "start", 1);
        this.extractRelativeDay("until.tomorrow", "end", 1);
        this.extractWeekDay("from.weekday.", "start");
        this.extractWeekDay("until.weekday.", "end");
        this.extractDate("from.ordinal.date", "start");
        this.extractDate("until.ordinal.date", "end");

        this.extractDayMonth("from.month.day", "start");
        this.extractDayMonthYear("from.year.month.day", "start");
        this.extractDayMonth("until.month.day", "end");
        this.extractDayMonthYear("until.year.month.day", "end");
        this.extractDayMonthName("from.monthname.day", "start");
        this.extractDayMonthNameYear("from.year.monthname.day", "start");
        this.extractDayMonthName("until.monthname.day", "end");
        this.extractDayMonthNameYear("until.year.monthname.day", "end");

        // duration
        this.extractDuration("duration.minutes", 1);
        this.extractDuration("duration.hours", 60);
        this.extractDuration("duration.days", 60 * 24);

        if (sel !== undefined && sel !== null) {
            this.markSelected(sel, title);
        }
        this.markContained();
        this.collected = this.collected.sort(this.sort);

        return this.collected;
    },

    extractDayMonthYear: function extractDayMonthYear(pattern, relation) {
        let alts = this.getRepPatterns(pattern, ["(\\d{1,2})", "(\\d{1,2})",
                                                "(\\d{2,4})" ]);
        let res;
        for (let alt in alts) {
            let positions = alts[alt].positions;
            let re = new RegExp(alts[alt].pattern, "ig");

            while ((res = re.exec(this.email)) != null) {
                if (!this.limitNums(res, this.email) && !this.limitChars(res, this.email)) {
                    let day = parseInt(res[positions[1]], 10);
                    let month = parseInt(res[positions[2]], 10);
                    let year = parseInt(this.normalizeYear(res[positions[3]]), 10);

                    if (this.isValidDay(day) && this.isValidMonth(month) &&
                        this.isValidYear(year)) {

                        let rev = this.prefixSuffixStartEnd(res, relation, this.email);
                        this.guess(year, month, day, null, null,
                                   rev.start, rev.end, rev.pattern, rev.relation, pattern);
                    }
                }
            }
        }
    },

    extractDayMonthNameYear: function extractDayMonthNameYear(pattern, relation) {
        let alts = this.getRepPatterns(pattern, ["(\\d{1,2})",
                                                "(" + this.allMonths + ")",
                                                "(\\d{2,4})" ]);
        let res;
        for (let alt in alts) {
            let exp = alts[alt].pattern.split(this.marker).join("|");
            let positions = alts[alt].positions;
            let re = new RegExp(exp, "ig");

            while ((res = re.exec(this.email)) != null) {
                if (!this.limitNums(res, this.email) && !this.limitChars(res, this.email)) {
                    let day = parseInt(res[positions[1]], 10);
                    let month = res[positions[2]];
                    let year = parseInt(this.normalizeYear(res[positions[3]]), 10);

                    if (this.isValidDay(day)) {
                        for (let i = 0; i < 12; i++) {
                            if (this.months[i].split("|").includes(month.toLowerCase())) {
                                let rev = this.prefixSuffixStartEnd(res, relation, this.email);
                                this.guess(year, i + 1, day, null, null,
                                           rev.start, rev.end, rev.pattern, rev.relation, pattern);
                                break;
                            }
                        }
                    }
                }
            }
        }
    },

    extractRelativeDay: function extractRelativeDay(pattern, relation, offset) {
        let re = new RegExp(this.getPatterns(pattern), "ig");
        let res;
        if ((res = re.exec(this.email)) != null) {
            if (!this.limitChars(res, this.email)) {
                let item = new Date(this.now.getTime() + 60 * 60 * 24 * 1000 * offset);
                let rev = this.prefixSuffixStartEnd(res, relation, this.email);
                this.guess(item.getFullYear(), item.getMonth() + 1, item.getDate(),
                           null, null,
                           rev.start, rev.end, rev.pattern, rev.relation, pattern);
            }
        }
    },

    extractDayMonthName: function extractDayMonthName(pattern, relation) {
        let alts = this.getRepPatterns(pattern,
                                       ["(\\d{1,2}" + this.marker + this.dailyNumbers + ")",
                                       "(" + this.allMonths + ")"]);
        let res;
        for (let alt in alts) {
            let exp = alts[alt].pattern.split(this.marker).join("|");
            let positions = alts[alt].positions;
            let re = new RegExp(exp, "ig");

            while ((res = re.exec(this.email)) != null) {
                if (!this.limitNums(res, this.email) && !this.limitChars(res, this.email)) {
                    let day = this.parseNumber(res[positions[1]], this.numbers);
                    let month = res[positions[2]];

                    if (this.isValidDay(day)) {
                        for (let i = 0; i < 12; i++) {
                            let ms = this.months[i].unescape().split("|");
                            if (ms.includes(month.toLowerCase())) {
                                let date = {year: this.now.getFullYear(), month: i + 1, day: day};
                                if (this.isPastDate(date, this.now)) {
                                    // find next such date
                                    let item = new Date(this.now.getTime());
                                    while (true) {
                                        item.setDate(item.getDate() + 1);
                                        if (item.getMonth() == date.month - 1 &&
                                            item.getDate() == date.day) {
                                            date.year = item.getFullYear();
                                            break;
                                        }
                                    }
                                }

                                let rev = this.prefixSuffixStartEnd(res, relation, this.email);
                                this.guess(date.year, date.month, date.day, null, null,
                                           rev.start, rev.end, rev.pattern, rev.relation, pattern);
                                break;
                            }
                        }
                    }
                }
            }
        }
    },

    extractDayMonth: function extractDayMonth(pattern, relation) {
        let alts = this.getRepPatterns(pattern, ["(\\d{1,2})", "(\\d{1,2})"]);
        let res;
        for (let alt in alts) {
            let re = new RegExp(alts[alt].pattern, "ig");
            let positions = alts[alt].positions;

            while ((res = re.exec(this.email)) != null) {
                if (!this.limitNums(res, this.email) && !this.limitChars(res, this.email)) {
                    let day = parseInt(res[positions[1]], 10);
                    let month = parseInt(res[positions[2]], 10);

                    if (this.isValidMonth(month) && this.isValidDay(day)) {
                        let date = {year: this.now.getFullYear(), month: month, day: day};

                        if (this.isPastDate(date, this.now)) {
                            // find next such date
                            let item = new Date(this.now.getTime());
                            while (true) {
                                item.setDate(item.getDate() + 1);
                                if (item.getMonth() == date.month - 1 &&
                                    item.getDate() == date.day) {
                                    date.year = item.getFullYear();
                                    break;
                                }
                            }
                        }

                        let rev = this.prefixSuffixStartEnd(res, relation, this.email);
                        this.guess(date.year, date.month, date.day, null, null,
                                   rev.start, rev.end, rev.pattern, rev.relation, pattern);
                    }
                }
            }
        }
    },

    extractDate: function extractDate(pattern, relation) {
        let alts = this.getRepPatterns(pattern,
                                       ["(\\d{1,2}" + this.marker + this.dailyNumbers + ")"]);
        let res;
        for (let alt in alts) {
            let exp = alts[alt].pattern.split(this.marker).join("|");
            let re = new RegExp(exp, "ig");

            while ((res = re.exec(this.email)) != null) {
                if (!this.limitNums(res, this.email) && !this.limitChars(res, this.email)) {
                    let day = this.parseNumber(res[1], this.numbers);
                    if (this.isValidDay(day)) {
                        let item = new Date(this.now.getTime());
                        if (this.now.getDate() != day) {
                            // find next nth date
                            while (true) {
                                item.setDate(item.getDate() + 1);
                                if (item.getDate() == day) {
                                    break;
                                }
                            }
                        }

                        let rev = this.prefixSuffixStartEnd(res, relation, this.email);
                        this.guess(item.getFullYear(), item.getMonth() + 1, day,
                                   null, null,
                                   rev.start, rev.end,
                                   rev.pattern, rev.relation, pattern, true);
                    }
                }
            }
        }
    },

    extractWeekDay: function extractWeekDay(pattern, relation) {
        let days = [];
        for (let i = 0; i < 7; i++) {
            days[i] = this.getPatterns(pattern + i);
            let re = new RegExp(days[i], "ig");
            let res = re.exec(this.email);
            if (res) {
                if (!this.limitChars(res, this.email)) {
                    let date = new Date();
                    date.setDate(this.now.getDate());
                    date.setMonth(this.now.getMonth());
                    date.setYear(this.now.getFullYear());

                    let diff = (i - date.getDay() + 7) % 7;
                    date.setDate(date.getDate() + diff);

                    let rev = this.prefixSuffixStartEnd(res, relation, this.email);
                    this.guess(date.getFullYear(), date.getMonth() + 1, date.getDate(),
                               null, null,
                               rev.start, rev.end,
                               rev.pattern, rev.relation, pattern + i, true);
                }
            }
        }
    },

    extractHour: function extractHour(pattern, relation, meridiem) {
        let alts = this.getRepPatterns(pattern,
                                       ["(\\d{1,2}" + this.marker + this.hourlyNumbers + ")"]);
        let res;
        for (let alt in alts) {
            let exp = alts[alt].pattern.split(this.marker).join("|");
            let re = new RegExp(exp, "ig");

            while ((res = re.exec(this.email)) != null) {
                if (!this.limitNums(res, this.email) && !this.limitChars(res, this.email)) {
                    let hour = this.parseNumber(res[1], this.numbers);

                    if (meridiem == "ante" && hour == 12) {
                        hour = hour - 12;
                    } else if (meridiem == "post" && hour != 12) {
                        hour = hour + 12;
                    } else {
                        hour = this.normalizeHour(hour);
                    }

                    if (this.isValidHour(res[1])) {
                        let rev = this.prefixSuffixStartEnd(res, relation, this.email);
                        this.guess(null, null, null, hour, 0,
                                   rev.start, rev.end, rev.pattern, rev.relation, pattern, true);
                    }
                }
            }
        }
    },

    extractHalfHour: function extractHalfHour(pattern, relation, direction) {
        let alts = this.getRepPatterns(pattern,
                                       ["(\\d{1,2}" + this.marker + this.hourlyNumbers + ")"]);
        let res;
        for (let alt in alts) {
            let exp = alts[alt].pattern.split(this.marker).join("|");
            let re = new RegExp(exp, "ig");

            while ((res = re.exec(this.email)) != null) {
                if (!this.limitNums(res, this.email) && !this.limitChars(res, this.email)) {
                    let hour = this.parseNumber(res[1], this.numbers);

                    hour = this.normalizeHour(hour);
                    if (direction == "ante") {
                        if (hour == 1) {
                            hour = 12;
                        } else {
                            hour = hour - 1;
                        }
                    }

                    if (this.isValidHour(hour)) {
                        let rev = this.prefixSuffixStartEnd(res, relation, this.email);
                        this.guess(null, null, null, hour, 30,
                                   rev.start, rev.end, rev.pattern, rev.relation, pattern, true);
                    }
                }
            }
        }
    },

    extractHourMinutes: function extractHourMinutes(pattern, relation, meridiem) {
        let alts = this.getRepPatterns(pattern, ["(\\d{1,2})", "(\\d{2})"]);
        let res;
        for (let alt in alts) {
            let positions = alts[alt].positions;
            let re = new RegExp(alts[alt].pattern, "ig");

            while ((res = re.exec(this.email)) != null) {
                if (!this.limitNums(res, this.email) && !this.limitChars(res, this.email)) {
                    let hour = parseInt(res[positions[1]], 10);
                    let minute = parseInt(res[positions[2]], 10);

                    if (meridiem == "ante" && hour == 12) {
                        hour = hour - 12;
                    } else if (meridiem == "post" && hour != 12) {
                        hour = hour + 12;
                    } else {
                        hour = this.normalizeHour(hour);
                    }

                    if (this.isValidHour(hour) && this.isValidMinute(hour)) {
                        let rev = this.prefixSuffixStartEnd(res, relation, this.email);
                        this.guess(null, null, null, hour, minute,
                                   rev.start, rev.end, rev.pattern, rev.relation, pattern);
                    }
                }
            }
        }
    },

    extractTime: function extractTime(pattern, relation, hour, minute) {
        let re = new RegExp(this.getPatterns(pattern), "ig");
        let res;
        if ((res = re.exec(this.email)) != null) {
            if (!this.limitChars(res, this.email)) {
                let rev = this.prefixSuffixStartEnd(res, relation, this.email);
                this.guess(null, null, null, hour, minute,
                           rev.start, rev.end, rev.pattern, rev.relation, pattern);
            }
        }
    },

    extractDuration: function extractDuration(pattern, unit) {
        let alts = this.getRepPatterns(pattern,
                                       ["(\\d{1,2}" + this.marker + this.dailyNumbers + ")"]);
        let res;
        for (let alt in alts) {
            let exp = alts[alt].pattern.split(this.marker).join("|");
            let re = new RegExp(exp, "ig");

            while ((res = re.exec(this.email)) != null) {
                if (!this.limitNums(res, this.email) && !this.limitChars(res, this.email)) {
                    let length = this.parseNumber(res[1], this.numbers);
                    let guess = {};
                    let rev = this.prefixSuffixStartEnd(res, "duration", this.email);
                    guess.duration = length * unit;
                    guess.start = rev.start;
                    guess.end = rev.end;
                    guess.str = rev.pattern;
                    guess.relation = rev.relation;
                    guess.pattern = pattern;
                    this.collected.push(guess);
                }
            }
        }
    },

    markContained: function markContained() {
        for (let outer = 0; outer < this.collected.length; outer++) {
            for (let inner = 0; inner < this.collected.length; inner++) {
                // included but not exactly the same
                if (outer != inner &&
                    this.collected[outer].start && this.collected[outer].end &&
                    this.collected[inner].start && this.collected[inner].end &&
                    this.collected[inner].start >= this.collected[outer].start &&
                    this.collected[inner].end <= this.collected[outer].end &&
                    !(this.collected[inner].start == this.collected[outer].start &&
                        this.collected[inner].end == this.collected[outer].end)) {

                        cal.LOG("[calExtract] " + this.collected[outer].str + " found as well, disgarding " + this.collected[inner].str);
                        this.collected[inner].relation = "notadatetime";
                }
            }
        }
    },

    markSelected: function markSelected(sel, title) {
        if (sel.rangeCount > 0) {
            // mark the ones to not use
            for (let i = 0; i < sel.rangeCount; i++) {
                cal.LOG("[calExtract] Selection " + i + " is " + sel);
                for (let j = 0; j < this.collected.length; j++) {
                    let selection = sel.getRangeAt(i).toString();

                    if (!selection.includes(this.collected[j].str) &&
                        !title.includes(this.collected[j].str) &&
                        this.collected[j].start != null) { // always keep email date, needed for tasks
                        cal.LOG("[calExtract] Marking " + JSON.stringify(this.collected[j]) + " as notadatetime");
                        this.collected[j].relation = "notadatetime";
                    }
                }
            }
        }
    },

    sort: function sort(one, two) {
        let rc;
        // sort the guess from email date as the last one
        if (one.start == null && two.start != null) {
            return 1;
        } else if (one.start != null && two.start == null) {
            return -1;
        } else if (one.start == null && two.start == null) {
            return 0;
        // sort dates before times
        } else if (one.year != null && two.year == null) {
            return -1;
        } else if (one.year == null && two.year != null) {
            return 1;
        } else if (one.year != null && two.year != null) {
            rc = (one.year > two.year) - (one.year < two.year);
            if (rc != 0) {
                return rc;
            } else {
                rc = (one.month > two.month) - (one.month < two.month);
                if (rc != 0) {
                    return rc;
                } else {
                    rc = (one.day > two.day) - (one.day < two.day);
                    return rc;
                }
            }
        } else {
            rc = (one.hour > two.hour) - (one.hour < two.hour);
            if (rc != 0) {
                return rc;
            } else {
                rc = (one.minute > two.minute) - (one.minute < two.minute)
                return rc;
            }
        }
    },

    /**
    * Guesses start time from list of guessed datetimes
    *
    * @param isTask    whether start time should be guessed for task or event
    * @return          datetime object for start time
    */
    guessStart: function guessStart(isTask) {
        let startTimes = this.collected.filter(val => val.relation == "start");
        if (startTimes.length == 0) {
            return {};
        }

        for (let val in startTimes) {
            cal.LOG("[calExtract] Start: " + JSON.stringify(startTimes[val]));
        }

        let guess = {};
        let wDayInit = startTimes.filter(val => val.day != null && val.start === undefined);

        // with tasks we don't try to guess start but assume email date
        if (isTask) {
            guess.year = wDayInit[0].year;
            guess.month = wDayInit[0].month;
            guess.day = wDayInit[0].day;
            guess.hour = wDayInit[0].hour;
            guess.minute = wDayInit[0].minute;
            return guess;
        }

        let wDay = startTimes.filter(val => val.day != null && val.start !== undefined);
        let wDayNA = wDay.filter(val => val.ambiguous === undefined);

        let wMinute = startTimes.filter(val => val.minute != null && val.start !== undefined);
        let wMinuteNA = wMinute.filter(val => val.ambiguous === undefined);
        let wMinuteInit = startTimes.filter(val => val.minute != null && val.start === undefined);

        if (wMinuteNA.length != 0) {
            guess.hour = wMinuteNA[0].hour;
            guess.minute = wMinuteNA[0].minute;
        } else if (wMinute.length != 0) {
            guess.hour = wMinute[0].hour;
            guess.minute = wMinute[0].minute;
        }

        // first use unambiguous guesses
        if (wDayNA.length != 0) {
            guess.year = wDayNA[0].year;
            guess.month = wDayNA[0].month;
            guess.day = wDayNA[0].day;
        // then also ambiguous ones
        } else if (wDay.length != 0) {
            guess.year = wDay[0].year;
            guess.month = wDay[0].month;
            guess.day = wDay[0].day;
        // next possible day considering time
        } else if (guess.hour != null &&
                      (wDayInit[0].hour > guess.hour ||
                          (wDayInit[0].hour == guess.hour &&
                           wDayInit[0].minute > guess.minute))) {
            let nextDay = new Date(wDayInit[0].year, wDayInit[0].month - 1, wDayInit[0].day);
            nextDay.setTime(nextDay.getTime() + 60 * 60 * 24 * 1000);
            guess.year = nextDay.getFullYear();
            guess.month = nextDay.getMonth() + 1;
            guess.day = nextDay.getDate();
        // and finally when nothing was found then use initial guess from send time
        } else {
            guess.year = wDayInit[0].year;
            guess.month = wDayInit[0].month;
            guess.day = wDayInit[0].day;
        }

        cal.LOG("[calExtract] Start picked: " + JSON.stringify(guess));
        return guess;
    },

    /**
    * Guesses end time from list of guessed datetimes relative to start time
    *
    * @param start     start time to consider when guessing
    * @param isTask    whether start time should be guessed for task or event
    * @return          datetime object for end time
    */
    guessEnd: function guessEnd(start, isTask) {
        let guess = {};
        let endTimes = this.collected.filter(val => val.relation == "end");
        let durations = this.collected.filter(val => val.relation == "duration");
        if (endTimes.length == 0 && durations.length == 0) {
            return {};
        } else {
            for (val in endTimes) {
                cal.LOG("[calExtract] End: " + JSON.stringify(endTimes[val]));
            }

            let wDay = endTimes.filter(val => val.day != null);
            let wDayNA = wDay.filter(val => val.ambiguous === undefined);
            let wMinute = endTimes.filter(val => val.minute != null);
            let wMinuteNA = wMinute.filter(val => val.ambiguous === undefined);

            // first set non-ambiguous dates
            let pos = isTask == true ? 0 : wDayNA.length - 1;
            if (wDayNA.length != 0) {
                guess.year = wDayNA[pos].year;
                guess.month = wDayNA[pos].month;
                guess.day = wDayNA[pos].day;
            // then ambiguous dates
            } else if (wDay.length != 0) {
                pos = isTask == true ? 0 : wDay.length - 1;
                guess.year = wDay[pos].year;
                guess.month = wDay[pos].month;
                guess.day = wDay[pos].day;
            }

            // then non-ambiguous times
            if (wMinuteNA.length != 0) {
                pos = isTask == true ? 0 : wMinuteNA.length - 1;
                guess.hour = wMinuteNA[pos].hour;
                guess.minute = wMinuteNA[pos].minute;
                if (guess.day == null || guess.day == start.day) {
                    if (wMinuteNA[pos].hour < start.hour ||
                           (wMinuteNA[pos].hour == start.hour &&
                            wMinuteNA[pos].minute < start.minute)) {
                        let nextDay = new Date(start.year, start.month - 1, start.day);
                        nextDay.setTime(nextDay.getTime() + 60 * 60 * 24 * 1000);
                        guess.year = nextDay.getFullYear();
                        guess.month = nextDay.getMonth() + 1;
                        guess.day = nextDay.getDate();
                    }
                }
            // and ambiguous times
            } else if (wMinute.length != 0) {
                pos = isTask == true ? 0 : wMinute.length - 1;
                guess.hour = wMinute[pos].hour;
                guess.minute = wMinute[pos].minute;
                if (guess.day == null || guess.day == start.day) {
                    if (wMinute[pos].hour < start.hour ||
                           (wMinute[pos].hour == start.hour &&
                            wMinute[pos].minute < start.minute)) {
                        let nextDay = new Date(start.year, start.month - 1, start.day);
                        nextDay.setTime(nextDay.getTime() + 60 * 60 * 24 * 1000);
                        guess.year = nextDay.getFullYear();
                        guess.month = nextDay.getMonth() + 1;
                        guess.day = nextDay.getDate();
                    }
                }
            }

            // fill in date when time was guessed
            if (guess.minute != null && guess.day == null) {
                guess.year = start.year;
                guess.month = start.month;
                guess.day = start.day;
            }

            // fill in end from total duration
            if (guess.day == null && guess.hour == null) {
                let duration = 0;

                for (val in durations) {
                    duration += durations[val].duration;
                    cal.LOG("[calExtract] Dur: " + JSON.stringify(durations[val]));
                }

                if (duration != 0) {
                    let startDate = new Date(start.year, start.month - 1, start.day);
                    if (start.hour != null) {
                        startDate.setHours(start.hour);
                        startDate.setMinutes(start.minute);
                    } else {
                        startDate.setHours(0);
                        startDate.setMinutes(0);
                    }

                    let endTime = new Date(startDate.getTime() + duration * 60 * 1000);
                    guess.year = endTime.getFullYear();
                    guess.month = endTime.getMonth() + 1;
                    guess.day = endTime.getDate();
                    if (!(endTime.getHours() == 0 && endTime.getMinutes() == 0)) {
                        guess.hour = endTime.getHours()
                        guess.minute = endTime.getMinutes();
                    }
                }
            }

            // no zero length events/tasks
            if (guess.year == start.year && guess.month == start.month &&
                guess.day == start.day && guess.hour == start.hour &&
                guess.minute == start.minute) {
                guess.year = null;
                guess.month = null;
                guess.day = null;
                guess.hour = null;
                guess.minute = null;
            }

            if (guess.year != null && guess.minute == null && isTask) {
                guess.hour = 0;
                guess.minute = 0;
            }

            cal.LOG("[calExtract] End picked: " + JSON.stringify(guess));
            return guess;
        }
    },

    getPatterns: function getPatterns(name) {
        let value;
        try {
            value = this.bundle.GetStringFromName(name);
            this.checkForFaultyPatterns(value, name);
            if (value.trim() == "") {
                cal.LOG("[calExtract] Pattern not found: " + name);
                return this.defPattern;
            }

            let vals = this.cleanPatterns(value).split("|");
            if (this.overrides[name] !== undefined &&
                this.overrides[name]["add"] !== undefined) {
                let additions = this.overrides[name]["add"];
                additions = this.cleanPatterns(additions).split("|");
                for (let pattern in additions) {
                    vals.push(additions[pattern]);
                    cal.LOG("[calExtract] Added " + additions[pattern] + " to " + name);
                }
            }

            if (this.overrides[name] !== undefined &&
                this.overrides[name]["remove"] !== undefined) {
                let removals = this.overrides[name]["remove"];
                removals = this.cleanPatterns(removals).split("|");
                for (let pattern in removals) {
                    let idx = vals.indexOf(removals[pattern]);
                    if (idx != -1) {
                        vals.splice(idx, 1);
                        cal.LOG("[calExtract] Removed " + removals[pattern] + " from " + name);
                    }
                }
            }

            vals.sort(function(one, two) {return two.length - one.length;});
            return vals.join("|");
        } catch (ex) {
            cal.LOG("[calExtract] Pattern not found: " + name);

            // fake a value to avoid empty regexes creating endless loops
            return this.defPattern;
        }
    },

    getRepPatterns: function getRepPatterns(name, replaceables) {
        let alts = new Array();
        let patterns = new Array();

        try {
            let value = this.bundle.GetStringFromName(name);
            this.checkForFaultyPatterns(value, name);
            if (value.trim() == "") {
                cal.LOG("[calExtract] Pattern empty: " + name);
                return alts;
            }

            let vals = this.cleanPatterns(value).split("|");
            if (this.overrides[name] !== undefined &&
                this.overrides[name]["add"] !== undefined) {
                let additions = this.overrides[name]["add"];
                additions = this.cleanPatterns(additions).split("|");
                for (let pattern in additions) {
                    vals.push(additions[pattern]);
                    cal.LOG("[calExtract] Added " + additions[pattern] + " to " + name);
                }
            }

            if (this.overrides[name] !== undefined &&
                this.overrides[name]["remove"] !== undefined) {
                let removals = this.overrides[name]["remove"];
                removals = this.cleanPatterns(removals).split("|");
                for (let pattern in removals) {
                    let idx = vals.indexOf(removals[pattern]);
                    if (idx != -1) {
                        vals.splice(idx, 1);
                        cal.LOG("[calExtract] Removed " + removals[pattern] + " from " + name);
                    }
                }
            }

            vals.sort(function(one, two) {return two.length - one.length;});
            for (let val in vals) {
                let pattern = vals[val];
                let cnt = 1;
                for (let replaceable in replaceables) {
                    pattern = pattern.split("#" + cnt).join(replaceables[cnt - 1]);
                    cnt++;
                }
                patterns.push(pattern);
            }

            for (let val in vals) {
                let positions = new Array();
                if (replaceables.length == 1) {
                    positions[1] = 1;
                } else {
                    positions = this.getPositionsFor(vals[val], name, replaceables.length);
                }
                alts[val] = {pattern: patterns[val], positions: positions};
            }
        } catch (ex) {
            cal.LOG("[calExtract] Pattern not found: " + name);
        }
        return alts;
    },

    getPositionsFor: function getPositionsFor(s, name, count) {
        let positions = new Array();
        let re = /#(\d)/g;
        let match;
        let i = 0;
        while ((match = re.exec(s))) {
            i++;
            positions[parseInt(match[1], 10)] = i;
        }

        // correctness checking
        for (i = 1; i <= count; i++) {
            if (positions[i] === undefined) {
                Components.utils.reportError("[calExtract] Faulty extraction pattern " + name +
                                             ", missing parameter #" + i);
            }
        }
        return positions;
    },

    cleanPatterns: function cleanPatterns(pattern) {
        // remove whitespace around | if present
        let value = pattern.replace(/\s*\|\s*/g, "|");
        // allow matching for patterns with missing or excessive whitespace
        return value.sanitize().replace(/\s+/g, "\\s*");
    },

    checkForFaultyPatterns: function checkForFaultyPatterns(pattern, name) {
        if (/^\s*\|/.exec(pattern) || /\|\s*$/.exec(pattern) || /\|\s*\|/.exec(pattern)) {
            dump("[calExtract] Faulty extraction pattern " +
                 pattern + " for " + name + "\n");
            Components.utils.reportError("[calExtract] Faulty extraction pattern " +
                                         pattern + " for " + name);
        }
    },

    isValidYear: function isValidYear(year) {
        return (year >= 2000 && year <= 2050);
    },

    isValidMonth: function isValidMonth(month) {
        return (month >= 1 && month <= 12);
    },

    isValidDay: function isValidDay(day) {
        return (day >= 1 && day <= 31);
    },

    isValidHour: function isValidHour(hour) {
        return (hour >= 0 && hour <= 23);
    },

    isValidMinute: function isValidMinute(minute) {
        return (minute >= 0 && minute <= 59);
    },

    isPastDate: function isPastDate(date, referenceDate) {
        // avoid changing original refDate
        let refDate = new Date(referenceDate.getTime());
        refDate.setHours(0);
        refDate.setMinutes(0);
        refDate.setSeconds(0);
        refDate.setMilliseconds(0);
        let jsDate;
        if (date.day != null) {
            jsDate = new Date(date.year, date.month - 1, date.day);
        }
        return jsDate < refDate;
    },

    normalizeHour: function normalizeHour(hour) {
        if (hour < this.dayStart && hour <= 11) {
            return hour + 12;
        }
        return hour;
    },

    normalizeYear: function normalizeYear(year) {
        return (year.length == 2) ? "20" + year : year;
    },

    limitNums: function limitNums(res, email) {
        let pattern = email.substring(res.index, res.index + res[0].length);
        let before = email.charAt(res.index - 1);
        let after = email.charAt(res.index + res[0].length);
        let result = (/\d/.exec(before) && /\d/.exec(pattern.charAt(0))) ||
                     (/\d/.exec(pattern.charAt(pattern.length - 1)) && /\d/.exec(after));
        return result != null;
    },

    limitChars: function limitChars(res, email) {
        let alphabet = this.getPatterns("alphabet");
        // for languages without regular alphabet surrounding characters are ignored
        if (alphabet == this.defPattern) {
            return false;
        }

        let pattern = email.substring(res.index, res.index + res[0].length);
        let before = email.charAt(res.index - 1);
        let after = email.charAt(res.index + res[0].length);

        let w = new RegExp("[" + alphabet + "]");
        let result = (w.exec(before) && w.exec(pattern.charAt(0))) ||
                     (w.exec(pattern.charAt(pattern.length - 1)) && w.exec(after));
        return result != null;
    },

    prefixSuffixStartEnd: function prefixSuffixStart(res, relation, email) {
        let pattern = email.substring(res.index, res.index + res[0].length);
        let prev = email.substring(0, res.index);
        let next = email.substring(res.index + res[0].length);
        let prefixSuffix = {start: res.index, end: res.index + res[0].length,
                            pattern: pattern, relation: relation};
        let ch = "\\s*";
        let psres;

        let re = new RegExp("(" + this.getPatterns("end.prefix") + ")" + ch + "$", "ig");
        if ((psres = re.exec(prev)) != null) {
            prefixSuffix.relation = "end";
            prefixSuffix.start = psres.index;
            prefixSuffix.pattern = psres[0] + pattern;
        }

        re = new RegExp("^" + ch + "(" + this.getPatterns("end.suffix") + ")", "ig");
        if ((psres = re.exec(next)) != null) {
            prefixSuffix.relation = "end";
            prefixSuffix.end = prefixSuffix.end + psres[0].length;
            prefixSuffix.pattern = pattern + psres[0];
        }

        re = new RegExp("(" + this.getPatterns("start.prefix") + ")" + ch + "$", "ig");
        if ((psres = re.exec(prev)) != null) {
            prefixSuffix.relation = "start";
            prefixSuffix.start = psres.index;
            prefixSuffix.pattern = psres[0] + pattern;
        }

        re = new RegExp("^" + ch + "(" + this.getPatterns("start.suffix") + ")", "ig");
        if ((psres = re.exec(next)) != null) {
            prefixSuffix.relation = "start";
            prefixSuffix.end = prefixSuffix.end + psres[0].length;
            prefixSuffix.pattern = pattern + psres[0];
        }

        re = new RegExp("\\s(" + this.getPatterns("no.datetime.prefix") + ")" + ch + "$", "ig");

        if ((psres = re.exec(prev)) != null) {
            prefixSuffix.relation = "notadatetime";
        }

        re = new RegExp("^" + ch + "(" + this.getPatterns("no.datetime.suffix") + ")", "ig");
        if ((psres = re.exec(next)) != null) {
            prefixSuffix.relation = "notadatetime";
        }

        return prefixSuffix;
    },

    parseNumber: function parseNumber(number, numbers) {
        let r = parseInt(number, 10);
        // number comes in as plain text, numbers are already adjusted for usage
        // in regular expression
        number = this.cleanPatterns(number);
        if (isNaN(r)) {
            for (let i = 0; i <= 31; i++) {
                let ns = numbers[i].split("|");
                if (ns.includes(number.toLowerCase())) {
                    return i;
                }
            }
            return -1;
        } else {
            return r;
        }
    },

    guess: function guess(year, month, day, hour, minute, start, end, str,
                          relation, pattern, ambiguous) {
        let guess = {year: year, month: month, day: day, hour: hour, minute: minute,
                     start: start, end: end, str: str, relation: relation,
                     pattern: pattern, ambiguous: ambiguous};
        // past dates are kept for containment checks
        if (this.isPastDate(guess, this.now)) {
            guess.relation = "notadatetime";
        }
        this.collected.push(guess);
    }
};

String.prototype.sanitize = function() {
    return this.replace(/[-[\]{}()*+?.,\\^$]/g, "\\$&");
}

String.prototype.unescape = function() {
    let res = this.replace(/\\([\.])/g, "$1");
    return res;
}
