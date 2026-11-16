#pragma once

namespace ft
{

/** Erscheinungsbild der nativen Fensterteile (Titelleisten, Systemdialoge): "light", "dark" oder
    "auto" (System). Nur macOS; unter Windows und Linux folgen die Titelleisten dem System. */
#if defined (__APPLE__)
void setNativeAppearance (const char* mode);
#else
inline void setNativeAppearance (const char*) {}
#endif

} // namespace ft
