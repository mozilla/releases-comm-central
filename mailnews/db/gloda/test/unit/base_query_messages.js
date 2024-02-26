/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This file tests our querying support.  We build up a deterministic little
 *  'world' of messages spread across multiple conversations, multiple folders
 *  and multiple authors.  To verify expected negative results, in addition to
 *  the 'peoples' in our world clique, we also have 'outlier' contacts that do
 *  not communicate with the others (but are also spread across folders).
 *
 * This is broadly intended to test all of our query features and mechanisms
 *  (apart from our specialized search implementation, which is tested by
 *  test_search_messages.js), but is probably not the place to test specific
 *  edge-cases if they do not easily fit into the 'world' data set.
 *
 * I feel like having the 'world' mishmash as a data source may muddle things
 *  more than it should, but it is hard to deny the benefit of not having to
 *  define a bunch of message corpuses entirely specialized for each test.
 */

var { assertExpectedMessagesIndexed, waitForGlodaIndexer } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelper.jsm"
);
var { queryExpect } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaQueryHelper.jsm"
);
var { Gloda } = ChromeUtils.import("resource:///modules/gloda/GlodaPublic.jsm");
var { GlodaConstants } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaConstants.jsm"
);
var { SyntheticMessageSet } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var msgGen;
var messageInjection;

/**
 * Whether we expect fulltext results. IMAP folders that are offline shouldn't
 * have their bodies indexed.
 */
var expectFulltextResults = true;

/**
 * Should we force our folders offline after we have indexed them once.  We do
 * this in the online_to_offline test variant.
 */
var goOffline = false;

/* ===== Populate ===== */
var world = {
  phase: 0,

  // A list of tuples of [name, email] of length NUM_AUTHORS.
  peoples: null,
  NUM_AUTHORS: 5,
  // Maps each author (as defined by their email address) to the list of
  //  (synthetic) messages they have 'authored'.
  authorGroups: {},

  NUM_CONVERSATIONS: 3,
  // The last message (so far) in each conversation.
  lastMessagesInConvos: [],
  // Maps the message-id of the root message in a conversation to the list of
  //  synthetic messages in the conversation.
  conversationGroups: {},
  // A list of lists of synthetic messages, organized by the conversation they
  //  belong to.
  conversationLists: [],
  // A list of gloda conversation id's, each corresponding to the entries in
  //  converastionLists.
  glodaConversationIds: [],

  NUM_FOLDERS: 2,
  MESSAGES_PER_FOLDER: 11,
  // A list of lists of synthetic messages, one list per folder.
  folderClumps: [],
  // A list of nsIMsgFolders, with each folder containing the messages in the
  //  corresponding list in folderClumps.
  glodaFolders: [],

  outlierAuthor: null,
  outlierFriend: null,

  // Messages authored by contacts in the "peoples" group.
  peoplesMessages: [],
  // Messages authored by outlierAuthor and outlierFriend.
  outlierMessages: [],
};

/**
 * Given a number, provide a unique term.  This is for the benefit of the search
 *  logic.  This entails using a unique prefix to avoid accidental collision
 *  with terms outside our control and then just generating unique character
 *  strings in a vaguely base-26 style.  To avoid the porter stemmer causing odd
 *  things to happen we actually double every numerically driven character.
 */
function uniqueTermGenerator(aNum) {
  let s = "uniq";
  do {
    const l = String.fromCharCode(97 + (aNum % 26));
    s += l + l;
    aNum = Math.floor(aNum / 26);
  } while (aNum);
  return s;
}

var UNIQUE_OFFSET_CONV = 0;
var UNIQUE_OFFSET_AUTHOR = 26;
var UNIQUE_OFFSET_BODY = 0;
var UNIQUE_OFFSET_SUBJECT = 26 * 26;
var UNIQUE_OFFSET_ATTACHMENT = 26 * 26 * 26;

/**
 * Categorize a synthetic message by conversation/folder/people in the 'world'
 *  structure.  This is then used by the test code to generate and verify query
 *  data.
 *
 * @param aSynthMessage The synthetic message.
 */
