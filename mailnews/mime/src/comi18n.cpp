/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "comi18n.h"
#include "nsIStringCharsetDetector.h"
#include "nsMsgUtils.h"
#include "nsICharsetConverterManager.h"
#include "nsIMIMEHeaderParam.h"
#include "nsNetCID.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"


////////////////////////////////////////////////////////////////////////////////
// BEGIN PUBLIC INTERFACE
extern "C" {


void MIME_DecodeMimeHeader(const char *header, const char *default_charset,
                           bool override_charset, bool eatContinuations,
                           nsACString &result)
{
  nsresult rv;
  nsCOMPtr <nsIMIMEHeaderParam> mimehdrpar = do_GetService(NS_MIMEHEADERPARAM_CONTRACTID, &rv);
  if (NS_FAILED(rv))
  {
    result.Truncate();
    return;
  }
  mimehdrpar->DecodeRFC2047Header(header, default_charset, override_charset,
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

//Get unicode decoder(from inputcharset to unicode) for aInputCharset
nsresult
MIME_get_unicode_decoder(const char* aInputCharset, nsIUnicodeDecoder **aDecoder)
{
  nsresult res;

  // get charset converters.
  nsCOMPtr<nsICharsetConverterManager> ccm =
           do_GetService(NS_CHARSETCONVERTERMANAGER_CONTRACTID, &res);
  if (NS_SUCCEEDED(res)) {

    // create a decoder (conv to unicode), ok if failed if we do auto detection
    if (!*aInputCharset || !PL_strcasecmp("us-ascii", aInputCharset))
      res = ccm->GetUnicodeDecoderRaw("ISO-8859-1", aDecoder);
    else
      // GetUnicodeDecoderInternal in order to support UTF-7 messages
      //
      // XXX this means that even HTML messages in UTF-7 will be decoded
      res = ccm->GetUnicodeDecoderInternal(aInputCharset, aDecoder);
  }

  return res;
}

//Get unicode encoder(from unicode to inputcharset) for aOutputCharset
nsresult
MIME_get_unicode_encoder(const char* aOutputCharset, nsIUnicodeEncoder **aEncoder)
{
  nsresult res;

  // get charset converters.
  nsCOMPtr<nsICharsetConverterManager> ccm =
           do_GetService(NS_CHARSETCONVERTERMANAGER_CONTRACTID, &res);
  if (NS_SUCCEEDED(res) && *aOutputCharset) {
      // create a encoder (conv from unicode)
      res = ccm->GetUnicodeEncoder(aOutputCharset, aEncoder);
  }

  return res;
}

} /* end of extern "C" */
// END PUBLIC INTERFACE

