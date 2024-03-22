/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

import { GlodaUtils } from "resource:///modules/gloda/GlodaUtils.sys.mjs";
import { Gloda } from "resource:///modules/gloda/Gloda.sys.mjs";
import { GlodaAttachment } from "resource:///modules/gloda/GlodaDataModel.sys.mjs";
import { GlodaConstants } from "resource:///modules/gloda/GlodaConstants.sys.mjs";
import { MimeTypeNoun } from "resource:///modules/gloda/NounMimetype.sys.mjs";
import { GlodaContent } from "resource:///modules/gloda/GlodaContent.sys.mjs";

/**
 * @namespace The Gloda Fundamental Attribute provider is a special attribute
 *  provider; it provides attributes that the rest of the providers should be
 *  able to assume exist.  Also, it may end up accessing things at a lower level
 *  than most extension providers should do.  In summary, don't mimic this code
 *  unless you won't complain when your code breaks.
 */
export var GlodaFundAttr = {
  providerName: "gloda.fundattr",
  strings: Services.strings.createBundle(
    "chrome://messenger/locale/gloda.properties"
  ),
  _log: null,

  init() {
    this._log = console.createInstance({
      prefix: "gloda.fundattr",
      maxLogLevel: "Warn",
      maxLogLevelPref: "gloda.loglevel",
    });

    try {
      this.defineAttributes();
    } catch (ex) {
      this._log.error("Error in init: " + ex);
      throw ex;
    }
  },

  POPULARITY_FROM_ME_TO: 10,
  POPULARITY_FROM_ME_CC: 4,
  POPULARITY_FROM_ME_BCC: 3,
  POPULARITY_TO_ME: 5,
  POPULARITY_CC_ME: 1,
  POPULARITY_BCC_ME: 1,

  /** Boost for messages 'I' sent */
  NOTABILITY_FROM_ME: 10,
  /** Boost for messages involving 'me'. */
  NOTABILITY_INVOLVING_ME: 1,
  /** Boost for message from someone in 'my' address book. */
  NOTABILITY_FROM_IN_ADDR_BOOK: 10,
  /** Boost for the first person involved in my address book. */
  NOTABILITY_INVOLVING_ADDR_BOOK_FIRST: 8,
  /** Boost for each additional person involved in my address book. */
  NOTABILITY_INVOLVING_ADDR_BOOK_ADDL: 2,

  defineAttributes() {
    /* ***** Conversations ***** */
    // conversation: subjectMatches
    this._attrConvSubject = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrDerived,
      attributeName: "subjectMatches",
      singular: true,
      special: GlodaConstants.kSpecialFulltext,
      specialColumnName: "subject",
      subjectNouns: [GlodaConstants.NOUN_CONVERSATION],
      objectNoun: GlodaConstants.NOUN_FULLTEXT,
    });

    /* ***** Messages ***** */
    // folder
    this._attrFolder = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "folder",
      singular: true,
      facet: true,
      special: GlodaConstants.kSpecialColumn,
      specialColumnName: "folderID",
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_FOLDER,
    }); // tested-by: test_attributes_fundamental
    this._attrAccount = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrDerived,
      attributeName: "account",
      canQuery: "memory",
      singular: true,
      facet: true,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_ACCOUNT,
    });
    this._attrMessageKey = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "messageKey",
      singular: true,
      special: GlodaConstants.kSpecialColumn,
      specialColumnName: "messageKey",
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_NUMBER,
      canQuery: true,
    }); // tested-by: test_attributes_fundamental

    // We need to surface the deleted attribute for querying, but there is no
    //  reason for user code, so let's call it "_deleted" rather than deleted.
    // (In fact, our validity constraints require a special query formulation
    //  that user code should have no clue exists.  That's right user code,
    //  that's a dare.)
    Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "_deleted",
      singular: true,
      special: GlodaConstants.kSpecialColumn,
      specialColumnName: "deleted",
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_NUMBER,
    });

    // -- fulltext search helpers
    // fulltextMatches.  Match over message subject, body, and attachments
    // @testpoint gloda.noun.message.attr.fulltextMatches
    this._attrFulltext = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrDerived,
      attributeName: "fulltextMatches",
      singular: true,
      special: GlodaConstants.kSpecialFulltext,
      specialColumnName: "messagesText",
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_FULLTEXT,
    });

    // subjectMatches.  Fulltext match on subject
    // @testpoint gloda.noun.message.attr.subjectMatches
    this._attrSubjectText = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrDerived,
      attributeName: "subjectMatches",
      singular: true,
      special: GlodaConstants.kSpecialFulltext,
      specialColumnName: "subject",
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_FULLTEXT,
    });

    // bodyMatches. super-synthetic full-text matching...
    // @testpoint gloda.noun.message.attr.bodyMatches
    this._attrBody = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrDerived,
      attributeName: "bodyMatches",
      singular: true,
      special: GlodaConstants.kSpecialFulltext,
      specialColumnName: "body",
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_FULLTEXT,
    });

    // attachmentNamesMatch
    // @testpoint gloda.noun.message.attr.attachmentNamesMatch
    this._attrAttachmentNames = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrDerived,
      attributeName: "attachmentNamesMatch",
      singular: true,
      special: GlodaConstants.kSpecialFulltext,
      specialColumnName: "attachmentNames",
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_FULLTEXT,
    });

    // @testpoint gloda.noun.message.attr.authorMatches
    this._attrAuthorFulltext = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrDerived,
      attributeName: "authorMatches",
      singular: true,
      special: GlodaConstants.kSpecialFulltext,
      specialColumnName: "author",
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_FULLTEXT,
    });

    // @testpoint gloda.noun.message.attr.recipientsMatch
    this._attrRecipientsFulltext = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrDerived,
      attributeName: "recipientsMatch",
      singular: true,
      special: GlodaConstants.kSpecialFulltext,
      specialColumnName: "recipients",
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_FULLTEXT,
    });

    // --- synthetic stuff for some reason
    // conversation
    // @testpoint gloda.noun.message.attr.conversation
    this._attrConversation = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "conversation",
      singular: true,
      special: GlodaConstants.kSpecialColumnParent,
      specialColumnName: "conversationID",
      idStorageAttributeName: "_conversationID",
      valueStorageAttributeName: "_conversation",
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_CONVERSATION,
      canQuery: true,
    });

    // --- Fundamental
    // From
    this._attrFrom = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "from",
      singular: true,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_IDENTITY,
    }); // tested-by: test_attributes_fundamental
    // To
    this._attrTo = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "to",
      singular: false,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_IDENTITY,
    }); // tested-by: test_attributes_fundamental
    // Cc
    this._attrCc = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "cc",
      singular: false,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_IDENTITY,
    }); // not-tested
    /**
     * Bcc'ed recipients; only makes sense for sent messages.
     */
    this._attrBcc = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "bcc",
      singular: false,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_IDENTITY,
    }); // not-tested

    // Date.  now lives on the row.
    this._attrDate = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "date",
      singular: true,
      facet: {
        type: "date",
      },
      special: GlodaConstants.kSpecialColumn,
      specialColumnName: "date",
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_DATE,
    }); // tested-by: test_attributes_fundamental

    // Header message ID.
    this._attrHeaderMessageID = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "headerMessageID",
      singular: true,
      special: GlodaConstants.kSpecialString,
      specialColumnName: "headerMessageID",
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_STRING,
      canQuery: true,
    }); // tested-by: test_attributes_fundamental

    // Attachment MIME Types
    this._attrAttachmentTypes = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "attachmentTypes",
      singular: false,
      emptySetIsSignificant: true,
      facet: {
        type: "default",
        // This will group the MIME types by their category.
        groupIdAttr: "category",
        queryHelper: "Category",
      },
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_MIME_TYPE,
    });

    // Attachment infos
    this._attrIsEncrypted = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "isEncrypted",
      singular: true,
      emptySetIsSignificant: false,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_NUMBER,
    });

    // Attachment infos
    this._attrAttachmentInfos = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "attachmentInfos",
      singular: false,
      emptySetIsSignificant: false,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_ATTACHMENT,
    });

    // --- Optimization
    /**
     * Involves means any of from/to/cc/bcc.  The queries get ugly enough
     *  without this that it seems to justify the cost, especially given the
     *  frequent use case.  (In fact, post-filtering for the specific from/to/cc
     *  is probably justifiable rather than losing this attribute...)
     */
    this._attrInvolves = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrOptimization,
      attributeName: "involves",
      singular: false,
      facet: {
        type: "default",
        /**
         * Filter out 'me', as we have other facets that deal with that, and the
         *  'me' identities are so likely that they distort things.
         *
         * @returns true if the identity is not one of my identities, false if it
         *   is.
         */
        filter(aItem) {
          return !(aItem.id in Gloda.myIdentities);
        },
      },
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_IDENTITY,
    }); // not-tested

    /**
     * Any of to/cc/bcc.
     */
    this._attrRecipients = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrOptimization,
      attributeName: "recipients",
      singular: false,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_IDENTITY,
    }); // not-tested

    // From Me (To/Cc/Bcc)
    this._attrFromMe = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrOptimization,
      attributeName: "fromMe",
      singular: false,
      // The interesting thing to a facet is whether the message is from me.
      facet: {
        type: "nonempty?",
      },
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_PARAM_IDENTITY,
    }); // not-tested
    // To/Cc/Bcc Me
    this._attrToMe = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "toMe",
      // The interesting thing to a facet is whether the message is to me.
      facet: {
        type: "nonempty?",
      },
      singular: false,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_PARAM_IDENTITY,
    }); // not-tested

    // -- Mailing List
    // Non-singular, but a hard call.  Namely, it is obvious that a message can
    //  be addressed to multiple mailing lists.  However, I don't see how you
    //  could receive a message with more than one set of List-* headers,
    //  since each list-serve would each send you a copy.  Based on our current
    //  decision to treat each physical message as separate, it almost seems
    //  right to limit the list attribute to the copy that originated at the
    //  list.  That may sound entirely wrong, but keep in mind that until we
    //  have seen a message from the list with the List headers, we can't
    //  definitely know it's a mailing list (although heuristics could take us
    //  pretty far).  As such, the quasi-singular thing is appealing.
    // Of course, the reality is that we really want to know if a message was
    //  sent to multiple mailing lists and be able to query on that.
    //  Additionally, our implicit-to logic needs to work on messages that
    //  weren't relayed by the list-serve, especially messages sent to the list
    //  by the user.
    this._attrList = Gloda.defineAttribute({
      provider: this,
      extensionName: GlodaConstants.BUILT_IN,
      attributeType: GlodaConstants.kAttrFundamental,
      attributeName: "mailing-list",
      bindName: "mailingLists",
      singular: false,
      emptySetIsSignificant: true,
      facet: true,
      subjectNouns: [GlodaConstants.NOUN_MESSAGE],
      objectNoun: GlodaConstants.NOUN_IDENTITY,
    }); // not-tested, not-implemented
  },

  RE_LIST_POST: /<mailto:([^>]+)>/,

  /**
   *
   * Specializations:
   * - Mailing Lists.  Replies to a message on a mailing list frequently only
   *   have the list-serve as the 'to', so we try to generate a synthetic 'to'
   *   based on the author of the parent message when possible.  (The 'possible'
   *   part is that we may not have a copy of the parent message at the time of
   *   processing.)
   * - Newsgroups.  Same deal as mailing lists.
   */
  *process(aGlodaMessage, aRawReps, aIsNew, aCallbackHandle) {
    const aMsgHdr = aRawReps.header;
    const aMimeMsg = aRawReps.mime;

    // -- From
    // Let's use replyTo if available.
    // er, since we are just dealing with mailing lists for now, forget the
    //  reply-to...
    // TODO: deal with default charset issues
    let author = null;
    /*
    try {
      author = aMsgHdr.getStringProperty("replyTo");
    }
    catch (ex) {
    }
    */
    if (author == null || author == "") {
      author = aMsgHdr.author;
    }

    let normalizedListPost = "";
    if (aMimeMsg && aMimeMsg.has("list-post")) {
      const match = this.RE_LIST_POST.exec(aMimeMsg.get("list-post"));
      if (match) {
        normalizedListPost = "<" + match[1] + ">";
      }
    }

    // Do not use the MIME decoded variants of any of the email addresses
    //  because if name is encoded and has a comma in it, it will break the
    //  address parser (which already knows how to do the decoding anyways).
    const [
      authorIdentities,
      toIdentities,
      ccIdentities,
      bccIdentities,
      listIdentities,
    ] = yield aCallbackHandle.pushAndGo(
      Gloda.getOrCreateMailIdentities(
        aCallbackHandle,
        author,
        aMsgHdr.recipients,
        aMsgHdr.ccList,
        aMsgHdr.bccList,
        normalizedListPost
      )
    );

    if (authorIdentities.length != 1) {
      throw new Gloda.BadItemContentsError(
        "Message with subject '" +
          aMsgHdr.mime2DecodedSubject +
          "' somehow lacks a valid author.  Bailing."
      );
    }
    const authorIdentity = authorIdentities[0];
    aGlodaMessage.from = authorIdentity;

    // -- To, Cc, Bcc
    aGlodaMessage.to = toIdentities;
    aGlodaMessage.cc = ccIdentities;
    aGlodaMessage.bcc = bccIdentities;

    // -- Mailing List
    if (listIdentities.length) {
      aGlodaMessage.mailingLists = listIdentities;
    }

    const findIsEncrypted = x =>
      x.isEncrypted || (x.parts ? x.parts.some(findIsEncrypted) : false);

    // -- Encryption
    aGlodaMessage.isEncrypted = false;
    if (aMimeMsg) {
      aGlodaMessage.isEncrypted = findIsEncrypted(aMimeMsg);
    }

    // -- Attachments
    if (aMimeMsg) {
      // nsParseMailbox.cpp puts the attachment flag on msgHdrs as soon as it
      // finds a multipart/mixed part. This is a good heuristic, but if it turns
      // out the part has no filename, then we don't treat it as an attachment.
      // We just streamed the message, and we have all the information to figure
      // that out, so now is a good place to clear the flag if needed.
      const attachmentTypes = new Set();
      for (const attachment of aMimeMsg.allAttachments) {
        // getMimeType expects the content type to contain at least a "/".
        if (!attachment.contentType.includes("/")) {
          continue;
        }
        attachmentTypes.add(MimeTypeNoun.getMimeType(attachment.contentType));
      }
      if (attachmentTypes.size) {
        aGlodaMessage.attachmentTypes = Array.from(attachmentTypes);
      }

      const aMsgHdr = aRawReps.header;
      const wasStreamed =
        aMsgHdr &&
        !aGlodaMessage.isEncrypted &&
        (aMsgHdr.flags & Ci.nsMsgMessageFlags.Offline ||
          aMsgHdr.folder instanceof Ci.nsIMsgLocalMailFolder);

      // Clear the flag if it turns out there's no attachment after all and we
      // streamed completely the message (if we didn't, then we have no
      // knowledge of attachments, unless bug 673370 is fixed).
      if (wasStreamed && !aMimeMsg.allAttachments.length) {
        aMsgHdr.markHasAttachments(false);
      }

      // This is not the same kind of attachments as above. Now, we want to
      // provide convenience attributes to Gloda consumers, so that they can run
      // through the list of attachments of a given message, to possibly build a
      // visualization on top of it. We still reject bogus mime types, which
      // means yencode won't be supported. Oh, I feel really bad.
      const attachmentInfos = [];
      for (const att of aMimeMsg.allUserAttachments) {
        attachmentInfos.push(
          this.glodaAttFromMimeAtt(aRawReps.trueGlodaRep, att)
        );
      }
      aGlodaMessage.attachmentInfos = attachmentInfos;
    }

    // TODO: deal with mailing lists, including implicit-to.  this will require
    //  convincing the indexer to pass us in the previous message if it is
    //  available.  (which we'll simply pass to everyone... it can help body
    //  logic for quoting purposes, etc. too.)

    yield GlodaConstants.kWorkDone;
  },

  glodaAttFromMimeAtt(aGlodaMessage, aAtt) {
    // So we don't want to store the URL because it can change over time if
    // the message is moved. What we do is store the full URL if it's a
    // detached attachment, otherwise just keep the part information, and
    // rebuild the URL according to where the message is sitting.
    let part, externalUrl;
    if (aAtt.isExternal) {
      externalUrl = aAtt.url;
    } else {
      const matches = aAtt.url.match(GlodaUtils.PART_RE);
      if (matches && matches.length) {
        part = matches[1];
      } else {
        this._log.error("Error processing attachment: " + aAtt.url);
      }
    }
    return new GlodaAttachment(
      aGlodaMessage,
      aAtt.name,
      aAtt.contentType,
      aAtt.size,
      part,
      externalUrl,
      aAtt.isExternal
    );
  },

  *optimize(aGlodaMessage, aRawReps, aIsNew) {
    const aMsgHdr = aRawReps.header;

    // for simplicity this is used for both involves and recipients
    const involvesIdentities = {};
    const involves = aGlodaMessage.involves || [];
    const recipients = aGlodaMessage.recipients || [];

    // 'me' specialization optimizations
    const toMe = aGlodaMessage.toMe || [];
    const fromMe = aGlodaMessage.fromMe || [];

    const myIdentities = Gloda.myIdentities; // needless optimization?
    const authorIdentity = aGlodaMessage.from;
    const isFromMe = authorIdentity.id in myIdentities;

    // The fulltext search column for the author.  We want to have in here:
    // - The e-mail address and display name as enclosed on the message.
    // - The name per the address book card for this e-mail address, if we have
    //   one.
    aGlodaMessage._indexAuthor = aMsgHdr.mime2DecodedAuthor;
    // The fulltext search column for the recipients. (same deal)
    aGlodaMessage._indexRecipients = aMsgHdr.mime2DecodedRecipients;

    if (isFromMe) {
      aGlodaMessage.notability += this.NOTABILITY_FROM_ME;
    } else {
      const authorDisplayName = MailServices.ab.cardForEmailAddress(
        authorIdentity.value
      )?.displayName;
      if (authorDisplayName !== null) {
        aGlodaMessage.notability += this.NOTABILITY_FROM_IN_ADDR_BOOK;
        // @testpoint gloda.noun.message.attr.authorMatches
        aGlodaMessage._indexAuthor += " " + authorDisplayName;
      }
    }

    involves.push(authorIdentity);
    involvesIdentities[authorIdentity.id] = true;

    let involvedAddrBookCount = 0;

    for (const toIdentity of aGlodaMessage.to) {
      if (!(toIdentity.id in involvesIdentities)) {
        involves.push(toIdentity);
        recipients.push(toIdentity);
        involvesIdentities[toIdentity.id] = true;
        const toDisplayName = MailServices.ab.cardForEmailAddress(
          toIdentity.value
        )?.displayName;
        if (toDisplayName !== null) {
          involvedAddrBookCount++;
          // @testpoint gloda.noun.message.attr.recipientsMatch
          aGlodaMessage._indexRecipients += " " + toDisplayName;
        }
      }

      // optimization attribute to-me ('I' am the parameter)
      if (toIdentity.id in myIdentities) {
        toMe.push([toIdentity, authorIdentity]);
        if (aIsNew) {
          authorIdentity.contact.popularity += this.POPULARITY_TO_ME;
        }
      }
      // optimization attribute from-me-to ('I' am the parameter)
      if (isFromMe) {
        fromMe.push([authorIdentity, toIdentity]);
        // also, popularity
        if (aIsNew) {
          toIdentity.contact.popularity += this.POPULARITY_FROM_ME_TO;
        }
      }
    }
    for (const ccIdentity of aGlodaMessage.cc) {
      if (!(ccIdentity.id in involvesIdentities)) {
        involves.push(ccIdentity);
        recipients.push(ccIdentity);
        involvesIdentities[ccIdentity.id] = true;
        const ccDisplayName = MailServices.ab.cardForEmailAddress(
          ccIdentity.value
        )?.displayName;
        if (ccDisplayName !== null) {
          involvedAddrBookCount++;
          // @testpoint gloda.noun.message.attr.recipientsMatch
          aGlodaMessage._indexRecipients += " " + ccDisplayName;
        }
      }
      // optimization attribute cc-me ('I' am the parameter)
      if (ccIdentity.id in myIdentities) {
        toMe.push([ccIdentity, authorIdentity]);
        if (aIsNew) {
          authorIdentity.contact.popularity += this.POPULARITY_CC_ME;
        }
      }
      // optimization attribute from-me-to ('I' am the parameter)
      if (isFromMe) {
        fromMe.push([authorIdentity, ccIdentity]);
        // also, popularity
        if (aIsNew) {
          ccIdentity.contact.popularity += this.POPULARITY_FROM_ME_CC;
        }
      }
    }
    // just treat bcc like cc; the intent is the same although the exact
    //  semantics differ.
    for (const bccIdentity of aGlodaMessage.bcc) {
      if (!(bccIdentity.id in involvesIdentities)) {
        involves.push(bccIdentity);
        recipients.push(bccIdentity);
        involvesIdentities[bccIdentity.id] = true;
        const bccDisplayName = MailServices.ab.cardForEmailAddress(
          bccIdentity.value
        )?.displayName;
        if (bccDisplayName !== null) {
          involvedAddrBookCount++;
          // @testpoint gloda.noun.message.attr.recipientsMatch
          aGlodaMessage._indexRecipients += " " + bccDisplayName;
        }
      }
      // optimization attribute cc-me ('I' am the parameter)
      if (bccIdentity.id in myIdentities) {
        toMe.push([bccIdentity, authorIdentity]);
        if (aIsNew) {
          authorIdentity.contact.popularity += this.POPULARITY_BCC_ME;
        }
      }
      // optimization attribute from-me-to ('I' am the parameter)
      if (isFromMe) {
        fromMe.push([authorIdentity, bccIdentity]);
        // also, popularity
        if (aIsNew) {
          bccIdentity.contact.popularity += this.POPULARITY_FROM_ME_BCC;
        }
      }
    }

    if (involvedAddrBookCount) {
      aGlodaMessage.notability +=
        this.NOTABILITY_INVOLVING_ADDR_BOOK_FIRST +
        (involvedAddrBookCount - 1) * this.NOTABILITY_INVOLVING_ADDR_BOOK_ADDL;
    }

    aGlodaMessage.involves = involves;
    aGlodaMessage.recipients = recipients;
    if (toMe.length) {
      aGlodaMessage.toMe = toMe;
      aGlodaMessage.notability += this.NOTABILITY_INVOLVING_ME;
    }
    if (fromMe.length) {
      aGlodaMessage.fromMe = fromMe;
    }

    // Content
    if (aRawReps.bodyLines) {
      aGlodaMessage._content = aRawReps.content = new GlodaContent();
      if (this.contentWhittle({}, aRawReps.bodyLines, aGlodaMessage._content)) {
        // we were going to do something here?
      }
    } else {
      aRawReps.content = null;
    }

    yield GlodaConstants.kWorkDone;
  },

  /**
   * Duplicates the notability logic from optimize().  Arguably optimize should
   *  be factored to call us, grokNounItem should be factored to call us, or we
   *  should get sufficiently fancy that our code wildly diverges.
   */
  score(aMessage) {
    let score = 0;

    const authorIdentity = aMessage.from;
    if (authorIdentity.id in Gloda.myIdentities) {
      score += this.NOTABILITY_FROM_ME;
    } else if (authorIdentity.inAddressBook) {
      score += this.NOTABILITY_FROM_IN_ADDR_BOOK;
    }
    if (aMessage.toMe) {
      score += this.NOTABILITY_INVOLVING_ME;
    }

    let involvedAddrBookCount = 0;
    for (const identity of aMessage.to) {
      if (identity.inAddressBook) {
        involvedAddrBookCount++;
      }
    }
    for (const identity of aMessage.cc) {
      if (identity.inAddressBook) {
        involvedAddrBookCount++;
      }
    }
    if (involvedAddrBookCount) {
      score +=
        this.NOTABILITY_INVOLVING_ADDR_BOOK_FIRST +
        (involvedAddrBookCount - 1) * this.NOTABILITY_INVOLVING_ADDR_BOOK_ADDL;
    }
    return score;
  },

  _countQuoteDepthAndNormalize(aLine) {
    let count = 0;
    let lastStartOffset = 0;

    for (let i = 0; i < aLine.length; i++) {
      const c = aLine[i];
      if (c == ">") {
        count++;
        lastStartOffset = i + 1;
      } else if (c != " ") {
        return [
          count,
          lastStartOffset ? aLine.substring(lastStartOffset) : aLine,
        ];
      }
    }

    return [count, lastStartOffset ? aLine.substring(lastStartOffset) : aLine];
  },

  /**
   * Attempt to understand simple quoting constructs that use ">" with
   * obvious phrases to enter the quoting block.  No support for other types
   * of quoting at this time.  Also no support for piercing the wrapper of
   * forwarded messages to actually be the content of the forwarded message.
   */
  contentWhittle(aMeta, aBodyLines, aContent) {
    if (!aContent.volunteerContent(aContent.kPriorityBase)) {
      return false;
    }

    // duplicate the list; we mutate somewhat...
    const bodyLines = aBodyLines.concat();

    // lastNonBlankLine originally was just for detecting quoting idioms where
    //  the "wrote" line was separated from the quoted block by a blank line.
    // Now we also use it for whitespace suppression at the boundaries of
    //  quoted and un-quoted text.  (We keep blank lines within the same
    //  'block' of quoted or non-quoted text.)
    // Because we now have two goals for it, and we still want to suppress blank
    //  lines when there is a 'wrote' line involved, we introduce...
    //  prevLastNonBlankLine!  This arguably suggests refactoring should be the
    //  next step, but things work for now.
    let rangeStart = 0,
      lastNonBlankLine = null,
      prevLastNonBlankLine = null;
    let inQuoteDepth = 0;
    for (let [iLine, line] of bodyLines.entries()) {
      if (!line || line == "\xa0") {
        /* unicode non breaking space */
        continue;
      }

      if (line.startsWith(">")) {
        if (!inQuoteDepth) {
          let rangeEnd = iLine - 1;
          let quoteRangeStart = iLine;
          // see if the last non-blank-line was a lead-in...
          if (lastNonBlankLine != null) {
            // TODO: localize quote range start detection
            if (aBodyLines[lastNonBlankLine].includes("wrote")) {
              quoteRangeStart = lastNonBlankLine;
              rangeEnd = lastNonBlankLine - 1;
              // we 'used up' lastNonBlankLine, let's promote the prev guy to
              //  be the new lastNonBlankLine for the next logic block
              lastNonBlankLine = prevLastNonBlankLine;
            }
            // eat the trailing whitespace...
            if (lastNonBlankLine != null) {
              rangeEnd = Math.min(rangeEnd, lastNonBlankLine);
            }
          }
          if (rangeEnd >= rangeStart) {
            aContent.content(aBodyLines.slice(rangeStart, rangeEnd + 1));
          }

          [inQuoteDepth, line] = this._countQuoteDepthAndNormalize(line);
          bodyLines[iLine] = line;
          rangeStart = quoteRangeStart;
        } else {
          let curQuoteDepth;
          [curQuoteDepth, line] = this._countQuoteDepthAndNormalize(line);
          bodyLines[iLine] = line;

          if (curQuoteDepth != inQuoteDepth) {
            // we could do some "wrote" compensation here, but it's not really
            //  as important.  let's wait for a more clever algorithm.
            aContent.quoted(aBodyLines.slice(rangeStart, iLine), inQuoteDepth);
            inQuoteDepth = curQuoteDepth;
            rangeStart = iLine;
          }
        }
      } else if (inQuoteDepth) {
        aContent.quoted(aBodyLines.slice(rangeStart, iLine), inQuoteDepth);
        inQuoteDepth = 0;
        rangeStart = iLine;
      }

      prevLastNonBlankLine = lastNonBlankLine;
      lastNonBlankLine = iLine;
    }

    if (inQuoteDepth) {
      aContent.quoted(aBodyLines.slice(rangeStart), inQuoteDepth);
    } else {
      aContent.content(aBodyLines.slice(rangeStart, lastNonBlankLine + 1));
    }

    return true;
  },
};