function categorizeMessage(aSynthMessage) {
  // Lump by author.
  const author = aSynthMessage.fromAddress;
  if (!(author in world.authorGroups)) {
    world.authorGroups[author] = [];
  }
  world.authorGroups[author].push(aSynthMessage);

  // Lump by conversation, keying off of the originator's message id.
  let originator = aSynthMessage;
  while (originator.parent) {
    originator = originator.parent;
  }
  if (!(originator.messageId in world.conversationGroups)) {
    world.conversationGroups[originator.messageId] = [];
  }
  world.conversationGroups[originator.messageId].push(aSynthMessage);
  world.conversationLists[aSynthMessage.iConvo].push(aSynthMessage);

  // Folder lumping happens in a big glob.
}

/**
 * Generate messages in a single folder, categorizing them as we go.
 *
 * Key message characteristics:
 * - Whenever a 'peoples' sends a message, they send it to all 'peoples',
 *   including themselves.
 */
function generateFolderMessages() {
  const messages = [];
  let smsg;

  let iAuthor = 0;
  for (let iMessage = 0; iMessage < world.MESSAGES_PER_FOLDER; iMessage++) {
    const iConvo = iMessage % world.NUM_CONVERSATIONS;

    // We need missing messages to create ghosts, so periodically add an extra
    //  unknown into the equation.  we do this prior to the below step because
    //  then we don't hose up all the fancy body creation the next step does.
    if (iMessage % 3 == 1) {
      smsg = msgGen.makeMessage({ inReplyTo: smsg });
    }

    const convUniqueSubject = uniqueTermGenerator(
      UNIQUE_OFFSET_SUBJECT + UNIQUE_OFFSET_CONV + iConvo
    );
    const convUniqueBody = uniqueTermGenerator(
      UNIQUE_OFFSET_BODY + UNIQUE_OFFSET_CONV + iConvo
    );
    const authorUniqueBody = uniqueTermGenerator(
      UNIQUE_OFFSET_BODY + UNIQUE_OFFSET_AUTHOR + iAuthor
    );
    const convUniqueAttachment = uniqueTermGenerator(
      UNIQUE_OFFSET_ATTACHMENT + UNIQUE_OFFSET_CONV + iConvo
    );
    smsg = msgGen.makeMessage({
      inReplyTo: world.lastMessagesInConvos[iConvo],
      // Note that the reply-logic will ignore our subject, luckily that does
      //  not matter! (since it will just copy the subject)
      subject: convUniqueSubject,
      body: {
        body: convUniqueBody + " " + authorUniqueBody,
      },
      attachments: [
        {
          filename: convUniqueAttachment + ".conv",
          body: "content does not matter. only life matters.",
          contentType: "application/x-test",
        },
      ],
    });

    // MakeMessage is not exceedingly clever right now, we need to overwrite
    //  From and To.
    smsg.from = world.peoples[iAuthor];
    iAuthor = (iAuthor + iConvo + 1) % world.NUM_AUTHORS;
    // So, everyone is talking to everyone for this stuff.
    smsg.to = world.peoples;
    world.lastMessagesInConvos[iConvo] = smsg;
    // Simplify categorizeMessage and glodaInfoStasher's life.
    smsg.iConvo = iConvo;

    categorizeMessage(smsg);
    messages.push(smsg);
    world.peoplesMessages.push(smsg);
  }

  smsg = msgGen.makeMessage();
  smsg.from = world.outlierAuthor;
  smsg.to = [world.outlierFriend];
  // Do not lump it.
  messages.push(smsg);
  world.outlierMessages.push(smsg);

  world.folderClumps.push(messages);

  return new SyntheticMessageSet(messages);
}

/**
 * To save ourselves some lookup trouble, pretend to be a verification
 *  function so we get easy access to the gloda translations of the messages so
 *  we can cram this in various places.
 */
function glodaInfoStasher(aSynthMessage, aGlodaMessage) {
  if (aSynthMessage.iConvo !== undefined) {
    world.glodaConversationIds[aSynthMessage.iConvo] =
      aGlodaMessage.conversation.id;
  }
  if (world.glodaFolders.length <= world.phase) {
    world.glodaFolders.push(aGlodaMessage.folder);
  }
}

