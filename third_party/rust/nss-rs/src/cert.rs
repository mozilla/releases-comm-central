// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use std::{
    ffi::{CStr, c_uint},
    ptr::{NonNull, null_mut},
    slice,
};

use log::error;

use crate::{
    Res, SECItem, SECItemArray, ScopedSECItemArray, ScopedSECItemArrayIterator, experimental_api,
    nss_prelude::SECStatus,
    null_safe_slice, p11,
    prio::PRFileDesc,
    ssl::{self, SSL_PeerSignedCertTimestamps, SSL_PeerStapledOCSPResponses},
};

experimental_api! {
    SSL_PeerCertificateChainDER(
        fd: *mut PRFileDesc,
        out: *mut *mut SECItemArray,
    );
}

pub struct CertificateInfo {
    certs: ScopedSECItemArray,
    /// `stapled_ocsp_responses` and `signed_cert_timestamp` are properties
    /// associated with each of the certificates. Right now, NSS only
    /// reports the value for the end-entity certificate (the first).
    stapled_ocsp_responses: Option<Vec<Vec<u8>>>,
    signed_cert_timestamp: Option<Vec<u8>>,
}

fn peer_certificate_chain(fd: *mut PRFileDesc) -> Option<ScopedSECItemArray> {
    let mut chain_ptr: *mut SECItemArray = null_mut();
    let rv = unsafe { SSL_PeerCertificateChainDER(fd, &raw mut chain_ptr) };
    if rv.is_ok() {
        ScopedSECItemArray::from_ptr(chain_ptr).ok()
    } else {
        None
    }
}

// As explained in rfc6961, an OCSPResponseList can have at most
// 2^24 items. Casting its length is therefore safe even on 32 bits targets.
fn stapled_ocsp_responses(fd: *mut PRFileDesc) -> Option<Vec<Vec<u8>>> {
    let ocsp_nss = unsafe { SSL_PeerStapledOCSPResponses(fd) };
    let ocsp_ptr = NonNull::new(ocsp_nss.cast_mut())?;
    let Ok(len) = usize::try_from(unsafe { ocsp_ptr.as_ref().len }) else {
        error!("[{fd:p}] Received illegal OCSP length");
        return None;
    };
    Some(
        (0..len)
            .map(|idx| {
                let itemp: *const SECItem = unsafe { ocsp_ptr.as_ref().items.add(idx).cast() };
                unsafe { null_safe_slice((*itemp).data, (*itemp).len) }.to_owned()
            })
            .collect(),
    )
}

fn signed_cert_timestamp(fd: *mut PRFileDesc) -> Option<Vec<u8>> {
    let sct_nss = unsafe { SSL_PeerSignedCertTimestamps(fd) };
    NonNull::new(sct_nss.cast_mut()).map(|sct_ptr| {
        if unsafe { sct_ptr.as_ref().len == 0 || sct_ptr.as_ref().data.is_null() } {
            Vec::new()
        } else {
            let sct_slice = unsafe { null_safe_slice(sct_ptr.as_ref().data, sct_ptr.as_ref().len) };
            sct_slice.to_owned()
        }
    })
}

impl<'a> IntoIterator for &'a CertificateInfo {
    type IntoIter = ScopedSECItemArrayIterator<'a>;
    type Item = &'a [u8];
    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl CertificateInfo {
    pub(crate) fn new(fd: *mut PRFileDesc) -> Option<Self> {
        peer_certificate_chain(fd).map(|certs| Self {
            certs,
            stapled_ocsp_responses: stapled_ocsp_responses(fd),
            signed_cert_timestamp: signed_cert_timestamp(fd),
        })
    }

    #[must_use]
    pub fn iter(&self) -> ScopedSECItemArrayIterator<'_> {
        self.certs.into_iter()
    }

    #[must_use]
    pub fn stapled_ocsp_responses(&self) -> Option<&[Vec<u8>]> {
        self.stapled_ocsp_responses.as_deref()
    }

    #[must_use]
    pub fn signed_cert_timestamp(&self) -> Option<&[u8]> {
        self.signed_cert_timestamp.as_deref()
    }
}

/// Private trait for Certificate Compression implementation
/// Use [`CertificateCompressor`] to implement an encoder/decoder instead.
pub(crate) trait UnsafeCertCompression {
    extern "C" fn decode_callback(
        input: *const SECItem,
        output: *mut ::std::os::raw::c_uchar,
        output_len: usize,
        used_len: *mut usize,
    ) -> SECStatus;

