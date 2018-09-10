/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "comi18n.h"
#include "nsICharsetDetector.h"
#include "nsIStringCharsetDetector.h"
#include "nsCyrillicDetector.h"
#include "nsUniversalDetector.h"
#include "nsUdetXPCOMWrapper.h"
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
                           nsACString &result)
{
  nsresult rv;
  nsCOMPtr <nsIMimeConverter> mimeConverter =
    do_GetService(NS_MIME_CONVERTER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) {
    result.Truncate();
    return;
  }
  mimeConverter->DecodeMimeHeaderToUTF8(nsDependentCString(header),
                                        default_charset, override_charset,
                                        eatContinuations, result);
}

class nsJAStringPSMDetector : public nsXPCOMStringDetector
{
public:
  nsJAStringPSMDetector()
    : nsXPCOMStringDetector() {}
};

class nsRUStringProbDetector : public nsCyrXPCOMStringDetector
{
  public:
    nsRUStringProbDetector()
      : nsCyrXPCOMStringDetector(5, gCyrillicCls, gRussian) {}
};

class nsUKStringProbDetector : public nsCyrXPCOMStringDetector
{
  public:
    nsUKStringProbDetector()
      : nsCyrXPCOMStringDetector(5, gCyrillicCls, gUkrainian) {}
};

// UTF-8 utility functions.
//detect charset soly based on aBuf. return in aCharset
nsresult
MIME_detect_charset(const char *aBuf, int32_t aLength, const char** aCharset)
{
  nsresult res = NS_ERROR_UNEXPECTED;
  *aCharset = nullptr;
  nsCOMPtr<nsIStringCharsetDetector> detector;
  nsAutoCString detectorName;
  Preferences::GetLocalizedCString("intl.charset.detector", detectorName);

  if (!detectorName.IsEmpty()) {
    // We recognize one of the three magic strings for the following languages.
    if (detectorName.EqualsLiteral("ruprob")) {
      detector = new nsRUStringProbDetector();
    } else if (detectorName.EqualsLiteral("ukprob")) {
      detector = new nsUKStringProbDetector();
    } else if (detectorName.EqualsLiteral("ja_parallel_state_machine")) {
      detector = new nsJAStringPSMDetector();
    }
  }

  if (detector) {
    nsDetectionConfident oConfident;
    res = detector->DoIt(aBuf, aLength, aCharset, oConfident);
    if (NS_SUCCEEDED(res) && (eBestAnswer == oConfident || eSureAnswer == oConfident)) {
      return NS_OK;
    }
  }
  return res;
}

} /* end of extern "C" */
// END PUBLIC INTERFACE