// We override these for the IMAP tests.
var pre_setup_populate_hook = function default_pre_setup_populate_hook() {};
var post_setup_populate_hook = function default_post_setup_populate_hook() {};

// First, we must populate our message store with delicious messages.
async function setup_populate() {
  world.glodaHolderCollection = Gloda.explicitCollection(
    GlodaConstants.NOUN_MESSAGE,
    []
  );

  world.peoples = msgGen.makeNamesAndAddresses(world.NUM_AUTHORS);
  world.outlierAuthor = msgGen.makeNameAndAddress();
  world.outlierFriend = msgGen.makeNameAndAddress();
  // Set up the per-conversation values with blanks initially.
  for (let iConvo = 0; iConvo < world.NUM_CONVERSATIONS; iConvo++) {
    world.lastMessagesInConvos.push(null);
    world.conversationLists.push([]);
    world.glodaConversationIds.push(null);
  }

  const setOne = generateFolderMessages();
  const folderOne = await messageInjection.makeEmptyFolder();
  await messageInjection.addSetsToFolders([folderOne], [setOne]);
  // If this is the online_to_offline variant (indicated by goOffline) we want
  //  to make the messages available offline.  This should trigger an event
  //  driven re-indexing of the messages which should make the body available
  //  for fulltext queries.
  if (goOffline) {
    await waitForGlodaIndexer();
    Assert.ok(...assertExpectedMessagesIndexed([setOne]));
    await messageInjection.makeFolderAndContentsOffline(folderOne);
  }
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([setOne], { verifier: glodaInfoStasher })
  );

  world.phase++;
  const setTwo = generateFolderMessages();
  const folderTwo = await messageInjection.makeEmptyFolder();
  await messageInjection.addSetsToFolders([folderTwo], [setTwo]);
  if (goOffline) {
    await waitForGlodaIndexer();
    Assert.ok(...assertExpectedMessagesIndexed([setTwo]));
    await messageInjection.makeFolderAndContentsOffline(folderTwo);
  }
  await waitForGlodaIndexer();
  Assert.ok(
    ...assertExpectedMessagesIndexed([setTwo], { verifier: glodaInfoStasher })
  );
}

/* ===== Non-text queries ===== */

/* === messages === */

/**
 * Takes a list of mutually exclusive queries and a list of the resulting
 *  collections and ensures that the collections from one query do not pass the
 *  query.test() method of one of the other queries.  To restate, the queries
 *  must not have any overlapping results, or we will get angry without
 *  justification.
 */
function verify_nonMatches(aQueries, aCollections) {
  for (let i = 0; i < aCollections.length; i++) {
    const testQuery = aQueries[i];
    const nonmatches = aCollections[(i + 1) % aCollections.length].items;

    for (const item of nonmatches) {
      if (testQuery.test(item)) {
        dump("item: " + JSON.stringify(item) + "\n");
        dump("constraints: " + JSON.stringify(testQuery._constraints) + "\n");
        do_throw(
          "Something should not match query.test(), but it does: " + item
        );
      }
    }
  }
}

var ts_convNum = 0;
/* preserved state for the non-match testing performed by
 *  test_query_messages_by_conversation_nonmatches.
 */
var ts_convQueries = [];
var ts_convCollections = [];
/**
 * Query conversations by gloda conversation-id, saving the queries and
 *  resulting collections in ts_convQueries and ts_convCollections for the
 *  use of test_query_messages_by_conversation_nonmatches who verifies the
 *  query.test() logic doesn't match on things it should not match on.
 *
 * @tests gloda.noun.message.attr.conversation
 * @tests gloda.datastore.sqlgen.kConstraintIn
 */
async function test_query_messages_by_conversation() {
  const convNum = ts_convNum++;
  const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  query.conversation(world.glodaConversationIds[convNum]);

  ts_convQueries.push(query);
  ts_convCollections.push(
    await queryExpect(query, world.conversationLists[convNum])
  );
}

/**
 * @tests gloda.query.test.kConstraintIn
 */
function test_query_messages_by_conversation_nonmatches() {
  verify_nonMatches(ts_convQueries, ts_convCollections);
}

