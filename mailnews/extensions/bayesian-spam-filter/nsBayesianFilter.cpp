/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsBayesianFilter.h"
#include "nsIInputStream.h"
#include "nsIStreamListener.h"
#include "nsNetUtil.h"
#include "nsQuickSort.h"
#include "nsIMsgMessageService.h"
#include "nsMsgUtils.h"  // for GetMessageServiceFromURI
#include "prnetdb.h"
#include "nsIMsgWindow.h"
#include "mozilla/Logging.h"
#include "nsAppDirectoryServiceDefs.h"
#include "nsUnicharUtils.h"
#include "nsDirectoryServiceUtils.h"
#include "nsIMIMEHeaderParam.h"
#include "nsNetCID.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIStringEnumerator.h"
#include "nsIObserverService.h"
#include "nsIChannel.h"
#include "nsIMailChannel.h"
#include "nsDependentSubstring.h"
#include "nsMemory.h"
#include "nsUnicodeProperties.h"

#include "mozilla/ArenaAllocatorExtensions.h"  // for ArenaStrdup

using namespace mozilla;
using mozilla::intl::Script;
using mozilla::intl::UnicodeProperties;

// needed to mark attachment flag on the db hdr
#include "nsIMsgHdr.h"

// needed to strip html out of the body
#include "nsIParserUtils.h"
#include "nsIDocumentEncoder.h"

#include "nsIncompleteGamma.h"
#include <math.h>
#include <prmem.h>
#include "nsIMsgTraitService.h"
#include "mozilla/Services.h"
#include "mozilla/Attributes.h"
#include <cstdlib>  // for std::abs(int/long)
#include <cmath>    // for std::abs(float/double)

static mozilla::LazyLogModule BayesianFilterLogModule("BayesianFilter");

#define kDefaultJunkThreshold .99  // we override this value via a pref
static const char* kBayesianFilterTokenDelimiters = " \t\n\r\f.";
static unsigned int kMinLengthForToken =
    3;  // lower bound on the number of characters in a word before we treat it
        // as a token
static unsigned int kMaxLengthForToken =
    12;  // upper bound on the number of characters in a word to be declared as
         // a token

#define FORGED_RECEIVED_HEADER_HINT "may be forged"_ns

#ifndef M_LN2
#  define M_LN2 0.69314718055994530942
#endif

#ifndef M_E
#  define M_E 2.7182818284590452354
#endif

// provide base implementation of hash lookup of a string
struct BaseToken : public PLDHashEntryHdr {
  const char* mWord;
};

// token for a particular message
// mCount, mAnalysisLink are initialized to zero by the hash code
struct Token : public BaseToken {
  uint32_t mCount;
  uint32_t mAnalysisLink;  // index in mAnalysisStore of the AnalysisPerToken
                           // object for the first trait for this token
  // Helper to support Tokenizer::copyTokens()
  void clone(const Token& other) {
    mWord = other.mWord;
    mCount = other.mCount;
    mAnalysisLink = other.mAnalysisLink;
  }
};

// token stored in a training file for a group of messages
// mTraitLink is initialized to 0 by the hash code
struct CorpusToken : public BaseToken {
  uint32_t mTraitLink;  // index in mTraitStore of the TraitPerToken
                        // object for the first trait for this token
};

// set the value of a TraitPerToken object
TraitPerToken::TraitPerToken(uint32_t aTraitId, uint32_t aCount)
    : mId(aTraitId), mCount(aCount), mNextLink(0) {}

// shorthand representations of trait ids for junk and good
static const uint32_t kJunkTrait = nsIJunkMailPlugin::JUNK_TRAIT;
static const uint32_t kGoodTrait = nsIJunkMailPlugin::GOOD_TRAIT;

// set the value of an AnalysisPerToken object
AnalysisPerToken::AnalysisPerToken(uint32_t aTraitIndex, double aDistance,
                                   double aProbability)
    : mTraitIndex(aTraitIndex),
      mDistance(aDistance),
      mProbability(aProbability),
      mNextLink(0) {}

// the initial size of the AnalysisPerToken linked list storage
const uint32_t kAnalysisStoreCapacity = 2048;

// the initial size of the TraitPerToken linked list storage
const uint32_t kTraitStoreCapacity = 16384;

// Size of Auto arrays representing per trait information
const uint32_t kTraitAutoCapacity = 10;

TokenEnumeration::TokenEnumeration(PLDHashTable* table)
    : mIterator(table->Iter()) {}

inline bool TokenEnumeration::hasMoreTokens() { return !mIterator.Done(); }

inline BaseToken* TokenEnumeration::nextToken() {
  auto token = static_cast<BaseToken*>(mIterator.Get());
  mIterator.Next();
  return token;
}

// member variables
static const PLDHashTableOps gTokenTableOps = {
    PLDHashTable::HashStringKey, PLDHashTable::MatchStringKey,
    PLDHashTable::MoveEntryStub, PLDHashTable::ClearEntryStub, nullptr};

TokenHash::TokenHash(uint32_t aEntrySize)
    : mTokenTable(&gTokenTableOps, aEntrySize, 128) {
  mEntrySize = aEntrySize;
}

TokenHash::~TokenHash() {}

nsresult TokenHash::clearTokens() {
  // we re-use the tokenizer when classifying multiple messages,
  // so this gets called after every message classification.
  mTokenTable.ClearAndPrepareForLength(128);
  mWordPool.Clear();
  return NS_OK;
}

char* TokenHash::copyWord(const char* word, uint32_t len) {
  return ArenaStrdup(Substring(word, len), mWordPool);
}

inline BaseToken* TokenHash::get(const char* word) {
  PLDHashEntryHdr* entry = mTokenTable.Search(word);
  if (entry) return static_cast<BaseToken*>(entry);
  return NULL;
}

BaseToken* TokenHash::add(const char* word) {
  if (!word || !*word) {
    NS_ERROR("Trying to add a null word");
    return nullptr;
  }

  MOZ_LOG(BayesianFilterLogModule, LogLevel::Debug, ("add word: %s", word));

  PLDHashEntryHdr* entry = mTokenTable.Add(word, mozilla::fallible);
  BaseToken* token = static_cast<BaseToken*>(entry);
  if (token) {
    if (token->mWord == NULL) {
      uint32_t len = strlen(word);
      NS_ASSERTION(len != 0, "adding zero length word to tokenizer");
      if (!len)
        MOZ_LOG(BayesianFilterLogModule, LogLevel::Debug,
                ("adding zero length word to tokenizer"));
      token->mWord = copyWord(word, len);
      NS_ASSERTION(token->mWord, "copyWord failed");
      if (!token->mWord) {
        MOZ_LOG(BayesianFilterLogModule, LogLevel::Error,
                ("copyWord failed: %s (%d)", word, len));
        mTokenTable.RawRemove(entry);
        return NULL;
      }
    }
  }
  return token;
}

inline uint32_t TokenHash::countTokens() { return mTokenTable.EntryCount(); }

inline TokenEnumeration TokenHash::getTokens() {
  return TokenEnumeration(&mTokenTable);
}

Tokenizer::Tokenizer()
    : TokenHash(sizeof(Token)),
      mBodyDelimiters(kBayesianFilterTokenDelimiters),
      mHeaderDelimiters(kBayesianFilterTokenDelimiters),
      mCustomHeaderTokenization(false),
      mMaxLengthForToken(kMaxLengthForToken),
      mIframeToDiv(false) {
  nsresult rv;
  nsCOMPtr<nsIPrefService> prefs =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS_VOID(rv);

  nsCOMPtr<nsIPrefBranch> prefBranch;
  rv = prefs->GetBranch("mailnews.bayesian_spam_filter.",
                        getter_AddRefs(prefBranch));
  NS_ENSURE_SUCCESS_VOID(rv);  // no branch defined, just use defaults

  /*
   * RSS feeds store their summary as alternate content of an iframe. But due
   * to bug 365953, this is not seen by the serializer. As a workaround, allow
   * the tokenizer to replace the iframe with div for tokenization.
   */
  rv = prefBranch->GetBoolPref("iframe_to_div", &mIframeToDiv);
  if (NS_FAILED(rv)) mIframeToDiv = false;

  /*
   * the list of delimiters used to tokenize the message and body
   * defaults to the value in kBayesianFilterTokenDelimiters, but may be
   * set with the following preferences for the body and header
   * separately.
   *
   * \t, \n, \v, \f, \r, and \\ will be escaped to their normal
   * C-library values, all other two-letter combinations beginning with \
   * will be ignored.
   */

  prefBranch->GetCharPref("body_delimiters", mBodyDelimiters);
  if (!mBodyDelimiters.IsEmpty())
    UnescapeCString(mBodyDelimiters);
  else  // prefBranch empties the result when it fails :(
    mBodyDelimiters.Assign(kBayesianFilterTokenDelimiters);

  prefBranch->GetCharPref("header_delimiters", mHeaderDelimiters);
  if (!mHeaderDelimiters.IsEmpty())
    UnescapeCString(mHeaderDelimiters);
  else
    mHeaderDelimiters.Assign(kBayesianFilterTokenDelimiters);

  /*
   * Extensions may wish to enable or disable tokenization of certain headers.
   * Define any headers to enable/disable in a string preference like this:
   *   "mailnews.bayesian_spam_filter.tokenizeheader.headername"
   *
   * where "headername" is the header to tokenize. For example, to tokenize the
   * header "x-spam-status" use the preference:
   *
   *   "mailnews.bayesian_spam_filter.tokenizeheader.x-spam-status"
   *
   * The value of the string preference will be interpreted in one of
   * four ways, depending on the value:
   *
   *   If "false" then do not tokenize that header
   *   If "full" then add the entire header value as a token,
   *     without breaking up into subtokens using delimiters
   *   If "standard" then tokenize the header using as delimiters the current
   *     value of the generic header delimiters
   *   Any other string is interpreted as a list of delimiters to use to parse
   *     the header. \t, \n, \v, \f, \r, and \\ will be escaped to their normal
   *     C-library values, all other two-letter combinations beginning with \
   *     will be ignored.
   *
   * Header names in the preference should be all lower case
   *
   * Extensions may also set the maximum length of a token (default is
   * kMaxLengthForToken) by setting the int preference:
   *   "mailnews.bayesian_spam_filter.maxlengthfortoken"
   */

  nsTArray<nsCString> headers;

  // get customized maximum token length
  int32_t maxLengthForToken;
  rv = prefBranch->GetIntPref("maxlengthfortoken", &maxLengthForToken);
  mMaxLengthForToken =
      NS_SUCCEEDED(rv) ? uint32_t(maxLengthForToken) : kMaxLengthForToken;

  rv = prefs->GetBranch("mailnews.bayesian_spam_filter.tokenizeheader.",
                        getter_AddRefs(prefBranch));
  if (NS_SUCCEEDED(rv)) rv = prefBranch->GetChildList("", headers);

  if (NS_SUCCEEDED(rv)) {
    mCustomHeaderTokenization = true;
    for (auto& header : headers) {
      nsCString value;
      prefBranch->GetCharPref(header.get(), value);
      if (value.EqualsLiteral("false")) {
        mDisabledHeaders.AppendElement(header);
        continue;
      }
      mEnabledHeaders.AppendElement(header);
      if (value.EqualsLiteral("standard"))
        value.SetIsVoid(true);  // Void means use default delimiter
      else if (value.EqualsLiteral("full"))
        value.Truncate();  // Empty means add full header
      else
        UnescapeCString(value);
      mEnabledHeadersDelimiters.AppendElement(value);
    }
  }
}

Tokenizer::~Tokenizer() {}

inline Token* Tokenizer::get(const char* word) {
  return static_cast<Token*>(TokenHash::get(word));
}

Token* Tokenizer::add(const char* word, uint32_t count) {
  MOZ_LOG(BayesianFilterLogModule, LogLevel::Debug,
          ("add word: %s (count=%d)", word, count));

  Token* token = static_cast<Token*>(TokenHash::add(word));
  if (token) {
    token->mCount += count;  // hash code initializes this to zero
    MOZ_LOG(BayesianFilterLogModule, LogLevel::Debug,
            ("adding word to tokenizer: %s (count=%d) (mCount=%d)", word, count,
             token->mCount));
  }
  return token;
}

static bool isDecimalNumber(const char* word) {
  const char* p = word;
  if (*p == '-') ++p;
  char c;
  while ((c = *p++)) {
    if (!isdigit((unsigned char)c)) return false;
  }
  return true;
}

