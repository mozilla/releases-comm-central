/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for attachment file name.
 */

var input0 = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_"+
    "`abcdefghijklmnopqrstuvwxyz{|}~"+
    "\xa0\xa1\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xab\xac\xad\xae\xaf"+
    "\xb0\xb1\xb2\xb3\xb4\xb5\xb6\xb7\xb8\xb9\xba\xbb\xbc\xbd\xbe\xbf"+
    "\xc0\xc1\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xcb\xcc\xcd\xce\xcf"+
    "\xd0\xd1\xd2\xd3\xd4\xd5\xd6\xd7\xd8\xd9\xda\xdb\xdc\xdd\xde\xdf"+
    "\xe0\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xeb\xec\xed\xee\xef"+
    "\xf0\xf1\xf2\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xfa\xfb\xfc\xfd\xfe\xff.txt"

// ascii only
var input1 = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_"+
    "`abcdefghijklmnopqrstuvwxyz{|}~.txt"

var expectedCD0 = ["Content-Disposition: attachment;",
  " filename*0*=UTF-8''%20%21%22%23%24%25%26%27%28%29%2A%2B%2C%2D%2E%2F%30%31;",
  " filename*1*=%32%33%34%35%36%37%38%39%3A%3B%3C%3D%3E%3F%40%41%42%43%44%45;",
  " filename*2*=%46%47%48%49%4A%4B%4C%4D%4E%4F%50%51%52%53%54%55%56%57%58%59;",
  " filename*3*=%5A%5B%5C%5D%5E%5F%60%61%62%63%64%65%66%67%68%69%6A%6B%6C%6D;",
  " filename*4*=%6E%6F%70%71%72%73%74%75%76%77%78%79%7A%7B%7C%7D%7E%C2%A0%C2;",
  " filename*5*=%A1%C2%A2%C2%A3%C2%A4%C2%A5%C2%A6%C2%A7%C2%A8%C2%A9%C2%AA%C2;",
  " filename*6*=%AB%C2%AC%C2%AD%C2%AE%C2%AF%C2%B0%C2%B1%C2%B2%C2%B3%C2%B4%C2;",
  " filename*7*=%B5%C2%B6%C2%B7%C2%B8%C2%B9%C2%BA%C2%BB%C2%BC%C2%BD%C2%BE%C2;",
  " filename*8*=%BF%C3%80%C3%81%C3%82%C3%83%C3%84%C3%85%C3%86%C3%87%C3%88%C3;",
  " filename*9*=%89%C3%8A%C3%8B%C3%8C%C3%8D%C3%8E%C3%8F%C3%90%C3%91%C3%92%C3;",
  " filename*10*=%93%C3%94%C3%95%C3%96%C3%97%C3%98%C3%99%C3%9A%C3%9B%C3%9C;",
  " filename*11*=%C3%9D%C3%9E%C3%9F%C3%A0%C3%A1%C3%A2%C3%A3%C3%A4%C3%A5%C3;",
  " filename*12*=%A6%C3%A7%C3%A8%C3%A9%C3%AA%C3%AB%C3%AC%C3%AD%C3%AE%C3%AF;",
  " filename*13*=%C3%B0%C3%B1%C3%B2%C3%B3%C3%B4%C3%B5%C3%B6%C3%B7%C3%B8%C3;",
  " filename*14*=%B9%C3%BA%C3%BB%C3%BC%C3%BD%C3%BE%C3%BF%2E%74%78%74",
  ""].join("\r\n");

var expectedCD1 = "Content-Disposition: attachment;\r\n"+
    ' filename*0=" !\\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ";\r\n'+
    ' filename*1="[\\\\]^_`abcdefghijklmnopqrstuvwxyz{|}~.txt"\r\n';

var ParamFoldingPref = {
  RFC2047: 0,
  RFC2047WithCRLF: 1,
  RFC2231: 2
}

