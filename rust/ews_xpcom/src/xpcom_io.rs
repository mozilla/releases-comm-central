/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::os::raw::c_char;

use cstr::cstr;

use nserror::nsresult;
use xpcom::create_instance;
use xpcom::interfaces::{nsIFile, nsIFileInputStream, nsIInputStream};

/// Open the file provided and read its content into a vector of bytes.
pub(crate) fn read_file(file: &nsIFile) -> Result<Vec<u8>, nsresult> {
    // Open a stream from the file.
    let file_stream =
        create_instance::<nsIFileInputStream>(cstr!("@mozilla.org/network/file-input-stream;1"))
            .ok_or(nserror::NS_ERROR_FAILURE)?;

    unsafe { file_stream.Init(file, -1, -1, nsIFileInputStream::CLOSE_ON_EOF) }.to_result()?;

    // Read as many bytes as available from the stream.
    read_stream(file_stream.coerce())
}

pub(crate) fn read_stream(stream: &nsIInputStream) -> Result<Vec<u8>, nsresult> {
    let mut bytes_available = 0;
    unsafe { stream.Available(&mut bytes_available) }.to_result()?;

    // `nsIInputStream::Available` reads into a u64, but `nsIInputStream::Read`
    // takes a u32.
    let bytes_available = <u32>::try_from(bytes_available).or(Err(nserror::NS_ERROR_FAILURE))?;

    let mut read_sink: Vec<u8> =
        vec![0; <usize>::try_from(bytes_available).or(Err(nserror::NS_ERROR_FAILURE))?];

    // The amount of bytes actually read from the stream.
    let mut bytes_read: u32 = 0;

    // SAFETY: The call contract from `nsIInputStream::Read` guarantees that the
    // bytes written into the provided buffer is of type c_char (char* in
    // C-land) and is contiguous for the length it writes in `bytes_read`; and
    // that `bytes_read` is not greater than `bytes_available`.
    unsafe {
        let read_ptr = read_sink.as_mut_ptr();

        stream
            .Read(read_ptr as *mut c_char, bytes_available, &mut bytes_read)
            .to_result()?;
    };

    // TODO: We currently assume all of the data we care about is in the stream
    // when we read, which might not be the case if we're copying multiple
    // messages.
    let bytes_read = <usize>::try_from(bytes_read).or(Err(nserror::NS_ERROR_FAILURE))?;
    Ok(Vec::from(&read_sink[..bytes_read]))
}
