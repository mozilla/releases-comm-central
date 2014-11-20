/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource:///modules/ArrayBufferUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource:///modules/yahoo-session.jsm");
let yahoo = {};
Services.scriptloader.loadSubScript("resource:///modules/yahoo-session.jsm", yahoo);

// Preset test values.
const kUsername = "testUser";
const kPassword = "instantbird";
const kPagerIp = "123.456.78.9";
const kCrumb = "MG-Z/jNG+Q==";
const kChallengeString = "AEF08DBAC33F9EEDABCFEA==";
const kYCookie = "OTJmMTQyOTU1ZGQ4MDA3Y2I2ODljMTU5";
const kTCookie = "NTdlZmIzY2Q4ODI3ZTc3NTIxYTk1MDhm";
const kToken = "MThmMzg3OWM3ODcxMW";

const kPagerAddressResponse = "COLO_CAPACITY=1\r\nCS_IP_ADDRESS=" + kPagerIp;
const kTokenResponse = "0\r\n" + kToken + "\r\npartnerid=dummyValue";
const kCookieResponse = "0\r\ncrumb=" + kCrumb + "\r\nY=" + kYCookie +
                        "\r\nT=" + kTCookie + "\r\ncookievalidfor=86400";

/* In each test, we override the function that would normally be called next in
 * the login process. We do this so that we can intercept the login process,
 * preventing calls to real Yahoo! servers, and do equality testing. */
function run_test()
{
  add_test(test_pagerAddress);
  add_test(test_challengeString);
  add_test(test_loginToken);
  add_test(test_cookies);
  run_next_test();
}

function test_pagerAddress()
{
  let helper = new yahoo.YahooLoginHelper({}, {});

  helper._getChallengeString = function() {
    do_check_eq(kPagerIp, helper._session.pagerAddress);
    run_next_test();
  };

  helper._onPagerAddressResponse(kPagerAddressResponse, null);
}

function test_challengeString()
{
  let helper = new yahoo.YahooLoginHelper({}, {});

  helper._getLoginToken = function() {
    do_check_eq(kChallengeString, helper._challengeString);
    run_next_test();
  };

  let response = new yahoo.YahooPacket(yahoo.kPacketType.AuthResponse, 0, 0);
  response.addValue(1, helper._username);
  response.addValue(94, kChallengeString);
  response.addValue(13, 0);
  helper._onChallengeStringResponse(response.toArrayBuffer());
}

function test_loginToken()
{
  let helper = new yahoo.YahooLoginHelper({}, {});

  helper._getCookies = function() {
    do_check_eq(kToken, helper._loginToken);
    run_next_test();
  };

  helper._onLoginTokenResponse(kTokenResponse, null);
}

function test_cookies()
{
  let helper = new yahoo.YahooLoginHelper({}, {});

  helper._sendPagerAuthResponse = function() {
    do_check_eq(kCrumb, helper._crumb);
    do_check_eq(kYCookie, helper._session.yCookie);
    do_check_eq(kTCookie, helper._session.tCookie);
    run_next_test();
  };

  helper._onLoginCookiesResponse(kCookieResponse, null);
}
