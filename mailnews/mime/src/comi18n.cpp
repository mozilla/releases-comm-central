/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "comi18n.h"
#include "nsICharsetDetector.h"
#include "nsICharsetDetectionObserver.h"
#include "nsCyrillicDetector.h"
#include "nsMsgUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsMsgMimeCID.h"
#include "nsIMimeConverter.h"
#include "mozilla/Preferences.h"

using namespace mozilla;

////////////////////////////////////////////////////////////////////////////////
// BEGIN PUBLIC INTERFACE
extern "C" {

void MIME_DecodeMimeHeader(const char *header, const char *default_charset,
                           bool override_charset, bool eatContinuations,
                           nsACString &result) {
  nsresult rv;
  nsCOMPtr<nsIMimeConverter> mimeConverter =
      do_GetService(NS_MIME_CONVERTER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) {
    result.Truncate();
    return;
  }
  mimeConverter->DecodeMimeHeaderToUTF8(nsDependentCString(header),
                                        default_charset, override_charset,
                                        eatContinuations, result);
}

// UTF-8 utility functions.
// detect charset soly based on aBuf. return in aCharset
class CharsetDetectionObserver : public nsICharsetDetectionObserver {
 public:
  NS_DECL_ISUPPORTS
  CharsetDetectionObserver(){};
  NS_IMETHOD Notify(const char *aCharset, nsDetectionConfident aConf) override {
    mCharset.AssignASCII(aCharset);
    mConf = aConf;
    return NS_OK;
  };
  void GetDetectedCharset(nsACString &aCharset) { aCharset = mCharset; }
  nsDetectionConfident GetDetectionConfident() { return mConf; }

 private:
  virtual ~CharsetDetectionObserver() {}
  nsCString mCharset;
  nsDetectionConfident mConf;
};

nsresult MIME_detect_charset(const char *aBuf, int32_t aLength,
                             nsACString &aCharset) {
  nsresult rv = NS_ERROR_UNEXPECTED;
  nsCOMPtr<nsICharsetDetector> detector;
  nsAutoCString detectorName;
  Preferences::GetLocalizedCString("intl.charset.detector", detectorName);

  if (!detectorName.IsEmpty()) {
    // We recognize one of the two magic strings for Russian and Ukranian.
    if (detectorName.EqualsLiteral("ruprob")) {
      detector = new nsRUProbDetector();
    } else if (detectorName.EqualsLiteral("ukprob")) {
      detector = new nsUKProbDetector();
    }
  }

  if (detector) {
    nsAutoCString buffer;

    RefPtr<CharsetDetectionObserver> observer = new CharsetDetectionObserver();

    rv = detector->Init(observer);
    NS_ENSURE_SUCCESS(rv, rv);

    nsDetectionConfident oConfident;
    bool dontFeed = false;
    rv = detector->DoIt(aBuf, aLength, &dontFeed);
    if (NS_SUCCEEDED(rv)) {
      rv = detector->Done();
      NS_ENSURE_SUCCESS(rv, rv);
      oConfident = observer->GetDetectionConfident();
      if (oConfident == eBestAnswer || oConfident == eSureAnswer) {
        observer->GetDetectedCharset(aCharset);
        return NS_OK;
      } else {
        // No luck after all.
        rv = NS_ERROR_UNEXPECTED;
      }
    }
  }
  return rv;
}

} /* end of extern "C" */
// END PUBLIC INTERFACE
