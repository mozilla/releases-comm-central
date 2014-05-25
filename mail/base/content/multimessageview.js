/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/DownloadUtils.jsm");
Components.utils.import("resource://gre/modules/PluralForm.jsm");
Components.utils.import("resource:///modules/gloda/gloda.js");
Components.utils.import("resource:///modules/gloda/connotent.js");
Components.utils.import("resource:///modules/gloda/mimemsg.js");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource:///modules/templateUtils.js");

// This is executed in the context of the message summary page, not main chrome,
// but we need to access a few things from the main window.
var global = window.top;

let gSelectionSummaryStrings = {
  NConversations: "NConversations",
  numMsgs: "numMsgs",
  countUnread: "countUnread",
  ignoredCount: "ignoredCount",
  messagesSize: "messagesSize",
  noticeText: "noticeText",
  noSubject: "noSubject",
};
let gSelectionSummaryStringsInitialized = false;

/**
 * loadSelectionSummaryStrings does the routine localization of non-pluralized
 * strings, populating the gSelectionSummaryStrings array based on the current
 * locale.
 */
function loadSelectionSummaryStrings() {
  if (gSelectionSummaryStringsInitialized)
    return;

  gSelectionSummaryStringsInitialized = true;

  // convert strings to those in the string bundle
  let getStr = function(string) {
    return window.top.document.getElementById("bundle_multimessages")
                 .getString(string);
  };
  for (let [name, value] in Iterator(gSelectionSummaryStrings))
    gSelectionSummaryStrings[name] = typeof value == "string" ?
      getStr(value) : value.map(gSelectionSummaryStrings);
}

/**
 * Adjust the position of the top of the main content so that it fits below the
 * heading.
 */
function adjustHeadingSize() {
  let content = document.getElementById("content");
  let heading = document.getElementById("heading");
  let buttonbox = document.getElementById("header-view-toolbox");

  content.style.top = Math.max(
    buttonbox.getBoundingClientRect().height,
    heading.getBoundingClientRect().height
  ) + "px";
}

// We also need to hook into the resize event on the header to make the
// #content node shift down as it reflows.
window.addEventListener("resize", adjustHeadingSize);

/**
 * Format the display name for the multi-message/thread summaries. First, try
 * using FormatDisplayName, then fall back to the header's display name or the
 * address.
 *
 * @param aHeaderParser An instance of |nsIMsgHeaderParser|.
 * @param aHeaderValue  The raw header value.
 * @param aContext      The context of the header field (e.g. "to", "from").
 * @return The formatted display name.
 */
function _mm_FormatDisplayName(aHeaderParser, aHeaderValue, aContext) {
  let addresses = {};
  let fullNames = {};
  let names = {};
  let numAddresses = aHeaderParser.parseHeadersWithArray(aHeaderValue,
    addresses, names, fullNames);

  if (numAddresses > 0) {
    return global.FormatDisplayName(
      addresses.value[0], names.value[0], aContext
    ) || names.value[0] || addresses.value[0];
  }
  else {
    // Something strange happened, just return the raw header value.
    return aHeaderValue;
  }
}

/**
 * The MultiMessageSummary class is responsible for populating the message pane
 * with a reasonable summary of a set of messages that span more than one
 * thread.
 *
 * It uses the same multimessage iframe as ThreadSummary, so both it and
 * ThreadSummary should be careful to clean up the other's work before
 * inserting their DOM nodes into the frame.
 *
 * There's a two phase process: build the framework based on what's available
 * from the msgHdr itself, and then spawn an aysnc Gloda query which will
 * fetch the snippets, tags, etc.
 *
 * @param aMessages   Array of message headers.
 * @param [aListener] An optional listener that implements onLoadStarted and
 *                    onLoadCompleted.
 */
function MultiMessageSummary(aMessages, aListener) {
  this._msgHdrs = aMessages;
  this._listener = aListener;
  this._glodaQueries = [];
  this._msgNodes = {};

  // Ensure the summary selection strings are loaded.
  loadSelectionSummaryStrings();
}

