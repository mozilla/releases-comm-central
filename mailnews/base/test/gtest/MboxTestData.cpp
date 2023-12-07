/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MboxTestData.h"

namespace testing {

// Each test case is an mboxrd and an array of messages it contains.
// Our mbox input and output code perform perfectly reversable transformations
// on these. So tests for both MboxMsgInputStream and MboxMsgOutputStream use
// these test cases.
nsTArray<MboxCase> mboxValidCases({

    // A couple of simple messages.
    {"From \r\n"
     "Message-ID: simple-1\r\n"
     "To: alice@invalid\r\n"
     "\r\n"
     "This is message one.\r\n"
     "\r\n"
     "From \r\n"
     "Message-ID: simple-2\r\n"
     "To: bob@invalid\r\n"
     "\r\n"
     "This is message two.\r\n"
     "\r\n"_ns,
     {
         "Message-ID: simple-1\r\n"
         "To: alice@invalid\r\n"
         "\r\n"
         "This is message one.\r\n"_ns,

         "Message-ID: simple-2\r\n"
         "To: bob@invalid\r\n"
         "\r\n"
         "This is message two.\r\n"_ns,
     }},

    // Message with trailing blank lines.
    {"From \r\n"
     "Message-ID: body-has-trailing-eols\r\n"
     "To: alice@invalid\r\n"
     "\r\n"
     "body here.\r\n"
     "\r\n"
     "\r\n"
     "\r\n"
     "\r\n"
     "\r\n"_ns,  // This one is part of mbox, not to be included in message.
     {
         "Message-ID: body-has-trailing-eols\r\n"
         "To: alice@invalid\r\n"
         "\r\n"
         "body here.\r\n"
         "\r\n"
         "\r\n"
         "\r\n"
         "\r\n"_ns,
     }},

    // Multiple blank lines in message body.
    {"From \r\n"
     "Message-ID: body-has-multiple-blank-lines\r\n"
     "To: bob@invalid\r\n"
     "From: alice@invalid\r\n"
     "\r\n"
     "this body\r\n"
     "contains...\r\n"
     "\r\n"
     "\r\n"
     "\r\n"
     "...three blank lines.\r\n"
     "\r\n"_ns,
     {
         "Message-ID: body-has-multiple-blank-lines\r\n"
         "To: bob@invalid\r\n"
         "From: alice@invalid\r\n"
         "\r\n"
         "this body\r\n"
         "contains...\r\n"
         "\r\n"
         "\r\n"
         "\r\n"
         "...three blank lines.\r\n"_ns,
     }},

    // Multiple messages with trailing blank lines.
    {"From \r\n"
     "Message-ID: trailing-eols-1\r\n"
     "To: bob@invalid\r\n"
     "From: alice@invalid\r\n"
     "\r\n"
     "Body has two internal blank lines:\r\n"
     "\r\n"
     "\r\n"
     "and three trailing blank lines:\r\n"
     "\r\n"
     "\r\n"
     "\r\n"
     "\r\n"
     "From \r\n"
     "Message-ID: trailing-eols-2\r\n"
     "To: bob@invalid\r\n"
     "From: alice@invalid\r\n"
     "\r\n"
     "Body has two trailing blank lines.\r\n"
     "\r\n"
     "\r\n"
     "\r\n"_ns,  // This one is part of mbox, not to be included in message.
     {
         "Message-ID: trailing-eols-1\r\n"
         "To: bob@invalid\r\n"
         "From: alice@invalid\r\n"
         "\r\n"
         "Body has two internal blank lines:\r\n"
         "\r\n"
         "\r\n"
         "and three trailing blank lines:\r\n"
         "\r\n"
         "\r\n"
         "\r\n"_ns,

         "Message-ID: trailing-eols-2\r\n"
         "To: bob@invalid\r\n"
         "From: alice@invalid\r\n"
         "\r\n"
         "Body has two trailing blank lines.\r\n"
         "\r\n"
         "\r\n"_ns,
     }},

    // "From " lines in message body (some need quoting).
    {"From \r\n"
     "Message-ID: body-needs-quoting\r\n"
     "To: bob@invalid\r\n"
     "From: alice@invalid\r\n"
     "\r\n"
     "does this one quote\r\n"
     ">From lines properly?\r\n"
     ">Also, they can be quoted:\r\n"
     ">>From here.\r\n"
     ">>>From here.\r\n"
     "\r\n"_ns,
     {
         "Message-ID: body-needs-quoting\r\n"
         "To: bob@invalid\r\n"
         "From: alice@invalid\r\n"
         "\r\n"
         "does this one quote\r\n"
         "From lines properly?\r\n"
         ">Also, they can be quoted:\r\n"  // Doesn't need quoting.
         ">From here.\r\n"
         ">>From here.\r\n"_ns,
     }},

    // Can we screw up our double-header heuristic with a split line?
    {"From \r\n"
     "Message-ID: msg-one-simple\r\n"
     "To: bob@invalid\r\n"
     "From: alice@invalid\r\n"
     "\r\n"
     "Simple message.\r\n"
     "\r\n"
     "From \r\n"
     "Received: by blah:blah:blah with SMTP id blahblahblah;\r\n"
     "   Wed, 11 Oct 2023 01:33:59 -0700 (PDT)\r\n"
     "Message-ID: msg-two-header-split-over-multiple-lines\r\n"
     "To: bob@invalid\r\n"
     "From: alice@invalid\r\n"
     "\r\n"
     "message body\r\n"
     "\r\n"_ns,
     {
         // 1
         "Message-ID: msg-one-simple\r\n"
         "To: bob@invalid\r\n"
         "From: alice@invalid\r\n"
         "\r\n"
         "Simple message.\r\n"_ns,
         // 2
         "Received: by blah:blah:blah with SMTP id blahblahblah;\r\n"
         "   Wed, 11 Oct 2023 01:33:59 -0700 (PDT)\r\n"
         "Message-ID: msg-two-header-split-over-multiple-lines\r\n"
         "To: bob@invalid\r\n"
         "From: alice@invalid\r\n"
         "\r\n"
         "message body\r\n"_ns,
     }},

    // Message body looks like new message.
    {"From \r\n"
     "Message-ID: test-body-looks-like-mbox\r\n"
     "To: bob@invalid\r\n"
     "From: alice@invalid\r\n"
     "\r\n"
     "There's more...\r\n"
     "\r\n"
     ">From \r\n"
     "To: nobody@invalid.local\r\n"
     "\r\n"
     "Not really a new message!\r\n"
     "\r\n"
     "\r\n"_ns,
     {
         "Message-ID: test-body-looks-like-mbox\r\n"
         "To: bob@invalid\r\n"
         "From: alice@invalid\r\n"
         "\r\n"
         "There's more...\r\n"
         "\r\n"
         "From \r\n"  // Needs to be quoted.
         "To: nobody@invalid.local\r\n"
         "\r\n"
         "Not really a new message!\r\n"
         "\r\n"_ns,
     }},

    // Message with lots of false alarms (none need quoting).
    {"From \r\n"
     "Message-ID: lots-of-false-alarms\r\n"
     "To: bob@invalid\r\n"
     "From: alice@invalid\r\n"
     "\r\n"
     "F\r\n"
     "Fr\r\n"
     "Fro\r\n"
     "From,From,From,From,From\r\n"
     "blah >>>>From blah\r\n"
     "From\r\n"
     " From\r\n"
     ">From\r\n"
     ">>From\r\n"
     "> From\r\n"
     "\r\n"_ns,
     {
         "Message-ID: lots-of-false-alarms\r\n"
         "To: bob@invalid\r\n"
         "From: alice@invalid\r\n"
         "\r\n"
         "F\r\n"
         "Fr\r\n"
         "Fro\r\n"
         "From,From,From,From,From\r\n"
         "blah >>>>From blah\r\n"
         "From\r\n"
         " From\r\n"
         ">From\r\n"
         ">>From\r\n"
         "> From\r\n"_ns,
     }},
    // From "mailnews/test/data/mbox_mboxrd".
    {"From \r\n"
     "From: Author <author@example.com>\r\n"
     "To: Recipient <recipient@example.com>\r\n"
     "Subject: Sample message 1\r\n"
     "\r\n"
     "This is the body.\r\n"
     ">From (should be escaped).\r\n"
     "There are 3 lines.\r\n"
     "\r\n"
     "From \r\n"
     "From: Author <author@example.com>\r\n"
     "To: Recipient <recipient@example.com>\r\n"
     "Subject: Sample message 2\r\n"
     "\r\n"
     "This is the second body.\r\n"
     "\r\n"_ns,
     {
         // 1st
         "From: Author <author@example.com>\r\n"
         "To: Recipient <recipient@example.com>\r\n"
         "Subject: Sample message 1\r\n"
         "\r\n"
         "This is the body.\r\n"
         "From (should be escaped).\r\n"
         "There are 3 lines.\r\n"_ns,
         // 2nd
         "From: Author <author@example.com>\r\n"
         "To: Recipient <recipient@example.com>\r\n"
         "Subject: Sample message 2\r\n"
         "\r\n"
         "This is the second body.\r\n"_ns,
     }},

    // From "mailnews/test/data/mbox_modern".
    // NOTE: we're not doing anything to unquote "From " lines which escaped
    // by prepending a space.
    {"From \r\n"
     "From: Author <author@example.com>\r\n"
     "To: Recipient <recipient@example.com>\r\n"
     "Subject: Sample message 1\r\n"
     "Date: Fri, 24 Aug 2018 11:55:47 +0000\r\n"
     "\r\n"
     "Later versions of Thunderbird quote things by prefixing\r\n"
     "a space,like this:\r\n"
     " From \r\n"
     " From - Fri Aug 24 11:55:47 2018\r\n"
     "This could cause problems, if a reader decides to split the message\r\n"
     "here.\r\n"
     "\r\n"
     "From \r\n"
     "From: Author <author@example.com>\r\n"
     "To: Recipient <recipient@example.com>\r\n"
     "Subject: Sample message 2\r\n"
     "Date: Thu, 23 Aug 2018 09:10:23 +0000\r\n"
     "\r\n"
     "This is the second body.\r\n"
     "\r\n"_ns,
     {
         // 1st
         "From: Author <author@example.com>\r\n"
         "To: Recipient <recipient@example.com>\r\n"
         "Subject: Sample message 1\r\n"
         "Date: Fri, 24 Aug 2018 11:55:47 +0000\r\n"
         "\r\n"
         "Later versions of Thunderbird quote things by prefixing\r\n"
         "a space,like this:\r\n"
         " From \r\n"
         " From - Fri Aug 24 11:55:47 2018\r\n"
         "This could cause problems, if a reader decides to split the "
         "message\r\n"
         "here.\r\n"_ns,
         // 2nd
         "From: Author <author@example.com>\r\n"
         "To: Recipient <recipient@example.com>\r\n"
         "Subject: Sample message 2\r\n"
         "Date: Thu, 23 Aug 2018 09:10:23 +0000\r\n"
         "\r\n"
         "This is the second body.\r\n"_ns,
     }},

    // Message with folded (multi-line) headers
    {"From \r\n"
     "X-Blah: multi-line\r\n"
     "        headers\r\n"
     "\tcan use tabs\r\n"
     "   or spaces\r\n"
     "Message-ID: multi-line-header\r\n"
     "To: alice@invalid\r\n"
     "\r\n"
     "body here.\r\n"
     "\r\n"_ns,
     {
         "X-Blah: multi-line\r\n"
         "        headers\r\n"
         "\tcan use tabs\r\n"
         "   or spaces\r\n"
         "Message-ID: multi-line-header\r\n"
         "To: alice@invalid\r\n"
         "\r\n"
         "body here.\r\n"_ns,
     }},

});

// Odd-looking mboxes we want to be able to read, where we know clearly what
// we want to see out of them. For testing MboxMsgInputStream only, because
// MboxMsgOutputStream should be fixing some of these oddities on the fly -
// it'll do proper quoting, and message separation.
nsTArray<MboxCase> mboxOddCases({
  // Empty mbox (no messages).
  {""_ns, {}},
      // Single empty message.
      {"From "_ns,
       {
           ""_ns,
       }},
#if 0
    // TODO: Multiple empty messages.
    {
      "From \r\n\r\n"
      "From \r\n\r\n"
      "From \r\n\r\n"_ns,
     {
         ""_ns,
         ""_ns,
         ""_ns,
     }},
#endif
      // Truncated Header block.
      {"From \r\nTo: bob@invalid\r\nFrom: alice@inv..."_ns,
       {
           "To: bob@invalid\r\nFrom: alice@inv..."_ns,
       }},
      // Header block then nothing.
      {"From \r\nTo: bob@invalid\r\nFrom: alice@invalid\r\nSubject: Hi\r\n"_ns,
       {
           "To: bob@invalid\r\nFrom: alice@invalid\r\nSubject: Hi\r\n"_ns,
       }},
      // Header block + blank line, but no body.
      {"From \r\nTo: bob@invalid\r\nFrom: alice@invalid\r\nSubject: Hi\r\n\r\n"_ns,
       {
           "To: bob@invalid\r\nFrom: alice@invalid\r\nSubject: Hi\r\n\r\n"_ns,
       }},
      // Header block, blank, body, but no trailing blank line.
      {"From \r\n"
       "To: bob@invalid\r\nFrom: alice@invalid\r\nSubject: Hi\r\n"
       "\r\n"
       "Here's a message body with no EOL"_ns,
       {
           "To: bob@invalid\r\nFrom: alice@invalid\r\nSubject: Hi\r\n"
           "\r\n"
           "Here's a message body with no EOL"_ns,
       }},
      // Header block, blank, body, end in mid-quoting.
      {"From \r\n"
       "To: bob@invalid\r\nFrom: alice@invalid\r\nSubject: Hi\r\n"
       "\r\n"
       "Line one\r\n"
       ">>>>>>>>>>>>>>>>"_ns,
       {
           "To: bob@invalid\r\nFrom: alice@invalid\r\nSubject: Hi\r\n"
           "\r\n"
           "Line one\r\n"
           ">>>>>>>>>>>>>>>>"_ns,
       }},
      // Header block, blank, body, end on a quoted "From ".
      {"From \r\n"
       "To: bob@invalid\r\nFrom: alice@invalid\r\nSubject: Hi\r\n"
       "\r\n"
       "Line one\r\n"
       ">>>>From "_ns,
       {
           "To: bob@invalid\r\nFrom: alice@invalid\r\nSubject: Hi\r\n"
           "\r\n"
           "Line one\r\n"
           ">>>From "_ns,
       }},
      // Second message truncated after a folded (multi-line) header (Bug
      // 1868504)
      {"From \r\n"
       "To: bob@invalid\r\n"
       "From: alice@invalid\r\n"
       "\r\n"
       "Hi bob!\r\n"
       "\r\n"
       "From \r\n"
       "X-Blah: multi-line\r\n"
       "        headers\r\n"
       "\tcan use tabs\r\n"
       "   or spaces\r\n"_ns,
       {
           // 1st
           "To: bob@invalid\r\n"
           "From: alice@invalid\r\n"
           "\r\n"
           "Hi bob!\r\n"_ns,
           // 2nd
           "X-Blah: multi-line\r\n"
           "        headers\r\n"
           "\tcan use tabs\r\n"
           "   or spaces\r\n"_ns,
       }},
});

// Handle "From " separators with no blank line preceeding them, as per
// qmail (http://qmail.org/qmail-manual-html/man5/mbox.html):
// ```
// The reader should not attempt to take advantage of the fact that every
// From_ line (past the beginning of the file) is preceded by a
// blank line.
// ```
// BUT... we shouldn't screw up obvious cases of mboxes with no "From "
// quoting. So we'll use a heuristic of sniffing the next couple of lines
// to see if they look like mail headers.
//
// NOTE: these mbox tests have unquoted "From " lines, and so are not
// reversable. We aim to be tolerant in reading, but strict in writing. We'd
// _never_ write out unquoted "From " lines.
nsTArray<MboxCase> mboxAmbiguities({
    // "From " separator with no preceeding blank line.
    {"From \r\n"
     "To: bob@invalid\r\n"
     "From: alice@invalid\r\n"
     "Subject: Hi\r\n"
     "\r\n"
     "New message starting...\r\n"
     "From \r\n"
     "To: alice@invalid\r\n"
     "From: bob@invalid\r\n"
     "Subject: Yes, Hi!\r\n"
     "\r\n"
     "This was a new message.\r\n"
     "\r\n"_ns,
     {
         "To: bob@invalid\r\n"
         "From: alice@invalid\r\n"
         "Subject: Hi\r\n"
         "\r\n"
         "New message starting...\r\n"_ns,

         "To: alice@invalid\r\n"
         "From: bob@invalid\r\n"
         "Subject: Yes, Hi!\r\n"
         "\r\n"
         "This was a new message.\r\n"_ns,
     }},

    // A single message with an unquoted "From ".
    {"From \r\n"
     "To: bob@invalid\r\n"
     "From: alice@invalid\r\n"
     "Subject: Hi\r\n"
     "\r\n"
     "Body\r\n"
     "From \r\n"  // Unquoted "From " looks like message separator!
     "Here\r\n"
     "To\r\n"
     "Here.\r\n"
     "\r\n"_ns,
     {"To: bob@invalid\r\n"
      "From: alice@invalid\r\n"
      "Subject: Hi\r\n"
      "\r\n"
      "Body\r\n"
      "From \r\n"
      "Here\r\n"
      "To\r\n"
      "Here.\r\n"_ns}},

    // A case to show off our header-sniffing heuristic...
    // It's pretty obvious (to a human) that this is a single message,
    // but a naive parser would (mistakenly) interpret it as two.
    {"From \r\n"
     "To: bob@invalid\r\n"
     "From: alice@invalid\r\n"
     "Subject: Hi\r\n"
     "\r\n"
     "Looks like a new message\r\n"
     "From here\r\n"              // Not escaped!
     "But: it's not really.\r\n"  // This could plausably be a header...
     "The last line of the message.\r\n"
     "\r\n"_ns,
     {"To: bob@invalid\r\n"
      "From: alice@invalid\r\n"
      "Subject: Hi\r\n"
      "\r\n"
      "Looks like a new message\r\n"
      "From here\r\n"
      "But: it's not really.\r\n"
      "The last line of the message.\r\n"_ns}},

    // From "mailnews/test/data/mbox_unquoted".
    {"From \r\n"
     "From: Author <author@example.com>\r\n"
     "To: Recipient <recipient@example.com>\r\n"
     "Subject: Sample message 1\r\n"
     "Date: Wed, 22 Aug 2005 17:20:08 +0000\r\n"
     "\r\n"
     "Earlier versions of Thunderbird don't seem to quote things like this:\r\n"
     "From \r\n"
     "This could cause problems, if a reader decides to split the message\r\n"
     "here.\r\n"
     "\r\n"
     "From \r\n"
     "From: Author <author@example.com>\r\n"
     "To: Recipient <recipient@example.com>\r\n"
     "Subject: Sample message 2\r\n"
     "Date: Thu, 23 Aug 2005 11:17:43 +0000\r\n"
     "\r\n"
     "This is the second body.\r\n"
     "\r\n"_ns,
     {
         // 1st
         "From: Author <author@example.com>\r\n"
         "To: Recipient <recipient@example.com>\r\n"
         "Subject: Sample message 1\r\n"
         "Date: Wed, 22 Aug 2005 17:20:08 +0000\r\n"
         "\r\n"
         "Earlier versions of Thunderbird don't seem to quote things like "
         "this:\r\n"
         "From \r\n"
         "This could cause problems, if a reader decides to split the "
         "message\r\n"
         "here.\r\n"_ns,
         // 2nd
         "From: Author <author@example.com>\r\n"
         "To: Recipient <recipient@example.com>\r\n"
         "Subject: Sample message 2\r\n"
         "Date: Thu, 23 Aug 2005 11:17:43 +0000\r\n"
         "\r\n"
         "This is the second body.\r\n"_ns,
     }},
});

}  // namespace testing
