#!/usr/bin/env bash

# Borrow from https://anthonysterling.com/posts/quick-nsq-cluster.html

#NSQ_VERSION=0.3.5
#NSQ_PACKAGE="nsq-$NSQ_VERSION.linux-amd64.go1.4.2"
LOG_DIR=/tmp/log
[ -d "$LOG_DIR" ] || mkdir $LOG_DIR

NSQLOOKUPD_LOG=$LOG_DIR/nsqlookupd.log
NSQD_LOG=$LOG_DIR/nsqd.log
NSQADMIN_LOG=$LOG_DIR/nsqadmin.log

#wget -nc -qP /usr/src "https://s3.amazonaws.com/bitly-downloads/nsq/$NSQ_PACKAGE.tar.gz"

#if [ ! -d "/opt/$NSQ_PACKAGE" ]
#then
    #tar -xzvf "/usr/src/$NSQ_PACKAGE.tar.gz" -C /opt/
    #for FILE in "/opt/$NSQ_PACKAGE/bin/*";
    #do
        #ln -s $FILE /usr/local/bin/
    #done
#fi

for PROCESS in nsqlookupd nsqd nsqadmin;
do
    pkill "$PROCESS"
done

for NODE in {1..2};
do
    /usr/local/bin/nsqlookupd \
        -broadcast-address="127.0.0.1" \
        -tcp-address="127.0.0.1:900$NODE" \
        -http-address="127.0.0.1:901$NODE" >> "$NSQLOOKUPD_LOG" 2>&1 &
done

for NODE in {1..2};
do
    /usr/local/bin/nsqd \
        -broadcast-address="127.0.0.1" \
        -tcp-address="127.0.0.1:903$NODE" \
        -http-address="127.0.0.1:904$NODE" \
        -lookupd-tcp-address="127.0.0.1:9001" \
        -lookupd-tcp-address="127.0.0.1:9002" >> "$NSQD_LOG" 2>&1 &
done

/usr/local/bin/nsqadmin \
    -http-address="0.0.0.0:9000" \
    -lookupd-http-address="127.0.0.1:9011" \
    -lookupd-http-address="127.0.0.1:9012" >> "$NSQADMIN_LOG" 2>&1 &
