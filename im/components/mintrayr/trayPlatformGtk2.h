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
