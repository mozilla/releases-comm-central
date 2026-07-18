#![allow(clippy::shadow_reuse)]
#![allow(clippy::shadow_same)]
#![allow(clippy::shadow_unrelated)]

use bit_set::BitSet;
use bit_vec::BitVec;
use std::cmp::Ordering::{Equal, Greater, Less};
use std::vec::Vec;
use std::{format, vec};

#[test]
fn test_bit_set_display() {
    let mut s = BitSet::new();
    s.insert(1);
    s.insert(10);
    s.insert(50);
    s.insert(2);
    assert_eq!("{1, 2, 10, 50}", format!("{}", s));
}

#[test]
fn test_bit_set_debug() {
    let mut s = BitSet::new();
    s.insert(1);
    s.insert(10);
    s.insert(50);
    s.insert(2);
    let expected = "BitSet { bit_vec: BitVec { storage: \
    \"01100000001000000000000000000000 \
    0000000000000000001\", nbits: 51 } }";
    let actual = format!("{:?}", s);
    assert_eq!(expected, actual);
}

#[test]
fn test_bit_set_from_usizes() {
    let usizes = vec![0, 2, 2, 3];
    let a: BitSet = usizes.into_iter().collect();
    let mut b = BitSet::new();
    b.insert(0);
    b.insert(2);
    b.insert(3);
    assert_eq!(a, b);
}

#[test]
fn test_bit_set_iterator() {
    let usizes = vec![0, 2, 2, 3];
    let bit_vec: BitSet = usizes.into_iter().collect();

    let idxs: Vec<_> = bit_vec.iter().collect();
    assert_eq!(idxs, [0, 2, 3]);
    assert_eq!(bit_vec.iter().count(), 3);

    let long: BitSet = (0..10000).filter(|&n| n % 2 == 0).collect();
    let real: Vec<_> = (0..10000 / 2).map(|x| x * 2).collect();

    let idxs: Vec<_> = long.iter().collect();
    assert_eq!(idxs, real);
    assert_eq!(long.iter().count(), real.len());
}

#[test]
fn test_bit_set_frombit_vec_init() {
    let bools = [true, false];
    let lengths = [10, 64, 100];
    for &b in &bools {
        for &l in &lengths {
            let bitset = BitSet::from_bit_vec(BitVec::from_elem(l, b));
            assert_eq!(bitset.contains(1), b);
            assert_eq!(bitset.contains(l - 1), b);
            assert!(!bitset.contains(l));
        }
    }
}

#[test]
fn test_bit_vec_masking() {
    let b = BitVec::from_elem(140, true);
    let mut bs = BitSet::from_bit_vec(b);
    assert!(bs.contains(139));
    assert!(!bs.contains(140));
    assert!(bs.insert(150));
    assert!(!bs.contains(140));
    assert!(!bs.contains(149));
    assert!(bs.contains(150));
    assert!(!bs.contains(151));
}

#[test]
fn test_bit_set_basic() {
    let mut b = BitSet::new();
    assert!(b.insert(3));
    assert!(!b.insert(3));
    assert!(b.contains(3));
    assert!(b.insert(4));
    assert!(!b.insert(4));
    assert!(b.contains(3));
    assert!(b.insert(400));
    assert!(!b.insert(400));
    assert!(b.contains(400));
    assert_eq!(b.count(), 3);
}

#[test]
fn test_bit_set_intersection() {
    let mut a = BitSet::new();
    let mut b = BitSet::new();

    assert!(a.insert(11));
    assert!(a.insert(1));
    assert!(a.insert(3));
    assert!(a.insert(77));
    assert!(a.insert(103));
    assert!(a.insert(5));

    assert!(b.insert(2));
    assert!(b.insert(11));
    assert!(b.insert(77));
    assert!(b.insert(5));
    assert!(b.insert(3));

    let expected = [3, 5, 11, 77];
    let actual: Vec<_> = a.intersection(&b).collect();
    assert_eq!(actual, expected);
    assert_eq!(a.intersection(&b).count(), expected.len());
}

#[test]
fn test_bit_set_difference() {
    let mut a = BitSet::new();
    let mut b = BitSet::new();

    assert!(a.insert(1));
    assert!(a.insert(3));
    assert!(a.insert(5));
    assert!(a.insert(200));
    assert!(a.insert(500));

    assert!(b.insert(3));
    assert!(b.insert(200));

    let expected = [1, 5, 500];
    let actual: Vec<_> = a.difference(&b).collect();
    assert_eq!(actual, expected);
    assert_eq!(a.difference(&b).count(), expected.len());
}

