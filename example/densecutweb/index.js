
var drag = false;
var rect = {};
var canvas1;
var canvas2;
var IsFG = true;

var scaleFactor;
var imgData;
var canvas;
var cloneData;

let Radius = 5;
let MaskBG = 126;
let MaskFG = 127;

setCallbacks();

function setCallbacks() {
  var inputElement = document.getElementById("my-file");
  canvas1 = document.getElementById("canvas1");

  inputElement.addEventListener("change", onLoadImage, false);

  canvas1.addEventListener("mouseup", onMouseUp, false);
  canvas1.addEventListener("mousedown", onMouseDown, false);
  canvas1.addEventListener("mousemove", onMouseMove, false);
}

function getMousePos(evt) {
  var rect = canvas1.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function onMouseUp(e) {
  drag = false;
}

function onMouseDown(e) {
  drag = true;
}

function onMouseMove(e) {
  var canvas=document.getElementById("canvas1");
  var cxt=canvas.getContext("2d")
  if(drag)
  {
    var mousePos = getMousePos(e);
    if(IsFG){
      cxt.beginPath();
      cxt.arc(mousePos.x,mousePos.y,Radius,0,360,false);
      cxt.fillStyle="green";
      cxt.fill();
      cxt.closePath();
      for(var i=-1*Radius;i<Radius+1;i++)
        for(var j=-1*Radius;j<Radius+1;j++)
        {
          if(Math.sqrt(i*i+j*j)<=Radius)
          {
            var ii=Math.max(0, Math.min(mousePos.y+j,canvas.height-1));
            var jj=Math.max(0, Math.min(mousePos.x+j,canvas.width-1));
            imgData.data[jj+ii*canvas.width*4+3] = MaskFG;
          }
            
        }
    }
    else
    {
      cxt.beginPath();
      cxt.arc(mousePos.x,mousePos.y,Radius,0,360,false);
      cxt.fillStyle="blue";
      cxt.fill();
      cxt.closePath();
      for(var i=-1*Radius;i<Radius+1;i++)
        for(var j=-1*Radius;j<Radius+1;j++)
        {
          if(Math.sqrt(i*i+j*j)<=Radius)
          {
            var ii=Math.max(0, Math.min(mousePos.y+j,canvas.height-1));
            var jj=Math.max(0, Math.min(mousePos.x+j,canvas.width-1));
            imgData.data[jj+ii*canvas.width*4+3] = MaskBG;
          }
            
        }
    }
  }
  
  return ;
}

function clearFg()
{
  clone_image = original_image.clone();
  show_image(clone_image, "canvas1");
}

function show_image(mat, canvas_id) {
  var data = mat.data(); // output is a Uint8Array that aliases directly into the Emscripten heap

  channels = mat.channels();
  channelSize = mat.elemSize1();

  var canvas = document.getElementById(canvas_id);

  ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  canvas.width = mat.cols;
  canvas.height = mat.rows;

  imdata = ctx.createImageData(mat.cols, mat.rows);

  for (var i = 0, j = 0; i < data.length; i += channels, j += 4) {
    imdata.data[j] = data[i];
    imdata.data[j + 1] = data[i + 1 % channels];
    imdata.data[j + 2] = data[i + 2 % channels];
    imdata.data[j + 3] = 255;
  }
  ctx.putImageData(imdata, 0, 0);
}



function onLoadImage(e) {
  var fileReturnPath = document.getElementsByClassName('form-control');

  canvas = document.getElementById('canvas1');
  var canvasWidth = 500;
  var canvasHeight = 500;
  var ctx = canvas.getContext('2d');

  // if (original_image) {
  //   // clear data first
  //   ctx.clearRect(0, 0, canvas.width, canvas.height);
  //   var canvas2 = document.getElementById('canvas2');
  //   var ctx2 = canvas2.getContext('2d');
  //   ctx2.clearRect(0, 0, canvas2.width, canvas2.height);
  // }

  var url = URL.createObjectURL(e.target.files[0]);
  var img = new Image();
  img.onload = function() {
    scaleFactor = Math.min((canvasWidth / img.width), (canvasHeight / img.height));
    canvas.width = img.width * scaleFactor;
    canvas.height = img.height * scaleFactor;
    ctx.drawImage(img, 0, 0, img.width * scaleFactor, img.height * scaleFactor);
    imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    cloneData = ctx.createImageData(canvas.width, canvas.height);
    cloneData.data.set(imgData.data);
  }
  img.src = url;
}

function switchFgBg()
{
  if(IsFG)
    IsFG = false;
  else
    IsFG = true;
}

function Segment()
{
    var canvas2 = document.getElementById('canvas2');
    var ctx2 = canvas2.getContext('2d');
    var res = ctx2.createImageData(canvas.width, canvas.height);
    var mask = Module._malloc(imgData.data.length*imgData.data.BYTES_PER_ELEMENT);
    var buf = Module._malloc(imgData.data.length*imgData.data.BYTES_PER_ELEMENT);
    Module.HEAPU8.set(imgData.data, buf);

    res.data.set(cloneData.data);

    console.log(imgData);
    console.log(cloneData);
    console.log(mask);
    console.log(buf);
    
    var aa = Module._process(buf, mask, canvas.width, canvas.height);

    for(var y=0; y<canvas.height; y++)
      for(var x=0; x<canvas.width; x++)
      {
        var label = Module.getValue(mask+x+y*canvas.width, "i8");
        if(label==MaskBG)
          res.data[4*x+y*canvas.width*4+3] = 0;
      }

    console.log(aa);
    ctx2.putImageData(res, 0, 0);
    Module._free(buf);
    Module._free(mask);
}
/*
function grabCut() {
  var result = new cv.Mat();
  var bgdModel = new cv.Mat();
  var fgdModel = new cv.Mat();
  var roiRect = new cv.Rect(0,0,0,0);
  var maskdata = mask.data();
  var clonedata = clone_image.data();
  let step = 3 * mask.cols;

  // could be improved ....
  for (var x = 0; x < mask.rows; x++) {
    for (var y = 0; y < mask.cols; y++) {
      if (clonedata[x * step + 3 * y]==0&&clonedata[x * step + 3 * y + 1]==0&&clonedata[x * step + 3 * y + 2]==255) {
        maskdata[x*mask.cols + y] = 1;
      }
      else if (clonedata[x * step + 3 * y]==0&&clonedata[x * step + 3 * y + 1]==255&&clonedata[x * step + 3 * y + 2]==0) 
      {
        maskdata[x*mask.cols + y] = 0;
      }
      else
      {
        maskdata[x*mask.cols + y] = 2;
      }
    }
  }
  
  //var roiRect = new cv.Rect(rect.startX, rect.startY, rect.w, rect.h);
  //cv.grabCut(original_image, result, roiRect, bgdModel, fgdModel, 1, cv.GrabCutModes.GC_INIT_WITH_RECT.value);
  cv.grabCut(original_image, mask, roiRect, bgdModel, fgdModel, 1, cv.GrabCutModes.GC_INIT_WITH_MASK.value);
  var fg = original_image.clone();
  var view = fg.data();
  let rstep = 3 * mask.cols;
  // could be improved ....
  for (var x = 0; x < mask.rows; x++) {
    for (var y = 0; y < mask.cols; y++) {
      var category = mask.get_uchar_at(x, y);
      if (category == cv.GrabCutClasses.GC_BGD.value || category == cv.GrabCutClasses.GC_PR_BGD.value) {
        view[x * rstep + 3 * y] = 255;
        view[x * rstep + 3 * y + 1] = 255;
        view[x * rstep + 3 * y + 2] = 255;
        //view[x * step + 3 * y + 3] = 128;
      }
    }
  }
  show_image(fg, "canvas2");
}

function downloadImage() {
  var a = document.getElementById("download");
  a.href = document.getElementById("canvas2").toDataURL();
  a.download = 'screenshot.png';
}
*/