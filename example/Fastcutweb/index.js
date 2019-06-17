
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
  var canvasWidth = 600;
  var canvasHeight = 600;
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

// 1 2 3
// 0   4
// 7 6 5
function getIdx(x, y, lastx, lasty)
{

  var diffx = lastx-x;
  var diffy = lasty-y;
  if(lastx==-1)
    return 1;
  if(diffx==-1)
  {
    if(diffy == 0)
      return 0;
    if(diffy == -1)
      return 1;
    if(diffy == 1)
      return 7;
  }
  if(diffx==0)
  {
    if(diffy == -1)
      return 2;
    if(diffy == 1)
      return 6;
  }
  if(diffx==1)
  {
    if(diffy == 0)
      return 4;
    if(diffy == -1)
      return 3;
    if(diffy == 1)
      return 5;
  }
  return -1;
}

var circlex = [-1, -1, 0, 1, 1, 1, 0, -1, -1, -1, 0, 1, 1, 1, 0, -1];
var circley = [0, -1, -1, -1, 0, 1, 1, 1, 0, -1, -1, -1, 0, 1, 1, 1];

function nextContourPoint(x, y, lastx, lasty, mask, width, height)
{
  var point = [-1,-1];
  var l = Module.getValue(mask+x-1+y*width, "i8");
  var r = Module.getValue(mask+x+1+y*width, "i8");
  var u = Module.getValue(mask+x+(y-1)*width, "i8");
  var d = Module.getValue(mask+x+(y+1)*width, "i8");
  var lu = Module.getValue(mask+x-1+(y-1)*width, "i8");
  var ru = Module.getValue(mask+x+1+(y-1)*width, "i8");
  var ld = Module.getValue(mask+x-1+(y+1)*width, "i8");
  var rd = Module.getValue(mask+x+1+(y+1)*width, "i8");
  var labels = [l, lu, u, ru, r, rd, d, ld, l, lu, u, ru, r, rd, d, ld];
  var lastidx = getIdx(x, y, lastx, lasty);
  for(var i=lastidx+1; i<lastidx+7; i++)
  {
    if(labels[i]==MaskFG)
    {
      point = [x+circlex[i], y+circley[i]];
      break;
    }
  }
  return point;
}

function drawrect(x, y, data, width, height, rsize)
{
  
  for(var i=-1*rsize; i<=rsize; i++)
  {
    data[4*(x+i)+(y-rsize)*width*4+0] = 0;
    data[4*(x+i)+(y-rsize)*width*4+1] = 255;
    data[4*(x+i)+(y-rsize)*width*4+2] = 0;
    data[4*(x+i)+(y-rsize)*width*4+3] = 255;
    data[4*(x+i)+(y+rsize)*width*4+0] = 0;
    data[4*(x+i)+(y+rsize)*width*4+1] = 255;
    data[4*(x+i)+(y+rsize)*width*4+2] = 0;
    data[4*(x+i)+(y+rsize)*width*4+3] = 255;

    data[4*(x+rsize)+(y+i)*width*4+0] = 0;
    data[4*(x+rsize)+(y+i)*width*4+1] = 255;
    data[4*(x+rsize)+(y+i)*width*4+2] = 0;
    data[4*(x+rsize)+(y+i)*width*4+3] = 255;
    data[4*(x-rsize)+(y+i)*width*4+0] = 0;
    data[4*(x-rsize)+(y+i)*width*4+1] = 255;
    data[4*(x-rsize)+(y+i)*width*4+2] = 0;
    data[4*(x-rsize)+(y+i)*width*4+3] = 255;
  }
  
}

function getContour()
{
    var strenth = 3;
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

    var linestring = [];

    var fx, fy;

    for(var y=canvas.height-1; y>=0; y--)
      for(var x=canvas.width-1; x>=0; x--)
      {
        res.data[4*x+y*canvas.width*4+3] = 0;
        var label = Module.getValue(mask+x+y*canvas.width, "i8");
        if(label==MaskFG)
        {
          fx = x;
          fy = y;
        }
      }

    linestring.push([fx,fy]);
    console.log(fx, fy);

    var nextx = -1;
    var nexty = -1;
    var curx = fx;
    var cury = fy;
    var lastx = -1;
    var lasty = -1;
    width = canvas.width;
    height = canvas.height;
    var count = 0;

    while(nextx!=fx || nexty!=fy)
    {
      newpoint = nextContourPoint(curx, cury, lastx, lasty, mask, width, height);
      nextx = newpoint[0];
      nexty = newpoint[1];
      if(nextx==-1)
      {

        break;
      }
      lastx = curx;
      lasty = cury;
      curx = nextx;
      cury = nexty;
      linestring.push(newpoint);
      count = count+1;
      console.log(count, newpoint);
    }
    console.log("newpoints:");
    var newpoints = simplifyGeometry(linestring, strenth);
    console.log(newpoints);
    console.log(newpoints.length)

    for(var y=1; y<canvas.height-1; y++)
      for(var x=1; x<canvas.width-1; x++)
      {
        var label0 = Module.getValue(mask+x+y*canvas.width, "i8");
        var labell = Module.getValue(mask+x-1+y*canvas.width, "i8");
        var labelr = Module.getValue(mask+x+1+y*canvas.width, "i8");
        var labelu = Module.getValue(mask+x+(y-1)*canvas.width, "i8");
        var labeld = Module.getValue(mask+x+(y+1)*canvas.width, "i8");

        if(label0!=labell || label0!=labelr || label0!=labelu || label0!=labeld)
        {
          res.data[4*x+y*canvas.width*4+0] = 255;
          res.data[4*x+y*canvas.width*4+1] = 0;
          res.data[4*x+y*canvas.width*4+2] = 0;
          res.data[4*x+y*canvas.width*4+3] = 255;
        }
          
      }
    
    var length = newpoints.length;
    for(var i=0; i<length; i++)
    {
      drawrect(newpoints[i][0], newpoints[i][1], res.data, canvas.width, canvas.height, 3);
    }
    

    ctx2.putImageData(res, 0, 0);
    Module._free(buf);
    Module._free(mask);
}
