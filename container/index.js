function writeText(canvas, str) {
  const ctx = canvas.getContext("2d");
  ctx.font = "20px Comic Sans MS";
  ctx.fillStyle = "red";
  ctx.fillText(str, 10, 40);
}


const rawVideoElem = document.createElement("video");
rawVideoElem.setAttribute("id", "rawVideo");
// rawVideoElem.setAttribute("style", "display:none");
document.getElementById("videoWrapper").appendChild(rawVideoElem);
//document.getElementById("videoWrapper").innerHTML = startStreaming();

const processedVideoElem = document.createElement("video");
processedVideoElem.setAttribute("id", "processedVideo");
document.getElementById("resultWrapper").appendChild(processedVideoElem);

const previewCanvas = document.createElement("canvas");
previewCanvas.setAttribute("id", "previewCanvas");
const processedMediaStream = previewCanvas.captureStream(60);
previewCanvas.setAttribute("style", "display:none");
document.getElementById("resultWrapper").appendChild(previewCanvas);
const previewCanvasCtx = previewCanvas.getContext("2d");

const videoFrameCanvas = document.createElement("canvas");
videoFrameCanvas.setAttribute("id", "videoFrameCanvas");
videoFrameCanvas.setAttribute("style", "display:none");
document.getElementById("resultWrapper").appendChild(videoFrameCanvas);
const videoFrameCanvasContext = videoFrameCanvas.getContext("2d");

function getResolution() {
  let resolution = localStorage.getItem("resolution");
  if (!resolution) {
    resolution = [640, 480];
  } else {
    resolution = resolution.split(",");
  }
  document.getElementById("resolution_" + resolution[1]).checked = true;
  return resolution;
}

function initVideoPromise() {
  return new Promise(async function (resolve, reject) {
    let devices = await navigator.mediaDevices.enumerateDevices();
    console.log("initial video promise*********************************************************")
    console.log(devices, devices[0].deviceId);
    const resolution = getResolution();

    const cameraStream = await window.navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: resolution[0],
        height: resolution[1],
      },
    });

    processedVideoElem.srcObject = processedMediaStream;
    rawVideoElem.srcObject = cameraStream;

    rawVideoElem.onloadedmetadata = function () {
      rawVideoElem.width = rawVideoElem.videoWidth;
      rawVideoElem.height = rawVideoElem.videoHeight;
      processedVideoElem.width = rawVideoElem.videoWidth;
      processedVideoElem.height = rawVideoElem.videoHeight;
      videoFrameCanvas.width = rawVideoElem.videoWidth;
      videoFrameCanvas.height = rawVideoElem.videoHeight;
      previewCanvas.width = rawVideoElem.videoWidth;
      previewCanvas.height = rawVideoElem.videoHeight;
      rawVideoElem.play();
      processedVideoElem.play();
      resolve();
    };
  });
}

function getVideoFrame() {
  videoFrameCanvasContext.drawImage(
    rawVideoElem,
    0,
    0,
    rawVideoElem.width,
    rawVideoElem.height
  );
  return videoFrameCanvasContext.getImageData(
    0,
    0,
    rawVideoElem.width,
    rawVideoElem.height
  );
}

let streamInited = false;
async function startStreaming() {
  if (streamInited) {
    return;
  }
  await initVideoPromise();
  streamInited = true;
}
const iframeWindow = document.getElementById("ifrm").contentWindow;

let sharedBuffer;
let sharedImageArray;
let sendToIframe = true;
async function sendNewVideoFrame() {
  await startStreaming();
  startProfile("GetVideoFrame");
  const imageData = getVideoFrame();
  endProfile("GetVideoFrame");

  if (
    !sharedBuffer ||
    sharedBuffer.byteLength !== imageData.data.buffer.byteLength
  ) {
    delete sharedBuffer;
    sharedBuffer = new ArrayBuffer(imageData.data.buffer.byteLength);
    sharedImageArray = new Uint8ClampedArray(sharedBuffer);
  }

  startProfile("HandleFrame");
  startProfile("CopyToShareArray");
  sharedImageArray.set(imageData.data, 0);

  endProfile("CopyToShareArray");

  if (sendToIframe) {
    setTimeout(() => {
      startProfile("PostNewVideoFrame");
      videoFrameProcessed();
    }, 0);
    return;
  }
  startProfile("PostNewVideoFrame");

  iframeWindow.postMessage(
    {
      type: "videoApp.newVideoFrame",
      videoFrame: {
        width: imageData.width,
        height: imageData.height,
        data: sharedImageArray,
      },
    },
    "*"
  );
}

function sendEffectParameters(parameters) {
  iframeWindow.postMessage(
    {
      type: "videoApp.effectParameterChange",
      effectId: parameters,
    },
    "*"
  );
}