var ts_folderNum = 0;
var ts_folderQueries = [];
var ts_folderCollections = [];
/**
 * @tests gloda.noun.message.attr.folder
 * @tests gloda.datastore.sqlgen.kConstraintIn
 */
async function test_query_messages_by_folder() {
  const folderNum = ts_folderNum++;
  const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  query.folder(world.glodaFolders[folderNum]);

  ts_folderQueries.push(query);
  ts_folderCollections.push(
    await queryExpect(query, world.folderClumps[folderNum])
  );
}

/**
 * @tests gloda.query.test.kConstraintIn
 */
function test_query_messages_by_folder_nonmatches() {
  verify_nonMatches(ts_folderQueries, ts_folderCollections);
}

/**
 * @tests Gloda.ns.getMessageCollectionForHeader()
 */
async function test_get_message_for_header() {
  // Pick an arbitrary message.
  const glodaMessage = ts_convCollections[1].items[0];
  // Find the synthetic message that matches (ordering must not be assumed).
  const synthMessage = world.conversationLists[1].find(
    sm => sm.messageId == glodaMessage.headerMessageID
  );
  await queryExpect(
    {
      queryFunc: Gloda.getMessageCollectionForHeader,
      queryThis: Gloda,
      args: [glodaMessage.folderMessage],
      nounId: GlodaConstants.NOUN_MESSAGE,
    },
    [synthMessage]
  );
}

/**
 * @tests Gloda.ns.getMessageCollectionForHeaders()
 */
async function test_get_messages_for_headers() {
  const messageCollection = ts_convCollections[0];
  const headers = messageCollection.items.map(m => m.folderMessage);
  await queryExpect(
    {
      queryFunc: Gloda.getMessageCollectionForHeaders,
      queryThis: Gloda,
      args: [headers],
      nounId: GlodaConstants.NOUN_MESSAGE,
    },
    world.conversationLists[0]
  );
}

// At this point we go run the identity and contact tests for side-effects.

var ts_messageIdentityQueries = [];
var ts_messageIdentityCollections = [];
/**
 * @tests gloda.noun.message.attr.involves
 * @tests gloda.datastore.sqlgen.kConstraintIn
 */
async function test_query_messages_by_identity_peoples() {
  const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  query.involves(peoplesIdentityCollection.items[0]);

  ts_messageIdentityQueries.push(query);
  ts_messageIdentityCollections.push(
    await queryExpect(query, world.peoplesMessages)
  );
}

/**
 * @tests gloda.noun.message.attr.involves
 */
async function test_query_messages_by_identity_outlier() {
  const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  query.involves(outlierIdentityCollection.items[0]);
  // This also tests our ability to have two intersecting constraints! hooray!.
  query.involves(outlierIdentityCollection.items[1]);

  ts_messageIdentityQueries.push(query);
  ts_messageIdentityCollections.push(
    await queryExpect(query, world.outlierMessages)
  );
}

/**
 * @tests gloda.query.test.kConstraintIn
 */
function test_query_messages_by_identity_nonmatches() {
  verify_nonMatches(ts_messageIdentityQueries, ts_messageIdentityCollections);
}

/* exported test_query_messages_by_contact */
function test_query_messages_by_contact() {
  // IOU
}

var ts_messagesDateQuery;
/**
 * @tests gloda.noun.message.attr.date
 * @tests gloda.datastore.sqlgen.kConstraintRanges
 */
async function test_query_messages_by_date() {
  ts_messagesDateQuery = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  // We are clearly relying on knowing the generation sequence here,
  //  fuggedaboutit.
  ts_messagesDateQuery.dateRange([
    world.peoplesMessages[1].date,
    world.peoplesMessages[2].date,
  ]);
  await queryExpect(ts_messagesDateQuery, world.peoplesMessages.slice(1, 3));
}

/**
 * @tests gloda.query.test.kConstraintRanges
 */
function test_query_messages_by_date_nonmatches() {
  if (
    ts_messagesDateQuery.test(world.peoplesMessages[0]) ||
    ts_messagesDateQuery.test(world.peoplesMessages[3])
  ) {
    do_throw("The date testing mechanism is busted.");
  }
}

