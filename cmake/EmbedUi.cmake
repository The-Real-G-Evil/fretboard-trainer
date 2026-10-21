# Baut die Vite-Oberflaeche, packt ui/dist in ein ZIP und bettet es als
# Byte-Array in eine statische Bibliothek ein. Zur Laufzeit liest
# UiResources.cpp das ZIP aus dem Speicher und liefert die Dateien ueber den
# Resource-Provider von WebBrowserComponent aus.
#
# Erzeugte Symbole (siehe src/app/UiResources.cpp):
#   extern "C" const unsigned char ft_ui_bundle_data[];
#   extern "C" const unsigned long long ft_ui_bundle_size;

set(FT_EMBED_UI_DIR "${CMAKE_CURRENT_LIST_DIR}")

function(ft_build_embedded_ui target ui_dir)
    find_program(FT_NPM NAMES npm.cmd npm REQUIRED)

    set(out_dir   "${CMAKE_CURRENT_BINARY_DIR}/ui_bundle")
    set(zip_file  "${out_dir}/ui.zip")
    set(cpp_file  "${out_dir}/UiBundle.cpp")
    set(stamp     "${ui_dir}/node_modules/.package-lock.json")

    file(GLOB_RECURSE ui_sources CONFIGURE_DEPENDS
        "${ui_dir}/src/*"
        "${ui_dir}/public/*")
    list(APPEND ui_sources
        "${ui_dir}/index.html"
        "${ui_dir}/package.json"
        "${ui_dir}/tsconfig.json"
        "${ui_dir}/vite.config.ts")

    add_custom_command(
        OUTPUT  "${stamp}"
        COMMAND "${FT_NPM}" install --no-audit --no-fund
        WORKING_DIRECTORY "${ui_dir}"
        DEPENDS "${ui_dir}/package.json"
        COMMENT "UI: npm install"
        VERBATIM)

    add_custom_command(
        OUTPUT  "${zip_file}"
        COMMAND "${FT_NPM}" run build
        COMMAND "${CMAKE_COMMAND}" -E make_directory "${out_dir}"
        COMMAND "${CMAKE_COMMAND}" -E rm -f "${zip_file}"
        COMMAND "${CMAKE_COMMAND}" -E chdir "${ui_dir}/dist"
                "${CMAKE_COMMAND}" -E tar cf "${zip_file}" --format=zip .
        WORKING_DIRECTORY "${ui_dir}"
        DEPENDS "${stamp}" ${ui_sources}
        COMMENT "UI: vite build + zip"
        VERBATIM)

    add_custom_command(
        OUTPUT  "${cpp_file}"
        COMMAND "${CMAKE_COMMAND}" -DIN=${zip_file} -DOUT=${cpp_file} -DSYMBOL=ft_ui_bundle
                -P "${FT_EMBED_UI_DIR}/EmbedBinary.cmake"
        DEPENDS "${zip_file}" "${FT_EMBED_UI_DIR}/EmbedBinary.cmake"
        COMMENT "UI: Bundle einbetten"
        VERBATIM)

    add_library(${target} STATIC "${cpp_file}")
endfunction()
