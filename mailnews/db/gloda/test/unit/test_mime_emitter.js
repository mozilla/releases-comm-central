/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * General testing of the JS Mime Emitter to make sure it doesn't choke on any
 *  scenarios.
 *
 * We do not test, but should consider testing:
 * - MimeEncryptedPKCS7, whatever that translates to.
 * - apple double
 * - sun attachment
 */

/*
 * Do not include GlodaTestHelper because we do not want gloda loaded and it
 *  adds a lot of runtime overhead which makes certain debugging strategies like
 *  using chronicle-recorder impractical.
 */

var { GlodaDatastore } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaDatastore.jsm"
);
var { MsgHdrToMimeMessage } = ChromeUtils.import(
  "resource:///modules/gloda/MimeMessage.jsm"
);
var {
  MessageGenerator,
  SyntheticPartLeaf,
  SyntheticPartMultiAlternative,
  SyntheticDegeneratePartEmpty,
  SyntheticPartMultiSignedSMIME,
  SyntheticPartMultiMixed,
  SyntheticPartMultiSignedPGP,
  SyntheticPartMultiRelated,
  SyntheticPartMultiDigest,
  SyntheticPartMultiParallel,
  SyntheticMessageSet,
} = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

// While we're at it, we'll also test the correctness of the GlodaAttachment
// representation, esp. its "I just need the part information to rebuild the
// URLs" claim.
var { GlodaFundAttr } = ChromeUtils.import(
  "resource:///modules/gloda/GlodaFundAttr.jsm"
);

const DEATH_TO_NEWLINE_TYPE_THINGS = /[\r\n]+/g;
var msgGen = new MessageGenerator();
var messageInjection;

var partText = new SyntheticPartLeaf("I am text! Woo!");
var partHtml = new SyntheticPartLeaf(
  "<html><head></head><body>I am HTML! Woo! </body></html>",
  {
    contentType: "text/html",
  }
);
var partEnriched = new SyntheticPartLeaf(
  "<bold><italic>I am not a popular format! sad woo :(</italic></bold>",
  {
    contentType: "text/enriched",
  }
);
var partAlternative = new SyntheticPartMultiAlternative([partText, partHtml]);
var partMailingListFooter = new SyntheticPartLeaf("I am an annoying footer!");

// We need to make sure a part that has content-disposition: attachment, even
// though it doesn't have any filename, still is treated as an attachment.
var tachNoFilename = {
  body: "I like Bordeaux wine",
  contentType: "text/plain",
  disposition: "attachment",
};

// This is an external attachment, i.e. a mime part that basically says "go find
// the attachment on disk, assuming it still exists, here's the path to the file
// on disk". It turns out feed enclosures are presented in the exact same way,
// so this covers this case as well.
var tachExternal = {
  body:
    "You deleted an attachment from this message. The original MIME headers for the attachment were:\n" +
    "Content-Type: image/png;\n" +
    ' name="conversations-bug1.png"\n' +
    "Content-Transfer-Encoding: base64\n" +
    "Content-Disposition: attachment;\n" +
    ' filename="conversations-bug1.png"',
  contentType: "image/png",
  filename: "conversations-bug1.png",
  charset: null,
  format: null,
  encoding: "base64",
  extraHeaders: {
    "X-Mozilla-External-Attachment-URL": "file:///tmp/conversations-bug1.png",
    "X-Mozilla-Altered": 'AttachmentDetached; date="Wed Aug 03 11:11:33 2011"',
  },
};
var tachText = { filename: "bob.txt", body: "I like cheese!" };
var partTachText = new SyntheticPartLeaf(tachText.body, tachText);
var tachInlineText = {
  filename: "foo.txt",
  body: "Rock the mic",
  format: null,
  charset: null,
  disposition: "inline",
};
new SyntheticPartLeaf(tachInlineText.body, tachInlineText);

