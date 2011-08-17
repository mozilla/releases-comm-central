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

#include "trayToolkit.h"
#include "trayPlatform.h"

#include "nsCOMPtr.h"
#include "nsStringAPI.h"
#include "nsServiceManagerUtils.h"

#include "nsIDOMWindow.h"
#include "nsIDOMDocument.h"

#include "nsIDOMEvent.h"
#include "nsIDOMEventTarget.h"
#include "nsIPrivateDOMEvent.h"
#include "nsIDOMMouseEvent.h"

#include "nsIWebNavigation.h"

#include "nsIInterfaceRequestorUtils.h"
#include "nsIObserverService.h"

#include "nsIPrefService.h"
#include "nsIPrefBranch2.h"

#ifdef WIN32
#define strcasecmp stricmp
#endif

namespace mintrayr {

bool DoMinimizeWindow(nsIDOMWindow *window, eMinimizeActions action)
{
  if (window == 0) {
    return false;
  }

  nsCOMPtr<nsIPrefBranch2> prefs(do_GetService(NS_PREFSERVICE_CONTRACTID));
  if (prefs) {
    PRInt32 whenToMinimize = 0;
    prefs->GetIntPref("extensions.mintrayr.minimizeon", &whenToMinimize);
    if ((whenToMinimize & action) == 0) {
      return false;
    }
  }

  nsresult rv;
  nsCOMPtr<trayITrayService> traySvc(do_GetService(TRAYSERVICE_CONTRACTID, &rv));
  if (NS_SUCCEEDED(rv)) {
    traySvc->Minimize(window, PR_TRUE);
  }
  return NS_SUCCEEDED(rv);
}

/**
 * Helper: Get the base window for a DOM window
 */
NS_IMETHODIMP GetBaseWindow(nsIDOMWindow *aWindow, nsIBaseWindow **aBaseWindow)
{
  NS_ENSURE_ARG_POINTER(aWindow);
  NS_ENSURE_ARG_POINTER(aBaseWindow);

  nsresult rv;

  nsCOMPtr<nsIWebNavigation> webNav = do_GetInterface(aWindow, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIBaseWindow> baseWindow = do_QueryInterface(webNav, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  *aBaseWindow = baseWindow;
  NS_IF_ADDREF(*aBaseWindow);
  return NS_OK;
}

/**
 * Helper: Dispatch a trusted general event
 */
NS_IMETHODIMP DispatchTrustedEvent(nsIDOMWindow *aWindow, const nsAString& aEventName)
{
  NS_ENSURE_ARG_POINTER(aWindow);

  nsresult rv;

  nsCOMPtr<nsIDOMDocument> domDocument;
  rv = aWindow->GetDocument(getter_AddRefs(domDocument));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIDOMEventTarget> target(do_QueryInterface(domDocument));
  NS_ENSURE_TRUE(target, NS_ERROR_INVALID_ARG);

  nsCOMPtr<nsIDOMEvent> event;
  rv = domDocument->CreateEvent(NS_LITERAL_STRING("Events"), getter_AddRefs(event));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIPrivateDOMEvent> privateEvent(do_QueryInterface(event, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = event->InitEvent(aEventName, PR_FALSE, PR_TRUE);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = privateEvent->SetTrusted(PR_TRUE);
  NS_ENSURE_SUCCESS(rv, rv);

  PRBool dummy;
  return target->DispatchEvent(event, &dummy);
}

/* TrayIconImpl */

NS_IMPL_ISUPPORTS2(TrayIconImpl, trayITrayIcon, nsIDOMEventListener)

NS_IMETHODIMP TrayIconImpl::GetWindow(nsIDOMWindow **aWindow)
{
  NS_ENSURE_ARG_POINTER(aWindow);
  *aWindow = mWindow;
  NS_ADDREF(*aWindow);
  return NS_OK;
}
NS_IMETHODIMP TrayIconImpl::SetWindow(nsIDOMWindow *) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP TrayIconImpl::GetIsMinimized(PRBool *aIsMinimized)
{
  NS_ENSURE_ARG_POINTER(aIsMinimized);
  *aIsMinimized = mIsMinimized;
  return NS_OK;
}
NS_IMETHODIMP TrayIconImpl::SetIsMinimized(PRBool)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP TrayIconImpl::GetCloseOnRestore(PRBool *aCloseOnRestore)
{
  NS_ENSURE_ARG_POINTER(aCloseOnRestore);
  *aCloseOnRestore = mCloseOnRestore;
  return NS_OK;
}
NS_IMETHODIMP TrayIconImpl::SetCloseOnRestore(PRBool aCloseOnRestore)
{
  mCloseOnRestore = aCloseOnRestore;
  return NS_OK;
}

NS_IMETHODIMP TrayIconImpl::Minimize()
{
  if (mClosed) {
    return NS_ERROR_NOT_INITIALIZED;
  }
  if (mIsMinimized) {
    // Already minimized
    return NS_OK;
  }
  mPlatformIcon->Minimize();
  mIsMinimized = PR_TRUE;
  return NS_OK;
}
NS_IMETHODIMP TrayIconImpl::Restore()
{
  if (mClosed) {
    return NS_ERROR_NOT_INITIALIZED;
  }
  if (!mIsMinimized) {
    // Not minimized
    return NS_OK;
  }
  if (mCloseOnRestore) {
    Close();
  }
  else {
    mPlatformIcon->Restore();
  }
  mIsMinimized = PR_FALSE;

  return NS_OK;
}
NS_IMETHODIMP TrayIconImpl::Close()
{
  if (mClosed) {
    return NS_OK;
  }
  mClosed = true;

  delete mPlatformIcon.forget();
  mService->CloseIcon(this);
  mIsMinimized = PR_FALSE;

  nsresult rv;
  nsCOMPtr<nsIDOMEventTarget> target = do_QueryInterface(mWindow, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  target->RemoveEventListener(NS_LITERAL_STRING("unload"), this, PR_FALSE);

  return NS_OK;
}

NS_IMETHODIMP TrayIconImpl::HandleEvent(nsIDOMEvent *aEvent)
{
  NS_ENSURE_ARG_POINTER(aEvent);
  Close();
  return NS_OK;
}


NS_IMETHODIMP TrayIconImpl::Init(nsIDOMWindow *aWindow, PRBool aCloseOnRestore)
{
  NS_ENSURE_ARG_POINTER(aWindow);

  nsresult rv;

  mCloseOnRestore = aCloseOnRestore;

  nsCOMPtr<nsIDOMEventTarget> target = do_QueryInterface(aWindow, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = target->AddEventListener(NS_LITERAL_STRING("unload"), this, PR_FALSE);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIBaseWindow> baseWindow;
  rv = GetBaseWindow(aWindow, getter_AddRefs(baseWindow));
  NS_ENSURE_SUCCESS(rv, rv);

  nativeWindow native = 0;
  rv = baseWindow->GetParentNativeWindow(&native);
  NS_ENSURE_SUCCESS(rv, rv);

  nsString title;
  baseWindow->GetTitle(getter_Copies(title));
  mPlatformIcon = platform::CreateIcon(this, aWindow, title);
  mWindow = aWindow;

  return NS_OK;
}

NS_IMETHODIMP TrayIconImpl::DispatchMouseEvent(const nsAString& aEventName, PRUint16 aButton, nsPoint& pt, PRBool aCtrlKey, PRBool aAltKey, PRBool aShiftKey)
{
  nsresult rv;

  nsCOMPtr<nsIDOMDocument> domDocument;
  rv = mWindow->GetDocument(getter_AddRefs(domDocument));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIDOMEventTarget> target(do_QueryInterface(domDocument));
  NS_ENSURE_TRUE(target, NS_ERROR_INVALID_ARG);

  nsCOMPtr<nsIDOMEvent> event;
  rv = domDocument->CreateEvent(NS_LITERAL_STRING("MouseEvents"), getter_AddRefs(event));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIDOMMouseEvent> mouseEvent(do_QueryInterface(event, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mouseEvent->InitMouseEvent(
    aEventName,
    PR_FALSE,
    PR_TRUE,
    mWindow,
    0,
    pt.x,
    pt.y,
    0,
    0,
    aCtrlKey,
    aAltKey,
    aShiftKey,
    PR_FALSE,
    aButton,
    target
    );
  NS_ENSURE_SUCCESS(rv, rv);

  PRBool dummy;
  return target->DispatchEvent(mouseEvent, &dummy);
}

/* TrayServiceImpl */

NS_IMPL_ISUPPORTS2(TrayServiceImpl, trayITrayService, nsIObserver)

TrayServiceImpl::TrayServiceImpl()
{
  platform::Init();

  // Observe when the app is going down.
  // Else we might not properly clean up
  // And leave some tray icons behind
  nsresult rv;
  nsCOMPtr<nsIObserverService> obs(do_GetService("@mozilla.org/observer-service;1", &rv));
  if (NS_SUCCEEDED(rv)) {
    obs->AddObserver(static_cast<nsIObserver*>(this), "xpcom-shutdown", PR_FALSE);
  }

}
TrayServiceImpl::~TrayServiceImpl()
{
  Destroy();
  platform::Destroy();
}
void TrayServiceImpl::Destroy() {
  UnwatchAll();
  RestoreAll();

  // Better be safe :p
  mIcons.Clear();
  mWatches.Clear();
}

NS_IMETHODIMP TrayServiceImpl::CreateIcon(nsIDOMWindow *aWindow, PRBool aCloseOnRestore, trayITrayIcon **aResult)
{
  NS_ENSURE_ARG_POINTER(aWindow);

  nsresult rv;
  const PRInt32 count = mIcons.Count();

  for (PRInt32 i = 0; i < count; ++i) {
    nsCOMPtr<nsIDOMWindow> domWindow;
    rv = mIcons[i]->GetWindow(getter_AddRefs(domWindow));
    if (NS_FAILED(rv)) {
      continue;
    }
    if (domWindow != aWindow) {
      continue;
    }
    *aResult = mIcons[i];
    NS_ADDREF(*aResult);
    return NS_OK;
  }

  TrayIconImpl *icon = new TrayIconImpl(this);
  rv = icon->Init(aWindow, aCloseOnRestore);
  if (NS_FAILED(rv)) {
    delete icon;
  }
  else {
    mIcons.AppendObject(icon);
    if (aResult) {
      *aResult = icon;
      NS_ADDREF(*aResult);
    }
  }
  return rv;
}

NS_IMETHODIMP TrayServiceImpl::RestoreAll()
{
  const PRInt32 count = mIcons.Count();
  for (PRInt32 i = count - 1; i > -1; --i) {
    mIcons[i]->Restore();
  }
  return NS_OK;
}

NS_IMETHODIMP TrayServiceImpl::WatchMinimize(nsIDOMWindow *aWindow)
{
  NS_ENSURE_ARG_POINTER(aWindow);

  const PRInt32 index = mWatches.IndexOf(aWindow);
  if (index != -1) {
    return NS_OK;
  }

  if (!NS_SUCCEEDED(platform::WatchWindow(aWindow))) {
    return NS_ERROR_INVALID_ARG;
  }
  mWatches.AppendObject(aWindow);
  return NS_OK;
}

NS_IMETHODIMP TrayServiceImpl::UnwatchMinimize(nsIDOMWindow *aWindow)
{
  NS_ENSURE_ARG_POINTER(aWindow);

  if (NS_SUCCEEDED(platform::UnwatchWindow(aWindow))) {
    return NS_ERROR_INVALID_ARG;
  }
  mWatches.RemoveObject(aWindow);
  return NS_OK;
}

NS_IMETHODIMP TrayServiceImpl::Minimize(nsIDOMWindow *aWindow, PRBool aCloseOnRestore)
{
  NS_ENSURE_ARG_POINTER(aWindow);

  nsresult rv;

  nsCOMPtr<trayITrayIcon> icon;
  rv = CreateIcon(aWindow, aCloseOnRestore, getter_AddRefs(icon));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = icon->Minimize();
  return rv;
}

NS_IMETHODIMP TrayServiceImpl::Restore(nsIDOMWindow *aWindow)
{
  NS_ENSURE_ARG_POINTER(aWindow);

  nsresult rv;
  const PRInt32 count = mIcons.Count();

  for (PRInt32 i = 0; i < count; ++i) {
    nsCOMPtr<nsIDOMWindow> domWindow;
    rv = mIcons[i]->GetWindow(getter_AddRefs(domWindow));
    if (NS_FAILED(rv)) {
      continue;
    }
    if (domWindow != aWindow) {
      continue;
    }
    return mIcons[i]->Restore();
  }
  return NS_ERROR_INVALID_ARG;
}

NS_IMETHODIMP TrayServiceImpl::IsWatchedWindow(nsIDOMWindow *aWindow, PRBool *aResult)
{
  NS_ENSURE_ARG_POINTER(aWindow);
  NS_ENSURE_ARG_POINTER(aResult);

  *aResult = mWatches.IndexOfObject(aWindow) != -1 ? PR_TRUE : PR_FALSE;
  return NS_OK;
}

void TrayServiceImpl::UnwatchAll() {
  const PRInt32 count = mWatches.Count();
  for (PRInt32 i = 0; i < count; ++i) {
    platform::UnwatchWindow(mWatches[i]);
  }
  mWatches.Clear();
}

void TrayServiceImpl::CloseIcon(trayITrayIcon *aIcon)
{
  mIcons.RemoveObject(aIcon);
}

NS_IMETHODIMP TrayServiceImpl::Observe(nsISupports *, const char *aTopic, const PRUnichar *)
{
  if (strcasecmp(aTopic, "xpcom-shutdown") == 0) {
    Destroy();

    nsresult rv;
    nsCOMPtr<nsIObserverService> obs(do_GetService("@mozilla.org/observer-service;1", &rv));
    if (NS_SUCCEEDED(rv)) {
      obs->RemoveObserver(static_cast<nsIObserver*>(this), "xpcom-shutdown");
    }
  }
  return NS_OK;
}

} // namespace mintrayr
