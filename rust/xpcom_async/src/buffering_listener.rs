/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::cell::{Cell, RefCell};
use std::io::Cursor;
use std::io::{Read, Write};
use std::os::raw::c_char;
use std::slice;
use std::task::Waker;
use std::vec::Vec;

use nserror::{nsresult, NS_OK};
use xpcom::interfaces::{nsIInputStream, nsIRequest};
use xpcom::{xpcom_method, RefPtr};

/// An nsIStreamListener implementation which buffers any bit of data it
/// receives, and implements a few methods to allow its status and buffer to be
/// read by the future it's wrapped into.
#[xpcom::xpcom(implement(nsIStreamListener), atomic)]
pub struct BufferingStreamListener {
    buf: RefCell<Cursor<Vec<u8>>>,
    waker: Cell<Option<Waker>>,
    status: Cell<Option<nsresult>>,
    must_wake: Cell<bool>,
}

impl BufferingStreamListener {
    pub fn new() -> RefPtr<BufferingStreamListener> {
        BufferingStreamListener::allocate(InitBufferingStreamListener {
            buf: Default::default(),
            waker: Default::default(),
            status: Default::default(),
            must_wake: Default::default(),
        })
    }

    // We don't actually have any logic to implement in here, so we might as
    // well skip the xpcom_method! call entirely.
    #[allow(non_snake_case)]
    unsafe fn OnStartRequest(&self, _aRequest: *const nsIRequest) -> nsresult {
        NS_OK
    }

    xpcom_method!(on_data_available => OnDataAvailable(aRequest: *const nsIRequest, aInputStream: *const nsIInputStream, aOffset: u64, aCount: u32));
    fn on_data_available(
        &self,
        _request: &nsIRequest,
        stream: &nsIInputStream,
        _offset: u64,
        count: u32,
    ) -> Result<(), nsresult> {
        // The interim buffer in which to read data from the stream. We're
        // instantiating the vector like this rather than with
        // Vec::with_capacity(count) so that it has the correct length value
        // after writing directly to its pointer.
        let mut read_sink: Vec<c_char> =
            vec![0; <usize>::try_from(count).or(Err(nserror::NS_ERROR_FAILURE))?];

        // SAFETY: The call contract from `nsIInputStream::Read` guarantees that
        // the data written into the provided buffer is of type c_char (char* in
        // C-land) and is contiguous for the length it writes in `bytes_read`.
        // It also guarantees that only `count` bytes will be read into the
        // buffer that is provided to it.
        //
        // Moreover, the call contract for `OnDataAvailable` guarantees that the
        // data in the stream is not mutated during the call.
        //
        // Additionally, `read_sink` is instantiated with the amount of bytes to
        // read, so we won't try to write into unallocated memory.
        let read_sink = unsafe {
            let read_sink = read_sink.as_mut_ptr();
            // The amount of bytes actually read from the stream.
            let mut bytes_read: u32 = 0;

            stream.Read(read_sink, count, &mut bytes_read).to_result()?;

            // Turn the buffer of c_char into a &[u8] that we can use to write
            // into our internal buffer.
            let bytes_read = <usize>::try_from(bytes_read).or(Err(nserror::NS_ERROR_FAILURE))?;
            slice::from_raw_parts(read_sink as *const u8, bytes_read)
        };

        // Append the content we've just read to the buffer.
        let mut inner = self.buf.borrow_mut();
        inner
            .write_all(read_sink)
            .map_err(|_| nserror::NS_ERROR_FAILURE)?;

        // We don't want to wake the future just yet because the request hasn't
        // finished yet.
        Ok(())
    }

    xpcom_method!(on_stop_request => OnStopRequest(aRequest: *const nsIRequest, aStatusCode: nsresult));
    fn on_stop_request(&self, _request: &nsIRequest, status: nsresult) -> Result<(), nsresult> {
        // Reset the buffer's position so that we can read bytes.
        let mut buf = self.buf.borrow_mut();
        buf.set_position(0);

        // Set the final status of the request and wake the future.
        self.status.replace(Some(status));
        self.wake();

        Ok(())
    }

    /// Returns the final status of the request, if it has completed.
    pub fn status(&self) -> Option<nsresult> {
        self.status.take()
    }

    /// Sets the `Waker` to be woken when the request is completed, or wakes it
    /// immediately if the request has already completed.
    pub fn set_waker(&self, waker: Waker) {
        if self.must_wake.take() {
            waker.wake();
        } else {
            self.waker.replace(Some(waker));
        }
    }

    /// Reads data from the stream listener's inner buffer into the provided
    /// buffer.
    ///
    /// This is a slight variation of the function declared for the `Read`
    /// trait, in order to accommodate XPCOM limitations (the inability to hold
    /// a mutable reference to an XPCOM implementation and the need to return an
    /// instance of [`nsresult`] in case of an error).
    pub fn read(&self, dest: &mut [u8]) -> Result<usize, nsresult> {
        let mut buf = self.buf.borrow_mut();

        let read = buf.read(dest).map_err(|_| nserror::NS_ERROR_FAILURE)?;

        Ok(read)
    }

    /// Wakes the future using the previously set `Waker`.
    ///
    /// If no `Waker` has been set, indicate that we should immediately wake the
    /// next `Waker` we receive.
    fn wake(&self) {
        if let Some(waker) = self.waker.take() {
            waker.wake();
        } else {
            self.must_wake.replace(true);
        }
    }
}