static bool isASCII(const char* word) {
  const unsigned char* p = (const unsigned char*)word;
  unsigned char c;
  while ((c = *p++)) {
    if (c > 127) return false;
  }
  return true;
}

inline bool isUpperCase(char c) { return ('A' <= c) && (c <= 'Z'); }

static char* toLowerCase(char* str) {
  char c, *p = str;
  while ((c = *p++)) {
    if (isUpperCase(c)) p[-1] = c + ('a' - 'A');
  }
  return str;
}

void Tokenizer::addTokenForHeader(const char* aTokenPrefix, nsACString& aValue,
                                  bool aTokenizeValue,
                                  const char* aDelimiters) {
  if (aValue.Length()) {
    ToLowerCase(aValue);
    if (!aTokenizeValue) {
      nsCString tmpStr;
      tmpStr.Assign(aTokenPrefix);
      tmpStr.Append(':');
      tmpStr.Append(aValue);

      add(tmpStr.get());
    } else {
      char* word;
      nsCString str(aValue);
      char* next = str.BeginWriting();
      const char* delimiters =
          !aDelimiters ? mHeaderDelimiters.get() : aDelimiters;
      while ((word = NS_strtok(delimiters, &next)) != NULL) {
        if (strlen(word) < kMinLengthForToken) continue;
        if (isDecimalNumber(word)) continue;
        if (isASCII(word)) {
          nsCString tmpStr;
          tmpStr.Assign(aTokenPrefix);
          tmpStr.Append(':');
          tmpStr.Append(word);
          add(tmpStr.get());
        }
      }
    }
  }
}

void Tokenizer::tokenizeAttachments(
    nsTArray<RefPtr<nsIPropertyBag2>>& attachments) {
  for (auto attachment : attachments) {
    nsCString contentType;
    ToLowerCase(contentType);
    attachment->GetPropertyAsAUTF8String(u"contentType"_ns, contentType);
    addTokenForHeader("attachment/content-type", contentType);

    nsCString displayName;
    attachment->GetPropertyAsAUTF8String(u"displayName"_ns, displayName);
    ToLowerCase(displayName);
    addTokenForHeader("attachment/filename", displayName);
  }
}

void Tokenizer::tokenizeHeaders(nsTArray<nsCString>& aHeaderNames,
                                nsTArray<nsCString>& aHeaderValues) {
  nsCString headerValue;
  nsAutoCString
      headerName;  // we'll be normalizing all header names to lower case

  for (uint32_t i = 0; i < aHeaderNames.Length(); i++) {
    headerName = aHeaderNames[i];
    ToLowerCase(headerName);
    headerValue = aHeaderValues[i];

    bool headerProcessed = false;
    if (mCustomHeaderTokenization) {
      // Process any exceptions set from preferences
      for (uint32_t i = 0; i < mEnabledHeaders.Length(); i++)
        if (headerName.Equals(mEnabledHeaders[i])) {
          if (mEnabledHeadersDelimiters[i].IsVoid())
            // tokenize with standard delimiters for all headers
            addTokenForHeader(headerName.get(), headerValue, true);
          else if (mEnabledHeadersDelimiters[i].IsEmpty())
            // do not break the header into tokens
            addTokenForHeader(headerName.get(), headerValue);
          else
            // use the delimiter in mEnabledHeadersDelimiters
            addTokenForHeader(headerName.get(), headerValue, true,
                              mEnabledHeadersDelimiters[i].get());
          headerProcessed = true;
          break;  // we found the header, no need to look for more custom values
        }

      for (uint32_t i = 0; i < mDisabledHeaders.Length(); i++) {
        if (headerName.Equals(mDisabledHeaders[i])) {
          headerProcessed = true;
          break;
        }
      }

      if (headerProcessed) continue;
    }

    switch (headerName.First()) {
      case 'c':
        if (headerName.EqualsLiteral("content-type")) {
          nsresult rv;
          nsCOMPtr<nsIMIMEHeaderParam> mimehdrpar =
              do_GetService(NS_MIMEHEADERPARAM_CONTRACTID, &rv);
          if (NS_FAILED(rv)) break;

          // extract the charset parameter
          nsCString parameterValue;
          mimehdrpar->GetParameterInternal(headerValue, "charset", nullptr,
                                           nullptr,
                                           getter_Copies(parameterValue));
          addTokenForHeader("charset", parameterValue);

          // create a token containing just the content type
          mimehdrpar->GetParameterInternal(headerValue, "type", nullptr,
                                           nullptr,
                                           getter_Copies(parameterValue));
          if (!parameterValue.Length())
            mimehdrpar->GetParameterInternal(
                headerValue, nullptr /* use first unnamed param */, nullptr,
                nullptr, getter_Copies(parameterValue));
          addTokenForHeader("content-type/type", parameterValue);

          // XXX: should we add a token for the entire content-type header as
          // well or just these parts we have extracted?
        }
        break;
      case 'r':
        if (headerName.EqualsLiteral("received")) {
          // look for the string "may be forged" in the received headers.
          // sendmail sometimes adds this hint This does not compile on linux
          // yet. Need to figure out why. Commenting out for now if
          // (FindInReadable(FORGED_RECEIVED_HEADER_HINT, headerValue))
          //   addTokenForHeader(headerName.get(), FORGED_RECEIVED_HEADER_HINT);
        }

        // leave out reply-to
        break;
      case 's':
        if (headerName.EqualsLiteral("subject")) {
          // we want to tokenize the subject
          addTokenForHeader(headerName.get(), headerValue, true);
        }

        // important: leave out sender field. Too strong of an indicator
        break;
      case 'x':  // (2) X-Mailer / user-agent works best if it is untokenized,
                 // just fold the case and any leading/trailing white space
        // all headers beginning with x-mozilla are being changed by us, so
        // ignore
        if (StringBeginsWith(headerName, "x-mozilla"_ns)) break;
        // fall through
        [[fallthrough]];
      case 'u':
        addTokenForHeader(headerName.get(), headerValue);
        break;
      default:
        addTokenForHeader(headerName.get(), headerValue);
        break;
    }  // end switch
  }
}

void Tokenizer::tokenize_ascii_word(char* aWord) {
  // always deal with normalized lower case strings
  toLowerCase(aWord);
  uint32_t wordLength = strlen(aWord);

  // if the wordLength is within our accepted token limit, then add it
  if (wordLength >= kMinLengthForToken && wordLength <= mMaxLengthForToken)
    add(aWord);
  else if (wordLength > mMaxLengthForToken) {
    // don't skip over the word if it looks like an email address,
    // there is value in adding tokens for addresses
    nsDependentCString word(aWord,
                            wordLength);  // CHEAP, no allocation occurs here...

    // XXX: i think the 40 byte check is just for perf reasons...if the email
    // address is longer than that then forget about it.
    const char* atSign = strchr(aWord, '@');
    if (wordLength < 40 && strchr(aWord, '.') && atSign &&
        !strchr(atSign + 1, '@')) {
      uint32_t numBytesToSep = atSign - aWord;
      if (numBytesToSep <
          wordLength - 1)  // if the @ sign is the last character, it must not
                           // be an email address
      {
        // split the john@foo.com into john and foo.com, treat them as separate
        // tokens
        nsCString emailNameToken;
        emailNameToken.AssignLiteral("email name:");
        emailNameToken.Append(Substring(word, 0, numBytesToSep++));
        add(emailNameToken.get());
        nsCString emailAddrToken;
        emailAddrToken.AssignLiteral("email addr:");
        emailAddrToken.Append(
            Substring(word, numBytesToSep, wordLength - numBytesToSep));
        add(emailAddrToken.get());
        return;
      }
    }

    // there is value in generating a token indicating the number
    // of characters we are skipping. We'll round to the nearest 10
    nsCString skipToken;
    skipToken.AssignLiteral("skip:");
    skipToken.Append(word[0]);
    skipToken.Append(' ');
    skipToken.AppendInt((wordLength / 10) * 10);
    add(skipToken.get());
  }
}

// Copied from mozilla/intl/lwbrk/WordBreaker.cpp

#define ASCII_IS_ALPHA(c) \
  ((('a' <= (c)) && ((c) <= 'z')) || (('A' <= (c)) && ((c) <= 'Z')))
#define ASCII_IS_DIGIT(c) (('0' <= (c)) && ((c) <= '9'))
#define ASCII_IS_SPACE(c) \
  ((' ' == (c)) || ('\t' == (c)) || ('\r' == (c)) || ('\n' == (c)))
#define IS_ALPHABETICAL_SCRIPT(c) ((c) < 0x2E80)

// we change the beginning of IS_HAN from 0x4e00 to 0x3400 to relfect
// Unicode 3.0
#define IS_HAN(c) \
  ((0x3400 <= (c)) && ((c) <= 0x9fff)) || ((0xf900 <= (c)) && ((c) <= 0xfaff))
#define IS_KATAKANA(c) ((0x30A0 <= (c)) && ((c) <= 0x30FF))
#define IS_HIRAGANA(c) ((0x3040 <= (c)) && ((c) <= 0x309F))
#define IS_HALFWIDTHKATAKANA(c) ((0xFF60 <= (c)) && ((c) <= 0xFF9F))

// Return true if aChar belongs to a SEAsian script that is written without
// word spaces, so we need to use the "complex breaker" to find possible word
// boundaries. (https://en.wikipedia.org/wiki/Scriptio_continua)
// (How well this works depends on the level of platform support for finding
// possible line breaks - or possible word boundaries - in the particular
// script. Thai, at least, works pretty well on the major desktop OSes. If
// the script is not supported by the platform, we just won't find any useful
// boundaries.)
static bool IsScriptioContinua(char16_t aChar) {
  Script sc = UnicodeProperties::GetScriptCode(aChar);
  return sc == Script::THAI || sc == Script::MYANMAR || sc == Script::KHMER ||
         sc == Script::JAVANESE || sc == Script::BALINESE ||
         sc == Script::SUNDANESE || sc == Script::LAO;
}

// one subtract and one conditional jump should be faster than two conditional
// jump on most recent system.
#define IN_RANGE(x, low, high) ((uint16_t)((x) - (low)) <= (high) - (low))

#define IS_JA_HIRAGANA(x) IN_RANGE(x, 0x3040, 0x309F)
// swapping the range using xor operation to reduce conditional jump.
#define IS_JA_KATAKANA(x) \
  (IN_RANGE(x ^ 0x0004, 0x30A0, 0x30FE) || (IN_RANGE(x, 0xFF66, 0xFF9F)))
#define IS_JA_KANJI(x) \
  (IN_RANGE(x, 0x2E80, 0x2FDF) || IN_RANGE(x, 0x4E00, 0x9FAF))
#define IS_JA_KUTEN(x) (((x) == 0x3001) || ((x) == 0xFF64) || ((x) == 0xFF0E))
#define IS_JA_TOUTEN(x) (((x) == 0x3002) || ((x) == 0xFF61) || ((x) == 0xFF0C))
#define IS_JA_SPACE(x) ((x) == 0x3000)
#define IS_JA_FWLATAIN(x) IN_RANGE(x, 0xFF01, 0xFF5E)
#define IS_JA_FWNUMERAL(x) IN_RANGE(x, 0xFF10, 0xFF19)

#define IS_JAPANESE_SPECIFIC(x) \
  (IN_RANGE(x, 0x3040, 0x30FF) || IN_RANGE(x, 0xFF01, 0xFF9F))

enum char_class {
  others = 0,
  space,
  hiragana,
  katakana,
  kanji,
  kuten,
  touten,
  kigou,
  fwlatain,
  ascii
};

static char_class getCharClass(char16_t c) {
  char_class charClass = others;

  if (IS_JA_HIRAGANA(c))
    charClass = hiragana;
  else if (IS_JA_KATAKANA(c))
    charClass = katakana;
  else if (IS_JA_KANJI(c))
    charClass = kanji;
  else if (IS_JA_KUTEN(c))
    charClass = kuten;
  else if (IS_JA_TOUTEN(c))
    charClass = touten;
  else if (IS_JA_FWLATAIN(c))
    charClass = fwlatain;

  return charClass;
}

static bool isJapanese(const char* word) {
  nsString text = NS_ConvertUTF8toUTF16(word);
  const char16_t* p = (const char16_t*)text.get();
  char16_t c;

  // it is japanese chunk if it contains any hiragana or katakana.
  while ((c = *p++))
    if (IS_JAPANESE_SPECIFIC(c)) return true;

  return false;
}

static bool isFWNumeral(const char16_t* p1, const char16_t* p2) {
  for (; p1 < p2; p1++)
    if (!IS_JA_FWNUMERAL(*p1)) return false;

  return true;
}

