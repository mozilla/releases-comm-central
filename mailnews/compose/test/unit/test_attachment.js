/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for attachment file name.
 */

var input0 =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_" +
  "`abcdefghijklmnopqrstuvwxyz{|}~" +
  "\xa0\xa1\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xab\xac\xad\xae\xaf" +
  "\xb0\xb1\xb2\xb3\xb4\xb5\xb6\xb7\xb8\xb9\xba\xbb\xbc\xbd\xbe\xbf" +
  "\xc0\xc1\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xcb\xcc\xcd\xce\xcf" +
  "\xd0\xd1\xd2\xd3\xd4\xd5\xd6\xd7\xd8\xd9\xda\xdb\xdc\xdd\xde\xdf" +
  "\xe0\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xeb\xec\xed\xee\xef" +
  "\xf0\xf1\xf2\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xfa\xfb\xfc\xfd\xfe\xff.txt";

// ascii only
var input1 =
  "x!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_" +
  "`abcdefghijklmnopqrstuvwxyz{|}~.txt";

var expectedCD0 = [
  "Content-Disposition: attachment;",
  " filename*0*=UTF-8''%20%21%22%23%24%25%26%27%28%29%2A%2B%2C%2D%2E%2F%30%31;",
  " filename*1*=%32%33%34%35%36%37%38%39%3A%3B%3C%3D%3E%3F%40%41%42%43%44%45;",
  " filename*2*=%46%47%48%49%4A%4B%4C%4D%4E%4F%50%51%52%53%54%55%56%57%58%59;",
  " filename*3*=%5A%5B%5C%5D%5E%5F%60%61%62%63%64%65%66%67%68%69%6A%6B%6C%6D;",
  " filename*4*=%6E%6F%70%71%72%73%74%75%76%77%78%79%7A%7B%7C%7D%7E%C2%A0;",
  " filename*5*=%C2%A1%C2%A2%C2%A3%C2%A4%C2%A5%C2%A6%C2%A7%C2%A8%C2%A9%C2%AA;",
  " filename*6*=%C2%AB%C2%AC%C2%AD%C2%AE%C2%AF%C2%B0%C2%B1%C2%B2%C2%B3%C2%B4;",
  " filename*7*=%C2%B5%C2%B6%C2%B7%C2%B8%C2%B9%C2%BA%C2%BB%C2%BC%C2%BD%C2%BE;",
  " filename*8*=%C2%BF%C3%80%C3%81%C3%82%C3%83%C3%84%C3%85%C3%86%C3%87%C3%88;",
  " filename*9*=%C3%89%C3%8A%C3%8B%C3%8C%C3%8D%C3%8E%C3%8F%C3%90%C3%91%C3%92;",
  " filename*10*=%C3%93%C3%94%C3%95%C3%96%C3%97%C3%98%C3%99%C3%9A%C3%9B;",
  " filename*11*=%C3%9C%C3%9D%C3%9E%C3%9F%C3%A0%C3%A1%C3%A2%C3%A3%C3%A4;",
  " filename*12*=%C3%A5%C3%A6%C3%A7%C3%A8%C3%A9%C3%AA%C3%AB%C3%AC%C3%AD;",
  " filename*13*=%C3%AE%C3%AF%C3%B0%C3%B1%C3%B2%C3%B3%C3%B4%C3%B5%C3%B6;",
  " filename*14*=%C3%B7%C3%B8%C3%B9%C3%BA%C3%BB%C3%BC%C3%BD%C3%BE%C3%BF%2E;",
  " filename*15*=%74%78%74",
  "",
].join("\r\n");

var expectedCD1 =
  "Content-Disposition: attachment;\r\n" +
  ' filename*0="x!\\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ";\r\n' +
  ' filename*1="[\\\\]^_`abcdefghijklmnopqrstuvwxyz{|}~.txt"\r\n';

var ParamFoldingPref = {
  // RFC2047: 0,
  RFC2047WithCRLF: 1,
  RFC2231: 2,
};

