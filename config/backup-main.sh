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


docker exec rclone rclone rc operations/mkdir \
  --user "${RCLONE_USER}" --pass "${RCLONE_PASS}" \
  --json "{\"fs\":\"LocalBackup:\",\"remote\":\"${RCLONE_REMOTE_PATH}/.rclone-write-test\"}" >/dev/null 2>&1

if [ $? -ne 0 ]; then
  slack_alert "Destination not writable (${RCLONE_REMOTE_PATH}). Backup aborted."
  exit 1
fi


run_sync() {
  local src="$1"
  local dst="$2"

  # Record start time in seconds
  local start_time=$(date +%s)

  slack_log "Starting backup: ${src} → ${dst}"

  output=$(docker exec rclone rclone rc sync/sync \
    srcFs="$src" \
    dstFs="$dst" \
    --user "${RCLONE_USER}" \
    --pass "${RCLONE_PASS}" \
    $filterVar \
    $additionalFlags \
    2>&1)

  if [ $? -ne 0 ]; then
    slack_alert "Sync failed:\n*${src} → ${dst}*\n ${output}"
  fi
  # Calculate elapsed time
    local end_time=$(date +%s)
    local elapsed=$((end_time - start_time))

    # Format nicely (hours, minutes, seconds)
    local hours=$((elapsed / 3600))
    local minutes=$(((elapsed % 3600) / 60))
    local seconds=$((elapsed % 60))
    local elapsed_formatted=$(printf "%02dh:%02dm:%02ds" $hours $minutes $seconds)

    slack_log "Finished backup: ${src} → ${dst} (took ${elapsed_formatted})"

}

filterVar="_filter={\"ExcludeFrom\":[\"/config/rclone/backup-excludes.txt\"]}"

additionalFlags="--immutable --ignore-errors=false --timeout 5m --contimeout 15s"

run_sync /sharedfolders/PhotoVault  LocalBackup:/mnt/Backup/PhotoVault
run_sync /sharedfolders/FilmVault   LocalBackup:/mnt/Backup/FilmVault
run_sync /sharedfolders/HomeVault   LocalBackup:/mnt/Backup/HomeVault
run_sync /sharedfolders/SharedData  LocalBackup:/mnt/Backup/Server/SharedData
run_sync /opt                       LocalBackup:/mnt/Backup/Server/opt
