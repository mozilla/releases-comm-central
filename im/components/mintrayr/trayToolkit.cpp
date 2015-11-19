/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "trayToolkit.h"
#include "trayPlatform.h"

#include "nsCOMPtr.h"
#include "nsStringAPI.h"
#include "nsServiceManagerUtils.h"

#include "nsPIDOMWindow.h"
#include "nsIDOMWindow.h"
#include "nsIDocument.h"
#include "nsIDOMDocument.h"

#include "nsIDOMEvent.h"
#include "nsIDOMEventTarget.h"
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
    traySvc->Minimize(window, true);
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

  nsCOMPtr<nsPIDOMWindow> window(do_QueryInterface(aWindow));
  NS_ENSURE_STATE(window);

  nsCOMPtr<nsIDocument> doc = window->GetExtantDoc();
  NS_ENSURE_STATE(doc);

  nsCOMPtr<nsIDOMDocument> domDocument(do_QueryInterface(doc));
  NS_ENSURE_STATE(domDocument);

  nsCOMPtr<nsIDOMEventTarget> target(do_QueryInterface(domDocument));
  NS_ENSURE_TRUE(target, NS_ERROR_INVALID_ARG);

  nsCOMPtr<nsIDOMEvent> event;
  rv = domDocument->CreateEvent(NS_LITERAL_STRING("Events"), getter_AddRefs(event));
  NS_ENSURE_SUCCESS(rv, rv);

  event->InitEvent(aEventName, false, true);
  event->SetTrusted(true);

  bool dummy;
  return target->DispatchEvent(event, &dummy);
}

/* TrayIconImpl */

NS_IMPL_ISUPPORTS(TrayIconImpl, trayITrayIcon, nsIDOMEventListener)

NS_IMETHODIMP TrayIconImpl::GetWindow(nsIDOMWindow **aWindow)
{
  NS_ENSURE_ARG_POINTER(aWindow);
  *aWindow = mWindow;
  NS_ADDREF(*aWindow);
  return NS_OK;
}

NS_IMETHODIMP TrayIconImpl::GetIsMinimized(bool *aIsMinimized)
{
  NS_ENSURE_ARG_POINTER(aIsMinimized);
  *aIsMinimized = mIsMinimized;
  return NS_OK;
}

NS_IMETHODIMP TrayIconImpl::GetCloseOnRestore(bool *aCloseOnRestore)
{
  NS_ENSURE_ARG_POINTER(aCloseOnRestore);
  *aCloseOnRestore = mCloseOnRestore;
  return NS_OK;
}
NS_IMETHODIMP TrayIconImpl::SetCloseOnRestore(bool aCloseOnRestore)
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
  mIsMinimized = true;
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
  mIsMinimized = false;

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
  mIsMinimized = false;

  nsresult rv;
  nsCOMPtr<nsIDOMEventTarget> target = do_QueryInterface(mWindow, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  target->RemoveEventListener(NS_LITERAL_STRING("unload"), this, false);

  return NS_OK;
}

NS_IMETHODIMP TrayIconImpl::HandleEvent(nsIDOMEvent *aEvent)
{
  NS_ENSURE_ARG_POINTER(aEvent);
  Close();
  return NS_OK;
}


NS_IMETHODIMP TrayIconImpl::Init(nsIDOMWindow *aWindow, bool aCloseOnRestore)
{
  NS_ENSURE_ARG_POINTER(aWindow);

  nsresult rv;

  mCloseOnRestore = aCloseOnRestore;

  nsCOMPtr<nsIDOMEventTarget> target = do_QueryInterface(aWindow, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = target->AddEventListener(NS_LITERAL_STRING("unload"), this, false);
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

NS_IMETHODIMP TrayIconImpl::DispatchMouseEvent(const nsAString& aEventName, PRUint16 aButton, nsPoint& pt, bool aCtrlKey, bool aAltKey, bool aShiftKey)
{
  nsresult rv;

  nsCOMPtr<nsPIDOMWindow> window(do_QueryInterface(mWindow));
  NS_ENSURE_TRUE(window, NS_ERROR_INVALID_ARG);

  nsCOMPtr<nsIDocument> doc = window->GetExtantDoc();
  NS_ENSURE_STATE(doc);

  nsCOMPtr<nsIDOMDocument> domDocument(do_QueryInterface(doc));
  NS_ENSURE_STATE(domDocument);

  nsCOMPtr<nsIDOMEventTarget> target(do_QueryInterface(domDocument));
  NS_ENSURE_TRUE(target, NS_ERROR_INVALID_ARG);

  nsCOMPtr<nsIDOMEvent> event;
  rv = domDocument->CreateEvent(NS_LITERAL_STRING("MouseEvents"), getter_AddRefs(event));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIDOMMouseEvent> mouseEvent(do_QueryInterface(event, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mouseEvent->InitMouseEvent(
    aEventName,
    false,
    true,
    mWindow,
    0,
    pt.x,
    pt.y,
    0,
    0,
    aCtrlKey,
    aAltKey,
    aShiftKey,
    false,
    aButton,
    target
    );
  NS_ENSURE_SUCCESS(rv, rv);

  bool dummy;
  return target->DispatchEvent(mouseEvent, &dummy);
}

/* TrayServiceImpl */

NS_IMPL_ISUPPORTS(TrayServiceImpl, trayITrayService, nsIObserver)

TrayServiceImpl::TrayServiceImpl()
{
  platform::Init();

  // Observe when the app is going down.
  // Else we might not properly clean up
  // And leave some tray icons behind
  nsresult rv;
  nsCOMPtr<nsIObserverService> obs(do_GetService("@mozilla.org/observer-service;1", &rv));
  if (NS_SUCCEEDED(rv)) {
    obs->AddObserver(static_cast<nsIObserver*>(this), "xpcom-shutdown", false);
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

NS_IMETHODIMP TrayServiceImpl::CreateIcon(nsIDOMWindow *aWindow, bool aCloseOnRestore, trayITrayIcon **aResult)
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

  RefPtr<TrayIconImpl> icon = new TrayIconImpl(this);
  rv = icon->Init(aWindow, aCloseOnRestore);
  if (NS_SUCCEEDED(rv)) {
    mIcons.AppendObject(icon);
    if (aResult) {
      icon.forget(aResult);
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

NS_IMETHODIMP TrayServiceImpl::Minimize(nsIDOMWindow *aWindow, bool aCloseOnRestore)
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

NS_IMETHODIMP TrayServiceImpl::IsWatchedWindow(nsIDOMWindow *aWindow, bool *aResult)
{
  NS_ENSURE_ARG_POINTER(aWindow);
  NS_ENSURE_ARG_POINTER(aResult);

  *aResult = mWatches.IndexOfObject(aWindow) != -1 ? true : false;
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

NS_IMETHODIMP TrayServiceImpl::Observe(nsISupports *, const char *aTopic, const char16_t *)
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
