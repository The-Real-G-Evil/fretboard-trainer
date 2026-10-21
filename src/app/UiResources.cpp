#include "app/UiResources.h"

#if ! FT_UI_DEV_SERVER
extern "C" const unsigned char ft_ui_bundle_data[];
extern "C" const unsigned long long ft_ui_bundle_size;
#endif

namespace ft
{

namespace
{
    juce::String mimeTypeFor (const juce::String& path)
    {
        const auto ext = path.fromLastOccurrenceOf (".", false, false).toLowerCase();

        if (ext == "html")  return "text/html";
        if (ext == "js")    return "text/javascript";
        if (ext == "mjs")   return "text/javascript";
        if (ext == "css")   return "text/css";
        if (ext == "json")  return "application/json";
        if (ext == "svg")   return "image/svg+xml";
        if (ext == "png")   return "image/png";
        if (ext == "ico")   return "image/x-icon";
        if (ext == "woff2") return "font/woff2";
        if (ext == "woff")  return "font/woff";
        if (ext == "wasm")  return "application/wasm";
        return "application/octet-stream";
    }

    juce::String normalise (juce::String path)
    {
        path = path.upToFirstOccurrenceOf ("?", false, false)
                   .upToFirstOccurrenceOf ("#", false, false)
                   .replaceCharacter ('\\', '/');

        while (path.startsWith ("./") || path.startsWith ("/"))
            path = path.fromFirstOccurrenceOf ("/", false, false);

        return path.isEmpty() ? juce::String ("index.html") : path;
    }
}

UiResources::UiResources()
{
   #if ! FT_UI_DEV_SERVER
    zip = std::make_unique<juce::ZipFile> (std::make_unique<juce::MemoryInputStream> (ft_ui_bundle_data,
                                                                                      static_cast<size_t> (ft_ui_bundle_size),
                                                                                      false));
   #endif
}

UiResources::~UiResources() = default;

std::optional<juce::WebBrowserComponent::Resource> UiResources::getResource (const juce::String& url) const
{
    if (zip == nullptr)
        return std::nullopt;

    const auto wanted = normalise (url);

    for (int i = 0; i < zip->getNumEntries(); ++i)
    {
        const auto* entry = zip->getEntry (i);

        if (normalise (entry->filename) != wanted)
            continue;

        std::unique_ptr<juce::InputStream> in (zip->createStreamForEntry (i));
        if (in == nullptr)
            return std::nullopt;

        juce::MemoryBlock block;
        in->readIntoMemoryBlock (block);

        std::vector<std::byte> data (block.getSize());
        std::memcpy (data.data(), block.getData(), block.getSize());
        return juce::WebBrowserComponent::Resource { std::move (data), mimeTypeFor (wanted) };
    }

    return std::nullopt;
}

} // namespace ft
