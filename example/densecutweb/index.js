
var drag = false;
var rect = {};
var canvas2;
var IsFG = true;

var scaleFactor;
var imgData;
var canvas;
var cloneData;

let Radius = 5;
let MaskBG = 126;
let MaskFG = 127;

var segimgname = "segment.png";

setCallbacks();

function setCallbacks() {
  var inputElement = document.getElementById("my-file");
  canvas = document.getElementById("canvas1");

  inputElement.addEventListener("change", onLoadImage, false);

  canvas.addEventListener("mouseup", onMouseUp, false);
  canvas.addEventListener("mousedown", onMouseDown, false);
  canvas.addEventListener("mousemove", onMouseMove, false);
}

function getMousePos(evt) {
  var rect = canvas.getBoundingClientRect();
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
  //var canvas=document.getElementById("canvas1");
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
            var ii=Math.floor(Math.max(0, Math.min(mousePos.y+i,canvas.height-1)));
            var jj=Math.floor(Math.max(0, Math.min(mousePos.x+j,canvas.width-1)));
            imgData.data[4*jj+ii*canvas.width*4+3] = MaskFG;
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
            var ii=Math.floor(Math.max(0, Math.min(mousePos.y+i,canvas.height-1)));
            var jj=Math.floor(Math.max(0, Math.min(mousePos.x+j,canvas.width-1)));
            imgData.data[4*jj+ii*canvas.width*4+3] = MaskBG;
          }
            
        }
    }
  }
  
  return ;
}

function clearFg()
{
  var ctx = canvas.getContext('2d');
  imgData.data.set(cloneData.data);
  ctx.putImageData(imgData, 0, 0);

}


function onLoadImage(e) {
  //var fileReturnPath = document.getElementsByClassName('form-control');

  canvas = document.getElementById('canvas1');
  var canvasWidth = 500;
  var canvasHeight = 500;
  var ctx = canvas.getContext('2d');

  var url = URL.createObjectURL(e.target.files[0]);
  segimgname = e.target.files[0].name+".png";
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

function switchFg()
{
    IsFG = true;
}

function switchBg()
{
    IsFG = false;
}

function downloadImage()
{
    var dlcanvas = document.getElementById("canvas2");
    var dlimg    = dlcanvas.toDataURL("image/png");
    var download = document.createElement('a');
    download.href = dlimg; //'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==';
    download.download = segimgname;
    download.click();
}

function Segment()
{
    var canvas2 = document.getElementById('canvas2');
    canvas2.width = canvas.width;
    canvas2.height = canvas.height;
    var ctx2 = canvas2.getContext('2d');
    var res = ctx2.createImageData(canvas.width, canvas.height);
    var mask = Module._malloc(imgData.data.length*imgData.data.BYTES_PER_ELEMENT);
    var buf = Module._malloc(imgData.data.length*imgData.data.BYTES_PER_ELEMENT);
    Module.HEAPU8.set(imgData.data, buf);

    res.data.set(cloneData.data);
    
    Module._process(buf, mask, canvas.width, canvas.height);

    for(var y=0; y<canvas.height; y++)
      for(var x=0; x<canvas.width; x++)
      {
        var label = Module.getValue(mask+x+y*canvas.width, "i8");
        if(label==MaskBG)
        {
          res.data[4*x+y*canvas.width*4+3] = 0;
        }
          
      }

    ctx2.putImageData(res, 0, 0);
    Module._free(buf);
    Module._free(mask);
}
