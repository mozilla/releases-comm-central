/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This file contains the munger functions and rules used by ChatZilla.
 * It's generally a bad idea to call munger functions inside ChatZilla for
 * anything but munging (chat) output.
 */

/* Constructs a new munger entry, using a regexp or lambda match function, and
 * a class name (to be applied by the munger itself) or lambda replace
 * function, and the default enabled state and a start priority (used if two
 * rules match at the same index), as well as a default tag (when the munger
 * adds it based on the class name) name.
 *
 * Regular Expressions for matching should ensure that the first capturing
 * group is the one that contains the matched text. Non-capturing groups, of
 * zero-width or otherwise can be used before and after, to ensure the right
 * things are matched (e.g. to ensure whitespace before something).
 *
 * Note that for RegExp matching, the munger will search for the matched text
 * (from the first capturing group) from the leftmost point of the entire
 * match. This means that if the text that matched the first group occurs in
 * any part of the match before the group, the munger will apply to the wrong
 * bit. This is not usually a problem, but if it is you should use a
 * lambdaMatch function and be sure to return the new style return value,
 * which specifically indicates the start.
 *
 * The lambda match and lambda replace functions have this signature:
 *   lambdaMatch(text, containerTag, data, mungerEntry)
 *   lambdaReplace(text, containerTag, data, mungerEntry)
 *     - text is the entire text to find a match in/that has matched
 *     - containerTag is the element containing the text (not useful?)
 *     - data is a generic object containing properties kept throughout
 *     - mungerEntry is the CMungerEntry object for the munger itself
 *
 *   The lambdaReplace function is expected to do everything needed to put
 *   |text| into |containerTab| ready for display.
 *
 *   The return value for lambda match functions should be either:
 *     - (old style) just the text that matched
 *       (the munger will search for this text, and uses the first match)
 *     - (new style) an object with properties:
 *       - start (start index, 0 = first character)
 *       - text  (matched text)
 *       (note that |text| must start at index |start|)
 *
 *   The return value for lambda replace functions are not used.
 *
 */

function CMungerEntry(name, regex, className, priority, startPriority, enable) {
  this.name = name;
  if (name[0] != ".") {
    this.description = getMsg("munger." + name, null, null);
  }
  this.enabled = typeof enable == "undefined" ? true : enable;
  this.enabledDefault = this.enabled;
  this.startPriority = startPriority ? startPriority : 0;
  this.priority = priority;

  if (isinstance(regex, RegExp)) {
    this.regex = regex;
  } else {
    this.lambdaMatch = regex;
  }

  if (typeof className == "function") {
    this.lambdaReplace = className;
  } else {
    this.className = className;
  }
}

function CMunger(textMunger) {
  this.entries = [];
  this.enabled = true;
  if (textMunger) {
    this.insertPlainText = textMunger;
  }
}

CMunger.prototype = {
  insertPlainText(text, containerTag, data) {
    let textNode = document.createTextNode(text);
    containerTag.appendChild(textNode);
  },

  getRule(name) {
    for (let entry of this.entries) {
      if (isinstance(entry, Object) && name in entry) {
        return entry[name];
      }
    }
    return null;
  },

  addRule(name, regex, className, priority, startPriority, enable) {
    if (typeof this.entries[priority] != "object") {
      this.entries[priority] = {};
    }
    var entry = new CMungerEntry(
      name,
      regex,
      className,
      priority,
      startPriority,
      enable
    );
    this.entries[priority][name] = entry;
  },

  delRule(name) {
    for (let entry of this.entries) {
      if (isinstance(entry, Object) && name in entry) {
        delete entry[name];
      }
    }
  },

  munge(text, containerTag, data) {
    if (!containerTag) {
      containerTag = document.createElementNS(XHTML_NS, "html:span");
    }

    // Starting from the top, for each valid priority, check all the rules,
    // return as soon as something matches.
    if (this.enabled) {
      for (let i = this.entries.length - 1; i >= 0; i--) {
        if (i in this.entries) {
          if (this.mungePriority(i, text, containerTag, data)) {
            return containerTag;
          }
        }
      }
    }

    // If nothing matched, we don't have to do anything,
    // just insert text (if any).
    if (text) {
      this.insertPlainText(text, containerTag, data);
    }
    return containerTag;
  },

  mungePriority(priority, text, containerTag, data) {
    let matches = {};
    // Find all the matches in this priority
    for (let entry in this.entries[priority]) {
      let munger = this.entries[priority][entry];
      if (!munger.enabled) {
        continue;
      }

      let match;
      if (typeof munger.lambdaMatch == "function") {
        let rval = munger.lambdaMatch(text, containerTag, data, munger);
        if (typeof rval == "string") {
          match = { start: text.indexOf(rval), text: rval };
        } else if (typeof rval == "object") {
          match = rval;
        }
      } else {
        let ary = text.match(munger.regex);
        if (ary != null && ary[1]) {
          match = { start: text.indexOf(ary[1]), text: ary[1] };
        }
      }

      if (match && match.start >= 0) {
        match.munger = munger;
        matches[entry] = match;
      }
    }

    // Find the first matching entry...
    let firstMatch = { start: text.length, munger: null };
    let firstPriority = 0;
    for (let entry in matches) {
      // If it matches before the existing first, or at the same spot but
      // with a higher start-priority, this is a better match.
      if (
        matches[entry].start < firstMatch.start ||
        (matches[entry].start == firstMatch.start &&
          this.entries[priority][entry].startPriority > firstPriority)
      ) {
        firstMatch = matches[entry];
        firstPriority = this.entries[priority][entry].startPriority;
      }
    }

    // Replace it.
    if (firstMatch.munger) {
      let munger = firstMatch.munger;
      firstMatch.end = firstMatch.start + firstMatch.text.length;

      // Need to deal with the text before the match, if there is any.
      if (firstMatch.start > 0) {
        let beforeText = text.slice(0, firstMatch.start);
        this.munge(beforeText, containerTag, data);
      }

      if (typeof munger.lambdaReplace == "function") {
        // The munger rule itself should take care of munging the 'inside'
        // of the match.
        munger.lambdaReplace(firstMatch.text, containerTag, data, munger);
      } else {
        let tag = document.createElementNS(XHTML_NS, "html:span");
        tag.setAttribute("class", munger.className + calcClass(data));

        // Don't let this rule match again when we recurse.
        munger.enabled = false;
        this.munge(firstMatch.text, tag, data);
        munger.enabled = true;

        containerTag.appendChild(tag);
      }

      this.munge(text.slice(firstMatch.end), containerTag, data);

      return containerTag;
    }
    return null;
  },
};

