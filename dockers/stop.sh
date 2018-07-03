#!/bin/bash
set -ev

# Environment variables.
NSQ_DOCKERS=${NSQ_DOCKERS:-cluster}

pushd `dirname $0`
DIR=`pwd`
popd

pushd ${DIR}/${NSQ_DOCKERS}

# Start the services.
docker-compose down

popd
