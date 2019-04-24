/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsOutlookCompose_h__
#define nsOutlookCompose_h__

#include "nscore.h"
#include "nsString.h"
#include "nsIFile.h"
#include "nsIImportService.h"
#include "nsIOutputStream.h"

class nsIMsgSend;
class nsIMsgCompFields;
class nsIMsgIdentity;
class nsIMsgSendListener;

#include "nsIMsgSend.h"
#include "nsNetUtil.h"

#include "MapiMessage.h"

#include <list>

///////////////////////////////////////////////////////////////////////////////////////////////

class nsOutlookCompose {
 public:
  nsOutlookCompose();
  ~nsOutlookCompose();

  nsresult ProcessMessage(nsMsgDeliverMode mode, CMapiMessage& msg,
                          nsIOutputStream* pDst);
  static nsresult CreateIdentity(void);
  static void ReleaseIdentity(void);

 private:
  nsresult CreateComponents(void);

  void UpdateHeader(CMapiMessageHeaders& oldHeaders,
                    const CMapiMessageHeaders& newHeaders,
                    CMapiMessageHeaders::SpecialHeader header,
                    bool addIfAbsent = true);
  void UpdateHeaders(CMapiMessageHeaders& oldHeaders,
                     const CMapiMessageHeaders& newHeaders);

  nsresult ComposeTheMessage(nsMsgDeliverMode mode, CMapiMessage& msg,
                             nsIFile** pMsg);
  nsresult CopyComposedMessage(nsIFile* pSrc, nsIOutputStream* pDst,
                               CMapiMessage& origMsg);

 private:
  nsCOMPtr<nsIMsgSendListener> m_pListener;
  nsCOMPtr<nsIMsgCompFields> m_pMsgFields;
  static nsCOMPtr<nsIMsgIdentity> m_pIdentity;
  char* m_optimizationBuffer;
  nsCOMPtr<nsIImportService> m_pImportService;
};

#endif /* nsOutlookCompose_h__ */
