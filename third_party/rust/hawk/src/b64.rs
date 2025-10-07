//! This module contains basic base64 functionality as used in Hawk.

use base64::engine::{
    general_purpose::{GeneralPurpose, GeneralPurposeConfig},
    DecodePaddingMode,
};

/// BEWIT_ENGINE encodes to a url-safe value with no padding, but is indifferent to padding on
/// decode.  This is used to encode bewits, which often appear in URLs.
pub(crate) const BEWIT_ENGINE: GeneralPurpose = GeneralPurpose::new(
    &base64::alphabet::URL_SAFE,
    GeneralPurposeConfig::new()
        .with_encode_padding(false)
        .with_decode_padding_mode(DecodePaddingMode::Indifferent),
);

/// STANDARD_ENGINE encodes with the standard alphabet and includes padding.  This is
/// used to encode MACs and hashes.
pub(crate) const STANDARD_ENGINE: GeneralPurpose = base64::engine::general_purpose::STANDARD;
