/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsUserInfo.h"
#include "nsCRT.h"

#include <pwd.h>
#include <sys/types.h>
#include <unistd.h>
#include <sys/utsname.h>

#include "nsString.h"
#include "nsReadableUtils.h"

nsUserInfo::nsUserInfo() {}

nsUserInfo::~nsUserInfo() {}

NS_IMPL_ISUPPORTS(nsUserInfo, nsIUserInfo)

NS_IMETHODIMP
nsUserInfo::GetFullname(nsAString& aFullname) {
  aFullname.Truncate();
  struct passwd* pw = nullptr;

  pw = getpwuid(geteuid());

  if (!pw || !pw->pw_gecos) return NS_OK;

  nsAutoCString fullname(pw->pw_gecos);

  // now try to parse the GECOS information, which will be in the form
  // Full Name, <other stuff> - eliminate the ", <other stuff>
  // also, sometimes GECOS uses "&" to mean "the user name" so do
  // the appropriate substitution

  // truncate at first comma (field delimiter)
  int32_t index;
  if ((index = fullname.Find(",")) != kNotFound) fullname.Truncate(index);

  // replace ampersand with username
  if (pw->pw_name) {
    nsAutoCString username(pw->pw_name);
    if (!username.IsEmpty())
      username.SetCharAt(nsCRT::ToUpper(username.CharAt(0)), 0);

    fullname.ReplaceSubstring("&", username.get());
  }

  CopyUTF8toUTF16(fullname, aFullname);

  return NS_OK;
}

NS_IMETHODIMP
nsUserInfo::GetUsername(nsAString& aUsername) {
  aUsername.Truncate();
  struct passwd* pw = nullptr;

  // is this portable?  those are POSIX compliant calls, but I need to check
  pw = getpwuid(geteuid());

  if (!pw || !pw->pw_name) return NS_OK;

  CopyUTF8toUTF16(mozilla::MakeStringSpan(pw->pw_name), aUsername);

  return NS_OK;
}

NS_IMETHODIMP
nsUserInfo::GetDomain(nsAString& aDomain) {
  aDomain.Truncate();
  struct utsname buf;
  char* domainname = nullptr;

  if (uname(&buf) < 0) {
    return NS_OK;
  }

#if defined(__linux__)
  domainname = buf.domainname;
#endif

  if (domainname && domainname[0]) {
    CopyUTF8toUTF16(mozilla::MakeStringSpan(domainname), aDomain);
  } else {
    // try to get the hostname from the nodename
    // on machines that use DHCP, domainname may not be set
    // but the nodename might.
    if (buf.nodename[0]) {
      // if the nodename is foo.bar.org, use bar.org as the domain
      char* pos = strchr(buf.nodename, '.');
      if (pos) {
        CopyUTF8toUTF16(mozilla::MakeStringSpan(pos + 1), aDomain);
      }
    }
  }

  return NS_OK;
}

NS_IMETHODIMP
nsUserInfo::GetEmailAddress(nsAString& aEmailAddress) {
  // use username + "@" + domain for the email address

  nsString username;
  nsString domain;

  GetUsername(username);
  GetDomain(domain);

  if (!username.IsEmpty() && !domain.IsEmpty()) {
    aEmailAddress = username;
    aEmailAddress.Append('@');
    aEmailAddress += domain;
  } else {
    aEmailAddress.Truncate();
  }

  return NS_OK;
}
