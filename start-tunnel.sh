#!/bin/bash
# Dead Air auto-reconnecting tunnel with keep-alive
mkdir -p .tunnel

while true; do
  echo "[$(date)] Starting tunnel to localhost.run..." >> .tunnel/tunnel.log
  # Run ssh tunnel in background and capture output
  ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -R 80:localhost:3000 nokey@localhost.run > .tunnel/raw.log 2>&1 &
  TUNNEL_PID=$!

  # Wait for URL to appear in raw.log
  URL=""
  for i in {1..30}; do
    sleep 1
    URL=$(grep -Eo 'https://[a-zA-Z0-9.-]+\.lhr\.life' .tunnel/raw.log | head -n 1)
    if [ -n "$URL" ]; then
      echo "$URL" > .tunnel/public_url.txt
      echo "[$(date)] Active Tunnel URL: $URL" >> .tunnel/tunnel.log
      break
    fi
  done

  # Keep-alive loop while tunnel is alive
  if [ -n "$URL" ]; then
    while kill -0 $TUNNEL_PID 2>/dev/null; do
      sleep 20
      curl -s -m 5 "$URL" > /dev/null 2>&1
    done
  fi

  echo "[$(date)] Tunnel died, restarting in 3 seconds..." >> .tunnel/tunnel.log
  sleep 3
done
