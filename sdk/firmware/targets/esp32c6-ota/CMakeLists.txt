# ESP-IDF project for on-device OTA on the ESP32-C6. Build with the ESP-IDF toolchain:
#   idf.py -C sdk/firmware/targets/esp32c6-ota set-target esp32c6 build flash monitor
#
# PROJECT_VER is the running firmware version the OTA agent compares against the cloud's
# published version. It is embedded in the app image, so override it per build to produce a
# newer image to publish, e.g. `idf.py -DPROJECT_VER=1.0.1 build`.
cmake_minimum_required(VERSION 3.16)
if(NOT DEFINED PROJECT_VER)
  set(PROJECT_VER "1.0.0")
endif()
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(chipwright_thermostat_ota)