// The japanese tokenizer was added as part of Bug #277354
void Tokenizer::tokenize_japanese_word(char* chunk) {
  MOZ_LOG(BayesianFilterLogModule, LogLevel::Debug,
          ("entering tokenize_japanese_word(%s)", chunk));

  nsString srcStr = NS_ConvertUTF8toUTF16(chunk);
  const char16_t* p1 = srcStr.get();
  const char16_t* p2 = p1;
  if (!*p2) return;

  char_class cc = getCharClass(*p2);
  while (*(++p2)) {
    if (cc == getCharClass(*p2)) continue;

    nsCString token = NS_ConvertUTF16toUTF8(p1, p2 - p1);
    if ((!isDecimalNumber(token.get())) && (!isFWNumeral(p1, p2))) {
      nsCString tmpStr;
      tmpStr.AppendLiteral("JA:");
      tmpStr.Append(token);
      add(tmpStr.get());
    }

    cc = getCharClass(*p2);
    p1 = p2;
  }
}

nsresult Tokenizer::stripHTML(const nsAString& inString, nsAString& outString) {
  uint32_t flags = nsIDocumentEncoder::OutputLFLineBreak |
                   nsIDocumentEncoder::OutputNoScriptContent |
                   nsIDocumentEncoder::OutputNoFramesContent |
                   nsIDocumentEncoder::OutputBodyOnly;
  nsCOMPtr<nsIParserUtils> utils = do_GetService(NS_PARSERUTILS_CONTRACTID);
  return utils->ConvertToPlainText(inString, flags, 80, outString);
}

// Copied from WorfdBreker.cpp due to changes in bug 1728708.
enum WordBreakClass : uint8_t {
  kWbClassSpace = 0,
  kWbClassAlphaLetter,
  kWbClassPunct,
  kWbClassHanLetter,
  kWbClassKatakanaLetter,
  kWbClassHiraganaLetter,
  kWbClassHWKatakanaLetter,
  kWbClassScriptioContinua
};

WordBreakClass GetWordBreakClass(char16_t c) {
  // begin of the hack

  if (IS_ALPHABETICAL_SCRIPT(c)) {
    if (IS_ASCII(c)) {
      if (ASCII_IS_SPACE(c)) {
        return WordBreakClass::kWbClassSpace;
      }
      if (ASCII_IS_ALPHA(c) || ASCII_IS_DIGIT(c) || (c == '_')) {
        return WordBreakClass::kWbClassAlphaLetter;
      }
      return WordBreakClass::kWbClassPunct;
    }
    if (c == 0x00A0 /*NBSP*/) {
      return WordBreakClass::kWbClassSpace;
    }
    if (mozilla::unicode::GetGenCategory(c) == nsUGenCategory::kPunctuation) {
      return WordBreakClass::kWbClassPunct;
    }
    if (IsScriptioContinua(c)) {
      return WordBreakClass::kWbClassScriptioContinua;
    }
    return WordBreakClass::kWbClassAlphaLetter;
  }
  if (IS_HAN(c)) {
    return WordBreakClass::kWbClassHanLetter;
  }
  if (IS_KATAKANA(c)) {
    return kWbClassKatakanaLetter;
  }
  if (IS_HIRAGANA(c)) {
    return WordBreakClass::kWbClassHiraganaLetter;
  }
  if (IS_HALFWIDTHKATAKANA(c)) {
    return WordBreakClass::kWbClassHWKatakanaLetter;
  }
  if (mozilla::unicode::GetGenCategory(c) == nsUGenCategory::kPunctuation) {
    return WordBreakClass::kWbClassPunct;
  }
  if (IsScriptioContinua(c)) {
    return WordBreakClass::kWbClassScriptioContinua;
  }
  return WordBreakClass::kWbClassAlphaLetter;
}

// Copied from nsSemanticUnitScanner.cpp which was removed in bug 1368418.
nsresult Tokenizer::ScannerNext(const char16_t* text, int32_t length,
                                int32_t pos, bool isLastBuffer, int32_t* begin,
                                int32_t* end, bool* _retval) {
  // if we reach the end, just return
  if (pos >= length) {
    *begin = pos;
    *end = pos;
    *_retval = false;
    return NS_OK;
  }

  WordBreakClass char_class = GetWordBreakClass(text[pos]);

  // If we are in Chinese mode, return one Han letter at a time.
  // We should not do this if we are in Japanese or Korean mode.
  if (WordBreakClass::kWbClassHanLetter == char_class) {
    *begin = pos;
    *end = pos + 1;
    *_retval = true;
    return NS_OK;
  }

  int32_t next;
  // Find the next "word".
  next =
      mozilla::intl::WordBreaker::Next(text, (uint32_t)length, (uint32_t)pos);

  // If we don't have enough text to make decision, return.
  if (next == NS_WORDBREAKER_NEED_MORE_TEXT) {
    *begin = pos;
    *end = isLastBuffer ? length : pos;
    *_retval = isLastBuffer;
    return NS_OK;
  }

  // If what we got is space or punct, look at the next break.
  if (char_class == WordBreakClass::kWbClassSpace ||
      char_class == WordBreakClass::kWbClassPunct) {
    // If the next "word" is not letters,
    // call itself recursively with the new pos.
    return ScannerNext(text, length, next, isLastBuffer, begin, end, _retval);
  }

  // For the rest, return.
  *begin = pos;
  *end = next;
  *_retval = true;
  return NS_OK;
}

void Tokenizer::tokenize(const char* aText) {
  MOZ_LOG(BayesianFilterLogModule, LogLevel::Debug, ("tokenize: %s", aText));

  // strip out HTML tags before we begin processing
  // uggh but first we have to blow up our string into UCS2
  // since that's what the document encoder wants. UTF8/UCS2, I wish we all
  // spoke the same language here..
  nsString text = NS_ConvertUTF8toUTF16(aText);
  nsString strippedUCS2;

  // RSS feeds store their summary information as an iframe. But due to
  // bug 365953, we can't see those in the plaintext serializer. As a
  // workaround, allow an option to replace iframe with div in the message
  // text. We disable by default, since most people won't be applying bayes
  // to RSS

  if (mIframeToDiv) {
    text.ReplaceSubstring(u"<iframe"_ns, u"<div"_ns);
    text.ReplaceSubstring(u"/iframe>"_ns, u"/div>"_ns);
  }

  stripHTML(text, strippedUCS2);

  // convert 0x3000(full width space) into 0x0020
  char16_t* substr_start = strippedUCS2.BeginWriting();
  char16_t* substr_end = strippedUCS2.EndWriting();
  while (substr_start != substr_end) {
    if (*substr_start == 0x3000) *substr_start = 0x0020;
    ++substr_start;
  }

  nsCString strippedStr = NS_ConvertUTF16toUTF8(strippedUCS2);
  char* strippedText = strippedStr.BeginWriting();
  MOZ_LOG(BayesianFilterLogModule, LogLevel::Debug,
          ("tokenize stripped html: %s", strippedText));

  char* word;
  char* next = strippedText;
  while ((word = NS_strtok(mBodyDelimiters.get(), &next)) != NULL) {
    if (!*word) continue;
    if (isDecimalNumber(word)) continue;
    if (isASCII(word))
      tokenize_ascii_word(word);
    else if (isJapanese(word))
      tokenize_japanese_word(word);
    else {
      nsresult rv;
      // Convert this word from UTF-8 into UCS2.
      NS_ConvertUTF8toUTF16 uword(word);
      ToLowerCase(uword);
      const char16_t* utext = uword.get();
      int32_t len = uword.Length(), pos = 0, begin, end;
      bool gotUnit;
      while (pos < len) {
        rv = ScannerNext(utext, len, pos, true, &begin, &end, &gotUnit);
        if (NS_SUCCEEDED(rv) && gotUnit) {
          NS_ConvertUTF16toUTF8 utfUnit(utext + begin, end - begin);
          add(utfUnit.get());
          // Advance to end of current unit.
          pos = end;
        } else {
          break;
        }
      }
    }
  }
}

// helper function to un-escape \n, \t, etc from a CString
void Tokenizer::UnescapeCString(nsCString& aCString) {
  nsAutoCString result;

  const char* readEnd = aCString.EndReading();
  result.SetLength(aCString.Length());
  char* writeStart = result.BeginWriting();
  char* writeIter = writeStart;

  bool inEscape = false;
  for (const char* readIter = aCString.BeginReading(); readIter != readEnd;
       readIter++) {
    if (!inEscape) {
      if (*readIter == '\\')
        inEscape = true;
      else
        *(writeIter++) = *readIter;
    } else {
      inEscape = false;
      switch (*readIter) {
        case '\\':
          *(writeIter++) = '\\';
          break;
        case 't':
          *(writeIter++) = '\t';
          break;
        case 'n':
          *(writeIter++) = '\n';
          break;
        case 'v':
          *(writeIter++) = '\v';
          break;
        case 'f':
          *(writeIter++) = '\f';
          break;
        case 'r':
          *(writeIter++) = '\r';
          break;
        default:
          // all other escapes are ignored
          break;
      }
    }
  }
  result.Truncate(writeIter - writeStart);
  aCString.Assign(result);
}

Token* Tokenizer::copyTokens() {
  uint32_t count = countTokens();
  if (count > 0) {
    Token* tokens = new Token[count];
    if (tokens) {
      Token* tp = tokens;
      TokenEnumeration e(&mTokenTable);
      while (e.hasMoreTokens()) {
        Token* src = static_cast<Token*>(e.nextToken());
        tp->clone(*src);
        ++tp;
      }
    }
    return tokens;
  }
  return NULL;
}

class TokenAnalyzer {
 public:
  virtual ~TokenAnalyzer() {}

  virtual void analyzeTokens(Tokenizer& tokenizer) = 0;
  void setTokenListener(nsIStreamListener* aTokenListener) {
    mTokenListener = aTokenListener;
  }

  void setSource(const nsACString& sourceURI) { mTokenSource = sourceURI; }

  nsCOMPtr<nsIStreamListener> mTokenListener;
  nsCString mTokenSource;
};

/**
 * This class downloads the raw content of an email message, buffering until
 * complete segments are seen, that is until a linefeed is seen, although
 * any of the valid token separators would do. This could be a further
 * refinement.
 */
class TokenStreamListener : public nsIStreamListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSISTREAMLISTENER

  explicit TokenStreamListener(TokenAnalyzer* analyzer);

 protected:
  virtual ~TokenStreamListener();
  TokenAnalyzer* mAnalyzer;
  char* mBuffer;
  uint32_t mBufferSize;
  uint32_t mLeftOverCount;
  Tokenizer mTokenizer;
  bool mSetAttachmentFlag;
};

const uint32_t kBufferSize = 16384;

TokenStreamListener::TokenStreamListener(TokenAnalyzer* analyzer)
    : mAnalyzer(analyzer),
      mBuffer(NULL),
      mBufferSize(kBufferSize),
      mLeftOverCount(0),
      mSetAttachmentFlag(false) {}

TokenStreamListener::~TokenStreamListener() {
  delete[] mBuffer;
  delete mAnalyzer;
}

NS_IMPL_ISUPPORTS(TokenStreamListener, nsIRequestObserver, nsIStreamListener)

/* void onStartRequest (in nsIRequest aRequest); */
NS_IMETHODIMP TokenStreamListener::OnStartRequest(nsIRequest* aRequest) {
  mLeftOverCount = 0;
  if (!mBuffer) {
    mBuffer = new char[mBufferSize];
    NS_ENSURE_TRUE(mBuffer, NS_ERROR_OUT_OF_MEMORY);
  }

  return NS_OK;
}

/* void onDataAvailable (in nsIRequest aRequest, in nsIInputStream aInputStream,
 * in unsigned long long aOffset, in unsigned long aCount); */
