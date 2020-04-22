/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "gtest/gtest.h"
#include "nsContentUtils.h"
#include "nsIServiceManager.h"
#include "nsICookieService.h"
#include "nsICookieManager.h"
#include "nsICookie.h"
#include <stdio.h>
#include "plstr.h"
#include "prprf.h"
#include "nsNetUtil.h"
#include "nsNetCID.h"
#include "nsIPrefBranch.h"
#include "nsServiceManagerUtils.h"
#include "mozilla/Preferences.h"
#include "mozilla/Unused.h"
#include "nsIURI.h"

using mozilla::Unused;

static NS_DEFINE_CID(kCookieServiceCID, NS_COOKIESERVICE_CID);
static NS_DEFINE_CID(kPrefServiceCID, NS_PREFSERVICE_CID);

// various pref strings
static const char kCookiesPermissions[] = "network.cookie.cookieBehavior";
static const char kCookiesLifetimeEnabled[] = "network.cookie.lifetime.enabled";
static const char kCookiesLifetimeDays[] = "network.cookie.lifetime.days";
static const char kCookiesLifetimeCurrentSession[] =
    "network.cookie.lifetime.behavior";
static const char kCookiesAskPermission[] = "network.cookie.warnAboutCookies";
static const char kCookiesMaxPerHost[] = "network.cookie.maxPerHost";

void SetACookieMail(nsICookieService *aCookieService, const char *aSpec,
                    const char *aCookieString) {
  nsCOMPtr<nsIURI> uri;
  NS_NewURI(getter_AddRefs(uri), aSpec);

  nsCOMPtr<nsIIOService> service = do_GetIOService();
  nsCOMPtr<nsIChannel> channel;
  Unused << service->NewChannelFromURI(
      uri, nullptr, nsContentUtils::GetSystemPrincipal(),
      nsContentUtils::GetSystemPrincipal(), 0, nsIContentPolicy::TYPE_DOCUMENT,
      getter_AddRefs(channel));

  nsresult rv = aCookieService->SetCookieStringFromHttp(
      uri, nsDependentCString(aCookieString), channel);
  EXPECT_TRUE(NS_SUCCEEDED(rv));
}

// returns true if cookie(s) for the given host were found; else false.
// the cookie string is returned via aCookie.
bool GetACookieMail(nsICookieService *aCookieService, const char *aSpec,
                    nsACString &aCookie) {
  nsCOMPtr<nsIURI> uri;
  NS_NewURI(getter_AddRefs(uri), aSpec);

  nsCOMPtr<nsIIOService> service = do_GetIOService();
  nsCOMPtr<nsIChannel> channel;
  Unused << service->NewChannelFromURI(
      uri, nullptr, nsContentUtils::GetSystemPrincipal(),
      nsContentUtils::GetSystemPrincipal(), 0, nsIContentPolicy::TYPE_DOCUMENT,
      getter_AddRefs(channel));

  Unused << aCookieService->GetCookieStringFromHttp(uri, channel, aCookie);
  return !aCookie.IsEmpty();
}

// some #defines for comparison rules
#define MUST_BE_NULL 0
#define MUST_EQUAL 1
#define MUST_CONTAIN 2
#define MUST_NOT_CONTAIN 3
#define MUST_NOT_EQUAL 4

// a simple helper function to improve readability:
// takes one of the #defined rules above, and performs the appropriate test.
// true means the test passed; false means the test failed.
static inline bool CheckResult(const char *aLhs, uint32_t aRule,
                               const char *aRhs = nullptr) {
  switch (aRule) {
    case MUST_BE_NULL:
      return !aLhs || !*aLhs;

    case MUST_EQUAL:
      return !PL_strcmp(aLhs, aRhs);

    case MUST_NOT_EQUAL:
      return PL_strcmp(aLhs, aRhs);

    case MUST_CONTAIN:
      return PL_strstr(aLhs, aRhs) != nullptr;

    case MUST_NOT_CONTAIN:
      return PL_strstr(aLhs, aRhs) == nullptr;

    default:
      return false;  // failure
  }
}

