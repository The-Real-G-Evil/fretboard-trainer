cmake_minimum_required(VERSION 3.24)

project(FretboardTrainer VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(FT_UI_DEV_SERVER "UI vom Vite-Dev-Server (http://localhost:5173) laden statt eingebettet" OFF)
option(FT_BUILD_TESTS   "Catch2-Tests bauen" ON)
option(FT_ENABLE_ASIO   "ASIO-Unterstuetzung (nur Windows, benoetigt Steinberg-ASIO-SDK)" OFF)
set(FT_ASIO_SDK_DIR "" CACHE PATH "Pfad zum entpackten Steinberg-ASIO-SDK")

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

include(FetchContent)

# --- Abhaengigkeiten ---------------------------------------------------------

FetchContent_Declare(juce
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG        8.0.15
    GIT_SHALLOW    TRUE)
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

# --- DSP-Bibliothek (ohne JUCE, damit sie isoliert testbar ist) -------------

add_library(ft_dsp STATIC
    src/audio/Analyzer.cpp
    src/audio/Calibration.cpp
    src/audio/ExpectedNotes.cpp
    src/audio/Fft.cpp
    src/audio/LevelMeter.cpp
    src/audio/Metronome.cpp
    src/audio/NoiseGate.cpp
    src/audio/NoteTracker.cpp
    src/audio/OfflineAnalysis.cpp
    src/audio/OnsetDetector.cpp
    src/audio/PitchDetector.cpp
    src/audio/WavFile.cpp)
target_include_directories(ft_dsp PUBLIC src)
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
    NEEDS_WEB_BROWSER TRUE
    NEEDS_WEBVIEW2    TRUE
    NEEDS_CURL        FALSE)

target_sources(FretboardTrainer PRIVATE
    src/app/Main.cpp
    src/app/MainComponent.cpp
    src/app/Bridge.cpp
    src/app/CalibrationStore.cpp
    src/app/Settings.cpp
    src/app/UiResources.cpp
    src/audio/AnalysisWorker.cpp
    src/audio/AudioEngine.cpp)

target_compile_definitions(FretboardTrainer PRIVATE
    JUCE_APPLICATION_NAME_STRING="$<TARGET_PROPERTY:FretboardTrainer,JUCE_PRODUCT_NAME>"
    JUCE_APPLICATION_VERSION_STRING="$<TARGET_PROPERTY:FretboardTrainer,JUCE_VERSION>"
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
    JUCE_USE_CURL=0
    JUCE_DISPLAY_SPLASH_SCREEN=0
    JUCE_REPORT_APP_USAGE=0
    JUCE_STRICT_REFCOUNTEDPOINTER=1
    FT_UI_DEV_SERVER=$<BOOL:${FT_UI_DEV_SERVER}>)

if(FT_ENABLE_ASIO)
    if(NOT WIN32)
        message(FATAL_ERROR "FT_ENABLE_ASIO ist nur unter Windows verfuegbar.")
    endif()
    if(NOT EXISTS "${FT_ASIO_SDK_DIR}/common/iasiodrv.h")
        message(FATAL_ERROR "ASIO-SDK nicht gefunden: FT_ASIO_SDK_DIR muss auf das entpackte SDK zeigen "
                            "(erwartet: <dir>/common/iasiodrv.h).")
    endif()
    target_compile_definitions(FretboardTrainer PRIVATE JUCE_ASIO=1)
    target_include_directories(FretboardTrainer PRIVATE "${FT_ASIO_SDK_DIR}/common")
endif()

target_link_libraries(FretboardTrainer
    PRIVATE
        ft_dsp
        ft_stats
        juce::juce_audio_basics
        juce::juce_audio_devices
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

# --- Tests --------------------------------------------------------------------

if(FT_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()
