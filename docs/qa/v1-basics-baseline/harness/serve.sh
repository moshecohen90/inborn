#!/bin/zsh
# Starts one llama-server the way the phone loads the model: jinja template, 4096 context, photos capped at 512 image
# tokens (adapters/llamaRn.ts initMultimodal). Prints the PID; stop it with `kill <pid>`.
# Usage: serve.sh <models dir> <instant|fast|sharp|e5> <port> [vision]
set -e
dir=$1; which=$2; port=$3; vision=$4
case $which in
  instant) m=Qwen3.5-0.8B-Q4_K_M.gguf; p=mmproj-Qwen3.5-0.8B-F16.gguf ;;
  fast)    m=Qwen3.5-2B-Q4_K_M.gguf;   p=mmproj-Qwen3.5-2B-F16.gguf ;;
  sharp)   m=Qwen3.5-4B-Q4_K_M.gguf;   p=mmproj-Qwen3.5-4B-F16.gguf ;;
  e5)      m=multilingual-e5-large-instruct-Q6_K.gguf ;;
esac
log=${TMPDIR:-/tmp}/v1-basics-$which.log
if [[ $which == e5 ]]; then
  # embedder.native.ts: mean pooling, L2-normalised, n_ctx = n_batch = n_ubatch = 512.
  /opt/homebrew/bin/llama-server -m $dir/$m --embedding --pooling mean --embd-normalize 2 -c 512 -b 512 -ub 512 --port $port >$log 2>&1 &
elif [[ -n $vision ]]; then
  /opt/homebrew/bin/llama-server -m $dir/$m --mmproj $dir/$p --image-max-tokens 512 --jinja -c 4096 --port $port >$log 2>&1 &
else
  /opt/homebrew/bin/llama-server -m $dir/$m --jinja -c 4096 --port $port >$log 2>&1 &
fi
pid=$!
for i in {1..120}; do curl -sf http://127.0.0.1:$port/health >/dev/null 2>&1 && break; sleep 1; done
echo $pid
