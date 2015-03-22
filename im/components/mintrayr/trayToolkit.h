/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __TRAYTOOLKIT_IMPL_H
#define __TRAYTOOLKIT_IMPL_H

#include "xpcom-config.h"

#include "nsCOMArray.h"
#include "nsCOMPtr.h"
#include "nsAutoPtr.h"
#include "nsPoint.h"

#include "nsIDOMEventListener.h"
#include "nsIBaseWindow.h"
#include "nsIDOMWindow.h"

#include "trayIToolkit.h"
#include "trayPlatform.h"
#include "nsXPCOMStrings.h"
#include "nsIObserver.h"


#define TRAYSERVICE_CONTRACTID "@tn123.ath.cx/trayservice;1"
#define TRAYSERVICE_CLASSNAME  "TrayServiceImpl"

namespace mintrayr {

/**
 * Minimize on what actions
 */
typedef enum _eMinimizeActions {
  kTrayOnMinimize = (1 << 0),
  kTrayOnClose = (1 << 1)
} eMinimizeActions;

/**
 * Helper for watch: Minimize a window if a configured for the action
 */
bool DoMinimizeWindow(nsIDOMWindow *window, eMinimizeActions action);

/**
 * Helper: Gets the base window
 */
NS_IMETHODIMP GetBaseWindow(nsIDOMWindow *aWindow, nsIBaseWindow **aBaseWindow);

/**
 * Helper: Dispatches a trusted event (i.e. chrome only)
 */
NS_IMETHODIMP DispatchTrustedEvent(nsIDOMWindow *aWindow, const nsAString& aEventName);

class TrayServiceImpl;

/**
 * The implementation for trayITrayIcon
 */
class TrayIconImpl final : public trayITrayIcon, nsIDOMEventListener {
  friend class platform::Icon;

private:
  ~TrayIconImpl() {}
  bool mIsMinimized;
  nsCOMPtr<nsIDOMWindow> mWindow;

  bool mCloseOnRestore;

  bool mClosed;
  TrayServiceImpl *mService;
  nsAutoPtr<platform::Icon> mPlatformIcon;

public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIDOMEVENTLISTENER
  NS_DECL_TRAYITRAYICON

  TrayIconImpl(TrayServiceImpl *aService)
    : mIsMinimized(false),
    mCloseOnRestore(false),
    mClosed(false),
    mService(aService)
    {}

  NS_IMETHOD Init(nsIDOMWindow *aWindow, bool aCloseOnRestore);
  NS_IMETHOD DispatchMouseEvent(const nsAString& aEventName, PRUint16 aButton, nsPoint& pt, bool aCtrlKey, bool aAltKey, bool aShiftKey);
  inline bool IsClosed() const { return mClosed; }
};

/**
 * The implementation for trayITrayService
 */
class TrayServiceImpl final : public trayITrayService, nsIObserver {
  friend class TrayIconImpl;
public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIOBSERVER
  NS_DECL_TRAYITRAYSERVICE

  TrayServiceImpl();

private:
  nsCOMArray<trayITrayIcon> mIcons;
  nsCOMArray<nsIDOMWindow> mWatches;

private:
  ~TrayServiceImpl();
  void Destroy();

  void UnwatchAll();

  void CloseIcon(trayITrayIcon *aIcon);
};

} // namespace

#endif
