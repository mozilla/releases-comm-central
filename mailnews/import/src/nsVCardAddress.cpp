/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsAbBaseCID.h"
#include "nsNativeCharsetUtils.h"
#include "nsNetUtil.h"
#include "nsVCardAddress.h"

#include "nsIAbCard.h"
#include "nsIAbDirectory.h"
#include "nsIFile.h"
#include "nsIInputStream.h"
#include "nsIUnicharLineInputStream.h"
#include "nsIConverterInputStream.h"
#include "nsIMsgVCardService.h"

#include "plstr.h"
#include "msgCore.h"
#include "nsMsgUtils.h"

nsVCardAddress::nsVCardAddress() {}

nsVCardAddress::~nsVCardAddress() {}

nsresult nsVCardAddress::ImportAddresses(bool* pAbort, const char16_t* pName,
                                         nsIFile* pSrc,
                                         nsIAbDirectory* pDirectory,
                                         nsString& errors,
                                         uint32_t* pProgress) {
  // Open the source file for reading, read each line and process it!
  nsCOMPtr<nsIInputStream> inputStream;
  nsresult rv = NS_NewLocalFileInputStream(getter_AddRefs(inputStream), pSrc);
  if (NS_FAILED(rv)) {
    IMPORT_LOG0("*** Error opening address file for reading\n");
    return rv;
  }

  // Open the source file for reading, read each line and process it!
  // Here we use this to work out the size of the file, so we can update
  // an integer as we go through the file which will update a progress
  // bar if required by the caller.
  uint64_t bytesLeft = 0;
  rv = inputStream->Available(&bytesLeft);
  if (NS_FAILED(rv)) {
    IMPORT_LOG0("*** Error checking address file for size\n");
    inputStream->Close();
    return rv;
  }
  uint64_t totalBytes = bytesLeft;

  // Try to detect the character set and decode. Only UTF-8 is valid from
  // vCard 4.0, but we support older versions, so other charsets are possible.

  nsAutoCString sourceCharset;
  rv = MsgDetectCharsetFromFile(pSrc, sourceCharset);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIConverterInputStream> converterStream =
      do_CreateInstance("@mozilla.org/intl/converter-input-stream;1");
  NS_ENSURE_TRUE(converterStream, NS_ERROR_FAILURE);

  rv = converterStream->Init(
      inputStream, sourceCharset.get(), 8192,
      nsIConverterInputStream::DEFAULT_REPLACEMENT_CHARACTER);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIUnicharLineInputStream> lineStream(
      do_QueryInterface(converterStream, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgVCardService> vCardService =
      do_GetService(NS_MSGVCARDSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  bool more = true;
  nsAutoString record;
  while (!(*pAbort) && more && NS_SUCCEEDED(rv)) {
    rv = ReadRecord(lineStream, record, &more);
    if (NS_SUCCEEDED(rv) && !record.IsEmpty()) {
      // Parse the vCard and build an nsIAbCard from it
      nsCOMPtr<nsIAbCard> cardFromVCard;
      rv = vCardService->VCardToAbCard(record, getter_AddRefs(cardFromVCard));
      NS_ENSURE_SUCCESS(rv, rv);

      nsIAbCard* outCard;
      rv = pDirectory->AddCard(cardFromVCard, &outCard);
      NS_ENSURE_SUCCESS(rv, rv);

      if (NS_FAILED(rv)) {
        IMPORT_LOG0("*** Error processing vCard record.\n");
      }
    }
    if (NS_SUCCEEDED(rv) && pProgress) {
      // This won't be totally accurate, but its the best we can do
      // considering that converterStream won't give us how many bytes
      // are actually left.
      bytesLeft -= record.Length();
      *pProgress = totalBytes - bytesLeft;
    }
  }
  inputStream->Close();

  if (NS_FAILED(rv)) {
    IMPORT_LOG0(
        "*** Error reading the address book - probably incorrect ending\n");
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

nsresult nsVCardAddress::ReadRecord(nsIUnicharLineInputStream* aLineStream,
                                    nsString& aRecord, bool* aMore) {
  bool more = true;
  nsresult rv;
  nsAutoString line;

  aRecord.Truncate();

  // remove the empty lines.
  do {
    rv = aLineStream->ReadLine(line, aMore);
  } while (line.IsEmpty() && *aMore);
  if (!*aMore) return rv;

  // read BEGIN:VCARD
  if (!line.LowerCaseEqualsLiteral("begin:vcard")) {
    IMPORT_LOG0(
        "*** Expected case-insensitive BEGIN:VCARD at start of vCard\n");
    rv = NS_ERROR_FAILURE;
    *aMore = more;
    return rv;
  }
  aRecord.Append(line);

  // read until END:VCARD
  do {
    if (!more) {
      IMPORT_LOG0(
          "*** Expected case-insensitive END:VCARD at start of vCard\n");
      rv = NS_ERROR_FAILURE;
      break;
    }
    rv = aLineStream->ReadLine(line, &more);
    aRecord.AppendLiteral(MSG_LINEBREAK);
    aRecord.Append(line);
  } while (!line.LowerCaseEqualsLiteral("end:vcard"));

  *aMore = more;
  return rv;
}
