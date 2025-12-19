#!/bin/bash

# Load environment variables
source /opt/rclone/config/.env
export $(cut -d= -f1 /opt/rclone/config/.env)

HOSTNAME=$(hostname)

# Alerts — pings you, only on failure
slack_alert() {
    local message="$1"
    local full_message
    full_message=$(echo -e "<@${SLACK_ALERT_USER}> 🚨 *Backup failure on ${HOSTNAME}*\n*rclone* $message")

    # Escape full message
    local escaped_message
    escaped_message=$(printf '%s' "<@${SLACK_ALERT_USER}> 🚨 *Backup failure on ${HOSTNAME}*\n *rclone* $full_message" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
    curl -s -X POST -H 'Content-type: application/json' \
        --data "{\"text\":$escaped_message}" \
        "$SLACK_WEBHOOK_URL" > /dev/null
    sleep 1
}

# Logs — just info, no ping
slack_log() {
    local message="$1"
    local escaped_message
    # Escape special chars using Python
    escaped_message=$(printf '%s' "*rclone* $message" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')

    curl -s -X POST -H 'Content-type: application/json' \
        --data "{\"text\":$escaped_message}" \
        "$SLACK_WEBHOOK_URL" > /dev/null
    sleep 1
}

mkdirTest=$(docker exec rclone rclone rc --user "${RCLONE_USER}" --pass "${RCLONE_PASS}" operations/mkdir \
  --json "{\"fs\":\"LocalBackup:\",\"remote\":\"${RCLONE_REMOTE_PATH}/.rclone-write-test\"}")

if [ $? -ne 0 ]; then
  slack_alert "Destination not writable (${RCLONE_REMOTE_PATH}). Backup aborted, error was:\n\`\`\`${mkdirTest}\`\`\`"
  exit 1
fi


start_sync() {
  docker exec rclone rclone rc sync/sync \
    srcFs="$1" \
    dstFs="$2" \
    _async=true \
    --user "${RCLONE_USER}" \
    --pass "${RCLONE_PASS}" \
    $filterVar \
    $additionalFlags
}

job_status() {
  docker exec rclone rclone rc job/status \
    jobid="$1" \
    --user "${RCLONE_USER}" \
    --pass "${RCLONE_PASS}"
}

stats() {
  docker exec rclone rclone rc core/stats \
    --user "${RCLONE_USER}" \
    --pass "${RCLONE_PASS}"
}

monitor_job() {
  local jobid="$1"
  local src="$2"
  local dst="$3"
  local last_update=0

  while true; do
    status=$(job_status "$jobid")
    finished=$(echo "$status" | jq -r '.finished')

    now=$(date +%s)
    if (( now - last_update > 300 )); then
      s=$(stats)
      transferred=$(echo "$s" | jq -r '.bytes')
      total=$(echo "$s" | jq -r '.totalBytes')
      eta=$(echo "$s" | jq -r '.eta')

      slack_log "Progress: ${src} → ${dst}
Transferred: $(numfmt --to=iec "$transferred") / $(numfmt --to=iec "$total")
ETA: ${eta}s"

      last_update=$now
    fi

    [[ "$finished" == "true" ]] && break
    sleep 10
  done

  success=$(echo "$status" | jq -r '.success')
  error=$(echo "$status" | jq -r '.error')

  if [[ "$success" != "true" ]]; then
    slack_alert "Sync failed:\n*${src} → ${dst}*\n\`\`\`${error}\`\`\`"
    return 1
  fi
}

run_sync() {
  local src="$1"
  local dst="$2"
  local start_time=$(date +%s)

  slack_log "Starting backup: ${src} → ${dst}"

  job_json=$(start_sync "$src" "$dst")
  jobid=$(echo "$job_json" | jq -r '.jobid')

  monitor_job "$jobid" "$src" "$dst" || exit 1

  end_time=$(date +%s)
  elapsed=$((end_time - start_time))
  elapsed_formatted=$(printf "%02dh:%02dm:%02ds" \
    $((elapsed/3600)) $(((elapsed%3600)/60)) $((elapsed%60)))

  slack_log "Finished backup: ${src} → ${dst} (took ${elapsed_formatted})"
}

filterVar="_filter={\"ExcludeFrom\":[\"/config/rclone/backup-excludes.txt\"]}"

additionalFlags="--immutable --ignore-errors=false --timeout 5m --contimeout 15s"

run_sync /sharedfolders/PhotoVault  LocalBackup:/mnt/Backup/PhotoVault
run_sync /sharedfolders/FilmVault   LocalBackup:/mnt/Backup/FilmVault
run_sync /sharedfolders/HomeVault   LocalBackup:/mnt/Backup/HomeVault
run_sync /sharedfolders/SharedData  LocalBackup:/mnt/Backup/Server/SharedData
run_sync /opt                       LocalBackup:/mnt/Backup/Server/opt
