
emcc grabcut.c -o grabcut.js -s EXPORTED_FUNCTIONS='["_grabcut"]' -s EXTRA_EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "getValue"]'

python -m SimpleHTTPServer