NS_IMETHODIMP TokenStreamListener::OnDataAvailable(nsIRequest* aRequest,
                                                   nsIInputStream* aInputStream,
                                                   uint64_t aOffset,
                                                   uint32_t aCount) {
  nsresult rv = NS_OK;

  while (aCount > 0) {
    uint32_t readCount, totalCount = (aCount + mLeftOverCount);
    if (totalCount >= mBufferSize) {
      readCount = mBufferSize - mLeftOverCount - 1;
    } else {
      readCount = aCount;
    }

    // mBuffer is supposed to be allocated in onStartRequest. But something
    // is causing that to not happen, so as a last-ditch attempt we'll
    // do it here.
    if (!mBuffer) {
      mBuffer = new char[mBufferSize];
      NS_ENSURE_TRUE(mBuffer, NS_ERROR_OUT_OF_MEMORY);
    }

    char* buffer = mBuffer;
    rv = aInputStream->Read(buffer + mLeftOverCount, readCount, &readCount);
    if (NS_FAILED(rv)) break;

    if (readCount == 0) {
      rv = NS_ERROR_UNEXPECTED;
      NS_WARNING("failed to tokenize");
      break;
    }

    aCount -= readCount;

    /* consume the tokens up to the last legal token delimiter in the buffer. */
    totalCount = (readCount + mLeftOverCount);
    buffer[totalCount] = '\0';
    char* lastDelimiter = NULL;
    char* scan = buffer + totalCount;
    while (scan > buffer) {
      if (strchr(mTokenizer.mBodyDelimiters.get(), *--scan)) {
        lastDelimiter = scan;
        break;
      }
    }

    if (lastDelimiter) {
      *lastDelimiter = '\0';
      mTokenizer.tokenize(buffer);

      uint32_t consumedCount = 1 + (lastDelimiter - buffer);
      mLeftOverCount = totalCount - consumedCount;
      if (mLeftOverCount)
        memmove(buffer, buffer + consumedCount, mLeftOverCount);
    } else {
      /* didn't find a delimiter, keep the whole buffer around. */
      mLeftOverCount = totalCount;
      if (totalCount >= (mBufferSize / 2)) {
        uint32_t newBufferSize = mBufferSize * 2;
        char* newBuffer = new char[newBufferSize];
        NS_ENSURE_TRUE(newBuffer, NS_ERROR_OUT_OF_MEMORY);
        memcpy(newBuffer, mBuffer, mLeftOverCount);
        delete[] mBuffer;
        mBuffer = newBuffer;
        mBufferSize = newBufferSize;
      }
    }
  }

  return rv;
}

/* void onStopRequest (in nsIRequest aRequest, in nsresult aStatusCode); */
NS_IMETHODIMP TokenStreamListener::OnStopRequest(nsIRequest* aRequest,
                                                 nsresult aStatusCode) {
  nsCOMPtr<nsIMailChannel> mailChannel = do_QueryInterface(aRequest);
  if (mailChannel) {
    nsTArray<nsCString> headerNames;
    nsTArray<nsCString> headerValues;
    mailChannel->GetHeaderNames(headerNames);
    mailChannel->GetHeaderValues(headerValues);
    mTokenizer.tokenizeHeaders(headerNames, headerValues);

    nsTArray<RefPtr<nsIPropertyBag2>> attachments;
    mailChannel->GetAttachments(attachments);
    mTokenizer.tokenizeAttachments(attachments);
  }

  if (mLeftOverCount) {
    /* assume final buffer is complete. */
    mBuffer[mLeftOverCount] = '\0';
    mTokenizer.tokenize(mBuffer);
  }

  /* finally, analyze the tokenized message. */
  MOZ_LOG(BayesianFilterLogModule, LogLevel::Debug,
          ("analyze the tokenized message"));
  if (mAnalyzer) mAnalyzer->analyzeTokens(mTokenizer);

  return NS_OK;
}

/* Implementation file */

NS_IMPL_ISUPPORTS(nsBayesianFilter, nsIMsgFilterPlugin, nsIJunkMailPlugin,
                  nsIMsgCorpus, nsISupportsWeakReference, nsIObserver)

nsBayesianFilter::nsBayesianFilter() : mTrainingDataDirty(false) {
  int32_t junkThreshold = 0;
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> pPrefBranch(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  if (pPrefBranch)
    pPrefBranch->GetIntPref("mail.adaptivefilters.junk_threshold",
                            &junkThreshold);

  mJunkProbabilityThreshold = (static_cast<double>(junkThreshold)) / 100.0;
  if (mJunkProbabilityThreshold == 0 || mJunkProbabilityThreshold >= 1)
    mJunkProbabilityThreshold = kDefaultJunkThreshold;

  MOZ_LOG(BayesianFilterLogModule, LogLevel::Warning,
          ("junk probability threshold: %f", mJunkProbabilityThreshold));

  mCorpus.readTrainingData();

  // get parameters for training data flushing, from the prefs

  nsCOMPtr<nsIPrefBranch> prefBranch;

  nsCOMPtr<nsIPrefService> prefs =
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv);
  NS_ASSERTION(NS_SUCCEEDED(rv), "failed accessing preferences service");
  rv = prefs->GetBranch(nullptr, getter_AddRefs(prefBranch));
  NS_ASSERTION(NS_SUCCEEDED(rv), "failed getting preferences branch");

  rv = prefBranch->GetIntPref(
      "mailnews.bayesian_spam_filter.flush.minimum_interval",
      &mMinFlushInterval);
  // it is not a good idea to allow a minimum interval of under 1 second
  if (NS_FAILED(rv) || (mMinFlushInterval <= 1000))
    mMinFlushInterval = DEFAULT_MIN_INTERVAL_BETWEEN_WRITES;

  rv = prefBranch->GetIntPref("mailnews.bayesian_spam_filter.junk_maxtokens",
                              &mMaximumTokenCount);
  if (NS_FAILED(rv))
    mMaximumTokenCount = 0;  // which means do not limit token counts
  MOZ_LOG(BayesianFilterLogModule, LogLevel::Warning,
          ("maximum junk tokens: %d", mMaximumTokenCount));

  // give a default capacity to the memory structure used to store
  // per-message/per-trait token data
  mAnalysisStore.SetCapacity(kAnalysisStoreCapacity);

  // dummy 0th element. Index 0 means "end of list" so we need to
  // start from 1
  AnalysisPerToken analysisPT(0, 0.0, 0.0);
  mAnalysisStore.AppendElement(analysisPT);
  mNextAnalysisIndex = 1;
}

nsresult nsBayesianFilter::Init() {
  nsCOMPtr<nsIObserverService> observerService =
      mozilla::services::GetObserverService();
  if (observerService)
    observerService->AddObserver(this, "profile-before-change", true);
  return NS_OK;
}

void nsBayesianFilter::TimerCallback(nsITimer* aTimer, void* aClosure) {
  // we will flush the training data to disk after enough time has passed
  // since the first time a message has been classified after the last flush

  nsBayesianFilter* filter = static_cast<nsBayesianFilter*>(aClosure);
  filter->mCorpus.writeTrainingData(filter->mMaximumTokenCount);
  filter->mTrainingDataDirty = false;
}

nsBayesianFilter::~nsBayesianFilter() {
  if (mTimer) {
    mTimer->Cancel();
    mTimer = nullptr;
  }
  // call shutdown when we are going away in case we need
  // to flush the training set to disk
  Shutdown();
}

// this object is used for one call to classifyMessage or classifyMessages().
// So if we're classifying multiple messages, this object will be used for each
// message. It's going to hold a reference to itself, basically, to stay in
// memory.
class MessageClassifier : public TokenAnalyzer {
 public:
  // full classifier with arbitrary traits
  MessageClassifier(nsBayesianFilter* aFilter,
                    nsIJunkMailClassificationListener* aJunkListener,
                    nsIMsgTraitClassificationListener* aTraitListener,
                    nsIMsgTraitDetailListener* aDetailListener,
                    const nsTArray<uint32_t>& aProTraits,
                    const nsTArray<uint32_t>& aAntiTraits,
                    nsIMsgWindow* aMsgWindow,
                    const nsTArray<nsCString>& aMessageURIs)
      : mFilter(aFilter),
        mJunkMailPlugin(aFilter),
        mJunkListener(aJunkListener),
        mTraitListener(aTraitListener),
        mDetailListener(aDetailListener),
        mProTraits(aProTraits.Clone()),
        mAntiTraits(aAntiTraits.Clone()),
        mMsgWindow(aMsgWindow),
        mMessageURIs(aMessageURIs.Clone()),
        mCurMessageToClassify(0) {
    MOZ_ASSERT(aProTraits.Length() == aAntiTraits.Length());
  }

  // junk-only classifier
  MessageClassifier(nsBayesianFilter* aFilter,
                    nsIJunkMailClassificationListener* aJunkListener,
                    nsIMsgWindow* aMsgWindow,
                    const nsTArray<nsCString>& aMessageURIs)
      : mFilter(aFilter),
        mJunkMailPlugin(aFilter),
        mJunkListener(aJunkListener),
        mTraitListener(nullptr),
        mDetailListener(nullptr),
        mMsgWindow(aMsgWindow),
        mMessageURIs(aMessageURIs.Clone()),
        mCurMessageToClassify(0) {
    mProTraits.AppendElement(kJunkTrait);
    mAntiTraits.AppendElement(kGoodTrait);
  }

  virtual ~MessageClassifier() {}
  virtual void analyzeTokens(Tokenizer& tokenizer) {
    mFilter->classifyMessage(tokenizer, mTokenSource, mProTraits, mAntiTraits,
                             mJunkListener, mTraitListener, mDetailListener);
    tokenizer.clearTokens();
    classifyNextMessage();
  }

  virtual void classifyNextMessage() {
    if (++mCurMessageToClassify < mMessageURIs.Length()) {
      MOZ_LOG(BayesianFilterLogModule, LogLevel::Warning,
              ("classifyNextMessage(%s)",
               mMessageURIs[mCurMessageToClassify].get()));
      mFilter->tokenizeMessage(mMessageURIs[mCurMessageToClassify], mMsgWindow,
                               this);
    } else {
      // call all listeners with null parameters to signify end of batch
      if (mJunkListener)
        mJunkListener->OnMessageClassified(EmptyCString(),
                                           nsIJunkMailPlugin::UNCLASSIFIED, 0);
      if (mTraitListener) {
        nsTArray<uint32_t> nullTraits;
        nsTArray<uint32_t> nullPercents;
        mTraitListener->OnMessageTraitsClassified(EmptyCString(), nullTraits,
                                                  nullPercents);
      }
      mTokenListener =
          nullptr;  // this breaks the circular ref that keeps this object alive
                    // so we will be destroyed as a result.
    }
  }

 private:
  nsBayesianFilter* mFilter;
  nsCOMPtr<nsIJunkMailPlugin> mJunkMailPlugin;
  nsCOMPtr<nsIJunkMailClassificationListener> mJunkListener;
  nsCOMPtr<nsIMsgTraitClassificationListener> mTraitListener;
  nsCOMPtr<nsIMsgTraitDetailListener> mDetailListener;
  nsTArray<uint32_t> mProTraits;
  nsTArray<uint32_t> mAntiTraits;
  nsCOMPtr<nsIMsgWindow> mMsgWindow;
  nsTArray<nsCString> mMessageURIs;
  uint32_t mCurMessageToClassify;  // 0-based index
};

nsresult nsBayesianFilter::tokenizeMessage(const nsACString& aMessageURI,
                                           nsIMsgWindow* aMsgWindow,
                                           TokenAnalyzer* aAnalyzer) {
  nsCOMPtr<nsIMsgMessageService> msgService;
  nsresult rv =
      GetMessageServiceFromURI(aMessageURI, getter_AddRefs(msgService));
  NS_ENSURE_SUCCESS(rv, rv);

  aAnalyzer->setSource(aMessageURI);
  nsCOMPtr<nsIURI> dummyNull;
  return msgService->StreamMessage(
      aMessageURI, aAnalyzer->mTokenListener, aMsgWindow, nullptr,
      true /* convert data */, "filter"_ns, false, getter_AddRefs(dummyNull));
}

// a TraitAnalysis is the per-token representation of the statistical
// calculations, basically created to group information that is then
// sorted by mDistance
struct TraitAnalysis {
  uint32_t mTokenIndex;
  double mDistance;
  double mProbability;
};

// comparator required to sort an nsTArray
class compareTraitAnalysis {
 public:
  bool Equals(const TraitAnalysis& a, const TraitAnalysis& b) const {
    return a.mDistance == b.mDistance;
  }
  bool LessThan(const TraitAnalysis& a, const TraitAnalysis& b) const {
    return a.mDistance < b.mDistance;
  }
};

inline double dmax(double x, double y) { return (x > y ? x : y); }
inline double dmin(double x, double y) { return (x < y ? x : y); }

// Chi square functions are implemented by an incomplete gamma function.
// Note that chi2P's callers multiply the arguments by 2 but chi2P
// divides them by 2 again. Inlining chi2P gives the compiler a
// chance to notice this.

// Both chi2P and nsIncompleteGammaP set *error negative on domain
// errors and nsIncompleteGammaP sets it posivive on internal errors.
// This may be useful but the chi2P callers treat any error as fatal.

