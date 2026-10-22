FetchContent_Declare(catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG        v3.16.1
    GIT_SHALLOW    TRUE)
FetchContent_MakeAvailable(catch2)

list(APPEND CMAKE_MODULE_PATH "${catch2_SOURCE_DIR}/extras")
include(Catch)

# Testsignal-Synthese, auch vom Werkzeug ft_wavtool genutzt
add_library(ft_test_support STATIC
    support/Synth.cpp)
target_include_directories(ft_test_support PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(ft_test_support PUBLIC ft_dsp)

add_executable(ft_tests
    NoiseGateTests.cpp
    LevelMeterTests.cpp
    SpscFifoTests.cpp
    NoteTrackerTests.cpp
    MetronomeTests.cpp
    StatsDbTests.cpp
    PitchDetectorTests.cpp
    AnalyzerTests.cpp
    ChordTests.cpp
    NoteAlignmentTests.cpp
    CalibrationTests.cpp
    SongPlayerTests.cpp
    WavFileTests.cpp)

target_link_libraries(ft_tests PRIVATE ft_test_support ft_stats Catch2::Catch2WithMain)
target_compile_definitions(ft_tests PRIVATE FT_TEST_DATA_DIR="${CMAKE_CURRENT_SOURCE_DIR}/data"
    FT_TEST_SOUNDFONT="${CMAKE_SOURCE_DIR}/ui/node_modules/@coderline/alphatab/dist/soundfont/sonivox.sf2")

catch_discover_tests(ft_tests)

# Tests fuer Teile der App, die JUCE brauchen (Ablage der Kalibrier-Aufnahmen)
juce_add_console_app(ft_app_tests PRODUCT_NAME "ft_app_tests")
target_sources(ft_app_tests PRIVATE
    app/CalibrationStoreTests.cpp
    "${CMAKE_SOURCE_DIR}/src/app/CalibrationStore.cpp")
target_compile_definitions(ft_app_tests PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_STANDALONE_APPLICATION=1)
target_link_libraries(ft_app_tests PRIVATE ft_dsp juce::juce_core juce::juce_events Catch2::Catch2WithMain
                      juce::juce_recommended_config_flags)
catch_discover_tests(ft_app_tests)

add_executable(ft_wavtool "${CMAKE_SOURCE_DIR}/tools/ft_wavtool.cpp")
target_link_libraries(ft_wavtool PRIVATE ft_test_support)
