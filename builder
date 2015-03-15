#!/usr/bin/env bash

rm -rf build && BROCCOLI_ENV=test broccoli build build
cp -rf build/* ~/Projects/lytbulb2/client/bower_components/orbit-firebase/
terminal-notifier -message "Built orbit-firebase"
