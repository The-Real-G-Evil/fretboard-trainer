#include "audio/SpscFifo.h"

#include <catch2/catch_test_macros.hpp>

#include <thread>

TEST_CASE ("FIFO: Reihenfolge und Kapazitaet")
{
    ft::SpscFifo<int, 4> fifo;
    int v = 0;

    CHECK_FALSE (fifo.pop (v));
    CHECK (fifo.push (1));
    CHECK (fifo.push (2));
    CHECK (fifo.push (3));
    CHECK_FALSE (fifo.push (4)); // Kapazitaet = 3

    CHECK (fifo.pop (v)); CHECK (v == 1);
    CHECK (fifo.push (4));
    CHECK (fifo.pop (v)); CHECK (v == 2);
    CHECK (fifo.pop (v)); CHECK (v == 3);
    CHECK (fifo.pop (v)); CHECK (v == 4);
    CHECK_FALSE (fifo.pop (v));
}

TEST_CASE ("FIFO: ein Schreiber, ein Leser in getrennten Threads")
{
    ft::SpscFifo<int, 64> fifo;
    constexpr int count = 100000;

    std::thread writer ([&]
    {
        for (int i = 0; i < count; ++i)
            while (! fifo.push (i))
                std::this_thread::yield();
    });

    int expected = 0;
    bool inOrder = true;

    while (expected < count)
    {
        int v;
        if (fifo.pop (v))
        {
            inOrder = inOrder && (v == expected);
            ++expected;
        }
        else
        {
            std::this_thread::yield();
        }
    }

    writer.join();
    CHECK (inOrder);
}
