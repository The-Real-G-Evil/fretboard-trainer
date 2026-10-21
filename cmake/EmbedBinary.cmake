# Aufruf: cmake -DIN=<datei> -DOUT=<datei.cpp> -DSYMBOL=<name> -P EmbedBinary.cmake
# Erzeugt eine C++-Datei mit dem Dateiinhalt als Byte-Array.

file(READ "${IN}" hex HEX)
string(LENGTH "${hex}" hex_len)
math(EXPR size "${hex_len} / 2")

string(REGEX REPLACE "([0-9a-f][0-9a-f])" "0x\\1," bytes "${hex}")
# Zeilenumbruch alle 32 Bytes, damit der Compiler keine Riesenzeile bekommt
string(REGEX REPLACE "((0x[0-9a-f][0-9a-f],){32})" "\\1\n" bytes "${bytes}")

file(WRITE "${OUT}"
"// Automatisch erzeugt von cmake/EmbedBinary.cmake – nicht bearbeiten.\n"
"extern \"C\" const unsigned char ${SYMBOL}_data[] = {\n${bytes}\n0x00 };\n"
"extern \"C\" const unsigned long long ${SYMBOL}_size = ${size}ull;\n")
