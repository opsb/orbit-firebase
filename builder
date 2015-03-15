#!/usr/bin/env bash

rm -rf build && BROCCOLI_ENV=test broccoli build build
terminal-notifier -message "Built orbit-firebase"
