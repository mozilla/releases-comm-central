/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsUserInfo.h"

#include "nsString.h"
#include "windows.h"

#define SECURITY_WIN32
#include "lm.h"
#include "security.h"

nsUserInfo::nsUserInfo() {}

nsUserInfo::~nsUserInfo() {}

NS_IMPL_ISUPPORTS(nsUserInfo, nsIUserInfo)

NS_IMETHODIMP
nsUserInfo::GetUsername(nsAString& aUsername) {
  aUsername.Truncate();

  // UNLEN is the max username length as defined in lmcons.h
  wchar_t username[UNLEN + 1];
  DWORD size = std::size(username);
  if (!GetUserNameW(username, &size)) return NS_OK;

  aUsername.Assign(username);
  return NS_OK;
}

NS_IMETHODIMP
nsUserInfo::GetFullname(nsAString& aFullname) {
  aFullname.Truncate();

  wchar_t fullName[512];
  DWORD size = std::size(fullName);

  if (GetUserNameExW(NameDisplay, fullName, &size)) {
    aFullname.Assign(fullName);
  } else {
    // Try to use the net APIs regardless of the error because it may be
    // able to obtain the information.
    wchar_t username[UNLEN + 1];
    size = std::size(username);
    if (!GetUserNameW(username, &size)) {
      return NS_OK;
    }

    const DWORD level = 2;
    LPBYTE info;
    // If the NetUserGetInfo function has no full name info it will return
    // success with an empty string.
    NET_API_STATUS status = NetUserGetInfo(nullptr, username, level, &info);
    if (status != NERR_Success) {
      return NS_OK;
    }

    aFullname.Assign(reinterpret_cast<USER_INFO_2*>(info)->usri2_full_name);
    NetApiBufferFree(info);
  }

  return NS_OK;
}

NS_IMETHODIMP
nsUserInfo::GetDomain(nsAString& aDomain) {
  aDomain.Truncate();

  const DWORD level = 100;
  LPBYTE info;
  NET_API_STATUS status = NetWkstaGetInfo(nullptr, level, &info);
  if (status == NERR_Success) {
    aDomain.Assign(reinterpret_cast<WKSTA_INFO_100*>(info)->wki100_langroup);
    NetApiBufferFree(info);
  }

  return NS_OK;
}

NS_IMETHODIMP
nsUserInfo::GetEmailAddress(nsAString& aEmailAddress) {
  aEmailAddress.Truncate();

  // RFC3696 says max length of an email address is 254
  wchar_t emailAddress[255];
  DWORD size = std::size(emailAddress);

  if (!GetUserNameExW(NameUserPrincipal, emailAddress, &size)) {
    return NS_OK;
  }

  aEmailAddress.Assign(emailAddress);
  return NS_OK;
}
