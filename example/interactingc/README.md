
emcc api_example.c -o api_example.js -s "EXTRA_EXPORTED_RUNTIME_METHODS=['ccall']"

python -m SimpleHTTPServer