var tachImage = {
  filename: "bob.png",
  contentType: "image/png",
  encoding: "base64",
  charset: null,
  format: null,
  body: "YWJj\n",
};
var partTachImage = new SyntheticPartLeaf(tachImage.body, tachImage);

var relImage = {
  contentType: "image/png",
  encoding: "base64",
  charset: null,
  format: null,
  contentId: "part1.foo@bar.invalid",
  body: "YWJj\n",
};
var partRelImage = new SyntheticPartLeaf(relImage.body, relImage);

var tachVCard = {
  filename: "bob.vcf",
  contentType: "text/vcard",
  encoding: "7bit",
  body: "begin:vcard\nfn:Bob\nend:vcard\n",
};
var partTachVCard = new SyntheticPartLeaf(tachVCard.body, tachVCard);

var tachApplication = {
  filename: "funky.funk",
  contentType: "application/x-funky",
  body: "funk!",
};
var partTachApplication = new SyntheticPartLeaf(
  tachApplication.body,
  tachApplication
);

var partTachMessages = [msgGen.makeMessage(), msgGen.makeMessage()];

var partEmpty = new SyntheticDegeneratePartEmpty();

var messageInfos = [
  // -- Simple
  {
    name: "text/plain",
    bodyPart: partText,
  },
  {
    name: "text/html",
    bodyPart: partHtml,
  },
  // -- Simply ugly
  {
    name: "text/enriched",
    bodyPart: partEnriched,
  },
  // -- Simple w/attachment
  {
    name: "text/plain w/text attachment (=> multipart/mixed)",
    bodyPart: partText,
    attachments: [tachText],
  },
  {
    name: "text/plain w/image attachment (=> multipart/mixed)",
    bodyPart: partText,
    attachments: [tachImage],
  },
  {
    name: "text/plain w/vcard attachment (=> multipart/mixed)",
    bodyPart: partText,
    attachments: [tachVCard],
  },
  {
    name: "text/plain w/app attachment (=> multipart/mixed)",
    bodyPart: partText,
    attachments: [tachApplication],
  },
  {
    name: "text/html w/text attachment (=> multipart/mixed)",
    bodyPart: partHtml,
    attachments: [tachText],
  },
  {
    name: "text/html w/image attachment (=> multipart/mixed)",
    bodyPart: partHtml,
    attachments: [tachImage],
  },
  {
    name: "text/html w/vcard attachment (=> multipart/mixed)",
    bodyPart: partHtml,
    attachments: [tachVCard],
  },
  {
    name: "text/html w/app attachment (=> multipart/mixed)",
    bodyPart: partHtml,
    attachments: [tachApplication],
  },
  // -- Alternatives
  {
    name: "multipart/alternative: text/plain, text/html",
    bodyPart: partAlternative,
  },
  {
    name: "multipart/alternative plain/html w/text attachment",
    bodyPart: partAlternative,
    attachments: [tachText],
  },
  {
    name: "multipart/alternative plain/html w/image attachment",
    bodyPart: partAlternative,
    attachments: [tachImage],
  },
  {
    name: "multipart/alternative plain/html w/vcard attachment",
    bodyPart: partAlternative,
    attachments: [tachVCard],
  },
  {
    name: "multipart/alternative plain/html w/app attachment",
    bodyPart: partAlternative,
    attachments: [tachApplication],
  },
  // -- S/MIME.
  {
    name: "S/MIME alternative",
    bodyPart: new SyntheticPartMultiSignedSMIME(partAlternative),
  },
  {
    name: "S/MIME alternative with text attachment inside",
    // We have to do the attachment packing ourselves on this one.
    bodyPart: new SyntheticPartMultiSignedSMIME(
      new SyntheticPartMultiMixed([partAlternative, partTachText])
    ),
  },
  {
    name: "S/MIME alternative with image attachment inside",
    // We have to do the attachment packing ourselves on this one.
    bodyPart: new SyntheticPartMultiSignedSMIME(
      new SyntheticPartMultiMixed([partAlternative, partTachImage])
    ),
  },
  {
    name: "S/MIME alternative with image attachment inside",
    // We have to do the attachment packing ourselves on this one.
    bodyPart: new SyntheticPartMultiSignedSMIME(
      new SyntheticPartMultiMixed([partAlternative, partTachVCard])
    ),
  },
  {
    name: "S/MIME alternative with app attachment inside",
    // We have to do the attachment packing ourselves on this one.
    bodyPart: new SyntheticPartMultiSignedSMIME(
      new SyntheticPartMultiMixed([partAlternative, partTachApplication])
    ),
  },
  {
    name: "S/MIME alternative wrapped in mailing list",
    bodyPart: new SyntheticPartMultiMixed([
      new SyntheticPartMultiSignedSMIME(partAlternative),
      partMailingListFooter,
    ]),
  },
  // -- PGP signature
  // We mainly care that all the content-type parameters show up.
  {
    name: "PGP signed alternative",
    bodyPart: new SyntheticPartMultiSignedPGP(partAlternative),
  },
  // -- Attached RFC822
  {
    // Not your average attachment, pack ourselves for now.
    name: "attached rfc822",
    bodyPart: new SyntheticPartMultiMixed([
      partAlternative,
      partTachMessages[0],
    ]),
  },
  // -- Multipart/related
  {
    name: "multipart/related",
    bodyPart: new SyntheticPartMultiRelated([partHtml, partRelImage]),
  },
  {
    name: "multipart/related inside multipart/alternative",
    bodyPart: new SyntheticPartMultiAlternative([
      partText,
      new SyntheticPartMultiRelated([partHtml, partRelImage]),
    ]),
  },
  // -- Multipart/digest
  {
    name: "multipart/digest",
    bodyPart: new SyntheticPartMultiDigest(partTachMessages.concat()),
  },
  // -- Multipart/parallel (allegedly the same as mixed)
  {
    name: "multipart/parallel",
    bodyPart: new SyntheticPartMultiParallel([partText, partTachImage]),
  },
  // --- Previous bugs
  // -- Bug 495057, text/enriched was being dumb
  {
    name: "text/enriched inside related",
    bodyPart: new SyntheticPartMultiRelated([partEnriched]),
  },
  // -- Empty sections
  // This was a crasher because the empty part made us try and close the
  //  child preceding the empty part a second time.  The nested multipart led
  //  to the crash providing evidence of the double-close bug but there was
  //  nothing inherently nested-multipart-requiring to trigger the double-close
  //  bug.
  {
    name: "nested multipart with empty multipart section",
    bodyPart: new SyntheticPartMultiMixed([
      new SyntheticPartMultiRelated([partAlternative, partTachText]),
      partEmpty,
    ]),
  },
  {
    name: "empty multipart section produces no child",
    bodyPart: new SyntheticPartMultiMixed([partText, partEmpty, partTachText]),
  },
];