var expectedCTList0 = {
  RFC2047: 'Content-Type: text/plain; charset=US-ASCII;\r\n'+
           ' name="=?UTF-8?Q?_!=22#$%&\'=28=29*+=2c-./0123456789:;<=3d>=3f@ABCDEFGHIJKLM?='+
           '=?UTF-8?Q?NOPQRSTUVWXYZ[\\\\]^=5f`abcdefghijklmnopqrstuvwxyz{|}~=c2=a0?='+
           '=?UTF-8?B?wqHCosKjwqTCpcKmwqfCqMKpwqrCq8Kswq3CrsKvwrDCscKywrPCtMK1?='+
           '=?UTF-8?B?wrbCt8K4wrnCusK7wrzCvcK+wr/DgMOBw4LDg8OEw4XDhsOHw4jDicOK?='+
           '=?UTF-8?B?w4vDjMONw47Dj8OQw5HDksOTw5TDlcOWw5fDmMOZw5rDm8Ocw53DnsOf?='+
           '=?UTF-8?B?w6DDocOiw6PDpMOlw6bDp8Oow6nDqsOrw6zDrcOuw6/DsMOxw7LDs8O0?='+
           '=?UTF-8?B?w7XDtsO3w7jDucO6w7vDvMO9w77Dvy50eHQ=?="\r\n',

  RFC2047WithCRLF: 'Content-Type: text/plain; charset=US-ASCII;\r\n'+
                   ' name="=?UTF-8?Q?_!=22#$%&\'=28=29*+=2c-./0123456789:;<=3d>=3f@ABCDEFGHIJKLM?=\r\n'+
                   ' =?UTF-8?Q?NOPQRSTUVWXYZ[\\\\]^=5f`abcdefghijklmnopqrstuvwxyz{|}~=c2=a0?=\r\n'+
                   ' =?UTF-8?B?wqHCosKjwqTCpcKmwqfCqMKpwqrCq8Kswq3CrsKvwrDCscKywrPCtMK1?=\r\n'+
                   ' =?UTF-8?B?wrbCt8K4wrnCusK7wrzCvcK+wr/DgMOBw4LDg8OEw4XDhsOHw4jDicOK?=\r\n'+
                   ' =?UTF-8?B?w4vDjMONw47Dj8OQw5HDksOTw5TDlcOWw5fDmMOZw5rDm8Ocw53DnsOf?=\r\n'+
                   ' =?UTF-8?B?w6DDocOiw6PDpMOlw6bDp8Oow6nDqsOrw6zDrcOuw6/DsMOxw7LDs8O0?=\r\n'+
                   ' =?UTF-8?B?w7XDtsO3w7jDucO6w7vDvMO9w77Dvy50eHQ=?="\r\n',

  RFC2231: 'Content-Type: text/plain; charset=US-ASCII\r\n'
}

var expectedCTList1 = {
  RFC2047: 'Content-Type: text/plain; charset=US-ASCII;\r\n'+
           ' name="!\\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\\\]^_`abcdefghijklmnopqrstuvwxyz{|}~.txt"\r\n',

  RFC2047WithCRLF: 'Content-Type: text/plain; charset=US-ASCII;\r\n'+
                   ' name="!\\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\\\]^_`abcdefghijklmnopqrstuvwxyz{|}~.txt"\r\n',

  RFC2231: 'Content-Type: text/plain; charset=US-ASCII\r\n'
}

function checkAttachment(expectedCD, expectedCT) {
  let msgData = mailTestUtils
    .loadMessageToString(gDraftFolder, mailTestUtils.firstMsgHdr(gDraftFolder));
  let pos = msgData.indexOf("Content-Disposition:");
  do_check_neq(pos, -1);
  let contentDisposition = msgData.substr(pos);
  pos = 0;
  do {
    pos = contentDisposition.indexOf("\n", pos);
    do_check_neq(pos, -1);
    pos++;
  } while (contentDisposition.startsWith(" ", pos));
  contentDisposition = contentDisposition.substr(0, pos);
  do_check_eq(contentDisposition, expectedCD);

  pos = msgData.indexOf("Content-Type:"); // multipart
  do_check_neq(pos, -1);
  msgData = msgData.substr(pos + 13);
  pos = msgData.indexOf("Content-Type:"); // body
  do_check_neq(pos, -1);
  msgData = msgData.substr(pos + 13);
  pos = msgData.indexOf("Content-Type:"); // first attachment
  do_check_neq(pos, -1);
  var contentType = msgData.substr(pos);
  pos = 0;
  do {
    pos = contentType.indexOf("\n", pos);
    do_check_neq(pos, -1);
    pos++;
  } while (contentType.startsWith(" ", pos));
  contentType = contentType.substr(0, pos);
  do_check_eq(contentType, expectedCT);
}

function* testInput0() {
  for (let folding in ParamFoldingPref) {
    Services.prefs.setIntPref("mail.strictly_mime.parm_folding", ParamFoldingPref[folding]);
    yield createMessage(input0);
    checkAttachment(expectedCD0, expectedCTList0[folding]);
  }
}

function* testInput1() {
  for (let folding in ParamFoldingPref) {
    Services.prefs.setIntPref("mail.strictly_mime.parm_folding", ParamFoldingPref[folding]);
    yield createMessage(input1);
    checkAttachment(expectedCD1, expectedCTList1[folding]);
  }
}

var tests = [
  testInput0,
  testInput1
]

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  tests.forEach(add_task);
  run_next_test();
}