/* === contacts === */
/* exported test_query_contacts_by_popularity */
function test_query_contacts_by_popularity() {
  // IOU
}

/* === identities === */

/* ===== Text-based queries ===== */

/* === conversations === */

/* exported test_query_conversations_by_subject_text */
function test_query_conversations_by_subject_text() {}

/* === messages === */

/**
 * Test subject searching using the conversation unique subject term.
 *
 * @tests gloda.noun.message.attr.subjectMatches
 * @tests gloda.datastore.sqlgen.kConstraintFulltext
 */
async function test_query_messages_by_subject_text() {
  // We only need to use one conversation.
  const convNum = 0;

  const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  const convSubjectTerm = uniqueTermGenerator(
    UNIQUE_OFFSET_SUBJECT + UNIQUE_OFFSET_CONV + convNum
  );
  query.subjectMatches(convSubjectTerm);
  await queryExpect(query, world.conversationLists[convNum]);
}

/**
 * Test body searching using the conversation unique body term.
 *
 * @tests gloda.noun.message.attr.bodyMatches
 * @tests gloda.datastore.sqlgen.kConstraintFulltext
 */
async function test_query_messages_by_body_text() {
  // We only need to use one conversation.
  const convNum = 0;
  const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  const convBodyTerm = uniqueTermGenerator(
    UNIQUE_OFFSET_BODY + UNIQUE_OFFSET_CONV + convNum
  );
  query.bodyMatches(convBodyTerm);
  await queryExpect(
    query,
    expectFulltextResults ? world.conversationLists[convNum] : []
  );
}

/**
 * Test attachment name searching using the conversation unique attachment term.
 *
 * @tests gloda.noun.message.attr.attachmentNamesMatch
 * @tests gloda.datastore.sqlgen.kConstraintFulltext
 */
async function test_query_messages_by_attachment_names() {
  const convNum = 0;
  const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  const convUniqueAttachment = uniqueTermGenerator(
    UNIQUE_OFFSET_ATTACHMENT + UNIQUE_OFFSET_CONV + convNum
  );
  query.attachmentNamesMatch(convUniqueAttachment);
  await queryExpect(
    query,
    expectFulltextResults ? world.conversationLists[convNum] : []
  );
}

/**
 * Test author name fulltext searching using an arbitrary author.
 *
 * @tests gloda.noun.message.attr.authorMatches
 * @tests gloda.datastore.sqlgen.kConstraintFulltext
 */
async function test_query_messages_by_authorMatches_name() {
  const [authorName, authorMail] = world.peoples[0];
  const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  query.authorMatches(authorName);
  await queryExpect(query, world.authorGroups[authorMail]);
}

/**
 * Test author mail address fulltext searching using an arbitrary author.
 *
 * @tests gloda.noun.message.attr.authorMatches
 * @tests gloda.datastore.sqlgen.kConstraintFulltext
 */
async function test_query_messages_by_authorMatches_email() {
  const [, authorMail] = world.peoples[0];
  const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  query.authorMatches(authorMail);
  await queryExpect(query, world.authorGroups[authorMail]);
}

/**
 * Test recipient name fulltext searching using an arbitrary recipient. Since
 *  all 'peoples' messages are sent to all of them, any choice from peoples
 *  gets us all 'peoplesMessages'.
 *
 * @tests gloda.noun.message.attr.recipientsMatch
 * @tests gloda.datastore.sqlgen.kConstraintFulltext
 */
async function test_query_messages_by_recipients_name() {
  const name = world.peoples[0][0];
  const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  query.recipientsMatch(name);
  await queryExpect(query, world.peoplesMessages);
}

/**
 * Test recipient mail fulltext searching using an arbitrary recipient. Since
 *  all 'peoples' messages are sent to all of them, any choice from peoples
 *  gets us all 'peoplesMessages'.
 *
 * @tests gloda.noun.message.attr.recipientsMatch
 * @tests gloda.datastore.sqlgen.kConstraintFulltext
 */
async function test_query_messages_by_recipients_email() {
  const [, mail] = world.peoples[0];
  const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
  query.recipientsMatch(mail);
  await queryExpect(query, world.peoplesMessages);
}

/* === contacts === */

