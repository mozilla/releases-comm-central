#[allow(unused_imports)]
use bit_set::BitSet;

#[cfg(feature = "serde")]
#[test]
fn test_serialization() {
    let bset: BitSet = BitSet::new();
    let serialized = serde_json::to_string(&bset).unwrap();
    let unserialized: BitSet = serde_json::from_str(&serialized).unwrap();
    assert_eq!(bset, unserialized);

    let elems: Vec<usize> = vec![11, 42, 100, 101];
    let bset: BitSet = elems.iter().map(|n| *n).collect();
    let serialized = serde_json::to_string(&bset).unwrap();
    let unserialized = serde_json::from_str(&serialized).unwrap();
    assert_eq!(bset, unserialized);
}

#[cfg(feature = "miniserde")]
#[test]
fn test_miniserde_serialization() {
    let bset: BitSet = BitSet::new();
    let serialized = miniserde::json::to_string(&bset);
    let unserialized: BitSet = miniserde::json::from_str(&serialized[..]).unwrap();
    assert_eq!(bset, unserialized);

    let elems: Vec<usize> = vec![11, 42, 100, 101];
    let bset: BitSet = elems.iter().map(|n| *n).collect();
    let serialized = miniserde::json::to_string(&bset);
    let unserialized = miniserde::json::from_str(&serialized[..]).unwrap();
    assert_eq!(bset, unserialized);
}

#[cfg(feature = "borsh")]
#[test]
fn test_borsh_serialization() {
    let bset: BitSet = BitSet::new();
    let serialized = borsh::to_vec(&bset).unwrap();
    let unserialized: BitSet = borsh::from_slice(&serialized[..]).unwrap();
    assert_eq!(bset, unserialized);

    let elems: Vec<usize> = vec![11, 42, 100, 101];
    let bset: BitSet = elems.iter().map(|n| *n).collect();
    let serialized = borsh::to_vec(&bset).unwrap();
    let unserialized = borsh::from_slice(&serialized[..]).unwrap();
    assert_eq!(bset, unserialized);
}
