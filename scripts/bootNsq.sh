#!/usr/bin/env bash

# Borrow from https://anthonysterling.com/posts/quick-nsq-cluster.html


LOG_DIR=/tmp/log
[ -d "$LOG_DIR" ] || mkdir $LOG_DIR

NSQLOOKUPD_LOG=$LOG_DIR/nsqlookupd.log
NSQD_LOG=$LOG_DIR/nsqd.log
NSQADMIN_LOG=$LOG_DIR/nsqadmin.log


for PROCESS in nsqlookupd nsqd nsqadmin;
do
    pkill "$PROCESS"
done

for NODE in {1..2};
do
    nsqlookupd \
        -broadcast-address="127.0.0.1" \
        -tcp-address="127.0.0.1:900$NODE" \
        -http-address="127.0.0.1:901$NODE" >> "$NSQLOOKUPD_LOG" 2>&1 &
done

for NODE in {1..2};
do
    nsqd \
        -broadcast-address="127.0.0.1" \
        -tcp-address="127.0.0.1:903$NODE" \
        -http-address="127.0.0.1:904$NODE" \
        -lookupd-tcp-address="127.0.0.1:9001" \
        -lookupd-tcp-address="127.0.0.1:9002" >> "$NSQD_LOG" 2>&1 &
done
sleep 10
nsqadmin \
    -http-address="0.0.0.0:9000" \
    -lookupd-http-address="127.0.0.1:9011" \
    -lookupd-http-address="127.0.0.1:9012" >> "$NSQADMIN_LOG" 2>&1 &
