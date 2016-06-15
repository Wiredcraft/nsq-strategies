#!/usr/bin/env bash

# Borrow from https://anthonysterling.com/posts/quick-nsq-cluster.html


for PROCESS in nsqlookupd nsqd nsqadmin;
do
    pkill "$PROCESS"
done


