/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __TRAYPLATFORMWIN_H
#define __TRAYPLATFORMWIN_H

#include <X11/Xlib.h>
#include <X11/Xatom.h>
#include <X11/Xutil.h>

#include <gtk/gtk.h>
#include <gdk/gdk.h>

#include "trayPlatform.h"

#include "nsCOMPtr.h"

#include "nsIDOMWindow.h"

namespace mintrayr {
namespace platform {
namespace gtk2 {

/**
 * Helper class
 * Encapsulates the Gtk2 specific initialization code and message processing
 */
class Icon : public platform::Icon {
private:
public:
  GtkStatusIcon *mStatusIcon;
  GtkWindow *mGtkWindow;
  GdkWindow *mGdkWindow;
  TrayIconImpl *mIcon;

  Icon(TrayIconImpl *aOwner, nsIDOMWindow* aWindow, const nsString& aTitle);
  virtual ~Icon();

  virtual void Minimize();
  virtual void Restore();

private:
  NS_IMETHOD Init(nsIDOMWindow *aWindow, const nsString& aTitle);

  void buttonEvent(GdkEventButton *event);
  static void gtkButtonEvent(GtkStatusIcon*, GdkEventButton *event, Icon *icon) {
    icon->buttonEvent(event);
  }
  gboolean propertyEvent();
  gulong propertyEventId;
  static gboolean gtkPropertyEvent(GtkStatusIcon*, GdkEventProperty *event, Icon *icon) {
    return icon->propertyEvent();
  }

};

}}} // namespaces

#endif
