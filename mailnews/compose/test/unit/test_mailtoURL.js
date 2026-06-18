/*
 * Test suite for mailto: URL parsing via getParamsForMailto.
 */

function run_test() {
  function test(aTest) {
    const uri = Services.io.newURI(aTest.url);
    const params = MailServices.compose.getParamsForMailto(
      uri,
      null,
      Ci.nsIMsgCompFormat.PlainText
    );
    const fields = params.composeFields;

    Assert.equal(aTest.to, fields.to);
    Assert.equal(aTest.cc, fields.cc);
    Assert.equal(aTest.bcc, fields.bcc);
    Assert.equal(aTest.subject, fields.subject);
    Assert.equal(aTest.body, fields.body);
    Assert.equal(aTest.newsgroups, fields.newsgroups);
    Assert.equal(aTest.references, fields.references);
  }

  for (let i = 0; i < tests.length; i++) {
    test(tests[i]);
  }

  // Security: from=, reply-to=, organization= and priority= are intentionally
  // ignored. Verify they do not leak into compose fields.
  {
    const uri = Services.io.newURI(
      "mailto:?from=attacker@example.com&reply-to=other@example.com" +
        "&organization=EvilCorp&priority=urgent"
    );
    const params = MailServices.compose.getParamsForMailto(
      uri,
      null,
      Ci.nsIMsgCompFormat.PlainText
    );
    const fields = params.composeFields;
    Assert.equal("", fields.from);
    Assert.equal("", fields.replyTo);
    Assert.equal("", fields.organization);
    // 'priority' isn't exposed on nsIMsgCompFields, but from= is the critical
    // one (would enable sender spoofing if leaked).
  }
}

