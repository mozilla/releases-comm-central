/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * General testing of the byte-counting libmime facility, to make sure that what
 * is streamed to us is actually labeled with the right size.
 */

/*
 * Do not include glodaTestHelper because we do not want gloda loaded and it
 *  adds a lot of runtime overhead which makes certain debugging strategies like
 *  using chronicle-recorder impractical.
 */

var { MsgHdrToMimeMessage } = ChromeUtils.importESModule(
  "resource:///modules/gloda/MimeMessage.sys.mjs"
);
var {
  MessageGenerator,
  SyntheticPartLeaf,
  SyntheticPartMultiMixed,
  SyntheticPartMultiRelated,
  SyntheticMessageSet,
} = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

var msgGen = new MessageGenerator();
var messageInjection;

add_setup(function () {
  // Sanity check: figure out how many bytes the original text occupies in UTF-8 encoding
  Assert.equal(
    new TextEncoder().encode(originalText).length,
    originalTextByteCount
  );

  messageInjection = new MessageInjection({ mode: "local" }, msgGen);
});

var htmlText = "<html><head></head><body>I am HTML! Woo! </body></html>";

var partHtml = new SyntheticPartLeaf(htmlText, {
  contentType: "text/html",
});

// This text is 168 characters long, and occupies 173 bytes when encoded in
// UTF-8. (We make sure it occupies 173 bytes in run_test below). Note that
// you cannot use this text directly because it isn't pure ASCII. You must use
// one of the encoded forms below.
var originalText =
  "Longtemps, je me suis couché de bonne heure. Parfois, à " +
  "peine ma bougie éteinte, mes yeux se fermaient si vite que je n'avais pas le " +
  "temps de me dire : « Je m'endors. »";
var originalTextByteCount = 173;

var b64Text =
  "TG9uZ3RlbXBzLCBqZSBtZSBzdWlzIGNvdWNow6kgZGUgYm9ubmUgaGV1cmUuIFBhcmZvaXMs\n" +
  "IMOgIHBlaW5lIG1hIGJvdWdpZSDDqXRlaW50ZSwgbWVzIHlldXggc2UgZmVybWFpZW50IHNp\n" +
  "IHZpdGUgcXVlIGplIG4nYXZhaXMgcGFzIGxlIHRlbXBzIGRlIG1lIGRpcmUgOiDCqyBKZSBt\n" +
  "J2VuZG9ycy4gwrsK";

var qpText =
  "Longtemps,=20je=20me=20suis=20couch=C3=A9=20de=20bonne=20heure.=20Parfois,=\n" +
  "=20=C3=A0=20peine=20ma=20bougie=20=C3=A9teinte,=20mes=20yeux=20se=20fermaie=\n" +
  "nt=20si=20vite=20que=20je=20n'avais=20pas=20le=20temps=20de=20me=20dire=20:=\n" +
  "=20=C2=AB=20Je=20m'endors.=20=C2=BB";

var uuText =
  "begin 666 -\n" +
  'M3&]N9W1E;7!S+"!J92!M92!S=6ES(&-O=6-HPZD@9&4@8F]N;F4@:&5U<F4N\n' +
  "M(%!A<F9O:7,L(,.@('!E:6YE(&UA(&)O=6=I92##J71E:6YT92P@;65S('EE\n" +
  "M=7@@<V4@9F5R;6%I96YT('-I('9I=&4@<75E(&IE(&XG879A:7,@<&%S(&QE\n" +
  "G('1E;7!S(&1E(&UE(&1I<F4@.B#\"JR!*92!M)V5N9&]R<RX@PKL*\n" +
  "\n" +
  "end";

var yencText =
  "Hello there --\n" +
  "=ybegin line=128 size=174 name=jane.doe\n" +
  "\x76\x99\x98\x91\x9e\x8f\x97\x9a\x9d\x56\x4a\x94\x8f\x4a\x97\x8f" +
  "\x4a\x9d\x9f\x93\x9d\x4a\x8d\x99\x9f\x8d\x92\xed\xd3\x4a\x8e\x8f" +
  "\x4a\x8c\x99\x98\x98\x8f\x4a\x92\x8f\x9f\x9c\x8f\x58\x4a\x7a\x8b" +
  "\x9c\x90\x99\x93\x9d\x56\x4a\xed\xca\x4a\x9a\x8f\x93\x98\x8f\x4a" +
  "\x97\x8b\x4a\x8c\x99\x9f\x91\x93\x8f\x4a\xed\xd3\x9e\x8f\x93\x98" +
  "\x9e\x8f\x56\x4a\x97\x8f\x9d\x4a\xa3\x8f\x9f\xa2\x4a\x9d\x8f\x4a" +
  "\x90\x8f\x9c\x97\x8b\x93\x8f\x98\x9e\x4a\x9d\x93\x4a\xa0\x93\x9e" +
  "\x8f\x4a\x9b\x9f\x8f\x4a\x94\x8f\x4a\x98\x51\x8b\xa0\x8b\x93\x9d" +
  "\x0d\x0a\x4a\x9a\x8b\x9d\x4a\x96\x8f\x4a\x9e\x8f\x97\x9a\x9d\x4a" +
  "\x8e\x8f\x4a\x97\x8f\x4a\x8e\x93\x9c\x8f\x4a\x64\x4a\xec\xd5\x4a" +
  "\x74\x8f\x4a\x97\x51\x8f\x98\x8e\x99\x9c\x9d\x58\x4a\xec\xe5\x34" +
  "\x0d\x0a" +
  "=yend size=174 crc32=7efccd8e\n";