void InitPrefsMail(nsIPrefBranch *aPrefBranch) {
  // init some relevant prefs, so the tests don't go awry.
  // we use the most restrictive set of prefs we can;
  // however, we don't test third party blocking here.
  aPrefBranch->SetIntPref(kCookiesPermissions, 0);  // accept all
  aPrefBranch->SetBoolPref(kCookiesLifetimeEnabled, true);
  aPrefBranch->SetIntPref(kCookiesLifetimeCurrentSession, 0);
  aPrefBranch->SetIntPref(kCookiesLifetimeDays, 1);
  aPrefBranch->SetBoolPref(kCookiesAskPermission, false);
  // Set the base domain limit to 50 so we have a known value.
  aPrefBranch->SetIntPref(kCookiesMaxPerHost, 50);

  // XXX TODO: We need to follow bug 1617611 for the real fix.
  mozilla::Preferences::SetBool("network.cookie.sameSite.laxByDefault", false);

  mozilla::Preferences::SetBool(
      "network.cookieJarSettings.unblocked_for_testing", true);
}

TEST(TestMailCookie, TestMailCookieMain)
{
  nsresult rv0;

  nsCOMPtr<nsICookieService> cookieService =
      do_GetService(kCookieServiceCID, &rv0);
  ASSERT_TRUE(NS_SUCCEEDED(rv0));

  nsCOMPtr<nsIPrefBranch> prefBranch = do_GetService(kPrefServiceCID, &rv0);
  ASSERT_TRUE(NS_SUCCEEDED(rv0));

  InitPrefsMail(prefBranch);

  nsCString cookie;

  /* The basic idea behind these tests is the following:
   *
   * we set() some cookie, then try to get() it in various ways. we have
   * several possible tests we perform on the cookie string returned from
   * get():
   *
   * a) check whether the returned string is null (i.e. we got no cookies
   *    back). this is used e.g. to ensure a given cookie was deleted
   *    correctly, or to ensure a certain cookie wasn't returned to a given
   *    host.
   * b) check whether the returned string exactly matches a given string.
   *    this is used where we want to make sure our cookie service adheres to
   *    some strict spec (e.g. ordering of multiple cookies), or where we
   *    just know exactly what the returned string should be.
   * c) check whether the returned string contains/does not contain a given
   *    string. this is used where we don't know/don't care about the
   *    ordering of multiple cookies - we just want to make sure the cookie
   *    string contains them all, in some order.
   *
   * NOTE: this testsuite is not yet comprehensive or complete, and is
   * somewhat contrived - still under development, and needs improving!
   */

  // *** mailnews tests

  // test some mailnews cookies to ensure blockage.
  // we use null firstURI's deliberately, since we have hacks to deal with
  // this situation...
  SetACookieMail(cookieService, "mailbox://mail.co.uk/", "test=mailnews");
  GetACookieMail(cookieService, "mailbox://mail.co.uk/", cookie);
  EXPECT_TRUE(CheckResult(cookie.get(), MUST_BE_NULL));
  GetACookieMail(cookieService, "http://mail.co.uk/", cookie);
  EXPECT_TRUE(CheckResult(cookie.get(), MUST_BE_NULL));
  SetACookieMail(cookieService, "http://mail.co.uk/", "test=mailnews");
  GetACookieMail(cookieService, "mailbox://mail.co.uk/", cookie);
  EXPECT_TRUE(CheckResult(cookie.get(), MUST_BE_NULL));
  GetACookieMail(cookieService, "http://mail.co.uk/", cookie);
  EXPECT_TRUE(CheckResult(cookie.get(), MUST_EQUAL, "test=mailnews"));
  SetACookieMail(cookieService, "http://mail.co.uk/",
                 "test=mailnews; max-age=0");
  GetACookieMail(cookieService, "http://mail.co.uk/", cookie);
  EXPECT_TRUE(CheckResult(cookie.get(), MUST_BE_NULL));
}
