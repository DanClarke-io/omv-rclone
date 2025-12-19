#!/bin/bash

# Load environment variables
source /opt/rclone/config/.env
export $(cut -d= -f1 /opt/rclone/config/.env)

HOSTNAME=$(hostname)

slack_get_channel_id_by_name() {
  local channel_name="$1"
  channel_id=$(curl -s https://slack.com/api/conversations.list \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-type: application/x-www-form-urlencoded" | jq -r --arg name "$channel_name" '.channels[] | select(.name == $name) | .id')
  echo "$channel_id"
}

SLACK_CHANNEL_ID=$(slack_get_channel_id_by_name "$SLACK_CHANNEL")

slack_post() {
  local text="$1"
  formatted_text=$(echo -e "$text")
  local thread_ts="$2"

  
  # Build payload using jq
  payload=$(jq -n \
    --arg channel "$SLACK_CHANNEL_ID" \
    --arg text "$formatted_text" \
    --arg thread_ts "$thread_ts" \
    '{
        channel: $channel,
        text: $text
    } + (if $thread_ts != "" then {"thread_ts": $thread_ts} else {} end)'
  )

  curl -s -X POST https://slack.com/api/chat.postMessage \
        -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
        -H "Content-type: application/json" \
        --data "$payload"
}

# Start a new backup thread
start_backup_thread() {
  local src="$1"
  local dst="$2"

  response=$(slack_post "🧵 *Backup started*\n${src} → ${dst}")
  echo "$response" | jq -r '.ts'
}

# Post a log message in a thread
slack_thread_log() {
    local thread_ts="$1"
    local message="$2"
    slack_post "• $message" "$thread_ts" > /dev/null
}

# Post a failure alert in a thread
slack_thread_alert() {
    local thread_ts="$1"
    local message="$2"
    slack_post "<@${SLACK_ALERT_USER}> 🚨 *Backup failed*\n$message" "$thread_ts" > /dev/null
}

# Update the parent message (live progress)
slack_update_parent() {
    local ts="$1"
    local new_text="$2"

    formatted_text=$(echo -e "$new_text")

    payload=$(jq -n \
      --arg channel "$SLACK_CHANNEL_ID" \
      --arg ts "$ts" \
      --arg text "$formatted_text" \
      '{
          channel: $channel,
          ts: $ts,
          text: $text
      }'
    )

    curl -s -X POST https://slack.com/api/chat.update \
         -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
         -H "Content-type: application/json" \
         --data "$payload" > /dev/null
}

# Send a top-level alert (no thread)
slack_alert_top() {
  local message="$1"

  payload=$(jq -n \
    --arg channel "$SLACK_CHANNEL_ID" \
    --arg text "<@${SLACK_ALERT_USER}> 🚨 *Backup aborted on ${HOSTNAME}*\n${message}" \
    '{
      channel: $channel,
      text: $text
    }'
  )

  curl -s -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-type: application/json" \
    --data "$payload" > /dev/null
}

if ! mkdirTest=$(docker exec rclone rclone rc operations/mkdir \
  --user "${RCLONE_USER}" --pass "${RCLONE_PASS}" \
  fs=LocalBackup: \
  remote="${RCLONE_REMOTE_PATH}/.rclone-write-test" 2>&1); then

  slack_alert_top \
    "*Destination not writable*\n\`${RCLONE_REMOTE_PATH}\`\n\n\`\`\`${mkdirTest}\`\`\`"
  exit 1
fi

run_sync() {
    local src="$1"
    local dst="$2"

    local start_time=$(date +%s)

    # Send parent message
    PARENT_TS=$(slack_post "🧵 *Backup started*\n${src} → ${dst}" "" | jq -r '.ts')

    # Start async rclone job
    job_json=$(docker exec rclone rclone rc sync/sync \
        srcFs="$src" \
        dstFs="$dst" \
        _async=true \
        --user "${RCLONE_USER}" \
        --pass "${RCLONE_PASS}" \
        _filter={\"ExcludeFrom\":[\"/config/rclone/backup-excludes.txt\"]} \
        --immutable --ignore-errors=false --timeout 5m --contimeout 15s
    )

    jobid=$(echo "$job_json" | jq -r '.jobid')
    slack_thread_log "$PARENT_TS" "Job ID: ${jobid}"

    last_update=0
    while true; do
        status=$(docker exec rclone rclone rc job/status \
            jobid="$jobid" \
            --user "${RCLONE_USER}" \
            --pass "${RCLONE_PASS}"
        )

        finished=$(echo "$status" | jq -r '.finished')
        success=$(echo "$status" | jq -r '.success')

        now=$(date +%s)
        if (( now - last_update > 300 )); then
            # Fetch progress (bytes, total, ETA)
            stats=$(docker exec rclone rclone rc core/stats \
                --user "${RCLONE_USER}" \
                --pass "${RCLONE_PASS}"
            )
            bytes=$(echo "$stats" | jq -r '.bytes')
            total=$(echo "$stats" | jq -r '.totalBytes')
            eta=$(echo "$stats" | jq -r '.eta')

            # Update parent with live progress
            slack_update_parent "$PARENT_TS" \
                "🧵 *Backup running*\n${src} → ${dst}\nProgress: $(numfmt --to=iec "$bytes") / $(numfmt --to=iec "$total") • ETA ${eta}s"

            # Log in thread too
            slack_thread_log "$PARENT_TS" "Progress: $(numfmt --to=iec "$bytes") / $(numfmt --to=iec "$total") • ETA ${eta}s"

            last_update=$now
        fi

        [[ "$finished" == "true" ]] && break
        sleep 10
    done

    if [[ "$success" != "true" ]]; then
        error=$(echo "$status" | jq -r '.error')
        slack_thread_alert "$PARENT_TS" \
            "Sync failed:\n*${src} → ${dst}*\n${error}"
        return 1
    fi

    end_time=$(date +%s)
    elapsed=$((end_time - start_time))
    elapsed_formatted=$(printf "%02dh:%02dm:%02ds" \
        $((elapsed/3600)) $(((elapsed%3600)/60)) $((elapsed%60)))

    slack_thread_log "$PARENT_TS" "✅ Finished in ${elapsed_formatted}"
    slack_update_parent "$PARENT_TS" "🧵 *Backup finished*\n${src} → ${dst} (took ${elapsed_formatted})"
}

run_sync /sharedfolders/PhotoVault  LocalBackup:/mnt/Backup/PhotoVault
run_sync /sharedfolders/FilmVault   LocalBackup:/mnt/Backup/FilmVault
run_sync /sharedfolders/HomeVault   LocalBackup:/mnt/Backup/HomeVault
run_sync /sharedfolders/SharedData  LocalBackup:/mnt/Backup/Server/SharedData
run_sync /opt                       LocalBackup:/mnt/Backup/Server/opt
