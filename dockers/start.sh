#!/bin/bash
set -ev

# Require some environment variables. Examples:
# export NSQ_DOCKERS="cluster"

pushd `dirname $0`
DIR=`pwd`
popd

pushd ${DIR}/${NSQ_DOCKERS}

# Start the services.
docker-compose up -d --build

popd
