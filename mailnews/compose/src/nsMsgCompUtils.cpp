/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgCompUtils.h"

#include "nsCOMPtr.h"
#include "prmem.h"
#include "nsDirectoryServiceDefs.h"
#include "nsMsgUtils.h"
#include "nsCExternalHandlerService.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsCRTGlue.h"
#include <ctype.h>
#include "mozilla/dom/Element.h"
#include "mozilla/EncodingDetector.h"
#include "mozilla/Components.h"
#include "mozilla/Preferences.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/ContentIterator.h"
#include "mozilla/dom/Document.h"
#include "nsIMutableArray.h"
#include "nsIRandomGenerator.h"
#include "nsID.h"

using mozilla::Preferences;

static void msg_generate_message_id(nsIMsgIdentity* identity,
                                    const nsACString& customHost,
                                    nsACString& messageID);

NS_IMPL_ISUPPORTS(nsMsgCompUtils, nsIMsgCompUtils)

nsMsgCompUtils::nsMsgCompUtils() {}

nsMsgCompUtils::~nsMsgCompUtils() {}

NS_IMETHODIMP nsMsgCompUtils::MsgGenerateMessageId(nsIMsgIdentity* identity,
                                                   const nsACString& host,
                                                   nsACString& messageID) {
  // We don't check `host` because it's allowed to be a null pointer (which
  // means we should ignore it for message ID generation).
  NS_ENSURE_ARG_POINTER(identity);
  msg_generate_message_id(identity, host, messageID);
  return NS_OK;
}

NS_IMETHODIMP
nsMsgCompUtils::DetectCharset(const nsACString& aContent,
                              nsACString& aCharset) {
  mozilla::UniquePtr<mozilla::EncodingDetector> detector =
      mozilla::EncodingDetector::Create(true);
  mozilla::Span<const uint8_t> src = mozilla::AsBytes(
      mozilla::Span(ToNewCString(aContent), aContent.Length()));
  (void)detector->Feed(src, true);
  auto encoding = detector->Guess(nullptr, true);
  encoding->Name(aCharset);
  return NS_OK;
}

//
// Create a file for the a unique temp file
// on the local machine. Caller must free memory
//
[[nodiscard]] nsresult nsMsgCreateTempFile(const char* tFileName,
                                           nsIFile** tFile) {
  if ((!tFileName) || (!*tFileName)) tFileName = "nsmail.tmp";

  nsresult rv =
      GetSpecialDirectoryWithFileName(NS_OS_TEMP_DIR, tFileName, tFile);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = (*tFile)->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 00600);
  if (NS_FAILED(rv)) {
    NS_RELEASE(*tFile);
    return rv;
  }

  nsCOMPtr<nsPIExternalAppLauncher> appLauncher =
      do_GetService(NS_EXTERNALHELPERAPPSERVICE_CONTRACTID);
  if (appLauncher) {
    appLauncher->DeleteTemporaryFileOnExit(*tFile);
  }

  return NS_OK;
}

static void GenerateGlobalRandomBytes(unsigned char* buf, int32_t len) {
  // Attempt to generate bytes from system entropy-based RNG.
  nsCOMPtr<nsIRandomGenerator> randomGenerator =
      mozilla::components::RandomGenerator::Service();
  MOZ_ASSERT(randomGenerator, "nsIRandomGenerator service not retrievable");
  uint8_t* tempBuffer;
  nsresult rv = randomGenerator->GenerateRandomBytes(len, &tempBuffer);
  if (NS_SUCCEEDED(rv)) {
    memcpy(buf, tempBuffer, len);
    free(tempBuffer);
    return;
  }
  // nsIRandomGenerator failed -- fall back to low entropy PRNG.
  static bool firstTime = true;
  if (firstTime) {
    // Seed the random-number generator with current time so that
    // the numbers will be different every time we run.
    srand((unsigned)PR_Now());
    firstTime = false;
  }

  for (int32_t i = 0; i < len; i++) buf[i] = rand() % 256;
}

char* mime_make_separator(const char* prefix) {
  unsigned char rand_buf[13];
  GenerateGlobalRandomBytes(rand_buf, 12);

  return PR_smprintf(
      "------------%s"
      "%02X%02X%02X%02X"
      "%02X%02X%02X%02X"
      "%02X%02X%02X%02X",
      prefix, rand_buf[0], rand_buf[1], rand_buf[2], rand_buf[3], rand_buf[4],
      rand_buf[5], rand_buf[6], rand_buf[7], rand_buf[8], rand_buf[9],
      rand_buf[10], rand_buf[11]);
}

