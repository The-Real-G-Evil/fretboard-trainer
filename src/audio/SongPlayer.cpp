#include "audio/SongPlayer.h"

#if defined(_MSC_VER)
 #pragma warning (push, 0)
#elif defined(__GNUC__)
 #pragma GCC diagnostic push
 #pragma GCC diagnostic ignored "-Wall"
 #pragma GCC diagnostic ignored "-Wextra"
#endif
#define TSF_IMPLEMENTATION
#include <tsf.h>
#if defined(_MSC_VER)
 #pragma warning (pop)
#elif defined(__GNUC__)
 #pragma GCC diagnostic pop
#endif

#include <algorithm>
#include <cmath>
#include <numbers>

namespace ft
{

namespace
{
    constexpr int maxVoices = 128;
    constexpr int maxChunk = 64;          // Tempo und Ereignisse mindestens so fein aufloesen
    constexpr double clickSeconds = 0.03;

    enum StatusFlag { flagPlaying = 1, flagHalted = 2, flagCountIn = 4, flagFinished = 8 };
}

SongPlayer::SongPlayer()
{
    std::fill (std::begin (channelGain), std::end (channelGain), 1.0f);
    std::fill (std::begin (channelBaseVolume), std::end (channelBaseVolume), 1.0f);
}

SongPlayer::~SongPlayer()
{
    delete pendingSong.exchange (nullptr);
    delete retiredSong.exchange (nullptr);
    delete pendingHalts.exchange (nullptr);
    delete retiredHalts.exchange (nullptr);
    delete song;
    for (auto* f : { synth, pendingSynth.exchange (nullptr), retiredSynth.exchange (nullptr) })
        if (f != nullptr)
            tsf_close (f);
}

// ---------- UI-Thread

bool SongPlayer::loadSoundFont (const void* data, int size)
{
    auto* f = tsf_load_memory (data, size);
    if (f == nullptr)
        return false;

    tsf_set_output (f, TSF_MONO, static_cast<int> (preparedRate.load()), 0.0f);
    tsf_set_max_voices (f, maxVoices);     // reserviert alle Stimmen: keine Allokation beim Spielen
    for (int ch = 0; ch < 16; ++ch)        // Kanaele anlegen (sonst beim ersten Ereignis)
    {
        tsf_channel_set_bank_preset (f, ch, 0, 0);
        tsf_channel_set_volume (f, ch, 1.0f);
    }
    tsf_channel_set_presetnumber (f, 9, 0, 1); // Kanal 10: Schlagzeug

    if (! synthReady.load())
    {
        synth = f; // erster Soundfont: der Audio-Thread benutzt synth erst nach synthReady
        synthReady = true;
        return true;
    }
    // Austausch: alten (vom Audio-Thread abgegebenen) freigeben, neuen bereitlegen
    if (auto* old = retiredSynth.exchange (nullptr))
        tsf_close (old);
    if (auto* unused = pendingSynth.exchange (f))
        tsf_close (unused);
    return true;
}

void SongPlayer::prepare (double sr, int maxBlockSize)
{
    sampleRate = sr > 0.0 ? sr : 48000.0;
    preparedRate = sampleRate;
    scratch.assign (static_cast<size_t> (std::max (maxBlockSize, maxChunk)), 0.0f);
    if (synth != nullptr)
        tsf_set_output (synth, TSF_MONO, static_cast<int> (sampleRate), 0.0f);
    clickLength = static_cast<int> (clickSeconds * sampleRate);
}

void SongPlayer::setSong (std::unique_ptr<Song> s)
{
    delete retiredSong.exchange (nullptr);           // vom Audio-Thread abgegeben
    delete pendingSong.exchange (s.release());       // nie abgeholtes Lied verwerfen
}

void SongPlayer::setHaltTicks (std::vector<long long> ticks)
{
    std::sort (ticks.begin(), ticks.end());
    delete retiredHalts.exchange (nullptr);
    delete pendingHalts.exchange (new std::vector<long long> (std::move (ticks)));
}

void SongPlayer::push (const Command& c)
{
    commands.push (c); // Schlange (256) voll: Befehl verfaellt – kommt bei Bedienung nicht vor
}

void SongPlayer::play (bool withCountIn)               { push ({ CommandType::play, 0, 0, 0.0, withCountIn }); }
void SongPlayer::pause()                               { push ({ CommandType::pause }); }
void SongPlayer::seek (long long t)                    { push ({ CommandType::seek, t }); }
void SongPlayer::setSpeed (double s)                   { push ({ CommandType::speed, 0, 0, s }); }
void SongPlayer::setRange (long long s, long long e, bool l, int passes) { push ({ CommandType::range, s, e, static_cast<double> (passes), l }); }
void SongPlayer::setChannelGain (int ch, float g)      { push ({ CommandType::channelGain, ch, 0, g }); }
void SongPlayer::setMetronome (bool on, float g)       { push ({ CommandType::metronome, 0, 0, g, on }); }
void SongPlayer::setWaitMode (bool on)                 { push ({ CommandType::waitMode, 0, 0, 0.0, on }); }
void SongPlayer::setReleased (int p, int n)            { push ({ CommandType::released, p, n }); }
void SongPlayer::setMasterGain (float g)               { push ({ CommandType::masterGain, 0, 0, g }); }

SongPlayer::Status SongPlayer::getStatus() const noexcept
{
    Status s;
    const auto flags = statusFlags.load (std::memory_order_acquire);
    s.tick = statusTick.load (std::memory_order_relaxed);
    s.streamSample = statusSample.load (std::memory_order_relaxed);
    s.playing = (flags & flagPlaying) != 0;
    s.halted = (flags & flagHalted) != 0;
    s.countIn = (flags & flagCountIn) != 0;
    s.finished = (flags & flagFinished) != 0;
    s.pass = statusPass.load (std::memory_order_relaxed);
    s.released = statusReleased.load (std::memory_order_relaxed);
    return s;
}

// ---------- Audio-Thread

double SongPlayer::bpmAt (double t) const noexcept
{
    double bpm = 120.0;
    if (song != nullptr)
        for (const auto& tp : song->tempo)
        {
            if (static_cast<double> (tp.tick) > t)
                break;
            bpm = tp.bpm;
        }
    return bpm;
}

double SongPlayer::ticksPerSample() const noexcept
{
    const auto ppq = song != nullptr ? song->ppq : 960;
    return bpmAt (tick) / 60.0 * ppq / sampleRate * speed;
}

void SongPlayer::allNotesOff() noexcept
{
    if (synth == nullptr)
        return;
    for (int ch = 0; ch < 16; ++ch)
        tsf_channel_note_off_all (synth, ch);
}

void SongPlayer::applyEvent (const Event& e) noexcept
{
    if (synth == nullptr)
        return;
    const int ch = e.status & 0x0f;
    switch (e.status & 0xf0)
    {
        case 0x90:
            if (e.data2 > 0) { tsf_channel_note_on (synth, ch, e.data1, e.data2 / 127.0f); break; }
            [[fallthrough]];
        case 0x80:
            tsf_channel_note_off (synth, ch, e.data1);
            break;
        case 0xb0:
            tsf_channel_midi_control (synth, ch, e.data1, e.data2);
            switch (e.data1)
            {
                case 7: case 39: case 11: case 43: case 121:
                    // Lautstaerke/Expression/Reset: der Synthesizer setzt die Kanallautstaerke neu –
                    // als Grundwert merken und mit dem Mischpult verrechnen (sonst gilt der Regler nicht)
                    channelBaseVolume[ch] = tsf_channel_get_volume (synth, ch);
                    tsf_channel_set_volume (synth, ch, channelBaseVolume[ch] * channelGain[ch]);
                    break;
                default:
                    break;
            }
            break;
        case 0xc0:
            tsf_channel_set_presetnumber (synth, ch, e.data1, ch == 9 ? 1 : 0);
            break;
        case 0xe0:
            tsf_channel_set_pitchwheel (synth, ch, (e.data2 << 7) | e.data1);
            break;
        default:
            break;
    }
}

void SongPlayer::chaseTo (long long target) noexcept
{
    if (synth != nullptr)
        for (int ch = 0; ch < 16; ++ch)
        {
            tsf_channel_sounds_off_all (synth, ch);
            tsf_channel_set_pitchwheel (synth, ch, 8192);
        }
    nextEvent = 0;
    if (song == nullptr)
        return;
    // Programme und Controller bis zum Ziel nachholen, Noten nicht
    while (nextEvent < song->events.size() && song->events[nextEvent].tick < target)
    {
        const auto& e = song->events[nextEvent++];
        const auto type = e.status & 0xf0;
        if (type == 0xb0 || type == 0xc0 || type == 0xe0)
            applyEvent (e);
    }
    tick = static_cast<double> (target);
    const auto ppq = static_cast<double> (song->ppq);
    nextClickTick = std::ceil (tick / ppq) * ppq;
    nextHalt = static_cast<size_t> (std::lower_bound (song->haltTicks.begin(), song->haltTicks.end(), target)
                                    - song->haltTicks.begin());
}

void SongPlayer::applyCommand (const Command& c) noexcept
{
    switch (c.type)
    {
        case CommandType::play:
            if (song == nullptr)
                break;
            if (finished || tick >= static_cast<double> (rangeEnd) || tick < static_cast<double> (rangeStart))
            {
                chaseTo (rangeStart);
                pass = 0;
                released = 0;
            }
            finished = false;
            playing = true;
            countInBeatSamples = 60.0 / bpmAt (tick) / speed * sampleRate;
            countInSamples = c.flag ? 4.0 * countInBeatSamples : 0.0;
            if (c.flag)
            {
                clickRemaining = clickLength;
                clickPhase = 0.0;
                clickAccent = true;
            }
            break;
        case CommandType::pause:
            playing = false;
            countInSamples = 0.0;
            allNotesOff();
            break;
        case CommandType::seek:
            chaseTo (c.a);
            break;
        case CommandType::speed:
            speed = std::clamp (c.x, 0.1, 4.0);
            break;
        case CommandType::range:
            rangeStart = c.a;
            rangeEnd = c.b;
            loop = c.flag;
            loopPasses = static_cast<int> (c.x);
            if (playing && (tick < static_cast<double> (rangeStart) || tick >= static_cast<double> (rangeEnd)))
            {
                chaseTo (rangeStart); // neuer Bereich: dort weiterspielen
                pass = 0;
                released = 0;
            }
            else if (! playing)
            {
                chaseTo (rangeStart);
                pass = 0;
                released = 0;
                finished = false;
            }
            break;
        case CommandType::channelGain:
            if (c.a >= 0 && c.a < 16)
            {
                channelGain[c.a] = static_cast<float> (c.x);
                if (synth != nullptr)
                    tsf_channel_set_volume (synth, static_cast<int> (c.a), channelBaseVolume[c.a] * channelGain[c.a]);
            }
            break;
        case CommandType::metronome:
            metronomeOn = c.flag;
            metronomeGain = static_cast<float> (c.x);
            break;
        case CommandType::waitMode:
            waitMode = c.flag;
            break;
        case CommandType::released:
            if (c.a == pass)
                released = static_cast<int> (c.b);
            break;
        case CommandType::masterGain:
            masterGain = static_cast<float> (c.x);
            break;
    }
}

void SongPlayer::renderSynth (float* out, int n) noexcept
{
    if (synth == nullptr || n <= 0)
        return;
    tsf_render_float (synth, scratch.data(), n, 0);
    for (int i = 0; i < n; ++i)
        out[i] += scratch[static_cast<size_t> (i)] * masterGain;
}

void SongPlayer::renderClicks (float* out, int n) noexcept
{
    const auto gain = metronomeGain; // Metronom und Vorzaehler folgen dem Lautstaerkeregler
    const auto freq = clickAccent ? 1760.0 : 1320.0;
    const auto step = 2.0 * std::numbers::pi * freq / sampleRate;
    for (int i = 0; i < n && clickRemaining > 0; ++i, --clickRemaining)
    {
        const auto env = static_cast<float> (clickRemaining) / static_cast<float> (std::max (1, clickLength));
        out[i] += gain * env * env * static_cast<float> (std::sin (clickPhase));
        clickPhase += step;
    }
}

void SongPlayer::publish (long long streamSample) noexcept
{
    const bool holding = playing && song != nullptr && waitMode && nextHalt < song->haltTicks.size()
                         && static_cast<int> (nextHalt) >= released
                         && tick >= static_cast<double> (song->haltTicks[nextHalt]);
    int flags = 0;
    if (playing) flags |= flagPlaying;
    if (holding) flags |= flagHalted;
    if (countInSamples > 0.0) flags |= flagCountIn;
    if (finished) flags |= flagFinished;
    statusTick.store (tick, std::memory_order_relaxed);
    statusSample.store (streamSample, std::memory_order_relaxed);
    statusPass.store (pass, std::memory_order_relaxed);
    statusReleased.store (released, std::memory_order_relaxed);
    statusFlags.store (flags, std::memory_order_release);
}

void SongPlayer::process (float* out, int numSamples, long long blockStart) noexcept
{
    if (! synthReady.load (std::memory_order_acquire))
        return; // Soundfont noch nicht geladen (synth wird erst danach benutzt)

    // neuer Soundfont: uebernehmen, sobald der vorige abgeholt wurde; Programme/Controller nachholen
    if (retiredSynth.load (std::memory_order_acquire) == nullptr)
        if (auto* f = pendingSynth.exchange (nullptr, std::memory_order_acq_rel))
        {
            retiredSynth.store (synth, std::memory_order_release);
            synth = f;
            tsf_set_output (synth, TSF_MONO, static_cast<int> (sampleRate), 0.0f);
            for (int ch = 0; ch < 16; ++ch)
                tsf_channel_set_volume (synth, ch, channelBaseVolume[ch] * channelGain[ch]);
            chaseTo (static_cast<long long> (tick));
        }

    if (auto* s = pendingSong.exchange (nullptr, std::memory_order_acq_rel))
    {
        auto* old = song;
        song = s;
        if (old != nullptr)
            delete retiredSong.exchange (old); // nur falls die UI das vorige noch nicht abgeholt hat (selten)
        playing = finished = false;
        countInSamples = 0.0;
        rangeStart = 0;
        rangeEnd = song->events.empty() ? 0 : song->events.back().tick;
        pass = released = 0;
        std::fill (std::begin (channelBaseVolume), std::end (channelBaseVolume), 1.0f);
        for (int ch = 0; ch < 16; ++ch) // Grundzustand, dann Mischpult
            tsf_channel_midi_control (synth, ch, 121, 0), tsf_channel_set_volume (synth, ch, channelGain[ch]);
        chaseTo (0);
    }

    // neue Halte-Ticks: Vektoren tauschen (keine Allokation), den alten gibt die UI frei
    if (song != nullptr && retiredHalts.load (std::memory_order_acquire) == nullptr)
        if (auto* h = pendingHalts.exchange (nullptr, std::memory_order_acq_rel))
        {
            std::swap (song->haltTicks, *h);
            retiredHalts.store (h, std::memory_order_release);
            nextHalt = static_cast<size_t> (std::lower_bound (song->haltTicks.begin(), song->haltTicks.end(),
                                                              static_cast<long long> (std::ceil (tick)))
                                            - song->haltTicks.begin());
        }

    Command c;
    while (commands.pop (c))
        applyCommand (c);

    int done = 0;
    while (done < numSamples)
    {
        const int chunk = std::min (maxChunk, numSamples - done);
        float* dst = out + done;

        if (! playing || song == nullptr)
        {
            renderSynth (dst, chunk); // Ausklingen
            renderClicks (dst, chunk);
            done += chunk;
            continue;
        }

        // Vorzaehler: Klicks je Viertel, Position steht
        if (countInSamples > 0.0)
        {
            const auto beatsLeftBefore = std::ceil (countInSamples / countInBeatSamples);
            const int n = std::min (chunk, std::max (1, static_cast<int> (std::ceil (countInSamples - (beatsLeftBefore - 1.0) * countInBeatSamples))));
            renderSynth (dst, n);
            renderClicks (dst, n);
            countInSamples -= n;
            if (countInSamples > 0.0 && std::ceil (countInSamples / countInBeatSamples) < beatsLeftBefore)
            {
                clickRemaining = clickLength; // naechster Schlag des Vorzaehlers
                clickPhase = 0.0;
                clickAccent = false;
            }
            if (countInSamples <= 0.0)
            {
                countInSamples = 0.0;
                nextClickTick = tick; // Metronom setzt mit dem Lied ein
            }
            done += n;
            continue;
        }

        // Warte-Modus: an der naechsten nicht freigegebenen Note halten (Ereignisse dort erst danach)
        const auto& halts = song->haltTicks;
        const bool hold = waitMode && nextHalt < halts.size() && static_cast<int> (nextHalt) >= released
                          && tick >= static_cast<double> (halts[nextHalt]);
        const auto applyLimit = hold ? halts[nextHalt] - 1 : static_cast<long long> (std::floor (tick));
        while (nextEvent < song->events.size() && song->events[nextEvent].tick <= applyLimit)
            applyEvent (song->events[nextEvent++]);

        if (hold)
        {
            tick = static_cast<double> (halts[nextHalt]);
            renderSynth (dst, chunk);
            renderClicks (dst, chunk);
            done += chunk;
            continue;
        }
        while (nextHalt < halts.size() && static_cast<double> (halts[nextHalt]) <= tick && static_cast<int> (nextHalt) < released)
            ++nextHalt;

        // Ende des Bereichs: wiederholen oder anhalten
        if (tick >= static_cast<double> (rangeEnd))
        {
            if (loop && rangeEnd > rangeStart && (loopPasses <= 0 || pass + 1 < loopPasses))
            {
                chaseTo (rangeStart);
                ++pass;
                released = 0;
            }
            else
            {
                playing = false;
                finished = true;
                allNotesOff();
            }
            continue;
        }

        // Metronom je Viertel
        if (metronomeOn && tick >= nextClickTick)
        {
            clickRemaining = clickLength;
            clickPhase = 0.0;
            clickAccent = false;
            nextClickTick += song->ppq;
        }

        // bis zur naechsten Grenze rendern (Ereignis, Tempowechsel, Halt, Klick, Bereichsende)
        double boundary = static_cast<double> (rangeEnd);
        if (nextEvent < song->events.size())
            boundary = std::min (boundary, static_cast<double> (song->events[nextEvent].tick));
        for (const auto& tp : song->tempo)
            if (static_cast<double> (tp.tick) > tick) { boundary = std::min (boundary, static_cast<double> (tp.tick)); break; }
        if (waitMode && nextHalt < halts.size() && static_cast<int> (nextHalt) >= released)
            boundary = std::min (boundary, static_cast<double> (halts[nextHalt]));
        if (metronomeOn)
            boundary = std::min (boundary, nextClickTick);

        const auto tps = ticksPerSample();
        const int n = std::clamp (static_cast<int> (std::ceil ((boundary - tick) / tps)), 1, chunk);
        renderSynth (dst, n);
        renderClicks (dst, n);
        tick += n * tps;
        done += n;
    }

    publish (blockStart + numSamples);
}

} // namespace ft
