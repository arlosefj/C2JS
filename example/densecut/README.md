
emcc DenseCRF.cpp Process.cpp -o process.js -s EXPORTED_FUNCTIONS='["_process"]' -s EXTRA_EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "getValue", "setValue"]' -s ALLOW_MEMORY_GROWTH=1

cp process.js process.wasm ../densecutweb/

TODO：
border matting
distance weight
