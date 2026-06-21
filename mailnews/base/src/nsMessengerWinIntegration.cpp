/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMessengerWinIntegration.h"

#include <windows.h>
#include <windowsx.h>
#include <shellapi.h>
#include <strsafe.h>

#include "mozilla/Components.h"
#include "mozilla/intl/Localization.h"
#include "mozilla/Preferences.h"
#include "mozilla/Services.h"
#include "mozIDOMWindow.h"
#include "nsCOMArray.h"
#include "nsIAppStartup.h"
#include "nsIBaseWindow.h"
#include "nsIDocShell.h"  // IWYU pragma: keep
#include "nsIStringBundle.h"
#include "nsISupportsPrimitives.h"
#include "nsIMsgWindow.h"
#include "nsIObserverService.h"
#include "nsIWidget.h"
#include "nsIWindowMediator.h"
#include "nsMsgUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsPIDOMWindow.h"

using namespace mozilla;

#define IDI_MAILBIFF 32576
#define SHOW_TRAY_ICON_PREF "mail.biff.show_tray_icon"
#define SHOW_TRAY_ICON_ALWAYS_PREF "mail.biff.show_tray_icon_always"
#define EXIT_MENU_ITEM_ID 1

// since we are including windows.h in this file, undefine get user name....
#ifdef GetUserName
#  undef GetUserName
#endif

#ifndef NIIF_USER
#  define NIIF_USER 0x00000004
#endif

#ifndef NIIF_NOSOUND
#  define NIIF_NOSOUND 0x00000010
#endif

nsMessengerWinIntegration::nsMessengerWinIntegration() {}

nsMessengerWinIntegration::~nsMessengerWinIntegration() {}

NS_IMPL_ADDREF(nsMessengerWinIntegration)
NS_IMPL_RELEASE(nsMessengerWinIntegration)

NS_INTERFACE_MAP_BEGIN(nsMessengerWinIntegration)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIMessengerOSIntegration)
  NS_INTERFACE_MAP_ENTRY(nsIMessengerWindowsIntegration)
  NS_INTERFACE_MAP_ENTRY(nsIMessengerOSIntegration)
NS_INTERFACE_MAP_END

static HWND hwndForDOMWindow(mozIDOMWindowProxy* window) {
  if (!window) {
    return 0;
  }
  nsCOMPtr<nsPIDOMWindowOuter> pidomwindow = nsPIDOMWindowOuter::From(window);

  nsCOMPtr<nsIBaseWindow> ppBaseWindow =
      do_QueryInterface(pidomwindow->GetDocShell());
  if (!ppBaseWindow) return 0;

  nsCOMPtr<nsIWidget> ppWidget;
  ppBaseWindow->GetMainWidget(getter_AddRefs(ppWidget));

  return (HWND)(ppWidget->GetNativeData(NS_NATIVE_WIDGET));
}

static void activateWindow(mozIDOMWindowProxy* win) {
  // Try to get native window handle.
  HWND hwnd = hwndForDOMWindow(win);
  if (hwnd) {
    // Restore the window if it is minimized.
    if (::IsIconic(hwnd)) ::ShowWindow(hwnd, SW_RESTORE);
    // Use the OS call, if possible.
    ::SetForegroundWindow(hwnd);
  } else {
    // Use internal method.
    nsCOMPtr<nsPIDOMWindowOuter> privateWindow = nsPIDOMWindowOuter::From(win);
    privateWindow->Focus(mozilla::dom::CallerType::System);
  }
}

NOTIFYICONDATAW sMailIconData = {
    /* cbSize */ sizeof(NOTIFYICONDATAW),
    /* hWnd */ 0,
    /* uID */ 2,
    /* uFlags */ NIF_ICON | NIF_MESSAGE | NIF_TIP | NIF_SHOWTIP | NIF_INFO,
    /* uCallbackMessage */ WM_USER,
    /* hIcon */ 0,
    /* szTip */ L"",
    /* dwState */ 0,
    /* dwStateMask */ 0,
    /* szInfo */ L"",
    /* uVersion */ {NOTIFYICON_VERSION_4},
    /* szInfoTitle */ L"",
    /* dwInfoFlags */ NIIF_USER | NIIF_NOSOUND};