// Note that converting unsigned ints to floating point can be slow on
// some platforms (like Intel) so use signed quantities for the numeric
// routines.
static inline double chi2P(double chi2, double nu, int32_t* error) {
  // domain checks; set error and return a dummy value
  if (chi2 < 0.0 || nu <= 0.0) {
    *error = -1;
    return 0.0;
  }
  // reversing the arguments is intentional
  return nsIncompleteGammaP(nu / 2.0, chi2 / 2.0, error);
}

void nsBayesianFilter::classifyMessage(
    Tokenizer& tokenizer, const nsACString& messageURI,
    nsTArray<uint32_t>& aProTraits, nsTArray<uint32_t>& aAntiTraits,
    nsIJunkMailClassificationListener* listener,
    nsIMsgTraitClassificationListener* aTraitListener,
    nsIMsgTraitDetailListener* aDetailListener) {
  if (aProTraits.Length() != aAntiTraits.Length()) {
    NS_ERROR("Each Pro trait needs a matching Anti trait");
    return;
  }
  Token* tokens = tokenizer.copyTokens();
  uint32_t tokenCount;
  if (!tokens) {
    // This can happen with problems with UTF conversion
    NS_ERROR("Trying to classify a null or invalid message");
    tokenCount = 0;
    // don't return so that we still call the listeners
  } else {
    tokenCount = tokenizer.countTokens();
  }

  /* this part is similar to the Graham algorithm with some adjustments. */
  uint32_t traitCount = aProTraits.Length();

  // pro message counts per trait index
  AutoTArray<uint32_t, kTraitAutoCapacity> numProMessages;
  // anti message counts per trait index
  AutoTArray<uint32_t, kTraitAutoCapacity> numAntiMessages;
  // array of pro aliases per trait index
  AutoTArray<nsTArray<uint32_t>, kTraitAutoCapacity> proAliasArrays;
  // array of anti aliases per trait index
  AutoTArray<nsTArray<uint32_t>, kTraitAutoCapacity> antiAliasArrays;
  // construct the outgoing listener arrays
  AutoTArray<uint32_t, kTraitAutoCapacity> traits;
  AutoTArray<uint32_t, kTraitAutoCapacity> percents;
  if (traitCount > kTraitAutoCapacity) {
    traits.SetCapacity(traitCount);
    percents.SetCapacity(traitCount);
    numProMessages.SetCapacity(traitCount);
    numAntiMessages.SetCapacity(traitCount);
    proAliasArrays.SetCapacity(traitCount);
    antiAliasArrays.SetCapacity(traitCount);
  }

  nsresult rv;
  nsCOMPtr<nsIMsgTraitService> traitService(
      do_GetService("@mozilla.org/msg-trait-service;1", &rv));
  if (NS_FAILED(rv)) {
    NS_ERROR("Failed to get trait service");
    MOZ_LOG(BayesianFilterLogModule, LogLevel::Error,
            ("Failed to get trait service"));
  }

  // get aliases and message counts for the pro and anti traits
  for (uint32_t traitIndex = 0; traitIndex < traitCount; traitIndex++) {
    nsresult rv;

    // pro trait
    nsTArray<uint32_t> proAliases;
    uint32_t proTrait = aProTraits[traitIndex];
    if (traitService) {
      rv = traitService->GetAliases(proTrait, proAliases);
      if (NS_FAILED(rv)) {
        NS_ERROR("trait service failed to get aliases");
        MOZ_LOG(BayesianFilterLogModule, LogLevel::Error,
                ("trait service failed to get aliases"));
      }
    }
    proAliasArrays.AppendElement(proAliases.Clone());
    uint32_t proMessageCount = mCorpus.getMessageCount(proTrait);
    for (uint32_t aliasIndex = 0; aliasIndex < proAliases.Length();
         aliasIndex++)
      proMessageCount += mCorpus.getMessageCount(proAliases[aliasIndex]);
    numProMessages.AppendElement(proMessageCount);

    // anti trait
    nsTArray<uint32_t> antiAliases;
    uint32_t antiTrait = aAntiTraits[traitIndex];
    if (traitService) {
      rv = traitService->GetAliases(antiTrait, antiAliases);
      if (NS_FAILED(rv)) {
        NS_ERROR("trait service failed to get aliases");
        MOZ_LOG(BayesianFilterLogModule, LogLevel::Error,
                ("trait service failed to get aliases"));
      }
    }
    antiAliasArrays.AppendElement(antiAliases.Clone());
    uint32_t antiMessageCount = mCorpus.getMessageCount(antiTrait);
    for (uint32_t aliasIndex = 0; aliasIndex < antiAliases.Length();
         aliasIndex++)
      antiMessageCount += mCorpus.getMessageCount(antiAliases[aliasIndex]);
    numAntiMessages.AppendElement(antiMessageCount);
  }

  for (uint32_t i = 0; i < tokenCount; ++i) {
    Token& token = tokens[i];
    CorpusToken* t = mCorpus.get(token.mWord);
    if (!t) continue;
    for (uint32_t traitIndex = 0; traitIndex < traitCount; traitIndex++) {
      uint32_t iProCount = mCorpus.getTraitCount(t, aProTraits[traitIndex]);
      // add in any counts for aliases to proTrait
      for (uint32_t aliasIndex = 0;
           aliasIndex < proAliasArrays[traitIndex].Length(); aliasIndex++)
        iProCount +=
            mCorpus.getTraitCount(t, proAliasArrays[traitIndex][aliasIndex]);
      double proCount = static_cast<double>(iProCount);

      uint32_t iAntiCount = mCorpus.getTraitCount(t, aAntiTraits[traitIndex]);
      // add in any counts for aliases to antiTrait
      for (uint32_t aliasIndex = 0;
           aliasIndex < antiAliasArrays[traitIndex].Length(); aliasIndex++)
        iAntiCount +=
            mCorpus.getTraitCount(t, antiAliasArrays[traitIndex][aliasIndex]);
      double antiCount = static_cast<double>(iAntiCount);

      double prob, denom;
      // Prevent a divide by zero error by setting defaults for prob

      // If there are no matching tokens at all, ignore.
      if (antiCount == 0.0 && proCount == 0.0) continue;
      // if only anti match, set probability to 0%
      if (proCount == 0.0) prob = 0.0;
      // if only pro match, set probability to 100%
      else if (antiCount == 0.0)
        prob = 1.0;
      // not really needed, but just to be sure check the denom as well
      else if ((denom = proCount * numAntiMessages[traitIndex] +
                        antiCount * numProMessages[traitIndex]) == 0.0)
        continue;
      else
        prob = (proCount * numAntiMessages[traitIndex]) / denom;

      double n = proCount + antiCount;
      prob = (0.225 + n * prob) / (.45 + n);
      double distance = std::abs(prob - 0.5);
      if (distance >= .1) {
        mozilla::DebugOnly<nsresult> rv =
            setAnalysis(token, traitIndex, distance, prob);
        NS_ASSERTION(NS_SUCCEEDED(rv), "Problem in setAnalysis");
      }
    }
  }

  for (uint32_t traitIndex = 0; traitIndex < traitCount; traitIndex++) {
    AutoTArray<TraitAnalysis, 1024> traitAnalyses;
    // copy valid tokens into an array to sort
    for (uint32_t tokenIndex = 0; tokenIndex < tokenCount; tokenIndex++) {
      uint32_t storeIndex = getAnalysisIndex(tokens[tokenIndex], traitIndex);
      if (storeIndex) {
        TraitAnalysis ta = {tokenIndex, mAnalysisStore[storeIndex].mDistance,
                            mAnalysisStore[storeIndex].mProbability};
        traitAnalyses.AppendElement(ta);
      }
    }

    // sort the array by the distances
    traitAnalyses.Sort(compareTraitAnalysis());
    uint32_t count = traitAnalyses.Length();
    uint32_t first, last = count;
    const uint32_t kMaxTokens = 150;
    first = (count > kMaxTokens) ? count - kMaxTokens : 0;

    // Setup the arrays to save details if needed
    nsTArray<double> sArray;
    nsTArray<double> hArray;
    uint32_t usedTokenCount = (count > kMaxTokens) ? kMaxTokens : count;
    if (aDetailListener) {
      sArray.SetCapacity(usedTokenCount);
      hArray.SetCapacity(usedTokenCount);
    }

    double H = 1.0, S = 1.0;
    int32_t Hexp = 0, Sexp = 0;
    uint32_t goodclues = 0;
    int e;

    // index from end to analyze most significant first
    for (uint32_t ip1 = last; ip1 != first; --ip1) {
      TraitAnalysis& ta = traitAnalyses[ip1 - 1];
      if (ta.mDistance > 0.0) {
        goodclues++;
        double value = ta.mProbability;
        S *= (1.0 - value);
        H *= value;
        if (S < 1e-200) {
          S = frexp(S, &e);
          Sexp += e;
        }
        if (H < 1e-200) {
          H = frexp(H, &e);
          Hexp += e;
        }
        MOZ_LOG(BayesianFilterLogModule, LogLevel::Warning,
                ("token probability (%s) is %f", tokens[ta.mTokenIndex].mWord,
                 ta.mProbability));
      }
      if (aDetailListener) {
        sArray.AppendElement(log(S) + Sexp * M_LN2);
        hArray.AppendElement(log(H) + Hexp * M_LN2);
      }
    }

    S = log(S) + Sexp * M_LN2;
    H = log(H) + Hexp * M_LN2;

    double prob;
    if (goodclues > 0) {
      int32_t chi_error;
      S = chi2P(-2.0 * S, 2.0 * goodclues, &chi_error);
      if (!chi_error) H = chi2P(-2.0 * H, 2.0 * goodclues, &chi_error);
      // if any error toss the entire calculation
      if (!chi_error)
        prob = (S - H + 1.0) / 2.0;
      else
        prob = 0.5;
    } else
      prob = 0.5;

    if (aDetailListener) {
      // Prepare output arrays
      nsTArray<uint32_t> tokenPercents(usedTokenCount);
      nsTArray<uint32_t> runningPercents(usedTokenCount);
      nsTArray<nsString> tokenStrings(usedTokenCount);

      double clueCount = 1.0;
      for (uint32_t tokenIndex = 0; tokenIndex < usedTokenCount; tokenIndex++) {
        TraitAnalysis& ta = traitAnalyses[last - 1 - tokenIndex];
        int32_t chi_error;
        S = chi2P(-2.0 * sArray[tokenIndex], 2.0 * clueCount, &chi_error);
        if (!chi_error)
          H = chi2P(-2.0 * hArray[tokenIndex], 2.0 * clueCount, &chi_error);
        clueCount += 1.0;
        double runningProb;
        if (!chi_error)
          runningProb = (S - H + 1.0) / 2.0;
        else
          runningProb = 0.5;
        runningPercents.AppendElement(
            static_cast<uint32_t>(runningProb * 100. + .5));
        tokenPercents.AppendElement(
            static_cast<uint32_t>(ta.mProbability * 100. + .5));
        tokenStrings.AppendElement(
            NS_ConvertUTF8toUTF16(tokens[ta.mTokenIndex].mWord));
      }

      aDetailListener->OnMessageTraitDetails(messageURI, aProTraits[traitIndex],
                                             tokenStrings, tokenPercents,
                                             runningPercents);
    }

    uint32_t proPercent = static_cast<uint32_t>(prob * 100. + .5);

    // directly classify junk to maintain backwards compatibility
    if (aProTraits[traitIndex] == kJunkTrait) {
      bool isJunk = (prob >= mJunkProbabilityThreshold);
      MOZ_LOG(BayesianFilterLogModule, LogLevel::Info,
              ("%s is junk probability = (%f)  HAM SCORE:%f SPAM SCORE:%f",
               PromiseFlatCString(messageURI).get(), prob, H, S));

      // the algorithm in "A Plan For Spam" assumes that you have a large good
      // corpus and a large junk corpus.
      // that won't be the case with users who first use the junk mail trait
      // so, we do certain things to encourage them to train.
      //
      // if there are no good tokens, assume the message is junk
      // this will "encourage" the user to train
      // and if there are no bad tokens, assume the message is not junk
      // this will also "encourage" the user to train
      // see bug #194238

      if (listener && !mCorpus.getMessageCount(kGoodTrait))
        isJunk = true;
      else if (listener && !mCorpus.getMessageCount(kJunkTrait))
        isJunk = false;

      if (listener)
        listener->OnMessageClassified(
            messageURI,
            isJunk ? nsMsgJunkStatus(nsIJunkMailPlugin::JUNK)
                   : nsMsgJunkStatus(nsIJunkMailPlugin::GOOD),
            proPercent);
    }

    if (aTraitListener) {
      traits.AppendElement(aProTraits[traitIndex]);
      percents.AppendElement(proPercent);
    }
  }

  if (aTraitListener)
    aTraitListener->OnMessageTraitsClassified(messageURI, traits, percents);

  delete[] tokens;
  // reuse mAnalysisStore without clearing memory
  mNextAnalysisIndex = 1;
  // but shrink it back to the default size
  if (mAnalysisStore.Length() > kAnalysisStoreCapacity)
    mAnalysisStore.RemoveElementsAt(
        kAnalysisStoreCapacity,
        mAnalysisStore.Length() - kAnalysisStoreCapacity);
  mAnalysisStore.Compact();
}

