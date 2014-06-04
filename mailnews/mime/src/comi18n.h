/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef _COMI18N_LOADED_H_
#define _COMI18N_LOADED_H_

#include "msgCore.h"

class nsIUnicodeDecoder;
class nsIUnicodeEncoder;


#ifdef __cplusplus
extern "C" {
#endif /* __cplusplus */

/**
 * Decode MIME header to UTF-8.
 * Uses MIME_ConvertCharset if the decoded string needs a conversion.
 *
 *
 * @param header      [IN] A header to decode.
 * @param default_charset     [IN] Default charset to apply to ulabeled non-UTF-8 8bit data
 * @param override_charset    [IN] If true, default_charset used instead of any charset labeling other than UTF-8
 * @param eatContinuations    [IN] If true, unfold headers
 * @param result      [OUT] Decoded buffer
 */
void MIME_DecodeMimeHeader(const char *header, const char *default_charset,
                           bool override_charset, bool eatContinuations,
                           nsACString &result);

nsresult MIME_detect_charset(const char *aBuf, int32_t aLength, const char** aCharset);
nsresult MIME_get_unicode_decoder(const char* aInputCharset, nsIUnicodeDecoder **aDecoder);
nsresult MIME_get_unicode_encoder(const char* aOutputCharset, nsIUnicodeEncoder **aEncoder);

#ifdef __cplusplus
} /* extern "C" */
#endif /* __cplusplus */

#endif // _COMI18N_LOADED_H_