function initMunger() {
  /* linkRE: the general URL linkifier regular expression:
   *
   * - start with whitespace, non-word, or begining-of-line
   * - then match:
   *   - EITHER scheme (word + hyphen), colon, then lots of non-whitespace
   *   - OR "www" followed by at least 2 sets of:
   *     - "." plus some non-whitespace, non-"." characters
   * - must end match with a word-break
   * - include a "/" or "=" beyond break if present
   * - end with whitespace, non-word, or end-of-line
   */
  client.linkRE =
    /(?:\W|^)((?:(\w[\w-]+):[^\s]+|www(\.[^.\s]+){2,})\b[\/=\)]?)(?=\s|\W|$)/;

  // Colours: \x03, with optional foreground and background colours
  client.colorRE = /(\x03((\d{1,2})(,\d{1,2}|)|))/;

  client.whitespaceRE = new RegExp("(\\S{" + client.MAX_WORD_DISPLAY + ",})");

  const LOW_PRIORITY = 5;
  const NORMAL_PRIORITY = 10;
  const HIGH_PRIORITY = 15;
  const HIGHER_PRIORITY = 20;

  var munger = (client.munger = new CMunger(insertText));
  // Special internal munger!
  munger.addRule(
    ".inline-buttons",
    /(\[\[.*?\]\])/,
    insertInlineButton,
    HIGH_PRIORITY,
    LOW_PRIORITY,
    false
  );
  munger.addRule(
    "quote",
    /(``|'')/,
    insertQuote,
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );
  munger.addRule(
    "bold",
    /(?:[\s(\[]|^)(\*[^*()]*\*)(?:[\s\]).,;!\?]|$)/,
    "chatzilla-bold",
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );
  munger.addRule(
    "underline",
    /(?:[\s(\[]|^)(\_[^_()]*\_)(?:[\s\]).,;!\?]|$)/,
    "chatzilla-underline",
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );
  munger.addRule(
    "italic",
    /(?:\s|^)(\/[^\/()]*\/)(?:[\s.,]|$)/,
    "chatzilla-italic",
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );
  /* allow () chars inside |code()| blocks */
  munger.addRule(
    "teletype",
    /(?:\s|^)(\|[^|]*\|)(?:[\s.,]|$)/,
    "chatzilla-teletype",
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );
  munger.addRule(
    ".mirc-colors",
    client.colorRE,
    mircChangeColor,
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );
  munger.addRule(
    ".mirc-bold",
    /(\x02)/,
    mircToggleBold,
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );
  munger.addRule(
    ".mirc-underline",
    /(\x1f)/,
    mircToggleUnder,
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );
  munger.addRule(
    ".mirc-color-reset",
    /(\x0f)/,
    mircResetColor,
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );
  munger.addRule(
    ".mirc-reverse",
    /(\x16)/,
    mircReverseColor,
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );
  munger.addRule(
    ".ansi-escape-sgr",
    /(\x1b\[([\d;]*)m)/,
    ansiEscapeSGR,
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );
  munger.addRule(
    "ctrl-char",
    /([\x01-\x1f])/,
    showCtrlChar,
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );
  munger.addRule(
    "link",
    client.linkRE,
    insertLink,
    NORMAL_PRIORITY,
    HIGH_PRIORITY
  );

  // This has a higher starting priority so as to get it to match before the
  // normal link, which won't know about mailto and then fail.
  munger.addRule(
    ".mailto",
    /(?:\W|^)((mailto:)?[^:;\\<>\[\]()\'\"\s\u201d]+@[^.<>\[\]()\'\"\s\u201d]+\.[^<>\[\]()\'\"\s\u201d]+)/i,
    insertMailToLink,
    NORMAL_PRIORITY,
    HIGHER_PRIORITY,
    false
  );

  addBugzillaLinkMungerRule(
    client.prefs.bugKeyword,
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );

  munger.addRule(
    "channel-link",
    /(?:[^\w#]|^)[@%+]?(#[^<>,\[\](){}\"\s\u201d]*[^:,.<>\[\](){}\'\"\s\u201d])/i,
    insertChannelLink,
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );
  munger.addRule(
    "talkback-link",
    /(?:\W|^)(TB\d{8,}[A-Z]?)(?:\W|$)/,
    insertTalkbackLink,
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );

  munger.addRule(
    "face",
    /((^|\s)(?:[>O]?[B8=:;(xX%][~']?[-^v"]?(?:[)|(PpSs0oO#\?\*\[\]\/\\]|D+)|>[-^v]?\)|[oO9][._][oO9])(\s|$))/,
    insertSmiley,
    NORMAL_PRIORITY,
    NORMAL_PRIORITY
  );
  munger.addRule("rheet", /(?:\W|^)(rhee+t\!*)(?:\s|$)/i, insertRheet, 10, 10);
  munger.addRule(
    "word-hyphenator",
    client.whitespaceRE,
    insertHyphenatedWord,
    LOW_PRIORITY,
    NORMAL_PRIORITY
  );

  client.enableColors = client.prefs["munger.colorCodes"];
  let branch = Services.prefs.getBranch("extensions.irc.munger.");
  for (let entry of munger.entries) {
    if (!isinstance(entry, Object)) {
      continue;
    }

    for (let rule in entry) {
      if (rule[0] == ".") {
        continue;
      }

      entry[rule].enabled = branch.getBoolPref(rule, true);
    }
  }
}

function addBugzillaLinkMungerRule(keywords, priority, startPriority) {
  client.munger.addRule(
    "bugzilla-link",
    new RegExp(
      "(?:\\W|^)((" +
        keywords +
        ")\\s+(?:#?\\d+|#[^\\s,]{1,20})(?:\\s+comment\\s+#?\\d+)?)",
      "i"
    ),
    insertBugzillaLink,
    priority,
    startPriority
  );
}

function insertLink(matchText, containerTag, data, mungerEntry) {
  var href;
  var linkText;

  var trailing;
  ary = matchText.match(/([.,?\)]+)$/);
  if (ary) {
    linkText = RegExp.leftContext;
    trailing = ary[1];

    // We special-case links that end with (something), often found on wikis
    // if "trailing" starts with ) and there's an unclosed ( in the
    // "linkText"; then we put the final ) back in
    if (trailing.startsWith(")") && linkText.match(/\([^\)]*$/)) {
      linkText += ")";
      trailing = trailing.slice(1);
    }
  } else {
    linkText = matchText;
  }

  var ary = linkText.match(/^(\w[\w-]+):/);
  if (ary) {
    if (!client.checkURLScheme(ary[1])) {
      mungerEntry.enabled = false;
      client.munger.munge(matchText, containerTag, data);
      mungerEntry.enabled = true;
      return;
    }

    href = linkText;
  } else {
    href = "http://" + linkText;
  }

  /* This gives callers to the munger control over URLs being logged; the
   * channel topic munger uses this, as well as the "is important" checker.
   * If either of |dontLogURLs| or |noStateChange| is present and true, we
   * don't log.
   */
  if (
    (!("dontLogURLs" in data) || !data.dontLogURLs) &&
    (!("noStateChange" in data) || !data.noStateChange) &&
    client.urlLogger
  ) {
    client.urlLogger.append(href);
  }

  var anchor = document.createElementNS(XHTML_NS, "html:a");
  var mircRE = /\x1f|\x02|\x0f|\x16|\x03([0-9]{1,2}(,[0-9]{1,2})?)?/g;
  anchor.setAttribute("href", href.replace(mircRE, ""));

  // Carry over formatting.
  var otherFormatting = calcClass(data);
  if (otherFormatting) {
    anchor.setAttribute("class", "chatzilla-link " + otherFormatting);
  } else {
    anchor.setAttribute("class", "chatzilla-link");
  }

  anchor.setAttribute("target", "_content");
  mungerEntry.enabled = false;
  data.inLink = true;
  client.munger.munge(linkText, anchor, data);
  mungerEntry.enabled = true;
  delete data.inLink;
  containerTag.appendChild(anchor);
  if (trailing) {
    insertText(trailing, containerTag, data);
  }
}

function insertMailToLink(matchText, containerTag, eventData, mungerEntry) {
  if ("inLink" in eventData && eventData.inLink) {
    mungerEntry.enabled = false;
    client.munger.munge(matchText, containerTag, eventData);
    mungerEntry.enabled = true;
    return;
  }

  var href;

  if (!matchText.toLowerCase().startsWith("mailto:")) {
    href = "mailto:" + matchText;
  } else {
    href = matchText;
  }

  var anchor = document.createElementNS(XHTML_NS, "html:a");
  var mircRE = /\x1f|\x02|\x0f|\x16|\x03([0-9]{1,2}(,[0-9]{1,2})?)?/g;
  anchor.setAttribute("href", href.replace(mircRE, ""));

  // Carry over formatting.
  var otherFormatting = calcClass(eventData);
  if (otherFormatting) {
    anchor.setAttribute("class", "chatzilla-link " + otherFormatting);
  } else {
    anchor.setAttribute("class", "chatzilla-link");
  }

  //anchor.setAttribute ("target", "_content");
  mungerEntry.enabled = false;
  eventData.inLink = true;
  client.munger.munge(matchText, anchor, eventData);
  mungerEntry.enabled = true;
  delete eventData.inLink;
  containerTag.appendChild(anchor);
}

function insertChannelLink(matchText, containerTag, eventData, mungerEntry) {
  if ("inLink" in eventData && eventData.inLink) {
    mungerEntry.enabled = false;
    client.munger.munge(matchText, containerTag, eventData);
    mungerEntry.enabled = true;
    return;
  }

  var bogusChannels = /^#(include|error|define|if|ifdef|else|elsif|endif)$/i;

  if (
    !("network" in eventData) ||
    !eventData.network ||
    matchText.search(bogusChannels) != -1
  ) {
    containerTag.appendChild(document.createTextNode(matchText));
    return;
  }

  var linkText = removeColorCodes(matchText);
  var encodedLinkText = fromUnicode(linkText, eventData.sourceObject);
  var anchor = document.createElementNS(XHTML_NS, "html:a");
  anchor.setAttribute("href", eventData.network.getURL(encodedLinkText));

  // Carry over formatting.
  var otherFormatting = calcClass(eventData);
  if (otherFormatting) {
    anchor.setAttribute("class", "chatzilla-link " + otherFormatting);
  } else {
    anchor.setAttribute("class", "chatzilla-link");
  }

  mungerEntry.enabled = false;
  eventData.inLink = true;
  client.munger.munge(matchText, anchor, eventData);
  mungerEntry.enabled = true;
  delete eventData.inLink;
  containerTag.appendChild(anchor);
}

function insertTalkbackLink(matchText, containerTag, eventData, mungerEntry) {
  if ("inLink" in eventData && eventData.inLink) {
    mungerEntry.enabled = false;
    client.munger.munge(matchText, containerTag, eventData);
    mungerEntry.enabled = true;
    return;
  }

  var anchor = document.createElementNS(XHTML_NS, "html:a");

  anchor.setAttribute(
    "href",
    "http://talkback-public.mozilla.org/" +
      "search/start.jsp?search=2&type=iid&id=" +
      matchText
  );

  // Carry over formatting.
  var otherFormatting = calcClass(eventData);
  if (otherFormatting) {
    anchor.setAttribute("class", "chatzilla-link " + otherFormatting);
  } else {
    anchor.setAttribute("class", "chatzilla-link");
  }

  mungerEntry.enabled = false;
  client.munger.munge(matchText, anchor, eventData);
  mungerEntry.enabled = true;
  containerTag.appendChild(anchor);
}

function insertBugzillaLink(matchText, containerTag, eventData, mungerEntry) {
  if ("inLink" in eventData && eventData.inLink) {
    mungerEntry.enabled = false;
    client.munger.munge(matchText, containerTag, eventData);
    mungerEntry.enabled = true;
    return;
  }

  var prefs = client.prefs;
  if (eventData.channel) {
    prefs = eventData.channel.prefs;
  } else if (eventData.network) {
    prefs = eventData.network.prefs;
  }

  var bugURL = prefs.bugURL;
  var bugURLcomment = prefs["bugURL.comment"];

  if (bugURL.length > 0) {
    var idOrAlias = matchText.match(
      new RegExp(
        "(?:" + client.prefs.bugKeyword + ")\\s+#?(\\d+|[^\\s,]{1,20})",
        "i"
      )
    )[1];
    bugURL = bugURL.replace("%s", idOrAlias);

    var commentNum = matchText.match(/comment\s+#?(\d+)/i);
    if (commentNum) {
      /* If the comment is a complete URL, use only that, replacing %1$s
       * and %2$s with the bug number and comment number, respectively.
       * Otherwise, append the comment preference to the main one,
       * replacing just %s in each.
       */
      if (bugURLcomment.match(/^\w+:/)) {
        bugURL = bugURLcomment;
        bugURL = bugURL.replace("%1$s", idOrAlias);
        bugURL = bugURL.replace("%2$s", commentNum[1]);
      } else {
        bugURL += bugURLcomment.replace("%s", commentNum[1]);
      }
    }

    var anchor = document.createElementNS(XHTML_NS, "html:a");
    anchor.setAttribute("href", bugURL);
    // Carry over formatting.
    var otherFormatting = calcClass(eventData);
    if (otherFormatting) {
      anchor.setAttribute("class", "chatzilla-link " + otherFormatting);
    } else {
      anchor.setAttribute("class", "chatzilla-link");
    }

    anchor.setAttribute("target", "_content");
    mungerEntry.enabled = false;
    eventData.inLink = true;
    client.munger.munge(matchText, anchor, eventData);
    mungerEntry.enabled = true;
    delete eventData.inLink;
    containerTag.appendChild(anchor);
  } else {
    mungerEntry.enabled = false;
    client.munger.munge(matchText, containerTag, eventData);
    mungerEntry.enabled = true;
  }
}

function insertRheet(matchText, containerTag, eventData, mungerEntry) {
  if ("inLink" in eventData && eventData.inLink) {
    mungerEntry.enabled = false;
    client.munger.munge(matchText, containerTag, eventData);
    mungerEntry.enabled = true;
    return;
  }

  var anchor = document.createElementNS(XHTML_NS, "html:a");
  anchor.setAttribute(
    "href",
    "http://ftp.mozilla.org/pub/mozilla.org/mozilla/libraries/bonus-tracks/rheet.wav"
  );
  anchor.setAttribute("class", "chatzilla-rheet chatzilla-link");
  //anchor.setAttribute ("target", "_content");
  insertText(matchText, anchor, eventData);
  containerTag.appendChild(anchor);
}

function insertQuote(matchText, containerTag) {
  if (matchText == "``") {
    containerTag.appendChild(document.createTextNode("\u201c"));
  } else {
    containerTag.appendChild(document.createTextNode("\u201d"));
  }
  containerTag.appendChild(document.createElementNS(XHTML_NS, "html:wbr"));
}

function insertSmiley(emoticon, containerTag, eventData, mungerEntry) {
  let smilies = {
    "face-alien": "\uD83D\uDC7D",
    "face-lol": "\uD83D\uDE02",
    "face-laugh": "\uD83D\uDE04",
    "face-sweat_smile": "\uD83D\uDE05",
    "face-innocent": "\uD83D\uDE07",
    "face-evil": "\uD83D\uDE08",
    "face-wink": "\uD83D\uDE09",
    "face-smile": "\uD83D\uDE0A",
    "face-cool": "\uD83D\uDE0E",
    "face-neutral": "\uD83D\uDE10",
    "face-thinking": "\uD83D\uDE14",
    "face-confused": "\uD83D\uDE15",
    "face-kissing": "\uD83D\uDE17",
    "face-tongue": "\uD83D\uDE1B",
    "face-worried": "\uD83D\uDE1F",
    "face-angry": "\uD83D\uDE20",
    "face-cry": "\uD83D\uDE22",
    "face-surprised": "\uD83D\uDE2D",
    "face-eek": "\uD83D\uDE31",
    "face-red": "\uD83D\uDE33",
    "face-dizzy": "\uD83D\uDE35",
    "face-sad": "\uD83D\uDE41",
    "face-rolleyes": "\uD83D\uDE44",
    "face-zipped": "\uD83E\uDD10",
    "face-rofl": "\uD83E\uDD23",
    "face-woozy": "\uD83E\uDD74",
  };

  let type;

  if (emoticon.search(/\>[-^v]?\)/) != -1) {
    type = "face-alien";
  } else if (emoticon.search(/\>[=:;][-^v]?[(|]|[Xx][-^v]?[(\[]/) != -1) {
    type = "face-angry";
  } else if (emoticon.search(/[=:;][-^v]?[Ss]/) != -1) {
    type = "face-confused";
  } else if (emoticon.search(/[B8][-^v]?[)\]]/) != -1) {
    type = "face-cool";
  } else if (emoticon.search(/[=:;][~'][-^v]?\(/) != -1) {
    type = "face-cry";
  } else if (emoticon.search(/o[._]O|O[._]o/) != -1) {
    type = "face-dizzy";
  } else if (emoticon.search(/o[._]o|O[._]O/) != -1) {
    type = "face-eek";
  } else if (emoticon.search(/\>[=:;][-^v]?D/) != -1) {
    type = "face-evil";
  } else if (emoticon.search(/O[=:][-^v]?[)]/) != -1) {
    type = "face-innocent";
  } else if (emoticon.search(/[=:;][-^v]?[*]/) != -1) {
    type = "face-kissing";
  } else if (emoticon.search(/[=:;][-^v]?DD/) != -1) {
    type = "face-lol";
  } else if (emoticon.search(/[=:;][-^v]?D/) != -1) {
    type = "face-laugh";
  } else if (emoticon.search(/\([-^v]?D|[xX][-^v]?D/) != -1) {
    type = "face-rofl";
  } else if (emoticon.search(/[=:;][-^v]?\|/) != -1) {
    type = "face-neutral";
  } else if (emoticon.search(/[=:;][-^v]?\?/) != -1) {
    type = "face-thinking";
  } else if (emoticon.search(/[=:;]"[)\]]/) != -1) {
    type = "face-red";
  } else if (emoticon.search(/9[._]9/) != -1) {
    type = "face-rolleyes";
  } else if (emoticon.search(/[=:;][-^v]?[(\[]/) != -1) {
    type = "face-sad";
  } else if (emoticon.search(/[=:][-^v]?[)]/) != -1) {
    type = "face-smile";
  } else if (emoticon.search(/[=:;][-^v]?[0oO]/) != -1) {
    type = "face-surprised";
  } else if (emoticon.search(/[=:][-^v]?[\]]/) != -1) {
    type = "face-sweat_smile";
  } else if (emoticon.search(/[=:;][-^v]?[pP]/) != -1) {
    type = "face-tongue";
  } else if (emoticon.search(/;[-^v]?[)\]]/) != -1) {
    type = "face-wink";
  } else if (emoticon.search(/%[-^v][)\]]/) != -1) {
    type = "face-woozy";
  } else if (emoticon.search(/[=:;][-^v]?[\/\\]/) != -1) {
    type = "face-worried";
  } else if (emoticon.search(/[=:;][-^v]?[#]/) != -1) {
    type = "face-zipped";
  }

  let glyph = smilies[type];
  if (!glyph) {
    // We didn't actually match anything, so it'll be a too-generic match
    // from the munger RegExp.
    mungerEntry.enabled = false;
    client.munger.munge(emoticon, containerTag, eventData);
    mungerEntry.enabled = true;
    return;
  }

  // Add spaces to beginning / end where appropriate.
  if (emoticon.search(/^\s/) != -1) {
    glyph = " " + glyph;
  }
  if (emoticon.search(/\s$/) != -1) {
    glyph = glyph + " ";
  }

  // Create a span to hold the emoticon.
  let span = document.createElementNS(XHTML_NS, "html:span");
  span.appendChild(document.createTextNode(glyph));
  span.setAttribute("class", "chatzilla-emote-txt");
  // Add the title attribute (to show the original text in a tooltip) in case
  // the replacement was done incorrectly.
  span.setAttribute("title", emoticon);
  span.setAttribute("type", type);
  containerTag.appendChild(span);
}

function mircChangeColor(colorInfo, containerTag, data) {
  /* If colors are disabled, the caller doesn't want colors specifically, or
   * the caller doesn't want any state-changing effects, we drop out.
   */
  if (
    !client.enableColors ||
    ("noMircColors" in data && data.noMircColors) ||
    ("noStateChange" in data && data.noStateChange)
  ) {
    return;
  }

  // Entry 0 will contain all colors specified,
  // entry 1 will have any specified foreground color or be undefined,
  // entry 2 will have any specified background color or be undefined.
  // Valid color codes are 0-99 with 99 having special meaning.
  let ary = colorInfo.match(/^\x03(?:(\d\d?)(?:,(\d\d?))?)?/);

  // If no foreground color specified or somehow the array does not have 3
  // entries then it has invalid syntax.
  if (ary.length != 3 || !ary[1]) {
    delete data.currFgColor;
    delete data.currBgColor;
    return;
  }

  let fgColor = Number(ary[1]);

  if (fgColor != 99) {
    data.currFgColor = (fgColor % 16).toString().padStart(2, "0");
  } else {
    delete data.currFgColor;
  }

  // If no background color then default to 99.
  let bgColor = Number(ary[2] || "99");

  if (bgColor != 99) {
    data.currBgColor = (bgColor % 16).toString().padStart(2, "0");
  } else {
    delete data.currBgColor;
  }

  // Only set hasColorInfo if we have something set.
  if (fgColor != 99 || bgColor != 99) {
    data.hasColorInfo = true;
  }
}

function mircToggleBold(colorInfo, containerTag, data) {
  if (
    !client.enableColors ||
    ("noMircColors" in data && data.noMircColors) ||
    ("noStateChange" in data && data.noStateChange)
  ) {
    return;
  }

  if ("isBold" in data) {
    delete data.isBold;
  } else {
    data.isBold = true;
  }
  data.hasColorInfo = true;
}

function mircToggleUnder(colorInfo, containerTag, data) {
  if (
    !client.enableColors ||
    ("noMircColors" in data && data.noMircColors) ||
    ("noStateChange" in data && data.noStateChange)
  ) {
    return;
  }

  if ("isUnderline" in data) {
    delete data.isUnderline;
  } else {
    data.isUnderline = true;
  }
  data.hasColorInfo = true;
}

function mircResetColor(text, containerTag, data) {
  if (
    !client.enableColors ||
    ("noMircColors" in data && data.noMircColors) ||
    ("noStateChange" in data && data.noStateChange) ||
    !("hasColorInfo" in data)
  ) {
    return;
  }

  removeColorInfo(data);
}

function mircReverseColor(text, containerTag, data) {
  if (
    !client.enableColors ||
    ("noMircColors" in data && data.noMircColors) ||
    ("noStateChange" in data && data.noStateChange)
  ) {
    return;
  }

  var tempColor = "currFgColor" in data ? data.currFgColor : "";

  if ("currBgColor" in data) {
    data.currFgColor = data.currBgColor;
  } else {
    delete data.currFgColor;
  }
  if (tempColor) {
    data.currBgColor = tempColor;
  } else {
    delete data.currBgColor;
  }
  data.hasColorInfo = true;
}

function ansiEscapeSGR(text, containerTag, data) {
  if (
    !client.enableColors ||
    ("noANSIColors" in data && data.noANSIColors) ||
    ("noStateChange" in data && data.noStateChange)
  ) {
    return;
  }

  /* ANSI SGR (Select Graphic Rendition) escape support. Matched text may
   * have any number of effects, each a number separated by a semicolon. If
   * there are no effects listed, it is treated as effect "0" (reset/normal).
   */

  text = text.slice(2, text.length - 3) || "0";

  const ansiToMircColor = [
    "01",
    "05",
    "03",
    "07",
    "02",
    "06",
    "10",
    "15",
    "14",
    "04",
    "09",
    "08",
    "12",
    "13",
    "11",
    "00",
  ];

  var effects = text.split(";");
  for (var i = 0; i < effects.length; i++) {
    data.hasColorInfo = true;

    switch (Number(effects[i])) {
      case 0: // Reset/normal.
        removeColorInfo(data);
        break;

      case 1: // Intensity: bold.
        data.isBold = true;
        break;

      case 3: // Italic: on.
        data.isItalic = true;
        break;

      case 4: // Underline: single.
        data.isUnderline = true;
        break;

      case 9: // Strikethrough: on.
        data.isStrikethrough = true;
        break;

      case 22: // Intensity: normal.
        delete data.isBold;
        break;

      case 23: // Italic: off.
        delete data.isItalic;
        break;

      case 24: // Underline: off.
        delete data.isUnderline;
        break;

      case 29: // Strikethrough: off.
        delete data.isStrikethrough;
        break;

      case 53: // Overline: on.
        data.isOverline = true;
        break;

      case 55: // Overline: off.
        delete data.isOverline;
        break;

      case 30: // FG: Black.
      case 31: // FG: Red.
      case 32: // FG: Green.
      case 33: // FG: Yellow.
      case 34: // FG: Blue.
      case 35: // FG: Magenta.
      case 36: // FG: Cyan.
      case 37: // FG: While (light grey).
        data.currFgColor = ansiToMircColor[effects[i] - 30];
        break;

      case 39: // FG: default.
        delete data.currFgColor;
        break;

      case 40: // BG: Black.
      case 41: // BG: Red.
      case 42: // BG: Green.
      case 43: // BG: Yellow.
      case 44: // BG: Blue.
      case 45: // BG: Magenta.
      case 46: // BG: Cyan.
      case 47: // BG: While (light grey).
        data.currBgColor = ansiToMircColor[effects[i] - 40];
        break;

      case 49: // BG: default.
        delete data.currBgColor;
        break;

      case 90: // FG: Bright Black (dark grey).
      case 91: // FG: Bright Red.
      case 92: // FG: Bright Green.
      case 93: // FG: Bright Yellow.
      case 94: // FG: Bright Blue.
      case 95: // FG: Bright Magenta.
      case 96: // FG: Bright Cyan.
      case 97: // FG: Bright While.
        data.currFgColor = ansiToMircColor[effects[i] - 90 + 8];
        break;

      case 100: // BG: Bright Black (dark grey).
      case 101: // BG: Bright Red.
      case 102: // BG: Bright Green.
      case 103: // BG: Bright Yellow.
      case 104: // BG: Bright Blue.
      case 105: // BG: Bright Magenta.
      case 106: // BG: Bright Cyan.
      case 107: // BG: Bright While.
        data.currBgColor = ansiToMircColor[effects[i] - 100 + 8];
        break;
    }
  }
}

function removeColorInfo(data) {
  delete data.currFgColor;
  delete data.currBgColor;
  delete data.isBold;
  delete data.isItalic;
  delete data.isOverline;
  delete data.isStrikethrough;
  delete data.isUnderline;
  delete data.hasColorInfo;
}

function showCtrlChar(c, containerTag) {
  var span = document.createElementNS(XHTML_NS, "html:span");
  span.setAttribute("class", "chatzilla-control-char");
  if (c == "\t") {
    containerTag.appendChild(document.createTextNode(c));
    return;
  }

  var ctrlStr = c.charCodeAt(0).toString(16);
  if (ctrlStr.length < 2) {
    ctrlStr = "0" + ctrlStr;
  }
  span.appendChild(document.createTextNode("0x" + ctrlStr));
  containerTag.appendChild(span);
  containerTag.appendChild(document.createElementNS(XHTML_NS, "html:wbr"));
}

function insertText(text, containerTag, data) {
  var newClass = "";
  if (data && "hasColorInfo" in data) {
    newClass = calcClass(data);
  }
  if (!newClass) {
    delete data.hasColorInfo;
  }

  if (newClass) {
    var spanTag = document.createElementNS(XHTML_NS, "html:span");
    spanTag.setAttribute("class", newClass);
    containerTag.appendChild(spanTag);
    containerTag = spanTag;
  }

  var arg;
  while ((arg = text.match(client.whitespaceRE))) {
    // Find the start of the match so we can insert the preceding text.
    var start = text.indexOf(arg[0]);
    if (start > 0) {
      containerTag.appendChild(document.createTextNode(text.slice(0, start)));
    }

    // Process the long word itself.
    insertHyphenatedWord(arg[1], containerTag, { dontStyleText: true });

    // Continue with the rest of the text.
    text = text.slice(start + arg[0].length);
  }

  // Insert any left-over text on the end.
  if (text) {
    containerTag.appendChild(document.createTextNode(text));
  }
}

function insertHyphenatedWord(longWord, containerTag, data) {
  /*
   * If there are any wordbreaking characters in |str| within -/+5 characters
   * of a |pos| then the word is broken up there. Individual chunks of the
   * word are returned as elements of an array.
   */
  function splitLongWord(str, pos) {
    if (str.length <= pos) {
      return [str];
    }

    let ary = [];
    let right = str;

    while (right.length > pos) {
      /* search for a nice place to break the word, fuzzfactor of +/-5,
       * centered around |pos| */
      let splitPos = right.substring(pos - 5, pos + 5).search(/[^A-Za-z0-9]/);

      splitPos = splitPos != -1 ? pos - 4 + splitPos : pos;
      ary.push(right.slice(0, splitPos));
      right = right.slice(splitPos);
    }

    ary.push(right);
    return ary;
  }

  var wordParts = splitLongWord(longWord, client.MAX_WORD_DISPLAY);

  if (!data || !("dontStyleText" in data)) {
    var newClass = "";
    if (data && "hasColorInfo" in data) {
      newClass = calcClass(data);
    }
    if (!newClass) {
      delete data.hasColorInfo;
    }

    if (newClass) {
      var spanTag = document.createElementNS(XHTML_NS, "html:span");
      spanTag.setAttribute("class", newClass);
      containerTag.appendChild(spanTag);
      containerTag = spanTag;
    }
  }

  var wbr = document.createElementNS(XHTML_NS, "html:wbr");
  for (var i = 0; i < wordParts.length; ++i) {
    containerTag.appendChild(document.createTextNode(wordParts[i]));
    containerTag.appendChild(wbr.cloneNode(true));
  }
}

function insertInlineButton(text, containerTag, data) {
  var ary = text.match(/\[\[([^\]]+)\]\[([^\]]+)\]\[([^\]]+)\]\]/);

  if (!ary) {
    containerTag.appendChild(document.createTextNode(text));
    return;
  }

  var label = ary[1];
  var title = ary[2];
  var command = ary[3];

  var link = document.createElementNS(XHTML_NS, "html:a");
  link.setAttribute("href", "x-cz-command:" + encodeURI(command));
  link.setAttribute("title", title);
  link.setAttribute("class", "chatzilla-link");
  link.appendChild(document.createTextNode(label));

  containerTag.appendChild(document.createTextNode("["));
  containerTag.appendChild(link);
  containerTag.appendChild(document.createTextNode("]"));
}

function calcClass(data) {
  var className = "";
  if ("hasColorInfo" in data) {
    if ("currFgColor" in data) {
      className += " chatzilla-fg" + data.currFgColor;
    }
    if ("currBgColor" in data) {
      className += " chatzilla-bg" + data.currBgColor;
    }
    if ("isBold" in data) {
      className += " chatzilla-bold";
    }
    if ("isItalic" in data) {
      className += " chatzilla-italic";
    }
    if ("isOverline" in data) {
      className += " chatzilla-overline";
    }
    if ("isStrikethrough" in data) {
      className += " chatzilla-strikethrough";
    }
    if ("isUnderline" in data) {
      className += " chatzilla-underline";
    }
  }
  return className;
}