void nsBayesianFilter::classifyMessage(
    Tokenizer& tokens, const nsACString& messageURI,
    nsIJunkMailClassificationListener* aJunkListener) {
  AutoTArray<uint32_t, 1> proTraits;
  AutoTArray<uint32_t, 1> antiTraits;
  proTraits.AppendElement(kJunkTrait);
  antiTraits.AppendElement(kGoodTrait);
  classifyMessage(tokens, messageURI, proTraits, antiTraits, aJunkListener,
                  nullptr, nullptr);
}

NS_IMETHODIMP
nsBayesianFilter::Observe(nsISupports* aSubject, const char* aTopic,
                          const char16_t* someData) {
  if (!strcmp(aTopic, "profile-before-change")) Shutdown();
  return NS_OK;
}

/* void shutdown (); */
NS_IMETHODIMP nsBayesianFilter::Shutdown() {
  if (mTrainingDataDirty) mCorpus.writeTrainingData(mMaximumTokenCount);
  mTrainingDataDirty = false;

  return NS_OK;
}

/* readonly attribute boolean shouldDownloadAllHeaders; */
NS_IMETHODIMP nsBayesianFilter::GetShouldDownloadAllHeaders(
    bool* aShouldDownloadAllHeaders) {
  // bayesian filters work on the whole msg body currently.
  *aShouldDownloadAllHeaders = false;
  return NS_OK;
}

/* void classifyMessage (in string aMsgURL, in nsIJunkMailClassificationListener
 * aListener); */
NS_IMETHODIMP nsBayesianFilter::ClassifyMessage(
    const nsACString& aMessageURL, nsIMsgWindow* aMsgWindow,
    nsIJunkMailClassificationListener* aListener) {
  AutoTArray<nsCString, 1> urls = {PromiseFlatCString(aMessageURL)};
  MessageClassifier* analyzer =
      new MessageClassifier(this, aListener, aMsgWindow, urls);
  NS_ENSURE_TRUE(analyzer, NS_ERROR_OUT_OF_MEMORY);
  TokenStreamListener* tokenListener = new TokenStreamListener(analyzer);
  NS_ENSURE_TRUE(tokenListener, NS_ERROR_OUT_OF_MEMORY);
  analyzer->setTokenListener(tokenListener);
  return tokenizeMessage(aMessageURL, aMsgWindow, analyzer);
}

/* void classifyMessages(in Array<ACString> aMsgURIs,
 *                       in nsIMsgWindow aMsgWindow,
 *                       in nsIJunkMailClassificationListener aListener); */
NS_IMETHODIMP nsBayesianFilter::ClassifyMessages(
    const nsTArray<nsCString>& aMsgURLs, nsIMsgWindow* aMsgWindow,
    nsIJunkMailClassificationListener* aListener) {
  TokenAnalyzer* analyzer =
      new MessageClassifier(this, aListener, aMsgWindow, aMsgURLs);
  NS_ENSURE_TRUE(analyzer, NS_ERROR_OUT_OF_MEMORY);
  TokenStreamListener* tokenListener = new TokenStreamListener(analyzer);
  NS_ENSURE_TRUE(tokenListener, NS_ERROR_OUT_OF_MEMORY);
  analyzer->setTokenListener(tokenListener);
  return tokenizeMessage(aMsgURLs[0], aMsgWindow, analyzer);
}

nsresult nsBayesianFilter::setAnalysis(Token& token, uint32_t aTraitIndex,
                                       double aDistance, double aProbability) {
  uint32_t nextLink = token.mAnalysisLink;
  uint32_t lastLink = 0;
  uint32_t linkCount = 0, maxLinks = 100;

  // try to find an existing element. Limit the search to maxLinks
  // as a precaution
  for (linkCount = 0; nextLink && linkCount < maxLinks; linkCount++) {
    AnalysisPerToken& rAnalysis = mAnalysisStore[nextLink];
    if (rAnalysis.mTraitIndex == aTraitIndex) {
      rAnalysis.mDistance = aDistance;
      rAnalysis.mProbability = aProbability;
      return NS_OK;
    }
    lastLink = nextLink;
    nextLink = rAnalysis.mNextLink;
  }
  if (linkCount >= maxLinks) return NS_ERROR_FAILURE;

  // trait does not exist, so add it

  AnalysisPerToken analysis(aTraitIndex, aDistance, aProbability);
  if (mAnalysisStore.Length() == mNextAnalysisIndex)
    mAnalysisStore.InsertElementAt(mNextAnalysisIndex, analysis);
  else if (mAnalysisStore.Length() > mNextAnalysisIndex)
    mAnalysisStore.ReplaceElementsAt(mNextAnalysisIndex, 1, analysis);
  else  // we can only insert at the end of the array
    return NS_ERROR_FAILURE;

  if (lastLink)
    // the token had at least one link, so update the last link to point to
    // the new item
    mAnalysisStore[lastLink].mNextLink = mNextAnalysisIndex;
  else
    // need to update the token's first link
    token.mAnalysisLink = mNextAnalysisIndex;
  mNextAnalysisIndex++;
  return NS_OK;
}

uint32_t nsBayesianFilter::getAnalysisIndex(Token& token,
                                            uint32_t aTraitIndex) {
  uint32_t nextLink;
  uint32_t linkCount = 0, maxLinks = 100;
  for (nextLink = token.mAnalysisLink; nextLink && linkCount < maxLinks;
       linkCount++) {
    AnalysisPerToken& rAnalysis = mAnalysisStore[nextLink];
    if (rAnalysis.mTraitIndex == aTraitIndex) return nextLink;
    nextLink = rAnalysis.mNextLink;
  }
  NS_ASSERTION(linkCount < maxLinks, "corrupt analysis store");

  // Trait not found, indicate by zero
  return 0;
}

NS_IMETHODIMP nsBayesianFilter::ClassifyTraitsInMessage(
    const nsACString& aMsgURI, const nsTArray<uint32_t>& aProTraits,
    const nsTArray<uint32_t>& aAntiTraits,
    nsIMsgTraitClassificationListener* aTraitListener, nsIMsgWindow* aMsgWindow,
    nsIJunkMailClassificationListener* aJunkListener) {
  AutoTArray<nsCString, 1> uris = {PromiseFlatCString(aMsgURI)};
  return ClassifyTraitsInMessages(uris, aProTraits, aAntiTraits, aTraitListener,
                                  aMsgWindow, aJunkListener);
}

NS_IMETHODIMP nsBayesianFilter::ClassifyTraitsInMessages(
    const nsTArray<nsCString>& aMsgURIs, const nsTArray<uint32_t>& aProTraits,
    const nsTArray<uint32_t>& aAntiTraits,
    nsIMsgTraitClassificationListener* aTraitListener, nsIMsgWindow* aMsgWindow,
    nsIJunkMailClassificationListener* aJunkListener) {
  MOZ_ASSERT(aProTraits.Length() == aAntiTraits.Length());
  MessageClassifier* analyzer =
      new MessageClassifier(this, aJunkListener, aTraitListener, nullptr,
                            aProTraits, aAntiTraits, aMsgWindow, aMsgURIs);

  TokenStreamListener* tokenListener = new TokenStreamListener(analyzer);

  analyzer->setTokenListener(tokenListener);
  return tokenizeMessage(aMsgURIs[0], aMsgWindow, analyzer);
}

class MessageObserver : public TokenAnalyzer {
 public:
  MessageObserver(nsBayesianFilter* filter,
                  const nsTArray<uint32_t>& aOldClassifications,
                  const nsTArray<uint32_t>& aNewClassifications,
                  nsIJunkMailClassificationListener* aJunkListener,
                  nsIMsgTraitClassificationListener* aTraitListener)
      : mFilter(filter),
        mJunkMailPlugin(filter),
        mJunkListener(aJunkListener),
        mTraitListener(aTraitListener),
        mOldClassifications(aOldClassifications.Clone()),
        mNewClassifications(aNewClassifications.Clone()) {}

  virtual void analyzeTokens(Tokenizer& tokenizer) {
    mFilter->observeMessage(tokenizer, mTokenSource, mOldClassifications,
                            mNewClassifications, mJunkListener, mTraitListener);
    // release reference to listener, which will allow us to go away as well.
    mTokenListener = nullptr;
  }

 private:
  nsBayesianFilter* mFilter;
  nsCOMPtr<nsIJunkMailPlugin> mJunkMailPlugin;
  nsCOMPtr<nsIJunkMailClassificationListener> mJunkListener;
  nsCOMPtr<nsIMsgTraitClassificationListener> mTraitListener;
  nsTArray<uint32_t> mOldClassifications;
  nsTArray<uint32_t> mNewClassifications;
};

NS_IMETHODIMP nsBayesianFilter::SetMsgTraitClassification(
    const nsACString& aMsgURI, const nsTArray<uint32_t>& aOldTraits,
    const nsTArray<uint32_t>& aNewTraits,
    nsIMsgTraitClassificationListener* aTraitListener, nsIMsgWindow* aMsgWindow,
    nsIJunkMailClassificationListener* aJunkListener) {
  MessageObserver* analyzer = new MessageObserver(
      this, aOldTraits, aNewTraits, aJunkListener, aTraitListener);
  NS_ENSURE_TRUE(analyzer, NS_ERROR_OUT_OF_MEMORY);

  TokenStreamListener* tokenListener = new TokenStreamListener(analyzer);
  NS_ENSURE_TRUE(tokenListener, NS_ERROR_OUT_OF_MEMORY);

  analyzer->setTokenListener(tokenListener);
  return tokenizeMessage(aMsgURI, aMsgWindow, analyzer);
}

// set new message classifications for a message
void nsBayesianFilter::observeMessage(
    Tokenizer& tokenizer, const nsACString& messageURL,
    nsTArray<uint32_t>& oldClassifications,
    nsTArray<uint32_t>& newClassifications,
    nsIJunkMailClassificationListener* aJunkListener,
    nsIMsgTraitClassificationListener* aTraitListener) {
  bool trainingDataWasDirty = mTrainingDataDirty;

  // Uhoh...if the user is re-training then the message may already be
  // classified and we are classifying it again with the same classification.
  // the old code would have removed the tokens for this message then added them
  // back. But this really hurts the message occurrence count for tokens if you
  // just removed training.dat and are re-training. See Bug #237095 for more
  // details. What can we do here? Well we can skip the token removal step if
  // the classifications are the same and assume the user is just re-training.
  // But this then allows users to re-classify the same message on the same
  // training set over and over again leading to data skew. But that's all I can
  // think to do right now to address this.....
  uint32_t oldLength = oldClassifications.Length();
  for (uint32_t index = 0; index < oldLength; index++) {
    uint32_t trait = oldClassifications.ElementAt(index);
    // skip removing if trait is also in the new set
    if (newClassifications.Contains(trait)) continue;
    // remove the tokens from the token set it is currently in
    uint32_t messageCount;
    messageCount = mCorpus.getMessageCount(trait);
    if (messageCount > 0) {
      mCorpus.setMessageCount(trait, messageCount - 1);
      mCorpus.forgetTokens(tokenizer, trait, 1);
      mTrainingDataDirty = true;
    }
  }

  nsMsgJunkStatus newClassification = nsIJunkMailPlugin::UNCLASSIFIED;
  uint32_t junkPercent =
      0;  // 0 here is no possibility of meeting the classification
  uint32_t newLength = newClassifications.Length();
  for (uint32_t index = 0; index < newLength; index++) {
    uint32_t trait = newClassifications.ElementAt(index);
    mCorpus.setMessageCount(trait, mCorpus.getMessageCount(trait) + 1);
    mCorpus.rememberTokens(tokenizer, trait, 1);
    mTrainingDataDirty = true;

    if (aJunkListener) {
      if (trait == kJunkTrait) {
        junkPercent = nsIJunkMailPlugin::IS_SPAM_SCORE;
        newClassification = nsIJunkMailPlugin::JUNK;
      } else if (trait == kGoodTrait) {
        junkPercent = nsIJunkMailPlugin::IS_HAM_SCORE;
        newClassification = nsIJunkMailPlugin::GOOD;
      }
    }
  }

  if (aJunkListener)
    aJunkListener->OnMessageClassified(messageURL, newClassification,
                                       junkPercent);

  if (aTraitListener) {
    // construct the outgoing listener arrays
    AutoTArray<uint32_t, kTraitAutoCapacity> traits;
    AutoTArray<uint32_t, kTraitAutoCapacity> percents;
    uint32_t newLength = newClassifications.Length();
    if (newLength > kTraitAutoCapacity) {
      traits.SetCapacity(newLength);
      percents.SetCapacity(newLength);
    }
    traits.AppendElements(newClassifications);
    for (uint32_t index = 0; index < newLength; index++)
      percents.AppendElement(100);  // This is 100 percent, or certainty
    aTraitListener->OnMessageTraitsClassified(messageURL, traits, percents);
  }

  if (mTrainingDataDirty && !trainingDataWasDirty) {
    // if training data became dirty just now, schedule flush
    // mMinFlushInterval msec from now
    MOZ_LOG(BayesianFilterLogModule, LogLevel::Debug,
            ("starting training data flush timer %i msec", mMinFlushInterval));

    nsresult rv = NS_NewTimerWithFuncCallback(
        getter_AddRefs(mTimer), nsBayesianFilter::TimerCallback, (void*)this,
        mMinFlushInterval, nsITimer::TYPE_ONE_SHOT,
        "nsBayesianFilter::TimerCallback", nullptr);
    if (NS_FAILED(rv)) {
      NS_WARNING("Could not start nsBayesianFilter timer");
    }
  }
}

