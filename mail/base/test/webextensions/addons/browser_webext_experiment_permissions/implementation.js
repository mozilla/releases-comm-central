// Get various parts of the WebExtension framework that we need.
const { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);

// This is the important part. It implements the functions and events defined in schema.json.
// The variable must have the same name you've been using so far, "myapi" in this case.
var myapi = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      // Again, this key must have the same name.
      myapi: {
        // An event. Most of this is boilerplate you don't need to worry about, just copy it.
        onToolbarClick: new ExtensionCommon.EventManager({
          context,
          name: "myapi.onToolbarClick",
          // In this function we add listeners for any events we want to listen to, and return a
          // function that removes those listeners. To have the event fire in your extension,
          // call fire.async.
          register(fire) {
            let callback = function (event, id, x, y) {
              return fire.async(id, x, y);
            };

            windowListener.add(callback);
            return () => {
              windowListener.remove(callback);
            };
          },
        }).api(),

        // A function.
        sayHello(name) {
          Services.wm
            .getMostRecentWindow("mail:3pane")
            .alert("Hello " + name + "!");
        },
      },
    };
  }
};

// A helpful class for listening to windows opening and closing.
var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);

// This object is just what we're using to listen for toolbar clicks. The implementation isn't
// what this example is about, but you might be interested as it's a common pattern. We count the
// number of callbacks waiting for events so that we're only listening if we need to be.
var windowListener = new (class extends ExtensionCommon.EventEmitter {
  constructor() {
    super();
    this.callbackCount = 0;
  }

  handleEvent(event) {
    let toolbar = event.target.closest("toolbar");
    windowListener.emit(
      "toolbar-clicked",
      toolbar.id,
      event.clientX,
      event.clientY
    );
  }

  add(callback) {
    this.on("toolbar-clicked", callback);
    this.callbackCount++;

    if (this.callbackCount == 1) {
      ExtensionSupport.registerWindowListener("windowListener", {
        chromeURLs: ["chrome://messenger/content/messenger.xul"],
        onLoadWindow: window => {
          let toolbox = window.document.getElementById("mail-toolbox");
          toolbox.addEventListener("click", this.handleEvent);
        },
      });
    }
  }

  remove(callback) {
    this.off("toolbar-clicked", callback);
    this.callbackCount--;

    if (this.callbackCount == 0) {
      for (let window of ExtensionSupport.openWindows) {
        if (
          window.location.href == "chrome://messenger/content/messenger.xul"
        ) {
          let toolbox = window.document.getElementById("mail-toolbox");
          toolbox.removeEventListener("click", this.handleEvent);
        }
      }
      ExtensionSupport.unregisterWindowListener("windowListener");
    }
  }
})();
