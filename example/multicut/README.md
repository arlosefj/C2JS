multi-object

emcc DenseCRF.cpp Process.cpp -o process.js -s EXPORTED_FUNCTIONS='["_process"]' -s EXTRA_EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "getValue", "setValue"]' -s ALLOW_MEMORY_GROWTH=1 -s WASM=0

cp process.js ../multicutweb/

TODO：
border matting
distance weight

