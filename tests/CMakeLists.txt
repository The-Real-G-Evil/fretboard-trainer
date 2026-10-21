FetchContent_Declare(catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG        v3.16.1
    GIT_SHALLOW    TRUE)
FetchContent_MakeAvailable(catch2)

list(APPEND CMAKE_MODULE_PATH "${catch2_SOURCE_DIR}/extras")
include(Catch)

add_executable(ft_tests
    NoiseGateTests.cpp
    LevelMeterTests.cpp
    SpscFifoTests.cpp)

target_link_libraries(ft_tests PRIVATE ft_dsp Catch2::Catch2WithMain)

catch_discover_tests(ft_tests)