#[test]
fn test_bit_set_symmetric_difference() {
    let mut a = BitSet::new();
    let mut b = BitSet::new();

    assert!(a.insert(1));
    assert!(a.insert(3));
    assert!(a.insert(5));
    assert!(a.insert(9));
    assert!(a.insert(11));

    assert!(b.insert(3));
    assert!(b.insert(9));
    assert!(b.insert(14));
    assert!(b.insert(220));

    let expected = [1, 5, 11, 14, 220];
    let actual: Vec<_> = a.symmetric_difference(&b).collect();
    assert_eq!(actual, expected);
    assert_eq!(a.symmetric_difference(&b).count(), expected.len());
}

#[test]
fn test_bit_set_union() {
    let mut a = BitSet::new();
    let mut b = BitSet::new();
    assert!(a.insert(1));
    assert!(a.insert(3));
    assert!(a.insert(5));
    assert!(a.insert(9));
    assert!(a.insert(11));
    assert!(a.insert(160));
    assert!(a.insert(19));
    assert!(a.insert(24));
    assert!(a.insert(200));

    assert!(b.insert(1));
    assert!(b.insert(5));
    assert!(b.insert(9));
    assert!(b.insert(13));
    assert!(b.insert(19));

    let expected = [1, 3, 5, 9, 11, 13, 19, 24, 160, 200];
    let actual: Vec<_> = a.union(&b).collect();
    assert_eq!(actual, expected);
    assert_eq!(a.union(&b).count(), expected.len());
}

#[test]
fn test_bit_set_subset() {
    let mut set1 = BitSet::new();
    let mut set2 = BitSet::new();

    assert!(set1.is_subset(&set2)); //  {}  {}
    set2.insert(100);
    assert!(set1.is_subset(&set2)); //  {}  { 1 }
    set2.insert(200);
    assert!(set1.is_subset(&set2)); //  {}  { 1, 2 }
    set1.insert(200);
    assert!(set1.is_subset(&set2)); //  { 2 }  { 1, 2 }
    set1.insert(300);
    assert!(!set1.is_subset(&set2)); // { 2, 3 }  { 1, 2 }
    set2.insert(300);
    assert!(set1.is_subset(&set2)); // { 2, 3 }  { 1, 2, 3 }
    set2.insert(400);
    assert!(set1.is_subset(&set2)); // { 2, 3 }  { 1, 2, 3, 4 }
    set2.remove(100);
    assert!(set1.is_subset(&set2)); // { 2, 3 }  { 2, 3, 4 }
    set2.remove(300);
    assert!(!set1.is_subset(&set2)); // { 2, 3 }  { 2, 4 }
    set1.remove(300);
    assert!(set1.is_subset(&set2)); // { 2 }  { 2, 4 }
}

#[test]
fn test_bit_set_is_disjoint() {
    let a = BitSet::from_bytes(&[0b10100010]);
    let b = BitSet::from_bytes(&[0b01000000]);
    let c = BitSet::new();
    let d = BitSet::from_bytes(&[0b00110000]);

    assert!(!a.is_disjoint(&d));
    assert!(!d.is_disjoint(&a));

    assert!(a.is_disjoint(&b));
    assert!(a.is_disjoint(&c));
    assert!(b.is_disjoint(&a));
    assert!(b.is_disjoint(&c));
    assert!(c.is_disjoint(&a));
    assert!(c.is_disjoint(&b));
}

#[test]
fn test_bit_set_union_with() {
    //a should grow to include larger elements
    let mut a = BitSet::new();
    a.insert(0);
    let mut b = BitSet::new();
    b.insert(5);
    let expected = BitSet::from_bytes(&[0b10000100]);
    a.union_with(&b);
    assert_eq!(a, expected);

    // Standard
    let mut a = BitSet::from_bytes(&[0b10100010]);
    let mut b = BitSet::from_bytes(&[0b01100010]);
    let c = a.clone();
    a.union_with(&b);
    b.union_with(&c);
    assert_eq!(a.count(), 4);
    assert_eq!(b.count(), 4);
}

#[test]
fn test_bit_set_intersect_with() {
    // Explicitly 0'ed bits
    let mut a = BitSet::from_bytes(&[0b10100010]);
    let mut b = BitSet::from_bytes(&[0b00000000]);
    let c = a.clone();
    a.intersect_with(&b);
    b.intersect_with(&c);
    assert!(a.is_empty());
    assert!(b.is_empty());

    // Uninitialized bits should behave like 0's
    let mut a = BitSet::from_bytes(&[0b10100010]);
    let mut b = BitSet::new();
    let c = a.clone();
    a.intersect_with(&b);
    b.intersect_with(&c);
    assert!(a.is_empty());
    assert!(b.is_empty());

    // Standard
    let mut a = BitSet::from_bytes(&[0b10100010]);
    let mut b = BitSet::from_bytes(&[0b01100010]);
    let c = a.clone();
    a.intersect_with(&b);
    b.intersect_with(&c);
    assert_eq!(a.count(), 2);
    assert_eq!(b.count(), 2);
}

