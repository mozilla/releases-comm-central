pub(crate) fn reverse_bits(byte: u8) -> u8 {
    REVERSE_TABLE[byte as usize]
}

static REVERSE_TABLE: [u8; 256] = {
    let mut tbl = [0u8; 256];
    let mut i: u8 = 0;
    loop {
        tbl[i as usize] = i.reverse_bits();
        if i == 255 {
            break;
        }
        i += 1;
    }
    tbl
};
