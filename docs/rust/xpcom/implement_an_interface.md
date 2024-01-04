# Implementing an XPCOM interface in Rust

In this example, we'll introduce the following interface:

```omg-idl
#include "nsISupports.idl"

interface nsIStreamListener;

[scriptable, rust_sync, uuid(5c135256-c199-4d26-9d11-f5e8c8002869)]
interface nsIHelloWorld : nsISupports
{
    ACString generateHello(in ACString name);
};
```


## Implementing the interface in a `struct`

A classic, pure Rust implementation of this interface could look something like
this:

```rust
struct HelloWorld {}

impl HelloWorld {
    fn generate_hello(&self, name: String) -> String {
        format!("hello {name}")
    }
}
```

The first thing we need to do is to decorate the `struct` declaration to
indicate it implements the `nsIHelloWorld` interface:

```rust
#[xpcom::xpcom(implement(nsIHelloWorld), atomic)]
struct HelloWorld {}
```

<div class="note"><div class="admonition-title">Note</div>

This decorator is provided by the `xpcom` crate, which also requires the
`nserror` and `nsstring` crates to be listed as dependencies alongside it. All
three crates are located in `xpcom/rust`.

More information on how to use the `#[xpcom::xpcom]` decorator can be found in
the Cargo documentation of the `xpcom_macros` crate (see [this
section](build_cargo_doc) for instructions on building Cargo documentation for
internal crates).

</div>

This decorator defines that the `struct` implements the `nsIHelloWorld`
interface. It also defines an initializer struct called `InitHelloWorld`
(following the naming convention `Init{ImplementationClassName}`), alongside a
`HelloWorld::allocate` method that can be used to initialize the method. This
means we can now define a `new` method to `HelloWorld`:

```rust
impl HelloWorld {
    pub fn new() -> xpcom::RefPtr<HelloWorld> {
        HelloWorld::allocate(InitHelloWorld {})
    }

    ...
}
```

<div class="note"><div class="admonition-title">Note</div>

`InitHelloWorld` can be used to define the fields of `HelloWorld`, if it had
any. For example, if `HelloWorld` was defined as:

```rust
struct HelloWorld {
    name: &str,
}
```

Then a call to `HelloWorld::allocate` could look like this:

```rust
HelloWorld::allocate(InitHelloWorld {
    name: "Sarah",
})
```

</div>

`HelloWorld::allocate` also handles all the necessary operations to ensure that
the new instance of `HelloWorld` is correctly ref-counted (hence why it wraps it
into a `RefPtr`).


## Using XPCOM-compatible types

Next, we want to fix up `HelloWorld::generate_hello` to use XPCOM-compatible
types. In this case, both the input and the output are defined as `ACString` in
the XPIDL definition of our interface, which maps to `nsstring::nsACString`.

This means `generate_hello` will take `*const nsACString` as an argument (note
that all arguments which are purely described as input (`in` in XPCOM terms) are
passed as `*const`).

