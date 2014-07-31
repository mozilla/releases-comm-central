/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The feed parser depends on FeedItem.js, Feed.js.
function FeedParser() {
  this.mSerializer = Cc["@mozilla.org/xmlextras/xmlserializer;1"].
                     createInstance(Ci.nsIDOMSerializer);
}

FeedParser.prototype =
{
  // parseFeed() returns an array of parsed items ready for processing.  It is
  // currently a synchronous operation.  If there is an error parsing the feed,
  // parseFeed returns an empty feed in addition to calling aFeed.onParseError.
  parseFeed: function (aFeed, aDOM)
  {
    if (!(aDOM instanceof Ci.nsIDOMXMLDocument))
    {
      // No xml doc.
      return aFeed.onParseError(aFeed);
    }

    let doc = aDOM.documentElement;
    if (doc.namespaceURI == FeedUtils.MOZ_PARSERERROR_NS)
    {
      // Gecko caught a basic parsing error.
      let errStr = doc.firstChild.textContent + "\n" +
                   doc.firstElementChild.textContent;
      FeedUtils.log.info("FeedParser.parseFeed: - " + errStr);
      return aFeed.onParseError(aFeed);
    }
    else if (aDOM.querySelector("redirect"))
    {
      // Check for RSS2.0 redirect document.
      let channel = aDOM.querySelector("redirect");
      if (this.isPermanentRedirect(aFeed, channel, null, null))
        return;

      return aFeed.onParseError(aFeed);
    }
    else if (doc.namespaceURI == FeedUtils.RDF_SYNTAX_NS &&
             doc.getElementsByTagNameNS(FeedUtils.RSS_NS, "channel")[0])
    {
      aFeed.mFeedType = "RSS_1.xRDF"
      FeedUtils.log.debug("FeedParser.parseFeed: type:url - " +
                          aFeed.mFeedType +" : " +aFeed.url);
      // aSource can be misencoded (XMLHttpRequest converts to UTF-8 by default),
      // but the DOM is almost always right because it uses the hints in the
      // XML file.  This is slower, but not noticably so.  Mozilla doesn't have
      // the XMLHttpRequest.responseBody property that IE has, which provides
      // access to the unencoded response.
      let xmlString = this.mSerializer.serializeToString(doc);
      return this.parseAsRSS1(aFeed, xmlString, aFeed.request.channel.URI);
    }
    else if (doc.namespaceURI == FeedUtils.ATOM_03_NS)
    {
      aFeed.mFeedType = "ATOM_0.3"
      FeedUtils.log.debug("FeedParser.parseFeed: type:url - " +
                          aFeed.mFeedType +" : " +aFeed.url);
      return this.parseAsAtom(aFeed, aDOM);
    }
    else if (doc.namespaceURI == FeedUtils.ATOM_IETF_NS)
    {
      aFeed.mFeedType = "ATOM_IETF"
      FeedUtils.log.debug("FeedParser.parseFeed: type:url - " +
                          aFeed.mFeedType +" : " +aFeed.url);
      return this.parseAsAtomIETF(aFeed, aDOM);
    }
    else if (doc.getElementsByTagNameNS(FeedUtils.RSS_090_NS, "channel")[0])
    {
      aFeed.mFeedType = "RSS_0.90"
      FeedUtils.log.debug("FeedParser.parseFeed: type:url - " +
                          aFeed.mFeedType +" : " +aFeed.url);
      return this.parseAsRSS2(aFeed, aDOM);
    }
    else
    {
      // Parse as RSS 0.9x.  In theory even RSS 1.0 feeds could be parsed by
      // the 0.9x parser if the RSS namespace were the default.
      let rssVer = doc.localName == "rss" ? doc.getAttribute("version") : null;
      if (rssVer)
        aFeed.mFeedType = "RSS_" + rssVer;
      else
        aFeed.mFeedType = "RSS_0.9x?";
      FeedUtils.log.debug("FeedParser.parseFeed: type:url - " +
                          aFeed.mFeedType +" : " +aFeed.url);
      return this.parseAsRSS2(aFeed, aDOM);
    }
  },

  parseAsRSS2: function (aFeed, aDOM)
  {
    // Get the first channel (assuming there is only one per RSS File).
    let parsedItems = new Array();

    let channel = aDOM.querySelector("channel");
    if (!channel)
      return aFeed.onParseError(aFeed);

    // Usually the empty string, unless this is RSS .90.
    let nsURI = channel.namespaceURI || "";
    FeedUtils.log.debug("FeedParser.parseAsRSS2: channel nsURI - " + nsURI);

    if (this.isPermanentRedirect(aFeed, null, channel, null))
      return;

    let tags = this.childrenByTagNameNS(channel, nsURI, "title");
    aFeed.title = aFeed.title || this.getNodeValue(tags ? tags[0] : null);
    tags = this.childrenByTagNameNS(channel, nsURI, "description");
    aFeed.description = this.getNodeValue(tags ? tags[0] : null);
    tags = this.childrenByTagNameNS(channel, nsURI, "link");
    aFeed.link = this.getNodeValue(tags ? tags[0] : null);

    if (!(aFeed.title || aFeed.description) || !aFeed.link)
    {
      FeedUtils.log.error("FeedParser.parseAsRSS2: missing mandatory element " +
                          "<title> and <description>, or <link>");
      return aFeed.onParseError(aFeed);
    }

    if (!aFeed.parseItems)
      return parsedItems;

    aFeed.invalidateItems();
    // XXX use getElementsByTagNameNS for now; childrenByTagNameNS would be
    // better, but RSS .90 is still with us.
    let itemNodes = aDOM.getElementsByTagNameNS(nsURI, "item");
    itemNodes = itemNodes ? itemNodes : [];
    FeedUtils.log.debug("FeedParser.parseAsRSS2: items to parse - " +
                        itemNodes.length);

    for (let itemNode of itemNodes)
    {
      if (!itemNode.childElementCount)
        continue;
      let item = new FeedItem();
      item.feed = aFeed;
      item.enclosures = [];
      item.keywords = [];

      tags = this.childrenByTagNameNS(itemNode, FeedUtils.FEEDBURNER_NS, "origLink");
      let link = this.getNodeValue(tags ? tags[0] : null);
      if (!link)
      {
        tags = this.childrenByTagNameNS(itemNode, nsURI, "link");
        link = this.getNodeValue(tags ? tags[0] : null);
      }
      tags = this.childrenByTagNameNS(itemNode, nsURI, "guid");
      let guidNode = tags ? tags[0] : null;

      let guid;
      let isPermaLink = false;
      if (guidNode)
      {
        guid = this.getNodeValue(guidNode);
        // isPermaLink is true if the value is "true" or if the attribute is
        // not present; all other values, including "false" and "False" and
        // for that matter "TRuE" and "meatcake" are false.
        if (!guidNode.hasAttribute("isPermaLink") ||
            guidNode.getAttribute("isPermaLink") == "true")
          isPermaLink = true;
        // If attribute isPermaLink is missing, it is good to check the validity
        // of <guid> value as an URL to avoid linking to non-URL strings.
        if (!guidNode.hasAttribute("isPermaLink"))
        {
          try
          {
            Services.io.newURI(guid, null, null);
            if (Services.io.extractScheme(guid) == "tag")
              isPermaLink = false;
          }
          catch (ex)
          {
            isPermaLink = false;
          }
        }

        item.id = guid;
      }

      item.url = (guid && isPermaLink) ? guid : link ? link : null;
      tags = this.childrenByTagNameNS(itemNode, nsURI, "description");
      item.description = this.getNodeValue(tags ? tags[0] : null);
      tags = this.childrenByTagNameNS(itemNode, nsURI, "title");
      item.title = this.getNodeValue(tags ? tags[0] : null);
      if (!(item.title || item.description))
      {
        FeedUtils.log.info("FeedParser.parseAsRSS2: <item> missing mandatory " +
                           "element, either <title> or <description>; skipping");
        continue;
      }

      if (!item.id)
      {
        // At this point, if there is no guid, uniqueness cannot be guaranteed
        // by any of link or date (optional) or title (optional unless there
        // is no description). Use a big chunk of description; minimize dupes
        // with url and title if present.
        item.id = (item.url || item.feed.url) + "#" + item.title + "#" +
                  (this.stripTags(item.description ?
                                    item.description.substr(0, 150) : null) ||
                   item.title);
        item.id = item.id.replace(/[\n\r\t\s]+/g, " ");
      }

      if (!item.title)
        item.title = this.stripTags(item.description).substr(0, 150);

      tags = this.childrenByTagNameNS(itemNode, nsURI, "author");
      if (!tags)
        tags = this.childrenByTagNameNS(itemNode, FeedUtils.DC_NS, "creator");
      item.author = this.getNodeValue(tags ? tags[0] : null) ||
                    aFeed.title ||
                    item.author;

      tags = this.childrenByTagNameNS(itemNode, nsURI, "pubDate");
      if (!tags || !this.getNodeValue(tags[0]))
        tags = this.childrenByTagNameNS(itemNode, FeedUtils.DC_NS, "date");
      item.date = this.getNodeValue(tags ? tags[0] : null) || item.date;

      // If the date is invalid, users will see the beginning of the epoch
      // unless we reset it here, so they'll see the current time instead.
      // This is typical aggregator behavior.
      if (item.date)
      {
        item.date = item.date.trim();
        if (!FeedUtils.isValidRFC822Date(item.date))
        {
          // XXX Use this on the other formats as well.
          item.date = this.dateRescue(item.date);
        }
      }

      tags = this.childrenByTagNameNS(itemNode, FeedUtils.RSS_CONTENT_NS, "encoded");
      item.content = this.getNodeValue(tags ? tags[0] : null);

      // Handle <enclosures> and <media:content>, which may be in a
      // <media:group> (if present).
      tags = this.childrenByTagNameNS(itemNode, nsURI, "enclosure");
      let encUrls = [];
      if (tags)
        for (let tag of tags)
        {
          let url = (tag.getAttribute("url") || "").trim();
          if (url && encUrls.indexOf(url) == -1)
          {
            item.enclosures.push(new FeedEnclosure(url,
                                                   tag.getAttribute("type"),
                                                   tag.getAttribute("length")));
            encUrls.push(url);
          }
        }

      tags = itemNode.getElementsByTagNameNS(FeedUtils.MRSS_NS, "content");
      if (tags)
        for (let tag of tags)
        {
          let url = (tag.getAttribute("url") || "").trim();
          if (url && encUrls.indexOf(url) == -1)
            item.enclosures.push(new FeedEnclosure(url,
                                                   tag.getAttribute("type"),
                                                   tag.getAttribute("fileSize")));
        }

      // The <origEnclosureLink> tag has no specification, especially regarding
      // whether more than one tag is allowed and, if so, how tags would
      // relate to previously declared (and well specified) enclosure urls.
      // The common usage is to include 1 origEnclosureLink, in addition to
      // the specified enclosure tags for 1 enclosure. Thus, we will replace the
      // first enclosure's, if found, url with the first <origEnclosureLink>
      // url only or else add the <origEnclosureLink> url.
      tags = this.childrenByTagNameNS(itemNode, FeedUtils.FEEDBURNER_NS, "origEnclosureLink");
      let origEncUrl = this.getNodeValue(tags ? tags[0] : null);
      if (origEncUrl)
      {
        if (item.enclosures.length)
          item.enclosures[0].mURL = origEncUrl;
        else
          item.enclosures.push(new FeedEnclosure(origEncUrl));
      }

      // Support <category> and autotagging.
      tags = this.childrenByTagNameNS(itemNode, nsURI, "category");
      if (tags)
      {
        for (let tag of tags)
        {
          let term = this.getNodeValue(tag);
          term = term ? this.xmlUnescape(term.replace(",", ";")) : null;
          if (term && item.keywords.indexOf(term) == -1)
            item.keywords.push(term);
        }
      }

      parsedItems.push(item);
    }

    return parsedItems;
  },

  parseAsRSS1 : function(aFeed, aSource, aBaseURI)
  {
    let parsedItems = new Array();

    // RSS 1.0 is valid RDF, so use the RDF parser/service to extract data.
    // Create a new RDF data source and parse the feed into it.
    let ds = Cc["@mozilla.org/rdf/datasource;1?name=in-memory-datasource"].
             createInstance(Ci.nsIRDFDataSource);

    let rdfparser = Cc["@mozilla.org/rdf/xml-parser;1"].
                    createInstance(Ci.nsIRDFXMLParser);
    rdfparser.parseString(ds, aBaseURI, aSource);

    // Get information about the feed as a whole.
    let channel = ds.GetSource(FeedUtils.RDF_TYPE, FeedUtils.RSS_CHANNEL, true);
    if (!channel)
      return aFeed.onParseError(aFeed);

    if (this.isPermanentRedirect(aFeed, null, channel, ds))
      return;

    aFeed.title = aFeed.title ||
                  this.getRDFTargetValue(ds, channel, FeedUtils.RSS_TITLE) ||
                  aFeed.url;
    aFeed.description = this.getRDFTargetValue(ds, channel, FeedUtils.RSS_DESCRIPTION) ||
                        "";
    aFeed.link = this.getRDFTargetValue(ds, channel, FeedUtils.RSS_LINK) ||
                 aFeed.url;

    if (!(aFeed.title || aFeed.description) || !aFeed.link)
    {
      FeedUtils.log.error("FeedParser.parseAsRSS1: missing mandatory element " +
                          "<title> and <description>, or <link>");
      return aFeed.onParseError(aFeed);
    }

    if (!aFeed.parseItems)
      return parsedItems;

    aFeed.invalidateItems();

    // Ignore the <items> list and just get the <item>s.
    let items = ds.GetSources(FeedUtils.RDF_TYPE, FeedUtils.RSS_ITEM, true);

    let index = 0;
    while (items.hasMoreElements())
    {
      let itemResource = items.getNext().QueryInterface(Ci.nsIRDFResource);
      let item = new FeedItem();
      item.feed = aFeed;

      // Prefer the value of the link tag to the item URI since the URI could be
      // a relative URN.
      let uri = itemResource.ValueUTF8;
      let link = this.getRDFTargetValue(ds, itemResource, FeedUtils.RSS_LINK);
      item.url = link || uri;
      item.description = this.getRDFTargetValue(ds, itemResource,
                                                FeedUtils.RSS_DESCRIPTION);
      item.title = this.getRDFTargetValue(ds, itemResource, FeedUtils.RSS_TITLE) ||
                   this.getRDFTargetValue(ds, itemResource, FeedUtils.DC_SUBJECT) ||
                   (item.description ?
                     (this.stripTags(item.description).substr(0, 150)) : null);
      if (!item.url || !item.title)
      {
        FeedUtils.log.info("FeedParser.parseAsRSS1: <item> missing mandatory " +
                           "element <item rdf:about> and <link>, or <title> and " +
                           "no <description>; skipping");
        continue;
      }

      item.id = item.url;

      item.author = this.getRDFTargetValue(ds, itemResource, FeedUtils.DC_CREATOR) ||
                    this.getRDFTargetValue(ds, channel, FeedUtils.DC_CREATOR) ||
                    aFeed.title ||
                    item.author;
      item.date = this.getRDFTargetValue(ds, itemResource, FeedUtils.DC_DATE) ||
                  item.date;
      item.content = this.getRDFTargetValue(ds, itemResource,
                                            FeedUtils.RSS_CONTENT_ENCODED);

      parsedItems[index++] = item;
    }
    FeedUtils.log.debug("FeedParser.parseAsRSS1: items parsed - " + index);

    return parsedItems;
  },

  parseAsAtom: function(aFeed, aDOM)
  {
    let parsedItems = new Array();

    // Get the first channel (assuming there is only one per Atom File).
    let channel = aDOM.querySelector("feed");
    if (!channel)
      return aFeed.onParseError(aFeed);

    if (this.isPermanentRedirect(aFeed, null, channel, null))
      return;

    let tags = this.childrenByTagNameNS(channel, FeedUtils.ATOM_03_NS, "title");
    aFeed.title = aFeed.title ||
                  this.stripTags(this.getNodeValue(tags ? tags[0] : null));
    tags = this.childrenByTagNameNS(channel, FeedUtils.ATOM_03_NS, "tagline");
    aFeed.description = this.getNodeValue(tags ? tags[0] : null);
    tags = this.childrenByTagNameNS(channel, FeedUtils.ATOM_03_NS, "link");
    aFeed.link = this.findAtomLink("alternate", tags);

    if (!aFeed.title)
    {
      FeedUtils.log.error("FeedParser.parseAsAtom: missing mandatory element " +
                          "<title>");
      return aFeed.onParseError(aFeed);
    }

    if (!aFeed.parseItems)
      return parsedItems;

    aFeed.invalidateItems();
    let items = this.childrenByTagNameNS(channel, FeedUtils.ATOM_03_NS, "entry");
    items = items ? items : [];
    FeedUtils.log.debug("FeedParser.parseAsAtom: items to parse - " +
                        items.length);

    for (let itemNode of items)
    {
      if (!itemNode.childElementCount)
        continue;
      let item = new FeedItem();
      item.feed = aFeed;

      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_03_NS, "link");
      item.url = this.findAtomLink("alternate", tags);

      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_03_NS, "id");
      item.id = this.getNodeValue(tags ? tags[0] : null);
      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_03_NS, "summary");
      item.description = this.getNodeValue(tags ? tags[0] : null);
      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_03_NS, "title");
      item.title = this.getNodeValue(tags ? tags[0] : null) ||
                   (item.description ? item.description.substr(0, 150) : null);
      if (!item.title || !item.id)
      {
        // We're lenient about other mandatory tags, but insist on these.
        FeedUtils.log.info("FeedParser.parseAsAtom: <entry> missing mandatory " +
                           "element <id>, or <title> and no <summary>; skipping");
        continue;
      }

      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_03_NS, "author");
      if (!tags)
        tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_03_NS, "contributor");
      if (!tags)
        tags = this.childrenByTagNameNS(channel, FeedUtils.ATOM_03_NS, "author");

      let authorEl = tags ? tags[0] : null;

      let author = "";
      if (authorEl)
      {
        tags = this.childrenByTagNameNS(authorEl, FeedUtils.ATOM_03_NS, "name");
        let name = this.getNodeValue(tags ? tags[0] : null);
        tags = this.childrenByTagNameNS(authorEl, FeedUtils.ATOM_03_NS, "email");
        let email = this.getNodeValue(tags ? tags[0] : null);
        if (name)
          author = name + (email ? " <" + email + ">" : "");
        else if (email)
          author = email;
      }

      item.author = author || item.author || aFeed.title;

      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_03_NS, "modified");
      if (!tags || !this.getNodeValue(tags[0]))
        tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_03_NS, "issued");
      if (!tags || !this.getNodeValue(tags[0]))
        tags = this.childrenByTagNameNS(channel, FeedUtils.ATOM_03_NS, "created");

      item.date = this.getNodeValue(tags ? tags[0] : null) || item.date;

      // XXX We should get the xml:base attribute from the content tag as well
      // and use it as the base HREF of the message.
      // XXX Atom feeds can have multiple content elements; we should differentiate
      // between them and pick the best one.
      // Some Atom feeds wrap the content in a CTYPE declaration; others use
      // a namespace to identify the tags as HTML; and a few are buggy and put
      // HTML tags in without declaring their namespace so they look like Atom.
      // We deal with the first two but not the third.
      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_03_NS, "content");
      let contentNode = tags ? tags[0] : null;

      let content;
      if (contentNode)
      {
        content = "";
        for (let j = 0; j < contentNode.childNodes.length; j++)
        {
          let node = contentNode.childNodes.item(j);
          if (node.nodeType == node.CDATA_SECTION_NODE)
            content += node.data;
          else
            content += this.mSerializer.serializeToString(node);
        }
      
        if (contentNode.getAttribute("mode") == "escaped")
        {
          content = content.replace(/&lt;/g, "<");
          content = content.replace(/&gt;/g, ">");
          content = content.replace(/&amp;/g, "&");
        }

        if (content == "")
          content = null;
      }

      item.content = content;
      parsedItems.push(item);
    }

    return parsedItems;
  },

  parseAsAtomIETF: function(aFeed, aDOM)
  {
    let parsedItems = new Array();

    // Get the first channel (assuming there is only one per Atom File).
    let channel = this.childrenByTagNameNS(aDOM, FeedUtils.ATOM_IETF_NS, "feed")[0];
    if (!channel)
      return aFeed.onParseError(aFeed);

    if (this.isPermanentRedirect(aFeed, null, channel, null))
      return;

    let tags = this.childrenByTagNameNS(channel, FeedUtils.ATOM_IETF_NS, "title");
    aFeed.title = aFeed.title ||
                  this.stripTags(this.serializeTextConstruct(tags ? tags[0] : null));

    tags = this.childrenByTagNameNS(channel, FeedUtils.ATOM_IETF_NS, "subtitle");
    aFeed.description = this.serializeTextConstruct(tags ? tags[0] : null);

    tags = this.childrenByTagNameNS(channel, FeedUtils.ATOM_IETF_NS, "link");
    aFeed.link = this.findAtomLink("alternate", tags);

    if (!aFeed.title)
    {
      FeedUtils.log.error("FeedParser.parseAsAtomIETF: missing mandatory element " +
                          "<title>");
      return aFeed.onParseError(aFeed);
    }

    if (!aFeed.parseItems)
      return parsedItems;

    aFeed.invalidateItems();
    let items = this.childrenByTagNameNS(channel, FeedUtils.ATOM_IETF_NS, "entry");
    items = items ? items : [];
    FeedUtils.log.debug("FeedParser.parseAsAtomIETF: items to parse - " +
                        items.length);

    for (let itemNode of items)
    {
      if (!itemNode.childElementCount)
        continue;
      let item = new FeedItem();
      item.feed = aFeed;
      item.enclosures = [];
      item.keywords = [];

      tags = this.childrenByTagNameNS(itemNode, FeedUtils.FEEDBURNER_NS, "origLink");
      item.url = this.getNodeValue(tags ? tags[0] : null);
      if (!item.url)
      {
        tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_IETF_NS, "link");
        item.url = this.findAtomLink("alternate", tags) || aFeed.link;
      }
      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_IETF_NS, "id");
      item.id = this.getNodeValue(tags ? tags[0] : null);
      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_IETF_NS, "summary");
      item.description = this.serializeTextConstruct(tags ? tags[0] : null);
      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_IETF_NS, "title");
      item.title = this.stripTags(this.serializeTextConstruct(tags ? tags[0] : null) ||
                                  (item.description ?
                                     item.description.substr(0, 150) : null));
      if (!item.title || !item.id)
      {
        // We're lenient about other mandatory tags, but insist on these.
        FeedUtils.log.info("FeedParser.parseAsAtomIETF: <entry> missing mandatory " +
                           "element <id>, or <title> and no <summary>; skipping");
        continue;
      }

      // XXX Support multiple authors.
      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_IETF_NS, "source");
      let source = tags ? tags[0] : null;

      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_IETF_NS, "author");
      if (!tags)
        tags = this.childrenByTagNameNS(source, FeedUtils.ATOM_IETF_NS, "author");
      if (!tags)
        tags = this.childrenByTagNameNS(channel, FeedUtils.ATOM_IETF_NS, "author");

      let authorEl = tags ? tags[0] : null;

      let author = "";
      if (authorEl)
      {
        tags = this.childrenByTagNameNS(authorEl, FeedUtils.ATOM_IETF_NS, "name");
        let name = this.getNodeValue(tags ? tags[0] : null);
        tags = this.childrenByTagNameNS(authorEl, FeedUtils.ATOM_IETF_NS, "email");
        let email = this.getNodeValue(tags ? tags[0] : null);
        if (name)
          author = name + (email ? " <" + email + ">" : "");
        else if (email)
          author = email;
      }

      item.author = author || item.author || aFeed.title;

      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_IETF_NS, "updated");
      if (!tags || !this.getNodeValue(tags[0]))
        tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_IETF_NS, "published");
      if (!tags || !this.getNodeValue(tags[0]))
        tags = this.childrenByTagNameNS(source, FeedUtils.ATOM_IETF_NS, "published");
      item.date = this.getNodeValue(tags ? tags[0] : null) || item.date;

      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_IETF_NS, "content");
      item.content = this.serializeTextConstruct(tags ? tags[0] : null);

      if (item.content)
        item.xmlContentBase = tags ? tags[0].baseURI : null;
      else if (item.description)
      {
        tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_IETF_NS, "summary");
        item.xmlContentBase = tags ? tags[0].baseURI : null;
      }
      else
        item.xmlContentBase = itemNode.baseURI;

      // Handle <link rel="enclosure"> (if present).
      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_IETF_NS, "link");
      let encUrls = [];
      if (tags)
        for (let tag of tags)
        {
          let url = tag.getAttribute("rel") == "enclosure" ?
                      (tag.getAttribute("href") || "").trim() : null;
          if (url && encUrls.indexOf(url) == -1)
          {
            item.enclosures.push(new FeedEnclosure(url,
                                                   tag.getAttribute("type"),
                                                   tag.getAttribute("length"),
                                                   tag.getAttribute("title")));
            encUrls.push(url);
          }
        }

      tags = this.childrenByTagNameNS(itemNode, FeedUtils.FEEDBURNER_NS, "origEnclosureLink");
      let origEncUrl = this.getNodeValue(tags ? tags[0] : null);
      if (origEncUrl)
      {
        if (item.enclosures.length)
          item.enclosures[0].mURL = origEncUrl;
        else
          item.enclosures.push(new FeedEnclosure(origEncUrl));
      }

      // Handle atom threading extension, RFC4685.  There may be 1 or more tags,
      // and each must contain a ref attribute with 1 Message-Id equivalent
      // value.  This is the only attr of interest in the spec for presentation.
      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_THREAD_NS, "in-reply-to");
      if (tags)
      {
        for (let tag of tags)
        {
          let ref = tag.getAttribute("ref");
          if (ref)
            item.inReplyTo += item.normalizeMessageID(ref) + " ";
        }
        item.inReplyTo = item.inReplyTo.trimRight();
      }

      // Support <category> and autotagging.
      tags = this.childrenByTagNameNS(itemNode, FeedUtils.ATOM_IETF_NS, "category");
      if (tags)
      {
        for (let tag of tags)
        {
          let term = tag.getAttribute("term");
          term = term ? this.xmlUnescape(term.replace(",", ";")).trim() : null;
          if (term && item.keywords.indexOf(term) == -1)
            item.keywords.push(term);
        }
      }

      parsedItems.push(item);
    }

    return parsedItems;
  },

  isPermanentRedirect: function(aFeed, aRedirDocChannel, aFeedChannel, aDS)
  {
    // If subscribing to a new feed, do not check redirect tags.
    if (!aFeed.downloadCallback || aFeed.downloadCallback.mSubscribeMode)
      return false;

    let tags, tagName, newUrl;
    let oldUrl = aFeed.url;

    // Check for RSS2.0 redirect document <newLocation> tag.
    if (aRedirDocChannel)
    {
      tagName = "newLocation";
      tags = this.childrenByTagNameNS(aRedirDocChannel, "", tagName);
      newUrl = this.getNodeValue(tags ? tags[0] : null);
    }

    // Check for <itunes:new-feed-url> tag.
    if (aFeedChannel)
    {
      tagName = "new-feed-url";
      if (aDS)
      {
        tags = FeedUtils.rdf.GetResource(FeedUtils.ITUNES_NS + tagName);
        newUrl = this.getRDFTargetValue(aDS, aFeedChannel, tags);
      }
      else
      {
        tags = this.childrenByTagNameNS(aFeedChannel, FeedUtils.ITUNES_NS, tagName);
        newUrl = this.getNodeValue(tags ? tags[0] : null);
      }
      tagName = "itunes:" + tagName;
    }

    if (newUrl && newUrl != oldUrl && FeedUtils.isValidScheme(newUrl) &&
        FeedUtils.changeUrlForFeed(aFeed, newUrl))
    {
      FeedUtils.log.info("FeedParser.isPermanentRedirect: found <" + tagName +
                         "> tag; updated feed url from: " + oldUrl + " to: " + newUrl +
                         " in folder: " + FeedUtils.getFolderPrettyPath(aFeed.folder));
      aFeed.onUrlChange(aFeed, oldUrl);
      return true;
    }

    return false;
  },

  serializeTextConstruct: function(textElement)
  {
    let content = "";
    if (textElement)
    {
      let textType = textElement.getAttribute("type");

      // Atom spec says consider it "text" if not present.
      if (!textType)
        textType = "text";

      // There could be some strange content type we don't handle.
      if (textType != "text" && textType != "html" && textType != "xhtml")
        return null;

      for (let j = 0; j < textElement.childNodes.length; j++)
      {
        let node = textElement.childNodes.item(j);
        if (node.nodeType == node.CDATA_SECTION_NODE)
          content += this.xmlEscape(node.data);
        else
          content += this.mSerializer.serializeToString(node);
      }

      if (textType == "html")
        content = this.xmlUnescape(content);

      content = content.trim();
    }

    // Other parts of the code depend on this being null if there's no content.
    return content ? content : null;
  },

  getRDFTargetValue: function(ds, source, property)
  {
    let node = ds.GetTarget(source, property, true);
    if (node)
    {
      try
      {
        node = node.QueryInterface(Ci.nsIRDFLiteral);
        if (node)
          return node.Value.trim();
      }
      catch (e)
      {
        // If the RDF was bogus, do nothing.  Rethrow if it's some other problem.
        if (!((e instanceof Ci.nsIXPCException) &&
              e.result == Cr.NS_ERROR_NO_INTERFACE))
          throw new Error("FeedParser.getRDFTargetValue: " + e);
      }
    }

    return null;
  },

  getNodeValue: function(node)
  {
    if (node && node.textContent)
      return node.textContent.trim();
    else if (node && node.firstChild)
    {
      let ret = "";
      for (let child = node.firstChild; child; child = child.nextSibling)
      {
        let value = this.getNodeValue(child);
        if (value)
          ret += value;
      }

      if (ret)
        return ret.trim();
    }

    return null;
  },

  // Finds elements that are direct children of the first arg.
  childrenByTagNameNS: function(aElement, aNamespace, aTagName)
  {
    if (!aElement)
      return null;
    let matches = aElement.getElementsByTagNameNS(aNamespace, aTagName);
    let matchingChildren = new Array();
    for (let match of matches)
    {
      if (match.parentNode == aElement)
        matchingChildren.push(match)
    }

    return matchingChildren.length ? matchingChildren : null;
  },

  findAtomLink: function(linkRel, linkElements)
  {
    if (!linkElements)
      return null;

    // XXX Need to check for MIME type and hreflang.
    for (let alink of linkElements) {
      if (alink &&
          // If there's a link rel.
          ((alink.getAttribute("rel") && alink.getAttribute("rel") == linkRel) ||
           // If there isn't, assume 'alternate'.
           (!alink.getAttribute("rel") && (linkRel == "alternate"))) &&
          alink.getAttribute("href"))
      {
        // Atom links are interpreted relative to xml:base.
        try {
          return Services.io.newURI(alink.baseURI, null, null).
                             resolve(alink.getAttribute("href"));
        }
        catch (ex) {}
      }
    }

    return null;
  },

  stripTags: function(someHTML)
  {
    return someHTML ? someHTML.replace(/<[^>]+>/g, "") : someHTML;
  },

  xmlUnescape: function(s)
  {
    s = s.replace(/&lt;/g, "<");
    s = s.replace(/&gt;/g, ">");
    s = s.replace(/&amp;/g, "&");
    return s;
  },

  xmlEscape: function(s)
  {
    s = s.replace(/&/g, "&amp;");
    s = s.replace(/>/g, "&gt;");
    s = s.replace(/</g, "&lt;");
    return s;
  },

  dateRescue: function(dateString)
  {
    // Deal with various kinds of invalid dates.
    if (!isNaN(parseInt(dateString)))
    {
      // It's an integer, so maybe it's a timestamp.
      let d = new Date(parseInt(dateString) * 1000);
      let now = new Date();
      let yeardiff = now.getFullYear() - d.getFullYear();
      FeedUtils.log.trace("FeedParser.dateRescue: Rescue Timestamp date - " +
                          d.toString() + " ,year diff - " + yeardiff);
      if (yeardiff >= 0 && yeardiff < 3)
        // It's quite likely the correct date.
        return d.toString();
    }

    // Could be an ISO8601/W3C date.  If not, get the current time.
    return FeedUtils.getValidRFC5322Date(dateString);
  }
};
