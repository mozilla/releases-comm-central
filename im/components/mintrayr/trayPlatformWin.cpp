/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "trayToolkit.h"
#include "trayPlatformWin.h"

namespace mintrayr {
namespace platform {

static const wchar_t kTrayMessage[]  = L"_MINTRAYR_TrayMessageW";
static const wchar_t kDOMWindow[]  = L"_MINTRAYR_DOM";
static const wchar_t kOldProc[] = L"_MINTRAYR_WRAPPER_OLD_PROC";
static const wchar_t kWatch[] = L"_MINTRAYR_WATCH";
static const wchar_t kIcon[] = L"_MINTRAYR_ICON";
static const wchar_t kPlatformIcon[] = L"_MINTRAYR_PICON";

typedef BOOL (WINAPI *pChangeWindowMessageFilter)(UINT message, DWORD dwFlag);
#ifndef MGSFLT_ADD
  // Not a Vista SDK
  #	define MSGFLT_ADD 1
  #	define MSGFLT_REMOVE 2
#endif

static UINT WM_TASKBARCREATED = 0;
static UINT WM_TRAYMESSAGE = 0;

/**
 * Helper function that will allow us to receive some broadcast messages on Vista
 * (We need to bypass that filter if we run as Administrator, but the orginating process
 * has less priviledges)
 */
static void AdjustMessageFilters(UINT filter)
{
  HMODULE user32 = LoadLibraryW(L"user32.dll");
  if (user32 != 0) {
    pChangeWindowMessageFilter changeWindowMessageFilter =
      reinterpret_cast<pChangeWindowMessageFilter>(GetProcAddress(
        user32,
        "ChangeWindowMessageFilter"
      ));
    if (changeWindowMessageFilter != 0) {
      changeWindowMessageFilter(WM_TASKBARCREATED, filter);
    }
    FreeLibrary(user32);
  }
}

/**
 * Helper class to get Windows Version information
 */
class OSVersionInfo : public OSVERSIONINFOEXW
{
public:
  OSVersionInfo() {
    dwOSVersionInfoSize = sizeof(OSVERSIONINFOEXW);
    ::GetVersionExW(reinterpret_cast<LPOSVERSIONINFOW>(this));
  }
  bool isVistaOrLater() {
    return dwMajorVersion >= 6;
  }
};

/**
 * Helper: We need to get the DOMWindow from the hwnd
 */
static bool DoMinimizeWindowWin(HWND hwnd, eMinimizeActions action)
{
  nsIDOMWindow *window = reinterpret_cast<nsIDOMWindow*>(::GetPropW(hwnd, kDOMWindow));
  if (window == 0) {
    return false;
  }
  if (::GetPropW(hwnd, kWatch) == (HANDLE)0x2) {
    return true;
  }
  return DoMinimizeWindow(window, action);
}

/**
 * Helper: Subclassed Windows WNDPROC
 */
static LRESULT CALLBACK WndProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam)
{
  using win::Icon;

  if (::GetPropW(hwnd, kWatch) > (HANDLE)0x0) {
    // Watcher stuff

    switch (uMsg) {
    case WM_WINDOWPOSCHANGING: {
      /* XXX Fix this bit to something more reasonable
         The following code kinda replicates the way mozilla gets the window state.
         We intensionally "hide" the SW_SHOWMINIMIZED here.
         This indeed might cause some side effects, but if it didn't we couldn't open
         menus due to bugzilla #435848,.
         This might defeat said bugfix completely reverting to old behavior, but only when we're active, of course.
         */
      WINDOWPOS *wp = reinterpret_cast<WINDOWPOS*>(lParam);
      if (wp == 0) {
        goto WndProcEnd;
      }
      if (wp->flags & SWP_FRAMECHANGED && ::IsWindowVisible(hwnd)) {
        WINDOWPLACEMENT pl;
        pl.length = sizeof(WINDOWPLACEMENT);
        ::GetWindowPlacement(hwnd, &pl);
        if (pl.showCmd == SW_SHOWMINIMIZED) {
          return 0;
        }
      }
      break;
    }
    case WM_WINDOWPOSCHANGED: {
      /* XXX Fix this bit to something more reasonable
         The following code kinda replicates the way mozilla gets the window state.
         We intensionally "hide" the SW_SHOWMINIMIZED here.
         This indeed might cause some side effects, but if it didn't we couldn't open
         menus due to bugzilla #435848,.
         This might defeat said bugfix completely reverting to old behavior, but only when we're active, of course.
      */
      WINDOWPOS *wp = reinterpret_cast<WINDOWPOS*>(lParam);
      if (wp == 0) {
        goto WndProcEnd;
      }
      if (wp->flags & SWP_SHOWWINDOW) {
        // Shown again, unexpectedly that is, so release
        Icon *me = reinterpret_cast<Icon*>(GetPropW(hwnd, kPlatformIcon));
        if (me == 0 || me->mOwnerIcon == 0 || me->mOwnerIcon->IsClosed()) {
          goto WndProcEnd;
        }
        me->mOwnerIcon->Restore();
      }
      else if (wp->flags & SWP_FRAMECHANGED && ::IsWindowVisible(hwnd)) {
        WINDOWPLACEMENT pl;
        pl.length = sizeof(WINDOWPLACEMENT);
        ::GetWindowPlacement(hwnd, &pl);
        if (pl.showCmd == SW_SHOWMINIMIZED) {
          if (DoMinimizeWindowWin(hwnd, kTrayOnMinimize)) {
            // We're active, ignore
            return 0;
          }
        }
      }
      break;
    } // case WM_WINDOWPOSCHANGED
    case WM_NCLBUTTONDOWN:
    case WM_NCLBUTTONUP:
      // Frame button clicked
      if (wParam == HTCLOSE && DoMinimizeWindowWin(hwnd, kTrayOnClose)) {
        return TRUE;
      }
      break;

    case WM_SYSCOMMAND:
      // Window menu
      if (wParam == SC_CLOSE && DoMinimizeWindowWin(hwnd, kTrayOnClose)) {
        return 0;
      }
      break;
    }
  }

  if (::GetPropW(hwnd, kIcon) == (HANDLE)0x1) {
    // Icon stuff

    // This is a badly documented custom broadcast message by explorer
    if (uMsg == WM_TASKBARCREATED) {
      // Try to get the platform icon
      Icon *me = reinterpret_cast<Icon*>(GetPropW(hwnd, kPlatformIcon));
      if (me == 0 || me->mOwnerIcon == 0 || me->mOwnerIcon->IsClosed()) {
        goto WndProcEnd;
      }
      // The taskbar was (re)created. Add ourselves again.
      Shell_NotifyIconW(NIM_ADD, &me->mIconData);
    }

    // We got clicked. How exciting, isn't it.
    else if (uMsg == WM_TRAYMESSAGE) {
      nsString eventName;
      PRUint16 button = 0;
      switch (LOWORD(lParam)) {
        case WM_LBUTTONUP:
        case WM_MBUTTONUP:
        case WM_RBUTTONUP:
        case WM_CONTEXTMENU:
        case NIN_KEYSELECT:
          eventName = NS_LITERAL_STRING("TrayClick");
          break;
        case WM_LBUTTONDBLCLK:
        case WM_MBUTTONDBLCLK:
        case WM_RBUTTONDBLCLK:
          eventName = NS_LITERAL_STRING("TrayDblClick");
          break;
      }
      switch (LOWORD(lParam)) {
        case WM_LBUTTONUP:
        case WM_LBUTTONDBLCLK:
          button = 0;
          break;
        case WM_MBUTTONUP:
        case WM_MBUTTONDBLCLK:
          button = 1;
          break;
        case WM_RBUTTONUP:
        case WM_RBUTTONDBLCLK:
        case WM_CONTEXTMENU:
        case NIN_KEYSELECT:
          button = 2;
          break;
      }
      if (eventName.IsEmpty() == false) {
        POINT wpt;
        if (GetCursorPos(&wpt) == TRUE) {
          nsPoint pt((nscoord)wpt.x, (nscoord)wpt.y);

          bool ctrlKey = (::GetKeyState(VK_CONTROL) & 0x8000) != 0;
          bool altKey = (::GetKeyState(VK_MENU) & 0x8000) != 0;
          bool shiftKey = (::GetKeyState(VK_SHIFT) & 0x8000) != 0;

          // SFW/PM is a win32 hack, so that the context menu is hidden when loosing focus.
          ::SetForegroundWindow(hwnd);

          // Try to get the platform icon
          Icon *me = reinterpret_cast<Icon*>(GetPropW(hwnd, kPlatformIcon));
          if (me != 0 && me->mOwnerIcon != 0 && !me->mOwnerIcon->IsClosed()) {
            me->mOwnerIcon->DispatchMouseEvent(eventName, button, pt, ctrlKey, altKey, shiftKey);
          }

          ::PostMessage(hwnd, WM_NULL, 0, 0L);
        }
      }
      return 0;
    }

    // Window title changed
    else if (uMsg == WM_SETTEXT) {
      // Try to get the platform icons
      Icon *me = reinterpret_cast<Icon*>(GetPropW(hwnd, kPlatformIcon));
      if (me == 0 || me->mOwnerIcon == 0 || me->mOwnerIcon->IsClosed()) {
        goto WndProcEnd;
      }

      // First, let the original wndproc process this message,
      // so that we may query the thing afterwards ;)
      // this is required because we cannot know the encoding of this message for sure ;)
      LRESULT rv;
      WNDPROC oldWindowProc = reinterpret_cast<WNDPROC>(::GetPropW(hwnd, kOldProc));
      if (oldWindowProc != 0) {
        rv = CallWindowProcW(oldWindowProc, hwnd, uMsg, wParam, lParam);
      }
      else {
        rv = DefWindowProcW(hwnd, uMsg, wParam, lParam);
      }

      if (::GetWindowTextW(hwnd, me->mIconData.szTip, 128) != 0) {
        me->mIconData.szTip[128] = '\0';
        Shell_NotifyIconW(NIM_MODIFY, &me->mIconData);
      }
      return rv;
    }
  }

WndProcEnd:
  // Call the old WNDPROC or at lest DefWindowProc
  WNDPROC oldProc = reinterpret_cast<WNDPROC>(::GetPropW(hwnd, kOldProc));
  if (oldProc != 0) {
    return ::CallWindowProcW(oldProc, hwnd, uMsg, wParam, lParam);
  }
  return ::DefWindowProcW(hwnd, uMsg, wParam, lParam);
}

static void SetupWnd(HWND hwnd, nsIDOMWindow *aWindow)
{
  if (::GetPropW(hwnd, kOldProc) == 0) {
    ::SetPropW(hwnd, kDOMWindow, reinterpret_cast<HANDLE>(aWindow));
    WNDPROC oldProc = reinterpret_cast<WNDPROC>(::SetWindowLongPtrW(hwnd, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(WndProc)));
    ::SetPropW(hwnd, kOldProc, reinterpret_cast<HANDLE>(oldProc));
  }
}

void Init()
{
  // Get TaskbarCreated
  WM_TASKBARCREATED = RegisterWindowMessageW(L"TaskbarCreated");
  // We register this as well, as we cannot know which WM_USER values are already taken
  WM_TRAYMESSAGE = RegisterWindowMessageW(kTrayMessage);

  // Vista (Administrator) needs some love, or else we won't receive anything due to UIPI
  if (OSVersionInfo().isVistaOrLater()) {
    AdjustMessageFilters(MSGFLT_ADD);
  }
}
void Destroy() {
  // Vista (Administrator) needs some unlove, see c'tor
  if (OSVersionInfo().isVistaOrLater()) {
    AdjustMessageFilters(MSGFLT_REMOVE);
  }
}

Icon* CreateIcon(TrayIconImpl *aOwner, nsIDOMWindow* aWindow, const nsString& aTitle)
{
  return new win::Icon(aOwner, aWindow, aTitle);
}

NS_IMETHODIMP WatchWindow(nsIDOMWindow *aWindow)
{
  nsresult rv;

  nsCOMPtr<nsIBaseWindow> baseWindow;
  rv = GetBaseWindow(aWindow, getter_AddRefs(baseWindow));
  NS_ENSURE_SUCCESS(rv, rv);

  nativeWindow native = 0;
  rv = baseWindow->GetParentNativeWindow(&native);
  NS_ENSURE_SUCCESS(rv, rv);

  HWND hwnd = reinterpret_cast<HWND>(native);
  SetupWnd(hwnd, aWindow);
  ::SetPropW(hwnd, kWatch, reinterpret_cast<HANDLE>(0x1));

  return NS_OK;
}
NS_IMETHODIMP UnwatchWindow(nsIDOMWindow *aWindow)
{
  nsresult rv;

  nsCOMPtr<nsIBaseWindow> baseWindow;
  rv = GetBaseWindow(aWindow, getter_AddRefs(baseWindow));
  NS_ENSURE_SUCCESS(rv, rv);

  nativeWindow native = 0;
  rv = baseWindow->GetParentNativeWindow(&native);
  NS_ENSURE_SUCCESS(rv, rv);

  HWND hwnd = reinterpret_cast<HWND>(native);
  ::RemovePropW(hwnd, kWatch);

  return NS_OK;
}

namespace win {

Icon::Icon(TrayIconImpl *aIcon, nsIDOMWindow *aWindow, const nsString& aTitle)
  : mOwnerIcon(aIcon)
{
  Init(aWindow, aTitle);
}
NS_IMETHODIMP Icon::Init(nsIDOMWindow *aWindow, const nsString& aTitle)
{
  nsresult rv;
  nsCOMPtr<nsIBaseWindow> baseWindow;
  rv = GetBaseWindow(aWindow, getter_AddRefs(baseWindow));
  NS_ENSURE_SUCCESS(rv, rv);

  nativeWindow native = 0;
  rv = baseWindow->GetParentNativeWindow(&native);
  NS_ENSURE_SUCCESS(rv, rv);

  mWnd = reinterpret_cast<HWND>(native);
  SetupWnd(mWnd, aWindow);

  // Hook window
  ::SetPropW(mWnd, kIcon, reinterpret_cast<HANDLE>(0x1));

  // Init the icon data according to MSDN
  ZeroMemory(&mIconData, sizeof(mIconData));
  mIconData.cbSize = sizeof(mIconData);

  // Copy the title
  lstrcpynW(mIconData.szTip, aTitle.get(), 127);
  mIconData.szTip[128] = '\0'; // Better be safe than sorry :p

  // Get the window icon
  HICON icon = reinterpret_cast<HICON>(::SendMessageW(mWnd, WM_GETICON, ICON_SMALL, 0));
  if (icon == 0) {
    // Alternative method. Get from the window class
    icon = reinterpret_cast<HICON>(::GetClassLongPtrW(mWnd, GCLP_HICONSM));
  }
  // Alternative method: get the first icon from the main module (executable image of the process)
  if (icon == 0) {
    icon = ::LoadIcon(GetModuleHandleW(0), MAKEINTRESOURCE(0));
  }
  // Alternative method. Use OS default icon
  if (icon == 0) {
    icon = ::LoadIcon(0, IDI_APPLICATION);
  }
  mIconData.hIcon = icon;

  // Set the rest of the members
  mIconData.hWnd = mWnd;
  mIconData.uCallbackMessage = WM_TRAYMESSAGE;
  mIconData.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
  mIconData.uVersion = 5;

  // Install the icon
  ::Shell_NotifyIconW(NIM_ADD, &mIconData);
  ::Shell_NotifyIconW(NIM_SETVERSION, &mIconData);

  ::SetPropW(mWnd, kIcon, reinterpret_cast<HANDLE>(0x1));
  ::SetPropW(mWnd, kPlatformIcon, reinterpret_cast<HANDLE>(this));

  return NS_OK;
}

Icon::~Icon()
{
  Restore();

  // Disable message handling
  ::RemovePropW(mWnd, kIcon);
  ::RemovePropW(mWnd, kPlatformIcon);

  // Remove the icon
  ::Shell_NotifyIconW(NIM_DELETE, &mIconData);

  mOwnerIcon = 0;
}

void Icon::Restore()
{
  // Show the window again
  ::ShowWindow(mWnd, SW_SHOW);

  // If it was minimized then restore it as well
  if (::IsIconic(mWnd)) {
    ::ShowWindow(mWnd, SW_RESTORE);
    // Try to grab focus
    ::SetForegroundWindow(mWnd);
  }
}

void Icon::Minimize() {
  // We need to get a minimize through.
  // Otherwise the SFW/PM hack won't work
  // However we need to protect against the watcher watching this
  HANDLE watch = ::GetPropW(mWnd, kWatch);
  ::SetPropW(mWnd, kWatch, (HANDLE)(0x2));
  ::ShowWindow(mWnd, SW_MINIMIZE);
  ::SetPropW(mWnd, kWatch, watch);

  ::ShowWindow(mWnd, SW_HIDE);
}

} // namespace win

}} // namespaces