add_setup(async function () {
  messageInjection = new MessageInjection({ mode: "local" }, msgGen);
  registerCleanupFunction(function () {
    GlodaDatastore.shutdown();
  });
});

add_task(async function test_stream_message() {
  for (const messageInfo of messageInfos) {
    await stream_message(messageInfo);
  }
});

/**
 * Stream
 */
add_task(async function test_sane_bodies() {
  // 60 bytes long... (becomes 59 on the other side when \r is dropped)
  let hugeString =
    "don't know what you want but I can't  stream it anymore...\r\n";
  const powahsOfTwo = 10;
  for (let i = 0; i < powahsOfTwo; i++) {
    hugeString = hugeString + hugeString;
  }
  // This will come out to be 60k, of course.
  Assert.equal(hugeString.length, 60 * Math.pow(2, powahsOfTwo));

  const synMsg = msgGen.makeMessage({
    body: { body: hugeString, contentType: "text/plain" },
  });
  const synSet = new SyntheticMessageSet([synMsg]);
  await messageInjection.addSetsToFolders(
    [messageInjection.getInboxFolder()],
    [synSet]
  );

  const msgHdr = synSet.getMsgHdr(0);

  let promiseResolve;
  const promise = new Promise(resolve => {
    promiseResolve = resolve;
  });

  MsgHdrToMimeMessage(
    msgHdr,
    null,
    function (aMsgHdr, aMimeMsg) {
      const bodyPart = aMimeMsg.parts[0];
      // (the \r gets gone, so it's only 59 per line)
      if (bodyPart.body.length > 20 * 1024 + 59) {
        do_throw(
          "Mime body length is " +
            bodyPart.body.length +
            " bytes long but should not be!"
        );
      }
      promiseResolve();
    },
    false,
    { saneBodySize: true }
  );

  await promise;
});

