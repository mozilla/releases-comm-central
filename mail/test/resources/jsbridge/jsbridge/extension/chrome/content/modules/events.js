var EXPORTED_SYMBOLS = ["backchannels", "fireEvent", "addBackChannel"];

var backchannels = [];

function fireEvent(name, obj) {
  for (let backchannel of backchannels) {
    backchannel.session.encodeOut({
      eventType: name,
      result: obj,
    });
  }
}

function addBackChannel(backchannel) {
  backchannels.push(backchannel);
}