For the method's return value, we might not want to use `nsACString` straight
away since this type can be a bit difficult to work with for what we want to do;
instead we can use its subtype `nsCString` (see [this
page](https://firefox-source-docs.mozilla.org/xpcom/stringguide.html) on the
Firefox source docs, as well as the Cargo doc for `nsstring`, for more
information about internal string types):

```rust
impl HelloWorld {
    ...

    fn generate_hello(&self, name: *const nsACString) -> nsCString {
        let mut hello = nsCString::from("hello ");
        hello.append(unsafe{ &*name });

        hello
    }
}
```

<div class="note"><div class="admonition-title">Note</div>

Note the `unsafe` block inside the call to `hello.append()`. This is because we
need to dereference the raw pointer of type `*const nsACString` to access the
data with the `nsACString` type, which is an unsafe operation.

</div>

Additionally, XPCOM requires the method to implement some kind of error handling
by returning a `Result`, which error type is either `nserror::nsresult` or any
type that implements `Into<nserror::nsresult>`. This gives us this final form of
`HelloWorld::generate_hello`:

```rust
impl HelloWorld {
    ...

    fn generate_hello(&self, name: *const nsACString) -> Result<nsCString, nsresult> {
        let mut hello = nsCString::from("hello ");
        hello.append(unsafe{ &*name });

        Ok(hello)
    }
}
```


## Exposing the method as XPCOM

Now, all we need to do is to associate `HelloWorld::generate_hello()` with the
`generateHello()` method from the XPIDL interface. Note that, just like in C++,
XPIDL method names are translated to Pascal case in Rust (i.e.,
`GenerateHello()`).

We do this association using the `xpcom_method!` macro from the `xpcom` crate:

```rust
xpcom_method!(generate_hello => GenerateHello(name: *const nsACString) -> nsACString);
```

We use `nsACString` here as the return value in the `xpcom_method!` macro, to
fit with the XPIDL definition. We can do this (and not have to stick strictly to
`generate_hello()`'s return value) because the macro implements a new
`GenerateHello()` method onto the `HelloWorld` struct, which has the following
signature:

```rust
unsafe fn GenerateHello(&self, name: *const nsACString, retval: *mut nsACString) -> nsresult
```

This new method calls `generate_hello()`, and either assigns its return value to
`retval` or returns the error value included in the `Result` (if no error is
returned, `GenerateHello()` returns with `nserror::NS_OK`).

You can refer to the Cargo documentation for `xpcom::xpcom_method` for more
information.

It's also possible to skip the `xpcom_method!` entirely, by refactoring the
`generate_hello()` method into a `GenerateHello()` one, which implements the
signature described above.

By this point, and with a bit of cleanup, this is what `HelloWorld` should look
like:

```rust
use nsstring::{nsACString, nsCString};
use xpcom::{xpcom_method, RefPtr};
use nserror::NS_OK;
use nserror::nsresult;

#[xpcom::xpcom(implement(nsIHelloWorld), atomic)]
struct HelloWorld {}

impl HelloWorld {
    pub fn new() -> RefPtr<HelloWorld> {
        HelloWorld::allocate(InitHelloWorld {})
    }

    xpcom_method!(generate_hello => GenerateHello(name: *const nsACString) -> nsACString);

    fn generate_hello(&self, name: *const nsACString) -> Result<nsCString, nsresult> {
        let mut hello = nsCString::from("hello ");
        hello.append(unsafe { &*name });

        Ok(hello)
    }
}
```

<div class="note"><div class="admonition-title">Note</div>

All XPCOM objects are reference-counted, and as such exclusive access to them
can't be guaranteed. As a result, it's not possible to use XPCOM to expose a
method that takes a mutable reference to `self` (i.e. `&mut self`) to directly
modify fields on the struct.

To mutate a struct field, it is necessary to provide [interior
mutability](https://doc.rust-lang.org/reference/interior-mutability.html), such
as by wrapping the field in a data structure from
[`std::cell`](https://doc.rust-lang.org/std/cell/) or similar.

</div>


## Writing a constructor for the struct

We can now write a constructor that can be used by XPCOM's `createInstance()` to
instantiate the `HelloWorld` struct:

```rust
use xpcom::nsIID;

#[no_mangle]
pub unsafe extern "C" fn nsHelloWorldConstructor(
    iid: &nsIID,
    result: *mut *mut c_void,
) -> nsresult {
    let instance = HelloWorld::new();
    instance.QueryInterface(iid, result)
}
```

<div class="note"><div class="admonition-title">Note</div>

The `QueryInterface` method is automatically implemented for `HelloWorld` by the
`#[xpcom::xpcom]` decorator.

</div>


## Registering the XPCOM component

We now have all the Rust code necessary to expose `HelloWorld` to the rest of
Thunderbird – now all that's left to do is to tell it our component exists.

A current limitation of XPCOM's compatibility with Rust is that the constructor
needs to be a symbol which exists within C++ land. To do this, we need to create
a dummy C++ header for it. Let's call it `nsHelloWorld.h` and locate it at the
root of our crate:

```cpp
#ifndef ThunderbirdRustHelloWorld_h
#define ThunderbirdRustHelloWorld_h

#include "nsID.h"

extern "C" {
// Implemented in Rust.
MOZ_EXPORT nsresult nsHelloWorldConstructor(REFNSIID aIID, void** aResult);
}  // extern "C"

#endif  // defined ThunderbirdRustHelloWorld_h
```

Then we can create a `components.conf` file (let's locate it at the root of our
crate as well):

```properties
Classes = [
    {
        'cid': '{5c135256-c199-4d26-9d11-f5e8c8002869}',
        'contract_ids': ['@mozilla.org/comm/rust/hello-world;1'],
        'headers': ['/comm/rust/hello_world/nsHelloWorld.h'],
        'legacy_constructor': 'nsHelloWorldConstructor',
    },
]
```

There are a few noteworthy aspects to this file:
* the `cid` must be identical to the `uuid` in the XPIDL interface's header
* we have decided to call our crate `hello_world`, and we have located it at
  `comm/rust/hello_world` as per [](../new_component.md)

Now we need to tell the build system to include the registration when building
Thunderbird, which we can do by editing `comm/rust/hello_world/moz.build` (or
creating it if it does not exist) and adding the following line to it:

```
XPCOM_MANIFESTS += ["components.conf"]
```

And finally, if this has not already been done previously, we can add the
relative path to the crate to `comm/rust/moz.build` to make our crate's
`moz.build` discoverable:

```
DIRS += [
    ...
    "hello_world",
    ...
]
```

And that's it! You should now be able to create a new instance of `HelloWorld`
from JavaScript or C++.