// Tests if the content of a string is a valid host name.
// In this case, a valid host name is any non-empty string that only contains
// letters (a-z + A-Z), numbers (0-9) and the characters '-', '_' and '.'.
static bool isValidHost(const nsCString& host) {
  if (host.IsEmpty()) {
    return false;
  }

  const auto* cur = host.BeginReading();
  const auto* end = host.EndReading();
  for (; cur < end; ++cur) {
    if (!isalpha(*cur) && !isdigit(*cur) && *cur != '-' && *cur != '_' &&
        *cur != '.') {
      return false;
    }
  }

  return true;
}

// Extract the domain name from an address.
// If none could be found (i.e. the address does not contain an '@' sign, or
// the value following it is not a valid domain), then nullptr is returned.
static void msg_domain_name_from_address(const nsACString& address,
                                         nsACString& host) {
  auto atIndex = address.FindChar('@');

  if (address.IsEmpty() || atIndex == kNotFound) {
    return;
  }

  // Substring() should handle cases where we would go out of bounds (by
  // preventing the index from exceeding the length of the source string), so we
  // don't need to handle this here.
  host = Substring(address, atIndex + 1);
}

// Generate a value for a Message-Id header using the identity and optional
// hostname provided.
static void msg_generate_message_id(nsIMsgIdentity* identity,
                                    const nsACString& customHost,
                                    nsACString& messageID) {
  nsCString host;

  // Check if the identity forces host name. This is sometimes the case when
  // using newsgroup.
  nsCString forcedFQDN;
  nsresult rv = identity->GetCharAttribute("FQDN", forcedFQDN);
  if (NS_SUCCEEDED(rv) && !forcedFQDN.IsEmpty()) {
    host = forcedFQDN;
  }

  // If no valid host name has been set, try using the value defined by the
  // caller, if any.
  if (!isValidHost(host)) {
    host = customHost;
  }

  // If no valid host name has been set, try extracting one from the email
  // address associated with the identity.
  if (!isValidHost(host)) {
    nsCString from;
    rv = identity->GetEmail(from);
    if (NS_SUCCEEDED(rv) && !from.IsEmpty()) {
      msg_domain_name_from_address(from, host);
    }
  }

  // If we still couldn't find a valid host name to use, we can't generate a
  // valid message ID, so bail, and let NNTP and SMTP generate them.
  if (!isValidHost(host)) {
    return;
  }

  // Generate 128-bit UUID for the local part of the ID. `nsID` provides us with
  // cryptographically-secure generation.
  nsID uuid = nsID::GenerateUUID();
  char uuidString[NSID_LENGTH];
  uuid.ToProvidedString(uuidString);
  // Drop first and last characters (curly braces).
  uuidString[NSID_LENGTH - 2] = 0;

  messageID.AppendPrintf("<%s@%s>", uuidString + 1, host.get());
}

/**
 * Check if we should use format=flowed (RFC 2646) for a mail.
 * We will use format=flowed unless the preference tells us not to do so.
 * In this function we set all the serialiser flags.
 * 'formatted' is always 'true'.
 */
void GetSerialiserFlags(bool* flowed, bool* formatted) {
  *flowed = false;
  *formatted = true;

  // Set format=flowed as in RFC 2646 according to the preference.
  Preferences::GetBool("mailnews.send_plaintext_flowed", flowed);
}

already_AddRefed<nsIArray> GetEmbeddedObjects(
    mozilla::dom::Document* aDocument) {
  nsCOMPtr<nsIMutableArray> nodes = do_CreateInstance(NS_ARRAY_CONTRACTID);
  if (NS_WARN_IF(!nodes)) {
    return nullptr;
  }

  mozilla::PostContentIterator iter;
  nsresult rv = iter.Init(aDocument->GetRootElement());
  if (NS_WARN_IF(NS_FAILED(rv))) {
    return nullptr;
  }

  // Loop through the content iterator for each content node.
  while (!iter.IsDone()) {
    nsINode* node = iter.GetCurrentNode();
    if (node->IsElement()) {
      mozilla::dom::Element* element = node->AsElement();

      // See if it's an image or also include all links.
      // Let mail decide which link to send or not
      if (element->IsAnyOfHTMLElements(nsGkAtoms::img, nsGkAtoms::a) ||
          (element->IsHTMLElement(nsGkAtoms::body) &&
           element->HasAttr(kNameSpaceID_None, nsGkAtoms::background))) {
        nodes->AppendElement(node);
      }
    }
    iter.Next();
  }

  return nodes.forget();
}
