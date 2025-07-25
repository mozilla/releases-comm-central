/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPISUPPORT_H_
#define COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPISUPPORT_H_

#include "nsIObserver.h"
#include "nsIMapiSupport.h"
#include "msgMapiFactory.h"

class nsMapiSupport : public nsIMapiSupport, public nsIObserver {
 public:
  nsMapiSupport();

  // Declare all interface methods we must implement.
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIOBSERVER
  NS_DECL_NSIMAPISUPPORT

 private:
  virtual ~nsMapiSupport();

  DWORD m_dwRegister;
  CMapiFactory* m_nsMapiFactory;
};

#endif  // COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPISUPPORT_H_
