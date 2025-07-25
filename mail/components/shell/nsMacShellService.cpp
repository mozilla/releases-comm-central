/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMacShellService.h"

#include "nsCOMPtr.h"
#include "nsServiceManagerUtils.h"
#include "mozilla/Preferences.h"

using mozilla::Preferences;

// These Launch Services functions are deprecated. We're using them since
// they're the only way to set the default opener for URLs
extern "C" {
// Functions provided by LaunchServices/LaunchServices.h on MacOS, but including
// that doesn't work here.
// See
// https://developer.apple.com/documentation/coreservices/1447760-lssetdefaulthandlerforurlscheme?language=objc
extern OSStatus LSSetDefaultHandlerForURLScheme(CFStringRef inURLScheme,
                                                CFStringRef inHandlerBundleID);
// See
// https://developer.apple.com/documentation/coreservices/1441725-lscopydefaulthandlerforurlscheme?language=objc
extern CFStringRef LSCopyDefaultHandlerForURLScheme(CFStringRef inURLScheme);
}

NS_IMPL_ISUPPORTS(nsMacShellService, nsIShellService, nsIToolkitShellService)

nsMacShellService::nsMacShellService() : mCheckedThisSession(false) {}

NS_IMETHODIMP
nsMacShellService::IsDefaultClient(bool aStartupCheck, uint16_t aApps,
                                   bool* aIsDefaultClient) {
  *aIsDefaultClient = true;
  if (aApps & nsIShellService::MAIL)
    *aIsDefaultClient &= isDefaultHandlerForProtocol(CFSTR("mailto"));
  if (aApps & nsIShellService::NEWS)
    *aIsDefaultClient &= isDefaultHandlerForProtocol(CFSTR("news"));
  if (aApps & nsIShellService::RSS)
    *aIsDefaultClient &= isDefaultHandlerForProtocol(CFSTR("feed"));
  if (aApps & nsIShellService::CALENDAR)
    *aIsDefaultClient &= isDefaultHandlerForProtocol(CFSTR("webcal"));

  // if this is the first mail window, maintain internal state that we've
  // checked this session (so that subsequent window opens don't show the
  // default client dialog.

  if (aStartupCheck) mCheckedThisSession = true;
  return NS_OK;
}

NS_IMETHODIMP
nsMacShellService::SetDefaultClient(bool aForAllUsers, uint16_t aApps) {
  nsresult rv = NS_OK;
  if (aApps & nsIShellService::MAIL) {
    rv = setAsDefaultHandlerForProtocol(CFSTR("mailto"));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = setAsDefaultHandlerForProtocol(CFSTR("mid"));
  }
  if (NS_SUCCEEDED(rv) && aApps & nsIShellService::NEWS)
    rv = setAsDefaultHandlerForProtocol(CFSTR("news"));
  if (NS_SUCCEEDED(rv) && aApps & nsIShellService::RSS)
    rv = setAsDefaultHandlerForProtocol(CFSTR("feed"));
  if (NS_SUCCEEDED(rv) && aApps & nsIShellService::CALENDAR) {
    rv = setAsDefaultHandlerForProtocol(CFSTR("webcal"));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = setAsDefaultHandlerForProtocol(CFSTR("webcals"));
  }

  return rv;
}

NS_IMETHODIMP
nsMacShellService::GetShouldCheckDefaultClient(bool* aResult) {
  if (mCheckedThisSession) {
    *aResult = false;
    return NS_OK;
  }

  return Preferences::GetBool("mail.shell.checkDefaultClient", aResult);
}

NS_IMETHODIMP
nsMacShellService::SetShouldCheckDefaultClient(bool aShouldCheck) {
  return Preferences::SetBool("mail.shell.checkDefaultClient", aShouldCheck);
}

bool nsMacShellService::isDefaultHandlerForProtocol(CFStringRef aScheme) {
  bool isDefault = false;
  // Since neither Launch Services nor Internet Config actually differ between
  // bundles which have the same bundle identifier (That is, if we set our
  // URL of our bundle as the default handler for the given protocol,
  // Launch Service might return the URL of another thunderbird bundle as the
  // default handler for that protocol), we are comparing the identifiers of the
  // bundles rather than their URLs.
  CFStringRef tbirdID = ::CFBundleGetIdentifier(CFBundleGetMainBundle());
  if (!tbirdID) {
    // CFBundleGetIdentifier is expected to return NULL only if the specified
    // bundle doesn't have a bundle identifier in its dictionary. In this case,
    // that means a failure, since our bundle does have an identifier.
    return isDefault;
  }

  ::CFRetain(tbirdID);

  // Get the default handler URL of the given protocol
  CFStringRef defaultHandlerID = LSCopyDefaultHandlerForURLScheme(aScheme);

  if (defaultHandlerID) {
    isDefault =
        CFStringCompare(tbirdID, defaultHandlerID, 0) == kCFCompareEqualTo;
    ::CFRelease(defaultHandlerID);
  } else {
    // If LSCopyDefaultHandlerForURLScheme failed, there's no default
    // handler for the given protocol
    isDefault = false;
  }

  ::CFRelease(tbirdID);
  return isDefault;
}

nsresult nsMacShellService::setAsDefaultHandlerForProtocol(
    CFStringRef aScheme) {
  CFStringRef tbirdID = ::CFBundleGetIdentifier(::CFBundleGetMainBundle());
  ::CFRetain(tbirdID);

  OSStatus status = LSSetDefaultHandlerForURLScheme(aScheme, tbirdID);
  if (status != 0) {
    return NS_ERROR_UNEXPECTED;
  }

  ::CFRelease(tbirdID);

  return NS_OK;
}
