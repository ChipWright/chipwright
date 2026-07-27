# ESP-IDF project for per-device identity on the ESP32-C6. Build with the ESP-IDF toolchain:
#   idf.py -C sdk/firmware/targets/esp32c6-identity set-target esp32c6 build flash monitor
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(chipwright_identity)