var tests = [
  {
    url: "mailto:one@example.com",
    to: "one@example.com",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:two@example.com?",
    to: "two@example.com",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    references: "",
    newsgroups: "",
  },
  // The hierarchical-part address gets decoded by the compose fields layer.
  {
    url: "mailto:%3D%3FUTF-8%3FQ%3Fthree%3F%3D@example.com",
    to: "three@example.com",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    references: "",
    newsgroups: "",
  },
  // A to=address should be mime-decoded.
  {
    url: "mailto:?to=%3D%3FUTF-8%3FQ%3Ffour%3F%3D@example.com",
    to: "four@example.com",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:fivea@example.com?to=%3D%3FUTF-8%3FQ%3Ffiveb%3F%3D@example.com",
    to: "fivea@example.com, fiveb@example.com",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:sixa@example.com?to=sixb@example.com&to=sixc@example.com",
    to: "sixa@example.com, sixb@example.com, sixc@example.com",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:?cc=seven@example.com",
    to: "",
    cc: "seven@example.com",
    bcc: "",
    subject: "",
    body: "",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:?cc=%3D%3FUTF-8%3FQ%3Feight%3F%3D@example.com",
    to: "",
    cc: "eight@example.com",
    bcc: "",
    subject: "",
    body: "",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:?bcc=nine@example.com",
    to: "",
    cc: "",
    bcc: "nine@example.com",
    subject: "",
    body: "",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:?bcc=%3D%3FUTF-8%3FQ%3Ften%3F%3D@example.com",
    to: "",
    cc: "",
    bcc: "ten@example.com",
    subject: "",
    body: "",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:?subject=foo",
    to: "",
    cc: "",
    bcc: "",
    subject: "foo",
    body: "",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:?subject=%62%61%72",
    to: "",
    cc: "",
    bcc: "",
    subject: "bar",
    body: "",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:?subject=%3D%3Futf-8%3FQ%3F%3DC2%3DA1encoded_subject%21%3F%3D",
    to: "",
    cc: "",
    bcc: "",
    subject: "\u00A1encoded subject!",
    body: "",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:?body=one%20body",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "one body",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:?body=two%20bodies&body=two%20lines",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "two bodies\ntwo lines",
    references: "",
    newsgroups: "",
  },
  // html-part/html-body trigger HTML compose mode, so the body gets sanitized
  // into a full HTML document by HTMLSanitize.
  {
    url: "mailto:?html-part=html%20part",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "<html><head></head><body>html part</body></html>",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:?html-body=html%20body",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "<html><head></head><body>html body</body></html>",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:?html-part=html%20part&html-body=html-body%20trumps%20earlier%20html-part",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "<html><head></head><body>html-body trumps earlier html-part</body></html>",
    references: "",
    newsgroups: "",
  },
  {
    url: "mailto:?references=%3Cref1%40example.com%3E",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    references: "<ref1@example.com>",
    newsgroups: "",
  },
  {
    url: "mailto:?in-reply-to=%3Crepl1%40example.com%3E",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    references: "<repl1@example.com>",
    newsgroups: "",
  },
  {
    url:
      "mailto:?references=%3Cref2%40example.com%3E" +
      "&in-reply-to=%3Crepl2%40example.com%3E",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    references: "<ref2@example.com> <repl2@example.com>",
    newsgroups: "",
  },
  // When in-reply-to is already the last entry in references, don't duplicate.
  {
    url:
      "mailto:?references=%3Cref3%40example.com%3E%20%3Crepl3%40example.com%3E" +
      "&in-reply-to=%3Crepl3%40example.com%3E",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    references: "<ref3@example.com> <repl3@example.com>",
    newsgroups: "",
  },
  {
    url: "mailto:?newsgroups=mozilla.dev.apps.thunderbird",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    references: "",
    newsgroups: "mozilla.dev.apps.thunderbird",
  },
  {
    url: "mailto:?newsgroups=%3D%3FUTF-8%3FQ%3Fmozilla.test.multimedia%3F%3D",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    references: "",
    newsgroups: "mozilla.test.multimedia",
  },
  // Case-insensitive parameter name matching (hex-encoded names).
  {
    url: "mailto:?%74%4F=to&%73%55%62%4A%65%43%74=subject&%62%4F%64%59=body&%63%43=cc&%62%43%63=bcc",
    to: "to",
    cc: "cc",
    bcc: "bcc",
    subject: "subject",
    body: "body",
    references: "",
    newsgroups: "",
  },
  // Mixed percent-encoded and plain parameter names with combined sources.
  // Multi-address to/cc/bcc fields round-trip through jsmime's structured
  // header emitter. Bare names (no '@') get spaces around commas;
  // full addresses (with '@') do not.
  {
    url:
      "mailto:to1?%74%4F=to2&to=to3&subject=&%73%55%62%4A%65%43%74=subject" +
      "&%62%4F%64%59=line1&body=line2&%63%43=cc1&cc=cc2&%62%43%63=bcc1&bcc=bcc2",
    to: "to1 , to2 , to3",
    cc: "cc1 , cc2",
    bcc: "bcc1 , bcc2",
    subject: "subject",
    body: "line1\nline2",
    references: "",
    newsgroups: "",
  },
  // Unknown parameter names (non-matching first letters) are silently ignored.
  {
    url: "mailto:?nto=1&nsubject=2&nbody=3&ncc=4&nbcc=5",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    references: "",
    newsgroups: "",
  },
  // Non-ASCII percent-encoded UTF-8 values. Address fields (to/cc/bcc)
  // are round-tripped through jsmime's structured header emitter, which
  // RFC-2047-encodes non-ASCII characters.
  {
    url:
      "mailto:%CE%B1?cc=%CE%B2&bcc=%CE%B3&subject=%CE%B4&body=%CE%B5" +
      "&html-body=%CE%BE&newsgroups=%CE%B6",
    to: "=?UTF-8?B?zrE=?=",
    cc: "=?UTF-8?B?zrI=?=",
    bcc: "=?UTF-8?B?zrM=?=",
    subject: "\u03B4",
    body: "<html><head></head><body>\u03BE</body></html>",
    references: "",
    newsgroups: "\u03B6",
  },
];