// Additional testing for the correctness of allAttachments and
// allUserAttachments representation

var partTachNestedMessages = [
  // Looks like the synthetic part generator appends the charset=ISO-8859-1 part
  // all by itself. That allows us to create a non-UTF-8 subject, and ensure the
  // resulting attachment name is indeed São Paulo.eml.
  msgGen.makeMessage({
    subject: "S" + String.fromCharCode(0xe3) + "o Paulo",
    bodyPart: new SyntheticPartLeaf(
      "<html><head></head><body>I am HTML! Woo! </body></html>",
      {
        contentType: "text/html",
      }
    ),
  }),
  msgGen.makeMessage({
    attachments: [tachImage],
  }),
  msgGen.makeMessage({
    attachments: [tachImage, tachApplication],
  }),
];

var attMessagesParams = [
  {
    attachments: [tachNoFilename],
  },
  {
    attachments: [tachExternal],
  },
  {
    name: "attached rfc822",
    bodyPart: new SyntheticPartMultiMixed([
      partAlternative,
      partTachNestedMessages[0],
    ]),
  },
  {
    name: "attached rfc822 w. image inside",
    bodyPart: new SyntheticPartMultiMixed([
      partAlternative,
      partTachNestedMessages[1],
    ]),
  },
  {
    name: "attached x/funky + attached rfc822 w. (image + x/funky) inside",
    bodyPart: new SyntheticPartMultiMixed([
      partAlternative,
      partTachApplication,
      partTachNestedMessages[2],
    ]),
  },
];

var expectedAttachmentsInfo = [
  {
    allAttachmentsContentTypes: ["text/plain"],
    allUserAttachmentsContentTypes: ["text/plain"],
  },
  {
    allAttachmentsContentTypes: ["image/png"],
    allUserAttachmentsContentTypes: ["image/png"],
  },
  {
    allAttachmentsContentTypes: [],
    allUserAttachmentsContentTypes: ["message/rfc822"],
    firstAttachmentName: "S\u00e3o Paulo.eml",
  },
  {
    allAttachmentsContentTypes: ["image/png"],
    allUserAttachmentsContentTypes: ["message/rfc822"],
  },
  {
    allAttachmentsContentTypes: [
      "application/x-funky",
      "image/png",
      "application/x-funky",
    ],
    allUserAttachmentsContentTypes: ["application/x-funky", "message/rfc822"],
  },
];