// That completely exotic encoding is only detected if there is no content type
// on the message, which is usually the case in newsgroups. I hate you yencode!
// var partYencText = new SyntheticPartLeaf("I am text! Woo!\n\n" + yencText, {
//   contentType: "",
//   charset: "",
//   format: "",
// });

var partUUText = new SyntheticPartLeaf(
  "I am text! With uuencode... noes...\n\n" + uuText,
  {
    contentType: "",
    charset: "",
    format: "",
  }
);

var tachText = {
  filename: "bob.txt",
  body: qpText,
  charset: "utf-8",
  encoding: "quoted-printable",
};

var tachInlineText = {
  filename: "foo.txt",
  body: qpText,
  format: null,
  charset: "utf-8",
  encoding: "quoted-printable",
  disposition: "inline",
};

// Images have a different behavior than other attachments: they are displayed
// inline most of the time, so there are two different code paths that need to
// enable streaming and byte counting to the JS mime emitter.

var tachImage = {
  filename: "bob.png",
  contentType: "image/png",
  encoding: "base64",
  charset: null,
  format: null,
  body: b64Text,
};

var tachPdf = {
  filename: "bob.pdf",
  contentType: "application/pdf",
  encoding: "base64",
  charset: null,
  format: null,
  body: b64Text,
};

var tachUU = {
  filename: "john.doe",
  contentType: "application/x-uuencode",
  encoding: "uuencode",
  charset: null,
  format: null,
  body: uuText,
};

var tachApplication = {
  filename: "funky.funk",
  contentType: "application/x-funky",
  encoding: "base64",
  body: b64Text,
};

var relImage = {
  contentType: "image/png",
  encoding: "base64",
  charset: null,
  format: null,
  contentId: "part1.foo@bar.invalid",
  body: b64Text,
};

var tachVCard = {
  filename: "bob.vcf",
  contentType: "text/vcard",
  encoding: "7bit",
  body: "begin:vcard\nfn:Bob\nend:vcard\n",
};
var partTachVCard = new SyntheticPartLeaf(tachVCard.body, tachVCard);

new SyntheticPartLeaf(relImage.body, relImage);

var messageInfos = [
  {
    name: "uuencode inline",
    bodyPart: partUUText,
    subject: "duh",
    epsilon: 1,
    checkTotalSize: false,
  },
  // Encoding type specific to newsgroups, not interested, gloda doesn't even
  // treat this as an attachment (probably because gloda requires an attachment
  // to have a content-type, which these yencoded parts don't have), but size IS
  // counted properly nonetheless.
  /* {
    name: 'text/plain with yenc inline',
    bodyPart: partYencText,
    subject: "yEnc-Prefix: \"jane.doe\" 174 yEnc bytes - yEnc test (1)",
  },*/
  // Inline image, not interested either, gloda doesn't keep that as an
  // attachment (probably a deliberate choice), size is NOT counted properly.
  // (don't want to investigate, I doubt it's a useful information anyway.)
  /* {
    name: 'multipart/related',
    bodyPart: new SyntheticPartMultiRelated([partHtml, partRelImage]),
  },*/
  // This doesn't really make sense because it returns the length of the
  // encoded blob without the envelope. Disabling as part of bug 711980.
  /* {
    name: '.eml attachment',
    bodyPart: new SyntheticPartMultiMixed([
      partHtml,
      msgGen.makeMessage({ body: { body: qpText,
                                   charset: "UTF-8",
                                   encoding: "quoted-printable" } }),
    ]),
    epsilon: 1,
  },*/
  // All of the other common cases work fine.
  {
    name: 'all sorts of "real" attachments',
    bodyPart: partHtml,
    attachments: [
      tachImage,
      tachPdf,
      tachUU,
      tachApplication,
      tachText,
      tachInlineText,
    ],
    epsilon: 2,
  },
];

add_task(async function test_message_attachments() {
  for (const messageInfo of messageInfos) {
    await message_attachments(messageInfo);
  }
});

var bogusMessage = msgGen.makeMessage({ body: { body: originalText } });
bogusMessage._contentType = "woooooo"; // Breaking abstraction boundaries. Bad.

