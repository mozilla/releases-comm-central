/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use icu_normalizer::ComposingNormalizerBorrowed;
use nserror::nsresult;
use nsstring::nsACString;

/// Normalize a `[nsACString]` to Unicode Normalization Form C.
///
/// If either of the input arguments is null, this function will return an
/// error. If the input string cannot be normalized, this function will return
/// an error. Otherwise this will return success, and `dst` will contain the
/// normalized string.
///
/// # Safety
///
/// If the input pointers are non-null, they must be valid pointers to
/// allocated `[nsACString]` instances and must not point at the same
/// data. If the input pointers are null, this function will return an
/// error.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn nfc_normalize(src: *const nsACString, dst: *mut nsACString) -> nsresult {
    if src.is_null() || dst.is_null() {
        return nserror::NS_ERROR_INVALID_ARG;
    }

    // SAFETY: `src` is not null.
    let src_ref = unsafe { &*src };
    // SAFETY: `dst` is not null.
    let dst_ref = unsafe { &mut *dst };
    let nfc = ComposingNormalizerBorrowed::new_nfc();
    let (head, tail) = nfc.split_normalized_utf8(src_ref);
    if tail.is_empty() {
        dst_ref.assign(&src_ref);
    } else {
        dst_ref.assign(&head);
        if nfc.normalize_utf8_to(tail, dst_ref).is_err() {
            return nserror::NS_ERROR_UNEXPECTED;
        }
    }

    nserror::NS_OK
}