add_task(async function test_attachments_correctness() {
  for (const [i, params] of attMessagesParams.entries()) {
    const synMsg = msgGen.makeMessage(params);
    const synSet = new SyntheticMessageSet([synMsg]);
    await messageInjection.addSetsToFolders(
      [messageInjection.getInboxFolder()],
      [synSet]
    );

    const msgHdr = synSet.getMsgHdr(0);

    let promiseResolve;
    const promise = new Promise(resolve => {
      promiseResolve = resolve;
    });

    MsgHdrToMimeMessage(
      msgHdr,
      null,
      function (aMsgHdr, aMimeMsg) {
        try {
          const expected = expectedAttachmentsInfo[i];
          if ("firstAttachmentName" in expected) {
            const att = aMimeMsg.allUserAttachments[0];
            Assert.equal(att.name.length, expected.firstAttachmentName.length);
            for (let j = 0; j < att.name.length; ++j) {
              Assert.equal(
                att.name.charCodeAt(j),
                expected.firstAttachmentName.charCodeAt(j)
              );
            }
          }

          Assert.equal(
            aMimeMsg.allAttachments.length,
            expected.allAttachmentsContentTypes.length
          );
          for (const [j, att] of aMimeMsg.allAttachments.entries()) {
            Assert.equal(
              att.contentType,
              expected.allAttachmentsContentTypes[j]
            );
          }

          Assert.equal(
            aMimeMsg.allUserAttachments.length,
            expected.allUserAttachmentsContentTypes.length
          );
          for (const [j, att] of aMimeMsg.allUserAttachments.entries()) {
            Assert.equal(
              att.contentType,
              expected.allUserAttachmentsContentTypes[j]
            );
          }

          // Test
          for (const att of aMimeMsg.allUserAttachments) {
            const uri = aMsgHdr.folder.getUriForMsg(aMsgHdr);
            const glodaAttachment = GlodaFundAttr.glodaAttFromMimeAtt(
              { folderMessageURI: uri },
              att
            );
            // The GlodaAttachment appends the filename, which is not always
            // present
            Assert.ok(glodaAttachment.url.startsWith(att.url));
          }
        } catch (e) {
          dump(aMimeMsg.prettyString() + "\n");
          do_throw(e);
        }

        promiseResolve();
      },
      false
    );

    await promise;
  }
});

var bogusMessage = msgGen.makeMessage({ body: { body: "whatever" } });
bogusMessage._contentType = "woooooo"; // Breaking abstraction boundaries. Bad.

var weirdMessageInfos = [
  // This message has an unnamed part as an attachment (with
  // Content-Disposition: inline and which is displayable inline). Previously,
  // libmime would emit notifications for this to be treated as an attachment,
  // name Part 1.2. Now it's not the case anymore, so we should ensure this
  // message has no attachments.
  {
    name: "test message with part 1.2 attachment",
    attachments: [
      {
        body: "attachment",
        filename: "",
        format: "",
      },
    ],
  },
];

add_task(async function test_part12_not_an_attachment() {
  const synMsg = msgGen.makeMessage(weirdMessageInfos[0]);
  const synSet = new SyntheticMessageSet([synMsg]);
  await messageInjection.addSetsToFolders(
    [messageInjection.getInboxFolder()],
    [synSet]
  );

  const msgHdr = synSet.getMsgHdr(0);

  let promiseResolve;
  const promise = new Promise(resolve => {
    promiseResolve = resolve;
  });

  MsgHdrToMimeMessage(msgHdr, null, function (aMsgHdr, aMimeMsg) {
    try {
      Assert.ok(aMimeMsg.allUserAttachments.length == 0);
      Assert.ok(aMimeMsg.allAttachments.length == 0);
    } catch (e) {
      do_throw(e);
    }
    promiseResolve();
  });

  await promise;
});

async function stream_message(info) {
  const synMsg = msgGen.makeMessage(info);
  const synSet = new SyntheticMessageSet([synMsg]);
  await messageInjection.addSetsToFolders(
    [messageInjection.getInboxFolder()],
    [synSet]
  );

  const msgHdr = synSet.getMsgHdr(0);

  let promiseResolve;
  const promise = new Promise(resolve => {
    promiseResolve = resolve;
  });
  MsgHdrToMimeMessage(msgHdr, null, function (aMsgHdr, aMimeMsg) {
    verify_stream_message(info, synMsg, aMsgHdr, aMimeMsg);
    promiseResolve();
  });

  await promise;
}
/**
 * Verify the streamed results are what we wanted.  For now, this just means
 *  receiving a representation; we don't check it for correctness.
 */
