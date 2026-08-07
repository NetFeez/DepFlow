#!/bin/bash

set -eo pipefail
outputFile=output.log

if (rm -rf build); then
    echo -e "\x1b[32mCleaned previous build.\x1b[0m"
else
    echo -e "\x1b[31mFailed to clean previous build.\x1b[0m"
    exit 1
fi

if (npx tsc > $outputFile 2>&1); then
    echo -e "\x1b[32mCompilation successful.\x1b[0m"
else
    echo -e "\x1b[31mCompilation failed. See \x1b[33m$outputFile\x1b[31m for details.\x1b[0m"0
    exit 1
fi
rm -f $outputFile