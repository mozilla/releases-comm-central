/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Platform specific stuff
 * Must be implemented for each platform
 */

#ifndef __TRAYPLATFORM_H
#define __TRAYPLATFORM_H

#include "xpcom-config.h"

#include "nsCOMPtr.h"
#include "nsStringAPI.h"

#include "mozIDOMWindow.h"

namespace mintrayr {

class TrayIconImpl;

namespace platform {

/**
 * Called when the service goes live
 */
void Init();

/**
 * Called when the service is destroyed
 */
void Destroy();

/**
 * Window should be watched
 */
NS_IMETHODIMP WatchWindow(mozIDOMWindow *aWindow);

/**
 * Window should be unwatched
 */
NS_IMETHODIMP UnwatchWindow(mozIDOMWindow *aWindow);

/**
 * Abstract helper class
 * Encapsulates the platform specific initialization code and message processing
 */
class Icon {
public:
  virtual ~Icon() {}
  virtual void Minimize() = 0;
  virtual void Restore() = 0;
};

/**
 * Factory
 */
Icon* CreateIcon(TrayIconImpl *aOwner, mozIDOMWindow* aWindow, const nsString& aTitle);

} // namespace platform
} // namespace mintrayr

#endif
