# Host compile check for the ESP32 BSP.
#
# Compiles the BSP against minimal ESP-IDF API stubs to verify the translation logic
# type-checks without the full toolchain. This produces an object file only; a real
# firmware build uses ESP-IDF and its ADC/logging implementations.

SDK := ../..
CC ?= cc
CFLAGS := -std=c11 -Wall -Wextra -Werror -I$(SDK)/include -Ihostcheck -I.
BUILD := build

.PHONY: hostcheck clean

hostcheck: $(BUILD)/esp32_bsp.o
	@echo "esp32 bsp host compile check passed"

$(BUILD)/esp32_bsp.o: esp32_bsp.c esp32_bsp.h
	@mkdir -p $(BUILD)
	$(CC) $(CFLAGS) -c esp32_bsp.c -o $@

clean:
	rm -rf $(BUILD)