    extern "C" fn encode_callback(input: *const SECItem, output: *mut SECItem) -> SECStatus;
}

/// The trait is used to represent a certificate compression data structure
/// Used in order to enable Certificate Compression extension during TLS connection
pub trait CertificateCompressor {
    /// Certificate Compression identifier as in RFC8879
    const ID: u16;
    /// Certification Compression name (used only for logging/debugging)
    const NAME: &CStr;
    /// Certificate Compression could be used to encode and decode a certificate
    /// though the encoding is not frequently used
    /// Enable decoding field is used to signal to the implementation
    /// to use the encoding as well
    const ENABLE_ENCODING: bool = false;

    /// Certificate Compression encoding function
    ///
    /// This default implementation effectively does nothing.
    /// However, this is only run if `ENABLE_ENCODING` is `true`.
    /// Implementations that set `ENABLE_ENCODING` to `true` need to implement this function.
    ///
    /// # Errors
    /// Encoding was unsuccessful, for example, not enough memory
    fn encode(input: &[u8], output: &mut [u8]) -> Res<usize> {
        let len = std::cmp::min(input.len(), output.len());
        output[..len].copy_from_slice(&input[..len]);
        Ok(len)
    }

    /// Certificate Compression decoding function.
    /// # Errors
    /// Decoding was unsuccessful.
    /// We require a decoder internally to check the length of the decoded buffer.
    /// If the decoded length is not equal to the length of the provided slice
    /// the decoder should return an error.
    fn decode(input: &[u8], output: &mut [u8]) -> Res<()>;
}

/// The trait is responsible for calling `CertificateCompression` encoding and decoding
/// functions using the NSS types
impl<T: CertificateCompressor> UnsafeCertCompression for T {
    extern "C" fn decode_callback(
        input: *const SECItem,
        output: *mut ::std::os::raw::c_uchar,
        output_len: usize,
        used_len: *mut usize,
    ) -> SECStatus {
        let Some(input) = NonNull::new(input.cast_mut()) else {
            return ssl::SECFailure;
        };
        if unsafe { input.as_ref().data.is_null() || input.as_ref().len == 0 } {
            return ssl::SECFailure;
        }

        let input_slice = unsafe { null_safe_slice(input.as_ref().data, input.as_ref().len) };
        let output_slice = unsafe { slice::from_raw_parts_mut(output, output_len) };

        if T::decode(input_slice, output_slice).is_err() {
            return ssl::SECFailure;
        }

        unsafe {
            *used_len = output_len;
        }
        ssl::SECSuccess
    }

    extern "C" fn encode_callback(input: *const SECItem, output: *mut SECItem) -> SECStatus {
        let Some(input) = NonNull::new(input.cast_mut()) else {
            return ssl::SECFailure;
        };

        let (input_data, input_len) = unsafe {
            let input_ref = input.as_ref();
            (input_ref.data, input_ref.len)
        };

        if input_data.is_null() || input_len == 0 {
            return ssl::SECFailure;
        }
        let input_slice = unsafe { null_safe_slice(input_data, input_len) };

        unsafe {
            p11::SECITEM_AllocItem(
                null_mut(),
                // p11::SECItem is the same as ssl::SECItem
                output.cast::<crate::nss_prelude::SECItemStr>(),
                // Compression shouldn't make the thing *longer*,
                // but allocate one extra byte anyway to enable simple testing modes.
                input_len + 1,
            );
        }

        if unsafe { (*output).data.is_null() } {
            return ssl::SECFailure;
        }

        let Ok(output_len) = usize::try_from(unsafe { (*output).len }) else {
            return ssl::SECFailure;
        };

        let output_slice = unsafe { slice::from_raw_parts_mut((*output).data, output_len) };

        let Ok(encoded_len) = T::encode(input_slice, output_slice) else {
            return ssl::SECFailure;
        };

        if encoded_len == 0 || encoded_len > output_len {
            return ssl::SECFailure;
        }

        let Ok(encoded_len) = c_uint::try_from(encoded_len) else {
            return ssl::SECFailure;
        };

        unsafe {
            (*output).len = encoded_len;
        }
        ssl::SECSuccess
    }
}