#[test]
fn test_bit_set_difference_with() {
    // Explicitly 0'ed bits
    let mut a = BitSet::from_bytes(&[0b00000000]);
    let b = BitSet::from_bytes(&[0b10100010]);
    a.difference_with(&b);
    assert!(a.is_empty());

    // Uninitialized bits should behave like 0's
    let mut a = BitSet::new();
    let b = BitSet::from_bytes(&[0b11111111]);
    a.difference_with(&b);
    assert!(a.is_empty());

    // Standard
    let mut a = BitSet::from_bytes(&[0b10100010]);
    let mut b = BitSet::from_bytes(&[0b01100010]);
    let c = a.clone();
    a.difference_with(&b);
    b.difference_with(&c);
    assert_eq!(a.count(), 1);
    assert_eq!(b.count(), 1);
}

#[test]
fn test_bit_set_symmetric_difference_with() {
    //a should grow to include larger elements
    let mut a = BitSet::new();
    a.insert(0);
    a.insert(1);
    let mut b = BitSet::new();
    b.insert(1);
    b.insert(5);
    let expected = BitSet::from_bytes(&[0b10000100]);
    a.symmetric_difference_with(&b);
    assert_eq!(a, expected);

    let mut a = BitSet::from_bytes(&[0b10100010]);
    let b = BitSet::new();
    let c = a.clone();
    a.symmetric_difference_with(&b);
    assert_eq!(a, c);

    // Standard
    let mut a = BitSet::from_bytes(&[0b11100010]);
    let mut b = BitSet::from_bytes(&[0b01101010]);
    let c = a.clone();
    a.symmetric_difference_with(&b);
    b.symmetric_difference_with(&c);
    assert_eq!(a.count(), 2);
    assert_eq!(b.count(), 2);
}

#[test]
fn test_bit_set_eq() {
    let a = BitSet::from_bytes(&[0b10100010]);
    let b = BitSet::from_bytes(&[0b00000000]);
    let c = BitSet::new();

    assert!(a == a);
    assert!(a != b);
    assert!(a != c);
    assert!(b == b);
    assert!(b == c);
    assert!(c == c);
}

#[test]
fn test_bit_set_cmp() {
    let a = BitSet::from_bytes(&[0b10100010]);
    let b = BitSet::from_bytes(&[0b00000000]);
    let c = BitSet::new();

    assert_eq!(a.cmp(&b), Greater);
    assert_eq!(a.cmp(&c), Greater);
    assert_eq!(b.cmp(&a), Less);
    assert_eq!(b.cmp(&c), Equal);
    assert_eq!(c.cmp(&a), Less);
    assert_eq!(c.cmp(&b), Equal);
}

#[test]
fn test_bit_set_shrink_to_fit_new() {
    // There was a strange bug where we refused to truncate to 0
    // and this would end up actually growing the array in a way
    // that (safely corrupted the state).
    let mut a = BitSet::new();
    assert_eq!(a.count(), 0);
    assert_eq!(a.capacity(), 0);
    a.shrink_to_fit();
    assert_eq!(a.count(), 0);
    assert_eq!(a.capacity(), 0);
    assert!(!a.contains(1));
    a.insert(3);
    assert!(a.contains(3));
    assert_eq!(a.count(), 1);
    assert!(a.capacity() > 0);
    a.shrink_to_fit();
    assert!(a.contains(3));
    assert_eq!(a.count(), 1);
    assert!(a.capacity() > 0);
}

#[test]
fn test_bit_set_shrink_to_fit() {
    let mut a = BitSet::new();
    assert_eq!(a.count(), 0);
    assert_eq!(a.capacity(), 0);
    a.insert(259);
    a.insert(98);
    a.insert(3);
    assert_eq!(a.count(), 3);
    assert!(a.capacity() > 0);
    assert!(!a.contains(1));
    assert!(a.contains(259));
    assert!(a.contains(98));
    assert!(a.contains(3));

    a.shrink_to_fit();
    assert!(!a.contains(1));
    assert!(a.contains(259));
    assert!(a.contains(98));
    assert!(a.contains(3));
    assert_eq!(a.count(), 3);
    assert!(a.capacity() > 0);

    let old_cap = a.capacity();
    assert!(a.remove(259));
    a.shrink_to_fit();
    assert!(a.capacity() < old_cap, "{} {}", a.capacity(), old_cap);
    assert!(!a.contains(1));
    assert!(!a.contains(259));
    assert!(a.contains(98));
    assert!(a.contains(3));
    assert_eq!(a.count(), 2);

    let old_cap2 = a.capacity();
    a.make_empty();
    assert_eq!(a.capacity(), old_cap2);
    assert_eq!(a.count(), 0);
    assert!(!a.contains(1));
    assert!(!a.contains(259));
    assert!(!a.contains(98));
    assert!(!a.contains(3));

    a.insert(512);
    assert!(a.capacity() > 0);
    assert_eq!(a.count(), 1);
    assert!(a.contains(512));
    assert!(!a.contains(1));
    assert!(!a.contains(259));
    assert!(!a.contains(98));
    assert!(!a.contains(3));

    a.remove(512);
    a.shrink_to_fit();
    assert_eq!(a.capacity(), 0);
    assert_eq!(a.count(), 0);
    assert!(!a.contains(512));
    assert!(!a.contains(1));
    assert!(!a.contains(259));
    assert!(!a.contains(98));
    assert!(!a.contains(3));
    assert!(!a.contains(0));
}