var contactLikeQuery;
/**
 * @tests gloda.noun.contact.attr.name
 * @tests gloda.datastore.sqlgen.kConstraintStringLike
 */
async function test_query_contacts_by_name() {
  // Let's use like... we need to test that.
  contactLikeQuery = Gloda.newQuery(GlodaConstants.NOUN_CONTACT);
  const personName = world.peoples[0][0];
  // Chop off the first and last letter...  this isn't the most edge-case
  //  handling way to roll, but LOOK OVER THERE? IS THAT ELVIS?
  const personNameSubstring = personName.substring(1, personName.length - 1);
  contactLikeQuery.nameLike(
    contactLikeQuery.WILDCARD,
    personNameSubstring,
    contactLikeQuery.WILDCARD
  );

  await queryExpect(contactLikeQuery, [personName]);
}

/**
 * @tests gloda.query.test.kConstraintStringLike
 */
function test_query_contacts_by_name_nonmatch() {
  const otherContact = outlierIdentityCollection.items[0].contact;
  if (contactLikeQuery.test(otherContact)) {
    do_throw("The string LIKE mechanism as applied to contacts does not work.");
  }
}

/* === identities === */

var peoplesIdentityQuery;
var peoplesIdentityCollection;
async function test_query_identities_for_peoples() {
  peoplesIdentityQuery = Gloda.newQuery(GlodaConstants.NOUN_IDENTITY);
  peoplesIdentityQuery.kind("email");
  const peopleAddrs = world.peoples.map(nameAndAddr => nameAndAddr[1]);
  peoplesIdentityQuery.value.apply(peoplesIdentityQuery, peopleAddrs);
  peoplesIdentityCollection = await queryExpect(
    peoplesIdentityQuery,
    peopleAddrs
  );
}

var outlierIdentityQuery;
var outlierIdentityCollection;
async function test_query_identities_for_outliers() {
  outlierIdentityQuery = Gloda.newQuery(GlodaConstants.NOUN_IDENTITY);
  outlierIdentityQuery.kind("email");
  const outlierAddrs = [world.outlierAuthor[1], world.outlierFriend[1]];
  outlierIdentityQuery.value.apply(outlierIdentityQuery, outlierAddrs);
  outlierIdentityCollection = await queryExpect(
    outlierIdentityQuery,
    outlierAddrs
  );
}

function test_query_identities_by_kind_and_value_nonmatches() {
  verify_nonMatches(
    [peoplesIdentityQuery, outlierIdentityQuery],
    [peoplesIdentityCollection, outlierIdentityCollection]
  );
}

function test_sanity_test_environment() {
  Assert.ok(msgGen, "Sanity that msgGen is set.");
  Assert.ok(messageInjection, "Sanity that messageInjection is set.");
}

var base_query_messages_tests = [
  test_sanity_test_environment,
  function pre_setup_populate() {
    pre_setup_populate_hook();
  },
  setup_populate,
  function post_setup_populate() {
    post_setup_populate_hook();
  },
  test_query_messages_by_conversation,
  test_query_messages_by_conversation,
  test_query_messages_by_conversation_nonmatches,
  test_query_messages_by_folder,
  test_query_messages_by_folder,
  test_query_messages_by_folder_nonmatches,
  test_get_message_for_header,
  test_get_messages_for_headers,
  // Need to do the identity and contact lookups so we can have their results
  //  for the other message-related queries.
  test_query_identities_for_peoples,
  test_query_identities_for_outliers,
  test_query_identities_by_kind_and_value_nonmatches,
  // Back to messages!
  test_query_messages_by_identity_peoples,
  test_query_messages_by_identity_outlier,
  test_query_messages_by_identity_nonmatches,
  test_query_messages_by_date,
  test_query_messages_by_date_nonmatches,
  // Fulltext
  test_query_messages_by_subject_text,
  test_query_messages_by_body_text,
  test_query_messages_by_attachment_names,
  test_query_messages_by_authorMatches_name,
  test_query_messages_by_authorMatches_email,
  test_query_messages_by_recipients_name,
  test_query_messages_by_recipients_email,
  // Like
  test_query_contacts_by_name,
  test_query_contacts_by_name_nonmatch,
];
