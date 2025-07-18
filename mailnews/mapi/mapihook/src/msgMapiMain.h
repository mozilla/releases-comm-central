/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPIMAIN_H_
#define COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPIMAIN_H_

#define MAX_NAME_LEN 256
#define MAX_PW_LEN 256
#define MAX_SESSIONS 50
#define MAPI_SENDCOMPLETE_EVENT "SendCompletionEvent"

#define MAPI_PROPERTIES_CHROME "chrome://messenger-mapi/locale/mapi.properties"
#define PREF_MAPI_WARN_PRIOR_TO_BLIND_SEND "mapi.blind-send.warn"
#define PREF_MAPI_BLIND_SEND_ENABLED "mapi.blind-send.enabled"

#include "nspr.h"
#include "nsTHashMap.h"
#include "nsClassHashtable.h"
#include "nsString.h"

class nsMAPISession;

class nsMAPIConfiguration {
 private:
  static uint32_t session_generator;
  static uint32_t sessionCount;
  static nsMAPIConfiguration* m_pSelfRef;
  PRLock* m_Lock;
  uint32_t m_nMaxSessions;

  nsTHashMap<nsCStringHashKey, uint32_t> m_ProfileMap;
  nsClassHashtable<nsUint32HashKey, nsMAPISession> m_SessionMap;
  nsMAPIConfiguration();
  ~nsMAPIConfiguration();

 public:
  static nsMAPIConfiguration* GetMAPIConfiguration();
  void OpenConfiguration();
  int16_t RegisterSession(uint32_t aHwnd, const nsCString& aUserName,
                          const nsCString& aPassword, bool aForceDownLoad,
                          bool aNewSession, uint32_t* aSession,
                          const char* aIdKey);
  bool IsSessionValid(uint32_t aSessionID);
  bool UnRegisterSession(uint32_t aSessionID);
  char16_t* GetPassword(uint32_t aSessionID);
  void GetIdKey(uint32_t aSessionID, nsCString& aKey);
  void* GetMapiListContext(uint32_t aSessionID);
  void SetMapiListContext(uint32_t aSessionID, void* mapiListContext);

  // a util func
  static HRESULT GetMAPIErrorFromNSError(nsresult res);
};

class nsMAPISession {
  friend class nsMAPIConfiguration;

 private:
  uint32_t m_nShared;
  nsCString m_pIdKey;
  nsCString m_pProfileName;
  nsCString m_pPassword;
  void* m_listContext;  // used by findNext

 public:
  nsMAPISession(uint32_t aHwnd, const nsCString& aUserName,
                const nsCString& aPassword, bool aForceDownLoad,
                const char* aKey);
  uint32_t IncrementSession();
  uint32_t DecrementSession();
  uint32_t GetSessionCount();
  char16_t* GetPassword();
  void GetIdKey(nsCString& aKey);
  ~nsMAPISession();
  // For enumerating Messages...
  void SetMapiListContext(void* listContext) { m_listContext = listContext; }
  void* GetMapiListContext() { return m_listContext; }
};

#endif  // COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_MSGMAPIMAIN_H_
