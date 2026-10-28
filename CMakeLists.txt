cmake_minimum_required(VERSION 3.24)

# Versionsschema VV.BB.II: VV = oeffentliche Releases, BB = Beta, II = interne Releases.
# CMake/JUCE brauchen die numerische Form (00.00.01 -> 0.0.1), angezeigt wird die zweistellige.
set(FT_VERSION_LABEL "00.00.04")
# macOS: ab Big Sur (erste Version mit Apple Silicon); Architekturen per CMAKE_OSX_ARCHITECTURES
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "Aelteste unterstuetzte macOS-Version")
project(FretboardTrainer VERSION 0.0.4 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# MSVC-Laufzeit statisch einbinden: die ausgelieferte EXE braucht kein Visual-C++-Redistributable
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

option(FT_UI_DEV_SERVER "UI vom Vite-Dev-Server (http://localhost:5173) laden statt eingebettet" OFF)
option(FT_BUILD_TESTS   "Catch2-Tests bauen" ON)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

include(FetchContent)

# --- Abhaengigkeiten ---------------------------------------------------------

FetchContent_Declare(juce
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG        8.0.15
    GIT_SHALLOW    TRUE
    PATCH_COMMAND  "${CMAKE_COMMAND}" -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/PatchJuce.cmake")
FetchContent_MakeAvailable(juce)

if(WIN32 AND NOT JUCE_WEBVIEW2_PACKAGE_LOCATION)
    # Statisches WebView2-Loader-SDK direkt aus NuGet holen, damit kein manueller
    # Install-Package-Schritt noetig ist. FindWebView2 (JUCE) sucht nach einem
    # Unterordner, der "Microsoft.Web.WebView2" im Namen traegt.
    FetchContent_Declare(webview2
        URL        https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/1.0.3485.44
        DOWNLOAD_NAME Microsoft.Web.WebView2.1.0.3485.44.zip
        SOURCE_DIR "${CMAKE_BINARY_DIR}/_deps/webview2/Microsoft.Web.WebView2"
        DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
    FetchContent_MakeAvailable(webview2)
    set(JUCE_WEBVIEW2_PACKAGE_LOCATION "${CMAKE_BINARY_DIR}/_deps/webview2" CACHE PATH "" FORCE)
endif()

# SQLite (gemeinfrei) fuer die Uebungsstatistik, als Amalgamation direkt mitgebaut
FetchContent_Declare(sqlite
    URL      https://www.sqlite.org/2026/sqlite-amalgamation-3540100.zip
    URL_HASH SHA3_256=92281c86e2957f9b9305890f9ac04204caa7b677cc868dc326d942689df28e30
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
FetchContent_MakeAvailable(sqlite)

add_library(ft_sqlite STATIC "${sqlite_SOURCE_DIR}/sqlite3.c")
target_include_directories(ft_sqlite PUBLIC "${sqlite_SOURCE_DIR}")
target_compile_definitions(ft_sqlite PRIVATE SQLITE_THREADSAFE=1 SQLITE_DEFAULT_FOREIGN_KEYS=1 SQLITE_OMIT_LOAD_EXTENSION)

add_library(ft_stats STATIC src/stats/StatsDb.cpp)
target_include_directories(ft_stats PUBLIC src)
target_link_libraries(ft_stats PUBLIC ft_sqlite)
target_compile_features(ft_stats PUBLIC cxx_std_20)

# --- TinySoundFont (MIT): Soundfont-Synthesizer fuer die Liedwiedergabe ------

set(FT_TSF_DIR "${CMAKE_BINARY_DIR}/_deps/tsf")
if(NOT EXISTS "${FT_TSF_DIR}/tsf.h")
    file(DOWNLOAD
        https://raw.githubusercontent.com/schellingb/TinySoundFont/853a0a171759f1ddba0de1442133a75912bbeffa/tsf.h
        "${FT_TSF_DIR}/tsf.h"
        EXPECTED_HASH SHA256=70d55963c98f60ebb81518eaa1f25d46888d5180eb5f5289fd6b74ffc177d197
        TLS_VERIFY ON)
endif()

# --- DSP-Bibliothek (ohne JUCE, damit sie isoliert testbar ist) -------------

add_library(ft_dsp STATIC
    src/audio/Analyzer.cpp
    src/audio/Calibration.cpp
    src/audio/Effects.cpp
    src/audio/ExpectedNotes.cpp
    src/audio/Fft.cpp
    src/audio/LevelMeter.cpp
    src/audio/Metronome.cpp
    src/audio/NoiseGate.cpp
    src/audio/NoteAlignment.cpp
    src/audio/NoteTracker.cpp
    src/audio/OfflineAnalysis.cpp
    src/audio/OnsetDetector.cpp
    src/audio/PitchDetector.cpp
    src/audio/SongPlayer.cpp
    src/audio/WavFile.cpp)
target_include_directories(ft_dsp PUBLIC src)
target_include_directories(ft_dsp PRIVATE "${FT_TSF_DIR}")
target_compile_features(ft_dsp PUBLIC cxx_std_20)

# --- Oberflaeche --------------------------------------------------------------

if(NOT FT_UI_DEV_SERVER)
    include(EmbedUi)
    ft_build_embedded_ui(ft_ui_bundle "${CMAKE_CURRENT_SOURCE_DIR}/ui")
endif()

# --- App ----------------------------------------------------------------------

juce_add_gui_app(FretboardTrainer
    PRODUCT_NAME      "Fretboard Trainer"
    COMPANY_NAME      "Fretboard Trainer"
    BUNDLE_ID         org.fretboardtrainer.app
    VERSION           ${PROJECT_VERSION}
    ICON_BIG          "${CMAKE_CURRENT_SOURCE_DIR}/resources/icon-1024.png"
    ICON_SMALL        "${CMAKE_CURRENT_SOURCE_DIR}/resources/icon-small-1024.png"
    NEEDS_WEB_BROWSER TRUE
    NEEDS_WEBVIEW2    TRUE
    NEEDS_CURL        FALSE
    # macOS fragt beim ersten Start nach dem Mikrofon; ohne Erlaubnis kommt kein Eingangssignal an
    MICROPHONE_PERMISSION_ENABLED TRUE
    MICROPHONE_PERMISSION_TEXT "Fretboard Trainer hört dein Instrument, um die gespielten Töne zu erkennen. / Fretboard Trainer listens to your instrument to recognise the notes you play.")

target_sources(FretboardTrainer PRIVATE
    src/app/Main.cpp
    src/app/MainComponent.cpp
    src/app/Bridge.cpp
    src/app/Mp3Encoder.cpp
    src/app/Recorder.cpp
    src/app/CalibrationStore.cpp
    src/app/PluginRack.cpp
    src/app/ReviewStore.cpp
    src/app/Settings.cpp
    src/app/UiResources.cpp
    src/audio/AnalysisWorker.cpp
    src/audio/AudioEngine.cpp)

target_compile_definitions(FretboardTrainer PRIVATE
    JUCE_APPLICATION_NAME_STRING="$<TARGET_PROPERTY:FretboardTrainer,JUCE_PRODUCT_NAME>"
    JUCE_APPLICATION_VERSION_STRING="$<TARGET_PROPERTY:FretboardTrainer,JUCE_VERSION>"
    JUCE_WEB_BROWSER=1
    JUCE_PLUGINHOST_VST3=1
    JUCE_PLUGINHOST_AU=0
    JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
    JUCE_USE_CURL=0
    JUCE_DISPLAY_SPLASH_SCREEN=0
    JUCE_REPORT_APP_USAGE=0
    JUCE_STRICT_REFCOUNTEDPOINTER=1
    FT_UI_DEV_SERVER=$<BOOL:${FT_UI_DEV_SERVER}>
    FT_VERSION_LABEL="${FT_VERSION_LABEL}")

target_link_libraries(FretboardTrainer
    PRIVATE
        ft_dsp
        ft_stats
        juce::juce_audio_basics
        juce::juce_audio_devices
        juce::juce_audio_formats
        juce::juce_audio_processors
        juce::juce_core
        juce::juce_data_structures
        juce::juce_events
        juce::juce_graphics
        juce::juce_gui_basics
        juce::juce_gui_extra
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_warning_flags)

if(NOT FT_UI_DEV_SERVER)
    target_link_libraries(FretboardTrainer PRIVATE ft_ui_bundle)
endif()

# MP3: Windows bringt einen Encoder mit (Media Foundation), Linux und macOS bekommen LAME
if(NOT WIN32)
    include(Lame)
    target_link_libraries(FretboardTrainer PRIVATE ft_lame)
endif()

# --- Tests --------------------------------------------------------------------

if(FT_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()
