/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMSGSTATUSFEEDBACK_H_
#define COMM_MAILNEWS_BASE_SRC_NSMSGSTATUSFEEDBACK_H_

#include "nsIWebProgressListener.h"
#include "nsCOMPtr.h"
#include "nsIMsgStatusFeedback.h"
#include "nsIProgressEventSink.h"
#include "nsIStringBundle.h"
#include "nsWeakReference.h"
#include "nsIWeakReferenceUtils.h"

class nsMsgStatusFeedback : public nsIMsgStatusFeedback,
                            public nsIProgressEventSink,
                            public nsIWebProgressListener,
                            public nsSupportsWeakReference {
 public:
  nsMsgStatusFeedback();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIMSGSTATUSFEEDBACK
  NS_DECL_NSIWEBPROGRESSLISTENER
  NS_DECL_NSIPROGRESSEVENTSINK

 protected:
  virtual ~nsMsgStatusFeedback();

  bool m_meteorsSpinning;
  int32_t m_lastPercent;
  int64_t m_lastProgressTime;

  void BeginObserving();
  void EndObserving();

  // the JS status feedback implementation object...eventually this object
  // will replace this very C++ class you are looking at.
  nsWeakPtr mJSStatusFeedbackWeak;

  nsCOMPtr<nsIStringBundle> mBundle;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMSGSTATUSFEEDBACK_H_
