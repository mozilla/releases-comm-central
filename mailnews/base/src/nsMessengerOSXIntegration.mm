/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMessengerOSXIntegration.h"
#include "nsObjCExceptions.h"
#include "nsString.h"
#include "mozilla/ErrorResult.h"
#include "prtime.h"

#include <Carbon/Carbon.h>
#import <Cocoa/Cocoa.h>

nsMessengerOSXIntegration::nsMessengerOSXIntegration() {}

nsMessengerOSXIntegration::~nsMessengerOSXIntegration() {}

NS_IMPL_ADDREF(nsMessengerOSXIntegration)
NS_IMPL_RELEASE(nsMessengerOSXIntegration)

NS_INTERFACE_MAP_BEGIN(nsMessengerOSXIntegration)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIMessengerOSIntegration)
  NS_INTERFACE_MAP_ENTRY(nsIMessengerOSIntegration)
NS_INTERFACE_MAP_END

nsresult nsMessengerOSXIntegration::RestoreDockIcon() {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  id tile = [[NSApplication sharedApplication] dockTile];
  [tile setBadgeLabel:nil];

  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

NS_IMETHODIMP
nsMessengerOSXIntegration::UpdateUnreadCount(uint32_t unreadCount,
                                             const nsAString& unreadTooltip) {
  NS_OBJC_BEGIN_TRY_BLOCK_RETURN;

  if (unreadCount == 0) {
    RestoreDockIcon();
    return NS_OK;
  }

  nsAutoString total;
  if (unreadCount > 99) {
    total.AppendLiteral("99+");
  } else {
    total.AppendInt(unreadCount);
  }
  id tile = [[NSApplication sharedApplication] dockTile];
  [tile setBadgeLabel:[NSString
                          stringWithFormat:@"%S", (const unichar*)total.get()]];
  return NS_OK;

  NS_OBJC_END_TRY_BLOCK_RETURN(NS_ERROR_FAILURE);
}

NS_IMETHODIMP
nsMessengerOSXIntegration::OnExit() {
  RestoreDockIcon();
  return NS_OK;
}

NS_IMETHODIMP
nsMessengerOSXIntegration::GetIsInDoNotDisturbMode(bool* inDNDMode) {
  // $ defaults -currentHost read com.apple.notificationcenterui

  CFStringRef DO_NOT_DISTURB = CFStringCreateWithCString(
      kCFAllocatorDefault, "doNotDisturb", kCFStringEncodingUTF8);
  CFStringRef DND_START = CFStringCreateWithCString(
      kCFAllocatorDefault, "dndStart", kCFStringEncodingUTF8);
  CFStringRef DND_END = CFStringCreateWithCString(kCFAllocatorDefault, "dndEnd",
                                                  kCFStringEncodingUTF8);
  CFStringRef APP_ID = CFStringCreateWithCString(
      kCFAllocatorDefault, "com.apple.notificationcenterui",
      kCFStringEncodingUTF8);

  Boolean keyExists;
  *inDNDMode =
      CFPreferencesGetAppBooleanValue(DO_NOT_DISTURB, APP_ID, &keyExists);
  if (*inDNDMode) {
    // Do Not Disturb is explicitly enabled.
    return NS_OK;
  }

  uint32_t dndStart =
      CFPreferencesGetAppIntegerValue(DND_START, APP_ID, &keyExists);
  uint32_t dndEnd =
      CFPreferencesGetAppIntegerValue(DND_END, APP_ID, &keyExists);
  if (dndStart == dndEnd) {
    // The values match or they didn't exist. `keyExists` is not reliable, but
    // the values will both be 0 if Do Not Disturb is not scheduled.
    return NS_OK;
  }

  PRExplodedTime now;
  PR_ExplodeTime(PR_Now(), PR_LocalTimeParameters, &now);
  uint32_t nowMinute = now.tm_hour * 60 + now.tm_min;

  if (dndStart < dndEnd) {
    *inDNDMode = nowMinute >= dndStart && nowMinute < dndEnd;
  } else {
    *inDNDMode = nowMinute < dndEnd || nowMinute >= dndStart;
  }

  return NS_OK;
}
