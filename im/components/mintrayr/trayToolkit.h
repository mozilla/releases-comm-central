/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is TrayToolkit
 *
 * The Initial Developer of the Original Code is
 * Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

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
 * Need this to hold a pointer to
 * The implementation will be platform specific
 */
namespace platform {
  class Icon;
}

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
class TrayIconImpl : public trayITrayIcon, nsIDOMEventListener {
  friend class platform::Icon;

private:
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
class TrayServiceImpl : public trayITrayService, nsIObserver {
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
