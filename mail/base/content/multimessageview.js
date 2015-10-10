/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource:///modules/gloda/gloda.js");
Components.utils.import("resource:///modules/gloda/connotent.js");
Components.utils.import("resource:///modules/gloda/mimemsg.js");
Components.utils.import("resource:///modules/displayNameUtils.js");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource:///modules/templateUtils.js");

var gMessenger = Components.classes["@mozilla.org/messenger;1"]
                           .createInstance(Components.interfaces.nsIMessenger);

// Set up our string formatter for localizing strings.
XPCOMUtils.defineLazyGetter(this, "formatString", function() {
  let formatter = new PluralStringFormatter(
    "chrome://messenger/locale/multimessageview.properties"
  );
  return function(...args) {
    return formatter.get(...args);
  };
});

/**
 * A LimitIterator is a utility class that allows limiting the maximum number
 * of items to iterate over.
 *
 * @param aArray     The array to iterate over (can be anything with a .length
 *                   property and a subscript operator.
 * @param aMaxLength The maximum number of items to iterate over.
 */
function LimitIterator(aArray, aMaxLength) {
  this._array = aArray;
  this._maxLength = aMaxLength;
}

LimitIterator.prototype = {
  /**
   * Returns true if the iterator won't actually iterate over everything in the
   * array.
   */
  get limited() {
    return this._array.length > this._maxLength;
  },

  /**
   * Returns the number of elements that will actually be iterated over.
   */
  get length() {
    return Math.min(this._array.length, this._maxLength);
  },

  /**
   * Returns the real number of elements in the array.
   */
  get trueLength() {
    return this._array.length;
  },
};

var JS_HAS_SYMBOLS = typeof Symbol === "function";
var ITERATOR_SYMBOL = JS_HAS_SYMBOLS ? Symbol.iterator : "@@iterator";

/**
 * Iterate over the array until we hit the end or the maximum length,
 * whichever comes first.
 */
LimitIterator.prototype[ITERATOR_SYMBOL] = function*() {
  let length = this.length;
  for (let i = 0; i < length; i++)
    yield this._array[i];
};

/**
 * The MultiMessageSummary class is responsible for populating the message pane
 * with a reasonable summary of a set of messages.
 */
function MultiMessageSummary() {
  this._summarizers = {};

  // Hook into the resize event on the header to make the #content node shift
  // down as it reflows.
  window.addEventListener("resize", this._adjustHeadingSize.bind(this));
}

