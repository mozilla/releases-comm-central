// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

use nss_rs::ec::{EcCurve, ecdh, ecdh_keygen};
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
