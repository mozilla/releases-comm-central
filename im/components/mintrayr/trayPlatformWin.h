/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __TRAYPLATFORMWIN_H
#define __TRAYPLATFORMWIN_H

/**
 * Windows specific implementation
 */

#ifdef _WIN32_IE
#	undef _WIN32_IE
#endif
#define _WIN32_IE 0x0600 // We want more features
#include <windows.h>
#include <shellapi.h>

#include "trayPlatform.h"

#include "nsCOMPtr.h"

#include "nsIDOMWindow.h"

namespace mintrayr {
namespace platform {
namespace win {

/**
 * Helper class
 * Encapsulates the Windows specific initialization code and message processing
 */
class Icon : public platform::Icon {
private:
public:
  HWND mWnd;
  NOTIFYICONDATAW mIconData;
  TrayIconImpl *mOwnerIcon;

  Icon(TrayIconImpl *aOwner, nsIDOMWindow* aWindow, const nsString& aTitle);
  virtual ~Icon();

  virtual void Minimize();
  virtual void Restore();
private:
  NS_IMETHOD Init(nsIDOMWindow *aWindow, const nsString& aTitle);
};

}}} // namespaces

#endif
