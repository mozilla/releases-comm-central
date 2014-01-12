/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "trayToolkit.h"
#include "trayPlatformGtk2.h"

#include "nsCOMPtr.h"
#include "nsServiceManagerUtils.h"

/* gtk_status_icon_set_tooltip was added in GTK+ 2.10 and deprecated in 2.16 */
#if !GTK_CHECK_VERSION(2,16,0)
#define gtk_status_icon_set_tooltip_text gtk_status_icon_set_tooltip
#endif

namespace mintrayr {
namespace platform {

#define XATOM(atom) static const Atom atom = XInternAtom(xev->xany.display, #atom, false)

/**
 * Helper: Gdk filter function to "watch" the window
 */
static
GdkFilterReturn filterWindows(XEvent *xev, GdkEvent* event, nsIDOMWindow* window)
{
  XATOM(WM_DELETE_WINDOW);

  if (!xev) {
    return GDK_FILTER_CONTINUE;
  }

  switch (xev->type) {
    case MapNotify:
      {
        nsCOMPtr<trayITrayService> traySvc(do_GetService(TRAYSERVICE_CONTRACTID));
        traySvc->Restore(window);
      }
      break;

    case UnmapNotify:
      if (DoMinimizeWindow(window, kTrayOnMinimize)) {
        return GDK_FILTER_REMOVE;
      }
      break;

    case ClientMessage:
      if (xev->xclient.data.l
          && static_cast<Atom>(xev->xclient.data.l[0]) == WM_DELETE_WINDOW
          && DoMinimizeWindow(window, kTrayOnClose)
      ) {
        return GDK_FILTER_REMOVE;
      }
      break;

    default:
      break;
  }
  return GDK_FILTER_CONTINUE;
}

void Init() {}
void Destroy() {}

Icon* CreateIcon(TrayIconImpl *aOwner, nsIDOMWindow* aWindow, const nsString& aTitle)
{
  return new gtk2::Icon(aOwner, aWindow, aTitle);
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

  GdkWindow *gdkWindow = gdk_window_get_toplevel(reinterpret_cast<GdkWindow*>(native));
  if (!gdkWindow) {
    return NS_ERROR_UNEXPECTED;
  }
  gdk_window_add_filter(gdkWindow, reinterpret_cast<GdkFilterFunc>(filterWindows), aWindow);


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

  GdkWindow *gdkWindow = gdk_window_get_toplevel(reinterpret_cast<GdkWindow*>(native));
  if (!gdkWindow) {
    return NS_ERROR_UNEXPECTED;
  }
  gdk_window_remove_filter(gdkWindow, reinterpret_cast<GdkFilterFunc>(filterWindows), aWindow);

  return NS_OK;
}

namespace gtk2 {

Icon::Icon(TrayIconImpl *aIcon, nsIDOMWindow *aWindow, const nsString& aTitle)
  : mStatusIcon(0), mGtkWindow(0), mGdkWindow(0), mIcon(aIcon)
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

  // Get the window
  mGdkWindow = gdk_window_get_toplevel(reinterpret_cast<GdkWindow*>(native));
  if (!mGdkWindow) {
    return NS_ERROR_UNEXPECTED;
  }

  // Get the widget and gtk window
  GtkWidget *widget;
  gdk_window_get_user_data(mGdkWindow, reinterpret_cast<gpointer*>(&widget));
  widget = gtk_widget_get_toplevel(widget);
  mGtkWindow = reinterpret_cast<GtkWindow*>(widget);

  // Set up tray icon
  mStatusIcon = gtk_status_icon_new();

  // Get the window icon and set it
  GdkPixbuf *buf = gtk_window_get_icon(mGtkWindow);
  if (buf) {
    gtk_status_icon_set_from_pixbuf(mStatusIcon, buf);
  } else {
    const gchar *iconname = gtk_window_get_icon_name(mGtkWindow);
    if (iconname)
      gtk_status_icon_set_from_icon_name(mStatusIcon, iconname);
  }

  // Get and set the title
  if (aTitle.IsEmpty()) {
    gtk_status_icon_set_tooltip_text(mStatusIcon, gtk_window_get_title(mGtkWindow));
    gtk_widget_add_events(widget, GDK_PROPERTY_CHANGE_MASK);
    propertyEventId = g_signal_connect(mGtkWindow, "property-notify-event", G_CALLBACK(gtkPropertyEvent), this);
  }
  else {
    NS_ConvertUTF16toUTF8 titleUTF8(aTitle);
    gtk_status_icon_set_tooltip_text(mStatusIcon, reinterpret_cast<const char*>(titleUTF8.get()));
    propertyEventId = 0;
  }

  // Add signals
  g_signal_connect(G_OBJECT(mStatusIcon), "button-press-event", G_CALLBACK(gtkButtonEvent), this);
  g_signal_connect(G_OBJECT(mStatusIcon), "button-release-event", G_CALLBACK(gtkButtonEvent), this);

  // Make visible
  gtk_status_icon_set_visible(mStatusIcon, 1);
  return NS_OK;
}

Icon::~Icon()
{
  Restore();

  if (mStatusIcon) {
    gtk_status_icon_set_visible(mStatusIcon, 0);
    g_object_unref(mStatusIcon);
  }
  if (propertyEventId) {
    g_signal_handler_disconnect(mGtkWindow, propertyEventId);
  }
}

void Icon::Restore()
{
  gdk_window_show(mGdkWindow);
}

void Icon::Minimize() {
  // Hide the window
  gdk_window_hide(mGdkWindow);
}

void Icon::buttonEvent(GdkEventButton *event)
{
  nsString eventName;
  switch (event->type) {
    case GDK_BUTTON_RELEASE: // use release, so that we don't duplicate events
      eventName = NS_LITERAL_STRING("TrayClick");
      break;
    case GDK_2BUTTON_PRESS:
      eventName = NS_LITERAL_STRING("TrayDblClick");
      break;
    case GDK_3BUTTON_PRESS:
      eventName = NS_LITERAL_STRING("TrayTriClick");
      break;
    default:
      return;
  }

  nsPoint pt((nscoord)(event->x + event->x_root), (nscoord)(event->y + event->y_root));

  // Dispatch the event
#define HASSTATE(x) (event->state & x ? true : false)
  mIcon->DispatchMouseEvent(
      eventName,
      event->button - 1,
      pt,
      HASSTATE(GDK_CONTROL_MASK),
      HASSTATE(GDK_MOD1_MASK),
      HASSTATE(GDK_SHIFT_MASK)
      );
#undef HASSTATE
}

gboolean Icon::propertyEvent()
{
  gtk_status_icon_set_tooltip_text(mStatusIcon, gtk_window_get_title(mGtkWindow));
  return FALSE;
}

} // namespace gtk2

}} // namespaces
