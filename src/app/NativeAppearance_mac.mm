#include "app/NativeAppearance.h"

#import <AppKit/AppKit.h>

#include <cstring>

namespace ft
{

void setNativeAppearance (const char* mode)
{
    NSAppearance* appearance = nil; // nil = wie das System
    if (std::strcmp (mode, "light") == 0)
        appearance = [NSAppearance appearanceNamed: NSAppearanceNameAqua];
    else if (std::strcmp (mode, "dark") == 0)
        appearance = [NSAppearance appearanceNamed: NSAppearanceNameDarkAqua];

    [NSApp setAppearance: appearance];
}

} // namespace ft
