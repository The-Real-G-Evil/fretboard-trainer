# LAME 3.100 (LGPL) als statische Bibliothek fuer den MP3-Export unter Linux und macOS.
# Unter Windows schreibt der Encoder von Windows (Media Foundation) die MP3-Dateien.
# Gebaut wird nur libmp3lame aus den Quellen, ohne Assembler und ohne Decoder; die config.h
# entsteht hier (statt per configure), damit auch Universal Binaries (arm64 + x86_64) gehen.
#
# Erzeugtes Ziel: ft_lame (Header: lame.h)

FetchContent_Declare(lame
    URL      https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz
    URL_HASH SHA256=ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
FetchContent_MakeAvailable(lame)

set(FT_LAME_CONFIG_DIR "${CMAKE_BINARY_DIR}/_deps/lame-config")
file(WRITE "${FT_LAME_CONFIG_DIR}/config.h" [=[
#ifndef FT_LAME_CONFIG_H
#define FT_LAME_CONFIG_H
#define STDC_HEADERS 1
#define HAVE_ERRNO_H 1
#define HAVE_FCNTL_H 1
#define HAVE_LIMITS_H 1
#define HAVE_STDINT_H 1
#define HAVE_INTTYPES_H 1
#define HAVE_STRCHR 1
#define HAVE_MEMCPY 1
#define PROTOTYPES 1
#define USE_FAST_LOG 1
#define PACKAGE "lame"
#define VERSION "3.100"
typedef float ieee754_float32_t;
typedef double ieee754_float64_t;
typedef long double ieee854_float80_t;
#endif
]=])

set(FT_LAME_DIR "${lame_SOURCE_DIR}/libmp3lame")
add_library(ft_lame STATIC
    "${FT_LAME_DIR}/bitstream.c"
    "${FT_LAME_DIR}/encoder.c"
    "${FT_LAME_DIR}/fft.c"
    "${FT_LAME_DIR}/gain_analysis.c"
    "${FT_LAME_DIR}/id3tag.c"
    "${FT_LAME_DIR}/lame.c"
    "${FT_LAME_DIR}/newmdct.c"
    "${FT_LAME_DIR}/presets.c"
    "${FT_LAME_DIR}/psymodel.c"
    "${FT_LAME_DIR}/quantize.c"
    "${FT_LAME_DIR}/quantize_pvt.c"
    "${FT_LAME_DIR}/reservoir.c"
    "${FT_LAME_DIR}/set_get.c"
    "${FT_LAME_DIR}/tables.c"
    "${FT_LAME_DIR}/takehiro.c"
    "${FT_LAME_DIR}/util.c"
    "${FT_LAME_DIR}/vbrquantize.c"
    "${FT_LAME_DIR}/VbrTag.c"
    "${FT_LAME_DIR}/version.c"
    "${FT_LAME_DIR}/mpglib_interface.c")
target_include_directories(ft_lame PRIVATE "${FT_LAME_CONFIG_DIR}" "${FT_LAME_DIR}")
target_include_directories(ft_lame PUBLIC "${lame_SOURCE_DIR}/include")
target_compile_definitions(ft_lame PRIVATE HAVE_CONFIG_H)
set_target_properties(ft_lame PROPERTIES POSITION_INDEPENDENT_CODE ON C_VISIBILITY_PRESET hidden)
if(CMAKE_C_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(ft_lame PRIVATE -w) # fremder Code, Warnungen nicht unsere
endif()
