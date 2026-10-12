#!/bin/zsh
# Test Lab physical device run: submit asynchronously, then poll the matrix (Testing API; this gcloud has no
# `matrices describe`) until it ends and list the raw results. RUN=A (fix as shipped) or B (projector on GPU, negative
# control). DEVICE=model,version (default CPH2449,34 = OnePlus 11 5G, capacity LOW; dm3q,34 = Galaxy S23 Ultra, same
# Snapdragon 8 Gen 2 / Adreno 740 / Hexagon, capacity HIGH). gcloud never stays in the foreground: a killed gcloud
# cancels the matrix (run A, 12.10 01:25-02:09, "abortedByUser").
set -u
RUN=${RUN:?A or B}
DEVICE=${DEVICE:-CPH2449,34}
MODEL=${DEVICE%%,*}; VER=${DEVICE##*,}
S=${TL44_DIR:?dir with runA/ runB/ walk-test.apk asset-slices/ inborn-test-photo.jpg}
PROJ=${GCP_PROJECT:?Test Lab project}
case $RUN in
  A) APP=$S/runA/inborn-vc32-A.apk ;;
  B) APP=$S/runB/inborn-vc32-B-gpu.apk ;;
esac
DIR=testlab-44-run$RUN-$MODEL
LOG=$S/run$RUN/submit-$MODEL.log
echo "# run $RUN on $MODEL/$VER submit $(date '+%d.%m %H:%M:%S') app=$APP results-dir=$DIR" | tee $LOG
gcloud firebase test android run --project $PROJ --type instrumentation \
  --app $APP --test $S/walk-test.apk \
  --device model=$MODEL,version=$VER,locale=en,orientation=portrait \
  --timeout 40m --num-flaky-test-attempts 0 --record-video \
  --other-files /sdcard/Download/inborn_model-master.apk=$S/asset-slices/inborn_model-master.apk,/sdcard/Download/inborn_model_vision-master.apk=$S/asset-slices/inborn_model_vision-master.apk,/sdcard/Download/inborn-test-photo.jpg=$S/inborn-test-photo.jpg \
  --directories-to-pull /sdcard/Download/walk --results-dir $DIR --async >> $LOG 2>&1
echo "gcloud exit $? at $(date '+%H:%M:%S')" | tee -a $LOG
M=$(command grep -oE 'matrix-[a-z0-9]+' $LOG | head -1)
[ -n "$M" ] || { echo "no matrix id"; tail -5 $LOG; exit 1; }
echo "matrix $M"
for i in $(seq 1 110); do
  TOK=$(gcloud auth print-access-token 2>/dev/null)
  ST=$(curl -s -H "Authorization: Bearer $TOK" "https://testing.googleapis.com/v1/projects/$PROJ/testMatrices/$M" | python3 -c 'import json,sys; d=json.load(sys.stdin); e=(d.get("testExecutions") or [{}])[0]; print(d.get("state"), d.get("outcomeSummary"), e.get("state"), (e.get("testDetails") or {}).get("progressMessages", [])[-1:])' 2>/dev/null)
  echo "$(date '+%H:%M:%S') $ST"
  case $ST in
    FINISHED*|ERROR*|CANCELLED*|INVALID*) break ;;
  esac
  sleep 60
done
echo "--- results"
gcloud storage ls -r gs://${TESTLAB_BUCKET:?results bucket}/$DIR/ 2>&1 | command grep -vE "\.apk$|/:$|^$" | sed 's#gs://${TESTLAB_BUCKET:?results bucket}/##' | head -40
