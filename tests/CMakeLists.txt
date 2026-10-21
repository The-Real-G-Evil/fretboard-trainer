FetchContent_Declare(catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG        v3.16.1
    GIT_SHALLOW    TRUE)
FetchContent_MakeAvailable(catch2)

list(APPEND CMAKE_MODULE_PATH "${catch2_SOURCE_DIR}/extras")
include(Catch)

# Testsignale (Synthese) und WAV-Ein-/Ausgabe, auch vom Werkzeug ft_wavtool genutzt
add_library(ft_test_support STATIC
    support/Synth.cpp
    support/TestData.cpp
    support/Wav.cpp)
target_include_directories(ft_test_support PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(ft_test_support PUBLIC ft_dsp)

add_executable(ft_tests
    NoiseGateTests.cpp
    LevelMeterTests.cpp
    SpscFifoTests.cpp
    PitchDetectorTests.cpp
    AnalyzerTests.cpp
    WavFileTests.cpp)

target_link_libraries(ft_tests PRIVATE ft_test_support Catch2::Catch2WithMain)
target_compile_definitions(ft_tests PRIVATE FT_TEST_DATA_DIR="${CMAKE_CURRENT_SOURCE_DIR}/data")

catch_discover_tests(ft_tests)

add_executable(ft_wavtool "${CMAKE_SOURCE_DIR}/tools/ft_wavtool.cpp")
target_link_libraries(ft_wavtool PRIVATE ft_test_support)