constinit static nsCOMArray<nsIBaseWindow> sHiddenWindows;
constinit nsString nsMessengerWinIntegration::kSystemTrayMenuQuitMsg;
static HWND sIconWindow;
static HMENU sIconMenu;
static uint32_t sUnreadCount;

/* static */
nsresult nsMessengerWinIntegration::HandleIconLeftClick(
    nsMessengerWinIntegration* instance) {
  nsresult rv;

  bool showTrayIcon = Preferences::GetBool(SHOW_TRAY_ICON_PREF);
  bool showTrayIconAlways = Preferences::GetBool(SHOW_TRAY_ICON_ALWAYS_PREF);
  if ((!showTrayIcon || !sUnreadCount) && !showTrayIconAlways) {
    ::Shell_NotifyIconW(NIM_DELETE, &sMailIconData);
    if (instance) {
      instance->mTrayIconShown = false;
    }
  }

  // No minimized window, bring the most recent 3pane window to the front.
  if (sHiddenWindows.Length() == 0) {
    nsCOMPtr<nsIWindowMediator> windowMediator =
        do_GetService(NS_WINDOWMEDIATOR_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<mozIDOMWindowProxy> domWindow;
    rv = windowMediator->GetMostRecentBrowserWindow(getter_AddRefs(domWindow));
    NS_ENSURE_SUCCESS(rv, rv);
    if (domWindow) {
      activateWindow(domWindow);
      return NS_OK;
    }
  }

  // Bring the minimized windows to the front.
  for (uint32_t i = 0; i < sHiddenWindows.Length(); i++) {
    auto window = sHiddenWindows.SafeElementAt(i);
    if (!window) {
      continue;
    }
    window->SetVisibility(true);

    nsCOMPtr<nsIWidget> widget;
    window->GetMainWidget(getter_AddRefs(widget));
    if (!widget) {
      continue;
    }

    HWND hwnd = (HWND)(widget->GetNativeData(NS_NATIVE_WIDGET));
    ::ShowWindow(hwnd, SW_RESTORE);
    ::SetForegroundWindow(hwnd);

    nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
    obs->NotifyObservers(window, "windows-refresh-badge-tray", 0);
  }

  sHiddenWindows.Clear();
  return NS_OK;
}

/* static */
nsresult nsMessengerWinIntegration::HandleIconContextMenu(int xPos, int yPos) {
  // Needed to ensure the menu closes when the user clicks outside of it.
  SetForegroundWindow(sIconWindow);

  UINT uFlags = TPM_NONOTIFY | TPM_RETURNCMD;

  // Determine the correct horizontal alignment flag. Per Microsoft, this is
  // essential for creating an optimal user experience.
  if (GetSystemMetrics(SM_MENUDROPALIGNMENT) != 0) {
    uFlags |= TPM_RIGHTALIGN;
  } else {
    uFlags |= TPM_LEFTALIGN;
  }

  BOOL selection = TrackPopupMenuEx(
      /* hMenu */ sIconMenu,
      /* uFlags */ uFlags,
      /* x */ xPos,
      /* y */ yPos,
      /* hwnd */ sIconWindow,
      /* lptpm */ NULL);

  // Force a task switch to the application that called TrackPopupMenuEx.
  PostMessage(sIconWindow, WM_NULL, 0, 0);

  if (selection == EXIT_MENU_ITEM_ID) {
    // Check if it's okay to quit.
    nsCOMPtr<nsISupportsPRBool> cancelQuit =
        do_CreateInstance(NS_SUPPORTS_PRBOOL_CONTRACTID);
    cancelQuit->SetData(false);

    nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
    obs->NotifyObservers(cancelQuit, "quit-application-requested", nullptr);

    bool shouldCancelQuit;
    cancelQuit->GetData(&shouldCancelQuit);

    if (!shouldCancelQuit) {
      // Perform quit.
      nsCOMPtr<nsIAppStartup> appStartup = components::AppStartup::Service();
      NS_ENSURE_TRUE(appStartup, NS_ERROR_FAILURE);

      bool userAllowedQuit = true;
      appStartup->Quit(nsIAppStartup::eAttemptQuit, 0, &userAllowedQuit);
    }
  }

  return NS_OK;
}

/* static */
nsresult nsMessengerWinIntegration::HandleTaskbarRecreated(
    nsMessengerWinIntegration* instance) {
  // When taskbar is recreated (e.g. by restarting Windows Explorer), all
  // tray icons are removed. If there are windows minimized to tray icon,
  // we have to recreate the tray icon, otherwise the windows can't be
  // restored.
  if (instance) {
    instance->mTrayIconShown = false;
  }
  for (uint32_t i = 0; i < sHiddenWindows.Length(); i++) {
    auto window = sHiddenWindows.SafeElementAt(i);
    if (!window) {
      continue;
    }
    nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
    obs->NotifyObservers(window, "windows-refresh-badge-tray", 0);
  }

  return NS_OK;
}

/* static */
LRESULT CALLBACK nsMessengerWinIntegration::IconWindowProc(HWND msgWindow,
                                                           UINT msg, WPARAM wp,
                                                           LPARAM lp) {
  nsresult rv;
  WORD event;
  static UINT sTaskbarRecreated;

  switch (msg) {
    case WM_USER:
      event = LOWORD(lp);
      if (event == WM_LBUTTONDOWN) {
        auto instance = reinterpret_cast<nsMessengerWinIntegration*>(
            ::GetWindowLongPtrW(msgWindow, GWLP_USERDATA));

        rv = HandleIconLeftClick(instance);
        NS_ENSURE_SUCCESS(rv, 0);
        return 0;
      } else if (event == WM_CONTEXTMENU) {
        int xPos = GET_X_LPARAM(wp);
        int yPos = GET_Y_LPARAM(wp);

        rv = HandleIconContextMenu(xPos, yPos);
        NS_ENSURE_SUCCESS(rv, 0);
        return 0;
      }
      break;
    case WM_CREATE:
      sTaskbarRecreated = ::RegisterWindowMessageW(L"TaskbarCreated");
      break;
    default:
      if (msg == sTaskbarRecreated) {
        auto instance = reinterpret_cast<nsMessengerWinIntegration*>(
            ::GetWindowLongPtrW(msgWindow, GWLP_USERDATA));

        rv = HandleTaskbarRecreated(instance);
        NS_ENSURE_SUCCESS(rv, 0);
        return 0;
      }
      break;
  }
  return ::DefWindowProc(msgWindow, msg, wp, lp);
}

NS_IMETHODIMP
nsMessengerWinIntegration::HideWindow(nsIBaseWindow* aWindow) {
  NS_ENSURE_ARG(aWindow);
  aWindow->SetVisibility(false);
  sHiddenWindows.AppendElement(aWindow);

  nsresult rv;
  rv = CreateIconWindow();
  NS_ENSURE_SUCCESS(rv, rv);

  if (!mTrayIconShown) {
    auto idi = IDI_APPLICATION;
    if (sUnreadCount > 0) {
      idi = MAKEINTRESOURCE(IDI_MAILBIFF);
    }
    sMailIconData.hIcon = ::LoadIcon(::GetModuleHandle(NULL), idi);
    nsresult rv = SetTooltip();
    NS_ENSURE_SUCCESS(rv, rv);

    ::Shell_NotifyIconW(NIM_ADD, &sMailIconData);
    ::Shell_NotifyIconW(NIM_SETVERSION, &sMailIconData);
    mTrayIconShown = true;
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMessengerWinIntegration::ShowWindow(mozIDOMWindowProxy* aWindow) {
  activateWindow(aWindow);
  return NS_OK;
}

typedef LONG NTSTATUS;

typedef struct _WNF_STATE_NAME {
  ULONG Data[2];
} WNF_STATE_NAME, *PWNF_STATE_NAME;

typedef struct _WNF_TYPE_ID {
  GUID TypeId;
} WNF_TYPE_ID, *PWNF_TYPE_ID;

typedef ULONG WNF_CHANGE_STAMP, *PWNF_CHANGE_STAMP;

extern "C" NTSTATUS NTAPI NtQueryWnfStateData(
    _In_ PWNF_STATE_NAME StateName, _In_opt_ PWNF_TYPE_ID TypeId,
    _In_opt_ const VOID* ExplicitScope, _Out_ PWNF_CHANGE_STAMP ChangeStamp,
    _Out_writes_bytes_to_opt_(*BufferSize, *BufferSize) PVOID Buffer,
    _Inout_ PULONG BufferSize);

NS_IMETHODIMP
nsMessengerWinIntegration::GetIsInDoNotDisturbMode(bool* inDNDMode) {
  NS_ENSURE_ARG_POINTER(inDNDMode);
  *inDNDMode = false;

  WNF_STATE_NAME WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED{0xA3BF1C75,
                                                            0xD83063E};

  WNF_CHANGE_STAMP unused_change_stamp{};
  DWORD buffer = 0;
  ULONG buffer_size = sizeof(buffer);

  if (SUCCEEDED(::NtQueryWnfStateData(
          &WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED, nullptr, nullptr,
          &unused_change_stamp, &buffer, &buffer_size))) {
    switch (buffer) {
      case 0:  // Off
        break;
      case 1:  // On (Priority only)
      case 2:  // On (Alarms only)
        *inDNDMode = true;
        break;
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMessengerWinIntegration::UpdateUnreadCount(uint32_t unreadCount,
                                             const nsAString& unreadTooltip) {
  sUnreadCount = unreadCount;
  mUnreadTooltip = unreadTooltip;
  nsresult rv = UpdateTrayIcon();
  return rv;
}

NS_IMETHODIMP
nsMessengerWinIntegration::OnExit() {
  if (mTrayIconShown) {
    ::Shell_NotifyIconW(NIM_DELETE, &sMailIconData);
    mTrayIconShown = false;
  }
  return NS_OK;
}

/**
 * Set a tooltip to the tray icon. Including the brand short name, and unread
 * message count.
 */
nsresult nsMessengerWinIntegration::SetTooltip() {
  nsresult rv = NS_OK;
  if (mBrandShortName.IsEmpty()) {
    nsCOMPtr<nsIStringBundleService> bundleService =
        mozilla::components::StringBundle::Service();
    NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);
    nsCOMPtr<nsIStringBundle> bundle;
    rv = bundleService->CreateBundle(
        "chrome://branding/locale/brand.properties", getter_AddRefs(bundle));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = bundle->GetStringFromName("brandShortName", mBrandShortName);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  nsString tooltip = mBrandShortName;
  if (!mUnreadTooltip.IsEmpty()) {
    tooltip.AppendLiteral("\n");
    tooltip.Append(mUnreadTooltip);
  }
  size_t destLength =
      sizeof sMailIconData.szTip / (sizeof sMailIconData.szTip[0]);
  ::StringCchCopyNW(sMailIconData.szTip, destLength, tooltip.get(),
                    tooltip.Length());
  return rv;
}

/**
 * Create a custom window for the taskbar icon if it's not created yet.
 */
nsresult nsMessengerWinIntegration::CreateIconWindow() {
  if (sMailIconData.hWnd) {
    return NS_OK;
  }

  nsresult rv;

  const wchar_t kClassName[] = L"IconWindowClass";
  WNDCLASS classStruct = {/* style */ 0,
                          /* lpfnWndProc */ &IconWindowProc,
                          /* cbClsExtra */ 0,
                          /* cbWndExtra */ 0,
                          /* hInstance */ 0,
                          /* hIcon */ 0,
                          /* hCursor */ 0,
                          /* hbrBackground */ 0,
                          /* lpszMenuName */ 0,
                          /* lpszClassName */ kClassName};

  // Register the window class.
  NS_ENSURE_TRUE(::RegisterClass(&classStruct), NS_ERROR_FAILURE);
  // Create the window.
  NS_ENSURE_TRUE(sIconWindow = ::CreateWindow(
                     /* className */ kClassName,
                     /* title */ 0,
                     /* style */ WS_CAPTION,
                     /* x, y, cx, cy */ 0, 0, 0, 0,
                     /* parent */ 0,
                     /* menu */ 0,
                     /* instance */ 0,
                     /* create struct */ 0),
                 NS_ERROR_FAILURE);
  NS_ENSURE_TRUE(::SetWindowLongPtrW(sIconWindow, GWLP_USERDATA,
                                     reinterpret_cast<LONG_PTR>(this)) == 0,
                 NS_ERROR_FAILURE);

  sMailIconData.hWnd = sIconWindow;

  // Create the context menu.
  NS_ENSURE_TRUE(sIconMenu = CreatePopupMenu(), NS_ERROR_FAILURE);

  // Localize the exit item label.
  RefPtr<mozilla::intl::Localization> l10n =
      mozilla::intl::Localization::Create(
          {"branding/brand.ftl"_ns, "messenger/menubar.ftl"_ns}, true);

  nsAutoCString systemTrayMenuQuitMsg;
  rv = LocalizeMessage(l10n, "system-tray-menuitem-quit"_ns, {},
                       systemTrayMenuQuitMsg);
  NS_ENSURE_SUCCESS(rv, rv);

  CopyUTF8toUTF16(systemTrayMenuQuitMsg, kSystemTrayMenuQuitMsg);

  // Create and insert menu item.
  MENUITEMINFOW menuItemData;
  menuItemData.cbSize = sizeof(MENUITEMINFOW);
  menuItemData.fMask = MIIM_STRING | MIIM_ID;
  menuItemData.wID = EXIT_MENU_ITEM_ID;
  menuItemData.dwTypeData = kSystemTrayMenuQuitMsg.get();

  NS_ENSURE_TRUE(InsertMenuItemW(sIconMenu, GetMenuItemCount(sIconMenu), TRUE,
                                 &menuItemData),
                 NS_ERROR_FAILURE);

  return NS_OK;
}

/**
 * Update the tray icon according to the current unread count and pref value.
 */
nsresult nsMessengerWinIntegration::UpdateTrayIcon() {
  nsresult rv;

  rv = CreateIconWindow();
  NS_ENSURE_SUCCESS(rv, rv);

  rv = SetTooltip();
  NS_ENSURE_SUCCESS(rv, rv);

  bool showTrayIconAlways = Preferences::GetBool(SHOW_TRAY_ICON_ALWAYS_PREF);
  if (sUnreadCount > 0 || showTrayIconAlways) {
    auto idi = IDI_APPLICATION;
    if (sUnreadCount > 0) {
      // Only showing the new mail marker when there are actual unread mail
      idi = MAKEINTRESOURCE(IDI_MAILBIFF);
    }
    sMailIconData.hIcon = ::LoadIcon(::GetModuleHandle(NULL), idi);
    if (mTrayIconShown) {
      // If the tray icon is already shown, just modify it.
      ::Shell_NotifyIconW(NIM_MODIFY, &sMailIconData);
    } else {
      bool showTrayIcon = Preferences::GetBool(SHOW_TRAY_ICON_PREF);
      if (showTrayIcon) {
        // Show a tray icon only if the pref value is true.
        ::Shell_NotifyIconW(NIM_ADD, &sMailIconData);
        ::Shell_NotifyIconW(NIM_SETVERSION, &sMailIconData);
        mTrayIconShown = true;
      }
    }
  } else if (mTrayIconShown) {
    if (sHiddenWindows.Length() > 0) {
      // At least one window is minimized, modify the icon only.
      sMailIconData.hIcon =
          ::LoadIcon(::GetModuleHandle(NULL), IDI_APPLICATION);
      ::Shell_NotifyIconW(NIM_MODIFY, &sMailIconData);
    } else if (!showTrayIconAlways) {
      // No unread, no need to show the tray icon.
      ::Shell_NotifyIconW(NIM_DELETE, &sMailIconData);
      mTrayIconShown = false;
    }
  }
  return rv;
}
