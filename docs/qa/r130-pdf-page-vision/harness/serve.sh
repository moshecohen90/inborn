#!/bin/zsh
# One llama-server per model the way the phone loads it: jinja, 4096 context, the projector capped at the model's
# image tokens (adapters/imageTokens.ts: Instant 512, Fast 1024). Prints the PID; stop it with `kill <pid>`.
# Usage: serve.sh <models dir> <instant|fast|e5> <port>
set -e
dir=$1; which=$2; port=$3
log=${TMPDIR:-/tmp}/r130-$which.log
case $which in
  instant) /opt/homebrew/bin/llama-server -m $dir/Qwen3.5-0.8B-Q4_K_M.gguf --mmproj $dir/mmproj-Qwen3.5-0.8B-F16.gguf --image-max-tokens 512 --jinja -c 4096 --port $port >$log 2>&1 & ;;
  fast)    /opt/homebrew/bin/llama-server -m $dir/Qwen3.5-2B-Q4_K_M.gguf --mmproj $dir/mmproj-Qwen3.5-2B-F16.gguf --image-max-tokens 1024 --jinja -c 4096 --port $port >$log 2>&1 & ;;
  e5)      /opt/homebrew/bin/llama-server -m $dir/multilingual-e5-large-instruct-Q6_K.gguf --embedding --pooling mean --embd-normalize 2 -c 512 -b 512 -ub 512 --port $port >$log 2>&1 & ;;
esac
pid=$!
for i in {1..120}; do curl -sf http://127.0.0.1:$port/health >/dev/null 2>&1 && break; sleep 1; done
echo $pid
