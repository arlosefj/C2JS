
emcc DenseCRF.cpp Process.cpp -o process.js -s EXPORTED_FUNCTIONS='["_process"]' -s EXTRA_EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "getValue"]'

python -m SimpleHTTPServer
