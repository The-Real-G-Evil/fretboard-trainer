#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

namespace ft
{

/** Liefert die eingebettete Oberflaeche (ui/dist als ZIP) an die WebView aus.
    Im Dev-Modus (FT_UI_DEV_SERVER) ist nichts eingebettet; getResource() liefert dann nichts.
*/
class UiResources
{
public:
    UiResources();
    ~UiResources();

    std::optional<juce::WebBrowserComponent::Resource> getResource (const juce::String& url) const;

private:
    std::unique_ptr<juce::ZipFile> zip;
};

} // namespace ft
