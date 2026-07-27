# ESP-IDF project for the smart_thermostat on ESP32-C6. Build with the ESP-IDF toolchain:
#   idf.py -C sdk/firmware/targets/esp32c6 set-target esp32c6 build flash monitor
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(chipwright_thermostat_c6)