MultiMessageSummary.prototype = {
  /**
   * The maximum number of messages to examine in any way.
   */
  kMaxMessages: 10000,

  /**
   * Register a summarizer for a particular type of message summary.
   *
   * @param aSummarizer The summarizer object.
   */
  registerSummarizer: function(aSummarizer) {
    this._summarizers[aSummarizer.name] = aSummarizer;
    aSummarizer.onregistered(this);
  },

  /**
   * Store a mapping from a message header to the summary node in the DOM. We
   * use this to update things when Gloda tells us to.
   *
   * @param aMsgHdr The nsIMsgDBHdr.
   * @param aNode   The related DOM node.
   */
  mapMsgToNode: function(aMsgHdr, aNode) {
    let key = aMsgHdr.messageKey + aMsgHdr.folder.URI;
    this._msgNodes[key] = aNode;
  },

  /**
   * Clear all the content from the summary.
   */
  clear: function() {
    this._listener = null;
    this._glodaQuery = null;
    this._msgNodes = {};

    // Clear the messages list.
    let messageList = document.getElementById("message_list");
    while (messageList.hasChildNodes())
      messageList.lastChild.remove();

    // Clear the notice.
    let notice = document.getElementById("notice");
    notice.classList.add("hidden");
  },

  /**
   * Fill in the summary pane describing the selected messages.
   *
   * @param aType       The type of summary to perform (e.g. 'multimessage').
   * @param aMessages   The messages to summarize.
   * @param [aListener] A listener to be notified when the summary starts and
   *                    finishes.
   */
  summarize: function(aType, aMessages, aListener) {
    this.clear();

    this._listener = aListener;
    if (this._listener)
      this._listener.onLoadStarted();

    // Enable/disable the archive button as appropriate.
    let archiveBtn = document.getElementById("hdrArchiveButton");
    archiveBtn.collapsed = !window.top.gFolderDisplay
                                  .canArchiveSelectedMessages;

    let summarizer = this._summarizers[aType];
    if (!summarizer)
      throw new Error('Unknown summarizer "' + aType + '"');

    let messages = new LimitIterator(aMessages, this.kMaxMessages);
    let summarizedMessages = summarizer.summarize(messages);

    // Stash somewhere so it doesn't get GC'ed.
    this._glodaQuery = Gloda.getMessageCollectionForHeaders(
      summarizedMessages, this
    );
    this._computeSize(messages);
  },

  /**
   * Set the heading for the summary.
   *
   * @param title    The title for the heading.
   * @param subtitle A smaller subtitle for the heading.
   */
  setHeading: function(title, subtitle) {
    let titleNode = document.getElementById("summary_title");
    let subtitleNode = document.getElementById("summary_subtitle");
    titleNode.textContent = title || "";
    subtitleNode.textContent = subtitle || "";

    this._adjustHeadingSize();
  },

  /**
   * Create a summary item for a message or thread.
   *
   * @param aMsgOrThread An nsIMsgDBHdr or an array thereof
   * @param [aOptions]   An optional object to customize the output:
   *                      showSubject: true if the subject of the message
   *                        should be shown; defaults to false
   *                      snippetLength: the length in bytes of the message
   *                        snippet; defaults to undefined (let Gloda decide)
   * @return A DOM node for the summary item.
   */
  makeSummaryItem: function(aMsgOrThread, aOptions) {
    let message, thread, numUnread, isStarred, tags;
    if (aMsgOrThread instanceof Components.interfaces.nsIMsgDBHdr) {
      thread = null;
      message = aMsgOrThread;

      numUnread = message.isRead ? 0 : 1;
      isStarred = message.isFlagged;

      tags = this._getTagsForMsg(message);
    }
    else {
      thread = aMsgOrThread;
      message = thread[0];

      numUnread = thread.reduce(function(x, hdr) {
        return x + (hdr.isRead ? 0 : 1);
      }, 0);
      isStarred = thread.some(function(hdr) { return hdr.isFlagged; });

      tags = new Set();
      for (let message of thread) {
        for (let tag of this._getTagsForMsg(message))
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
    authorNode.textContent = FormatDisplayNameList(
      message.mime2DecodedAuthor, "from"
    );

    if (aOptions && aOptions.showSubject) {
      authorNode.classList.add("right");
      itemHeaderNode.appendChild(authorNode);

      let subjectNode = document.createElement("span");
      subjectNode.classList.add("subject", "primary_header", "link");
      subjectNode.textContent = message.mime2DecodedSubject ||
                                formatString("noSubject");
      subjectNode.addEventListener("click", function() {
        window.top.gFolderDisplay.selectMessages(thread);
      }, false);
      itemHeaderNode.appendChild(subjectNode);

      if (thread && thread.length > 1) {
        let numUnreadStr = "";
        if (numUnread)
          numUnreadStr = formatString(
            "numUnread", [numUnread.toLocaleString()], numUnread
          );
        let countStr = "(" + formatString(
          "numMessages", [thread.length.toLocaleString()], thread.length
        ) + numUnreadStr + ")";

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
        window.top.gFolderDisplay.selectMessage(message);
        window.top.document.getElementById("messagepane").focus();
      }, false);
      itemHeaderNode.appendChild(authorNode);
    }

    let tagNode = document.createElement("span");
    tagNode.classList.add("tags");
    this._addTagNodes(tags, tagNode);
    itemHeaderNode.appendChild(tagNode);

    let snippetNode = row.querySelector(".snippet");
    try {
      const kSnippetLength = (aOptions && aOptions.snippetLength);
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
   * Show an informative notice about the summarized messages (e.g. if we only
   * summarized some of them).
   *
   * @param aNoticeText The text to show in the notice.
   */
  showNotice: function(aNoticeText) {
    let notice = document.getElementById("notice");
    notice.textContent = aNoticeText;
    notice.classList.remove("hidden");
  },

  /**
   * Given a msgHdr, return a list of tag objects. This function just does the
   * messy work of understanding how tags are stored in nsIMsgDBHdrs.  It would
   * be a good candidate for a utility library.
   *
   * @param aMsgHdr The msgHdr whose tags we want.
   * @return An array of nsIMsgTag objects.
   */
  _getTagsForMsg: function(aMsgHdr) {
    let keywords = new Set(aMsgHdr.getStringProperty("keywords").split(" "));
    let allTags = MailServices.tags.getAllTags({});

    return allTags.filter(function(tag) {
      return keywords.has(tag.key);
    });
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
   *
   * @param aMessages A LimitIterator of the messages to calculate the size of.
   */
  _computeSize: function(aMessages) {
    let numBytes = 0;
    for (let msgHdr of aMessages)
      numBytes += msgHdr.messageSize; // XXX do something about news?

    let format = aMessages.limited ? "messagesTotalSizeMoreThan" :
                                     "messagesTotalSize";
    document.getElementById("size").textContent = formatString(
      format, [gMessenger.formatFileSize(numBytes)]
    );
  },

  /**
   * Adjust the position of the top of the main content so that it fits below
   * the heading.
   */
  _adjustHeadingSize: function() {
    let content = document.getElementById("content");
    let heading = document.getElementById("heading");
    let buttonbox = document.getElementById("header-view-toolbox");

    content.style.top = Math.max(
      buttonbox.getBoundingClientRect().height,
      heading.getBoundingClientRect().height
    ) + "px";
  },

  // These are listeners for the gloda collections.
  onItemsAdded: function(aItems) {},
  onItemsModified: function(aItems) {
    this._processItems(aItems);
  },
  onItemsRemoved: function(aItems) {},

  /**
   * Given a set of items from a gloda collection, process them and update
   * the display accordingly.
   *
   * @param aItems Contents of a gloda collection.
   */
  _processItems: function(aItems) {
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
          tags: new Set(),
        });
      }

      let flags = knownMessageNodes.get(headerNode);

      // Count as read if *all* the messages are read.
      flags.read &= glodaMsg.read;
      // Count as starred if *any* of the messages are starred.
      flags.starred |= glodaMsg.starred;
      // Count as tagged with a tag if *any* of the messages have that tag.
      for (let tag of this._getTagsForMsg(glodaMsg.folderMessage))
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
  },
};

/**
 * A summarizer to use for a single thread.
 */
function ThreadSummarizer() {}

ThreadSummarizer.prototype = {
  /**
   * The maximum number of messages to summarize.
   */
  kMaxSummarizedMessages: 100,

  /**
   * The length of message snippets to fetch from Gloda.
   */
  kSnippetLength: 300,

  /**
   * Returns a canonical name for this summarizer.
   */
  get name() {
    return "thread";
  },

  /**
   * A function to be called once the summarizer has been registered with the
   * main summary object.
   *
   * @param aContext The MultiMessageSummary object holding this summarizer.
   */
  onregistered: function(aContext) {
    this.context = aContext;
  },

  /**
   * Summarize a list of messages.
   *
   * @param aMessages A LimitIterator of the messages to summarize.
   * @return An array of the messages actually summarized.
   */
  summarize: function(aMessages) {
    let messageList = document.getElementById("message_list");

    // Remove all ignored messages from summarization.
    let summarizedMessages = [msg for (msg of aMessages) if (!msg.isKilled)];
    let ignoredCount = aMessages.trueLength - summarizedMessages.length;

    // Summarize the selected messages.
    let subject = null;
    let maxCountExceeded = false;
    for (let [i, msgHdr] in Iterator(summarizedMessages)) {
      if (i > this.kMaxSummarizedMessages) {
        summarizedMessages.length = i;
        maxCountExceeded = true;
        break;
      }

      if (subject == null)
        subject = msgHdr.mime2DecodedSubject;

      let msgNode = this.context.makeSummaryItem(msgHdr, {
        snippetLength: this.kSnippetLength,
      });
      messageList.appendChild(msgNode);

      this.context.mapMsgToNode(msgHdr, msgNode);
    }

    // Set the heading based on the subject and number of messages.
    let countInfo = formatString(
      "numMessages", [aMessages.length.toLocaleString()], aMessages.length
    );
    if (ignoredCount != 0) {
      let format = aMessages.limited ? "atLeastNumIgnored" : "numIgnored";
      countInfo += formatString(
        format, [ignoredCount.toLocaleString()], ignoredCount
      );
    }

    this.context.setHeading(subject || formatString("noSubject"), countInfo);

    if (maxCountExceeded) {
      this.context.showNotice(formatString("maxCountExceeded", [
        aMessages.trueLength.toLocaleString(),
        this.kMaxSummarizedMessages.toLocaleString(),
      ]));
    }

    return summarizedMessages;
  },
};

/**
 * A summarizer to use when multiple threads are selected.
 */
function MultipleSelectionSummarizer() {}

MultipleSelectionSummarizer.prototype = {
  /**
   * The maximum number of messages to summarize.
   */
  kMaxSummarizedMessages: 500,

  /**
   * The maximum number of threads to summarize.
   */
  kMaxSummarizedThreads: 100,

  /**
   * The length of message snippets to fetch from Gloda.
   */
  kSnippetLength: 300,

  /**
   * Returns a canonical name for this summarizer.
   */
  get name() {
    return "multipleselection";
  },

  /**
   * A function to be called once the summarizer has been registered with the
   * main summary object.
   *
   * @param aContext The MultiMessageSummary object holding this summarizer.
   */
  onregistered: function(aContext) {
    this.context = aContext;
  },

  /**
   * Summarize a list of messages.
   *
   * @param aMessages The messages to summarize.
   */
  summarize: function(aMessages) {
    let messageList = document.getElementById("message_list");

    let threads = this._buildThreads(aMessages);

    // Set the heading based on the number of messages & threads.
    let format = aMessages.limited ? "atLeastNumConversations" :
                                     "numConversations";
    this.context.setHeading(formatString(
      format, [threads.length.toLocaleString()], threads.length
    ));

    // Summarize the selected messages by thread.
    let maxCountExceeded = false;
    let messageCount = 0;
    for (let [i, msgs] in Iterator(threads)) {
      messageCount += msgs.length;
      if (messageCount > this.kMaxSummarizedMessages ||
          i > this.kMaxSummarizedThreads) {
        threads.length = i;
        maxCountExceeded = true;
        break;
      }

      let msgNode = this.context.makeSummaryItem(msgs, {
        showSubject: true,
        snippetLength: this.kSnippetLength,
      });
      messageList.appendChild(msgNode);

      for (let msgHdr of msgs)
        this.context.mapMsgToNode(msgHdr, msgNode);
    }

    if (maxCountExceeded) {
      this.context.showNotice(formatString("maxCountExceeded", [
        aMessages.trueLength.toLocaleString(),
        this.kMaxSummarizedMessages.toLocaleString(),
      ]));

      // Return only the messages for the threads we're actually showing. We
      // need to collapse our array-of-arrays into a flat array.
      return threads.reduce(function(accum, curr) {
        accum.push(...curr);
        return accum;
      }, []);
    }

    // Return everything, since we're showing all the threads. Don't forget to
    // turn it into an array, though!
    return [...aMessages];
  },

  /**
   * Group all the messages to be summarized into threads.
   *
   * @param aMessages The messages to group.
   * @return An array of arrays of messages, grouped by thread.
   */
  _buildThreads: function(aMessages) {
    // First, we group the messages in threads and count the threads.
    let threads = [];
    let threadMap = {};
    for (let msgHdr of aMessages) {
      let viewThreadId = window.top.gFolderDisplay.view.dbView
                                   .getThreadContainingMsgHdr(msgHdr)
                                   .threadKey;
      if (!(viewThreadId in threadMap)) {
        threadMap[viewThreadId] = threads.length;
        threads.push([msgHdr]);
      } else {
        threads[threadMap[viewThreadId]].push(msgHdr);
      }
    }
    return threads;
  },
};

var gMessageSummary = new MultiMessageSummary();

gMessageSummary.registerSummarizer(new ThreadSummarizer());
gMessageSummary.registerSummarizer(new MultipleSelectionSummarizer());