#[test]
fn test_bit_vec_remove() {
    let mut a = BitSet::new();

    assert!(a.insert(1));
    assert!(a.remove(1));

    assert!(a.insert(100));
    assert!(a.remove(100));

    assert!(a.insert(1000));
    assert!(a.remove(1000));
    a.shrink_to_fit();
}

#[test]
fn test_bit_vec_clone() {
    let mut a = BitSet::new();

    assert!(a.insert(1));
    assert!(a.insert(100));
    assert!(a.insert(1000));

    let mut b = a.clone();

    assert!(a == b);

    assert!(b.remove(1));
    assert!(a.contains(1));

    assert!(a.remove(1000));
    assert!(b.contains(1000));
}

#[test]
fn test_truncate() {
    let bytes = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];

    let mut s = BitSet::from_bytes(&bytes);
    s.truncate(5 * 8);

    assert_eq!(s, BitSet::from_bytes(&bytes[..5]));
    assert_eq!(s.count(), 5 * 8);
    s.truncate(4 * 8);
    assert_eq!(s, BitSet::from_bytes(&bytes[..4]));
    assert_eq!(s.count(), 4 * 8);
    // Truncating to a size > s.len() should be a noop
    s.truncate(5 * 8);
    assert_eq!(s, BitSet::from_bytes(&bytes[..4]));
    assert_eq!(s.count(), 4 * 8);
    s.truncate(8);
    assert_eq!(s, BitSet::from_bytes(&bytes[..1]));
    assert_eq!(s.count(), 8);
    s.truncate(0);
    assert_eq!(s, BitSet::from_bytes(&[]));
    assert_eq!(s.count(), 0);
}

/*
    #[test]
    fn test_bit_set_append() {
        let mut a = BitSet::new();
        a.insert(2);
        a.insert(6);

        let mut b = BitSet::new();
        b.insert(1);
        b.insert(3);
        b.insert(6);

        a.append(&mut b);

        assert_eq!(a.len(), 4);
        assert_eq!(b.len(), 0);
        assert!(b.capacity() >= 6);

        assert_eq!(a, BitSet::from_bytes(&[0b01110010]));
    }

    #[test]
    fn test_bit_set_split_off() {
        // Split at 0
        let mut a = BitSet::from_bytes(&[0b10100000, 0b00010010, 0b10010010,
                                            0b00110011, 0b01101011, 0b10101101]);

        let b = a.split_off(0);

        assert_eq!(a.len(), 0);
        assert_eq!(b.len(), 21);

        assert_eq!(b, BitSet::from_bytes(&[0b10100000, 0b00010010, 0b10010010,
                                            0b00110011, 0b01101011, 0b10101101]);

        // Split behind last element
        let mut a = BitSet::from_bytes(&[0b10100000, 0b00010010, 0b10010010,
                                            0b00110011, 0b01101011, 0b10101101]);

        let b = a.split_off(50);

        assert_eq!(a.len(), 21);
        assert_eq!(b.len(), 0);

        assert_eq!(a, BitSet::from_bytes(&[0b10100000, 0b00010010, 0b10010010,
                                            0b00110011, 0b01101011, 0b10101101]));

        // Split at arbitrary element
        let mut a = BitSet::from_bytes(&[0b10100000, 0b00010010, 0b10010010,
                                            0b00110011, 0b01101011, 0b10101101]);

        let b = a.split_off(34);

        assert_eq!(a.len(), 12);
        assert_eq!(b.len(), 9);

        assert_eq!(a, BitSet::from_bytes(&[0b10100000, 0b00010010, 0b10010010,
                                            0b00110011, 0b01000000]));
        assert_eq!(b, BitSet::from_bytes(&[0, 0, 0, 0,
                                            0b00101011, 0b10101101]));
    }
*/