MultiMessageSummary.prototype = {
  /**
   * The maximum number of messages to summarize.
   */
  kMaxMessages: 100,

  /**
   * The length of message snippets to fetch from Gloda.
   */
  kSnippetLength: 300,

  /**
   * Given a msgHdr, return a list of tag objects. This function just does the
   * messy work of understanding how tags are stored in nsIMsgDBHdrs.  It would
   * be a good candidate for a utility library.
   *
   * @param aMsgHdr The msgHdr whose tags we want.
   * @return An array of nsIMsgTag objects.
   */
  getTagsForMsg: function(aMsgHdr) {
    let keywords = new Set(aMsgHdr.getStringProperty("keywords").split(" "));
    let allTags = MailServices.tags.getAllTags({});

    return allTags.filter(function(tag) {
      return keywords.has(tag.key);
    });
  },

  /**
   * Fill in the summary pane describing the selected messages
   */
  summarize: function() {
    if (this._listener)
      this._listener.onLoadStarted();

    // Clear the messages list.
    let messagesElt = document.getElementById("messagelist");
    while (messagesElt.hasChildNodes())
      messagesElt.lastChild.remove();

    // Enable/disable the archive button as appropriate.
    let archiveBtn = document.getElementById("hdrArchiveButton");
    archiveBtn.collapsed = !global.gFolderDisplay.canArchiveSelectedMessages;

    // First, we group the messages in threads and count the threads. We want
    // the view's version of threading, not the database's version, in order to
    // thread together cross-folder messages. XXX: This falls apart for group
    // by sort; what we really want is a way to specify only the cross-folder
    // view.
    let threads = {};
    let numThreads = 0;
    for (let [,msgHdr] in Iterator(this._msgHdrs)) {
      let viewThreadId = global.gFolderDisplay.view.dbView
                               .getThreadContainingMsgHdr(msgHdr)
                               .threadKey;
      if (!(viewThreadId in threads)) {
        threads[viewThreadId] = [msgHdr];
        numThreads++;
      } else {
        threads[viewThreadId].push(msgHdr);
      }
    }

    // Set the heading based on the number of messages & threads.
    let heading = document.getElementById("heading");
    heading.classList.add("heading", "info");

    let messagesTitle = PluralForm.get(
      numThreads, gSelectionSummaryStrings["NConversations"]
    ).replace("#1", numThreads);

    heading.textContent = messagesTitle;

    let count = 0;
    let maxCountExceeded = false;

    for (let [thread, msgs] in Iterator(threads)) {
      count += msgs.length;
      if (count > this.kMaxMessages) {
        maxCountExceeded = true;
        break;
      }

      let msgNode = this._makeSummaryItem(msgs, { showSubject: true });
      messagesElt.appendChild(msgNode);

      for (let msgHdr of msgs) {
        let key = msgHdr.messageKey + msgHdr.folder.URI;
        this._msgNodes[key] = msgNode;
      }
    }

    // Stash somewhere so it doesn't get GC'ed.
    this._glodaQueries.push(Gloda.getMessageCollectionForHeaders(
      this._msgHdrs, this
    ));
    this.notifyMaxCountExceeded(this._msgHdrs.length, this.kMaxMessages);

    this.computeSize();
    adjustHeadingSize();
  },

  /**
   * Create a summary item for a message or thread.
   *
   * @param aMessageOrThread An nsIMsgDBHdr or an array thereof
   * @param [aOptions]       An optional object to customize the output:
   *                         currently accepts |showSubject| to show the subject
   *                         of the message.
   * @return A DOM node for the summary item.
   */
  _makeSummaryItem: function(aMessageOrThread, aOptions) {
    let message, thread, numUnread, isStarred, tags;
    if (aMessageOrThread instanceof Components.interfaces.nsIMsgDBHdr) {
      thread = null;
      message = aMessageOrThread;

      numUnread = message.isRead ? 0 : 1;
      isStarred = message.isFlagged;

      tags = this.getTagsForMsg(message);
    }
    else {
      thread = aMessageOrThread;
      message = thread[0];

      numUnread = thread.reduce(function(x, hdr) {
        return x + (hdr.isRead ? 0 : 1);
      }, 0);
      isStarred = thread.some(function(hdr) { return hdr.isFlagged; });

      tags = new Set();
      for (let message of thread) {
        for (let tag of this.getTagsForMsg(message))
          tags.add(tag);
      }
    }

    let row = document.createElement("li");
    row.classList.toggle("thread", thread && thread.length > 1);
    row.classList.toggle("unread", numUnread > 0);
    row.classList.toggle("starred", isStarred);
    row.innerHTML = '<div class="star"/>' +
                    '<div class="item_summary">' +
                      '<div class="item_header"/>' +
                      '<div class="snippet"/>' +
                    '</div>';

    let itemHeaderNode = row.querySelector(".item_header");

    let authorNode = document.createElement("span");
    authorNode.classList.add("author");
    authorNode.textContent = _mm_FormatDisplayName(
      MailServices.headerParser, message.mime2DecodedAuthor, "from"
    );

    if (aOptions && aOptions.showSubject) {
      authorNode.classList.add("right");
      itemHeaderNode.appendChild(authorNode);

      let subjectNode = document.createElement("span");
      subjectNode.classList.add("subject", "primary_header", "link");
      subjectNode.textContent = message.mime2DecodedSubject ||
                                gSelectionSummaryStrings["noSubject"];
      subjectNode.addEventListener("click", function() {
        global.gFolderDisplay.selectMessages(thread);
      }, false);
      itemHeaderNode.appendChild(subjectNode);

      if (thread && thread.length > 1) {
        let numUnreadStr = "";
        if (numUnread) {
          numUnreadStr = PluralForm.get(
            numUnread, gSelectionSummaryStrings["countUnread"]
          ).replace("#1", numUnread);
        }
        let countStr = "(" + PluralForm.get(
          thread.length, gSelectionSummaryStrings["numMsgs"]
        ).replace("#1", thread.length) + numUnreadStr + ")";

        let countNode = document.createElement("span");
        countNode.classList.add("count");
        countNode.textContent = countStr;
        itemHeaderNode.appendChild(countNode);
      }
    }
    else {
      let dateNode = document.createElement("span");
      dateNode.classList.add("date", "right");
      dateNode.textContent = makeFriendlyDateAgo(new Date(message.date / 1000));
      itemHeaderNode.appendChild(dateNode);

      authorNode.classList.add("primary_header", "link");
      authorNode.addEventListener("click", function() {
        global.gFolderDisplay.selectMessage(message);
        global.document.getElementById("messagepane").focus();
      }, false);
      itemHeaderNode.appendChild(authorNode);
    }

    let tagNode = document.createElement("span");
    tagNode.classList.add("tags");
    this._addTagNodes(tags, tagNode);
    itemHeaderNode.appendChild(tagNode);

    let snippetNode = row.querySelector(".snippet");
    try {
      const kSnippetLength = this.kSnippetLength;
      MsgHdrToMimeMessage(message, null, function(aMsgHdr, aMimeMsg) {
        if (aMimeMsg == null) /* shouldn't happen, but sometimes does? */ {
          return;
        }
        let [text, meta] = mimeMsgToContentSnippetAndMeta(
          aMimeMsg, aMsgHdr.folder, kSnippetLength
        );
        snippetNode.textContent = text;
        if (meta.author)
          authorNode.textContent = meta.author;
      }, false, {saneBodySize: true});
    } catch (e if e.result == Components.results.NS_ERROR_FAILURE) {
      // Offline messages generate exceptions, which is unfortunate.  When
      // that's fixed, this code should adapt. XXX
      snippetNode.textContent = "...";
    }

    return row;
  },

  /**
   * Add a list of tags to a DOM node.
   *
   * @param aTags An array (or any iterable) of nsIMsgTag objects.
   * @param aTagsNode The DOM node to contain the list of tags.
   */
  _addTagNodes: function(aTags, aTagsNode) {
    // Make sure the tags are sorted in their natural order.
    let sortedTags = [...aTags];
    sortedTags.sort(function(a, b) {
      return a.key.localeCompare(b.key) ||
             a.ordinal.localeCompare(b.ordinal);
    });

    for (let tag of sortedTags) {
      let tagNode = document.createElement("span");
      // See tagColors.css.
      let color = MailServices.tags.getColorForKey(tag.key);
      let colorClass = "blc-" + color.substr(1);

      tagNode.classList.add("tag", colorClass);
      tagNode.dataset.tag = tag.tag;
      tagNode.textContent = tag.tag;
      aTagsNode.appendChild(tagNode);
    }
  },

  /**
   * Compute the size of the messages in the selection and display it in the
   * element of id "size".
   */
  computeSize: function() {
    let numThreads = 0;
    let numBytes = 0;

    for (let [,msgHdr] in Iterator(this._msgHdrs))
      numBytes += msgHdr.messageSize; // XXX do something about news?
    let [size, unit] = DownloadUtils.convertByteUnits(numBytes);
    let sizeText = replaceInsert(
      gSelectionSummaryStrings.messagesSize, 1, size
    );
    sizeText = replaceInsert(sizeText, 2, unit);
    document.getElementById("size").textContent = sizeText;
  },

  /**
   * Indicate if we're not summarizing _all_ of the specified messages because
   * that'd just be too much.
   */
  notifyMaxCountExceeded: function(aNumMessages, aMaxCount) {
    let notice = document.getElementById("notice");
    if (aNumMessages > aMaxCount) {
      let noticeText = gSelectionSummaryStrings.noticeText;
      noticeText = replaceInsert(noticeText, 1, aNumMessages);
      noticeText = replaceInsert(noticeText, 2, aMaxCount);
      notice.textContent = noticeText;
      notice.classList.remove("hidden");
    } else {
      notice.classList.add("hidden");
    }
  },

  // these are listeners for the gloda collections.
  onItemsAdded: function(aItems) {
  },
  onItemsModified: function(aItems) {
    this.processItems(aItems);
  },
  onItemsRemoved: function(aItems) {
  },

  /**
   * Given a set of items from a gloda collection, process them and update
   * the display accordingly.
   *
   * @param aItems Contents of a gloda collection.
   */
  processItems: function(aItems) {
    let knownMessageNodes = new Map();

    for (let [,glodaMsg] in Iterator(aItems)) {
      // Unread and starred will get set if any of the messages in a collapsed
      // thread qualify.  The trick here is that we may get multiple items
      // corresponding to the same thread (and hence DOM node), so we need to
      // detect when we get the first item for a particular DOM node, stash the
      // preexisting status of that DOM node, an only do transitions if the
      // items warrant it.
      let key = glodaMsg.messageKey + glodaMsg.folder.uri;
      let headerNode = this._msgNodes[key];
      if (!knownMessageNodes.has(headerNode)) {
        knownMessageNodes.set(headerNode, {
          read: true,
          starred: false,
          tags: new Set()
        });
      }

      let flags = knownMessageNodes.get(headerNode);

      // Count as read if *all* the messages are read.
      flags.read &= glodaMsg.read;
      // Count as starred if *any* of the messages are starred.
      flags.starred |= glodaMsg.starred;
      // Count as tagged with a tag if *any* of the messages have that tag.
      for (let tag of this.getTagsForMsg(glodaMsg.folderMessage))
        flags.tags.add(tag);
    }

    for (let [headerNode, flags] of knownMessageNodes) {
      headerNode.classList.toggle("unread", !flags.read);
      headerNode.classList.toggle("starred", flags.starred);

      // Clear out all the tags and start fresh, just to make sure we don't get
      // out of sync.
      let tagsNode = headerNode.querySelector(".tags");
      while (tagsNode.hasChildNodes())
        tagsNode.lastChild.remove();
      this._addTagNodes(flags.tags, tagsNode);
    }
  },

  onQueryCompleted: function(aCollection) {
    // If we need something that's just available from GlodaMessages, this is
    // where we'll get it initially.
    if (this._listener)
      this._listener.onLoadCompleted();
    return;
  }
};