NS_IMETHODIMP nsBayesianFilter::GetUserHasClassified(bool* aResult) {
  *aResult = ((mCorpus.getMessageCount(kGoodTrait) +
               mCorpus.getMessageCount(kJunkTrait)) &&
              mCorpus.countTokens());
  return NS_OK;
}

// Set message classification (only allows junk and good)
NS_IMETHODIMP nsBayesianFilter::SetMessageClassification(
    const nsACString& aMsgURL, nsMsgJunkStatus aOldClassification,
    nsMsgJunkStatus aNewClassification, nsIMsgWindow* aMsgWindow,
    nsIJunkMailClassificationListener* aListener) {
  AutoTArray<uint32_t, 1> oldClassifications;
  AutoTArray<uint32_t, 1> newClassifications;

  // convert between classifications and trait
  if (aOldClassification == nsIJunkMailPlugin::JUNK)
    oldClassifications.AppendElement(kJunkTrait);
  else if (aOldClassification == nsIJunkMailPlugin::GOOD)
    oldClassifications.AppendElement(kGoodTrait);
  if (aNewClassification == nsIJunkMailPlugin::JUNK)
    newClassifications.AppendElement(kJunkTrait);
  else if (aNewClassification == nsIJunkMailPlugin::GOOD)
    newClassifications.AppendElement(kGoodTrait);

  MessageObserver* analyzer = new MessageObserver(
      this, oldClassifications, newClassifications, aListener, nullptr);
  NS_ENSURE_TRUE(analyzer, NS_ERROR_OUT_OF_MEMORY);

  TokenStreamListener* tokenListener = new TokenStreamListener(analyzer);
  NS_ENSURE_TRUE(tokenListener, NS_ERROR_OUT_OF_MEMORY);

  analyzer->setTokenListener(tokenListener);
  return tokenizeMessage(aMsgURL, aMsgWindow, analyzer);
}

NS_IMETHODIMP nsBayesianFilter::ResetTrainingData() {
  return mCorpus.resetTrainingData();
}

NS_IMETHODIMP nsBayesianFilter::DetailMessage(
    const nsACString& aMsgURI, uint32_t aProTrait, uint32_t aAntiTrait,
    nsIMsgTraitDetailListener* aDetailListener, nsIMsgWindow* aMsgWindow) {
  AutoTArray<uint32_t, 1> proTraits = {aProTrait};
  AutoTArray<uint32_t, 1> antiTraits = {aAntiTrait};
  AutoTArray<nsCString, 1> uris = {PromiseFlatCString(aMsgURI)};

  MessageClassifier* analyzer =
      new MessageClassifier(this, nullptr, nullptr, aDetailListener, proTraits,
                            antiTraits, aMsgWindow, uris);
  NS_ENSURE_TRUE(analyzer, NS_ERROR_OUT_OF_MEMORY);

  TokenStreamListener* tokenListener = new TokenStreamListener(analyzer);
  NS_ENSURE_TRUE(tokenListener, NS_ERROR_OUT_OF_MEMORY);

  analyzer->setTokenListener(tokenListener);
  return tokenizeMessage(aMsgURI, aMsgWindow, analyzer);
}

// nsIMsgCorpus implementation

NS_IMETHODIMP nsBayesianFilter::CorpusCounts(uint32_t aTrait,
                                             uint32_t* aMessageCount,
                                             uint32_t* aTokenCount) {
  NS_ENSURE_ARG_POINTER(aTokenCount);
  *aTokenCount = mCorpus.countTokens();
  if (aTrait && aMessageCount) *aMessageCount = mCorpus.getMessageCount(aTrait);
  return NS_OK;
}

NS_IMETHODIMP nsBayesianFilter::ClearTrait(uint32_t aTrait) {
  return mCorpus.ClearTrait(aTrait);
}

NS_IMETHODIMP
nsBayesianFilter::UpdateData(nsIFile* aFile, bool aIsAdd,
                             const nsTArray<uint32_t>& aFromTraits,
                             const nsTArray<uint32_t>& aToTraits) {
  MOZ_ASSERT(aFromTraits.Length() == aToTraits.Length());
  return mCorpus.UpdateData(aFile, aIsAdd, aFromTraits, aToTraits);
}

NS_IMETHODIMP
nsBayesianFilter::GetTokenCount(const nsACString& aWord, uint32_t aTrait,
                                uint32_t* aCount) {
  NS_ENSURE_ARG_POINTER(aCount);
  CorpusToken* t = mCorpus.get(PromiseFlatCString(aWord).get());
  uint32_t count = mCorpus.getTraitCount(t, aTrait);
  *aCount = count;
  return NS_OK;
}

/* Corpus Store */

/*
    Format of the training file for version 1:
    [0xFEEDFACE]
    [number good messages][number bad messages]
    [number good tokens]
    [count][length of word]word
    ...
    [number bad tokens]
    [count][length of word]word
    ...

     Format of the trait file for version 1:
    [0xFCA93601]  (the 01 is the version)
    for each trait to write
      [id of trait to write] (0 means end of list)
      [number of messages per trait]
      for each token with non-zero count
        [count]
        [length of word]word
*/

CorpusStore::CorpusStore()
    : TokenHash(sizeof(CorpusToken)),
      mNextTraitIndex(1)  // skip 0 since index=0 will mean end of linked list
{
  getTrainingFile(getter_AddRefs(mTrainingFile));
  mTraitStore.SetCapacity(kTraitStoreCapacity);
  TraitPerToken traitPT(0, 0);
  mTraitStore.AppendElement(traitPT);  // dummy 0th element
}

CorpusStore::~CorpusStore() {}

inline int writeUInt32(FILE* stream, uint32_t value) {
  value = PR_htonl(value);
  return fwrite(&value, sizeof(uint32_t), 1, stream);
}

inline int readUInt32(FILE* stream, uint32_t* value) {
  int n = fread(value, sizeof(uint32_t), 1, stream);
  if (n == 1) {
    *value = PR_ntohl(*value);
  }
  return n;
}

void CorpusStore::forgetTokens(Tokenizer& aTokenizer, uint32_t aTraitId,
                               uint32_t aCount) {
  // if we are forgetting the tokens for a message, should only
  // subtract 1 from the occurrence count for that token in the training set
  // because we assume we only bumped the training set count once per messages
  // containing the token.
  TokenEnumeration tokens = aTokenizer.getTokens();
  while (tokens.hasMoreTokens()) {
    CorpusToken* token = static_cast<CorpusToken*>(tokens.nextToken());
    remove(token->mWord, aTraitId, aCount);
  }
}

void CorpusStore::rememberTokens(Tokenizer& aTokenizer, uint32_t aTraitId,
                                 uint32_t aCount) {
  TokenEnumeration tokens = aTokenizer.getTokens();
  while (tokens.hasMoreTokens()) {
    CorpusToken* token = static_cast<CorpusToken*>(tokens.nextToken());
    if (!token) {
      NS_ERROR("null token");
      continue;
    }
    add(token->mWord, aTraitId, aCount);
  }
}

bool CorpusStore::writeTokens(FILE* stream, bool shrink, uint32_t aTraitId) {
  uint32_t tokenCount = countTokens();
  uint32_t newTokenCount = 0;

  // calculate the tokens for this trait to write

  TokenEnumeration tokens = getTokens();
  for (uint32_t i = 0; i < tokenCount; ++i) {
    CorpusToken* token = static_cast<CorpusToken*>(tokens.nextToken());
    uint32_t count = getTraitCount(token, aTraitId);
    // Shrinking the token database is accomplished by dividing all token counts
    // by 2. If shrinking, we'll ignore counts < 2, otherwise only ignore counts
    // of < 1
    if ((shrink && count > 1) || (!shrink && count)) newTokenCount++;
  }

  if (writeUInt32(stream, newTokenCount) != 1) return false;

  if (newTokenCount > 0) {
    TokenEnumeration tokens = getTokens();
    for (uint32_t i = 0; i < tokenCount; ++i) {
      CorpusToken* token = static_cast<CorpusToken*>(tokens.nextToken());
      uint32_t wordCount = getTraitCount(token, aTraitId);
      if (shrink) wordCount /= 2;
      if (!wordCount) continue;  // Don't output zero count words
      if (writeUInt32(stream, wordCount) != 1) return false;
      uint32_t tokenLength = strlen(token->mWord);
      if (writeUInt32(stream, tokenLength) != 1) return false;
      if (fwrite(token->mWord, tokenLength, 1, stream) != 1) return false;
    }
  }
  return true;
}

bool CorpusStore::readTokens(FILE* stream, int64_t fileSize, uint32_t aTraitId,
                             bool aIsAdd) {
  uint32_t tokenCount;
  if (readUInt32(stream, &tokenCount) != 1) return false;

  int64_t fpos = ftell(stream);
  if (fpos < 0) return false;

  uint32_t bufferSize = 4096;
  char* buffer = new char[bufferSize];
  if (!buffer) return false;

  for (uint32_t i = 0; i < tokenCount; ++i) {
    uint32_t count;
    if (readUInt32(stream, &count) != 1) break;
    uint32_t size;
    if (readUInt32(stream, &size) != 1) break;
    fpos += 8;
    if (fpos + size > fileSize) {
      delete[] buffer;
      return false;
    }
    if (size >= bufferSize) {
      delete[] buffer;
      while (size >= bufferSize) {
        bufferSize *= 2;
        if (bufferSize == 0) return false;
      }
      buffer = new char[bufferSize];
      if (!buffer) return false;
    }
    if (fread(buffer, size, 1, stream) != 1) break;
    fpos += size;
    buffer[size] = '\0';
    if (aIsAdd)
      add(buffer, aTraitId, count);
    else
      remove(buffer, aTraitId, count);
  }

  delete[] buffer;

  return true;
}

nsresult CorpusStore::getTrainingFile(nsIFile** aTrainingFile) {
  // should we cache the profile manager's directory?
  nsCOMPtr<nsIFile> profileDir;

  nsresult rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR,
                                       getter_AddRefs(profileDir));
  NS_ENSURE_SUCCESS(rv, rv);
  rv = profileDir->Append(u"training.dat"_ns);
  NS_ENSURE_SUCCESS(rv, rv);

  return profileDir->QueryInterface(NS_GET_IID(nsIFile), (void**)aTrainingFile);
}

nsresult CorpusStore::getTraitFile(nsIFile** aTraitFile) {
  // should we cache the profile manager's directory?
  nsCOMPtr<nsIFile> profileDir;

  nsresult rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR,
                                       getter_AddRefs(profileDir));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = profileDir->Append(u"traits.dat"_ns);
  NS_ENSURE_SUCCESS(rv, rv);

  return profileDir->QueryInterface(NS_GET_IID(nsIFile), (void**)aTraitFile);
}

