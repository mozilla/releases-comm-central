/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "comi18n.h"
#include "nsIStringCharsetDetector.h"
#include "nsMsgUtils.h"
#include "nsICharsetConverterManager.h"
#include "nsIMIMEHeaderParam.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsMsgMimeCID.h"
#include "nsIMimeConverter.h"


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

// UTF-8 utility functions.
//detect charset soly based on aBuf. return in aCharset
nsresult
MIME_detect_charset(const char *aBuf, int32_t aLength, const char** aCharset)
{
  nsresult res = NS_ERROR_UNEXPECTED;
  nsString detector_name;
  *aCharset = nullptr;

  NS_GetLocalizedUnicharPreferenceWithDefault(nullptr, "intl.charset.detector", EmptyString(), detector_name);

  if (!detector_name.IsEmpty()) {
    nsAutoCString detector_contractid;
    detector_contractid.AssignLiteral(NS_STRCDETECTOR_CONTRACTID_BASE);
    detector_contractid.Append(NS_ConvertUTF16toUTF8(detector_name));
    nsCOMPtr<nsIStringCharsetDetector> detector = do_CreateInstance(detector_contractid.get(), &res);
    if (NS_SUCCEEDED(res)) {
      nsDetectionConfident oConfident;
      res = detector->DoIt(aBuf, aLength, aCharset, oConfident);
      if (NS_SUCCEEDED(res) && (eBestAnswer == oConfident || eSureAnswer == oConfident)) {
        return NS_OK;
      }
    }
  }
  return res;
}

} /* end of extern "C" */
// END PUBLIC INTERFACE

