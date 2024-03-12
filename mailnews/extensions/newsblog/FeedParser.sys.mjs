/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  FeedEnclosure: "resource:///modules/FeedItem.sys.mjs",
  FeedItem: "resource:///modules/FeedItem.sys.mjs",
  FeedUtils: "resource:///modules/FeedUtils.sys.mjs",
});

/**
 * The feed parser. Depends on FeedItem.js, Feed.js.
 *
 * @class
 */
export function FeedParser() {
  this.parsedItems = [];
  this.mSerializer = new XMLSerializer();
}

FeedParser.prototype = {
  /**
   * parseFeed() returns an array of parsed items ready for processing. It is
   * currently a synchronous operation.  If there is an error parsing the feed,
   * parseFeed returns an empty feed in addition to calling aFeed.onParseError.
   *
   * @param {Feed} aFeed - The Feed object.
   * @param {XMLDocument} aDOM - The document to parse.
   * @returns {Array} - array of items, or empty array for error returns or
   *                    nothing to do condition.
   */
  parseFeed(aFeed, aDOM) {
    if (!XMLDocument.isInstance(aDOM)) {
      // No xml doc.
      aFeed.onParseError(aFeed);
      return [];
    }

    const doc = aDOM.documentElement;
    if (doc.namespaceURI == lazy.FeedUtils.MOZ_PARSERERROR_NS) {
      // Gecko caught a basic parsing error.
      const errStr =
        doc.firstChild.textContent + "\n" + doc.firstElementChild.textContent;
      lazy.FeedUtils.log.info("FeedParser.parseFeed: - " + errStr);
      aFeed.onParseError(aFeed);
      return [];
    } else if (aDOM.querySelector("redirect")) {
      // Check for RSS2.0 redirect document.
      const channel = aDOM.querySelector("redirect");
      if (this.isPermanentRedirect(aFeed, channel, null)) {
        return [];
      }

      aFeed.onParseError(aFeed);
      return [];
    } else if (
      doc.namespaceURI == lazy.FeedUtils.RDF_SYNTAX_NS &&
      doc.getElementsByTagNameNS(lazy.FeedUtils.RSS_NS, "channel")[0]
    ) {
      aFeed.mFeedType = "RSS_1.xRDF";
      lazy.FeedUtils.log.debug(
        "FeedParser.parseFeed: type:url - " +
          aFeed.mFeedType +
          " : " +
          aFeed.url
      );

      return this.parseAsRSS1(aFeed, aDOM);
    } else if (doc.namespaceURI == lazy.FeedUtils.ATOM_03_NS) {
      aFeed.mFeedType = "ATOM_0.3";
      lazy.FeedUtils.log.debug(
        "FeedParser.parseFeed: type:url - " +
          aFeed.mFeedType +
          " : " +
          aFeed.url
      );
      return this.parseAsAtom(aFeed, aDOM);
    } else if (doc.namespaceURI == lazy.FeedUtils.ATOM_IETF_NS) {
      aFeed.mFeedType = "ATOM_IETF";
      lazy.FeedUtils.log.debug(
        "FeedParser.parseFeed: type:url - " +
          aFeed.mFeedType +
          " : " +
          aFeed.url
      );
      return this.parseAsAtomIETF(aFeed, aDOM);
    } else if (
      doc.getElementsByTagNameNS(lazy.FeedUtils.RSS_090_NS, "channel")[0]
    ) {
      aFeed.mFeedType = "RSS_0.90";
      lazy.FeedUtils.log.debug(
        "FeedParser.parseFeed: type:url - " +
          aFeed.mFeedType +
          " : " +
          aFeed.url
      );
      return this.parseAsRSS2(aFeed, aDOM);
    }

    // Parse as RSS 0.9x.  In theory even RSS 1.0 feeds could be parsed by
    // the 0.9x parser if the RSS namespace were the default.
    const rssVer = doc.localName == "rss" ? doc.getAttribute("version") : null;
    if (rssVer) {
      aFeed.mFeedType = "RSS_" + rssVer;
    } else {
      aFeed.mFeedType = "RSS_0.9x?";
    }
    lazy.FeedUtils.log.debug(
      "FeedParser.parseFeed: type:url - " + aFeed.mFeedType + " : " + aFeed.url
    );
    return this.parseAsRSS2(aFeed, aDOM);
  },

  parseAsRSS2(aFeed, aDOM) {
    // Get the first channel (assuming there is only one per RSS File).
    const channel = aDOM.querySelector("channel");
    if (!channel) {
      aFeed.onParseError(aFeed);
      return [];
    }

    // Usually the empty string, unless this is RSS .90.
    const nsURI = channel.namespaceURI || "";

    if (this.isPermanentRedirect(aFeed, null, channel)) {
      return [];
    }

    let tags = this.childrenByTagNameNS(channel, nsURI, "title");
    aFeed.title = aFeed.title || this.getNodeValue(tags ? tags[0] : null);
    tags = this.childrenByTagNameNS(channel, nsURI, "description");
    aFeed.description = this.getNodeValueFormatted(tags ? tags[0] : null);
    tags = this.childrenByTagNameNS(channel, nsURI, "link");
    aFeed.link = this.validLink(this.getNodeValue(tags ? tags[0] : null));

    if (!(aFeed.title || aFeed.description)) {
      lazy.FeedUtils.log.error(
        "FeedParser.parseAsRSS2: missing mandatory element " +
          "<title> and <description>"
      );
      // The RSS2 spec requires a <link> as well, but we can do without it
      // so ignore the case of (valid) link missing.
      aFeed.onParseError(aFeed);
      return [];
    }

    if (!aFeed.parseItems) {
      return [];
    }

    this.findSyUpdateTags(aFeed, channel);

    aFeed.invalidateItems();
    // XXX use getElementsByTagNameNS for now; childrenByTagNameNS would be
    // better, but RSS .90 is still with us.
    let itemNodes = aDOM.getElementsByTagNameNS(nsURI, "item");
    itemNodes = itemNodes ? itemNodes : [];
    lazy.FeedUtils.log.debug(
      "FeedParser.parseAsRSS2: items to parse - " + itemNodes.length
    );

    for (const itemNode of itemNodes) {
      if (!itemNode.childElementCount) {
        continue;
      }

      const item = new lazy.FeedItem();
      item.feed = aFeed;
      item.enclosures = [];
      item.keywords = [];

      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.FEEDBURNER_NS,
        "origLink"
      );
      let link = this.validLink(this.getNodeValue(tags ? tags[0] : null));
      if (!link) {
        tags = this.childrenByTagNameNS(itemNode, nsURI, "link");
        link = this.validLink(this.getNodeValue(tags ? tags[0] : null));
      }
      tags = this.childrenByTagNameNS(itemNode, nsURI, "guid");
      const guidNode = tags ? tags[0] : null;

      let guid;
      let isPermaLink = false;
      if (guidNode) {
        guid = this.getNodeValue(guidNode);
        // isPermaLink is true if the value is "true" or if the attribute is
        // not present; all other values, including "false" and "False" and
        // for that matter "TRuE" and "meatcake" are false.
        if (
          !guidNode.hasAttribute("isPermaLink") ||
          guidNode.getAttribute("isPermaLink") == "true"
        ) {
          isPermaLink = true;
        }
        // If attribute isPermaLink is missing, it is good to check the validity
        // of <guid> value as an URL to avoid linking to non-URL strings.
        if (!guidNode.hasAttribute("isPermaLink")) {
          try {
            Services.io.newURI(guid);
            if (Services.io.extractScheme(guid) == "tag") {
              isPermaLink = false;
            }
          } catch (ex) {
            isPermaLink = false;
          }
        }

        item.id = guid;
      }

      const guidLink = this.validLink(guid);
      if (isPermaLink && guidLink) {
        item.url = guidLink;
      } else if (link) {
        item.url = link;
      } else {
        item.url = null;
      }

      tags = this.childrenByTagNameNS(itemNode, nsURI, "description");
      item.description = this.getNodeValueFormatted(tags ? tags[0] : null);
      tags = this.childrenByTagNameNS(itemNode, nsURI, "title");
      item.title = this.getNodeValue(tags ? tags[0] : null);
      if (!(item.title || item.description)) {
        lazy.FeedUtils.log.info(
          "FeedParser.parseAsRSS2: <item> missing mandatory " +
            "element, either <title> or <description>; skipping"
        );
        continue;
      }

      if (!item.id) {
        // At this point, if there is no guid, uniqueness cannot be guaranteed
        // by any of link or date (optional) or title (optional unless there
        // is no description). Use a big chunk of description; minimize dupes
        // with url and title if present.
        item.id =
          (item.url || item.feed.url) +
          "#" +
          item.title +
          "#" +
          (this.stripTags(
            item.description ? item.description.substr(0, 150) : null
          ) || item.title);
        item.id = item.id.replace(/[\n\r\t\s]+/g, " ");
      }

      // Escape html entities in <title>, which are unescaped as textContent
      // values. If the title is used as content, it will remain escaped; if
      // it is used as the title, it will be unescaped upon store. Bug 1240603.
      // The <description> tag must follow escaping examples found in
      // http://www.rssboard.org/rss-encoding-examples, i.e. single escape angle
      // brackets for tags, which are removed if used as title, and double
      // escape entities for presentation in title.
      // Better: always use <title>. Best: use Atom.
      if (!item.title) {
        item.title = this.stripTags(item.description).substr(0, 150);
      } else {
        item.title = item.htmlEscape(item.title);
      }

      tags = this.childrenByTagNameNS(itemNode, nsURI, "author");
      if (!tags) {
        tags = this.childrenByTagNameNS(
          itemNode,
          lazy.FeedUtils.DC_NS,
          "creator"
        );
      }
      let author = this.getNodeValue(tags ? tags[0] : null) || aFeed.title;
      author = this.cleanAuthorName(author);
      item.author = author ? ["<" + author + ">"] : item.author;

      tags = this.childrenByTagNameNS(itemNode, nsURI, "pubDate");
      if (!tags || !this.getNodeValue(tags[0])) {
        tags = this.childrenByTagNameNS(itemNode, lazy.FeedUtils.DC_NS, "date");
      }
      item.date = this.getNodeValue(tags ? tags[0] : null) || item.date;

      // If the date is invalid, users will see the beginning of the epoch
      // unless we reset it here, so they'll see the current time instead.
      // This is typical aggregator behavior.
      if (item.date) {
        item.date = item.date.trim();
        if (!lazy.FeedUtils.isValidRFC822Date(item.date)) {
          // XXX Use this on the other formats as well.
          item.date = this.dateRescue(item.date);
        }
      }

      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.RSS_CONTENT_NS,
        "encoded"
      );
      item.content = this.getNodeValueFormatted(tags ? tags[0] : null);

      // Handle <enclosures> and <media:content>, which may be in a
      // <media:group> (if present).
      tags = this.childrenByTagNameNS(itemNode, nsURI, "enclosure");
      const encUrls = [];
      if (tags) {
        for (const tag of tags) {
          const url = this.validLink(tag.getAttribute("url"));
          if (url && !encUrls.includes(url)) {
            const type = this.removeUnprintableASCII(tag.getAttribute("type"));
            const length = this.removeUnprintableASCII(
              tag.getAttribute("length")
            );
            item.enclosures.push(new lazy.FeedEnclosure(url, type, length));
            encUrls.push(url);
          }
        }
      }

      tags = itemNode.getElementsByTagNameNS(lazy.FeedUtils.MRSS_NS, "content");
      if (tags) {
        for (const tag of tags) {
          const url = this.validLink(tag.getAttribute("url"));
          if (url && !encUrls.includes(url)) {
            const type = this.removeUnprintableASCII(tag.getAttribute("type"));
            const fileSize = this.removeUnprintableASCII(
              tag.getAttribute("fileSize")
            );
            item.enclosures.push(new lazy.FeedEnclosure(url, type, fileSize));
          }
        }
      }

      // The <origEnclosureLink> tag has no specification, especially regarding
      // whether more than one tag is allowed and, if so, how tags would
      // relate to previously declared (and well specified) enclosure urls.
      // The common usage is to include 1 origEnclosureLink, in addition to
      // the specified enclosure tags for 1 enclosure. Thus, we will replace the
      // first enclosure's, if found, url with the first <origEnclosureLink>
      // url only or else add the <origEnclosureLink> url.
      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.FEEDBURNER_NS,
        "origEnclosureLink"
      );
      const origEncUrl = this.validLink(
        this.getNodeValue(tags ? tags[0] : null)
      );
      if (origEncUrl) {
        if (item.enclosures.length) {
          item.enclosures[0].mURL = origEncUrl;
        } else {
          item.enclosures.push(new lazy.FeedEnclosure(origEncUrl));
        }
      }

      // Support <category> and autotagging.
      tags = this.childrenByTagNameNS(itemNode, nsURI, "category");
      if (tags) {
        for (const tag of tags) {
          let term = this.getNodeValue(tag);
          term = term ? this.xmlUnescape(term.replace(/,/g, ";")) : null;
          if (term && !item.keywords.includes(term)) {
            item.keywords.push(term);
          }
        }
      }

      this.parsedItems.push(item);
    }

    return this.parsedItems;
  },

  /**
   * Extracts feed details and (optionally) items from an RSS1
   * feed which has already been XML-parsed as an XMLDocument.
   * The feed items are extracted only if feed.parseItems is set.
   *
   * Technically RSS1 is supposed to be treated as RDFXML, but in practice
   * no feed parser anywhere ever does this, and feeds in the wild are
   * pretty shakey on their RDF encoding too. So we just treat it as raw
   * XML and pick out the bits we want.
   *
   * @param {Feed} feed - The Feed object.
   * @param {XMLDocument} doc - The document to parse.
   * @returns {Array} - array of FeedItems or empty array for error returns or
   *                    nothing to do condition (ie unset feed.parseItems).
   */
  parseAsRSS1(feed, doc) {
    const channel = doc.querySelector("channel");
    if (!channel) {
      feed.onParseError(feed);
      return [];
    }

    if (this.isPermanentRedirect(feed, null, channel)) {
      return [];
    }

    const titleNode = this.childByTagNameNS(
      channel,
      lazy.FeedUtils.RSS_NS,
      "title"
    );
    // If user entered a title manually, retain it.
    feed.title = feed.title || this.getNodeValue(titleNode) || feed.url;

    const descNode = this.childByTagNameNS(
      channel,
      lazy.FeedUtils.RSS_NS,
      "description"
    );
    feed.description = this.getNodeValueFormatted(descNode) || "";

    const linkNode = this.childByTagNameNS(
      channel,
      lazy.FeedUtils.RSS_NS,
      "link"
    );
    feed.link = this.validLink(this.getNodeValue(linkNode)) || feed.url;

    if (!(feed.title || feed.description) || !feed.link) {
      lazy.FeedUtils.log.error(
        "FeedParser.parseAsRSS1: missing mandatory element " +
          "<title> and <description>, or <link>"
      );
      feed.onParseError(feed);
      return [];
    }

    // If we're only interested in the overall feed description, we're done.
    if (!feed.parseItems) {
      return [];
    }

    this.findSyUpdateTags(feed, channel);

    feed.invalidateItems();

    // Now process all the individual items in the feed.
    let itemNodes = doc.getElementsByTagNameNS(lazy.FeedUtils.RSS_NS, "item");
    itemNodes = itemNodes ? itemNodes : [];

    for (const itemNode of itemNodes) {
      const item = new lazy.FeedItem();
      item.feed = feed;

      // Prefer the value of the link tag to the item URI since the URI could be
      // a relative URN.
      let itemURI = itemNode.getAttribute("about") || "";
      itemURI = this.removeUnprintableASCII(itemURI.trim());
      const linkNode = this.childByTagNameNS(
        itemNode,
        lazy.FeedUtils.RSS_NS,
        "link"
      );
      item.id = this.getNodeValue(linkNode) || itemURI;
      item.url = this.validLink(item.id);

      const descNode = this.childByTagNameNS(
        itemNode,
        lazy.FeedUtils.RSS_NS,
        "description"
      );
      item.description = this.getNodeValueFormatted(descNode);

      const titleNode = this.childByTagNameNS(
        itemNode,
        lazy.FeedUtils.RSS_NS,
        "title"
      );
      const subjectNode = this.childByTagNameNS(
        itemNode,
        lazy.FeedUtils.DC_NS,
        "subject"
      );

      item.title =
        this.getNodeValue(titleNode) || this.getNodeValue(subjectNode);
      if (!item.title && item.description) {
        item.title = this.stripTags(item.description).substr(0, 150);
      }
      if (!item.url || !item.title) {
        lazy.FeedUtils.log.info(
          "FeedParser.parseAsRSS1: <item> missing mandatory " +
            "element <item rdf:about> and <link>, or <title> and " +
            "no <description>; skipping"
        );
        continue;
      }

      // TODO XXX: ignores multiple authors.
      const authorNode = this.childByTagNameNS(
        itemNode,
        lazy.FeedUtils.DC_NS,
        "creator"
      );
      const channelCreatorNode = this.childByTagNameNS(
        channel,
        lazy.FeedUtils.DC_NS,
        "creator"
      );
      let author =
        this.getNodeValue(authorNode) ||
        this.getNodeValue(channelCreatorNode) ||
        feed.title;
      author = this.cleanAuthorName(author);
      item.author = author ? ["<" + author + ">"] : item.author;

      const dateNode = this.childByTagNameNS(
        itemNode,
        lazy.FeedUtils.DC_NS,
        "date"
      );
      item.date = this.getNodeValue(dateNode) || item.date;

      const contentNode = this.childByTagNameNS(
        itemNode,
        lazy.FeedUtils.RSS_CONTENT_NS,
        "encoded"
      );
      item.content = this.getNodeValueFormatted(contentNode);

      this.parsedItems.push(item);
    }
    lazy.FeedUtils.log.debug(
      "FeedParser.parseAsRSS1: items parsed - " + this.parsedItems.length
    );

    return this.parsedItems;
  },

  // TODO: deprecate ATOM_03_NS.
  parseAsAtom(aFeed, aDOM) {
    // Get the first channel (assuming there is only one per Atom File).
    const channel = aDOM.querySelector("feed");
    if (!channel) {
      aFeed.onParseError(aFeed);
      return [];
    }

    if (this.isPermanentRedirect(aFeed, null, channel)) {
      return [];
    }

    let tags = this.childrenByTagNameNS(
      channel,
      lazy.FeedUtils.ATOM_03_NS,
      "title"
    );
    aFeed.title =
      aFeed.title || this.stripTags(this.getNodeValue(tags ? tags[0] : null));
    tags = this.childrenByTagNameNS(
      channel,
      lazy.FeedUtils.ATOM_03_NS,
      "tagline"
    );
    aFeed.description = this.getNodeValueFormatted(tags ? tags[0] : null);
    tags = this.childrenByTagNameNS(channel, lazy.FeedUtils.ATOM_03_NS, "link");
    aFeed.link = this.validLink(this.findAtomLink("alternate", tags));

    if (!aFeed.title) {
      lazy.FeedUtils.log.error(
        "FeedParser.parseAsAtom: missing mandatory element <title>"
      );
      aFeed.onParseError(aFeed);
      return [];
    }

    if (!aFeed.parseItems) {
      return [];
    }

    this.findSyUpdateTags(aFeed, channel);

    aFeed.invalidateItems();
    let items = this.childrenByTagNameNS(
      channel,
      lazy.FeedUtils.ATOM_03_NS,
      "entry"
    );
    items = items ? items : [];
    lazy.FeedUtils.log.debug(
      "FeedParser.parseAsAtom: items to parse - " + items.length
    );

    for (const itemNode of items) {
      if (!itemNode.childElementCount) {
        continue;
      }

      const item = new lazy.FeedItem();
      item.feed = aFeed;

      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_03_NS,
        "link"
      );
      item.url = this.validLink(this.findAtomLink("alternate", tags));

      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_03_NS,
        "id"
      );
      item.id = this.getNodeValue(tags ? tags[0] : null);
      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_03_NS,
        "summary"
      );
      item.description = this.getNodeValueFormatted(tags ? tags[0] : null);
      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_03_NS,
        "title"
      );
      item.title =
        this.getNodeValue(tags ? tags[0] : null) ||
        (item.description ? item.description.substr(0, 150) : null);
      if (!item.title || !item.id) {
        // We're lenient about other mandatory tags, but insist on these.
        lazy.FeedUtils.log.info(
          "FeedParser.parseAsAtom: <entry> missing mandatory " +
            "element <id>, or <title> and no <summary>; skipping"
        );
        continue;
      }

      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_03_NS,
        "author"
      );
      if (!tags) {
        tags = this.childrenByTagNameNS(
          itemNode,
          lazy.FeedUtils.ATOM_03_NS,
          "contributor"
        );
      }
      if (!tags) {
        tags = this.childrenByTagNameNS(
          channel,
          lazy.FeedUtils.ATOM_03_NS,
          "author"
        );
      }

      const authorEl = tags ? tags[0] : null;

      let author = "";
      if (authorEl) {
        tags = this.childrenByTagNameNS(
          authorEl,
          lazy.FeedUtils.ATOM_03_NS,
          "name"
        );
        const name = this.getNodeValue(tags ? tags[0] : null);
        tags = this.childrenByTagNameNS(
          authorEl,
          lazy.FeedUtils.ATOM_03_NS,
          "email"
        );
        const email = this.getNodeValue(tags ? tags[0] : null);
        if (name) {
          author = name + (email ? " <" + email + ">" : "");
        } else if (email) {
          author = email;
        }
      }

      item.author = author || item.author || aFeed.title;

      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_03_NS,
        "modified"
      );
      if (!tags || !this.getNodeValue(tags[0])) {
        tags = this.childrenByTagNameNS(
          itemNode,
          lazy.FeedUtils.ATOM_03_NS,
          "issued"
        );
      }
      if (!tags || !this.getNodeValue(tags[0])) {
        tags = this.childrenByTagNameNS(
          channel,
          lazy.FeedUtils.ATOM_03_NS,
          "created"
        );
      }

      item.date = this.getNodeValue(tags ? tags[0] : null) || item.date;

      // XXX We should get the xml:base attribute from the content tag as well
      // and use it as the base HREF of the message.
      // XXX Atom feeds can have multiple content elements; we should differentiate
      // between them and pick the best one.
      // Some Atom feeds wrap the content in a CTYPE declaration; others use
      // a namespace to identify the tags as HTML; and a few are buggy and put
      // HTML tags in without declaring their namespace so they look like Atom.
      // We deal with the first two but not the third.
      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_03_NS,
        "content"
      );
      const contentNode = tags ? tags[0] : null;

      let content;
      if (contentNode) {
        content = "";
        for (const node of contentNode.childNodes) {
          if (node.nodeType == node.CDATA_SECTION_NODE) {
            content += node.data;
          } else {
            content += this.mSerializer.serializeToString(node);
          }
        }

        if (contentNode.getAttribute("mode") == "escaped") {
          content = content.replace(/&lt;/g, "<");
          content = content.replace(/&gt;/g, ">");
          content = content.replace(/&amp;/g, "&");
        }

        if (content == "") {
          content = null;
        }
      }

      item.content = content;
      this.parsedItems.push(item);
    }

    return this.parsedItems;
  },

  parseAsAtomIETF(aFeed, aDOM) {
    // Get the first channel (assuming there is only one per Atom File).
    const channel = this.childrenByTagNameNS(
      aDOM,
      lazy.FeedUtils.ATOM_IETF_NS,
      "feed"
    )[0];
    if (!channel) {
      aFeed.onParseError(aFeed);
      return [];
    }

    if (this.isPermanentRedirect(aFeed, null, channel)) {
      return [];
    }

    let contentBase = channel.getAttribute("xml:base");

    let tags = this.childrenByTagNameNS(
      channel,
      lazy.FeedUtils.ATOM_IETF_NS,
      "title"
    );
    aFeed.title =
      aFeed.title ||
      this.stripTags(this.serializeTextConstruct(tags ? tags[0] : null));

    tags = this.childrenByTagNameNS(
      channel,
      lazy.FeedUtils.ATOM_IETF_NS,
      "subtitle"
    );
    aFeed.description = this.serializeTextConstruct(tags ? tags[0] : null);

    // Per spec, aFeed.link and contentBase may both end up null here.
    tags = this.childrenByTagNameNS(
      channel,
      lazy.FeedUtils.ATOM_IETF_NS,
      "link"
    );
    aFeed.link =
      this.findAtomLink("self", tags, contentBase) ||
      this.findAtomLink("alternate", tags, contentBase);
    aFeed.link = this.validLink(aFeed.link);
    if (!contentBase) {
      contentBase = aFeed.link;
    }

    if (!aFeed.title) {
      lazy.FeedUtils.log.error(
        "FeedParser.parseAsAtomIETF: missing mandatory element <title>"
      );
      aFeed.onParseError(aFeed);
      return [];
    }

    if (!aFeed.parseItems) {
      return [];
    }

    this.findSyUpdateTags(aFeed, channel);

    aFeed.invalidateItems();
    let items = this.childrenByTagNameNS(
      channel,
      lazy.FeedUtils.ATOM_IETF_NS,
      "entry"
    );
    items = items ? items : [];
    lazy.FeedUtils.log.debug(
      "FeedParser.parseAsAtomIETF: items to parse - " + items.length
    );

    for (const itemNode of items) {
      if (!itemNode.childElementCount) {
        continue;
      }

      const item = new lazy.FeedItem();
      item.feed = aFeed;
      item.enclosures = [];
      item.keywords = [];

      contentBase = itemNode.getAttribute("xml:base") || contentBase;

      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_IETF_NS,
        "source"
      );
      const source = tags ? tags[0] : null;

      // Per spec, item.link and contentBase may both end up null here.
      // If <content> is also not present, then <link rel="alternate"> is MUST
      // but we're lenient.
      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.FEEDBURNER_NS,
        "origLink"
      );
      item.url = this.validLink(this.getNodeValue(tags ? tags[0] : null));
      if (!item.url) {
        tags = this.childrenByTagNameNS(
          itemNode,
          lazy.FeedUtils.ATOM_IETF_NS,
          "link"
        );
        item.url =
          this.validLink(this.findAtomLink("alternate", tags, contentBase)) ||
          aFeed.link;
      }
      if (!contentBase) {
        contentBase = item.url;
      }

      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_IETF_NS,
        "id"
      );
      item.id = this.getNodeValue(tags ? tags[0] : null);
      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_IETF_NS,
        "summary"
      );
      item.description = this.serializeTextConstruct(tags ? tags[0] : null);
      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_IETF_NS,
        "title"
      );
      if (!tags || !this.getNodeValue(tags[0])) {
        tags = this.childrenByTagNameNS(
          source,
          lazy.FeedUtils.ATOM_IETF_NS,
          "title"
        );
      }
      item.title = this.stripTags(
        this.serializeTextConstruct(tags ? tags[0] : null) ||
          (item.description ? item.description.substr(0, 150) : null)
      );
      if (!item.title || !item.id) {
        // We're lenient about other mandatory tags, but insist on these.
        lazy.FeedUtils.log.info(
          "FeedParser.parseAsAtomIETF: <entry> missing mandatory " +
            "element <id>, or <title> and no <summary>; skipping"
        );
        continue;
      }

      // Support multiple authors.
      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_IETF_NS,
        "author"
      );
      if (!tags) {
        tags = this.childrenByTagNameNS(
          source,
          lazy.FeedUtils.ATOM_IETF_NS,
          "author"
        );
      }
      if (!tags) {
        tags = this.childrenByTagNameNS(
          channel,
          lazy.FeedUtils.ATOM_IETF_NS,
          "author"
        );
      }

      const authorTags = tags || [];
      const authors = [];
      for (const authorTag of authorTags) {
        let author = "";
        tags = this.childrenByTagNameNS(
          authorTag,
          lazy.FeedUtils.ATOM_IETF_NS,
          "name"
        );
        let name = this.getNodeValue(tags ? tags[0] : null);
        tags = this.childrenByTagNameNS(
          authorTag,
          lazy.FeedUtils.ATOM_IETF_NS,
          "email"
        );
        let email = this.getNodeValue(tags ? tags[0] : null);
        if (name) {
          name = this.cleanAuthorName(name);
          if (email) {
            if (!email.match(/^<.*>$/)) {
              email = " <" + email + ">";
            }
            author = name + email;
          } else {
            author = "<" + name + ">";
          }
        } else if (email) {
          author = email;
        }

        if (author) {
          authors.push(author);
        }
      }

      if (authors.length == 0) {
        tags = this.childrenByTagNameNS(
          channel,
          lazy.FeedUtils.DC_NS,
          "publisher"
        );
        let author = this.getNodeValue(tags ? tags[0] : null) || aFeed.title;
        author = this.cleanAuthorName(author);
        item.author = author ? ["<" + author + ">"] : item.author;
      } else {
        item.author = authors;
      }
      lazy.FeedUtils.log.trace(
        "FeedParser.parseAsAtomIETF: author(s) - " + item.author
      );

      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_IETF_NS,
        "updated"
      );
      if (!tags || !this.getNodeValue(tags[0])) {
        tags = this.childrenByTagNameNS(
          itemNode,
          lazy.FeedUtils.ATOM_IETF_NS,
          "published"
        );
      }
      if (!tags || !this.getNodeValue(tags[0])) {
        tags = this.childrenByTagNameNS(
          source,
          lazy.FeedUtils.ATOM_IETF_NS,
          "published"
        );
      }
      item.date = this.getNodeValue(tags ? tags[0] : null) || item.date;

      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_IETF_NS,
        "content"
      );
      item.content = this.serializeTextConstruct(tags ? tags[0] : null);

      // Ensure relative links can be resolved and Content-Base set to an
      // absolute url for the entry. But it's not mandatory that a url is found
      // for Content-Base, per spec.
      if (item.content) {
        item.xmlContentBase =
          (tags && tags[0].getAttribute("xml:base")) || contentBase;
      } else if (item.description) {
        tags = this.childrenByTagNameNS(
          itemNode,
          lazy.FeedUtils.ATOM_IETF_NS,
          "summary"
        );
        item.xmlContentBase =
          (tags && tags[0].getAttribute("xml:base")) || contentBase;
      } else {
        item.xmlContentBase = contentBase;
      }

      item.xmlContentBase = this.validLink(item.xmlContentBase);

      // Handle <link rel="enclosure"> (if present).
      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_IETF_NS,
        "link"
      );
      const encUrls = [];
      if (tags) {
        for (const tag of tags) {
          let url =
            tag.getAttribute("rel") == "enclosure"
              ? (tag.getAttribute("href") || "").trim()
              : null;
          url = this.validLink(url);
          if (url && !encUrls.includes(url)) {
            const type = this.removeUnprintableASCII(tag.getAttribute("type"));
            const length = this.removeUnprintableASCII(
              tag.getAttribute("length")
            );
            const title = this.removeUnprintableASCII(
              tag.getAttribute("title")
            );
            item.enclosures.push(
              new lazy.FeedEnclosure(url, type, length, title)
            );
            encUrls.push(url);
          }
        }
      }

      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.FEEDBURNER_NS,
        "origEnclosureLink"
      );
      const origEncUrl = this.validLink(
        this.getNodeValue(tags ? tags[0] : null)
      );
      if (origEncUrl) {
        if (item.enclosures.length) {
          item.enclosures[0].mURL = origEncUrl;
        } else {
          item.enclosures.push(new lazy.FeedEnclosure(origEncUrl));
        }
      }

      // Handle atom threading extension, RFC4685.  There may be 1 or more tags,
      // and each must contain a ref attribute with 1 Message-Id equivalent
      // value.  This is the only attr of interest in the spec for presentation.
      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_THREAD_NS,
        "in-reply-to"
      );
      if (tags) {
        for (const tag of tags) {
          const ref = this.removeUnprintableASCII(tag.getAttribute("ref"));
          if (ref) {
            item.inReplyTo += item.normalizeMessageID(ref) + " ";
          }
        }
        item.inReplyTo = item.inReplyTo.trimRight();
      }

      // Support <category> and autotagging.
      tags = this.childrenByTagNameNS(
        itemNode,
        lazy.FeedUtils.ATOM_IETF_NS,
        "category"
      );
      if (tags) {
        for (const tag of tags) {
          let term = this.removeUnprintableASCII(tag.getAttribute("term"));
          term = term ? this.xmlUnescape(term.replace(/,/g, ";")).trim() : null;
          if (term && !item.keywords.includes(term)) {
            item.keywords.push(term);
          }
        }
      }

      this.parsedItems.push(item);
    }

    return this.parsedItems;
  },

  isPermanentRedirect(aFeed, aRedirDocChannel, aFeedChannel) {
    // If subscribing to a new feed, do not check redirect tags.
    if (!aFeed.downloadCallback || aFeed.downloadCallback.mSubscribeMode) {
      return false;
    }

    let tags, tagName, newUrl;
    const oldUrl = aFeed.url;

    // Check for RSS2.0 redirect document <newLocation> tag.
    if (aRedirDocChannel) {
      tagName = "newLocation";
      tags = this.childrenByTagNameNS(aRedirDocChannel, "", tagName);
      newUrl = this.getNodeValue(tags ? tags[0] : null);
    }

    // Check for <itunes:new-feed-url> tag.
    if (aFeedChannel) {
      tagName = "new-feed-url";
      tags = this.childrenByTagNameNS(
        aFeedChannel,
        lazy.FeedUtils.ITUNES_NS,
        tagName
      );
      newUrl = this.getNodeValue(tags ? tags[0] : null);
      tagName = "itunes:" + tagName;
    }

    if (
      newUrl &&
      newUrl != oldUrl &&
      lazy.FeedUtils.isValidScheme(newUrl) &&
      lazy.FeedUtils.changeUrlForFeed(aFeed, newUrl)
    ) {
      lazy.FeedUtils.log.info(
        "FeedParser.isPermanentRedirect: found <" +
          tagName +
          "> tag; updated feed url from: " +
          oldUrl +
          " to: " +
          newUrl +
          " in folder: " +
          lazy.FeedUtils.getFolderPrettyPath(aFeed.folder)
      );
      aFeed.onUrlChange(aFeed, oldUrl);
      return true;
    }

    return false;
  },

  serializeTextConstruct(textElement) {
    let content = "";
    if (textElement) {
      let textType = textElement.getAttribute("type");

      // Atom spec says consider it "text" if not present.
      if (!textType) {
        textType = "text";
      }

      // There could be some strange content type we don't handle.
      if (textType != "text" && textType != "html" && textType != "xhtml") {
        return null;
      }

      for (const node of textElement.childNodes) {
        if (node.nodeType == node.CDATA_SECTION_NODE) {
          content += this.xmlEscape(node.data);
        } else {
          content += this.mSerializer.serializeToString(node);
        }
      }

      if (textType == "html") {
        content = this.xmlUnescape(content);
      }

      content = content.trim();
    }

    // Other parts of the code depend on this being null if there's no content.
    return content ? content : null;
  },

  /**
   * Return a cleaned up author name value.
   *
   * @param {string} authorString - A string.
   * @returns {String} - A clean string value.
   */
  cleanAuthorName(authorString) {
    if (!authorString) {
      return "";
    }
    lazy.FeedUtils.log.trace(
      "FeedParser.cleanAuthor: author1 - " + authorString
    );
    let author = authorString
      .replace(/[\n\r\t]+/g, " ")
      .replace(/"/g, '\\"')
      .trim();
    // If the name contains special chars, quote it.
    if (author.match(/[<>@,"]/)) {
      author = '"' + author + '"';
    }
    lazy.FeedUtils.log.trace("FeedParser.cleanAuthor: author2 - " + author);

    return author;
  },

  /**
   * Return a cleaned up node value. This is intended for values that are not
   * multiline and not formatted. A sequence of tab or newline is converted to
   * a space and unprintable ascii is removed.
   *
   * @param {Node} node - A DOM node.
   * @returns {String} - A clean string value or null.
   */
  getNodeValue(node) {
    let nodeValue = this.getNodeValueRaw(node);
    if (!nodeValue) {
      return null;
    }

    nodeValue = nodeValue.replace(/[\n\r\t]+/g, " ");
    return this.removeUnprintableASCII(nodeValue);
  },

  /**
   * Return a cleaned up formatted node value, meaning CR/LF/TAB are retained
   * while all other unprintable ascii is removed. This is intended for values
   * that are multiline and formatted, such as content or description tags.
   *
   * @param {Node} node - A DOM node.
   * @returns {String} - A clean string value or null.
   */
  getNodeValueFormatted(node) {
    const nodeValue = this.getNodeValueRaw(node);
    if (!nodeValue) {
      return null;
    }

    return this.removeUnprintableASCIIexCRLFTAB(nodeValue);
  },

  /**
   * Return a raw node value, as received. This should be sanitized as
   * appropriate.
   *
   * @param {Node} node - A DOM node.
   * @returns {String} - A string value or null.
   */
  getNodeValueRaw(node) {
    if (node && node.textContent) {
      return node.textContent.trim();
    }

    if (node && node.firstChild) {
      let ret = "";
      for (let child = node.firstChild; child; child = child.nextSibling) {
        const value = this.getNodeValueRaw(child);
        if (value) {
          ret += value;
        }
      }

      if (ret) {
        return ret.trim();
      }
    }

    return null;
  },

  // Finds elements that are direct children of the first arg.
  childrenByTagNameNS(aElement, aNamespace, aTagName) {
    if (!aElement) {
      return null;
    }

    const matches = aElement.getElementsByTagNameNS(aNamespace, aTagName);
    const matchingChildren = [];
    for (const match of matches) {
      if (match.parentNode == aElement) {
        matchingChildren.push(match);
      }
    }

    return matchingChildren.length ? matchingChildren : null;
  },

  /**
   * Returns first matching descendent of element, or null.
   *
   * @param {Element} element - DOM element to search.
   * @param {string} namespace - Namespace of the search tag.
   * @param {String} tagName - Tag to search for.
   * @returns {Element|null} - Matching element, or null.
   */
  childByTagNameNS(element, namespace, tagName) {
    if (!element) {
      return null;
    }
    // Handily, item() returns null for out-of-bounds access.
    return element.getElementsByTagNameNS(namespace, tagName).item(0);
  },

  /**
   * Ensure <link> type tags start with http[s]://, ftp:// or magnet:
   * for values stored in mail headers (content-base and remote enclosures),
   * particularly to prevent data: uris, javascript, and other spoofing.
   *
   * @param {string} link - An intended http url string.
   * @returns {String} - A clean string starting with http, ftp or magnet,
   *                         else null.
   */
  validLink(link) {
    if (/^((https?|ftp):\/\/|magnet:)/.test(link)) {
      return this.removeUnprintableASCII(link.trim());
    }

    return null;
  },

  /**
   * Return an absolute link for <entry> relative links. If xml:base is
   * present in a <feed> attribute or child <link> element attribute, use it;
   * otherwise the Feed.link will be the relevant <feed> child <link> value
   * and will be the |baseURI| for <entry> child <link>s if there is no further
   * xml:base, which may be an attribute of any element.
   *
   * @param {string} linkRel - the <link> rel attribute value to find.
   * @param {NodeList} linkElements - the nodelist of <links> to search in.
   * @param {string} baseURI - the url to use when resolving relative
   *                                   links to absolute values.
   * @returns {String} or null       - absolute url for a <link>, or null if the
   *                                   rel type is not found.
   */
  findAtomLink(linkRel, linkElements, baseURI) {
    if (!linkElements) {
      return null;
    }

    // XXX Need to check for MIME type and hreflang.
    for (const alink of linkElements) {
      if (
        alink &&
        // If there's a link rel.
        ((alink.getAttribute("rel") && alink.getAttribute("rel") == linkRel) ||
          // If there isn't, assume 'alternate'.
          (!alink.getAttribute("rel") && linkRel == "alternate")) &&
        alink.getAttribute("href")
      ) {
        // Atom links are interpreted relative to xml:base.
        const href = alink.getAttribute("href");
        baseURI = alink.getAttribute("xml:base") || baseURI || href;
        try {
          return Services.io.newURI(baseURI).resolve(href);
        } catch (ex) {}
      }
    }

    return null;
  },

  /**
   * Find RSS Syndication extension tags.
   * http://web.resource.org/rss/1.0/modules/syndication/
   *
   * @param {Feed} aFeed - the feed object.
   * @param {Node | String} aChannel  - dom node for the <channel>.
   * @returns {void}
   */
  findSyUpdateTags(aFeed, aChannel) {
    let tag, updatePeriod, updateFrequency;
    tag = this.childrenByTagNameNS(
      aChannel,
      lazy.FeedUtils.RSS_SY_NS,
      "updatePeriod"
    );
    updatePeriod = this.getNodeValue(tag ? tag[0] : null) || "";
    tag = this.childrenByTagNameNS(
      aChannel,
      lazy.FeedUtils.RSS_SY_NS,
      "updateFrequency"
    );
    updateFrequency = this.getNodeValue(tag ? tag[0] : null) || "";
    tag = this.childrenByTagNameNS(
      aChannel,
      lazy.FeedUtils.RSS_SY_NS,
      "updateBase"
    );
    const updateBase = this.getNodeValue(tag ? tag[0] : null) || "";
    lazy.FeedUtils.log.debug(
      "FeedParser.findSyUpdateTags: updatePeriod:updateFrequency - " +
        updatePeriod +
        ":" +
        updateFrequency
    );

    if (updatePeriod) {
      if (lazy.FeedUtils.RSS_SY_UNITS.includes(updatePeriod.toLowerCase())) {
        updatePeriod = updatePeriod.toLowerCase();
      } else {
        updatePeriod = "daily";
      }
    }

    updateFrequency = isNaN(updateFrequency) ? 1 : updateFrequency;

    const options = aFeed.options;
    if (
      options.updates.updatePeriod == updatePeriod &&
      options.updates.updateFrequency == updateFrequency &&
      options.updates.updateBase == updateBase
    ) {
      return;
    }

    options.updates.updatePeriod = updatePeriod;
    options.updates.updateFrequency = updateFrequency;
    options.updates.updateBase = updateBase;
    aFeed.options = options;
  },

  /**
   * Remove unprintable ascii, particularly CR/LF, for non formatted tag values.
   *
   * @param {string} s - String to clean.
   * @returns {String} - Cleaned string.
   */
  removeUnprintableASCII(s) {
    /* eslint-disable-next-line no-control-regex */
    return s ? s.replace(/[\x00-\x1F\x7F]+/g, "") : "";
  },

  /**
   * Remove unprintable ascii, except CR/LF/TAB, for formatted tag values.
   *
   * @param {string} s - String to clean.
   * @returns {String} - Cleaned string.
   */
  removeUnprintableASCIIexCRLFTAB(s) {
    /* eslint-disable-next-line no-control-regex */
    return s ? s.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]+/g, "") : "";
  },

  stripTags(someHTML) {
    return someHTML ? someHTML.replace(/<[^>]+>/g, "") : someHTML;
  },

  xmlUnescape(s) {
    s = s.replace(/&lt;/g, "<");
    s = s.replace(/&gt;/g, ">");
    s = s.replace(/&amp;/g, "&");
    return s;
  },

  xmlEscape(s) {
    s = s.replace(/&/g, "&amp;");
    s = s.replace(/>/g, "&gt;");
    s = s.replace(/</g, "&lt;");
    return s;
  },

  dateRescue(dateString) {
    // Deal with various kinds of invalid dates.
    if (!isNaN(parseInt(dateString))) {
      // It's an integer, so maybe it's a timestamp.
      const d = new Date(parseInt(dateString) * 1000);
      const now = new Date();
      const yeardiff = now.getFullYear() - d.getFullYear();
      lazy.FeedUtils.log.trace(
        "FeedParser.dateRescue: Rescue Timestamp date - " +
          d.toString() +
          " ,year diff - " +
          yeardiff
      );
      if (yeardiff >= 0 && yeardiff < 3) {
        // It's quite likely the correct date.
        return d.toString();
      }
    }

    // Could be an ISO8601/W3C date.  If not, get the current time.
    return lazy.FeedUtils.getValidRFC5322Date(dateString);
  },
};
