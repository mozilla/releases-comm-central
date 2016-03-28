/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#define MSGCOMP_TRACE_PERFORMANCE 1

#include "nsIMsgComposeService.h"
#include "nsCOMPtr.h"
#include "mozIDOMWindow.h"
#include "nsIXULWindow.h"
#include "nsIObserver.h"
#include "nsWeakReference.h"
#include "nsIMimeStreamConverter.h"
#include "nsInterfaceHashtable.h"

#include "nsICommandLineHandler.h"
#define ICOMMANDLINEHANDLER nsICommandLineHandler

class nsMsgComposeService : 
  public nsIMsgComposeService,
  public ICOMMANDLINEHANDLER,
  public nsSupportsWeakReference
{
public: 
	nsMsgComposeService();

	NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGCOMPOSESERVICE
  NS_DECL_NSICOMMANDLINEHANDLER

  nsresult Init();
  void Reset();
  void DeleteCachedWindows();
  nsresult AddGlobalHtmlDomains();

private:
	virtual ~nsMsgComposeService();
  bool mLogComposePerformance;

  nsresult LoadDraftOrTemplate(const nsACString& aMsgURI, nsMimeOutputType aOutType, 
                               nsIMsgIdentity * aIdentity, const char * aOriginalMsgURI, 
                               nsIMsgDBHdr * aOrigMsgHdr, bool aForwardInline,
                               bool overrideComposeFormat,
                               nsIMsgWindow *aMsgWindow);

  nsresult RunMessageThroughMimeDraft(const nsACString& aMsgURI,
                                      nsMimeOutputType aOutType,
                                      nsIMsgIdentity * aIdentity,
                                      const char * aOriginalMsgURI,
                                      nsIMsgDBHdr * aOrigMsgHdr,
                                      bool aForwardInline,
                                      const nsAString &forwardTo,
                                      bool overrideComposeFormat,
                                      nsIMsgWindow *aMsgWindow);

  // hash table mapping dom windows to nsIMsgCompose objects
  nsInterfaceHashtable<nsISupportsHashKey, nsIWeakReference> mOpenComposeWindows;

  // When doing a reply and the settings are enabled, get the HTML of the selected text
  // in the original message window so that it can be quoted instead of the entire message.
  nsresult GetOrigWindowSelection(MSG_ComposeType type, nsIMsgWindow *aMsgWindow, nsACString& aSelHTML);

#ifdef MSGCOMP_TRACE_PERFORMANCE
  PRIntervalTime            mStartTime;
  PRIntervalTime            mPreviousTime;
#endif
};
