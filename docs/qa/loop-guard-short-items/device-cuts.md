# iPhone build 23 list30 answers through the round 113 guard

Offline, 3 code points per chunk. The first stream is what the phone showed. The retry stream is the phone's own continuation after its silent retry. Evidence: `docs/qa/ios-device-pass-23/raw/result-l07-list30-animals-{1,2}.json` in the build-23 device pass.

## l07-list30-animals-1

What the phone showed (round 111, build 23):

```text
1. Shark
2. Whale
3. Dolphin
4. Penguin
5. Lizardfish
6. Seal
7. Crab
8. Octopus
9. Turtle
10. Seahorse
11. Manta Ray
12. Whiting
13. Jellyfish
14. Sea Bass
15. Hammerhead Shark
16. Sea Lion
17. Blue Whale
18. Dolphin (multiple species)
19. Coral Reef
20. Clownfish
21. Octopus
22. Sponges
10. Sponges
11. Shrimp
12. Crayfish
13. Mollusk (Coral Reefs)
```

Round 113, no retry: cut after the last line below, notice shown.

```text
1. Shark
2. Whale
3. Dolphin
4. Penguin
5. Lizardfish
6. Seal
7. Crab
8. Octopus
9. Turtle
10. Seahorse
11. Manta Ray
12. Whiting
13. Jellyfish
14. Sea Bass
15. Hammerhead Shark
16. Sea Lion
17. Blue Whale
```

Round 113 with the phone's continuation as the silent retry:

```text
1. Shark
2. Whale
3. Dolphin
4. Penguin
5. Lizardfish
6. Seal
7. Crab
8. Octopus
9. Turtle
10. Seahorse
11. Manta Ray
12. Whiting
13. Jellyfish
14. Sea Bass
15. Hammerhead Shark
16. Sea Lion
17. Blue Whale
18. Sponges
19. Shrimp
20. Crayfish
21. Mollusk (Coral Reefs)
```

The phone's own seam (kept 290 chars, then the continuation) through the list seam: what follows "22. Sponges".

```text
23. Shrimp
24. Crayfish
25. Mollusk (Coral Reefs)
```

## l07-list30-animals-2

What the phone showed (round 111, build 23):

```text
Aquatic animals are numerous, but not all species require land to survive. This list includes 30 distinct marine life items:
1. Shark (Carcharodon)
2. Dolphin
3. Whale
4. Sea Lion
5. Sea Turtle
6. Dolphin
7. Sea Eagle
8. Clownfish
9. Hammerhead Shark
10. Blue Whale
11. Seal
12. Pelican
13. Manta Ray
14. Platypus
15. Octopus
16. Eel (Herring)
17. Angelfish
18. Paddlefish
19. Sea Snake (Ranolette)
20. Tiger Shark
21. Goby
22. Whiting
23. Sardine
24. Mackerel
25. Herring
26. Rockfish
27. Clownfish (again, as listed before but distinct species: Carcharodon)
```

Round 113, no retry: cut after the last line below, notice shown.

```text
Aquatic animals are numerous, but not all species require land to survive. This list includes 30 distinct marine life items:
1. Shark (Carcharodon)
2. Dolphin
3. Whale
4. Sea Lion
5. Sea Turtle
```

Round 113 with the phone's continuation as the silent retry (the retry repeated too: cut again, notice shown):

```text
Aquatic animals are numerous, but not all species require land to survive. This list includes 30 distinct marine life items:
1. Shark (Carcharodon)
2. Dolphin
3. Whale
4. Sea Lion
5. Sea Turtle
6. Sea Eagle
7. Clownfish
8. Hammerhead Shark
9. Blue Whale
10. Seal
11. Pelican
12. Manta Ray
13. Platypus
14. Octopus
15. Eel (Herring)
16. Angelfish
17. Paddlefish
18. Sea Snake (Ranolette)
19. Tiger Shark
20. Goby
21. Whiting
22. Sardine
23. Mackerel
24. Herring
25. Rockfish
```

The phone's own seam (kept 205 chars, then the continuation) through the list seam: what follows "6. Dolphin".

```text
7. Sea Eagle
8. Clownfish
9. Hammerhead Shark
10. Blue Whale
11. Seal
12. Pelican
13. Manta Ray
14. Platypus
15. Octopus
16. Eel (Herring)
17. Angelfish
18. Paddlefish
19. Sea Snake (Ranolette)
20. Tiger Shark
21. Goby
22. Whiting
23. Sardine
24. Mackerel
25. Herring
26. Rockfish
27. Clownfish (again, as listed before but distinct species: Carcharodon)
```
