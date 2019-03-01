// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module !== 'undefined' ? Module : {};

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
// {{PRE_JSES}}

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
var key;
for (key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

Module['arguments'] = [];
Module['thisProgram'] = './this.program';
Module['quit'] = function(status, toThrow) {
  throw toThrow;
};
Module['preRun'] = [];
Module['postRun'] = [];

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('Module[\'ENVIRONMENT\'] value is not valid. must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
    var ret;
    ret = tryParseAsDataURI(filename);
    if (!ret) {
      if (!nodeFS) nodeFS = require('fs');
      if (!nodePath) nodePath = require('path');
      filename = nodePath['normalize'](filename);
      ret = nodeFS['readFileSync'](filename);
    }
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  if (process['argv'].length > 1) {
    Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });
  // Currently node will swallow unhandled rejections, but this behavior is
  // deprecated, and in the future it will exit with error status.
  process['on']('unhandledRejection', function(reason, p) {
    Module['printErr']('node.js exiting due to unhandled promise rejection');
    process['exit'](1);
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
} else
if (ENVIRONMENT_IS_SHELL) {
  if (typeof read != 'undefined') {
    Module['read'] = function shell_read(f) {
      var data = tryParseAsDataURI(f);
      if (data) {
        return intArrayToString(data);
      }
      return read(f);
    };
  }

  Module['readBinary'] = function readBinary(f) {
    var data;
    data = tryParseAsDataURI(f);
    if (data) {
      return data;
    }
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status, toThrow) {
      quit(status);
    }
  }
} else
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function shell_read(url) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      return xhr.responseText;
    } catch (err) {
      var data = tryParseAsDataURI(url);
      if (data) {
        return intArrayToString(data);
      }
      throw err;
    }
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function readBinary(url) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        return new Uint8Array(xhr.response);
      } catch (err) {
        var data = tryParseAsDataURI(url);
        if (data) {
          return data;
        }
        throw err;
      }
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
        return;
      }
      var data = tryParseAsDataURI(url);
      if (data) {
        onload(data.buffer);
        return;
      }
      onerror();
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  Module['setWindowTitle'] = function(title) { document.title = title };
} else
{
  throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');
}

// console.log is checked first, as 'print' on the web will open a print dialogue
// printErr is preferable to console.warn (works better in shells)
// bind(console) is necessary to fix IE/Edge closed dev tools panel behavior.
Module['print'] = typeof console !== 'undefined' ? console.log.bind(console) : (typeof print !== 'undefined' ? print : null);
Module['printErr'] = typeof printErr !== 'undefined' ? printErr : ((typeof console !== 'undefined' && console.warn.bind(console)) || Module['print']);

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

var STACK_ALIGN = 16;

// stack management, and other functionality that is provided by the compiled code,
// should not be used before it is ready
stackSave = stackRestore = stackAlloc = setTempRet0 = getTempRet0 = function() {
  abort('cannot use the stack before compiled code is ready to run, and has provided stack access');
};

function staticAlloc(size) {
  assert(!staticSealed);
  var ret = STATICTOP;
  STATICTOP = (STATICTOP + size + 15) & -16;
  return ret;
}

function dynamicAlloc(size) {
  assert(DYNAMICTOP_PTR);
  var ret = HEAP32[DYNAMICTOP_PTR>>2];
  var end = (ret + size + 15) & -16;
  HEAP32[DYNAMICTOP_PTR>>2] = end;
  if (end >= TOTAL_MEMORY) {
    var success = enlargeMemory();
    if (!success) {
      HEAP32[DYNAMICTOP_PTR>>2] = ret;
      return 0;
    }
  }
  return ret;
}

function alignMemory(size, factor) {
  if (!factor) factor = STACK_ALIGN; // stack alignment (16-byte) by default
  var ret = size = Math.ceil(size / factor) * factor;
  return ret;
}

function getNativeTypeSize(type) {
  switch (type) {
    case 'i1': case 'i8': return 1;
    case 'i16': return 2;
    case 'i32': return 4;
    case 'i64': return 8;
    case 'float': return 4;
    case 'double': return 8;
    default: {
      if (type[type.length-1] === '*') {
        return 4; // A pointer
      } else if (type[0] === 'i') {
        var bits = parseInt(type.substr(1));
        assert(bits % 8 === 0);
        return bits / 8;
      } else {
        return 0;
      }
    }
  }
}

function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    Module.printErr(text);
  }
}

var asm2wasmImports = { // special asm2wasm imports
    "f64-rem": function(x, y) {
        return x % y;
    },
    "debugger": function() {
        debugger;
    }
};



var jsCallStartIndex = 1;
var functionPointers = new Array(0);

// 'sig' parameter is only used on LLVM wasm backend
function addFunction(func, sig) {
  if (typeof sig === 'undefined') {
    Module.printErr('warning: addFunction(): You should provide a wasm function signature string as a second argument. This is not necessary for asm.js and asm2wasm, but is required for the LLVM wasm backend, so it is recommended for full portability.');
  }
  var base = 0;
  for (var i = base; i < base + 0; i++) {
    if (!functionPointers[i]) {
      functionPointers[i] = func;
      return jsCallStartIndex + i;
    }
  }
  throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
}

function removeFunction(index) {
  functionPointers[index-jsCallStartIndex] = null;
}

var funcWrappers = {};

function getFuncWrapper(func, sig) {
  if (!func) return; // on null pointer, return undefined
  assert(sig);
  if (!funcWrappers[sig]) {
    funcWrappers[sig] = {};
  }
  var sigCache = funcWrappers[sig];
  if (!sigCache[func]) {
    // optimize away arguments usage in common cases
    if (sig.length === 1) {
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func);
      };
    } else if (sig.length === 2) {
      sigCache[func] = function dynCall_wrapper(arg) {
        return dynCall(sig, func, [arg]);
      };
    } else {
      // general case
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func, Array.prototype.slice.call(arguments));
      };
    }
  }
  return sigCache[func];
}


function makeBigInt(low, high, unsigned) {
  return unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0));
}

function dynCall(sig, ptr, args) {
  if (args && args.length) {
    assert(args.length == sig.length-1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    assert(sig.length == 1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].call(null, ptr);
  }
}


function getCompilerSetting(name) {
  throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for getCompilerSetting or emscripten_get_compiler_setting to work';
}

var Runtime = {
  // FIXME backwards compatibility layer for ports. Support some Runtime.*
  //       for now, fix it there, then remove it from here. That way we
  //       can minimize any period of breakage.
  dynCall: dynCall, // for SDL2 port
  // helpful errors
  getTempRet0: function() { abort('getTempRet0() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  staticAlloc: function() { abort('staticAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  stackAlloc: function() { abort('stackAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
};

// The address globals begin at. Very low in memory, for code size and optimization opportunities.
// Above 0 is static memory, starting with globals.
// Then the stack.
// Then 'dynamic' memory for sbrk.
var GLOBAL_BASE = 8;


// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html



//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

var JSfuncs = {
  // Helpers for cwrap -- it can't refer to Runtime directly because it might
  // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
  // out what the minified function name is.
  'stackSave': function() {
    stackSave()
  },
  'stackRestore': function() {
    stackRestore()
  },
  // type conversion from js to c
  'arrayToC' : function(arr) {
    var ret = stackAlloc(arr.length);
    writeArrayToMemory(arr, ret);
    return ret;
  },
  'stringToC' : function(str) {
    var ret = 0;
    if (str !== null && str !== undefined && str !== 0) { // null string
      // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
      var len = (str.length << 2) + 1;
      ret = stackAlloc(len);
      stringToUTF8(str, ret, len);
    }
    return ret;
  }
};

// For fast lookup of conversion functions
var toC = {
  'string': JSfuncs['stringToC'], 'array': JSfuncs['arrayToC']
};

// C calling interface.
function ccall (ident, returnType, argTypes, args, opts) {
  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== 'array', 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  if (returnType === 'string') ret = Pointer_stringify(ret);
  else if (returnType === 'boolean') ret = Boolean(ret);
  if (stack !== 0) {
    stackRestore(stack);
  }
  return ret;
}

function cwrap (ident, returnType, argTypes) {
  argTypes = argTypes || [];
  var cfunc = getCFunc(ident);
  // When the function takes numbers and returns a number, we can just return
  // the original function
  var numericArgs = argTypes.every(function(type){ return type === 'number'});
  var numericRet = returnType !== 'string';
  if (numericRet && numericArgs) {
    return cfunc;
  }
  return function() {
    return ccall(ident, returnType, argTypes, arguments);
  }
}

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}

/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for getValue: ' + type);
    }
  return null;
}

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : staticAlloc, stackAlloc, staticAlloc, dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var stop;
    ptr = ret;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return staticAlloc(size);
  if (!runtimeInitialized) return dynamicAlloc(size);
  return _malloc(size);
}

/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  if (length === 0 || !ptr) return '';
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return UTF8ToString(ptr);
}

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}

function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}

// Allocate heap space for a JS string, and write it there.
// It is the responsibility of the caller to free() that memory.
function allocateUTF8(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Allocate stack space for a JS string, and write it there.
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

function demangle(func) {
  warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}

// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - stackSave() + allocSize) + ' bytes available!');
}

function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}

if (!Module['reallocBuffer']) Module['reallocBuffer'] = function(size) {
  var ret;
  try {
    if (ArrayBuffer.transfer) {
      ret = ArrayBuffer.transfer(buffer, size);
    } else {
      var oldHEAP8 = HEAP8;
      ret = new ArrayBuffer(size);
      var temp = new Int8Array(ret);
      temp.set(oldHEAP8);
    }
  } catch(e) {
    return false;
  }
  var success = _emscripten_replace_memory(ret);
  if (!success) return false;
  return ret;
};

function enlargeMemory() {
  // TOTAL_MEMORY is the current size of the actual array, and DYNAMICTOP is the new top.
  assert(HEAP32[DYNAMICTOP_PTR>>2] > TOTAL_MEMORY); // This function should only ever be called after the ceiling of the dynamic heap has already been bumped to exceed the current total size of the asm.js heap.


  var PAGE_MULTIPLE = Module["usingWasm"] ? WASM_PAGE_SIZE : ASMJS_PAGE_SIZE; // In wasm, heap size must be a multiple of 64KB. In asm.js, they need to be multiples of 16MB.
  var LIMIT = 2147483648 - PAGE_MULTIPLE; // We can do one page short of 2GB as theoretical maximum.

  if (HEAP32[DYNAMICTOP_PTR>>2] > LIMIT) {
    Module.printErr('Cannot enlarge memory, asked to go up to ' + HEAP32[DYNAMICTOP_PTR>>2] + ' bytes, but the limit is ' + LIMIT + ' bytes!');
    return false;
  }

  var OLD_TOTAL_MEMORY = TOTAL_MEMORY;
  TOTAL_MEMORY = Math.max(TOTAL_MEMORY, MIN_TOTAL_MEMORY); // So the loop below will not be infinite, and minimum asm.js memory size is 16MB.

  while (TOTAL_MEMORY < HEAP32[DYNAMICTOP_PTR>>2]) { // Keep incrementing the heap size as long as it's less than what is requested.
    if (TOTAL_MEMORY <= 536870912) {
      TOTAL_MEMORY = alignUp(2 * TOTAL_MEMORY, PAGE_MULTIPLE); // Simple heuristic: double until 1GB...
    } else {
      // ..., but after that, add smaller increments towards 2GB, which we cannot reach
      TOTAL_MEMORY = Math.min(alignUp((3 * TOTAL_MEMORY + 2147483648) / 4, PAGE_MULTIPLE), LIMIT);
      if (TOTAL_MEMORY === OLD_TOTAL_MEMORY) {
        warnOnce('Cannot ask for more memory since we reached the practical limit in browsers (which is just below 2GB), so the request would have failed. Requesting only ' + TOTAL_MEMORY);
      }
    }
  }

  var start = Date.now();

  var replacement = Module['reallocBuffer'](TOTAL_MEMORY);
  if (!replacement || replacement.byteLength != TOTAL_MEMORY) {
    Module.printErr('Failed to grow the heap from ' + OLD_TOTAL_MEMORY + ' bytes to ' + TOTAL_MEMORY + ' bytes, not enough memory!');
    if (replacement) {
      Module.printErr('Expected to get back a buffer of size ' + TOTAL_MEMORY + ' bytes, but instead got back a buffer of size ' + replacement.byteLength);
    }
    // restore the state to before this call, we failed
    TOTAL_MEMORY = OLD_TOTAL_MEMORY;
    return false;
  }

  // everything worked

  updateGlobalBuffer(replacement);
  updateGlobalBufferViews();

  if (!Module["usingWasm"]) {
    Module.printErr('Warning: Enlarging memory arrays, this is not fast! ' + [OLD_TOTAL_MEMORY, TOTAL_MEMORY]);
  }


  return true;
}

var byteLength;
try {
  byteLength = Function.prototype.call.bind(Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get);
  byteLength(new ArrayBuffer(4)); // can fail on older ie
} catch(e) { // can fail on older node/v8
  byteLength = function(buffer) { return buffer.byteLength; };
}

var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
  Module['buffer'] = buffer;
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the main() is called

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}

assert(Math['imul'] && Math['fround'] && Math['clz32'] && Math['trunc'], 'this is a legacy browser, build with LEGACY_VM_SUPPORT');

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;



// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}





// === Body ===

var ASM_CONSTS = [];





STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 5808;
/* global initializers */  __ATINIT__.push();


memoryInitializer = "data:application/octet-stream;base64,KAMAALgDAAAoAwAAwgMAAFADAADWAwAACAAAAAAAAABQAwAA+QMAABAAAAAAAAAAUAMAAOMDAAAoAAAAAAAAACgDAACYDgAAUAMAAPgOAABgAAAAAAAAAFADAAClDgAAcAAAAAAAAAAoAwAAxg4AAFADAADTDgAAUAAAAAAAAABQAwAA2g8AAEgAAAAAAAAAUAMAAOoPAACIAAAAAAAAAFADAAAfEAAAYAAAAAAAAABQAwAA+w8AAKgAAAAAAAAAAAAAAAgAAAABAAAAAgAAAAAAAAAYAAAAAwAAAAQAAAAAAAAAEAAAAAUAAAAGAAAABwAAAAAAAAA4AAAACAAAAAkAAAAKAAAAAAAAACgAAAALAAAADAAAAA0AAAAoAQAABQAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwAAABAAAACcEgAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAA//////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKgBAAAFAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARAAAAEAAAAKQSAAAABAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAK/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAqAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYBIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASAAAAAAAAAFAAAAATAAAAFAAAABUAAAAWAAAAFwAAABgAAAAZAAAAGgAAAAAAAAB4AAAAEwAAABsAAAAVAAAAFgAAABcAAAAcAAAAHQAAAB4AAAAAAAAAiAAAAB8AAAAgAAAAIQAAAAAAAACYAAAAHwAAACIAAAAhAAAATV8gPT0gMgBEZW5zZUNSRi5jcHAAemVyb0JvcmRlcgA4RGVuc2VDUkYAMTdQYWlyd2lzZVBvdGVudGlhbAAxMERlbnNlQ1JGMkQAMTlTZW1pTWV0cmljUG90ZW50aWFsADE0UG90dHNQb3RlbnRpYWwAYWxsb2NhdG9yPFQ+OjphbGxvY2F0ZShzaXplX3QgbikgJ24nIGV4Y2VlZHMgbWF4aW11bSBzdXBwb3J0ZWQgc2l6ZQBaZXJvIGRldCB2YWx1ZSBvZiAlZHRoIEdNTXMgd2l0aCB3ZWlnaHQgJWcgaW4gJWQ6JXMKAC4vQ21HTU0uaAARAAoAERERAAAAAAUAAAAAAAAJAAAAAAsAAAAAAAAAABEADwoREREDCgcAARMJCwsAAAkGCwAACwAGEQAAABEREQAAAAAAAAAAAAAAAAAAAAALAAAAAAAAAAARAAoKERERAAoAAAIACQsAAAAJAAsAAAsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAADAAAAAAMAAAAAAkMAAAAAAAMAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAA0AAAAEDQAAAAAJDgAAAAAADgAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAPAAAAAA8AAAAACRAAAAAAABAAABAAABIAAAASEhIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEgAAABISEgAAAAAAAAkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsAAAAAAAAAAAAAAAoAAAAACgAAAAAJCwAAAAAACwAACwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAMAAAAAAwAAAAACQwAAAAAAAwAAAwAAC0rICAgMFgweAAobnVsbCkALTBYKzBYIDBYLTB4KzB4IDB4AGluZgBJTkYAbmFuAE5BTgAwMTIzNDU2Nzg5QUJDREVGLgBUISIZDQECAxFLHAwQBAsdEh4naG5vcHFiIAUGDxMUFRoIFgcoJBcYCQoOGx8lI4OCfSYqKzw9Pj9DR0pNWFlaW1xdXl9gYWNkZWZnaWprbHJzdHl6e3wASWxsZWdhbCBieXRlIHNlcXVlbmNlAERvbWFpbiBlcnJvcgBSZXN1bHQgbm90IHJlcHJlc2VudGFibGUATm90IGEgdHR5AFBlcm1pc3Npb24gZGVuaWVkAE9wZXJhdGlvbiBub3QgcGVybWl0dGVkAE5vIHN1Y2ggZmlsZSBvciBkaXJlY3RvcnkATm8gc3VjaCBwcm9jZXNzAEZpbGUgZXhpc3RzAFZhbHVlIHRvbyBsYXJnZSBmb3IgZGF0YSB0eXBlAE5vIHNwYWNlIGxlZnQgb24gZGV2aWNlAE91dCBvZiBtZW1vcnkAUmVzb3VyY2UgYnVzeQBJbnRlcnJ1cHRlZCBzeXN0ZW0gY2FsbABSZXNvdXJjZSB0ZW1wb3JhcmlseSB1bmF2YWlsYWJsZQBJbnZhbGlkIHNlZWsAQ3Jvc3MtZGV2aWNlIGxpbmsAUmVhZC1vbmx5IGZpbGUgc3lzdGVtAERpcmVjdG9yeSBub3QgZW1wdHkAQ29ubmVjdGlvbiByZXNldCBieSBwZWVyAE9wZXJhdGlvbiB0aW1lZCBvdXQAQ29ubmVjdGlvbiByZWZ1c2VkAEhvc3QgaXMgZG93bgBIb3N0IGlzIHVucmVhY2hhYmxlAEFkZHJlc3MgaW4gdXNlAEJyb2tlbiBwaXBlAEkvTyBlcnJvcgBObyBzdWNoIGRldmljZSBvciBhZGRyZXNzAEJsb2NrIGRldmljZSByZXF1aXJlZABObyBzdWNoIGRldmljZQBOb3QgYSBkaXJlY3RvcnkASXMgYSBkaXJlY3RvcnkAVGV4dCBmaWxlIGJ1c3kARXhlYyBmb3JtYXQgZXJyb3IASW52YWxpZCBhcmd1bWVudABBcmd1bWVudCBsaXN0IHRvbyBsb25nAFN5bWJvbGljIGxpbmsgbG9vcABGaWxlbmFtZSB0b28gbG9uZwBUb28gbWFueSBvcGVuIGZpbGVzIGluIHN5c3RlbQBObyBmaWxlIGRlc2NyaXB0b3JzIGF2YWlsYWJsZQBCYWQgZmlsZSBkZXNjcmlwdG9yAE5vIGNoaWxkIHByb2Nlc3MAQmFkIGFkZHJlc3MARmlsZSB0b28gbGFyZ2UAVG9vIG1hbnkgbGlua3MATm8gbG9ja3MgYXZhaWxhYmxlAFJlc291cmNlIGRlYWRsb2NrIHdvdWxkIG9jY3VyAFN0YXRlIG5vdCByZWNvdmVyYWJsZQBQcmV2aW91cyBvd25lciBkaWVkAE9wZXJhdGlvbiBjYW5jZWxlZABGdW5jdGlvbiBub3QgaW1wbGVtZW50ZWQATm8gbWVzc2FnZSBvZiBkZXNpcmVkIHR5cGUASWRlbnRpZmllciByZW1vdmVkAERldmljZSBub3QgYSBzdHJlYW0ATm8gZGF0YSBhdmFpbGFibGUARGV2aWNlIHRpbWVvdXQAT3V0IG9mIHN0cmVhbXMgcmVzb3VyY2VzAExpbmsgaGFzIGJlZW4gc2V2ZXJlZABQcm90b2NvbCBlcnJvcgBCYWQgbWVzc2FnZQBGaWxlIGRlc2NyaXB0b3IgaW4gYmFkIHN0YXRlAE5vdCBhIHNvY2tldABEZXN0aW5hdGlvbiBhZGRyZXNzIHJlcXVpcmVkAE1lc3NhZ2UgdG9vIGxhcmdlAFByb3RvY29sIHdyb25nIHR5cGUgZm9yIHNvY2tldABQcm90b2NvbCBub3QgYXZhaWxhYmxlAFByb3RvY29sIG5vdCBzdXBwb3J0ZWQAU29ja2V0IHR5cGUgbm90IHN1cHBvcnRlZABOb3Qgc3VwcG9ydGVkAFByb3RvY29sIGZhbWlseSBub3Qgc3VwcG9ydGVkAEFkZHJlc3MgZmFtaWx5IG5vdCBzdXBwb3J0ZWQgYnkgcHJvdG9jb2wAQWRkcmVzcyBub3QgYXZhaWxhYmxlAE5ldHdvcmsgaXMgZG93bgBOZXR3b3JrIHVucmVhY2hhYmxlAENvbm5lY3Rpb24gcmVzZXQgYnkgbmV0d29yawBDb25uZWN0aW9uIGFib3J0ZWQATm8gYnVmZmVyIHNwYWNlIGF2YWlsYWJsZQBTb2NrZXQgaXMgY29ubmVjdGVkAFNvY2tldCBub3QgY29ubmVjdGVkAENhbm5vdCBzZW5kIGFmdGVyIHNvY2tldCBzaHV0ZG93bgBPcGVyYXRpb24gYWxyZWFkeSBpbiBwcm9ncmVzcwBPcGVyYXRpb24gaW4gcHJvZ3Jlc3MAU3RhbGUgZmlsZSBoYW5kbGUAUmVtb3RlIEkvTyBlcnJvcgBRdW90YSBleGNlZWRlZABObyBtZWRpdW0gZm91bmQAV3JvbmcgbWVkaXVtIHR5cGUATm8gZXJyb3IgaW5mb3JtYXRpb24AAHRlcm1pbmF0aW5nIHdpdGggJXMgZXhjZXB0aW9uIG9mIHR5cGUgJXM6ICVzAHRlcm1pbmF0aW5nIHdpdGggJXMgZXhjZXB0aW9uIG9mIHR5cGUgJXMAdGVybWluYXRpbmcgd2l0aCAlcyBmb3JlaWduIGV4Y2VwdGlvbgB0ZXJtaW5hdGluZwB1bmNhdWdodABTdDlleGNlcHRpb24ATjEwX19jeHhhYml2MTE2X19zaGltX3R5cGVfaW5mb0UAU3Q5dHlwZV9pbmZvAE4xMF9fY3h4YWJpdjEyMF9fc2lfY2xhc3NfdHlwZV9pbmZvRQBOMTBfX2N4eGFiaXYxMTdfX2NsYXNzX3R5cGVfaW5mb0UAcHRocmVhZF9vbmNlIGZhaWx1cmUgaW4gX19jeGFfZ2V0X2dsb2JhbHNfZmFzdCgpAGNhbm5vdCBjcmVhdGUgcHRocmVhZCBrZXkgZm9yIF9fY3hhX2dldF9nbG9iYWxzKCkAY2Fubm90IHplcm8gb3V0IHRocmVhZCB2YWx1ZSBmb3IgX19jeGFfZ2V0X2dsb2JhbHMoKQB0ZXJtaW5hdGVfaGFuZGxlciB1bmV4cGVjdGVkbHkgcmV0dXJuZWQAU3QxMWxvZ2ljX2Vycm9yAFN0MTJsZW5ndGhfZXJyb3IATjEwX19jeHhhYml2MTE5X19wb2ludGVyX3R5cGVfaW5mb0UATjEwX19jeHhhYml2MTE3X19wYmFzZV90eXBlX2luZm9F";





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  function ___assert_fail(condition, filename, line, func) {
      abort('Assertion failed: ' + Pointer_stringify(condition) + ', at: ' + [filename ? Pointer_stringify(filename) : 'unknown filename', line, func ? Pointer_stringify(func) : 'unknown function']);
    }

  function ___cxa_allocate_exception(size) {
      return _malloc(size);
    }

  
  function __ZSt18uncaught_exceptionv() { // std::uncaught_exception()
      return !!__ZSt18uncaught_exceptionv.uncaught_exception;
    }
  
  var EXCEPTIONS={last:0,caught:[],infos:{},deAdjust:function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var key in EXCEPTIONS.infos) {
          var ptr = +key; // the iteration key is a string, and if we throw this, it must be an integer as that is what we look for
          var info = EXCEPTIONS.infos[ptr];
          if (info.adjusted === adjusted) {
            return ptr;
          }
        }
        return adjusted;
      },addRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
      },decRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        // A rethrown exception can reach refcount 0; it must not be discarded
        // Its next handler will clear the rethrown flag and addRef it, prior to
        // final decRef and destruction here
        if (info.refcount === 0 && !info.rethrown) {
          if (info.destructor) {
            Module['dynCall_vi'](info.destructor, ptr);
          }
          delete EXCEPTIONS.infos[ptr];
          ___cxa_free_exception(ptr);
        }
      },clearRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
      }};function ___cxa_begin_catch(ptr) {
      var info = EXCEPTIONS.infos[ptr];
      if (info && !info.caught) {
        info.caught = true;
        __ZSt18uncaught_exceptionv.uncaught_exception--;
      }
      if (info) info.rethrown = false;
      EXCEPTIONS.caught.push(ptr);
      EXCEPTIONS.addRef(EXCEPTIONS.deAdjust(ptr));
      return ptr;
    }

  function ___cxa_pure_virtual() {
      ABORT = true;
      throw 'Pure virtual function called!';
    }

  
  
  function ___resumeException(ptr) {
      if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr; }
      throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch.";
    }function ___cxa_find_matching_catch() {
      var thrown = EXCEPTIONS.last;
      if (!thrown) {
        // just pass through the null ptr
        return ((setTempRet0(0),0)|0);
      }
      var info = EXCEPTIONS.infos[thrown];
      var throwntype = info.type;
      if (!throwntype) {
        // just pass through the thrown ptr
        return ((setTempRet0(0),thrown)|0);
      }
      var typeArray = Array.prototype.slice.call(arguments);
  
      var pointer = Module['___cxa_is_pointer_type'](throwntype);
      // can_catch receives a **, add indirection
      if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
      HEAP32[((___cxa_find_matching_catch.buffer)>>2)]=thrown;
      thrown = ___cxa_find_matching_catch.buffer;
      // The different catch blocks are denoted by different types.
      // Due to inheritance, those types may not precisely match the
      // type of the thrown object. Find one which matches, and
      // return the type of the catch block which should be called.
      for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
          thrown = HEAP32[((thrown)>>2)]; // undo indirection
          info.adjusted = thrown;
          return ((setTempRet0(typeArray[i]),thrown)|0);
        }
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      thrown = HEAP32[((thrown)>>2)]; // undo indirection
      return ((setTempRet0(throwntype),thrown)|0);
    }function ___cxa_throw(ptr, type, destructor) {
      EXCEPTIONS.infos[ptr] = {
        ptr: ptr,
        adjusted: ptr,
        type: type,
        destructor: destructor,
        refcount: 0,
        caught: false,
        rethrown: false
      };
      EXCEPTIONS.last = ptr;
      if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1;
      } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++;
      }
      throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch.";
    }

  function ___gxx_personality_v0() {
    }

  function ___lock() {}

  
    

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      // NOTE: offset_high is unused - Emscripten's off_t is 32-bit
      var offset = offset_low;
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  function flush_NO_FILESYSTEM() {
      // flush anything remaining in the buffers during shutdown
      var fflush = Module["_fflush"];
      if (fflush) fflush(0);
      var printChar = ___syscall146.printChar;
      if (!printChar) return;
      var buffers = ___syscall146.buffers;
      if (buffers[1].length) printChar(1, 10);
      if (buffers[2].length) printChar(2, 10);
    }function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffers) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  
   
  
   
  
     

  function ___unlock() {}

  function _abort() {
      Module['abort']();
    }

   

   



   

  var _llvm_ceil_f64=Math_ceil;

  var _llvm_exp_f64=Math_exp;

  var _llvm_floor_f32=Math_floor;

  var _llvm_pow_f32=Math_pow;

  var _llvm_sqrt_f32=Math_sqrt;

  var _llvm_sqrt_f64=Math_sqrt;

  function _llvm_trap() {
      abort('trap!');
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

   

  
  var PTHREAD_SPECIFIC={};function _pthread_getspecific(key) {
      return PTHREAD_SPECIFIC[key] || 0;
    }

  
  var PTHREAD_SPECIFIC_NEXT_KEY=1;
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};function _pthread_key_create(key, destructor) {
      if (key == 0) {
        return ERRNO_CODES.EINVAL;
      }
      HEAP32[((key)>>2)]=PTHREAD_SPECIFIC_NEXT_KEY;
      // values start at 0
      PTHREAD_SPECIFIC[PTHREAD_SPECIFIC_NEXT_KEY] = 0;
      PTHREAD_SPECIFIC_NEXT_KEY++;
      return 0;
    }

  function _pthread_once(ptr, func) {
      if (!_pthread_once.seen) _pthread_once.seen = {};
      if (ptr in _pthread_once.seen) return;
      Module['dynCall_v'](func);
      _pthread_once.seen[ptr] = 1;
    }

  function _pthread_setspecific(key, value) {
      if (!(key in PTHREAD_SPECIFIC)) {
        return ERRNO_CODES.EINVAL;
      }
      PTHREAD_SPECIFIC[key] = value;
      return 0;
    }

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    } 
DYNAMICTOP_PTR = staticAlloc(4);

STACK_BASE = STACKTOP = alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

var ASSERTIONS = true;

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}


// Copied from https://github.com/strophe/strophejs/blob/e06d027/src/polyfills.js#L149

// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

/**
 * Decodes a base64 string.
 * @param {String} input The string to decode.
 */
var decodeBase64 = typeof atob === 'function' ? atob : function (input) {
  var keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  var output = '';
  var chr1, chr2, chr3;
  var enc1, enc2, enc3, enc4;
  var i = 0;
  // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
  input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
  do {
    enc1 = keyStr.indexOf(input.charAt(i++));
    enc2 = keyStr.indexOf(input.charAt(i++));
    enc3 = keyStr.indexOf(input.charAt(i++));
    enc4 = keyStr.indexOf(input.charAt(i++));

    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;

    output = output + String.fromCharCode(chr1);

    if (enc3 !== 64) {
      output = output + String.fromCharCode(chr2);
    }
    if (enc4 !== 64) {
      output = output + String.fromCharCode(chr3);
    }
  } while (i < input.length);
  return output;
};

// Converts a string of base64 into a byte array.
// Throws error on invalid input.
function intArrayFromBase64(s) {
  if (typeof ENVIRONMENT_IS_NODE === 'boolean' && ENVIRONMENT_IS_NODE) {
    var buf;
    try {
      buf = Buffer.from(s, 'base64');
    } catch (_) {
      buf = new Buffer(s, 'base64');
    }
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  try {
    var decoded = decodeBase64(s);
    var bytes = new Uint8Array(decoded.length);
    for (var i = 0 ; i < decoded.length ; ++i) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return bytes;
  } catch (_) {
    throw new Error('Converting base64 string to bytes failed.');
  }
}

// If filename is a base64 data URI, parses and returns data (Buffer on node,
// Uint8Array otherwise). If filename is not a base64 data URI, returns undefined.
function tryParseAsDataURI(filename) {
  if (!isDataURI(filename)) {
    return;
  }

  return intArrayFromBase64(filename.slice(dataURIPrefix.length));
}



function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity, "byteLength": byteLength };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___assert_fail": ___assert_fail, "___cxa_allocate_exception": ___cxa_allocate_exception, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___cxa_pure_virtual": ___cxa_pure_virtual, "___cxa_throw": ___cxa_throw, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "_abort": _abort, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_llvm_ceil_f64": _llvm_ceil_f64, "_llvm_exp_f64": _llvm_exp_f64, "_llvm_floor_f32": _llvm_floor_f32, "_llvm_pow_f32": _llvm_pow_f32, "_llvm_sqrt_f32": _llvm_sqrt_f32, "_llvm_sqrt_f64": _llvm_sqrt_f64, "_llvm_trap": _llvm_trap, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX };
// EMSCRIPTEN_START_ASM
var asm = (/** @suppress {uselessCode} */ function(global, env, buffer) {
'almost asm';


  var Int8View = global.Int8Array;
  var HEAP8 = new Int8View(buffer);
  var Int16View = global.Int16Array;
  var HEAP16 = new Int16View(buffer);
  var Int32View = global.Int32Array;
  var HEAP32 = new Int32View(buffer);
  var Uint8View = global.Uint8Array;
  var HEAPU8 = new Uint8View(buffer);
  var Uint16View = global.Uint16Array;
  var HEAPU16 = new Uint16View(buffer);
  var Uint32View = global.Uint32Array;
  var HEAPU32 = new Uint32View(buffer);
  var Float32View = global.Float32Array;
  var HEAPF32 = new Float32View(buffer);
  var Float64View = global.Float64Array;
  var HEAPF64 = new Float64View(buffer);
  var byteLength = global.byteLength;

  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntS = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var abortStackOverflow=env.abortStackOverflow;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_viiii=env.nullFunc_viiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var invoke_ii=env.invoke_ii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_v=env.invoke_v;
  var invoke_vi=env.invoke_vi;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var ___assert_fail=env.___assert_fail;
  var ___cxa_allocate_exception=env.___cxa_allocate_exception;
  var ___cxa_begin_catch=env.___cxa_begin_catch;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var ___cxa_pure_virtual=env.___cxa_pure_virtual;
  var ___cxa_throw=env.___cxa_throw;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var ___lock=env.___lock;
  var ___resumeException=env.___resumeException;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var ___unlock=env.___unlock;
  var _abort=env._abort;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _llvm_ceil_f64=env._llvm_ceil_f64;
  var _llvm_exp_f64=env._llvm_exp_f64;
  var _llvm_floor_f32=env._llvm_floor_f32;
  var _llvm_pow_f32=env._llvm_pow_f32;
  var _llvm_sqrt_f32=env._llvm_sqrt_f32;
  var _llvm_sqrt_f64=env._llvm_sqrt_f64;
  var _llvm_trap=env._llvm_trap;
  var _pthread_getspecific=env._pthread_getspecific;
  var _pthread_key_create=env._pthread_key_create;
  var _pthread_once=env._pthread_once;
  var _pthread_setspecific=env._pthread_setspecific;
  var flush_NO_FILESYSTEM=env.flush_NO_FILESYSTEM;
  var tempFloat = 0.0;

function _emscripten_replace_memory(newBuffer) {
  if ((byteLength(newBuffer) & 0xffffff || byteLength(newBuffer) <= 0xffffff) || byteLength(newBuffer) > 0x80000000) return false;
  HEAP8 = new Int8View(newBuffer);
  HEAP16 = new Int16View(newBuffer);
  HEAP32 = new Int32View(newBuffer);
  HEAPU8 = new Uint8View(newBuffer);
  HEAPU16 = new Uint16View(newBuffer);
  HEAPU32 = new Uint32View(newBuffer);
  HEAPF32 = new Float32View(newBuffer);
  HEAPF64 = new Float64View(newBuffer);
  buffer = newBuffer;
  return true;
}

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
  if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(size|0);

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function __Z8allocatej($0) {
 $0 = $0|0;
 var $$arith = 0, $$overflow = 0, $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = 0;
 $3 = $1;
 $4 = ($3>>>0)>(0);
 if ($4) {
  $5 = $1;
  $$arith = $5<<2;
  $$overflow = ($5>>>0)>(1073741823);
  $6 = $$overflow ? -1 : $$arith;
  $7 = (__Znaj($6)|0);
  $2 = $7;
 }
 $8 = $2;
 $9 = $1;
 $10 = $9<<2;
 _memset(($8|0),0,($10|0))|0;
 $11 = $2;
 STACKTOP = sp;return ($11|0);
}
function __Z10deallocateRPf($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)!=(0|0);
 if ($4) {
  $5 = $1;
  $6 = HEAP32[$5>>2]|0;
  $7 = ($6|0)==(0|0);
  if (!($7)) {
   __ZdaPv($6);
  }
 }
 $8 = $1;
 HEAP32[$8>>2] = 0;
 STACKTOP = sp;return;
}
function __ZN17PairwisePotentialD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return;
}
function __ZN17PairwisePotentialD0Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 _llvm_trap();
 // unreachable;
}
function __ZN8DenseCRFC2Eii($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $5 = sp + 44|0;
 $10 = sp + 24|0;
 $14 = $0;
 $15 = $1;
 $16 = $2;
 $17 = $14;
 HEAP32[$17>>2] = (208);
 $18 = ((($17)) + 4|0);
 $19 = $15;
 HEAP32[$18>>2] = $19;
 $20 = ((($17)) + 8|0);
 $21 = $16;
 HEAP32[$20>>2] = $21;
 $22 = ((($17)) + 32|0);
 $13 = $22;
 $23 = $13;
 $12 = $23;
 $24 = $12;
 $11 = $24;
 HEAP32[$24>>2] = 0;
 $25 = ((($24)) + 4|0);
 HEAP32[$25>>2] = 0;
 $26 = ((($24)) + 8|0);
 $9 = $26;
 HEAP32[$10>>2] = 0;
 $27 = $9;
 $8 = $10;
 $28 = $8;
 $29 = HEAP32[$28>>2]|0;
 $4 = $27;
 HEAP32[$5>>2] = $29;
 $30 = $4;
 $3 = $5;
 $31 = $3;
 $32 = HEAP32[$31>>2]|0;
 HEAP32[$30>>2] = $32;
 $7 = $27;
 $33 = $7;
 $6 = $33;
 $34 = ((($17)) + 4|0);
 $35 = HEAP32[$34>>2]|0;
 $36 = ((($17)) + 8|0);
 $37 = HEAP32[$36>>2]|0;
 $38 = Math_imul($35, $37)|0;
 $39 = (__Z8allocatej($38)|0);
 $40 = ((($17)) + 12|0);
 HEAP32[$40>>2] = $39;
 $41 = ((($17)) + 4|0);
 $42 = HEAP32[$41>>2]|0;
 $43 = ((($17)) + 8|0);
 $44 = HEAP32[$43>>2]|0;
 $45 = Math_imul($42, $44)|0;
 $46 = (__Z8allocatej($45)|0);
 $47 = ((($17)) + 16|0);
 HEAP32[$47>>2] = $46;
 $48 = ((($17)) + 4|0);
 $49 = HEAP32[$48>>2]|0;
 $50 = ((($17)) + 8|0);
 $51 = HEAP32[$50>>2]|0;
 $52 = Math_imul($49, $51)|0;
 $53 = (__Z8allocatej($52)|0);
 $54 = ((($17)) + 20|0);
 HEAP32[$54>>2] = $53;
 $55 = ((($17)) + 4|0);
 $56 = HEAP32[$55>>2]|0;
 $57 = ((($17)) + 8|0);
 $58 = HEAP32[$57>>2]|0;
 $59 = Math_imul($56, $58)|0;
 $60 = (__Z8allocatej($59)|0);
 $61 = ((($17)) + 24|0);
 HEAP32[$61>>2] = $60;
 $62 = ((($17)) + 4|0);
 $63 = HEAP32[$62>>2]|0;
 $64 = $63<<1;
 $65 = ((($17)) + 8|0);
 $66 = HEAP32[$65>>2]|0;
 $67 = Math_imul($64, $66)|0;
 $68 = (__Z8allocatej($67)|0);
 $69 = ((($17)) + 28|0);
 HEAP32[$69>>2] = $68;
 $70 = ((($17)) + 16|0);
 $71 = HEAP32[$70>>2]|0;
 $72 = ((($17)) + 4|0);
 $73 = HEAP32[$72>>2]|0;
 $74 = $73<<2;
 $75 = ((($17)) + 8|0);
 $76 = HEAP32[$75>>2]|0;
 $77 = Math_imul($74, $76)|0;
 _memset(($71|0),0,($77|0))|0;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIP17PairwisePotentialNS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZNSt3__213__vector_baseIP17PairwisePotentialNS_9allocatorIS2_EEED2Ev($2);
 STACKTOP = sp;return;
}
function ___clang_call_terminate($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 (___cxa_begin_catch(($0|0))|0);
 __ZSt9terminatev();
 // unreachable;
}
function __ZN8DenseCRFD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $6 = $4;
 HEAP32[$6>>2] = (208);
 $7 = ((($6)) + 12|0);
 __Z10deallocateRPf($7);
 $8 = ((($6)) + 16|0);
 __Z10deallocateRPf($8);
 $9 = ((($6)) + 20|0);
 __Z10deallocateRPf($9);
 $10 = ((($6)) + 24|0);
 __Z10deallocateRPf($10);
 $11 = ((($6)) + 28|0);
 __Z10deallocateRPf($11);
 $5 = 0;
 while(1) {
  $12 = $5;
  $13 = ((($6)) + 32|0);
  $3 = $13;
  $14 = $3;
  $15 = ((($14)) + 4|0);
  $16 = HEAP32[$15>>2]|0;
  $17 = HEAP32[$14>>2]|0;
  $18 = $16;
  $19 = $17;
  $20 = (($18) - ($19))|0;
  $21 = (($20|0) / 4)&-1;
  $22 = ($12>>>0)<($21>>>0);
  $23 = ((($6)) + 32|0);
  if (!($22)) {
   break;
  }
  $24 = $5;
  $1 = $23;
  $2 = $24;
  $25 = $1;
  $26 = HEAP32[$25>>2]|0;
  $27 = $2;
  $28 = (($26) + ($27<<2)|0);
  $29 = HEAP32[$28>>2]|0;
  $30 = ($29|0)==(0|0);
  if (!($30)) {
   $31 = HEAP32[$29>>2]|0;
   $32 = ((($31)) + 4|0);
   $33 = HEAP32[$32>>2]|0;
   FUNCTION_TABLE_vi[$33 & 63]($29);
  }
  $34 = $5;
  $35 = (($34) + 1)|0;
  $5 = $35;
 }
 __ZNSt3__26vectorIP17PairwisePotentialNS_9allocatorIS2_EEED2Ev($23);
 STACKTOP = sp;return;
}
function __ZN8DenseCRFD0Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN8DenseCRFD2Ev($2);
 __ZdlPv($2);
 STACKTOP = sp;return;
}
function __ZN10DenseCRF2DC2Eiii($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = $4;
 $9 = $5;
 $10 = $6;
 $11 = Math_imul($9, $10)|0;
 $12 = $7;
 __ZN8DenseCRFC2Eii($8,$11,$12);
 HEAP32[$8>>2] = (224);
 $13 = ((($8)) + 44|0);
 $14 = $5;
 HEAP32[$13>>2] = $14;
 $15 = ((($8)) + 48|0);
 $16 = $6;
 HEAP32[$15>>2] = $16;
 STACKTOP = sp;return;
}
function __ZN10DenseCRF2DD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN8DenseCRFD2Ev($2);
 STACKTOP = sp;return;
}
function __ZN10DenseCRF2DD0Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN10DenseCRF2DD2Ev($2);
 __ZdlPv($2);
 STACKTOP = sp;return;
}
function __ZN8DenseCRF17addPairwiseEnergyEPKfifPK18SemiMetricFunction($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = +$3;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0.0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0.0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 $10 = $5;
 $11 = $9;
 $12 = ($11|0)!=(0|0);
 if ($12) {
  $13 = (__Znwj(44)|0);
  $14 = $6;
  $15 = $7;
  $16 = ((($10)) + 4|0);
  $17 = HEAP32[$16>>2]|0;
  $18 = $8;
  $19 = $9;
  __ZN19SemiMetricPotentialC2EPKfiifPK18SemiMetricFunctionb($13,$14,$15,$17,$18,$19,1);
  __ZN8DenseCRF17addPairwiseEnergyEP17PairwisePotential($10,$13);
  STACKTOP = sp;return;
 } else {
  $20 = (__Znwj(40)|0);
  $21 = $6;
  $22 = $7;
  $23 = ((($10)) + 4|0);
  $24 = HEAP32[$23>>2]|0;
  $25 = $8;
  __ZN14PottsPotentialC2EPKfiifb($20,$21,$22,$24,$25,1);
  __ZN8DenseCRF17addPairwiseEnergyEP17PairwisePotential($10,$20);
  STACKTOP = sp;return;
 }
}
function __ZN8DenseCRF17addPairwiseEnergyEP17PairwisePotential($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $18 = sp + 72|0;
 $20 = sp;
 $19 = $0;
 HEAP32[$20>>2] = $1;
 $21 = $19;
 $22 = ((($21)) + 32|0);
 $16 = $22;
 $17 = $20;
 $23 = $16;
 $24 = ((($23)) + 4|0);
 $25 = HEAP32[$24>>2]|0;
 $15 = $23;
 $26 = $15;
 $27 = ((($26)) + 8|0);
 $14 = $27;
 $28 = $14;
 $13 = $28;
 $29 = $13;
 $30 = HEAP32[$29>>2]|0;
 $31 = ($25|0)!=($30|0);
 if ($31) {
  $10 = $18;
  $11 = $23;
  $12 = 1;
  $4 = $23;
  $32 = $4;
  $33 = ((($32)) + 8|0);
  $3 = $33;
  $34 = $3;
  $2 = $34;
  $35 = $2;
  $36 = ((($23)) + 4|0);
  $37 = HEAP32[$36>>2]|0;
  $5 = $37;
  $38 = $5;
  $39 = $17;
  $6 = $35;
  $7 = $38;
  $8 = $39;
  $40 = $7;
  $41 = $8;
  $42 = HEAP32[$41>>2]|0;
  HEAP32[$40>>2] = $42;
  $9 = $18;
  $43 = ((($23)) + 4|0);
  $44 = HEAP32[$43>>2]|0;
  $45 = ((($44)) + 4|0);
  HEAP32[$43>>2] = $45;
  STACKTOP = sp;return;
 } else {
  $46 = $17;
  __ZNSt3__26vectorIP17PairwisePotentialNS_9allocatorIS2_EEE21__push_back_slow_pathIKS2_EEvRT_($23,$46);
  STACKTOP = sp;return;
 }
}
function __ZN19SemiMetricPotentialC2EPKfiifPK18SemiMetricFunctionb($0,$1,$2,$3,$4,$5,$6) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = +$4;
 $5 = $5|0;
 $6 = $6|0;
 var $10 = 0, $11 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0.0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $7 = $0;
 $8 = $1;
 $9 = $2;
 $10 = $3;
 $11 = $4;
 $12 = $5;
 $14 = $6&1;
 $13 = $14;
 $15 = $7;
 $16 = $8;
 $17 = $9;
 $18 = $10;
 $19 = $11;
 $20 = $13;
 $21 = $20&1;
 __ZN14PottsPotentialC2EPKfiifb($15,$16,$17,$18,$19,$21);
 HEAP32[$15>>2] = (260);
 $22 = ((($15)) + 40|0);
 $23 = $12;
 HEAP32[$22>>2] = $23;
 STACKTOP = sp;return;
}
function __ZN14PottsPotentialC2EPKfiifb($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = +$4;
 $5 = $5|0;
 var $10 = 0.0, $11 = 0, $12 = 0, $13 = 0, $14 = 0.0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0.0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0;
 var $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0.0, $55 = 0.0, $56 = 0.0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0;
 var $69 = 0, $7 = 0, $70 = 0.0, $71 = 0.0, $72 = 0.0, $73 = 0, $74 = 0, $75 = 0, $76 = 0.0, $77 = 0.0, $78 = 0.0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0.0, $83 = 0, $84 = 0, $85 = 0, $86 = 0;
 var $87 = 0, $88 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $6 = $0;
 $7 = $1;
 $8 = $2;
 $9 = $3;
 $10 = $4;
 $17 = $5&1;
 $11 = $17;
 $18 = $6;
 __ZN17PairwisePotentialC2Ev($18);
 HEAP32[$18>>2] = (280);
 $19 = ((($18)) + 4|0);
 __ZN13PermutohedralC2Ev($19);
 $20 = ((($18)) + 28|0);
 $21 = $9;
 HEAP32[$20>>2] = $21;
 $22 = ((($18)) + 32|0);
 $23 = $10;
 HEAPF32[$22>>2] = $23;
 $24 = ((($18)) + 4|0);
 $25 = $7;
 $26 = $8;
 $27 = $9;
 __ZN13Permutohedral4initEPKfii($24,$25,$26,$27);
 $28 = $9;
 $29 = (__Z8allocatej($28)|0);
 $30 = ((($18)) + 36|0);
 HEAP32[$30>>2] = $29;
 $12 = 0;
 while(1) {
  $31 = $12;
  $32 = $9;
  $33 = ($31|0)<($32|0);
  if (!($33)) {
   break;
  }
  $34 = ((($18)) + 36|0);
  $35 = HEAP32[$34>>2]|0;
  $36 = $12;
  $37 = (($35) + ($36<<2)|0);
  HEAPF32[$37>>2] = 1.0;
  $38 = $12;
  $39 = (($38) + 1)|0;
  $12 = $39;
 }
 $40 = ((($18)) + 4|0);
 $41 = ((($18)) + 36|0);
 $42 = HEAP32[$41>>2]|0;
 $43 = ((($18)) + 36|0);
 $44 = HEAP32[$43>>2]|0;
 __ZNK13Permutohedral7computeEPfPKfiiiii($40,$42,$44,1,0,0,-1,-1);
 $45 = $11;
 $46 = $45&1;
 if ($46) {
  $13 = 0;
  while(1) {
   $47 = $13;
   $48 = $9;
   $49 = ($47|0)<($48|0);
   if (!($49)) {
    break;
   }
   $50 = ((($18)) + 36|0);
   $51 = HEAP32[$50>>2]|0;
   $52 = $13;
   $53 = (($51) + ($52<<2)|0);
   $54 = +HEAPF32[$53>>2];
   $55 = $54 + 9.9999996826552254E-21;
   $56 = 1.0 / $55;
   $57 = ((($18)) + 36|0);
   $58 = HEAP32[$57>>2]|0;
   $59 = $13;
   $60 = (($58) + ($59<<2)|0);
   HEAPF32[$60>>2] = $56;
   $61 = $13;
   $62 = (($61) + 1)|0;
   $13 = $62;
  }
  STACKTOP = sp;return;
 }
 $14 = 0.0;
 $15 = 0;
 while(1) {
  $63 = $15;
  $64 = $9;
  $65 = ($63|0)<($64|0);
  if (!($65)) {
   break;
  }
  $66 = ((($18)) + 36|0);
  $67 = HEAP32[$66>>2]|0;
  $68 = $15;
  $69 = (($67) + ($68<<2)|0);
  $70 = +HEAPF32[$69>>2];
  $71 = $14;
  $72 = $71 + $70;
  $14 = $72;
  $73 = $15;
  $74 = (($73) + 1)|0;
  $15 = $74;
 }
 $75 = $9;
 $76 = (+($75|0));
 $77 = $14;
 $78 = $76 / $77;
 $14 = $78;
 $16 = 0;
 while(1) {
  $79 = $16;
  $80 = $9;
  $81 = ($79|0)<($80|0);
  if (!($81)) {
   break;
  }
  $82 = $14;
  $83 = ((($18)) + 36|0);
  $84 = HEAP32[$83>>2]|0;
  $85 = $16;
  $86 = (($84) + ($85<<2)|0);
  HEAPF32[$86>>2] = $82;
  $87 = $16;
  $88 = (($87) + 1)|0;
  $16 = $88;
 }
 STACKTOP = sp;return;
}
function __ZN10DenseCRF2D19addPairwiseGaussianEfffPK18SemiMetricFunction($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = +$1;
 $2 = +$2;
 $3 = +$3;
 $4 = $4|0;
 var $$arith = 0, $$overflow = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0.0, $29 = 0.0, $30 = 0.0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0.0, $43 = 0.0, $44 = 0.0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0.0, $60 = 0.0, $61 = 0, $62 = 0, $63 = 0, $7 = 0.0, $8 = 0.0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 $13 = $5;
 $14 = ((($13)) + 4|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = $15<<1;
 $$arith = $16<<2;
 $$overflow = ($16>>>0)>(1073741823);
 $17 = $$overflow ? -1 : $$arith;
 $18 = (__Znaj($17)|0);
 $10 = $18;
 $11 = 0;
 while(1) {
  $19 = $11;
  $20 = ((($13)) + 48|0);
  $21 = HEAP32[$20>>2]|0;
  $22 = ($19|0)<($21|0);
  if (!($22)) {
   break;
  }
  $12 = 0;
  while(1) {
   $23 = $12;
   $24 = ((($13)) + 44|0);
   $25 = HEAP32[$24>>2]|0;
   $26 = ($23|0)<($25|0);
   if (!($26)) {
    break;
   }
   $27 = $12;
   $28 = (+($27|0));
   $29 = $6;
   $30 = $28 / $29;
   $31 = $10;
   $32 = $11;
   $33 = ((($13)) + 44|0);
   $34 = HEAP32[$33>>2]|0;
   $35 = Math_imul($32, $34)|0;
   $36 = $12;
   $37 = (($35) + ($36))|0;
   $38 = $37<<1;
   $39 = (($38) + 0)|0;
   $40 = (($31) + ($39<<2)|0);
   HEAPF32[$40>>2] = $30;
   $41 = $11;
   $42 = (+($41|0));
   $43 = $7;
   $44 = $42 / $43;
   $45 = $10;
   $46 = $11;
   $47 = ((($13)) + 44|0);
   $48 = HEAP32[$47>>2]|0;
   $49 = Math_imul($46, $48)|0;
   $50 = $12;
   $51 = (($49) + ($50))|0;
   $52 = $51<<1;
   $53 = (($52) + 1)|0;
   $54 = (($45) + ($53<<2)|0);
   HEAPF32[$54>>2] = $44;
   $55 = $12;
   $56 = (($55) + 1)|0;
   $12 = $56;
  }
  $57 = $11;
  $58 = (($57) + 1)|0;
  $11 = $58;
 }
 $59 = $10;
 $60 = $8;
 $61 = $9;
 __ZN8DenseCRF17addPairwiseEnergyEPKfifPK18SemiMetricFunction($13,$59,2,$60,$61);
 $62 = $10;
 $63 = ($62|0)==(0|0);
 if ($63) {
  STACKTOP = sp;return;
 }
 __ZdaPv($62);
 STACKTOP = sp;return;
}
function __ZN10DenseCRF2D20addPairwiseBilateralEfffffPKhfPK18SemiMetricFunction($0,$1,$2,$3,$4,$5,$6,$7,$8) {
 $0 = $0|0;
 $1 = +$1;
 $2 = +$2;
 $3 = +$3;
 $4 = +$4;
 $5 = +$5;
 $6 = $6|0;
 $7 = +$7;
 $8 = $8|0;
 var $$arith = 0, $$overflow = 0, $10 = 0.0, $100 = 0.0, $101 = 0.0, $102 = 0.0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0.0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0.0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0.0, $126 = 0.0, $127 = 0.0, $128 = 0, $129 = 0, $13 = 0.0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0.0, $140 = 0, $141 = 0, $142 = 0, $143 = 0.0, $144 = 0, $145 = 0, $146 = 0, $15 = 0, $16 = 0.0, $17 = 0, $18 = 0, $19 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0.0, $37 = 0.0, $38 = 0.0, $39 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0.0, $51 = 0.0, $52 = 0.0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0.0, $76 = 0.0, $77 = 0.0, $78 = 0, $79 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $9 = $0;
 $10 = $1;
 $11 = $2;
 $12 = $3;
 $13 = $4;
 $14 = $5;
 $15 = $6;
 $16 = $7;
 $17 = $8;
 $21 = $9;
 $22 = ((($21)) + 4|0);
 $23 = HEAP32[$22>>2]|0;
 $24 = ($23*5)|0;
 $$arith = $24<<2;
 $$overflow = ($24>>>0)>(1073741823);
 $25 = $$overflow ? -1 : $$arith;
 $26 = (__Znaj($25)|0);
 $18 = $26;
 $19 = 0;
 while(1) {
  $27 = $19;
  $28 = ((($21)) + 48|0);
  $29 = HEAP32[$28>>2]|0;
  $30 = ($27|0)<($29|0);
  if (!($30)) {
   break;
  }
  $20 = 0;
  while(1) {
   $31 = $20;
   $32 = ((($21)) + 44|0);
   $33 = HEAP32[$32>>2]|0;
   $34 = ($31|0)<($33|0);
   if (!($34)) {
    break;
   }
   $35 = $20;
   $36 = (+($35|0));
   $37 = $10;
   $38 = $36 / $37;
   $39 = $18;
   $40 = $19;
   $41 = ((($21)) + 44|0);
   $42 = HEAP32[$41>>2]|0;
   $43 = Math_imul($40, $42)|0;
   $44 = $20;
   $45 = (($43) + ($44))|0;
   $46 = ($45*5)|0;
   $47 = (($46) + 0)|0;
   $48 = (($39) + ($47<<2)|0);
   HEAPF32[$48>>2] = $38;
   $49 = $19;
   $50 = (+($49|0));
   $51 = $11;
   $52 = $50 / $51;
   $53 = $18;
   $54 = $19;
   $55 = ((($21)) + 44|0);
   $56 = HEAP32[$55>>2]|0;
   $57 = Math_imul($54, $56)|0;
   $58 = $20;
   $59 = (($57) + ($58))|0;
   $60 = ($59*5)|0;
   $61 = (($60) + 1)|0;
   $62 = (($53) + ($61<<2)|0);
   HEAPF32[$62>>2] = $52;
   $63 = $15;
   $64 = $20;
   $65 = $19;
   $66 = ((($21)) + 44|0);
   $67 = HEAP32[$66>>2]|0;
   $68 = Math_imul($65, $67)|0;
   $69 = (($64) + ($68))|0;
   $70 = ($69*3)|0;
   $71 = (($70) + 0)|0;
   $72 = (($63) + ($71)|0);
   $73 = HEAP8[$72>>0]|0;
   $74 = $73&255;
   $75 = (+($74|0));
   $76 = $12;
   $77 = $75 / $76;
   $78 = $18;
   $79 = $19;
   $80 = ((($21)) + 44|0);
   $81 = HEAP32[$80>>2]|0;
   $82 = Math_imul($79, $81)|0;
   $83 = $20;
   $84 = (($82) + ($83))|0;
   $85 = ($84*5)|0;
   $86 = (($85) + 2)|0;
   $87 = (($78) + ($86<<2)|0);
   HEAPF32[$87>>2] = $77;
   $88 = $15;
   $89 = $20;
   $90 = $19;
   $91 = ((($21)) + 44|0);
   $92 = HEAP32[$91>>2]|0;
   $93 = Math_imul($90, $92)|0;
   $94 = (($89) + ($93))|0;
   $95 = ($94*3)|0;
   $96 = (($95) + 1)|0;
   $97 = (($88) + ($96)|0);
   $98 = HEAP8[$97>>0]|0;
   $99 = $98&255;
   $100 = (+($99|0));
   $101 = $13;
   $102 = $100 / $101;
   $103 = $18;
   $104 = $19;
   $105 = ((($21)) + 44|0);
   $106 = HEAP32[$105>>2]|0;
   $107 = Math_imul($104, $106)|0;
   $108 = $20;
   $109 = (($107) + ($108))|0;
   $110 = ($109*5)|0;
   $111 = (($110) + 3)|0;
   $112 = (($103) + ($111<<2)|0);
   HEAPF32[$112>>2] = $102;
   $113 = $15;
   $114 = $20;
   $115 = $19;
   $116 = ((($21)) + 44|0);
   $117 = HEAP32[$116>>2]|0;
   $118 = Math_imul($115, $117)|0;
   $119 = (($114) + ($118))|0;
   $120 = ($119*3)|0;
   $121 = (($120) + 2)|0;
   $122 = (($113) + ($121)|0);
   $123 = HEAP8[$122>>0]|0;
   $124 = $123&255;
   $125 = (+($124|0));
   $126 = $14;
   $127 = $125 / $126;
   $128 = $18;
   $129 = $19;
   $130 = ((($21)) + 44|0);
   $131 = HEAP32[$130>>2]|0;
   $132 = Math_imul($129, $131)|0;
   $133 = $20;
   $134 = (($132) + ($133))|0;
   $135 = ($134*5)|0;
   $136 = (($135) + 4)|0;
   $137 = (($128) + ($136<<2)|0);
   HEAPF32[$137>>2] = $127;
   $138 = $20;
   $139 = (($138) + 1)|0;
   $20 = $139;
  }
  $140 = $19;
  $141 = (($140) + 1)|0;
  $19 = $141;
 }
 $142 = $18;
 $143 = $16;
 $144 = $17;
 __ZN8DenseCRF17addPairwiseEnergyEPKfifPK18SemiMetricFunction($21,$142,5,$143,$144);
 $145 = $18;
 $146 = ($145|0)==(0|0);
 if ($146) {
  STACKTOP = sp;return;
 }
 __ZdaPv($145);
 STACKTOP = sp;return;
}
function __ZN10DenseCRF2D24addPairwiseColorGaussianEfffPKhfPK18SemiMetricFunction($0,$1,$2,$3,$4,$5,$6) {
 $0 = $0|0;
 $1 = +$1;
 $2 = +$2;
 $3 = +$3;
 $4 = $4|0;
 $5 = +$5;
 $6 = $6|0;
 var $$arith = 0, $$overflow = 0, $10 = 0.0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0.0, $112 = 0, $113 = 0, $114 = 0, $12 = 0.0;
 var $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0;
 var $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0.0, $44 = 0.0, $45 = 0.0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0;
 var $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0.0, $69 = 0.0, $7 = 0, $70 = 0.0, $71 = 0;
 var $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0.0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0.0;
 var $90 = 0, $91 = 0, $92 = 0, $93 = 0.0, $94 = 0.0, $95 = 0.0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $7 = $0;
 $8 = $1;
 $9 = $2;
 $10 = $3;
 $11 = $4;
 $12 = $5;
 $13 = $6;
 $17 = $7;
 $18 = ((($17)) + 4|0);
 $19 = HEAP32[$18>>2]|0;
 $20 = ($19*3)|0;
 $$arith = $20<<2;
 $$overflow = ($20>>>0)>(1073741823);
 $21 = $$overflow ? -1 : $$arith;
 $22 = (__Znaj($21)|0);
 $14 = $22;
 $15 = 0;
 while(1) {
  $23 = $15;
  $24 = ((($17)) + 48|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = ($23|0)<($25|0);
  if (!($26)) {
   break;
  }
  $16 = 0;
  while(1) {
   $27 = $16;
   $28 = ((($17)) + 44|0);
   $29 = HEAP32[$28>>2]|0;
   $30 = ($27|0)<($29|0);
   if (!($30)) {
    break;
   }
   $31 = $11;
   $32 = $16;
   $33 = $15;
   $34 = ((($17)) + 44|0);
   $35 = HEAP32[$34>>2]|0;
   $36 = Math_imul($33, $35)|0;
   $37 = (($32) + ($36))|0;
   $38 = ($37*3)|0;
   $39 = (($38) + 0)|0;
   $40 = (($31) + ($39)|0);
   $41 = HEAP8[$40>>0]|0;
   $42 = $41&255;
   $43 = (+($42|0));
   $44 = $8;
   $45 = $43 / $44;
   $46 = $14;
   $47 = $15;
   $48 = ((($17)) + 44|0);
   $49 = HEAP32[$48>>2]|0;
   $50 = Math_imul($47, $49)|0;
   $51 = $16;
   $52 = (($50) + ($51))|0;
   $53 = ($52*3)|0;
   $54 = (($53) + 0)|0;
   $55 = (($46) + ($54<<2)|0);
   HEAPF32[$55>>2] = $45;
   $56 = $11;
   $57 = $16;
   $58 = $15;
   $59 = ((($17)) + 44|0);
   $60 = HEAP32[$59>>2]|0;
   $61 = Math_imul($58, $60)|0;
   $62 = (($57) + ($61))|0;
   $63 = ($62*3)|0;
   $64 = (($63) + 1)|0;
   $65 = (($56) + ($64)|0);
   $66 = HEAP8[$65>>0]|0;
   $67 = $66&255;
   $68 = (+($67|0));
   $69 = $9;
   $70 = $68 / $69;
   $71 = $14;
   $72 = $15;
   $73 = ((($17)) + 44|0);
   $74 = HEAP32[$73>>2]|0;
   $75 = Math_imul($72, $74)|0;
   $76 = $16;
   $77 = (($75) + ($76))|0;
   $78 = ($77*3)|0;
   $79 = (($78) + 1)|0;
   $80 = (($71) + ($79<<2)|0);
   HEAPF32[$80>>2] = $70;
   $81 = $11;
   $82 = $16;
   $83 = $15;
   $84 = ((($17)) + 44|0);
   $85 = HEAP32[$84>>2]|0;
   $86 = Math_imul($83, $85)|0;
   $87 = (($82) + ($86))|0;
   $88 = ($87*3)|0;
   $89 = (($88) + 2)|0;
   $90 = (($81) + ($89)|0);
   $91 = HEAP8[$90>>0]|0;
   $92 = $91&255;
   $93 = (+($92|0));
   $94 = $10;
   $95 = $93 / $94;
   $96 = $14;
   $97 = $15;
   $98 = ((($17)) + 44|0);
   $99 = HEAP32[$98>>2]|0;
   $100 = Math_imul($97, $99)|0;
   $101 = $16;
   $102 = (($100) + ($101))|0;
   $103 = ($102*3)|0;
   $104 = (($103) + 2)|0;
   $105 = (($96) + ($104<<2)|0);
   HEAPF32[$105>>2] = $95;
   $106 = $16;
   $107 = (($106) + 1)|0;
   $16 = $107;
  }
  $108 = $15;
  $109 = (($108) + 1)|0;
  $15 = $109;
 }
 $110 = $14;
 $111 = $12;
 $112 = $13;
 __ZN8DenseCRF17addPairwiseEnergyEPKfifPK18SemiMetricFunction($17,$110,3,$111,$112);
 $113 = $14;
 $114 = ($113|0)==(0|0);
 if ($114) {
  STACKTOP = sp;return;
 }
 __ZdaPv($113);
 STACKTOP = sp;return;
}
function __ZN8DenseCRF14setUnaryEnergyEPKf($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $3;
 $8 = ((($4)) + 4|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = ((($4)) + 8|0);
 $11 = HEAP32[$10>>2]|0;
 $12 = Math_imul($9, $11)|0;
 $13 = $12<<2;
 _memcpy(($6|0),($7|0),($13|0))|0;
 STACKTOP = sp;return;
}
function __ZN10DenseCRF2D10zeroBorderEd($0,$1) {
 $0 = $0|0;
 $1 = +$1;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0.0, $14 = 0.0, $15 = 0.0, $16 = 0.0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0.0, $21 = 0.0, $22 = 0.0, $23 = 0.0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0.0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $2 = $0;
 $3 = $1;
 $10 = $2;
 $11 = ((($10)) + 44|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = (+($12|0));
 $14 = $3;
 $15 = $13 * $14;
 $16 = (+Math_ceil((+$15)));
 $17 = (~~(($16)));
 $4 = $17;
 $18 = ((($10)) + 48|0);
 $19 = HEAP32[$18>>2]|0;
 $20 = (+($19|0));
 $21 = $3;
 $22 = $20 * $21;
 $23 = (+Math_ceil((+$22)));
 $24 = (~~(($23)));
 $5 = $24;
 $25 = ((($10)) + 8|0);
 $26 = HEAP32[$25>>2]|0;
 $27 = ($26|0)==(2);
 if (!($27)) {
  ___assert_fail((920|0),(928|0),208,(941|0));
  // unreachable;
 }
 $6 = 0;
 while(1) {
  $28 = $6;
  $29 = $5;
  $30 = ($28|0)<($29|0);
  if (!($30)) {
   break;
  }
  $31 = ((($10)) + 12|0);
  $32 = HEAP32[$31>>2]|0;
  $33 = ((($10)) + 44|0);
  $34 = HEAP32[$33>>2]|0;
  $35 = $34<<1;
  $36 = $6;
  $37 = Math_imul($35, $36)|0;
  $38 = (($32) + ($37<<2)|0);
  $7 = $38;
  $39 = ((($10)) + 12|0);
  $40 = HEAP32[$39>>2]|0;
  $41 = ((($10)) + 44|0);
  $42 = HEAP32[$41>>2]|0;
  $43 = $42<<1;
  $44 = ((($10)) + 48|0);
  $45 = HEAP32[$44>>2]|0;
  $46 = (($45) - 1)|0;
  $47 = $6;
  $48 = (($46) - ($47))|0;
  $49 = Math_imul($43, $48)|0;
  $50 = (($40) + ($49<<2)|0);
  $8 = $50;
  $9 = 0;
  while(1) {
   $51 = $9;
   $52 = ((($10)) + 44|0);
   $53 = HEAP32[$52>>2]|0;
   $54 = ($51|0)<($53|0);
   if (!($54)) {
    break;
   }
   $55 = $7;
   HEAPF32[$55>>2] = 0.0;
   $56 = $7;
   $57 = ((($56)) + 4|0);
   HEAPF32[$57>>2] = 1.0;
   $58 = $8;
   HEAPF32[$58>>2] = 0.0;
   $59 = $8;
   $60 = ((($59)) + 4|0);
   HEAPF32[$60>>2] = 1.0;
   $61 = $9;
   $62 = (($61) + 2)|0;
   $9 = $62;
  }
  $63 = $6;
  $64 = (($63) + 1)|0;
  $6 = $64;
 }
 STACKTOP = sp;return;
}
function __ZN10DenseCRF2D9binarySegEif($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = +$2;
 var $10 = 0, $11 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $3 = 0, $4 = 0, $5 = 0.0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $3;
 __ZN8DenseCRF14startInferenceEv($7);
 $6 = 0;
 while(1) {
  $8 = $6;
  $9 = $4;
  $10 = ($8|0)<($9|0);
  if (!($10)) {
   break;
  }
  __ZN10DenseCRF2D10zeroBorderEd($7,0.001);
  $11 = $5;
  __ZN8DenseCRF13stepInferenceEf($7,$11);
  $12 = $6;
  $13 = (($12) + 1)|0;
  $6 = $13;
 }
 $14 = ((($7)) + 20|0);
 $15 = HEAP32[$14>>2]|0;
 STACKTOP = sp;return ($15|0);
}
function __ZN8DenseCRF14startInferenceEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 20|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($2)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 __ZN8DenseCRF15expAndNormalizeEPfPKfff($2,$4,$6,-1.0,1.0);
 STACKTOP = sp;return;
}
function __ZN8DenseCRF13stepInferenceEf($0,$1) {
 $0 = $0|0;
 $1 = +$1;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0.0, $22 = 0.0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0.0, $28 = 0.0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0.0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0.0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $9 = $5;
 $7 = 0;
 while(1) {
  $10 = $7;
  $11 = ((($9)) + 4|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = ((($9)) + 8|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = Math_imul($12, $14)|0;
  $16 = ($10|0)<($15|0);
  if (!($16)) {
   break;
  }
  $17 = ((($9)) + 12|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = $7;
  $20 = (($18) + ($19<<2)|0);
  $21 = +HEAPF32[$20>>2];
  $22 = - $21;
  $23 = ((($9)) + 16|0);
  $24 = HEAP32[$23>>2]|0;
  $25 = $7;
  $26 = (($24) + ($25<<2)|0);
  $27 = +HEAPF32[$26>>2];
  $28 = $22 - $27;
  $29 = ((($9)) + 24|0);
  $30 = HEAP32[$29>>2]|0;
  $31 = $7;
  $32 = (($30) + ($31<<2)|0);
  HEAPF32[$32>>2] = $28;
  $33 = $7;
  $34 = (($33) + 1)|0;
  $7 = $34;
 }
 $8 = 0;
 while(1) {
  $35 = $8;
  $36 = ((($9)) + 32|0);
  $4 = $36;
  $37 = $4;
  $38 = ((($37)) + 4|0);
  $39 = HEAP32[$38>>2]|0;
  $40 = HEAP32[$37>>2]|0;
  $41 = $39;
  $42 = $40;
  $43 = (($41) - ($42))|0;
  $44 = (($43|0) / 4)&-1;
  $45 = ($35>>>0)<($44>>>0);
  if (!($45)) {
   break;
  }
  $46 = ((($9)) + 32|0);
  $47 = $8;
  $2 = $46;
  $3 = $47;
  $48 = $2;
  $49 = HEAP32[$48>>2]|0;
  $50 = $3;
  $51 = (($49) + ($50<<2)|0);
  $52 = HEAP32[$51>>2]|0;
  $53 = HEAP32[$52>>2]|0;
  $54 = ((($53)) + 8|0);
  $55 = HEAP32[$54>>2]|0;
  $56 = ((($9)) + 24|0);
  $57 = HEAP32[$56>>2]|0;
  $58 = ((($9)) + 20|0);
  $59 = HEAP32[$58>>2]|0;
  $60 = ((($9)) + 28|0);
  $61 = HEAP32[$60>>2]|0;
  $62 = ((($9)) + 8|0);
  $63 = HEAP32[$62>>2]|0;
  FUNCTION_TABLE_viiiii[$55 & 31]($52,$57,$59,$61,$63);
  $64 = $8;
  $65 = (($64) + 1)|0;
  $8 = $65;
 }
 $66 = ((($9)) + 20|0);
 $67 = HEAP32[$66>>2]|0;
 $68 = ((($9)) + 24|0);
 $69 = HEAP32[$68>>2]|0;
 $70 = $6;
 __ZN8DenseCRF15expAndNormalizeEPfPKfff($9,$67,$69,1.0,$70);
 STACKTOP = sp;return;
}
function __ZN8DenseCRF15expAndNormalizeEPfPKfff($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = +$3;
 $4 = +$4;
 var $$arith = 0, $$overflow = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0.0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0.0, $111 = 0, $112 = 0, $113 = 0, $114 = 0.0, $115 = 0.0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0.0, $12 = 0, $120 = 0.0, $121 = 0.0, $122 = 0, $123 = 0, $124 = 0, $125 = 0.0, $126 = 0.0, $127 = 0.0, $128 = 0, $129 = 0, $13 = 0.0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $14 = 0, $15 = 0.0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0;
 var $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0.0, $36 = 0, $37 = 0.0, $38 = 0.0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0.0, $44 = 0.0, $45 = 0, $46 = 0, $47 = 0, $48 = 0.0, $49 = 0.0, $5 = 0;
 var $50 = 0, $51 = 0.0, $52 = 0, $53 = 0, $54 = 0, $55 = 0.0, $56 = 0.0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0.0, $64 = 0, $65 = 0, $66 = 0, $67 = 0.0, $68 = 0.0;
 var $69 = 0.0, $7 = 0, $70 = 0.0, $71 = 0.0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0.0, $79 = 0.0, $8 = 0.0, $80 = 0.0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0;
 var $87 = 0.0, $88 = 0, $89 = 0, $9 = 0.0, $90 = 0, $91 = 0.0, $92 = 0.0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 $20 = $5;
 $21 = ((($20)) + 8|0);
 $22 = HEAP32[$21>>2]|0;
 $$arith = $22<<2;
 $$overflow = ($22>>>0)>(1073741823);
 $23 = $$overflow ? -1 : $$arith;
 $24 = (__Znaj($23)|0);
 $10 = $24;
 $11 = 0;
 while(1) {
  $25 = $11;
  $26 = ((($20)) + 4|0);
  $27 = HEAP32[$26>>2]|0;
  $28 = ($25|0)<($27|0);
  if (!($28)) {
   break;
  }
  $29 = $7;
  $30 = $11;
  $31 = ((($20)) + 8|0);
  $32 = HEAP32[$31>>2]|0;
  $33 = Math_imul($30, $32)|0;
  $34 = (($29) + ($33<<2)|0);
  $12 = $34;
  $35 = $8;
  $36 = $12;
  $37 = +HEAPF32[$36>>2];
  $38 = $35 * $37;
  $13 = $38;
  $14 = 1;
  while(1) {
   $39 = $14;
   $40 = ((($20)) + 8|0);
   $41 = HEAP32[$40>>2]|0;
   $42 = ($39|0)<($41|0);
   if (!($42)) {
    break;
   }
   $43 = $13;
   $44 = $8;
   $45 = $12;
   $46 = $14;
   $47 = (($45) + ($46<<2)|0);
   $48 = +HEAPF32[$47>>2];
   $49 = $44 * $48;
   $50 = $43 < $49;
   if ($50) {
    $51 = $8;
    $52 = $12;
    $53 = $14;
    $54 = (($52) + ($53<<2)|0);
    $55 = +HEAPF32[$54>>2];
    $56 = $51 * $55;
    $13 = $56;
   }
   $57 = $14;
   $58 = (($57) + 1)|0;
   $14 = $58;
  }
  $15 = 0.0;
  $16 = 0;
  while(1) {
   $59 = $16;
   $60 = ((($20)) + 8|0);
   $61 = HEAP32[$60>>2]|0;
   $62 = ($59|0)<($61|0);
   if (!($62)) {
    break;
   }
   $63 = $8;
   $64 = $12;
   $65 = $16;
   $66 = (($64) + ($65<<2)|0);
   $67 = +HEAPF32[$66>>2];
   $68 = $63 * $67;
   $69 = $13;
   $70 = $68 - $69;
   $71 = (+__Z8fast_expf($70));
   $72 = $10;
   $73 = $16;
   $74 = (($72) + ($73<<2)|0);
   HEAPF32[$74>>2] = $71;
   $75 = $10;
   $76 = $16;
   $77 = (($75) + ($76<<2)|0);
   $78 = +HEAPF32[$77>>2];
   $79 = $15;
   $80 = $79 + $78;
   $15 = $80;
   $81 = $16;
   $82 = (($81) + 1)|0;
   $16 = $82;
  }
  $17 = 0;
  while(1) {
   $83 = $17;
   $84 = ((($20)) + 8|0);
   $85 = HEAP32[$84>>2]|0;
   $86 = ($83|0)<($85|0);
   if (!($86)) {
    break;
   }
   $87 = $15;
   $88 = $10;
   $89 = $17;
   $90 = (($88) + ($89<<2)|0);
   $91 = +HEAPF32[$90>>2];
   $92 = $91 / $87;
   HEAPF32[$90>>2] = $92;
   $93 = $17;
   $94 = (($93) + 1)|0;
   $17 = $94;
  }
  $95 = $6;
  $96 = $11;
  $97 = ((($20)) + 8|0);
  $98 = HEAP32[$97>>2]|0;
  $99 = Math_imul($96, $98)|0;
  $100 = (($95) + ($99<<2)|0);
  $18 = $100;
  $19 = 0;
  while(1) {
   $101 = $19;
   $102 = ((($20)) + 8|0);
   $103 = HEAP32[$102>>2]|0;
   $104 = ($101|0)<($103|0);
   if (!($104)) {
    break;
   }
   $105 = $9;
   $106 = $105 == 1.0;
   if ($106) {
    $107 = $10;
    $108 = $19;
    $109 = (($107) + ($108<<2)|0);
    $110 = +HEAPF32[$109>>2];
    $111 = $18;
    $112 = $19;
    $113 = (($111) + ($112<<2)|0);
    HEAPF32[$113>>2] = $110;
   } else {
    $114 = $9;
    $115 = 1.0 - $114;
    $116 = $18;
    $117 = $19;
    $118 = (($116) + ($117<<2)|0);
    $119 = +HEAPF32[$118>>2];
    $120 = $115 * $119;
    $121 = $9;
    $122 = $10;
    $123 = $19;
    $124 = (($122) + ($123<<2)|0);
    $125 = +HEAPF32[$124>>2];
    $126 = $121 * $125;
    $127 = $120 + $126;
    $128 = $18;
    $129 = $19;
    $130 = (($128) + ($129<<2)|0);
    HEAPF32[$130>>2] = $127;
   }
   $131 = $19;
   $132 = (($131) + 1)|0;
   $19 = $132;
  }
  $133 = $11;
  $134 = (($133) + 1)|0;
  $11 = $134;
 }
 $135 = $10;
 $136 = ($135|0)==(0|0);
 if ($136) {
  STACKTOP = sp;return;
 }
 __ZdaPv($135);
 STACKTOP = sp;return;
}
function __Z8fast_expf($0) {
 $0 = +$0;
 var $1 = 0.0, $10 = 0, $11 = 0.0, $12 = 0.0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $17 = 0.0, $18 = 0.0, $19 = 0.0, $2 = 0.0, $20 = 0, $21 = 0, $22 = 0, $23 = 0.0, $24 = 0.0, $25 = 0.0, $26 = 0.0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0.0, $31 = 0.0, $32 = 0.0, $33 = 0.0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0.0, $39 = 0.0, $4 = 0, $40 = 0.0, $41 = 0, $42 = 0, $43 = 0.0, $44 = 0.0, $45 = 0.0;
 var $5 = 0.0, $6 = 0, $7 = 0.0, $8 = 0.0, $9 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = 1;
 $5 = $2;
 $6 = $5 < 0.0;
 if ($6) {
  $3 = 0;
  $7 = $2;
  $8 = - $7;
  $2 = $8;
 }
 $9 = $2;
 $10 = $9 > 20.0;
 if ($10) {
  $1 = 0.0;
  $45 = $1;
  STACKTOP = sp;return (+$45);
 }
 $4 = 0;
 while(1) {
  $11 = $2;
  $12 = $11;
  $13 = $12 > 5.5199999999999996;
  if (!($13)) {
   break;
  }
  $14 = $4;
  $15 = (($14) + 3)|0;
  $4 = $15;
  $16 = $2;
  $17 = $16 / 8.0;
  $2 = $17;
 }
 while(1) {
  $18 = $2;
  $19 = $18;
  $20 = $19 > 2.7599999999999998;
  if (!($20)) {
   break;
  }
  $21 = $4;
  $22 = (($21) + 2)|0;
  $4 = $22;
  $23 = $2;
  $24 = $23 / 4.0;
  $2 = $24;
 }
 while(1) {
  $25 = $2;
  $26 = $25;
  $27 = $26 > 0.68999999999999995;
  if (!($27)) {
   break;
  }
  $28 = $4;
  $29 = (($28) + 1)|0;
  $4 = $29;
  $30 = $2;
  $31 = $30 / 2.0;
  $2 = $31;
 }
 $32 = $2;
 $33 = (+__Z13very_fast_expf($32));
 $2 = $33;
 while(1) {
  $34 = $4;
  $35 = ($34|0)!=(0);
  if (!($35)) {
   break;
  }
  $36 = $4;
  $37 = (($36) + -1)|0;
  $4 = $37;
  $38 = $2;
  $39 = $2;
  $40 = $38 * $39;
  $2 = $40;
 }
 $41 = $3;
 $42 = $41&1;
 $43 = $2;
 if ($42) {
  $44 = 1.0 / $43;
  $1 = $44;
  $45 = $1;
  STACKTOP = sp;return (+$45);
 } else {
  $1 = $43;
  $45 = $1;
  STACKTOP = sp;return (+$45);
 }
 return +(0.0);
}
function __ZNSt3__213__vector_baseIP17PairwisePotentialNS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $18 = sp;
 $21 = sp + 112|0;
 $29 = $0;
 $30 = $29;
 $31 = HEAP32[$30>>2]|0;
 $32 = ($31|0)!=(0|0);
 if (!($32)) {
  STACKTOP = sp;return;
 }
 $28 = $30;
 $33 = $28;
 $34 = HEAP32[$33>>2]|0;
 $25 = $33;
 $26 = $34;
 $35 = $25;
 $36 = ((($35)) + 4|0);
 $37 = HEAP32[$36>>2]|0;
 $27 = $37;
 while(1) {
  $38 = $26;
  $39 = $27;
  $40 = ($38|0)!=($39|0);
  if (!($40)) {
   break;
  }
  $24 = $35;
  $41 = $24;
  $42 = ((($41)) + 8|0);
  $23 = $42;
  $43 = $23;
  $22 = $43;
  $44 = $22;
  $45 = $27;
  $46 = ((($45)) + -4|0);
  $27 = $46;
  $15 = $46;
  $47 = $15;
  $19 = $44;
  $20 = $47;
  $48 = $19;
  $49 = $20;
  ;HEAP8[$18>>0]=HEAP8[$21>>0]|0;
  $16 = $48;
  $17 = $49;
 }
 $50 = $26;
 $51 = ((($35)) + 4|0);
 HEAP32[$51>>2] = $50;
 $7 = $30;
 $52 = $7;
 $53 = ((($52)) + 8|0);
 $6 = $53;
 $54 = $6;
 $5 = $54;
 $55 = $5;
 $56 = HEAP32[$30>>2]|0;
 $4 = $30;
 $57 = $4;
 $3 = $57;
 $58 = $3;
 $59 = ((($58)) + 8|0);
 $2 = $59;
 $60 = $2;
 $1 = $60;
 $61 = $1;
 $62 = HEAP32[$61>>2]|0;
 $63 = HEAP32[$57>>2]|0;
 $64 = $62;
 $65 = $63;
 $66 = (($64) - ($65))|0;
 $67 = (($66|0) / 4)&-1;
 $12 = $55;
 $13 = $56;
 $14 = $67;
 $68 = $12;
 $69 = $13;
 $70 = $14;
 $9 = $68;
 $10 = $69;
 $11 = $70;
 $71 = $10;
 $8 = $71;
 $72 = $8;
 __ZdlPv($72);
 STACKTOP = sp;return;
}
function __ZN19SemiMetricPotentialD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN14PottsPotentialD2Ev($2);
 STACKTOP = sp;return;
}
function __ZN19SemiMetricPotentialD0Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN19SemiMetricPotentialD2Ev($2);
 __ZdlPv($2);
 STACKTOP = sp;return;
}
function __ZNK19SemiMetricPotential5applyEPfPKfS0_i($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$arith = 0, $$overflow = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0.0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0.0, $55 = 0.0, $56 = 0, $57 = 0, $58 = 0, $59 = 0.0, $6 = 0, $60 = 0.0, $61 = 0, $62 = 0, $63 = 0, $64 = 0.0, $65 = 0.0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 $15 = $5;
 $16 = ((($15)) + 4|0);
 $17 = $8;
 $18 = $7;
 $19 = $9;
 __ZNK13Permutohedral7computeEPfPKfiiiii($16,$17,$18,$19,0,0,-1,-1);
 $20 = $9;
 $$arith = $20<<2;
 $$overflow = ($20>>>0)>(1073741823);
 $21 = $$overflow ? -1 : $$arith;
 $22 = (__Znaj($21)|0);
 $10 = $22;
 $11 = 0;
 while(1) {
  $23 = $11;
  $24 = ((($15)) + 28|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = ($23|0)<($25|0);
  if (!($26)) {
   break;
  }
  $27 = $6;
  $28 = $11;
  $29 = $9;
  $30 = Math_imul($28, $29)|0;
  $31 = (($27) + ($30<<2)|0);
  $12 = $31;
  $32 = $8;
  $33 = $11;
  $34 = $9;
  $35 = Math_imul($33, $34)|0;
  $36 = (($32) + ($35<<2)|0);
  $13 = $36;
  $37 = ((($15)) + 40|0);
  $38 = HEAP32[$37>>2]|0;
  $39 = HEAP32[$38>>2]|0;
  $40 = ((($39)) + 8|0);
  $41 = HEAP32[$40>>2]|0;
  $42 = $10;
  $43 = $13;
  $44 = $9;
  FUNCTION_TABLE_viiii[$41 & 31]($38,$42,$43,$44);
  $14 = 0;
  while(1) {
   $45 = $14;
   $46 = $9;
   $47 = ($45|0)<($46|0);
   if (!($47)) {
    break;
   }
   $48 = ((($15)) + 32|0);
   $49 = +HEAPF32[$48>>2];
   $50 = ((($15)) + 36|0);
   $51 = HEAP32[$50>>2]|0;
   $52 = $11;
   $53 = (($51) + ($52<<2)|0);
   $54 = +HEAPF32[$53>>2];
   $55 = $49 * $54;
   $56 = $10;
   $57 = $14;
   $58 = (($56) + ($57<<2)|0);
   $59 = +HEAPF32[$58>>2];
   $60 = $55 * $59;
   $61 = $12;
   $62 = $14;
   $63 = (($61) + ($62<<2)|0);
   $64 = +HEAPF32[$63>>2];
   $65 = $64 - $60;
   HEAPF32[$63>>2] = $65;
   $66 = $14;
   $67 = (($66) + 1)|0;
   $14 = $67;
  }
  $68 = $11;
  $69 = (($68) + 1)|0;
  $11 = $69;
 }
 $70 = $10;
 $71 = ($70|0)==(0|0);
 if ($71) {
  STACKTOP = sp;return;
 }
 __ZdaPv($70);
 STACKTOP = sp;return;
}
function __ZN17PairwisePotentialC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 HEAP32[$2>>2] = (240);
 STACKTOP = sp;return;
}
function __ZN13PermutohedralC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 HEAP32[$2>>2] = 0;
 $3 = ((($2)) + 4|0);
 HEAP32[$3>>2] = 0;
 $4 = ((($2)) + 8|0);
 HEAP32[$4>>2] = 0;
 $5 = ((($2)) + 12|0);
 HEAP32[$5>>2] = 0;
 $6 = ((($2)) + 16|0);
 HEAP32[$6>>2] = 0;
 $7 = ((($2)) + 20|0);
 HEAP32[$7>>2] = 0;
 STACKTOP = sp;return;
}
function __ZN13Permutohedral4initEPKfii($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$arith = 0, $$arith10 = 0, $$arith14 = 0, $$arith18 = 0, $$arith2 = 0, $$arith22 = 0, $$arith26 = 0, $$arith30 = 0, $$arith34 = 0, $$arith38 = 0, $$arith42 = 0, $$arith6 = 0, $$overflow = 0, $$overflow11 = 0, $$overflow15 = 0, $$overflow19 = 0, $$overflow23 = 0, $$overflow27 = 0, $$overflow3 = 0, $$overflow31 = 0;
 var $$overflow35 = 0, $$overflow39 = 0, $$overflow43 = 0, $$overflow7 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0;
 var $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0;
 var $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0;
 var $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0;
 var $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0.0, $176 = 0, $177 = 0, $178 = 0, $179 = 0.0, $18 = 0, $180 = 0.0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0.0;
 var $187 = 0.0, $188 = 0, $189 = 0.0, $19 = 0.0, $190 = 0.0, $191 = 0.0, $192 = 0.0, $193 = 0.0, $194 = 0.0, $195 = 0.0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0;
 var $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0.0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0;
 var $223 = 0.0, $224 = 0.0, $225 = 0.0, $226 = 0, $227 = 0.0, $228 = 0.0, $229 = 0.0, $23 = 0.0, $230 = 0.0, $231 = 0, $232 = 0, $233 = 0, $234 = 0.0, $235 = 0.0, $236 = 0.0, $237 = 0, $238 = 0, $239 = 0.0, $24 = 0, $240 = 0;
 var $241 = 0, $242 = 0, $243 = 0, $244 = 0.0, $245 = 0.0, $246 = 0, $247 = 0, $248 = 0, $249 = 0.0, $25 = 0.0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0.0, $255 = 0, $256 = 0, $257 = 0, $258 = 0.0, $259 = 0.0;
 var $26 = 0.0, $260 = 0, $261 = 0, $262 = 0.0, $263 = 0.0, $264 = 0.0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0.0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0;
 var $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0.0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0.0, $294 = 0.0, $295 = 0.0;
 var $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0.0, $303 = 0, $304 = 0, $305 = 0, $306 = 0.0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0.0, $311 = 0.0, $312 = 0.0, $313 = 0;
 var $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0.0, $330 = 0, $331 = 0;
 var $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0;
 var $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0.0, $363 = 0, $364 = 0, $365 = 0, $366 = 0.0, $367 = 0.0, $368 = 0;
 var $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0.0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0;
 var $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0.0, $392 = 0, $393 = 0, $394 = 0, $395 = 0.0, $396 = 0.0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0;
 var $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0.0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0.0, $421 = 0.0;
 var $422 = 0.0, $423 = 0.0, $424 = 0.0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0.0, $436 = 0.0, $437 = 0.0, $438 = 0, $439 = 0, $44 = 0;
 var $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0.0, $45 = 0, $450 = 0.0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0.0;
 var $459 = 0.0, $46 = 0, $460 = 0, $461 = 0.0, $462 = 0.0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0.0, $475 = 0, $476 = 0;
 var $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0.0, $491 = 0.0, $492 = 0, $493 = 0, $494 = 0;
 var $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0;
 var $512 = 0.0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0;
 var $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0;
 var $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0;
 var $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0;
 var $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0;
 var $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0;
 var $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0;
 var $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0;
 var $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0;
 var $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0;
 var $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 192|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(192|0);
 $8 = sp + 156|0;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $47 = $4;
 $48 = $7;
 $49 = ((($47)) + 12|0);
 HEAP32[$49>>2] = $48;
 $50 = $6;
 $51 = ((($47)) + 20|0);
 HEAP32[$51>>2] = $50;
 $52 = ((($47)) + 20|0);
 $53 = HEAP32[$52>>2]|0;
 $54 = ((($47)) + 12|0);
 $55 = HEAP32[$54>>2]|0;
 $56 = ((($47)) + 20|0);
 $57 = HEAP32[$56>>2]|0;
 $58 = (($57) + 1)|0;
 $59 = Math_imul($55, $58)|0;
 __ZN9HashTableC2Eii($8,$53,$59);
 $60 = HEAP32[$47>>2]|0;
 $61 = ($60|0)!=(0|0);
 if ($61) {
  $62 = HEAP32[$47>>2]|0;
  $63 = ($62|0)==(0|0);
  if (!($63)) {
   __ZdaPv($62);
  }
 }
 $64 = ((($47)) + 20|0);
 $65 = HEAP32[$64>>2]|0;
 $66 = (($65) + 1)|0;
 $67 = ((($47)) + 12|0);
 $68 = HEAP32[$67>>2]|0;
 $69 = Math_imul($66, $68)|0;
 $$arith42 = $69<<2;
 $$overflow43 = ($69>>>0)>(1073741823);
 $70 = $$overflow43 ? -1 : $$arith42;
 $71 = (__Znaj($70)|0);
 HEAP32[$47>>2] = $71;
 $72 = ((($47)) + 4|0);
 $73 = HEAP32[$72>>2]|0;
 $74 = ($73|0)!=(0|0);
 if ($74) {
  $75 = ((($47)) + 4|0);
  $76 = HEAP32[$75>>2]|0;
  $77 = ($76|0)==(0|0);
  if (!($77)) {
   __ZdaPv($76);
  }
 }
 $78 = ((($47)) + 20|0);
 $79 = HEAP32[$78>>2]|0;
 $80 = (($79) + 1)|0;
 $81 = ((($47)) + 12|0);
 $82 = HEAP32[$81>>2]|0;
 $83 = Math_imul($80, $82)|0;
 $$arith38 = $83<<2;
 $$overflow39 = ($83>>>0)>(1073741823);
 $84 = $$overflow39 ? -1 : $$arith38;
 $85 = (__Znaj($84)|0);
 $86 = ((($47)) + 4|0);
 HEAP32[$86>>2] = $85;
 $87 = ((($47)) + 20|0);
 $88 = HEAP32[$87>>2]|0;
 $$arith34 = $88<<2;
 $$overflow35 = ($88>>>0)>(1073741823);
 $89 = $$overflow35 ? -1 : $$arith34;
 $90 = (__Znaj($89)|0);
 $9 = $90;
 $91 = ((($47)) + 20|0);
 $92 = HEAP32[$91>>2]|0;
 $93 = (($92) + 1)|0;
 $$arith30 = $93<<2;
 $$overflow31 = ($93>>>0)>(1073741823);
 $94 = $$overflow31 ? -1 : $$arith30;
 $95 = (__Znaj($94)|0);
 $10 = $95;
 $96 = ((($47)) + 20|0);
 $97 = HEAP32[$96>>2]|0;
 $98 = (($97) + 1)|0;
 $$arith26 = $98<<2;
 $$overflow27 = ($98>>>0)>(1073741823);
 $99 = $$overflow27 ? -1 : $$arith26;
 $100 = (__Znaj($99)|0);
 $11 = $100;
 $101 = ((($47)) + 20|0);
 $102 = HEAP32[$101>>2]|0;
 $103 = (($102) + 2)|0;
 $$arith22 = $103<<2;
 $$overflow23 = ($103>>>0)>(1073741823);
 $104 = $$overflow23 ? -1 : $$arith22;
 $105 = (__Znaj($104)|0);
 $12 = $105;
 $106 = ((($47)) + 20|0);
 $107 = HEAP32[$106>>2]|0;
 $108 = (($107) + 1)|0;
 $$arith18 = $108<<1;
 $$overflow19 = ($108>>>0)>(2147483647);
 $109 = $$overflow19 ? -1 : $$arith18;
 $110 = (__Znaj($109)|0);
 $13 = $110;
 $111 = ((($47)) + 20|0);
 $112 = HEAP32[$111>>2]|0;
 $113 = (($112) + 1)|0;
 $114 = ((($47)) + 20|0);
 $115 = HEAP32[$114>>2]|0;
 $116 = (($115) + 1)|0;
 $117 = Math_imul($113, $116)|0;
 $$arith14 = $117<<1;
 $$overflow15 = ($117>>>0)>(2147483647);
 $118 = $$overflow15 ? -1 : $$arith14;
 $119 = (__Znaj($118)|0);
 $14 = $119;
 $120 = ((($47)) + 20|0);
 $121 = HEAP32[$120>>2]|0;
 $122 = (($121) + 1)|0;
 $$arith10 = $122<<1;
 $$overflow11 = ($122>>>0)>(2147483647);
 $123 = $$overflow11 ? -1 : $$arith10;
 $124 = (__Znaj($123)|0);
 $15 = $124;
 $16 = 0;
 while(1) {
  $125 = $16;
  $126 = ((($47)) + 20|0);
  $127 = HEAP32[$126>>2]|0;
  $128 = ($125|0)<=($127|0);
  if (!($128)) {
   break;
  }
  $17 = 0;
  while(1) {
   $129 = $17;
   $130 = ((($47)) + 20|0);
   $131 = HEAP32[$130>>2]|0;
   $132 = $16;
   $133 = (($131) - ($132))|0;
   $134 = ($129|0)<=($133|0);
   if (!($134)) {
    break;
   }
   $135 = $16;
   $136 = $135&65535;
   $137 = $14;
   $138 = $16;
   $139 = ((($47)) + 20|0);
   $140 = HEAP32[$139>>2]|0;
   $141 = (($140) + 1)|0;
   $142 = Math_imul($138, $141)|0;
   $143 = $17;
   $144 = (($142) + ($143))|0;
   $145 = (($137) + ($144<<1)|0);
   HEAP16[$145>>1] = $136;
   $146 = $17;
   $147 = (($146) + 1)|0;
   $17 = $147;
  }
  $148 = ((($47)) + 20|0);
  $149 = HEAP32[$148>>2]|0;
  $150 = $16;
  $151 = (($149) - ($150))|0;
  $152 = (($151) + 1)|0;
  $18 = $152;
  while(1) {
   $153 = $18;
   $154 = ((($47)) + 20|0);
   $155 = HEAP32[$154>>2]|0;
   $156 = ($153|0)<=($155|0);
   $157 = $16;
   if (!($156)) {
    break;
   }
   $158 = ((($47)) + 20|0);
   $159 = HEAP32[$158>>2]|0;
   $160 = (($159) + 1)|0;
   $161 = (($157) - ($160))|0;
   $162 = $161&65535;
   $163 = $14;
   $164 = $16;
   $165 = ((($47)) + 20|0);
   $166 = HEAP32[$165>>2]|0;
   $167 = (($166) + 1)|0;
   $168 = Math_imul($164, $167)|0;
   $169 = $18;
   $170 = (($168) + ($169))|0;
   $171 = (($163) + ($170<<1)|0);
   HEAP16[$171>>1] = $162;
   $172 = $18;
   $173 = (($172) + 1)|0;
   $18 = $173;
  }
  $174 = (($157) + 1)|0;
  $16 = $174;
 }
 $175 = (+Math_sqrt(0.66666668653488159));
 $176 = ((($47)) + 20|0);
 $177 = HEAP32[$176>>2]|0;
 $178 = (($177) + 1)|0;
 $179 = (+($178|0));
 $180 = $175 * $179;
 $19 = $180;
 $20 = 0;
 while(1) {
  $181 = $20;
  $182 = ((($47)) + 20|0);
  $183 = HEAP32[$182>>2]|0;
  $184 = ($181|0)<($183|0);
  if (!($184)) {
   break;
  }
  $185 = $20;
  $186 = (+($185|0));
  $187 = $186 + 2.0;
  $188 = $20;
  $189 = (+($188|0));
  $190 = $189 + 1.0;
  $191 = $187 * $190;
  $192 = (+Math_sqrt((+$191)));
  $193 = 1.0 / $192;
  $194 = $19;
  $195 = $193 * $194;
  $196 = $9;
  $197 = $20;
  $198 = (($196) + ($197<<2)|0);
  HEAPF32[$198>>2] = $195;
  $199 = $20;
  $200 = (($199) + 1)|0;
  $20 = $200;
 }
 $21 = 0;
 while(1) {
  $201 = $21;
  $202 = ((($47)) + 12|0);
  $203 = HEAP32[$202>>2]|0;
  $204 = ($201|0)<($203|0);
  if (!($204)) {
   break;
  }
  $205 = $5;
  $206 = $21;
  $207 = $6;
  $208 = Math_imul($206, $207)|0;
  $209 = (($205) + ($208<<2)|0);
  $22 = $209;
  $23 = 0.0;
  $210 = ((($47)) + 20|0);
  $211 = HEAP32[$210>>2]|0;
  $24 = $211;
  while(1) {
   $212 = $24;
   $213 = ($212|0)>(0);
   if (!($213)) {
    break;
   }
   $214 = $22;
   $215 = $24;
   $216 = (($215) - 1)|0;
   $217 = (($214) + ($216<<2)|0);
   $218 = +HEAPF32[$217>>2];
   $219 = $9;
   $220 = $24;
   $221 = (($220) - 1)|0;
   $222 = (($219) + ($221<<2)|0);
   $223 = +HEAPF32[$222>>2];
   $224 = $218 * $223;
   $25 = $224;
   $225 = $23;
   $226 = $24;
   $227 = (+($226|0));
   $228 = $25;
   $229 = $227 * $228;
   $230 = $225 - $229;
   $231 = $10;
   $232 = $24;
   $233 = (($231) + ($232<<2)|0);
   HEAPF32[$233>>2] = $230;
   $234 = $25;
   $235 = $23;
   $236 = $235 + $234;
   $23 = $236;
   $237 = $24;
   $238 = (($237) + -1)|0;
   $24 = $238;
  }
  $239 = $23;
  $240 = $10;
  HEAPF32[$240>>2] = $239;
  $241 = ((($47)) + 20|0);
  $242 = HEAP32[$241>>2]|0;
  $243 = (($242) + 1)|0;
  $244 = (+($243|0));
  $245 = 1.0 / $244;
  $26 = $245;
  $246 = ((($47)) + 20|0);
  $247 = HEAP32[$246>>2]|0;
  $248 = (($247) + 1)|0;
  $249 = (+($248|0));
  $27 = $249;
  $28 = 0;
  $29 = 0;
  while(1) {
   $250 = $29;
   $251 = ((($47)) + 20|0);
   $252 = HEAP32[$251>>2]|0;
   $253 = ($250|0)<=($252|0);
   if (!($253)) {
    break;
   }
   $254 = $26;
   $255 = $10;
   $256 = $29;
   $257 = (($255) + ($256<<2)|0);
   $258 = +HEAPF32[$257>>2];
   $259 = $254 * $258;
   $260 = (__ZL14float2IntRoundf($259)|0);
   $30 = $260;
   $261 = $30;
   $262 = (+($261|0));
   $263 = $27;
   $264 = $262 * $263;
   $265 = $11;
   $266 = $29;
   $267 = (($265) + ($266<<2)|0);
   HEAPF32[$267>>2] = $264;
   $268 = $30;
   $269 = $28;
   $270 = (($269) + ($268))|0;
   $28 = $270;
   $271 = $29;
   $272 = (($271) + 1)|0;
   $29 = $272;
  }
  $31 = 0;
  while(1) {
   $273 = $31;
   $274 = ((($47)) + 20|0);
   $275 = HEAP32[$274>>2]|0;
   $276 = ($273|0)<=($275|0);
   if (!($276)) {
    break;
   }
   $277 = $13;
   $278 = $31;
   $279 = (($277) + ($278<<1)|0);
   HEAP16[$279>>1] = 0;
   $280 = $31;
   $281 = (($280) + 1)|0;
   $31 = $281;
  }
  $32 = 0;
  while(1) {
   $282 = $32;
   $283 = ((($47)) + 20|0);
   $284 = HEAP32[$283>>2]|0;
   $285 = ($282|0)<($284|0);
   if (!($285)) {
    break;
   }
   $286 = $10;
   $287 = $32;
   $288 = (($286) + ($287<<2)|0);
   $289 = +HEAPF32[$288>>2];
   $290 = $11;
   $291 = $32;
   $292 = (($290) + ($291<<2)|0);
   $293 = +HEAPF32[$292>>2];
   $294 = $289 - $293;
   $295 = $294;
   $33 = $295;
   $296 = $32;
   $297 = (($296) + 1)|0;
   $34 = $297;
   while(1) {
    $298 = $34;
    $299 = ((($47)) + 20|0);
    $300 = HEAP32[$299>>2]|0;
    $301 = ($298|0)<=($300|0);
    if (!($301)) {
     break;
    }
    $302 = $33;
    $303 = $10;
    $304 = $34;
    $305 = (($303) + ($304<<2)|0);
    $306 = +HEAPF32[$305>>2];
    $307 = $11;
    $308 = $34;
    $309 = (($307) + ($308<<2)|0);
    $310 = +HEAPF32[$309>>2];
    $311 = $306 - $310;
    $312 = $311;
    $313 = $302 < $312;
    $314 = $13;
    if ($313) {
     $315 = $32;
     $316 = (($314) + ($315<<1)|0);
     $317 = HEAP16[$316>>1]|0;
     $318 = (($317) + 1)<<16>>16;
     HEAP16[$316>>1] = $318;
    } else {
     $319 = $34;
     $320 = (($314) + ($319<<1)|0);
     $321 = HEAP16[$320>>1]|0;
     $322 = (($321) + 1)<<16>>16;
     HEAP16[$320>>1] = $322;
    }
    $323 = $34;
    $324 = (($323) + 1)|0;
    $34 = $324;
   }
   $325 = $32;
   $326 = (($325) + 1)|0;
   $32 = $326;
  }
  $35 = 0;
  while(1) {
   $327 = $35;
   $328 = ((($47)) + 20|0);
   $329 = HEAP32[$328>>2]|0;
   $330 = ($327|0)<=($329|0);
   if (!($330)) {
    break;
   }
   $331 = $28;
   $332 = $331&65535;
   $333 = $332 << 16 >> 16;
   $334 = $13;
   $335 = $35;
   $336 = (($334) + ($335<<1)|0);
   $337 = HEAP16[$336>>1]|0;
   $338 = $337 << 16 >> 16;
   $339 = (($338) + ($333))|0;
   $340 = $339&65535;
   HEAP16[$336>>1] = $340;
   $341 = $13;
   $342 = $35;
   $343 = (($341) + ($342<<1)|0);
   $344 = HEAP16[$343>>1]|0;
   $345 = $344 << 16 >> 16;
   $346 = ($345|0)<(0);
   if ($346) {
    $347 = ((($47)) + 20|0);
    $348 = HEAP32[$347>>2]|0;
    $349 = (($348) + 1)|0;
    $350 = $349&65535;
    $351 = $350 << 16 >> 16;
    $352 = $13;
    $353 = $35;
    $354 = (($352) + ($353<<1)|0);
    $355 = HEAP16[$354>>1]|0;
    $356 = $355 << 16 >> 16;
    $357 = (($356) + ($351))|0;
    $358 = $357&65535;
    HEAP16[$354>>1] = $358;
    $359 = ((($47)) + 20|0);
    $360 = HEAP32[$359>>2]|0;
    $361 = (($360) + 1)|0;
    $362 = (+($361|0));
    $363 = $11;
    $364 = $35;
    $365 = (($363) + ($364<<2)|0);
    $366 = +HEAPF32[$365>>2];
    $367 = $366 + $362;
    HEAPF32[$365>>2] = $367;
   } else {
    $368 = $13;
    $369 = $35;
    $370 = (($368) + ($369<<1)|0);
    $371 = HEAP16[$370>>1]|0;
    $372 = $371 << 16 >> 16;
    $373 = ((($47)) + 20|0);
    $374 = HEAP32[$373>>2]|0;
    $375 = ($372|0)>($374|0);
    if ($375) {
     $376 = ((($47)) + 20|0);
     $377 = HEAP32[$376>>2]|0;
     $378 = (($377) + 1)|0;
     $379 = $378&65535;
     $380 = $379 << 16 >> 16;
     $381 = $13;
     $382 = $35;
     $383 = (($381) + ($382<<1)|0);
     $384 = HEAP16[$383>>1]|0;
     $385 = $384 << 16 >> 16;
     $386 = (($385) - ($380))|0;
     $387 = $386&65535;
     HEAP16[$383>>1] = $387;
     $388 = ((($47)) + 20|0);
     $389 = HEAP32[$388>>2]|0;
     $390 = (($389) + 1)|0;
     $391 = (+($390|0));
     $392 = $11;
     $393 = $35;
     $394 = (($392) + ($393<<2)|0);
     $395 = +HEAPF32[$394>>2];
     $396 = $395 - $391;
     HEAPF32[$394>>2] = $396;
    }
   }
   $397 = $35;
   $398 = (($397) + 1)|0;
   $35 = $398;
  }
  $36 = 0;
  while(1) {
   $399 = $36;
   $400 = ((($47)) + 20|0);
   $401 = HEAP32[$400>>2]|0;
   $402 = (($401) + 1)|0;
   $403 = ($399|0)<=($402|0);
   if (!($403)) {
    break;
   }
   $404 = $12;
   $405 = $36;
   $406 = (($404) + ($405<<2)|0);
   HEAPF32[$406>>2] = 0.0;
   $407 = $36;
   $408 = (($407) + 1)|0;
   $36 = $408;
  }
  $37 = 0;
  while(1) {
   $409 = $37;
   $410 = ((($47)) + 20|0);
   $411 = HEAP32[$410>>2]|0;
   $412 = ($409|0)<=($411|0);
   if (!($412)) {
    break;
   }
   $413 = $10;
   $414 = $37;
   $415 = (($413) + ($414<<2)|0);
   $416 = +HEAPF32[$415>>2];
   $417 = $11;
   $418 = $37;
   $419 = (($417) + ($418<<2)|0);
   $420 = +HEAPF32[$419>>2];
   $421 = $416 - $420;
   $422 = $26;
   $423 = $421 * $422;
   $38 = $423;
   $424 = $38;
   $425 = $12;
   $426 = ((($47)) + 20|0);
   $427 = HEAP32[$426>>2]|0;
   $428 = $13;
   $429 = $37;
   $430 = (($428) + ($429<<1)|0);
   $431 = HEAP16[$430>>1]|0;
   $432 = $431 << 16 >> 16;
   $433 = (($427) - ($432))|0;
   $434 = (($425) + ($433<<2)|0);
   $435 = +HEAPF32[$434>>2];
   $436 = $435 + $424;
   HEAPF32[$434>>2] = $436;
   $437 = $38;
   $438 = $12;
   $439 = ((($47)) + 20|0);
   $440 = HEAP32[$439>>2]|0;
   $441 = $13;
   $442 = $37;
   $443 = (($441) + ($442<<1)|0);
   $444 = HEAP16[$443>>1]|0;
   $445 = $444 << 16 >> 16;
   $446 = (($440) - ($445))|0;
   $447 = (($446) + 1)|0;
   $448 = (($438) + ($447<<2)|0);
   $449 = +HEAPF32[$448>>2];
   $450 = $449 - $437;
   HEAPF32[$448>>2] = $450;
   $451 = $37;
   $452 = (($451) + 1)|0;
   $37 = $452;
  }
  $453 = $12;
  $454 = ((($47)) + 20|0);
  $455 = HEAP32[$454>>2]|0;
  $456 = (($455) + 1)|0;
  $457 = (($453) + ($456<<2)|0);
  $458 = +HEAPF32[$457>>2];
  $459 = 1.0 + $458;
  $460 = $12;
  $461 = +HEAPF32[$460>>2];
  $462 = $461 + $459;
  HEAPF32[$460>>2] = $462;
  $39 = 0;
  while(1) {
   $463 = $39;
   $464 = ((($47)) + 20|0);
   $465 = HEAP32[$464>>2]|0;
   $466 = ($463|0)<=($465|0);
   if (!($466)) {
    break;
   }
   $40 = 0;
   while(1) {
    $467 = $40;
    $468 = ((($47)) + 20|0);
    $469 = HEAP32[$468>>2]|0;
    $470 = ($467|0)<($469|0);
    if (!($470)) {
     break;
    }
    $471 = $11;
    $472 = $40;
    $473 = (($471) + ($472<<2)|0);
    $474 = +HEAPF32[$473>>2];
    $475 = $14;
    $476 = $39;
    $477 = ((($47)) + 20|0);
    $478 = HEAP32[$477>>2]|0;
    $479 = (($478) + 1)|0;
    $480 = Math_imul($476, $479)|0;
    $481 = $13;
    $482 = $40;
    $483 = (($481) + ($482<<1)|0);
    $484 = HEAP16[$483>>1]|0;
    $485 = $484 << 16 >> 16;
    $486 = (($480) + ($485))|0;
    $487 = (($475) + ($486<<1)|0);
    $488 = HEAP16[$487>>1]|0;
    $489 = $488 << 16 >> 16;
    $490 = (+($489|0));
    $491 = $474 + $490;
    $492 = (~~(($491)));
    $493 = $15;
    $494 = $40;
    $495 = (($493) + ($494<<1)|0);
    HEAP16[$495>>1] = $492;
    $496 = $40;
    $497 = (($496) + 1)|0;
    $40 = $497;
   }
   $498 = $15;
   $499 = (__ZN9HashTable4findEPKsb($8,$498,1)|0);
   $500 = HEAP32[$47>>2]|0;
   $501 = $21;
   $502 = ((($47)) + 20|0);
   $503 = HEAP32[$502>>2]|0;
   $504 = (($503) + 1)|0;
   $505 = Math_imul($501, $504)|0;
   $506 = $39;
   $507 = (($505) + ($506))|0;
   $508 = (($500) + ($507<<2)|0);
   HEAP32[$508>>2] = $499;
   $509 = $12;
   $510 = $39;
   $511 = (($509) + ($510<<2)|0);
   $512 = +HEAPF32[$511>>2];
   $513 = ((($47)) + 4|0);
   $514 = HEAP32[$513>>2]|0;
   $515 = $21;
   $516 = ((($47)) + 20|0);
   $517 = HEAP32[$516>>2]|0;
   $518 = (($517) + 1)|0;
   $519 = Math_imul($515, $518)|0;
   $520 = $39;
   $521 = (($519) + ($520))|0;
   $522 = (($514) + ($521<<2)|0);
   HEAPF32[$522>>2] = $512;
   $523 = $39;
   $524 = (($523) + 1)|0;
   $39 = $524;
  }
  $525 = $21;
  $526 = (($525) + 1)|0;
  $21 = $526;
 }
 $527 = $9;
 $528 = ($527|0)==(0|0);
 if (!($528)) {
  __ZdaPv($527);
 }
 $529 = $10;
 $530 = ($529|0)==(0|0);
 if (!($530)) {
  __ZdaPv($529);
 }
 $531 = $11;
 $532 = ($531|0)==(0|0);
 if (!($532)) {
  __ZdaPv($531);
 }
 $533 = $12;
 $534 = ($533|0)==(0|0);
 if (!($534)) {
  __ZdaPv($533);
 }
 $535 = $13;
 $536 = ($535|0)==(0|0);
 if (!($536)) {
  __ZdaPv($535);
 }
 $537 = $14;
 $538 = ($537|0)==(0|0);
 if (!($538)) {
  __ZdaPv($537);
 }
 $539 = $15;
 $540 = ($539|0)==(0|0);
 if (!($540)) {
  __ZdaPv($539);
 }
 $541 = (__ZNK9HashTable4sizeEv($8)|0);
 $542 = ((($47)) + 16|0);
 HEAP32[$542>>2] = $541;
 $543 = ((($47)) + 8|0);
 $544 = HEAP32[$543>>2]|0;
 $545 = ($544|0)!=(0|0);
 if ($545) {
  $546 = ((($47)) + 8|0);
  $547 = HEAP32[$546>>2]|0;
  $548 = ($547|0)==(0|0);
  if (!($548)) {
   __ZdaPv($547);
  }
 }
 $549 = ((($47)) + 20|0);
 $550 = HEAP32[$549>>2]|0;
 $551 = (($550) + 1)|0;
 $552 = ((($47)) + 16|0);
 $553 = HEAP32[$552>>2]|0;
 $554 = Math_imul($551, $553)|0;
 $$arith6 = $554<<3;
 $$overflow7 = ($554>>>0)>(536870911);
 $555 = $$overflow7 ? -1 : $$arith6;
 $556 = (__Znaj($555)|0);
 $557 = ($554|0)==(0);
 if (!($557)) {
  $558 = (($556) + ($554<<3)|0);
  $559 = $556;
  while(1) {
   __ZN13Permutohedral9NeighborsC2Eii($559,0,0);
   $560 = ((($559)) + 8|0);
   $561 = ($560|0)==($558|0);
   if ($561) {
    break;
   } else {
    $559 = $560;
   }
  }
 }
 $562 = ((($47)) + 8|0);
 HEAP32[$562>>2] = $556;
 $41 = 0;
 while(1) {
  $563 = $41;
  $564 = ((($47)) + 20|0);
  $565 = HEAP32[$564>>2]|0;
  $566 = ($563|0)<=($565|0);
  if (!($566)) {
   break;
  }
  $42 = 0;
  while(1) {
   $567 = $42;
   $568 = ((($47)) + 16|0);
   $569 = HEAP32[$568>>2]|0;
   $570 = ($567|0)<($569|0);
   if (!($570)) {
    break;
   }
   $571 = ((($47)) + 20|0);
   $572 = HEAP32[$571>>2]|0;
   $573 = (($572) + 1)|0;
   $$arith2 = $573<<1;
   $$overflow3 = ($573>>>0)>(2147483647);
   $574 = $$overflow3 ? -1 : $$arith2;
   $575 = (__Znaj($574)|0);
   $43 = $575;
   $576 = ((($47)) + 20|0);
   $577 = HEAP32[$576>>2]|0;
   $578 = (($577) + 1)|0;
   $$arith = $578<<1;
   $$overflow = ($578>>>0)>(2147483647);
   $579 = $$overflow ? -1 : $$arith;
   $580 = (__Znaj($579)|0);
   $44 = $580;
   $581 = $42;
   $582 = (__ZNK9HashTable6getKeyEi($8,$581)|0);
   $45 = $582;
   $46 = 0;
   while(1) {
    $583 = $46;
    $584 = ((($47)) + 20|0);
    $585 = HEAP32[$584>>2]|0;
    $586 = ($583|0)<($585|0);
    $587 = $45;
    if (!($586)) {
     break;
    }
    $588 = $46;
    $589 = (($587) + ($588<<1)|0);
    $590 = HEAP16[$589>>1]|0;
    $591 = $590 << 16 >> 16;
    $592 = (($591) - 1)|0;
    $593 = $592&65535;
    $594 = $43;
    $595 = $46;
    $596 = (($594) + ($595<<1)|0);
    HEAP16[$596>>1] = $593;
    $597 = $45;
    $598 = $46;
    $599 = (($597) + ($598<<1)|0);
    $600 = HEAP16[$599>>1]|0;
    $601 = $600 << 16 >> 16;
    $602 = (($601) + 1)|0;
    $603 = $602&65535;
    $604 = $44;
    $605 = $46;
    $606 = (($604) + ($605<<1)|0);
    HEAP16[$606>>1] = $603;
    $607 = $46;
    $608 = (($607) + 1)|0;
    $46 = $608;
   }
   $609 = $41;
   $610 = (($587) + ($609<<1)|0);
   $611 = HEAP16[$610>>1]|0;
   $612 = $611 << 16 >> 16;
   $613 = ((($47)) + 20|0);
   $614 = HEAP32[$613>>2]|0;
   $615 = (($612) + ($614))|0;
   $616 = $615&65535;
   $617 = $43;
   $618 = $41;
   $619 = (($617) + ($618<<1)|0);
   HEAP16[$619>>1] = $616;
   $620 = $45;
   $621 = $41;
   $622 = (($620) + ($621<<1)|0);
   $623 = HEAP16[$622>>1]|0;
   $624 = $623 << 16 >> 16;
   $625 = ((($47)) + 20|0);
   $626 = HEAP32[$625>>2]|0;
   $627 = (($624) - ($626))|0;
   $628 = $627&65535;
   $629 = $44;
   $630 = $41;
   $631 = (($629) + ($630<<1)|0);
   HEAP16[$631>>1] = $628;
   $632 = $43;
   $633 = (__ZN9HashTable4findEPKsb($8,$632,0)|0);
   $634 = ((($47)) + 8|0);
   $635 = HEAP32[$634>>2]|0;
   $636 = $41;
   $637 = ((($47)) + 16|0);
   $638 = HEAP32[$637>>2]|0;
   $639 = Math_imul($636, $638)|0;
   $640 = $42;
   $641 = (($639) + ($640))|0;
   $642 = (($635) + ($641<<3)|0);
   HEAP32[$642>>2] = $633;
   $643 = $44;
   $644 = (__ZN9HashTable4findEPKsb($8,$643,0)|0);
   $645 = ((($47)) + 8|0);
   $646 = HEAP32[$645>>2]|0;
   $647 = $41;
   $648 = ((($47)) + 16|0);
   $649 = HEAP32[$648>>2]|0;
   $650 = Math_imul($647, $649)|0;
   $651 = $42;
   $652 = (($650) + ($651))|0;
   $653 = (($646) + ($652<<3)|0);
   $654 = ((($653)) + 4|0);
   HEAP32[$654>>2] = $644;
   $655 = $43;
   $656 = ($655|0)==(0|0);
   if (!($656)) {
    __ZdaPv($655);
   }
   $657 = $44;
   $658 = ($657|0)==(0|0);
   if (!($658)) {
    __ZdaPv($657);
   }
   $659 = $42;
   $660 = (($659) + 1)|0;
   $42 = $660;
  }
  $661 = $41;
  $662 = (($661) + 1)|0;
  $41 = $662;
 }
 __ZN9HashTableD2Ev($8);
 STACKTOP = sp;return;
}
function __ZNK13Permutohedral7computeEPfPKfiiiii($0,$1,$2,$3,$4,$5,$6,$7) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 $7 = $7|0;
 var $$arith = 0, $$arith2 = 0, $$overflow = 0, $$overflow3 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0;
 var $114 = 0, $115 = 0.0, $116 = 0, $117 = 0, $118 = 0, $119 = 0.0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0.0, $128 = 0.0, $129 = 0, $13 = 0, $130 = 0, $131 = 0;
 var $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0.0, $137 = 0.0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0;
 var $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0;
 var $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0;
 var $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0.0, $204 = 0;
 var $205 = 0, $206 = 0, $207 = 0.0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0.0, $212 = 0.0, $213 = 0.0, $214 = 0.0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0.0, $220 = 0, $221 = 0, $222 = 0;
 var $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0.0, $229 = 0.0, $23 = 0, $230 = 0.0, $231 = 0.0, $232 = 0.0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0;
 var $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0;
 var $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0.0;
 var $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0.0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0.0, $29 = 0, $290 = 0.0, $291 = 0.0, $292 = 0.0, $293 = 0, $294 = 0, $295 = 0;
 var $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0.0, $301 = 0.0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $32 = 0, $33 = 0;
 var $34 = 0.0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0.0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0;
 var $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0;
 var $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0;
 var $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 144|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(144|0);
 $8 = $0;
 $9 = $1;
 $10 = $2;
 $11 = $3;
 $12 = $4;
 $13 = $5;
 $14 = $6;
 $15 = $7;
 $41 = $8;
 $42 = $14;
 $43 = ($42|0)==(-1);
 if ($43) {
  $44 = ((($41)) + 12|0);
  $45 = HEAP32[$44>>2]|0;
  $46 = $12;
  $47 = (($45) - ($46))|0;
  $14 = $47;
 }
 $48 = $15;
 $49 = ($48|0)==(-1);
 if ($49) {
  $50 = ((($41)) + 12|0);
  $51 = HEAP32[$50>>2]|0;
  $52 = $13;
  $53 = (($51) - ($52))|0;
  $15 = $53;
 }
 $54 = ((($41)) + 16|0);
 $55 = HEAP32[$54>>2]|0;
 $56 = (($55) + 2)|0;
 $57 = $11;
 $58 = Math_imul($56, $57)|0;
 $$arith2 = $58<<2;
 $$overflow3 = ($58>>>0)>(1073741823);
 $59 = $$overflow3 ? -1 : $$arith2;
 $60 = (__Znaj($59)|0);
 $16 = $60;
 $61 = ((($41)) + 16|0);
 $62 = HEAP32[$61>>2]|0;
 $63 = (($62) + 2)|0;
 $64 = $11;
 $65 = Math_imul($63, $64)|0;
 $$arith = $65<<2;
 $$overflow = ($65>>>0)>(1073741823);
 $66 = $$overflow ? -1 : $$arith;
 $67 = (__Znaj($66)|0);
 $17 = $67;
 $18 = 0;
 while(1) {
  $68 = $18;
  $69 = ((($41)) + 16|0);
  $70 = HEAP32[$69>>2]|0;
  $71 = (($70) + 2)|0;
  $72 = $11;
  $73 = Math_imul($71, $72)|0;
  $74 = ($68|0)<($73|0);
  if (!($74)) {
   break;
  }
  $75 = $17;
  $76 = $18;
  $77 = (($75) + ($76<<2)|0);
  HEAPF32[$77>>2] = 0.0;
  $78 = $16;
  $79 = $18;
  $80 = (($78) + ($79<<2)|0);
  HEAPF32[$80>>2] = 0.0;
  $81 = $18;
  $82 = (($81) + 1)|0;
  $18 = $82;
 }
 $19 = 0;
 while(1) {
  $83 = $19;
  $84 = $14;
  $85 = ($83|0)<($84|0);
  if (!($85)) {
   break;
  }
  $20 = 0;
  while(1) {
   $86 = $20;
   $87 = ((($41)) + 20|0);
   $88 = HEAP32[$87>>2]|0;
   $89 = ($86|0)<=($88|0);
   if (!($89)) {
    break;
   }
   $90 = HEAP32[$41>>2]|0;
   $91 = $12;
   $92 = $19;
   $93 = (($91) + ($92))|0;
   $94 = ((($41)) + 20|0);
   $95 = HEAP32[$94>>2]|0;
   $96 = (($95) + 1)|0;
   $97 = Math_imul($93, $96)|0;
   $98 = $20;
   $99 = (($97) + ($98))|0;
   $100 = (($90) + ($99<<2)|0);
   $101 = HEAP32[$100>>2]|0;
   $102 = (($101) + 1)|0;
   $21 = $102;
   $103 = ((($41)) + 4|0);
   $104 = HEAP32[$103>>2]|0;
   $105 = $12;
   $106 = $19;
   $107 = (($105) + ($106))|0;
   $108 = ((($41)) + 20|0);
   $109 = HEAP32[$108>>2]|0;
   $110 = (($109) + 1)|0;
   $111 = Math_imul($107, $110)|0;
   $112 = $20;
   $113 = (($111) + ($112))|0;
   $114 = (($104) + ($113<<2)|0);
   $115 = +HEAPF32[$114>>2];
   $22 = $115;
   $23 = 0;
   while(1) {
    $116 = $23;
    $117 = $11;
    $118 = ($116|0)<($117|0);
    if (!($118)) {
     break;
    }
    $119 = $22;
    $120 = $10;
    $121 = $19;
    $122 = $11;
    $123 = Math_imul($121, $122)|0;
    $124 = $23;
    $125 = (($123) + ($124))|0;
    $126 = (($120) + ($125<<2)|0);
    $127 = +HEAPF32[$126>>2];
    $128 = $119 * $127;
    $129 = $16;
    $130 = $21;
    $131 = $11;
    $132 = Math_imul($130, $131)|0;
    $133 = $23;
    $134 = (($132) + ($133))|0;
    $135 = (($129) + ($134<<2)|0);
    $136 = +HEAPF32[$135>>2];
    $137 = $136 + $128;
    HEAPF32[$135>>2] = $137;
    $138 = $23;
    $139 = (($138) + 1)|0;
    $23 = $139;
   }
   $140 = $20;
   $141 = (($140) + 1)|0;
   $20 = $141;
  }
  $142 = $19;
  $143 = (($142) + 1)|0;
  $19 = $143;
 }
 $24 = 0;
 while(1) {
  $144 = $24;
  $145 = ((($41)) + 20|0);
  $146 = HEAP32[$145>>2]|0;
  $147 = ($144|0)<=($146|0);
  if (!($147)) {
   break;
  }
  $25 = 0;
  while(1) {
   $148 = $25;
   $149 = ((($41)) + 16|0);
   $150 = HEAP32[$149>>2]|0;
   $151 = ($148|0)<($150|0);
   $152 = $16;
   if (!($151)) {
    break;
   }
   $153 = $25;
   $154 = (($153) + 1)|0;
   $155 = $11;
   $156 = Math_imul($154, $155)|0;
   $157 = (($152) + ($156<<2)|0);
   $26 = $157;
   $158 = $17;
   $159 = $25;
   $160 = (($159) + 1)|0;
   $161 = $11;
   $162 = Math_imul($160, $161)|0;
   $163 = (($158) + ($162<<2)|0);
   $27 = $163;
   $164 = ((($41)) + 8|0);
   $165 = HEAP32[$164>>2]|0;
   $166 = $24;
   $167 = ((($41)) + 16|0);
   $168 = HEAP32[$167>>2]|0;
   $169 = Math_imul($166, $168)|0;
   $170 = $25;
   $171 = (($169) + ($170))|0;
   $172 = (($165) + ($171<<3)|0);
   $173 = HEAP32[$172>>2]|0;
   $174 = (($173) + 1)|0;
   $28 = $174;
   $175 = ((($41)) + 8|0);
   $176 = HEAP32[$175>>2]|0;
   $177 = $24;
   $178 = ((($41)) + 16|0);
   $179 = HEAP32[$178>>2]|0;
   $180 = Math_imul($177, $179)|0;
   $181 = $25;
   $182 = (($180) + ($181))|0;
   $183 = (($176) + ($182<<3)|0);
   $184 = ((($183)) + 4|0);
   $185 = HEAP32[$184>>2]|0;
   $186 = (($185) + 1)|0;
   $29 = $186;
   $187 = $16;
   $188 = $28;
   $189 = $11;
   $190 = Math_imul($188, $189)|0;
   $191 = (($187) + ($190<<2)|0);
   $30 = $191;
   $192 = $16;
   $193 = $29;
   $194 = $11;
   $195 = Math_imul($193, $194)|0;
   $196 = (($192) + ($195<<2)|0);
   $31 = $196;
   $32 = 0;
   while(1) {
    $197 = $32;
    $198 = $11;
    $199 = ($197|0)<($198|0);
    if (!($199)) {
     break;
    }
    $200 = $26;
    $201 = $32;
    $202 = (($200) + ($201<<2)|0);
    $203 = +HEAPF32[$202>>2];
    $204 = $30;
    $205 = $32;
    $206 = (($204) + ($205<<2)|0);
    $207 = +HEAPF32[$206>>2];
    $208 = $31;
    $209 = $32;
    $210 = (($208) + ($209<<2)|0);
    $211 = +HEAPF32[$210>>2];
    $212 = $207 + $211;
    $213 = 0.5 * $212;
    $214 = $203 + $213;
    $215 = $27;
    $216 = $32;
    $217 = (($215) + ($216<<2)|0);
    HEAPF32[$217>>2] = $214;
    $218 = $32;
    $219 = (($218) + 1)|0;
    $32 = $219;
   }
   $220 = $25;
   $221 = (($220) + 1)|0;
   $25 = $221;
  }
  $33 = $152;
  $222 = $17;
  $16 = $222;
  $223 = $33;
  $17 = $223;
  $224 = $24;
  $225 = (($224) + 1)|0;
  $24 = $225;
 }
 $226 = ((($41)) + 20|0);
 $227 = HEAP32[$226>>2]|0;
 $228 = (+($227|0));
 $229 = - $228;
 $230 = (+Math_pow(2.0,(+$229)));
 $231 = 1.0 + $230;
 $232 = 1.0 / $231;
 $34 = $232;
 $35 = 0;
 while(1) {
  $233 = $35;
  $234 = $15;
  $235 = ($233|0)<($234|0);
  if (!($235)) {
   break;
  }
  $36 = 0;
  while(1) {
   $236 = $36;
   $237 = $11;
   $238 = ($236|0)<($237|0);
   if (!($238)) {
    break;
   }
   $239 = $9;
   $240 = $35;
   $241 = $11;
   $242 = Math_imul($240, $241)|0;
   $243 = $36;
   $244 = (($242) + ($243))|0;
   $245 = (($239) + ($244<<2)|0);
   HEAPF32[$245>>2] = 0.0;
   $246 = $36;
   $247 = (($246) + 1)|0;
   $36 = $247;
  }
  $37 = 0;
  while(1) {
   $248 = $37;
   $249 = ((($41)) + 20|0);
   $250 = HEAP32[$249>>2]|0;
   $251 = ($248|0)<=($250|0);
   if (!($251)) {
    break;
   }
   $252 = HEAP32[$41>>2]|0;
   $253 = $13;
   $254 = $35;
   $255 = (($253) + ($254))|0;
   $256 = ((($41)) + 20|0);
   $257 = HEAP32[$256>>2]|0;
   $258 = (($257) + 1)|0;
   $259 = Math_imul($255, $258)|0;
   $260 = $37;
   $261 = (($259) + ($260))|0;
   $262 = (($252) + ($261<<2)|0);
   $263 = HEAP32[$262>>2]|0;
   $264 = (($263) + 1)|0;
   $38 = $264;
   $265 = ((($41)) + 4|0);
   $266 = HEAP32[$265>>2]|0;
   $267 = $13;
   $268 = $35;
   $269 = (($267) + ($268))|0;
   $270 = ((($41)) + 20|0);
   $271 = HEAP32[$270>>2]|0;
   $272 = (($271) + 1)|0;
   $273 = Math_imul($269, $272)|0;
   $274 = $37;
   $275 = (($273) + ($274))|0;
   $276 = (($266) + ($275<<2)|0);
   $277 = +HEAPF32[$276>>2];
   $39 = $277;
   $40 = 0;
   while(1) {
    $278 = $40;
    $279 = $11;
    $280 = ($278|0)<($279|0);
    if (!($280)) {
     break;
    }
    $281 = $39;
    $282 = $16;
    $283 = $38;
    $284 = $11;
    $285 = Math_imul($283, $284)|0;
    $286 = $40;
    $287 = (($285) + ($286))|0;
    $288 = (($282) + ($287<<2)|0);
    $289 = +HEAPF32[$288>>2];
    $290 = $281 * $289;
    $291 = $34;
    $292 = $290 * $291;
    $293 = $9;
    $294 = $35;
    $295 = $11;
    $296 = Math_imul($294, $295)|0;
    $297 = $40;
    $298 = (($296) + ($297))|0;
    $299 = (($293) + ($298<<2)|0);
    $300 = +HEAPF32[$299>>2];
    $301 = $300 + $292;
    HEAPF32[$299>>2] = $301;
    $302 = $40;
    $303 = (($302) + 1)|0;
    $40 = $303;
   }
   $304 = $37;
   $305 = (($304) + 1)|0;
   $37 = $305;
  }
  $306 = $35;
  $307 = (($306) + 1)|0;
  $35 = $307;
 }
 $308 = $16;
 $309 = ($308|0)==(0|0);
 if (!($309)) {
  __ZdaPv($308);
 }
 $310 = $17;
 $311 = ($310|0)==(0|0);
 if ($311) {
  STACKTOP = sp;return;
 }
 __ZdaPv($310);
 STACKTOP = sp;return;
}
function __ZN13PermutohedralD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)!=(0|0);
 if ($5) {
  $6 = ((($2)) + 4|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = ($7|0)==(0|0);
  if (!($8)) {
   __ZdaPv($7);
  }
 }
 $9 = HEAP32[$2>>2]|0;
 $10 = ($9|0)!=(0|0);
 if ($10) {
  $11 = HEAP32[$2>>2]|0;
  $12 = ($11|0)==(0|0);
  if (!($12)) {
   __ZdaPv($11);
  }
 }
 $13 = ((($2)) + 8|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = ($14|0)!=(0|0);
 if (!($15)) {
  STACKTOP = sp;return;
 }
 $16 = ((($2)) + 8|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = ($17|0)==(0|0);
 if ($18) {
  STACKTOP = sp;return;
 }
 __ZdaPv($17);
 STACKTOP = sp;return;
}
function __ZN14PottsPotentialD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 HEAP32[$2>>2] = (280);
 $3 = ((($2)) + 36|0);
 __Z10deallocateRPf($3);
 $4 = ((($2)) + 4|0);
 __ZN13PermutohedralD2Ev($4);
 __ZN17PairwisePotentialD2Ev($2);
 STACKTOP = sp;return;
}
function __ZN14PottsPotentialD0Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN14PottsPotentialD2Ev($2);
 __ZdlPv($2);
 STACKTOP = sp;return;
}
function __ZNK14PottsPotential5applyEPfPKfS0_i($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0.0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0.0, $32 = 0.0, $33 = 0, $34 = 0, $35 = 0, $36 = 0.0, $37 = 0.0, $38 = 0, $39 = 0, $40 = 0, $41 = 0.0, $42 = 0.0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 $13 = $5;
 $14 = ((($13)) + 4|0);
 $15 = $8;
 $16 = $7;
 $17 = $9;
 __ZNK13Permutohedral7computeEPfPKfiiiii($14,$15,$16,$17,0,0,-1,-1);
 $10 = 0;
 $11 = 0;
 while(1) {
  $18 = $10;
  $19 = ((($13)) + 28|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ($18|0)<($20|0);
  if (!($21)) {
   break;
  }
  $12 = 0;
  while(1) {
   $22 = $12;
   $23 = $9;
   $24 = ($22|0)<($23|0);
   if (!($24)) {
    break;
   }
   $25 = ((($13)) + 32|0);
   $26 = +HEAPF32[$25>>2];
   $27 = ((($13)) + 36|0);
   $28 = HEAP32[$27>>2]|0;
   $29 = $10;
   $30 = (($28) + ($29<<2)|0);
   $31 = +HEAPF32[$30>>2];
   $32 = $26 * $31;
   $33 = $8;
   $34 = $11;
   $35 = (($33) + ($34<<2)|0);
   $36 = +HEAPF32[$35>>2];
   $37 = $32 * $36;
   $38 = $6;
   $39 = $11;
   $40 = (($38) + ($39<<2)|0);
   $41 = +HEAPF32[$40>>2];
   $42 = $41 + $37;
   HEAPF32[$40>>2] = $42;
   $43 = $12;
   $44 = (($43) + 1)|0;
   $12 = $44;
   $45 = $11;
   $46 = (($45) + 1)|0;
   $11 = $46;
  }
  $47 = $10;
  $48 = (($47) + 1)|0;
  $10 = $48;
 }
 STACKTOP = sp;return;
}
function __ZN9HashTableC2Eii($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$arith = 0, $$arith2 = 0, $$overflow = 0, $$overflow3 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 HEAP32[$6>>2] = $7;
 $8 = ((($6)) + 4|0);
 HEAP32[$8>>2] = 0;
 $9 = ((($6)) + 8|0);
 $10 = $5;
 $11 = $10<<1;
 HEAP32[$9>>2] = $11;
 $12 = ((($6)) + 8|0);
 $13 = HEAP32[$12>>2]|0;
 $$arith2 = $13<<2;
 $$overflow3 = ($13>>>0)>(1073741823);
 $14 = $$overflow3 ? -1 : $$arith2;
 $15 = (__Znaj($14)|0);
 $16 = ((($6)) + 16|0);
 HEAP32[$16>>2] = $15;
 $17 = ((($6)) + 8|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = (($18>>>0) / 2)&-1;
 $20 = (($19) + 10)|0;
 $21 = HEAP32[$6>>2]|0;
 $22 = Math_imul($20, $21)|0;
 $$arith = $22<<1;
 $$overflow = ($22>>>0)>(2147483647);
 $23 = $$overflow ? -1 : $$arith;
 $24 = (__Znaj($23)|0);
 $25 = ((($6)) + 12|0);
 HEAP32[$25>>2] = $24;
 $26 = ((($6)) + 16|0);
 $27 = HEAP32[$26>>2]|0;
 $28 = ((($6)) + 8|0);
 $29 = HEAP32[$28>>2]|0;
 $30 = $29<<2;
 _memset(($27|0),-1,($30|0))|0;
 STACKTOP = sp;return;
}
function __ZL14float2IntRoundf($0) {
 $0 = +$0;
 var $1 = 0.0, $2 = 0.0, $3 = 0.0, $4 = 0.0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = $2 + 0.5;
 $4 = (+Math_floor((+$3)));
 $5 = (~~(($4)));
 STACKTOP = sp;return ($5|0);
}
function __ZN9HashTable4findEPKsb($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0;
 var $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $spec$store$select = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $12 = $2&1;
 $6 = $12;
 $13 = $4;
 $14 = ((($13)) + 4|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = $15<<1;
 $17 = ((($13)) + 8|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = ($16>>>0)>=($18>>>0);
 if ($19) {
  __ZN9HashTable4growEv($13);
 }
 $20 = $5;
 $21 = (__ZN9HashTable4hashEPKs($13,$20)|0);
 $22 = ((($13)) + 8|0);
 $23 = HEAP32[$22>>2]|0;
 $24 = (($21>>>0) % ($23>>>0))&-1;
 $7 = $24;
 while(1) {
  $25 = ((($13)) + 16|0);
  $26 = HEAP32[$25>>2]|0;
  $27 = $7;
  $28 = (($26) + ($27<<2)|0);
  $29 = HEAP32[$28>>2]|0;
  $8 = $29;
  $30 = $8;
  $31 = ($30|0)==(-1);
  if ($31) {
   break;
  }
  $10 = 1;
  $11 = 0;
  while(1) {
   $59 = $11;
   $60 = HEAP32[$13>>2]|0;
   $61 = ($59>>>0)<($60>>>0);
   $62 = $10;
   $63 = $62&1;
   $64 = $61 ? $63 : 0;
   if (!($64)) {
    break;
   }
   $65 = ((($13)) + 12|0);
   $66 = HEAP32[$65>>2]|0;
   $67 = $8;
   $68 = HEAP32[$13>>2]|0;
   $69 = Math_imul($67, $68)|0;
   $70 = $11;
   $71 = (($69) + ($70))|0;
   $72 = (($66) + ($71<<1)|0);
   $73 = HEAP16[$72>>1]|0;
   $74 = $73 << 16 >> 16;
   $75 = $5;
   $76 = $11;
   $77 = (($75) + ($76<<1)|0);
   $78 = HEAP16[$77>>1]|0;
   $79 = $78 << 16 >> 16;
   $80 = ($74|0)!=($79|0);
   if ($80) {
    $10 = 0;
   }
   $81 = $11;
   $82 = (($81) + 1)|0;
   $11 = $82;
  }
  $83 = $10;
  $84 = $83&1;
  if ($84) {
   label = 17;
   break;
  }
  $86 = $7;
  $87 = (($86) + 1)|0;
  $7 = $87;
  $88 = $7;
  $89 = ((($13)) + 8|0);
  $90 = HEAP32[$89>>2]|0;
  $91 = ($88|0)==($90|0);
  $spec$store$select = $91 ? 0 : $87;
  $7 = $spec$store$select;
 }
 if ((label|0) == 17) {
  $85 = $8;
  $3 = $85;
  $92 = $3;
  STACKTOP = sp;return ($92|0);
 }
 $32 = $6;
 $33 = $32&1;
 if (!($33)) {
  $3 = -1;
  $92 = $3;
  STACKTOP = sp;return ($92|0);
 }
 $9 = 0;
 while(1) {
  $34 = $9;
  $35 = HEAP32[$13>>2]|0;
  $36 = ($34>>>0)<($35>>>0);
  if (!($36)) {
   break;
  }
  $37 = $5;
  $38 = $9;
  $39 = (($37) + ($38<<1)|0);
  $40 = HEAP16[$39>>1]|0;
  $41 = ((($13)) + 12|0);
  $42 = HEAP32[$41>>2]|0;
  $43 = ((($13)) + 4|0);
  $44 = HEAP32[$43>>2]|0;
  $45 = HEAP32[$13>>2]|0;
  $46 = Math_imul($44, $45)|0;
  $47 = $9;
  $48 = (($46) + ($47))|0;
  $49 = (($42) + ($48<<1)|0);
  HEAP16[$49>>1] = $40;
  $50 = $9;
  $51 = (($50) + 1)|0;
  $9 = $51;
 }
 $52 = ((($13)) + 4|0);
 $53 = HEAP32[$52>>2]|0;
 $54 = (($53) + 1)|0;
 HEAP32[$52>>2] = $54;
 $55 = ((($13)) + 16|0);
 $56 = HEAP32[$55>>2]|0;
 $57 = $7;
 $58 = (($56) + ($57<<2)|0);
 HEAP32[$58>>2] = $53;
 $3 = $53;
 $92 = $3;
 STACKTOP = sp;return ($92|0);
}
function __ZNK9HashTable4sizeEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 STACKTOP = sp;return ($4|0);
}
function __ZN13Permutohedral9NeighborsC2Eii($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 HEAP32[$6>>2] = $7;
 $8 = ((($6)) + 4|0);
 $9 = $5;
 HEAP32[$8>>2] = $9;
 STACKTOP = sp;return;
}
function __ZNK9HashTable6getKeyEi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = ((($4)) + 12|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $3;
 $8 = HEAP32[$4>>2]|0;
 $9 = Math_imul($7, $8)|0;
 $10 = (($6) + ($9<<1)|0);
 STACKTOP = sp;return ($10|0);
}
function __ZN9HashTableD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 12|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if (!($5)) {
  __ZdaPv($4);
 }
 $6 = ((($2)) + 16|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)==(0|0);
 if ($8) {
  STACKTOP = sp;return;
 }
 __ZdaPv($7);
 STACKTOP = sp;return;
}
function __ZN9HashTable4growEv($0) {
 $0 = $0|0;
 var $$arith = 0, $$arith2 = 0, $$overflow = 0, $$overflow3 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0;
 var $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $1 = $0;
 $8 = $1;
 $9 = ((($8)) + 12|0);
 $10 = HEAP32[$9>>2]|0;
 $2 = $10;
 $11 = ((($8)) + 16|0);
 $12 = HEAP32[$11>>2]|0;
 $3 = $12;
 $13 = ((($8)) + 8|0);
 $14 = HEAP32[$13>>2]|0;
 $4 = $14;
 $15 = ((($8)) + 8|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = $16<<1;
 HEAP32[$15>>2] = $17;
 $18 = $4;
 $19 = (($18) + 10)|0;
 $20 = HEAP32[$8>>2]|0;
 $21 = Math_imul($19, $20)|0;
 $$arith2 = $21<<1;
 $$overflow3 = ($21>>>0)>(2147483647);
 $22 = $$overflow3 ? -1 : $$arith2;
 $23 = (__Znaj($22)|0);
 $24 = ((($8)) + 12|0);
 HEAP32[$24>>2] = $23;
 $25 = ((($8)) + 8|0);
 $26 = HEAP32[$25>>2]|0;
 $$arith = $26<<2;
 $$overflow = ($26>>>0)>(1073741823);
 $27 = $$overflow ? -1 : $$arith;
 $28 = (__Znaj($27)|0);
 $29 = ((($8)) + 16|0);
 HEAP32[$29>>2] = $28;
 $30 = ((($8)) + 16|0);
 $31 = HEAP32[$30>>2]|0;
 $32 = ((($8)) + 8|0);
 $33 = HEAP32[$32>>2]|0;
 $34 = $33<<2;
 _memset(($31|0),-1,($34|0))|0;
 $35 = ((($8)) + 12|0);
 $36 = HEAP32[$35>>2]|0;
 $37 = $2;
 $38 = ((($8)) + 4|0);
 $39 = HEAP32[$38>>2]|0;
 $40 = HEAP32[$8>>2]|0;
 $41 = Math_imul($39, $40)|0;
 $42 = $41<<1;
 _memcpy(($36|0),($37|0),($42|0))|0;
 $5 = 0;
 while(1) {
  $43 = $5;
  $44 = $4;
  $45 = ($43>>>0)<($44>>>0);
  if (!($45)) {
   break;
  }
  $46 = $3;
  $47 = $5;
  $48 = (($46) + ($47<<2)|0);
  $49 = HEAP32[$48>>2]|0;
  $50 = ($49|0)>=(0);
  if ($50) {
   $51 = $3;
   $52 = $5;
   $53 = (($51) + ($52<<2)|0);
   $54 = HEAP32[$53>>2]|0;
   $6 = $54;
   $55 = $2;
   $56 = $6;
   $57 = (__ZNK9HashTable6getKeyEi($8,$56)|0);
   $58 = ((($8)) + 12|0);
   $59 = HEAP32[$58>>2]|0;
   $60 = $57;
   $61 = $59;
   $62 = (($60) - ($61))|0;
   $63 = (($62|0) / 2)&-1;
   $64 = (($55) + ($63<<1)|0);
   $65 = (__ZN9HashTable4hashEPKs($8,$64)|0);
   $66 = ((($8)) + 8|0);
   $67 = HEAP32[$66>>2]|0;
   $68 = (($65>>>0) % ($67>>>0))&-1;
   $7 = $68;
   while(1) {
    $69 = ((($8)) + 16|0);
    $70 = HEAP32[$69>>2]|0;
    $71 = $7;
    $72 = (($70) + ($71<<2)|0);
    $73 = HEAP32[$72>>2]|0;
    $74 = ($73|0)>=(0);
    if (!($74)) {
     break;
    }
    $75 = $7;
    $76 = ((($8)) + 8|0);
    $77 = HEAP32[$76>>2]|0;
    $78 = (($77) - 1)|0;
    $79 = ($75>>>0)<($78>>>0);
    $80 = $7;
    $81 = (($80) + 1)|0;
    $82 = $79 ? $81 : 0;
    $7 = $82;
   }
   $83 = $6;
   $84 = ((($8)) + 16|0);
   $85 = HEAP32[$84>>2]|0;
   $86 = $7;
   $87 = (($85) + ($86<<2)|0);
   HEAP32[$87>>2] = $83;
  }
  $88 = $5;
  $89 = (($88) + 1)|0;
  $5 = $89;
 }
 $90 = $2;
 $91 = ($90|0)==(0|0);
 if (!($91)) {
  __ZdaPv($90);
 }
 $92 = $3;
 $93 = ($92|0)==(0|0);
 if ($93) {
  STACKTOP = sp;return;
 }
 __ZdaPv($92);
 STACKTOP = sp;return;
}
function __ZN9HashTable4hashEPKs($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $6 = $2;
 $4 = 0;
 $5 = 0;
 while(1) {
  $7 = $5;
  $8 = HEAP32[$6>>2]|0;
  $9 = ($7>>>0)<($8>>>0);
  if (!($9)) {
   break;
  }
  $10 = $3;
  $11 = $5;
  $12 = (($10) + ($11<<1)|0);
  $13 = HEAP16[$12>>1]|0;
  $14 = $13 << 16 >> 16;
  $15 = $4;
  $16 = (($15) + ($14))|0;
  $4 = $16;
  $17 = $4;
  $18 = Math_imul($17, 1664525)|0;
  $4 = $18;
  $19 = $5;
  $20 = (($19) + 1)|0;
  $5 = $20;
 }
 $21 = $4;
 STACKTOP = sp;return ($21|0);
}
function __Z13very_fast_expf($0) {
 $0 = +$0;
 var $1 = 0.0, $10 = 0.0, $11 = 0.0, $12 = 0.0, $13 = 0.0, $14 = 0.0, $15 = 0.0, $16 = 0.0, $17 = 0.0, $18 = 0.0, $19 = 0.0, $2 = 0.0, $20 = 0.0, $21 = 0.0, $22 = 0.0, $3 = 0.0, $4 = 0.0, $5 = 0.0, $6 = 0.0, $7 = 0.0;
 var $8 = 0.0, $9 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = $1;
 $4 = $1;
 $5 = $1;
 $6 = $1;
 $7 = $1;
 $8 = $1;
 $9 = $8 * 1.4131609350442886E-4;
 $10 = 0.0013298819540068507 - $9;
 $11 = $7 * $10;
 $12 = 0.0083013596013188362 - $11;
 $13 = $6 * $12;
 $14 = 0.041657347232103348 - $13;
 $15 = $5 * $14;
 $16 = 0.16666530072689056 - $15;
 $17 = $4 * $16;
 $18 = 0.49999991059303284 - $17;
 $19 = $3 * $18;
 $20 = 1.0 - $19;
 $21 = $2 * $20;
 $22 = 1.0 - $21;
 STACKTOP = sp;return (+$22);
}
function __ZNSt3__26vectorIP17PairwisePotentialNS_9allocatorIS2_EEE21__push_back_slow_pathIKS2_EEvRT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0;
 var $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0;
 var $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0;
 var $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0;
 var $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0;
 var $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 160|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(160|0);
 $13 = sp;
 $16 = sp + 148|0;
 $24 = sp + 64|0;
 $27 = sp + 52|0;
 $35 = sp + 4|0;
 $32 = $0;
 $33 = $1;
 $36 = $32;
 $31 = $36;
 $37 = $31;
 $38 = ((($37)) + 8|0);
 $30 = $38;
 $39 = $30;
 $29 = $39;
 $40 = $29;
 $34 = $40;
 $28 = $36;
 $41 = $28;
 $42 = ((($41)) + 4|0);
 $43 = HEAP32[$42>>2]|0;
 $44 = HEAP32[$41>>2]|0;
 $45 = $43;
 $46 = $44;
 $47 = (($45) - ($46))|0;
 $48 = (($47|0) / 4)&-1;
 $49 = (($48) + 1)|0;
 $23 = $36;
 HEAP32[$24>>2] = $49;
 $50 = $23;
 $51 = (__ZNKSt3__26vectorIP17PairwisePotentialNS_9allocatorIS2_EEE8max_sizeEv($50)|0);
 $25 = $51;
 $52 = HEAP32[$24>>2]|0;
 $53 = $25;
 $54 = ($52>>>0)>($53>>>0);
 if ($54) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($50);
  // unreachable;
 }
 $21 = $50;
 $55 = $21;
 $20 = $55;
 $56 = $20;
 $19 = $56;
 $57 = $19;
 $58 = ((($57)) + 8|0);
 $18 = $58;
 $59 = $18;
 $17 = $59;
 $60 = $17;
 $61 = HEAP32[$60>>2]|0;
 $62 = HEAP32[$56>>2]|0;
 $63 = $61;
 $64 = $62;
 $65 = (($63) - ($64))|0;
 $66 = (($65|0) / 4)&-1;
 $26 = $66;
 $67 = $26;
 $68 = $25;
 $69 = (($68>>>0) / 2)&-1;
 $70 = ($67>>>0)>=($69>>>0);
 if ($70) {
  $71 = $25;
  $22 = $71;
 } else {
  $72 = $26;
  $73 = $72<<1;
  HEAP32[$27>>2] = $73;
  $14 = $27;
  $15 = $24;
  $74 = $14;
  $75 = $15;
  ;HEAP8[$13>>0]=HEAP8[$16>>0]|0;
  $11 = $74;
  $12 = $75;
  $76 = $11;
  $77 = $12;
  $8 = $13;
  $9 = $76;
  $10 = $77;
  $78 = $9;
  $79 = HEAP32[$78>>2]|0;
  $80 = $10;
  $81 = HEAP32[$80>>2]|0;
  $82 = ($79>>>0)<($81>>>0);
  $83 = $12;
  $84 = $11;
  $85 = $82 ? $83 : $84;
  $86 = HEAP32[$85>>2]|0;
  $22 = $86;
 }
 $87 = $22;
 $7 = $36;
 $88 = $7;
 $89 = ((($88)) + 4|0);
 $90 = HEAP32[$89>>2]|0;
 $91 = HEAP32[$88>>2]|0;
 $92 = $90;
 $93 = $91;
 $94 = (($92) - ($93))|0;
 $95 = (($94|0) / 4)&-1;
 $96 = $34;
 __ZNSt3__214__split_bufferIP17PairwisePotentialRNS_9allocatorIS2_EEEC2EjjS5_($35,$87,$95,$96);
 $97 = $34;
 $98 = ((($35)) + 8|0);
 $99 = HEAP32[$98>>2]|0;
 $6 = $99;
 $100 = $6;
 $101 = $33;
 $5 = $101;
 $102 = $5;
 $2 = $97;
 $3 = $100;
 $4 = $102;
 $103 = $3;
 $104 = $4;
 $105 = HEAP32[$104>>2]|0;
 HEAP32[$103>>2] = $105;
 $106 = ((($35)) + 8|0);
 $107 = HEAP32[$106>>2]|0;
 $108 = ((($107)) + 4|0);
 HEAP32[$106>>2] = $108;
 __ZNSt3__26vectorIP17PairwisePotentialNS_9allocatorIS2_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS2_RS4_EE($36,$35);
 __ZNSt3__214__split_bufferIP17PairwisePotentialRNS_9allocatorIS2_EEED2Ev($35);
 STACKTOP = sp;return;
}
function __ZNSt3__214__split_bufferIP17PairwisePotentialRNS_9allocatorIS2_EEEC2EjjS5_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $22 = sp + 48|0;
 $29 = sp + 20|0;
 $31 = $0;
 $32 = $1;
 $33 = $2;
 $34 = $3;
 $35 = $31;
 $36 = ((($35)) + 12|0);
 $37 = $34;
 $28 = $36;
 HEAP32[$29>>2] = 0;
 $30 = $37;
 $38 = $28;
 $27 = $29;
 $39 = $27;
 $40 = HEAP32[$39>>2]|0;
 $21 = $38;
 HEAP32[$22>>2] = $40;
 $41 = $21;
 $20 = $22;
 $42 = $20;
 $43 = HEAP32[$42>>2]|0;
 HEAP32[$41>>2] = $43;
 $44 = ((($38)) + 4|0);
 $45 = $30;
 $23 = $45;
 $46 = $23;
 $25 = $44;
 $26 = $46;
 $47 = $25;
 $48 = $26;
 $24 = $48;
 $49 = $24;
 HEAP32[$47>>2] = $49;
 $50 = $32;
 $51 = ($50|0)!=(0);
 do {
  if ($51) {
   $6 = $35;
   $52 = $6;
   $53 = ((($52)) + 12|0);
   $5 = $53;
   $54 = $5;
   $55 = ((($54)) + 4|0);
   $4 = $55;
   $56 = $4;
   $57 = HEAP32[$56>>2]|0;
   $58 = $32;
   $15 = $57;
   $16 = $58;
   $59 = $15;
   $60 = $16;
   $12 = $59;
   $13 = $60;
   $14 = 0;
   $61 = $12;
   $62 = $13;
   $11 = $61;
   $63 = ($62>>>0)>(1073741823);
   if ($63) {
    $9 = 1034;
    $64 = (___cxa_allocate_exception(8)|0);
    $65 = $9;
    $7 = $64;
    $8 = $65;
    $66 = $7;
    $67 = $8;
    __ZNSt11logic_errorC2EPKc($66,$67);
    HEAP32[$66>>2] = (908);
    ___cxa_throw(($64|0),(152|0),(31|0));
    // unreachable;
   } else {
    $68 = $13;
    $69 = $68<<2;
    $10 = $69;
    $70 = $10;
    $71 = (__Znwj($70)|0);
    $72 = $71;
    break;
   }
  } else {
   $72 = 0;
  }
 } while(0);
 HEAP32[$35>>2] = $72;
 $73 = HEAP32[$35>>2]|0;
 $74 = $33;
 $75 = (($73) + ($74<<2)|0);
 $76 = ((($35)) + 8|0);
 HEAP32[$76>>2] = $75;
 $77 = ((($35)) + 4|0);
 HEAP32[$77>>2] = $75;
 $78 = HEAP32[$35>>2]|0;
 $79 = $32;
 $80 = (($78) + ($79<<2)|0);
 $19 = $35;
 $81 = $19;
 $82 = ((($81)) + 12|0);
 $18 = $82;
 $83 = $18;
 $17 = $83;
 $84 = $17;
 HEAP32[$84>>2] = $80;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIP17PairwisePotentialNS_9allocatorIS2_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS2_RS4_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0;
 var $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0;
 var $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0;
 var $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 352|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(352|0);
 $15 = sp + 288|0;
 $21 = sp + 264|0;
 $33 = sp + 216|0;
 $86 = $0;
 $87 = $1;
 $88 = $86;
 $85 = $88;
 $89 = $85;
 $84 = $89;
 $90 = $84;
 $91 = HEAP32[$90>>2]|0;
 $83 = $91;
 $92 = $83;
 $62 = $89;
 $93 = $62;
 $94 = HEAP32[$93>>2]|0;
 $61 = $94;
 $95 = $61;
 $67 = $89;
 $96 = $67;
 $66 = $96;
 $97 = $66;
 $65 = $97;
 $98 = $65;
 $99 = ((($98)) + 8|0);
 $64 = $99;
 $100 = $64;
 $63 = $100;
 $101 = $63;
 $102 = HEAP32[$101>>2]|0;
 $103 = HEAP32[$97>>2]|0;
 $104 = $102;
 $105 = $103;
 $106 = (($104) - ($105))|0;
 $107 = (($106|0) / 4)&-1;
 $108 = (($95) + ($107<<2)|0);
 $69 = $89;
 $109 = $69;
 $110 = HEAP32[$109>>2]|0;
 $68 = $110;
 $111 = $68;
 $70 = $89;
 $112 = $70;
 $113 = ((($112)) + 4|0);
 $114 = HEAP32[$113>>2]|0;
 $115 = HEAP32[$112>>2]|0;
 $116 = $114;
 $117 = $115;
 $118 = (($116) - ($117))|0;
 $119 = (($118|0) / 4)&-1;
 $120 = (($111) + ($119<<2)|0);
 $72 = $89;
 $121 = $72;
 $122 = HEAP32[$121>>2]|0;
 $71 = $122;
 $123 = $71;
 $77 = $89;
 $124 = $77;
 $76 = $124;
 $125 = $76;
 $75 = $125;
 $126 = $75;
 $127 = ((($126)) + 8|0);
 $74 = $127;
 $128 = $74;
 $73 = $128;
 $129 = $73;
 $130 = HEAP32[$129>>2]|0;
 $131 = HEAP32[$125>>2]|0;
 $132 = $130;
 $133 = $131;
 $134 = (($132) - ($133))|0;
 $135 = (($134|0) / 4)&-1;
 $136 = (($123) + ($135<<2)|0);
 $78 = $89;
 $79 = $92;
 $80 = $108;
 $81 = $120;
 $82 = $136;
 $4 = $88;
 $137 = $4;
 $138 = ((($137)) + 8|0);
 $3 = $138;
 $139 = $3;
 $2 = $139;
 $140 = $2;
 $141 = HEAP32[$88>>2]|0;
 $142 = ((($88)) + 4|0);
 $143 = HEAP32[$142>>2]|0;
 $144 = $87;
 $145 = ((($144)) + 4|0);
 $5 = $140;
 $6 = $141;
 $7 = $143;
 $8 = $145;
 $146 = $7;
 $147 = $6;
 $148 = $146;
 $149 = $147;
 $150 = (($148) - ($149))|0;
 $151 = (($150|0) / 4)&-1;
 $9 = $151;
 $152 = $9;
 $153 = $8;
 $154 = HEAP32[$153>>2]|0;
 $155 = (0 - ($152))|0;
 $156 = (($154) + ($155<<2)|0);
 HEAP32[$153>>2] = $156;
 $157 = $9;
 $158 = ($157|0)>(0);
 if ($158) {
  $159 = $8;
  $160 = HEAP32[$159>>2]|0;
  $161 = $6;
  $162 = $9;
  $163 = $162<<2;
  _memcpy(($160|0),($161|0),($163|0))|0;
 }
 $164 = $87;
 $165 = ((($164)) + 4|0);
 $13 = $88;
 $14 = $165;
 $166 = $13;
 $12 = $166;
 $167 = $12;
 $168 = HEAP32[$167>>2]|0;
 HEAP32[$15>>2] = $168;
 $169 = $14;
 $10 = $169;
 $170 = $10;
 $171 = HEAP32[$170>>2]|0;
 $172 = $13;
 HEAP32[$172>>2] = $171;
 $11 = $15;
 $173 = $11;
 $174 = HEAP32[$173>>2]|0;
 $175 = $14;
 HEAP32[$175>>2] = $174;
 $176 = ((($88)) + 4|0);
 $177 = $87;
 $178 = ((($177)) + 8|0);
 $19 = $176;
 $20 = $178;
 $179 = $19;
 $18 = $179;
 $180 = $18;
 $181 = HEAP32[$180>>2]|0;
 HEAP32[$21>>2] = $181;
 $182 = $20;
 $16 = $182;
 $183 = $16;
 $184 = HEAP32[$183>>2]|0;
 $185 = $19;
 HEAP32[$185>>2] = $184;
 $17 = $21;
 $186 = $17;
 $187 = HEAP32[$186>>2]|0;
 $188 = $20;
 HEAP32[$188>>2] = $187;
 $24 = $88;
 $189 = $24;
 $190 = ((($189)) + 8|0);
 $23 = $190;
 $191 = $23;
 $22 = $191;
 $192 = $22;
 $193 = $87;
 $27 = $193;
 $194 = $27;
 $195 = ((($194)) + 12|0);
 $26 = $195;
 $196 = $26;
 $25 = $196;
 $197 = $25;
 $31 = $192;
 $32 = $197;
 $198 = $31;
 $30 = $198;
 $199 = $30;
 $200 = HEAP32[$199>>2]|0;
 HEAP32[$33>>2] = $200;
 $201 = $32;
 $28 = $201;
 $202 = $28;
 $203 = HEAP32[$202>>2]|0;
 $204 = $31;
 HEAP32[$204>>2] = $203;
 $29 = $33;
 $205 = $29;
 $206 = HEAP32[$205>>2]|0;
 $207 = $32;
 HEAP32[$207>>2] = $206;
 $208 = $87;
 $209 = ((($208)) + 4|0);
 $210 = HEAP32[$209>>2]|0;
 $211 = $87;
 HEAP32[$211>>2] = $210;
 $34 = $88;
 $212 = $34;
 $213 = ((($212)) + 4|0);
 $214 = HEAP32[$213>>2]|0;
 $215 = HEAP32[$212>>2]|0;
 $216 = $214;
 $217 = $215;
 $218 = (($216) - ($217))|0;
 $219 = (($218|0) / 4)&-1;
 $58 = $88;
 $59 = $219;
 $220 = $58;
 $57 = $220;
 $221 = $57;
 $222 = HEAP32[$221>>2]|0;
 $56 = $222;
 $223 = $56;
 $36 = $220;
 $224 = $36;
 $225 = HEAP32[$224>>2]|0;
 $35 = $225;
 $226 = $35;
 $41 = $220;
 $227 = $41;
 $40 = $227;
 $228 = $40;
 $39 = $228;
 $229 = $39;
 $230 = ((($229)) + 8|0);
 $38 = $230;
 $231 = $38;
 $37 = $231;
 $232 = $37;
 $233 = HEAP32[$232>>2]|0;
 $234 = HEAP32[$228>>2]|0;
 $235 = $233;
 $236 = $234;
 $237 = (($235) - ($236))|0;
 $238 = (($237|0) / 4)&-1;
 $239 = (($226) + ($238<<2)|0);
 $43 = $220;
 $240 = $43;
 $241 = HEAP32[$240>>2]|0;
 $42 = $241;
 $242 = $42;
 $48 = $220;
 $243 = $48;
 $47 = $243;
 $244 = $47;
 $46 = $244;
 $245 = $46;
 $246 = ((($245)) + 8|0);
 $45 = $246;
 $247 = $45;
 $44 = $247;
 $248 = $44;
 $249 = HEAP32[$248>>2]|0;
 $250 = HEAP32[$244>>2]|0;
 $251 = $249;
 $252 = $250;
 $253 = (($251) - ($252))|0;
 $254 = (($253|0) / 4)&-1;
 $255 = (($242) + ($254<<2)|0);
 $50 = $220;
 $256 = $50;
 $257 = HEAP32[$256>>2]|0;
 $49 = $257;
 $258 = $49;
 $259 = $59;
 $260 = (($258) + ($259<<2)|0);
 $51 = $220;
 $52 = $223;
 $53 = $239;
 $54 = $255;
 $55 = $260;
 $60 = $88;
 STACKTOP = sp;return;
}
function __ZNSt3__214__split_bufferIP17PairwisePotentialRNS_9allocatorIS2_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $18 = sp + 8|0;
 $21 = sp + 125|0;
 $27 = sp;
 $30 = sp + 124|0;
 $32 = $0;
 $33 = $32;
 $31 = $33;
 $34 = $31;
 $35 = ((($34)) + 4|0);
 $36 = HEAP32[$35>>2]|0;
 $28 = $34;
 $29 = $36;
 $37 = $28;
 $38 = $29;
 ;HEAP8[$27>>0]=HEAP8[$30>>0]|0;
 $25 = $37;
 $26 = $38;
 $39 = $25;
 while(1) {
  $40 = $26;
  $41 = ((($39)) + 8|0);
  $42 = HEAP32[$41>>2]|0;
  $43 = ($40|0)!=($42|0);
  if (!($43)) {
   break;
  }
  $24 = $39;
  $44 = $24;
  $45 = ((($44)) + 12|0);
  $23 = $45;
  $46 = $23;
  $47 = ((($46)) + 4|0);
  $22 = $47;
  $48 = $22;
  $49 = HEAP32[$48>>2]|0;
  $50 = ((($39)) + 8|0);
  $51 = HEAP32[$50>>2]|0;
  $52 = ((($51)) + -4|0);
  HEAP32[$50>>2] = $52;
  $15 = $52;
  $53 = $15;
  $19 = $49;
  $20 = $53;
  $54 = $19;
  $55 = $20;
  ;HEAP8[$18>>0]=HEAP8[$21>>0]|0;
  $16 = $54;
  $17 = $55;
 }
 $56 = HEAP32[$33>>2]|0;
 $57 = ($56|0)!=(0|0);
 if (!($57)) {
  STACKTOP = sp;return;
 }
 $7 = $33;
 $58 = $7;
 $59 = ((($58)) + 12|0);
 $6 = $59;
 $60 = $6;
 $61 = ((($60)) + 4|0);
 $5 = $61;
 $62 = $5;
 $63 = HEAP32[$62>>2]|0;
 $64 = HEAP32[$33>>2]|0;
 $4 = $33;
 $65 = $4;
 $3 = $65;
 $66 = $3;
 $67 = ((($66)) + 12|0);
 $2 = $67;
 $68 = $2;
 $1 = $68;
 $69 = $1;
 $70 = HEAP32[$69>>2]|0;
 $71 = HEAP32[$65>>2]|0;
 $72 = $70;
 $73 = $71;
 $74 = (($72) - ($73))|0;
 $75 = (($74|0) / 4)&-1;
 $12 = $63;
 $13 = $64;
 $14 = $75;
 $76 = $12;
 $77 = $13;
 $78 = $14;
 $9 = $76;
 $10 = $77;
 $11 = $78;
 $79 = $10;
 $8 = $79;
 $80 = $8;
 __ZdlPv($80);
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorIP17PairwisePotentialNS_9allocatorIS2_EEE8max_sizeEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $3 = sp + 8|0;
 $5 = sp + 77|0;
 $11 = sp;
 $14 = sp + 76|0;
 $19 = sp + 16|0;
 $20 = sp + 12|0;
 $18 = $0;
 $21 = $18;
 $17 = $21;
 $22 = $17;
 $23 = ((($22)) + 8|0);
 $16 = $23;
 $24 = $16;
 $15 = $24;
 $25 = $15;
 $4 = $25;
 $26 = $4;
 ;HEAP8[$3>>0]=HEAP8[$5>>0]|0;
 $2 = $26;
 $27 = $2;
 $1 = $27;
 HEAP32[$19>>2] = 1073741823;
 HEAP32[$20>>2] = 2147483647;
 $12 = $19;
 $13 = $20;
 $28 = $12;
 $29 = $13;
 ;HEAP8[$11>>0]=HEAP8[$14>>0]|0;
 $9 = $28;
 $10 = $29;
 $30 = $10;
 $31 = $9;
 $6 = $11;
 $7 = $30;
 $8 = $31;
 $32 = $7;
 $33 = HEAP32[$32>>2]|0;
 $34 = $8;
 $35 = HEAP32[$34>>2]|0;
 $36 = ($33>>>0)<($35>>>0);
 $37 = $10;
 $38 = $9;
 $39 = $36 ? $37 : $38;
 $40 = HEAP32[$39>>2]|0;
 STACKTOP = sp;return ($40|0);
}
function _fitGMMs($0,$1,$2,$3,$4,$5,$6,$7) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 $7 = $7|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0.0, $24 = 0.0, $25 = 0.0, $26 = 0.0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0;
 var $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0.0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0;
 var $70 = 0.0, $71 = 0.0, $72 = 0.0, $73 = 0.0, $74 = 0.0, $75 = 0.0, $76 = 0.0, $77 = 0.0, $78 = 0.0, $79 = 0.0, $8 = 0, $80 = 0.0, $81 = 0, $82 = 0, $83 = 0, $84 = 0.0, $85 = 0, $86 = 0, $87 = 0, $88 = 0;
 var $89 = 0.0, $9 = 0, $90 = 0.0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $8 = $0;
 $9 = $1;
 $10 = $2;
 $11 = $3;
 $12 = $4;
 $13 = $5;
 $14 = $6;
 $15 = $7;
 $26 = 2.0;
 $16 = $26;
 $17 = 0;
 while(1) {
  $27 = $17;
  $28 = $15;
  $29 = ($27|0)<($28|0);
  if (!($29)) {
   break;
  }
  $30 = $9;
  $31 = $17;
  $32 = $14;
  $33 = Math_imul($31, $32)|0;
  $34 = (($30) + ($33<<2)|0);
  $18 = $34;
  $35 = $10;
  $36 = $17;
  $37 = $36<<1;
  $38 = $14;
  $39 = Math_imul($37, $38)|0;
  $40 = (($35) + ($39<<2)|0);
  $19 = $40;
  $41 = $11;
  $42 = $17;
  $43 = $14;
  $44 = Math_imul($42, $43)|0;
  $45 = (($41) + ($44<<2)|0);
  $20 = $45;
  $46 = $8;
  $47 = $17;
  $48 = $14;
  $49 = Math_imul($47, $48)|0;
  $50 = ($49*3)|0;
  $51 = (($46) + ($50<<2)|0);
  $21 = $51;
  $22 = 0;
  while(1) {
   $52 = $22;
   $53 = $14;
   $54 = ($52|0)<($53|0);
   if (!($54)) {
    break;
   }
   $55 = $20;
   $56 = $22;
   $57 = (($55) + ($56<<2)|0);
   $58 = HEAP32[$57>>2]|0;
   switch ($58|0) {
   case 0:  {
    $23 = 0.0;
    break;
   }
   case 255:  {
    $23 = 1.0;
    break;
   }
   default: {
    $59 = $13;
    $60 = $21;
    $61 = $22;
    $62 = ($61*3)|0;
    $63 = (($60) + ($62<<2)|0);
    $64 = (+__ZNK6CmGMM_ILi3EE1PEPKf($59,$63));
    $24 = $64;
    $65 = $12;
    $66 = $21;
    $67 = $22;
    $68 = ($67*3)|0;
    $69 = (($66) + ($68<<2)|0);
    $70 = (+__ZNK6CmGMM_ILi3EE1PEPKf($65,$69));
    $25 = $70;
    $71 = $24;
    $72 = 0.80000001192092896 * $71;
    $73 = $24;
    $74 = $16;
    $75 = $25;
    $76 = $74 * $75;
    $77 = $73 + $76;
    $78 = $77 + 9.9999999392252903E-9;
    $79 = $72 / $78;
    $23 = $79;
   }
   }
   $80 = $23;
   $81 = $18;
   $82 = $22;
   $83 = (($81) + ($82<<2)|0);
   HEAPF32[$83>>2] = $80;
   $84 = $23;
   $85 = $19;
   $86 = $22;
   $87 = $86<<1;
   $88 = (($85) + ($87<<2)|0);
   HEAPF32[$88>>2] = $84;
   $89 = $23;
   $90 = 1.0 - $89;
   $91 = $19;
   $92 = $22;
   $93 = $92<<1;
   $94 = (($93) + 1)|0;
   $95 = (($91) + ($94<<2)|0);
   HEAPF32[$95>>2] = $90;
   $96 = $22;
   $97 = (($96) + 1)|0;
   $22 = $97;
  }
  $98 = $17;
  $99 = (($98) + 1)|0;
  $17 = $99;
 }
 STACKTOP = sp;return;
}
function __ZNK6CmGMM_ILi3EE1PEPKf($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0.0, $19 = 0, $2 = 0, $20 = 0, $21 = 0.0, $22 = 0.0, $23 = 0.0, $24 = 0.0, $25 = 0, $26 = 0, $27 = 0.0, $28 = 0.0;
 var $3 = 0, $4 = 0.0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $2 = $0;
 $3 = $1;
 $6 = $2;
 $4 = 0.0;
 $7 = ((($6)) + 24|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)!=(0|0);
 if (!($9)) {
  $27 = $4;
  $28 = $27;
  STACKTOP = sp;return (+$28);
 }
 $5 = 0;
 while(1) {
  $10 = $5;
  $11 = HEAP32[$6>>2]|0;
  $12 = ($10|0)<($11|0);
  if (!($12)) {
   break;
  }
  $13 = ((($6)) + 24|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = $5;
  $16 = (($14) + (($15*280)|0)|0);
  $17 = ((($16)) + 176|0);
  $18 = +HEAPF64[$17>>3];
  $19 = $5;
  $20 = $3;
  $21 = (+__ZNK6CmGMM_ILi3EE1PEiPKf($6,$19,$20));
  $22 = $18 * $21;
  $23 = $4;
  $24 = $23 + $22;
  $4 = $24;
  $25 = $5;
  $26 = (($25) + 1)|0;
  $5 = $26;
 }
 $27 = $4;
 $28 = $27;
 STACKTOP = sp;return (+$28);
}
function __ZNK6CmGMM_ILi3EE1PEiPKf($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0.0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0.0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0.0;
 var $3 = 0.0, $30 = 0.0, $31 = 0, $32 = 0, $33 = 0, $34 = 0.0, $35 = 0.0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0.0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0.0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0.0, $59 = 0.0, $6 = 0, $60 = 0, $61 = 0, $62 = 0.0, $63 = 0.0, $64 = 0.0, $65 = 0.0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0.0, $70 = 0, $71 = 0.0, $72 = 0.0, $73 = 0.0, $74 = 0.0, $75 = 0.0, $76 = 0.0, $77 = 0.0, $78 = 0, $79 = 0.0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0;
 var $84 = 0.0, $85 = 0.0, $86 = 0.0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $vararg_buffer = sp + 48|0;
 $9 = sp + 8|0;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $15 = $4;
 $7 = 0.0;
 $16 = ((($15)) + 24|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = $5;
 $19 = (($17) + (($18*280)|0)|0);
 $8 = $19;
 $20 = $8;
 $21 = ((($20)) + 176|0);
 $22 = +HEAPF64[$21>>3];
 $23 = $22 > 0.0;
 do {
  if ($23) {
   $10 = 0;
   while(1) {
    $24 = $10;
    $25 = ($24|0)<(3);
    if (!($25)) {
     break;
    }
    $26 = $6;
    $27 = $10;
    $28 = (($26) + ($27<<2)|0);
    $29 = +HEAPF32[$28>>2];
    $30 = $29;
    $31 = $8;
    $32 = $10;
    $33 = (($31) + ($32<<3)|0);
    $34 = +HEAPF64[$33>>3];
    $35 = $30 - $34;
    $36 = $10;
    $37 = (($9) + ($36<<3)|0);
    HEAPF64[$37>>3] = $35;
    $38 = $10;
    $39 = (($38) + 1)|0;
    $10 = $39;
   }
   $40 = $8;
   $41 = ((($40)) + 96|0);
   $42 = +HEAPF64[$41>>3];
   $43 = $42 > 0.0;
   $44 = $8;
   if (!($43)) {
    $78 = ((($44)) + 176|0);
    $79 = +HEAPF64[$78>>3];
    $80 = $79 < 0.001;
    if (!($80)) {
     $81 = $5;
     $82 = $8;
     $83 = ((($82)) + 176|0);
     $84 = +HEAPF64[$83>>3];
     HEAP32[$vararg_buffer>>2] = $81;
     $vararg_ptr1 = ((($vararg_buffer)) + 8|0);
     HEAPF64[$vararg_ptr1>>3] = $84;
     $vararg_ptr2 = ((($vararg_buffer)) + 16|0);
     HEAP32[$vararg_ptr2>>2] = 298;
     $vararg_ptr3 = ((($vararg_buffer)) + 20|0);
     HEAP32[$vararg_ptr3>>2] = 1155;
     (_printf(1102,$vararg_buffer)|0);
     break;
    }
    $3 = 0.0;
    $86 = $3;
    STACKTOP = sp;return (+$86);
   }
   $45 = ((($44)) + 104|0);
   $11 = $45;
   $12 = 0.0;
   $13 = 0;
   while(1) {
    $46 = $13;
    $47 = ($46|0)<(3);
    if (!($47)) {
     break;
    }
    $14 = 0;
    while(1) {
     $48 = $14;
     $49 = ($48|0)<(3);
     $50 = $13;
     if (!($49)) {
      break;
     }
     $51 = (($9) + ($50<<3)|0);
     $52 = +HEAPF64[$51>>3];
     $53 = $11;
     $54 = $13;
     $55 = (($53) + (($54*24)|0)|0);
     $56 = $14;
     $57 = (($55) + ($56<<3)|0);
     $58 = +HEAPF64[$57>>3];
     $59 = $52 * $58;
     $60 = $14;
     $61 = (($9) + ($60<<3)|0);
     $62 = +HEAPF64[$61>>3];
     $63 = $59 * $62;
     $64 = $12;
     $65 = $64 + $63;
     $12 = $65;
     $66 = $14;
     $67 = (($66) + 1)|0;
     $14 = $67;
    }
    $68 = (($50) + 1)|0;
    $13 = $68;
   }
   $69 = $8;
   $70 = ((($69)) + 96|0);
   $71 = +HEAPF64[$70>>3];
   $72 = (+Math_sqrt((+$71)));
   $73 = 0.063500000000000001 / $72;
   $74 = $12;
   $75 = -0.5 * $74;
   $76 = (+Math_exp((+$75)));
   $77 = $73 * $76;
   $7 = $77;
  }
 } while(0);
 $85 = $7;
 $3 = $85;
 $86 = $3;
 STACKTOP = sp;return (+$86);
}
function _process($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$arith = 0, $$arith10 = 0, $$arith14 = 0, $$arith2 = 0, $$arith6 = 0, $$overflow = 0, $$overflow11 = 0, $$overflow15 = 0, $$overflow3 = 0, $$overflow7 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0;
 var $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0;
 var $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0;
 var $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0;
 var $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0;
 var $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0;
 var $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0.0, $212 = 0.0, $213 = 0.0, $214 = 0, $215 = 0, $216 = 0, $217 = 0;
 var $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0;
 var $236 = 0, $237 = 0, $238 = 0, $239 = 0.0, $24 = 0, $240 = 0.0, $241 = 0.0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0;
 var $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0.0, $269 = 0.0, $27 = 0, $270 = 0.0, $271 = 0;
 var $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0;
 var $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0;
 var $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0;
 var $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0;
 var $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0;
 var $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0;
 var $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0;
 var $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0;
 var $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0.0, $422 = 0, $423 = 0.0, $424 = 0, $425 = 0, $426 = 0.0, $427 = 0.0, $428 = 0.0, $429 = 0.0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0;
 var $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0;
 var $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0;
 var $471 = 0, $472 = 0, $473 = 0.0, $474 = 0.0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0;
 var $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0;
 var $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0;
 var $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0;
 var $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0;
 var $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 240|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(240|0);
 $31 = sp + 32|0;
 $32 = sp;
 $33 = sp + 80|0;
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $38 = $6;
 $39 = (($38) - 1)|0;
 $8 = $39;
 $9 = 0;
 $40 = $7;
 $41 = (($40) - 1)|0;
 $10 = $41;
 $11 = 0;
 $12 = 0;
 while(1) {
  $42 = $12;
  $43 = $7;
  $44 = ($42|0)<($43|0);
  if (!($44)) {
   break;
  }
  $13 = 0;
  while(1) {
   $45 = $13;
   $46 = $6;
   $47 = ($45|0)<($46|0);
   if (!($47)) {
    break;
   }
   $48 = $4;
   $49 = $13;
   $50 = $49<<2;
   $51 = (($50) + 3)|0;
   $52 = $12;
   $53 = $6;
   $54 = Math_imul($52, $53)|0;
   $55 = $54<<2;
   $56 = (($51) + ($55))|0;
   $57 = (($48) + ($56)|0);
   $58 = HEAP8[$57>>0]|0;
   $59 = $58&255;
   $60 = ($59|0)==(126);
   if ($60) {
    label = 7;
   } else {
    $61 = $4;
    $62 = $13;
    $63 = $62<<2;
    $64 = (($63) + 3)|0;
    $65 = $12;
    $66 = $6;
    $67 = Math_imul($65, $66)|0;
    $68 = $67<<2;
    $69 = (($64) + ($68))|0;
    $70 = (($61) + ($69)|0);
    $71 = HEAP8[$70>>0]|0;
    $72 = $71&255;
    $73 = ($72|0)==(127);
    if ($73) {
     label = 7;
    }
   }
   if ((label|0) == 7) {
    label = 0;
    $74 = $13;
    $75 = $8;
    $76 = ($74|0)<($75|0);
    if ($76) {
     $77 = $13;
     $8 = $77;
    }
    $78 = $13;
    $79 = $9;
    $80 = ($78|0)>($79|0);
    if ($80) {
     $81 = $13;
     $9 = $81;
    }
    $82 = $12;
    $83 = $10;
    $84 = ($82|0)<($83|0);
    if ($84) {
     $85 = $12;
     $10 = $85;
    }
    $86 = $12;
    $87 = $11;
    $88 = ($86|0)>($87|0);
    if ($88) {
     $89 = $12;
     $11 = $89;
    }
   }
   $90 = $13;
   $91 = (($90) + 1)|0;
   $13 = $91;
  }
  $92 = $12;
  $93 = (($92) + 1)|0;
  $12 = $93;
 }
 $94 = $9;
 $95 = $8;
 $96 = (($94) - ($95))|0;
 $97 = (($96) + 1)|0;
 $14 = $97;
 $98 = $11;
 $99 = $10;
 $100 = (($98) - ($99))|0;
 $101 = (($100) + 1)|0;
 $15 = $101;
 $102 = $6;
 $103 = $7;
 $104 = Math_imul($102, $103)|0;
 $16 = $104;
 $105 = $14;
 $106 = $15;
 $107 = Math_imul($105, $106)|0;
 $17 = $107;
 $108 = $17;
 $109 = ($108*3)|0;
 $$arith14 = $109<<2;
 $$overflow15 = ($109>>>0)>(1073741823);
 $110 = $$overflow15 ? -1 : $$arith14;
 $111 = (__Znaj($110)|0);
 $18 = $111;
 $112 = $17;
 $113 = ($112*3)|0;
 $114 = ($113|0)<(0);
 $115 = $114 ? -1 : $113;
 $116 = (__Znaj($115)|0);
 $19 = $116;
 $20 = 0;
 while(1) {
  $117 = $20;
  $118 = $15;
  $119 = ($117|0)<($118|0);
  if (!($119)) {
   break;
  }
  $21 = 0;
  while(1) {
   $120 = $21;
   $121 = $14;
   $122 = ($120|0)<($121|0);
   if (!($122)) {
    break;
   }
   $123 = $4;
   $124 = $21;
   $125 = $8;
   $126 = (($124) + ($125))|0;
   $127 = $126<<2;
   $128 = $20;
   $129 = $10;
   $130 = (($128) + ($129))|0;
   $131 = $6;
   $132 = Math_imul($130, $131)|0;
   $133 = $132<<2;
   $134 = (($127) + ($133))|0;
   $135 = (($123) + ($134)|0);
   $136 = HEAP8[$135>>0]|0;
   $137 = $19;
   $138 = $21;
   $139 = ($138*3)|0;
   $140 = $20;
   $141 = $14;
   $142 = Math_imul($140, $141)|0;
   $143 = ($142*3)|0;
   $144 = (($139) + ($143))|0;
   $145 = (($137) + ($144)|0);
   HEAP8[$145>>0] = $136;
   $146 = $4;
   $147 = $21;
   $148 = $8;
   $149 = (($147) + ($148))|0;
   $150 = $149<<2;
   $151 = (($150) + 1)|0;
   $152 = $20;
   $153 = $10;
   $154 = (($152) + ($153))|0;
   $155 = $6;
   $156 = Math_imul($154, $155)|0;
   $157 = $156<<2;
   $158 = (($151) + ($157))|0;
   $159 = (($146) + ($158)|0);
   $160 = HEAP8[$159>>0]|0;
   $161 = $19;
   $162 = $21;
   $163 = ($162*3)|0;
   $164 = (($163) + 1)|0;
   $165 = $20;
   $166 = $14;
   $167 = Math_imul($165, $166)|0;
   $168 = ($167*3)|0;
   $169 = (($164) + ($168))|0;
   $170 = (($161) + ($169)|0);
   HEAP8[$170>>0] = $160;
   $171 = $4;
   $172 = $21;
   $173 = $8;
   $174 = (($172) + ($173))|0;
   $175 = $174<<2;
   $176 = (($175) + 2)|0;
   $177 = $20;
   $178 = $10;
   $179 = (($177) + ($178))|0;
   $180 = $6;
   $181 = Math_imul($179, $180)|0;
   $182 = $181<<2;
   $183 = (($176) + ($182))|0;
   $184 = (($171) + ($183)|0);
   $185 = HEAP8[$184>>0]|0;
   $186 = $19;
   $187 = $21;
   $188 = ($187*3)|0;
   $189 = (($188) + 2)|0;
   $190 = $20;
   $191 = $14;
   $192 = Math_imul($190, $191)|0;
   $193 = ($192*3)|0;
   $194 = (($189) + ($193))|0;
   $195 = (($186) + ($194)|0);
   HEAP8[$195>>0] = $185;
   $196 = $4;
   $197 = $21;
   $198 = $8;
   $199 = (($197) + ($198))|0;
   $200 = $199<<2;
   $201 = $20;
   $202 = $10;
   $203 = (($201) + ($202))|0;
   $204 = $6;
   $205 = Math_imul($203, $204)|0;
   $206 = $205<<2;
   $207 = (($200) + ($206))|0;
   $208 = (($196) + ($207)|0);
   $209 = HEAP8[$208>>0]|0;
   $210 = $209&255;
   $211 = (+($210|0));
   $212 = $211 / 255.0;
   $213 = $212;
   $214 = $18;
   $215 = $21;
   $216 = ($215*3)|0;
   $217 = $20;
   $218 = $14;
   $219 = Math_imul($217, $218)|0;
   $220 = ($219*3)|0;
   $221 = (($216) + ($220))|0;
   $222 = (($214) + ($221<<2)|0);
   HEAPF32[$222>>2] = $213;
   $223 = $4;
   $224 = $21;
   $225 = $8;
   $226 = (($224) + ($225))|0;
   $227 = $226<<2;
   $228 = (($227) + 1)|0;
   $229 = $20;
   $230 = $10;
   $231 = (($229) + ($230))|0;
   $232 = $6;
   $233 = Math_imul($231, $232)|0;
   $234 = $233<<2;
   $235 = (($228) + ($234))|0;
   $236 = (($223) + ($235)|0);
   $237 = HEAP8[$236>>0]|0;
   $238 = $237&255;
   $239 = (+($238|0));
   $240 = $239 / 255.0;
   $241 = $240;
   $242 = $18;
   $243 = $21;
   $244 = ($243*3)|0;
   $245 = (($244) + 1)|0;
   $246 = $20;
   $247 = $14;
   $248 = Math_imul($246, $247)|0;
   $249 = ($248*3)|0;
   $250 = (($245) + ($249))|0;
   $251 = (($242) + ($250<<2)|0);
   HEAPF32[$251>>2] = $241;
   $252 = $4;
   $253 = $21;
   $254 = $8;
   $255 = (($253) + ($254))|0;
   $256 = $255<<2;
   $257 = (($256) + 2)|0;
   $258 = $20;
   $259 = $10;
   $260 = (($258) + ($259))|0;
   $261 = $6;
   $262 = Math_imul($260, $261)|0;
   $263 = $262<<2;
   $264 = (($257) + ($263))|0;
   $265 = (($252) + ($264)|0);
   $266 = HEAP8[$265>>0]|0;
   $267 = $266&255;
   $268 = (+($267|0));
   $269 = $268 / 255.0;
   $270 = $269;
   $271 = $18;
   $272 = $21;
   $273 = ($272*3)|0;
   $274 = (($273) + 2)|0;
   $275 = $20;
   $276 = $14;
   $277 = Math_imul($275, $276)|0;
   $278 = ($277*3)|0;
   $279 = (($274) + ($278))|0;
   $280 = (($271) + ($279<<2)|0);
   HEAPF32[$280>>2] = $270;
   $281 = $21;
   $282 = (($281) + 1)|0;
   $21 = $282;
  }
  $283 = $20;
  $284 = (($283) + 1)|0;
  $20 = $284;
 }
 $285 = $17;
 $$arith10 = $285<<2;
 $$overflow11 = ($285>>>0)>(1073741823);
 $286 = $$overflow11 ? -1 : $$arith10;
 $287 = (__Znaj($286)|0);
 $22 = $287;
 $288 = $17;
 $$arith6 = $288<<2;
 $$overflow7 = ($288>>>0)>(1073741823);
 $289 = $$overflow7 ? -1 : $$arith6;
 $290 = (__Znaj($289)|0);
 $23 = $290;
 $24 = 0;
 while(1) {
  $291 = $24;
  $292 = $15;
  $293 = ($291|0)<($292|0);
  if (!($293)) {
   break;
  }
  $25 = 0;
  while(1) {
   $294 = $25;
   $295 = $14;
   $296 = ($294|0)<($295|0);
   if (!($296)) {
    break;
   }
   $297 = $4;
   $298 = $25;
   $299 = $8;
   $300 = (($298) + ($299))|0;
   $301 = $300<<2;
   $302 = (($301) + 3)|0;
   $303 = $24;
   $304 = $10;
   $305 = (($303) + ($304))|0;
   $306 = $6;
   $307 = Math_imul($305, $306)|0;
   $308 = $307<<2;
   $309 = (($302) + ($308))|0;
   $310 = (($297) + ($309)|0);
   $311 = HEAP8[$310>>0]|0;
   $312 = $311&255;
   $313 = ($312|0)==(126);
   $314 = $23;
   $315 = $25;
   $316 = $24;
   $317 = $14;
   $318 = Math_imul($316, $317)|0;
   $319 = (($315) + ($318))|0;
   $320 = (($314) + ($319<<2)|0);
   if ($313) {
    HEAPF32[$320>>2] = 1.0;
    $321 = $22;
    $322 = $25;
    $323 = $24;
    $324 = $14;
    $325 = Math_imul($323, $324)|0;
    $326 = (($322) + ($325))|0;
    $327 = (($321) + ($326<<2)|0);
    HEAP32[$327>>2] = 0;
   } else {
    HEAPF32[$320>>2] = 0.0;
    $328 = $22;
    $329 = $25;
    $330 = $24;
    $331 = $14;
    $332 = Math_imul($330, $331)|0;
    $333 = (($329) + ($332))|0;
    $334 = (($328) + ($333<<2)|0);
    HEAP32[$334>>2] = 128;
   }
   $335 = $25;
   $336 = (($335) + 1)|0;
   $25 = $336;
  }
  $337 = $24;
  $338 = (($337) + 1)|0;
  $24 = $338;
 }
 $339 = $17;
 $$arith2 = $339<<2;
 $$overflow3 = ($339>>>0)>(1073741823);
 $340 = $$overflow3 ? -1 : $$arith2;
 $341 = (__Znaj($340)|0);
 $26 = $341;
 $27 = 0;
 while(1) {
  $342 = $27;
  $343 = $15;
  $344 = ($342|0)<($343|0);
  if (!($344)) {
   break;
  }
  $28 = 0;
  while(1) {
   $345 = $28;
   $346 = $14;
   $347 = ($345|0)<($346|0);
   if (!($347)) {
    break;
   }
   $348 = $4;
   $349 = $28;
   $350 = $8;
   $351 = (($349) + ($350))|0;
   $352 = $351<<2;
   $353 = (($352) + 3)|0;
   $354 = $27;
   $355 = $10;
   $356 = (($354) + ($355))|0;
   $357 = $6;
   $358 = Math_imul($356, $357)|0;
   $359 = $358<<2;
   $360 = (($353) + ($359))|0;
   $361 = (($348) + ($360)|0);
   $362 = HEAP8[$361>>0]|0;
   $363 = $362&255;
   $364 = ($363|0)==(127);
   $365 = $26;
   $366 = $28;
   $367 = $27;
   $368 = $14;
   $369 = Math_imul($367, $368)|0;
   $370 = (($366) + ($369))|0;
   $371 = (($365) + ($370<<2)|0);
   if ($364) {
    HEAPF32[$371>>2] = 1.0;
    $372 = $22;
    $373 = $28;
    $374 = $27;
    $375 = $14;
    $376 = Math_imul($374, $375)|0;
    $377 = (($373) + ($376))|0;
    $378 = (($372) + ($377<<2)|0);
    HEAP32[$378>>2] = 255;
   } else {
    HEAPF32[$371>>2] = 0.0;
   }
   $379 = $28;
   $380 = (($379) + 1)|0;
   $28 = $380;
  }
  $381 = $27;
  $382 = (($381) + 1)|0;
  $27 = $382;
 }
 $383 = $17;
 $384 = $383<<1;
 $$arith = $384<<2;
 $$overflow = ($384>>>0)>(1073741823);
 $385 = $$overflow ? -1 : $$arith;
 $386 = (__Znaj($385)|0);
 $29 = $386;
 $30 = 0;
 while(1) {
  $387 = $30;
  $388 = $17;
  $389 = $388<<1;
  $390 = ($387|0)<($389|0);
  if (!($390)) {
   break;
  }
  $391 = $29;
  $392 = $30;
  $393 = (($391) + ($392<<2)|0);
  HEAPF32[$393>>2] = 0.0;
  $394 = $30;
  $395 = (($394) + 1)|0;
  $30 = $395;
 }
 __ZN5CmGMMC2Eid($31,5,0.01);
 __ZN5CmGMMC2Eid($32,5,0.01);
 $396 = $18;
 $397 = $23;
 $398 = $14;
 $399 = $15;
 __ZN6CmGMM_ILi3EE9BuildGMMsEPfS1_ii($31,$396,$397,$398,$399);
 $400 = $18;
 $401 = $26;
 $402 = $14;
 $403 = $15;
 __ZN6CmGMM_ILi3EE9BuildGMMsEPfS1_ii($32,$400,$401,$402,$403);
 $404 = $18;
 $405 = $26;
 $406 = $29;
 $407 = $22;
 $408 = $14;
 $409 = $15;
 _fitGMMs($404,$405,$406,$407,$31,$32,$408,$409);
 $410 = $14;
 $411 = $15;
 __ZN10DenseCRF2DC2Eiii($33,$410,$411,2);
 $412 = $19;
 __ZN10DenseCRF2D20addPairwiseBilateralEfffffPKhfPK18SemiMetricFunction($33,20.0,20.0,33.0,33.0,33.0,$412,6.0,0);
 __ZN10DenseCRF2D19addPairwiseGaussianEfffPK18SemiMetricFunction($33,10.0,10.0,10.0,0);
 $413 = $19;
 __ZN10DenseCRF2D24addPairwiseColorGaussianEfffPKhfPK18SemiMetricFunction($33,41.0,41.0,41.0,$413,2.0,0);
 $414 = $29;
 __ZN8DenseCRF14setUnaryEnergyEPKf($33,$414);
 $415 = (__ZN10DenseCRF2D9binarySegEif($33,4,1.0)|0);
 $34 = $415;
 $35 = 0;
 while(1) {
  $416 = $35;
  $417 = $17;
  $418 = ($416|0)<($417|0);
  if (!($418)) {
   break;
  }
  $419 = $34;
  $420 = ((($419)) + 4|0);
  $421 = +HEAPF32[$420>>2];
  $422 = $34;
  $423 = +HEAPF32[$422>>2];
  $424 = $34;
  $425 = ((($424)) + 4|0);
  $426 = +HEAPF32[$425>>2];
  $427 = $423 + $426;
  $428 = $427 + 9.9999996826552254E-21;
  $429 = $421 / $428;
  $430 = $26;
  $431 = $35;
  $432 = (($430) + ($431<<2)|0);
  HEAPF32[$432>>2] = $429;
  $433 = $35;
  $434 = (($433) + 1)|0;
  $35 = $434;
  $435 = $34;
  $436 = ((($435)) + 8|0);
  $34 = $436;
 }
 $36 = 0;
 while(1) {
  $437 = $36;
  $438 = $7;
  $439 = ($437|0)<($438|0);
  if (!($439)) {
   break;
  }
  $37 = 0;
  while(1) {
   $440 = $37;
   $441 = $6;
   $442 = ($440|0)<($441|0);
   if (!($442)) {
    break;
   }
   $443 = $37;
   $444 = $8;
   $445 = ($443|0)<($444|0);
   if ($445) {
    label = 55;
   } else {
    $446 = $37;
    $447 = $9;
    $448 = ($446|0)>=($447|0);
    if ($448) {
     label = 55;
    } else {
     $449 = $36;
     $450 = $10;
     $451 = ($449|0)<($450|0);
     if ($451) {
      label = 55;
     } else {
      $452 = $36;
      $453 = $11;
      $454 = ($452|0)>($453|0);
      if ($454) {
       label = 55;
      } else {
       $462 = $26;
       $463 = $37;
       $464 = $8;
       $465 = (($463) - ($464))|0;
       $466 = $36;
       $467 = $10;
       $468 = (($466) - ($467))|0;
       $469 = $14;
       $470 = Math_imul($468, $469)|0;
       $471 = (($465) + ($470))|0;
       $472 = (($462) + ($471<<2)|0);
       $473 = +HEAPF32[$472>>2];
       $474 = $473;
       $475 = $474 > 0.5;
       $476 = $475 ? 127 : 126;
       $477 = $5;
       $478 = $37;
       $479 = $36;
       $480 = $6;
       $481 = Math_imul($479, $480)|0;
       $482 = (($478) + ($481))|0;
       $483 = (($477) + ($482)|0);
       HEAP8[$483>>0] = $476;
       $484 = $22;
       $485 = $37;
       $486 = $8;
       $487 = (($485) - ($486))|0;
       $488 = $36;
       $489 = $10;
       $490 = (($488) - ($489))|0;
       $491 = $14;
       $492 = Math_imul($490, $491)|0;
       $493 = (($487) + ($492))|0;
       $494 = (($484) + ($493<<2)|0);
       $495 = HEAP32[$494>>2]|0;
       $496 = ($495|0)==(0);
       if ($496) {
        $497 = $5;
        $498 = $37;
        $499 = $36;
        $500 = $6;
        $501 = Math_imul($499, $500)|0;
        $502 = (($498) + ($501))|0;
        $503 = (($497) + ($502)|0);
        HEAP8[$503>>0] = 126;
       }
       $504 = $22;
       $505 = $37;
       $506 = $8;
       $507 = (($505) - ($506))|0;
       $508 = $36;
       $509 = $10;
       $510 = (($508) - ($509))|0;
       $511 = $14;
       $512 = Math_imul($510, $511)|0;
       $513 = (($507) + ($512))|0;
       $514 = (($504) + ($513<<2)|0);
       $515 = HEAP32[$514>>2]|0;
       $516 = ($515|0)==(255);
       if ($516) {
        $517 = $5;
        $518 = $37;
        $519 = $36;
        $520 = $6;
        $521 = Math_imul($519, $520)|0;
        $522 = (($518) + ($521))|0;
        $523 = (($517) + ($522)|0);
        HEAP8[$523>>0] = 127;
       }
      }
     }
    }
   }
   if ((label|0) == 55) {
    label = 0;
    $455 = $5;
    $456 = $37;
    $457 = $36;
    $458 = $6;
    $459 = Math_imul($457, $458)|0;
    $460 = (($456) + ($459))|0;
    $461 = (($455) + ($460)|0);
    HEAP8[$461>>0] = 126;
   }
   $524 = $37;
   $525 = (($524) + 1)|0;
   $37 = $525;
  }
  $526 = $36;
  $527 = (($526) + 1)|0;
  $36 = $527;
 }
 $528 = $18;
 $529 = ($528|0)==(0|0);
 if (!($529)) {
  __ZdaPv($528);
 }
 $530 = $23;
 $531 = ($530|0)==(0|0);
 if (!($531)) {
  __ZdaPv($530);
 }
 $532 = $26;
 $533 = ($532|0)==(0|0);
 if (!($533)) {
  __ZdaPv($532);
 }
 $534 = $29;
 $535 = ($534|0)==(0|0);
 if (!($535)) {
  __ZdaPv($534);
 }
 $536 = $19;
 $537 = ($536|0)==(0|0);
 if (!($537)) {
  __ZdaPv($536);
 }
 $538 = $22;
 $539 = ($538|0)==(0|0);
 if ($539) {
  __ZN10DenseCRF2DD2Ev($33);
  __ZN5CmGMMD2Ev($32);
  __ZN5CmGMMD2Ev($31);
  STACKTOP = sp;return 0;
 }
 __ZdaPv($538);
 __ZN10DenseCRF2DD2Ev($33);
 __ZN5CmGMMD2Ev($32);
 __ZN5CmGMMD2Ev($31);
 STACKTOP = sp;return 0;
}
function __ZN5CmGMMC2Eid($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = +$2;
 var $3 = 0, $4 = 0, $5 = 0.0, $6 = 0, $7 = 0, $8 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 $8 = $5;
 __ZN6CmGMM_ILi3EEC2Eid($6,$7,$8);
 STACKTOP = sp;return;
}
function __ZN6CmGMM_ILi3EE9BuildGMMsEPfS1_ii($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$arith = 0, $$arith2 = 0, $$overflow = 0, $$overflow3 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0.0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0;
 var $114 = 0.0, $115 = 0, $116 = 0.0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0;
 var $132 = 0, $133 = 0, $134 = 0.0, $135 = 0, $136 = 0, $137 = 0, $138 = 0.0, $139 = 0.0, $14 = 0, $140 = 0.0, $141 = 0.0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0;
 var $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0;
 var $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0.0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0.0, $183 = 0.0, $184 = 0.0, $185 = 0.0, $186 = 0.0;
 var $187 = 0, $188 = 0, $189 = 0.0, $19 = 0, $190 = 0.0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0.0, $204 = 0;
 var $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0.0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0;
 var $223 = 0, $224 = 0, $225 = 0, $226 = 0.0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0.0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0;
 var $241 = 0, $242 = 0, $243 = 0, $244 = 0.0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0.0, $250 = 0.0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0;
 var $26 = 0, $260 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0.0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0.0, $57 = 0.0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0.0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0;
 var dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 240|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(240|0);
 $23 = sp + 16|0;
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 $35 = $5;
 $10 = 1;
 $36 = $9;
 $11 = $36;
 $37 = $8;
 $12 = $37;
 $38 = $11;
 $39 = $12;
 $40 = Math_imul($38, $39)|0;
 $$arith2 = $40<<2;
 $$overflow3 = ($40>>>0)>(1073741823);
 $41 = $$overflow3 ? -1 : $$arith2;
 $42 = (__Znaj($41)|0);
 $13 = $42;
 $14 = 0;
 while(1) {
  $43 = $14;
  $44 = $11;
  $45 = $12;
  $46 = Math_imul($44, $45)|0;
  $47 = ($43|0)<($46|0);
  if (!($47)) {
   break;
  }
  $48 = $13;
  $49 = $14;
  $50 = (($48) + ($49<<2)|0);
  HEAP32[$50>>2] = 0;
  $51 = $14;
  $52 = (($51) + 1)|0;
  $14 = $52;
 }
 $53 = $7;
 $54 = $8;
 $55 = $9;
 $56 = (+__ZN6CmGMM_ILi3EE9sumweightEPfii($35,$53,$54,$55));
 $57 = $56;
 $58 = ((($35)) + 8|0);
 HEAPF64[$58>>3] = $57;
 $59 = HEAP32[$35>>2]|0;
 $$arith = ($59*104)|0;
 $$overflow = ($59>>>0)>(41297762);
 $60 = $$overflow ? -1 : $$arith;
 $61 = (__Znaj($60)|0);
 $62 = ($59|0)==(0);
 if (!($62)) {
  $63 = (($61) + (($59*104)|0)|0);
  $64 = $61;
  while(1) {
   __ZN16CmGaussianFitterILi3EEC2Ev($64);
   $65 = ((($64)) + 104|0);
   $66 = ($65|0)==($63|0);
   if ($66) {
    break;
   } else {
    $64 = $65;
   }
  }
 }
 $15 = $61;
 $16 = 0;
 while(1) {
  $67 = $16;
  $68 = $11;
  $69 = ($67|0)<($68|0);
  if (!($69)) {
   break;
  }
  $70 = $13;
  $71 = $16;
  $72 = $12;
  $73 = Math_imul($71, $72)|0;
  $74 = (($70) + ($73<<2)|0);
  $17 = $74;
  $75 = $6;
  $76 = $16;
  $77 = $12;
  $78 = Math_imul($76, $77)|0;
  $79 = ($78*3)|0;
  $80 = (($75) + ($79<<2)|0);
  $18 = $80;
  $81 = $7;
  $82 = $16;
  $83 = $12;
  $84 = Math_imul($82, $83)|0;
  $85 = (($81) + ($84<<2)|0);
  $19 = $85;
  $20 = 0;
  while(1) {
   $86 = $20;
   $87 = $12;
   $88 = ($86|0)<($87|0);
   if (!($88)) {
    break;
   }
   $89 = $15;
   $90 = $18;
   $91 = $19;
   $92 = $20;
   $93 = (($91) + ($92<<2)|0);
   $94 = +HEAPF32[$93>>2];
   __ZN16CmGaussianFitterILi3EE3AddIfEEvPKT_S2_($89,$90,$94);
   $95 = $20;
   $96 = (($95) + 1)|0;
   $20 = $96;
   $97 = $18;
   $98 = ((($97)) + 12|0);
   $18 = $98;
  }
  $99 = $16;
  $100 = (($99) + 1)|0;
  $16 = $100;
 }
 $101 = $15;
 $102 = ((($35)) + 24|0);
 $103 = HEAP32[$102>>2]|0;
 $104 = ((($35)) + 8|0);
 $105 = +HEAPF64[$104>>3];
 __ZNK16CmGaussianFitterILi3EE13BuildGuassianER10CmGaussianILi3EEdb($101,$103,$105,0);
 $21 = 0;
 $22 = 1;
 while(1) {
  $106 = $22;
  $107 = HEAP32[$35>>2]|0;
  $108 = ($106|0)<($107|0);
  if (!($108)) {
   break;
  }
  $109 = ((($35)) + 24|0);
  $110 = HEAP32[$109>>2]|0;
  $111 = $21;
  $112 = (($110) + (($111*280)|0)|0);
  $113 = ((($112)) + 184|0);
  $114 = +HEAPF64[$113>>3];
  $115 = ((($35)) + 16|0);
  $116 = +HEAPF64[$115>>3];
  $117 = $114 < $116;
  if ($117) {
   label = 16;
   break;
  }
  __ZN16CmGaussianFitterILi3EEC2Ev($23);
  $121 = $15;
  $122 = $21;
  $123 = (($121) + (($122*104)|0)|0);
  dest=$123; src=$23; stop=dest+104|0; do { HEAP32[dest>>2]=HEAP32[src>>2]|0; dest=dest+4|0; src=src+4|0; } while ((dest|0) < (stop|0));
  $124 = ((($35)) + 24|0);
  $125 = HEAP32[$124>>2]|0;
  $126 = $21;
  $127 = (($125) + (($126*280)|0)|0);
  $24 = $127;
  $25 = 0.0;
  $26 = 0;
  while(1) {
   $128 = $26;
   $129 = ($128|0)<(3);
   if (!($129)) {
    break;
   }
   $130 = $24;
   $131 = ((($130)) + 208|0);
   $132 = $26;
   $133 = (($131) + (($132*24)|0)|0);
   $134 = +HEAPF64[$133>>3];
   $135 = $24;
   $136 = $26;
   $137 = (($135) + ($136<<3)|0);
   $138 = +HEAPF64[$137>>3];
   $139 = $134 * $138;
   $140 = $25;
   $141 = $140 + $139;
   $25 = $141;
   $142 = $26;
   $143 = (($142) + 1)|0;
   $26 = $143;
  }
  $27 = 0;
  while(1) {
   $144 = $27;
   $145 = $11;
   $146 = ($144|0)<($145|0);
   if (!($146)) {
    break;
   }
   $147 = $13;
   $148 = $27;
   $149 = $12;
   $150 = Math_imul($148, $149)|0;
   $151 = (($147) + ($150<<2)|0);
   $28 = $151;
   $152 = $6;
   $153 = $27;
   $154 = $12;
   $155 = Math_imul($153, $154)|0;
   $156 = ($155*3)|0;
   $157 = (($152) + ($156<<2)|0);
   $29 = $157;
   $158 = $7;
   $159 = $27;
   $160 = $12;
   $161 = Math_imul($159, $160)|0;
   $162 = (($158) + ($161<<2)|0);
   $30 = $162;
   $31 = 0;
   while(1) {
    $163 = $31;
    $164 = $12;
    $165 = ($163|0)<($164|0);
    if (!($165)) {
     break;
    }
    $166 = $28;
    $167 = $31;
    $168 = (($166) + ($167<<2)|0);
    $169 = HEAP32[$168>>2]|0;
    $170 = $21;
    $171 = ($169|0)!=($170|0);
    do {
     if (!($171)) {
      $32 = 0.0;
      $33 = 0;
      while(1) {
       $172 = $33;
       $173 = ($172|0)<(3);
       if (!($173)) {
        break;
       }
       $174 = $24;
       $175 = ((($174)) + 208|0);
       $176 = $33;
       $177 = (($175) + (($176*24)|0)|0);
       $178 = +HEAPF64[$177>>3];
       $179 = $29;
       $180 = $33;
       $181 = (($179) + ($180<<2)|0);
       $182 = +HEAPF32[$181>>2];
       $183 = $182;
       $184 = $178 * $183;
       $185 = $32;
       $186 = $185 + $184;
       $32 = $186;
       $187 = $33;
       $188 = (($187) + 1)|0;
       $33 = $188;
      }
      $189 = $32;
      $190 = $25;
      $191 = $189 > $190;
      if ($191) {
       $192 = $22;
       $193 = $28;
       $194 = $31;
       $195 = (($193) + ($194<<2)|0);
       HEAP32[$195>>2] = $192;
       $196 = $15;
       $197 = $22;
       $198 = (($196) + (($197*104)|0)|0);
       $199 = $29;
       $200 = $30;
       $201 = $31;
       $202 = (($200) + ($201<<2)|0);
       $203 = +HEAPF32[$202>>2];
       __ZN16CmGaussianFitterILi3EE3AddIfEEvPKT_S2_($198,$199,$203);
       break;
      } else {
       $204 = $15;
       $205 = $21;
       $206 = (($204) + (($205*104)|0)|0);
       $207 = $29;
       $208 = $30;
       $209 = $31;
       $210 = (($208) + ($209<<2)|0);
       $211 = +HEAPF32[$210>>2];
       __ZN16CmGaussianFitterILi3EE3AddIfEEvPKT_S2_($206,$207,$211);
       break;
      }
     }
    } while(0);
    $212 = $31;
    $213 = (($212) + 1)|0;
    $31 = $213;
    $214 = $29;
    $215 = ((($214)) + 12|0);
    $29 = $215;
   }
   $216 = $27;
   $217 = (($216) + 1)|0;
   $27 = $217;
  }
  $218 = $15;
  $219 = $21;
  $220 = (($218) + (($219*104)|0)|0);
  $221 = ((($35)) + 24|0);
  $222 = HEAP32[$221>>2]|0;
  $223 = $21;
  $224 = (($222) + (($223*280)|0)|0);
  $225 = ((($35)) + 8|0);
  $226 = +HEAPF64[$225>>3];
  __ZNK16CmGaussianFitterILi3EE13BuildGuassianER10CmGaussianILi3EEdb($220,$224,$226,0);
  $227 = $15;
  $228 = $22;
  $229 = (($227) + (($228*104)|0)|0);
  $230 = ((($35)) + 24|0);
  $231 = HEAP32[$230>>2]|0;
  $232 = $22;
  $233 = (($231) + (($232*280)|0)|0);
  $234 = ((($35)) + 8|0);
  $235 = +HEAPF64[$234>>3];
  __ZNK16CmGaussianFitterILi3EE13BuildGuassianER10CmGaussianILi3EEdb($229,$233,$235,0);
  $21 = 0;
  $34 = 0;
  while(1) {
   $236 = $34;
   $237 = $22;
   $238 = ($236|0)<=($237|0);
   if (!($238)) {
    break;
   }
   $239 = ((($35)) + 24|0);
   $240 = HEAP32[$239>>2]|0;
   $241 = $34;
   $242 = (($240) + (($241*280)|0)|0);
   $243 = ((($242)) + 184|0);
   $244 = +HEAPF64[$243>>3];
   $245 = ((($35)) + 24|0);
   $246 = HEAP32[$245>>2]|0;
   $247 = $21;
   $248 = (($246) + (($247*280)|0)|0);
   $249 = ((($248)) + 184|0);
   $250 = +HEAPF64[$249>>3];
   $251 = $244 > $250;
   if ($251) {
    $252 = $34;
    $21 = $252;
   }
   $253 = $34;
   $254 = (($253) + 1)|0;
   $34 = $254;
  }
  $255 = $22;
  $256 = (($255) + 1)|0;
  $22 = $256;
 }
 if ((label|0) == 16) {
  $118 = $22;
  HEAP32[$35>>2] = $118;
  $119 = $15;
  $120 = ($119|0)==(0|0);
  if ($120) {
   STACKTOP = sp;return;
  }
  __ZdaPv($119);
  STACKTOP = sp;return;
 }
 $257 = $15;
 $258 = ($257|0)==(0|0);
 if (!($258)) {
  __ZdaPv($257);
 }
 $259 = $13;
 $260 = ($259|0)==(0|0);
 if ($260) {
  STACKTOP = sp;return;
 }
 __ZdaPv($259);
 STACKTOP = sp;return;
}
function __ZN5CmGMMD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN6CmGMM_ILi3EED2Ev($2);
 STACKTOP = sp;return;
}
function __ZN6CmGMM_ILi3EED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 24|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)!=(0|0);
 if ($5) {
  $6 = ((($2)) + 24|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = ($7|0)==(0|0);
  if (!($8)) {
   __ZdaPv($7);
  }
 }
 STACKTOP = sp;return;
}
function __ZN6CmGMM_ILi3EE9sumweightEPfii($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0.0, $19 = 0.0, $20 = 0.0, $21 = 0, $22 = 0, $23 = 0.0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = 0.0;
 $9 = 0;
 while(1) {
  $10 = $9;
  $11 = $6;
  $12 = $7;
  $13 = Math_imul($11, $12)|0;
  $14 = ($10|0)<($13|0);
  if (!($14)) {
   break;
  }
  $15 = $5;
  $16 = $9;
  $17 = (($15) + ($16<<2)|0);
  $18 = +HEAPF32[$17>>2];
  $19 = $8;
  $20 = $19 + $18;
  $8 = $20;
  $21 = $9;
  $22 = (($21) + 1)|0;
  $9 = $22;
 }
 $23 = $8;
 STACKTOP = sp;return (+$23);
}
function __ZN16CmGaussianFitterILi3EEC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZN16CmGaussianFitterILi3EE5ResetEv($2);
 STACKTOP = sp;return;
}
function __ZN16CmGaussianFitterILi3EE3AddIfEEvPKT_S2_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = +$2;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0.0, $18 = 0.0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0.0, $24 = 0.0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0.0;
 var $3 = 0, $30 = 0.0, $31 = 0.0, $32 = 0, $33 = 0, $34 = 0.0, $35 = 0.0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0.0, $41 = 0, $42 = 0, $43 = 0.0, $44 = 0.0, $45 = 0.0, $46 = 0.0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0.0, $50 = 0, $51 = 0, $52 = 0.0, $53 = 0.0, $54 = 0, $55 = 0, $56 = 0, $57 = 0.0, $58 = 0, $59 = 0.0, $6 = 0, $60 = 0.0, $7 = 0, $8 = 0.0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $6 = sp + 8|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $11 = $3;
 $7 = 0;
 while(1) {
  $12 = $7;
  $13 = ($12|0)<(3);
  if (!($13)) {
   break;
  }
  $14 = $4;
  $15 = $7;
  $16 = (($14) + ($15<<2)|0);
  $17 = +HEAPF32[$16>>2];
  $18 = $17;
  $19 = $7;
  $20 = (($6) + ($19<<3)|0);
  HEAPF64[$20>>3] = $18;
  $21 = $7;
  $22 = (($21) + 1)|0;
  $7 = $22;
 }
 $23 = $5;
 $24 = $23;
 $8 = $24;
 $9 = 0;
 while(1) {
  $25 = $9;
  $26 = ($25|0)<(3);
  if (!($26)) {
   break;
  }
  $27 = $9;
  $28 = (($6) + ($27<<3)|0);
  $29 = +HEAPF64[$28>>3];
  $30 = $8;
  $31 = $29 * $30;
  $32 = $9;
  $33 = (($11) + ($32<<3)|0);
  $34 = +HEAPF64[$33>>3];
  $35 = $34 + $31;
  HEAPF64[$33>>3] = $35;
  $10 = 0;
  while(1) {
   $36 = $10;
   $37 = ($36|0)<(3);
   $38 = $9;
   if (!($37)) {
    break;
   }
   $39 = (($6) + ($38<<3)|0);
   $40 = +HEAPF64[$39>>3];
   $41 = $10;
   $42 = (($6) + ($41<<3)|0);
   $43 = +HEAPF64[$42>>3];
   $44 = $40 * $43;
   $45 = $8;
   $46 = $44 * $45;
   $47 = ((($11)) + 24|0);
   $48 = $9;
   $49 = (($47) + (($48*24)|0)|0);
   $50 = $10;
   $51 = (($49) + ($50<<3)|0);
   $52 = +HEAPF64[$51>>3];
   $53 = $52 + $46;
   HEAPF64[$51>>3] = $53;
   $54 = $10;
   $55 = (($54) + 1)|0;
   $10 = $55;
  }
  $56 = (($38) + 1)|0;
  $9 = $56;
 }
 $57 = $8;
 $58 = ((($11)) + 96|0);
 $59 = +HEAPF64[$58>>3];
 $60 = $59 + $57;
 HEAPF64[$58>>3] = $60;
 STACKTOP = sp;return;
}
function __ZNK16CmGaussianFitterILi3EE13BuildGuassianER10CmGaussianILi3EEdb($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = +$2;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0.0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0.0, $24 = 0, $25 = 0.0, $26 = 0.0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0.0, $42 = 0, $43 = 0.0, $44 = 0.0, $45 = 0, $46 = 0, $47 = 0, $48 = 0.0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0.0, $53 = 0.0, $54 = 0.0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0.0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0.0, $7 = 0, $70 = 0.0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0.0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0.0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0.0;
 var $85 = 0, $86 = 0.0, $87 = 0.0, $88 = 0.0, $89 = 0, $9 = 0, $90 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $12 = $3&1;
 $7 = $12;
 $13 = $4;
 $8 = 1.111111111111111E-8;
 $14 = ((($13)) + 96|0);
 $15 = +HEAPF64[$14>>3];
 $16 = $15 < 1.111111111111111E-8;
 if ($16) {
  $17 = $5;
  $18 = ((($17)) + 176|0);
  HEAPF64[$18>>3] = 0.0;
  STACKTOP = sp;return;
 }
 $9 = 0;
 while(1) {
  $19 = $9;
  $20 = ($19|0)<(3);
  if (!($20)) {
   break;
  }
  $21 = $9;
  $22 = (($13) + ($21<<3)|0);
  $23 = +HEAPF64[$22>>3];
  $24 = ((($13)) + 96|0);
  $25 = +HEAPF64[$24>>3];
  $26 = $23 / $25;
  $27 = $5;
  $28 = $9;
  $29 = (($27) + ($28<<3)|0);
  HEAPF64[$29>>3] = $26;
  $30 = $9;
  $31 = (($30) + 1)|0;
  $9 = $31;
 }
 $10 = 0;
 while(1) {
  $32 = $10;
  $33 = ($32|0)<(3);
  if (!($33)) {
   break;
  }
  $11 = 0;
  while(1) {
   $34 = $11;
   $35 = ($34|0)<(3);
   if (!($35)) {
    break;
   }
   $36 = ((($13)) + 24|0);
   $37 = $10;
   $38 = (($36) + (($37*24)|0)|0);
   $39 = $11;
   $40 = (($38) + ($39<<3)|0);
   $41 = +HEAPF64[$40>>3];
   $42 = ((($13)) + 96|0);
   $43 = +HEAPF64[$42>>3];
   $44 = $41 / $43;
   $45 = $5;
   $46 = $10;
   $47 = (($45) + ($46<<3)|0);
   $48 = +HEAPF64[$47>>3];
   $49 = $5;
   $50 = $11;
   $51 = (($49) + ($50<<3)|0);
   $52 = +HEAPF64[$51>>3];
   $53 = $48 * $52;
   $54 = $44 - $53;
   $55 = $5;
   $56 = ((($55)) + 24|0);
   $57 = $10;
   $58 = (($56) + (($57*24)|0)|0);
   $59 = $11;
   $60 = (($58) + ($59<<3)|0);
   HEAPF64[$60>>3] = $54;
   $61 = $11;
   $62 = (($61) + 1)|0;
   $11 = $62;
  }
  $63 = $5;
  $64 = ((($63)) + 24|0);
  $65 = $10;
  $66 = (($64) + (($65*24)|0)|0);
  $67 = $10;
  $68 = (($66) + ($67<<3)|0);
  $69 = +HEAPF64[$68>>3];
  $70 = $69 + 1.111111111111111E-8;
  HEAPF64[$68>>3] = $70;
  $71 = $10;
  $72 = (($71) + 1)|0;
  $10 = $72;
 }
 $73 = $5;
 $74 = ((($73)) + 24|0);
 $75 = (+__ZNK16CmGaussianFitterILi3EE11determinantEPA3_d($13,$74));
 $76 = $5;
 $77 = ((($76)) + 96|0);
 HEAPF64[$77>>3] = $75;
 $78 = $5;
 $79 = ((($78)) + 24|0);
 $80 = $5;
 $81 = ((($80)) + 104|0);
 $82 = $5;
 $83 = ((($82)) + 96|0);
 $84 = +HEAPF64[$83>>3];
 __ZNK16CmGaussianFitterILi3EE6invertEPA3_dS2_d($13,$79,$81,$84);
 $85 = ((($13)) + 96|0);
 $86 = +HEAPF64[$85>>3];
 $87 = $6;
 $88 = $86 / $87;
 $89 = $5;
 $90 = ((($89)) + 176|0);
 HEAPF64[$90>>3] = $88;
 STACKTOP = sp;return;
}
function __ZNK16CmGaussianFitterILi3EE11determinantEPA3_d($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0.0, $16 = 0.0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0.0, $21 = 0, $22 = 0, $23 = 0, $24 = 0.0, $25 = 0.0, $26 = 0.0, $27 = 0, $28 = 0;
 var $29 = 0.0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0.0, $34 = 0.0, $35 = 0, $36 = 0, $37 = 0, $38 = 0.0, $39 = 0, $4 = 0.0, $40 = 0, $41 = 0.0, $42 = 0.0, $43 = 0.0, $44 = 0, $45 = 0, $46 = 0.0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0.0, $50 = 0.0, $51 = 0.0, $52 = 0, $53 = 0, $54 = 0, $55 = 0.0, $56 = 0, $57 = 0, $58 = 0.0, $59 = 0.0, $6 = 0.0, $60 = 0.0, $61 = 0.0, $62 = 0, $63 = 0.0, $64 = 0.0;
 var $65 = 0.0, $66 = 0, $67 = 0, $68 = 0.0, $69 = 0.0, $7 = 0.0, $70 = 0.0, $71 = 0.0, $72 = 0, $73 = 0, $74 = 0.0, $75 = 0.0, $76 = 0.0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $2 = $0;
 $3 = $1;
 $4 = 0.0;
 $8 = $3;
 $9 = ((($8)) + 24|0);
 $10 = ((($9)) + 8|0);
 $11 = +HEAPF64[$10>>3];
 $12 = $3;
 $13 = ((($12)) + 48|0);
 $14 = ((($13)) + 16|0);
 $15 = +HEAPF64[$14>>3];
 $16 = $11 * $15;
 $17 = $3;
 $18 = ((($17)) + 24|0);
 $19 = ((($18)) + 16|0);
 $20 = +HEAPF64[$19>>3];
 $21 = $3;
 $22 = ((($21)) + 48|0);
 $23 = ((($22)) + 8|0);
 $24 = +HEAPF64[$23>>3];
 $25 = $20 * $24;
 $26 = $16 - $25;
 $5 = $26;
 $27 = $3;
 $28 = ((($27)) + 24|0);
 $29 = +HEAPF64[$28>>3];
 $30 = $3;
 $31 = ((($30)) + 48|0);
 $32 = ((($31)) + 16|0);
 $33 = +HEAPF64[$32>>3];
 $34 = $29 * $33;
 $35 = $3;
 $36 = ((($35)) + 24|0);
 $37 = ((($36)) + 16|0);
 $38 = +HEAPF64[$37>>3];
 $39 = $3;
 $40 = ((($39)) + 48|0);
 $41 = +HEAPF64[$40>>3];
 $42 = $38 * $41;
 $43 = $34 - $42;
 $6 = $43;
 $44 = $3;
 $45 = ((($44)) + 24|0);
 $46 = +HEAPF64[$45>>3];
 $47 = $3;
 $48 = ((($47)) + 48|0);
 $49 = ((($48)) + 8|0);
 $50 = +HEAPF64[$49>>3];
 $51 = $46 * $50;
 $52 = $3;
 $53 = ((($52)) + 24|0);
 $54 = ((($53)) + 8|0);
 $55 = +HEAPF64[$54>>3];
 $56 = $3;
 $57 = ((($56)) + 48|0);
 $58 = +HEAPF64[$57>>3];
 $59 = $55 * $58;
 $60 = $51 - $59;
 $7 = $60;
 $61 = $5;
 $62 = $3;
 $63 = +HEAPF64[$62>>3];
 $64 = $61 * $63;
 $65 = $6;
 $66 = $3;
 $67 = ((($66)) + 8|0);
 $68 = +HEAPF64[$67>>3];
 $69 = $65 * $68;
 $70 = $64 - $69;
 $71 = $7;
 $72 = $3;
 $73 = ((($72)) + 16|0);
 $74 = +HEAPF64[$73>>3];
 $75 = $71 * $74;
 $76 = $70 + $75;
 $4 = $76;
 STACKTOP = sp;return (+$76);
}
function __ZNK16CmGaussianFitterILi3EE6invertEPA3_dS2_d($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = +$3;
 var $10 = 0, $100 = 0.0, $101 = 0.0, $102 = 0, $103 = 0, $104 = 0.0, $105 = 0, $106 = 0, $107 = 0.0, $108 = 0.0, $109 = 0.0, $11 = 0.0, $110 = 0.0, $111 = 0.0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0.0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0.0, $121 = 0.0, $122 = 0, $123 = 0, $124 = 0.0, $125 = 0, $126 = 0, $127 = 0.0, $128 = 0.0, $129 = 0.0, $13 = 0, $130 = 0.0, $131 = 0.0, $132 = 0.0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0.0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0.0, $143 = 0.0, $144 = 0, $145 = 0, $146 = 0.0, $147 = 0, $148 = 0, $149 = 0, $15 = 0.0, $150 = 0.0, $151 = 0.0, $152 = 0.0, $153 = 0.0;
 var $154 = 0.0, $155 = 0, $156 = 0, $157 = 0, $158 = 0.0, $159 = 0, $16 = 0.0, $160 = 0, $161 = 0, $162 = 0.0, $163 = 0.0, $164 = 0, $165 = 0, $166 = 0.0, $167 = 0, $168 = 0, $169 = 0.0, $17 = 0, $170 = 0.0, $171 = 0.0;
 var $172 = 0.0, $173 = 0.0, $174 = 0.0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0.0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0.0, $184 = 0.0, $185 = 0, $186 = 0, $187 = 0.0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0.0, $191 = 0.0, $192 = 0.0, $193 = 0.0, $194 = 0.0, $195 = 0, $196 = 0, $197 = 0, $20 = 0.0, $21 = 0, $22 = 0, $23 = 0, $24 = 0.0, $25 = 0.0, $26 = 0.0, $27 = 0.0, $28 = 0.0, $29 = 0, $30 = 0, $31 = 0;
 var $32 = 0.0, $33 = 0, $34 = 0, $35 = 0, $36 = 0.0, $37 = 0.0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0.0, $42 = 0, $43 = 0, $44 = 0.0, $45 = 0.0, $46 = 0.0, $47 = 0.0, $48 = 0.0, $49 = 0.0, $5 = 0;
 var $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0.0, $55 = 0, $56 = 0, $57 = 0, $58 = 0.0, $59 = 0.0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0.0, $64 = 0, $65 = 0, $66 = 0.0, $67 = 0.0, $68 = 0.0;
 var $69 = 0.0, $7 = 0.0, $70 = 0.0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0.0, $76 = 0, $77 = 0, $78 = 0, $79 = 0.0, $8 = 0, $80 = 0.0, $81 = 0, $82 = 0, $83 = 0.0, $84 = 0, $85 = 0, $86 = 0;
 var $87 = 0.0, $88 = 0.0, $89 = 0.0, $9 = 0, $90 = 0.0, $91 = 0.0, $92 = 0.0, $93 = 0, $94 = 0, $95 = 0, $96 = 0.0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = $5;
 $9 = ((($8)) + 24|0);
 $10 = ((($9)) + 8|0);
 $11 = +HEAPF64[$10>>3];
 $12 = $5;
 $13 = ((($12)) + 48|0);
 $14 = ((($13)) + 16|0);
 $15 = +HEAPF64[$14>>3];
 $16 = $11 * $15;
 $17 = $5;
 $18 = ((($17)) + 24|0);
 $19 = ((($18)) + 16|0);
 $20 = +HEAPF64[$19>>3];
 $21 = $5;
 $22 = ((($21)) + 48|0);
 $23 = ((($22)) + 8|0);
 $24 = +HEAPF64[$23>>3];
 $25 = $20 * $24;
 $26 = $16 - $25;
 $27 = $7;
 $28 = $26 / $27;
 $29 = $6;
 HEAPF64[$29>>3] = $28;
 $30 = $5;
 $31 = ((($30)) + 24|0);
 $32 = +HEAPF64[$31>>3];
 $33 = $5;
 $34 = ((($33)) + 48|0);
 $35 = ((($34)) + 16|0);
 $36 = +HEAPF64[$35>>3];
 $37 = $32 * $36;
 $38 = $5;
 $39 = ((($38)) + 24|0);
 $40 = ((($39)) + 16|0);
 $41 = +HEAPF64[$40>>3];
 $42 = $5;
 $43 = ((($42)) + 48|0);
 $44 = +HEAPF64[$43>>3];
 $45 = $41 * $44;
 $46 = $37 - $45;
 $47 = $46 * -1.0;
 $48 = $7;
 $49 = $47 / $48;
 $50 = $6;
 $51 = ((($50)) + 8|0);
 HEAPF64[$51>>3] = $49;
 $52 = $5;
 $53 = ((($52)) + 24|0);
 $54 = +HEAPF64[$53>>3];
 $55 = $5;
 $56 = ((($55)) + 48|0);
 $57 = ((($56)) + 8|0);
 $58 = +HEAPF64[$57>>3];
 $59 = $54 * $58;
 $60 = $5;
 $61 = ((($60)) + 24|0);
 $62 = ((($61)) + 8|0);
 $63 = +HEAPF64[$62>>3];
 $64 = $5;
 $65 = ((($64)) + 48|0);
 $66 = +HEAPF64[$65>>3];
 $67 = $63 * $66;
 $68 = $59 - $67;
 $69 = $7;
 $70 = $68 / $69;
 $71 = $6;
 $72 = ((($71)) + 16|0);
 HEAPF64[$72>>3] = $70;
 $73 = $5;
 $74 = ((($73)) + 8|0);
 $75 = +HEAPF64[$74>>3];
 $76 = $5;
 $77 = ((($76)) + 48|0);
 $78 = ((($77)) + 16|0);
 $79 = +HEAPF64[$78>>3];
 $80 = $75 * $79;
 $81 = $5;
 $82 = ((($81)) + 16|0);
 $83 = +HEAPF64[$82>>3];
 $84 = $5;
 $85 = ((($84)) + 48|0);
 $86 = ((($85)) + 8|0);
 $87 = +HEAPF64[$86>>3];
 $88 = $83 * $87;
 $89 = $80 - $88;
 $90 = $89 * -1.0;
 $91 = $7;
 $92 = $90 / $91;
 $93 = $6;
 $94 = ((($93)) + 24|0);
 HEAPF64[$94>>3] = $92;
 $95 = $5;
 $96 = +HEAPF64[$95>>3];
 $97 = $5;
 $98 = ((($97)) + 48|0);
 $99 = ((($98)) + 16|0);
 $100 = +HEAPF64[$99>>3];
 $101 = $96 * $100;
 $102 = $5;
 $103 = ((($102)) + 16|0);
 $104 = +HEAPF64[$103>>3];
 $105 = $5;
 $106 = ((($105)) + 48|0);
 $107 = +HEAPF64[$106>>3];
 $108 = $104 * $107;
 $109 = $101 - $108;
 $110 = $7;
 $111 = $109 / $110;
 $112 = $6;
 $113 = ((($112)) + 24|0);
 $114 = ((($113)) + 8|0);
 HEAPF64[$114>>3] = $111;
 $115 = $5;
 $116 = +HEAPF64[$115>>3];
 $117 = $5;
 $118 = ((($117)) + 48|0);
 $119 = ((($118)) + 8|0);
 $120 = +HEAPF64[$119>>3];
 $121 = $116 * $120;
 $122 = $5;
 $123 = ((($122)) + 8|0);
 $124 = +HEAPF64[$123>>3];
 $125 = $5;
 $126 = ((($125)) + 48|0);
 $127 = +HEAPF64[$126>>3];
 $128 = $124 * $127;
 $129 = $121 - $128;
 $130 = $129 * -1.0;
 $131 = $7;
 $132 = $130 / $131;
 $133 = $6;
 $134 = ((($133)) + 24|0);
 $135 = ((($134)) + 16|0);
 HEAPF64[$135>>3] = $132;
 $136 = $5;
 $137 = ((($136)) + 8|0);
 $138 = +HEAPF64[$137>>3];
 $139 = $5;
 $140 = ((($139)) + 24|0);
 $141 = ((($140)) + 16|0);
 $142 = +HEAPF64[$141>>3];
 $143 = $138 * $142;
 $144 = $5;
 $145 = ((($144)) + 16|0);
 $146 = +HEAPF64[$145>>3];
 $147 = $5;
 $148 = ((($147)) + 24|0);
 $149 = ((($148)) + 8|0);
 $150 = +HEAPF64[$149>>3];
 $151 = $146 * $150;
 $152 = $143 - $151;
 $153 = $7;
 $154 = $152 / $153;
 $155 = $6;
 $156 = ((($155)) + 48|0);
 HEAPF64[$156>>3] = $154;
 $157 = $5;
 $158 = +HEAPF64[$157>>3];
 $159 = $5;
 $160 = ((($159)) + 24|0);
 $161 = ((($160)) + 16|0);
 $162 = +HEAPF64[$161>>3];
 $163 = $158 * $162;
 $164 = $5;
 $165 = ((($164)) + 16|0);
 $166 = +HEAPF64[$165>>3];
 $167 = $5;
 $168 = ((($167)) + 24|0);
 $169 = +HEAPF64[$168>>3];
 $170 = $166 * $169;
 $171 = $163 - $170;
 $172 = $171 * -1.0;
 $173 = $7;
 $174 = $172 / $173;
 $175 = $6;
 $176 = ((($175)) + 48|0);
 $177 = ((($176)) + 8|0);
 HEAPF64[$177>>3] = $174;
 $178 = $5;
 $179 = +HEAPF64[$178>>3];
 $180 = $5;
 $181 = ((($180)) + 24|0);
 $182 = ((($181)) + 8|0);
 $183 = +HEAPF64[$182>>3];
 $184 = $179 * $183;
 $185 = $5;
 $186 = ((($185)) + 8|0);
 $187 = +HEAPF64[$186>>3];
 $188 = $5;
 $189 = ((($188)) + 24|0);
 $190 = +HEAPF64[$189>>3];
 $191 = $187 * $190;
 $192 = $184 - $191;
 $193 = $7;
 $194 = $192 / $193;
 $195 = $6;
 $196 = ((($195)) + 48|0);
 $197 = ((($196)) + 16|0);
 HEAPF64[$197>>3] = $194;
 STACKTOP = sp;return;
}
function __ZN16CmGaussianFitterILi3EE5ResetEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 dest=$2; stop=dest+104|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 STACKTOP = sp;return;
}
function __ZN6CmGMM_ILi3EEC2Eid($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = +$2;
 var $$arith = 0, $$overflow = 0, $10 = 0, $11 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $3 = 0, $4 = 0, $5 = 0.0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4;
 HEAP32[$6>>2] = $7;
 $8 = ((($6)) + 4|0);
 $9 = $4;
 HEAP32[$8>>2] = $9;
 $10 = ((($6)) + 16|0);
 $11 = $5;
 HEAPF64[$10>>3] = $11;
 $12 = HEAP32[$6>>2]|0;
 $$arith = ($12*280)|0;
 $$overflow = ($12>>>0)>(15339168);
 $13 = $$overflow ? -1 : $$arith;
 $14 = (__Znaj($13)|0);
 $15 = ((($6)) + 24|0);
 HEAP32[$15>>2] = $14;
 STACKTOP = sp;return;
}
function _malloc($0) {
 $0 = $0|0;
 var $$0 = 0, $$0$i = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i20$i = 0, $$0169$i = 0, $$0170$i = 0, $$0171$i = 0, $$0192 = 0, $$0194 = 0, $$02014$i$i = 0, $$0202$lcssa$i$i = 0, $$02023$i$i = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$024372$i = 0, $$0259$i$i = 0, $$02604$i$i = 0, $$0261$lcssa$i$i = 0, $$02613$i$i = 0;
 var $$0267$i$i = 0, $$0268$i$i = 0, $$0318$i = 0, $$032012$i = 0, $$0321$lcssa$i = 0, $$032111$i = 0, $$0323$i = 0, $$0329$i = 0, $$0335$i = 0, $$0336$i = 0, $$0338$i = 0, $$0339$i = 0, $$0344$i = 0, $$1174$i = 0, $$1174$i$be = 0, $$1174$i$ph = 0, $$1176$i = 0, $$1176$i$be = 0, $$1176$i$ph = 0, $$124471$i = 0;
 var $$1263$i$i = 0, $$1263$i$i$be = 0, $$1263$i$i$ph = 0, $$1265$i$i = 0, $$1265$i$i$be = 0, $$1265$i$i$ph = 0, $$1319$i = 0, $$1324$i = 0, $$1340$i = 0, $$1346$i = 0, $$1346$i$be = 0, $$1346$i$ph = 0, $$1350$i = 0, $$1350$i$be = 0, $$1350$i$ph = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2331$i = 0, $$3$i = 0;
 var $$3$i$i = 0, $$3$i198 = 0, $$3$i198211 = 0, $$3326$i = 0, $$3348$i = 0, $$4$lcssa$i = 0, $$415$i = 0, $$415$i$ph = 0, $$4236$i = 0, $$4327$lcssa$i = 0, $$432714$i = 0, $$432714$i$ph = 0, $$4333$i = 0, $$533413$i = 0, $$533413$i$ph = 0, $$723947$i = 0, $$748$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0;
 var $$pre$i16$i = 0, $$pre$i195 = 0, $$pre$i204 = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i17$iZ2D = 0, $$pre$phi$i205Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phiZ2D = 0, $$sink = 0, $$sink320 = 0, $$sink321 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0;
 var $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0;
 var $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0;
 var $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0;
 var $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0;
 var $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0;
 var $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0;
 var $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0;
 var $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0;
 var $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0;
 var $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0;
 var $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0;
 var $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0;
 var $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0;
 var $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0;
 var $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0;
 var $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0;
 var $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0;
 var $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0;
 var $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0;
 var $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0;
 var $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0;
 var $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0;
 var $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0;
 var $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0;
 var $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0;
 var $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0;
 var $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0;
 var $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0;
 var $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0;
 var $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0;
 var $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0;
 var $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0;
 var $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0;
 var $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0;
 var $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0;
 var $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0;
 var $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0;
 var $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0;
 var $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0;
 var $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0;
 var $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0;
 var $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0;
 var $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0;
 var $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0;
 var $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0;
 var $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0;
 var $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0;
 var $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $971 = 0;
 var $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0, $977 = 0, $978 = 0, $979 = 0, $98 = 0, $99 = 0, $cond$i = 0, $cond$i$i = 0, $cond$i203 = 0, $not$$i = 0, $or$cond$i = 0, $or$cond$i199 = 0, $or$cond1$i = 0, $or$cond1$i197 = 0, $or$cond11$i = 0, $or$cond2$i = 0;
 var $or$cond5$i = 0, $or$cond50$i = 0, $or$cond51$i = 0, $or$cond6$i = 0, $or$cond7$i = 0, $or$cond8$i = 0, $or$cond8$not$i = 0, $spec$select$i = 0, $spec$select$i201 = 0, $spec$select1$i = 0, $spec$select2$i = 0, $spec$select4$i = 0, $spec$select49$i = 0, $spec$select9$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 $2 = ($0>>>0)<(245);
 do {
  if ($2) {
   $3 = ($0>>>0)<(11);
   $4 = (($0) + 11)|0;
   $5 = $4 & -8;
   $6 = $3 ? 16 : $5;
   $7 = $6 >>> 3;
   $8 = HEAP32[1042]|0;
   $9 = $8 >>> $7;
   $10 = $9 & 3;
   $11 = ($10|0)==(0);
   if (!($11)) {
    $12 = $9 & 1;
    $13 = $12 ^ 1;
    $14 = (($13) + ($7))|0;
    $15 = $14 << 1;
    $16 = (4208 + ($15<<2)|0);
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ((($18)) + 8|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($20|0)==($16|0);
    if ($21) {
     $22 = 1 << $14;
     $23 = $22 ^ -1;
     $24 = $8 & $23;
     HEAP32[1042] = $24;
    } else {
     $25 = ((($20)) + 12|0);
     HEAP32[$25>>2] = $16;
     HEAP32[$17>>2] = $20;
    }
    $26 = $14 << 3;
    $27 = $26 | 3;
    $28 = ((($18)) + 4|0);
    HEAP32[$28>>2] = $27;
    $29 = (($18) + ($26)|0);
    $30 = ((($29)) + 4|0);
    $31 = HEAP32[$30>>2]|0;
    $32 = $31 | 1;
    HEAP32[$30>>2] = $32;
    $$0 = $19;
    STACKTOP = sp;return ($$0|0);
   }
   $33 = HEAP32[(4176)>>2]|0;
   $34 = ($6>>>0)>($33>>>0);
   if ($34) {
    $35 = ($9|0)==(0);
    if (!($35)) {
     $36 = $9 << $7;
     $37 = 2 << $7;
     $38 = (0 - ($37))|0;
     $39 = $37 | $38;
     $40 = $36 & $39;
     $41 = (0 - ($40))|0;
     $42 = $40 & $41;
     $43 = (($42) + -1)|0;
     $44 = $43 >>> 12;
     $45 = $44 & 16;
     $46 = $43 >>> $45;
     $47 = $46 >>> 5;
     $48 = $47 & 8;
     $49 = $48 | $45;
     $50 = $46 >>> $48;
     $51 = $50 >>> 2;
     $52 = $51 & 4;
     $53 = $49 | $52;
     $54 = $50 >>> $52;
     $55 = $54 >>> 1;
     $56 = $55 & 2;
     $57 = $53 | $56;
     $58 = $54 >>> $56;
     $59 = $58 >>> 1;
     $60 = $59 & 1;
     $61 = $57 | $60;
     $62 = $58 >>> $60;
     $63 = (($61) + ($62))|0;
     $64 = $63 << 1;
     $65 = (4208 + ($64<<2)|0);
     $66 = ((($65)) + 8|0);
     $67 = HEAP32[$66>>2]|0;
     $68 = ((($67)) + 8|0);
     $69 = HEAP32[$68>>2]|0;
     $70 = ($69|0)==($65|0);
     if ($70) {
      $71 = 1 << $63;
      $72 = $71 ^ -1;
      $73 = $8 & $72;
      HEAP32[1042] = $73;
      $90 = $73;
     } else {
      $74 = ((($69)) + 12|0);
      HEAP32[$74>>2] = $65;
      HEAP32[$66>>2] = $69;
      $90 = $8;
     }
     $75 = $63 << 3;
     $76 = (($75) - ($6))|0;
     $77 = $6 | 3;
     $78 = ((($67)) + 4|0);
     HEAP32[$78>>2] = $77;
     $79 = (($67) + ($6)|0);
     $80 = $76 | 1;
     $81 = ((($79)) + 4|0);
     HEAP32[$81>>2] = $80;
     $82 = (($67) + ($75)|0);
     HEAP32[$82>>2] = $76;
     $83 = ($33|0)==(0);
     if (!($83)) {
      $84 = HEAP32[(4188)>>2]|0;
      $85 = $33 >>> 3;
      $86 = $85 << 1;
      $87 = (4208 + ($86<<2)|0);
      $88 = 1 << $85;
      $89 = $90 & $88;
      $91 = ($89|0)==(0);
      if ($91) {
       $92 = $90 | $88;
       HEAP32[1042] = $92;
       $$pre = ((($87)) + 8|0);
       $$0194 = $87;$$pre$phiZ2D = $$pre;
      } else {
       $93 = ((($87)) + 8|0);
       $94 = HEAP32[$93>>2]|0;
       $$0194 = $94;$$pre$phiZ2D = $93;
      }
      HEAP32[$$pre$phiZ2D>>2] = $84;
      $95 = ((($$0194)) + 12|0);
      HEAP32[$95>>2] = $84;
      $96 = ((($84)) + 8|0);
      HEAP32[$96>>2] = $$0194;
      $97 = ((($84)) + 12|0);
      HEAP32[$97>>2] = $87;
     }
     HEAP32[(4176)>>2] = $76;
     HEAP32[(4188)>>2] = $79;
     $$0 = $68;
     STACKTOP = sp;return ($$0|0);
    }
    $98 = HEAP32[(4172)>>2]|0;
    $99 = ($98|0)==(0);
    if ($99) {
     $$0192 = $6;
    } else {
     $100 = (0 - ($98))|0;
     $101 = $98 & $100;
     $102 = (($101) + -1)|0;
     $103 = $102 >>> 12;
     $104 = $103 & 16;
     $105 = $102 >>> $104;
     $106 = $105 >>> 5;
     $107 = $106 & 8;
     $108 = $107 | $104;
     $109 = $105 >>> $107;
     $110 = $109 >>> 2;
     $111 = $110 & 4;
     $112 = $108 | $111;
     $113 = $109 >>> $111;
     $114 = $113 >>> 1;
     $115 = $114 & 2;
     $116 = $112 | $115;
     $117 = $113 >>> $115;
     $118 = $117 >>> 1;
     $119 = $118 & 1;
     $120 = $116 | $119;
     $121 = $117 >>> $119;
     $122 = (($120) + ($121))|0;
     $123 = (4472 + ($122<<2)|0);
     $124 = HEAP32[$123>>2]|0;
     $125 = ((($124)) + 4|0);
     $126 = HEAP32[$125>>2]|0;
     $127 = $126 & -8;
     $128 = (($127) - ($6))|0;
     $$0169$i = $124;$$0170$i = $124;$$0171$i = $128;
     while(1) {
      $129 = ((($$0169$i)) + 16|0);
      $130 = HEAP32[$129>>2]|0;
      $131 = ($130|0)==(0|0);
      if ($131) {
       $132 = ((($$0169$i)) + 20|0);
       $133 = HEAP32[$132>>2]|0;
       $134 = ($133|0)==(0|0);
       if ($134) {
        break;
       } else {
        $136 = $133;
       }
      } else {
       $136 = $130;
      }
      $135 = ((($136)) + 4|0);
      $137 = HEAP32[$135>>2]|0;
      $138 = $137 & -8;
      $139 = (($138) - ($6))|0;
      $140 = ($139>>>0)<($$0171$i>>>0);
      $spec$select$i = $140 ? $139 : $$0171$i;
      $spec$select1$i = $140 ? $136 : $$0170$i;
      $$0169$i = $136;$$0170$i = $spec$select1$i;$$0171$i = $spec$select$i;
     }
     $141 = (($$0170$i) + ($6)|0);
     $142 = ($141>>>0)>($$0170$i>>>0);
     if ($142) {
      $143 = ((($$0170$i)) + 24|0);
      $144 = HEAP32[$143>>2]|0;
      $145 = ((($$0170$i)) + 12|0);
      $146 = HEAP32[$145>>2]|0;
      $147 = ($146|0)==($$0170$i|0);
      do {
       if ($147) {
        $152 = ((($$0170$i)) + 20|0);
        $153 = HEAP32[$152>>2]|0;
        $154 = ($153|0)==(0|0);
        if ($154) {
         $155 = ((($$0170$i)) + 16|0);
         $156 = HEAP32[$155>>2]|0;
         $157 = ($156|0)==(0|0);
         if ($157) {
          $$3$i = 0;
          break;
         } else {
          $$1174$i$ph = $156;$$1176$i$ph = $155;
         }
        } else {
         $$1174$i$ph = $153;$$1176$i$ph = $152;
        }
        $$1174$i = $$1174$i$ph;$$1176$i = $$1176$i$ph;
        while(1) {
         $158 = ((($$1174$i)) + 20|0);
         $159 = HEAP32[$158>>2]|0;
         $160 = ($159|0)==(0|0);
         if ($160) {
          $161 = ((($$1174$i)) + 16|0);
          $162 = HEAP32[$161>>2]|0;
          $163 = ($162|0)==(0|0);
          if ($163) {
           break;
          } else {
           $$1174$i$be = $162;$$1176$i$be = $161;
          }
         } else {
          $$1174$i$be = $159;$$1176$i$be = $158;
         }
         $$1174$i = $$1174$i$be;$$1176$i = $$1176$i$be;
        }
        HEAP32[$$1176$i>>2] = 0;
        $$3$i = $$1174$i;
       } else {
        $148 = ((($$0170$i)) + 8|0);
        $149 = HEAP32[$148>>2]|0;
        $150 = ((($149)) + 12|0);
        HEAP32[$150>>2] = $146;
        $151 = ((($146)) + 8|0);
        HEAP32[$151>>2] = $149;
        $$3$i = $146;
       }
      } while(0);
      $164 = ($144|0)==(0|0);
      do {
       if (!($164)) {
        $165 = ((($$0170$i)) + 28|0);
        $166 = HEAP32[$165>>2]|0;
        $167 = (4472 + ($166<<2)|0);
        $168 = HEAP32[$167>>2]|0;
        $169 = ($$0170$i|0)==($168|0);
        if ($169) {
         HEAP32[$167>>2] = $$3$i;
         $cond$i = ($$3$i|0)==(0|0);
         if ($cond$i) {
          $170 = 1 << $166;
          $171 = $170 ^ -1;
          $172 = $98 & $171;
          HEAP32[(4172)>>2] = $172;
          break;
         }
        } else {
         $173 = ((($144)) + 16|0);
         $174 = HEAP32[$173>>2]|0;
         $175 = ($174|0)==($$0170$i|0);
         $176 = ((($144)) + 20|0);
         $$sink = $175 ? $173 : $176;
         HEAP32[$$sink>>2] = $$3$i;
         $177 = ($$3$i|0)==(0|0);
         if ($177) {
          break;
         }
        }
        $178 = ((($$3$i)) + 24|0);
        HEAP32[$178>>2] = $144;
        $179 = ((($$0170$i)) + 16|0);
        $180 = HEAP32[$179>>2]|0;
        $181 = ($180|0)==(0|0);
        if (!($181)) {
         $182 = ((($$3$i)) + 16|0);
         HEAP32[$182>>2] = $180;
         $183 = ((($180)) + 24|0);
         HEAP32[$183>>2] = $$3$i;
        }
        $184 = ((($$0170$i)) + 20|0);
        $185 = HEAP32[$184>>2]|0;
        $186 = ($185|0)==(0|0);
        if (!($186)) {
         $187 = ((($$3$i)) + 20|0);
         HEAP32[$187>>2] = $185;
         $188 = ((($185)) + 24|0);
         HEAP32[$188>>2] = $$3$i;
        }
       }
      } while(0);
      $189 = ($$0171$i>>>0)<(16);
      if ($189) {
       $190 = (($$0171$i) + ($6))|0;
       $191 = $190 | 3;
       $192 = ((($$0170$i)) + 4|0);
       HEAP32[$192>>2] = $191;
       $193 = (($$0170$i) + ($190)|0);
       $194 = ((($193)) + 4|0);
       $195 = HEAP32[$194>>2]|0;
       $196 = $195 | 1;
       HEAP32[$194>>2] = $196;
      } else {
       $197 = $6 | 3;
       $198 = ((($$0170$i)) + 4|0);
       HEAP32[$198>>2] = $197;
       $199 = $$0171$i | 1;
       $200 = ((($141)) + 4|0);
       HEAP32[$200>>2] = $199;
       $201 = (($141) + ($$0171$i)|0);
       HEAP32[$201>>2] = $$0171$i;
       $202 = ($33|0)==(0);
       if (!($202)) {
        $203 = HEAP32[(4188)>>2]|0;
        $204 = $33 >>> 3;
        $205 = $204 << 1;
        $206 = (4208 + ($205<<2)|0);
        $207 = 1 << $204;
        $208 = $207 & $8;
        $209 = ($208|0)==(0);
        if ($209) {
         $210 = $207 | $8;
         HEAP32[1042] = $210;
         $$pre$i = ((($206)) + 8|0);
         $$0$i = $206;$$pre$phi$iZ2D = $$pre$i;
        } else {
         $211 = ((($206)) + 8|0);
         $212 = HEAP32[$211>>2]|0;
         $$0$i = $212;$$pre$phi$iZ2D = $211;
        }
        HEAP32[$$pre$phi$iZ2D>>2] = $203;
        $213 = ((($$0$i)) + 12|0);
        HEAP32[$213>>2] = $203;
        $214 = ((($203)) + 8|0);
        HEAP32[$214>>2] = $$0$i;
        $215 = ((($203)) + 12|0);
        HEAP32[$215>>2] = $206;
       }
       HEAP32[(4176)>>2] = $$0171$i;
       HEAP32[(4188)>>2] = $141;
      }
      $216 = ((($$0170$i)) + 8|0);
      $$0 = $216;
      STACKTOP = sp;return ($$0|0);
     } else {
      $$0192 = $6;
     }
    }
   } else {
    $$0192 = $6;
   }
  } else {
   $217 = ($0>>>0)>(4294967231);
   if ($217) {
    $$0192 = -1;
   } else {
    $218 = (($0) + 11)|0;
    $219 = $218 & -8;
    $220 = HEAP32[(4172)>>2]|0;
    $221 = ($220|0)==(0);
    if ($221) {
     $$0192 = $219;
    } else {
     $222 = (0 - ($219))|0;
     $223 = $218 >>> 8;
     $224 = ($223|0)==(0);
     if ($224) {
      $$0335$i = 0;
     } else {
      $225 = ($219>>>0)>(16777215);
      if ($225) {
       $$0335$i = 31;
      } else {
       $226 = (($223) + 1048320)|0;
       $227 = $226 >>> 16;
       $228 = $227 & 8;
       $229 = $223 << $228;
       $230 = (($229) + 520192)|0;
       $231 = $230 >>> 16;
       $232 = $231 & 4;
       $233 = $232 | $228;
       $234 = $229 << $232;
       $235 = (($234) + 245760)|0;
       $236 = $235 >>> 16;
       $237 = $236 & 2;
       $238 = $233 | $237;
       $239 = (14 - ($238))|0;
       $240 = $234 << $237;
       $241 = $240 >>> 15;
       $242 = (($239) + ($241))|0;
       $243 = $242 << 1;
       $244 = (($242) + 7)|0;
       $245 = $219 >>> $244;
       $246 = $245 & 1;
       $247 = $246 | $243;
       $$0335$i = $247;
      }
     }
     $248 = (4472 + ($$0335$i<<2)|0);
     $249 = HEAP32[$248>>2]|0;
     $250 = ($249|0)==(0|0);
     L79: do {
      if ($250) {
       $$2331$i = 0;$$3$i198 = 0;$$3326$i = $222;
       label = 61;
      } else {
       $251 = ($$0335$i|0)==(31);
       $252 = $$0335$i >>> 1;
       $253 = (25 - ($252))|0;
       $254 = $251 ? 0 : $253;
       $255 = $219 << $254;
       $$0318$i = 0;$$0323$i = $222;$$0329$i = $249;$$0336$i = $255;$$0339$i = 0;
       while(1) {
        $256 = ((($$0329$i)) + 4|0);
        $257 = HEAP32[$256>>2]|0;
        $258 = $257 & -8;
        $259 = (($258) - ($219))|0;
        $260 = ($259>>>0)<($$0323$i>>>0);
        if ($260) {
         $261 = ($259|0)==(0);
         if ($261) {
          $$415$i$ph = $$0329$i;$$432714$i$ph = 0;$$533413$i$ph = $$0329$i;
          label = 65;
          break L79;
         } else {
          $$1319$i = $$0329$i;$$1324$i = $259;
         }
        } else {
         $$1319$i = $$0318$i;$$1324$i = $$0323$i;
        }
        $262 = ((($$0329$i)) + 20|0);
        $263 = HEAP32[$262>>2]|0;
        $264 = $$0336$i >>> 31;
        $265 = (((($$0329$i)) + 16|0) + ($264<<2)|0);
        $266 = HEAP32[$265>>2]|0;
        $267 = ($263|0)==(0|0);
        $268 = ($263|0)==($266|0);
        $or$cond1$i197 = $267 | $268;
        $$1340$i = $or$cond1$i197 ? $$0339$i : $263;
        $269 = ($266|0)==(0|0);
        $spec$select4$i = $$0336$i << 1;
        if ($269) {
         $$2331$i = $$1340$i;$$3$i198 = $$1319$i;$$3326$i = $$1324$i;
         label = 61;
         break;
        } else {
         $$0318$i = $$1319$i;$$0323$i = $$1324$i;$$0329$i = $266;$$0336$i = $spec$select4$i;$$0339$i = $$1340$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 61) {
      $270 = ($$2331$i|0)==(0|0);
      $271 = ($$3$i198|0)==(0|0);
      $or$cond$i199 = $270 & $271;
      if ($or$cond$i199) {
       $272 = 2 << $$0335$i;
       $273 = (0 - ($272))|0;
       $274 = $272 | $273;
       $275 = $274 & $220;
       $276 = ($275|0)==(0);
       if ($276) {
        $$0192 = $219;
        break;
       }
       $277 = (0 - ($275))|0;
       $278 = $275 & $277;
       $279 = (($278) + -1)|0;
       $280 = $279 >>> 12;
       $281 = $280 & 16;
       $282 = $279 >>> $281;
       $283 = $282 >>> 5;
       $284 = $283 & 8;
       $285 = $284 | $281;
       $286 = $282 >>> $284;
       $287 = $286 >>> 2;
       $288 = $287 & 4;
       $289 = $285 | $288;
       $290 = $286 >>> $288;
       $291 = $290 >>> 1;
       $292 = $291 & 2;
       $293 = $289 | $292;
       $294 = $290 >>> $292;
       $295 = $294 >>> 1;
       $296 = $295 & 1;
       $297 = $293 | $296;
       $298 = $294 >>> $296;
       $299 = (($297) + ($298))|0;
       $300 = (4472 + ($299<<2)|0);
       $301 = HEAP32[$300>>2]|0;
       $$3$i198211 = 0;$$4333$i = $301;
      } else {
       $$3$i198211 = $$3$i198;$$4333$i = $$2331$i;
      }
      $302 = ($$4333$i|0)==(0|0);
      if ($302) {
       $$4$lcssa$i = $$3$i198211;$$4327$lcssa$i = $$3326$i;
      } else {
       $$415$i$ph = $$3$i198211;$$432714$i$ph = $$3326$i;$$533413$i$ph = $$4333$i;
       label = 65;
      }
     }
     if ((label|0) == 65) {
      $$415$i = $$415$i$ph;$$432714$i = $$432714$i$ph;$$533413$i = $$533413$i$ph;
      while(1) {
       $303 = ((($$533413$i)) + 4|0);
       $304 = HEAP32[$303>>2]|0;
       $305 = $304 & -8;
       $306 = (($305) - ($219))|0;
       $307 = ($306>>>0)<($$432714$i>>>0);
       $spec$select$i201 = $307 ? $306 : $$432714$i;
       $spec$select2$i = $307 ? $$533413$i : $$415$i;
       $308 = ((($$533413$i)) + 16|0);
       $309 = HEAP32[$308>>2]|0;
       $310 = ($309|0)==(0|0);
       if ($310) {
        $311 = ((($$533413$i)) + 20|0);
        $312 = HEAP32[$311>>2]|0;
        $314 = $312;
       } else {
        $314 = $309;
       }
       $313 = ($314|0)==(0|0);
       if ($313) {
        $$4$lcssa$i = $spec$select2$i;$$4327$lcssa$i = $spec$select$i201;
        break;
       } else {
        $$415$i = $spec$select2$i;$$432714$i = $spec$select$i201;$$533413$i = $314;
       }
      }
     }
     $315 = ($$4$lcssa$i|0)==(0|0);
     if ($315) {
      $$0192 = $219;
     } else {
      $316 = HEAP32[(4176)>>2]|0;
      $317 = (($316) - ($219))|0;
      $318 = ($$4327$lcssa$i>>>0)<($317>>>0);
      if ($318) {
       $319 = (($$4$lcssa$i) + ($219)|0);
       $320 = ($319>>>0)>($$4$lcssa$i>>>0);
       if ($320) {
        $321 = ((($$4$lcssa$i)) + 24|0);
        $322 = HEAP32[$321>>2]|0;
        $323 = ((($$4$lcssa$i)) + 12|0);
        $324 = HEAP32[$323>>2]|0;
        $325 = ($324|0)==($$4$lcssa$i|0);
        do {
         if ($325) {
          $330 = ((($$4$lcssa$i)) + 20|0);
          $331 = HEAP32[$330>>2]|0;
          $332 = ($331|0)==(0|0);
          if ($332) {
           $333 = ((($$4$lcssa$i)) + 16|0);
           $334 = HEAP32[$333>>2]|0;
           $335 = ($334|0)==(0|0);
           if ($335) {
            $$3348$i = 0;
            break;
           } else {
            $$1346$i$ph = $334;$$1350$i$ph = $333;
           }
          } else {
           $$1346$i$ph = $331;$$1350$i$ph = $330;
          }
          $$1346$i = $$1346$i$ph;$$1350$i = $$1350$i$ph;
          while(1) {
           $336 = ((($$1346$i)) + 20|0);
           $337 = HEAP32[$336>>2]|0;
           $338 = ($337|0)==(0|0);
           if ($338) {
            $339 = ((($$1346$i)) + 16|0);
            $340 = HEAP32[$339>>2]|0;
            $341 = ($340|0)==(0|0);
            if ($341) {
             break;
            } else {
             $$1346$i$be = $340;$$1350$i$be = $339;
            }
           } else {
            $$1346$i$be = $337;$$1350$i$be = $336;
           }
           $$1346$i = $$1346$i$be;$$1350$i = $$1350$i$be;
          }
          HEAP32[$$1350$i>>2] = 0;
          $$3348$i = $$1346$i;
         } else {
          $326 = ((($$4$lcssa$i)) + 8|0);
          $327 = HEAP32[$326>>2]|0;
          $328 = ((($327)) + 12|0);
          HEAP32[$328>>2] = $324;
          $329 = ((($324)) + 8|0);
          HEAP32[$329>>2] = $327;
          $$3348$i = $324;
         }
        } while(0);
        $342 = ($322|0)==(0|0);
        do {
         if ($342) {
          $425 = $220;
         } else {
          $343 = ((($$4$lcssa$i)) + 28|0);
          $344 = HEAP32[$343>>2]|0;
          $345 = (4472 + ($344<<2)|0);
          $346 = HEAP32[$345>>2]|0;
          $347 = ($$4$lcssa$i|0)==($346|0);
          if ($347) {
           HEAP32[$345>>2] = $$3348$i;
           $cond$i203 = ($$3348$i|0)==(0|0);
           if ($cond$i203) {
            $348 = 1 << $344;
            $349 = $348 ^ -1;
            $350 = $220 & $349;
            HEAP32[(4172)>>2] = $350;
            $425 = $350;
            break;
           }
          } else {
           $351 = ((($322)) + 16|0);
           $352 = HEAP32[$351>>2]|0;
           $353 = ($352|0)==($$4$lcssa$i|0);
           $354 = ((($322)) + 20|0);
           $$sink320 = $353 ? $351 : $354;
           HEAP32[$$sink320>>2] = $$3348$i;
           $355 = ($$3348$i|0)==(0|0);
           if ($355) {
            $425 = $220;
            break;
           }
          }
          $356 = ((($$3348$i)) + 24|0);
          HEAP32[$356>>2] = $322;
          $357 = ((($$4$lcssa$i)) + 16|0);
          $358 = HEAP32[$357>>2]|0;
          $359 = ($358|0)==(0|0);
          if (!($359)) {
           $360 = ((($$3348$i)) + 16|0);
           HEAP32[$360>>2] = $358;
           $361 = ((($358)) + 24|0);
           HEAP32[$361>>2] = $$3348$i;
          }
          $362 = ((($$4$lcssa$i)) + 20|0);
          $363 = HEAP32[$362>>2]|0;
          $364 = ($363|0)==(0|0);
          if ($364) {
           $425 = $220;
          } else {
           $365 = ((($$3348$i)) + 20|0);
           HEAP32[$365>>2] = $363;
           $366 = ((($363)) + 24|0);
           HEAP32[$366>>2] = $$3348$i;
           $425 = $220;
          }
         }
        } while(0);
        $367 = ($$4327$lcssa$i>>>0)<(16);
        L128: do {
         if ($367) {
          $368 = (($$4327$lcssa$i) + ($219))|0;
          $369 = $368 | 3;
          $370 = ((($$4$lcssa$i)) + 4|0);
          HEAP32[$370>>2] = $369;
          $371 = (($$4$lcssa$i) + ($368)|0);
          $372 = ((($371)) + 4|0);
          $373 = HEAP32[$372>>2]|0;
          $374 = $373 | 1;
          HEAP32[$372>>2] = $374;
         } else {
          $375 = $219 | 3;
          $376 = ((($$4$lcssa$i)) + 4|0);
          HEAP32[$376>>2] = $375;
          $377 = $$4327$lcssa$i | 1;
          $378 = ((($319)) + 4|0);
          HEAP32[$378>>2] = $377;
          $379 = (($319) + ($$4327$lcssa$i)|0);
          HEAP32[$379>>2] = $$4327$lcssa$i;
          $380 = $$4327$lcssa$i >>> 3;
          $381 = ($$4327$lcssa$i>>>0)<(256);
          if ($381) {
           $382 = $380 << 1;
           $383 = (4208 + ($382<<2)|0);
           $384 = HEAP32[1042]|0;
           $385 = 1 << $380;
           $386 = $384 & $385;
           $387 = ($386|0)==(0);
           if ($387) {
            $388 = $384 | $385;
            HEAP32[1042] = $388;
            $$pre$i204 = ((($383)) + 8|0);
            $$0344$i = $383;$$pre$phi$i205Z2D = $$pre$i204;
           } else {
            $389 = ((($383)) + 8|0);
            $390 = HEAP32[$389>>2]|0;
            $$0344$i = $390;$$pre$phi$i205Z2D = $389;
           }
           HEAP32[$$pre$phi$i205Z2D>>2] = $319;
           $391 = ((($$0344$i)) + 12|0);
           HEAP32[$391>>2] = $319;
           $392 = ((($319)) + 8|0);
           HEAP32[$392>>2] = $$0344$i;
           $393 = ((($319)) + 12|0);
           HEAP32[$393>>2] = $383;
           break;
          }
          $394 = $$4327$lcssa$i >>> 8;
          $395 = ($394|0)==(0);
          if ($395) {
           $$0338$i = 0;
          } else {
           $396 = ($$4327$lcssa$i>>>0)>(16777215);
           if ($396) {
            $$0338$i = 31;
           } else {
            $397 = (($394) + 1048320)|0;
            $398 = $397 >>> 16;
            $399 = $398 & 8;
            $400 = $394 << $399;
            $401 = (($400) + 520192)|0;
            $402 = $401 >>> 16;
            $403 = $402 & 4;
            $404 = $403 | $399;
            $405 = $400 << $403;
            $406 = (($405) + 245760)|0;
            $407 = $406 >>> 16;
            $408 = $407 & 2;
            $409 = $404 | $408;
            $410 = (14 - ($409))|0;
            $411 = $405 << $408;
            $412 = $411 >>> 15;
            $413 = (($410) + ($412))|0;
            $414 = $413 << 1;
            $415 = (($413) + 7)|0;
            $416 = $$4327$lcssa$i >>> $415;
            $417 = $416 & 1;
            $418 = $417 | $414;
            $$0338$i = $418;
           }
          }
          $419 = (4472 + ($$0338$i<<2)|0);
          $420 = ((($319)) + 28|0);
          HEAP32[$420>>2] = $$0338$i;
          $421 = ((($319)) + 16|0);
          $422 = ((($421)) + 4|0);
          HEAP32[$422>>2] = 0;
          HEAP32[$421>>2] = 0;
          $423 = 1 << $$0338$i;
          $424 = $425 & $423;
          $426 = ($424|0)==(0);
          if ($426) {
           $427 = $425 | $423;
           HEAP32[(4172)>>2] = $427;
           HEAP32[$419>>2] = $319;
           $428 = ((($319)) + 24|0);
           HEAP32[$428>>2] = $419;
           $429 = ((($319)) + 12|0);
           HEAP32[$429>>2] = $319;
           $430 = ((($319)) + 8|0);
           HEAP32[$430>>2] = $319;
           break;
          }
          $431 = HEAP32[$419>>2]|0;
          $432 = ((($431)) + 4|0);
          $433 = HEAP32[$432>>2]|0;
          $434 = $433 & -8;
          $435 = ($434|0)==($$4327$lcssa$i|0);
          L145: do {
           if ($435) {
            $$0321$lcssa$i = $431;
           } else {
            $436 = ($$0338$i|0)==(31);
            $437 = $$0338$i >>> 1;
            $438 = (25 - ($437))|0;
            $439 = $436 ? 0 : $438;
            $440 = $$4327$lcssa$i << $439;
            $$032012$i = $440;$$032111$i = $431;
            while(1) {
             $447 = $$032012$i >>> 31;
             $448 = (((($$032111$i)) + 16|0) + ($447<<2)|0);
             $443 = HEAP32[$448>>2]|0;
             $449 = ($443|0)==(0|0);
             if ($449) {
              break;
             }
             $441 = $$032012$i << 1;
             $442 = ((($443)) + 4|0);
             $444 = HEAP32[$442>>2]|0;
             $445 = $444 & -8;
             $446 = ($445|0)==($$4327$lcssa$i|0);
             if ($446) {
              $$0321$lcssa$i = $443;
              break L145;
             } else {
              $$032012$i = $441;$$032111$i = $443;
             }
            }
            HEAP32[$448>>2] = $319;
            $450 = ((($319)) + 24|0);
            HEAP32[$450>>2] = $$032111$i;
            $451 = ((($319)) + 12|0);
            HEAP32[$451>>2] = $319;
            $452 = ((($319)) + 8|0);
            HEAP32[$452>>2] = $319;
            break L128;
           }
          } while(0);
          $453 = ((($$0321$lcssa$i)) + 8|0);
          $454 = HEAP32[$453>>2]|0;
          $455 = ((($454)) + 12|0);
          HEAP32[$455>>2] = $319;
          HEAP32[$453>>2] = $319;
          $456 = ((($319)) + 8|0);
          HEAP32[$456>>2] = $454;
          $457 = ((($319)) + 12|0);
          HEAP32[$457>>2] = $$0321$lcssa$i;
          $458 = ((($319)) + 24|0);
          HEAP32[$458>>2] = 0;
         }
        } while(0);
        $459 = ((($$4$lcssa$i)) + 8|0);
        $$0 = $459;
        STACKTOP = sp;return ($$0|0);
       } else {
        $$0192 = $219;
       }
      } else {
       $$0192 = $219;
      }
     }
    }
   }
  }
 } while(0);
 $460 = HEAP32[(4176)>>2]|0;
 $461 = ($460>>>0)<($$0192>>>0);
 if (!($461)) {
  $462 = (($460) - ($$0192))|0;
  $463 = HEAP32[(4188)>>2]|0;
  $464 = ($462>>>0)>(15);
  if ($464) {
   $465 = (($463) + ($$0192)|0);
   HEAP32[(4188)>>2] = $465;
   HEAP32[(4176)>>2] = $462;
   $466 = $462 | 1;
   $467 = ((($465)) + 4|0);
   HEAP32[$467>>2] = $466;
   $468 = (($463) + ($460)|0);
   HEAP32[$468>>2] = $462;
   $469 = $$0192 | 3;
   $470 = ((($463)) + 4|0);
   HEAP32[$470>>2] = $469;
  } else {
   HEAP32[(4176)>>2] = 0;
   HEAP32[(4188)>>2] = 0;
   $471 = $460 | 3;
   $472 = ((($463)) + 4|0);
   HEAP32[$472>>2] = $471;
   $473 = (($463) + ($460)|0);
   $474 = ((($473)) + 4|0);
   $475 = HEAP32[$474>>2]|0;
   $476 = $475 | 1;
   HEAP32[$474>>2] = $476;
  }
  $477 = ((($463)) + 8|0);
  $$0 = $477;
  STACKTOP = sp;return ($$0|0);
 }
 $478 = HEAP32[(4180)>>2]|0;
 $479 = ($478>>>0)>($$0192>>>0);
 if ($479) {
  $480 = (($478) - ($$0192))|0;
  HEAP32[(4180)>>2] = $480;
  $481 = HEAP32[(4192)>>2]|0;
  $482 = (($481) + ($$0192)|0);
  HEAP32[(4192)>>2] = $482;
  $483 = $480 | 1;
  $484 = ((($482)) + 4|0);
  HEAP32[$484>>2] = $483;
  $485 = $$0192 | 3;
  $486 = ((($481)) + 4|0);
  HEAP32[$486>>2] = $485;
  $487 = ((($481)) + 8|0);
  $$0 = $487;
  STACKTOP = sp;return ($$0|0);
 }
 $488 = HEAP32[1160]|0;
 $489 = ($488|0)==(0);
 if ($489) {
  HEAP32[(4648)>>2] = 4096;
  HEAP32[(4644)>>2] = 4096;
  HEAP32[(4652)>>2] = -1;
  HEAP32[(4656)>>2] = -1;
  HEAP32[(4660)>>2] = 0;
  HEAP32[(4612)>>2] = 0;
  $490 = $1;
  $491 = $490 & -16;
  $492 = $491 ^ 1431655768;
  HEAP32[1160] = $492;
  $496 = 4096;
 } else {
  $$pre$i195 = HEAP32[(4648)>>2]|0;
  $496 = $$pre$i195;
 }
 $493 = (($$0192) + 48)|0;
 $494 = (($$0192) + 47)|0;
 $495 = (($496) + ($494))|0;
 $497 = (0 - ($496))|0;
 $498 = $495 & $497;
 $499 = ($498>>>0)>($$0192>>>0);
 if (!($499)) {
  $$0 = 0;
  STACKTOP = sp;return ($$0|0);
 }
 $500 = HEAP32[(4608)>>2]|0;
 $501 = ($500|0)==(0);
 if (!($501)) {
  $502 = HEAP32[(4600)>>2]|0;
  $503 = (($502) + ($498))|0;
  $504 = ($503>>>0)<=($502>>>0);
  $505 = ($503>>>0)>($500>>>0);
  $or$cond1$i = $504 | $505;
  if ($or$cond1$i) {
   $$0 = 0;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $506 = HEAP32[(4612)>>2]|0;
 $507 = $506 & 4;
 $508 = ($507|0)==(0);
 L178: do {
  if ($508) {
   $509 = HEAP32[(4192)>>2]|0;
   $510 = ($509|0)==(0|0);
   L180: do {
    if ($510) {
     label = 128;
    } else {
     $$0$i20$i = (4616);
     while(1) {
      $511 = HEAP32[$$0$i20$i>>2]|0;
      $512 = ($511>>>0)>($509>>>0);
      if (!($512)) {
       $513 = ((($$0$i20$i)) + 4|0);
       $514 = HEAP32[$513>>2]|0;
       $515 = (($511) + ($514)|0);
       $516 = ($515>>>0)>($509>>>0);
       if ($516) {
        break;
       }
      }
      $517 = ((($$0$i20$i)) + 8|0);
      $518 = HEAP32[$517>>2]|0;
      $519 = ($518|0)==(0|0);
      if ($519) {
       label = 128;
       break L180;
      } else {
       $$0$i20$i = $518;
      }
     }
     $542 = (($495) - ($478))|0;
     $543 = $542 & $497;
     $544 = ($543>>>0)<(2147483647);
     if ($544) {
      $545 = ((($$0$i20$i)) + 4|0);
      $546 = (_sbrk(($543|0))|0);
      $547 = HEAP32[$$0$i20$i>>2]|0;
      $548 = HEAP32[$545>>2]|0;
      $549 = (($547) + ($548)|0);
      $550 = ($546|0)==($549|0);
      if ($550) {
       $551 = ($546|0)==((-1)|0);
       if ($551) {
        $$2234243136$i = $543;
       } else {
        $$723947$i = $543;$$748$i = $546;
        label = 145;
        break L178;
       }
      } else {
       $$2247$ph$i = $546;$$2253$ph$i = $543;
       label = 136;
      }
     } else {
      $$2234243136$i = 0;
     }
    }
   } while(0);
   do {
    if ((label|0) == 128) {
     $520 = (_sbrk(0)|0);
     $521 = ($520|0)==((-1)|0);
     if ($521) {
      $$2234243136$i = 0;
     } else {
      $522 = $520;
      $523 = HEAP32[(4644)>>2]|0;
      $524 = (($523) + -1)|0;
      $525 = $524 & $522;
      $526 = ($525|0)==(0);
      $527 = (($524) + ($522))|0;
      $528 = (0 - ($523))|0;
      $529 = $527 & $528;
      $530 = (($529) - ($522))|0;
      $531 = $526 ? 0 : $530;
      $spec$select49$i = (($531) + ($498))|0;
      $532 = HEAP32[(4600)>>2]|0;
      $533 = (($spec$select49$i) + ($532))|0;
      $534 = ($spec$select49$i>>>0)>($$0192>>>0);
      $535 = ($spec$select49$i>>>0)<(2147483647);
      $or$cond$i = $534 & $535;
      if ($or$cond$i) {
       $536 = HEAP32[(4608)>>2]|0;
       $537 = ($536|0)==(0);
       if (!($537)) {
        $538 = ($533>>>0)<=($532>>>0);
        $539 = ($533>>>0)>($536>>>0);
        $or$cond2$i = $538 | $539;
        if ($or$cond2$i) {
         $$2234243136$i = 0;
         break;
        }
       }
       $540 = (_sbrk(($spec$select49$i|0))|0);
       $541 = ($540|0)==($520|0);
       if ($541) {
        $$723947$i = $spec$select49$i;$$748$i = $520;
        label = 145;
        break L178;
       } else {
        $$2247$ph$i = $540;$$2253$ph$i = $spec$select49$i;
        label = 136;
       }
      } else {
       $$2234243136$i = 0;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 136) {
     $552 = (0 - ($$2253$ph$i))|0;
     $553 = ($$2247$ph$i|0)!=((-1)|0);
     $554 = ($$2253$ph$i>>>0)<(2147483647);
     $or$cond7$i = $554 & $553;
     $555 = ($493>>>0)>($$2253$ph$i>>>0);
     $or$cond6$i = $555 & $or$cond7$i;
     if (!($or$cond6$i)) {
      $565 = ($$2247$ph$i|0)==((-1)|0);
      if ($565) {
       $$2234243136$i = 0;
       break;
      } else {
       $$723947$i = $$2253$ph$i;$$748$i = $$2247$ph$i;
       label = 145;
       break L178;
      }
     }
     $556 = HEAP32[(4648)>>2]|0;
     $557 = (($494) - ($$2253$ph$i))|0;
     $558 = (($557) + ($556))|0;
     $559 = (0 - ($556))|0;
     $560 = $558 & $559;
     $561 = ($560>>>0)<(2147483647);
     if (!($561)) {
      $$723947$i = $$2253$ph$i;$$748$i = $$2247$ph$i;
      label = 145;
      break L178;
     }
     $562 = (_sbrk(($560|0))|0);
     $563 = ($562|0)==((-1)|0);
     if ($563) {
      (_sbrk(($552|0))|0);
      $$2234243136$i = 0;
      break;
     } else {
      $564 = (($560) + ($$2253$ph$i))|0;
      $$723947$i = $564;$$748$i = $$2247$ph$i;
      label = 145;
      break L178;
     }
    }
   } while(0);
   $566 = HEAP32[(4612)>>2]|0;
   $567 = $566 | 4;
   HEAP32[(4612)>>2] = $567;
   $$4236$i = $$2234243136$i;
   label = 143;
  } else {
   $$4236$i = 0;
   label = 143;
  }
 } while(0);
 if ((label|0) == 143) {
  $568 = ($498>>>0)<(2147483647);
  if ($568) {
   $569 = (_sbrk(($498|0))|0);
   $570 = (_sbrk(0)|0);
   $571 = ($569|0)!=((-1)|0);
   $572 = ($570|0)!=((-1)|0);
   $or$cond5$i = $571 & $572;
   $573 = ($569>>>0)<($570>>>0);
   $or$cond8$i = $573 & $or$cond5$i;
   $574 = $570;
   $575 = $569;
   $576 = (($574) - ($575))|0;
   $577 = (($$0192) + 40)|0;
   $578 = ($576>>>0)>($577>>>0);
   $spec$select9$i = $578 ? $576 : $$4236$i;
   $or$cond8$not$i = $or$cond8$i ^ 1;
   $579 = ($569|0)==((-1)|0);
   $not$$i = $578 ^ 1;
   $580 = $579 | $not$$i;
   $or$cond50$i = $580 | $or$cond8$not$i;
   if (!($or$cond50$i)) {
    $$723947$i = $spec$select9$i;$$748$i = $569;
    label = 145;
   }
  }
 }
 if ((label|0) == 145) {
  $581 = HEAP32[(4600)>>2]|0;
  $582 = (($581) + ($$723947$i))|0;
  HEAP32[(4600)>>2] = $582;
  $583 = HEAP32[(4604)>>2]|0;
  $584 = ($582>>>0)>($583>>>0);
  if ($584) {
   HEAP32[(4604)>>2] = $582;
  }
  $585 = HEAP32[(4192)>>2]|0;
  $586 = ($585|0)==(0|0);
  L215: do {
   if ($586) {
    $587 = HEAP32[(4184)>>2]|0;
    $588 = ($587|0)==(0|0);
    $589 = ($$748$i>>>0)<($587>>>0);
    $or$cond11$i = $588 | $589;
    if ($or$cond11$i) {
     HEAP32[(4184)>>2] = $$748$i;
    }
    HEAP32[(4616)>>2] = $$748$i;
    HEAP32[(4620)>>2] = $$723947$i;
    HEAP32[(4628)>>2] = 0;
    $590 = HEAP32[1160]|0;
    HEAP32[(4204)>>2] = $590;
    HEAP32[(4200)>>2] = -1;
    HEAP32[(4220)>>2] = (4208);
    HEAP32[(4216)>>2] = (4208);
    HEAP32[(4228)>>2] = (4216);
    HEAP32[(4224)>>2] = (4216);
    HEAP32[(4236)>>2] = (4224);
    HEAP32[(4232)>>2] = (4224);
    HEAP32[(4244)>>2] = (4232);
    HEAP32[(4240)>>2] = (4232);
    HEAP32[(4252)>>2] = (4240);
    HEAP32[(4248)>>2] = (4240);
    HEAP32[(4260)>>2] = (4248);
    HEAP32[(4256)>>2] = (4248);
    HEAP32[(4268)>>2] = (4256);
    HEAP32[(4264)>>2] = (4256);
    HEAP32[(4276)>>2] = (4264);
    HEAP32[(4272)>>2] = (4264);
    HEAP32[(4284)>>2] = (4272);
    HEAP32[(4280)>>2] = (4272);
    HEAP32[(4292)>>2] = (4280);
    HEAP32[(4288)>>2] = (4280);
    HEAP32[(4300)>>2] = (4288);
    HEAP32[(4296)>>2] = (4288);
    HEAP32[(4308)>>2] = (4296);
    HEAP32[(4304)>>2] = (4296);
    HEAP32[(4316)>>2] = (4304);
    HEAP32[(4312)>>2] = (4304);
    HEAP32[(4324)>>2] = (4312);
    HEAP32[(4320)>>2] = (4312);
    HEAP32[(4332)>>2] = (4320);
    HEAP32[(4328)>>2] = (4320);
    HEAP32[(4340)>>2] = (4328);
    HEAP32[(4336)>>2] = (4328);
    HEAP32[(4348)>>2] = (4336);
    HEAP32[(4344)>>2] = (4336);
    HEAP32[(4356)>>2] = (4344);
    HEAP32[(4352)>>2] = (4344);
    HEAP32[(4364)>>2] = (4352);
    HEAP32[(4360)>>2] = (4352);
    HEAP32[(4372)>>2] = (4360);
    HEAP32[(4368)>>2] = (4360);
    HEAP32[(4380)>>2] = (4368);
    HEAP32[(4376)>>2] = (4368);
    HEAP32[(4388)>>2] = (4376);
    HEAP32[(4384)>>2] = (4376);
    HEAP32[(4396)>>2] = (4384);
    HEAP32[(4392)>>2] = (4384);
    HEAP32[(4404)>>2] = (4392);
    HEAP32[(4400)>>2] = (4392);
    HEAP32[(4412)>>2] = (4400);
    HEAP32[(4408)>>2] = (4400);
    HEAP32[(4420)>>2] = (4408);
    HEAP32[(4416)>>2] = (4408);
    HEAP32[(4428)>>2] = (4416);
    HEAP32[(4424)>>2] = (4416);
    HEAP32[(4436)>>2] = (4424);
    HEAP32[(4432)>>2] = (4424);
    HEAP32[(4444)>>2] = (4432);
    HEAP32[(4440)>>2] = (4432);
    HEAP32[(4452)>>2] = (4440);
    HEAP32[(4448)>>2] = (4440);
    HEAP32[(4460)>>2] = (4448);
    HEAP32[(4456)>>2] = (4448);
    HEAP32[(4468)>>2] = (4456);
    HEAP32[(4464)>>2] = (4456);
    $591 = (($$723947$i) + -40)|0;
    $592 = ((($$748$i)) + 8|0);
    $593 = $592;
    $594 = $593 & 7;
    $595 = ($594|0)==(0);
    $596 = (0 - ($593))|0;
    $597 = $596 & 7;
    $598 = $595 ? 0 : $597;
    $599 = (($$748$i) + ($598)|0);
    $600 = (($591) - ($598))|0;
    HEAP32[(4192)>>2] = $599;
    HEAP32[(4180)>>2] = $600;
    $601 = $600 | 1;
    $602 = ((($599)) + 4|0);
    HEAP32[$602>>2] = $601;
    $603 = (($$748$i) + ($591)|0);
    $604 = ((($603)) + 4|0);
    HEAP32[$604>>2] = 40;
    $605 = HEAP32[(4656)>>2]|0;
    HEAP32[(4196)>>2] = $605;
   } else {
    $$024372$i = (4616);
    while(1) {
     $606 = HEAP32[$$024372$i>>2]|0;
     $607 = ((($$024372$i)) + 4|0);
     $608 = HEAP32[$607>>2]|0;
     $609 = (($606) + ($608)|0);
     $610 = ($$748$i|0)==($609|0);
     if ($610) {
      label = 154;
      break;
     }
     $611 = ((($$024372$i)) + 8|0);
     $612 = HEAP32[$611>>2]|0;
     $613 = ($612|0)==(0|0);
     if ($613) {
      break;
     } else {
      $$024372$i = $612;
     }
    }
    if ((label|0) == 154) {
     $614 = ((($$024372$i)) + 4|0);
     $615 = ((($$024372$i)) + 12|0);
     $616 = HEAP32[$615>>2]|0;
     $617 = $616 & 8;
     $618 = ($617|0)==(0);
     if ($618) {
      $619 = ($606>>>0)<=($585>>>0);
      $620 = ($$748$i>>>0)>($585>>>0);
      $or$cond51$i = $620 & $619;
      if ($or$cond51$i) {
       $621 = (($608) + ($$723947$i))|0;
       HEAP32[$614>>2] = $621;
       $622 = HEAP32[(4180)>>2]|0;
       $623 = (($622) + ($$723947$i))|0;
       $624 = ((($585)) + 8|0);
       $625 = $624;
       $626 = $625 & 7;
       $627 = ($626|0)==(0);
       $628 = (0 - ($625))|0;
       $629 = $628 & 7;
       $630 = $627 ? 0 : $629;
       $631 = (($585) + ($630)|0);
       $632 = (($623) - ($630))|0;
       HEAP32[(4192)>>2] = $631;
       HEAP32[(4180)>>2] = $632;
       $633 = $632 | 1;
       $634 = ((($631)) + 4|0);
       HEAP32[$634>>2] = $633;
       $635 = (($585) + ($623)|0);
       $636 = ((($635)) + 4|0);
       HEAP32[$636>>2] = 40;
       $637 = HEAP32[(4656)>>2]|0;
       HEAP32[(4196)>>2] = $637;
       break;
      }
     }
    }
    $638 = HEAP32[(4184)>>2]|0;
    $639 = ($$748$i>>>0)<($638>>>0);
    if ($639) {
     HEAP32[(4184)>>2] = $$748$i;
    }
    $640 = (($$748$i) + ($$723947$i)|0);
    $$124471$i = (4616);
    while(1) {
     $641 = HEAP32[$$124471$i>>2]|0;
     $642 = ($641|0)==($640|0);
     if ($642) {
      label = 162;
      break;
     }
     $643 = ((($$124471$i)) + 8|0);
     $644 = HEAP32[$643>>2]|0;
     $645 = ($644|0)==(0|0);
     if ($645) {
      break;
     } else {
      $$124471$i = $644;
     }
    }
    if ((label|0) == 162) {
     $646 = ((($$124471$i)) + 12|0);
     $647 = HEAP32[$646>>2]|0;
     $648 = $647 & 8;
     $649 = ($648|0)==(0);
     if ($649) {
      HEAP32[$$124471$i>>2] = $$748$i;
      $650 = ((($$124471$i)) + 4|0);
      $651 = HEAP32[$650>>2]|0;
      $652 = (($651) + ($$723947$i))|0;
      HEAP32[$650>>2] = $652;
      $653 = ((($$748$i)) + 8|0);
      $654 = $653;
      $655 = $654 & 7;
      $656 = ($655|0)==(0);
      $657 = (0 - ($654))|0;
      $658 = $657 & 7;
      $659 = $656 ? 0 : $658;
      $660 = (($$748$i) + ($659)|0);
      $661 = ((($640)) + 8|0);
      $662 = $661;
      $663 = $662 & 7;
      $664 = ($663|0)==(0);
      $665 = (0 - ($662))|0;
      $666 = $665 & 7;
      $667 = $664 ? 0 : $666;
      $668 = (($640) + ($667)|0);
      $669 = $668;
      $670 = $660;
      $671 = (($669) - ($670))|0;
      $672 = (($660) + ($$0192)|0);
      $673 = (($671) - ($$0192))|0;
      $674 = $$0192 | 3;
      $675 = ((($660)) + 4|0);
      HEAP32[$675>>2] = $674;
      $676 = ($585|0)==($668|0);
      L238: do {
       if ($676) {
        $677 = HEAP32[(4180)>>2]|0;
        $678 = (($677) + ($673))|0;
        HEAP32[(4180)>>2] = $678;
        HEAP32[(4192)>>2] = $672;
        $679 = $678 | 1;
        $680 = ((($672)) + 4|0);
        HEAP32[$680>>2] = $679;
       } else {
        $681 = HEAP32[(4188)>>2]|0;
        $682 = ($681|0)==($668|0);
        if ($682) {
         $683 = HEAP32[(4176)>>2]|0;
         $684 = (($683) + ($673))|0;
         HEAP32[(4176)>>2] = $684;
         HEAP32[(4188)>>2] = $672;
         $685 = $684 | 1;
         $686 = ((($672)) + 4|0);
         HEAP32[$686>>2] = $685;
         $687 = (($672) + ($684)|0);
         HEAP32[$687>>2] = $684;
         break;
        }
        $688 = ((($668)) + 4|0);
        $689 = HEAP32[$688>>2]|0;
        $690 = $689 & 3;
        $691 = ($690|0)==(1);
        if ($691) {
         $692 = $689 & -8;
         $693 = $689 >>> 3;
         $694 = ($689>>>0)<(256);
         L246: do {
          if ($694) {
           $695 = ((($668)) + 8|0);
           $696 = HEAP32[$695>>2]|0;
           $697 = ((($668)) + 12|0);
           $698 = HEAP32[$697>>2]|0;
           $699 = ($698|0)==($696|0);
           if ($699) {
            $700 = 1 << $693;
            $701 = $700 ^ -1;
            $702 = HEAP32[1042]|0;
            $703 = $702 & $701;
            HEAP32[1042] = $703;
            break;
           } else {
            $704 = ((($696)) + 12|0);
            HEAP32[$704>>2] = $698;
            $705 = ((($698)) + 8|0);
            HEAP32[$705>>2] = $696;
            break;
           }
          } else {
           $706 = ((($668)) + 24|0);
           $707 = HEAP32[$706>>2]|0;
           $708 = ((($668)) + 12|0);
           $709 = HEAP32[$708>>2]|0;
           $710 = ($709|0)==($668|0);
           do {
            if ($710) {
             $715 = ((($668)) + 16|0);
             $716 = ((($715)) + 4|0);
             $717 = HEAP32[$716>>2]|0;
             $718 = ($717|0)==(0|0);
             if ($718) {
              $719 = HEAP32[$715>>2]|0;
              $720 = ($719|0)==(0|0);
              if ($720) {
               $$3$i$i = 0;
               break;
              } else {
               $$1263$i$i$ph = $719;$$1265$i$i$ph = $715;
              }
             } else {
              $$1263$i$i$ph = $717;$$1265$i$i$ph = $716;
             }
             $$1263$i$i = $$1263$i$i$ph;$$1265$i$i = $$1265$i$i$ph;
             while(1) {
              $721 = ((($$1263$i$i)) + 20|0);
              $722 = HEAP32[$721>>2]|0;
              $723 = ($722|0)==(0|0);
              if ($723) {
               $724 = ((($$1263$i$i)) + 16|0);
               $725 = HEAP32[$724>>2]|0;
               $726 = ($725|0)==(0|0);
               if ($726) {
                break;
               } else {
                $$1263$i$i$be = $725;$$1265$i$i$be = $724;
               }
              } else {
               $$1263$i$i$be = $722;$$1265$i$i$be = $721;
              }
              $$1263$i$i = $$1263$i$i$be;$$1265$i$i = $$1265$i$i$be;
             }
             HEAP32[$$1265$i$i>>2] = 0;
             $$3$i$i = $$1263$i$i;
            } else {
             $711 = ((($668)) + 8|0);
             $712 = HEAP32[$711>>2]|0;
             $713 = ((($712)) + 12|0);
             HEAP32[$713>>2] = $709;
             $714 = ((($709)) + 8|0);
             HEAP32[$714>>2] = $712;
             $$3$i$i = $709;
            }
           } while(0);
           $727 = ($707|0)==(0|0);
           if ($727) {
            break;
           }
           $728 = ((($668)) + 28|0);
           $729 = HEAP32[$728>>2]|0;
           $730 = (4472 + ($729<<2)|0);
           $731 = HEAP32[$730>>2]|0;
           $732 = ($731|0)==($668|0);
           do {
            if ($732) {
             HEAP32[$730>>2] = $$3$i$i;
             $cond$i$i = ($$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $733 = 1 << $729;
             $734 = $733 ^ -1;
             $735 = HEAP32[(4172)>>2]|0;
             $736 = $735 & $734;
             HEAP32[(4172)>>2] = $736;
             break L246;
            } else {
             $737 = ((($707)) + 16|0);
             $738 = HEAP32[$737>>2]|0;
             $739 = ($738|0)==($668|0);
             $740 = ((($707)) + 20|0);
             $$sink321 = $739 ? $737 : $740;
             HEAP32[$$sink321>>2] = $$3$i$i;
             $741 = ($$3$i$i|0)==(0|0);
             if ($741) {
              break L246;
             }
            }
           } while(0);
           $742 = ((($$3$i$i)) + 24|0);
           HEAP32[$742>>2] = $707;
           $743 = ((($668)) + 16|0);
           $744 = HEAP32[$743>>2]|0;
           $745 = ($744|0)==(0|0);
           if (!($745)) {
            $746 = ((($$3$i$i)) + 16|0);
            HEAP32[$746>>2] = $744;
            $747 = ((($744)) + 24|0);
            HEAP32[$747>>2] = $$3$i$i;
           }
           $748 = ((($743)) + 4|0);
           $749 = HEAP32[$748>>2]|0;
           $750 = ($749|0)==(0|0);
           if ($750) {
            break;
           }
           $751 = ((($$3$i$i)) + 20|0);
           HEAP32[$751>>2] = $749;
           $752 = ((($749)) + 24|0);
           HEAP32[$752>>2] = $$3$i$i;
          }
         } while(0);
         $753 = (($668) + ($692)|0);
         $754 = (($692) + ($673))|0;
         $$0$i$i = $753;$$0259$i$i = $754;
        } else {
         $$0$i$i = $668;$$0259$i$i = $673;
        }
        $755 = ((($$0$i$i)) + 4|0);
        $756 = HEAP32[$755>>2]|0;
        $757 = $756 & -2;
        HEAP32[$755>>2] = $757;
        $758 = $$0259$i$i | 1;
        $759 = ((($672)) + 4|0);
        HEAP32[$759>>2] = $758;
        $760 = (($672) + ($$0259$i$i)|0);
        HEAP32[$760>>2] = $$0259$i$i;
        $761 = $$0259$i$i >>> 3;
        $762 = ($$0259$i$i>>>0)<(256);
        if ($762) {
         $763 = $761 << 1;
         $764 = (4208 + ($763<<2)|0);
         $765 = HEAP32[1042]|0;
         $766 = 1 << $761;
         $767 = $765 & $766;
         $768 = ($767|0)==(0);
         if ($768) {
          $769 = $765 | $766;
          HEAP32[1042] = $769;
          $$pre$i16$i = ((($764)) + 8|0);
          $$0267$i$i = $764;$$pre$phi$i17$iZ2D = $$pre$i16$i;
         } else {
          $770 = ((($764)) + 8|0);
          $771 = HEAP32[$770>>2]|0;
          $$0267$i$i = $771;$$pre$phi$i17$iZ2D = $770;
         }
         HEAP32[$$pre$phi$i17$iZ2D>>2] = $672;
         $772 = ((($$0267$i$i)) + 12|0);
         HEAP32[$772>>2] = $672;
         $773 = ((($672)) + 8|0);
         HEAP32[$773>>2] = $$0267$i$i;
         $774 = ((($672)) + 12|0);
         HEAP32[$774>>2] = $764;
         break;
        }
        $775 = $$0259$i$i >>> 8;
        $776 = ($775|0)==(0);
        do {
         if ($776) {
          $$0268$i$i = 0;
         } else {
          $777 = ($$0259$i$i>>>0)>(16777215);
          if ($777) {
           $$0268$i$i = 31;
           break;
          }
          $778 = (($775) + 1048320)|0;
          $779 = $778 >>> 16;
          $780 = $779 & 8;
          $781 = $775 << $780;
          $782 = (($781) + 520192)|0;
          $783 = $782 >>> 16;
          $784 = $783 & 4;
          $785 = $784 | $780;
          $786 = $781 << $784;
          $787 = (($786) + 245760)|0;
          $788 = $787 >>> 16;
          $789 = $788 & 2;
          $790 = $785 | $789;
          $791 = (14 - ($790))|0;
          $792 = $786 << $789;
          $793 = $792 >>> 15;
          $794 = (($791) + ($793))|0;
          $795 = $794 << 1;
          $796 = (($794) + 7)|0;
          $797 = $$0259$i$i >>> $796;
          $798 = $797 & 1;
          $799 = $798 | $795;
          $$0268$i$i = $799;
         }
        } while(0);
        $800 = (4472 + ($$0268$i$i<<2)|0);
        $801 = ((($672)) + 28|0);
        HEAP32[$801>>2] = $$0268$i$i;
        $802 = ((($672)) + 16|0);
        $803 = ((($802)) + 4|0);
        HEAP32[$803>>2] = 0;
        HEAP32[$802>>2] = 0;
        $804 = HEAP32[(4172)>>2]|0;
        $805 = 1 << $$0268$i$i;
        $806 = $804 & $805;
        $807 = ($806|0)==(0);
        if ($807) {
         $808 = $804 | $805;
         HEAP32[(4172)>>2] = $808;
         HEAP32[$800>>2] = $672;
         $809 = ((($672)) + 24|0);
         HEAP32[$809>>2] = $800;
         $810 = ((($672)) + 12|0);
         HEAP32[$810>>2] = $672;
         $811 = ((($672)) + 8|0);
         HEAP32[$811>>2] = $672;
         break;
        }
        $812 = HEAP32[$800>>2]|0;
        $813 = ((($812)) + 4|0);
        $814 = HEAP32[$813>>2]|0;
        $815 = $814 & -8;
        $816 = ($815|0)==($$0259$i$i|0);
        L291: do {
         if ($816) {
          $$0261$lcssa$i$i = $812;
         } else {
          $817 = ($$0268$i$i|0)==(31);
          $818 = $$0268$i$i >>> 1;
          $819 = (25 - ($818))|0;
          $820 = $817 ? 0 : $819;
          $821 = $$0259$i$i << $820;
          $$02604$i$i = $821;$$02613$i$i = $812;
          while(1) {
           $828 = $$02604$i$i >>> 31;
           $829 = (((($$02613$i$i)) + 16|0) + ($828<<2)|0);
           $824 = HEAP32[$829>>2]|0;
           $830 = ($824|0)==(0|0);
           if ($830) {
            break;
           }
           $822 = $$02604$i$i << 1;
           $823 = ((($824)) + 4|0);
           $825 = HEAP32[$823>>2]|0;
           $826 = $825 & -8;
           $827 = ($826|0)==($$0259$i$i|0);
           if ($827) {
            $$0261$lcssa$i$i = $824;
            break L291;
           } else {
            $$02604$i$i = $822;$$02613$i$i = $824;
           }
          }
          HEAP32[$829>>2] = $672;
          $831 = ((($672)) + 24|0);
          HEAP32[$831>>2] = $$02613$i$i;
          $832 = ((($672)) + 12|0);
          HEAP32[$832>>2] = $672;
          $833 = ((($672)) + 8|0);
          HEAP32[$833>>2] = $672;
          break L238;
         }
        } while(0);
        $834 = ((($$0261$lcssa$i$i)) + 8|0);
        $835 = HEAP32[$834>>2]|0;
        $836 = ((($835)) + 12|0);
        HEAP32[$836>>2] = $672;
        HEAP32[$834>>2] = $672;
        $837 = ((($672)) + 8|0);
        HEAP32[$837>>2] = $835;
        $838 = ((($672)) + 12|0);
        HEAP32[$838>>2] = $$0261$lcssa$i$i;
        $839 = ((($672)) + 24|0);
        HEAP32[$839>>2] = 0;
       }
      } while(0);
      $968 = ((($660)) + 8|0);
      $$0 = $968;
      STACKTOP = sp;return ($$0|0);
     }
    }
    $$0$i$i$i = (4616);
    while(1) {
     $840 = HEAP32[$$0$i$i$i>>2]|0;
     $841 = ($840>>>0)>($585>>>0);
     if (!($841)) {
      $842 = ((($$0$i$i$i)) + 4|0);
      $843 = HEAP32[$842>>2]|0;
      $844 = (($840) + ($843)|0);
      $845 = ($844>>>0)>($585>>>0);
      if ($845) {
       break;
      }
     }
     $846 = ((($$0$i$i$i)) + 8|0);
     $847 = HEAP32[$846>>2]|0;
     $$0$i$i$i = $847;
    }
    $848 = ((($844)) + -47|0);
    $849 = ((($848)) + 8|0);
    $850 = $849;
    $851 = $850 & 7;
    $852 = ($851|0)==(0);
    $853 = (0 - ($850))|0;
    $854 = $853 & 7;
    $855 = $852 ? 0 : $854;
    $856 = (($848) + ($855)|0);
    $857 = ((($585)) + 16|0);
    $858 = ($856>>>0)<($857>>>0);
    $859 = $858 ? $585 : $856;
    $860 = ((($859)) + 8|0);
    $861 = ((($859)) + 24|0);
    $862 = (($$723947$i) + -40)|0;
    $863 = ((($$748$i)) + 8|0);
    $864 = $863;
    $865 = $864 & 7;
    $866 = ($865|0)==(0);
    $867 = (0 - ($864))|0;
    $868 = $867 & 7;
    $869 = $866 ? 0 : $868;
    $870 = (($$748$i) + ($869)|0);
    $871 = (($862) - ($869))|0;
    HEAP32[(4192)>>2] = $870;
    HEAP32[(4180)>>2] = $871;
    $872 = $871 | 1;
    $873 = ((($870)) + 4|0);
    HEAP32[$873>>2] = $872;
    $874 = (($$748$i) + ($862)|0);
    $875 = ((($874)) + 4|0);
    HEAP32[$875>>2] = 40;
    $876 = HEAP32[(4656)>>2]|0;
    HEAP32[(4196)>>2] = $876;
    $877 = ((($859)) + 4|0);
    HEAP32[$877>>2] = 27;
    ;HEAP32[$860>>2]=HEAP32[(4616)>>2]|0;HEAP32[$860+4>>2]=HEAP32[(4616)+4>>2]|0;HEAP32[$860+8>>2]=HEAP32[(4616)+8>>2]|0;HEAP32[$860+12>>2]=HEAP32[(4616)+12>>2]|0;
    HEAP32[(4616)>>2] = $$748$i;
    HEAP32[(4620)>>2] = $$723947$i;
    HEAP32[(4628)>>2] = 0;
    HEAP32[(4624)>>2] = $860;
    $879 = $861;
    while(1) {
     $878 = ((($879)) + 4|0);
     HEAP32[$878>>2] = 7;
     $880 = ((($879)) + 8|0);
     $881 = ($880>>>0)<($844>>>0);
     if ($881) {
      $879 = $878;
     } else {
      break;
     }
    }
    $882 = ($859|0)==($585|0);
    if (!($882)) {
     $883 = $859;
     $884 = $585;
     $885 = (($883) - ($884))|0;
     $886 = HEAP32[$877>>2]|0;
     $887 = $886 & -2;
     HEAP32[$877>>2] = $887;
     $888 = $885 | 1;
     $889 = ((($585)) + 4|0);
     HEAP32[$889>>2] = $888;
     HEAP32[$859>>2] = $885;
     $890 = $885 >>> 3;
     $891 = ($885>>>0)<(256);
     if ($891) {
      $892 = $890 << 1;
      $893 = (4208 + ($892<<2)|0);
      $894 = HEAP32[1042]|0;
      $895 = 1 << $890;
      $896 = $894 & $895;
      $897 = ($896|0)==(0);
      if ($897) {
       $898 = $894 | $895;
       HEAP32[1042] = $898;
       $$pre$i$i = ((($893)) + 8|0);
       $$0206$i$i = $893;$$pre$phi$i$iZ2D = $$pre$i$i;
      } else {
       $899 = ((($893)) + 8|0);
       $900 = HEAP32[$899>>2]|0;
       $$0206$i$i = $900;$$pre$phi$i$iZ2D = $899;
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $585;
      $901 = ((($$0206$i$i)) + 12|0);
      HEAP32[$901>>2] = $585;
      $902 = ((($585)) + 8|0);
      HEAP32[$902>>2] = $$0206$i$i;
      $903 = ((($585)) + 12|0);
      HEAP32[$903>>2] = $893;
      break;
     }
     $904 = $885 >>> 8;
     $905 = ($904|0)==(0);
     if ($905) {
      $$0207$i$i = 0;
     } else {
      $906 = ($885>>>0)>(16777215);
      if ($906) {
       $$0207$i$i = 31;
      } else {
       $907 = (($904) + 1048320)|0;
       $908 = $907 >>> 16;
       $909 = $908 & 8;
       $910 = $904 << $909;
       $911 = (($910) + 520192)|0;
       $912 = $911 >>> 16;
       $913 = $912 & 4;
       $914 = $913 | $909;
       $915 = $910 << $913;
       $916 = (($915) + 245760)|0;
       $917 = $916 >>> 16;
       $918 = $917 & 2;
       $919 = $914 | $918;
       $920 = (14 - ($919))|0;
       $921 = $915 << $918;
       $922 = $921 >>> 15;
       $923 = (($920) + ($922))|0;
       $924 = $923 << 1;
       $925 = (($923) + 7)|0;
       $926 = $885 >>> $925;
       $927 = $926 & 1;
       $928 = $927 | $924;
       $$0207$i$i = $928;
      }
     }
     $929 = (4472 + ($$0207$i$i<<2)|0);
     $930 = ((($585)) + 28|0);
     HEAP32[$930>>2] = $$0207$i$i;
     $931 = ((($585)) + 20|0);
     HEAP32[$931>>2] = 0;
     HEAP32[$857>>2] = 0;
     $932 = HEAP32[(4172)>>2]|0;
     $933 = 1 << $$0207$i$i;
     $934 = $932 & $933;
     $935 = ($934|0)==(0);
     if ($935) {
      $936 = $932 | $933;
      HEAP32[(4172)>>2] = $936;
      HEAP32[$929>>2] = $585;
      $937 = ((($585)) + 24|0);
      HEAP32[$937>>2] = $929;
      $938 = ((($585)) + 12|0);
      HEAP32[$938>>2] = $585;
      $939 = ((($585)) + 8|0);
      HEAP32[$939>>2] = $585;
      break;
     }
     $940 = HEAP32[$929>>2]|0;
     $941 = ((($940)) + 4|0);
     $942 = HEAP32[$941>>2]|0;
     $943 = $942 & -8;
     $944 = ($943|0)==($885|0);
     L325: do {
      if ($944) {
       $$0202$lcssa$i$i = $940;
      } else {
       $945 = ($$0207$i$i|0)==(31);
       $946 = $$0207$i$i >>> 1;
       $947 = (25 - ($946))|0;
       $948 = $945 ? 0 : $947;
       $949 = $885 << $948;
       $$02014$i$i = $949;$$02023$i$i = $940;
       while(1) {
        $956 = $$02014$i$i >>> 31;
        $957 = (((($$02023$i$i)) + 16|0) + ($956<<2)|0);
        $952 = HEAP32[$957>>2]|0;
        $958 = ($952|0)==(0|0);
        if ($958) {
         break;
        }
        $950 = $$02014$i$i << 1;
        $951 = ((($952)) + 4|0);
        $953 = HEAP32[$951>>2]|0;
        $954 = $953 & -8;
        $955 = ($954|0)==($885|0);
        if ($955) {
         $$0202$lcssa$i$i = $952;
         break L325;
        } else {
         $$02014$i$i = $950;$$02023$i$i = $952;
        }
       }
       HEAP32[$957>>2] = $585;
       $959 = ((($585)) + 24|0);
       HEAP32[$959>>2] = $$02023$i$i;
       $960 = ((($585)) + 12|0);
       HEAP32[$960>>2] = $585;
       $961 = ((($585)) + 8|0);
       HEAP32[$961>>2] = $585;
       break L215;
      }
     } while(0);
     $962 = ((($$0202$lcssa$i$i)) + 8|0);
     $963 = HEAP32[$962>>2]|0;
     $964 = ((($963)) + 12|0);
     HEAP32[$964>>2] = $585;
     HEAP32[$962>>2] = $585;
     $965 = ((($585)) + 8|0);
     HEAP32[$965>>2] = $963;
     $966 = ((($585)) + 12|0);
     HEAP32[$966>>2] = $$0202$lcssa$i$i;
     $967 = ((($585)) + 24|0);
     HEAP32[$967>>2] = 0;
    }
   }
  } while(0);
  $969 = HEAP32[(4180)>>2]|0;
  $970 = ($969>>>0)>($$0192>>>0);
  if ($970) {
   $971 = (($969) - ($$0192))|0;
   HEAP32[(4180)>>2] = $971;
   $972 = HEAP32[(4192)>>2]|0;
   $973 = (($972) + ($$0192)|0);
   HEAP32[(4192)>>2] = $973;
   $974 = $971 | 1;
   $975 = ((($973)) + 4|0);
   HEAP32[$975>>2] = $974;
   $976 = $$0192 | 3;
   $977 = ((($972)) + 4|0);
   HEAP32[$977>>2] = $976;
   $978 = ((($972)) + 8|0);
   $$0 = $978;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $979 = (___errno_location()|0);
 HEAP32[$979>>2] = 12;
 $$0 = 0;
 STACKTOP = sp;return ($$0|0);
}
function _free($0) {
 $0 = $0|0;
 var $$0194$i = 0, $$0194$in$i = 0, $$0346381 = 0, $$0347$lcssa = 0, $$0347380 = 0, $$0359 = 0, $$0366 = 0, $$1 = 0, $$1345 = 0, $$1350 = 0, $$1350$be = 0, $$1350$ph = 0, $$1353 = 0, $$1353$be = 0, $$1353$ph = 0, $$1361 = 0, $$1361$be = 0, $$1361$ph = 0, $$1365 = 0, $$1365$be = 0;
 var $$1365$ph = 0, $$2 = 0, $$3 = 0, $$3363 = 0, $$pre = 0, $$pre$phiZ2D = 0, $$sink = 0, $$sink395 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0;
 var $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0;
 var $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0;
 var $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0;
 var $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0;
 var $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0;
 var $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0;
 var $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0;
 var $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0;
 var $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0;
 var $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0;
 var $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0;
 var $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $cond371 = 0, $cond372 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 }
 $2 = ((($0)) + -8|0);
 $3 = HEAP32[(4184)>>2]|0;
 $4 = ((($0)) + -4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 & -8;
 $7 = (($2) + ($6)|0);
 $8 = $5 & 1;
 $9 = ($8|0)==(0);
 do {
  if ($9) {
   $10 = HEAP32[$2>>2]|0;
   $11 = $5 & 3;
   $12 = ($11|0)==(0);
   if ($12) {
    return;
   }
   $13 = (0 - ($10))|0;
   $14 = (($2) + ($13)|0);
   $15 = (($10) + ($6))|0;
   $16 = ($14>>>0)<($3>>>0);
   if ($16) {
    return;
   }
   $17 = HEAP32[(4188)>>2]|0;
   $18 = ($17|0)==($14|0);
   if ($18) {
    $79 = ((($7)) + 4|0);
    $80 = HEAP32[$79>>2]|0;
    $81 = $80 & 3;
    $82 = ($81|0)==(3);
    if (!($82)) {
     $$1 = $14;$$1345 = $15;$88 = $14;
     break;
    }
    $83 = (($14) + ($15)|0);
    $84 = ((($14)) + 4|0);
    $85 = $15 | 1;
    $86 = $80 & -2;
    HEAP32[(4176)>>2] = $15;
    HEAP32[$79>>2] = $86;
    HEAP32[$84>>2] = $85;
    HEAP32[$83>>2] = $15;
    return;
   }
   $19 = $10 >>> 3;
   $20 = ($10>>>0)<(256);
   if ($20) {
    $21 = ((($14)) + 8|0);
    $22 = HEAP32[$21>>2]|0;
    $23 = ((($14)) + 12|0);
    $24 = HEAP32[$23>>2]|0;
    $25 = ($24|0)==($22|0);
    if ($25) {
     $26 = 1 << $19;
     $27 = $26 ^ -1;
     $28 = HEAP32[1042]|0;
     $29 = $28 & $27;
     HEAP32[1042] = $29;
     $$1 = $14;$$1345 = $15;$88 = $14;
     break;
    } else {
     $30 = ((($22)) + 12|0);
     HEAP32[$30>>2] = $24;
     $31 = ((($24)) + 8|0);
     HEAP32[$31>>2] = $22;
     $$1 = $14;$$1345 = $15;$88 = $14;
     break;
    }
   }
   $32 = ((($14)) + 24|0);
   $33 = HEAP32[$32>>2]|0;
   $34 = ((($14)) + 12|0);
   $35 = HEAP32[$34>>2]|0;
   $36 = ($35|0)==($14|0);
   do {
    if ($36) {
     $41 = ((($14)) + 16|0);
     $42 = ((($41)) + 4|0);
     $43 = HEAP32[$42>>2]|0;
     $44 = ($43|0)==(0|0);
     if ($44) {
      $45 = HEAP32[$41>>2]|0;
      $46 = ($45|0)==(0|0);
      if ($46) {
       $$3 = 0;
       break;
      } else {
       $$1350$ph = $45;$$1353$ph = $41;
      }
     } else {
      $$1350$ph = $43;$$1353$ph = $42;
     }
     $$1350 = $$1350$ph;$$1353 = $$1353$ph;
     while(1) {
      $47 = ((($$1350)) + 20|0);
      $48 = HEAP32[$47>>2]|0;
      $49 = ($48|0)==(0|0);
      if ($49) {
       $50 = ((($$1350)) + 16|0);
       $51 = HEAP32[$50>>2]|0;
       $52 = ($51|0)==(0|0);
       if ($52) {
        break;
       } else {
        $$1350$be = $51;$$1353$be = $50;
       }
      } else {
       $$1350$be = $48;$$1353$be = $47;
      }
      $$1350 = $$1350$be;$$1353 = $$1353$be;
     }
     HEAP32[$$1353>>2] = 0;
     $$3 = $$1350;
    } else {
     $37 = ((($14)) + 8|0);
     $38 = HEAP32[$37>>2]|0;
     $39 = ((($38)) + 12|0);
     HEAP32[$39>>2] = $35;
     $40 = ((($35)) + 8|0);
     HEAP32[$40>>2] = $38;
     $$3 = $35;
    }
   } while(0);
   $53 = ($33|0)==(0|0);
   if ($53) {
    $$1 = $14;$$1345 = $15;$88 = $14;
   } else {
    $54 = ((($14)) + 28|0);
    $55 = HEAP32[$54>>2]|0;
    $56 = (4472 + ($55<<2)|0);
    $57 = HEAP32[$56>>2]|0;
    $58 = ($57|0)==($14|0);
    if ($58) {
     HEAP32[$56>>2] = $$3;
     $cond371 = ($$3|0)==(0|0);
     if ($cond371) {
      $59 = 1 << $55;
      $60 = $59 ^ -1;
      $61 = HEAP32[(4172)>>2]|0;
      $62 = $61 & $60;
      HEAP32[(4172)>>2] = $62;
      $$1 = $14;$$1345 = $15;$88 = $14;
      break;
     }
    } else {
     $63 = ((($33)) + 16|0);
     $64 = HEAP32[$63>>2]|0;
     $65 = ($64|0)==($14|0);
     $66 = ((($33)) + 20|0);
     $$sink = $65 ? $63 : $66;
     HEAP32[$$sink>>2] = $$3;
     $67 = ($$3|0)==(0|0);
     if ($67) {
      $$1 = $14;$$1345 = $15;$88 = $14;
      break;
     }
    }
    $68 = ((($$3)) + 24|0);
    HEAP32[$68>>2] = $33;
    $69 = ((($14)) + 16|0);
    $70 = HEAP32[$69>>2]|0;
    $71 = ($70|0)==(0|0);
    if (!($71)) {
     $72 = ((($$3)) + 16|0);
     HEAP32[$72>>2] = $70;
     $73 = ((($70)) + 24|0);
     HEAP32[$73>>2] = $$3;
    }
    $74 = ((($69)) + 4|0);
    $75 = HEAP32[$74>>2]|0;
    $76 = ($75|0)==(0|0);
    if ($76) {
     $$1 = $14;$$1345 = $15;$88 = $14;
    } else {
     $77 = ((($$3)) + 20|0);
     HEAP32[$77>>2] = $75;
     $78 = ((($75)) + 24|0);
     HEAP32[$78>>2] = $$3;
     $$1 = $14;$$1345 = $15;$88 = $14;
    }
   }
  } else {
   $$1 = $2;$$1345 = $6;$88 = $2;
  }
 } while(0);
 $87 = ($88>>>0)<($7>>>0);
 if (!($87)) {
  return;
 }
 $89 = ((($7)) + 4|0);
 $90 = HEAP32[$89>>2]|0;
 $91 = $90 & 1;
 $92 = ($91|0)==(0);
 if ($92) {
  return;
 }
 $93 = $90 & 2;
 $94 = ($93|0)==(0);
 if ($94) {
  $95 = HEAP32[(4192)>>2]|0;
  $96 = ($95|0)==($7|0);
  if ($96) {
   $97 = HEAP32[(4180)>>2]|0;
   $98 = (($97) + ($$1345))|0;
   HEAP32[(4180)>>2] = $98;
   HEAP32[(4192)>>2] = $$1;
   $99 = $98 | 1;
   $100 = ((($$1)) + 4|0);
   HEAP32[$100>>2] = $99;
   $101 = HEAP32[(4188)>>2]|0;
   $102 = ($$1|0)==($101|0);
   if (!($102)) {
    return;
   }
   HEAP32[(4188)>>2] = 0;
   HEAP32[(4176)>>2] = 0;
   return;
  }
  $103 = HEAP32[(4188)>>2]|0;
  $104 = ($103|0)==($7|0);
  if ($104) {
   $105 = HEAP32[(4176)>>2]|0;
   $106 = (($105) + ($$1345))|0;
   HEAP32[(4176)>>2] = $106;
   HEAP32[(4188)>>2] = $88;
   $107 = $106 | 1;
   $108 = ((($$1)) + 4|0);
   HEAP32[$108>>2] = $107;
   $109 = (($88) + ($106)|0);
   HEAP32[$109>>2] = $106;
   return;
  }
  $110 = $90 & -8;
  $111 = (($110) + ($$1345))|0;
  $112 = $90 >>> 3;
  $113 = ($90>>>0)<(256);
  do {
   if ($113) {
    $114 = ((($7)) + 8|0);
    $115 = HEAP32[$114>>2]|0;
    $116 = ((($7)) + 12|0);
    $117 = HEAP32[$116>>2]|0;
    $118 = ($117|0)==($115|0);
    if ($118) {
     $119 = 1 << $112;
     $120 = $119 ^ -1;
     $121 = HEAP32[1042]|0;
     $122 = $121 & $120;
     HEAP32[1042] = $122;
     break;
    } else {
     $123 = ((($115)) + 12|0);
     HEAP32[$123>>2] = $117;
     $124 = ((($117)) + 8|0);
     HEAP32[$124>>2] = $115;
     break;
    }
   } else {
    $125 = ((($7)) + 24|0);
    $126 = HEAP32[$125>>2]|0;
    $127 = ((($7)) + 12|0);
    $128 = HEAP32[$127>>2]|0;
    $129 = ($128|0)==($7|0);
    do {
     if ($129) {
      $134 = ((($7)) + 16|0);
      $135 = ((($134)) + 4|0);
      $136 = HEAP32[$135>>2]|0;
      $137 = ($136|0)==(0|0);
      if ($137) {
       $138 = HEAP32[$134>>2]|0;
       $139 = ($138|0)==(0|0);
       if ($139) {
        $$3363 = 0;
        break;
       } else {
        $$1361$ph = $138;$$1365$ph = $134;
       }
      } else {
       $$1361$ph = $136;$$1365$ph = $135;
      }
      $$1361 = $$1361$ph;$$1365 = $$1365$ph;
      while(1) {
       $140 = ((($$1361)) + 20|0);
       $141 = HEAP32[$140>>2]|0;
       $142 = ($141|0)==(0|0);
       if ($142) {
        $143 = ((($$1361)) + 16|0);
        $144 = HEAP32[$143>>2]|0;
        $145 = ($144|0)==(0|0);
        if ($145) {
         break;
        } else {
         $$1361$be = $144;$$1365$be = $143;
        }
       } else {
        $$1361$be = $141;$$1365$be = $140;
       }
       $$1361 = $$1361$be;$$1365 = $$1365$be;
      }
      HEAP32[$$1365>>2] = 0;
      $$3363 = $$1361;
     } else {
      $130 = ((($7)) + 8|0);
      $131 = HEAP32[$130>>2]|0;
      $132 = ((($131)) + 12|0);
      HEAP32[$132>>2] = $128;
      $133 = ((($128)) + 8|0);
      HEAP32[$133>>2] = $131;
      $$3363 = $128;
     }
    } while(0);
    $146 = ($126|0)==(0|0);
    if (!($146)) {
     $147 = ((($7)) + 28|0);
     $148 = HEAP32[$147>>2]|0;
     $149 = (4472 + ($148<<2)|0);
     $150 = HEAP32[$149>>2]|0;
     $151 = ($150|0)==($7|0);
     if ($151) {
      HEAP32[$149>>2] = $$3363;
      $cond372 = ($$3363|0)==(0|0);
      if ($cond372) {
       $152 = 1 << $148;
       $153 = $152 ^ -1;
       $154 = HEAP32[(4172)>>2]|0;
       $155 = $154 & $153;
       HEAP32[(4172)>>2] = $155;
       break;
      }
     } else {
      $156 = ((($126)) + 16|0);
      $157 = HEAP32[$156>>2]|0;
      $158 = ($157|0)==($7|0);
      $159 = ((($126)) + 20|0);
      $$sink395 = $158 ? $156 : $159;
      HEAP32[$$sink395>>2] = $$3363;
      $160 = ($$3363|0)==(0|0);
      if ($160) {
       break;
      }
     }
     $161 = ((($$3363)) + 24|0);
     HEAP32[$161>>2] = $126;
     $162 = ((($7)) + 16|0);
     $163 = HEAP32[$162>>2]|0;
     $164 = ($163|0)==(0|0);
     if (!($164)) {
      $165 = ((($$3363)) + 16|0);
      HEAP32[$165>>2] = $163;
      $166 = ((($163)) + 24|0);
      HEAP32[$166>>2] = $$3363;
     }
     $167 = ((($162)) + 4|0);
     $168 = HEAP32[$167>>2]|0;
     $169 = ($168|0)==(0|0);
     if (!($169)) {
      $170 = ((($$3363)) + 20|0);
      HEAP32[$170>>2] = $168;
      $171 = ((($168)) + 24|0);
      HEAP32[$171>>2] = $$3363;
     }
    }
   }
  } while(0);
  $172 = $111 | 1;
  $173 = ((($$1)) + 4|0);
  HEAP32[$173>>2] = $172;
  $174 = (($88) + ($111)|0);
  HEAP32[$174>>2] = $111;
  $175 = HEAP32[(4188)>>2]|0;
  $176 = ($$1|0)==($175|0);
  if ($176) {
   HEAP32[(4176)>>2] = $111;
   return;
  } else {
   $$2 = $111;
  }
 } else {
  $177 = $90 & -2;
  HEAP32[$89>>2] = $177;
  $178 = $$1345 | 1;
  $179 = ((($$1)) + 4|0);
  HEAP32[$179>>2] = $178;
  $180 = (($88) + ($$1345)|0);
  HEAP32[$180>>2] = $$1345;
  $$2 = $$1345;
 }
 $181 = $$2 >>> 3;
 $182 = ($$2>>>0)<(256);
 if ($182) {
  $183 = $181 << 1;
  $184 = (4208 + ($183<<2)|0);
  $185 = HEAP32[1042]|0;
  $186 = 1 << $181;
  $187 = $185 & $186;
  $188 = ($187|0)==(0);
  if ($188) {
   $189 = $185 | $186;
   HEAP32[1042] = $189;
   $$pre = ((($184)) + 8|0);
   $$0366 = $184;$$pre$phiZ2D = $$pre;
  } else {
   $190 = ((($184)) + 8|0);
   $191 = HEAP32[$190>>2]|0;
   $$0366 = $191;$$pre$phiZ2D = $190;
  }
  HEAP32[$$pre$phiZ2D>>2] = $$1;
  $192 = ((($$0366)) + 12|0);
  HEAP32[$192>>2] = $$1;
  $193 = ((($$1)) + 8|0);
  HEAP32[$193>>2] = $$0366;
  $194 = ((($$1)) + 12|0);
  HEAP32[$194>>2] = $184;
  return;
 }
 $195 = $$2 >>> 8;
 $196 = ($195|0)==(0);
 if ($196) {
  $$0359 = 0;
 } else {
  $197 = ($$2>>>0)>(16777215);
  if ($197) {
   $$0359 = 31;
  } else {
   $198 = (($195) + 1048320)|0;
   $199 = $198 >>> 16;
   $200 = $199 & 8;
   $201 = $195 << $200;
   $202 = (($201) + 520192)|0;
   $203 = $202 >>> 16;
   $204 = $203 & 4;
   $205 = $204 | $200;
   $206 = $201 << $204;
   $207 = (($206) + 245760)|0;
   $208 = $207 >>> 16;
   $209 = $208 & 2;
   $210 = $205 | $209;
   $211 = (14 - ($210))|0;
   $212 = $206 << $209;
   $213 = $212 >>> 15;
   $214 = (($211) + ($213))|0;
   $215 = $214 << 1;
   $216 = (($214) + 7)|0;
   $217 = $$2 >>> $216;
   $218 = $217 & 1;
   $219 = $218 | $215;
   $$0359 = $219;
  }
 }
 $220 = (4472 + ($$0359<<2)|0);
 $221 = ((($$1)) + 28|0);
 HEAP32[$221>>2] = $$0359;
 $222 = ((($$1)) + 16|0);
 $223 = ((($$1)) + 20|0);
 HEAP32[$223>>2] = 0;
 HEAP32[$222>>2] = 0;
 $224 = HEAP32[(4172)>>2]|0;
 $225 = 1 << $$0359;
 $226 = $224 & $225;
 $227 = ($226|0)==(0);
 L112: do {
  if ($227) {
   $228 = $224 | $225;
   HEAP32[(4172)>>2] = $228;
   HEAP32[$220>>2] = $$1;
   $229 = ((($$1)) + 24|0);
   HEAP32[$229>>2] = $220;
   $230 = ((($$1)) + 12|0);
   HEAP32[$230>>2] = $$1;
   $231 = ((($$1)) + 8|0);
   HEAP32[$231>>2] = $$1;
  } else {
   $232 = HEAP32[$220>>2]|0;
   $233 = ((($232)) + 4|0);
   $234 = HEAP32[$233>>2]|0;
   $235 = $234 & -8;
   $236 = ($235|0)==($$2|0);
   L115: do {
    if ($236) {
     $$0347$lcssa = $232;
    } else {
     $237 = ($$0359|0)==(31);
     $238 = $$0359 >>> 1;
     $239 = (25 - ($238))|0;
     $240 = $237 ? 0 : $239;
     $241 = $$2 << $240;
     $$0346381 = $241;$$0347380 = $232;
     while(1) {
      $248 = $$0346381 >>> 31;
      $249 = (((($$0347380)) + 16|0) + ($248<<2)|0);
      $244 = HEAP32[$249>>2]|0;
      $250 = ($244|0)==(0|0);
      if ($250) {
       break;
      }
      $242 = $$0346381 << 1;
      $243 = ((($244)) + 4|0);
      $245 = HEAP32[$243>>2]|0;
      $246 = $245 & -8;
      $247 = ($246|0)==($$2|0);
      if ($247) {
       $$0347$lcssa = $244;
       break L115;
      } else {
       $$0346381 = $242;$$0347380 = $244;
      }
     }
     HEAP32[$249>>2] = $$1;
     $251 = ((($$1)) + 24|0);
     HEAP32[$251>>2] = $$0347380;
     $252 = ((($$1)) + 12|0);
     HEAP32[$252>>2] = $$1;
     $253 = ((($$1)) + 8|0);
     HEAP32[$253>>2] = $$1;
     break L112;
    }
   } while(0);
   $254 = ((($$0347$lcssa)) + 8|0);
   $255 = HEAP32[$254>>2]|0;
   $256 = ((($255)) + 12|0);
   HEAP32[$256>>2] = $$1;
   HEAP32[$254>>2] = $$1;
   $257 = ((($$1)) + 8|0);
   HEAP32[$257>>2] = $255;
   $258 = ((($$1)) + 12|0);
   HEAP32[$258>>2] = $$0347$lcssa;
   $259 = ((($$1)) + 24|0);
   HEAP32[$259>>2] = 0;
  }
 } while(0);
 $260 = HEAP32[(4200)>>2]|0;
 $261 = (($260) + -1)|0;
 HEAP32[(4200)>>2] = $261;
 $262 = ($261|0)==(0);
 if (!($262)) {
  return;
 }
 $$0194$in$i = (4624);
 while(1) {
  $$0194$i = HEAP32[$$0194$in$i>>2]|0;
  $263 = ($$0194$i|0)==(0|0);
  $264 = ((($$0194$i)) + 8|0);
  if ($263) {
   break;
  } else {
   $$0194$in$i = $264;
  }
 }
 HEAP32[(4200)>>2] = -1;
 return;
}
function ___stdio_close($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $1 = ((($0)) + 60|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = (_dummy($2)|0);
 HEAP32[$vararg_buffer>>2] = $3;
 $4 = (___syscall6(6,($vararg_buffer|0))|0);
 $5 = (___syscall_ret($4)|0);
 STACKTOP = sp;return ($5|0);
}
function ___stdio_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0;
 var $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $3 = sp + 32|0;
 $4 = ((($0)) + 28|0);
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$3>>2] = $5;
 $6 = ((($3)) + 4|0);
 $7 = ((($0)) + 20|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (($8) - ($5))|0;
 HEAP32[$6>>2] = $9;
 $10 = ((($3)) + 8|0);
 HEAP32[$10>>2] = $1;
 $11 = ((($3)) + 12|0);
 HEAP32[$11>>2] = $2;
 $12 = (($9) + ($2))|0;
 $13 = ((($0)) + 60|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = $3;
 HEAP32[$vararg_buffer>>2] = $14;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $15;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = 2;
 $16 = (___syscall146(146,($vararg_buffer|0))|0);
 $17 = (___syscall_ret($16)|0);
 $18 = ($12|0)==($17|0);
 L1: do {
  if ($18) {
   label = 3;
  } else {
   $$04756 = 2;$$04855 = $12;$$04954 = $3;$27 = $17;
   while(1) {
    $26 = ($27|0)<(0);
    if ($26) {
     break;
    }
    $35 = (($$04855) - ($27))|0;
    $36 = ((($$04954)) + 4|0);
    $37 = HEAP32[$36>>2]|0;
    $38 = ($27>>>0)>($37>>>0);
    $39 = ((($$04954)) + 8|0);
    $$150 = $38 ? $39 : $$04954;
    $40 = $38 << 31 >> 31;
    $$1 = (($$04756) + ($40))|0;
    $41 = $38 ? $37 : 0;
    $$0 = (($27) - ($41))|0;
    $42 = HEAP32[$$150>>2]|0;
    $43 = (($42) + ($$0)|0);
    HEAP32[$$150>>2] = $43;
    $44 = ((($$150)) + 4|0);
    $45 = HEAP32[$44>>2]|0;
    $46 = (($45) - ($$0))|0;
    HEAP32[$44>>2] = $46;
    $47 = HEAP32[$13>>2]|0;
    $48 = $$150;
    HEAP32[$vararg_buffer3>>2] = $47;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $48;
    $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
    HEAP32[$vararg_ptr7>>2] = $$1;
    $49 = (___syscall146(146,($vararg_buffer3|0))|0);
    $50 = (___syscall_ret($49)|0);
    $51 = ($35|0)==($50|0);
    if ($51) {
     label = 3;
     break L1;
    } else {
     $$04756 = $$1;$$04855 = $35;$$04954 = $$150;$27 = $50;
    }
   }
   $28 = ((($0)) + 16|0);
   HEAP32[$28>>2] = 0;
   HEAP32[$4>>2] = 0;
   HEAP32[$7>>2] = 0;
   $29 = HEAP32[$0>>2]|0;
   $30 = $29 | 32;
   HEAP32[$0>>2] = $30;
   $31 = ($$04756|0)==(2);
   if ($31) {
    $$051 = 0;
   } else {
    $32 = ((($$04954)) + 4|0);
    $33 = HEAP32[$32>>2]|0;
    $34 = (($2) - ($33))|0;
    $$051 = $34;
   }
  }
 } while(0);
 if ((label|0) == 3) {
  $19 = ((($0)) + 44|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ((($0)) + 48|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($20) + ($22)|0);
  $24 = ((($0)) + 16|0);
  HEAP32[$24>>2] = $23;
  $25 = $20;
  HEAP32[$4>>2] = $25;
  HEAP32[$7>>2] = $25;
  $$051 = $2;
 }
 STACKTOP = sp;return ($$051|0);
}
function ___stdio_seek($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$pre = 0, $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 20|0;
 $4 = ((($0)) + 60|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $3;
 HEAP32[$vararg_buffer>>2] = $5;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $1;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $6;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $2;
 $7 = (___syscall140(140,($vararg_buffer|0))|0);
 $8 = (___syscall_ret($7)|0);
 $9 = ($8|0)<(0);
 if ($9) {
  HEAP32[$3>>2] = -1;
  $10 = -1;
 } else {
  $$pre = HEAP32[$3>>2]|0;
  $10 = $$pre;
 }
 STACKTOP = sp;return ($10|0);
}
function ___syscall_ret($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0>>>0)>(4294963200);
 if ($1) {
  $2 = (0 - ($0))|0;
  $3 = (___errno_location()|0);
  HEAP32[$3>>2] = $2;
  $$0 = -1;
 } else {
  $$0 = $0;
 }
 return ($$0|0);
}
function ___errno_location() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (4728|0);
}
function _dummy($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($0|0);
}
function ___stdout_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 16|0;
 $4 = ((($0)) + 36|0);
 HEAP32[$4>>2] = 15;
 $5 = HEAP32[$0>>2]|0;
 $6 = $5 & 64;
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = ((($0)) + 60|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = $3;
  HEAP32[$vararg_buffer>>2] = $9;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21523;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $10;
  $11 = (___syscall54(54,($vararg_buffer|0))|0);
  $12 = ($11|0)==(0);
  if (!($12)) {
   $13 = ((($0)) + 75|0);
   HEAP8[$13>>0] = -1;
  }
 }
 $14 = (___stdio_write($0,$1,$2)|0);
 STACKTOP = sp;return ($14|0);
}
function _isdigit($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (($0) + -48)|0;
 $2 = ($1>>>0)<(10);
 $3 = $2&1;
 return ($3|0);
}
function _pthread_self() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (552|0);
}
function _strcmp($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = HEAP8[$0>>0]|0;
 $3 = HEAP8[$1>>0]|0;
 $4 = ($2<<24>>24)!=($3<<24>>24);
 $5 = ($2<<24>>24)==(0);
 $or$cond9 = $5 | $4;
 if ($or$cond9) {
  $$lcssa = $3;$$lcssa8 = $2;
 } else {
  $$011 = $1;$$0710 = $0;
  while(1) {
   $6 = ((($$0710)) + 1|0);
   $7 = ((($$011)) + 1|0);
   $8 = HEAP8[$6>>0]|0;
   $9 = HEAP8[$7>>0]|0;
   $10 = ($8<<24>>24)!=($9<<24>>24);
   $11 = ($8<<24>>24)==(0);
   $or$cond = $11 | $10;
   if ($or$cond) {
    $$lcssa = $9;$$lcssa8 = $8;
    break;
   } else {
    $$011 = $7;$$0710 = $6;
   }
  }
 }
 $12 = $$lcssa8&255;
 $13 = $$lcssa&255;
 $14 = (($12) - ($13))|0;
 return ($14|0);
}
function _strlen($0) {
 $0 = $0|0;
 var $$0 = 0, $$014 = 0, $$015$lcssa = 0, $$01518 = 0, $$1$lcssa = 0, $$pn = 0, $$pn29 = 0, $$pre = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0;
 var $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0;
 $2 = $1 & 3;
 $3 = ($2|0)==(0);
 L1: do {
  if ($3) {
   $$015$lcssa = $0;
   label = 5;
  } else {
   $$01518 = $0;$22 = $1;
   while(1) {
    $4 = HEAP8[$$01518>>0]|0;
    $5 = ($4<<24>>24)==(0);
    if ($5) {
     $$pn = $22;
     break L1;
    }
    $6 = ((($$01518)) + 1|0);
    $7 = $6;
    $8 = $7 & 3;
    $9 = ($8|0)==(0);
    if ($9) {
     $$015$lcssa = $6;
     label = 5;
     break;
    } else {
     $$01518 = $6;$22 = $7;
    }
   }
  }
 } while(0);
 if ((label|0) == 5) {
  $$0 = $$015$lcssa;
  while(1) {
   $10 = HEAP32[$$0>>2]|0;
   $11 = (($10) + -16843009)|0;
   $12 = $10 & -2139062144;
   $13 = $12 ^ -2139062144;
   $14 = $13 & $11;
   $15 = ($14|0)==(0);
   $16 = ((($$0)) + 4|0);
   if ($15) {
    $$0 = $16;
   } else {
    break;
   }
  }
  $17 = $10&255;
  $18 = ($17<<24>>24)==(0);
  if ($18) {
   $$1$lcssa = $$0;
  } else {
   $$pn29 = $$0;
   while(1) {
    $19 = ((($$pn29)) + 1|0);
    $$pre = HEAP8[$19>>0]|0;
    $20 = ($$pre<<24>>24)==(0);
    if ($20) {
     $$1$lcssa = $19;
     break;
    } else {
     $$pn29 = $19;
    }
   }
  }
  $21 = $$1$lcssa;
  $$pn = $21;
 }
 $$014 = (($$pn) - ($1))|0;
 return ($$014|0);
}
function ___unlockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function ___lockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function ___overflow($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $3 = $1&255;
 HEAP8[$2>>0] = $3;
 $4 = ((($0)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = (___towrite($0)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$4>>2]|0;
   $12 = $$pre;
   label = 4;
  } else {
   $$0 = -1;
  }
 } else {
  $12 = $5;
  label = 4;
 }
 do {
  if ((label|0) == 4) {
   $9 = ((($0)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = ($10>>>0)<($12>>>0);
   if ($11) {
    $13 = $1 & 255;
    $14 = ((($0)) + 75|0);
    $15 = HEAP8[$14>>0]|0;
    $16 = $15 << 24 >> 24;
    $17 = ($13|0)==($16|0);
    if (!($17)) {
     $18 = ((($10)) + 1|0);
     HEAP32[$9>>2] = $18;
     HEAP8[$10>>0] = $3;
     $$0 = $13;
     break;
    }
   }
   $19 = ((($0)) + 36|0);
   $20 = HEAP32[$19>>2]|0;
   $21 = (FUNCTION_TABLE_iiii[$20 & 31]($0,$2,1)|0);
   $22 = ($21|0)==(1);
   if ($22) {
    $23 = HEAP8[$2>>0]|0;
    $24 = $23&255;
    $$0 = $24;
   } else {
    $$0 = -1;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___towrite($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 74|0);
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $4 = (($3) + 255)|0;
 $5 = $4 | $3;
 $6 = $5&255;
 HEAP8[$1>>0] = $6;
 $7 = HEAP32[$0>>2]|0;
 $8 = $7 & 8;
 $9 = ($8|0)==(0);
 if ($9) {
  $11 = ((($0)) + 8|0);
  HEAP32[$11>>2] = 0;
  $12 = ((($0)) + 4|0);
  HEAP32[$12>>2] = 0;
  $13 = ((($0)) + 44|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = ((($0)) + 28|0);
  HEAP32[$15>>2] = $14;
  $16 = ((($0)) + 20|0);
  HEAP32[$16>>2] = $14;
  $17 = $14;
  $18 = ((($0)) + 48|0);
  $19 = HEAP32[$18>>2]|0;
  $20 = (($17) + ($19)|0);
  $21 = ((($0)) + 16|0);
  HEAP32[$21>>2] = $20;
  $$0 = 0;
 } else {
  $10 = $7 | 32;
  HEAP32[$0>>2] = $10;
  $$0 = -1;
 }
 return ($$0|0);
}
function ___fwritex($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$03846 = 0, $$042 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $$pre = 0, $$pre48 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($2)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if ($5) {
  $7 = (___towrite($2)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$3>>2]|0;
   $12 = $$pre;
   label = 5;
  } else {
   $$1 = 0;
  }
 } else {
  $6 = $4;
  $12 = $6;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $9 = ((($2)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = (($12) - ($10))|0;
   $13 = ($11>>>0)<($1>>>0);
   $14 = $10;
   if ($13) {
    $15 = ((($2)) + 36|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = (FUNCTION_TABLE_iiii[$16 & 31]($2,$0,$1)|0);
    $$1 = $17;
    break;
   }
   $18 = ((($2)) + 75|0);
   $19 = HEAP8[$18>>0]|0;
   $20 = ($19<<24>>24)<(0);
   $21 = ($1|0)==(0);
   $or$cond = $20 | $21;
   L10: do {
    if ($or$cond) {
     $$139 = 0;$$141 = $0;$$143 = $1;$32 = $14;
    } else {
     $$03846 = $1;
     while(1) {
      $23 = (($$03846) + -1)|0;
      $24 = (($0) + ($23)|0);
      $25 = HEAP8[$24>>0]|0;
      $26 = ($25<<24>>24)==(10);
      if ($26) {
       break;
      }
      $22 = ($23|0)==(0);
      if ($22) {
       $$139 = 0;$$141 = $0;$$143 = $1;$32 = $14;
       break L10;
      } else {
       $$03846 = $23;
      }
     }
     $27 = ((($2)) + 36|0);
     $28 = HEAP32[$27>>2]|0;
     $29 = (FUNCTION_TABLE_iiii[$28 & 31]($2,$0,$$03846)|0);
     $30 = ($29>>>0)<($$03846>>>0);
     if ($30) {
      $$1 = $29;
      break L5;
     }
     $31 = (($0) + ($$03846)|0);
     $$042 = (($1) - ($$03846))|0;
     $$pre48 = HEAP32[$9>>2]|0;
     $$139 = $$03846;$$141 = $31;$$143 = $$042;$32 = $$pre48;
    }
   } while(0);
   (_memcpy(($32|0),($$141|0),($$143|0))|0);
   $33 = HEAP32[$9>>2]|0;
   $34 = (($33) + ($$143)|0);
   HEAP32[$9>>2] = $34;
   $35 = (($$139) + ($$143))|0;
   $$1 = $35;
  }
 } while(0);
 return ($$1|0);
}
function ___lctrans_impl($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = HEAP32[$1>>2]|0;
  $4 = ((($1)) + 4|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = (___mo_lookup($3,$5,$0)|0);
  $$0 = $6;
 }
 $7 = ($$0|0)==(0|0);
 $8 = $7 ? $0 : $$0;
 return ($8|0);
}
function ___mo_lookup($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$090 = 0, $$094 = 0, $$191 = 0, $$195 = 0, $$4 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond102 = 0, $or$cond104 = 0, $spec$select = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = (($3) + 1794895138)|0;
 $5 = ((($0)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (_swapc($6,$4)|0);
 $8 = ((($0)) + 12|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = (_swapc($9,$4)|0);
 $11 = ((($0)) + 16|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = (_swapc($12,$4)|0);
 $14 = $1 >>> 2;
 $15 = ($7>>>0)<($14>>>0);
 L1: do {
  if ($15) {
   $16 = $7 << 2;
   $17 = (($1) - ($16))|0;
   $18 = ($10>>>0)<($17>>>0);
   $19 = ($13>>>0)<($17>>>0);
   $or$cond = $18 & $19;
   if ($or$cond) {
    $20 = $13 | $10;
    $21 = $20 & 3;
    $22 = ($21|0)==(0);
    if ($22) {
     $23 = $10 >>> 2;
     $24 = $13 >>> 2;
     $$090 = 0;$$094 = $7;
     while(1) {
      $25 = $$094 >>> 1;
      $26 = (($$090) + ($25))|0;
      $27 = $26 << 1;
      $28 = (($27) + ($23))|0;
      $29 = (($0) + ($28<<2)|0);
      $30 = HEAP32[$29>>2]|0;
      $31 = (_swapc($30,$4)|0);
      $32 = (($28) + 1)|0;
      $33 = (($0) + ($32<<2)|0);
      $34 = HEAP32[$33>>2]|0;
      $35 = (_swapc($34,$4)|0);
      $36 = ($35>>>0)<($1>>>0);
      $37 = (($1) - ($35))|0;
      $38 = ($31>>>0)<($37>>>0);
      $or$cond102 = $36 & $38;
      if (!($or$cond102)) {
       $$4 = 0;
       break L1;
      }
      $39 = (($35) + ($31))|0;
      $40 = (($0) + ($39)|0);
      $41 = HEAP8[$40>>0]|0;
      $42 = ($41<<24>>24)==(0);
      if (!($42)) {
       $$4 = 0;
       break L1;
      }
      $43 = (($0) + ($35)|0);
      $44 = (_strcmp($2,$43)|0);
      $45 = ($44|0)==(0);
      if ($45) {
       break;
      }
      $62 = ($$094|0)==(1);
      $63 = ($44|0)<(0);
      if ($62) {
       $$4 = 0;
       break L1;
      }
      $$191 = $63 ? $$090 : $26;
      $64 = (($$094) - ($25))|0;
      $$195 = $63 ? $25 : $64;
      $$090 = $$191;$$094 = $$195;
     }
     $46 = (($27) + ($24))|0;
     $47 = (($0) + ($46<<2)|0);
     $48 = HEAP32[$47>>2]|0;
     $49 = (_swapc($48,$4)|0);
     $50 = (($46) + 1)|0;
     $51 = (($0) + ($50<<2)|0);
     $52 = HEAP32[$51>>2]|0;
     $53 = (_swapc($52,$4)|0);
     $54 = ($53>>>0)<($1>>>0);
     $55 = (($1) - ($53))|0;
     $56 = ($49>>>0)<($55>>>0);
     $or$cond104 = $54 & $56;
     if ($or$cond104) {
      $57 = (($0) + ($53)|0);
      $58 = (($53) + ($49))|0;
      $59 = (($0) + ($58)|0);
      $60 = HEAP8[$59>>0]|0;
      $61 = ($60<<24>>24)==(0);
      $spec$select = $61 ? $57 : 0;
      $$4 = $spec$select;
     } else {
      $$4 = 0;
     }
    } else {
     $$4 = 0;
    }
   } else {
    $$4 = 0;
   }
  } else {
   $$4 = 0;
  }
 } while(0);
 return ($$4|0);
}
function _swapc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $spec$select = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0);
 $3 = (_llvm_bswap_i32(($0|0))|0);
 $spec$select = $2 ? $0 : $3;
 return ($spec$select|0);
}
function ___ofl_lock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___lock((4732|0));
 return (4740|0);
}
function ___ofl_unlock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___unlock((4732|0));
 return;
}
function _fflush($0) {
 $0 = $0|0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 do {
  if ($1) {
   $8 = HEAP32[137]|0;
   $9 = ($8|0)==(0|0);
   if ($9) {
    $29 = 0;
   } else {
    $10 = HEAP32[137]|0;
    $11 = (_fflush($10)|0);
    $29 = $11;
   }
   $12 = (___ofl_lock()|0);
   $$02325 = HEAP32[$12>>2]|0;
   $13 = ($$02325|0)==(0|0);
   if ($13) {
    $$024$lcssa = $29;
   } else {
    $$02327 = $$02325;$$02426 = $29;
    while(1) {
     $14 = ((($$02327)) + 76|0);
     $15 = HEAP32[$14>>2]|0;
     $16 = ($15|0)>(-1);
     if ($16) {
      $17 = (___lockfile($$02327)|0);
      $26 = $17;
     } else {
      $26 = 0;
     }
     $18 = ((($$02327)) + 20|0);
     $19 = HEAP32[$18>>2]|0;
     $20 = ((($$02327)) + 28|0);
     $21 = HEAP32[$20>>2]|0;
     $22 = ($19>>>0)>($21>>>0);
     if ($22) {
      $23 = (___fflush_unlocked($$02327)|0);
      $24 = $23 | $$02426;
      $$1 = $24;
     } else {
      $$1 = $$02426;
     }
     $25 = ($26|0)==(0);
     if (!($25)) {
      ___unlockfile($$02327);
     }
     $27 = ((($$02327)) + 56|0);
     $$023 = HEAP32[$27>>2]|0;
     $28 = ($$023|0)==(0|0);
     if ($28) {
      $$024$lcssa = $$1;
      break;
     } else {
      $$02327 = $$023;$$02426 = $$1;
     }
    }
   }
   ___ofl_unlock();
   $$0 = $$024$lcssa;
  } else {
   $2 = ((($0)) + 76|0);
   $3 = HEAP32[$2>>2]|0;
   $4 = ($3|0)>(-1);
   if (!($4)) {
    $5 = (___fflush_unlocked($0)|0);
    $$0 = $5;
    break;
   }
   $6 = (___lockfile($0)|0);
   $phitmp = ($6|0)==(0);
   $7 = (___fflush_unlocked($0)|0);
   if ($phitmp) {
    $$0 = $7;
   } else {
    ___unlockfile($0);
    $$0 = $7;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___fflush_unlocked($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 20|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 28|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($2>>>0)>($4>>>0);
 if ($5) {
  $6 = ((($0)) + 36|0);
  $7 = HEAP32[$6>>2]|0;
  (FUNCTION_TABLE_iiii[$7 & 31]($0,0,0)|0);
  $8 = HEAP32[$1>>2]|0;
  $9 = ($8|0)==(0|0);
  if ($9) {
   $$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $10 = ((($0)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($0)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ($11>>>0)<($13>>>0);
  if ($14) {
   $15 = $11;
   $16 = $13;
   $17 = (($15) - ($16))|0;
   $18 = ((($0)) + 40|0);
   $19 = HEAP32[$18>>2]|0;
   (FUNCTION_TABLE_iiii[$19 & 31]($0,$17,1)|0);
  }
  $20 = ((($0)) + 16|0);
  HEAP32[$20>>2] = 0;
  HEAP32[$3>>2] = 0;
  HEAP32[$1>>2] = 0;
  HEAP32[$12>>2] = 0;
  HEAP32[$10>>2] = 0;
  $$0 = 0;
 }
 return ($$0|0);
}
function _memchr($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$137$lcssa66 = 0, $$13745 = 0, $$140 = 0, $$23839 = 0, $$in = 0, $$lcssa = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond53 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1 & 255;
 $4 = $0;
 $5 = $4 & 3;
 $6 = ($5|0)!=(0);
 $7 = ($2|0)!=(0);
 $or$cond53 = $7 & $6;
 L1: do {
  if ($or$cond53) {
   $8 = $1&255;
   $$03555 = $0;$$03654 = $2;
   while(1) {
    $9 = HEAP8[$$03555>>0]|0;
    $10 = ($9<<24>>24)==($8<<24>>24);
    if ($10) {
     $$035$lcssa65 = $$03555;$$036$lcssa64 = $$03654;
     label = 6;
     break L1;
    }
    $11 = ((($$03555)) + 1|0);
    $12 = (($$03654) + -1)|0;
    $13 = $11;
    $14 = $13 & 3;
    $15 = ($14|0)!=(0);
    $16 = ($12|0)!=(0);
    $or$cond = $16 & $15;
    if ($or$cond) {
     $$03555 = $11;$$03654 = $12;
    } else {
     $$035$lcssa = $11;$$036$lcssa = $12;$$lcssa = $16;
     label = 5;
     break;
    }
   }
  } else {
   $$035$lcssa = $0;$$036$lcssa = $2;$$lcssa = $7;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa;$$036$lcssa64 = $$036$lcssa;
   label = 6;
  } else {
   label = 16;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $17 = HEAP8[$$035$lcssa65>>0]|0;
   $18 = $1&255;
   $19 = ($17<<24>>24)==($18<<24>>24);
   if ($19) {
    $38 = ($$036$lcssa64|0)==(0);
    if ($38) {
     label = 16;
     break;
    } else {
     $39 = $$035$lcssa65;
     break;
    }
   }
   $20 = Math_imul($3, 16843009)|0;
   $21 = ($$036$lcssa64>>>0)>(3);
   L13: do {
    if ($21) {
     $$046 = $$035$lcssa65;$$13745 = $$036$lcssa64;
     while(1) {
      $22 = HEAP32[$$046>>2]|0;
      $23 = $22 ^ $20;
      $24 = (($23) + -16843009)|0;
      $25 = $23 & -2139062144;
      $26 = $25 ^ -2139062144;
      $27 = $26 & $24;
      $28 = ($27|0)==(0);
      if (!($28)) {
       $$137$lcssa66 = $$13745;$$in = $$046;
       break L13;
      }
      $29 = ((($$046)) + 4|0);
      $30 = (($$13745) + -4)|0;
      $31 = ($30>>>0)>(3);
      if ($31) {
       $$046 = $29;$$13745 = $30;
      } else {
       $$0$lcssa = $29;$$137$lcssa = $30;
       label = 11;
       break;
      }
     }
    } else {
     $$0$lcssa = $$035$lcssa65;$$137$lcssa = $$036$lcssa64;
     label = 11;
    }
   } while(0);
   if ((label|0) == 11) {
    $32 = ($$137$lcssa|0)==(0);
    if ($32) {
     label = 16;
     break;
    } else {
     $$137$lcssa66 = $$137$lcssa;$$in = $$0$lcssa;
    }
   }
   $$140 = $$in;$$23839 = $$137$lcssa66;
   while(1) {
    $33 = HEAP8[$$140>>0]|0;
    $34 = ($33<<24>>24)==($18<<24>>24);
    if ($34) {
     $39 = $$140;
     break L8;
    }
    $35 = ((($$140)) + 1|0);
    $36 = (($$23839) + -1)|0;
    $37 = ($36|0)==(0);
    if ($37) {
     label = 16;
     break;
    } else {
     $$140 = $35;$$23839 = $36;
    }
   }
  }
 } while(0);
 if ((label|0) == 16) {
  $39 = 0;
 }
 return ($39|0);
}
function _vfprintf($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var $spec$select = 0, $spec$select41 = 0, $vacopy_currentptr = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $3 = sp + 120|0;
 $4 = sp + 80|0;
 $5 = sp;
 $6 = sp + 136|0;
 dest=$4; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $vacopy_currentptr;
 $7 = (_printf_core(0,$1,$3,$5,$4)|0);
 $8 = ($7|0)<(0);
 if ($8) {
  $$0 = -1;
 } else {
  $9 = ((($0)) + 76|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ($10|0)>(-1);
  if ($11) {
   $12 = (___lockfile($0)|0);
   $40 = $12;
  } else {
   $40 = 0;
  }
  $13 = HEAP32[$0>>2]|0;
  $14 = $13 & 32;
  $15 = ((($0)) + 74|0);
  $16 = HEAP8[$15>>0]|0;
  $17 = ($16<<24>>24)<(1);
  if ($17) {
   $18 = $13 & -33;
   HEAP32[$0>>2] = $18;
  }
  $19 = ((($0)) + 48|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ($20|0)==(0);
  if ($21) {
   $23 = ((($0)) + 44|0);
   $24 = HEAP32[$23>>2]|0;
   HEAP32[$23>>2] = $6;
   $25 = ((($0)) + 28|0);
   HEAP32[$25>>2] = $6;
   $26 = ((($0)) + 20|0);
   HEAP32[$26>>2] = $6;
   HEAP32[$19>>2] = 80;
   $27 = ((($6)) + 80|0);
   $28 = ((($0)) + 16|0);
   HEAP32[$28>>2] = $27;
   $29 = (_printf_core($0,$1,$3,$5,$4)|0);
   $30 = ($24|0)==(0|0);
   if ($30) {
    $$1 = $29;
   } else {
    $31 = ((($0)) + 36|0);
    $32 = HEAP32[$31>>2]|0;
    (FUNCTION_TABLE_iiii[$32 & 31]($0,0,0)|0);
    $33 = HEAP32[$26>>2]|0;
    $34 = ($33|0)==(0|0);
    $spec$select = $34 ? -1 : $29;
    HEAP32[$23>>2] = $24;
    HEAP32[$19>>2] = 0;
    HEAP32[$28>>2] = 0;
    HEAP32[$25>>2] = 0;
    HEAP32[$26>>2] = 0;
    $$1 = $spec$select;
   }
  } else {
   $22 = (_printf_core($0,$1,$3,$5,$4)|0);
   $$1 = $22;
  }
  $35 = HEAP32[$0>>2]|0;
  $36 = $35 & 32;
  $37 = ($36|0)==(0);
  $spec$select41 = $37 ? $$1 : -1;
  $38 = $35 | $14;
  HEAP32[$0>>2] = $38;
  $39 = ($40|0)==(0);
  if (!($39)) {
   ___unlockfile($0);
  }
  $$0 = $spec$select41;
 }
 STACKTOP = sp;return ($$0|0);
}
function _printf_core($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$ = 0, $$0 = 0, $$0228 = 0, $$0229334 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240313 = 0, $$0240313371 = 0, $$0240333 = 0, $$0243 = 0, $$0243$ph = 0, $$0243$ph$be = 0, $$0247 = 0, $$0247$ph = 0, $$0249$lcssa = 0, $$0249321 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0;
 var $$0259 = 0, $$0262$lcssa = 0, $$0262328 = 0, $$0269$ph = 0, $$1 = 0, $$1230340 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241339 = 0, $$1248 = 0, $$1250 = 0, $$1255 = 0, $$1260 = 0, $$1263 = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242320 = 0;
 var $$2256 = 0, $$2256$ = 0, $$2261 = 0, $$2271 = 0, $$3257 = 0, $$3265 = 0, $$3272 = 0, $$3317 = 0, $$4258370 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa308 = 0, $$pre = 0, $$pre$phiZ2D = 0, $$pre360 = 0, $$pre362 = 0, $$pre363 = 0, $$pre363$pre = 0, $$pre364 = 0;
 var $$pre368 = 0, $$sink = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0;
 var $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0;
 var $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0;
 var $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0;
 var $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0;
 var $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0;
 var $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0;
 var $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0;
 var $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0;
 var $334 = 0, $335 = 0, $336 = 0.0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0;
 var $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0;
 var $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0;
 var $arglist_next3 = 0, $brmerge = 0, $brmerge326 = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0, $expanded8 = 0, $or$cond = 0, $or$cond276 = 0, $or$cond278 = 0, $or$cond283 = 0, $spec$select = 0, $spec$select281 = 0, $spec$select284 = 0;
 var $spec$select291 = 0, $spec$select292 = 0, $spec$select293 = 0, $spec$select294 = 0, $spec$select295 = 0, $spec$select296 = 0, $spec$select297 = 0, $spec$select298 = 0, $spec$select299 = 0, $storemerge273$lcssa = 0, $storemerge273327 = 0, $storemerge274 = 0, $trunc = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $5 = sp + 16|0;
 $6 = sp;
 $7 = sp + 24|0;
 $8 = sp + 8|0;
 $9 = sp + 20|0;
 HEAP32[$5>>2] = $1;
 $10 = ($0|0)!=(0|0);
 $11 = ((($7)) + 40|0);
 $12 = $11;
 $13 = ((($7)) + 39|0);
 $14 = ((($8)) + 4|0);
 $$0243$ph = 0;$$0247$ph = 0;$$0269$ph = 0;
 L1: while(1) {
  $$0243 = $$0243$ph;$$0247 = $$0247$ph;
  while(1) {
   $15 = ($$0247|0)>(-1);
   do {
    if ($15) {
     $16 = (2147483647 - ($$0247))|0;
     $17 = ($$0243|0)>($16|0);
     if ($17) {
      $18 = (___errno_location()|0);
      HEAP32[$18>>2] = 75;
      $$1248 = -1;
      break;
     } else {
      $19 = (($$0243) + ($$0247))|0;
      $$1248 = $19;
      break;
     }
    } else {
     $$1248 = $$0247;
    }
   } while(0);
   $20 = HEAP32[$5>>2]|0;
   $21 = HEAP8[$20>>0]|0;
   $22 = ($21<<24>>24)==(0);
   if ($22) {
    label = 94;
    break L1;
   }
   $23 = $21;$25 = $20;
   L12: while(1) {
    switch ($23<<24>>24) {
    case 37:  {
     label = 10;
     break L12;
     break;
    }
    case 0:  {
     $$0249$lcssa = $25;
     break L12;
     break;
    }
    default: {
    }
    }
    $24 = ((($25)) + 1|0);
    HEAP32[$5>>2] = $24;
    $$pre = HEAP8[$24>>0]|0;
    $23 = $$pre;$25 = $24;
   }
   L15: do {
    if ((label|0) == 10) {
     label = 0;
     $$0249321 = $25;$27 = $25;
     while(1) {
      $26 = ((($27)) + 1|0);
      $28 = HEAP8[$26>>0]|0;
      $29 = ($28<<24>>24)==(37);
      if (!($29)) {
       $$0249$lcssa = $$0249321;
       break L15;
      }
      $30 = ((($$0249321)) + 1|0);
      $31 = ((($27)) + 2|0);
      HEAP32[$5>>2] = $31;
      $32 = HEAP8[$31>>0]|0;
      $33 = ($32<<24>>24)==(37);
      if ($33) {
       $$0249321 = $30;$27 = $31;
      } else {
       $$0249$lcssa = $30;
       break;
      }
     }
    }
   } while(0);
   $34 = $$0249$lcssa;
   $35 = $20;
   $36 = (($34) - ($35))|0;
   if ($10) {
    _out_670($0,$20,$36);
   }
   $37 = ($36|0)==(0);
   if ($37) {
    break;
   } else {
    $$0243 = $36;$$0247 = $$1248;
   }
  }
  $38 = HEAP32[$5>>2]|0;
  $39 = ((($38)) + 1|0);
  $40 = HEAP8[$39>>0]|0;
  $41 = $40 << 24 >> 24;
  $42 = (_isdigit($41)|0);
  $43 = ($42|0)==(0);
  $$pre360 = HEAP32[$5>>2]|0;
  if ($43) {
   $$0253 = -1;$$1270 = $$0269$ph;$$sink = 1;
  } else {
   $44 = ((($$pre360)) + 2|0);
   $45 = HEAP8[$44>>0]|0;
   $46 = ($45<<24>>24)==(36);
   if ($46) {
    $47 = ((($$pre360)) + 1|0);
    $48 = HEAP8[$47>>0]|0;
    $49 = $48 << 24 >> 24;
    $50 = (($49) + -48)|0;
    $$0253 = $50;$$1270 = 1;$$sink = 3;
   } else {
    $$0253 = -1;$$1270 = $$0269$ph;$$sink = 1;
   }
  }
  $51 = (($$pre360) + ($$sink)|0);
  HEAP32[$5>>2] = $51;
  $52 = HEAP8[$51>>0]|0;
  $53 = $52 << 24 >> 24;
  $54 = (($53) + -32)|0;
  $55 = ($54>>>0)>(31);
  $56 = 1 << $54;
  $57 = $56 & 75913;
  $58 = ($57|0)==(0);
  $brmerge326 = $55 | $58;
  if ($brmerge326) {
   $$0262$lcssa = 0;$$lcssa308 = $52;$storemerge273$lcssa = $51;
  } else {
   $$0262328 = 0;$60 = $54;$storemerge273327 = $51;
   while(1) {
    $59 = 1 << $60;
    $61 = $59 | $$0262328;
    $62 = ((($storemerge273327)) + 1|0);
    HEAP32[$5>>2] = $62;
    $63 = HEAP8[$62>>0]|0;
    $64 = $63 << 24 >> 24;
    $65 = (($64) + -32)|0;
    $66 = ($65>>>0)>(31);
    $67 = 1 << $65;
    $68 = $67 & 75913;
    $69 = ($68|0)==(0);
    $brmerge = $66 | $69;
    if ($brmerge) {
     $$0262$lcssa = $61;$$lcssa308 = $63;$storemerge273$lcssa = $62;
     break;
    } else {
     $$0262328 = $61;$60 = $65;$storemerge273327 = $62;
    }
   }
  }
  $70 = ($$lcssa308<<24>>24)==(42);
  if ($70) {
   $71 = ((($storemerge273$lcssa)) + 1|0);
   $72 = HEAP8[$71>>0]|0;
   $73 = $72 << 24 >> 24;
   $74 = (_isdigit($73)|0);
   $75 = ($74|0)==(0);
   if ($75) {
    label = 27;
   } else {
    $76 = HEAP32[$5>>2]|0;
    $77 = ((($76)) + 2|0);
    $78 = HEAP8[$77>>0]|0;
    $79 = ($78<<24>>24)==(36);
    if ($79) {
     $80 = ((($76)) + 1|0);
     $81 = HEAP8[$80>>0]|0;
     $82 = $81 << 24 >> 24;
     $83 = (($82) + -48)|0;
     $84 = (($4) + ($83<<2)|0);
     HEAP32[$84>>2] = 10;
     $85 = HEAP8[$80>>0]|0;
     $86 = $85 << 24 >> 24;
     $87 = (($86) + -48)|0;
     $88 = (($3) + ($87<<3)|0);
     $89 = $88;
     $90 = $89;
     $91 = HEAP32[$90>>2]|0;
     $92 = (($89) + 4)|0;
     $93 = $92;
     $94 = HEAP32[$93>>2]|0;
     $95 = ((($76)) + 3|0);
     $$0259 = $91;$$2271 = 1;$storemerge274 = $95;
    } else {
     label = 27;
    }
   }
   if ((label|0) == 27) {
    label = 0;
    $96 = ($$1270|0)==(0);
    if (!($96)) {
     $$0 = -1;
     break;
    }
    if ($10) {
     $arglist_current = HEAP32[$2>>2]|0;
     $97 = $arglist_current;
     $98 = ((0) + 4|0);
     $expanded4 = $98;
     $expanded = (($expanded4) - 1)|0;
     $99 = (($97) + ($expanded))|0;
     $100 = ((0) + 4|0);
     $expanded8 = $100;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $101 = $99 & $expanded6;
     $102 = $101;
     $103 = HEAP32[$102>>2]|0;
     $arglist_next = ((($102)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     $358 = $103;
    } else {
     $358 = 0;
    }
    $104 = HEAP32[$5>>2]|0;
    $105 = ((($104)) + 1|0);
    $$0259 = $358;$$2271 = 0;$storemerge274 = $105;
   }
   HEAP32[$5>>2] = $storemerge274;
   $106 = ($$0259|0)<(0);
   $107 = $$0262$lcssa | 8192;
   $108 = (0 - ($$0259))|0;
   $spec$select291 = $106 ? $107 : $$0262$lcssa;
   $spec$select292 = $106 ? $108 : $$0259;
   $$1260 = $spec$select292;$$1263 = $spec$select291;$$3272 = $$2271;$112 = $storemerge274;
  } else {
   $109 = (_getint_671($5)|0);
   $110 = ($109|0)<(0);
   if ($110) {
    $$0 = -1;
    break;
   }
   $$pre362 = HEAP32[$5>>2]|0;
   $$1260 = $109;$$1263 = $$0262$lcssa;$$3272 = $$1270;$112 = $$pre362;
  }
  $111 = HEAP8[$112>>0]|0;
  $113 = ($111<<24>>24)==(46);
  do {
   if ($113) {
    $114 = ((($112)) + 1|0);
    $115 = HEAP8[$114>>0]|0;
    $116 = ($115<<24>>24)==(42);
    if (!($116)) {
     HEAP32[$5>>2] = $114;
     $152 = (_getint_671($5)|0);
     $$pre363$pre = HEAP32[$5>>2]|0;
     $$0254 = $152;$$pre363 = $$pre363$pre;
     break;
    }
    $117 = ((($112)) + 2|0);
    $118 = HEAP8[$117>>0]|0;
    $119 = $118 << 24 >> 24;
    $120 = (_isdigit($119)|0);
    $121 = ($120|0)==(0);
    if (!($121)) {
     $122 = HEAP32[$5>>2]|0;
     $123 = ((($122)) + 3|0);
     $124 = HEAP8[$123>>0]|0;
     $125 = ($124<<24>>24)==(36);
     if ($125) {
      $126 = ((($122)) + 2|0);
      $127 = HEAP8[$126>>0]|0;
      $128 = $127 << 24 >> 24;
      $129 = (($128) + -48)|0;
      $130 = (($4) + ($129<<2)|0);
      HEAP32[$130>>2] = 10;
      $131 = HEAP8[$126>>0]|0;
      $132 = $131 << 24 >> 24;
      $133 = (($132) + -48)|0;
      $134 = (($3) + ($133<<3)|0);
      $135 = $134;
      $136 = $135;
      $137 = HEAP32[$136>>2]|0;
      $138 = (($135) + 4)|0;
      $139 = $138;
      $140 = HEAP32[$139>>2]|0;
      $141 = ((($122)) + 4|0);
      HEAP32[$5>>2] = $141;
      $$0254 = $137;$$pre363 = $141;
      break;
     }
    }
    $142 = ($$3272|0)==(0);
    if (!($142)) {
     $$0 = -1;
     break L1;
    }
    if ($10) {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $143 = $arglist_current2;
     $144 = ((0) + 4|0);
     $expanded11 = $144;
     $expanded10 = (($expanded11) - 1)|0;
     $145 = (($143) + ($expanded10))|0;
     $146 = ((0) + 4|0);
     $expanded15 = $146;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $147 = $145 & $expanded13;
     $148 = $147;
     $149 = HEAP32[$148>>2]|0;
     $arglist_next3 = ((($148)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $359 = $149;
    } else {
     $359 = 0;
    }
    $150 = HEAP32[$5>>2]|0;
    $151 = ((($150)) + 2|0);
    HEAP32[$5>>2] = $151;
    $$0254 = $359;$$pre363 = $151;
   } else {
    $$0254 = -1;$$pre363 = $112;
   }
  } while(0);
  $$0252 = 0;$154 = $$pre363;
  while(1) {
   $153 = HEAP8[$154>>0]|0;
   $155 = $153 << 24 >> 24;
   $156 = (($155) + -65)|0;
   $157 = ($156>>>0)>(57);
   if ($157) {
    $$0 = -1;
    break L1;
   }
   $158 = ((($154)) + 1|0);
   HEAP32[$5>>2] = $158;
   $159 = HEAP8[$154>>0]|0;
   $160 = $159 << 24 >> 24;
   $161 = (($160) + -65)|0;
   $162 = ((1165 + (($$0252*58)|0)|0) + ($161)|0);
   $163 = HEAP8[$162>>0]|0;
   $164 = $163&255;
   $165 = (($164) + -1)|0;
   $166 = ($165>>>0)<(8);
   if ($166) {
    $$0252 = $164;$154 = $158;
   } else {
    break;
   }
  }
  $167 = ($163<<24>>24)==(0);
  if ($167) {
   $$0 = -1;
   break;
  }
  $168 = ($163<<24>>24)==(19);
  $169 = ($$0253|0)>(-1);
  do {
   if ($168) {
    if ($169) {
     $$0 = -1;
     break L1;
    } else {
     label = 54;
    }
   } else {
    if ($169) {
     $170 = (($4) + ($$0253<<2)|0);
     HEAP32[$170>>2] = $164;
     $171 = (($3) + ($$0253<<3)|0);
     $172 = $171;
     $173 = $172;
     $174 = HEAP32[$173>>2]|0;
     $175 = (($172) + 4)|0;
     $176 = $175;
     $177 = HEAP32[$176>>2]|0;
     $178 = $6;
     $179 = $178;
     HEAP32[$179>>2] = $174;
     $180 = (($178) + 4)|0;
     $181 = $180;
     HEAP32[$181>>2] = $177;
     label = 54;
     break;
    }
    if (!($10)) {
     $$0 = 0;
     break L1;
    }
    _pop_arg_673($6,$164,$2);
    $$pre364 = HEAP32[$5>>2]|0;
    $183 = $$pre364;
    label = 55;
   }
  } while(0);
  if ((label|0) == 54) {
   label = 0;
   if ($10) {
    $183 = $158;
    label = 55;
   } else {
    $$0243$ph$be = 0;
   }
  }
  L77: do {
   if ((label|0) == 55) {
    label = 0;
    $182 = ((($183)) + -1|0);
    $184 = HEAP8[$182>>0]|0;
    $185 = $184 << 24 >> 24;
    $186 = ($$0252|0)!=(0);
    $187 = $185 & 15;
    $188 = ($187|0)==(3);
    $or$cond276 = $186 & $188;
    $189 = $185 & -33;
    $$0235 = $or$cond276 ? $189 : $185;
    $190 = $$1263 & 8192;
    $191 = ($190|0)==(0);
    $192 = $$1263 & -65537;
    $spec$select = $191 ? $$1263 : $192;
    L79: do {
     switch ($$0235|0) {
     case 110:  {
      $trunc = $$0252&255;
      switch ($trunc<<24>>24) {
      case 0:  {
       $199 = HEAP32[$6>>2]|0;
       HEAP32[$199>>2] = $$1248;
       $$0243$ph$be = 0;
       break L77;
       break;
      }
      case 1:  {
       $200 = HEAP32[$6>>2]|0;
       HEAP32[$200>>2] = $$1248;
       $$0243$ph$be = 0;
       break L77;
       break;
      }
      case 2:  {
       $201 = ($$1248|0)<(0);
       $202 = $201 << 31 >> 31;
       $203 = HEAP32[$6>>2]|0;
       $204 = $203;
       $205 = $204;
       HEAP32[$205>>2] = $$1248;
       $206 = (($204) + 4)|0;
       $207 = $206;
       HEAP32[$207>>2] = $202;
       $$0243$ph$be = 0;
       break L77;
       break;
      }
      case 3:  {
       $208 = $$1248&65535;
       $209 = HEAP32[$6>>2]|0;
       HEAP16[$209>>1] = $208;
       $$0243$ph$be = 0;
       break L77;
       break;
      }
      case 4:  {
       $210 = $$1248&255;
       $211 = HEAP32[$6>>2]|0;
       HEAP8[$211>>0] = $210;
       $$0243$ph$be = 0;
       break L77;
       break;
      }
      case 6:  {
       $212 = HEAP32[$6>>2]|0;
       HEAP32[$212>>2] = $$1248;
       $$0243$ph$be = 0;
       break L77;
       break;
      }
      case 7:  {
       $213 = ($$1248|0)<(0);
       $214 = $213 << 31 >> 31;
       $215 = HEAP32[$6>>2]|0;
       $216 = $215;
       $217 = $216;
       HEAP32[$217>>2] = $$1248;
       $218 = (($216) + 4)|0;
       $219 = $218;
       HEAP32[$219>>2] = $214;
       $$0243$ph$be = 0;
       break L77;
       break;
      }
      default: {
       $$0243$ph$be = 0;
       break L77;
      }
      }
      break;
     }
     case 112:  {
      $220 = ($$0254>>>0)>(8);
      $221 = $220 ? $$0254 : 8;
      $222 = $spec$select | 8;
      $$1236 = 120;$$1255 = $221;$$3265 = $222;
      label = 67;
      break;
     }
     case 88: case 120:  {
      $$1236 = $$0235;$$1255 = $$0254;$$3265 = $spec$select;
      label = 67;
      break;
     }
     case 111:  {
      $238 = $6;
      $239 = $238;
      $240 = HEAP32[$239>>2]|0;
      $241 = (($238) + 4)|0;
      $242 = $241;
      $243 = HEAP32[$242>>2]|0;
      $244 = (_fmt_o($240,$243,$11)|0);
      $245 = $spec$select & 8;
      $246 = ($245|0)==(0);
      $247 = $244;
      $248 = (($12) - ($247))|0;
      $249 = ($$0254|0)>($248|0);
      $250 = (($248) + 1)|0;
      $251 = $246 | $249;
      $spec$select295 = $251 ? $$0254 : $250;
      $$0228 = $244;$$1233 = 0;$$1238 = 1629;$$2256 = $spec$select295;$$4266 = $spec$select;$277 = $240;$279 = $243;
      label = 73;
      break;
     }
     case 105: case 100:  {
      $252 = $6;
      $253 = $252;
      $254 = HEAP32[$253>>2]|0;
      $255 = (($252) + 4)|0;
      $256 = $255;
      $257 = HEAP32[$256>>2]|0;
      $258 = ($257|0)<(0);
      if ($258) {
       $259 = (_i64Subtract(0,0,($254|0),($257|0))|0);
       $260 = tempRet0;
       $261 = $6;
       $262 = $261;
       HEAP32[$262>>2] = $259;
       $263 = (($261) + 4)|0;
       $264 = $263;
       HEAP32[$264>>2] = $260;
       $$0232 = 1;$$0237 = 1629;$271 = $259;$272 = $260;
       label = 72;
       break L79;
      } else {
       $265 = $spec$select & 2048;
       $266 = ($265|0)==(0);
       $267 = $spec$select & 1;
       $268 = ($267|0)==(0);
       $$ = $268 ? 1629 : (1631);
       $spec$select296 = $266 ? $$ : (1630);
       $269 = $spec$select & 2049;
       $270 = ($269|0)!=(0);
       $spec$select297 = $270&1;
       $$0232 = $spec$select297;$$0237 = $spec$select296;$271 = $254;$272 = $257;
       label = 72;
       break L79;
      }
      break;
     }
     case 117:  {
      $193 = $6;
      $194 = $193;
      $195 = HEAP32[$194>>2]|0;
      $196 = (($193) + 4)|0;
      $197 = $196;
      $198 = HEAP32[$197>>2]|0;
      $$0232 = 0;$$0237 = 1629;$271 = $195;$272 = $198;
      label = 72;
      break;
     }
     case 99:  {
      $288 = $6;
      $289 = $288;
      $290 = HEAP32[$289>>2]|0;
      $291 = (($288) + 4)|0;
      $292 = $291;
      $293 = HEAP32[$292>>2]|0;
      $294 = $290&255;
      HEAP8[$13>>0] = $294;
      $$2 = $13;$$2234 = 0;$$2239 = 1629;$$5 = 1;$$6268 = $192;$$pre$phiZ2D = $12;
      break;
     }
     case 109:  {
      $295 = (___errno_location()|0);
      $296 = HEAP32[$295>>2]|0;
      $297 = (_strerror($296)|0);
      $$1 = $297;
      label = 77;
      break;
     }
     case 115:  {
      $298 = HEAP32[$6>>2]|0;
      $299 = ($298|0)==(0|0);
      $300 = $299 ? 1639 : $298;
      $$1 = $300;
      label = 77;
      break;
     }
     case 67:  {
      $307 = $6;
      $308 = $307;
      $309 = HEAP32[$308>>2]|0;
      $310 = (($307) + 4)|0;
      $311 = $310;
      $312 = HEAP32[$311>>2]|0;
      HEAP32[$8>>2] = $309;
      HEAP32[$14>>2] = 0;
      HEAP32[$6>>2] = $8;
      $$4258370 = -1;
      label = 81;
      break;
     }
     case 83:  {
      $313 = ($$0254|0)==(0);
      if ($313) {
       _pad_676($0,32,$$1260,0,$spec$select);
       $$0240313371 = 0;
       label = 91;
      } else {
       $$4258370 = $$0254;
       label = 81;
      }
      break;
     }
     case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
      $336 = +HEAPF64[$6>>3];
      $337 = (_fmt_fp($0,$336,$$1260,$$0254,$spec$select,$$0235)|0);
      $$0243$ph$be = $337;
      break L77;
      break;
     }
     default: {
      $$2 = $20;$$2234 = 0;$$2239 = 1629;$$5 = $$0254;$$6268 = $spec$select;$$pre$phiZ2D = $12;
     }
     }
    } while(0);
    L103: do {
     if ((label|0) == 67) {
      label = 0;
      $223 = $6;
      $224 = $223;
      $225 = HEAP32[$224>>2]|0;
      $226 = (($223) + 4)|0;
      $227 = $226;
      $228 = HEAP32[$227>>2]|0;
      $229 = $$1236 & 32;
      $230 = (_fmt_x($225,$228,$11,$229)|0);
      $231 = ($225|0)==(0);
      $232 = ($228|0)==(0);
      $233 = $231 & $232;
      $234 = $$3265 & 8;
      $235 = ($234|0)==(0);
      $or$cond278 = $235 | $233;
      $236 = $$1236 >>> 4;
      $237 = (1629 + ($236)|0);
      $spec$select293 = $or$cond278 ? 1629 : $237;
      $spec$select294 = $or$cond278 ? 0 : 2;
      $$0228 = $230;$$1233 = $spec$select294;$$1238 = $spec$select293;$$2256 = $$1255;$$4266 = $$3265;$277 = $225;$279 = $228;
      label = 73;
     }
     else if ((label|0) == 72) {
      label = 0;
      $273 = (_fmt_u($271,$272,$11)|0);
      $$0228 = $273;$$1233 = $$0232;$$1238 = $$0237;$$2256 = $$0254;$$4266 = $spec$select;$277 = $271;$279 = $272;
      label = 73;
     }
     else if ((label|0) == 77) {
      label = 0;
      $301 = (_memchr($$1,0,$$0254)|0);
      $302 = ($301|0)==(0|0);
      $303 = $301;
      $304 = $$1;
      $305 = (($303) - ($304))|0;
      $306 = (($$1) + ($$0254)|0);
      $$3257 = $302 ? $$0254 : $305;
      $$1250 = $302 ? $306 : $301;
      $$pre368 = $$1250;
      $$2 = $$1;$$2234 = 0;$$2239 = 1629;$$5 = $$3257;$$6268 = $192;$$pre$phiZ2D = $$pre368;
     }
     else if ((label|0) == 81) {
      label = 0;
      $314 = HEAP32[$6>>2]|0;
      $$0229334 = $314;$$0240333 = 0;
      while(1) {
       $315 = HEAP32[$$0229334>>2]|0;
       $316 = ($315|0)==(0);
       if ($316) {
        $$0240313 = $$0240333;
        break;
       }
       $317 = (_wctomb($9,$315)|0);
       $318 = ($317|0)<(0);
       $319 = (($$4258370) - ($$0240333))|0;
       $320 = ($317>>>0)>($319>>>0);
       $or$cond283 = $318 | $320;
       if ($or$cond283) {
        label = 85;
        break;
       }
       $321 = ((($$0229334)) + 4|0);
       $322 = (($317) + ($$0240333))|0;
       $323 = ($$4258370>>>0)>($322>>>0);
       if ($323) {
        $$0229334 = $321;$$0240333 = $322;
       } else {
        $$0240313 = $322;
        break;
       }
      }
      if ((label|0) == 85) {
       label = 0;
       if ($318) {
        $$0 = -1;
        break L1;
       } else {
        $$0240313 = $$0240333;
       }
      }
      _pad_676($0,32,$$1260,$$0240313,$spec$select);
      $324 = ($$0240313|0)==(0);
      if ($324) {
       $$0240313371 = 0;
       label = 91;
      } else {
       $325 = HEAP32[$6>>2]|0;
       $$1230340 = $325;$$1241339 = 0;
       while(1) {
        $326 = HEAP32[$$1230340>>2]|0;
        $327 = ($326|0)==(0);
        if ($327) {
         $$0240313371 = $$0240313;
         label = 91;
         break L103;
        }
        $328 = (_wctomb($9,$326)|0);
        $329 = (($328) + ($$1241339))|0;
        $330 = ($329|0)>($$0240313|0);
        if ($330) {
         $$0240313371 = $$0240313;
         label = 91;
         break L103;
        }
        $331 = ((($$1230340)) + 4|0);
        _out_670($0,$9,$328);
        $332 = ($329>>>0)<($$0240313>>>0);
        if ($332) {
         $$1230340 = $331;$$1241339 = $329;
        } else {
         $$0240313371 = $$0240313;
         label = 91;
         break;
        }
       }
      }
     }
    } while(0);
    if ((label|0) == 73) {
     label = 0;
     $274 = ($$2256|0)>(-1);
     $275 = $$4266 & -65537;
     $spec$select281 = $274 ? $275 : $$4266;
     $276 = ($277|0)!=(0);
     $278 = ($279|0)!=(0);
     $280 = $276 | $278;
     $281 = ($$2256|0)!=(0);
     $or$cond = $281 | $280;
     $282 = $$0228;
     $283 = (($12) - ($282))|0;
     $284 = $280 ^ 1;
     $285 = $284&1;
     $286 = (($283) + ($285))|0;
     $287 = ($$2256|0)>($286|0);
     $$2256$ = $287 ? $$2256 : $286;
     $spec$select298 = $or$cond ? $$2256$ : 0;
     $spec$select299 = $or$cond ? $$0228 : $11;
     $$2 = $spec$select299;$$2234 = $$1233;$$2239 = $$1238;$$5 = $spec$select298;$$6268 = $spec$select281;$$pre$phiZ2D = $12;
    }
    else if ((label|0) == 91) {
     label = 0;
     $333 = $spec$select ^ 8192;
     _pad_676($0,32,$$1260,$$0240313371,$333);
     $334 = ($$1260|0)>($$0240313371|0);
     $335 = $334 ? $$1260 : $$0240313371;
     $$0243$ph$be = $335;
     break;
    }
    $338 = $$2;
    $339 = (($$pre$phiZ2D) - ($338))|0;
    $340 = ($$5|0)<($339|0);
    $spec$select284 = $340 ? $339 : $$5;
    $341 = (($spec$select284) + ($$2234))|0;
    $342 = ($$1260|0)<($341|0);
    $$2261 = $342 ? $341 : $$1260;
    _pad_676($0,32,$$2261,$341,$$6268);
    _out_670($0,$$2239,$$2234);
    $343 = $$6268 ^ 65536;
    _pad_676($0,48,$$2261,$341,$343);
    _pad_676($0,48,$spec$select284,$339,0);
    _out_670($0,$$2,$339);
    $344 = $$6268 ^ 8192;
    _pad_676($0,32,$$2261,$341,$344);
    $$0243$ph$be = $$2261;
   }
  } while(0);
  $$0243$ph = $$0243$ph$be;$$0247$ph = $$1248;$$0269$ph = $$3272;
 }
 L125: do {
  if ((label|0) == 94) {
   $345 = ($0|0)==(0|0);
   if ($345) {
    $346 = ($$0269$ph|0)==(0);
    if ($346) {
     $$0 = 0;
    } else {
     $$2242320 = 1;
     while(1) {
      $347 = (($4) + ($$2242320<<2)|0);
      $348 = HEAP32[$347>>2]|0;
      $349 = ($348|0)==(0);
      if ($349) {
       break;
      }
      $350 = (($3) + ($$2242320<<3)|0);
      _pop_arg_673($350,$348,$2);
      $351 = (($$2242320) + 1)|0;
      $352 = ($351>>>0)<(10);
      if ($352) {
       $$2242320 = $351;
      } else {
       $$0 = 1;
       break L125;
      }
     }
     $$3317 = $$2242320;
     while(1) {
      $355 = (($4) + ($$3317<<2)|0);
      $356 = HEAP32[$355>>2]|0;
      $357 = ($356|0)==(0);
      $354 = (($$3317) + 1)|0;
      if (!($357)) {
       $$0 = -1;
       break L125;
      }
      $353 = ($354>>>0)<(10);
      if ($353) {
       $$3317 = $354;
      } else {
       $$0 = 1;
       break;
      }
     }
    }
   } else {
    $$0 = $$1248;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function _out_670($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = $3 & 32;
 $5 = ($4|0)==(0);
 if ($5) {
  (___fwritex($1,$2,$0)|0);
 }
 return;
}
function _getint_671($0) {
 $0 = $0|0;
 var $$0$lcssa = 0, $$04 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $4 = (_isdigit($3)|0);
 $5 = ($4|0)==(0);
 if ($5) {
  $$0$lcssa = 0;
 } else {
  $$04 = 0;
  while(1) {
   $6 = ($$04*10)|0;
   $7 = HEAP32[$0>>2]|0;
   $8 = HEAP8[$7>>0]|0;
   $9 = $8 << 24 >> 24;
   $10 = (($6) + -48)|0;
   $11 = (($10) + ($9))|0;
   $12 = ((($7)) + 1|0);
   HEAP32[$0>>2] = $12;
   $13 = HEAP8[$12>>0]|0;
   $14 = $13 << 24 >> 24;
   $15 = (_isdigit($14)|0);
   $16 = ($15|0)==(0);
   if ($16) {
    $$0$lcssa = $11;
    break;
   } else {
    $$04 = $11;
   }
  }
 }
 return ($$0$lcssa|0);
}
function _pop_arg_673($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$mask = 0, $$mask31 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0;
 var $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0, $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(20);
 L1: do {
  if (!($3)) {
   do {
    switch ($1|0) {
    case 9:  {
     $arglist_current = HEAP32[$2>>2]|0;
     $4 = $arglist_current;
     $5 = ((0) + 4|0);
     $expanded28 = $5;
     $expanded = (($expanded28) - 1)|0;
     $6 = (($4) + ($expanded))|0;
     $7 = ((0) + 4|0);
     $expanded32 = $7;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $8 = $6 & $expanded30;
     $9 = $8;
     $10 = HEAP32[$9>>2]|0;
     $arglist_next = ((($9)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     HEAP32[$0>>2] = $10;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $11 = $arglist_current2;
     $12 = ((0) + 4|0);
     $expanded35 = $12;
     $expanded34 = (($expanded35) - 1)|0;
     $13 = (($11) + ($expanded34))|0;
     $14 = ((0) + 4|0);
     $expanded39 = $14;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $15 = $13 & $expanded37;
     $16 = $15;
     $17 = HEAP32[$16>>2]|0;
     $arglist_next3 = ((($16)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $18 = ($17|0)<(0);
     $19 = $18 << 31 >> 31;
     $20 = $0;
     $21 = $20;
     HEAP32[$21>>2] = $17;
     $22 = (($20) + 4)|0;
     $23 = $22;
     HEAP32[$23>>2] = $19;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$2>>2]|0;
     $24 = $arglist_current5;
     $25 = ((0) + 4|0);
     $expanded42 = $25;
     $expanded41 = (($expanded42) - 1)|0;
     $26 = (($24) + ($expanded41))|0;
     $27 = ((0) + 4|0);
     $expanded46 = $27;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $28 = $26 & $expanded44;
     $29 = $28;
     $30 = HEAP32[$29>>2]|0;
     $arglist_next6 = ((($29)) + 4|0);
     HEAP32[$2>>2] = $arglist_next6;
     $31 = $0;
     $32 = $31;
     HEAP32[$32>>2] = $30;
     $33 = (($31) + 4)|0;
     $34 = $33;
     HEAP32[$34>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$2>>2]|0;
     $35 = $arglist_current8;
     $36 = ((0) + 8|0);
     $expanded49 = $36;
     $expanded48 = (($expanded49) - 1)|0;
     $37 = (($35) + ($expanded48))|0;
     $38 = ((0) + 8|0);
     $expanded53 = $38;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $39 = $37 & $expanded51;
     $40 = $39;
     $41 = $40;
     $42 = $41;
     $43 = HEAP32[$42>>2]|0;
     $44 = (($41) + 4)|0;
     $45 = $44;
     $46 = HEAP32[$45>>2]|0;
     $arglist_next9 = ((($40)) + 8|0);
     HEAP32[$2>>2] = $arglist_next9;
     $47 = $0;
     $48 = $47;
     HEAP32[$48>>2] = $43;
     $49 = (($47) + 4)|0;
     $50 = $49;
     HEAP32[$50>>2] = $46;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$2>>2]|0;
     $51 = $arglist_current11;
     $52 = ((0) + 4|0);
     $expanded56 = $52;
     $expanded55 = (($expanded56) - 1)|0;
     $53 = (($51) + ($expanded55))|0;
     $54 = ((0) + 4|0);
     $expanded60 = $54;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $55 = $53 & $expanded58;
     $56 = $55;
     $57 = HEAP32[$56>>2]|0;
     $arglist_next12 = ((($56)) + 4|0);
     HEAP32[$2>>2] = $arglist_next12;
     $58 = $57&65535;
     $59 = $58 << 16 >> 16;
     $60 = ($59|0)<(0);
     $61 = $60 << 31 >> 31;
     $62 = $0;
     $63 = $62;
     HEAP32[$63>>2] = $59;
     $64 = (($62) + 4)|0;
     $65 = $64;
     HEAP32[$65>>2] = $61;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$2>>2]|0;
     $66 = $arglist_current14;
     $67 = ((0) + 4|0);
     $expanded63 = $67;
     $expanded62 = (($expanded63) - 1)|0;
     $68 = (($66) + ($expanded62))|0;
     $69 = ((0) + 4|0);
     $expanded67 = $69;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $70 = $68 & $expanded65;
     $71 = $70;
     $72 = HEAP32[$71>>2]|0;
     $arglist_next15 = ((($71)) + 4|0);
     HEAP32[$2>>2] = $arglist_next15;
     $$mask31 = $72 & 65535;
     $73 = $0;
     $74 = $73;
     HEAP32[$74>>2] = $$mask31;
     $75 = (($73) + 4)|0;
     $76 = $75;
     HEAP32[$76>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$2>>2]|0;
     $77 = $arglist_current17;
     $78 = ((0) + 4|0);
     $expanded70 = $78;
     $expanded69 = (($expanded70) - 1)|0;
     $79 = (($77) + ($expanded69))|0;
     $80 = ((0) + 4|0);
     $expanded74 = $80;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $81 = $79 & $expanded72;
     $82 = $81;
     $83 = HEAP32[$82>>2]|0;
     $arglist_next18 = ((($82)) + 4|0);
     HEAP32[$2>>2] = $arglist_next18;
     $84 = $83&255;
     $85 = $84 << 24 >> 24;
     $86 = ($85|0)<(0);
     $87 = $86 << 31 >> 31;
     $88 = $0;
     $89 = $88;
     HEAP32[$89>>2] = $85;
     $90 = (($88) + 4)|0;
     $91 = $90;
     HEAP32[$91>>2] = $87;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$2>>2]|0;
     $92 = $arglist_current20;
     $93 = ((0) + 4|0);
     $expanded77 = $93;
     $expanded76 = (($expanded77) - 1)|0;
     $94 = (($92) + ($expanded76))|0;
     $95 = ((0) + 4|0);
     $expanded81 = $95;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $96 = $94 & $expanded79;
     $97 = $96;
     $98 = HEAP32[$97>>2]|0;
     $arglist_next21 = ((($97)) + 4|0);
     HEAP32[$2>>2] = $arglist_next21;
     $$mask = $98 & 255;
     $99 = $0;
     $100 = $99;
     HEAP32[$100>>2] = $$mask;
     $101 = (($99) + 4)|0;
     $102 = $101;
     HEAP32[$102>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$2>>2]|0;
     $103 = $arglist_current23;
     $104 = ((0) + 8|0);
     $expanded84 = $104;
     $expanded83 = (($expanded84) - 1)|0;
     $105 = (($103) + ($expanded83))|0;
     $106 = ((0) + 8|0);
     $expanded88 = $106;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $107 = $105 & $expanded86;
     $108 = $107;
     $109 = +HEAPF64[$108>>3];
     $arglist_next24 = ((($108)) + 8|0);
     HEAP32[$2>>2] = $arglist_next24;
     HEAPF64[$0>>3] = $109;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$2>>2]|0;
     $110 = $arglist_current26;
     $111 = ((0) + 8|0);
     $expanded91 = $111;
     $expanded90 = (($expanded91) - 1)|0;
     $112 = (($110) + ($expanded90))|0;
     $113 = ((0) + 8|0);
     $expanded95 = $113;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $114 = $112 & $expanded93;
     $115 = $114;
     $116 = +HEAPF64[$115>>3];
     $arglist_next27 = ((($115)) + 8|0);
     HEAP32[$2>>2] = $arglist_next27;
     HEAPF64[$0>>3] = $116;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_x($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$05$lcssa = 0, $$056 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $4 = ($0|0)==(0);
 $5 = ($1|0)==(0);
 $6 = $4 & $5;
 if ($6) {
  $$05$lcssa = $2;
 } else {
  $$056 = $2;$15 = $1;$8 = $0;
  while(1) {
   $7 = $8 & 15;
   $9 = (1681 + ($7)|0);
   $10 = HEAP8[$9>>0]|0;
   $11 = $10&255;
   $12 = $11 | $3;
   $13 = $12&255;
   $14 = ((($$056)) + -1|0);
   HEAP8[$14>>0] = $13;
   $16 = (_bitshift64Lshr(($8|0),($15|0),4)|0);
   $17 = tempRet0;
   $18 = ($16|0)==(0);
   $19 = ($17|0)==(0);
   $20 = $18 & $19;
   if ($20) {
    $$05$lcssa = $14;
    break;
   } else {
    $$056 = $14;$15 = $17;$8 = $16;
   }
  }
 }
 return ($$05$lcssa|0);
}
function _fmt_o($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0);
 $4 = ($1|0)==(0);
 $5 = $3 & $4;
 if ($5) {
  $$0$lcssa = $2;
 } else {
  $$06 = $2;$11 = $1;$7 = $0;
  while(1) {
   $6 = $7&255;
   $8 = $6 & 7;
   $9 = $8 | 48;
   $10 = ((($$06)) + -1|0);
   HEAP8[$10>>0] = $9;
   $12 = (_bitshift64Lshr(($7|0),($11|0),3)|0);
   $13 = tempRet0;
   $14 = ($12|0)==(0);
   $15 = ($13|0)==(0);
   $16 = $14 & $15;
   if ($16) {
    $$0$lcssa = $10;
    break;
   } else {
    $$06 = $10;$11 = $13;$7 = $12;
   }
  }
 }
 return ($$0$lcssa|0);
}
function _fmt_u($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(0);
 $4 = ($0>>>0)>(4294967295);
 $5 = ($1|0)==(0);
 $6 = $5 & $4;
 $7 = $3 | $6;
 if ($7) {
  $$0914 = $2;$8 = $0;$9 = $1;
  while(1) {
   $10 = (___udivdi3(($8|0),($9|0),10,0)|0);
   $11 = tempRet0;
   $12 = (___muldi3(($10|0),($11|0),10,0)|0);
   $13 = tempRet0;
   $14 = (_i64Subtract(($8|0),($9|0),($12|0),($13|0))|0);
   $15 = tempRet0;
   $16 = $14&255;
   $17 = $16 | 48;
   $18 = ((($$0914)) + -1|0);
   HEAP8[$18>>0] = $17;
   $19 = ($9>>>0)>(9);
   $20 = ($8>>>0)>(4294967295);
   $21 = ($9|0)==(9);
   $22 = $21 & $20;
   $23 = $19 | $22;
   if ($23) {
    $$0914 = $18;$8 = $10;$9 = $11;
   } else {
    break;
   }
  }
  $$010$lcssa$off0 = $10;$$09$lcssa = $18;
 } else {
  $$010$lcssa$off0 = $0;$$09$lcssa = $2;
 }
 $24 = ($$010$lcssa$off0|0)==(0);
 if ($24) {
  $$1$lcssa = $$09$lcssa;
 } else {
  $$012 = $$010$lcssa$off0;$$111 = $$09$lcssa;
  while(1) {
   $25 = (($$012>>>0) / 10)&-1;
   $26 = ($25*10)|0;
   $27 = (($$012) - ($26))|0;
   $28 = $27 | 48;
   $29 = $28&255;
   $30 = ((($$111)) + -1|0);
   HEAP8[$30>>0] = $29;
   $31 = ($$012>>>0)<(10);
   if ($31) {
    $$1$lcssa = $30;
    break;
   } else {
    $$012 = $25;$$111 = $30;
   }
  }
 }
 return ($$1$lcssa|0);
}
function _strerror($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (___pthread_self_85()|0);
 $2 = ((($1)) + 188|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = (___strerror_l($0,$3)|0);
 return ($4|0);
}
function _pad_676($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0$lcssa = 0, $$011 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $5 = sp;
 $6 = $4 & 73728;
 $7 = ($6|0)==(0);
 $8 = ($2|0)>($3|0);
 $or$cond = $8 & $7;
 if ($or$cond) {
  $9 = (($2) - ($3))|0;
  $10 = $1 << 24 >> 24;
  $11 = ($9>>>0)<(256);
  $12 = $11 ? $9 : 256;
  (_memset(($5|0),($10|0),($12|0))|0);
  $13 = ($9>>>0)>(255);
  if ($13) {
   $14 = (($2) - ($3))|0;
   $$011 = $9;
   while(1) {
    _out_670($0,$5,256);
    $15 = (($$011) + -256)|0;
    $16 = ($15>>>0)>(255);
    if ($16) {
     $$011 = $15;
    } else {
     break;
    }
   }
   $17 = $14 & 255;
   $$0$lcssa = $17;
  } else {
   $$0$lcssa = $9;
  }
  _out_670($0,$5,$$0$lcssa);
 }
 STACKTOP = sp;return;
}
function _wctomb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = (_wcrtomb($0,$1,0)|0);
  $$0 = $3;
 }
 return ($$0|0);
}
function _fmt_fp($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = +$1;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$ = 0, $$0 = 0, $$0463$lcssa = 0, $$0463588 = 0, $$0464599 = 0, $$0471 = 0.0, $$0479 = 0, $$0487657 = 0, $$0488 = 0, $$0488669 = 0, $$0488671 = 0, $$0497670 = 0, $$0498 = 0, $$0511586 = 0.0, $$0512 = 0, $$0513 = 0, $$0516652 = 0, $$0522 = 0, $$0523 = 0, $$0525 = 0;
 var $$0527 = 0, $$0529 = 0, $$0529$in646 = 0, $$0532651 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0, $$1482683 = 0, $$1489656 = 0, $$1499 = 0, $$1510587 = 0, $$1514$lcssa = 0, $$1514614 = 0, $$1517 = 0, $$1526 = 0, $$1528 = 0, $$1530621 = 0;
 var $$1533$lcssa = 0, $$1533645 = 0, $$1604 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2483 = 0, $$2490$lcssa = 0, $$2490638 = 0, $$2500$lcssa = 0, $$2500682 = 0, $$2515 = 0, $$2518634 = 0, $$2531 = 0, $$2534633 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484663 = 0, $$3501$lcssa = 0;
 var $$3501676 = 0, $$3535620 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478594 = 0, $$4492 = 0, $$4502$lcssa = 0, $$4502662 = 0, $$4520 = 0, $$5$lcssa = 0, $$5486$lcssa = 0, $$5486639 = 0, $$5493603 = 0, $$5503 = 0, $$5521 = 0, $$560 = 0, $$5609 = 0, $$6 = 0, $$6494593 = 0, $$7495608 = 0;
 var $$8 = 0, $$8506 = 0, $$9 = 0, $$9507$lcssa = 0, $$9507625 = 0, $$lcssa583 = 0, $$lobit = 0, $$neg = 0, $$neg571 = 0, $$not = 0, $$pn = 0, $$pr = 0, $$pr564 = 0, $$pre = 0, $$pre$phi713Z2D = 0, $$pre$phi714Z2D = 0, $$pre716 = 0, $$sink755 = 0, $10 = 0, $100 = 0;
 var $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0;
 var $12 = 0, $120 = 0, $121 = 0.0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0.0, $129 = 0.0, $13 = 0, $130 = 0.0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0;
 var $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0.0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0;
 var $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0;
 var $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0;
 var $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0;
 var $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0;
 var $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0.0;
 var $247 = 0.0, $248 = 0, $249 = 0.0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0;
 var $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0;
 var $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0;
 var $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0;
 var $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0;
 var $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0;
 var $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0.0, $370 = 0, $371 = 0, $372 = 0, $373 = 0;
 var $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0.0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0;
 var $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0;
 var $410 = 0, $411 = 0, $412 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0.0, $54 = 0, $55 = 0, $56 = 0, $57 = 0.0, $58 = 0.0;
 var $59 = 0.0, $6 = 0, $60 = 0.0, $61 = 0.0, $62 = 0.0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0;
 var $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0.0, $91 = 0.0, $92 = 0.0, $93 = 0, $94 = 0;
 var $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $not$ = 0, $or$cond = 0, $or$cond3$not = 0, $or$cond543 = 0, $or$cond546 = 0, $or$cond556 = 0, $or$cond559 = 0, $or$cond6 = 0, $scevgep707 = 0, $scevgep707708 = 0, $spec$select = 0, $spec$select539 = 0, $spec$select540 = 0, $spec$select540720 = 0, $spec$select540721 = 0;
 var $spec$select541 = 0, $spec$select544 = 0.0, $spec$select547 = 0, $spec$select548 = 0, $spec$select549 = 0, $spec$select551 = 0, $spec$select554 = 0, $spec$select557 = 0, $spec$select561 = 0.0, $spec$select562 = 0, $spec$select563 = 0, $spec$select565 = 0, $spec$select566 = 0, $spec$select567 = 0.0, $spec$select568 = 0.0, $spec$select569 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 560|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(560|0);
 $6 = sp + 8|0;
 $7 = sp;
 $8 = sp + 524|0;
 $9 = $8;
 $10 = sp + 512|0;
 HEAP32[$7>>2] = 0;
 $11 = ((($10)) + 12|0);
 $12 = (___DOUBLE_BITS_677($1)|0);
 $13 = tempRet0;
 $14 = ($13|0)<(0);
 if ($14) {
  $15 = - $1;
  $16 = (___DOUBLE_BITS_677($15)|0);
  $17 = tempRet0;
  $$0471 = $15;$$0522 = 1;$$0523 = 1646;$25 = $17;$412 = $16;
 } else {
  $18 = $4 & 2048;
  $19 = ($18|0)==(0);
  $20 = $4 & 1;
  $21 = ($20|0)==(0);
  $$ = $21 ? (1647) : (1652);
  $spec$select565 = $19 ? $$ : (1649);
  $22 = $4 & 2049;
  $23 = ($22|0)!=(0);
  $spec$select566 = $23&1;
  $$0471 = $1;$$0522 = $spec$select566;$$0523 = $spec$select565;$25 = $13;$412 = $12;
 }
 $24 = $25 & 2146435072;
 $26 = (0)==(0);
 $27 = ($24|0)==(2146435072);
 $28 = $26 & $27;
 do {
  if ($28) {
   $29 = $5 & 32;
   $30 = ($29|0)!=(0);
   $31 = $30 ? 1665 : 1669;
   $32 = ($$0471 != $$0471) | (0.0 != 0.0);
   $33 = $30 ? 1673 : 1677;
   $$0512 = $32 ? $33 : $31;
   $34 = (($$0522) + 3)|0;
   $35 = $4 & -65537;
   _pad_676($0,32,$2,$34,$35);
   _out_670($0,$$0523,$$0522);
   _out_670($0,$$0512,3);
   $36 = $4 ^ 8192;
   _pad_676($0,32,$2,$34,$36);
   $$sink755 = $34;
  } else {
   $37 = (+_frexpl($$0471,$7));
   $38 = $37 * 2.0;
   $39 = $38 != 0.0;
   if ($39) {
    $40 = HEAP32[$7>>2]|0;
    $41 = (($40) + -1)|0;
    HEAP32[$7>>2] = $41;
   }
   $42 = $5 | 32;
   $43 = ($42|0)==(97);
   if ($43) {
    $44 = $5 & 32;
    $45 = ($44|0)==(0);
    $46 = ((($$0523)) + 9|0);
    $spec$select = $45 ? $$0523 : $46;
    $47 = $$0522 | 2;
    $48 = ($3>>>0)>(11);
    $49 = (12 - ($3))|0;
    $50 = ($49|0)==(0);
    $51 = $48 | $50;
    do {
     if ($51) {
      $$1472 = $38;
     } else {
      $$0511586 = 8.0;$$1510587 = $49;
      while(1) {
       $52 = (($$1510587) + -1)|0;
       $53 = $$0511586 * 16.0;
       $54 = ($52|0)==(0);
       if ($54) {
        break;
       } else {
        $$0511586 = $53;$$1510587 = $52;
       }
      }
      $55 = HEAP8[$spec$select>>0]|0;
      $56 = ($55<<24>>24)==(45);
      if ($56) {
       $57 = - $38;
       $58 = $57 - $53;
       $59 = $53 + $58;
       $60 = - $59;
       $$1472 = $60;
       break;
      } else {
       $61 = $38 + $53;
       $62 = $61 - $53;
       $$1472 = $62;
       break;
      }
     }
    } while(0);
    $63 = HEAP32[$7>>2]|0;
    $64 = ($63|0)<(0);
    $65 = (0 - ($63))|0;
    $66 = $64 ? $65 : $63;
    $67 = ($66|0)<(0);
    $68 = $67 << 31 >> 31;
    $69 = (_fmt_u($66,$68,$11)|0);
    $70 = ($69|0)==($11|0);
    if ($70) {
     $71 = ((($10)) + 11|0);
     HEAP8[$71>>0] = 48;
     $$0513 = $71;
    } else {
     $$0513 = $69;
    }
    $72 = $63 >> 31;
    $73 = $72 & 2;
    $74 = (($73) + 43)|0;
    $75 = $74&255;
    $76 = ((($$0513)) + -1|0);
    HEAP8[$76>>0] = $75;
    $77 = (($5) + 15)|0;
    $78 = $77&255;
    $79 = ((($$0513)) + -2|0);
    HEAP8[$79>>0] = $78;
    $80 = ($3|0)<(1);
    $81 = $4 & 8;
    $82 = ($81|0)==(0);
    $$0525 = $8;$$2473 = $$1472;
    while(1) {
     $83 = (~~(($$2473)));
     $84 = (1681 + ($83)|0);
     $85 = HEAP8[$84>>0]|0;
     $86 = $85&255;
     $87 = $44 | $86;
     $88 = $87&255;
     $89 = ((($$0525)) + 1|0);
     HEAP8[$$0525>>0] = $88;
     $90 = (+($83|0));
     $91 = $$2473 - $90;
     $92 = $91 * 16.0;
     $93 = $89;
     $94 = (($93) - ($9))|0;
     $95 = ($94|0)==(1);
     if ($95) {
      $96 = $92 == 0.0;
      $or$cond3$not = $80 & $96;
      $or$cond = $82 & $or$cond3$not;
      if ($or$cond) {
       $$1526 = $89;
      } else {
       $97 = ((($$0525)) + 2|0);
       HEAP8[$89>>0] = 46;
       $$1526 = $97;
      }
     } else {
      $$1526 = $89;
     }
     $98 = $92 != 0.0;
     if ($98) {
      $$0525 = $$1526;$$2473 = $92;
     } else {
      break;
     }
    }
    $99 = ($3|0)==(0);
    $$pre716 = $$1526;
    if ($99) {
     label = 25;
    } else {
     $100 = (-2 - ($9))|0;
     $101 = (($100) + ($$pre716))|0;
     $102 = ($101|0)<($3|0);
     if ($102) {
      $103 = $11;
      $104 = $79;
      $105 = (($3) + 2)|0;
      $106 = (($105) + ($103))|0;
      $107 = (($106) - ($104))|0;
      $$0527 = $107;$$pre$phi713Z2D = $103;$$pre$phi714Z2D = $104;
     } else {
      label = 25;
     }
    }
    if ((label|0) == 25) {
     $108 = $11;
     $109 = $79;
     $110 = (($108) - ($9))|0;
     $111 = (($110) - ($109))|0;
     $112 = (($111) + ($$pre716))|0;
     $$0527 = $112;$$pre$phi713Z2D = $108;$$pre$phi714Z2D = $109;
    }
    $113 = (($$0527) + ($47))|0;
    _pad_676($0,32,$2,$113,$4);
    _out_670($0,$spec$select,$47);
    $114 = $4 ^ 65536;
    _pad_676($0,48,$2,$113,$114);
    $115 = (($$pre716) - ($9))|0;
    _out_670($0,$8,$115);
    $116 = (($$pre$phi713Z2D) - ($$pre$phi714Z2D))|0;
    $117 = (($115) + ($116))|0;
    $118 = (($$0527) - ($117))|0;
    _pad_676($0,48,$118,0,0);
    _out_670($0,$79,$116);
    $119 = $4 ^ 8192;
    _pad_676($0,32,$2,$113,$119);
    $$sink755 = $113;
    break;
   }
   $120 = ($3|0)<(0);
   $spec$select539 = $120 ? 6 : $3;
   if ($39) {
    $121 = $38 * 268435456.0;
    $122 = HEAP32[$7>>2]|0;
    $123 = (($122) + -28)|0;
    HEAP32[$7>>2] = $123;
    $$3 = $121;$$pr = $123;
   } else {
    $$pre = HEAP32[$7>>2]|0;
    $$3 = $38;$$pr = $$pre;
   }
   $124 = ($$pr|0)<(0);
   $125 = ((($6)) + 288|0);
   $$0498 = $124 ? $6 : $125;
   $$1499 = $$0498;$$4 = $$3;
   while(1) {
    $126 = (~~(($$4))>>>0);
    HEAP32[$$1499>>2] = $126;
    $127 = ((($$1499)) + 4|0);
    $128 = (+($126>>>0));
    $129 = $$4 - $128;
    $130 = $129 * 1.0E+9;
    $131 = $130 != 0.0;
    if ($131) {
     $$1499 = $127;$$4 = $130;
    } else {
     break;
    }
   }
   $132 = ($$pr|0)>(0);
   if ($132) {
    $$1482683 = $$0498;$$2500682 = $127;$134 = $$pr;
    while(1) {
     $133 = ($134|0)<(29);
     $135 = $133 ? $134 : 29;
     $$0488669 = ((($$2500682)) + -4|0);
     $136 = ($$0488669>>>0)<($$1482683>>>0);
     if ($136) {
      $$2483 = $$1482683;
     } else {
      $$0488671 = $$0488669;$$0497670 = 0;
      while(1) {
       $137 = HEAP32[$$0488671>>2]|0;
       $138 = (_bitshift64Shl(($137|0),0,($135|0))|0);
       $139 = tempRet0;
       $140 = (_i64Add(($138|0),($139|0),($$0497670|0),0)|0);
       $141 = tempRet0;
       $142 = (___udivdi3(($140|0),($141|0),1000000000,0)|0);
       $143 = tempRet0;
       $144 = (___muldi3(($142|0),($143|0),1000000000,0)|0);
       $145 = tempRet0;
       $146 = (_i64Subtract(($140|0),($141|0),($144|0),($145|0))|0);
       $147 = tempRet0;
       HEAP32[$$0488671>>2] = $146;
       $$0488 = ((($$0488671)) + -4|0);
       $148 = ($$0488>>>0)<($$1482683>>>0);
       if ($148) {
        break;
       } else {
        $$0488671 = $$0488;$$0497670 = $142;
       }
      }
      $149 = ($142|0)==(0);
      if ($149) {
       $$2483 = $$1482683;
      } else {
       $150 = ((($$1482683)) + -4|0);
       HEAP32[$150>>2] = $142;
       $$2483 = $150;
      }
     }
     $151 = ($$2500682>>>0)>($$2483>>>0);
     L57: do {
      if ($151) {
       $$3501676 = $$2500682;
       while(1) {
        $153 = ((($$3501676)) + -4|0);
        $154 = HEAP32[$153>>2]|0;
        $155 = ($154|0)==(0);
        if (!($155)) {
         $$3501$lcssa = $$3501676;
         break L57;
        }
        $152 = ($153>>>0)>($$2483>>>0);
        if ($152) {
         $$3501676 = $153;
        } else {
         $$3501$lcssa = $153;
         break;
        }
       }
      } else {
       $$3501$lcssa = $$2500682;
      }
     } while(0);
     $156 = HEAP32[$7>>2]|0;
     $157 = (($156) - ($135))|0;
     HEAP32[$7>>2] = $157;
     $158 = ($157|0)>(0);
     if ($158) {
      $$1482683 = $$2483;$$2500682 = $$3501$lcssa;$134 = $157;
     } else {
      $$1482$lcssa = $$2483;$$2500$lcssa = $$3501$lcssa;$$pr564 = $157;
      break;
     }
    }
   } else {
    $$1482$lcssa = $$0498;$$2500$lcssa = $127;$$pr564 = $$pr;
   }
   $159 = ($$pr564|0)<(0);
   if ($159) {
    $160 = (($spec$select539) + 25)|0;
    $161 = (($160|0) / 9)&-1;
    $162 = (($161) + 1)|0;
    $163 = ($42|0)==(102);
    $$3484663 = $$1482$lcssa;$$4502662 = $$2500$lcssa;$165 = $$pr564;
    while(1) {
     $164 = (0 - ($165))|0;
     $166 = ($164|0)<(9);
     $167 = $166 ? $164 : 9;
     $168 = ($$3484663>>>0)<($$4502662>>>0);
     if ($168) {
      $172 = 1 << $167;
      $173 = (($172) + -1)|0;
      $174 = 1000000000 >>> $167;
      $$0487657 = 0;$$1489656 = $$3484663;
      while(1) {
       $175 = HEAP32[$$1489656>>2]|0;
       $176 = $175 & $173;
       $177 = $175 >>> $167;
       $178 = (($177) + ($$0487657))|0;
       HEAP32[$$1489656>>2] = $178;
       $179 = Math_imul($176, $174)|0;
       $180 = ((($$1489656)) + 4|0);
       $181 = ($180>>>0)<($$4502662>>>0);
       if ($181) {
        $$0487657 = $179;$$1489656 = $180;
       } else {
        break;
       }
      }
      $182 = HEAP32[$$3484663>>2]|0;
      $183 = ($182|0)==(0);
      $184 = ((($$3484663)) + 4|0);
      $spec$select540 = $183 ? $184 : $$3484663;
      $185 = ($179|0)==(0);
      if ($185) {
       $$5503 = $$4502662;$spec$select540721 = $spec$select540;
      } else {
       $186 = ((($$4502662)) + 4|0);
       HEAP32[$$4502662>>2] = $179;
       $$5503 = $186;$spec$select540721 = $spec$select540;
      }
     } else {
      $169 = HEAP32[$$3484663>>2]|0;
      $170 = ($169|0)==(0);
      $171 = ((($$3484663)) + 4|0);
      $spec$select540720 = $170 ? $171 : $$3484663;
      $$5503 = $$4502662;$spec$select540721 = $spec$select540720;
     }
     $187 = $163 ? $$0498 : $spec$select540721;
     $188 = $$5503;
     $189 = $187;
     $190 = (($188) - ($189))|0;
     $191 = $190 >> 2;
     $192 = ($191|0)>($162|0);
     $193 = (($187) + ($162<<2)|0);
     $spec$select541 = $192 ? $193 : $$5503;
     $194 = HEAP32[$7>>2]|0;
     $195 = (($194) + ($167))|0;
     HEAP32[$7>>2] = $195;
     $196 = ($195|0)<(0);
     if ($196) {
      $$3484663 = $spec$select540721;$$4502662 = $spec$select541;$165 = $195;
     } else {
      $$3484$lcssa = $spec$select540721;$$4502$lcssa = $spec$select541;
      break;
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa;$$4502$lcssa = $$2500$lcssa;
   }
   $197 = ($$3484$lcssa>>>0)<($$4502$lcssa>>>0);
   $198 = $$0498;
   if ($197) {
    $199 = $$3484$lcssa;
    $200 = (($198) - ($199))|0;
    $201 = $200 >> 2;
    $202 = ($201*9)|0;
    $203 = HEAP32[$$3484$lcssa>>2]|0;
    $204 = ($203>>>0)<(10);
    if ($204) {
     $$1517 = $202;
    } else {
     $$0516652 = $202;$$0532651 = 10;
     while(1) {
      $205 = ($$0532651*10)|0;
      $206 = (($$0516652) + 1)|0;
      $207 = ($203>>>0)<($205>>>0);
      if ($207) {
       $$1517 = $206;
       break;
      } else {
       $$0516652 = $206;$$0532651 = $205;
      }
     }
    }
   } else {
    $$1517 = 0;
   }
   $208 = ($42|0)==(102);
   $209 = $208 ? 0 : $$1517;
   $210 = (($spec$select539) - ($209))|0;
   $211 = ($42|0)==(103);
   $212 = ($spec$select539|0)!=(0);
   $213 = $212 & $211;
   $$neg = $213 << 31 >> 31;
   $214 = (($210) + ($$neg))|0;
   $215 = $$4502$lcssa;
   $216 = (($215) - ($198))|0;
   $217 = $216 >> 2;
   $218 = ($217*9)|0;
   $219 = (($218) + -9)|0;
   $220 = ($214|0)<($219|0);
   if ($220) {
    $221 = ((($$0498)) + 4|0);
    $222 = (($214) + 9216)|0;
    $223 = (($222|0) / 9)&-1;
    $224 = (($223) + -1024)|0;
    $225 = (($221) + ($224<<2)|0);
    $226 = ($223*9)|0;
    $227 = (($222) - ($226))|0;
    $228 = ($227|0)<(8);
    if ($228) {
     $$0529$in646 = $227;$$1533645 = 10;
     while(1) {
      $$0529 = (($$0529$in646) + 1)|0;
      $229 = ($$1533645*10)|0;
      $230 = ($$0529$in646|0)<(7);
      if ($230) {
       $$0529$in646 = $$0529;$$1533645 = $229;
      } else {
       $$1533$lcssa = $229;
       break;
      }
     }
    } else {
     $$1533$lcssa = 10;
    }
    $231 = HEAP32[$225>>2]|0;
    $232 = (($231>>>0) / ($$1533$lcssa>>>0))&-1;
    $233 = Math_imul($232, $$1533$lcssa)|0;
    $234 = (($231) - ($233))|0;
    $235 = ($234|0)==(0);
    $236 = ((($225)) + 4|0);
    $237 = ($236|0)==($$4502$lcssa|0);
    $or$cond543 = $237 & $235;
    if ($or$cond543) {
     $$4492 = $225;$$4520 = $$1517;$$8 = $$3484$lcssa;
    } else {
     $238 = $232 & 1;
     $239 = ($238|0)==(0);
     $spec$select544 = $239 ? 9007199254740992.0 : 9007199254740994.0;
     $240 = $$1533$lcssa >>> 1;
     $241 = ($234>>>0)<($240>>>0);
     $242 = ($234|0)==($240|0);
     $or$cond546 = $237 & $242;
     $spec$select561 = $or$cond546 ? 1.0 : 1.5;
     $spec$select567 = $241 ? 0.5 : $spec$select561;
     $243 = ($$0522|0)==(0);
     if ($243) {
      $$1467 = $spec$select567;$$1469 = $spec$select544;
     } else {
      $244 = HEAP8[$$0523>>0]|0;
      $245 = ($244<<24>>24)==(45);
      $246 = - $spec$select544;
      $247 = - $spec$select567;
      $spec$select568 = $245 ? $246 : $spec$select544;
      $spec$select569 = $245 ? $247 : $spec$select567;
      $$1467 = $spec$select569;$$1469 = $spec$select568;
     }
     $248 = (($231) - ($234))|0;
     HEAP32[$225>>2] = $248;
     $249 = $$1469 + $$1467;
     $250 = $249 != $$1469;
     if ($250) {
      $251 = (($248) + ($$1533$lcssa))|0;
      HEAP32[$225>>2] = $251;
      $252 = ($251>>>0)>(999999999);
      if ($252) {
       $$2490638 = $225;$$5486639 = $$3484$lcssa;
       while(1) {
        $253 = ((($$2490638)) + -4|0);
        HEAP32[$$2490638>>2] = 0;
        $254 = ($253>>>0)<($$5486639>>>0);
        if ($254) {
         $255 = ((($$5486639)) + -4|0);
         HEAP32[$255>>2] = 0;
         $$6 = $255;
        } else {
         $$6 = $$5486639;
        }
        $256 = HEAP32[$253>>2]|0;
        $257 = (($256) + 1)|0;
        HEAP32[$253>>2] = $257;
        $258 = ($257>>>0)>(999999999);
        if ($258) {
         $$2490638 = $253;$$5486639 = $$6;
        } else {
         $$2490$lcssa = $253;$$5486$lcssa = $$6;
         break;
        }
       }
      } else {
       $$2490$lcssa = $225;$$5486$lcssa = $$3484$lcssa;
      }
      $259 = $$5486$lcssa;
      $260 = (($198) - ($259))|0;
      $261 = $260 >> 2;
      $262 = ($261*9)|0;
      $263 = HEAP32[$$5486$lcssa>>2]|0;
      $264 = ($263>>>0)<(10);
      if ($264) {
       $$4492 = $$2490$lcssa;$$4520 = $262;$$8 = $$5486$lcssa;
      } else {
       $$2518634 = $262;$$2534633 = 10;
       while(1) {
        $265 = ($$2534633*10)|0;
        $266 = (($$2518634) + 1)|0;
        $267 = ($263>>>0)<($265>>>0);
        if ($267) {
         $$4492 = $$2490$lcssa;$$4520 = $266;$$8 = $$5486$lcssa;
         break;
        } else {
         $$2518634 = $266;$$2534633 = $265;
        }
       }
      }
     } else {
      $$4492 = $225;$$4520 = $$1517;$$8 = $$3484$lcssa;
     }
    }
    $268 = ((($$4492)) + 4|0);
    $269 = ($$4502$lcssa>>>0)>($268>>>0);
    $spec$select547 = $269 ? $268 : $$4502$lcssa;
    $$5521 = $$4520;$$8506 = $spec$select547;$$9 = $$8;
   } else {
    $$5521 = $$1517;$$8506 = $$4502$lcssa;$$9 = $$3484$lcssa;
   }
   $270 = (0 - ($$5521))|0;
   $271 = ($$8506>>>0)>($$9>>>0);
   L109: do {
    if ($271) {
     $$9507625 = $$8506;
     while(1) {
      $273 = ((($$9507625)) + -4|0);
      $274 = HEAP32[$273>>2]|0;
      $275 = ($274|0)==(0);
      if (!($275)) {
       $$9507$lcssa = $$9507625;$$lcssa583 = 1;
       break L109;
      }
      $272 = ($273>>>0)>($$9>>>0);
      if ($272) {
       $$9507625 = $273;
      } else {
       $$9507$lcssa = $273;$$lcssa583 = 0;
       break;
      }
     }
    } else {
     $$9507$lcssa = $$8506;$$lcssa583 = 0;
    }
   } while(0);
   do {
    if ($211) {
     $not$ = $212 ^ 1;
     $276 = $not$&1;
     $spec$select548 = (($spec$select539) + ($276))|0;
     $277 = ($spec$select548|0)>($$5521|0);
     $278 = ($$5521|0)>(-5);
     $or$cond6 = $277 & $278;
     if ($or$cond6) {
      $279 = (($5) + -1)|0;
      $$neg571 = (($spec$select548) + -1)|0;
      $280 = (($$neg571) - ($$5521))|0;
      $$0479 = $279;$$2476 = $280;
     } else {
      $281 = (($5) + -2)|0;
      $282 = (($spec$select548) + -1)|0;
      $$0479 = $281;$$2476 = $282;
     }
     $283 = $4 & 8;
     $284 = ($283|0)==(0);
     if ($284) {
      if ($$lcssa583) {
       $285 = ((($$9507$lcssa)) + -4|0);
       $286 = HEAP32[$285>>2]|0;
       $287 = ($286|0)==(0);
       if ($287) {
        $$2531 = 9;
       } else {
        $288 = (($286>>>0) % 10)&-1;
        $289 = ($288|0)==(0);
        if ($289) {
         $$1530621 = 0;$$3535620 = 10;
         while(1) {
          $290 = ($$3535620*10)|0;
          $291 = (($$1530621) + 1)|0;
          $292 = (($286>>>0) % ($290>>>0))&-1;
          $293 = ($292|0)==(0);
          if ($293) {
           $$1530621 = $291;$$3535620 = $290;
          } else {
           $$2531 = $291;
           break;
          }
         }
        } else {
         $$2531 = 0;
        }
       }
      } else {
       $$2531 = 9;
      }
      $294 = $$0479 | 32;
      $295 = ($294|0)==(102);
      $296 = $$9507$lcssa;
      $297 = (($296) - ($198))|0;
      $298 = $297 >> 2;
      $299 = ($298*9)|0;
      $300 = (($299) + -9)|0;
      if ($295) {
       $301 = (($300) - ($$2531))|0;
       $302 = ($301|0)>(0);
       $spec$select549 = $302 ? $301 : 0;
       $303 = ($$2476|0)<($spec$select549|0);
       $spec$select562 = $303 ? $$2476 : $spec$select549;
       $$1480 = $$0479;$$3477 = $spec$select562;
       break;
      } else {
       $304 = (($300) + ($$5521))|0;
       $305 = (($304) - ($$2531))|0;
       $306 = ($305|0)>(0);
       $spec$select551 = $306 ? $305 : 0;
       $307 = ($$2476|0)<($spec$select551|0);
       $spec$select563 = $307 ? $$2476 : $spec$select551;
       $$1480 = $$0479;$$3477 = $spec$select563;
       break;
      }
     } else {
      $$1480 = $$0479;$$3477 = $$2476;
     }
    } else {
     $$1480 = $5;$$3477 = $spec$select539;
    }
   } while(0);
   $308 = ($$3477|0)!=(0);
   $309 = $4 >>> 3;
   $$lobit = $309 & 1;
   $310 = $308 ? 1 : $$lobit;
   $311 = $$1480 | 32;
   $312 = ($311|0)==(102);
   if ($312) {
    $313 = ($$5521|0)>(0);
    $314 = $313 ? $$5521 : 0;
    $$2515 = 0;$$pn = $314;
   } else {
    $315 = ($$5521|0)<(0);
    $316 = $315 ? $270 : $$5521;
    $317 = ($316|0)<(0);
    $318 = $317 << 31 >> 31;
    $319 = (_fmt_u($316,$318,$11)|0);
    $320 = $11;
    $321 = $319;
    $322 = (($320) - ($321))|0;
    $323 = ($322|0)<(2);
    if ($323) {
     $$1514614 = $319;
     while(1) {
      $324 = ((($$1514614)) + -1|0);
      HEAP8[$324>>0] = 48;
      $325 = $324;
      $326 = (($320) - ($325))|0;
      $327 = ($326|0)<(2);
      if ($327) {
       $$1514614 = $324;
      } else {
       $$1514$lcssa = $324;
       break;
      }
     }
    } else {
     $$1514$lcssa = $319;
    }
    $328 = $$5521 >> 31;
    $329 = $328 & 2;
    $330 = (($329) + 43)|0;
    $331 = $330&255;
    $332 = ((($$1514$lcssa)) + -1|0);
    HEAP8[$332>>0] = $331;
    $333 = $$1480&255;
    $334 = ((($$1514$lcssa)) + -2|0);
    HEAP8[$334>>0] = $333;
    $335 = $334;
    $336 = (($320) - ($335))|0;
    $$2515 = $334;$$pn = $336;
   }
   $337 = (($$0522) + 1)|0;
   $338 = (($337) + ($$3477))|0;
   $$1528 = (($338) + ($310))|0;
   $339 = (($$1528) + ($$pn))|0;
   _pad_676($0,32,$2,$339,$4);
   _out_670($0,$$0523,$$0522);
   $340 = $4 ^ 65536;
   _pad_676($0,48,$2,$339,$340);
   if ($312) {
    $341 = ($$9>>>0)>($$0498>>>0);
    $spec$select554 = $341 ? $$0498 : $$9;
    $342 = ((($8)) + 9|0);
    $343 = $342;
    $344 = ((($8)) + 8|0);
    $$5493603 = $spec$select554;
    while(1) {
     $345 = HEAP32[$$5493603>>2]|0;
     $346 = (_fmt_u($345,0,$342)|0);
     $347 = ($$5493603|0)==($spec$select554|0);
     if ($347) {
      $353 = ($346|0)==($342|0);
      if ($353) {
       HEAP8[$344>>0] = 48;
       $$1465 = $344;
      } else {
       $$1465 = $346;
      }
     } else {
      $348 = ($346>>>0)>($8>>>0);
      if ($348) {
       $349 = $346;
       $350 = (($349) - ($9))|0;
       _memset(($8|0),48,($350|0))|0;
       $$0464599 = $346;
       while(1) {
        $351 = ((($$0464599)) + -1|0);
        $352 = ($351>>>0)>($8>>>0);
        if ($352) {
         $$0464599 = $351;
        } else {
         $$1465 = $351;
         break;
        }
       }
      } else {
       $$1465 = $346;
      }
     }
     $354 = $$1465;
     $355 = (($343) - ($354))|0;
     _out_670($0,$$1465,$355);
     $356 = ((($$5493603)) + 4|0);
     $357 = ($356>>>0)>($$0498>>>0);
     if ($357) {
      break;
     } else {
      $$5493603 = $356;
     }
    }
    $$not = $308 ^ 1;
    $358 = $4 & 8;
    $359 = ($358|0)==(0);
    $or$cond556 = $359 & $$not;
    if (!($or$cond556)) {
     _out_670($0,1697,1);
    }
    $360 = ($356>>>0)<($$9507$lcssa>>>0);
    $361 = ($$3477|0)>(0);
    $362 = $360 & $361;
    if ($362) {
     $$4478594 = $$3477;$$6494593 = $356;
     while(1) {
      $363 = HEAP32[$$6494593>>2]|0;
      $364 = (_fmt_u($363,0,$342)|0);
      $365 = ($364>>>0)>($8>>>0);
      if ($365) {
       $366 = $364;
       $367 = (($366) - ($9))|0;
       _memset(($8|0),48,($367|0))|0;
       $$0463588 = $364;
       while(1) {
        $368 = ((($$0463588)) + -1|0);
        $369 = ($368>>>0)>($8>>>0);
        if ($369) {
         $$0463588 = $368;
        } else {
         $$0463$lcssa = $368;
         break;
        }
       }
      } else {
       $$0463$lcssa = $364;
      }
      $370 = ($$4478594|0)<(9);
      $371 = $370 ? $$4478594 : 9;
      _out_670($0,$$0463$lcssa,$371);
      $372 = ((($$6494593)) + 4|0);
      $373 = (($$4478594) + -9)|0;
      $374 = ($372>>>0)<($$9507$lcssa>>>0);
      $375 = ($$4478594|0)>(9);
      $376 = $374 & $375;
      if ($376) {
       $$4478594 = $373;$$6494593 = $372;
      } else {
       $$4478$lcssa = $373;
       break;
      }
     }
    } else {
     $$4478$lcssa = $$3477;
    }
    $377 = (($$4478$lcssa) + 9)|0;
    _pad_676($0,48,$377,9,0);
   } else {
    $378 = ((($$9)) + 4|0);
    $spec$select557 = $$lcssa583 ? $$9507$lcssa : $378;
    $379 = ($$9>>>0)<($spec$select557>>>0);
    $380 = ($$3477|0)>(-1);
    $381 = $379 & $380;
    if ($381) {
     $382 = ((($8)) + 9|0);
     $383 = $4 & 8;
     $384 = ($383|0)==(0);
     $385 = $382;
     $386 = (0 - ($9))|0;
     $387 = ((($8)) + 8|0);
     $$5609 = $$3477;$$7495608 = $$9;
     while(1) {
      $388 = HEAP32[$$7495608>>2]|0;
      $389 = (_fmt_u($388,0,$382)|0);
      $390 = ($389|0)==($382|0);
      if ($390) {
       HEAP8[$387>>0] = 48;
       $$0 = $387;
      } else {
       $$0 = $389;
      }
      $391 = ($$7495608|0)==($$9|0);
      do {
       if ($391) {
        $395 = ((($$0)) + 1|0);
        _out_670($0,$$0,1);
        $396 = ($$5609|0)<(1);
        $or$cond559 = $384 & $396;
        if ($or$cond559) {
         $$2 = $395;
         break;
        }
        _out_670($0,1697,1);
        $$2 = $395;
       } else {
        $392 = ($$0>>>0)>($8>>>0);
        if (!($392)) {
         $$2 = $$0;
         break;
        }
        $scevgep707 = (($$0) + ($386)|0);
        $scevgep707708 = $scevgep707;
        _memset(($8|0),48,($scevgep707708|0))|0;
        $$1604 = $$0;
        while(1) {
         $393 = ((($$1604)) + -1|0);
         $394 = ($393>>>0)>($8>>>0);
         if ($394) {
          $$1604 = $393;
         } else {
          $$2 = $393;
          break;
         }
        }
       }
      } while(0);
      $397 = $$2;
      $398 = (($385) - ($397))|0;
      $399 = ($$5609|0)>($398|0);
      $400 = $399 ? $398 : $$5609;
      _out_670($0,$$2,$400);
      $401 = (($$5609) - ($398))|0;
      $402 = ((($$7495608)) + 4|0);
      $403 = ($402>>>0)<($spec$select557>>>0);
      $404 = ($401|0)>(-1);
      $405 = $403 & $404;
      if ($405) {
       $$5609 = $401;$$7495608 = $402;
      } else {
       $$5$lcssa = $401;
       break;
      }
     }
    } else {
     $$5$lcssa = $$3477;
    }
    $406 = (($$5$lcssa) + 18)|0;
    _pad_676($0,48,$406,18,0);
    $407 = $11;
    $408 = $$2515;
    $409 = (($407) - ($408))|0;
    _out_670($0,$$2515,$409);
   }
   $410 = $4 ^ 8192;
   _pad_676($0,32,$2,$339,$410);
   $$sink755 = $339;
  }
 } while(0);
 $411 = ($$sink755|0)<($2|0);
 $$560 = $411 ? $2 : $$sink755;
 STACKTOP = sp;return ($$560|0);
}
function ___DOUBLE_BITS_677($0) {
 $0 = +$0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$1 = HEAP32[tempDoublePtr>>2]|0;
 $2 = HEAP32[tempDoublePtr+4>>2]|0;
 tempRet0 = ($2);
 return ($1|0);
}
function _frexpl($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $2 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (+_frexp($0,$1));
 return (+$2);
}
function _frexp($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $$0 = 0.0, $$016 = 0.0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0.0, $storemerge = 0, $trunc$clear = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$2 = HEAP32[tempDoublePtr>>2]|0;
 $3 = HEAP32[tempDoublePtr+4>>2]|0;
 $4 = (_bitshift64Lshr(($2|0),($3|0),52)|0);
 $5 = tempRet0;
 $6 = $4&65535;
 $trunc$clear = $6 & 2047;
 switch ($trunc$clear<<16>>16) {
 case 0:  {
  $7 = $0 != 0.0;
  if ($7) {
   $8 = $0 * 1.8446744073709552E+19;
   $9 = (+_frexp($8,$1));
   $10 = HEAP32[$1>>2]|0;
   $11 = (($10) + -64)|0;
   $$016 = $9;$storemerge = $11;
  } else {
   $$016 = $0;$storemerge = 0;
  }
  HEAP32[$1>>2] = $storemerge;
  $$0 = $$016;
  break;
 }
 case 2047:  {
  $$0 = $0;
  break;
 }
 default: {
  $12 = $4 & 2047;
  $13 = (($12) + -1022)|0;
  HEAP32[$1>>2] = $13;
  $14 = $3 & -2146435073;
  $15 = $14 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $2;HEAP32[tempDoublePtr+4>>2] = $15;$16 = +HEAPF64[tempDoublePtr>>3];
  $$0 = $16;
 }
 }
 return (+$$0);
}
function _wcrtomb($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0|0);
 do {
  if ($3) {
   $$0 = 1;
  } else {
   $4 = ($1>>>0)<(128);
   if ($4) {
    $5 = $1&255;
    HEAP8[$0>>0] = $5;
    $$0 = 1;
    break;
   }
   $6 = (___pthread_self_907()|0);
   $7 = ((($6)) + 188|0);
   $8 = HEAP32[$7>>2]|0;
   $9 = HEAP32[$8>>2]|0;
   $10 = ($9|0)==(0|0);
   if ($10) {
    $11 = $1 & -128;
    $12 = ($11|0)==(57216);
    if ($12) {
     $14 = $1&255;
     HEAP8[$0>>0] = $14;
     $$0 = 1;
     break;
    } else {
     $13 = (___errno_location()|0);
     HEAP32[$13>>2] = 84;
     $$0 = -1;
     break;
    }
   }
   $15 = ($1>>>0)<(2048);
   if ($15) {
    $16 = $1 >>> 6;
    $17 = $16 | 192;
    $18 = $17&255;
    $19 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $18;
    $20 = $1 & 63;
    $21 = $20 | 128;
    $22 = $21&255;
    HEAP8[$19>>0] = $22;
    $$0 = 2;
    break;
   }
   $23 = ($1>>>0)<(55296);
   $24 = $1 & -8192;
   $25 = ($24|0)==(57344);
   $or$cond = $23 | $25;
   if ($or$cond) {
    $26 = $1 >>> 12;
    $27 = $26 | 224;
    $28 = $27&255;
    $29 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $28;
    $30 = $1 >>> 6;
    $31 = $30 & 63;
    $32 = $31 | 128;
    $33 = $32&255;
    $34 = ((($0)) + 2|0);
    HEAP8[$29>>0] = $33;
    $35 = $1 & 63;
    $36 = $35 | 128;
    $37 = $36&255;
    HEAP8[$34>>0] = $37;
    $$0 = 3;
    break;
   }
   $38 = (($1) + -65536)|0;
   $39 = ($38>>>0)<(1048576);
   if ($39) {
    $40 = $1 >>> 18;
    $41 = $40 | 240;
    $42 = $41&255;
    $43 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $42;
    $44 = $1 >>> 12;
    $45 = $44 & 63;
    $46 = $45 | 128;
    $47 = $46&255;
    $48 = ((($0)) + 2|0);
    HEAP8[$43>>0] = $47;
    $49 = $1 >>> 6;
    $50 = $49 & 63;
    $51 = $50 | 128;
    $52 = $51&255;
    $53 = ((($0)) + 3|0);
    HEAP8[$48>>0] = $52;
    $54 = $1 & 63;
    $55 = $54 | 128;
    $56 = $55&255;
    HEAP8[$53>>0] = $56;
    $$0 = 4;
    break;
   } else {
    $57 = (___errno_location()|0);
    HEAP32[$57>>2] = 84;
    $$0 = -1;
    break;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___pthread_self_907() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___pthread_self_85() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___strerror_l($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $$115$ph = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $$016 = 0;
 while(1) {
  $2 = (1699 + ($$016)|0);
  $3 = HEAP8[$2>>0]|0;
  $4 = $3&255;
  $5 = ($4|0)==($0|0);
  if ($5) {
   label = 4;
   break;
  }
  $6 = (($$016) + 1)|0;
  $7 = ($6|0)==(87);
  if ($7) {
   $$115$ph = 87;
   label = 5;
   break;
  } else {
   $$016 = $6;
  }
 }
 if ((label|0) == 4) {
  $8 = ($$016|0)==(0);
  if ($8) {
   $$012$lcssa = 1787;
  } else {
   $$115$ph = $$016;
   label = 5;
  }
 }
 if ((label|0) == 5) {
  $$01214 = 1787;$$115 = $$115$ph;
  while(1) {
   $$113 = $$01214;
   while(1) {
    $9 = HEAP8[$$113>>0]|0;
    $10 = ($9<<24>>24)==(0);
    $11 = ((($$113)) + 1|0);
    if ($10) {
     break;
    } else {
     $$113 = $11;
    }
   }
   $12 = (($$115) + -1)|0;
   $13 = ($12|0)==(0);
   if ($13) {
    $$012$lcssa = $11;
    break;
   } else {
    $$01214 = $11;$$115 = $12;
   }
  }
 }
 $14 = ((($1)) + 20|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (___lctrans($$012$lcssa,$15)|0);
 return ($16|0);
}
function ___lctrans($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (___lctrans_impl($0,$1)|0);
 return ($2|0);
}
function _printf($0,$varargs) {
 $0 = $0|0;
 $varargs = $varargs|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 HEAP32[$1>>2] = $varargs;
 $2 = HEAP32[105]|0;
 $3 = (_vfprintf($2,$0,$1)|0);
 STACKTOP = sp;return ($3|0);
}
function _fputc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($1)) + 76|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)<(0);
 if ($4) {
  label = 3;
 } else {
  $5 = (___lockfile($1)|0);
  $6 = ($5|0)==(0);
  if ($6) {
   label = 3;
  } else {
   $20 = $0&255;
   $21 = $0 & 255;
   $22 = ((($1)) + 75|0);
   $23 = HEAP8[$22>>0]|0;
   $24 = $23 << 24 >> 24;
   $25 = ($21|0)==($24|0);
   if ($25) {
    label = 10;
   } else {
    $26 = ((($1)) + 20|0);
    $27 = HEAP32[$26>>2]|0;
    $28 = ((($1)) + 16|0);
    $29 = HEAP32[$28>>2]|0;
    $30 = ($27>>>0)<($29>>>0);
    if ($30) {
     $31 = ((($27)) + 1|0);
     HEAP32[$26>>2] = $31;
     HEAP8[$27>>0] = $20;
     $33 = $21;
    } else {
     label = 10;
    }
   }
   if ((label|0) == 10) {
    $32 = (___overflow($1,$0)|0);
    $33 = $32;
   }
   ___unlockfile($1);
   $$0 = $33;
  }
 }
 do {
  if ((label|0) == 3) {
   $7 = $0&255;
   $8 = $0 & 255;
   $9 = ((($1)) + 75|0);
   $10 = HEAP8[$9>>0]|0;
   $11 = $10 << 24 >> 24;
   $12 = ($8|0)==($11|0);
   if (!($12)) {
    $13 = ((($1)) + 20|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ((($1)) + 16|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($14>>>0)<($16>>>0);
    if ($17) {
     $18 = ((($14)) + 1|0);
     HEAP32[$13>>2] = $18;
     HEAP8[$14>>0] = $7;
     $$0 = $8;
     break;
    }
   }
   $19 = (___overflow($1,$0)|0);
   $$0 = $19;
  }
 } while(0);
 return ($$0|0);
}
function __Znwj($0) {
 $0 = $0|0;
 var $$lcssa = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $spec$store$select = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0);
 $spec$store$select = $1 ? 1 : $0;
 while(1) {
  $2 = (_malloc($spec$store$select)|0);
  $3 = ($2|0)==(0|0);
  if (!($3)) {
   $$lcssa = $2;
   break;
  }
  $4 = (__ZSt15get_new_handlerv()|0);
  $5 = ($4|0)==(0|0);
  if ($5) {
   $$lcssa = 0;
   break;
  }
  FUNCTION_TABLE_v[$4 & 63]();
 }
 return ($$lcssa|0);
}
function __Znaj($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (__Znwj($0)|0);
 return ($1|0);
}
function __ZdlPv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($0);
 return;
}
function __ZdaPv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZdlPv($0);
 return;
}
function __ZNSt3__218__libcpp_refstringC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (_strlen($1)|0);
 $3 = (($2) + 13)|0;
 $4 = (__Znwj($3)|0);
 HEAP32[$4>>2] = $2;
 $5 = ((($4)) + 4|0);
 HEAP32[$5>>2] = $2;
 $6 = ((($4)) + 8|0);
 HEAP32[$6>>2] = 0;
 $7 = (__ZNSt3__215__refstring_imp12_GLOBAL__N_113data_from_repEPNS1_9_Rep_baseE($4)|0);
 $8 = (($2) + 1)|0;
 _memcpy(($7|0),($1|0),($8|0))|0;
 HEAP32[$0>>2] = $7;
 return;
}
function __ZNSt3__215__refstring_imp12_GLOBAL__N_113data_from_repEPNS1_9_Rep_baseE($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 12|0);
 return ($1|0);
}
function __ZNSt11logic_errorC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (888);
 $2 = ((($0)) + 4|0);
 __ZNSt3__218__libcpp_refstringC2EPKc($2,$1);
 return;
}
function __ZNKSt3__218__libcpp_refstring15__uses_refcountEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 1;
}
function __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _abort();
 // unreachable;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, $vararg_ptr1 = 0;
 var $vararg_ptr2 = 0, $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer10 = sp + 32|0;
 $vararg_buffer7 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $0 = sp + 36|0;
 $1 = (___cxa_get_globals_fast()|0);
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = HEAP32[$1>>2]|0;
  $4 = ($3|0)==(0|0);
  if (!($4)) {
   $5 = ((($3)) + 80|0);
   $6 = ((($3)) + 48|0);
   $7 = $6;
   $8 = $7;
   $9 = HEAP32[$8>>2]|0;
   $10 = (($7) + 4)|0;
   $11 = $10;
   $12 = HEAP32[$11>>2]|0;
   $13 = $9 & -256;
   $14 = ($13|0)==(1126902528);
   $15 = ($12|0)==(1129074247);
   $16 = $14 & $15;
   if (!($16)) {
    HEAP32[$vararg_buffer7>>2] = 3727;
    _abort_message(3677,$vararg_buffer7);
    // unreachable;
   }
   $17 = ($9|0)==(1126902529);
   $18 = ($12|0)==(1129074247);
   $19 = $17 & $18;
   if ($19) {
    $20 = ((($3)) + 44|0);
    $21 = HEAP32[$20>>2]|0;
    $22 = $21;
   } else {
    $22 = $5;
   }
   HEAP32[$0>>2] = $22;
   $23 = HEAP32[$3>>2]|0;
   $24 = ((($23)) + 4|0);
   $25 = HEAP32[$24>>2]|0;
   $26 = HEAP32[18]|0;
   $27 = ((($26)) + 16|0);
   $28 = HEAP32[$27>>2]|0;
   $29 = (FUNCTION_TABLE_iiii[$28 & 31](72,$23,$0)|0);
   if ($29) {
    $30 = HEAP32[$0>>2]|0;
    $31 = HEAP32[$30>>2]|0;
    $32 = ((($31)) + 8|0);
    $33 = HEAP32[$32>>2]|0;
    $34 = (FUNCTION_TABLE_ii[$33 & 63]($30)|0);
    HEAP32[$vararg_buffer>>2] = 3727;
    $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
    HEAP32[$vararg_ptr1>>2] = $25;
    $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
    HEAP32[$vararg_ptr2>>2] = $34;
    _abort_message(3591,$vararg_buffer);
    // unreachable;
   } else {
    HEAP32[$vararg_buffer3>>2] = 3727;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $25;
    _abort_message(3636,$vararg_buffer3);
    // unreachable;
   }
  }
 }
 _abort_message(3715,$vararg_buffer10);
 // unreachable;
}
function ___cxa_get_globals_fast() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $0 = (_pthread_once((4744|0),(35|0))|0);
 $1 = ($0|0)==(0);
 if ($1) {
  $2 = HEAP32[1187]|0;
  $3 = (_pthread_getspecific(($2|0))|0);
  STACKTOP = sp;return ($3|0);
 } else {
  _abort_message(3866,$vararg_buffer);
  // unreachable;
 }
 return (0)|0;
}
function _abort_message($0,$varargs) {
 $0 = $0|0;
 $varargs = $varargs|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 HEAP32[$1>>2] = $varargs;
 $2 = HEAP32[73]|0;
 (_vfprintf($2,$0,$1)|0);
 (_fputc(10,$2)|0);
 _abort();
 // unreachable;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$2 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $3 = sp;
 $4 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$1,0)|0);
 if ($4) {
  $$2 = 1;
 } else {
  $5 = ($1|0)==(0|0);
  if ($5) {
   $$2 = 0;
  } else {
   $6 = (___dynamic_cast($1,96,80,0)|0);
   $7 = ($6|0)==(0|0);
   if ($7) {
    $$2 = 0;
   } else {
    $8 = ((($3)) + 4|0);
    dest=$8; stop=dest+52|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
    HEAP32[$3>>2] = $6;
    $9 = ((($3)) + 8|0);
    HEAP32[$9>>2] = $0;
    $10 = ((($3)) + 12|0);
    HEAP32[$10>>2] = -1;
    $11 = ((($3)) + 48|0);
    HEAP32[$11>>2] = 1;
    $12 = HEAP32[$6>>2]|0;
    $13 = ((($12)) + 28|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = HEAP32[$2>>2]|0;
    FUNCTION_TABLE_viiii[$14 & 31]($6,$3,$15,1);
    $16 = ((($3)) + 24|0);
    $17 = HEAP32[$16>>2]|0;
    $18 = ($17|0)==(1);
    if ($18) {
     $19 = ((($3)) + 16|0);
     $20 = HEAP32[$19>>2]|0;
     HEAP32[$2>>2] = $20;
     $$0 = 1;
    } else {
     $$0 = 0;
    }
    $$2 = $$0;
   }
  }
 }
 STACKTOP = sp;return ($$2|0);
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$7,$5)|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$6,$4)|0);
 do {
  if ($7) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$1,$2,$3);
  } else {
   $8 = HEAP32[$1>>2]|0;
   $9 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$8,$4)|0);
   if ($9) {
    $10 = ((($1)) + 16|0);
    $11 = HEAP32[$10>>2]|0;
    $12 = ($11|0)==($2|0);
    if (!($12)) {
     $13 = ((($1)) + 20|0);
     $14 = HEAP32[$13>>2]|0;
     $15 = ($14|0)==($2|0);
     if (!($15)) {
      $18 = ((($1)) + 32|0);
      HEAP32[$18>>2] = $3;
      HEAP32[$13>>2] = $2;
      $19 = ((($1)) + 40|0);
      $20 = HEAP32[$19>>2]|0;
      $21 = (($20) + 1)|0;
      HEAP32[$19>>2] = $21;
      $22 = ((($1)) + 36|0);
      $23 = HEAP32[$22>>2]|0;
      $24 = ($23|0)==(1);
      if ($24) {
       $25 = ((($1)) + 24|0);
       $26 = HEAP32[$25>>2]|0;
       $27 = ($26|0)==(2);
       if ($27) {
        $28 = ((($1)) + 54|0);
        HEAP8[$28>>0] = 1;
       }
      }
      $29 = ((($1)) + 44|0);
      HEAP32[$29>>2] = 4;
      break;
     }
    }
    $16 = ($3|0)==(1);
    if ($16) {
     $17 = ((($1)) + 32|0);
     HEAP32[$17>>2] = 1;
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$5,0)|0);
 if ($6) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
 }
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==($1|0);
 return ($3|0);
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 do {
  if ($6) {
   HEAP32[$4>>2] = $2;
   $7 = ((($1)) + 24|0);
   HEAP32[$7>>2] = $3;
   $8 = ((($1)) + 36|0);
   HEAP32[$8>>2] = 1;
  } else {
   $9 = ($5|0)==($2|0);
   if (!($9)) {
    $13 = ((($1)) + 36|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = (($14) + 1)|0;
    HEAP32[$13>>2] = $15;
    $16 = ((($1)) + 24|0);
    HEAP32[$16>>2] = 2;
    $17 = ((($1)) + 54|0);
    HEAP8[$17>>0] = 1;
    break;
   }
   $10 = ((($1)) + 24|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==(2);
   if ($12) {
    HEAP32[$10>>2] = $3;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==($2|0);
 if ($6) {
  $7 = ((($1)) + 28|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = ($8|0)==(1);
  if (!($9)) {
   HEAP32[$7>>2] = $3;
  }
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond22 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 53|0);
 HEAP8[$5>>0] = 1;
 $6 = ((($1)) + 4|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)==($3|0);
 do {
  if ($8) {
   $9 = ((($1)) + 52|0);
   HEAP8[$9>>0] = 1;
   $10 = ((($1)) + 16|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==(0|0);
   if ($12) {
    HEAP32[$10>>2] = $2;
    $13 = ((($1)) + 24|0);
    HEAP32[$13>>2] = $4;
    $14 = ((($1)) + 36|0);
    HEAP32[$14>>2] = 1;
    $15 = ((($1)) + 48|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($16|0)==(1);
    $18 = ($4|0)==(1);
    $or$cond = $18 & $17;
    if (!($or$cond)) {
     break;
    }
    $19 = ((($1)) + 54|0);
    HEAP8[$19>>0] = 1;
    break;
   }
   $20 = ($11|0)==($2|0);
   if (!($20)) {
    $30 = ((($1)) + 36|0);
    $31 = HEAP32[$30>>2]|0;
    $32 = (($31) + 1)|0;
    HEAP32[$30>>2] = $32;
    $33 = ((($1)) + 54|0);
    HEAP8[$33>>0] = 1;
    break;
   }
   $21 = ((($1)) + 24|0);
   $22 = HEAP32[$21>>2]|0;
   $23 = ($22|0)==(2);
   if ($23) {
    HEAP32[$21>>2] = $4;
    $28 = $4;
   } else {
    $28 = $22;
   }
   $24 = ((($1)) + 48|0);
   $25 = HEAP32[$24>>2]|0;
   $26 = ($25|0)==(1);
   $27 = ($28|0)==(1);
   $or$cond22 = $26 & $27;
   if ($or$cond22) {
    $29 = ((($1)) + 54|0);
    HEAP8[$29>>0] = 1;
   }
  }
 } while(0);
 return;
}
function ___dynamic_cast($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond28 = 0, $or$cond30 = 0, $or$cond32 = 0, $spec$select = 0, $spec$select33 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $4 = sp;
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + -8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (($0) + ($7)|0);
 $9 = ((($5)) + -4|0);
 $10 = HEAP32[$9>>2]|0;
 HEAP32[$4>>2] = $2;
 $11 = ((($4)) + 4|0);
 HEAP32[$11>>2] = $0;
 $12 = ((($4)) + 8|0);
 HEAP32[$12>>2] = $1;
 $13 = ((($4)) + 12|0);
 HEAP32[$13>>2] = $3;
 $14 = ((($4)) + 16|0);
 $15 = ((($4)) + 20|0);
 $16 = ((($4)) + 24|0);
 $17 = ((($4)) + 28|0);
 $18 = ((($4)) + 32|0);
 $19 = ((($4)) + 40|0);
 dest=$14; stop=dest+36|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));HEAP16[$14+36>>1]=0|0;HEAP8[$14+38>>0]=0|0;
 $20 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10,$2,0)|0);
 L1: do {
  if ($20) {
   $21 = ((($4)) + 48|0);
   HEAP32[$21>>2] = 1;
   $22 = HEAP32[$10>>2]|0;
   $23 = ((($22)) + 20|0);
   $24 = HEAP32[$23>>2]|0;
   FUNCTION_TABLE_viiiiii[$24 & 31]($10,$4,$8,$8,1,0);
   $25 = HEAP32[$16>>2]|0;
   $26 = ($25|0)==(1);
   $spec$select = $26 ? $8 : 0;
   $$0 = $spec$select;
  } else {
   $27 = ((($4)) + 36|0);
   $28 = HEAP32[$10>>2]|0;
   $29 = ((($28)) + 24|0);
   $30 = HEAP32[$29>>2]|0;
   FUNCTION_TABLE_viiiii[$30 & 31]($10,$4,$8,1,0);
   $31 = HEAP32[$27>>2]|0;
   switch ($31|0) {
   case 0:  {
    $32 = HEAP32[$19>>2]|0;
    $33 = ($32|0)==(1);
    $34 = HEAP32[$17>>2]|0;
    $35 = ($34|0)==(1);
    $or$cond = $33 & $35;
    $36 = HEAP32[$18>>2]|0;
    $37 = ($36|0)==(1);
    $or$cond28 = $or$cond & $37;
    $38 = HEAP32[$15>>2]|0;
    $spec$select33 = $or$cond28 ? $38 : 0;
    $$0 = $spec$select33;
    break L1;
    break;
   }
   case 1:  {
    break;
   }
   default: {
    $$0 = 0;
    break L1;
   }
   }
   $39 = HEAP32[$16>>2]|0;
   $40 = ($39|0)==(1);
   if (!($40)) {
    $41 = HEAP32[$19>>2]|0;
    $42 = ($41|0)==(0);
    $43 = HEAP32[$17>>2]|0;
    $44 = ($43|0)==(1);
    $or$cond30 = $42 & $44;
    $45 = HEAP32[$18>>2]|0;
    $46 = ($45|0)==(1);
    $or$cond32 = $or$cond30 & $46;
    if (!($or$cond32)) {
     $$0 = 0;
     break;
    }
   }
   $47 = HEAP32[$14>>2]|0;
   $$0 = $47;
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$7,$5)|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 } else {
  $9 = ((($0)) + 8|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($11)) + 20|0);
  $13 = HEAP32[$12>>2]|0;
  FUNCTION_TABLE_viiiiii[$13 & 31]($10,$1,$2,$3,$4,$5);
 }
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$037$off038 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$6,$4)|0);
 do {
  if ($7) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$1,$2,$3);
  } else {
   $8 = HEAP32[$1>>2]|0;
   $9 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$8,$4)|0);
   if (!($9)) {
    $44 = ((($0)) + 8|0);
    $45 = HEAP32[$44>>2]|0;
    $46 = HEAP32[$45>>2]|0;
    $47 = ((($46)) + 24|0);
    $48 = HEAP32[$47>>2]|0;
    FUNCTION_TABLE_viiiii[$48 & 31]($45,$1,$2,$3,$4);
    break;
   }
   $10 = ((($1)) + 16|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==($2|0);
   if (!($12)) {
    $13 = ((($1)) + 20|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ($14|0)==($2|0);
    if (!($15)) {
     $18 = ((($1)) + 32|0);
     HEAP32[$18>>2] = $3;
     $19 = ((($1)) + 44|0);
     $20 = HEAP32[$19>>2]|0;
     $21 = ($20|0)==(4);
     if ($21) {
      break;
     }
     $22 = ((($1)) + 52|0);
     HEAP8[$22>>0] = 0;
     $23 = ((($1)) + 53|0);
     HEAP8[$23>>0] = 0;
     $24 = ((($0)) + 8|0);
     $25 = HEAP32[$24>>2]|0;
     $26 = HEAP32[$25>>2]|0;
     $27 = ((($26)) + 20|0);
     $28 = HEAP32[$27>>2]|0;
     FUNCTION_TABLE_viiiiii[$28 & 31]($25,$1,$2,$2,1,$4);
     $29 = HEAP8[$23>>0]|0;
     $30 = ($29<<24>>24)==(0);
     if ($30) {
      $$037$off038 = 0;
      label = 11;
     } else {
      $31 = HEAP8[$22>>0]|0;
      $32 = ($31<<24>>24)==(0);
      if ($32) {
       $$037$off038 = 1;
       label = 11;
      } else {
       label = 15;
      }
     }
     do {
      if ((label|0) == 11) {
       HEAP32[$13>>2] = $2;
       $33 = ((($1)) + 40|0);
       $34 = HEAP32[$33>>2]|0;
       $35 = (($34) + 1)|0;
       HEAP32[$33>>2] = $35;
       $36 = ((($1)) + 36|0);
       $37 = HEAP32[$36>>2]|0;
       $38 = ($37|0)==(1);
       if ($38) {
        $39 = ((($1)) + 24|0);
        $40 = HEAP32[$39>>2]|0;
        $41 = ($40|0)==(2);
        if ($41) {
         $42 = ((($1)) + 54|0);
         HEAP8[$42>>0] = 1;
         if ($$037$off038) {
          label = 15;
          break;
         } else {
          $43 = 4;
          break;
         }
        }
       }
       if ($$037$off038) {
        label = 15;
       } else {
        $43 = 4;
       }
      }
     } while(0);
     if ((label|0) == 15) {
      $43 = 3;
     }
     HEAP32[$19>>2] = $43;
     break;
    }
   }
   $16 = ($3|0)==(1);
   if ($16) {
    $17 = ((($1)) + 32|0);
    HEAP32[$17>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$5,0)|0);
 if ($6) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
 } else {
  $7 = ((($0)) + 8|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = HEAP32[$8>>2]|0;
  $10 = ((($9)) + 28|0);
  $11 = HEAP32[$10>>2]|0;
  FUNCTION_TABLE_viiii[$11 & 31]($8,$1,$2,$3);
 }
 return;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var $0 = 0, $1 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $0 = (_pthread_key_create((4748|0),(36|0))|0);
 $1 = ($0|0)==(0);
 if ($1) {
  STACKTOP = sp;return;
 } else {
  _abort_message(3915,$vararg_buffer);
  // unreachable;
 }
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 _free($0);
 $1 = HEAP32[1187]|0;
 $2 = (_pthread_setspecific(($1|0),(0|0))|0);
 $3 = ($2|0)==(0);
 if ($3) {
  STACKTOP = sp;return;
 } else {
  _abort_message(3965,$vararg_buffer);
  // unreachable;
 }
}
function __ZSt9terminatev() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (___cxa_get_globals_fast()|0);
 $1 = ($0|0)==(0|0);
 if (!($1)) {
  $2 = HEAP32[$0>>2]|0;
  $3 = ($2|0)==(0|0);
  if (!($3)) {
   $4 = ((($2)) + 48|0);
   $5 = $4;
   $6 = $5;
   $7 = HEAP32[$6>>2]|0;
   $8 = (($5) + 4)|0;
   $9 = $8;
   $10 = HEAP32[$9>>2]|0;
   $11 = $7 & -256;
   $12 = ($11|0)==(1126902528);
   $13 = ($10|0)==(1129074247);
   $14 = $12 & $13;
   if ($14) {
    $15 = ((($2)) + 12|0);
    $16 = HEAP32[$15>>2]|0;
    __ZSt11__terminatePFvvE($16);
    // unreachable;
   }
  }
 }
 $17 = (__ZSt13get_terminatev()|0);
 __ZSt11__terminatePFvvE($17);
 // unreachable;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0|0;
 var $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 FUNCTION_TABLE_v[$0 & 63]();
 _abort_message(4018,$vararg_buffer);
 // unreachable;
}
function __ZSt13get_terminatev() {
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[199]|0;
 $1 = (($0) + 0)|0;
 HEAP32[199] = $1;
 $2 = $0;
 return ($2|0);
}
function __ZNSt9exceptionD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt11logic_errorD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (888);
 $1 = ((($0)) + 4|0);
 __ZNSt3__218__libcpp_refstringD2Ev($1);
 return;
}
function __ZNSt11logic_errorD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt11logic_errorD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNKSt11logic_error4whatEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = (__ZNKSt3__218__libcpp_refstring5c_strEv($1)|0);
 return ($2|0);
}
function __ZNKSt3__218__libcpp_refstring5c_strEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 return ($1|0);
}
function __ZNSt3__218__libcpp_refstringD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (__ZNKSt3__218__libcpp_refstring15__uses_refcountEv($0)|0);
 if ($1) {
  $2 = HEAP32[$0>>2]|0;
  $3 = (__ZNSt3__215__refstring_imp12_GLOBAL__N_113rep_from_dataEPKc_49($2)|0);
  $4 = ((($3)) + 8|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = (($5) + -1)|0;
  HEAP32[$4>>2] = $6;
  $7 = (($5) + -1)|0;
  $8 = ($7|0)<(0);
  if ($8) {
   __ZdlPv($3);
  }
 }
 return;
}
function __ZNSt3__215__refstring_imp12_GLOBAL__N_113rep_from_dataEPKc_49($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + -12|0);
 return ($1|0);
}
function __ZNSt12length_errorD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt11logic_errorD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZSt15get_new_handlerv() {
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[1188]|0;
 $1 = (($0) + 0)|0;
 HEAP32[1188] = $1;
 $2 = $0;
 return ($2|0);
}
function ___cxa_can_catch($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = sp;
 $4 = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $4;
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + 16|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (FUNCTION_TABLE_iiii[$7 & 31]($0,$1,$3)|0);
 $9 = $8&1;
 if ($8) {
  $10 = HEAP32[$3>>2]|0;
  HEAP32[$2>>2] = $10;
 }
 STACKTOP = sp;return ($9|0);
}
function ___cxa_is_pointer_type($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $phitmp = 0, $phitmp1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $3 = 0;
 } else {
  $2 = (___dynamic_cast($0,96,184,0)|0);
  $phitmp = ($2|0)!=(0|0);
  $phitmp1 = $phitmp&1;
  $3 = $phitmp1;
 }
 return ($3|0);
}
function runPostSets() {
}
function ___muldsi3($a, $b) {
    $a = $a | 0;
    $b = $b | 0;
    var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
    $1 = $a & 65535;
    $2 = $b & 65535;
    $3 = Math_imul($2, $1) | 0;
    $6 = $a >>> 16;
    $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0;
    $11 = $b >>> 16;
    $12 = Math_imul($11, $1) | 0;
    return (tempRet0 = (($8 >>> 16) + (Math_imul($11, $6) | 0) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, 0 | ($8 + $12 << 16 | $3 & 65535)) | 0;
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0, $2 = 0;
    $x_sroa_0_0_extract_trunc = $a$0;
    $y_sroa_0_0_extract_trunc = $b$0;
    $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0;
    $1$1 = tempRet0;
    $2 = Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0;
    return (tempRet0 = ((Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $2 | 0) + $1$1 | $1$1 & 0, 0 | $1$0 & -1) | 0;
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _llvm_cttz_i32(x) { // Note: Currently doesn't take isZeroUndef()
    x = x | 0;
    return (x ? (31 - (Math_clz32((x ^ (x - 1))) | 0) | 0) : 32) | 0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    $rem = $rem | 0;
    var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
    $n_sroa_0_0_extract_trunc = $a$0;
    $n_sroa_1_4_extract_shift$0 = $a$1;
    $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
    $d_sroa_0_0_extract_trunc = $b$0;
    $d_sroa_1_4_extract_shift$0 = $b$1;
    $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
    if (($n_sroa_1_4_extract_trunc | 0) == 0) {
      $4 = ($rem | 0) != 0;
      if (($d_sroa_1_4_extract_trunc | 0) == 0) {
        if ($4) {
          HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$4) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
    $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
    do {
      if (($d_sroa_0_0_extract_trunc | 0) == 0) {
        if ($17) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
            HEAP32[$rem + 4 >> 2] = 0;
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        if (($n_sroa_0_0_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0;
            HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
        if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0 | $a$0 & -1;
            HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
          }
          $_0$1 = 0;
          $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($51 >>> 0 <= 30) {
          $57 = $51 + 1 | 0;
          $58 = 31 - $51 | 0;
          $sr_1_ph = $57;
          $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$17) {
          $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
          $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          if ($119 >>> 0 <= 31) {
            $125 = $119 + 1 | 0;
            $126 = 31 - $119 | 0;
            $130 = $119 - 31 >> 31;
            $sr_1_ph = $125;
            $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
            $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
            $q_sroa_0_1_ph = 0;
            $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
            break;
          }
          if (($rem | 0) == 0) {
            $_0$1 = 0;
            $_0$0 = 0;
            return (tempRet0 = $_0$1, $_0$0) | 0;
          }
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
        if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
          $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
          $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          $89 = 64 - $88 | 0;
          $91 = 32 - $88 | 0;
          $92 = $91 >> 31;
          $95 = $88 - 32 | 0;
          $105 = $95 >> 31;
          $sr_1_ph = $88;
          $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
          $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
          $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
          $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
          break;
        }
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
          HEAP32[$rem + 4 >> 2] = 0;
        }
        if (($d_sroa_0_0_extract_trunc | 0) == 1) {
          $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$0 = 0 | $a$0 & -1;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        } else {
          $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
          $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
          $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
      }
    } while (0);
    if (($sr_1_ph | 0) == 0) {
      $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
      $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
      $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
      $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = 0;
    } else {
      $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
      $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
      $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
      $137$1 = tempRet0;
      $q_sroa_1_1198 = $q_sroa_1_1_ph;
      $q_sroa_0_1199 = $q_sroa_0_1_ph;
      $r_sroa_1_1200 = $r_sroa_1_1_ph;
      $r_sroa_0_1201 = $r_sroa_0_1_ph;
      $sr_1202 = $sr_1_ph;
      $carry_0203 = 0;
      while (1) {
        $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
        $149 = $carry_0203 | $q_sroa_0_1199 << 1;
        $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
        $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
        _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
        $150$1 = tempRet0;
        $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
        $152 = $151$0 & 1;
        $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
        $r_sroa_0_0_extract_trunc = $154$0;
        $r_sroa_1_4_extract_trunc = tempRet0;
        $155 = $sr_1202 - 1 | 0;
        if (($155 | 0) == 0) {
          break;
        } else {
          $q_sroa_1_1198 = $147;
          $q_sroa_0_1199 = $149;
          $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
          $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
          $sr_1202 = $155;
          $carry_0203 = $152;
        }
      }
      $q_sroa_1_1_lcssa = $147;
      $q_sroa_0_1_lcssa = $149;
      $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
      $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = $152;
    }
    $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
    $q_sroa_0_0_insert_ext75$1 = 0;
    $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
    if (($rem | 0) != 0) {
      HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
      HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
    }
    $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
    $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $1$0 = 0;
    $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
    return $1$0 | 0;
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function _llvm_bswap_i32(x) {
    x = x|0;
    return (((x&0xff)<<24) | (((x>>8)&0xff)<<16) | (((x>>16)&0xff)<<8) | (x>>>24))|0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    var aligned_dest_end = 0;
    var block_aligned_dest_end = 0;
    var dest_end = 0;
    // Test against a benchmarked cutoff limit for when HEAPU8.set() becomes faster to use.
    if ((num|0) >=
      8192
    ) {
      return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    }

    ret = dest|0;
    dest_end = (dest + num)|0;
    if ((dest&3) == (src&3)) {
      // The initial unaligned < 4-byte front.
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      aligned_dest_end = (dest_end & -4)|0;
      block_aligned_dest_end = (aligned_dest_end - 64)|0;
      while ((dest|0) <= (block_aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        HEAP32[(((dest)+(4))>>2)]=((HEAP32[(((src)+(4))>>2)])|0);
        HEAP32[(((dest)+(8))>>2)]=((HEAP32[(((src)+(8))>>2)])|0);
        HEAP32[(((dest)+(12))>>2)]=((HEAP32[(((src)+(12))>>2)])|0);
        HEAP32[(((dest)+(16))>>2)]=((HEAP32[(((src)+(16))>>2)])|0);
        HEAP32[(((dest)+(20))>>2)]=((HEAP32[(((src)+(20))>>2)])|0);
        HEAP32[(((dest)+(24))>>2)]=((HEAP32[(((src)+(24))>>2)])|0);
        HEAP32[(((dest)+(28))>>2)]=((HEAP32[(((src)+(28))>>2)])|0);
        HEAP32[(((dest)+(32))>>2)]=((HEAP32[(((src)+(32))>>2)])|0);
        HEAP32[(((dest)+(36))>>2)]=((HEAP32[(((src)+(36))>>2)])|0);
        HEAP32[(((dest)+(40))>>2)]=((HEAP32[(((src)+(40))>>2)])|0);
        HEAP32[(((dest)+(44))>>2)]=((HEAP32[(((src)+(44))>>2)])|0);
        HEAP32[(((dest)+(48))>>2)]=((HEAP32[(((src)+(48))>>2)])|0);
        HEAP32[(((dest)+(52))>>2)]=((HEAP32[(((src)+(52))>>2)])|0);
        HEAP32[(((dest)+(56))>>2)]=((HEAP32[(((src)+(56))>>2)])|0);
        HEAP32[(((dest)+(60))>>2)]=((HEAP32[(((src)+(60))>>2)])|0);
        dest = (dest+64)|0;
        src = (src+64)|0;
      }
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    } else {
      // In the unaligned copy case, unroll a bit as well.
      aligned_dest_end = (dest_end - 4)|0;
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        HEAP8[(((dest)+(1))>>0)]=((HEAP8[(((src)+(1))>>0)])|0);
        HEAP8[(((dest)+(2))>>0)]=((HEAP8[(((src)+(2))>>0)])|0);
        HEAP8[(((dest)+(3))>>0)]=((HEAP8[(((src)+(3))>>0)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    }
    // The remaining unaligned < 4 byte tail.
    while ((dest|0) < (dest_end|0)) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
    }
    return ret|0;
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
    end = (ptr + num)|0;

    value = value & 0xff;
    if ((num|0) >= 67 /* 64 bytes for an unrolled loop + 3 bytes for unaligned head*/) {
      while ((ptr&3) != 0) {
        HEAP8[((ptr)>>0)]=value;
        ptr = (ptr+1)|0;
      }

      aligned_end = (end & -4)|0;
      block_aligned_end = (aligned_end - 64)|0;
      value4 = value | (value << 8) | (value << 16) | (value << 24);

      while((ptr|0) <= (block_aligned_end|0)) {
        HEAP32[((ptr)>>2)]=value4;
        HEAP32[(((ptr)+(4))>>2)]=value4;
        HEAP32[(((ptr)+(8))>>2)]=value4;
        HEAP32[(((ptr)+(12))>>2)]=value4;
        HEAP32[(((ptr)+(16))>>2)]=value4;
        HEAP32[(((ptr)+(20))>>2)]=value4;
        HEAP32[(((ptr)+(24))>>2)]=value4;
        HEAP32[(((ptr)+(28))>>2)]=value4;
        HEAP32[(((ptr)+(32))>>2)]=value4;
        HEAP32[(((ptr)+(36))>>2)]=value4;
        HEAP32[(((ptr)+(40))>>2)]=value4;
        HEAP32[(((ptr)+(44))>>2)]=value4;
        HEAP32[(((ptr)+(48))>>2)]=value4;
        HEAP32[(((ptr)+(52))>>2)]=value4;
        HEAP32[(((ptr)+(56))>>2)]=value4;
        HEAP32[(((ptr)+(60))>>2)]=value4;
        ptr = (ptr + 64)|0;
      }

      while ((ptr|0) < (aligned_end|0) ) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    // The remaining bytes.
    while ((ptr|0) < (end|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (end-num)|0;
}
function _sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    oldDynamicTop = HEAP32[DYNAMICTOP_PTR>>2]|0;
    newDynamicTop = oldDynamicTop + increment | 0;

    if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
      | (newDynamicTop|0) < 0) { // Also underflow, sbrk() should be able to be used to subtract.
      abortOnCannotGrowMemory()|0;
      ___setErrNo(12);
      return -1;
    }

    HEAP32[DYNAMICTOP_PTR>>2] = newDynamicTop;
    totalMemory = getTotalMemory()|0;
    if ((newDynamicTop|0) > (totalMemory|0)) {
      if ((enlargeMemory()|0) == 0) {
        HEAP32[DYNAMICTOP_PTR>>2] = oldDynamicTop;
        ___setErrNo(12);
        return -1;
      }
    }
    return oldDynamicTop|0;
}

  
function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&63](a1|0)|0;
}


function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&31](a1|0,a2|0,a3|0)|0;
}


function dynCall_v(index) {
  index = index|0;
  
  FUNCTION_TABLE_v[index&63]();
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&63](a1|0);
}


function dynCall_viiii(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0;
  FUNCTION_TABLE_viiii[index&31](a1|0,a2|0,a3|0,a4|0);
}


function dynCall_viiiii(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0;
  FUNCTION_TABLE_viiiii[index&31](a1|0,a2|0,a3|0,a4|0,a5|0);
}


function dynCall_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0;
  FUNCTION_TABLE_viiiiii[index&31](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0);
}

function b0(p0) {
 p0 = p0|0; nullFunc_ii(0);return 0;
}
function b1(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(1);return 0;
}
function b2() {
 ; nullFunc_v(2);
}
function ___cxa_pure_virtual__wrapper() {
 ; ___cxa_pure_virtual();
}
function b3(p0) {
 p0 = p0|0; nullFunc_vi(3);
}
function b4(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; nullFunc_viiii(4);
}
function b5(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; nullFunc_viiiii(5);
}
function b6(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; nullFunc_viiiiii(6);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,___stdio_close,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,__ZNKSt11logic_error4whatEv,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0];
var FUNCTION_TABLE_iiii = [b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,___stdio_write,___stdio_seek,___stdout_write,b1,b1,b1,b1,b1,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b1,b1,b1,b1,b1
,b1,b1,b1];
var FUNCTION_TABLE_v = [b2,b2,b2,b2,b2,b2,b2,___cxa_pure_virtual__wrapper,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,__ZL25default_terminate_handlerv,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2];
var FUNCTION_TABLE_vi = [b3,__ZN8DenseCRFD2Ev,__ZN8DenseCRFD0Ev,__ZN10DenseCRF2DD2Ev,__ZN10DenseCRF2DD0Ev,__ZN17PairwisePotentialD2Ev,__ZN17PairwisePotentialD0Ev,b3,__ZN19SemiMetricPotentialD2Ev,__ZN19SemiMetricPotentialD0Ev,b3,__ZN14PottsPotentialD2Ev,__ZN14PottsPotentialD0Ev,b3,b3,b3,b3,b3,b3,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,b3,b3,b3,b3,__ZN10__cxxabiv120__si_class_type_infoD0Ev,b3
,b3,b3,__ZNSt11logic_errorD2Ev,__ZNSt11logic_errorD0Ev,b3,__ZNSt12length_errorD0Ev,b3,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3];
var FUNCTION_TABLE_viiii = [b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b4,b4
,b4,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b4];
var FUNCTION_TABLE_viiiii = [b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,__ZNK19SemiMetricPotential5applyEPfPKfS0_i,b5,b5,__ZNK14PottsPotential5applyEPfPKfS0_i,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b5,b5,b5
,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b5,b5];
var FUNCTION_TABLE_viiiiii = [b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b6,b6,b6,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib
,b6,b6,b6];

  return { ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___muldi3: ___muldi3, ___udivdi3: ___udivdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _emscripten_replace_memory: _emscripten_replace_memory, _fflush: _fflush, _free: _free, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _llvm_bswap_i32: _llvm_bswap_i32, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _process: _process, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real____cxa_can_catch = asm["___cxa_can_catch"]; asm["___cxa_can_catch"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_can_catch.apply(null, arguments);
};

var real____cxa_is_pointer_type = asm["___cxa_is_pointer_type"]; asm["___cxa_is_pointer_type"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_is_pointer_type.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____errno_location.apply(null, arguments);
};

var real____muldi3 = asm["___muldi3"]; asm["___muldi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____muldi3.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____udivdi3.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Lshr.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Shl.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__fflush.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__free.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Add.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Subtract.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__llvm_bswap_i32.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__malloc.apply(null, arguments);
};

var real__process = asm["_process"]; asm["_process"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__process.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__sbrk.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_establishStackSpace.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_getTempRet0.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setTempRet0.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setThrew.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackAlloc.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackRestore.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackSave.apply(null, arguments);
};
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___muldi3 = Module["___muldi3"] = asm["___muldi3"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var _emscripten_replace_memory = Module["_emscripten_replace_memory"] = asm["_emscripten_replace_memory"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var _free = Module["_free"] = asm["_free"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _memset = Module["_memset"] = asm["_memset"];
var _process = Module["_process"] = asm["_process"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
;



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;

if (!Module["intArrayFromString"]) Module["intArrayFromString"] = function() { abort("'intArrayFromString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayToString"]) Module["intArrayToString"] = function() { abort("'intArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;
Module["setValue"] = setValue;
Module["getValue"] = getValue;
if (!Module["allocate"]) Module["allocate"] = function() { abort("'allocate' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getMemory"]) Module["getMemory"] = function() { abort("'getMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["Pointer_stringify"]) Module["Pointer_stringify"] = function() { abort("'Pointer_stringify' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["AsciiToString"]) Module["AsciiToString"] = function() { abort("'AsciiToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToAscii"]) Module["stringToAscii"] = function() { abort("'stringToAscii' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ArrayToString"]) Module["UTF8ArrayToString"] = function() { abort("'UTF8ArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ToString"]) Module["UTF8ToString"] = function() { abort("'UTF8ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8Array"]) Module["stringToUTF8Array"] = function() { abort("'stringToUTF8Array' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8"]) Module["stringToUTF8"] = function() { abort("'stringToUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF8"]) Module["lengthBytesUTF8"] = function() { abort("'lengthBytesUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF16ToString"]) Module["UTF16ToString"] = function() { abort("'UTF16ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF16"]) Module["stringToUTF16"] = function() { abort("'stringToUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF16"]) Module["lengthBytesUTF16"] = function() { abort("'lengthBytesUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF32ToString"]) Module["UTF32ToString"] = function() { abort("'UTF32ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF32"]) Module["stringToUTF32"] = function() { abort("'stringToUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF32"]) Module["lengthBytesUTF32"] = function() { abort("'lengthBytesUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocateUTF8"]) Module["allocateUTF8"] = function() { abort("'allocateUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackTrace"]) Module["stackTrace"] = function() { abort("'stackTrace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreRun"]) Module["addOnPreRun"] = function() { abort("'addOnPreRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnInit"]) Module["addOnInit"] = function() { abort("'addOnInit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreMain"]) Module["addOnPreMain"] = function() { abort("'addOnPreMain' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnExit"]) Module["addOnExit"] = function() { abort("'addOnExit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPostRun"]) Module["addOnPostRun"] = function() { abort("'addOnPostRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeStringToMemory"]) Module["writeStringToMemory"] = function() { abort("'writeStringToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeArrayToMemory"]) Module["writeArrayToMemory"] = function() { abort("'writeArrayToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeAsciiToMemory"]) Module["writeAsciiToMemory"] = function() { abort("'writeAsciiToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addRunDependency"]) Module["addRunDependency"] = function() { abort("'addRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["removeRunDependency"]) Module["removeRunDependency"] = function() { abort("'removeRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS"]) Module["FS"] = function() { abort("'FS' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["FS_createFolder"]) Module["FS_createFolder"] = function() { abort("'FS_createFolder' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPath"]) Module["FS_createPath"] = function() { abort("'FS_createPath' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDataFile"]) Module["FS_createDataFile"] = function() { abort("'FS_createDataFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPreloadedFile"]) Module["FS_createPreloadedFile"] = function() { abort("'FS_createPreloadedFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLazyFile"]) Module["FS_createLazyFile"] = function() { abort("'FS_createLazyFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLink"]) Module["FS_createLink"] = function() { abort("'FS_createLink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDevice"]) Module["FS_createDevice"] = function() { abort("'FS_createDevice' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_unlink"]) Module["FS_unlink"] = function() { abort("'FS_unlink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["GL"]) Module["GL"] = function() { abort("'GL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["staticAlloc"]) Module["staticAlloc"] = function() { abort("'staticAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynamicAlloc"]) Module["dynamicAlloc"] = function() { abort("'dynamicAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["warnOnce"]) Module["warnOnce"] = function() { abort("'warnOnce' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadDynamicLibrary"]) Module["loadDynamicLibrary"] = function() { abort("'loadDynamicLibrary' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadWebAssemblyModule"]) Module["loadWebAssemblyModule"] = function() { abort("'loadWebAssemblyModule' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getLEB"]) Module["getLEB"] = function() { abort("'getLEB' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFunctionTables"]) Module["getFunctionTables"] = function() { abort("'getFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["alignFunctionTables"]) Module["alignFunctionTables"] = function() { abort("'alignFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["registerFunctions"]) Module["registerFunctions"] = function() { abort("'registerFunctions' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addFunction"]) Module["addFunction"] = function() { abort("'addFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["removeFunction"]) Module["removeFunction"] = function() { abort("'removeFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFuncWrapper"]) Module["getFuncWrapper"] = function() { abort("'getFuncWrapper' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["prettyPrint"]) Module["prettyPrint"] = function() { abort("'prettyPrint' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["makeBigInt"]) Module["makeBigInt"] = function() { abort("'makeBigInt' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynCall"]) Module["dynCall"] = function() { abort("'dynCall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getCompilerSetting"]) Module["getCompilerSetting"] = function() { abort("'getCompilerSetting' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackSave"]) Module["stackSave"] = function() { abort("'stackSave' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackRestore"]) Module["stackRestore"] = function() { abort("'stackRestore' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackAlloc"]) Module["stackAlloc"] = function() { abort("'stackAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayFromBase64"]) Module["intArrayFromBase64"] = function() { abort("'intArrayFromBase64' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["tryParseAsDataURI"]) Module["tryParseAsDataURI"] = function() { abort("'tryParseAsDataURI' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };if (!Module["ALLOC_NORMAL"]) Object.defineProperty(Module, "ALLOC_NORMAL", { get: function() { abort("'ALLOC_NORMAL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STACK"]) Object.defineProperty(Module, "ALLOC_STACK", { get: function() { abort("'ALLOC_STACK' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STATIC"]) Object.defineProperty(Module, "ALLOC_STATIC", { get: function() { abort("'ALLOC_STATIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_DYNAMIC"]) Object.defineProperty(Module, "ALLOC_DYNAMIC", { get: function() { abort("'ALLOC_DYNAMIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_NONE"]) Object.defineProperty(Module, "ALLOC_NONE", { get: function() { abort("'ALLOC_NONE' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });

if (memoryInitializer) {
  if (!isDataURI(memoryInitializer)) {
    if (typeof Module['locateFile'] === 'function') {
      memoryInitializer = Module['locateFile'](memoryInitializer);
    } else if (Module['memoryInitializerPrefixURL']) {
      memoryInitializer = Module['memoryInitializerPrefixURL'] + memoryInitializer;
    }
  }
  if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
    var data = Module['readBinary'](memoryInitializer);
    HEAPU8.set(data, GLOBAL_BASE);
  } else {
    addRunDependency('memory initializer');
    var applyMemoryInitializer = function(data) {
      if (data.byteLength) data = new Uint8Array(data);
      for (var i = 0; i < data.length; i++) {
        assert(HEAPU8[GLOBAL_BASE + i] === 0, "area for memory initializer should not have been touched before it's loaded");
      }
      HEAPU8.set(data, GLOBAL_BASE);
      // Delete the typed array that contains the large blob of the memory initializer request response so that
      // we won't keep unnecessary memory lying around. However, keep the XHR object itself alive so that e.g.
      // its .status field can still be accessed later.
      if (Module['memoryInitializerRequest']) delete Module['memoryInitializerRequest'].response;
      removeRunDependency('memory initializer');
    }
    function doBrowserLoad() {
      Module['readAsync'](memoryInitializer, applyMemoryInitializer, function() {
        throw 'could not load memory initializer ' + memoryInitializer;
      });
    }
    var memoryInitializerBytes = tryParseAsDataURI(memoryInitializer);
    if (memoryInitializerBytes) {
      applyMemoryInitializer(memoryInitializerBytes.buffer);
    } else
    if (Module['memoryInitializerRequest']) {
      // a network request has already been created, just use that
      function useRequest() {
        var request = Module['memoryInitializerRequest'];
        var response = request.response;
        if (request.status !== 200 && request.status !== 0) {
          var data = tryParseAsDataURI(Module['memoryInitializerRequestURL']);
          if (data) {
            response = data.buffer;
          } else {
            // If you see this warning, the issue may be that you are using locateFile or memoryInitializerPrefixURL, and defining them in JS. That
            // means that the HTML file doesn't know about them, and when it tries to create the mem init request early, does it to the wrong place.
            // Look in your browser's devtools network console to see what's going on.
            console.warn('a problem seems to have happened with Module.memoryInitializerRequest, status: ' + request.status + ', retrying ' + memoryInitializer);
            doBrowserLoad();
            return;
          }
        }
        applyMemoryInitializer(response);
      }
      if (Module['memoryInitializerRequest'].response) {
        setTimeout(useRequest, 0); // it's already here; but, apply it asynchronously
      } else {
        Module['memoryInitializerRequest'].addEventListener('load', useRequest); // wait for it
      }
    } else {
      // fetch it from the network ourselves
      doBrowserLoad();
    }
  }
}



/**
 * @constructor
 * @extends {Error}
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}





/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (runDependencies > 0) {
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    assert(!Module['_main'], 'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]');

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = run;

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in NO_FILESYSTEM
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var print = Module['print'];
  var printErr = Module['printErr'];
  var has = false;
  Module['print'] = Module['printErr'] = function(x) {
    has = true;
  }
  try { // it doesn't matter if it fails
    var flush = flush_NO_FILESYSTEM;
    if (flush) flush(0);
  } catch(e) {}
  Module['print'] = print;
  Module['printErr'] = printErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set NO_EXIT_RUNTIME to 0 (see the FAQ), or make sure to emit a newline when you printf etc.');
  }
}

function exit(status, implicit) {
  checkUnflushedContent();

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && Module['noExitRuntime'] && status === 0) {
    return;
  }

  if (Module['noExitRuntime']) {
    // if exit() was called, we may warn the user if the runtime isn't actually being shut down
    if (!implicit) {
      Module.printErr('exit(' + status + ') called, but NO_EXIT_RUNTIME is set, so halting execution but not exiting the runtime or preventing further async execution (build with NO_EXIT_RUNTIME=0, if you want a true shutdown)');
    }
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  }
  Module['quit'](status, new ExitStatus(status));
}
Module['exit'] = exit;

var abortDecorators = [];

function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';
  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}


Module["noExitRuntime"] = true;

run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}