var bogusMessageInfos = [
  // In this case, the wooooo part is not an attachment, so its bytes won't be
  // counted (size will end up being 0 bytes). We don't check the size, but
  // check_bogus_parts makes sure we're able to come up with a resulting size
  // for the MimeMessage.
  //
  // In that very case, since message M is an attachment, libmime will count M's
  // bytes, and we could have MimeMessages prefer the size libmime tells them
  // (when they have it), rather than recursively computing their sizes. I'm not
  // sure changing jsmimeemitter.js is worth the trouble just for buggy
  // messages...
  {
    name: ".eml attachment with inner MimeUnknown",
    bodyPart: new SyntheticPartMultiMixed([
      partHtml,
      msgGen.makeMessage({
        // <--- M
        bodyPart: new SyntheticPartMultiMixed([
          new SyntheticPartMultiRelated([
            partHtml,
            new SyntheticPartLeaf(htmlText, { contentType: "woooooo" }),
          ]),
        ]),
      }),
    ]),
    epsilon: 6,
    checkSize: false,
  },
];

add_task(async function test_bogus_messages() {
  for (const bogusMessageInfo of bogusMessageInfos) {
    await bogus_messages(bogusMessageInfo);
  }
});

add_task(async function test_have_attachments() {
  // The goal here is to explicitly check that these messages have attachments.
  const number = 1;
  const synMsg = msgGen.makeMessage({
    name: "multipart/related",
    bodyPart: new SyntheticPartMultiMixed([partHtml, partTachVCard]),
    number,
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
  MsgHdrToMimeMessage(msgHdr, null, function (aMsgHdr, aMimeMsg) {
    try {
      Assert.equal(aMimeMsg.allUserAttachments.length, number);
      promiseResolve();
    } catch (e) {
      do_throw(e);
    }
  });

  await promise;
});

async function message_attachments(info) {
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
    try {
      check_attachments(
        aMimeMsg,
        info.epsilon,
        "checkTotalSize" in info ? info.checkTotalSize : undefined
      );
      promiseResolve();
    } catch (e) {
      do_throw(e);
    }
  });

  await promise;
}

function check_attachments(aMimeMsg, epsilon, checkTotalSize) {
  if (aMimeMsg == null) {
    do_throw("We really should have gotten a result!");
  }

  /* It is hard to get a byte count that's perfectly accurate. When composing
   * the message, the MIME structure goes like this (for an encoded attachment):
   *
   * XXXXXXXXXX
   * XXXXXXXXXX    <-- encoded block
   * XXXXXXXXXX
   *               <-- newline
   * --chopchop    <-- MIME separator
   *
   * libmime counts bytes all the way up to the separator, which means it counts
   * the bytes for the extra line. Since newlines in emails are \n, most of the
   * time we get att.size = 174 instead of 173.
   *
   * The good news is, it's just a fixed extra cost. There no issues with the
   * inner contents of the attachment, you can add as many newlines as you want
   * in it, Unix or Windows, the count won't get past the bounds.
   */

  Assert.ok(aMimeMsg.allUserAttachments.length > 0);

  let totalSize = htmlText.length;

  for (const att of aMimeMsg.allUserAttachments) {
    dump("*** Attachment now is " + att.name + " " + att.size + "\n");
    Assert.ok(Math.abs(att.size - originalTextByteCount) <= epsilon);
    totalSize += att.size;
  }

  // Undefined means true.
  if (checkTotalSize !== false) {
    dump(
      "*** Total size comparison: " + totalSize + " vs " + aMimeMsg.size + "\n"
    );
    Assert.ok(Math.abs(aMimeMsg.size - totalSize) <= epsilon);
  }
}

function check_bogus_parts(aMimeMsg, { epsilon, checkSize }) {
  if (aMimeMsg == null) {
    do_throw("We really should have gotten a result!");
  }

  // First make sure the size is computed properly
  const x = parseInt(aMimeMsg.size);
  Assert.ok(!isNaN(x));

  const sep = "@mozilla.org/windows-registry-key;1" in Cc ? "\r\n" : "\n";

  if (checkSize) {
    let partSize = 0;
    // The attachment, although a MimeUnknown part, is actually plain/text that
    // contains the whole attached message, including headers. Count them.
    for (const k in bogusMessage.headers) {
      const v = bogusMessage.headers[k];
      partSize += (k + ": " + v + sep).length;
    }
    // That's the newline between the headers and the message body.
    partSize += sep.length;
    // That's the message body.
    partSize += originalTextByteCount;
    // That's the total length that's to be returned by the MimeMessage abstraction.
    const totalSize = htmlText.length + partSize;
    dump(totalSize + " vs " + aMimeMsg.size + "\n");
    Assert.ok(Math.abs(aMimeMsg.size - totalSize) <= epsilon);
  }
}

async function bogus_messages(info) {
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
    try {
      check_bogus_parts(aMimeMsg, info);
      promiseResolve();
    } catch (e) {
      do_throw(e);
    }
  });

  await promise;
}
