# Wird von FetchContent nach dem Herunterladen von JUCE ausgefuehrt (PATCH_COMMAND, Arbeitsordner = JUCE).
#
# Linux: JUCE laedt WebKitGTK, GTK und GLib zur Laufzeit unter den Namen ohne Versionsnummer
# ("libwebkit2gtk-4.1.so"). Die gibt es nur mit den Entwicklerpaketen (-dev); bei Nutzern bliebe das
# Fenster weiss. Deshalb die festen Bibliotheksnamen (soname) der Laufzeitpakete eintragen.

set(file "modules/juce_gui_extra/native/juce_WebBrowserComponent_linux.cpp")
file(READ "${file}" text)

foreach(pair
        "libgtk-3.so|libgtk-3.so.0"
        "libglib-2.0.so|libglib-2.0.so.0"
        "libwebkit2gtk-4.1.so|libwebkit2gtk-4.1.so.0"
        "libjavascriptcoregtk-4.1.so|libjavascriptcoregtk-4.1.so.0"
        "libsoup-3.0.so|libsoup-3.0.so.0"
        "libwebkit2gtk-4.0.so|libwebkit2gtk-4.0.so.37"
        "libjavascriptcoregtk-4.0.so|libjavascriptcoregtk-4.0.so.18"
        "libsoup-2.4.so|libsoup-2.4.so.1")
    string(REPLACE "|" ";" names "${pair}")
    list(GET names 0 from)
    list(GET names 1 to)
    string(REPLACE "\"${from}\"" "\"${to}\"" text "${text}")
endforeach()

file(WRITE "${file}" "${text}")
