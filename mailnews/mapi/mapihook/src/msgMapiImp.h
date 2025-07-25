/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPIIMP_H_
#define COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPIIMP_H_

#include "msgMapi.h"
#include "nspr.h"
#include "nscore.h"
#include "nsISupportsImpl.h"  // ThreadSafeAutoRefCnt

class nsIMsgFolder;
class MsgMapiListContext;

const CLSID CLSID_CMapiImp = {0x29f458be,
                              0x8866,
                              0x11d5,
                              {0xa3, 0xdd, 0x0, 0xb0, 0xd0, 0xf3, 0xba, 0xa7}};

// this class implements the MS COM interface nsIMapi that provides the methods
// called by mapi32.dll to perform the mail operations as specified by MAPI.
// These class methods in turn use the Mozilla Mail XPCOM interfaces to do so.
class CMapiImp : public nsIMapi {
 public:
  // IUnknown

  STDMETHODIMP QueryInterface(const IID& aIid, void** aPpv);
  STDMETHODIMP_(ULONG) AddRef();
  STDMETHODIMP_(ULONG) Release();

  // Interface INsMapi

  STDMETHODIMP Login(unsigned long aUIArg, LPSTR aLogin, LPSTR aPassWord,
                     unsigned long aFlags, unsigned long* aSessionId);

  STDMETHODIMP SendMail(unsigned long aSession, lpnsMapiMessage aMessage,
                        unsigned long aFlags, unsigned long aReserved);

  STDMETHODIMP SendDocuments(unsigned long aSession, LPSTR aDelimChar,
                             LPSTR aFilePaths, LPSTR aFileNames, ULONG aFlags);

  STDMETHODIMP FindNext(unsigned long aSession, unsigned long ulUIParam,
                        LPSTR lpszMessageType, LPSTR lpszSeedMessageID,
                        unsigned long flFlags, unsigned long ulReserved,
                        unsigned char lpszMessageID[64]);

  STDMETHODIMP ReadMail(unsigned long lhSession, unsigned long ulUIParam,
                        LPSTR lpszMessageID, unsigned long flFlags,
                        unsigned long ulReserved, lpnsMapiMessage* lppMessage);
  STDMETHODIMP DeleteMail(unsigned long lhSession, unsigned long ulUIParam,
                          LPSTR lpszMessageID, unsigned long flFlags,
                          unsigned long ulReserved);
  STDMETHODIMP SaveMail(unsigned long lhSession, unsigned long ulUIParam,
                        lpnsMapiMessage lppMessage, unsigned long flFlags,
                        unsigned long ulReserved, LPSTR lpszMessageID);

  STDMETHODIMP Initialize();
  STDMETHODIMP IsValid();
  STDMETHODIMP IsValidSession(unsigned long aSession);

  STDMETHODIMP SendMailW(unsigned long aSession, lpnsMapiMessageW aMessage,
                         unsigned long aFlags, unsigned long aReserved);

  STDMETHODIMP Logoff(unsigned long aSession);
  STDMETHODIMP CleanUp();

  CMapiImp();
  virtual ~CMapiImp();

  LONG InitContext(unsigned long session, MsgMapiListContext** listContext);
  nsresult GetDefaultInbox(nsIMsgFolder** inboxFolder);

 private:
  PRLock* m_Lock;
  mozilla::ThreadSafeAutoRefCnt m_cRef;
};

#endif  // COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPIIMP_H_
