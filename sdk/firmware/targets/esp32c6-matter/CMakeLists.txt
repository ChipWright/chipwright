# ESP-IDF + esp-matter project for the smart_thermostat on ESP32-C6, commissioned over
# Wi-Fi. Requires esp-matter (and its ESP-IDF v5.5.x); activate with `. ~/esp/idf-matter.sh`.
#   idf.py -C sdk/firmware/targets/esp32c6-matter set-target esp32c6 build flash monitor
cmake_minimum_required(VERSION 3.16)

if(NOT DEFINED ENV{ESP_MATTER_PATH})
    message(FATAL_ERROR "Set ESP_MATTER_PATH (source ~/esp/idf-matter.sh) before building.")
endif()

set(ESP_MATTER_PATH $ENV{ESP_MATTER_PATH})
set(MATTER_SDK_PATH ${ESP_MATTER_PATH}/connectedhomeip/connectedhomeip)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)

# Only the Matter SDK components and esp_matter itself. The example helper components under
# examples/common (app_reset, etc.) are intentionally excluded; they pull in managed
# components like `button` that this minimal firmware does not use.
set(EXTRA_COMPONENT_DIRS
    "${MATTER_SDK_PATH}/config/esp32/components"
    "${ESP_MATTER_PATH}/components")

project(openhome_thermostat_matter)

idf_build_set_property(CXX_COMPILE_OPTIONS "-std=gnu++17;-Os;-DCHIP_HAVE_CONFIG_H;-Wno-overloaded-virtual" APPEND)
idf_build_set_property(C_COMPILE_OPTIONS "-Os" APPEND)
idf_build_set_property(COMPILE_OPTIONS "-Wno-format-nonliteral;-Wno-format-security" APPEND)
