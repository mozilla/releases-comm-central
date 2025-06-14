/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPIFACTORY_H_
#define COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPIFACTORY_H_

#include <windows.h>
#include <objbase.h>
#include "nspr.h"
#include "nsISupportsImpl.h"  // ThreadSafeAutoRefCnt
#include <stdint.h>

class CMapiFactory : public IClassFactory {
 public:
  // IUnknown

  STDMETHODIMP QueryInterface(REFIID aIid, void** aPpv);
  STDMETHODIMP_(ULONG) AddRef(void);
  STDMETHODIMP_(ULONG) Release(void);

  // IClassFactory

  STDMETHODIMP CreateInstance(LPUNKNOWN aUnkOuter, REFIID aIid, void** aPpv);
  STDMETHODIMP LockServer(BOOL aLock);

  CMapiFactory();

 private:
  mozilla::ThreadSafeAutoRefCnt m_cRef;

  virtual ~CMapiFactory();
};

#endif  // COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPIFACTORY_H_
