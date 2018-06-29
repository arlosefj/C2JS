
emcc mat.c -o mat.js -s EXPORTED_FUNCTIONS='["_test0", "_test1", "_test2"]' -s EXTRA_EXPORTED_RUNTIME_METHODS='["ccall", "cwrap"]'

python -m SimpleHTTPServer