function convertImageDataToOpenCV(imageData) {
  // convert to normal array
  const normalArray = Array.from(imageData);
  //nest the pixel channels
  const channels = 4 //canvas pixels contain 4 elements: RGBA
  const nestedChannelArray = _.chunk(normalArray, channels);
  const nestedImageArray = _.chunk(nestedChannelArray, imageData.data.height);

  //nestedImageArray is the correct shape to be converted to matrix. 
  const RGBAmat = new cv.Mat(nestedImageArray, cv.CV_8UC4);

  //openCV often defaults to BGR-type image matrix, so lets color convert the pixel order
  return BGRAmat = RGBAmat.cvtColor(cv.COLOR_RGBA2BGRA);
}

function videoFrameProcessed() {
  endProfile("PostNewVideoFrame");

  if (renderCheck) {
    if (!processedArrayBuffer) {
      processedArrayBuffer = new ArrayBuffer(sharedBuffer.byteLength);
      processedImageArr = new Uint8ClampedArray(processedArrayBuffer);
    }
    startProfile("CopyProcessedFrame");
    processedImageArr.set(sharedImageArray, 0);
    endProfile("CopyProcessedFrame");
    endProfile("HandleFrame");

    startProfile("DisplayProcessedFrame");
    let imageData = new ImageData(processedImageArr, rawVideoElem.videoWidth, rawVideoElem.videoHeight);
    
    let BGRAmatD = cv.matFromImageData(imageData) 
    //cv.line(BGRAmatD, (0,0), (10,10), cv.Scalar(255), 1, 8, 0); 
    //const BGRAmatCV = convertImageDataToOpenCV(imageData);

    //console.log("size: " + BGRAmatD)

    // Add methods to change the video frame
    for (let i = 1; i < imageData.data.length; i += 4) {
      //smaple effect just change the value to 100, which effect some pixel value of video frame
      imageData.data[i + 1] = 100;
    }


    previewCanvasCtx.putImageData(imageData, 0, 0);
    writeText(previewCanvas, "After process");
    endProfile("DisplayProcessedFrame");
  } else {
    endProfile("HandleFrame");
  }

  sendNewVideoFrame();
}

let config = {};
let processedArrayBuffer;
let processedImageArr;
let renderCheck = true;
let sendToIframeToBeApplied = true;

function receiveMessage(event) {
  if (event.data.func === "initialize") {
    iframeWindow.postMessage(
      {
        id: event.data.id,
        args: ["sidePanel", "web"],
      },
      "*"
    );
    return;
  }
  const type = event.data.func;
  if (type === "videoApp.sendMessagePortToMainWindow") {
    config = event.data.config;
    sendNewVideoFrame();
  } else if (type === "videoApp.videoFrameProcessed") {
    videoFrameProcessed();
    return;
  } else if (type === "videoApp.notifyError") {
    const errMsg = event.data.args;
    console.log(errMsg);
    alert(errMsg);
  } else if (type === "videoApp.videoEffectChanged") {
    console.log("effect changed from video app");
    const effectChangeType = event.data.args[0];
    if (effectChangeType === "EffectDisabled") {
      // stop post message
      if (selectedScenario === "pre_meeting") {
        sendToIframe = false;
      } else if (selectedScenario === "in_meeting") {
        sendToIframeToBeApplied = false;
      }
    } else if (effectChangeType === "EffectChanged") {
      if (selectedScenario === "pre_meeting") {
        sendToIframe = true;
        sendEffectParameters(undefined);
      } else if (selectedScenario === "in_meeting") {
        sendToIframeToBeApplied = true;
      }
    }
  }
}
window.addEventListener("message", receiveMessage, false);

document.getElementById("proportion").addEventListener("change", function () {
  sendEffectParameters(
    JSON.stringify({
      proportion: this.value,
    })
  );
});

document.getElementById("pixel_value").addEventListener("change", function () {
  sendEffectParameters(
    JSON.stringify({
      pixelValue: this.value,
    })
  );
});

document.getElementById("render_check").addEventListener("change", function () {
  renderCheck = this.checked;
});

let resolutions = {
  240: [320, 240],
  480: [640, 480],
  560: [840, 560],
  720: [1280, 720],
  1080: [1920, 1080],
};
const radios = document.getElementsByName("resolution");
radios.forEach((radio) => {
  radio.onclick = function () {
    localStorage.setItem("resolution", resolutions[this.value]);
    window.location.reload();
  };
});

let selectedScenario = "pre_meeting";
const scenarioRadios = document.getElementsByName("scenario");
scenarioRadios.forEach((radio) => {
  radio.onclick = function () {
    selectedScenario = this.value;
  };
});

document.getElementById("apply_effect").addEventListener("click", function () {
  if (sendToIframeToBeApplied === false) {
    sendToIframe = false;
  } else {
    sendToIframe = true;

    sendEffectParameters(undefined);
  }
});