function verify_stream_message(aInfo, aSynMsg, aMsgHdr, aMimeMsg) {
  if (aMimeMsg == null) {
    do_throw("We really should have gotten a result!");
  }
  try {
    // aMimeMsg is normalized; it only ever actually gets one child.
    verify_body_part_equivalence(aSynMsg.bodyPart, aMimeMsg.parts[0]);
  } catch (ex) {
    dump("Something was wrong with the MIME rep!\n!!!!!!!!\n");
    dump("Synthetic looks like:\n  " + aSynMsg.prettyString() + "\n\n");
    dump(
      "MIME looks like:  \n" + aMimeMsg.prettyString(true, "  ", true) + "\n\n"
    );
    do_throw(ex);
  }

  dump("Everything is just fine.\n");
  dump("Synthetic looks like:\n  " + aSynMsg.prettyString() + "\n\n");
  dump(
    "MIME looks like:\n  " + aMimeMsg.prettyString(true, "  ", false) + "\n\n"
  );
}

/**
 * Applies any transformations to the synthetic body part that we would expect
 *  to happen to a message during its libmime journey.  It may be better to
 *  just put the expected translations in the synthetic body part instead of
 *  trying to make this method do anything complex.
 */
function synTransformBody(aSynBodyPart) {
  let text = aSynBodyPart.body.trim();
  // This transforms things into HTML apparently.
  if (aSynBodyPart._contentType == "text/enriched") {
    // Our job here is just to transform just enough for our example above.
    // We also could have provided a manual translation on the body part.
    text = text.replace(/bold/g, "B").replace(/italic/g, "I");
  }
  return text;
}

function verify_body_part_equivalence(aSynBodyPart, aMimePart) {
  // The content-type devoid of parameters should match.
  Assert.equal(aSynBodyPart._contentType, aMimePart.contentType);

  // The header representation of the content-type should also match unless
  //  this is an rfc822 part, in which case it should only match for the
  //  actual contents.
  if (aMimePart.contentType != "message/rfc822") {
    Assert.equal(
      aSynBodyPart.contentTypeHeaderValue.replace(
        DEATH_TO_NEWLINE_TYPE_THINGS,
        ""
      ),
      aMimePart.get("content-type").replace(DEATH_TO_NEWLINE_TYPE_THINGS, "")
    );
  }

  // XXX body part checking will get brittle if we ever actually encode things!
  if (
    aSynBodyPart.body &&
    !aSynBodyPart._filename &&
    aSynBodyPart._contentType.startsWith("text/")
  ) {
    Assert.equal(
      synTransformBody(aSynBodyPart),
      aMimePart.body
        .trim()
        .replace(/\r/g, "")
        // Remove stuff added by libmime for HTML parts.
        .replace(
          /[\n]*<meta http-equiv="content-type" content="text\/html; .*">[\n]*/g,
          ""
        )
        .replace(/[\n]+<\/body>/, "</body>")
    );
  }
  if (aSynBodyPart.parts) {
    let iPart;
    let realPartOffsetCompensator = 0;
    for (iPart = 0; iPart < aSynBodyPart.parts.length; iPart++) {
      const subSyn = aSynBodyPart.parts[iPart];
      // If this is a degenerate empty, it should not produce output, so
      //  compensate for the offset drift and get on with our lives.
      if (subSyn instanceof SyntheticDegeneratePartEmpty) {
        realPartOffsetCompensator--;
        continue;
      }
      const subMime = aMimePart.parts[iPart + realPartOffsetCompensator];
      // Our special case is the signature, which libmime does not expose to us.
      // Ignore! (Also, have our too-many-part checker below not trip on this.)
      if (subSyn._contentType != "application/x-pkcs7-signature") {
        if (subMime == null) {
          do_throw(
            "No MIME part matching " + subSyn.contentTypeHeaderValue + "\n"
          );
        }
        verify_body_part_equivalence(subSyn, subMime);
      }
    }
    // Only check if there are still more mime parts; don't check for a count
    //  mismatch (the PKCS case from above needs to be handled).
    if (iPart < aMimePart.parts.length) {
      do_throw("MIME part has more sub-parts than syn part?");
    }
  }
}