/**
 * The ThreadSummary class is responsible for populating the message pane
 * with a reasonable summary of a set of messages that are are in a single
 * thread.
 *
 * It uses the same multimessage iframe as MultiMessageSummary, so both it
 * and MultiMessageSummary should be careful to clean up the other's work
 * before inserting their DOM nodes into the frame.
 *
 * There's a two phase process: build the framework based on what's available
 * from the msgHdr itself, and then spawn an aysnc Gloda query which will
 * fetch the snippets, tags, etc.
 *
 * @param aMessages   Array of message headers.
 * @param [aListener] An optional listener that implements onLoadStarted and
 *                    onLoadCompleted.
 */
function ThreadSummary(aMessages, aListener) {
  this._msgHdrs = aMessages;
  this._listener = aListener;
  this._glodaQueries = [];
  this._msgNodes = {};

  // Ensure the summary selection strings are loaded.
  loadSelectionSummaryStrings();
}

ThreadSummary.prototype = {
  __proto__: MultiMessageSummary.prototype,

  /**
   * Fill in the summary pane describing the selected messages
   */
  summarize: function() {
    if (this._listener)
      this._listener.onLoadStarted();

    // Clear the messages list.
    let messagesElt = document.getElementById("messagelist");
    while (messagesElt.hasChildNodes())
      messagesElt.lastChild.remove();

    // Enable/disable the archive button as appropriate.
    let archiveBtn = document.getElementById("hdrArchiveButton");
    archiveBtn.collapsed = !global.gFolderDisplay.canArchiveSelectedMessages;

    let firstMsgHdr = this._msgHdrs[0];
    let numMsgs = this._msgHdrs.length;

    let count = 0;
    let ignoredCount = 0;
    let maxCountExceeded = false;
    for (let i = 0; i < numMsgs; ++i) {
      let msgHdr = this._msgHdrs[i];

      if (msgHdr.isKilled) { // ignored subthread...
        ignoredCount++;
        continue;
      }

      count++;
      if (count > this.kMaxMessages) {
        maxCountExceeded = true;
        break;
      }

      let msgNode = this._makeSummaryItem(msgHdr);
      messagesElt.appendChild(msgNode);

      let key = msgHdr.messageKey + msgHdr.folder.URI;
      this._msgNodes[key] = msgNode;
    }

    let countInfo = PluralForm.get(
      numMsgs, gSelectionSummaryStrings["numMsgs"]
    ).replace("#1", numMsgs);
    if (ignoredCount != 0) {
      countInfo += " - " + PluralForm.get(
        ignoredCount, gSelectionSummaryStrings["ignoredCount"]
      ).replace("#1", ignoredCount);
    }

    let subject = (firstMsgHdr.mime2DecodedSubject ||
                   gSelectionSummaryStrings["noSubject"]) +
                  " (" + countInfo + ")";
    let heading = document.getElementById("heading");
    heading.setAttribute("class", "heading");
    heading.textContent = subject;

    // Stash somewhere so it doesn't get GC'ed.
    this._glodaQueries.push(Gloda.getMessageCollectionForHeaders(
      this._msgHdrs, this
    ));
    this.notifyMaxCountExceeded(numMsgs, this.kMaxMessages);

    this.computeSize();
    adjustHeadingSize();
  }
};

// We use a global to prevent GC of gloda collection (and we reuse it to prevent
// leaks).  Without a global, the GC is aggressive enough that the gloda query
// is gone before it returns.
var gSummary;

function summarizeThread(aSelectedMessages, aListener) {
  gSummary = new ThreadSummary(aSelectedMessages, aListener);
  gSummary.summarize();
}

function summarizeMultipleSelection(aSelectedMessages, aListener) {
  gSummary = new MultiMessageSummary(aSelectedMessages, aListener);
  gSummary.summarize();
}
