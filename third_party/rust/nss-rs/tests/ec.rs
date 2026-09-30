// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use nss_rs::{
    ec::{EcCurve, ecdh, ecdh_keygen, export_ec_private_key_from_raw},
    generate_ech_keys,
};
use test_fixture::fixture_init;

#[test]
fn clone() {
    fixture_init();

    let a1 = ecdh_keygen(&EcCurve::P256).expect("ecdh_keygen");
    let a2 = a1.clone();

    let a1_debug = format!("{a1:?}");
    let a2_debug = format!("{a2:?}");
    assert_eq!(a1_debug, a2_debug);

    let b = ecdh_keygen(&EcCurve::P256).expect("ecdh_keygen");

    let a1_b = ecdh(&a1.private, &b.public).expect("a1_b/ecdh");
    let a2_b = ecdh(&a2.private, &b.public).expect("a2_b/ecdh");

    let b_a1 = ecdh(&b.private, &a1.public).expect("b_a1/ecdh");
    let b_a2 = ecdh(&b.private, &a2.public).expect("b_a2/ecdh");

    assert_eq!(a1_b, a2_b);
    assert_eq!(a1_b, b_a1);
    assert_eq!(a1_b, b_a2);
}

#[test]
fn export_raw_extractable() {
    fixture_init();

    let kp = ecdh_keygen(&EcCurve::X25519).expect("ecdh_keygen");
    let raw = export_ec_private_key_from_raw(&kp.private).expect("export");
    assert!(!raw.is_empty());
}

#[test]
fn export_raw_sensitive_reports_failure() {
    fixture_init();

    // ECH keys are generated sensitive, so CKA_VALUE cannot be read back. The
    // export must surface that NSS failure rather than returning an empty key.
    let (sk, _pk) = generate_ech_keys().expect("generate_ech_keys");
    assert!(export_ec_private_key_from_raw(&sk).is_err());
}

#[test]
fn keygen_p256() {
    fixture_init();

    let key = ecdh_keygen(&EcCurve::P256).unwrap();

    let raw = key.public.key_data().unwrap();
    assert_eq!(65, raw.len());
    assert_eq!(4, raw[0]);

    let alt = key.public.key_data_alt().unwrap();
    assert_eq!(67, alt.len());
    assert_eq!(&[4, 65, 4], &alt[0..3]);
    assert_eq!(&alt[2..], raw);
}

#[test]
fn keygen_p384() {
    fixture_init();

    let key = ecdh_keygen(&EcCurve::P384).unwrap();

    let raw = key.public.key_data().unwrap();
    assert_eq!(97, raw.len());
    assert_eq!(4, raw[0]);

    let alt = key.public.key_data_alt().unwrap();
    assert_eq!(99, alt.len());
    assert_eq!(&[4, 97, 4], &alt[0..3]);
    assert_eq!(&alt[2..], raw);
}

#[test]
fn keygen_p521() {
    fixture_init();

    let key = ecdh_keygen(&EcCurve::P521).unwrap();

    let raw = key.public.key_data().unwrap();
    assert_eq!(133, raw.len());
    assert_eq!(4, raw[0]);

    let alt = key.public.key_data_alt().unwrap();
    assert_eq!(136, alt.len());
    assert_eq!(&[4, 129, 133, 4], &alt[0..4]);
    assert_eq!(&alt[3..], raw);
}

#[test]
fn keygen_ed25519() {
    fixture_init();

    let key = ecdh_keygen(&EcCurve::Ed25519).unwrap();

    // Not valid for HPKE because keyType = edKey
    assert!(key.public.key_data().is_err());
}

#[test]
fn keygen_x25519() {
    fixture_init();

    let key = ecdh_keygen(&EcCurve::X25519).unwrap();

    assert_eq!(32, key.public.key_data().unwrap().len());
}
