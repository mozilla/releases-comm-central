# net.thunderbird URLs

In some circumstances you may need a way to talk to Thunderbird from a web browser, and the best
way to do that is with a URL. A URL can be linked on web pages for the user to click on, or an HTTP
request can redirect to a URL.

Thunderbird provides the custom URL protocol `net.thunderbird:` for this purpose. If correctly
registered with the operating system (using the same mechanism as `mailto:` is registered),
Thunderbird will handle URLs of the form `net.thunderbird://component/arguments` where `component`
is the name of a component registered in the category manager. The URL is passed to the `observe`
function on the component.

## Adding a component

### Pick a name

It should uniquely identify what the URL does and wouldn't ever be used by another part of
Thunderbird. Also it's the host part of a URL, so stick to lower-case letters, numbers, and maybe
`-` or `.` if you really must.

### Design your URL

It will be `net.thunderbird://`, plus the name of your component, plus `/` and any extra
information you want to include. Extra information can be appended directly to the URL path, e.g.
`net.thunderbird://mycomponent/foo/bar` and/or using search parameters, e.g.
`net.thunderbird://mycomponent/?foo=bar`. What you do will depend on your needs. You may need to
consider:
- URL encoding characters
- versioning, if your URL could be used with past or future versions of Thunderbird
- not including sensitive information

```{warning}
Anybody could construct a URL and put it on a web page, so data we get from one should never be
naïvely trusted. Don't add a component that creates or deletes items, or sends any kind of
request, without user confirmation.
```

### Write your code

You'll need an object that implements `nsIObserver`, which will be called when Thunderbird is given
a URL to load:

```js
export class MyComponent {
  QueryInterface = ChromeUtils.generateQI(["nsIObserver"]);

  observe(subject, topic, data) {
    if (topic == "net-thunderbird-url") {
      // `data` contains the URL.
    }
  }
}
```

If necessary this code should deconstruct the URL ([`URL`][mdn_url] and
[`URLSearchParams`][mdn_urlsearchparams] are your friends here).

```{note}
There should only ever be a single instance of your component. It will be instantiated with
`getService` and not `createInstance`.
```

### Register your component

Add it to a components.conf file. For a JS component, this is all you need:

```python
{
    "cid": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",  # Use a real UUID. :-)
    "contract_ids": ["@mozilla.org/my-component;1"],
    "esModule": "resource:///modules/MyComponent.sys.mjs",
    "constructor": "MyComponent",
    "categories": {"net-thunderbird-url": "mycomponent"},  # This will be the host part of the URL.
}
```

Change each line to point to your actual component, obviously. [More information about registering
XPCOM components][components].

### Rebuild

This may take a little while because adding a component requires a lot of things to be rebuilt.

### Try it

You should be good to go. If Thunderbird (your local build) is the default application for mail
then clicking on a link in a browser should bring Thunderbird to the front and run your code.

For a simple check, type `data:text/html,<a href="net.thunderbird://mycomponent/foo/bar">click me</a>`
in your browser's address bar.

### Write tests

Please add automated tests for your new component.

To simulate a click on a URL in a browser, call the observe method with the same data it would see
in real-world use:

```js
const service = Cc["@mozilla.org/my-component;1"].getService(Ci.nsIObserver);
service.observe(null, "net-thunderbird-url", "net.thunderbird://mycomponent/test");
```

### Document

Add your component to the list below with a description of what it does and give example URLs to
illustrate how to use it.

## Components

- `replay` is a test component which simply records the URL to be checked later on.

[mdn_url]: https://developer.mozilla.org/en-US/docs/Web/API/URL
[mdn_urlsearchparams]: https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
[components]: https://firefox-source-docs.mozilla.org/build/buildsystem/defining-xpcom-components.html