static const char kMagicCookie[] = {'\xFE', '\xED', '\xFA', '\xCE'};

// random string used to identify trait file and version (last byte is version)
static const char kTraitCookie[] = {'\xFC', '\xA9', '\x36', '\x01'};

void CorpusStore::writeTrainingData(uint32_t aMaximumTokenCount) {
  MOZ_LOG(BayesianFilterLogModule, LogLevel::Debug,
          ("writeTrainingData() entered"));
  if (!mTrainingFile) return;

  /*
   * For backwards compatibility, write the good and junk tokens to
   * training.dat; additional traits are added to a different file
   */

  // open the file, and write out training data
  FILE* stream;
  nsresult rv = mTrainingFile->OpenANSIFileDesc("wb", &stream);
  if (NS_FAILED(rv)) return;

  // If the number of tokens exceeds our limit, set the shrink flag
  bool shrink = false;
  if ((aMaximumTokenCount > 0) &&  // if 0, do not limit tokens
      (countTokens() > aMaximumTokenCount)) {
    shrink = true;
    MOZ_LOG(BayesianFilterLogModule, LogLevel::Warning,
            ("shrinking token data file"));
  }

  // We implement shrink by dividing counts by two
  uint32_t shrinkFactor = shrink ? 2 : 1;

  if (!((fwrite(kMagicCookie, sizeof(kMagicCookie), 1, stream) == 1) &&
        (writeUInt32(stream, getMessageCount(kGoodTrait) / shrinkFactor)) &&
        (writeUInt32(stream, getMessageCount(kJunkTrait) / shrinkFactor)) &&
        writeTokens(stream, shrink, kGoodTrait) &&
        writeTokens(stream, shrink, kJunkTrait))) {
    NS_WARNING("failed to write training data.");
    fclose(stream);
    // delete the training data file, since it is potentially corrupt.
    mTrainingFile->Remove(false);
  } else {
    fclose(stream);
  }

  /*
   * Write the remaining data to a second file traits.dat
   */

  if (!mTraitFile) {
    getTraitFile(getter_AddRefs(mTraitFile));
    if (!mTraitFile) return;
  }

  // open the file, and write out training data
  rv = mTraitFile->OpenANSIFileDesc("wb", &stream);
  if (NS_FAILED(rv)) return;

  uint32_t numberOfTraits = mMessageCounts.Length();
  bool error;
  while (1)  // break on error or done
  {
    if ((error = (fwrite(kTraitCookie, sizeof(kTraitCookie), 1, stream) != 1)))
      break;

    for (uint32_t index = 0; index < numberOfTraits; index++) {
      uint32_t trait = mMessageCountsId[index];
      if (trait == 1 || trait == 2)
        continue;  // junk traits are stored in training.dat
      if ((error = (writeUInt32(stream, trait) != 1))) break;
      if ((error = (writeUInt32(stream, mMessageCounts[index] / shrinkFactor) !=
                    1)))
        break;
      if ((error = !writeTokens(stream, shrink, trait))) break;
    }
    break;
  }
  // we add a 0 at the end to represent end of trait list
  error = writeUInt32(stream, 0) != 1;

  fclose(stream);
  if (error) {
    NS_WARNING("failed to write trait data.");
    // delete the trait data file, since it is probably corrupt.
    mTraitFile->Remove(false);
  }

  if (shrink) {
    // We'll clear the tokens, and read them back in from the file.
    // Yes this is slower than in place, but this is a rare event.

    if (countTokens()) {
      clearTokens();
      for (uint32_t index = 0; index < numberOfTraits; index++)
        mMessageCounts[index] = 0;
    }

    readTrainingData();
  }
}

void CorpusStore::readTrainingData() {
  /*
   * To maintain backwards compatibility, good and junk traits
   * are stored in a file "training.dat"
   */
  if (!mTrainingFile) return;

  bool exists;
  nsresult rv = mTrainingFile->Exists(&exists);
  if (NS_FAILED(rv) || !exists) return;

  FILE* stream;
  rv = mTrainingFile->OpenANSIFileDesc("rb", &stream);
  if (NS_FAILED(rv)) return;

  int64_t fileSize;
  rv = mTrainingFile->GetFileSize(&fileSize);
  if (NS_FAILED(rv)) return;

  // FIXME:  should make sure that the tokenizers are empty.
  char cookie[4];
  uint32_t goodMessageCount = 0, junkMessageCount = 0;
  if (!((fread(cookie, sizeof(cookie), 1, stream) == 1) &&
        (memcmp(cookie, kMagicCookie, sizeof(cookie)) == 0) &&
        (readUInt32(stream, &goodMessageCount) == 1) &&
        (readUInt32(stream, &junkMessageCount) == 1) &&
        readTokens(stream, fileSize, kGoodTrait, true) &&
        readTokens(stream, fileSize, kJunkTrait, true))) {
    NS_WARNING("failed to read training data.");
    MOZ_LOG(BayesianFilterLogModule, LogLevel::Error,
            ("failed to read training data."));
  }
  setMessageCount(kGoodTrait, goodMessageCount);
  setMessageCount(kJunkTrait, junkMessageCount);

  fclose(stream);

  /*
   * Additional traits are stored in traits.dat
   */

  if (!mTraitFile) {
    getTraitFile(getter_AddRefs(mTraitFile));
    if (!mTraitFile) return;
  }

  rv = mTraitFile->Exists(&exists);
  if (NS_FAILED(rv) || !exists) return;

  nsTArray<uint32_t> empty;
  rv = UpdateData(mTraitFile, true, empty, empty);

  if (NS_FAILED(rv)) {
    NS_WARNING("failed to read training data.");
    MOZ_LOG(BayesianFilterLogModule, LogLevel::Error,
            ("failed to read training data."));
  }
  return;
}

nsresult CorpusStore::resetTrainingData() {
  // clear out our in memory training tokens...
  if (countTokens()) clearTokens();

  uint32_t length = mMessageCounts.Length();
  for (uint32_t index = 0; index < length; index++) mMessageCounts[index] = 0;

  if (mTrainingFile) mTrainingFile->Remove(false);
  if (mTraitFile) mTraitFile->Remove(false);
  return NS_OK;
}

inline CorpusToken* CorpusStore::get(const char* word) {
  return static_cast<CorpusToken*>(TokenHash::get(word));
}

nsresult CorpusStore::updateTrait(CorpusToken* token, uint32_t aTraitId,
                                  int32_t aCountChange) {
  NS_ENSURE_ARG_POINTER(token);
  uint32_t nextLink = token->mTraitLink;
  uint32_t lastLink = 0;

  uint32_t linkCount, maxLinks = 100;  // sanity check
  for (linkCount = 0; nextLink && linkCount < maxLinks; linkCount++) {
    TraitPerToken& traitPT = mTraitStore[nextLink];
    if (traitPT.mId == aTraitId) {
      // be careful with signed versus unsigned issues here
      if (static_cast<int32_t>(traitPT.mCount) + aCountChange > 0)
        traitPT.mCount += aCountChange;
      else
        traitPT.mCount = 0;
      // we could delete zero count traits here, but let's not. It's rare
      // anyway.
      return NS_OK;
    }
    lastLink = nextLink;
    nextLink = traitPT.mNextLink;
  }
  if (linkCount >= maxLinks) return NS_ERROR_FAILURE;

  // trait does not exist, so add it

  if (aCountChange > 0)  // don't set a negative count
  {
    TraitPerToken traitPT(aTraitId, aCountChange);
    if (mTraitStore.Length() == mNextTraitIndex)
      mTraitStore.InsertElementAt(mNextTraitIndex, traitPT);
    else if (mTraitStore.Length() > mNextTraitIndex)
      mTraitStore.ReplaceElementsAt(mNextTraitIndex, 1, traitPT);
    else
      return NS_ERROR_FAILURE;
    if (lastLink)
      // the token had a parent, so update it
      mTraitStore[lastLink].mNextLink = mNextTraitIndex;
    else
      // need to update the token's root link
      token->mTraitLink = mNextTraitIndex;
    mNextTraitIndex++;
  }
  return NS_OK;
}

uint32_t CorpusStore::getTraitCount(CorpusToken* token, uint32_t aTraitId) {
  uint32_t nextLink;
  if (!token || !(nextLink = token->mTraitLink)) return 0;

  uint32_t linkCount, maxLinks = 100;  // sanity check
  for (linkCount = 0; nextLink && linkCount < maxLinks; linkCount++) {
    TraitPerToken& traitPT = mTraitStore[nextLink];
    if (traitPT.mId == aTraitId) return traitPT.mCount;
    nextLink = traitPT.mNextLink;
  }
  NS_ASSERTION(linkCount < maxLinks, "Corrupt trait count store");

  // trait not found (or error), so count is zero
  return 0;
}

CorpusToken* CorpusStore::add(const char* word, uint32_t aTraitId,
                              uint32_t aCount) {
  CorpusToken* token = static_cast<CorpusToken*>(TokenHash::add(word));
  if (token) {
    MOZ_LOG(BayesianFilterLogModule, LogLevel::Debug,
            ("adding word to corpus store: %s (Trait=%d) (deltaCount=%d)", word,
             aTraitId, aCount));
    updateTrait(token, aTraitId, aCount);
  }
  return token;
}

void CorpusStore::remove(const char* word, uint32_t aTraitId, uint32_t aCount) {
  MOZ_LOG(BayesianFilterLogModule, LogLevel::Debug,
          ("remove word: %s (TraitId=%d) (Count=%d)", word, aTraitId, aCount));
  CorpusToken* token = get(word);
  if (token) updateTrait(token, aTraitId, -static_cast<int32_t>(aCount));
}

uint32_t CorpusStore::getMessageCount(uint32_t aTraitId) {
  size_t index = mMessageCountsId.IndexOf(aTraitId);
  if (index == mMessageCountsId.NoIndex) return 0;
  return mMessageCounts.ElementAt(index);
}

void CorpusStore::setMessageCount(uint32_t aTraitId, uint32_t aCount) {
  size_t index = mMessageCountsId.IndexOf(aTraitId);
  if (index == mMessageCountsId.NoIndex) {
    mMessageCounts.AppendElement(aCount);
    mMessageCountsId.AppendElement(aTraitId);
  } else {
    mMessageCounts[index] = aCount;
  }
}

nsresult CorpusStore::UpdateData(nsIFile* aFile, bool aIsAdd,
                                 const nsTArray<uint32_t>& aFromTraits,
                                 const nsTArray<uint32_t>& aToTraits) {
  NS_ENSURE_ARG_POINTER(aFile);
  MOZ_ASSERT(aFromTraits.Length() == aToTraits.Length());

  int64_t fileSize;
  nsresult rv = aFile->GetFileSize(&fileSize);
  NS_ENSURE_SUCCESS(rv, rv);

  FILE* stream;
  rv = aFile->OpenANSIFileDesc("rb", &stream);
  NS_ENSURE_SUCCESS(rv, rv);

  bool error;
  do  // break on error or done
  {
    char cookie[4];
    if ((error = (fread(cookie, sizeof(cookie), 1, stream) != 1))) break;

    if ((error = memcmp(cookie, kTraitCookie, sizeof(cookie)))) break;

    uint32_t fileTrait;
    while (!(error = (readUInt32(stream, &fileTrait) != 1)) && fileTrait) {
      uint32_t count;
      if ((error = (readUInt32(stream, &count) != 1))) break;

      uint32_t localTrait = fileTrait;
      // remap the trait
      for (uint32_t i = 0; i < aFromTraits.Length(); i++) {
        if (aFromTraits[i] == fileTrait) localTrait = aToTraits[i];
      }

      uint32_t messageCount = getMessageCount(localTrait);
      if (aIsAdd)
        messageCount += count;
      else if (count > messageCount)
        messageCount = 0;
      else
        messageCount -= count;
      setMessageCount(localTrait, messageCount);

      if ((error = !readTokens(stream, fileSize, localTrait, aIsAdd))) break;
    }
    break;
  } while (0);

  fclose(stream);

  if (error) return NS_ERROR_FAILURE;
  return NS_OK;
}

nsresult CorpusStore::ClearTrait(uint32_t aTrait) {
  // clear message counts
  setMessageCount(aTrait, 0);

  TokenEnumeration tokens = getTokens();
  while (tokens.hasMoreTokens()) {
    CorpusToken* token = static_cast<CorpusToken*>(tokens.nextToken());
    int32_t wordCount = static_cast<int32_t>(getTraitCount(token, aTrait));
    updateTrait(token, aTrait, -wordCount);
  }
  return NS_OK;
}
