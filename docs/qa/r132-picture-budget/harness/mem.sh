#!/bin/zsh
# Usage: mem.sh <instant|fast> <cap> <image|none> <gpu|cpu>
M=/Users/moshecohen/dev/inborn/.models
case $1 in instant) m=Qwen3.5-0.8B-Q4_K_M.gguf; p=mmproj-Qwen3.5-0.8B-F16.gguf;; fast) m=Qwen3.5-2B-Q4_K_M.gguf; p=mmproj-Qwen3.5-2B-F16.gguf;; esac
extra=(); [[ $4 == cpu ]] && extra=(-ngl 0 --no-mmproj-offload)
img=(); prompt="What do you see?"; [[ $3 != none ]] && img=(--image img/$3.jpg)
log=runs/$1-$2-$3-$4.err
/usr/bin/time -l llama-mtmd-cli -lv 4 -m $M/$m --mmproj $M/$p --image-max-tokens $2 -c 4096 -b 512 -ub 512 $extra $img -p "$prompt" -n 8 --temp 0 < /dev/null > /dev/null 2> $log
clipg=$(grep reserve_compute_meta $log | grep MTL0 | sed -E 's/.*= *([0-9.]+) MiB/\1/')
clipc=$(grep reserve_compute_meta $log | grep CPU | sed -E 's/.*= *([0-9.]+) MiB/\1/')
tok=$(grep -o 'n_tokens_batch = [0-9]*' $log | awk '{s+=$3} END{print s+0}')
enc=$(grep -o 'batch encoding done in [0-9]* ms' $log | awk '{print $5}')
dec=$(grep -o 'image decoded (batch 1/1) in [0-9]* ms' $log | awk '{print $6}')
pe=$(grep 'prompt eval time' $log | sed -E 's/.*= *([0-9.]+) ms \/ *([0-9]+) tokens.*/\1ms\/\2tok/')
fp=$(grep 'peak memory footprint' $log | awk '{printf "%.0f", $1/1048576}')
rss=$(grep 'maximum resident' $log | awk '{printf "%.0f", $1/1048576}')
echo "$1 cap=$2 $3 $4 clipMTL=${clipg:-0} clipCPU=${clipc:-0} imgTok=$tok enc=${enc}ms dec=${dec}ms pe=$pe footprintMB=$fp rssMB=$rss"