var expectedCTList0 = {
  RFC2047:
    "Content-Type: text/plain; charset=UTF-8;\r\n" +
    ' name="=?UTF-8?B?ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj9AQUJDREVGR0hJ?=' +
    "=?UTF-8?Q?JKLMNOPQRSTUVWXYZ=5b=5c=5d=5e=5f=60abcdefghijklmnopqrstuvwx?=" +
    "=?UTF-8?B?eXp7fH1+wqDCocKiwqPCpMKlwqbCp8KowqnCqsKrwqzCrcKuwq/CsMKx?=" +
    "=?UTF-8?B?wrLCs8K0wrXCtsK3wrjCucK6wrvCvMK9wr7Cv8OAw4HDgsODw4TDhcOG?=" +
    "=?UTF-8?B?w4fDiMOJw4rDi8OMw43DjsOPw5DDkcOSw5PDlMOVw5bDl8OYw5nDmsOb?=" +
    "=?UTF-8?B?w5zDncOew5/DoMOhw6LDo8Okw6XDpsOnw6jDqcOqw6vDrMOtw67Dr8Ow?=" +
    '=?UTF-8?B?w7HDssOzw7TDtcO2w7fDuMO5w7rDu8O8w73DvsO/LnR4dA==?="\r\n',

  RFC2047WithCRLF:
    "Content-Type: text/plain; charset=UTF-8;\r\n" +
    ' name="=?UTF-8?B?ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj9AQUJDREVGR0hJ?=\r\n' +
    " =?UTF-8?Q?JKLMNOPQRSTUVWXYZ=5b=5c=5d=5e=5f=60abcdefghijklmnopqrstuvwx?=\r\n" +
    " =?UTF-8?B?eXp7fH1+wqDCocKiwqPCpMKlwqbCp8KowqnCqsKrwqzCrcKuwq/CsMKx?=\r\n" +
    " =?UTF-8?B?wrLCs8K0wrXCtsK3wrjCucK6wrvCvMK9wr7Cv8OAw4HDgsODw4TDhcOG?=\r\n" +
    " =?UTF-8?B?w4fDiMOJw4rDi8OMw43DjsOPw5DDkcOSw5PDlMOVw5bDl8OYw5nDmsOb?=\r\n" +
    " =?UTF-8?B?w5zDncOew5/DoMOhw6LDo8Okw6XDpsOnw6jDqcOqw6vDrMOtw67Dr8Ow?=\r\n" +
    ' =?UTF-8?B?w7HDssOzw7TDtcO2w7fDuMO5w7rDu8O8w73DvsO/LnR4dA==?="\r\n',

  RFC2231: "Content-Type: text/plain; charset=UTF-8\r\n",
};

var expectedCTList1 = {
  RFC2047:
    "Content-Type: text/plain; charset=UTF-8;\r\n" +
    ' name="x!\\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\\\]^_`abcdefghijklmnopqrstuvwxyz{|}~.txt"\r\n',

  RFC2047WithCRLF:
    "Content-Type: text/plain; charset=UTF-8;\r\n" +
    ' name="x!\\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\\\]^_`abcdefghijklmnopqrstuvwxyz{|}~.txt"\r\n',

  RFC2231: "Content-Type: text/plain; charset=UTF-8\r\n",
};

function checkAttachment(expectedCD, expectedCT) {
  let msgData = mailTestUtils.loadMessageToString(
    gDraftFolder,
    mailTestUtils.firstMsgHdr(gDraftFolder)
  );
  let pos = msgData.indexOf("Content-Disposition:");
  Assert.notEqual(pos, -1);
  let contentDisposition = msgData.substr(pos);
  pos = 0;
  do {
    pos = contentDisposition.indexOf("\n", pos);
    Assert.notEqual(pos, -1);
    pos++;
  } while (contentDisposition.startsWith(" ", pos));
  contentDisposition = contentDisposition.substr(0, pos);
  Assert.equal(contentDisposition, expectedCD);

  pos = msgData.indexOf("Content-Type:"); // multipart
  Assert.notEqual(pos, -1);
  msgData = msgData.substr(pos + 13);
  pos = msgData.indexOf("Content-Type:"); // body
  Assert.notEqual(pos, -1);
  msgData = msgData.substr(pos + 13);
  pos = msgData.indexOf("Content-Type:"); // first attachment
  Assert.notEqual(pos, -1);
  var contentType = msgData.substr(pos);
  pos = 0;
  do {
    pos = contentType.indexOf("\n", pos);
    Assert.notEqual(pos, -1);
    pos++;
  } while (contentType.startsWith(" ", pos));
  contentType = contentType.substr(0, pos);
  Assert.equal(contentType.toLowerCase(), expectedCT.toLowerCase());
}

async function testInput0() {
  for (const folding in ParamFoldingPref) {
    Services.prefs.setIntPref(
      "mail.strictly_mime.parm_folding",
      ParamFoldingPref[folding]
    );
    await createMessage(input0);
    checkAttachment(expectedCD0, expectedCTList0[folding]);
  }
}

async function testInput1() {
  for (const folding in ParamFoldingPref) {
    Services.prefs.setIntPref(
      "mail.strictly_mime.parm_folding",
      ParamFoldingPref[folding]
    );
    await createMessage(input1);
    checkAttachment(expectedCD1, expectedCTList1[folding]);
  }
}

var tests = [testInput0, testInput1];

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  tests.forEach(x => add_task(x));
  run_next_test();
}

/**
 * Test that the full attachment content is used to pick the CTE.
 */
add_task(async function testBinaryAfterPlainTextAttachment() {
  const testFile = do_get_file("data/binary-after-plain.txt");
  await createMessage(testFile);
  const msgData = mailTestUtils.loadMessageToString(
    gDraftFolder,
    mailTestUtils.firstMsgHdr(gDraftFolder)
  );
  // If only the first few chars are used, encoding will be incorrectly 7bit.
  Assert.ok(
    msgData.includes(
      'Content-Disposition: attachment; filename="binary-after-plain.txt"\r\nContent-Transfer-Encoding: base64\r\n'
    )
  );
});
