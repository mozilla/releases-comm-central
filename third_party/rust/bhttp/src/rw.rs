use std::{borrow::BorrowMut, convert::TryFrom, io};

use crate::{
    err::{Error, Res},
    ReadSeek,
};

#[allow(clippy::cast_possible_truncation)]
pub(crate) fn write_uint<const N: usize>(v: impl Into<u64>, w: &mut impl io::Write) -> Res<()> {
    let v = v.into().to_be_bytes();
    assert!((1..=std::mem::size_of::<u64>()).contains(&N));
    w.write_all(&v[std::mem::size_of::<u64>() - N..])?;
    Ok(())
}

pub fn write_varint(v: impl Into<u64>, w: &mut impl io::Write) -> Res<()> {
    let v = v.into();
    match () {
        () if v < (1 << 6) => write_uint::<1>(v, w),
        () if v < (1 << 14) => write_uint::<2>(v | (1 << 14), w),
        () if v < (1 << 30) => write_uint::<4>(v | (2 << 30), w),
        () if v < (1 << 62) => write_uint::<8>(v | (3 << 62), w),
        () => panic!("varint value too large"),
    }
}

pub fn write_len(len: usize, w: &mut impl io::Write) -> Res<()> {
    write_varint(u64::try_from(len).unwrap(), w)
}

pub fn write_vec(v: &[u8], w: &mut impl io::Write) -> Res<()> {
    write_len(v.len(), w)?;
    w.write_all(v)?;
    Ok(())
}

fn read_uint<T, R, const N: usize>(r: &mut T) -> Res<Option<u64>>
where
    T: BorrowMut<R> + ?Sized,
    R: ReadSeek + ?Sized,
{
    let mut buf = [0; 8];
    let count = r.borrow_mut().read(&mut buf[(8 - N)..])?;
    if count == 0 {
        Ok(None)
    } else if count < N {
        Err(Error::Truncated)
    } else {
        Ok(Some(u64::from_be_bytes(buf)))
    }
}

pub fn read_varint<T, R>(r: &mut T) -> Res<Option<u64>>
where
    T: BorrowMut<R> + ?Sized,
    R: ReadSeek + ?Sized,
{
    if let Some(b1) = read_uint::<_, _, 1>(r)? {
        Ok(Some(match b1 >> 6 {
            0 => b1 & 0x3f,
            1 => ((b1 & 0x3f) << 8) | read_uint::<_, _, 1>(r)?.ok_or(Error::Truncated)?,
            2 => ((b1 & 0x3f) << 24) | read_uint::<_, _, 3>(r)?.ok_or(Error::Truncated)?,
            3 => ((b1 & 0x3f) << 56) | read_uint::<_, _, 7>(r)?.ok_or(Error::Truncated)?,
            _ => unreachable!(),
        }))
    } else {
        Ok(None)
    }
}

pub fn read_vec<T, R>(r: &mut T) -> Res<Option<Vec<u8>>>
where
    T: BorrowMut<R> + ?Sized,
    R: ReadSeek + ?Sized,
{
    use std::io::SeekFrom;

    if let Some(len) = read_varint(r)? {
        // Check that the input contains enough data.  Before allocating.
        let r = r.borrow_mut();
        let pos = r.stream_position()?;
        let end = r.seek(SeekFrom::End(0))?;
        if end - pos < len {
            return Err(Error::Truncated);
        }
        _ = r.seek(SeekFrom::Start(pos))?;

        let mut v = vec![0; usize::try_from(len)?];
        r.read_exact(&mut v)?;
        Ok(Some(v))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod test {
    use std::io::Cursor;

    use super::{read_varint, write_varint};
    use crate::{rw::read_vec, Error};

    #[test]
    fn basics() {
        for i in [
            0_u64,
            1,
            17,
            63,
            64,
            100,
            0x3fff,
            0x4000,
            0x1_0002,
            0x3fff_ffff,
            0x4000_0000,
            0x3456_dead_beef,
            0x3fff_ffff_ffff_ffff,
        ] {
            let mut buf = Vec::new();
            write_varint(i, &mut buf).unwrap();
            let sz_bytes = (64 - i.leading_zeros() + 2).div_ceil(8); // +2 size bits, rounded up
            assert_eq!(
                buf.len(),
                usize::try_from(sz_bytes.next_power_of_two()).unwrap()
            );

            let o = read_varint(&mut Cursor::new(buf.clone())).unwrap();
            assert_eq!(Some(i), o);

            for cut in 1..buf.len() {
                let e = read_varint(&mut Cursor::new(buf[..cut].to_vec())).unwrap_err();
                assert!(matches!(e, Error::Truncated));
            }
        }
    }

    #[test]
    fn read_nothing() {
        let o = read_varint(&mut Cursor::new(Vec::new())).unwrap();
        assert!(o.is_none());
    }

    #[test]
    #[should_panic(expected = "varint value too large")]
    fn too_big() {
        std::mem::drop(write_varint(0x4000_0000_0000_0000_u64, &mut Vec::new()));
    }

    #[test]
    fn too_big_vec() {
        let mut buf = Vec::new();
        write_varint(10_u64, &mut buf).unwrap();
        buf.resize(10, 0); // Not enough extra for the promised length.
        let e = read_vec(&mut Cursor::new(buf.clone())).unwrap_err();
        assert!(matches!(e, Error::Truncated));
    }
}
